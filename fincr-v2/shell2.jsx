/* Fincr 2.0 — shell: blue glass sidebar (light blue fading to navy), slim top
   row, ⌘K palette, provenance status bar. IA: Charts live inside Overview,
   Import inside Settings ▸ Data. Keyboard: ⌘K palette, 1–4 switch views. */

const NAV2 = [
{ id: 'overview', label: 'Overview', d: 'M3 9.5L10 4l7 5.5V17a1 1 0 01-1 1h-3v-5H7v5H4a1 1 0 01-1-1z' },
{ id: 'positions', label: 'Positions', d: 'M4 5h12v4H4zM4 11h12v4H4z' },
{ id: 'agent', label: 'Agent', d: 'M10 3a4 4 0 014 4v1a4 4 0 01-8 0V7a4 4 0 014-4zM4 17a6 6 0 0112 0' },
{ id: 'import', label: 'Add assets', d: 'M10 3v9M6 8l4 4 4-4M4 16h12' }];

// Short relative-time strings for the provenance bar: "JUST NOW", "2M AGO",
// "1H AGO", "3D AGO".
function f2FormatRelativeTime(ms) {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return 'JUST NOW';
  if (sec < 60) return sec + 'S AGO';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'M AGO';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'H AGO';
  const days = Math.floor(hr / 24);
  return days + 'D AGO';
}


