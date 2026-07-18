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
// C2-D113: stable id for closed_positions entries -- lets edit/delete target one
// entry unambiguously even on a same-ticker double-close (close, re-buy, close again).
const f2closedId = () => 'cl_' + Math.random().toString(36).slice(2, 9);
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
    source: h.source, // C2-D82a — provenance (undefined => manual; JSON omits undefined)
    tranches_executed: h.tranches_executed || [], // C2-S9 — additive, round-trips verbatim
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

/* ── Ledger fold: the SINGLE source of truth for a holding's running quantity,
   weighted-average cost, and realized gain. f2DeriveHolding (read path) and
   f2AvgCostBefore (materialize-at-write path, C2-D97) BOTH fold through this, so
   the averaging + realization math can never drift between them. Sorts by date
   exactly as f2DeriveHolding always has. `stopBefore`, when passed, halts the fold
   the instant that exact txn object is reached — used to read avg cost "as of" a
   new sell being written. Realized prefers a sell's materialized `realized_gain`
   and falls back to computing it for legacy (pre-C2-D97) txns, so existing
   h.realized / realizedTotal numbers never move. */
function f2FoldTxns(txnList, stopBefore) {
  const sorted = (txnList || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  let runQty = 0, runAvg = 0, boughtQty = 0, soldQty = 0, realized = 0;
  for (let i = 0; i < sorted.length; i++) {
    const tx = sorted[i];
    if (stopBefore && tx === stopBefore) break;
    if (tx.kind === 'buy') {
      const newQty = runQty + tx.qty;
      runAvg = newQty ? (runQty * runAvg + tx.qty * tx.price) / newQty : 0;
      runQty = newQty;
      boughtQty += tx.qty;
    } else {
      realized += (tx.realized_gain != null) ? tx.realized_gain : tx.qty * (tx.price - runAvg);
      runQty = Math.max(0, runQty - tx.qty);
      soldQty += tx.qty;
    }
  }
  return { runQty, runAvg, boughtQty, soldQty, realized };
}

/* Running weighted-average cost of `holding` immediately BEFORE `txn` (a not-yet-
   committed new sell). Folds the existing ledger + the new txn and stops at it, so
   a materialized realized_gain equals — to the cent — what f2DeriveHolding would
   derive for the same sell. Both fold via f2FoldTxns; no duplicated math. (C2-D97) */
function f2AvgCostBefore(holding, txn) {
  return f2FoldTxns([...(holding.txns || []), txn], txn).runAvg;
}

/* C2-D97 cache-invalidation: strip a sell's materialized proceeds/realized_gain so
   f2DeriveHolding falls back to recomputing it. Called after any editTxn/removeTxn —
   those can change the cost basis a materialized value was captured against (an
   earlier buy edited) or the sell's own qty/price, which would otherwise leave a
   stale realized_gain that the prefer-stored derivation would trust. Recompute is
   exactly the pre-C2-D97 behaviour, so h.realized stays correct after any edit.
   Buys and already-bare sells pass through untouched. */
function f2StripMaterializedSell(tx) {
  if (tx.kind !== 'sell' || (tx.proceeds == null && tx.realized_gain == null)) return tx;
  const rest = Object.assign({}, tx);
  delete rest.proceeds;
  delete rest.realized_gain;
  return rest;
}

/* Derived idle cash (C2-D98) — replaces the retired manual `liquidity.total_eur` plug.
   Seed-and-forward, same discipline as C2-D96's net-capital seed: a full flow-walk is
   impossible (the crypto-side buy history predates the tracker and is incomplete —
   verified to produce a nonsense €3,162 artifact), so we anchor to an owner-attested
   point-in-time truth (`pool.cash.seed_amount_eur` @ `seed_date`) and adjust it forward.

   cash = seed_amount + (post-seed deposits/withdrawals) − (post-seed buy costs+fees)
                      + (post-seed sell proceeds−fees)

   Boundaries:
   • EVENTS contribute when dated ON OR AFTER seed_date, EXCEPT the two seed-anchor
     events (already inside seed_amount), excluded by IDENTITY not date: the C2-D96
     net-capital 'seed' (type:'seed', €16,655.75, a lifetime anchor never idle cash)
     and this seed's OWN cash deposit (cashSeed.seed_event_id, €1,000). Excluding by
     identity — rather than "strictly after seed_date" — lets a GENUINE deposit dated
     ON seed_date (e.g. one you log today via POST /pool/event) count, while never
     double-counting the anchors. (C2-D100 refinement; was strictly-after, which
     wrongly swallowed same-day deposits when today == seed_date.)
   • TXNS contribute when dated ON OR AFTER seed_date — a buy/sell recorded today
     (== seed_date) is genuine post-snapshot activity.
   Returns null when unseeded (no-key / pre-migration) so the card shows an honest gap. */
function f2ComputeIdleCash(cashSeed, poolEvents, allHoldingsTxns) {
  if (!cashSeed || cashSeed.seed_amount_eur == null) return null;
  const seedDate = cashSeed.seed_date;
  let cash = +cashSeed.seed_amount_eur || 0;
  (poolEvents || []).forEach((e) => {
    if (!e || e.type === 'seed') return;                                    // C2-D96 net-capital anchor
    if (cashSeed.seed_event_id && e.id === cashSeed.seed_event_id) return;  // this seed's OWN deposit (== seed_amount)
    if (!e.date || e.date < seedDate) return;                               // pre-seed history is opaque
    cash += (e.direction === 'out') ? -(+e.amount_eur || 0) : (+e.amount_eur || 0);
  });
  (allHoldingsTxns || []).forEach((entry) => {
    const txn = entry && entry.txn;
    if (!txn || !txn.date || txn.date < seedDate) return;   // pre-seed history is opaque (already in the seed)
    const gross = (+txn.qty || 0) * (+txn.price || 0);
    const fee = +txn.fee_eur || 0;                    // fee_eur is preserved through hydration (C2-D98 whitelist widen)
    cash += (txn.kind === 'buy') ? -(gross + fee) : (gross - fee);
  });
  return cash;
}

/* Rotation-candidate finder (C2-D102). Unlinked sells across ALL holdings dated within
   `windowDays` before `buyDate`, sorted closest-to-`buyTotalCost` first. A sell carrying
   any non-empty rotation_links is permanently excluded — locked decision: once linked it
   is never re-offered, even if only part of its proceeds was attributed (the remainder
   stays as ordinary untracked idle cash by design). Proceeds fall back to qty*price when
   the materialized `proceeds` field is absent (it is stripped on GET /holdings read-back
   for un-linked sells; qty*price is the identical gross figure). The finder returns the
   FULL windowed list; the TRIGGER (whether to surface a proposal at all) is a separate
   caller check — candidates[0] within `tolerance` of buyTotalCost. */
function f2FindRotationCandidates(holdings, buyDate, buyTotalCost, windowDays = 14, tolerance = 0.10) {
  if (!buyDate || !(buyTotalCost > 0)) return [];
  const bd = new Date(buyDate + 'T00:00:00');
  if (isNaN(bd.getTime())) return [];
  const windowStart = new Date(bd.getTime() - windowDays * 86400000).toISOString().slice(0, 10);
  const candidates = [];
  (holdings || []).forEach((h) => (h.txns || []).forEach((t) => {
    if (t.kind !== 'sell') return;
    if (t.rotation_links && t.rotation_links.length > 0) return;   // already linked → permanently excluded
    if (!t.date || t.date < windowStart || t.date > buyDate) return;
    const proceeds = (t.proceeds != null) ? t.proceeds : t.qty * t.price;
    candidates.push({ ticker: h.ticker, txnId: t.id, date: t.date, proceeds: proceeds });
  }));
  candidates.sort((a, b) => Math.abs(a.proceeds - buyTotalCost) - Math.abs(b.proceeds - buyTotalCost));
  return candidates;
}

/* Portfolio-wide rotation status for every open-holding SELL (C2-D104, the Rotations page).
   Computed fresh on every call — the "computed, not a plug" principle — EXCEPT that a
   sell's `dismissed_candidates` (a persisted marker of pairs the owner rejected) suppresses
   the corresponding AUTO·PENDING suggestion so it never resurfaces. Reuses the C2-D102 buy-
   centric `f2FindRotationCandidates` (same 14-day/10% params, not reinvented): iterate every
   buy, find the sells it could have been funded by (within tolerance), and invert to a
   per-sell suggestion (closest buy wins). Then classify each sell:
     rotation_links non-empty        → 'linked'   (+ target tickers)
     else a live suggestion, not dismissed → 'pending'  (+ suggested {buyTicker, buyTxnId})
     else                            → 'unlinked'
   Returns [{ sellTicker, sellTxnId, status, targets?, suggested? }] in ledger order.
   Fully-closed positions are NOT included (v1 scope — explicit follow-up). */
function f2ComputeRotationStatuses(holdings) {
  const hs = holdings || [];
  const buys = [];
  hs.forEach((h) => (h.txns || []).forEach((t) => {
    if (t.kind === 'buy') buys.push({ ticker: h.ticker, id: t.id, date: t.date, cost: (+t.qty || 0) * (+t.price || 0) + (+t.fee_eur || 0) });
  }));
  // sellTxnId -> closest suggested buy within the 10% trigger tolerance.
  const suggest = {};
  buys.forEach((b) => {
    if (!(b.cost > 0)) return;
    f2FindRotationCandidates(hs, b.date, b.cost).forEach((c) => {   // unlinked sells in [b.date-14d, b.date]
      const dist = Math.abs(c.proceeds - b.cost) / b.cost;
      if (dist > 0.10) return;                                       // same trigger gate as C2-D102
      const cur = suggest[c.txnId];
      if (!cur || dist < cur.dist) suggest[c.txnId] = { buyTicker: b.ticker, buyTxnId: b.id, buyCost: b.cost, dist: dist };
    });
  });
  const out = [];
  hs.forEach((h) => (h.txns || []).forEach((t) => {
    if (t.kind !== 'sell') return;
    const links = t.rotation_links || [];
    if (links.length > 0) {
      out.push({ sellTicker: h.ticker, sellTxnId: t.id, status: 'linked', targets: links.map((l) => l.target_ticker) });
      return;
    }
    const sg = suggest[t.id];
    const dismissed = sg && (t.dismissed_candidates || []).some((d) => d.target_ticker === sg.buyTicker && d.target_txn_id === sg.buyTxnId);
    if (sg && !dismissed) out.push({ sellTicker: h.ticker, sellTxnId: t.id, status: 'pending', suggested: sg });
    else out.push({ sellTicker: h.ticker, sellTxnId: t.id, status: 'unlinked' });
  }));
  return out;
}

/* ── Derivation: a holding's live numbers come only from its txns ─────── */
function f2DeriveHolding(h) {
  const txns = (h.txns || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  // Numbers come from the shared ledger fold (C2-D97) so the avg-cost/realized math
  // lives in exactly one place; `realized` honours a sell's materialized
  // realized_gain and falls back to computing for legacy sells (h.realized unchanged).
  const { boughtQty, soldQty, runAvg, realized } = f2FoldTxns(h.txns);
  const qty = +(boughtQty - soldQty).toFixed(8);
  const avgCost = runAvg;
  const value = qty * h.price;
  const costNow = qty * avgCost;
  const pnl = value - costNow;
  const pnlPct = costNow > 0 ? (pnl / costNow) * 100 : 0;
  // C2-S9b — tranches_skipped: DERIVED (read-only), never persisted. Tranches the
  // price blew past by more than the midpoint without a discipline trim. Computed
  // from current gain% (== pnlPct) + tranches_executed via the helpers in
  // triggerdistance2.jsx. That file loads after store2.jsx, but f2DeriveHolding runs
  // at render time, so the globals are defined; falls back to [] if the rule isn't
  // configured or the helpers aren't present (no-key device). The record stores only
  // tranches_executed — skipped follows from "the price moved past without action."
  const f2dr = (window.FINCR && window.FINCR.decisionRules) || null;
  const f2trs = (f2dr && typeof window.f2ParseTranches === 'function')
    ? window.f2ParseTranches(f2dr.tranche_selling) : null;
  const tranches_skipped = (f2trs && typeof window.f2ComputeSkipped === 'function')
    ? window.f2ComputeSkipped(pnlPct, f2trs, h.tranches_executed || []) : [];
  return { ...h, txns, qty, avgCost, value, costNow, pnl, pnlPct, realized, soldQty, tranches_executed: h.tranches_executed || [], tranches_skipped: tranches_skipped };
}

/* C2-D107 — single source of truth for building a closed_positions entry. PURE: no
   state, no side effects. Backs closePosition, closePositionWithThesis, AND the
   auto-close on sell-to-zero (commitSell), so the three paths can never drift.
   `live` = f2DeriveHolding(holding) with the final sell already applied — so `realized`
   folds the residual term to ~0 at qty≈0 (auto-close) and to the full liquidation of the
   remaining qty at an explicit close, via the IDENTICAL formula either way (this is why
   the after-append hook needs no special-casing). `thesisPatch` (explicit thesis-close
   only) appends the sell-intent tags; omitting it yields the exact base shape
   closePosition has always produced — no tag keys — so the untagged-close nudge fires
   naturally on the absent sell_type. Field order matches the pre-C2-D107 inline objects. */
function f2BuildClosedEntry(holding, live, sellPrice, date, note, thesisPatch) {
  const sp = +sellPrice;
  const priorOpen = (holding.txns || []).find((t) => t.kind === 'buy');
  // C2-D114: real aggregate proceeds, not qty*sellPrice -- that formula reads €0 on any
  // position closed to a clean zero (the CORRECT outcome of a full exit), breaking rotation-
  // link validation for good. commitSell/commitReplayClose append the closing sell as the
  // ledger's own last txn with C2-D97's materialized `.proceeds` already on it -- reuse that
  // (fallback to qty*price only if somehow missing, mirroring f2FoldTxns's own
  // prefer-materialized-else-recompute pattern). closePosition/closePositionWithThesis never
  // append a txn for the close itself (sellPrice applies to the full still-open qty), so
  // sp*live.qty is correct there and stays unchanged.
  const txns = holding.txns || [];
  const lastTxn = txns[txns.length - 1];
  const isFreshClosingSell = !!lastTxn && lastTxn.kind === 'sell' && live.qty <= 1e-7;
  const proceeds = isFreshClosingSell
    ? (lastTxn.proceeds != null ? lastTxn.proceeds : lastTxn.qty * lastTxn.price)
    : sp * live.qty;
  // C2-D115 Part A: roll up this position's OWN sells' rotation_links (linked while still
  // open, via linkRotation/SellRotationModal2 -- e.g. the real SEI->NEAR link) onto the
  // closed entry. Deferred at C2-D107 ship for lack of this stable helper; proven stable
  // since by C2-D108/110/113/114. Group by target_ticker+target_txn_id, summing portion_eur
  // across sells to the same target (a position can be trimmed in tranches, each rotated
  // into the same destination). Each grouped entry keeps the ORIGINAL sell(s)' own date(s)
  // as `source_dates` (an array, not this entry's own closedAt) -- linkRotation stamps a
  // target buy's reverse rotated_from with the SELL's own date (see linkRotation:
  // `source_closed_at: sellDate`), not the eventual close date, and a position can be
  // trimmed on several different dates before finally closing. deleteClosedPosition must
  // reconcile using those exact original dates or a reverse tag can never be found again --
  // the precise orphan class C2-D108 was built to prevent, reintroduced via a date mismatch
  // if this were done wrong. `source_dates` is always an array (even a single contributing
  // sell gets a 1-element array) for a uniform shape regardless of how many sells fed a
  // given target.
  const rollupGroups = new Map();
  txns.forEach((t) => {
    if (t.kind !== 'sell' || !Array.isArray(t.rotation_links)) return;
    t.rotation_links.forEach((l) => {
      if (!l || !l.target_txn_id) return;
      const k = l.target_ticker + ':' + l.target_txn_id;
      const g = rollupGroups.get(k) || { target_ticker: l.target_ticker, target_txn_id: l.target_txn_id, portion_eur: 0, source_dates: [] };
      g.portion_eur += (+l.portion_eur || 0);
      if (t.date && g.source_dates.indexOf(t.date) === -1) g.source_dates.push(t.date);
      rollupGroups.set(k, g);
    });
  });
  const rolledUpLinks = Array.from(rollupGroups.values());

  const entry = {
    id: f2closedId(),
    ticker: live.ticker, name: live.name, type: live.type, color: live.color,
    openedAt: priorOpen ? priorOpen.date : '—',
    closedAt: date || new Date().toISOString().slice(0, 10),
    qty: live.qty, avgCost: live.avgCost, sellPrice: sp,
    proceeds,
    realized: (live.realized || 0) + live.qty * (sp - live.avgCost),
    note: note || '',
  };
  if (thesisPatch) {
    entry.sell_type = thesisPatch.sell_type || null;
    entry.conviction_retained = (thesisPatch.conviction_retained != null) ? thesisPatch.conviction_retained : null;
    entry.rotated_into = thesisPatch.rotated_into || null;
    // C2-D115 Part A: merge dialog-supplied links with the rolled-up ones -- dialog wins on
    // overlap (same target_ticker+target_txn_id), non-overlapping keys from both sides
    // included. Dialog links carry no source_dates: their reverse tag was stamped with THIS
    // close's own date (CloseForm2's own addRotatedFromToTxn call uses the close's date), so
    // deleteClosedPosition's fallback to entry.closedAt for date-less links is exactly
    // correct for them -- no mismatch to fix on that side.
    const dialogLinks = Array.isArray(thesisPatch.rotation_links) ? thesisPatch.rotation_links : [];
    const merged = new Map(rolledUpLinks.map((l) => [l.target_ticker + ':' + l.target_txn_id, l]));
    dialogLinks.forEach((l) => {
      if (!l || !l.target_txn_id) return;
      merged.set(l.target_ticker + ':' + l.target_txn_id, l);
    });
    entry.rotation_links = Array.from(merged.values());
  } else {
    // No thesisPatch (closePosition/commitSell/commitReplayClose) -- roll-up is the sole
    // source. Always set the field (even []) rather than omitting it -- every consumer
    // already reads it via `entry.rotation_links || []`, so this is a safe, uniform shape.
    entry.rotation_links = rolledUpLinks;
  }
  // sell_type is NOT implied by a rolled-up or dialog rotation_links -- stays independent,
  // untouched here, exactly as before this fix.
  return entry;
}

/* Rotation migration (C2-S8): convert the flat rotated_into string (C2-S7) into a
   rotation_links array. Idempotent — skips entries that already have rotation_links.
   The flat rotated_into field is kept one release as a fallback display value. */
function migrateClosedPositionRotations(closedArray) {
  return (closedArray || []).map((c) => {
    if (c.rotation_links !== undefined) return c;                 // already migrated
    if (c.sell_type !== 'rotate' || !c.rotated_into) return { ...c, rotation_links: [] };
    // Gross proceeds = sell price x units (the cash redeployed). The link starts
    // unlinked (target_txn_id null) — the owner resolves it via the review modal.
    const gross = (c.sellPrice != null && c.qty != null) ? c.sellPrice * c.qty : null;
    return { ...c, rotation_links: [{ target_ticker: c.rotated_into, target_txn_id: null, portion_eur: gross }] };
  });
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
/* ── Spec B2 ([C2-D82]) — source-aware snapshot merge of broker positions.
   Pure + unit-tested. Replace only source=="snaptrade" tickers, skip manual/
   untagged (protected), add new as snaptrade with one synthetic buy. Idempotent:
   re-running replaces txns wholesale (never appends) so quantity never doubles. */
function f2MergeBrokerPositions(holdings, positions) {
  var today = new Date().toISOString().slice(0, 10);
  var next = holdings.slice();
  var added = [], replaced = [], skipped = [];
  var idxOf = function (tk) { for (var i = 0; i < next.length; i++) { if (next[i].ticker === tk) return i; } return -1; };
  // Guard 2 ([C2-D88]): a ticker whose ledger holds activity-replay txns (id 'st_...')
  // has date-accurate per-txn cost basis — a snapshot single-rate update must not
  // clobber it. Detect via the 'st_' id prefix ('stpos_'/'tx_' are NOT history).
  var isHistoryEstablished = function (h) { return (h.txns || []).some(function (t) { return String(t.id || '').indexOf('st_') === 0; }); };
  (positions || []).forEach(function (p) {
    var tk = String(p.ticker || '').toUpperCase();
    if (!tk) return;
    var qty = +p.quantity, price = +p.avg_buy_price;
    var synthTx = { id: 'stpos_' + tk, kind: 'buy', date: today, qty: qty, price: price, source: 'snaptrade' };
    var i = idxOf(tk);
    if (i >= 0) {
      if (next[i].source === 'snaptrade') {
        if (isHistoryEstablished(next[i])) {
          skipped.push({ ticker: tk, reason: 'history_managed' }); // cost basis from history wins; refresh via Sync history
        } else {
          next[i] = Object.assign({}, next[i], { source: 'snaptrade', type: p.type || next[i].type || 'stock', txns: [synthTx] });
          replaced.push(tk);
        }
      } else {
        skipped.push({ ticker: tk, reason: 'manual' }); // untagged — protected ([C2-D82])
      }
    } else {
      next.push({
        ticker: tk, name: tk, type: p.type || 'stock', source: 'snaptrade',
        price: 0, color: F2_PALETTE[next.length % F2_PALETTE.length],
        seed: (next.length * 7 + 3) % 97, dayPct: 0, txns: [synthTx],
      });
      added.push(tk);
    }
  });
  return { next: next, added: added, replaced: replaced, skipped: skipped };
}

/* ── Spec C2 ([C2-D85]) — source-aware replay of broker ACTIVITY history into
   the txn ledger. Deterministic st_{activity_id} txns REPLACE a snaptrade
   ticker's txns wholesale (idempotent — re-sync yields identical ids, no
   duplicates); manual/untagged tickers are protected/skipped (same guarantee
   as [C2-D82] positions); new tickers are added with full history. Pure + unit-
   tested. For real cost basis, run "Sync history" after "Sync brokers". */
function f2MergeBrokerActivities(holdings, activities, positions) {
  var posQty = {};
  (positions || []).forEach(function (p) { posQty[String(p.ticker || '').toUpperCase()] = +p.quantity; });
  var byT = {};
  (activities || []).forEach(function (a) {
    var tk = String(a.ticker || '').toUpperCase(); if (!tk) return;
    (byT[tk] = byT[tk] || []).push({ id: a.id, kind: a.kind, date: a.date, qty: +a.qty, price: +a.price, source: 'snaptrade' });
  });
  var next = holdings.slice();
  var added = [], replaced = [], skipped = [];
  var idxOf = function (tk) { for (var i = 0; i < next.length; i++) { if (next[i].ticker === tk) return i; } return -1; };
  Object.keys(byT).forEach(function (tk) {
    var txns = byT[tk].slice().sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    // Guard 1 ([C2-D87]): only merge when replayed net qty matches the CURRENT
    // reported position. A missing disposal (feed gap) or an unheld ticker would
    // otherwise fabricate a phantom (real case: OTLY). Skip + surface, never merge.
    var net = txns.reduce(function (s, t) { return s + (t.kind === 'buy' ? t.qty : -t.qty); }, 0);
    var cur = posQty[tk];
    var tol = Math.max(0.01, Math.abs(cur || 0) * 0.001);
    if (cur === undefined || Math.abs(net - cur) > tol) { skipped.push({ ticker: tk, reason: 'history_incomplete' }); return; }
    var i = idxOf(tk);
    if (i >= 0) {
      var h = next[i];
      var hasManual = (h.txns || []).some(function (t) { return t.source !== 'snaptrade'; });
      if (h.source !== 'snaptrade' || hasManual) { skipped.push({ ticker: tk, reason: 'manual' }); return; } // protect manual
      next[i] = Object.assign({}, h, { source: 'snaptrade', txns: txns });
      replaced.push(tk);
    } else {
      next.push({ ticker: tk, name: tk, type: 'stock', source: 'snaptrade', price: 0,
        color: F2_PALETTE[next.length % F2_PALETTE.length], seed: (next.length * 7 + 3) % 97, dayPct: 0, txns: txns });
      added.push(tk);
    }
  });
  return { next: next, added: added, replaced: replaced, skipped: skipped };
}

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
          source: t.source, // C2-D85 — preserve txn provenance
          fee_eur: t.fee_eur, // C2-D98 — MUST survive hydration: fee is NOT recomputable
                              // from qty/price, and the idle-cash walk reads it directly.
                              // (undefined when absent; JSON omits it.) proceeds/realized_gain
                              // are intentionally NOT preserved here — both recompute losslessly.
          rotation_links: t.rotation_links, // C2-D102 — MUST survive hydration: a linked sell
          rotated_from: t.rotated_from,     // must stay permanently excluded from candidate
                              // pools across reloads, and the link record is not recomputable.
                              // (undefined when absent; JSON omits.)
          dismissed_candidates: t.dismissed_candidates, // C2-D104 — MUST survive hydration:
                              // else a dismissed AUTO·PENDING suggestion resurfaces on reload.
          original_currency: t.original_currency, // C2-D105 — FX audit trail (source currency,
          original_price: t.original_price,        // original foreign amount, rate applied);
          fx_rate: t.fx_rate,                      // preserved so the correction stays traceable.
        }))
      : [{ id: f2uid(), kind: 'buy', date: '2024-01-01', qty: +hp.quantity, price: +hp.avg_buy_price }];
    return {
      ticker,
      name: ticker,
      type: hp.type || 'stock',
      source: hp.source, // C2-D82a — provenance (undefined => manual)
      price: 0,
      color: F2_PALETTE[i % F2_PALETTE.length],
      seed: (i * 7 + 3) % 97,
      dayPct: 0,
      txns,
      tranches_executed: Array.isArray(hp.tranches_executed) ? hp.tranches_executed : [], // C2-S9
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
  const changeByTicker = {}; // C2-S12 — daily % change, keyed exactly like priceByTicker
  const cryptoCands = holdings.filter((h) => h.type === 'crypto' || !h.type).map((h) => h.ticker);
  if (cryptoCands.length) {
    try {
      const r = await fetch(F2_API_BASE + '/crypto-prices?tickers=' + encodeURIComponent([...new Set(cryptoCands)].join(',')));
      if (r.ok) {
        const m = await r.json();
        // Response carries bare price keys plus additive "<TICKER>_24h_change" siblings
        // (C2-S12). Route the change keys into changeByTicker; everything else is a price.
        Object.keys(m || {}).forEach((t) => {
          if (typeof m[t] !== 'number') return;
          if (t.endsWith('_24h_change')) {
            changeByTicker[t.slice(0, -('_24h_change'.length)).toUpperCase()] = m[t];
          } else {
            priceByTicker[t.toUpperCase()] = m[t];
          }
        });
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
      .then((d) => { if (d && typeof d.price === 'number') { priceByTicker[t] = d.price; if (typeof d.change_pct === 'number') changeByTicker[t] = d.change_pct; } })
      .catch(() => {})
  ));
  // C2-S12: carry the daily change into dayPct. `!= null` (nullish) preserves a real
  // 0 (flat market) and falls back to the holding's prior dayPct only when the API
  // gave null/undefined (unavailable, e.g. market holiday) — never clobbers with 0.
  return holdings.map((h) => ({
    ...h,
    price:  priceByTicker[h.ticker] != null ? priceByTicker[h.ticker] : 0,
    dayPct: changeByTicker[h.ticker] != null ? changeByTicker[h.ticker] : h.dayPct,
  }));
}

/* Phase 1 (instant): last-known book from localStorage. No sample seed — the
   real book is loaded from GET /holdings on mount (Phase 2). An empty book is
   the honest pre-hydration state. */
function f2LoadInitial() {
  try {
    const raw = localStorage.getItem(F2_LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.holdings)) return { ...p, closed: migrateClosedPositionRotations(p.closed || []) };
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
  // liquidityEur is now DERIVED idle cash (C2-D98), not the retired manual plug.
  // Recomputes on (a) holdings changes — a new buy/sell moves cash — and (b) thesis
  // load, when pool.cash + pool.events arrive via the adapter's fincr:thesis-update.
  // Reads window.FINCR fresh so it always sees the latest seed. Uses RAW `holdings`
  // (not `derived`) so a holding sold down to 0 still contributes its sell proceeds.
  const [liquidityEur, setLiquidityEur] = React.useState(0);
  React.useEffect(function() {
    const recompute = function() {
      const FF = window.FINCR || {};
      const flat = [];
      holdings.forEach(function(h) { (h.txns || []).forEach(function(txn) { flat.push({ txn: txn }); }); });
      const cash = f2ComputeIdleCash(FF.poolCashSeed, (FF.pool && FF.pool.events) || [], flat);
      setLiquidityEur(cash != null ? cash : 0);
    };
    recompute();
    window.addEventListener('fincr:thesis-update', recompute);
    return function() { window.removeEventListener('fincr:thesis-update', recompute); };
  }, [holdings]);

  React.useEffect(() => {
    try { localStorage.setItem(F2_LS_KEY, JSON.stringify({ holdings, closed, targets })); }
    catch (e) { /* quota — non-fatal in the studio */ }
  }, [holdings, closed, targets]);

  const derived = React.useMemo(() => holdings.map(f2DeriveHolding).filter((h) => h.qty > 1e-7), [holdings]);
  const totals = React.useMemo(() => {
    // Include undeployed liquidity in total portfolio value (C2-S5 follow-up) — cash between positions is still invested capital.
    const totalValue = derived.reduce((s, h) => s + h.value, 0) + liquidityEur;
    const totalCost = derived.reduce((s, h) => s + h.costNow, 0);
    const totalPnl = totalValue - totalCost;
    const realizedTotal = (closed.reduce((s, c) => s + (c.realized || 0), 0))
      + holdings.map(f2DeriveHolding).reduce((s, h) => s + (h.realized || 0), 0);
    const stocksValue = derived.filter((h) => h.type === 'stock').reduce((s, h) => s + h.value, 0);
    const cryptoValue = derived.filter((h) => h.type === 'crypto').reduce((s, h) => s + h.value, 0);
    const dayChange = derived.reduce((s, h) => s + h.value * ((h.dayPct || 0) / 100), 0);
    // TRUE RETURN — pool-boundary model (C2-D96). Reverses C2-D68's derived-remainder
    // approach (totalInvested = totalValue − allPnl), which counted only EXIT-tagged
    // closes as realised and silently dropped partial-sell proceeds (they landed in
    // an orphaned realizedTotal nothing read — the C2-D69 blind spot). Now:
    //   totalInvested = Net Capital Deposited (pool.events, derived in thesis-adapter.js
    //   as window.FINCR.poolNetCapitalDeposited) — the pool's real funding base, i.e.
    //   the capital the owner actually pushed across the investing-pool boundary.
    //   trueReturn = (current pool value − capital deposited) / capital deposited.
    // Partial-sell proceeds already sit inside totalValue (as reinvested holdings or as
    // liquidity), so this captures them automatically — no sell_type tagging required.
    // NOTE: read window.FINCR directly, NOT the `F` alias — `const F = window.FINCR`
    // is declared below this useMemo, so `F` is in the temporal dead zone here.
    const totalInvested = (window.FINCR && typeof window.FINCR.poolNetCapitalDeposited === 'number')
      ? window.FINCR.poolNetCapitalDeposited : null;
    // untaggedClosedCount stays computed but is now purely INFORMATIONAL (a
    // Closed-positions nudge to tag rotations) — it no longer gates True Return.
    const untaggedClosedCount = closed.filter((c) => !c.sell_type).length;
    // C2-S8: rotations tagged but not yet linked to a specific buy txn — flagged for
    // the UI so the owner can complete the chain. Drives the closed-positions warning.
    const unlinkedRotationCount = closed.filter((c) =>
      c.sell_type === 'rotate' &&
      (c.rotation_links && c.rotation_links.length > 0) &&
      c.rotation_links.some((l) => l.target_txn_id == null)
    ).length;
    // null (not 0) when the pool is unseeded / no-key — UI shows an honest placeholder
    // instead of a misleading 0%. Guard divide-by-zero with totalInvested > 0.
    const trueReturnPct = (totalInvested != null && totalInvested > 0)
      ? ((totalValue - totalInvested) / totalInvested) * 100 : null;

    return {
      totalValue, totalCost, totalPnl,
      totalPnlPct: totalCost > 0 ? (totalPnl / totalCost) * 100 : 0,
      stocksValue, cryptoValue, realizedTotal,
      dayChange, dayChangePct: totalValue > 0 ? (dayChange / totalValue) * 100 : 0,
      totalInvested, trueReturnPct, untaggedClosedCount, unlinkedRotationCount,
      liquidityEur, // C2-D98 — derived idle cash, exposed as F.liquidityEur for the (now read-only) Liquidity card
    };
  }, [derived, closed, holdings, liquidityEur]);

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

    addPosition: ({ ticker, name, type, price, color, qty, buyPrice, date, audit }) => {
      ticker = ticker.toUpperCase().trim();
      setHoldings((hs) => {
        const existing = hs.find((h) => h.ticker === ticker);
        // C2-D105 — optional FX audit ({original_currency, fx_rate}) merged onto the buy
        // txn when the CSV price was converted from a foreign currency; absent otherwise.
        const tx = Object.assign({ id: f2uid(), kind: 'buy', date: date || new Date().toISOString().slice(0, 10), qty: +qty, price: +buyPrice }, audit || {});
        if (existing) return hs.map((h) => h.ticker === ticker ? { ...h, txns: [...h.txns, tx] } : h);
        return [...hs, {
          ticker, name: name || ticker, type: type || 'stock', price: +price || +buyPrice,
          color: color || F2_PALETTE[hs.length % F2_PALETTE.length], seed: (hs.length * 7 + 3) % 97, dayPct: 0,
          txns: [tx],
        }];
      });
      setAddOpen(false);
    },

    syncBrokerPositions: async (positions) => {
      const merged = f2MergeBrokerPositions(holdings, positions || []);
      const priced = await f2FetchPrices(merged.next); // re-price so P&L/true-return are correct
      setHoldings(priced); // triggers the single POST /holdings sync
      return { added: merged.added, replaced: merged.replaced, skipped: merged.skipped };
    },

    syncBrokerActivities: async (activities, positions) => {
      const merged = f2MergeBrokerActivities(holdings, activities || [], positions || []);
      const priced = await f2FetchPrices(merged.next); // re-price so true-return is correct
      setHoldings(priced); // triggers the single POST /holdings sync
      return { added: merged.added, replaced: merged.replaced, skipped: merged.skipped };
    },

    // C2-D97: for a SELL, materialize gross proceeds + realized gain ON the txn at
    // write time so the ledger is self-describing (the foundation Spec 2b's cash walk
    // reads). avg cost is taken as-of this sell via the shared fold (f2AvgCostBefore),
    // so f2DeriveHolding — which now prefers the stored value — derives an identical
    // h.realized. Buys are unchanged. proceeds = gross euros back; realized_gain = gain
    // vs cost basis (matches f2DeriveHolding's math exactly).
    addTxn: (ticker, tx) => setHoldings((hs) => hs.map((h) => {
      if (h.ticker !== ticker) return h;
      const t = { id: f2uid(), ...tx, qty: +tx.qty, price: +tx.price };
      // C2-D98: optional per-txn broker fee, stored only when non-zero (legacy txns
      // stay bare; the idle-cash walk treats a missing fee as 0). Cash-only — fees do
      // NOT enter realized_gain / P&L (documented simplification).
      if (+t.fee_eur > 0) t.fee_eur = +t.fee_eur; else delete t.fee_eur;
      if (t.kind === 'sell') {
        const avg = f2AvgCostBefore(h, t);
        t.proceeds = t.qty * t.price;
        t.realized_gain = t.qty * (t.price - avg);
      }
      return { ...h, txns: [...h.txns, t] };
    })),

    // C2-D97: after the edit, strip materialized values on this holding's sells — the
    // edited txn may have changed the cost basis they were captured against (or its
    // own qty/price), so f2DeriveHolding recomputes them (pre-C2-D97 behaviour).
    editTxn: (ticker, txId, patch) => setHoldings((hs) => hs.map((h) => h.ticker === ticker
      ? { ...h, txns: h.txns.map((tx) => tx.id === txId ? { ...tx, ...patch, qty: +(patch.qty ?? tx.qty), price: +(patch.price ?? tx.price) } : tx).map(f2StripMaterializedSell) } : h)),

    removeTxn: (ticker, txId) => setHoldings((hs) => hs.map((h) => h.ticker === ticker
      ? { ...h, txns: h.txns.filter((tx) => tx.id !== txId).map(f2StripMaterializedSell) } : h)),

    // C2-D107 — close-aware sell for INTERACTIVE (drawer) sells. Appends the sell with the
    // SAME materialized proceeds/realized_gain math as addTxn's sell branch (:665 — mirrored,
    // not forked), then folds the result: if the position is still open (qty > 1e-7) it
    // behaves exactly like addTxn (holding stays, reduced qty); if it has folded to ~0
    // (≤ 1e-7, the derived-filter threshold at :548) it materializes a closed_positions
    // entry via the shared f2BuildClosedEntry (last sell price as sellPrice) and removes the
    // holding — so a sell-to-zero can never vanish untraced. setClosed + setHoldings batch
    // into ONE render → the [holdings, closed] sync effect POSTs once with the holding gone
    // and the entry present; the entry carries realized + sellPrice + closedAt, so the
    // backend's existing thesis-archive enrichment fires unchanged (no api.py edit).
    // Buys / CSV import / programmatic adds still use addTxn — only the drawer sell reroutes.
    commitSell: (ticker, tx) => {
      const src = holdings.find((h) => h.ticker === ticker);
      if (!src) return;
      // Build the sell txn exactly as addTxn's sell branch does (same fold, same fields).
      const t = { id: f2uid(), ...tx, qty: +tx.qty, price: +tx.price };
      if (+t.fee_eur > 0) t.fee_eur = +t.fee_eur; else delete t.fee_eur;
      const avg = f2AvgCostBefore(src, t);
      t.proceeds = t.qty * t.price;
      t.realized_gain = t.qty * (t.price - avg);
      const withSell = { ...src, txns: [...src.txns, t] };
      const live = f2DeriveHolding(withSell);
      if (live.qty > 1e-7) {
        // Still open — identical outcome to addTxn (holding stays with reduced qty).
        setHoldings((hs) => hs.map((h) => (h.ticker === ticker ? withSell : h)));
        return;
      }
      // Sold to ~zero → materialize the closed entry and remove the holding.
      const entry = f2BuildClosedEntry(withSell, live, t.price, t.date, '');
      // Idempotency guard (belt-and-suspenders; atomic holding-removal already prevents a
      // same-holding re-fire): never prepend a duplicate for the same ticker + closedAt.
      setClosed((cs) => (cs.some((c) => c.ticker === entry.ticker && c.closedAt === entry.closedAt) ? cs : [entry, ...cs]));
      setHoldings((hs) => hs.filter((h) => h.ticker !== ticker));
    },

    // commitReplayClose (C2-D110) — the ONE addition this decision needed: a minimal,
    // functional-updater-only commit for an ALREADY-BUILT closed entry. Exists because the
    // full-ledger-replay importer (import2.jsx) must detect a mid-history zero-crossing and
    // materialize a real close WITHOUT going through commitSell — commitSell's `holdings.find`
    // reads THIS render's outer-closure `holdings`, which is stale the instant the import loop
    // has already applied earlier addTxn/addPosition calls to the SAME ticker earlier in the
    // SAME synchronous batch (those updates are queued, not yet reflected in the closure).
    // Calling commitSell there would silently no-op (new ticker) or build a wrong entry from
    // pre-import data (existing ticker). This action takes no such risk: the caller builds the
    // entry itself via the pure f2BuildClosedEntry, folding its OWN locally-tracked replay
    // ledger (never this store's `holdings`), and only the two known-safe functional updaters
    // below commit it — identical in shape to commitSell's own tail (:736-741), just without
    // the unsafe lookup. Idempotency guard mirrors commitSell's.
    commitReplayClose: (ticker, entry) => {
      setClosed((cs) => (cs.some((c) => c.ticker === entry.ticker && c.closedAt === entry.closedAt) ? cs : [entry, ...cs]));
      setHoldings((hs) => hs.filter((h) => h.ticker !== ticker));
    },

    closePosition: (ticker, { sellPrice, date, note }) => {
      const src = holdings.find((h) => h.ticker === ticker);
      const live = f2DeriveHolding(src);
      // C2-D107: entry now built by the shared f2BuildClosedEntry (no thesisPatch → base
      // shape, field-for-field identical to the prior inline object). Removal + effect-
      // driven sync unchanged.
      setClosed((cs) => [f2BuildClosedEntry(src, live, sellPrice, date, note), ...cs]);
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
      // C2-D107: entry built by the shared f2BuildClosedEntry (thesisPatch present → base
      // + tag fields, field-for-field identical to the prior inline object). The
      // orchestration below (controlled POST + echo-suppression + thesis update) is
      // unchanged — the helper builds the entry only.
      const closedEntry = f2BuildClosedEntry(src, live, sellPrice, date, note, thesisPatch);
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
        // rotation_links belongs on the closed entry, not the thesis — strip it.
        const thesisOnly = Object.assign({}, thesisPatch); delete thesisOnly.rotation_links;
        thesisOk = await window.saveThesis(ticker, thesisOnly, summary || '');
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

    // editClosedPosition (C2-S7) — patch sell_type / conviction_retained /
    // rotated_into on an existing closed position (used by the review modal to
    // tag historical closes). Partial update: only supplied fields are written.
    // setClosed triggers the holdings-sync effect (deps [holdings, closed]) which
    // fires POST /holdings — same fire-and-forget pattern as the other mutations.
    // C2-D113: matches by stable `id` when the caller supplies one (all entries
    // created from this point forward have one, via f2BuildClosedEntry). Falls back
    // to the old unsafe ticker-only match for legacy entries with no id — no forced
    // migration/backfill. Does NOT recompute P&L — realised is immutable.
    editClosedPosition: (ticker, { sell_type, conviction_retained, rotated_into, rotation_links }, id) => {
      setClosed((cs) => cs.map((c) => {
        const isMatch = id ? c.id === id : c.ticker === ticker;
        if (!isMatch) return c;
        const next = { ...c };
        if (sell_type !== undefined) next.sell_type = sell_type;
        if (conviction_retained !== undefined) next.conviction_retained = conviction_retained;
        if (rotated_into !== undefined) next.rotated_into = rotated_into;
        if (rotation_links !== undefined) next.rotation_links = rotation_links;
        return next;
      }));
    },

    // deleteClosedPosition (C2-D108) — remove ONE closed_positions entry (fixes the
    // create-only asymmetry: users could make closed entries but never remove one). Targets
    // by ticker + closedAt (commitSell's idempotency key — NOT editClosedPosition's unsafe
    // ticker-only match, which would hit a same-ticker double-close).
    //
    // Adversarial-review hardening (post-first-draft):
    //  - AMBIGUITY GUARD: ticker+closedAt is not a guaranteed-unique id (two distinct closes
    //    of the same ticker on the same day would collide — none exist in the live data
    //    today, but the original find()-vs-filter() mismatch reconciled only the FIRST match's
    //    rotation_links while removing EVERY match, silently orphaning a sibling's rotated_from
    //    mirror with zero signal). Refuse rather than risk that. A stable id on closed entries
    //    would remove this restriction entirely — logged as a follow-up, not built here.
    //  - SEQUENCED WRITES: this action and the general [holdings,closed] sync effect both do
    //    read-modify-write on thesis.json (the effect's POST /holdings → sync_thesis_with_holdings;
    //    this action's own /thesis/delete-archived). Firing both from one click let them race —
    //    a stale in-flight write could silently resurrect what the other just changed. Now does
    //    a CONTROLLED POST /holdings (suppressing the general effect's echo, mirroring
    //    closePositionWithThesis) and awaits it before the prune, so there is only ever one
    //    thesis.json writer in flight at a time for this action.
    //  - SIBLING GUARD: archived is keyed by ticker only. If another closed entry for this
    //    ticker remains after the delete, its archive stub is still needed — AND the just-
    //    awaited /holdings POST already re-enriched it correctly from that sibling via the
    //    backend's own sync_thesis_with_holdings — so skip the prune.
    //  - Prune only fires if the holdings write actually succeeded (mirrors
    //    closePositionWithThesis's `if (closeRes.ok && ...)` gate) — an unlanded holdings write
    //    must never be followed by pruning the archive stub out from under a still-live record.
    // rotation_links: closed entries are only rotation SOURCES (never targets), so there is no
    // forward-link-into-us case to reconcile on the target side.
    // C2-D113: now matches by stable `id` when the caller supplies one — a real double-close
    // on the same ticker no longer needs the ambiguity guard below to protect it (ids are
    // unique by construction). Legacy entries with no id still fall back to the old
    // ticker+closedAt match, so the guard stays in place for that path.
    deleteClosedPosition: (ticker, closedAt, id) => {
      const isMatch = (c) => (id ? c.id === id : (c.ticker === ticker && c.closedAt === closedAt));
      const matches = closed.filter(isMatch);
      if (matches.length === 0) return;
      if (matches.length > 1) {
        console.warn('[deleteClosedPosition] ambiguous match for ' + ticker + '/' + closedAt + ' (' + matches.length + ' entries) — refusing to delete (needs a stable id to disambiguate)');
        window.dispatchEvent(new CustomEvent('fincr:toast', { detail: { message: 'Could not delete — more than one closed record matches this ticker and date.' } }));
        return;
      }
      const entry = matches[0];
      if (entry.rotation_links && entry.rotation_links.length) {
        // C2-D115 Part A: a rolled-up link's reverse rotated_from tag may have been stamped
        // with the ORIGINAL sell's own date (`source_dates`), not this entry's `closedAt` --
        // reconcile once per distinct date actually found, not once assuming closedAt fits
        // every link. Getting this wrong would silently leave a rolled-up link's reverse tag
        // orphaned -- the exact class of bug C2-D108 was built to prevent. Links with no
        // `source_dates` (dialog-supplied at close time, or legacy pre-C2-D115 entries) fall
        // back to `closedAt`, matching their own reverse tag's actual stamp -- identical
        // behavior to before this fix for every entry that predates it.
        const sourceDates = new Set();
        entry.rotation_links.forEach((l) => {
          const ds = (Array.isArray(l.source_dates) && l.source_dates.length) ? l.source_dates : [closedAt];
          ds.forEach((d) => sourceDates.add(d));
        });
        sourceDates.forEach((d) => {
          actions.reconcileRotatedFrom(entry.rotation_links, [], { source_ticker: ticker, source_closed_at: d });
        });
      }
      const nextClosed = closed.filter((c) => !isMatch(c));
      f2SuppressHoldingsSync.current = true;
      setClosed(nextClosed);
      (async () => {
        const derivedNext = holdings.map(f2DeriveHolding).filter((h) => h.qty > 1e-7);
        const res = await f2Sync('/holdings', f2BuildHoldingsPayload(derivedNext, nextClosed));
        window.FINCR = window.FINCR || {};
        if (res.ok) { window.FINCR.lastSyncMs = Date.now(); window.FINCR.lastSyncStatus = 'ok'; }
        else if (res.reason !== 'no-key') { window.FINCR.lastSyncStatus = 'failed'; window.FINCR.lastSyncReason = res.reason; }
        window.dispatchEvent(new CustomEvent('fincr:sync-status-change'));
        const hasSibling = nextClosed.some((c) => c.ticker === ticker);
        if (res.ok && !hasSibling) {
          const pruneRes = await f2Sync('/thesis/delete-archived', { ticker: ticker });
          if (!pruneRes.ok && pruneRes.reason !== 'no-key') {
            console.warn('[deleteClosedPosition] archive-prune failed for ' + ticker + ': ' + pruneRes.reason);
          }
        }
      })();
    },

    // addRotatedFromToTxn (C2-S8): tag a buy transaction as funded by a rotation.
    // The reverse link (closed position -> buy txn) lives in rotation_links; this is
    // the forward link (buy txn -> source closed position). Both directions are kept
    // so the chain can be traversed from either end. Transactions live on the
    // holding's .txns array (no separate txn store), so this patches like editTxn;
    // setHoldings fires the POST /holdings sync (transactions round-trip verbatim).
    addRotatedFromToTxn: (ticker, txnId, link) => {
      setHoldings((hs) => hs.map((h) => {
        if (h.ticker !== ticker) return h;
        return { ...h, txns: (h.txns || []).map((tx) => {
          if (tx.id !== txnId) return tx;
          const existing = Array.isArray(tx.rotated_from) ? tx.rotated_from : [];
          // Idempotent: drop any prior link from the same source close before appending.
          const kept = existing.filter((r) => !(r.source_ticker === link.source_ticker && r.source_closed_at === link.source_closed_at));
          return { ...tx, rotated_from: [...kept, link] };
        }) };
      }));
    },

    // linkRotation (C2-D102): write BOTH sides of a rotation link between a partial-sell
    // txn and a buy txn in ONE atomic update — rotation_links on the sell (many-to-many
    // capable; idempotent by target) and the mirrored rotated_from on the buy (same shape
    // + idempotency as addRotatedFromToTxn; source_closed_at carries the sell's date).
    // Called once per checked candidate on commit. Handles the sell==buy same-ticker case
    // (both maps apply to the one holding's txns; sellTxnId != buyTxnId). This is the
    // open-holding sibling of the closed-position rotation flow — that path is untouched.
    linkRotation: (sellTicker, sellTxnId, buyTicker, buyTxnId, portionEur) => {
      const srcH = holdings.find((h) => h.ticker === sellTicker);
      const srcTx = srcH && (srcH.txns || []).find((t) => t.id === sellTxnId);
      const sellDate = srcTx ? srcTx.date : null;
      setHoldings((hs) => hs.map((h) => {
        if (h.ticker !== sellTicker && h.ticker !== buyTicker) return h;
        let txns = h.txns || [];
        if (h.ticker === sellTicker) {
          txns = txns.map((tx) => {
            if (tx.id !== sellTxnId) return tx;
            const ex = Array.isArray(tx.rotation_links) ? tx.rotation_links : [];
            const kept = ex.filter((l) => !(l.target_ticker === buyTicker && l.target_txn_id === buyTxnId));
            return { ...tx, rotation_links: [...kept, { target_ticker: buyTicker, target_txn_id: buyTxnId, portion_eur: portionEur }] };
          });
        }
        if (h.ticker === buyTicker) {
          txns = txns.map((tx) => {
            if (tx.id !== buyTxnId) return tx;
            const ex = Array.isArray(tx.rotated_from) ? tx.rotated_from : [];
            const kept = ex.filter((r) => !(r.source_ticker === sellTicker && r.source_closed_at === sellDate));
            return { ...tx, rotated_from: [...kept, { source_ticker: sellTicker, source_closed_at: sellDate, portion_eur: portionEur }] };
          });
        }
        return { ...h, txns };
      }));
    },

    // reconcileRotatedFrom (C2-D103): the shared THREE-WAY relink/unlink primitive.
    // Given a source's OLD and NEW rotation_links (target buys) plus the source's own
    // identity, it reconciles the TARGET side only: removes this source's rotated_from
    // entry from buys dropped from the set, adds/refreshes it on buys added to the set.
    // The caller writes newLinks onto its own source object separately (a sell txn's
    // rotation_links via editTxn, or a closed entry's via editClosedPosition) — those
    // two go through different state paths. `source` = { source_ticker, source_closed_at }
    // (for a partial sell: holding ticker + the sell's date; for a closed position: the
    // entry's ticker + closedAt) — the key by which a rotated_from entry is matched, so
    // a buy funded by multiple sources keeps the others intact. A link's target_txn_id
    // must be set (null-target unlinked entries carry no reverse side). This fixes the
    // pre-existing closed-flow orphan bug (relink/clear used to leave a stale rotated_from).
    reconcileRotatedFrom: (oldLinks, newLinks, source) => {
      if (!source) return;
      const key = (l) => l.target_ticker + ':' + l.target_txn_id;
      const oldKeys = new Set((oldLinks || []).filter((l) => l && l.target_txn_id).map(key));
      const newByKey = new Map((newLinks || []).filter((l) => l && l.target_txn_id).map((l) => [key(l), l]));
      const matchesSource = (r) => r.source_ticker === source.source_ticker && r.source_closed_at === source.source_closed_at;
      setHoldings((hs) => hs.map((h) => {
        let touched = false;
        const txns = (h.txns || []).map((tx) => {
          const k = h.ticker + ':' + tx.id;
          const inNew = newByKey.has(k);
          const inOld = oldKeys.has(k);
          if (!inNew && !inOld) return tx;
          const existing = Array.isArray(tx.rotated_from) ? tx.rotated_from : [];
          const kept = existing.filter((r) => !matchesSource(r));           // drop this source's entry
          if (inNew) {                                                        // add/refresh (idempotent by source)
            const nl = newByKey.get(k);
            touched = true;
            return { ...tx, rotated_from: [...kept, { source_ticker: source.source_ticker, source_closed_at: source.source_closed_at, portion_eur: nl.portion_eur }] };
          }
          // inOld && !inNew → removal only
          if (kept.length !== existing.length) { touched = true; return { ...tx, rotated_from: kept }; }
          return tx;
        });
        return touched ? { ...h, txns } : h;
      }));
    },

    // dismissRotationCandidate (C2-D104): persist that the owner rejected a specific
    // sell↔buy AUTO·PENDING pair, so the Rotations page's status recompute never re-offers
    // it (the one deliberate exception to "computed, not stored" — a rejection is a fact,
    // not a derived value). Idempotent. Survives hydration via the f2HoldingsFromApi
    // whitelist. Does not touch the sell's rotation_links — the sell stays manually linkable.
    dismissRotationCandidate: (sellTicker, sellTxnId, targetTicker, targetTxnId) => {
      setHoldings((hs) => hs.map((h) => {
        if (h.ticker !== sellTicker) return h;
        return { ...h, txns: (h.txns || []).map((tx) => {
          if (tx.id !== sellTxnId) return tx;
          const ex = Array.isArray(tx.dismissed_candidates) ? tx.dismissed_candidates : [];
          if (ex.some((d) => d.target_ticker === targetTicker && d.target_txn_id === targetTxnId)) return tx;
          return { ...tx, dismissed_candidates: [...ex, { target_ticker: targetTicker, target_txn_id: targetTxnId }] };
        }) };
      }));
    },

    // editHoldingTrancheExecution (C2-S9): append a tranche level to a holding's
    // tranches_executed array. Idempotent — won't double-add the same level. Called
    // by the partial-sell form when a sell is marked a discipline trim. setHoldings
    // fires the POST /holdings sync (the field is in the payload, round-trips verbatim).
    editHoldingTrancheExecution: (ticker, trancheLevel) => {
      setHoldings((hs) => hs.map((h) => {
        if (h.ticker !== ticker) return h;
        const ex = Array.isArray(h.tranches_executed) ? h.tranches_executed : [];
        if (ex.indexOf(trancheLevel) !== -1) return h; // idempotent
        return { ...h, tranches_executed: [...ex, trancheLevel] };
      }));
    },

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
      if (Array.isArray(data.closed_positions)) setClosed(migrateClosedPositionRotations(data.closed_positions));
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

Object.assign(window, { FincrStoreCtx, useStore2, FincrProvider, fincrDeriveHolding: f2DeriveHolding, f2uid, f2FindRotationCandidates, f2ComputeRotationStatuses });
