/* Fincr 2.0 — Liquidity card (C2-S5/C2-D65; retired to read-only in C2-D98).
   Displays DERIVED idle cash (F.liquidityEur — computed in store2.jsx by
   f2ComputeIdleCash: the pool.cash seed + forward-dated deposits/withdrawals/trades)
   and the gap vs the dip_readiness cash target. The manual entry form and its
   POST /liquidity/update writer (saveLiquidity) were removed in C2-D98 — idle cash is
   derived now, no longer typed. The /liquidity/update endpoint stays live but has no
   caller. The gap/color logic is UNCHANGED from C2-D65 — only the `total` source moved
   from the manual plug to the derived figure.
   Reads:  F.liquidityEur   (derived idle cash — store2.jsx totals)
           F.totalValue      (store2.jsx derived totals — the cash-target basis)
           F.cashTargetPct   (dip_readiness.cash_target.target_pct, via thesis-adapter.js) */

// ── LiquidityCard2 ────────────────────────────────────────────────────────────
function LiquidityCard2() {
  var t = useTheme2();
  var F = window.FINCR;

  // Derived idle cash (C2-D98) — replaces the retired manual F.liquidity.total_eur plug.
  // null-safe: a pre-seed / no-key device renders 0.
  var total = Number(F.liquidityEur) || 0;

  // Cash target: F.cashTargetPct (dip_readiness.cash_target.target_pct via
  // thesis-adapter.js). Hide the TARGET row when absent. Logic UNCHANGED (C2-D65).
  var cashTargetPct = (F.cashTargetPct != null && F.totalValue > 0)
    ? Number(F.cashTargetPct) : null;
  var target_eur = (cashTargetPct != null && F.totalValue > 0)
    ? (F.totalValue * cashTargetPct / 100) : null;

  // Gap and color (only shown when target_eur is computable).
  var gap_eur = target_eur != null ? (target_eur - total) : null;
  var gap_pct = (gap_eur != null && target_eur > 0)
    ? Math.abs(gap_eur / target_eur * 100) : null;

  // green = at/above target · amber = short by ≤25% · red = short by >25%
  var gapColor = (target_eur == null) ? t.dim
    : total >= target_eur ? t.green
    : (target_eur - total) <= 0.25 * target_eur ? t.amber
    : t.red;
  var gapLabel = (gap_eur == null) ? null
    : total >= target_eur
      ? Math.abs(gap_pct).toFixed(0) + '% over'
      : gap_pct.toFixed(0) + '% short';

  var eur = function(n) { return '€' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); };

  return (
    <Card2 pad="18px 20px 16px">
      <SecHead n="05">Liquidity</SecHead>

      {/* Large derived idle-cash balance */}
      <div style={{ margin: '12px 0 14px' }}>
        <Money size={36} weight={500} style={{ letterSpacing: '-0.03em', lineHeight: 1, display: 'block' }}>
          {eur(total)}
        </Money>
        <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.1em', marginTop: 5 }}>
          AVAILABLE CAPITAL
        </MonoTxt>
      </div>

      {/* TARGET row — hidden when cashTargetPct or totalValue is unavailable */}
      {target_eur != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
            <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>TARGET</MonoTxt>
            <MonoTxt size={10.5} color={t.dim}>{cashTargetPct}% · {eur(target_eur)}</MonoTxt>
          </div>
          <span style={{ fontFamily: t.mono, fontSize: 11, fontWeight: 600, color: gapColor }}>
            {gapLabel}
          </span>
        </div>
      )}

      {/* Provenance: derived from flow, not manually typed (C2-D98) */}
      <MonoTxt size={10} color={t.ghost} style={{ marginTop: 4 }}>
        Derived from deposits + trades
      </MonoTxt>
    </Card2>
  );
}

window.LiquidityCard2 = LiquidityCard2;
