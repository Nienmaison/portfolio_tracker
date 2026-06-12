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

function f2Sync(path, body) {
  const key = f2ApiKey();
  if (!key) return; // not configured on this device — stay local-only
  fetch(F2_API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .then((d) => console.log('[sync] POST ' + path, d))
    .catch((e) => console.warn('[sync] POST ' + path + ' failed:', e.message));
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

function f2LoadInitial() {
  try {
    const raw = localStorage.getItem(F2_LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.holdings)) return p;
    }
  } catch (e) { /* fall through to seed */ }
  return f2SeedFromSample();
}

function FincrProvider({ children }) {
  const init = React.useRef(f2LoadInitial());
  const [holdings, setHoldings] = React.useState(init.current.holdings);
  const [closed, setClosed] = React.useState(init.current.closed || []);
  const [targets, setTargets] = React.useState(init.current.targets || null);
  const [drawerTicker, setDrawerTicker] = React.useState(null);
  const [addOpen, setAddOpen] = React.useState(false);

  React.useEffect(() => {
    try { localStorage.setItem(F2_LS_KEY, JSON.stringify({ holdings, closed, targets })); }
    catch (e) { /* quota — non-fatal in the studio */ }
  }, [holdings, closed, targets]);

  const derived = React.useMemo(() => holdings.map(f2DeriveHolding).filter((h) => h.qty > 1e-7), [holdings]);
  const totals = React.useMemo(() => {
    const totalValue = derived.reduce((s, h) => s + h.value, 0);
    const totalCost = derived.reduce((s, h) => s + h.costNow, 0);
    const totalPnl = totalValue - totalCost;
    const realizedTotal = (closed.reduce((s, c) => s + c.realized, 0))
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
  Object.assign(F, totals);

  const actions = React.useMemo(() => ({
    openDrawer: (tk) => setDrawerTicker(tk),
    closeDrawer: () => setDrawerTicker(null),
    openAdd: () => setAddOpen(true),
    closeAdd: () => setAddOpen(false),

    addPosition: ({ ticker, name, type, price, color, qty, buyPrice, date }) => {
      ticker = ticker.toUpperCase().trim();
      setHoldings((hs) => {
        const existing = hs.find((h) => h.ticker === ticker);
        const tx = { id: f2uid(), kind: 'buy', date: date || new Date().toISOString().slice(0, 10), qty: +qty, price: +buyPrice };
        if (existing) return hs.map((h) => h.ticker === ticker ? { ...h, txns: [...h.txns, tx] } : h);
        const palette = ['#5481D4', '#5E7DA8', '#8B9EC9', '#3D6B9E', '#A6B3CC', '#2E5480', '#6E8FD0'];
        return [...hs, {
          ticker, name: name || ticker, type: type || 'stock', price: +price || +buyPrice,
          color: color || palette[hs.length % palette.length], seed: (hs.length * 7 + 3) % 97, dayPct: 0,
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

    deletePosition: (ticker) => { setHoldings((hs) => hs.filter((h) => h.ticker !== ticker)); setDrawerTicker(null); },

    setTarget: (ticker, pct) => setTargets((tg) => {
      const next = { ...(tg || {}) };
      if (pct == null || pct === '') delete next[ticker]; else next[ticker] = +pct;
      return Object.keys(next).length ? next : null;
    }),
    initTargets: (obj) => setTargets(obj && Object.keys(obj).length ? obj : null),
    clearTargets: () => setTargets(null),

    resetAll: () => { const s = f2SeedFromSample(); setHoldings(s.holdings); setClosed(s.closed); setTargets(null); },
  }), [holdings]);

  // ── Backend sync (SPEC P1-04 §4) — fire-and-forget, never blocks the UI ──
  // Holdings: POST /holdings whenever the book or the closed list changes. The
  // initial mount is skipped so a page load never pushes cached/seeded
  // localStorage to the backend — only genuine mutations sync. This covers all
  // six holdings actions (addPosition/addTxn/editTxn/removeTxn/closePosition/
  // deletePosition), which is exactly the set that mutates holdings or closed.
  const f2HoldingsMounted = React.useRef(false);
  React.useEffect(() => {
    if (!f2HoldingsMounted.current) { f2HoldingsMounted.current = true; return; }
    f2Sync('/holdings', f2BuildHoldingsPayload(derived, closed));
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

  // On load: hydrate targets once from the backend (§4). Stamp f2LastTargets
  // first so the resulting initTargets does not echo a POST back.
  React.useEffect(() => {
    if (!f2ApiKey()) return;
    fetch(F2_API_BASE + '/portfolio', { headers: { 'X-API-Key': f2ApiKey() } })
      .then((r) => r.json())
      .then((d) => {
        if (d && 'targets' in d) {
          f2LastTargets.current = JSON.stringify(d.targets == null ? null : d.targets);
          actions.initTargets(d.targets);
        }
      })
      .catch((e) => console.warn('[sync] GET /portfolio failed:', e.message));
  }, []);

  const ctx = { holdings: derived, closed, targets, totals, drawerTicker, addOpen, actions, deriveHolding: f2DeriveHolding };
  window.__fincrStore = ctx; // latest snapshot for event handlers outside the tree (⌘K)
  return React.createElement(FincrStoreCtx.Provider, { value: ctx }, children);
}

Object.assign(window, { FincrStoreCtx, useStore2, FincrProvider, fincrDeriveHolding: f2DeriveHolding });
