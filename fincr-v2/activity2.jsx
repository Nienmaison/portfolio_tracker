/* Fincr 2.0 — Activity: unified sell ledger (C2-D163). Was Rotations
   (rotations2.jsx, C2-D104; closed-positions section C2-D120) — renamed per
   the owner's explicit choice ("Activity", not the mock's "Transactions").

   Data merge vs. presentation merge — deliberately NOT the same thing here.
   The data merge already existed: this file's own predecessor computed both
   open-position rotation status (f2ComputeRotationStatuses, store2.jsx) and
   closed-position rotation status (f2ComputeClosedRotationStatuses, below,
   C2-D120) in one component since C2-D120 shipped. What was missing, and
   what this build actually adds, is the PRESENTATION merge: one interleaved,
   date-sorted table instead of two separate sections. The two status
   functions themselves are UNCHANGED and stay genuinely separate (per the
   build spec, explicitly) — different vocabularies, different scopes
   (all holdings' sell txns vs. store.closed only), joined here only at
   render time into one row shape with a `kind` discriminator ('SEL'/'CLS').

   Row actions: SEL rows open the shared C2-D103 editor (SellRotationModal2,
   drawer2.jsx); CLS rows open the shared ClosedReviewModal2
   (closedpositions2.jsx) — both reused exactly as-is, no changes, same as
   the pre-rename file.
   Row click (outside the action button) opens DetailDrawer2 (C2-D161,
   already shared with Watchlist's row drawer) — not a third drawer
   implementation.
   Exports window.ActivityTab2. */

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
   "is there enough money accounted for" vs. "is this specific link still a placeholder").
   UNCHANGED from rotations2.jsx — moved verbatim, per this build's explicit "do not merge
   the two status functions" instruction. */
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

// Status cell for a SEL row — unchanged logic/tones from rotations2.jsx's statusCell.
function activitySelStatusCell(r, t) {
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
}

// Status cell for a CLS row — unchanged logic/tones from rotations2.jsx's
// closedStatusCell. `partially_allocated` deliberately stays the same neutral
// "mute" tone as `unlinked` — leftover proceeds are a legitimate, common
// outcome (real example: MRVL), not a mistake to flag amber.
function activityClsStatusCell(r, t) {
  if (r.status === 'untagged') return <Chip2 tone="watch">untagged</Chip2>;
  if (r.status === 'exit') return <Chip2 tone="mute">exit</Chip2>;
  if (r.status === 'fully_allocated') return <Chip2 tone="accent">fully allocated</Chip2>;
  return <Chip2 tone="mute">partially allocated</Chip2>; // partially_allocated
}

