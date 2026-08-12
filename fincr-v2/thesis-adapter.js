/* Fincr 2.0 — thesis adapter (Spec C2-S2, decision C2-D60).
   Fetches GET /thesis from the VPS API and transforms the backend's
   dict-keyed-by-ticker `holdings` into the array shape that positions2.jsx and
   drawer2.jsx expect on window.FINCR.thesis. Defined as a global (plain script,
   like data.js/appdata.js/theme2.js) so the text/babel store can call it on mount.

   Backend shape (post-Spec-1, C2-D57/C2-D58; thesis_indicators per C2-D125): each
   holding lives under holdings[TICKER] with company, core_argument (the single
   canonical per-holding thesis), conviction (lowercase), thesis_indicators (typed
   list: {id, type: risk|price_level|catalyst, text, target_price}), stance
   (lowercase), target_price (number|null, EUR, no symbol), plus layer /
   thesis_type / trailing_stop_pct / last_updated. crypto_thesis is membership-only
   and is NOT read here — core_argument is the only canonical per-holding source now.

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

  // Pool-boundary Net Capital Deposited (C2-D96). Sums pool.events across the
  // investing-pool boundary: +amount for direction 'in' (deposit/seed), -amount
  // for 'out' (withdrawal). Derived, never stored — the same "computed, not a
  // plug" principle that motivated moving off the manual `liquidity` field.
  // Returns null when there are no events (pre-seed / no-key) so callers can show
  // an honest "pool not seeded" state rather than a misleading 0.
  function f2ComputePoolNetCapital(events) {
    if (!Array.isArray(events) || events.length === 0) return null;
    return events.reduce(function (sum, e) {
      var amt = Number(e && e.amount_eur) || 0;
      return sum + (e && e.direction === 'out' ? -amt : amt);
    }, 0);
  }

  // Fetch and transform thesis data from the backend.
  // Sets window.FINCR.thesis, dispatches 'fincr:thesis-update' so the shell
  // re-renders, and returns the transformed array. Returns [] on no-key / auth
  // failure / network error (never throws).
  async function loadThesis() {
    const F = (window.FINCR = window.FINCR || {});
    const key = localStorage.getItem('fincr-api-key') || '';
    // Local-only device (no key): nothing to fetch. [] is the honest state —
    // every holding renders as a gap card. F.watchlist mirrors F.thesis here
    // (both [] on every early-exit path below) — see the F.watchlist block
    // further down for why [] (not null) is the right "loaded, empty" state.
    if (!key) { F.thesis = []; F.watchlist = []; return []; }

    // 1. Fetch GET /thesis with the same auth header as the holdings fetch.
    let data;
    try {
      const r = await fetch(THESIS_API_BASE + '/thesis', { headers: { 'X-API-Key': key } });
      if (!r.ok) { console.warn('[thesis] GET /thesis HTTP ' + r.status); F.thesis = []; F.watchlist = []; return []; }
      data = await r.json();
    } catch (e) {
      // 2. Network error -> log, return [] (do not throw, do not block the UI).
      console.warn('[thesis] GET /thesis failed:', e.message);
      F.thesis = []; F.watchlist = []; return [];
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
        // C2-D125 — thesis_challenge_signals (flat string list, exposed as
        // `triggers`) replaced by thesis_indicators (typed: risk/price_level/
        // catalyst, exposed as `indicators`). Passed through as-is (each entry
        // keeps its own id/type/text/target_price) — positions2.jsx's
        // ThesisCard2 and drawer2.jsx's ThesisEditor2 both read the raw shape
        // directly rather than a display-cased projection, since the three
        // types render differently from one another.
        indicators: h.thesis_indicators || [],
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

    // F.decisionRules: the raw decision_rules object (tranche_selling, trailing_stops,
    // value_gap, rebalancing) | null. The Trigger Distance card (C2-S9) reads
    // F.decisionRules.tranche_selling. F.thesis is the transformed holdings ARRAY,
    // so decision_rules must be exposed separately here.
    F.decisionRules = (data && data.thesis && data.thesis.decision_rules) || null;

    // F.watchlist (Watchlist Frontend build, C2-D159): thesis.json's watchlist
    // dict, transformed the same way F.thesis transforms holdings just above —
    // Object.entries -> array, ticker joined in as its own field. Unlike
    // F.thesis's holdings transform, field names are passed through AS-IS
    // (company/thesis_type/conviction/core_argument/entry_triggers/layer/
    // trailing_stop_pct/last_updated) rather than renamed/display-cased: there
    // is no pre-existing display convention for watchlist to preserve. The old
    // F.watchlist was a fixture-only array in appdata.js (ticker/name/note/
    // capitalized conviction — a completely different, made-up shape with no
    // relationship to thesis.json), now removed from that file entirely (it
    // had exactly one reader, positions2.jsx's Watchlist section, same
    // "confirm no other reader, then remove outright" discipline C2-D145 used
    // for F.rules). [] here (and on every early-exit path above) is the
    // correct "loaded, empty" state — distinct from F.decisionRules' null,
    // which means "the document itself failed to load" — since positions2.jsx
    // renders an explicit "No watchlist entries yet" message for a genuinely
    // empty array, the same way F.thesis's [] renders every holding as a gap
    // card rather than nothing at all.
    const watchlist = (data && data.thesis && data.thesis.watchlist) || {};
    F.watchlist = Object.entries(watchlist).map(function (entry) {
      const ticker = entry[0];
      const w = entry[1];
      return {
        ticker:             ticker,
        company:            w.company,
        layer:              w.layer,
        thesis_type:        w.thesis_type,
        conviction:         w.conviction,
        core_argument:      w.core_argument,
        entry_triggers:     w.entry_triggers || [],
        trailing_stop_pct:  w.trailing_stop_pct,
        last_updated:       w.last_updated,
      };
    });

    // F.thesisVersion (C2-D155): thesis.meta.version, previously discarded
    // entirely by this function (only decision_rules was pulled out of the
    // full response above it). saveDecisionRules below needs this for the
    // C2-D154 endpoint's required compare-and-swap check — decision_rules
    // has no per-ticker entry to read a version from the way the full_thesis
    // overlay flow does (it passes its own `full.thesis_version` from a
    // different fetch, GET /thesis/<ticker>/full); this is the one write
    // path that has no ticker-scoped fetch to piggyback a version off of, so
    // it's read here instead, off the same GET /thesis response that
    // populates F.decisionRules itself.
    F.thesisVersion = (data && data.thesis && data.thesis.meta && data.thesis.meta.version) || null;

    // F.pool + F.poolNetCapitalDeposited (C2-D96): the raw pool-boundary ledger and
    // its derived Net Capital Deposited. store2.jsx's True Return uses
    // poolNetCapitalDeposited as totalInvested (the pool's real funding base), not
    // the old derived remainder. null when the key is absent (pre-seed / no-key) —
    // True Return then shows the honest "pool not seeded" placeholder.
    F.pool = (data && data.thesis && data.thesis.pool) || null;
    F.poolNetCapitalDeposited = f2ComputePoolNetCapital(F.pool && F.pool.events);

    // F.poolCashSeed (C2-D98): the raw idle-cash anchor { seed_amount_eur, seed_date }.
    // store2.jsx's f2ComputeIdleCash starts from this and walks forward-dated events/
    // txns to derive F.liquidityEur — retiring the manual liquidity.total_eur plug.
    // null when absent (pre-migration / no-key) → the Liquidity card shows a gap.
    F.poolCashSeed = (F.pool && F.pool.cash) || null;

    // 5. Publish + notify. Mirrors the fxRate pattern: set window.FINCR, then
    //    dispatch so the shell's forceRerender listener repaints Positions + drawer.
    F.thesis = transformed;
    window.dispatchEvent(new CustomEvent('fincr:thesis-update'));
    return transformed;
  }

  // C2-D129 — trimmed grid fetch (Phase 1's GET /thesis/grid, C2-D128). Same
  // key-guard/fetch/error-handling/publish/dispatch shape as loadThesis()
  // above, deliberately — this is a second, independent data source
  // (F.thesisGrid), not a replacement for F.thesis. ThesisEditor2 (drawer2.jsx)
  // and UnifiedThesisProposalCard2 (agent2.jsx) keep reading F.thesis/loadThesis
  // exactly as before; only positions2.jsx's compact card reads this one.
  // Output shape matches loadThesis()'s per-ticker fields (ticker/name/argument/
  // conviction/stance/target/indicators) so ThesisCard2 doesn't need a second
  // rendering convention depending on data source — plus indicatorCount, which
  // loadThesis() has no equivalent for (the full array's own .length serves
  // that purpose there).
  async function loadThesisGrid() {
    const F = (window.FINCR = window.FINCR || {});
    const key = localStorage.getItem('fincr-api-key') || '';
    if (!key) { F.thesisGrid = []; return []; }

    let data;
    try {
      const r = await fetch(THESIS_API_BASE + '/thesis/grid', { headers: { 'X-API-Key': key } });
      if (!r.ok) { console.warn('[thesis] GET /thesis/grid HTTP ' + r.status); F.thesisGrid = []; return []; }
      data = await r.json();
    } catch (e) {
      console.warn('[thesis] GET /thesis/grid failed:', e.message);
      F.thesisGrid = []; return [];
    }

    const holdings = (data && data.holdings) || {};
    const transformed = Object.entries(holdings).map(function (entry) {
      const ticker = entry[0];
      const h = entry[1];
      return {
        ticker: ticker,
        name: h.company,
        argument: h.core_argument,
        conviction: titleCase(h.conviction),
        stance: titleCase(h.stance),
        target: (h.target_price != null) ? '€' + Number(h.target_price).toLocaleString() : null,
        indicators: h.thesis_indicators || [],   // already capped to 2 server-side
        indicatorCount: h.indicator_count || 0,
        // Positions Triage build — raw ISO string or null (never written
        // through /thesis/update yet). Passed through as-is, not parsed to
        // millis here — positions2.jsx's oldest-reviewed panel does that
        // itself right before handing off to f2FormatRelativeTime, same
        // "raw backend field, parse at the point of use" posture as every
        // other pass-through field in this transform.
        lastReviewedAt: h.last_reviewed_at || null,
      };
    });

    F.thesisGrid = transformed;
    window.dispatchEvent(new CustomEvent('fincr:thesis-grid-update'));
    return transformed;
  }

  // C2-D129 — full per-holding thesis fetch (Phase 1's GET /thesis/<ticker>/full,
  // C2-D128), called on overlay open. Deliberately NOT published to a window.FINCR
  // field or dispatched as an event — this is fetched fresh per open and held in
  // the overlay component's own local state, not shared app state, since only one
  // overlay is ever open at a time and nothing else in the app reads it. Returns
  // the raw parsed response ({status, ticker, company, ..., full_thesis,
  // thesis_indicators, decision_rules, stats, ...}) on success, or null on any
  // failure (no key / non-200 / network error) — never throws. Caller renders its
  // own retry affordance on null, per the overlay's own loading/error states.
  async function loadThesisFull(ticker) {
    const key = localStorage.getItem('fincr-api-key') || '';
    if (!key) { console.warn('[thesis] loadThesisFull: no api key'); return null; }
    try {
      const r = await fetch(THESIS_API_BASE + '/thesis/' + encodeURIComponent(ticker) + '/full', { headers: { 'X-API-Key': key } });
      if (!r.ok) { console.warn('[thesis] GET /thesis/' + ticker + '/full HTTP ' + r.status); return null; }
      return await r.json();
    } catch (e) {
      console.warn('[thesis] GET /thesis/' + ticker + '/full failed:', e.message);
      return null;
    }
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

  // C2-D130 — conflict-aware variant of saveThesis, used ONLY by the overlay's
  // editing flow (ThesisOverlay2). saveThesis's existing boolean-returning
  // contract is deliberately left untouched — ThesisEditor2 and
  // UnifiedThesisProposalCard2 both check `if (!ok)`, and changing that
  // return shape to an object (even one with an `ok` key) would make those
  // truthy-checks silently wrong (`{ok:false}` is truthy). A new function
  // avoids retrofitting a risk onto two already-shipped writers for a
  // capability only the newest one needs.
  //
  // `expectedVersion`, if non-null, is sent as `thesis_version` — the
  // control field the C2-D130 compare-and-swap check in /thesis/update reads
  // (never written onto the entry itself, never in UPDATABLE). Returns
  // { ok: boolean, conflict: boolean, liveVersion?: number }:
  //   - { ok: true } on 200.
  //   - { ok: false, conflict: true, liveVersion } on 409 — the server's
  //     current version is included so the caller can decide how to reload.
  //   - { ok: false, conflict: false } on any other failure (network, 4xx/5xx
  //     other than 409, no key) — same "never throws" posture as saveThesis.
  async function saveThesisVersioned(ticker, changes, expectedVersion, conversationSummary) {
    const key = localStorage.getItem('fincr-api-key') || '';
    if (!key) { console.warn('[thesis] saveThesisVersioned: no api key — skipped'); return { ok: false, conflict: false }; }
    const payload = Object.assign({ ticker: ticker }, changes || {});
    if (expectedVersion != null) payload.thesis_version = expectedVersion;
    if (conversationSummary != null) payload.conversation_summary = conversationSummary;
    try {
      const r = await fetch(THESIS_API_BASE + '/thesis/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify(payload),
      });
      if (r.status === 409) {
        let d = null;
        try { d = await r.json(); } catch (e) { /* malformed conflict body — still a conflict */ }
        return { ok: false, conflict: true, liveVersion: d && d.thesis_version };
      }
      if (!r.ok) {
        const txt = await r.text();
        console.warn('[thesis] POST /thesis/update HTTP ' + r.status + ':', txt.slice(0, 200));
        return { ok: false, conflict: false };
      }
      return { ok: true, conflict: false };
    } catch (e) {
      console.warn('[thesis] POST /thesis/update (versioned) failed:', e.message);
      return { ok: false, conflict: false };
    }
  }

  // C2-D155 — saveDecisionRules: a PARALLEL save action, not a variant of
  // saveThesis/saveThesisVersioned. decision_rules has no ticker, so it can't
  // route through /thesis/update at all (that endpoint requires one at every
  // step — confirmed by the Researcher pass, not assumed) — this calls the
  // new C2-D154 POST /thesis/decision-rules/update directly. Reads
  // F.thesisVersion itself (rather than taking it as a caller-supplied
  // argument) since that endpoint's compare-and-swap is REQUIRED, not
  // optional like /thesis/update's — every caller of this function always
  // needs a fresh version, so there is no case where omitting it is valid.
  // Same conflict-aware contract as saveThesisVersioned, never throws:
  //   { ok: true } on 200.
  //   { ok: false, conflict: true, liveVersion } on 409.
  //   { ok: false, conflict: false } on any other failure.
  // Deliberately does NOT optimistically mutate F.decisionRules itself —
  // matches UnifiedThesisProposalCard2's own handleCommit convention
  // (agent2.jsx), which calls window.loadThesis() after a successful save
  // rather than hand-patching local state; the caller (DecisionRulesProposalCard2)
  // does the same.
  async function saveDecisionRules(section, itemKey, newValue, reasoning) {
    const key = localStorage.getItem('fincr-api-key') || '';
    if (!key) { console.warn('[thesis] saveDecisionRules: no api key — skipped'); return { ok: false, conflict: false }; }
    const payload = { section: section, new_value: newValue, thesis_version: F.thesisVersion, reasoning: reasoning };
    if (itemKey != null) payload.item_key = itemKey;
    try {
      const r = await fetch(THESIS_API_BASE + '/thesis/decision-rules/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify(payload),
      });
      if (r.status === 409) {
        let d = null;
        try { d = await r.json(); } catch (e) { /* malformed conflict body — still a conflict */ }
        return { ok: false, conflict: true, liveVersion: d && d.thesis_version };
      }
      if (!r.ok) {
        const txt = await r.text();
        console.warn('[thesis] POST /thesis/decision-rules/update HTTP ' + r.status + ':', txt.slice(0, 200));
        return { ok: false, conflict: false };
      }
      return { ok: true, conflict: false };
    } catch (e) {
      console.warn('[thesis] POST /thesis/decision-rules/update failed:', e.message);
      return { ok: false, conflict: false };
    }
  }

  // C2-D159 — createWatchlistEntry / archiveWatchlistEntry: watchlist's own
  // save actions, parallel to saveDecisionRules (C2-D155) for the same
  // reason — neither create nor archive can route through /thesis/update
  // (create because the ticker doesn't exist yet to resolve; archive because
  // it's a section move, not a field edit), so both call the new C2-D158
  // POST /thesis/watchlist/manage directly via one shared helper.
  // Deliberately declares its own local `const F` (unlike saveThesis/
  // saveThesisVersioned/saveDecisionRules above, which read a bare `F` that
  // only resolves via other scripts' global leakage in this classic-script
  // setup) — matching loadThesis/loadThesisGrid/addPoolEvent's safer,
  // self-contained pattern instead, since this is new code with no reason to
  // inherit that fragility.
  // Same conflict-aware, never-throws contract as saveThesisVersioned/
  // saveDecisionRules:
  //   { ok: true } on 200.
  //   { ok: false, conflict: true, liveVersion } on 409.
  //   { ok: false, conflict: false } on any other failure.
  // Both read F.thesisVersion themselves (same reasoning as saveDecisionRules
  // — this endpoint's compare-and-swap is required, not optional, so there is
  // no caller that would ever need to supply a different version). Neither
  // optimistically mutates F.watchlist — same window.loadThesis() refresh
  // convention as saveDecisionRules/UnifiedThesisProposalCard2; the caller
  // (positions2.jsx's Watchlist section) does that after checking `ok`.
  async function watchlistManage(body) {
    const F = (window.FINCR = window.FINCR || {});
    const key = localStorage.getItem('fincr-api-key') || '';
    if (!key) { console.warn('[thesis] watchlistManage: no api key — skipped'); return { ok: false, conflict: false }; }
    const payload = Object.assign({}, body, { thesis_version: F.thesisVersion });
    try {
      const r = await fetch(THESIS_API_BASE + '/thesis/watchlist/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify(payload),
      });
      if (r.status === 409) {
        let d = null;
        try { d = await r.json(); } catch (e) { /* malformed conflict body — still a conflict */ }
        return { ok: false, conflict: true, liveVersion: d && d.thesis_version };
      }
      if (!r.ok) {
        const txt = await r.text();
        console.warn('[thesis] POST /thesis/watchlist/manage HTTP ' + r.status + ':', txt.slice(0, 200));
        return { ok: false, conflict: false };
      }
      return { ok: true, conflict: false };
    } catch (e) {
      console.warn('[thesis] POST /thesis/watchlist/manage failed:', e.message);
      return { ok: false, conflict: false };
    }
  }

  function createWatchlistEntry(fields) {
    return watchlistManage(Object.assign({ action: 'create' }, fields));
  }

  function archiveWatchlistEntry(ticker) {
    return watchlistManage({ action: 'archive', ticker: ticker });
  }

  // POST /pool/event ([C2-D100]) — append a deposit/withdrawal to the lifetime pool
  // ledger. Optimistic: append a provisional event to F.pool.events, recompute
  // F.poolNetCapitalDeposited, and dispatch fincr:thesis-update so BOTH derived figures
  // (net capital via f2ComputePoolNetCapital, idle cash via f2ComputeIdleCash in
  // store2.jsx) move instantly with no new derivation logic. Then POST and reconcile
  // with the server's canonical event (real id) via loadThesis. On failure, roll the
  // optimistic append back. Returns true on 200, false otherwise (never throws).
  async function addPoolEvent(amount_eur, direction, date, note) {
    const key = localStorage.getItem('fincr-api-key') || '';
    if (!key) { console.warn('[pool] addPoolEvent: no api key — skipped'); return false; }
    const F = (window.FINCR = window.FINCR || {});
    const provisional = {
      id: 'pending_' + Date.now(),
      date: date,
      type: direction === 'in' ? 'deposit' : 'withdrawal',
      direction: direction,
      amount_eur: +amount_eur,
      note: note || '',
      _pending: true,
    };
    const hadPool = !!(F.pool && Array.isArray(F.pool.events));
    function rollback() {
      if (!hadPool) return;
      F.pool.events = F.pool.events.filter(function (ev) { return ev.id !== provisional.id; });
      F.poolNetCapitalDeposited = f2ComputePoolNetCapital(F.pool.events);
      window.dispatchEvent(new CustomEvent('fincr:thesis-update'));
    }
    if (hadPool) {
      F.pool.events = F.pool.events.concat([provisional]);
      F.poolNetCapitalDeposited = f2ComputePoolNetCapital(F.pool.events);
      window.dispatchEvent(new CustomEvent('fincr:thesis-update')); // both figures update now
    }
    try {
      const r = await fetch(THESIS_API_BASE + '/pool/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify({ amount_eur: +amount_eur, direction: direction, date: date, note: note || '' }),
      });
      if (!r.ok) {
        const txt = await r.text();
        console.warn('[pool] POST /pool/event HTTP ' + r.status + ':', txt.slice(0, 200));
        rollback();
        return false;
      }
      if (window.loadThesis) await window.loadThesis(); // canonical: provisional -> real event id
      return true;
    } catch (e) {
      console.warn('[pool] POST /pool/event failed:', e.message);
      rollback();
      return false;
    }
  }

  // Expose as globals for the text/babel store + drawer to call (Step 2 / C2-S3).
  window.loadThesis = loadThesis;
  window.saveThesis = saveThesis;
  window.addPoolEvent = addPoolEvent;
  window.loadThesisGrid = loadThesisGrid;
  window.loadThesisFull = loadThesisFull;
  window.saveThesisVersioned = saveThesisVersioned;
  window.saveDecisionRules = saveDecisionRules; // C2-D155
  window.createWatchlistEntry = createWatchlistEntry; // C2-D159
  window.archiveWatchlistEntry = archiveWatchlistEntry; // C2-D159
  // Exposed for reuse/testing (parity with window.f2ParseTranches); store2.jsx reads
  // the already-computed F.poolNetCapitalDeposited, not this function directly.
  window.f2ComputePoolNetCapital = f2ComputePoolNetCapital;
})();
