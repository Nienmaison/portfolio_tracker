/* Fincr 2.0 — Position drawer. Opens from any ledger row. Shows the cost-basis
   story, the full transaction ledger (add / edit / remove buys & sells, avg cost
   recomputed live), and the Close-position flow that captures a sell price and
   the realized P&L. Exports window.PositionDrawer2. */

// Scaffold sentinel written by sync_thesis_with_holdings (api.py); means a holding
// has no authored thesis yet. Em-dash, not a hyphen. (C2-S3)
const THESIS_SENTINEL = "Position opened via dashboard \u2014 thesis details pending.";

function TxnRow2({ ticker, tx, avgCost }) {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const [edit, setEdit] = React.useState(false);
  const [d, setD] = React.useState({ date: tx.date, qty: String(tx.qty), price: String(tx.price) });
  React.useEffect(() => { setD({ date: tx.date, qty: String(tx.qty), price: String(tx.price) }); }, [tx.id, tx.qty, tx.price, tx.date]);
  const buy = tx.kind === 'buy';
  const save = () => {
    store.actions.editTxn(ticker, tx.id, { date: d.date, qty: parseFloat(d.qty), price: parseFloat(d.price) });
    setEdit(false);
  };

  if (edit) {
    return (
      <div style={{ borderTop: `1px solid ${t.hair}`, padding: '11px 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.8fr 1fr', gap: 8 }}>
          <TextField2 value={d.date} onChange={(v) => setD((s) => ({ ...s, date: v }))} mono />
          <NumberField2 value={d.qty} onChange={(v) => setD((s) => ({ ...s, qty: v }))} placeholder="qty" />
          <NumberField2 value={d.price} onChange={(v) => setD((s) => ({ ...s, price: v }))} prefix="€" onEnter={save} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <TextBtn2 tone="danger" onClick={() => store.actions.removeTxn(ticker, tx.id)}>Remove</TextBtn2>
          <span style={{ display: 'flex', gap: 6 }}>
            <TextBtn2 onClick={() => setEdit(false)}>Cancel</TextBtn2>
            <Btn2 primary onClick={save} style={{ padding: '6px 12px' }}>Save</Btn2>
          </span>
        </div>
      </div>
    );
  }
  return (
    <button onClick={() => setEdit(true)} className="f2-row" style={{ width: '100%', textAlign: 'left', border: 'none', borderTop: `1px solid ${t.hair}`, background: 'transparent', cursor: 'pointer', display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: 12, alignItems: 'center', padding: '11px 6px', borderRadius: 6 }}>
      <span style={{ fontFamily: t.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: buy ? t.green : t.red }}>{buy ? 'BUY' : 'SEL'}</span>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <Money size={12.5} weight={600}>{tx.qty} @ {F.eur(tx.price, 2)}</Money>
        <MonoTxt size={10} color={t.faint}>{tx.date}</MonoTxt>
      </span>
      <Money size={12.5} color={t.dim}>{F.eur(tx.qty * tx.price, 0)}</Money>
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke={t.ghost} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><path d="M9 2.5l2.5 2.5L5 11.5 2.5 12 3 9.5z"></path></svg>
    </button>
  );
}

