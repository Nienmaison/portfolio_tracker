/* Fincr 2.0 — ⌘K command palette. Fuzzy-ish filter, ↑↓ + Enter, Esc.
   Commands come from the shell: navigation, toggles, jump-to-ticker. */

function CmdPalette2({ open, onClose, actions }) {
  const t = useTheme2();
  const F = window.FINCR;
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef(null);

  const cmds = React.useMemo(() => {
    const nav = [
      { k: 'go-overview', label: 'Go to Overview', hint: '1', run: () => actions.go('overview') },
      { k: 'go-positions', label: 'Go to Positions', hint: '2', run: () => actions.go('positions') },
      { k: 'go-agent', label: 'Go to Agent', hint: '3', run: () => actions.go('agent') },
      { k: 'go-import', label: 'Add assets — import broker CSVs', hint: '4', run: () => actions.go('import') },
      { k: 'go-settings', label: 'Go to Settings', hint: '5', run: () => actions.go('settings') },
      { k: 'add-position', label: 'Add position — record a buy', hint: 'new', run: () => actions.addPosition && actions.addPosition() },
      { k: 'discrete', label: 'Toggle discrete mode', hint: 'blur figures', run: actions.toggleDiscrete },
      { k: 'rail', label: 'Toggle sidebar', hint: 'collapse / expand', run: actions.toggleRail },
      { k: 'theme', label: 'Switch surface — Ink / Paper', hint: 'theme', run: actions.toggleTheme },
    ];
    const ticks = F.holdings.map((h) => ({ k: 'tk-' + h.ticker, label: `${h.ticker} — ${h.name}`, hint: F.eur(h.value), money: true, run: () => (actions.openTicker || actions.focusTicker)(h.ticker) }));
    return [...nav, ...ticks];
  }, [actions]);

  const ql = q.trim().toLowerCase();
  const list = ql ? cmds.filter((c) => c.label.toLowerCase().includes(ql)) : cmds;

  React.useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);
  React.useEffect(() => { setSel(0); }, [ql]);

  if (!open) return null;
  const runSel = (i) => { const c = list[i]; if (c) { c.run(); onClose(); } };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: t.dark ? 'rgba(4,5,7,0.6)' : 'rgba(23,25,30,0.25)', display: 'flex', justifyContent: 'center', paddingTop: '14vh' }}>
      <div style={{ width: 520, alignSelf: 'flex-start', background: t.raise, border: `1px solid ${t.hairStrong}`, borderRadius: 13, overflow: 'hidden', boxShadow: t.dark ? '0 30px 80px -20px rgba(0,0,0,0.9)' : '0 30px 80px -30px rgba(23,25,30,0.5)', animation: 'fincrSlide 0.16s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${t.hair}` }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={t.faint} strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="4.5"></circle><path d="M10.5 10.5L14 14"></path></svg>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); runSel(sel); }
              else if (e.key === 'Escape') { onClose(); }
            }}
            placeholder="Jump to a position, switch view, toggle…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: t.sans, fontSize: 13.5, color: t.ink }} />
          <Kbd2>esc</Kbd2>
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
          {list.length === 0 && <div style={{ padding: '18px 14px', fontSize: 12.5, color: t.faint, fontFamily: t.mono }}>No match for “{q}”.</div>}
          {list.map((c, i) => (
            <button key={c.k} onMouseEnter={() => setSel(i)} onClick={() => runSel(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '9px 11px', borderRadius: 8,
                background: i === sel ? t.press : 'transparent', fontFamily: t.sans }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: t.ink, flex: 1 }}>{c.label}</span>
              {c.money
                ? <Money size={11} color={t.faint}>{c.hint}</Money>
                : <MonoTxt size={10} color={t.faint}>{c.hint}</MonoTxt>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '9px 16px', borderTop: `1px solid ${t.hair}` }}>
          <MonoTxt size={9.5} color={t.ghost}>↑↓ NAVIGATE</MonoTxt>
          <MonoTxt size={9.5} color={t.ghost}>⏎ RUN</MonoTxt>
        </div>
      </div>
    </div>
  );
}
window.CmdPalette2 = CmdPalette2;
