/* Fincr 2.0 — Rotations overview page (C2-D104). One place to see which partial-sells
   are LINKED / AUTO·PENDING / UNLINKED across the whole book, and to link the ones the
   at-buy-time heuristic (C2-D102) missed — including retroactively, against history older
   than its 14-day window. Status is recomputed fresh on every render via
   f2ComputeRotationStatuses (store2.jsx); the only persisted bit is a dismissed suggestion.
   Row actions open the SHARED C2-D103 editor (SellRotationModal2) — not a duplicate.
   v1 = open-holding partial sells only (fully-closed positions are a fast follow-up).
   Exports window.RotationsTab2. */

function RotationsTab2() {
  const t = useTheme2();
  const store = useStore2();
  const F = window.FINCR;
  const [openSell, setOpenSell] = React.useState(null); // { sellTicker, sellTxnId, suggested? }

  const statuses = (typeof window.f2ComputeRotationStatuses === 'function')
    ? window.f2ComputeRotationStatuses(store.holdings) : [];
  const byId = {};
  statuses.forEach((s) => { byId[s.sellTxnId] = s; });

  // Join status onto the live sell txns (for date/qty/price/proceeds), most recent first.
  const rows = [];
  (store.holdings || []).forEach((h) => (h.txns || []).forEach((tx) => {
    if (tx.kind !== 'sell') return;
    const st = byId[tx.id] || { status: 'unlinked' };
    rows.push({ ticker: h.ticker, tx: tx, status: st.status, targets: st.targets, suggested: st.suggested });
  }));
  rows.sort((a, b) => (a.tx.date < b.tx.date ? 1 : (a.tx.date > b.tx.date ? -1 : 0)));

  const linkedCount = rows.filter((r) => r.status === 'linked').length;
  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const unlinkedCount = rows.filter((r) => r.status === 'unlinked').length;

  // Live tx for the editor (kept fresh from the store, not the click-time snapshot).
  const editing = openSell
    && ((store.holdings || []).find((h) => h.ticker === openSell.sellTicker) || {}).txns;
  const editingTx = editing ? editing.find((x) => x.id === openSell.sellTxnId) : null;

  const eur = (n, d) => F.eur(n, d);
  const cols = '150px 1fr 210px 116px';

  const statusCell = (r) => {
    if (r.status === 'linked') {
      const label = (r.targets && r.targets.length === 1) ? r.targets[0] : ((r.targets || []).length + ' buys');
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Chip2 tone="accent">linked</Chip2>
          <MonoTxt size={11} color={t.dim}>→ {label}</MonoTxt>
        </div>
      );
    }
    if (r.status === 'pending') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Chip2 tone="watch">auto · pending</Chip2>
          <MonoTxt size={11} color={t.dim}>→ {r.suggested.buyTicker}?</MonoTxt>
        </div>
      );
    }
    return <Chip2 tone="mute">unlinked</Chip2>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {/* intro */}
      <div style={{ maxWidth: 620 }}>
        <MonoTxt size={10.5} color={t.faint} style={{ letterSpacing: '0.18em', display: 'block', marginBottom: 8 }}>LEDGER · ROTATIONS</MonoTxt>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em', color: t.ink }}>Rotations</h1>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.55, color: t.dim }}>
          When you sell one holding to fund another, Fincr matches the proceeds automatically — but only inside a tight window. Link the ones it missed by hand, so realized P&amp;L and cost basis stay honest.
        </p>
      </div>

      {/* status strip */}
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        {[['LINKED', linkedCount, t.accent], ['AUTO · PENDING', pendingCount, t.amber], ['UNLINKED', unlinkedCount, t.faint]].map((row) => (
          <div key={row[0]} style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
            <Money size={20} weight={700} color={row[2]}>{row[1]}</Money>
            <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.13em' }}>{row[0]}</MonoTxt>
          </div>
        ))}
      </div>

      {/* ledger */}
      <section>
        <SecHead n="01" right={<MonoTxt size={10.5} color={t.faint}>{rows.length} EXITS</MonoTxt>}>Sell transactions</SecHead>
        {rows.length === 0 ? (
          <div style={{ marginTop: 14, padding: '26px 22px', border: `1px dashed ${t.hairStrong}`, borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: t.faint, lineHeight: 1.5 }}>No partial sells yet. When you record a sell, it appears here to link to the buy its proceeds funded.</div>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '8px 8px', borderBottom: `1px solid ${t.hair}` }}>
              {['Instrument', 'Detail', 'Rotation', ''].map((h, i) => (
                <span key={i} style={{ fontFamily: t.mono, fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.ghost, textAlign: i === 3 ? 'right' : 'left' }}>{h}</span>
              ))}
            </div>
            {rows.map((r, idx) => {
              const tx = r.tx;
              const proceeds = (tx.proceeds != null) ? tx.proceeds : tx.qty * tx.price;
              return (
                <div key={tx.id} className="f2-row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: `${t.rowPadY + 2}px 8px`, alignItems: 'center', borderTop: idx === 0 ? 'none' : `1px solid ${t.hair}`, borderRadius: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ fontFamily: t.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: t.red, border: `1px solid ${t.redSoft}`, background: t.redSoft, borderRadius: 4, padding: '2px 5px' }}>SEL</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>{r.ticker}</div>
                      <MonoTxt size={10} color={t.faint} style={{ display: 'block', marginTop: 1 }}>{tx.date}</MonoTxt>
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <MonoTxt size={11.5} color={t.dim}>{tx.qty} @ {eur(tx.price, tx.price < 10 ? 4 : 2)}</MonoTxt>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 2 }}>
                      <Money size={13.5} weight={700}>{eur(proceeds)}</Money>
                      <MonoTxt size={9.5} color={t.ghost} style={{ letterSpacing: '0.1em' }}>PROCEEDS</MonoTxt>
                    </div>
                  </div>
                  <div>{statusCell(r)}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {r.status === 'linked'
                      ? <TextBtn2 tone="accent" onClick={() => setOpenSell({ sellTicker: r.ticker, sellTxnId: tx.id })}>Edit link</TextBtn2>
                      : r.status === 'pending'
                        ? <Btn2 primary onClick={() => setOpenSell({ sellTicker: r.ticker, sellTxnId: tx.id, suggested: { buyTicker: r.suggested.buyTicker, buyTxnId: r.suggested.buyTxnId } })} style={{ padding: '6px 12px', fontSize: 12 }}>Review</Btn2>
                        : <Btn2 onClick={() => setOpenSell({ sellTicker: r.ticker, sellTxnId: tx.id })} style={{ padding: '6px 12px', fontSize: 12 }}>Link</Btn2>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* shared C2-D103 editor (modal), pre-filled with the suggestion in Review mode */}
      <SellRotationModal2
        open={!!editingTx}
        tx={editingTx}
        ticker={openSell && openSell.sellTicker}
        suggested={openSell && openSell.suggested}
        onClose={() => setOpenSell(null)}
      />
    </div>
  );
}

window.RotationsTab2 = RotationsTab2;
