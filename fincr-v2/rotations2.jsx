/* Fincr 2.0 — Rotations overview page (C2-D104; closed-positions section C2-D120).
   Two sections, deliberately separate vocabularies (see decisions.md [C2-D120] for why):
     01 — Open positions: which partial-sells on still-open holdings are
          LINKED / AUTO·PENDING / UNLINKED across the whole book. Status via
          f2ComputeRotationStatuses (store2.jsx) — UNTOUCHED by C2-D120.
     02 — Closed positions: untagged / fully allocated / partially allocated / exit,
          via the new f2ComputeClosedRotationStatuses below (scoped to `closed` only —
          does not read or modify open-holding state, does not touch store2.jsx).
   Row actions: section 01 opens the shared C2-D103 editor (SellRotationModal2); section
   02 opens the shared ClosedReviewModal2 (closedpositions2.jsx) — both reused as-is, no
   duplicate editors.
   Exports window.RotationsTab2. */

/* C2-D120 — closed-position rotation status. Pure, scoped to `closed` (closed_positions)
   only — mirrors f2ComputeRotationStatuses' shape/spirit but is NOT a modification of it;
   open-position status is completely untouched. Vocabulary (locked in the spec, grounded
   in real data from the scoping pass):
     untagged            — !sell_type (identical predicate to store2.jsx's untaggedClosedCount)
     exit                — sell_type:'exit' — settled, never counts as needing attention
     fully_allocated     — sell_type:'rotate' AND proceeds - Σ(portion_eur) <= 0.50
     partially_allocated — sell_type:'rotate', gap > 0.50 — NEUTRAL, not an error (leftover
                            proceeds can legitimately just be untagged realized gain)
   `usingLegacyProceeds` (proceeds field absent, e.g. OP) reuses the exact existing fallback
   from ClosedReviewModal2 (closedpositions2.jsx:323-326: sellPrice * qty) — same figure,
   same "approximate" framing, not reinvented here.
   `hasIncompleteLink` is the existing, DISTINCT unlinkedRotationCount concept (store2.jsx:
   675-679) — a rotate-tagged link with no target_txn_id yet — surfaced as a separate note,
   never folded into the main status label (per spec, these are different questions:
   "is there enough money accounted for" vs. "is this specific link still a placeholder"). */
function f2ComputeClosedRotationStatuses(closed) {
  return (closed || []).map((c) => {
    const untagged = !c.sell_type;
    const usingLegacyProceeds = c.proceeds == null;
    const proceeds = c.proceeds != null
      ? c.proceeds
      : (c.sellPrice != null && c.qty != null) ? c.sellPrice * c.qty : null;
    const links = c.rotation_links || [];
    const linkedSum = links.reduce((s, l) => s + (l.portion_eur || 0), 0);
    const gap = proceeds != null ? proceeds - linkedSum : null;
    const hasIncompleteLink = c.sell_type === 'rotate' && links.length > 0
      && links.some((l) => l.target_txn_id == null);

    let status;
    if (untagged) status = 'untagged';
    else if (c.sell_type === 'exit') status = 'exit';
    else if (c.sell_type === 'rotate') status = (gap != null && gap <= 0.5) ? 'fully_allocated' : 'partially_allocated';
    else status = 'untagged'; // defensive: any unrecognised sell_type value

    return {
      entry: c, id: c.id || null, ticker: c.ticker, closedAt: c.closedAt, status: status,
      proceeds: proceeds, usingLegacyProceeds: usingLegacyProceeds,
      linkedSum: linkedSum, gap: gap, hasIncompleteLink: hasIncompleteLink,
      targets: links.map((l) => l.target_ticker),
    };
  });
}

