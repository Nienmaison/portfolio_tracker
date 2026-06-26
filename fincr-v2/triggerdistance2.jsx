/* Fincr 2.0 — Trigger Distance card (C2-S9 / C2-S9b, decisions C2-D72 / C2-D74).
   Replaces the old sample-data card with a live, thesis-driven discipline alert.
   Reads:
     window.FINCR.decisionRules.tranche_selling — the rule structure (set by
       thesis-adapter.js loadThesis; F.thesis is the holdings ARRAY, so the rule
       cannot be read from it — it is exposed separately as F.decisionRules).
     useStore2().holdings — live holdings with price + avgCost + tranches_executed.
   Writes: none. Tranche execution flows through the partial-sell form (AddTxnForm2
     in drawer2.jsx), which reuses f2TrancheInRegion() below.

   C2-S9b — midpoint-aware skip: a tranche passed by more than the midpoint to the
   next tranche, without being executed, is treated as implicitly SKIPPED. The card
   then surfaces the next relevant level instead of a long-passed one (e.g. MRVL at
   +233% shows the +200% trailing stop, not "sell 15%" at +50%). Skip is DERIVED from
   current gain% — not persisted, not peak-anchored (a retrace below a midpoint un-skips
   that tranche). Only tranches_executed is stored.

   Globals exported for drawer2.jsx + store2.jsx (loaded around this file, same scope):
     f2ParseTranches(rule)               — parse the rule object to a tranches array
     f2TrancheInRegion(h, tranches, q)   — tranche level a partial sell is executing, or null
     f2ComputeSkipped(gain, tr, exec)    — tranche levels passed by >midpoint without execution (C2-S9b)
     f2NextActiveTranche(gain, tr, exec) — first tranche neither executed nor skipped (C2-S9b) */

// Parse the tranche_selling rule object into a sorted tranches array.
// Keys look like "50_pct" / "200_pct_plus". The 25% "hold" tranche is skipped
// (not an action). The 200%+ tier is kept and flagged trailingStop. Returns null
// if the rule is absent/malformed (card then shows the "not configured" state).
function f2ParseTranches(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const tranches = [];
  Object.keys(rule).forEach((key) => {
    const action = rule[key];
    const m = key.match(/^(\d+)_pct(_plus)?$/);
    if (!m) return;
    const level = parseInt(m[1], 10);
    const trailingStop = !!m[2];
    // Skip the sub-200 "hold" tranche (e.g. 25_pct: "hold — noise") — not an action.
    if (typeof action === 'string' && action.toLowerCase().indexOf('hold') !== -1 && level < 200) return;
    tranches.push({ level: level, action: action, trailingStop: trailingStop });
  });
  if (!tranches.length) return null;
  return tranches.sort((a, b) => a.level - b.level);
}

// C2-S9b — which tranches are implicitly SKIPPED at the current gain%. A tranche L
// is skipped when gain% has passed the midpoint between L and the next tranche N
// (midpoint = (L + N) / 2) and L is not in tranches_executed. Past the midpoint the
// price is closer to N than to L, so L's trim window has effectively gone by. The
// last tranche (200%+ trailing stop) has no next level, so it can never be skipped.
// Returns an array of skipped levels. `tranches` must be sorted ascending (f2ParseTranches does this).
function f2ComputeSkipped(gainPct, tranches, executed) {
  const skipped = [];
  if (!tranches || !isFinite(gainPct)) return skipped;
  const ex = executed || [];
  for (let i = 0; i < tranches.length - 1; i++) {
    const t = tranches[i];
    if (ex.indexOf(t.level) !== -1) continue;             // executed, not skipped
    const midpoint = (t.level + tranches[i + 1].level) / 2;
    if (gainPct >= midpoint) skipped.push(t.level);
  }
  return skipped;
}

// C2-S9b — the next "active" tranche: the first (ascending) that is neither executed
// nor skipped. Skipped tranches are treated like executed ones when picking what to
// surface. Returns the tranche object, or null if every tranche is executed/skipped.
function f2NextActiveTranche(gainPct, tranches, executed) {
  if (!tranches) return null;
  const ex = executed || [];
  for (let i = 0; i < tranches.length; i++) {
    const t = tranches[i];
    if (ex.indexOf(t.level) !== -1) continue;             // already executed
    // Skip check only applies when there is a next tranche (last tier can't be skipped).
    if (i < tranches.length - 1) {
      const midpoint = (t.level + tranches[i + 1].level) / 2;
      if (isFinite(gainPct) && gainPct >= midpoint) continue; // skipped
    }
    return t;
  }
  return null;
}

// For one holding: { eligible, gainPct, nextTranche, isPastTrigger, distancePp, skipped }
// or { eligible: false }. Eligible when gain>0 AND the next ACTIVE tranche (neither
// executed nor skipped, C2-S9b) is within 15pp of current gain, OR has been passed
// without execution. `skipped` is the list of levels the price blew past (for display).
function f2EvaluateHolding(h, tranches) {
  if (!h || !h.qty || h.qty === 0) return { eligible: false };
  const gainPct = ((h.price - h.avgCost) / h.avgCost) * 100;
  if (!isFinite(gainPct) || gainPct <= 0) return { eligible: false };
  const executed = h.tranches_executed || [];
  const nextTranche = f2NextActiveTranche(gainPct, tranches, executed); // C2-S9b: skip-aware
  if (!nextTranche) return { eligible: false };           // all tranches executed or skipped
  const skipped = f2ComputeSkipped(gainPct, tranches, executed);
  const distancePp = nextTranche.level - gainPct;
  const isPastTrigger = distancePp <= 0;
  if (isPastTrigger || distancePp <= 15) {
    return { eligible: true, gainPct: gainPct, nextTranche: nextTranche, isPastTrigger: isPastTrigger, distancePp: distancePp, skipped: skipped };
  }
  return { eligible: false };
}

