/* Fincr 2.0 — portfolio store. The single source of truth for mutations.
   Owns holdings (each with a transaction ledger), closed positions, and
   guardrail target weights. Recomputes derived figures (qty, avg cost, value,
   P&L) from the ledgers on every change, writes them through to window.FINCR
   so display components keep reading F.holdings unchanged, and persists to
   localStorage so the prototype survives a refresh.

   NOTE: no IIFE — top-level function declarations (useStore2, FincrProvider)
   must be global so the other text/babel scripts can call them as bare names;
   they still close over the script-scoped const FincrStoreCtx. */

const F2_LS_KEY = 'fincr2-portfolio-v1';
const f2uid = () => 'tx_' + Math.random().toString(36).slice(2, 9);
const F2_PALETTE = ['#5481D4', '#5E7DA8', '#8B9EC9', '#3D6B9E', '#A6B3CC', '#2E5480', '#6E8FD0'];
const FincrStoreCtx = React.createContext(null);

/* ── Backend sync adapter (SPEC P1-04 §2/§4) ──────────────────────────────
   Fire-and-forget bridge from the local store to the VPS API. localStorage
   stays the authoritative local cache (written by the effect in FincrProvider);
   these POSTs mirror state to the backend so the funnel pipeline and chat agent
   see the live book. A missing API key keeps the app fully local; network
   failures are logged and never block the UI. Same-origin as v1, so the
   'fincr-api-key' that v1 stores is reused transparently. */
const F2_API_BASE = 'https://fincr.duckdns.org';
function f2ApiKey() { return localStorage.getItem('fincr-api-key') || ''; }

function f2BuildHoldingsPayload(derived, closed) {
  const totalValue = derived.reduce((s, h) => s + h.value, 0);
  const holdings_positions = derived.map((h) => ({
    ticker: h.ticker.toUpperCase(),
    avg_buy_price: h.avgCost,
    quantity: h.qty,
    weight_pct: totalValue > 0 ? +((h.value / totalValue) * 100).toFixed(1) : 0,
    type: h.type || 'stock', // Task 1 (C2) §3 — persist asset type to holdings.json
  }));
  const holdings_with_values = {};
  holdings_positions.forEach((p) => { holdings_with_values[p.ticker] = p.weight_pct; });
  const transactions = {};
  derived.forEach((h) => { transactions[h.ticker.toUpperCase()] = h.txns; });
  return {
    holdings: holdings_positions.map((p) => p.ticker),
    watchlist: [],
    holdings_with_values,
    holdings_positions,
    transactions,
    closed_positions: closed,
  };
}

// f2Sync — fire-and-forget POST to the VPS, with honest success/failure reporting.
// Returns a {ok, status, reason} result so the caller (the holdings-sync effect) can
// update window.FINCR.lastSyncMs only when the server actually confirmed the write
// ([C2-D42]). fetch() does NOT throw on HTTP 4xx/5xx — only on network failure — so
// an HTTP 500 with a JSON body would otherwise look identical to success. The r.ok
// check (status 200-299) catches that silent-failure mode.
function f2Sync(path, body) {
  const key = f2ApiKey();
  if (!key) return Promise.resolve({ ok: false, reason: 'no-key' }); // local-only device
  return fetch(F2_API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: JSON.stringify(body),
  })
    .then((r) => {
      if (!r.ok) {
        return r.text().then((txt) => {
          console.warn('[sync] POST ' + path + ' HTTP ' + r.status + ':', txt.slice(0, 200));
          return { ok: false, status: r.status, reason: 'http-error' };
        });
      }
      return r.json().then((d) => {
        console.log('[sync] POST ' + path, d);
        return { ok: true, status: r.status, data: d };
      });
    })
    .catch((e) => {
      console.warn('[sync] POST ' + path + ' failed:', e.message);
      return { ok: false, reason: 'network-error', error: e.message };
    });
}

function useStore2() { return React.useContext(FincrStoreCtx); }