/* The add-transaction inline form (buy or sell). */
function AddTxnForm2({ ticker, maxSell, onDone }) {
  const t = useTheme2();
  const store = useStore2();
  const [kind, setKind] = React.useState('buy');
  const [d, setD] = React.useState({ date: new Date().toISOString().slice(0, 10), qty: '', price: '' });
  const qtyN = parseFloat(d.qty), priceN = parseFloat(d.price);
  const overSell = kind === 'sell' && qtyN > maxSell + 1e-9;
  const valid = qtyN > 0 && priceN > 0 && !overSell;
  const save = () => { if (!valid) return; store.actions.addTxn(ticker, { kind, date: d.date, qty: qtyN, price: priceN }); onDone(); };
  return (
    <div style={{ background: t.dark ? 'rgba(255,255,255,0.02)' : 'rgba(23,25,30,0.02)', border: `1px solid ${t.hair}`, borderRadius: 11, padding: 14, display: 'flex', flexDirection: 'column', gap: 11, marginTop: 12 }}>
      <Seg2 options={[{ value: 'buy', label: 'Buy', tone: 'buy' }, { value: 'sell', label: 'Sell', tone: 'sell' }]} value={kind} onChange={setKind} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.8fr 1fr', gap: 8 }}>
        <TextField2 value={d.date} onChange={(v) => setD((s) => ({ ...s, date: v }))} mono />
        <NumberField2 value={d.qty} onChange={(v) => setD((s) => ({ ...s, qty: v }))} placeholder="qty" autoFocus />
        <NumberField2 value={d.price} onChange={(v) => setD((s) => ({ ...s, price: v }))} prefix="€" onEnter={save} />
      </div>
      {overSell && <MonoTxt size={10.5} color={t.red}>Can't sell more than {maxSell} units held.</MonoTxt>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <TextBtn2 onClick={onDone}>Cancel</TextBtn2>
        <Btn2 primary onClick={save} style={{ opacity: valid ? 1 : 0.4, pointerEvents: valid ? 'auto' : 'none', padding: '6px 12px' }}>Record {kind}</Btn2>
      </div>
    </div>
  );
}

/* Close-position flow. A sell is a thesis decision (C2-S3): CAPITAL MOVE
   (sell_type) and CONVICTION RETAINED are required before the close can fire.
   ROTATING INTO appears only for a rotate. On close, the position is archived
   (via the holdings sync) and these fields are written to the archived thesis
   entry — see store.actions.closePositionWithThesis. */
function CloseForm2({ h, onCancel }) {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const [sell, setSell] = React.useState(String(h.price));
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = React.useState('');
  const [sellType, setSellType] = React.useState(null);          // 'rotate' | 'exit' — required
  const [convRetained, setConvRetained] = React.useState(null);  // true | false — required
  const [rotatedInto, setRotatedInto] = React.useState('');      // ticker, rotate only
  const [busy, setBusy] = React.useState(false);
  const sellN = parseFloat(sell);
  const priceValid = sellN > 0;
  // Both sell-intent fields must be answered before Close enables.
  const valid = priceValid && !!sellType && convRetained !== null && !busy;
  const realized = priceValid ? h.qty * (sellN - h.avgCost) + (h.realized || 0) : 0;
  const up = realized >= 0;
  const doClose = async () => {
    if (!valid) return;
    setBusy(true);
    const patch = { sell_type: sellType, conviction_retained: convRetained };
    if (sellType === "rotate" && rotatedInto.trim()) patch.rotated_into = rotatedInto.trim().toUpperCase();
    // Close first; the thesis patch fires after the archive sync succeeds (store).
    // The drawer closes itself once the holding leaves the store.
    await store.actions.closePositionWithThesis(h.ticker, { sellPrice: sellN, date, note }, patch, note);
  };
  return (
    <div style={{ background: t.redSoft, border: `1px solid ${t.cardBorder}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>Close {h.ticker} — sell all {h.qty} units</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field2 label="Sell price" hint="per unit, €"><NumberField2 value={sell} onChange={setSell} prefix="€" autoFocus /></Field2>
        <Field2 label="Close date"><TextField2 value={date} onChange={setDate} mono /></Field2>
      </div>
      <Field2 label="Note" hint="optional"><TextField2 value={note} onChange={setNote} placeholder="Why you closed it" /></Field2>
      <Field2 label="Capital move" hint="required">
        <Seg2 options={[{ value: "rotate", label: "Rotate" }, { value: "exit", label: "Exit" }]} value={sellType} onChange={setSellType} />
      </Field2>
      <Field2 label="Conviction retained" hint="required">
        <Seg2 options={[{ value: "keep", label: "Still hold" }, { value: "lost", label: "Lost it" }]}
          value={convRetained === null ? null : (convRetained ? "keep" : "lost")}
          onChange={(v) => setConvRetained(v === "keep")} />
      </Field2>
      {sellType === "rotate" && (
        <Field2 label="Rotating into" hint="optional">
          <TextField2 value={rotatedInto} onChange={(v) => setRotatedInto(v.toUpperCase())} placeholder="TICKER" />
        </Field2>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${t.hair}`, paddingTop: 12 }}>
        <MonoTxt size={10.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>REALIZED P&L</MonoTxt>
        <Money size={17} weight={700} color={priceValid ? (up ? t.green : t.red) : t.ghost}>{priceValid ? F.signed(realized) : '—'}</Money>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Btn2 onClick={onCancel}>Cancel</Btn2>
        <Btn2 primary onClick={doClose}
          style={{ background: t.red, borderColor: t.red, color: '#fff', opacity: valid ? 1 : 0.4, pointerEvents: valid ? 'auto' : 'none' }}>
          {busy ? 'Closing…' : 'Close position'}
        </Btn2>
      </div>
    </div>
  );
}

function Stat2({ label, children, color }) {
  const t = useTheme2();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>{label}</MonoTxt>
      <span style={{ color: color || t.ink }}>{children}</span>
    </div>
  );
}

/* C2-S3 — inline per-holding thesis editor. Edits core_argument / conviction /
   stance / target_price via POST /thesis/update (window.saveThesis), sends only
   changed fields, then refreshes F.thesis via loadThesis(). Transient local state. */
function ThesisEditor2({ th, onDone }) {
  const t = useTheme2();
  // Original backend values. The adapter display-cases conviction/stance; lowercasing
  // is the lossless inverse of its titleCase, giving back the stored enum.
  const origArg = (th.argument && th.argument !== THESIS_SENTINEL) ? th.argument : '';
  const origConv = th.conviction ? th.conviction.toLowerCase() : 'medium';
  const origStance = th.stance ? th.stance.toLowerCase() : 'hold';
  const origTarget = th.target_price != null ? th.target_price : null;
  const [arg, setArg] = React.useState(origArg);
  const [conv, setConv] = React.useState(origConv);
  const [stance, setStance] = React.useState(origStance);
  const [targetStr, setTargetStr] = React.useState(origTarget != null ? String(origTarget) : '');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(false);
  const save = async () => {
    setBusy(true); setErr(false);
    // Diff against originals — only send what changed (avoid needless version bumps).
    const changes = {};
    if (arg !== origArg) changes.core_argument = arg;
    if (conv !== origConv) changes.conviction = conv;
    if (stance !== origStance) changes.stance = stance;
    const newTarget = targetStr.trim() === '' ? null : Number(targetStr);
    if (newTarget !== origTarget) changes.target_price = newTarget;
    if (Object.keys(changes).length === 0) { onDone(); return; } // no-op — just close
    const ok = await window.saveThesis(th.ticker, changes, '');
    if (!ok) { setErr(true); setBusy(false); return; }
    if (window.loadThesis) await window.loadThesis(); // refresh card + drawer
    onDone();
  };
  const inputStyle = window.f2InputStyle(t);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
      <Field2 label="Core argument">
        <textarea value={arg} onChange={(e) => setArg(e.target.value)} rows={3} placeholder="Why do you hold this?"
          onFocus={(e) => e.target.style.borderColor = t.accent} onBlur={(e) => e.target.style.borderColor = t.inputBorder}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 66, lineHeight: 1.5 }} />
      </Field2>
      <Field2 label="Conviction">
        <Seg2 options={[{ value: 'high', label: 'High', tone: 'ok' }, { value: 'medium', label: 'Medium', tone: 'watch' }, { value: 'low', label: 'Low', tone: 'mute' }]} value={conv} onChange={setConv} />
      </Field2>
      <Field2 label="Stance">
        <Seg2 options={[{ value: 'accumulate', label: 'Accumulate', tone: 'ok' }, { value: 'hold', label: 'Hold', tone: 'mute' }, { value: 'trim', label: 'Trim', tone: 'watch' }]} value={stance} onChange={setStance} />
      </Field2>
      <Field2 label="Price target" hint="optional">
        <NumberField2 value={targetStr} onChange={setTargetStr} prefix="€" placeholder="—" />
      </Field2>
      {err && <MonoTxt size={11} color={t.red}>Failed to save — try again</MonoTxt>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Btn2 onClick={onDone}>Cancel</Btn2>
        <Btn2 primary onClick={save} style={{ opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>{busy ? 'Saving…' : 'Save'}</Btn2>
      </div>
    </div>
  );
}

function PositionDrawer2() {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const { drawerTicker, actions } = store;
  const [mode, setMode] = React.useState('detail'); // detail | addtx | close
  const [editingThesis, setEditingThesis] = React.useState(false); // C2-S3 thesis editor toggle
  React.useEffect(() => { setMode('detail'); setEditingThesis(false); }, [drawerTicker]);

  const h = drawerTicker ? store.holdings.find((x) => x.ticker === drawerTicker) : null;
  const open = !!h;
  const th = h && F.thesis ? F.thesis.find((x) => x.ticker === h.ticker) : null;
  const weight = h ? (h.value / F.totalValue * 100) : 0;

  return (
    <Drawer2 open={open} onClose={actions.closeDrawer} width={500}>
      {h && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* header */}
          <div style={{ padding: '22px 26px 18px', borderBottom: `1px solid ${t.hair}`, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <span style={{ width: 4, height: 42, borderRadius: 2, background: h.color, flexShrink: 0, marginTop: 2 }}></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: t.ink, letterSpacing: '-0.01em' }}>{h.ticker}</span>
                <Chip2 tone={h.type === 'crypto' ? 'accent' : 'mute'}>{h.type}</Chip2>
              </div>
              <div style={{ fontSize: 12.5, color: t.faint, marginTop: 1 }}>{h.name}</div>
            </div>
            <button onClick={actions.closeDrawer} className="f2-press" style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', color: t.dim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 3l8 8M11 3l-8 8"></path></svg>
            </button>
          </div>

          {/* value band */}
          <div style={{ padding: '20px 26px', borderBottom: `1px solid ${t.hair}` }}>
            <Money size={36} weight={500} style={{ letterSpacing: '-0.03em', lineHeight: 1, display: 'block' }}>{F.eur(h.value)}</Money>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
              <Delta2 pct={h.dayPct != null ? h.dayPct : 0} size={12.5} />
              <span style={{ width: 1, height: 12, background: t.hair }}></span>
              <Delta2 pct={h.pnlPct} value={h.pnl} size={12.5} />
              <MonoTxt size={10.5} color={t.faint}>UNREALIZED</MonoTxt>
            </div>
          </div>

          {/* cost-basis story */}
          <div style={{ padding: '18px 26px', borderBottom: `1px solid ${t.hair}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Stat2 label="UNITS"><Money size={13.5} weight={600}>{h.qty}</Money></Stat2>
            <Stat2 label="AVG COST"><Money size={13.5} weight={600}>{F.eur(h.avgCost, 2)}</Money></Stat2>
            <Stat2 label="LIVE PRICE"><Money size={13.5} weight={600}>{F.eur(h.price, 2)}</Money></Stat2>
            <Stat2 label="INVESTED"><Money size={13.5} weight={600} color={t.dim}>{F.eur(h.costNow)}</Money></Stat2>
            <Stat2 label="WEIGHT"><Money size={13.5} weight={600} color={t.dim}>{weight.toFixed(1)}%</Money></Stat2>
            <Stat2 label="REALIZED"><Money size={13.5} weight={600} color={h.realized ? (h.realized >= 0 ? t.green : t.red) : t.dim}>{h.realized ? F.signed(h.realized) : '€0'}</Money></Stat2>
          </div>

          {/* transaction ledger */}
          <div style={{ padding: '18px 26px', borderBottom: `1px solid ${t.hair}` }}>
            <DrawerSec2 label="Transaction ledger" right={<MonoTxt size={10} color={t.faint}>{h.txns.length} ENTRIES</MonoTxt>} />
            <div style={{ marginTop: 6 }}>
              {h.txns.map((tx) => <TxnRow2 key={tx.id} ticker={h.ticker} tx={tx} avgCost={h.avgCost} />)}
              <div style={{ borderTop: `1px solid ${t.hair}` }}></div>
            </div>
            {mode === 'addtx'
              ? <AddTxnForm2 ticker={h.ticker} maxSell={h.qty} onDone={() => setMode('detail')} />
              : <button onClick={() => setMode('addtx')} className="f2-press" style={{ marginTop: 12, width: '100%', fontFamily: t.sans, fontSize: 12.5, fontWeight: 600, color: t.accent, background: 'none', border: `1px dashed ${t.hairStrong}`, borderRadius: 9, padding: '10px', cursor: 'pointer' }}>+ Record a buy or sell</button>}
          </div>

          {/* thesis on record + inline editor (C2-S3) */}
          {th && (
            <div style={{ padding: '16px 26px', borderBottom: `1px solid ${t.hair}` }}>
              <DrawerSec2 label="Thesis on record" right={
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Chip2 tone={th.conviction === 'High' ? 'ok' : th.conviction === 'Medium' ? 'watch' : 'mute'}>{th.conviction}</Chip2>
                  {!editingThesis && <TextBtn2 tone="accent" onClick={() => setEditingThesis(true)} style={{ padding: '2px 4px' }}>Edit</TextBtn2>}
                </span>
              } />
              {editingThesis
                ? <ThesisEditor2 th={th} onDone={() => setEditingThesis(false)} />
                : <div style={{ fontSize: 12.5, color: t.dim, lineHeight: 1.55, marginTop: 10 }}>
                    {(th.argument && th.argument !== THESIS_SENTINEL)
                      ? th.argument
                      : <span style={{ color: t.faint, fontStyle: 'italic' }}>No thesis written yet — add one.</span>}
                  </div>}
            </div>
          )}

          {/* danger / close zone */}
          <div style={{ padding: '18px 26px 28px' }}>
            {mode === 'close'
              ? <CloseForm2 h={h} onCancel={() => setMode('detail')} />
              : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <TextBtn2 tone="danger" onClick={() => { if (confirm('Delete ' + h.ticker + ' and its whole ledger? This cannot be undone.')) actions.deletePosition(h.ticker); }}>Delete position</TextBtn2>
                  <Btn2 onClick={() => setMode('close')} style={{ borderColor: t.red, color: t.red }}>Close position →</Btn2>
                </div>
              )}
          </div>
        </div>
      )}
    </Drawer2>
  );
}
window.PositionDrawer2 = PositionDrawer2;
