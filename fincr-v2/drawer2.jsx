/* Fincr 2.0 — Position drawer. Opens from any ledger row. Shows the cost-basis
   story, the full transaction ledger (add / edit / remove buys & sells, avg cost
   recomputed live), and the Close-position flow that captures a sell price and
   the realized P&L. Exports window.PositionDrawer2. */

// Scaffold sentinel written by sync_thesis_with_holdings (api.py); means a holding
// has no authored thesis yet. Em-dash, not a hyphen. (C2-S3)
const THESIS_SENTINEL = "Position opened via dashboard \u2014 thesis details pending.";

/* SellRotationModal2 (C2-D103) — manual rotation-link editor for a partial-sell txn.
   The sell is the SOURCE; the reused, source-agnostic RotationLinkPicker2 (closedpositions2.jsx)
   picks the target buy(s) — it already offers a proximity default + "Show all buys" unbounded
   search, so this is NOT limited to the C2-D102 14-day/10% gates. Hosted in a Modal2 (not
   inline) so the ledger row stays compact when the picker expands. Save reconciles the target
   side via the shared reconcileRotatedFrom (removes stale reverse-links, adds new) AND writes
   the sell's own rotation_links via editTxn (f2StripMaterializedSell leaves rotation_links
   untouched — C2-D97). "Clear link" unlinks entirely (empty rotation_links + reverse removed). */
