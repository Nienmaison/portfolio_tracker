/* Fincr 2.0 — Agent: conversations rail + thread. The agent answers with the
   user's thesis, rules and cost basis in context. */

function AgentActionCard2({ card }) {
  const t = useTheme2();
  return (
    <div style={{ background: t.raise, border: `1px solid ${t.hair}`, borderRadius: 12, overflow: 'hidden', maxWidth: 460 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: `1px solid ${t.hair}` }}>
        <span style={{ fontFamily: t.mono, fontSize: 11, fontWeight: 600, color: t.ink }}>{card.ticker}</span>
        <span style={{ flex: 1 }}></span>
        <Chip2 tone="watch">Suggested action</Chip2>
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: t.ink }}>{card.value}</div>
        <div style={{ fontSize: 12.5, color: t.dim, lineHeight: 1.55 }}>{card.argument}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', borderTop: `1px solid ${t.hair}`, paddingTop: 10 }}>
          <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.ghost, flexShrink: 0 }}>WHY</span>
          <span style={{ fontSize: 12, color: t.dim }}>{card.summary}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px' }}>
        <Btn2 primary style={{ fontSize: 12 }}>Log decision</Btn2>
        <Btn2 style={{ fontSize: 12 }}>Dismiss</Btn2>
      </div>
    </div>);

}

function AgentTab2() {
  const t = useTheme2();
  const F = window.FINCR;
  const [active, setActive] = React.useState(1);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '252px minmax(0,1fr)', gap: 0, border: `1px solid ${t.cardBorder}`, borderRadius: 16, overflow: 'hidden', background: t.card, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, boxShadow: t.cardShadow, minHeight: 560 }}>
      {/* conversations */}
      <div style={{ borderRight: `1px solid ${t.hair}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.16em' }}>THREADS</MonoTxt>
          <button className="f2-press" title="New thread" style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${t.hair}`, background: 'none', color: t.dim, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>+</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
          {F.conversations.map((c) => {
            const on = c.id === active;
            return (
              <button key={c.id} onClick={() => setActive(c.id)} className="f2-press" style={{ textAlign: 'left', fontFamily: t.sans, border: 'none', cursor: 'pointer', padding: '9px 10px', borderRadius: 8, background: on ? t.press : 'transparent' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: on ? t.ink : t.dim, lineHeight: 1.35 }}>{c.title}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                  <MonoTxt size={9.5} color={t.faint}>{c.when.toUpperCase()}</MonoTxt>
                  {c.tickers.map((tk) => <span key={tk} style={{ fontFamily: t.mono, fontSize: 9, color: t.faint, border: `1px solid ${t.hair}`, borderRadius: 3, padding: '1px 4px' }}>{tk}</span>)}
                </div>
              </button>);

          })}
        </div>
      </div>

      {/* thread */}
      <div style={{ display: 'flex', flexDirection: 'column', background: t.dark ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.38)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 22px', borderBottom: `1px solid ${t.hair}` }}>
          <LiveDot2 color={t.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>Is my crypto allocation too high?</span>
          <span style={{ flex: 1 }}></span>
          <MonoTxt size={10} color={t.faint}>CONTEXT: BOOK · THESIS · RULES</MonoTxt>
        </div>
        <div style={{ flex: 1, padding: '22px 22px 8px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {F.chatThread.map((m, i) => m.who === 'user' ?
          <div key={i} style={{ alignSelf: 'flex-end', maxWidth: 420, background: t.press, border: `1px solid ${t.hair}`, borderRadius: '12px 12px 3px 12px', padding: '10px 14px', fontSize: 13, color: t.ink, lineHeight: 1.5 }}>{m.text}</div> :
          m.card ?
          <AgentActionCard2 key={i} card={m.card} /> :

          <div key={i} style={{ alignSelf: 'flex-start', maxWidth: 520, fontSize: 13, color: t.ink, lineHeight: 1.62, whiteSpace: 'pre-line' }}>
              <MonoTxt size={9.5} color={t.faint} style={{ display: 'block', letterSpacing: '0.16em', marginBottom: 6 }}>FINCR</MonoTxt>
              {m.text}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 22px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 10, padding: '4px 6px 4px 14px' }}>
            <input placeholder="Ask about your portfolio…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: t.sans, fontSize: 13, color: t.ink, padding: '8px 0' }} />
            <Btn2 primary style={{ fontSize: 12, padding: '7px 14px' }}>Send</Btn2>
          </div>
          <div style={{ fontSize: 10.5, color: t.ghost, marginTop: 7, fontFamily: t.mono }}>Answers are grounded in your book — not advice.</div>
        </div>
      </div>
    </div>);

}
window.AgentTab2 = AgentTab2;