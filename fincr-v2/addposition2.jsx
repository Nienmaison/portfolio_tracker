/* Fincr 2.0 — Add position. A modal that records the first buy of a new
   holding (or another buy of one you already own). Lives at provider level,
   opened from the ledger header, the ⌘K palette, or an empty book.
   Exports window.AddPosition2. */

function AddPosition2() {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const { addOpen, actions } = store;

  const blank = { ticker: '', name: '', type: 'stock', qty: '', buyPrice: '', price: '', date: new Date().toISOString().slice(0, 10) };
  const [f, setF] = React.useState(blank);
  React.useEffect(() => { if (addOpen) setF(blank); }, [addOpen]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const existing = f.ticker ? F.holdings.find((h) => h.ticker === f.ticker.toUpperCase().trim()) : null;
  const qtyN = parseFloat(f.qty), buyN = parseFloat(f.buyPrice);
  const valid = f.ticker.trim() && qtyN > 0 && buyN > 0;
  const estCost = valid ? qtyN * buyN : 0;

  const submit = () => {
    if (!valid) return;
    actions.addPosition({
      ticker: f.ticker, name: f.name, type: f.type,
      price: f.price || f.buyPrice, qty: qtyN, buyPrice: buyN, date: f.date,
    });
  };

  return (
    <Modal2 open={addOpen} onClose={actions.closeAdd}
      title="Add position"
      sub="Record a purchase. Live price comes from the market feed once it's in your book."
      footer={<>
        <Btn2 onClick={actions.closeAdd}>Cancel</Btn2>
        <Btn2 primary onClick={submit} style={{ opacity: valid ? 1 : 0.4, pointerEvents: valid ? 'auto' : 'none' }}>
          {existing ? 'Add to ' + existing.ticker : 'Add position'}
        </Btn2>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field2 label="Ticker">
            <TextField2 value={f.ticker} onChange={(v) => set('ticker')(v.toUpperCase())} placeholder="NVDA" mono autoFocus onEnter={submit} />
          </Field2>
          <Field2 label="Asset class">
            <Seg2 options={[{ value: 'stock', label: 'Stock' }, { value: 'crypto', label: 'Crypto' }]} value={f.type} onChange={set('type')} />
          </Field2>
        </div>

        {existing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: t.dim, background: t.accentSoft, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '10px 12px' }}>
            <span style={{ width: 3, height: 28, borderRadius: 2, background: existing.color, flexShrink: 0 }}></span>
            You already hold <strong style={{ color: t.ink }}>{existing.ticker}</strong> — <Money size={12} color={t.dim}>{existing.qty} units</Money> at avg <Money size={12} color={t.dim}>{F.eur(existing.avgCost, 2)}</Money>. This buy will be added to the ledger.
          </div>
        ) : (
          <Field2 label="Name" hint="optional">
            <TextField2 value={f.name} onChange={set('name')} placeholder="Nvidia" onEnter={submit} />
          </Field2>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field2 label="Quantity">
            <NumberField2 value={f.qty} onChange={set('qty')} placeholder="40" onEnter={submit} />
          </Field2>
          <Field2 label="Buy price" hint="per unit, €">
            <NumberField2 value={f.buyPrice} onChange={set('buyPrice')} prefix="€" placeholder="765.40" onEnter={submit} />
          </Field2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'end' }}>
          <Field2 label="Buy date">
            <TextField2 value={f.date} onChange={set('date')} mono placeholder="2025-06-01" />
          </Field2>
          {!existing && (
            <Field2 label="Live price" hint="optional override">
              <NumberField2 value={f.price} onChange={set('price')} prefix="€" placeholder="auto" />
            </Field2>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${t.hair}`, paddingTop: 13 }}>
          <MonoTxt size={10.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>COST OF THIS BUY</MonoTxt>
          <Money size={16} weight={600} color={estCost ? t.ink : t.ghost}>{estCost ? F.eur(estCost, 2) : '—'}</Money>
        </div>
      </div>
    </Modal2>
  );
}
window.AddPosition2 = AddPosition2;