function SellRotationModal2({ open, tx, ticker, onClose, suggested }) {
  const t = useTheme2();
  const store = useStore2();
  const initialLinks = (tx && tx.rotation_links) || [];
  const hadLink = initialLinks.length > 0;
  const proceeds = tx ? ((tx.proceeds != null) ? tx.proceeds : tx.qty * tx.price) : 0;
  // C2-D104: in the page's "Review" flow, `suggested` = { buyTicker, buyTxnId } pre-fills
  // the picker with the auto-match so the owner can confirm/adjust/dismiss. Only applies
  // when the sell has no confirmed link yet.
  const reviewing = !!(suggested && !hadLink);
  // C2-D115 Part B: rotatedInto (single string) is gone -- RotationDestinationBlocks2 now
  // owns per-destination ticker state internally.
  const [links, setLinks] = React.useState(initialLinks);
  const [valid, setValid] = React.useState(true);
  React.useEffect(() => {
    if (!open) return;
    const il = (tx && tx.rotation_links) || [];
    if (suggested && il.length === 0) {
      const p = (tx.proceeds != null) ? tx.proceeds : tx.qty * tx.price;
      setLinks([{ target_ticker: suggested.buyTicker, target_txn_id: suggested.buyTxnId, portion_eur: p }]);
    } else {
      setLinks(il);
    }
    setValid(true);
  }, [open, tx && tx.id, suggested && suggested.buyTxnId]);
  if (!open || !tx) return null;
  const F = window.FINCR;
  const source = { source_ticker: ticker, source_closed_at: tx.date };
  const pickerInitial = reviewing
    ? [{ target_ticker: suggested.buyTicker, target_txn_id: suggested.buyTxnId, portion_eur: proceeds }]
    : initialLinks;
  const commit = (finalLinks) => {
    store.actions.reconcileRotatedFrom(tx.rotation_links || [], finalLinks, source);
    store.actions.editTxn(ticker, tx.id, { rotation_links: finalLinks });
    onClose();
  };
  const dismiss = () => {
    store.actions.dismissRotationCandidate(ticker, tx.id, suggested.buyTicker, suggested.buyTxnId);
    onClose();
  };
  return (
    <Modal2
      open={open}
      onClose={onClose}
      width={480}
      title="Rotation link"
      sub={reviewing
        ? 'Fincr suggests this ' + ticker + ' sell funded ' + suggested.buyTicker + ' — confirm, adjust the buy(s), or dismiss.'
        : 'Which buy(s) did this ' + ticker + ' sell fund? Not limited to 14 days — use "Show all buys" for older targets.'}
      footer={
        <>
          {hadLink && <Btn2 onClick={() => commit([])} style={{ borderColor: t.red, color: t.red, marginRight: 'auto' }}>Clear link</Btn2>}
          {reviewing && <Btn2 onClick={dismiss} style={{ marginRight: 'auto' }}>Dismiss</Btn2>}
          <Btn2 onClick={onClose}>Cancel</Btn2>
          <Btn2 primary onClick={() => commit(links)} style={{ opacity: valid ? 1 : 0.4, pointerEvents: valid ? 'auto' : 'none' }}>Save</Btn2>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>SOLD</MonoTxt>
          <MonoTxt size={11} color={t.dim}>{tx.date} · {tx.qty} @ {F.eur(tx.price, 2)} · proceeds {F.eur(proceeds)}</MonoTxt>
        </div>
        <Field2 label="Rotated into" hint="one or more destinations">
          <RotationDestinationBlocks2
            key={tx.id}
            initialLinks={pickerInitial}
            closedAt={tx.date}
            totalProceeds={proceeds}
            onChange={(l, v) => { setLinks(l); setValid(v); }}
          />
        </Field2>
      </div>
    </Modal2>
  );
}

function TxnRow2({ ticker, tx, avgCost }) {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const [edit, setEdit] = React.useState(false);
  const [rotOpen, setRotOpen] = React.useState(false); // C2-D103 — rotation-link editor modal
  const [d, setD] = React.useState({ date: tx.date, qty: String(tx.qty), price: String(tx.price) });
  React.useEffect(() => { setD({ date: tx.date, qty: String(tx.qty), price: String(tx.price) }); }, [tx.id, tx.qty, tx.price, tx.date]);
  const buy = tx.kind === 'buy';
  const save = () => {
    store.actions.editTxn(ticker, tx.id, { date: d.date, qty: parseFloat(d.qty), price: parseFloat(d.price) });
    setEdit(false);
  };

  if (edit) {
    const rotLinks = (tx.rotation_links || []);
    return (
      <React.Fragment>
        <div style={{ borderTop: `1px solid ${t.hair}`, padding: '11px 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.8fr 1fr', gap: 8 }}>
            <TextField2 value={d.date} onChange={(v) => setD((s) => ({ ...s, date: v }))} mono />
            <NumberField2 value={d.qty} onChange={(v) => setD((s) => ({ ...s, qty: v }))} placeholder="qty" />
            <NumberField2 value={d.price} onChange={(v) => setD((s) => ({ ...s, price: v }))} prefix="€" onEnter={save} />
          </div>
          {/* C2-D103 — rotation link editor, sell rows only (a sell is a rotation SOURCE;
              a buy is a target, never gets this). Opens the shared modal editor. */}
          {tx.kind === 'sell' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '1px 2px' }}>
              <MonoTxt size={10.5} color={rotLinks.length ? t.dim : t.faint}>
                {rotLinks.length ? 'Rotated into ' + rotLinks.map((l) => l.target_ticker).join(', ') : 'No rotation link'}
              </MonoTxt>
              <TextBtn2 tone="accent" onClick={() => setRotOpen(true)}>{rotLinks.length ? 'Edit link' : 'Link rotation'}</TextBtn2>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <TextBtn2 tone="danger" onClick={() => store.actions.removeTxn(ticker, tx.id)}>Remove</TextBtn2>
            <span style={{ display: 'flex', gap: 6 }}>
              <TextBtn2 onClick={() => setEdit(false)}>Cancel</TextBtn2>
              <Btn2 primary onClick={save} style={{ padding: '6px 12px' }}>Save</Btn2>
            </span>
          </div>
        </div>
        <SellRotationModal2 open={rotOpen} tx={tx} ticker={ticker} onClose={() => setRotOpen(false)} />
      </React.Fragment>
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

// C2-D122 — uniform candidate identity regardless of kind. Open-sell candidates key on
// their txnId; closed-position candidates carry no txnId at all (per f2FindRotationCandidates,
// store2.jsx) — they key on closedId, a string id or a serialized ticker+closedAt for
// legacy entries with no id. Used everywhere a candidate needs a stable checkbox/list key.
function f2RotCandidateKey(c) {
  if (c.kind === 'closed') {
    return 'closed:' + (c.closedId && typeof c.closedId === 'object' ? (c.closedId.ticker + '|' + c.closedId.closedAt) : c.closedId);
  }
  return 'sell:' + c.txnId;
}

/* RotationProposalCard2 (C2-D102; extended C2-D122 for closed-position candidates) —
   dismissible "did a recent sell fund this buy?" prompt shown inside AddTxnForm2 when a
   buy triggers (a candidate within 10% of buy cost). Mirrors ProposalCard2's amber-card
   visual grammar (agent2.jsx) WITHOUT coupling to its thesis-proposal data shape (per the
   Researcher's Q6 finding). Presentational — the form owns the checkbox state and the
   commit (checked candidates link when the buy is recorded, folding into "Record buy"
   exactly as the discipline-trim block folds into "Record sell"). Lists the FULL 14-day
   candidate window (not just the trigger match) so the owner can compose a many-to-many
   match; shows a running SELECTED vs BUY sum. Dismiss hides it and writes nothing.
   C2-D122: a candidate sourced from a closed_positions entry gets a small muted "closed"
   tag — a fully-exited position is a meaningfully different fact than a still-open partial
   sell, and confirming it triggers a different write-back path (linkRotationToClosedEntry,
   not linkRotation) that the owner should be able to tell apart at a glance. */
function RotationProposalCard2({ candidates, checked, onToggle, buyTotalCost, onDismiss, t }) {
  const eur = (n) => '€' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sum = candidates.reduce((s, c) => s + (checked[f2RotCandidateKey(c)] ? c.proceeds : 0), 0);
  return (
    <div style={{ background: t.raise, border: `1px solid ${t.cardBorder}`, borderLeft: `3px solid ${t.amber}`, borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: t.dim, lineHeight: 1.4 }}>
        Did a recent sell fund this buy? Tag any that did — their proceeds are then tracked as rotated capital, not fresh.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {candidates.map((c) => {
          const key = f2RotCandidateKey(c);
          const dateLabel = c.kind === 'closed' ? c.closedAt : c.date;
          return (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!checked[key]} onChange={() => onToggle(key)} />
              <span style={{ fontFamily: t.mono, fontSize: 11, fontWeight: 600, color: t.ink, minWidth: 46 }}>{c.ticker}</span>
              {c.kind === 'closed' && <Chip2 tone="mute">closed</Chip2>}
              <MonoTxt size={10} color={t.faint}>{dateLabel}</MonoTxt>
              <Money size={12} weight={600} style={{ marginLeft: 'auto' }}>{eur(c.proceeds)}</Money>
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, borderTop: `1px solid ${t.hair}`, paddingTop: 7 }}>
        <MonoTxt size={10} color={t.faint}>SELECTED {eur(sum)} · BUY {eur(buyTotalCost)}</MonoTxt>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.mono, fontSize: 11, color: t.dim, padding: '2px 6px' }}>Dismiss</button>
      </div>
    </div>
  );
}

/* The add-transaction inline form (buy or sell). */
function AddTxnForm2({ ticker, maxSell, onDone }) {
  const t = useTheme2();
  const store = useStore2();
  const [kind, setKind] = React.useState('buy');
  const [curr, setCurr] = React.useState('EUR'); // C2-D105 — trade currency; non-EUR converts at save
  const [saveErr, setSaveErr] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [d, setD] = React.useState({ date: new Date().toISOString().slice(0, 10), qty: '', price: '', fee: '' });
  const qtyN = parseFloat(d.qty), priceN = parseFloat(d.price);
  const curSym = curr === 'USD' ? '$' : curr === 'GBP' ? '£' : '€';
  const overSell = kind === 'sell' && qtyN > maxSell + 1e-9;
  const valid = qtyN > 0 && priceN > 0 && !overSell;
  // Discipline-trim detection (C2-S9): when a PARTIAL sell lands in a tranche region,
  // offer an optional question that marks the tranche executed (removes it from the
  // Trigger Distance card). f2ParseTranches/f2TrancheInRegion are globals from
  // triggerdistance2.jsx (loaded before drawer2.jsx).
  const [disciplineYes, setDisciplineYes] = React.useState(null); // null | true | false
  const hForTranche = (store.holdings || []).find((x) => x.ticker === ticker);
  const trancheRule = (window.FINCR.decisionRules && typeof f2ParseTranches === 'function')
    ? f2ParseTranches(window.FINCR.decisionRules.tranche_selling) : null;
  const trancheLevel = (kind === 'sell' && trancheRule && hForTranche && qtyN > 0)
    ? f2TrancheInRegion(hForTranche, trancheRule, qtyN) : null;

  // Rotation proposal (C2-D102; extended C2-D122 to also consider closed positions): on a
  // BUY, surface recent unlinked sells (open or fully-closed) that could have funded it.
  // buyTotalCost mirrors the idle-cash buy impact (qty*price + fee, C2-D98).
  // f2FindRotationCandidates returns the full 14-day windowed list (closest-first); the
  // 10% TRIGGER gate (whether the card appears at all) is checked here on candidates[0].
  const feeN = parseFloat(d.fee) || 0;
  const [rotChecked, setRotChecked] = React.useState({});     // { f2RotCandidateKey(c): true }
  const [rotDismissed, setRotDismissed] = React.useState(false);
  const buyTotalCost = (kind === 'buy' && curr === 'EUR' && qtyN > 0 && priceN > 0) ? (qtyN * priceN + feeN) : 0;
  const rotCandidates = (kind === 'buy' && buyTotalCost > 0 && typeof window.f2FindRotationCandidates === 'function')
    ? window.f2FindRotationCandidates(store.holdings, store.closed, d.date, buyTotalCost) : [];
  const rotTriggered = rotCandidates.length > 0
    && Math.abs(rotCandidates[0].proceeds - buyTotalCost) / buyTotalCost <= 0.10;
  const showRotCard = rotTriggered && !rotDismissed;
  // Seed the tightest match pre-checked whenever the candidate set (re)appears/changes;
  // clear when the card isn't shown. A checkbox toggle doesn't change rotSig, so it never
  // reseeds/clobbers the user's selection.
  const rotSig = showRotCard ? rotCandidates.map((c) => f2RotCandidateKey(c)).join(',') : '';
  React.useEffect(() => {
    if (showRotCard && rotCandidates.length) setRotChecked({ [f2RotCandidateKey(rotCandidates[0])]: true });
    else setRotChecked({});
  }, [rotSig]);
  const toggleRot = (key) => setRotChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = async () => {
    if (!valid || saving) return;
    setSaveErr(null);
    // C2-D105 — a non-EUR entered price is converted to EUR at save time using the
    // historical FX rate for the txn date. /fx-rate returns foreign-per-EUR, so
    // price_EUR = price_foreign / rate. On any failure we ABORT rather than store a
    // raw foreign price in the EUR field (that was the original currency-mismatch bug).
    // Audit fields (original_price/currency/fx_rate) travel through addTxn's ...tx spread.
    let priceEur = priceN, audit = null;
    if (curr !== 'EUR') {
      setSaving(true);
      try {
        const res = await fetch('https://fincr.duckdns.org/fx-rate?pair=EUR' + curr + '&date=' + d.date);
        const j = await res.json();
        const rate = j && (j.rate || j.fx_rate);
        if (!(rate > 0.1 && rate < 50)) throw new Error('bad rate');
        priceEur = priceN / rate;
        audit = { original_price: priceN, original_currency: curr, fx_rate: rate };
      } catch (e) {
        setSaving(false);
        setSaveErr('Could not fetch ' + curr + '→EUR rate for ' + d.date + '. Try again, or enter the price in EUR.');
        return;
      }
      setSaving(false);
    }
    if (kind === 'buy' && showRotCard) {
      // Record the buy with a known id, then link each CHECKED candidate to it (many-to-many
      // → one link call per checked candidate). Unchecked/none → plain buy. showRotCard
      // implies curr==='EUR' (rotation gate), so audit is null here.
      // C2-D122 — branch per candidate kind: an open-sell candidate links via the existing
      // linkRotation (onto the sell txn's own rotation_links); a closed-position candidate
      // links via the new linkRotationToClosedEntry (onto the closed entry's rotation_links,
      // via editClosedPosition — see store2.jsx for why linkRotation itself can't be reused
      // for this case).
      const buyId = (typeof window.f2uid === 'function') ? window.f2uid() : ('tx_' + Math.random().toString(36).slice(2, 9));
      store.actions.addTxn(ticker, Object.assign({ kind: 'buy', date: d.date, qty: qtyN, price: priceEur, fee_eur: feeN, id: buyId }, audit || {}));
      rotCandidates.filter((c) => rotChecked[f2RotCandidateKey(c)]).forEach((c) => {
        if (c.kind === 'closed') {
          store.actions.linkRotationToClosedEntry(c.closedId, ticker, buyId, c.proceeds);
        } else {
          store.actions.linkRotation(c.ticker, c.txnId, ticker, buyId, c.proceeds);
        }
      });
    } else if (kind === 'sell') {
      // C2-D107 — sells route through the close-aware commitSell (auto-materializes a
      // closed_positions entry if this sell folds the position to ~0; identical to addTxn
      // otherwise). Buys still use addTxn (below). The overSell/maxSell guard (:205) still
      // caps a sell at the held qty, so live.qty lands at ~0, never negative.
      store.actions.commitSell(ticker, Object.assign({ kind, date: d.date, qty: qtyN, price: priceEur, fee_eur: feeN }, audit || {}));
      // Mark the tranche executed only if the owner confirmed it was a discipline trim.
      if (trancheLevel != null && disciplineYes === true) {
        store.actions.editHoldingTrancheExecution(ticker, trancheLevel);
      }
    } else {
      store.actions.addTxn(ticker, Object.assign({ kind, date: d.date, qty: qtyN, price: priceEur, fee_eur: feeN }, audit || {}));
    }
    onDone();
  };
  return (
    <div style={{ background: t.dark ? 'rgba(255,255,255,0.02)' : 'rgba(23,25,30,0.02)', border: `1px solid ${t.hair}`, borderRadius: 11, padding: 14, display: 'flex', flexDirection: 'column', gap: 11, marginTop: 12 }}>
      <Seg2 options={[{ value: 'buy', label: 'Buy', tone: 'buy' }, { value: 'sell', label: 'Sell', tone: 'sell' }]} value={kind} onChange={setKind} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.8fr 1fr', gap: 8 }}>
        <TextField2 value={d.date} onChange={(v) => setD((s) => ({ ...s, date: v }))} mono />
        <NumberField2 value={d.qty} onChange={(v) => setD((s) => ({ ...s, qty: v }))} placeholder="qty" autoFocus />
        <NumberField2 value={d.price} onChange={(v) => setD((s) => ({ ...s, price: v }))} prefix={curSym} onEnter={save} />
      </div>
      {/* C2-D105 — trade currency. Non-EUR is converted to EUR at save using the historical
          FX rate for the txn date; the raw amount + rate are kept as an audit trail. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MonoTxt size={10.5} color={t.faint}>Currency</MonoTxt>
        <div style={{ flex: 1 }}>
          <Seg2 options={[{ value: 'EUR', label: '€ EUR' }, { value: 'USD', label: '$ USD' }, { value: 'GBP', label: '£ GBP' }]} value={curr} onChange={setCurr} />
        </div>
      </div>
      {curr !== 'EUR' && <MonoTxt size={10.5} color={t.dim}>Entered in {curr} — converts to € at the {d.date} rate on save.</MonoTxt>}
      {saveErr && <MonoTxt size={10.5} color={t.red}>{saveErr}</MonoTxt>}
      {/* C2-D98: optional broker fee — adjusts derived idle cash (buy: −fee, sell: −fee). Blank = 0. */}
      <NumberField2 value={d.fee} onChange={(v) => setD((s) => ({ ...s, fee: v }))} prefix="€" placeholder="fee (optional, €)" onEnter={save} />
      {overSell && <MonoTxt size={10.5} color={t.red}>Can't sell more than {maxSell} units held.</MonoTxt>}
      {kind === 'sell' && trancheLevel != null && (
        <Field2 label={'Discipline trim at +' + trancheLevel + '% level?'} hint="optional">
          <Seg2 options={[{ value: 'yes', label: 'Yes — discipline' }, { value: 'no', label: 'No — other' }]}
            value={disciplineYes === null ? null : (disciplineYes ? 'yes' : 'no')}
            onChange={(v) => setDisciplineYes(v === 'yes')} />
        </Field2>
      )}
      {showRotCard && (
        <RotationProposalCard2
          candidates={rotCandidates}
          checked={rotChecked}
          onToggle={toggleRot}
          buyTotalCost={buyTotalCost}
          onDismiss={() => setRotDismissed(true)}
          t={t}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <TextBtn2 onClick={onDone}>Cancel</TextBtn2>
        <Btn2 primary onClick={save} style={{ opacity: (valid && !saving) ? 1 : 0.4, pointerEvents: (valid && !saving) ? 'auto' : 'none', padding: '6px 12px' }}>{saving ? 'Converting…' : 'Record ' + kind}</Btn2>
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
  // C2-D115 Part B: rotatedInto (single string) is gone -- RotationDestinationBlocks2 now
  // owns per-destination ticker state internally.
  const [rotationLinks, setRotationLinks] = React.useState([]);   // C2-S8 picker output, now multi-block
  const [rotationValid, setRotationValid] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const sellN = parseFloat(sell);
  const priceValid = sellN > 0;
  const isRotate = sellType === "rotate";
  const grossProceeds = priceValid ? sellN * h.qty : null;
  // Both sell-intent fields required; for a rotation the linked portions must be valid (C2-S8).
  const valid = priceValid && !!sellType && convRetained !== null && (!isRotate || rotationValid) && !busy;
  const realized = priceValid ? h.qty * (sellN - h.avgCost) + (h.realized || 0) : 0;
  const up = realized >= 0;
  const doClose = async () => {
    if (!valid) return;
    setBusy(true);
    // Build rotation links from the picker, or a single unlinked entry if none picked (C2-S8).
    // C2-D115 Part B: finalLinks now comes from ALL destination blocks combined (built and
    // maintained by RotationDestinationBlocks2's own onChange, including its own per-block
    // unlinked-placeholder handling) -- not just one ticker's selections.
    const finalLinks = isRotate ? rotationLinks : [];
    const rotatedIntoVal = (finalLinks[0] && finalLinks[0].target_ticker) || null;
    const patch = { sell_type: sellType, conviction_retained: convRetained };
    if (isRotate && rotatedIntoVal) patch.rotated_into = rotatedIntoVal;
    if (isRotate) patch.rotation_links = finalLinks;
    // Close first; the thesis patch fires after the archive sync succeeds (store).
    // The drawer closes itself once the holding leaves the store.
    await store.actions.closePositionWithThesis(h.ticker, { sellPrice: sellN, date, note }, patch, note);
    // Forward link: tag each linked buy txn as funded by this rotation. The target
    // ticker is a still-held holding, so this patches local state regardless of sync.
    finalLinks.forEach((l) => {
      if (l.target_txn_id) {
        store.actions.addRotatedFromToTxn(l.target_ticker, l.target_txn_id, {
          source_ticker: h.ticker, source_closed_at: date || new Date().toISOString().slice(0, 10), portion_eur: l.portion_eur,
        });
      }
    });
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
      {isRotate && (
        <Field2 label="Rotating into" hint="one or more destinations">
          <RotationDestinationBlocks2 initialLinks={[]} closedAt={date} totalProceeds={grossProceeds} onChange={(links, v) => { setRotationLinks(links); setRotationValid(v); }} />
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

// C2-D125 — local redeclaration, not a reference to store2.jsx's f2indicatorId.
// Matches this codebase's existing convention (see THESIS_SENTINEL, redeclared
// identically in both positions2.jsx and here) of each plain-script file owning
// its own copy of small constants/helpers rather than relying on cross-<script>-
// tag global-scope leakage of top-level const/let. Same id shape as store2.jsx's
// generator (used there for agent-accepted drafts) and f2closedId (C2-D113) —
// this copy is for manually-added rows, created directly in this file.
const f2indicatorId = () => 'ind_' + Math.random().toString(36).slice(2, 9);

/* C2-S3 — inline per-holding thesis editor. Edits core_argument / conviction /
   stance / target_price / thesis_indicators (C2-D125) via POST /thesis/update
   (window.saveThesis), sends only changed fields, then refreshes F.thesis via
   loadThesis(). Transient local state. */
function ThesisEditor2({ th, onDone }) {
  const t = useTheme2();
  // Original backend values. The adapter display-cases conviction/stance; lowercasing
  // is the lossless inverse of its titleCase, giving back the stored enum.
  const origArg = (th.argument && th.argument !== THESIS_SENTINEL) ? th.argument : '';
  const origConv = th.conviction ? th.conviction.toLowerCase() : 'medium';
  const origStance = th.stance ? th.stance.toLowerCase() : 'hold';
  const origTarget = th.target_price != null ? th.target_price : null;
  // Pre-fill from agent proposal card (C2-S4b).
  // The stash is set by openDrawerWithPrefill() in store2.jsx and cleared here on first render.
  const prefill = window.__fincrDrawerPrefill || null;
  if (prefill) window.__fincrDrawerPrefill = null;
  // Pending agent-drafted core_argument text (C2-D123), keyed by ticker, set by
  // updateThesisDraft() in store2.jsx. Unlike prefill above this is NOT cleared
  // on read here — it stays pending across a close/reopen with no Save, and is
  // only cleared once Save actually persists it (below).
  const pendingDraft = (window.__fincrThesisDraft && window.__fincrThesisDraft[th.ticker]) || null;

  const [arg, setArg] = React.useState(
    prefill && prefill.core_argument != null ? prefill.core_argument :
    pendingDraft && pendingDraft.core_argument != null ? pendingDraft.core_argument :
    origArg
  );
  const [conv, setConv] = React.useState(prefill && prefill.conviction != null ? prefill.conviction : origConv);
  const [stance, setStance] = React.useState(prefill && prefill.stance != null ? prefill.stance : origStance);
  const [targetStr, setTargetStr] = React.useState(
    prefill && prefill.target_price != null ? String(prefill.target_price) :
    pendingDraft && pendingDraft.target_price != null ? String(pendingDraft.target_price) :
    origTarget != null ? String(origTarget) : ''
  );
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(false);
  // Pass 2 addendum (fix to C2-D123's "not solved further" gap) — argBaseline is
  // the last value the textarea was set to by something OTHER than the owner's
  // own typing (initial mount value, an auto-applied draft, or a persisted save).
  // Comparing current `arg` against it is how we detect "unsaved edits" below,
  // without touching what actually gets persisted (still only Save/window.saveThesis).
  const [argBaseline, setArgBaseline] = React.useState(arg);
  const [argFocused, setArgFocused] = React.useState(false);
  // A core_argument draft that arrived while the owner had focus/unsaved edits —
  // held here instead of applied, surfaced as a small click-to-apply affordance.
  const [queuedDraft, setQueuedDraft] = React.useState(null);
  // target_price extension of C2-D123 — independent guard state, same shape as
  // arg's above but tracked separately: a proposal might update one field
  // without the other, so the two fields' focus/unsaved-edit/queued-draft state
  // must never be conflated.
  const [targetBaseline, setTargetBaseline] = React.useState(targetStr);
  const [targetFocused, setTargetFocused] = React.useState(false);
  const [queuedTargetDraft, setQueuedTargetDraft] = React.useState(null);

  // C2-D125 — thesis_indicators (typed list: risk/price_level/catalyst).
  // origIndicators is the last-saved backend state, read fresh on mount, same
  // as origArg/origConv/origStance/origTarget above.
  const origIndicators = th.indicators || [];
  // Any agent-accepted indicator suggestions still pending (not yet saved),
  // stashed by store2.jsx's addThesisIndicatorDraft — mirrors pendingDraft's
  // role above, but as a list. NOT cleared on read here (same as pendingDraft):
  // stays pending across a close/reopen with no Save, only cleared once Save
  // actually persists it (below).
  const pendingIndicatorDrafts = (window.__fincrThesisIndicatorDrafts && window.__fincrThesisIndicatorDrafts[th.ticker]) || [];
  // Initial list = saved entries + any pending drafts not already reflected in
  // the saved list (id dedup — a draft accepted, saved, then somehow not
  // cleared should never double up). This is the ONLY place ids are deduped on
  // read; the live-append listener below dedupes on write for the same reason.
  const [indicators, setIndicators] = React.useState(() => {
    var extra = pendingIndicatorDrafts.filter((d) => !origIndicators.some((o) => o.id === d.id));
    return origIndicators.concat(extra);
  });

  // Live append (C2-D125): an agent-accepted indicator suggestion for THIS
  // ticker arrived (via agent2.jsx's per-suggestion Accept -> store2.jsx's
  // addThesisIndicatorDraft) while this editor is already mounted. Unlike the
  // core_argument/target_price guard above, a list needs no focus/unsaved-edit
  // guard at all: appending a new entry can never clobber an entry the owner is
  // mid-edit on elsewhere in the list (per spec — a list is naturally safe
  // against the overwrite failure mode a single scalar has to guard against).
  // Simple append, deduped by id so a duplicate event can never double an entry.
  React.useEffect(() => {
    function onIndicatorDraftAdd(e) {
      var d = e.detail || {};
      if (d.ticker !== th.ticker || !d.indicator) return;
      setIndicators((prev) => prev.some((x) => x.id === d.indicator.id) ? prev : prev.concat([d.indicator]));
    }
    window.addEventListener('fincr:thesis-indicator-draft-add', onIndicatorDraftAdd);
    return () => window.removeEventListener('fincr:thesis-indicator-draft-add', onIndicatorDraftAdd);
  }, [th.ticker]);

  // Gap-fix (closes a real production gap found after C2-D125 shipped — see
  // decisions.md addendum, NOT a reversal of the per-suggestion accept/dismiss
  // design). Live pending count of NOT-YET-accepted/dismissed indicator
  // suggestions still sitting in the chat (agent2.jsx's IndicatorProposalCard2
  // instances), scoped to THIS ticker only. Distinct from pendingIndicatorDrafts
  // above: that list is suggestions the owner already clicked Accept on and are
  // waiting on Save — this counts suggestions the owner hasn't clicked
  // Accept/Dismiss on AT ALL yet, which is the actual visibility gap this patch
  // closes (a batch of proposals can be entirely un-reviewed with no signal
  // near Save). Initial read is a synchronous window-global read (same pattern
  // as pendingIndicatorDrafts above); the listener keeps it live while mounted,
  // filtered by ticker so a different ticker's pending proposals never leak in.
  const [pendingProposalCount, setPendingProposalCount] = React.useState(() => {
    var set = window.__fincrPendingIndicatorProposals && window.__fincrPendingIndicatorProposals[th.ticker];
    return set ? set.size : 0;
  });
  React.useEffect(() => {
    function onPendingChange(e) {
      var d = e.detail || {};
      if (d.ticker !== th.ticker) return;
      setPendingProposalCount(d.count);
    }
    window.addEventListener('fincr:indicator-proposal-pending-change', onPendingChange);
    return () => window.removeEventListener('fincr:indicator-proposal-pending-change', onPendingChange);
  }, [th.ticker]);

  // Manual editor row helpers — add/edit/remove, fully independent of the agent.
  function addIndicatorRow() {
    setIndicators((prev) => prev.concat([{ id: f2indicatorId(), type: 'risk', text: '', target_price: null }]));
  }
  function updateIndicatorRow(id, patch) {
    setIndicators((prev) => prev.map((ind) => {
      if (ind.id !== id) return ind;
      var next = { ...ind, ...patch };
      // type-conditional: target_price only means anything for price_level —
      // clearing it on a type change away from price_level keeps the shape
      // honest rather than leaving a stale number the UI no longer shows.
      if (next.type !== 'price_level') next.target_price = null;
      return next;
    }));
  }
  function removeIndicatorRow(id) {
    setIndicators((prev) => prev.filter((ind) => ind.id !== id));
  }

  // Live update (C2-D123, guarded per Pass 2 addendum): if a core_argument
  // proposal for THIS ticker arrives while this editor is already mounted/open,
  // only overwrite the textarea when the owner is NOT actively using it — i.e.
  // it's unfocused AND has no unsaved edits (arg === argBaseline). Otherwise the
  // draft is queued (never discarded) for the owner to apply on their own terms.
  // Still purely local React state either way — nothing here calls saveThesis.
  React.useEffect(() => {
    function onDraftUpdate(e) {
      var d = e.detail || {};
      if (d.ticker !== th.ticker) return;
      if (!d.fields) return;
      if (d.fields.core_argument != null) {
        var incoming = d.fields.core_argument;
        var hasUnsavedEdits = arg !== argBaseline;
        if (argFocused || hasUnsavedEdits) {
          setQueuedDraft(incoming);
        } else {
          setArg(incoming);
          setArgBaseline(incoming);
        }
      }
      // target_price extension of C2-D123 — own independent guard, mirrors the
      // core_argument branch above exactly but never shares state with it.
      if (d.fields.target_price != null) {
        var incomingTarget = String(d.fields.target_price);
        var hasUnsavedTargetEdits = targetStr !== targetBaseline;
        if (targetFocused || hasUnsavedTargetEdits) {
          setQueuedTargetDraft(incomingTarget);
        } else {
          setTargetStr(incomingTarget);
          setTargetBaseline(incomingTarget);
        }
      }
    }
    window.addEventListener('fincr:thesis-draft-update', onDraftUpdate);
    return () => window.removeEventListener('fincr:thesis-draft-update', onDraftUpdate);
  }, [th.ticker, arg, argBaseline, argFocused, targetStr, targetBaseline, targetFocused]);

  const save = async () => {
    // Gap-fix — single friction moment, never a hard block: if there are
    // still-unreviewed indicator suggestions for this ticker, ask once before
    // saving. Cancel returns immediately, before any state mutation (setBusy
    // included) — Save simply doesn't fire, nothing else changes. Confirming
    // falls through to the exact same save path as always.
    if (pendingProposalCount > 0) {
      var msg = 'You have ' + pendingProposalCount + ' indicator suggestion'
        + (pendingProposalCount === 1 ? '' : 's') + " you haven't reviewed yet — save anyway?";
      if (!confirm(msg)) return;
    }
    setBusy(true); setErr(false);
    // Diff against originals — only send what changed (avoid needless version bumps).
    const changes = {};
    if (arg !== origArg) changes.core_argument = arg;
    if (conv !== origConv) changes.conviction = conv;
    if (stance !== origStance) changes.stance = stance;
    const newTarget = targetStr.trim() === '' ? null : Number(targetStr);
    if (newTarget !== origTarget) changes.target_price = newTarget;
    // C2-D125 — thesis_indicators. Rows with empty/whitespace-only text are
    // dropped before diffing/sending: the owner can click "+ Add indicator",
    // decide not to fill it in, and Cancel/Save without it ever blocking Save
    // or persisting a blank entry. Compared by JSON (order + content) against
    // the last-saved list — cheap and correct at this list size, same
    // "only send what changed" discipline as every other field here.
    const cleanIndicators = indicators
      .filter((ind) => ind.text && ind.text.trim())
      .map((ind) => ({ id: ind.id, type: ind.type, text: ind.text.trim(), target_price: ind.type === 'price_level' ? ind.target_price : null }));
    if (JSON.stringify(cleanIndicators) !== JSON.stringify(origIndicators)) changes.thesis_indicators = cleanIndicators;
    if (Object.keys(changes).length === 0) { onDone(); return; } // no-op — just close
    const ok = await window.saveThesis(th.ticker, changes, '');
    if (!ok) { setErr(true); setBusy(false); return; }
    // Clear any pending agent-drafted core_argument for this ticker now that a
    // save actually went through (C2-D123) — whatever was pending has either
    // just been persisted (if left unmodified in the textarea) or explicitly
    // superseded by the owner's own edit.
    if (window.__fincrThesisDraft) delete window.__fincrThesisDraft[th.ticker];
    // C2-D125 — same clearing discipline for the indicator draft list: whatever
    // was pending has now either been persisted (if still present/unedited in
    // `indicators`) or explicitly dropped by the owner's own remove/edit.
    if (window.__fincrThesisIndicatorDrafts) delete window.__fincrThesisIndicatorDrafts[th.ticker];
    setArgBaseline(arg); // Pass 2 addendum — the just-persisted text is the new baseline
    setQueuedDraft(null); // Patch — a save clears any stale queued-draft affordance too
    setTargetBaseline(targetStr); // target_price extension — its own new baseline
    setQueuedTargetDraft(null); // target_price extension — cleared independently of queuedDraft
    setIndicators(cleanIndicators); // C2-D125 — the just-persisted list is the new baseline
    if (window.loadThesis) await window.loadThesis(); // refresh card + drawer
    onDone();
  };
  const inputStyle = window.f2InputStyle(t);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
      <Field2 label="Core argument">
        <textarea value={arg} onChange={(e) => setArg(e.target.value)} rows={3} placeholder="Why do you hold this?"
          onFocus={(e) => { e.target.style.borderColor = t.accent; setArgFocused(true); }}
          onBlur={(e) => { e.target.style.borderColor = t.inputBorder; setArgFocused(false); }}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 66, lineHeight: 1.5 }} />
        {queuedDraft != null && (
          // Pass 2 addendum — small click-to-apply affordance for a draft that
          // arrived while the owner had focus/unsaved edits. Applying it here
          // only changes the textarea's local display value; it still requires
          // the owner's own Save click to reach thesis.json, same as any edit.
          <div onClick={() => { setArg(queuedDraft); setArgBaseline(queuedDraft); setQueuedDraft(null); }}
            style={{ marginTop: 6, fontSize: 11, fontFamily: t.mono, color: t.accent, cursor: 'pointer' }}>
            New draft available — click to apply →
          </div>
        )}
      </Field2>
      <Field2 label="Conviction">
        <Seg2 options={[{ value: 'high', label: 'High', tone: 'ok' }, { value: 'medium', label: 'Medium', tone: 'watch' }, { value: 'low', label: 'Low', tone: 'mute' }]} value={conv} onChange={setConv} />
      </Field2>
      <Field2 label="Stance">
        <Seg2 options={[{ value: 'accumulate', label: 'Accumulate', tone: 'ok' }, { value: 'hold', label: 'Hold', tone: 'mute' }, { value: 'trim', label: 'Trim', tone: 'watch' }]} value={stance} onChange={setStance} />
      </Field2>
      <Field2 label="Price target" hint="optional">
        {/* NumberField2 has no onFocus/onBlur passthrough of its own; wrapping it
            works because React 18 implements onFocus/onBlur via focusin/focusout,
            which bubble, so the wrapper still observes focus entering/leaving the
            input inside. Mirrors argFocused's role for the core_argument textarea,
            kept fully independent (targetFocused, not argFocused). */}
        <div onFocus={() => setTargetFocused(true)} onBlur={() => setTargetFocused(false)}>
          <NumberField2 value={targetStr} onChange={setTargetStr} prefix="€" placeholder="—" />
        </div>
        {queuedTargetDraft != null && (
          // target_price's own click-to-apply affordance (mirrors queuedDraft's
          // UI for core_argument above), scoped to this field only — never a
          // shared/global indicator that would conflate the two fields' drafts.
          <div onClick={() => { setTargetStr(queuedTargetDraft); setTargetBaseline(queuedTargetDraft); setQueuedTargetDraft(null); }}
            style={{ marginTop: 6, fontSize: 11, fontFamily: t.mono, color: t.accent, cursor: 'pointer' }}>
            New draft available — click to apply →
          </div>
        )}
      </Field2>
      {/* C2-D125 — manual add/edit/remove list editor for thesis_indicators.
          Fully independent of the agent: every row here can be created, typed
          into, and removed with no agent involvement whatsoever, bound to the
          same local `indicators` state agent-accepted suggestions also append
          to (see the live-append effect above) and the same Save flow as every
          other field on this form (POST /thesis/update via window.saveThesis —
          no new write path). */}
      <Field2 label="Thesis indicators" hint="risks · price levels · catalysts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {indicators.map((ind) => (
            <div key={ind.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, border: `1px solid ${t.hair}`, borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <Seg2
                    options={[
                      { value: 'risk', label: 'Risk', tone: 'bad' },
                      { value: 'price_level', label: 'Price level', tone: 'watch' },
                      { value: 'catalyst', label: 'Catalyst', tone: 'ok' },
                    ]}
                    value={ind.type}
                    onChange={(v) => updateIndicatorRow(ind.id, { type: v })}
                  />
                </div>
                <button onClick={() => removeIndicatorRow(ind.id)} title="Remove indicator" className="f2-press"
                  style={{ background: 'none', border: 'none', color: t.faint, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 6px', borderRadius: 6, flexShrink: 0 }}>
                  {'×'}
                </button>
              </div>
              <TextField2
                value={ind.text}
                onChange={(v) => updateIndicatorRow(ind.id, { text: v })}
                placeholder={
                  ind.type === 'price_level' ? 'e.g. Accumulate more below this level'
                  : ind.type === 'catalyst' ? 'e.g. Q3 earnings, mainnet launch, regulatory ruling'
                  : 'e.g. What would prove this thesis wrong?'
                }
              />
              {/* Type-conditional field — target_price only ever rendered for
                  Price Level, per spec. updateIndicatorRow also force-nulls
                  target_price whenever type changes away from price_level, so
                  no stale number can hide behind a hidden field. */}
              {ind.type === 'price_level' && (
                <NumberField2
                  value={ind.target_price != null ? String(ind.target_price) : ''}
                  onChange={(v) => updateIndicatorRow(ind.id, { target_price: v.trim() === '' ? null : Number(v) })}
                  prefix="€"
                  placeholder="—"
                />
              )}
            </div>
          ))}
          <TextBtn2 tone="accent" onClick={addIndicatorRow} style={{ alignSelf: 'flex-start' }}>+ Add indicator</TextBtn2>
        </div>
      </Field2>
      {pendingProposalCount > 0 && (
        // Gap-fix — hard-to-miss, anchored directly above Save (not another
        // easily-scrolled-past chat card). Clears itself automatically the
        // instant the count reaches 0 (every pending suggestion for this
        // ticker accepted or dismissed) — no manual dismiss for this banner.
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          background: t.amberSoft, border: '1px solid ' + t.amber, borderRadius: 9,
          padding: '10px 13px',
        }}>
          <span style={{ fontSize: 12, color: t.ink, fontWeight: 600 }}>
            {pendingProposalCount + ' suggested indicator' + (pendingProposalCount === 1 ? '' : 's') + ' awaiting review'}
          </span>
          <TextBtn2 tone="accent" onClick={() => window.dispatchEvent(new CustomEvent('fincr:go-tab', { detail: { tab: 'agent' } }))}>
            Review in chat →
          </TextBtn2>
        </div>
      )}
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
  React.useEffect(() => {
    setMode('detail');
    // Auto-open thesis editor if an agent proposal prefill is waiting (C2-S4b).
    setEditingThesis(!!(window.__fincrDrawerPrefill));
  }, [drawerTicker]);

  React.useEffect(() => {
    // C2-D123 — if a core_argument proposal lands for the ticker whose drawer
    // is already open, reveal the thesis editor so the live-updating textarea
    // (ThesisEditor2's own listener, above) is visible without closing/reopening
    // anything. Never opens a drawer for a DIFFERENT ticker than the one
    // already open — that force-open case is explicitly out of scope (C2-D123).
    function onDraftUpdate(e) {
      var d = e.detail || {};
      if (!drawerTicker || d.ticker !== drawerTicker) return;
      if (d.fields && (d.fields.core_argument != null || d.fields.target_price != null)) setEditingThesis(true);
    }
    // C2-D125 — same auto-reveal, extended to an accepted thesis_indicators
    // suggestion (agent2.jsx's IndicatorProposalCard2 Accept button ->
    // addThesisIndicatorDraft). Separate event (fincr:thesis-indicator-draft-add,
    // list-shaped) from the scalar one above — kept as its own listener rather
    // than folded into onDraftUpdate so the two payload shapes never have to be
    // reconciled into one conditional.
    function onIndicatorDraftAdd(e) {
      var d = e.detail || {};
      if (!drawerTicker || d.ticker !== drawerTicker) return;
      setEditingThesis(true);
    }
    window.addEventListener('fincr:thesis-draft-update', onDraftUpdate);
    window.addEventListener('fincr:thesis-indicator-draft-add', onIndicatorDraftAdd);
    return () => {
      window.removeEventListener('fincr:thesis-draft-update', onDraftUpdate);
      window.removeEventListener('fincr:thesis-indicator-draft-add', onIndicatorDraftAdd);
    };
  }, [drawerTicker]);

  const h = drawerTicker ? store.holdings.find((x) => x.ticker === drawerTicker) : null;
  const open = !!h;
  const th = h && F.thesis ? F.thesis.find((x) => x.ticker === h.ticker) : null;
  const weight = h ? (h.value / F.totalValue * 100) : 0;
  // C2-D117 (Item A) — derived, not stored: distinct txn-level `source` values on
  // this holding, for debugging blended-broker positions (e.g. "snaptrade + revolut").
  // Untagged (manual/pre-C2-D117) txns contribute nothing here.
  const sources = h ? Array.from(new Set((h.txns || []).map((tx) => tx.source).filter(Boolean))) : [];

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
                {sources.length > 0 && (
                  <span title="Distinct broker origins found in this holding's transaction ledger — debugging aid" style={{ fontSize: 10, fontFamily: t.mono, color: t.faint, letterSpacing: '0.02em' }}>
                    {sources.join(' + ')}
                  </span>
                )}
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
