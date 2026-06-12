/* Fincr 2.0 — Closed positions / History. The realized track record: every
   position you've fully exited, with sell price, holding period and realized
   P&L, plus a realized total. Rendered as a section inside Positions.
   Exports window.ClosedPositions2. */

function daysBetween(a, b) {
  const d1 = new Date(a), d2 = new Date(b);
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86400e3);
}
function humanSpan(days) {
  if (days == null) return '—';
  if (days < 31) return days + 'd';
  if (days < 365) return Math.round(days / 30) + 'mo';
  return (days / 365).toFixed(1) + 'y';
}

function ClosedPositions2() {
  const t = useTheme2();
  const F = window.FINCR;
  const closed = F.closed || [];
  const realizedTotal = closed.reduce((s, c) => s + c.realized, 0);
  const wins = closed.filter((c) => c.realized >= 0).length;

  if (!closed.length) {
    return (
      <section>
        <SecHead n="04">Closed positions</SecHead>
        <div style={{ marginTop: 14, padding: '26px 22px', border: `1px dashed ${t.hairStrong}`, borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: t.faint, lineHeight: 1.5 }}>Nothing closed yet. When you fully exit a position it lands here with its realized P&L.</div>
        </div>
      </section>
    );
  }

  const cols = '1.5fr 0.9fr 0.9fr 0.8fr 1fr';
  return (
    <section>
      <SecHead n="04" right={<MonoTxt size={10.5} color={t.faint}>{closed.length} CLOSED · {wins}/{closed.length} GREEN</MonoTxt>}>Closed positions</SecHead>
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '10px 8px' }}>
          {['Asset', 'Avg cost', 'Sold at', 'Held', 'Realized'].map((c, i) => (
            <span key={c} style={{ fontFamily: t.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.faint, textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
          ))}
        </div>
        {closed.map((c, idx) => {
          const up = c.realized >= 0;
          const days = daysBetween(c.openedAt, c.closedAt);
          const pct = c.avgCost > 0 ? (c.sellPrice - c.avgCost) / c.avgCost * 100 : 0;
          return (
            <div key={c.ticker + idx} className="f2-row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: `${t.rowPadY}px 8px`, alignItems: 'center', borderTop: `1px solid ${t.hair}`, borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ width: 3, height: 26, borderRadius: 2, background: c.color, flexShrink: 0, opacity: 0.65 }}></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, lineHeight: 1.2 }}>{c.ticker}</div>
                  <MonoTxt size={10} color={t.faint}>{c.closedAt}</MonoTxt>
                </div>
              </div>
              <Money size={12.5} color={t.dim} style={{ textAlign: 'right' }}>{F.eur(c.avgCost, 2)}</Money>
              <Money size={12.5} style={{ textAlign: 'right' }}>{F.eur(c.sellPrice, 2)}</Money>
              <MonoTxt size={11} color={t.faint} style={{ textAlign: 'right' }}>{humanSpan(days)}</MonoTxt>
              <span style={{ textAlign: 'right' }}>
                <Money size={12.5} weight={600} color={up ? t.green : t.red} style={{ display: 'block' }}>{F.signed(c.realized)}</Money>
                <span style={{ display: 'inline-flex', justifyContent: 'flex-end', width: '100%' }}><Delta2 pct={pct} size={10.5} /></span>
              </span>
            </div>
          );
        })}
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '12px 8px', alignItems: 'baseline', borderTop: `1px solid ${t.hairStrong}`, borderBottom: `3px double ${t.hairStrong}` }}>
          <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.14em' }}>REALIZED TOTAL</MonoTxt>
          <span></span><span></span><span></span>
          <Money size={13} weight={700} color={realizedTotal >= 0 ? t.green : t.red} style={{ textAlign: 'right' }}>{F.signed(realizedTotal)}</Money>
        </div>
      </div>
    </section>
  );
}
window.ClosedPositions2 = ClosedPositions2;
