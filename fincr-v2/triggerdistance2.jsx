/* Fincr 2.0 — Trigger Distance card (C2-S9, decision C2-D72).
   Replaces the old sample-data card with a live, thesis-driven discipline alert.
   Reads:
     window.FINCR.decisionRules.tranche_selling — the rule structure (set by
       thesis-adapter.js loadThesis; F.thesis is the holdings ARRAY, so the rule
       cannot be read from it — it is exposed separately as F.decisionRules).
     useStore2().holdings — live holdings with price + avgCost + tranches_executed.
   Writes: none. Tranche execution flows through the partial-sell form (AddTxnForm2
     in drawer2.jsx), which reuses f2TrancheInRegion() below.

   Globals exported for drawer2.jsx (loaded later, same global scope):
     f2ParseTranches(rule)              — parse the rule object to a tranches array
     f2TrancheInRegion(h, tranches, q)  — tranche level a partial sell is executing, or null */

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

// For one holding: { eligible, gainPct, nextTranche, isPastTrigger, distancePp }
// or { eligible: false }. Eligible when gain>0 AND the next unactioned tranche is
// within 15pp of current gain, OR has been passed without execution.
function f2EvaluateHolding(h, tranches) {
  if (!h || !h.qty || h.qty === 0) return { eligible: false };
  const gainPct = ((h.price - h.avgCost) / h.avgCost) * 100;
  if (!isFinite(gainPct) || gainPct <= 0) return { eligible: false };
  const executed = h.tranches_executed || [];
  const nextTranche = tranches.find((t) => executed.indexOf(t.level) === -1);
  if (!nextTranche) return { eligible: false };           // all tranches done
  const distancePp = nextTranche.level - gainPct;
  const isPastTrigger = distancePp <= 0;
  if (isPastTrigger || distancePp <= 15) {
    return { eligible: true, gainPct: gainPct, nextTranche: nextTranche, isPastTrigger: isPastTrigger, distancePp: distancePp };
  }
  return { eligible: false };
}

// The tranche level a PARTIAL sell is executing, or null. "In region" = current
// gain% has reached the highest unactioned non-trailing tranche, and the sell is a
// partial (not a full close). Used by AddTxnForm2 to offer the discipline-trim Q.
function f2TrancheInRegion(holding, tranches, sellQty) {
  if (!holding || !tranches) return null;
  if (sellQty >= holding.qty) return null;                // full sell — not a discipline trim
  const gainPct = ((holding.price - holding.avgCost) / holding.avgCost) * 100;
  if (!isFinite(gainPct)) return null;
  const executed = holding.tranches_executed || [];
  const candidates = tranches
    .filter((t) => !t.trailingStop)                       // 200%+ is "set manually", not a discrete trim
    .filter((t) => executed.indexOf(t.level) === -1)
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
window.TriggerDistanceCard2 = TriggerDistanceCard2;