function ActivityTab2() {
  const t = useTheme2();
  const store = useStore2();
  const F = window.FINCR;
  const [openSell, setOpenSell] = React.useState(null); // { sellTicker, sellTxnId, suggested? }
  const [reviewKey, setReviewKey] = React.useState(null); // { id } or { ticker, closedAt } for legacy
  const [drawerKey, setDrawerKey] = React.useState(null); // unified row `key`, for DetailDrawer2
  const [filter, setFilter] = React.useState('all'); // all | attention | closed

  // ---- open-position partial-sell rows — UNCHANGED computation from rotations2.jsx ----
  const statuses = (typeof window.f2ComputeRotationStatuses === 'function')
    ? window.f2ComputeRotationStatuses(store.holdings) : [];
  const byId = {};
  statuses.forEach((s) => { byId[s.sellTxnId] = s; });
  const sellRows = [];
  (store.holdings || []).forEach((h) => (h.txns || []).forEach((tx) => {
    if (tx.kind !== 'sell') return;
    const st = byId[tx.id] || { status: 'unlinked' };
    sellRows.push({ ticker: h.ticker, color: h.color, tx: tx, status: st.status, targets: st.targets, suggested: st.suggested });
  }));

  // Live tx for the editor (kept fresh from the store, not the click-time snapshot).
  const editing = openSell
    && ((store.holdings || []).find((h) => h.ticker === openSell.sellTicker) || {}).txns;
  const editingTx = editing ? editing.find((x) => x.id === openSell.sellTxnId) : null;

  // ---- closed-position rows — UNCHANGED computation ----
  const closedStatuses = f2ComputeClosedRotationStatuses(store.closed);
  const reviewEntry = reviewKey
    ? (store.closed || []).find((c) => (reviewKey.id ? c.id === reviewKey.id : (c.ticker === reviewKey.ticker && c.closedAt === reviewKey.closedAt)))
    : null;

  const eur = (n, d) => F.eur(n, d);

  // ---- the actual presentation merge: one row shape, one array, most-recent-first ----
  // Realised, per row kind (per spec):
  //   CLS uses the existing closed-position realised euro/percent figures
  //   (c.realized, and the same (sellPrice-avgCost)/avgCost*100 history2.jsx
  //   already computes for this exact table).
  //   SEL uses tx.realized_gain — the per-transaction figure materialized at
  //   write time (C2-D97, store2.jsx), NOT the holding's aggregate `.realized`
  //   (which sums every sell for that ticker and would misattribute on a
  //   holding with more than one partial sell). No percent exists for a
  //   partial sell anywhere in this codebase today — history2.jsx's own
  //   "REALIZED ON OPEN POSITIONS" block shows the euro figure only, never a
  //   percent — so `pct: null` here carries forward an existing absence,
  //   not a new gap. avgCost/heldDays are genuinely undefined for an open
  //   position (there is no single "opened at" for an ongoing holding) —
  //   rendered honestly as "—" in the drawer, not fabricated.
  const unified = [];
  sellRows.forEach((r) => {
    const tx = r.tx;
    const proceeds = (tx.proceeds != null) ? tx.proceeds : tx.qty * tx.price;
    unified.push({
      key: 'sel_' + tx.id, kind: 'SEL',
      ticker: r.ticker, color: r.color, date: tx.date,
      qty: tx.qty, price: tx.price, proceeds: proceeds,
      realized: tx.realized_gain != null ? tx.realized_gain : null, pct: null,
      status: r.status, targets: r.targets, suggested: r.suggested,
      avgCost: null, heldDays: null,
      needsLinking: r.status === 'unlinked',
      onAction: () => setOpenSell({ sellTicker: r.ticker, sellTxnId: tx.id, suggested: r.suggested }),
      statusCell: () => activitySelStatusCell(r, t),
    });
  });
  closedStatuses.forEach((r) => {
    const c = r.entry;
    const pct = c.avgCost > 0 ? (c.sellPrice - c.avgCost) / c.avgCost * 100 : 0;
    unified.push({
      key: 'cls_' + (c.id || (c.ticker + '_' + c.closedAt)), kind: 'CLS',
      ticker: c.ticker, color: c.color, date: c.closedAt,
      qty: c.qty, price: c.sellPrice, proceeds: r.proceeds,
      realized: c.realized, pct: pct,
      status: r.status, targets: r.targets,
      avgCost: c.avgCost, heldDays: daysBetween(c.openedAt, c.closedAt), // daysBetween: history2.jsx, loaded earlier, global scope
      needsLinking: r.status === 'untagged',
      onAction: () => setReviewKey(c.id ? { id: c.id } : { ticker: c.ticker, closedAt: c.closedAt }),
      statusCell: () => activityClsStatusCell(r, t),
    });
  });
  unified.sort((a, b) => (a.date < b.date ? 1 : (a.date > b.date ? -1 : 0)));

  const attentionRows = unified.filter((r) => r.needsLinking);
  const closedOnlyRows = unified.filter((r) => r.kind === 'CLS');
  const visibleRows = filter === 'attention' ? attentionRows : filter === 'closed' ? closedOnlyRows : unified;

  // ---- stat strip — real computed figures, not hardcoded ----
  const closedRealizedTotal = (store.closed || []).reduce((s, c) => s + (Number(c.realized) || 0), 0);
  const openRealizedTotal = (F.holdings || []).reduce((s, h) => s + (Number(h.realized) || 0), 0);
  const allTimeRealized = closedRealizedTotal + openRealizedTotal;

  const drawerRow = drawerKey ? unified.find((r) => r.key === drawerKey) : null;

  const cols = '160px 1fr 120px 210px 90px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {/* header — title/sub/segmented filter, same convention as other pages'
          headers (19px/600 title, mono 10.5px/0.14em uppercase faint sub) */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', color: t.ink }}>Activity</h1>
        <MonoTxt size={10.5} color={t.faint} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', paddingBottom: 2 }}>{sellRows.length} SELLS · {closedStatuses.length} CLOSED POSITIONS</MonoTxt>
        <div style={{ flex: 1 }}></div>
        <div style={{ display: 'inline-flex', gap: 2, padding: 3, border: `1px solid ${t.hair}`, borderRadius: 9, background: t.hover }}>
          {[['all', 'All', unified.length], ['attention', 'Needs linking', attentionRows.length], ['closed', 'Closed', closedOnlyRows.length]].map(([id, label, count]) => (
            <button key={id} onClick={() => setFilter(id)} className="f2-press"
              style={{ fontFamily: t.mono, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: filter === id ? t.ink : t.faint, background: filter === id ? t.press : 'transparent', border: 'none', borderRadius: 7, padding: '6px 11px', cursor: 'pointer', transition: 'all 0.14s' }}
            >{label} · {count}</button>
          ))}
        </div>
      </div>
      <p style={{ margin: '-14px 0 0', fontSize: 12, color: t.ghost, lineHeight: 1.5, maxWidth: 640 }}>
        Closed positions and partial-sell rotations were two views of one event — a sell. This is one chronological ledger: every sell, what it realised, and where the proceeds went.
      </p>

      {/* stat strip — mono 19px figures, mono 9px uppercase labels */}
      <div style={{ display: 'flex', gap: 34, flexWrap: 'wrap' }}>
        {[
          ['REALISED, ALL TIME', F.signed(allTimeRealized), allTimeRealized >= 0 ? t.green : t.red],
          ['FROM CLOSED POSITIONS', F.signed(closedRealizedTotal), t.ink],
          ['FROM PARTIAL SELLS', F.signed(openRealizedTotal), t.ink],
          ['NEED LINKING', String(attentionRows.length), t.amber],
        ].map(([label, value, color]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: t.mono, fontSize: 19, fontWeight: 600, color: color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            <MonoTxt size={9} color={t.faint} style={{ letterSpacing: '0.13em' }}>{label}</MonoTxt>
          </div>
        ))}
      </div>

      {/* unified table */}
      {visibleRows.length === 0 ? (
        <div style={{ padding: '26px 22px', border: `1px dashed ${t.hairStrong}`, borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: t.faint, lineHeight: 1.5 }}>Nothing in this view.</div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '0 8px 9px' }}>
            {['Instrument', 'Detail', 'Realised', 'Rotation', ''].map((h, i) => (
              <span key={i} style={{ fontFamily: t.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.faint, textAlign: i === 2 ? 'right' : 'left' }}>{h}</span>
            ))}
          </div>
          {visibleRows.map((r) => (
            <div key={r.key} className="f2-row" onClick={() => setDrawerKey(r.key)}
              style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '12px 8px', alignItems: 'center', borderTop: `1px solid ${t.hair}`, borderRadius: 6, cursor: 'pointer' }}>
              {/* Instrument — badge (unchanged styling from rotations2.jsx's
                  own SEL/CLS badges) + ticker + date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {r.kind === 'SEL' ? (
                  <span style={{ fontFamily: t.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: t.red, border: `1px solid ${t.redSoft}`, background: t.redSoft, borderRadius: 4, padding: '2px 5px' }}>SEL</span>
                ) : (
                  <span style={{ fontFamily: t.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: t.dim, border: `1px solid ${t.hairStrong}`, borderRadius: 4, padding: '2px 5px' }}>CLS</span>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{r.ticker}</div>
                  <MonoTxt size={11} color={t.faint} style={{ display: 'block', marginTop: 1 }}>{r.date}</MonoTxt>
                </div>
              </div>
              {/* Detail — qty @ price, then proceeds + label */}
              <div style={{ minWidth: 0 }}>
                <MonoTxt size={11.5} color={t.dim}>{r.qty} @ {eur(r.price, r.price < 10 ? 4 : 2)}</MonoTxt>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 2 }}>
                  <Money size={13.5} weight={700}>{r.proceeds != null ? eur(r.proceeds) : '—'}</Money>
                  <MonoTxt size={9.5} color={t.ghost} style={{ letterSpacing: '0.1em' }}>PROCEEDS</MonoTxt>
                </div>
              </div>
              {/* Realised — signed euro, signed pct below (CLS only — no
                  percent exists for a partial sell, see comment above) */}
              <div style={{ textAlign: 'right' }}>
                {r.realized != null ? (
                  <React.Fragment>
                    <Money size={13} weight={600} color={r.realized >= 0 ? t.green : t.red} style={{ display: 'block' }}>{F.signed(r.realized)}</Money>
                    {r.pct != null && <span style={{ display: 'inline-flex', justifyContent: 'flex-end', width: '100%' }}><Delta2 pct={r.pct} size={10.5} /></span>}
                  </React.Fragment>
                ) : <MonoTxt size={12.5} color={t.faint}>—</MonoTxt>}
              </div>
              {/* Rotation — status chip + target, unchanged from the two
                  separate cells rotations2.jsx already had */}
              <div>{r.statusCell()}</div>
              {/* Action — Link when untagged/unlinked, Edit otherwise. Opens
                  the same modal either way, with the same `suggested` prefill
                  a SEL row's auto-match always carried — only the table's
                  own button label/styling collapses to this simpler two-state
                  convention (was a 3-way Edit-link/Review/Link distinction
                  pre-merge); the modal itself is untouched and still shows
                  the full review UI when a suggested match exists. */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn2 onClick={(e) => { e.stopPropagation(); r.onAction(); }} style={{ padding: '6px 12px', fontSize: 12 }}>
                  {r.needsLinking ? 'Link' : 'Edit'}
                </Btn2>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* row-click drawer — DetailDrawer2 (C2-D161), shared with Watchlist's
          row drawer, no third implementation. Avg cost / sold at / hold time
          live here ONLY — no inline table column shows them, matching the
          spec's explicit "detail-view content now, not always-visible
          columns" instruction. */}
      <DetailDrawer2 open={!!drawerRow} onClose={() => setDrawerKey(null)} title={drawerRow ? drawerRow.ticker + ' · ' + (drawerRow.kind === 'SEL' ? 'partial sell' : 'closed position') : ''}>
        {drawerRow && (
          <React.Fragment>
            <div>
              <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>The sell</MonoTxt>
              {[
                ['Date', drawerRow.date],
                ['Quantity', String(drawerRow.qty)],
                ['Avg cost', drawerRow.avgCost != null ? eur(drawerRow.avgCost, 2) : '—'],
                ['Sold at', eur(drawerRow.price, drawerRow.price < 10 ? 4 : 2)],
                ['Hold time', drawerRow.heldDays != null ? humanSpan(drawerRow.heldDays) : '—'], // humanSpan: history2.jsx, global scope
                ['Proceeds', drawerRow.proceeds != null ? eur(drawerRow.proceeds) : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderTop: `1px solid ${t.hair}`, fontSize: 12.5, color: t.dim }}>
                  <span>{label}</span><span style={{ fontFamily: t.mono, color: t.ink, whiteSpace: 'nowrap' }}>{value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderTop: `1px solid ${t.hair}`, fontSize: 12.5, color: t.dim }}>
                <span>Realised</span>
                <span style={{ fontFamily: t.mono, color: drawerRow.realized == null ? t.ink : (drawerRow.realized >= 0 ? t.green : t.red), whiteSpace: 'nowrap' }}>
                  {drawerRow.realized != null ? F.signed(drawerRow.realized) + (drawerRow.pct != null ? ' (' + (drawerRow.pct >= 0 ? '+' : '−') + Math.abs(drawerRow.pct).toFixed(1) + '%)' : '') : '—'}
                </span>
              </div>
            </div>
            <div>
              <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Rotation</MonoTxt>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderTop: `1px solid ${t.hair}`, fontSize: 12.5, color: t.dim }}>
                <span>Status</span><span style={{ fontFamily: t.mono, color: t.ink, whiteSpace: 'nowrap' }}>{drawerRow.status.replace('_', ' ')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderTop: `1px solid ${t.hair}`, fontSize: 12.5, color: t.dim }}>
                <span>Funded</span><span style={{ fontFamily: t.mono, color: t.ink, whiteSpace: 'nowrap' }}>{(drawerRow.targets && drawerRow.targets.length) ? drawerRow.targets.join(', ') : '—'}</span>
              </div>
            </div>
            <button className="f2-press" onClick={() => { const r = drawerRow; setDrawerKey(null); r.onAction(); }}
              style={{ alignSelf: 'flex-start', fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >{drawerRow.needsLinking ? 'Link the proceeds →' : 'Edit this link →'}</button>
          </React.Fragment>
        )}
      </DetailDrawer2>

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

window.ActivityTab2 = ActivityTab2;
