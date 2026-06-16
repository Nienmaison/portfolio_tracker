/* Fincr 2.0 — Guardrails. Target weight per position, measured against the live
   book. Null default state: until you set targets, the card invites you to. Once
   set, each holding shows current vs target with a drift readout, and an editor
   modal lets you tune them. Exports window.GuardrailsCard2. */

function DriftRow2({ h, target }) {
  const t = useTheme2();
  const F = window.FINCR;
  const cur = h.value / F.totalValue * 100;
  const drift = cur - target;
  const within = Math.abs(drift) <= 2;       // ±2pp tolerance band
  const c = within ? t.green : Math.abs(drift) <= 5 ? t.amber : t.red;
  const tone = within ? 'ok' : Math.abs(drift) <= 5 ? 'watch' : 'bad';
  // bar: target marker on a 0..max scale; fill = current
  const max = Math.max(cur, target) * 1.25 || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 0', borderTop: `1px solid ${t.hair}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: h.color }}></span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>{h.ticker}</span>
        </span>
        <Chip2 tone={tone}>{within ? 'On target' : (drift > 0 ? 'Over ' : 'Under ') + Math.abs(drift).toFixed(1) + 'pp'}</Chip2>
      </div>
      <div style={{ position: 'relative', height: 6, borderRadius: 999, background: t.press }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, cur / max * 100)}%`, borderRadius: 999, background: c, transition: 'width 0.6s cubic-bezier(.2,.7,.3,1)' }}></div>
        <div title={'target ' + target + '%'} style={{ position: 'absolute', left: `${Math.min(100, target / max * 100)}%`, top: -3, bottom: -3, width: 2, background: t.ink, borderRadius: 2 }}></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <MonoTxt size={10.5} color={t.dim}>NOW <span style={{ color: c, fontWeight: 600 }}>{cur.toFixed(1)}%</span></MonoTxt>
        <MonoTxt size={10.5} color={t.faint}>TARGET {target}%</MonoTxt>
      </div>
    </div>
  );
}

function GuardrailsEditor2({ open, onClose }) {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const [draft, setDraft] = React.useState({});
  React.useEffect(() => {
    if (!open) return;
    const seed = {};
    F.holdings.forEach((h) => { seed[h.ticker] = (store.targets && store.targets[h.ticker] != null) ? String(store.targets[h.ticker]) : ''; });
    setDraft(seed);
  }, [open]);

  const sum = Object.values(draft).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const equalWeight = () => {
    const ew = F.holdings.length ? +(100 / F.holdings.length).toFixed(1) : 0;
    const seed = {}; F.holdings.forEach((h) => { seed[h.ticker] = String(ew); }); setDraft(seed);
  };
  const useCurrent = () => {
    const seed = {}; F.holdings.forEach((h) => { seed[h.ticker] = (h.value / F.totalValue * 100).toFixed(1); }); setDraft(seed);
  };
  const save = () => {
    const obj = {};
    Object.entries(draft).forEach(([k, v]) => { if (v !== '' && parseFloat(v) >= 0) obj[k] = +parseFloat(v); });
    store.actions.initTargets(obj);
    onClose();
  };

  return (
    <Modal2 open={open} onClose={onClose} width={460}
      title="Set target weights"
      sub="Define the book you're aiming for. Fincr flags drift when a position strays more than 2 points from its target."
      footer={<>
        {store.targets && <TextBtn2 tone="danger" onClick={() => { store.actions.clearTargets(); onClose(); }} style={{ marginRight: 'auto' }}>Clear all targets</TextBtn2>}
        <Btn2 onClick={onClose}>Cancel</Btn2>
        <Btn2 primary onClick={save}>Save targets</Btn2>
      </>}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Btn2 onClick={equalWeight} style={{ fontSize: 11.5, padding: '6px 10px' }}>Equal weight</Btn2>
        <Btn2 onClick={useCurrent} style={{ fontSize: 11.5, padding: '6px 10px' }}>Match current</Btn2>
      </div>
      <div>
        {F.holdings.map((h) => (
          <div key={h.ticker} style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${t.hair}` }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: h.color }}></span>
              <span style={{ fontSize: 13, fontWeight: 600, color: t.ink }}>{h.ticker}</span>
              <MonoTxt size={10.5} color={t.faint}>now {(h.value / F.totalValue * 100).toFixed(1)}%</MonoTxt>
            </span>
            <NumberField2 value={draft[h.ticker] || ''} onChange={(v) => setDraft((s) => ({ ...s, [h.ticker]: v }))} prefix="%" placeholder="—" />
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${t.hairStrong}`, marginTop: 6, paddingTop: 11 }}>
          <MonoTxt size={10.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>ALLOCATED</MonoTxt>
          <Money size={14} weight={700} color={Math.abs(sum - 100) <= 0.5 ? t.green : sum > 100 ? t.red : t.dim}>{sum.toFixed(1)}%</Money>
        </div>
        {sum > 100 && <MonoTxt size={10.5} color={t.red} style={{ display: 'block', marginTop: 6 }}>Targets exceed 100%.</MonoTxt>}
      </div>
    </Modal2>
  );
}

function GuardrailsCard2() {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const [editing, setEditing] = React.useState(false);
  const targets = store.targets;
  const hasTargets = targets && Object.keys(targets).length > 0;
  const tracked = hasTargets ? F.holdings.filter((h) => targets[h.ticker] != null) : [];
  const offCount = tracked.filter((h) => Math.abs(h.value / F.totalValue * 100 - targets[h.ticker]) > 2).length;

  return (
    <Card2 pad="18px 20px 16px">
      <SecHead n="04" right={hasTargets
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Chip2 tone={offCount ? 'watch' : 'ok'}>{offCount ? offCount + ' drifting' : 'all on target'}</Chip2><TextBtn2 tone="accent" onClick={() => setEditing(true)} style={{ padding: '2px 4px' }}>Edit</TextBtn2></span>
        : null}>Guardrails</SecHead>

      {hasTargets ? (
        <div style={{ marginTop: 8 }}>
          {tracked.map((h) => <DriftRow2 key={h.ticker} h={h} target={targets[h.ticker]} />)}
          <div style={{ borderTop: `1px solid ${t.hair}`, paddingTop: 10, marginTop: 2 }}>
            <MonoTxt size={10} color={t.faint}>TARGET BOOK · ±2PP TOLERANCE</MonoTxt>
          </div>
        </div>
      ) : (
        /* ── null default state ── */
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, padding: '20px 18px', border: `1px dashed ${t.hairStrong}`, borderRadius: 12 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={t.faint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"></path></svg>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>No targets set</div>
            <div style={{ fontSize: 12.5, color: t.faint, lineHeight: 1.5, marginTop: 4 }}>Set a target weight for each position and Fincr will flag drift as the market moves your book around.</div>
          </div>
          <Btn2 primary onClick={() => setEditing(true)} style={{ marginTop: 2 }}>Set target weights</Btn2>
        </div>
      )}

      <GuardrailsEditor2 open={editing} onClose={() => setEditing(false)} />
    </Card2>
  );
}
window.GuardrailsCard2 = GuardrailsCard2;
