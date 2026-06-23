/* Fincr 2.0 — Positions: thesis per holding, watchlist, desk rules.
   The "why I own it" layer that sits under the overview ledger. */

function ThesisCard2({ th, highlight }) {
  const t = useTheme2();
  const F = window.FINCR;
  const h = F.holdings.find((x) => x.ticker === th.ticker);
  const stanceTone = th.stance === 'Accumulate' ? 'accent' : th.stance === 'Trim' ? 'watch' : 'mute';
  return (
    <div style={{ background: t.card, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, boxShadow: t.cardShadow, border: `1px solid ${highlight === th.ticker ? t.accent : t.cardBorder}`, borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 13, transition: 'border-color 0.4s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {h && <span style={{ width: 3, height: 24, borderRadius: 2, background: h.color }}></span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: t.ink, lineHeight: 1.15 }}>{th.ticker}</div>
          <div style={{ fontSize: 11.5, color: t.faint }}>{th.name}</div>
        </div>
        <Chip2 tone={stanceTone}>{th.stance}</Chip2>
        <Chip2 tone={th.conviction === 'High' ? 'ok' : 'mute'}>{th.conviction}</Chip2>
      </div>
      <div style={{ fontSize: 12.5, color: t.dim, lineHeight: 1.55 }}>{th.argument}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Renamed from T1/T2 — these are exit conditions, not targets (C2-S3) */}
        {th.triggers && th.triggers.length > 0 && (
          <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.12em', padding: '2px 0 1px' }}>THESIS RISKS</MonoTxt>
        )}
        {th.triggers.map((tr, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '7px 0', borderTop: `1px solid ${t.hair}` }}>
            <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.ghost, flexShrink: 0 }}>·</span>
            <span style={{ fontSize: 12, color: t.ink }}>{tr}</span>
          </div>
        ))}
      </div>
      {/* Only render TARGET when a price target has been set (null until set via editor, C2-S3) */}
      {th.target && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${t.hair}`, paddingTop: 10 }}>
        <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.12em' }}>TARGET</MonoTxt>
        <Money size={12.5} weight={600}>{th.target}</Money>
      </div>
      )}
    </div>
  );
}

function PositionsTab2({ highlight }) {
  const t = useTheme2();
  const F = window.FINCR;
  // C2-S2: a holding's thesis is "written" only if its argument exists AND is not
  // the scaffold sentinel (the auto-stub written by sync_thesis_with_holdings,
  // api.py). The sentinel must match api.py exactly (em-dash, not a hyphen).
  const THESIS_SENTINEL = "Position opened via dashboard — thesis details pending.";
  const isWritten = (th) => th && th.argument && th.argument !== THESIS_SENTINEL;
  // Count live holdings with a real authored argument; the rest are MISSING.
  const written = F.holdings.filter((h) =>
    F.thesis.some((x) => x.ticker === h.ticker && isWritten(x))
  ).length;
  const missing = Math.max(0, F.holdings.length - written);
  // Authored theses render as cards; stubs/unwritten fall through to gap cards.
  const authored = F.thesis.filter(isWritten);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <section>
        <SecHead n="01" right={<MonoTxt size={10.5} color={t.faint}>{written} WRITTEN · {missing} MISSING</MonoTxt>}>Thesis on record</SecHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginTop: 16 }}>
          {authored.map((th) => <ThesisCard2 key={th.ticker} th={th} highlight={highlight} />)}
          {/* positions without a written thesis — honest gap, not filler */}
          {F.holdings.filter((h) => !F.thesis.some((x) => x.ticker === h.ticker && isWritten(x))).map((h) => (
            <div key={h.ticker} style={{ border: `1px dashed ${t.hairStrong}`, borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 3, height: 24, borderRadius: 2, background: h.color }}></span>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: t.ink }}>{h.ticker}</div>
                  <div style={{ fontSize: 11.5, color: t.faint }}>{h.name}</div>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: t.faint, lineHeight: 1.5 }}>No thesis on record. You hold <Money size={12} color={t.dim}>{F.eur(h.value)}</Money> without a written reason.</div>
              <button className="f2-press" style={{ alignSelf: 'flex-start', fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Write one with the agent →</button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SecHead n="02">Watchlist</SecHead>
        <div style={{ marginTop: 8 }}>
          {F.watchlist.map((w) => (
            <div key={w.ticker} className="f2-row" style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 16, alignItems: 'center', padding: `${t.rowPadY + 2}px 8px`, borderTop: `1px solid ${t.hair}`, borderRadius: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{w.ticker}</div>
                <div style={{ fontSize: 11, color: t.faint }}>{w.name}</div>
              </div>
              <div style={{ fontSize: 12.5, color: t.dim, lineHeight: 1.5 }}>{w.note}</div>
              <Chip2 tone={w.conviction === 'Medium' ? 'accent' : 'mute'}>{w.conviction}</Chip2>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${t.hair}` }}></div>
        </div>
      </section>

      <section>
        <SecHead n="03">Decision rules</SecHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
          {F.rules.map((r) => (
            <div key={r.title} style={{ background: t.card, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, boxShadow: t.cardShadow, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: '16px 20px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginBottom: 6 }}>{r.title}</div>
              {r.lines.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'baseline', padding: '6px 0', borderTop: i ? `1px solid ${t.hair}` : 'none' }}>
                  <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.ghost }}>R{i + 1}</span>
                  <span style={{ fontSize: 12.5, color: t.dim }}>{l}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <ClosedPositions2 />
    </div>
  );
}
window.PositionsTab2 = PositionsTab2;