// The tranche level a PARTIAL sell is executing, or null. "In region" = current
// gain% has reached the highest unactioned, UNSKIPPED, non-trailing tranche, and the
// sell is a partial (not a full close). Used by AddTxnForm2 to offer the discipline-trim Q.
// C2-S9b: skipped tranches are excluded — at +233% MRVL no longer prompts "+50% trim".
function f2TrancheInRegion(holding, tranches, sellQty) {
  if (!holding || !tranches) return null;
  if (sellQty >= holding.qty) return null;                // full sell — not a discipline trim
  const gainPct = ((holding.price - holding.avgCost) / holding.avgCost) * 100;
  if (!isFinite(gainPct)) return null;
  const executed = holding.tranches_executed || [];
  const skipped = f2ComputeSkipped(gainPct, tranches, executed); // C2-S9b
  const candidates = tranches
    .filter((t) => !t.trailingStop)                       // 200%+ is "set manually", not a discrete trim
    .filter((t) => executed.indexOf(t.level) === -1)
    .filter((t) => skipped.indexOf(t.level) === -1)       // C2-S9b: not an implicitly-skipped level
    .filter((t) => gainPct >= t.level);
  if (!candidates.length) return null;
  return Math.max.apply(null, candidates.map((t) => t.level));
}

// Shorten a verbose thesis action for the narrow card (keeps the clause before " — ").
function f2TrancheShortAction(tranche) {
  if (tranche.trailingStop) return 'Trailing stop — set manually';
  const a = String(tranche.action || '');
  const clause = a.split(' — ')[0].trim();
  return clause.charAt(0).toUpperCase() + clause.slice(1);
}

function TriggerDistanceCard2() {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const holdings = (store && store.holdings) || [];

  const rule = F.decisionRules ? F.decisionRules.tranche_selling : null;
  const tranches = f2ParseTranches(rule);

  // Rule absent/malformed — honest empty view, no fake content.
  if (!tranches) {
    return (
      <Card2 pad="18px 20px 14px">
        <SecHead n="06" style={{ marginBottom: 4 }}>Trigger distance</SecHead>
        <MonoTxt size={11} color={t.dim} style={{ display: 'block', marginTop: 8 }}>Tranche selling rule not configured.</MonoTxt>
      </Card2>
    );
  }

  // Evaluate + filter + sort (past-trigger first, then by absolute distance).
  const evals = holdings
    .map((h) => ({ h: h, e: f2EvaluateHolding(h, tranches) }))
    .filter((x) => x.e.eligible)
    .sort((a, b) => {
      if (a.e.isPastTrigger !== b.e.isPastTrigger) return a.e.isPastTrigger ? -1 : 1;
      return Math.abs(a.e.distancePp) - Math.abs(b.e.distancePp);
    });

  // Distance label + color for one eval.
  const distLabel = (e) => {
    if (e.nextTranche.trailingStop) {
      return e.isPastTrigger ? 'trailing stop active' : Math.round(e.distancePp) + 'pp to trailing stop';
    }
    return e.isPastTrigger
      ? Math.round(Math.abs(e.distancePp)) + 'pp past trigger'
      : Math.round(e.distancePp) + 'pp to trigger';
  };

  return (
    <Card2 pad="18px 20px 14px">
      <SecHead n="06" right={evals.length > 0 ? <MonoTxt size={10} color={t.faint}>{evals.length} APPROACHING</MonoTxt> : null} style={{ marginBottom: 4 }}>Trigger distance</SecHead>

      {evals.length === 0 ? (
        <MonoTxt size={11} color={t.dim} style={{ display: 'block', margin: '8px 0 6px' }}>No holdings near a trim level today.</MonoTxt>
      ) : (
        <div style={{ marginTop: 6 }}>
          {evals.map((x) => {
            const e = x.e;
            const amber = e.isPastTrigger || e.nextTranche.trailingStop;
            const gainStr = '+' + Math.round(e.gainPct) + '%';
            return (
              <div key={x.h.ticker} style={{ padding: '9px 0', borderTop: '1px solid ' + t.hair }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: t.mono, fontSize: 11.5, fontWeight: 700, color: t.ink }}>{x.h.ticker}</span>
                  <span style={{ fontFamily: t.mono, fontSize: 11.5, fontWeight: amber ? 600 : 500, color: amber ? t.amber : t.ink }}>{gainStr}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 3 }}>
                  <span style={{ fontSize: 11.5, color: t.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f2TrancheShortAction(e.nextTranche)}</span>
                  <MonoTxt size={10.5} color={amber ? t.amber : t.faint} style={{ fontWeight: amber ? 600 : 500, flexShrink: 0 }}>{distLabel(e)}</MonoTxt>
                </div>
                {e.skipped && e.skipped.length > 0 && (
                  <MonoTxt size={9} color={t.dim} style={{ display: 'block', marginTop: 2 }}>Skipped: {e.skipped.map((lvl) => '+' + lvl + '%').join(', ')}</MonoTxt>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ borderTop: '1px solid ' + t.hair, paddingTop: 10, marginTop: evals.length ? 4 : 0 }}>
        <MonoTxt size={10} color={t.faint}>TRANCHE RULE · 15PP ACTION ZONE</MonoTxt>
      </div>
    </Card2>
  );
}

window.f2ParseTranches = f2ParseTranches;
window.f2TrancheInRegion = f2TrancheInRegion;
window.f2ComputeSkipped = f2ComputeSkipped;       // C2-S9b — used by store2.jsx f2DeriveHolding
window.f2NextActiveTranche = f2NextActiveTranche; // C2-S9b
window.TriggerDistanceCard2 = TriggerDistanceCard2;
