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

    // 4. Publish + notify. Mirrors the fxRate pattern: set window.FINCR, then
    //    dispatch so the shell's forceRerender listener repaints Positions + drawer.
    F.thesis = transformed;
    window.dispatchEvent(new CustomEvent('fincr:thesis-update'));
    return transformed;
  }

  // Expose as a global for the text/babel store to call on mount (Step 2).
  window.loadThesis = loadThesis;
})();
