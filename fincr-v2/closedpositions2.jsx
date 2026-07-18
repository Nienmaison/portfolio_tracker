/* Fincr 2.0 — Closed positions list + sell_type tagging + rotation linking
   (C2-S7 tagging, C2-S8 linking; decisions C2-D69/70/71).
   Primary purpose: tag historical closes with sell_type AND, for rotations, link
   the close to the specific subsequent buy transaction(s) the proceeds funded.
   Reads:  useStore2().closed (closed entries), useStore2().holdings (buy txns live
           on each holding's .txns array — there is NO separate transaction store),
           F.unlinkedRotationCount (set in store2.jsx totals).
   Writes: store.actions.editClosedPosition(ticker, { sell_type, conviction_retained,
             rotated_into, rotation_links }, entry.id)  — id passed for C2-D113 stable
             matching (falls back to ticker for legacy entries with no id)
           store.actions.addRotatedFromToTxn(ticker, txnId, { source_ticker,
             source_closed_at, portion_eur })  — forward link on the buy txn. */

// Human-readable label for a sell_type value. '—' when untagged.
function sellTypeLabel(st) {
  if (st === 'rotate') return 'Rotate';
  if (st === 'exit') return 'Exit';
  return '—';
}

// ── RotationLinkPicker2 (C2-S8) ───────────────────────────────────────────────
// Shown in both the close modal (drawer2 CloseForm2) and the review modal below
// when sell_type === 'rotate' and a target ticker is set. Lets the owner link the
// rotation to the specific buy transaction(s) it funded — picked from the target
// ticker's existing buys (no data re-entry). Defined at top level so drawer2.jsx
// (loaded later, same global scope) can reference it by bare name.
//
// Data source note: transactions are NOT in a separate localStorage key — they
// live as .txns arrays on each holding. We read the target ticker's buys from
// useStore2().holdings. If the target is not currently held, the list is empty
// and the owner saves "without link" (resolves later).
function RotationLinkPicker2({ targetTicker, closedAt, grossProceeds, usingLegacyProceeds, initialLinks, onChange }) {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const [showAll, setShowAll] = React.useState(false);

  const targetHolding = (store.holdings || []).find((h) => h.ticker === targetTicker);
  const allBuys = ((targetHolding && targetHolding.txns) || []).filter((tx) => tx.kind === 'buy');

  // ±30 day window around the close date unless "Show all" is on.
  const closeMs = new Date(closedAt + 'T00:00:00').getTime();
  const WINDOW_MS = 30 * 86400000;
  const inWindow = allBuys.filter((tx) => {
    const d = new Date(tx.date + 'T00:00:00').getTime();
    return isFinite(d) && Math.abs(d - closeMs) <= WINDOW_MS;
  });
  const buys = (showAll ? allBuys : inWindow).slice().sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  const hiddenCount = allBuys.length - inWindow.length;

  const txnValue = (tx) => tx.qty * tx.price;

  // Seed selection from initialLinks ONCE (review re-edit). Only seed links whose
  // target_ticker matches — guards against stale ids if the owner changed ticker.
  const seed = React.useRef(null);
  if (seed.current === null) {
    const sel = {}, por = {};
    (initialLinks || []).forEach((l) => {
      if (l.target_txn_id && l.target_ticker === targetTicker) {
        sel[l.target_txn_id] = true;
        if (l.portion_eur != null) por[l.target_txn_id] = String(l.portion_eur);
      }
    });
    seed.current = { sel, por };
  }
  const [selected, setSelected] = React.useState(seed.current.sel);
  const [portions, setPortions] = React.useState(seed.current.por);

  const buildLinks = (sel, por) => Object.keys(sel).filter((id) => sel[id]).map((id) => {
    const tx = allBuys.find((b) => b.id === id);
    const raw = (por[id] != null && por[id] !== '') ? parseFloat(por[id]) : (tx ? txnValue(tx) : 0);
    return { target_ticker: targetTicker, target_txn_id: id, portion_eur: isNaN(raw) ? 0 : raw };
  });

  const emit = (sel, por) => {
    const links = buildLinks(sel, por);
    const sum = links.reduce((s, l) => s + (l.portion_eur || 0), 0);
    const valid = grossProceeds == null || sum <= grossProceeds + 0.5; // €0.50 epsilon
    onChange(links, valid, sum);
  };

  // Emit the seeded selection once on mount (deps [] — no re-emit loop).
  React.useEffect(() => { emit(selected, portions); }, []);

  const toggle = (id) => { const next = { ...selected, [id]: !selected[id] }; setSelected(next); emit(next, portions); };
  const setPortion = (id, v) => { const next = { ...portions, [id]: v }; setPortions(next); emit(selected, next); };

  const currentSum = buildLinks(selected, portions).reduce((s, l) => s + (l.portion_eur || 0), 0);
  const overLimit = grossProceeds != null && currentSum > grossProceeds + 0.5;

  const linkBtn = (label, onClick) => (
    <button onClick={onClick} className="f2-press"
      style={{ fontFamily: t.mono, fontSize: 10.5, fontWeight: 600, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
      {label}
    </button>
  );

  return (
    <div style={{ marginTop: 4, padding: '12px 13px', background: t.amberSoft, borderRadius: 9 }}>
      <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em', display: 'block', marginBottom: 3 }}>ROTATED INTO BUY TRANSACTION(S)</MonoTxt>
      <MonoTxt size={11} color={t.dim} style={{ display: 'block', marginBottom: 10 }}>Which {targetTicker || '—'} buy(s) did this rotation fund?</MonoTxt>

      {buys.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <MonoTxt size={11} color={t.faint}>
            No {targetTicker || ''} buys {showAll ? 'in your ledger' : 'within 30 days of the close'}. Save to tag without a link — you can link it later.
          </MonoTxt>
          {!showAll && hiddenCount > 0 && linkBtn('Show all buys (' + hiddenCount + ' more)', () => setShowAll(true))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {buys.map((tx) => {
            const on = !!selected[tx.id];
            return (
              <div key={tx.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(tx.id)} style={{ accentColor: t.accent, width: 14, height: 14, flexShrink: 0 }} />
                  <MonoTxt size={11} color={t.dim} style={{ width: 80, flexShrink: 0 }}>{tx.date}</MonoTxt>
                  <MonoTxt size={11} color={t.ink} style={{ flex: 1 }}>{tx.qty} @ {F.eur(tx.price, 2)}</MonoTxt>
                  <Money size={11.5} weight={600}>{F.eur(txnValue(tx))}</Money>
                </label>
                {on && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 23 }}>
                    <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.1em' }}>PORTION</MonoTxt>
                    <div style={{ width: 130 }}>
                      <NumberField2 value={portions[tx.id] != null ? portions[tx.id] : String(txnValue(tx))} onChange={(v) => setPortion(tx.id, v)} prefix="€" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!showAll && hiddenCount > 0 && linkBtn('Show all buys (' + hiddenCount + ' more)', () => setShowAll(true))}
        </div>
      )}

      {overLimit && (
        <MonoTxt size={10.5} color={t.red} style={{ display: 'block', marginTop: 8 }}>
          Linked portions ({F.eur(currentSum)}) exceed rotation proceeds ({F.eur(grossProceeds)}).
        </MonoTxt>
      )}
      {usingLegacyProceeds && (
        // C2-D114: this entry predates the real `proceeds` field -- validating against the
        // qty*sellPrice fallback instead (qty is the CLOSED position's residual, not the
        // amount sold, so this number can be wrong for an old auto-closed entry). Surfaced
        // so a future "why won't this save" isn't a repeat mystery.
        <MonoTxt size={10.5} color={t.faint} style={{ display: 'block', marginTop: 8 }}>
          This close predates real proceeds tracking — validating against an approximate figure ({F.eur(grossProceeds)}).
        </MonoTxt>
      )}
    </div>
  );
}

// ── RotationDestinationBlocks2 (C2-D115 Part B) ───────────────────────────────
// Multi-target wrapper around RotationLinkPicker2. Replaces a single "ROTATED INTO"
// string with a repeatable list of independent destination blocks -- each with its own
// ticker + its own RotationLinkPicker2 -- so adding a second destination no longer
// requires abandoning any other already-linked one. Confirmed via direct code trace
// (not assumed) that the old single-string binding + key={targetTicker} remount meant
// changing the ticker and saving replaced the ENTIRE rotation_links array with only the
// new ticker's selections -- the exact risk that would have silently destroyed MRVL's
// real, saved CEG link the moment NOK was added the naive way.
//
// Seeds one block per distinct target_ticker already present in `initialLinks` (grouped),
// so a pre-existing single-target link -- or a multi-target one, post this fix -- always
// reopens with its blocks correctly pre-populated (no data migration needed anywhere:
// rotation_links was already an array).
//
// Cross-block proceeds validation: each block gets a shrinking "remaining budget"
// (totalProceeds minus every OTHER block's own current sum) as its own RotationLinkPicker2
// grossProceeds prop -- so each block's EXISTING, UNMODIFIED overLimit/currentSum math
// (nothing inside RotationLinkPicker2 itself changed) validates against what's actually
// still available, not the full total every time. A block with a ticker typed but no
// specific buy(s) picked still gets an unlinked placeholder entry (the same "save to tag
// without a link, resolve later" behavior a single-target flow has always had), sized to
// that block's own remaining budget.
//
// Emits the combined links array (all blocks concatenated) + combined validity via
// onChange -- the exact 2-arg shape callers already consumed from a single
// RotationLinkPicker2 before this change, so no caller-side signature churn.
function RotationDestinationBlocks2({ initialLinks, closedAt, totalProceeds, usingLegacyProceeds, onChange }) {
  const t = useTheme2();

  const seed = React.useRef(null);
  if (seed.current === null) {
    const byTicker = new Map();
    (initialLinks || []).forEach((l) => {
      if (!l || !l.target_ticker) return;
      const arr = byTicker.get(l.target_ticker) || [];
      arr.push(l);
      byTicker.set(l.target_ticker, arr);
    });
    const seeded = Array.from(byTicker.entries()).map(([ticker, links], i) => ({
      key: 'b' + i, ticker, initialLinks: links, links,
      sum: links.reduce((s, l) => s + (l.portion_eur || 0), 0), valid: true,
    }));
    seed.current = seeded.length ? seeded : [{ key: 'b0', ticker: '', initialLinks: [], links: [], sum: 0, valid: true }];
  }
  const [blocks, setBlocks] = React.useState(seed.current);
  const nextKeyIdx = React.useRef(seed.current.length);

  const emit = (bs) => {
    const links = bs.flatMap((b) => {
      const targetTicker = b.ticker.trim().toUpperCase();
      if (!targetTicker) return [];
      if (b.links.length > 0) return b.links;
      const otherSum = bs.reduce((s, ob) => s + (ob.key === b.key ? 0 : ob.sum), 0);
      const remaining = totalProceeds != null ? Math.max(0, totalProceeds - otherSum) : null;
      return [{ target_ticker: targetTicker, target_txn_id: null, portion_eur: remaining }];
    });
    // Combined validity is recomputed HERE, fresh, from every block's current `sum` --
    // NOT from `bs.every((b) => b.valid)`. A block's own RotationLinkPicker2 only
    // recalculates and re-reports its `valid` flag when ITS OWN selection changes, not when
    // a SIBLING block's allocation shrinks the remaining budget it was validated against --
    // trusting a per-block cached flag here would let a stale valid/invalid result survive a
    // sibling's change until that block happens to be touched again (found via direct testing
    // against the real deployed component, not assumed). A single combined-sum check against
    // `totalProceeds` sidesteps this: each block's own `sum` DOES stay live (it only changes
    // when that block's own picker changes), and an unlinked placeholder's portion is always
    // exactly "whatever's left" by construction (Math.max(0, ...) above), so it can never
    // itself cause an overflow -- only blocks with real picked/entered portions can, and
    // those are exactly what `sum` reflects.
    const totalSum = bs.reduce((s, b) => s + (b.sum || 0), 0);
    const valid = totalProceeds == null || totalSum <= totalProceeds + 0.5;
    onChange(links, valid);
  };

  // Emit the seeded state once on mount (deps [] — no re-emit loop; matches
  // RotationLinkPicker2's own equivalent mount-emit convention).
  React.useEffect(() => { emit(blocks); }, []);

  const updateBlock = (key, patch) => {
    const next = blocks.map((b) => (b.key === key ? { ...b, ...patch } : b));
    setBlocks(next);
    emit(next);
  };

  const addBlock = () => {
    const next = [...blocks, { key: 'b' + (nextKeyIdx.current++), ticker: '', initialLinks: [], links: [], sum: 0, valid: true }];
    setBlocks(next);
    emit(next);
  };

  const removeBlock = (key) => {
    const remaining = blocks.filter((b) => b.key !== key);
    const next = remaining.length ? remaining : [{ key: 'b' + (nextKeyIdx.current++), ticker: '', initialLinks: [], links: [], sum: 0, valid: true }];
    setBlocks(next);
    emit(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {blocks.map((b) => {
        const targetTicker = b.ticker.trim().toUpperCase();
        const otherSum = blocks.reduce((s, ob) => s + (ob.key === b.key ? 0 : ob.sum), 0);
        const remainingBudget = totalProceeds != null ? Math.max(0, totalProceeds - otherSum) : null;
        return (
          <div key={b.key} style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 11px', border: '1px solid ' + t.hair, borderRadius: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <TextField2 value={b.ticker} onChange={(v) => updateBlock(b.key, { ticker: v.toUpperCase() })} placeholder="TICKER" />
              </div>
              {blocks.length > 1 && (
                <TextBtn2 tone="danger" onClick={() => removeBlock(b.key)}>Remove</TextBtn2>
              )}
            </div>
            {targetTicker && (
              <RotationLinkPicker2
                key={targetTicker}
                targetTicker={targetTicker}
                closedAt={closedAt}
                grossProceeds={remainingBudget}
                usingLegacyProceeds={usingLegacyProceeds}
                initialLinks={b.initialLinks}
                onChange={(links, v, sum) => updateBlock(b.key, { links, valid: v, sum })}
              />
            )}
          </div>
        );
      })}
      <TextBtn2 onClick={addBlock}>+ Add another destination</TextBtn2>
    </div>
  );
}

// ── Review modal (C2-S7 tagging + C2-S8 linking) ──────────────────────────────
// Opened from the closed positions list. Transaction facts are read-only; the
// intent fields (sell_type / conviction_retained / rotated_into) are editable, and
// for rotations the RotationLinkPicker2 links the close to specific buy txns.
function ClosedReviewModal2({ entry, onClose }) {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const open = !!entry;

  const [sellType, setSellType] = React.useState(null);
  const [convRetained, setConvRetained] = React.useState(null);
  const [rotationLinks, setRotationLinks] = React.useState([]);
  const [rotationValid, setRotationValid] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!entry) return;
    setSellType(entry.sell_type || null);
    setConvRetained(entry.conviction_retained == null ? null : !!entry.conviction_retained);
    // C2-D115 Part B: rotatedInto (single string) is gone -- RotationDestinationBlocks2
    // now owns per-destination ticker state internally, seeded from entry.rotation_links
    // grouped by target_ticker (one block per distinct existing destination).
    setRotationLinks(entry.rotation_links || []);
    setRotationValid(true);
    setBusy(false);
  }, [entry]);

  if (!open) return null;

  const realized = Number(entry.realized) || 0;
  const up = realized >= 0;
  // C2-D114: entry.proceeds (real aggregate, materialized at close time) is the source of
  // truth. Older entries (closed before this fix) have no proceeds field -- fall back to the
  // old qty*sellPrice formula, same as today's behavior for them, and flag the fallback in
  // the UI so it's never a silent surprise.
  const usingLegacyProceeds = entry.proceeds == null;
  const grossProceeds = entry.proceeds != null
    ? entry.proceeds
    : (entry.sellPrice != null && entry.qty != null) ? entry.sellPrice * entry.qty : null;
  const isRotate = sellType === 'rotate';
  const valid = !!sellType && convRetained !== null && (!isRotate || rotationValid) && !busy;

  const save = () => {
    if (!valid) return;
    setBusy(true);
    // C2-D115 Part B: finalLinks now comes from ALL destination blocks combined (built and
    // maintained by RotationDestinationBlocks2's own onChange) -- not just one ticker's
    // selections, so adding a second destination never requires abandoning the first. The
    // legacy single `rotated_into` display field is kept, set to the first destination.
    const finalLinks = isRotate ? rotationLinks : [];
    const rotatedIntoVal = (finalLinks[0] && finalLinks[0].target_ticker) || null;
    // Reconcile the TARGET side via the shared three-way primitive (C2-D103): removes
    // rotated_from from buys DROPPED since the last save and adds/refreshes the new ones.
    // Replaces the old add-only forEach, which left a stale rotated_from orphan on relink
    // or clear (the pre-existing bug found while researching C2-D103). The source object
    // still gets its own rotation_links written via editClosedPosition below.
    store.actions.reconcileRotatedFrom(entry.rotation_links || [], finalLinks, {
      source_ticker: entry.ticker, source_closed_at: entry.closedAt,
    });
    store.actions.editClosedPosition(entry.ticker, {
      sell_type: sellType,
      conviction_retained: convRetained,
      rotated_into: rotatedIntoVal,
      rotation_links: finalLinks,
    }, entry.id);
    onClose();
  };

  return (
    <Modal2
      open={open}
      onClose={onClose}
      title="Review closed position"
      sub={'Tag how the capital moved when you closed ' + entry.ticker + '. For a rotation, link the buy(s) the proceeds funded.'}
      width={480}
      footer={
        <>
          {/* C2-D108 — Delete this closed record. Bottom-left (marginRight:auto) against
              Modal2's flex-end footer; native confirm() mirrors the open-position delete. */}
          <TextBtn2 tone="danger" style={{ marginRight: 'auto' }} onClick={() => {
            if (confirm('Delete this closed ' + entry.ticker + ' record?\n\nThis removes its realized P&L from your since-inception total. It does not affect True Return, total value, or idle cash.\n\nThis cannot be undone.')) {
              store.actions.deleteClosedPosition(entry.ticker, entry.closedAt, entry.id);
              onClose();
            }
          }}>Delete</TextBtn2>
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
        {isRotate && (
          <Field2 label="Rotated into" hint="one or more destinations">
            <RotationDestinationBlocks2
              key={entry.id || (entry.ticker + entry.closedAt)}
              initialLinks={entry.rotation_links}
              closedAt={entry.closedAt}
              totalProceeds={grossProceeds}
              usingLegacyProceeds={usingLegacyProceeds}
              onChange={(links, v) => { setRotationLinks(links); setRotationValid(v); }}
            />
          </Field2>
        )}
      </div>
    </Modal2>
  );
}

// ── Closed positions list (C2-S7 + C2-S8) ────────────────────────────────────
// Collapsed by default when all positions are tagged AND all rotations linked;
// expanded when any need attention (untagged, or rotation with an unlinked link).
function ClosedPositionsList2() {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const closed = (store && store.closed) || [];

  const untagged = closed.filter((c) => !c.sell_type).length;
  const unlinked = closed.filter((c) =>
    c.sell_type === 'rotate' &&
    (c.rotation_links && c.rotation_links.length > 0) &&
    c.rotation_links.some((l) => l.target_txn_id == null)
  ).length;

  const [collapsed, setCollapsed] = React.useState(untagged === 0 && unlinked === 0);
  const [reviewEntry, setReviewEntry] = React.useState(null);

  if (!closed.length) return null;

  // Resolve a linked txn's date from the target holding's ledger (display only).
  const txnDate = (link) => {
    const h = (store.holdings || []).find((x) => x.ticker === link.target_ticker);
    const tx = h && (h.txns || []).find((y) => y.id === link.target_txn_id);
    return tx ? tx.date : null;
  };

  // Build the SELL TYPE cell content + whether it needs attention (amber).
  const rotationCell = (c) => {
    if (c.sell_type === 'exit') return { text: 'Exit', attn: false };
    if (c.sell_type !== 'rotate') return { text: '—', attn: false };
    const links = c.rotation_links || [];
    const target = (links[0] && links[0].target_ticker) || c.rotated_into || '?';
    const linked = links.filter((l) => l.target_txn_id != null);
    if (linked.length === 0) return { text: 'Rotate → ' + target + ' (unlinked)', attn: true };
    if (linked.length === 1) {
      const l = linked[0];
      const d = txnDate(l);
      const portion = l.portion_eur != null ? F.eur(l.portion_eur) : '';
      const detail = [d, portion].filter(Boolean).join(', ');
      return { text: 'Rotate → ' + target + (detail ? ' (' + detail + ')' : ''), attn: false };
    }
    const sum = linked.reduce((s, l) => s + (l.portion_eur || 0), 0);
    return { text: 'Rotate → ' + target + ' ×' + linked.length + ' (' + F.eur(sum) + ')', attn: false };
  };

  // Combined attention banner.
  const warnParts = [];
  if (untagged > 0) warnParts.push(untagged + ' untagged');
  if (unlinked > 0) warnParts.push(unlinked + ' unlinked rotation' + (unlinked > 1 ? 's' : ''));
  const warnText = warnParts.join(' · ');

  const rowCols = '64px 88px 92px 1fr 52px';

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

      {warnText && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '8px 11px', background: t.amberSoft, borderRadius: 8 }}>
          <span style={{ color: t.amber, fontSize: 12 }}>⚠</span>
          <MonoTxt size={10.5} color={t.amber}>{warnText} — true return is partial</MonoTxt>
        </div>
      )}

      {!collapsed && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: rowCols, gap: 10, padding: '0 6px 6px' }}>
            {['TICKER', 'DATE', 'P&L', 'SELL TYPE', ''].map((h, i) => (
              <MonoTxt key={i} size={9.5} color={t.faint} style={{ letterSpacing: '0.12em', textAlign: i === 2 ? 'right' : 'left' }}>{h}</MonoTxt>
            ))}
          </div>
          {closed.map((c, i) => {
            const cell = rotationCell(c);
            const attn = !c.sell_type || cell.attn;
            const realized = Number(c.realized) || 0;
            const up = realized >= 0;
            return (
              <div key={c.ticker + '_' + c.closedAt + '_' + i}
                style={{
                  display: 'grid', gridTemplateColumns: rowCols, gap: 10, alignItems: 'center',
                  padding: '9px 6px', borderTop: '1px solid ' + t.hair,
                  borderLeft: attn ? '2px solid ' + t.amber : '2px solid transparent', paddingLeft: 8,
                }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: c.color || t.dim, flexShrink: 0 }}></span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>{c.ticker}</span>
                </span>
                <MonoTxt size={11} color={t.dim}>{c.closedAt}</MonoTxt>
                <Money size={12} weight={600} color={up ? t.green : t.red} style={{ textAlign: 'right' }}>{F.signed(realized)}</Money>
                <MonoTxt size={11} color={attn ? t.amber : t.dim} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell.text}</MonoTxt>
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

window.RotationLinkPicker2 = RotationLinkPicker2;
window.ClosedPositionsList2 = ClosedPositionsList2;
