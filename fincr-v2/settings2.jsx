/* Fincr 2.0 — Settings: appearance + data provenance. Import lives here now
   (connections + CSV), folding v1's Import tab into one place. */

function SetRow2({ label, hint, children }) {
  const t = useTheme2();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '14px 4px', borderTop: `1px solid ${t.hair}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.ink }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: t.faint, marginTop: 2, lineHeight: 1.45 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function SegPick2({ options, value, onChange }) {
  const t = useTheme2();
  return (
    <div style={{ display: 'flex', gap: 3, background: t.press, borderRadius: 8, padding: 3 }}>
      {options.map((o) => {
        const on = o.toLowerCase() === value;
        return (
          <button key={o} onClick={() => onChange(o.toLowerCase())} style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '5px 13px', borderRadius: 6, border: 'none', transition: 'all 0.13s',
            color: on ? t.ink : t.dim, background: on ? t.raise : 'transparent', boxShadow: on ? `0 0 0 1px ${t.hair}` : 'none' }}>{o}</button>
        );
      })}
    </div>
  );
}

function Toggle2({ on, onChange }) {
  const t = useTheme2();
  return (
    <button onClick={() => onChange(!on)} style={{ width: 38, height: 22, borderRadius: 999, border: `1px solid ${on ? t.ink : t.inputBorder}`, background: on ? t.ink : 'transparent', cursor: 'pointer', position: 'relative', transition: 'all 0.18s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2.5, left: on ? 18 : 3, width: 15, height: 15, borderRadius: 999, background: on ? t.page : t.dim, transition: 'all 0.18s' }}></span>
    </button>
  );
}

/* Spec: API key entry ([C2-D89]). Settings is the single canonical home for the
   key — the prior Settings<->Agent circular "set it over there" loop had no input
   on either side. Masked input + show/hide, validates via GET /holdings (401 =>
   inline error), then repaints indicators + re-hydrates in place (no reload).
   Pre-P3 stopgap; real login (P3) replaces this. */
function ApiKeyRow2() {
  const t = useTheme2();
  const store = useStore2();
  const [val, setVal] = React.useState(function () { return localStorage.getItem('fincr-api-key') || ''; });
  const [show, setShow] = React.useState(false);
  const [status, setStatus] = React.useState(function () { return localStorage.getItem('fincr-api-key') ? 'set' : 'empty'; });
  const [err, setErr] = React.useState(null);

  const save = async function () {
    const key = (val || '').trim();
    if (!key) { setErr('Enter your API key.'); setStatus('empty'); return; }
    setErr(null); setStatus('checking');
    localStorage.setItem('fincr-api-key', key);
    try {
      const r = await fetch('https://fincr.duckdns.org/holdings', { headers: { 'X-API-Key': key } });
      if (r.status === 401) { setStatus('invalid'); setErr('That key was rejected (401). Check it and save again.'); return; }
      if (!r.ok) { setStatus('invalid'); setErr('Could not validate the key (HTTP ' + r.status + '). Try again.'); return; }
      setStatus('valid'); setErr(null);
      // Light revalidation without a reload: repaint status bar + agent + tree,
      // and hydrate the book/targets now that we are authenticated.
      window.dispatchEvent(new CustomEvent('fincr:key-change'));
      if (store && store.actions && store.actions.resetAll) store.actions.resetAll();
      if (typeof window.loadThesis === 'function') { try { window.loadThesis(); } catch (e) {} }
    } catch (e) { setStatus('invalid'); setErr('Network error validating the key. Try again.'); }
  };

  const chip = status === 'valid' ? <Chip2 tone="ok">CONNECTED</Chip2>
    : status === 'invalid' ? <Chip2 tone="bad">REJECTED</Chip2>
    : status === 'set' ? <Chip2 tone="mute">SAVED</Chip2>
    : null;

  return (
    <div style={{ padding: '13px 4px', borderTop: `1px solid ${t.hair}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, minWidth: 74 }}>API key</div>
        <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 4, background: t.inputBg, border: `1px solid ${err ? t.red : t.inputBorder}`, borderRadius: 8, padding: '2px 4px 2px 10px' }}>
          <input type={show ? 'text' : 'password'} value={val}
            onChange={function (e) { setVal(e.target.value); setErr(null); if (status !== 'empty') setStatus('set'); }}
            onKeyDown={function (e) { if (e.key === 'Enter') save(); }}
            placeholder="Paste your Fincr API key" autoComplete="off" spellCheck={false}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: t.ink, fontFamily: t.mono, fontSize: 12.5, padding: '7px 0' }} />
          <button onClick={function () { setShow(function (s) { return !s; }); }} className="f2-press" title={show ? 'Hide' : 'Show'}
            style={{ border: 'none', background: 'transparent', color: t.dim, cursor: 'pointer', fontSize: 10, fontFamily: t.mono, letterSpacing: '0.1em', padding: '4px 6px' }}>{show ? 'HIDE' : 'SHOW'}</button>
        </div>
        <Btn2 primary onClick={save}>{status === 'checking' ? 'Checking…' : 'Save key'}</Btn2>
        {chip}
      </div>
      <div style={{ fontSize: 11.5, color: err ? t.red : t.faint, marginTop: 6, lineHeight: 1.45 }}>
        {err || 'Authenticates sync, the agent, and thesis. Stored only in this browser (localStorage) — re-enter it per device/domain. Real login arrives with multi-user (P3).'}
      </div>
    </div>
  );
}

