/* Fincr 2.0 — thesis adapter (Spec C2-S2, decision C2-D60).
   Fetches GET /thesis from the VPS API and transforms the backend's
   dict-keyed-by-ticker `holdings` into the array shape that positions2.jsx and
   drawer2.jsx expect on window.FINCR.thesis. Defined as a global (plain script,
   like data.js/appdata.js/theme2.js) so the text/babel store can call it on mount.

   Backend shape (post-Spec-1, C2-D57/C2-D58): each holding lives under
   holdings[TICKER] with company, core_argument (the single canonical per-holding
   thesis), conviction (lowercase), thesis_challenge_signals, stance (lowercase),
   target_price (number|null, EUR, no symbol), plus layer / thesis_type /
   trailing_stop_pct / last_updated. crypto_thesis is membership-only and is NOT
   read here — core_argument is the only canonical per-holding source now.

   Auth + base mirror store2.jsx's holdings fetch exactly: same base, same
   'fincr-api-key' localStorage key, same X-API-Key header. No key / non-200 /
   network error -> returns [] (never throws) and sets F.thesis = []; the Positions
   tab then shows every holding as an honest gap card.
   SaaS (manifesto §6): the key becomes a per-user credential resolving account_id;
   this fetch is unchanged. */

(function () {
  // Same VPS base as store2.jsx's holdings/prices fetches.
  const THESIS_API_BASE = 'https://fincr.duckdns.org';

  // Title-case a lowercase server enum for display ("high" -> "High",
  // "hold" -> "Hold"). Non-strings / empty pass through untouched.
  function titleCase(s) {
    if (!s || typeof s !== 'string') return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Fetch and transform thesis data from the backend.
  // Sets window.FINCR.thesis, dispatches 'fincr:thesis-update' so the shell
  // re-renders, and returns the transformed array. Returns [] on no-key / auth
  // failure / network error (never throws).
  async function loadThesis() {
    const F = (window.FINCR = window.FINCR || {});
    const key = localStorage.getItem('fincr-api-key') || '';
    // Local-only device (no key): nothing to fetch. [] is the honest state —
    // every holding renders as a gap card.
    if (!key) { F.thesis = []; return []; }

    // 1. Fetch GET /thesis with the same auth header as the holdings fetch.
    let data;
    try {
      const r = await fetch(THESIS_API_BASE + '/thesis', { headers: { 'X-API-Key': key } });
      if (!r.ok) { console.warn('[thesis] GET /thesis HTTP ' + r.status); F.thesis = []; return []; }
      data = await r.json();
    } catch (e) {
      // 2. Network error -> log, return [] (do not throw, do not block the UI).
      console.warn('[thesis] GET /thesis failed:', e.message);
      F.thesis = []; return [];
    }

    // Backend wraps the file as { status, thesis: {...} }. Guard the shape so a
    // malformed response degrades to [] rather than throwing.
    const holdings = (data && data.thesis && data.thesis.holdings) || {};

    // 3. Transform the dict (keyed by ticker) -> array. Rename backend fields to
    //    the names the cards already use, and pass every raw field through so
    //    Spec 3's editor can read them without a second fetch.
    const transformed = Object.entries(holdings).map(function (entry) {
      const ticker = entry[0];   // join key — matches F.holdings[i].ticker (uppercase)
      const h = entry[1];
      return {
        ticker: ticker,
        name: h.company,                                   // company -> name
        argument: h.core_argument,                         // core_argument -> argument
        conviction: titleCase(h.conviction),               // "high" -> "High"
        triggers: h.thesis_challenge_signals || [],        // thesis_challenge_signals -> triggers
        stance: titleCase(h.stance),                       // "hold" -> "Hold"
        target: (h.target_price != null)                   // number -> "€N" (display only)
          ? '€' + Number(h.target_price).toLocaleString()
          : null,
        // Pass-through raw backend fields for Spec 3 (editor) — do not strip.
        layer: h.layer,
        thesis_type: h.thesis_type,
        trailing_stop_pct: h.trailing_stop_pct,
        target_price: h.target_price,                      // raw number, for the editor
        last_updated: h.last_updated,
        last_update_reason: h.last_update_reason,
      };
    });

    // 4. Extract portfolio-level fields from the raw thesis response.
    // F.liquidity: { total_eur, realized_eur, last_updated } | null
    // null when the key is absent (pre-migration) or on auth failure.
    // Derived fields (liquidity_eur, gap_eur, target_eur) are computed
    // in the card component, never stored here.
    F.liquidity = (data && data.thesis && data.thesis.liquidity != null)
      ? data.thesis.liquidity
      : null;

    // F.cashTargetPct: the dip_readiness cash target percentage (number | null).
    // Path: thesis.dip_readiness.cash_target.target_pct
    // Used by LiquidityCard2 to compute gap_eur vs total portfolio value.
    // Null when absent — the TARGET row is hidden in the card.
    try {
      var dr = data && data.thesis && data.thesis.dip_readiness;
      F.cashTargetPct = (dr && dr.cash_target && dr.cash_target.target_pct != null)
        ? Number(dr.cash_target.target_pct) : null;
    } catch (e) {
      F.cashTargetPct = null;
    }

    // 5. Publish + notify. Mirrors the fxRate pattern: set window.FINCR, then
    //    dispatch so the shell's forceRerender listener repaints Positions + drawer.
    F.thesis = transformed;
    window.dispatchEvent(new CustomEvent('fincr:thesis-update'));
    return transformed;
  }

  // Save edited thesis fields for a single holding (or archived entry) via
  // POST /thesis/update (C2-S3). `changes` should contain ONLY the fields the
  // caller actually changed (diffed upstream) to avoid needless version bumps.
  // conversationSummary, if non-empty, the endpoint writes to last_update_reason.
  // Returns true on 200, false on 4xx/5xx/network/no-key (never throws).
  async function saveThesis(ticker, changes, conversationSummary) {
    const key = localStorage.getItem('fincr-api-key') || '';
    if (!key) { console.warn('[thesis] saveThesis: no api key — skipped'); return false; }
    const payload = Object.assign({ ticker: ticker }, changes || {});
    if (conversationSummary != null) payload.conversation_summary = conversationSummary;
    try {
      const r = await fetch(THESIS_API_BASE + '/thesis/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const txt = await r.text();
        console.warn('[thesis] POST /thesis/update HTTP ' + r.status + ':', txt.slice(0, 200));
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[thesis] POST /thesis/update failed:', e.message);
      return false;
    }
  }

  // Expose as globals for the text/babel store + drawer to call (Step 2 / C2-S3).
  window.loadThesis = loadThesis;
  window.saveThesis = saveThesis;
})();
