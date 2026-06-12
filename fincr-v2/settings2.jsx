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
          <div style={{ borderTop: `1px solid ${t.hair}` }}></div>
        </div>
      </section>
    </div>
  );
}
window.SettingsTab2 = SettingsTab2;