function SettingsTab2({ mode, setMode, density, setDensity, discrete, setDiscrete }) {
  const t = useTheme2();
  const F = window.FINCR;
  return (
    <div style={{ maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 34 }}>
      <section>
        <SecHead n="01">Appearance</SecHead>
        <div style={{ marginTop: 6 }}>
          <SetRow2 label="Surface" hint="Ink for the desk at night, Paper for daylight.">
            <SegPick2 options={['Ink', 'Paper']} value={mode} onChange={setMode} />
          </SetRow2>
          <SetRow2 label="Density" hint="Compact tightens the ledger rows.">
            <SegPick2 options={['Comfortable', 'Compact']} value={density} onChange={setDensity} />
          </SetRow2>
          <SetRow2 label="Discrete mode" hint="Blur every figure — for screens in public.">
            <Toggle2 on={discrete} onChange={setDiscrete} />
          </SetRow2>
          <div style={{ borderTop: `1px solid ${t.hair}` }}></div>
        </div>
      </section>

      <section>
        <SecHead n="02" right={<MonoTxt size={10} color={t.faint}>ALL SYSTEMS NOMINAL</MonoTxt>}>Data & connections</SecHead>
        <div style={{ marginTop: 6 }}>
          <ApiKeyRow2 />
          {F.connections.map((c) => (
            <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center', padding: '13px 4px', borderTop: `1px solid ${t.hair}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <LiveDot2 color={c.ok ? t.green : t.red} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.ink }}>{c.name} <span style={{ fontWeight: 400, color: t.faint }}>· {c.label}</span></div>
                  <div style={{ fontSize: 11.5, color: t.faint, marginTop: 1 }}>{c.detail}</div>
                </div>
              </div>
              <MonoTxt size={11} color={t.dim}>{c.status}</MonoTxt>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 4px', borderTop: `1px solid ${t.hair}` }}>
            <Btn2>Import CSV</Btn2>
            <Btn2>Sync portfolio.json</Btn2>
            <span style={{ fontSize: 11.5, color: t.faint }}>Broker exports map automatically.</span>
          </div>
          <BrokerConnect2 />
          <div style={{ borderTop: `1px solid ${t.hair}` }}></div>
        </div>
      </section>
    </div>
  );
}
window.SettingsTab2 = SettingsTab2;