function RotationsTab2() {
  const t = useTheme2();
  const store = useStore2();
  const F = window.FINCR;
  const [openSell, setOpenSell] = React.useState(null); // { sellTicker, sellTxnId, suggested? }
  const [reviewKey, setReviewKey] = React.useState(null); // { id } or { ticker, closedAt } for legacy

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

  // C2-D120 — closed-position rows, most recently closed first. Same "always live, never a
  // click-time snapshot" discipline as editingTx above: reviewKey stores only an identifier
  // (stable id when present, ticker+closedAt fallback for legacy entries — the exact
  // C2-D113 matching convention), and the live entry is looked up fresh on every render.
  const closedStatuses = f2ComputeClosedRotationStatuses(store.closed);
  const closedRows = closedStatuses.slice().sort((a, b) => (a.closedAt < b.closedAt ? 1 : (a.closedAt > b.closedAt ? -1 : 0)));
  const untaggedClosedCount = closedRows.filter((r) => r.status === 'untagged').length;
  const fullyAllocatedCount = closedRows.filter((r) => r.status === 'fully_allocated').length;
  const partiallyAllocatedCount = closedRows.filter((r) => r.status === 'partially_allocated').length;
  const exitCount = closedRows.filter((r) => r.status === 'exit').length;

  const reviewEntry = reviewKey
    ? (store.closed || []).find((c) => (reviewKey.id ? c.id === reviewKey.id : (c.ticker === reviewKey.ticker && c.closedAt === reviewKey.closedAt)))
    : null;

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

  // C2-D120 — closed-section status cell. `partially_allocated` deliberately uses the same
  // neutral "mute" tone as `unlinked`, NOT an amber/warning tone — leftover proceeds are a
  // legitimate, common outcome (real example: MRVL), not a mistake to flag.
  const closedStatusCell = (r) => {
    const targetLabel = (r.targets && r.targets.length === 1) ? r.targets[0] : ((r.targets || []).length + ' targets');
    const legacyNote = r.usingLegacyProceeds && (
      <MonoTxt size={10} color={t.faint} style={{ display: 'block', marginTop: 3 }}>
        This close predates real proceeds tracking — validating against an approximate figure ({eur(r.proceeds)}).
      </MonoTxt>
    );
    const incompleteNote = r.hasIncompleteLink && (
      <MonoTxt size={10} color={t.amber} style={{ display: 'block', marginTop: 3 }}>⚠ one link has no buy attached yet</MonoTxt>
    );
    if (r.status === 'untagged') {
      return <div><Chip2 tone="watch">untagged</Chip2>{legacyNote}{incompleteNote}</div>;
    }
    if (r.status === 'exit') {
      return <div><Chip2 tone="mute">exit</Chip2>{legacyNote}</div>;
    }
    if (r.status === 'fully_allocated') {
      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Chip2 tone="accent">fully allocated</Chip2>
            <MonoTxt size={11} color={t.dim}>→ {targetLabel}</MonoTxt>
          </div>
          {legacyNote}{incompleteNote}
        </div>
      );
    }
    // partially_allocated
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Chip2 tone="mute">partially allocated</Chip2>
          <MonoTxt size={11} color={t.dim}>→ {targetLabel} · {eur(r.gap)} left</MonoTxt>
        </div>
        {legacyNote}{incompleteNote}
      </div>
    );
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

      {/* C2-D120 — closed positions */}
      <section>
        <SecHead n="02" right={<MonoTxt size={10.5} color={t.faint}>{closedRows.length} CLOSED</MonoTxt>}>Closed positions</SecHead>

        {closedRows.length > 0 && (
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginTop: 12, marginBottom: 4 }}>
            {[['UNTAGGED', untaggedClosedCount, t.amber], ['PARTIALLY ALLOCATED', partiallyAllocatedCount, t.faint], ['FULLY ALLOCATED', fullyAllocatedCount, t.accent], ['EXIT', exitCount, t.faint]].map((row) => (
              <div key={row[0]} style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                <Money size={16} weight={700} color={row[2]}>{row[1]}</Money>
                <MonoTxt size={9} color={t.faint} style={{ letterSpacing: '0.1em' }}>{row[0]}</MonoTxt>
              </div>
            ))}
          </div>
        )}

        {closedRows.length === 0 ? (
          <div style={{ marginTop: 14, padding: '26px 22px', border: `1px dashed ${t.hairStrong}`, borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: t.faint, lineHeight: 1.5 }}>No closed positions yet.</div>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '8px 8px', borderBottom: `1px solid ${t.hair}` }}>
              {['Instrument', 'Detail', 'Status', ''].map((h, i) => (
                <span key={i} style={{ fontFamily: t.mono, fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.ghost, textAlign: i === 3 ? 'right' : 'left' }}>{h}</span>
              ))}
            </div>
            {closedRows.map((r, idx) => (
              <div key={(r.id || (r.ticker + '_' + r.closedAt))} className="f2-row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: `${t.rowPadY + 2}px 8px`, alignItems: 'center', borderTop: idx === 0 ? 'none' : `1px solid ${t.hair}`, borderRadius: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ fontFamily: t.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: t.dim, border: `1px solid ${t.hairStrong}`, borderRadius: 4, padding: '2px 5px' }}>CLS</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>{r.ticker}</div>
                    <MonoTxt size={10} color={t.faint} style={{ display: 'block', marginTop: 1 }}>{r.closedAt}</MonoTxt>
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <Money size={13.5} weight={700}>{r.proceeds != null ? eur(r.proceeds) : '—'}</Money>
                    <MonoTxt size={9.5} color={t.ghost} style={{ letterSpacing: '0.1em' }}>PROCEEDS</MonoTxt>
                  </div>
                  {r.status !== 'untagged' && r.status !== 'exit' && (
                    <MonoTxt size={11} color={t.dim} style={{ display: 'block', marginTop: 2 }}>{eur(r.linkedSum)} linked</MonoTxt>
                  )}
                </div>
                <div>{closedStatusCell(r)}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Btn2 onClick={() => setReviewKey(r.id ? { id: r.id } : { ticker: r.ticker, closedAt: r.closedAt })} style={{ padding: '6px 12px', fontSize: 12 }}>Edit</Btn2>
                </div>
              </div>
            ))}
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

      {/* C2-D120 — shared C2-S7/S8 editor (modal), reused as-is */}
      <ClosedReviewModal2 entry={reviewEntry} onClose={() => setReviewKey(null)} />
    </div>
  );
}

window.RotationsTab2 = RotationsTab2;