function Shell2() {
  const [mode, setMode] = React.useState(() => localStorage.getItem('fincr2-mode') || 'ink');
  const [density, setDensity] = React.useState(() => localStorage.getItem('fincr2-density') || 'comfortable');
  const [tab, setTab] = React.useState(() => localStorage.getItem('fincr2-tab') || 'overview');
  const [discrete, setDiscrete] = React.useState(() => localStorage.getItem('fincr2-discrete') === '1');
  const [railOpen, setRailOpen] = React.useState(() => localStorage.getItem('fincr2-rail') !== '0');
  const [palette, setPalette] = React.useState(false);
  const [highlight, setHighlight] = React.useState(null);
  const [toast, setToast] = React.useState(null);  // C2-S3 transient non-blocking notice
  const t = window.makeTheme2(mode, density);
  // Owner identity - single source, mirrors backend ACCOUNT_DEFAULT shape ({name, avatar}).
  // Fallback keeps the chip rendering even if appdata did not load. [C2-D55]
  const F = window.FINCR || {};
  const account = (F && F.account) || { name: "User", avatar: "" };
  const acctName = account.name || "User";
  const acctAvatar = account.avatar || (acctName ? acctName[0].toUpperCase() : "•");
  // Real time-of-day greeting (was hardcoded "Good evening"). Client clock.
  const hr = new Date().getHours();
  const partOfDay = hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening";

  React.useEffect(() => {localStorage.setItem('fincr2-mode', mode);}, [mode]);
  React.useEffect(() => {localStorage.setItem('fincr2-density', density);}, [density]);
  React.useEffect(() => {localStorage.setItem('fincr2-tab', tab);}, [tab]);
  React.useEffect(() => {localStorage.setItem('fincr2-discrete', discrete ? '1' : '0');}, [discrete]);
  React.useEffect(() => {localStorage.setItem('fincr2-rail', railOpen ? '1' : '0');}, [railOpen]);

  // Provenance-bar live state lives on window.FINCR (sync status, FX rate), not in
  // React state. This counter forces a re-render when those change, or when the
  // relative-time label needs refreshing ([C2-D43]).
  const [, forceRerender] = React.useState(0);
  React.useEffect(() => {
    const handler = () => forceRerender((n) => n + 1);
    window.addEventListener('fincr:sync-status-change', handler);
    window.addEventListener('fincr:fx-update', handler);
    window.addEventListener('fincr:thesis-update', handler);  // C2-S2: repaint on thesis load
    // Tick every 30s so "SYNC 5M AGO" stays fresh between syncs.
    const tick = setInterval(() => forceRerender((n) => n + 1), 30000);
    return () => {
      window.removeEventListener('fincr:sync-status-change', handler);
      window.removeEventListener('fincr:fx-update', handler);
      window.removeEventListener('fincr:thesis-update', handler);
      clearInterval(tick);
    };
  }, []);

  // C2-S3 — transient toast for non-blocking notices (e.g. a post-close thesis
  // update that failed). Fired via window CustomEvent('fincr:toast', {detail:{message}}).
  React.useEffect(() => {
    const onToast = (e) => setToast((e.detail && e.detail.message) || '');
    window.addEventListener('fincr:toast', onToast);
    return () => window.removeEventListener('fincr:toast', onToast);
  }, []);
  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);  // auto-dismiss
    return () => clearTimeout(id);
  }, [toast]);

  const actions = React.useMemo(() => ({
    go: setTab,
    toggleDiscrete: () => setDiscrete((d) => !d),
    toggleTheme: () => setMode((m) => m === 'ink' ? 'paper' : 'ink'),
    toggleRail: () => setRailOpen((r) => !r),
    addPosition: () => window.__fincrStore && window.__fincrStore.actions.openAdd(),
    openTicker: (tk) => window.__fincrStore && window.__fincrStore.actions.openDrawer(tk),
    focusTicker: (tk) => {setTab('positions');setHighlight(tk);setTimeout(() => setHighlight(null), 2600);}
  }), []);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {e.preventDefault();setPalette((p) => !p);return;}
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '1') setTab('overview');else
      if (e.key === '2') setTab('positions');else
      if (e.key === '3') setTab('agent');else
      if (e.key === '4') setTab('import');else
      if (e.key === '5') setTab('settings');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  let content;
  if (tab === 'overview') content = <OverviewTab2 go={setTab} />;else
  if (tab === 'positions') content = <PositionsTab2 highlight={highlight} />;else
  if (tab === 'agent') content = <AgentTab2 />;else
  if (tab === 'import') content = <ImportTab2 go={setTab} />;else
  content = <SettingsTab2 mode={mode} setMode={setMode} density={density} setDensity={setDensity} discrete={discrete} setDiscrete={setDiscrete} />;

  const IconBtn2 = ({ onClick, title, active, children }) =>
  <button onClick={onClick} title={title} className="f2-press" style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: active ? t.press : 'transparent', color: active ? t.ink : t.dim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.13s' }}>{children}</button>;

  const railItem = (id, label, d, anchor) => {
    const on = tab === id;
    return (
      <button key={id} onClick={() => setTab(id)} title={railOpen ? undefined : label} style={{ display: 'flex', alignItems: 'center', justifyContent: railOpen ? 'flex-start' : 'center', gap: railOpen ? 12 : 0, padding: railOpen ? '10px 12px' : '10px 0', borderRadius: 11, fontSize: 13.5, fontWeight: 600, fontFamily: t.sans, cursor: 'pointer', textAlign: 'left', width: '100%',
        color: on ? t.railInk : t.railDim, background: on ? t.railActive : 'transparent', border: `1px solid ${on ? t.railBorder : 'transparent'}`, transition: 'all 0.15s' }}>
        <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d={d} data-comment-anchor={anchor || undefined} /></svg>
        {railOpen && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>{label}</span>}
      </button>);
  };

  // ── Provenance-bar indicators ──
  // SYNC: reflects the most recent POST /holdings result ([C2-D41]); reads
  // window.FINCR (set by store2.jsx). SaaS-survivable — window is per-browser.
  function renderSyncIndicator() {
    const F = window.FINCR || {};
    const hasKey = !!localStorage.getItem('fincr-api-key');
    if (!hasKey) return <span style={{ color: t.dim }}>SYNC OFF</span>;
    if (F.lastSyncStatus === 'failed') return <span style={{ color: t.amber }}>SYNC FAILED</span>;
    if (!F.lastSyncMs) return <span style={{ color: t.dim }}>SYNC PENDING</span>;
    return <span>SYNC {f2FormatRelativeTime(F.lastSyncMs)}</span>;
  }

  // FX: live rate from /fx-rate via store2.jsx ([C2-D44]). Pair is parameterized
  // server-side; the single-user default is EUR/USD.
  function renderFxIndicator() {
    const F = window.FINCR || {};
    if (!F.fxRate || !F.fxPair) return <span style={{ color: t.dim }}>FX —</span>;
    const display = F.fxPair.slice(0, 3) + '/' + F.fxPair.slice(3);
    return <span>FX {display} {F.fxRate.toFixed(4)}</span>;
  }

  return (
    <window.Theme2Ctx.Provider value={t}>
      <window.FincrProvider>
      <div className={discrete ? 'f2-discrete' : ''} data-screen-label={'Fincr 2.0 — ' + tab} style={{ minHeight: '100vh', backgroundColor: t.page, backgroundImage: t.wash, backgroundAttachment: 'fixed', color: t.ink, fontFamily: t.sans, display: 'flex', transition: 'background-color 0.25s' }}>
        <style>{`
          .f2-row { transition: background 0.15s; }
          .f2-row:hover { background: ${t.hover}; }
          .f2-press:hover { background: ${t.hover} !important; }
          .f2-discrete .f2-money { filter: blur(8px); user-select: none; }
          .f2-money, .f2-row, kbd { transition: filter 0.2s; }
          input::placeholder { color: ${t.ghost}; }
          ::selection { background: ${t.accentSoft}; }
        `}</style>

        {/* ── Blue glass rail ── */}
        <aside style={{ width: railOpen ? 214 : 64, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', gap: 3, padding: railOpen ? '22px 14px 16px' : '22px 10px 16px', transition: 'width 0.26s cubic-bezier(.2,.7,.3,1), padding 0.26s',
          backgroundImage: t.railGrad, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, boxShadow: '1px 0 0 rgba(255,255,255,0.05) inset, 24px 0 60px -30px rgba(60,100,210,0.25)' }}>
          <button onClick={() => setRailOpen((r) => !r)} title={railOpen ? 'Collapse sidebar' : 'Expand sidebar'} style={{ position: 'absolute', right: -11, top: 28, width: 22, height: 22, borderRadius: 999, border: `1px solid ${t.hair}`, background: t.raise, color: t.dim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, boxShadow: t.dark ? '0 4px 12px -4px rgba(0,0,0,0.6)' : '0 4px 12px -6px rgba(23,25,30,0.35)' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: railOpen ? 'none' : 'rotate(180deg)', transition: 'transform 0.26s' }}><path d="M6.5 1.5L3 5l3.5 3.5"></path></svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: railOpen ? 'flex-start' : 'center', padding: railOpen ? '2px 8px 22px' : '2px 0 22px' }}>
            <FincrWordmark height={26} color={t.railInk} accent="#9FBDF5" compact={!railOpen} />
          </div>
          {NAV2.map((n) => railItem(n.id, n.label, n.d))}
          <div style={{ flex: 1 }}></div>
          {railItem('settings', 'Settings', 'M3 6h14M3 14h14M3 6h14', '018875887f-path-103-203')}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: railOpen ? 'flex-start' : 'center', gap: 11, padding: railOpen ? '13px 10px 4px' : '13px 0 4px', borderTop: `1px solid ${t.railBorder}`, marginTop: 9 }}>
            <div style={{ width: 28, height: 28, borderRadius: 999, background: 'rgba(255,255,255,0.18)', border: `1px solid ${t.railBorder}`, color: t.railInk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }} title={railOpen ? undefined : acctName}>{acctAvatar}</div>
            {railOpen &&
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: t.railInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acctName}</div>
            </div>}
          </div>
        </aside>

        {/* ── Main column ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 28px 0', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
            <div style={{ fontSize: 13, color: t.dim }}>Good {partOfDay}, {acctName}</div>
            <div style={{ flex: 1 }}></div>
            <button onClick={() => setPalette(true)} className="f2-press" style={{ display: 'flex', alignItems: 'center', gap: 22, fontFamily: t.sans, fontSize: 12.5, color: t.faint, background: t.inputBg, border: `1px solid ${t.hair}`, borderRadius: 8, padding: '6px 8px 6px 12px', cursor: 'pointer' }}>
              Search or command… <Kbd2>⌘K</Kbd2>
            </button>
            <IconBtn2 onClick={() => setDiscrete((d) => !d)} title="Discrete mode" active={discrete}>
              {discrete ?
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10s3-6 8-6 8 6 8 6M3 3l14 14"></path><circle cx="10" cy="10" r="2.5"></circle></svg> :
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"></path><circle cx="10" cy="10" r="2.6"></circle></svg>}
            </IconBtn2>
            <IconBtn2 onClick={actions.toggleTheme} title="Ink / Paper">
              {t.dark ?
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="3.4"></circle><path d="M10 1.5v2M10 16.5v2M3 10H1.5M18.5 10H17M4.7 4.7L3.6 3.6M16.4 16.4l-1.1-1.1M15.3 4.7l1.1-1.1M3.6 16.4l1.1-1.1"></path></svg> :
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 11.5A6.5 6.5 0 018.5 4a6.5 6.5 0 100 13 6.5 6.5 0 007.5-5.5z"></path></svg>}
            </IconBtn2>
          </div>

          <main key={tab} className="fincr-view" style={{ flex: 1, width: '100%', maxWidth: 1180, margin: '0 auto', padding: '18px 28px 56px' }}>
            {content}
          </main>

          {/* ── Provenance status bar ── */}
          <footer style={{ position: 'sticky', bottom: 0, zIndex: 40, background: t.barBg, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, borderTop: `1px solid ${t.hair}` }}>
            <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px', height: 32, display: 'flex', alignItems: 'center', gap: 22, fontFamily: t.mono, fontSize: 9.5, letterSpacing: '0.1em', color: t.faint, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LiveDot2 />FINNHUB · COINGECKO</span>
              {renderFxIndicator()}
              {renderSyncIndicator()}
              {/* NYSE indicator removed — deferred to P3 ([C2-D45]) */}
              <span style={{ flex: 1 }}></span>
              <span>⌘K COMMANDS</span>
              <span>1–5 VIEWS</span>
            </div>
          </footer>
        </div>

        {toast && (
          <div onClick={() => setToast(null)} style={{ position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)', zIndex: 96, background: t.raise, border: `1px solid ${t.hairStrong}`, borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', maxWidth: 'calc(100vw - 32px)', boxShadow: t.dark ? '0 12px 32px -12px rgba(0,0,0,0.8)' : '0 12px 32px -16px rgba(23,25,30,0.4)' }}>
            <span style={{ fontSize: 12.5, color: t.ink }}>{toast}</span>
            <span style={{ fontSize: 11, color: t.faint }}>✕</span>
          </div>
        )}
        <CmdPalette2 open={palette} onClose={() => setPalette(false)} actions={actions} />
        <AddPosition2 />
        <PositionDrawer2 />
      </div>
      </window.FincrProvider>
    </window.Theme2Ctx.Provider>);

}
window.Shell2 = Shell2;