/* ── Derivation: a holding's live numbers come only from its txns ─────── */
function f2DeriveHolding(h) {
  const txns = (h.txns || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  let boughtQty = 0, soldQty = 0, realized = 0;
  let runQty = 0, runAvg = 0; // running weighted-average cost; sells realize against it
  txns.forEach((tx) => {
    if (tx.kind === 'buy') {
      const newQty = runQty + tx.qty;
      runAvg = newQty ? (runQty * runAvg + tx.qty * tx.price) / newQty : 0;
      runQty = newQty;
      boughtQty += tx.qty;
    } else {
      realized += tx.qty * (tx.price - runAvg);
      runQty = Math.max(0, runQty - tx.qty);
      soldQty += tx.qty;
    }
  });
  const qty = +(boughtQty - soldQty).toFixed(8);
  const avgCost = runAvg;
  const value = qty * h.price;
  const costNow = qty * avgCost;
  const pnl = value - costNow;
  const pnlPct = costNow > 0 ? (pnl / costNow) * 100 : 0;
  return { ...h, txns, qty, avgCost, value, costNow, pnl, pnlPct, realized, soldQty };
}

/* ── Seed: turn the static sample holdings into ledgered holdings ─────── */
function f2SeedFromSample() {
  const F = window.FINCR;
  const baseDate = '2024-08-15';
  const holdings = F.holdings.map((h) => {
    const buyPrice = +(h.price / (1 + h.pnlPct / 100)).toFixed(2);
    return {
      ticker: h.ticker, name: h.name, type: h.type, price: h.price,
      color: h.color, seed: h.seed, dayPct: h.dayPct,
      txns: [{ id: f2uid(), kind: 'buy', date: baseDate, qty: h.qty, price: buyPrice }],
    };
  });
  const closed = [{
    ticker: 'TSLA', name: 'Tesla', type: 'stock', color: '#E2615C',
    openedAt: '2023-11-02', closedAt: '2025-02-20',
    qty: 30, avgCost: 198.4, sellPrice: 333.1,
    realized: 30 * (333.1 - 198.4),
    note: 'Trimmed the whole position into the Q4 run — thesis on margins had played out.',
  }];
  return { holdings, closed, targets: null };
}

/* ── Task 1 (C2) §2.2 — build ledgered holdings from a GET /holdings response.
   Prefers a real per-ticker ledger (response.transactions[ticker]) when the
   adapter has written one; otherwise falls back to a synthetic single buy at
   avg_buy_price. holdings_positions carries no name/price/day-change, so name
   falls back to ticker, price is 0 until Phase 3, dayPct is 0. ── */
function f2HoldingsFromApi(data) {
  const positions = (data && Array.isArray(data.holdings_positions)) ? data.holdings_positions : [];
  const txnMap = (data && data.transactions) || {};
  return positions.map((hp, i) => {
    const ticker = String(hp.ticker || '').toUpperCase();
    const real = txnMap[ticker];
    const txns = (Array.isArray(real) && real.length)
      ? real.map((t) => ({
          id: t.id || f2uid(),
          kind: t.kind || 'buy',
          date: t.date || '2024-01-01',
          qty: +t.qty,
          price: +t.price,
        }))
      : [{ id: f2uid(), kind: 'buy', date: '2024-01-01', qty: +hp.quantity, price: +hp.avg_buy_price }];
    return {
      ticker,
      name: ticker,
      type: hp.type || 'stock',
      price: 0,
      color: F2_PALETTE[i % F2_PALETTE.length],
      seed: (i * 7 + 3) % 97,
      dayPct: 0,
      txns,
    };
  });
}

/* ── Task 1 (C2) §2.3 — Phase 3: live prices in EUR. Crypto via /crypto-prices
   (one batch), stocks via /stock-price (parallel). Both endpoints are public
   (no key) and return EUR. holdings.json has no `type` until the first POST, so
   unknown-type tickers are tried as crypto first, then as stocks — a typeless
   book still prices. Unresolved tickers keep price 0 (store renders cost basis,
   zero live value). ── */
async function f2FetchPrices(holdings) {
  const priceByTicker = {};
  const cryptoCands = holdings.filter((h) => h.type === 'crypto' || !h.type).map((h) => h.ticker);
  if (cryptoCands.length) {
    try {
      const r = await fetch(F2_API_BASE + '/crypto-prices?tickers=' + encodeURIComponent([...new Set(cryptoCands)].join(',')));
      if (r.ok) {
        const m = await r.json();
        Object.keys(m || {}).forEach((t) => { if (typeof m[t] === 'number') priceByTicker[t.toUpperCase()] = m[t]; });
      }
    } catch (e) { console.warn('[load] crypto-prices failed:', e.message); }
  }
  // Stocks: explicit stocks + any unknown-type ticker the crypto endpoint did
  // not resolve. Never hit /stock-price for a known crypto (it would 404/502).
  const stockCands = holdings.filter((h) => {
    if (priceByTicker[h.ticker] != null) return false;
    if (h.type === 'crypto') return false;
    return true;
  }).map((h) => h.ticker);
  await Promise.all([...new Set(stockCands)].map((t) =>
    fetch(F2_API_BASE + '/stock-price?ticker=' + encodeURIComponent(t))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.price === 'number') priceByTicker[t] = d.price; })
      .catch(() => {})
  ));
  return holdings.map((h) => ({ ...h, price: priceByTicker[h.ticker] != null ? priceByTicker[h.ticker] : 0 }));
}

