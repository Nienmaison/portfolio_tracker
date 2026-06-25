/* Fincr 2.0 — Closed positions list + historical sell_type tagging (C2-S7, C2-D69/70).
   Primary purpose: let the owner tag historical closes with sell_type so the true
   return formula (store2.jsx totals) can count only EXIT closes as realised P&L.
   Secondary: visibility into realised P&L history.
   Reads:  F.closed (closed position entries) via useStore2().closed
           F.untaggedClosedCount (drives the warning)
   Writes: store.actions.editClosedPosition(ticker, { sell_type, conviction_retained, rotated_into }) */

// Human-readable label for a sell_type value. '—' when untagged.
function sellTypeLabel(st) {
  if (st === 'rotate') return 'Rotate';
  if (st === 'exit') return 'Exit';
  return '—';
}

// ── Review modal (C2-S7) ──────────────────────────────────────────────────────
// Opened from the closed positions list to tag a historical close. The transaction
// itself is immutable (ticker/date/sell price/qty/realized shown read-only); only
// the metadata fields (sell_type / conviction_retained / rotated_into) are editable.
// This is how pre-Spec-3 closes — and any close not yet tagged on the local entry —
// get their sell_type. On save it calls editClosedPosition(), never recalculates P&L.
function ClosedReviewModal2({ entry, onClose }) {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const open = !!entry;

  // Pre-fill from the entry's current values so re-editing is non-destructive.
  const [sellType, setSellType] = React.useState(null);          // 'rotate' | 'exit'
  const [convRetained, setConvRetained] = React.useState(null);  // true | false
  const [rotatedInto, setRotatedInto] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!entry) return;
    setSellType(entry.sell_type || null);
    setConvRetained(entry.conviction_retained == null ? null : !!entry.conviction_retained);
    setRotatedInto(entry.rotated_into || '');
    setBusy(false);
  }, [entry]);

  if (!open) return null;

  const realized = Number(entry.realized) || 0;
  const up = realized >= 0;
  // Both sell-intent fields required before Save enables (mirrors the close modal).
  const valid = !!sellType && convRetained !== null && !busy;

  const save = () => {
    if (!valid) return;
    setBusy(true);
    const patch = { sell_type: sellType, conviction_retained: convRetained };
    // rotated_into is only meaningful on a rotate; clear it on an exit.
    patch.rotated_into = (sellType === 'rotate' && rotatedInto.trim())
      ? rotatedInto.trim().toUpperCase() : null;
    store.actions.editClosedPosition(entry.ticker, patch);
    onClose();
  };

  return (
    <Modal2
      open={open}
      onClose={onClose}
      title="Review closed position"
      sub={'Tag how the capital moved when you closed ' + entry.ticker + '. The transaction is already recorded — only the intent fields are editable.'}
      width={460}
      footer={
        <>
          <Btn2 onClick={onClose}>Cancel</Btn2>
          <Btn2 primary onClick={save} style={{ opacity: valid ? 1 : 0.4, pointerEvents: valid ? 'auto' : 'none' }}>Save</Btn2>
        </>
      }
    >
      {/* Read-only transaction facts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid ' + t.hair }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>CLOSED</MonoTxt>
          <Money size={13} weight={600}>{entry.closedAt}</Money>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>SELL PRICE</MonoTxt>
          <Money size={13} weight={600}>{F.eur(entry.sellPrice, 2)}</Money>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>UNITS</MonoTxt>
          <Money size={13} weight={600}>{entry.qty}</Money>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>REALIZED P&L</MonoTxt>
          <Money size={13} weight={700} color={up ? t.green : t.red}>{F.signed(realized)}</Money>
        </div>
      </div>

      {/* Editable intent fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <Field2 label="Capital move" hint="required">
          <Seg2 options={[{ value: 'rotate', label: 'Rotate' }, { value: 'exit', label: 'Exit' }]} value={sellType} onChange={setSellType} />
        </Field2>
        <Field2 label="Conviction retained" hint="required">
          <Seg2 options={[{ value: 'keep', label: 'Still hold' }, { value: 'lost', label: 'Lost it' }]}
            value={convRetained === null ? null : (convRetained ? 'keep' : 'lost')}
            onChange={(v) => setConvRetained(v === 'keep')} />
        </Field2>
        {sellType === 'rotate' && (
          <Field2 label="Rotated into" hint="optional">
            <TextField2 value={rotatedInto} onChange={(v) => setRotatedInto(v.toUpperCase())} placeholder="TICKER" />
          </Field2>
        )}
      </div>
    </Modal2>
  );
}

// ── Closed positions list (C2-S7) ────────────────────────────────────────────
// Collapsed by default when all positions are tagged; expanded when any are
// untagged (so the warning is visible and the owner is prompted to tag them).
function ClosedPositionsList2() {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const closed = (store && store.closed) || [];

  const untagged = closed.filter((c) => !c.sell_type).length;
  // Collapsed default depends on tag state. Initialised once; the owner can toggle.
  const [collapsed, setCollapsed] = React.useState(untagged === 0);
  const [reviewEntry, setReviewEntry] = React.useState(null);

  // Nothing to show until at least one position has been closed.
  if (!closed.length) return null;

  const rowCols = '1fr 92px 96px 70px 56px';

  return (
    <Card2 pad="22px 26px 18px">
      <SecHead
        n="04"
        right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <MonoTxt size={10.5} color={t.faint}>{closed.length} CLOSED</MonoTxt>
            <button onClick={() => setCollapsed((c) => !c)} className="f2-press"
              style={{ fontFamily: t.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', color: t.accent, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
              {collapsed ? 'Show' : 'Hide'}
            </button>
          </span>
        }
      >Closed positions</SecHead>

      {/* Untagged warning — drives the owner to tag historical closes. */}
      {untagged > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '8px 11px', background: t.amberSoft, borderRadius: 8 }}>
          <span style={{ color: t.amber, fontSize: 12 }}>⚠</span>
          <MonoTxt size={10.5} color={t.amber}>
            {untagged} untagged — true return excludes {untagged > 1 ? 'these' : 'this'}
          </MonoTxt>
        </div>
      )}

      {!collapsed && (
        <div style={{ marginTop: 12 }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: rowCols, gap: 10, padding: '0 6px 6px' }}>
            {['TICKER', 'DATE', 'P&L', 'SELL TYPE', ''].map((h, i) => (
              <MonoTxt key={i} size={9.5} color={t.faint} style={{ letterSpacing: '0.12em', textAlign: i === 2 ? 'right' : 'left' }}>{h}</MonoTxt>
            ))}
          </div>
          {closed.map((c, i) => {
            const isUntagged = !c.sell_type;
            const realized = Number(c.realized) || 0;
            const up = realized >= 0;
            return (
              <div key={c.ticker + '_' + c.closedAt + '_' + i}
                style={{
                  display: 'grid', gridTemplateColumns: rowCols, gap: 10, alignItems: 'center',
                  padding: '9px 6px', borderTop: '1px solid ' + t.hair,
                  borderLeft: isUntagged ? '2px solid ' + t.amber : '2px solid transparent',
                  paddingLeft: 8,
                }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: c.color || t.dim, flexShrink: 0 }}></span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>{c.ticker}</span>
                </span>
                <MonoTxt size={11} color={t.dim}>{c.closedAt}</MonoTxt>
                <Money size={12} weight={600} color={up ? t.green : t.red} style={{ textAlign: 'right' }}>{F.signed(realized)}</Money>
                <MonoTxt size={11} color={isUntagged ? t.faint : t.dim}>{sellTypeLabel(c.sell_type)}</MonoTxt>
                <button onClick={() => setReviewEntry(c)} className="f2-press"
                  style={{ fontFamily: t.sans, fontSize: 11, fontWeight: 600, color: t.accent, background: 'none', border: '1px solid ' + t.hairStrong, borderRadius: 7, padding: '4px 9px', cursor: 'pointer', justifySelf: 'end' }}>
                  Edit
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ClosedReviewModal2 entry={reviewEntry} onClose={() => setReviewEntry(null)} />
    </Card2>
  );
}

window.ClosedPositionsList2 = ClosedPositionsList2;