/* Phase 1 (instant): last-known book from localStorage. No sample seed — the
   real book is loaded from GET /holdings on mount (Phase 2). An empty book is
   the honest pre-hydration state. */
function f2LoadInitial() {
  try {
    const raw = localStorage.getItem(F2_LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.holdings)) return p;
    }
  } catch (e) { /* fall through to empty */ }
  return { holdings: [], closed: [], targets: null };
}

function FincrProvider({ children }) {
  const init = React.useRef(f2LoadInitial());
  const [holdings, setHoldings] = React.useState(init.current.holdings);
  const [closed, setClosed] = React.useState(init.current.closed || []);
  const [targets, setTargets] = React.useState(init.current.targets || null);
  const [drawerTicker, setDrawerTicker] = React.useState(null);
  const [addOpen, setAddOpen] = React.useState(false);
  // Task 1 (C2) §2.4 — true while the GET /holdings hydration + price fetch is in
  // flight. Only meaningful when an API key exists (otherwise there is nothing to
  // fetch and we stay on the Phase-1 localStorage render). Non-blocking: display
  // components may read F.loading for a subtle indicator.
  const [loading, setLoading] = React.useState(() => !!f2ApiKey());

  React.useEffect(() => {
    try { localStorage.setItem(F2_LS_KEY, JSON.stringify({ holdings, closed, targets })); }
    catch (e) { /* quota — non-fatal in the studio */ }
  }, [holdings, closed, targets]);

  const derived = React.useMemo(() => holdings.map(f2DeriveHolding).filter((h) => h.qty > 1e-7), [holdings]);
  const totals = React.useMemo(() => {
    const totalValue = derived.reduce((s, h) => s + h.value, 0);
    const totalCost = derived.reduce((s, h) => s + h.costNow, 0);
    const totalPnl = totalValue - totalCost;
    const realizedTotal = (closed.reduce((s, c) => s + (c.realized || 0), 0))
      + holdings.map(f2DeriveHolding).reduce((s, h) => s + (h.realized || 0), 0);
    const stocksValue = derived.filter((h) => h.type === 'stock').reduce((s, h) => s + h.value, 0);
    const cryptoValue = derived.filter((h) => h.type === 'crypto').reduce((s, h) => s + h.value, 0);
    const dayChange = derived.reduce((s, h) => s + h.value * ((h.dayPct || 0) / 100), 0);
    return {
      totalValue, totalCost, totalPnl,
      totalPnlPct: totalCost > 0 ? (totalPnl / totalCost) * 100 : 0,
      stocksValue, cryptoValue, realizedTotal,
      dayChange, dayChangePct: totalValue > 0 ? (dayChange / totalValue) * 100 : 0,
    };
  }, [derived, closed, holdings]);

  // mirror onto window.FINCR (render phase) so display children read fresh numbers
  const F = window.FINCR;
  F.holdings = derived;
  F.closed = closed;
  F.targets = targets;
  F.loading = loading;
  Object.assign(F, totals);

  const actions = React.useMemo(() => ({
    openDrawer: (tk) => setDrawerTicker(tk),
    openDrawerWithPrefill: (ticker, prefill) => {
      // Uses window.__fincrDrawerPrefill (not window.__fincrStore.drawerPrefill)
      // because window.__fincrStore is replaced on each render (C2-S4b).
      window.__fincrDrawerPrefill = prefill;
      setDrawerTicker(ticker);
    },
    closeDrawer: () => setDrawerTicker(null),
    openAdd: () => setAddOpen(true),
    closeAdd: () => setAddOpen(false),

    addPosition: ({ ticker, name, type, price, color, qty, buyPrice, date }) => {
      ticker = ticker.toUpperCase().trim();
      setHoldings((hs) => {
        const existing = hs.find((h) => h.ticker === ticker);
        const tx = { id: f2uid(), kind: 'buy', date: date || new Date().toISOString().slice(0, 10), qty: +qty, price: +buyPrice };
        if (existing) return hs.map((h) => h.ticker === ticker ? { ...h, txns: [...h.txns, tx] } : h);
        return [...hs, {
          ticker, name: name || ticker, type: type || 'stock', price: +price || +buyPrice,
          color: color || F2_PALETTE[hs.length % F2_PALETTE.length], seed: (hs.length * 7 + 3) % 97, dayPct: 0,
          txns: [tx],
        }];
      });
      setAddOpen(false);
    },

    addTxn: (ticker, tx) => setHoldings((hs) => hs.map((h) => h.ticker === ticker
      ? { ...h, txns: [...h.txns, { id: f2uid(), ...tx, qty: +tx.qty, price: +tx.price }] } : h)),

    editTxn: (ticker, txId, patch) => setHoldings((hs) => hs.map((h) => h.ticker === ticker
      ? { ...h, txns: h.txns.map((tx) => tx.id === txId ? { ...tx, ...patch, qty: +(patch.qty ?? tx.qty), price: +(patch.price ?? tx.price) } : tx) } : h)),

    removeTxn: (ticker, txId) => setHoldings((hs) => hs.map((h) => h.ticker === ticker
      ? { ...h, txns: h.txns.filter((tx) => tx.id !== txId) } : h)),

    closePosition: (ticker, { sellPrice, date, note }) => {
      const src = holdings.find((h) => h.ticker === ticker);
      const live = f2DeriveHolding(src);
      const realizedThisSale = live.qty * (+sellPrice - live.avgCost);
      const priorOpen = src.txns.find((t) => t.kind === 'buy');
      setClosed((cs) => [{
        ticker: live.ticker, name: live.name, type: live.type, color: live.color,
        openedAt: priorOpen ? priorOpen.date : '—',
        closedAt: date || new Date().toISOString().slice(0, 10),
        qty: live.qty, avgCost: live.avgCost, sellPrice: +sellPrice,
        realized: (live.realized || 0) + realizedThisSale,
        note: note || '',
      }, ...cs]);
      setHoldings((hs) => hs.filter((h) => h.ticker !== ticker));
      setDrawerTicker(null);
    },

    // C2-S3 — close a position AND record the sell decision on its archived thesis
    // entry. Sequenced: commit the close locally (suppressing the echo POST), fire a
    // controlled POST /holdings so the backend archives the ticker, THEN patch the
    // now-archived thesis entry via POST /thesis/update. Thesis-patch failure is
    // non-blocking (logged + soft toast) — the position is already closed.
    closePositionWithThesis: async (ticker, { sellPrice, date, note }, thesisPatch, summary) => {
      const src = holdings.find((h) => h.ticker === ticker);
      if (!src) return { closeOk: false, thesisOk: false };
      const live = f2DeriveHolding(src);
      const realizedThisSale = live.qty * (+sellPrice - live.avgCost);
      const priorOpen = src.txns.find((tx) => tx.kind === 'buy');
      const closedEntry = {
        ticker: live.ticker, name: live.name, type: live.type, color: live.color,
        openedAt: priorOpen ? priorOpen.date : '—',
        closedAt: date || new Date().toISOString().slice(0, 10),
        qty: live.qty, avgCost: live.avgCost, sellPrice: +sellPrice,
        realized: (live.realized || 0) + realizedThisSale, note: note || '',
      };
      const nextHoldings = holdings.filter((h) => h.ticker !== ticker);
      const nextClosed = [closedEntry, ...closed];
      // Commit locally; suppress the holdings-sync effect's echo POST (we POST below).
      f2SuppressHoldingsSync.current = true;
      setHoldings(nextHoldings);
      setClosed(nextClosed);
      setDrawerTicker(null);
      // Controlled POST /holdings — this is what archives the ticker server-side.
      const derivedNext = nextHoldings.map(f2DeriveHolding).filter((h) => h.qty > 1e-7);
      const closeRes = await f2Sync('/holdings', f2BuildHoldingsPayload(derivedNext, nextClosed));
      // Keep the provenance bar honest (the effect we suppressed normally does this).
      window.FINCR = window.FINCR || {};
      if (closeRes.ok) { window.FINCR.lastSyncMs = Date.now(); window.FINCR.lastSyncStatus = 'ok'; }
      else if (closeRes.reason !== 'no-key') { window.FINCR.lastSyncStatus = 'failed'; window.FINCR.lastSyncReason = closeRes.reason; }
      window.dispatchEvent(new CustomEvent('fincr:sync-status-change'));
      // Patch the now-archived thesis entry with the sell decision (after close synced).
      let thesisOk = false;
      if (closeRes.ok && thesisPatch && window.saveThesis) {
        thesisOk = await window.saveThesis(ticker, thesisPatch, summary || '');
        if (!thesisOk) {
          console.warn('[close] thesis update failed for ' + ticker + ' — set it manually via the editor');
          window.dispatchEvent(new CustomEvent('fincr:toast', { detail: { message: 'Position closed. Thesis update failed — you can set it manually.' } }));
        }
      } else if (!closeRes.ok && closeRes.reason !== 'no-key') {
        console.warn('[close] /holdings sync failed; thesis update skipped: ' + closeRes.reason);
      }
      // Refresh F.thesis — the closed ticker drops off the Positions tab.
      if (window.loadThesis) window.loadThesis();
      return { closeOk: closeRes.ok, thesisOk };
    },

    deletePosition: (ticker) => { setHoldings((hs) => hs.filter((h) => h.ticker !== ticker)); setDrawerTicker(null); },

    setTarget: (ticker, pct) => setTargets((tg) => {
      const next = { ...(tg || {}) };
      if (pct == null || pct === '') delete next[ticker]; else next[ticker] = +pct;
      return Object.keys(next).length ? next : null;
    }),
    initTargets: (obj) => setTargets(obj && Object.keys(obj).length ? obj : null),
    clearTargets: () => setTargets(null),

    // Task 1 follow-up — reset = discard local edits and reload the source of
    // truth. On a VPS-backed device (api key present) re-seeding the sample book
    // here is a backend-corruption path: the holdings-sync effect below would POST
    // the sample to /holdings, overwriting the real holdings.json AND re-triggering
    // sync_thesis_with_holdings (api.py), which archives every real ticker and
    // scaffolds the fake NVDA/VOO/AAPL book into thesis.json. So instead re-hydrate
    // from the backend via the same suppress-guarded path the app runs on mount —
    // those guards swallow the hydration commits, so reset never POSTs. Only a
    // local-only device (no key — nothing to corrupt, no POST fires) still restores
    // the sample book for demos (f2SeedFromSample retained per SPEC §4).
    resetAll: () => {
      if (f2ApiKey()) { f2HydrateHoldings(); f2HydrateTargets(); }
      else { const s = f2SeedFromSample(); setHoldings(s.holdings); setClosed(s.closed); setTargets(null); }
    },
  }), [holdings, closed]);  // C2-S3: closePositionWithThesis reads `closed`

  // ── Backend sync (SPEC P1-04 §4) — fire-and-forget, never blocks the UI ──
  // Holdings: POST /holdings whenever the book or the closed list changes. The
  // initial mount is skipped so a page load never pushes cached/seeded
  // localStorage to the backend — only genuine mutations sync. This covers all
  // six holdings actions (addPosition/addTxn/editTxn/removeTxn/closePosition/
  // deletePosition), which is exactly the set that mutates holdings or closed.
  // Task 1 (C2) §2 — f2SuppressHoldingsSync guards the one re-render caused by the
  // GET /holdings hydration below. Without it, loading the real book would echo a
  // POST /holdings back (with synthetic txns and possibly zero prices), corrupting
  // holdings.json and re-triggering thesis sync on every page load. Same idea as
  // the f2LastTargets guard for the targets hydration.
  const f2HoldingsMounted = React.useRef(false);
  const f2SuppressHoldingsSync = React.useRef(false);
  React.useEffect(() => {
    if (!f2HoldingsMounted.current) { f2HoldingsMounted.current = true; return; }
    if (f2SuppressHoldingsSync.current) { f2SuppressHoldingsSync.current = false; return; } // hydration echo
    // Real mutation — fire the sync and record the result. Only /holdings drives the
    // sync indicator: it's the file the 05:00 briefing reads ([C2-D41]). /portfolio
    // (targets) is intentionally NOT tracked here.
    f2Sync('/holdings', f2BuildHoldingsPayload(derived, closed))
      .then((result) => {
        window.FINCR = window.FINCR || {};
        if (result.ok) {
          window.FINCR.lastSyncMs = Date.now();
          window.FINCR.lastSyncStatus = 'ok';
        } else {
          // Mark failed but keep the last good timestamp — "last good sync was X ago"
          // is more useful than wiping it.
          window.FINCR.lastSyncStatus = 'failed';
          window.FINCR.lastSyncReason = result.reason;
        }
        window.dispatchEvent(new CustomEvent('fincr:sync-status-change'));
      });
  }, [holdings, closed]);

  // Targets: POST /portfolio on any real change to targets. DEVIATION from §4's
  // literal "fires on setTarget/clearTargets": the Guardrails editor commits via
  // initTargets(obj) and clears via clearTargets — setTarget is never called by
  // the UI. Syncing on the targets STATE change covers all three. The load-time
  // GET /portfolio hydration must NOT echo a POST, so the GET handler stamps
  // f2LastTargets before calling initTargets; this value-equality guard then
  // suppresses that one run (and any no-op set), and is robust to React bailing
  // on an equal-value setState.
  const f2LastTargets = React.useRef(undefined);
  React.useEffect(() => {
    const ser = JSON.stringify(targets == null ? null : targets);
    if (f2LastTargets.current === undefined) { f2LastTargets.current = ser; return; } // mount
    if (f2LastTargets.current === ser) return; // hydration echo / no real change
    f2LastTargets.current = ser;
    f2Sync('/portfolio', { targets });
  }, [targets]);

  // Task 1 follow-up — both backend hydrations are factored out so the mount
  // effects below AND resetAll share one implementation (and one set of echo-
  // suppression guards), with no risk of the two paths drifting apart. Stable
  // identities (empty deps): they close over the stable setters and the suppress
  // refs only, and read f2ApiKey() fresh on every call.

  // Holdings hydration: GET /holdings → ledgered book → live prices, then commit.
  // We stamp f2SuppressHoldingsSync right before the commit so the holdings-sync
  // effect swallows the echo POST (relies on React 18 batching setHoldings +
  // setClosed into ONE render → one effect run → one suppression). shouldCancel
  // lets the mount effect abort on unmount; resetAll passes none (never cancels).
  const f2HydrateHoldings = React.useCallback(async (shouldCancel = () => false) => {
    const key = f2ApiKey();
    if (!key) { setLoading(false); return; } // local-only device — keep current state
    setLoading(true);
    try {
      const r = await fetch(F2_API_BASE + '/holdings', { headers: { 'X-API-Key': key } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      let next = f2HoldingsFromApi(data);
      if (!next.length) { if (!shouldCancel()) setLoading(false); return; } // empty API book — don't wipe local
      next = await f2FetchPrices(next); // Phase 3
      if (shouldCancel()) return;
      f2SuppressHoldingsSync.current = true; // suppress the echo POST from this commit
      setHoldings(next);
      if (Array.isArray(data.closed_positions)) setClosed(data.closed_positions);
      setLoading(false);
    } catch (e) {
      console.warn('[load] GET /holdings failed — keeping local state:', e.message);
      if (!shouldCancel()) setLoading(false);
    }
  }, []);

  // Targets hydration: GET /portfolio → stamp f2LastTargets BEFORE the commit so
  // the targets-sync effect's value-equality guard skips the echo POST. Normalizes
  // d.targets exactly as initTargets does and stamps the normalized value (the old
  // inline version stamped the raw value, which mismatched for an empty {} and
  // would have leaked one spurious POST).
  const f2HydrateTargets = React.useCallback(() => {
    const key = f2ApiKey();
    if (!key) return;
    fetch(F2_API_BASE + '/portfolio', { headers: { 'X-API-Key': key } })
      .then((r) => r.json())
      .then((d) => {
        if (d && 'targets' in d) {
          const t = d.targets && Object.keys(d.targets).length ? d.targets : null;
          f2LastTargets.current = JSON.stringify(t);
          setTargets(t);
        }
      })
      .catch((e) => console.warn('[sync] GET /portfolio failed:', e.message));
  }, []);

  // On load: hydrate targets once from the backend (§4), in parallel with the
  // holdings hydration below.
  React.useEffect(() => { f2HydrateTargets(); }, []);

  // Task 1 (C2) §2 — on load, hydrate the real book from GET /holdings. API wins
  // over the Phase-1 localStorage render (§2.5); the localStorage-write effect
  // then persists the fresh book so the next load starts current. cancelled aborts
  // the commit if the component unmounts mid-fetch.
  React.useEffect(() => {
    let cancelled = false;
    f2HydrateHoldings(() => cancelled);
    return () => { cancelled = true; };
  }, []);

  // Thesis hydration (C2-S2): fetch GET /thesis and transform -> F.thesis via the
  // thesis adapter (thesis-adapter.js). Non-blocking and independent of the holdings
  // render; the adapter dispatches 'fincr:thesis-update', which the shell listens for
  // to re-render. No-key devices get F.thesis = [] (honest gap-card state).
  React.useEffect(() => { if (window.loadThesis) window.loadThesis(); }, []);

  // FX rate poller — fetch on mount, then every 5 minutes. SaaS-NOTE (manifesto §6,
  // [C2-D44]): pair is hardcoded 'EURUSD' for now; in P3 this becomes
  // user.homeCurrency + 'USD'. The /fx-rate endpoint already accepts ?pair=, so only
  // this caller changes. Silent-fail keeps the last known rate, never blanks ([C2-D43]).
  React.useEffect(() => {
    let cancelled = false;
    async function fetchFxRate() {
      try {
        const r = await fetch(F2_API_BASE + '/fx-rate?pair=EURUSD');
        if (!r.ok) return; // keep last known rate
        const d = await r.json();
        if (cancelled) return;
        window.FINCR = window.FINCR || {};
        window.FINCR.fxRate = d.rate;
        window.FINCR.fxPair = d.pair;
        window.dispatchEvent(new CustomEvent('fincr:fx-update'));
      } catch (e) { /* silent — keep last known value */ }
    }
    fetchFxRate();
    const interval = setInterval(fetchFxRate, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const ctx = { holdings: derived, closed, targets, totals, loading, drawerTicker, addOpen, actions, deriveHolding: f2DeriveHolding };
  window.__fincrStore = ctx; // latest snapshot for event handlers outside the tree (⌘K)
  return React.createElement(FincrStoreCtx.Provider, { value: ctx }, children);
}

Object.assign(window, { FincrStoreCtx, useStore2, FincrProvider, fincrDeriveHolding: f2DeriveHolding });
