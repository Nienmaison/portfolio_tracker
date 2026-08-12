/* Fincr 2.0 — Watchlist: its own top-level route (C2-D160), extracted from
   the Positions tab (where it lived as "02 Watchlist", C2-D159). Owner's own
   reasoning for the extraction (decisions.md [C2-D160]): sharing a page with
   thesis cards and Decision Rules made this section overstimulating rather
   than calm — it needed its own quiet home. Table presentation + row-click
   drawer per the Claude Design handoff's §5 ("Fincr Positions - Calmer.html").
   Exports window.WatchlistTab2. */

// Moved verbatim from positions2.jsx (C2-D159) — internals unchanged. Still
// the one editor for a watchlist entry's fields, mounted inside the new
// WatchlistDrawer2 below instead of inline in a row.
function WatchlistEntryEdit2({ w, t, onDone }) {
  const origArg = w.core_argument || '';
  const origConv = w.conviction || 'medium';
  const origType = w.thesis_type || '';
  const origLayer = w.layer != null ? w.layer : null;
  const origStop = w.trailing_stop_pct != null ? w.trailing_stop_pct : null;
  const origTriggers = w.entry_triggers || [];

  const [arg, setArg] = React.useState(origArg);
  const [conv, setConv] = React.useState(origConv);
  const [thesisType, setThesisType] = React.useState(origType);
  const [layerStr, setLayerStr] = React.useState(origLayer != null ? String(origLayer) : '');
  const [stopStr, setStopStr] = React.useState(origStop != null ? String(origStop) : '');
  const [triggersStr, setTriggersStr] = React.useState(origTriggers.join('\n'));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(false);

  const save = async () => {
    setBusy(true); setErr(false);
    // Diff against originals — only send what changed (avoid needless version bumps),
    // same discipline as ThesisEditor2's own save().
    const changes = {};
    if (arg !== origArg) changes.core_argument = arg;
    if (conv !== origConv) changes.conviction = conv;
    if (thesisType !== origType) changes.thesis_type = thesisType;
    const newLayer = layerStr.trim() === '' ? null : Number(layerStr);
    if (newLayer !== origLayer) changes.layer = newLayer;
    const newStop = stopStr.trim() === '' ? null : Number(stopStr);
    if (newStop !== origStop) changes.trailing_stop_pct = newStop;
    const newTriggers = triggersStr.split('\n').map((s) => s.trim()).filter(Boolean);
    if (JSON.stringify(newTriggers) !== JSON.stringify(origTriggers)) changes.entry_triggers = newTriggers;
    if (Object.keys(changes).length === 0) { onDone(); return; } // no-op — just close
    const ok = await window.saveThesis(w.ticker, changes, 'Edited via Watchlist manual editor');
    if (!ok) { setErr(true); setBusy(false); return; }
    if (window.loadThesis) await window.loadThesis(); // refresh F.watchlist
    onDone();
  };
  const inputStyle = window.f2InputStyle(t);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field2 label="Core argument">
        <textarea value={arg} onChange={(e) => setArg(e.target.value)} rows={3} placeholder="Why is this on the watchlist?"
          onFocus={(e) => { e.target.style.borderColor = t.accent; }}
          onBlur={(e) => { e.target.style.borderColor = t.inputBorder; }}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 60, lineHeight: 1.5 }} />
      </Field2>
      <Field2 label="Entry triggers" hint="one per line">
        <textarea value={triggersStr} onChange={(e) => setTriggersStr(e.target.value)} rows={3} placeholder="DOE license approval progress"
          onFocus={(e) => { e.target.style.borderColor = t.accent; }}
          onBlur={(e) => { e.target.style.borderColor = t.inputBorder; }}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 54, lineHeight: 1.5, fontFamily: t.mono, fontSize: 12.5 }} />
      </Field2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field2 label="Conviction">
          <Seg2 options={[{ value: 'high', label: 'High', tone: 'ok' }, { value: 'medium', label: 'Medium', tone: 'watch' }, { value: 'low', label: 'Low', tone: 'mute' }]} value={conv} onChange={setConv} />
        </Field2>
        <Field2 label="Thesis type">
          <TextField2 value={thesisType} onChange={setThesisType} placeholder="core_thesis" />
        </Field2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field2 label="Layer" hint="optional">
          <NumberField2 value={layerStr} onChange={setLayerStr} placeholder="—" />
        </Field2>
        <Field2 label="Trailing stop" hint="optional, %">
          <NumberField2 value={stopStr} onChange={setStopStr} placeholder="—" />
        </Field2>
      </div>
      {err && <MonoTxt size={11} color={t.red}>Failed to save — try again</MonoTxt>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Btn2 onClick={onDone}>Cancel</Btn2>
        <Btn2 primary onClick={save} style={{ opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>{busy ? 'Saving…' : 'Save'}</Btn2>
      </div>
    </div>
  );
}

// Moved verbatim from positions2.jsx (C2-D159) — internals unchanged, same
// window.createWatchlistEntry call, same client-side duplicate pre-check
// against F.holdings/F.watchlist, same server-side-is-the-real-guard posture.
function AddWatchlistModal2({ open, onClose, t }) {
  const F = window.FINCR;
  const blank = { ticker: '', company: '', thesisType: '', conviction: 'medium', coreArgument: '', triggersStr: '', layerStr: '', stopStr: '' };
  const [f, setF] = React.useState(blank);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  React.useEffect(() => { if (open) { setF(blank); setErr(''); } }, [open]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const tickerUp = f.ticker.trim().toUpperCase();
  const dupe = !!tickerUp && (
    (F.holdings || []).some((h) => h.ticker === tickerUp) ||
    (F.watchlist || []).some((wl) => wl.ticker === tickerUp)
  );
  const valid = tickerUp && f.company.trim() && f.thesisType.trim() && f.coreArgument.trim() && !dupe;

  const submit = async () => {
    if (!valid) return;
    setBusy(true); setErr('');
    const layer = f.layerStr.trim() === '' ? null : Number(f.layerStr);
    const trailingStopPct = f.stopStr.trim() === '' ? null : Number(f.stopStr);
    const entryTriggers = f.triggersStr.split('\n').map((s) => s.trim()).filter(Boolean);
    const res = await window.createWatchlistEntry({
      ticker: tickerUp, company: f.company.trim(), thesis_type: f.thesisType.trim(),
      conviction: f.conviction, core_argument: f.coreArgument.trim(),
      entry_triggers: entryTriggers, layer: layer, trailing_stop_pct: trailingStopPct,
    });
    if (!res.ok) {
      setBusy(false);
      setErr(res.conflict ? 'Thesis changed elsewhere — reload the page and try again.' : 'Failed to create — try again.');
      return;
    }
    if (window.loadThesis) await window.loadThesis(); // refresh F.watchlist, appears with no manual refresh
    setBusy(false);
    onClose();
  };

  return (
    <Modal2 open={open} onClose={onClose}
      title="Add to watchlist"
      sub="A name you're tracking but don't yet own. Buying it later promotes it to holdings automatically."
      footer={<>
        <Btn2 onClick={onClose}>Cancel</Btn2>
        <Btn2 primary onClick={submit} style={{ opacity: valid && !busy ? 1 : 0.4, pointerEvents: valid && !busy ? 'auto' : 'none' }}>{busy ? 'Adding…' : 'Add to watchlist'}</Btn2>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field2 label="Ticker">
            <TextField2 value={f.ticker} onChange={(v) => set('ticker')(v.toUpperCase())} placeholder="NVDA" mono autoFocus />
          </Field2>
          <Field2 label="Company">
            <TextField2 value={f.company} onChange={set('company')} placeholder="Nvidia" />
          </Field2>
        </div>
        {dupe && <MonoTxt size={11} color={t.red}>{tickerUp} is already in holdings or watchlist.</MonoTxt>}
        <Field2 label="Core argument">
          <textarea value={f.coreArgument} onChange={(e) => set('coreArgument')(e.target.value)} rows={3} placeholder="Why is this interesting?"
            onFocus={(e) => { e.target.style.borderColor = t.accent; }}
            onBlur={(e) => { e.target.style.borderColor = t.inputBorder; }}
            style={{ ...window.f2InputStyle(t), resize: 'vertical', minHeight: 60, lineHeight: 1.5 }} />
        </Field2>
        <Field2 label="Entry triggers" hint="one per line, optional">
          <textarea value={f.triggersStr} onChange={(e) => set('triggersStr')(e.target.value)} rows={3} placeholder="DOE license approval progress"
            onFocus={(e) => { e.target.style.borderColor = t.accent; }}
            onBlur={(e) => { e.target.style.borderColor = t.inputBorder; }}
            style={{ ...window.f2InputStyle(t), resize: 'vertical', minHeight: 54, lineHeight: 1.5, fontFamily: t.mono, fontSize: 12.5 }} />
        </Field2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field2 label="Conviction">
            <Seg2 options={[{ value: 'high', label: 'High', tone: 'ok' }, { value: 'medium', label: 'Medium', tone: 'watch' }, { value: 'low', label: 'Low', tone: 'mute' }]} value={f.conviction} onChange={set('conviction')} />
          </Field2>
          <Field2 label="Thesis type">
            <TextField2 value={f.thesisType} onChange={set('thesisType')} placeholder="core_thesis" />
          </Field2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field2 label="Layer" hint="optional">
            <NumberField2 value={f.layerStr} onChange={set('layerStr')} placeholder="—" />
          </Field2>
          <Field2 label="Trailing stop" hint="optional, %">
            <NumberField2 value={f.stopStr} onChange={set('stopStr')} placeholder="—" />
          </Field2>
        </div>
        {err && <MonoTxt size={11} color={t.red}>{err}</MonoTxt>}
      </div>
    </Modal2>
  );
}

// New for C2-D160 — row-detail drawer, replacing the old always-visible
// inline Edit/Archive buttons per the handoff's table redesign. Built on the
// generic Drawer2 shell (forms2.jsx) rather than drawer2.jsx's
// PositionDrawer2: investigated first, per the build spec's explicit
// instruction — PositionDrawer2 is holdings-specific by its entire design
// (money band, day/unrealized P&L, transaction ledger, source-tag debug
// line, all driven by useStore2()'s `store.holdings`/`drawerTicker`), and
// its body is wrapped in `{h && (...)}` where `h` is a store2.jsx holding —
// a watchlist entry is never in `store.holdings` (no txns, no value, no
// P&L), so nothing in that component would render for one. Retrofitting it
// would mean overloading drawerTicker to sometimes mean "watchlist ticker" or
// adding a parallel piece of store state, for a body that shares none of
// PositionDrawer2's actual content (money/ledger) with what a watchlist
// entry needs to show (argument/triggers/settings). Confirmed not reusable.
// Archive lives here (not in the table row) — the handoff's own mock
// (drawerContent for kind:'watch') shows only "Edit entry →" and omits an
// archive action, but the spec is explicit that create/edit/archive
// behavior must not change from C2-D158/159, so Archive is kept, placed
// next to "Edit entry →" as the drawer's second action.
//
// C2-D161 update — this component originally called the plain Drawer2
// primitive directly, with its own duplicated header markup (title + close
// button) below. The Decision Rules drawer build found no shared shell to
// reuse and generalized this into DetailDrawer2 (forms2.jsx) instead of
// building a third bespoke drawer — refactored here to consume that shared
// shell rather than duplicating its own header/body chrome a second time.
// Only the wrapper changed; the body content (core argument / entry
// triggers / settings / edit-toggle / archive) is untouched.
function WatchlistDrawer2({ w, onClose, t }) {
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Reset to display mode whenever the drawer opens on a (possibly
  // different) ticker — mirrors PositionDrawer2's own reset-on-ticker-change
  // effect (drawer2.jsx), same reasoning: stale edit state from the last
  // entry viewed must never leak into the next one.
  React.useEffect(() => { setEditing(false); }, [w && w.ticker]);

  const archive = async () => {
    if (!window.confirm(`Remove ${w.ticker} from the watchlist? It moves to Archived, not deleted — recoverable later.`)) return;
    setBusy(true);
    const res = await window.archiveWatchlistEntry(w.ticker);
    if (res.ok) {
      if (window.loadThesis) await window.loadThesis();
      onClose();
    } else {
      setBusy(false);
      window.alert(res.conflict ? 'Watchlist changed elsewhere — reload and try again.' : 'Failed to archive — try again.');
    }
  };

  return (
    <DetailDrawer2 open={!!w} onClose={onClose} title={w ? w.ticker + ' · watchlist' : ''}>
      {w && (
        editing ? (
          <WatchlistEntryEdit2 w={w} t={t} onDone={() => setEditing(false)} />
        ) : (
          <React.Fragment>
            <div>
              <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Core argument</MonoTxt>
              <div style={{ fontSize: 12.5, color: t.dim, lineHeight: 1.55, paddingTop: 8, borderTop: `1px solid ${t.hair}` }}>{w.core_argument}</div>
            </div>
            <div>
              <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Entry triggers</MonoTxt>
              {w.entry_triggers.length > 0 ? w.entry_triggers.map((trig, i) => (
                <div key={i} style={{ padding: '9px 0', borderTop: `1px solid ${t.hair}`, fontSize: 12.5, color: t.dim }}>{trig}</div>
              )) : <div style={{ padding: '9px 0', borderTop: `1px solid ${t.hair}`, fontSize: 12.5, color: t.faint, fontStyle: 'italic' }}>No triggers set.</div>}
            </div>
            <div>
              <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Settings</MonoTxt>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderTop: `1px solid ${t.hair}`, fontSize: 12.5, color: t.dim }}>
                <span>Conviction</span><span style={{ fontFamily: t.mono, color: t.ink, whiteSpace: 'nowrap' }}>{w.conviction}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderTop: `1px solid ${t.hair}`, fontSize: 12.5, color: t.dim }}>
                <span>Trailing stop</span><span style={{ fontFamily: t.mono, color: t.ink, whiteSpace: 'nowrap' }}>{w.trailing_stop_pct != null ? w.trailing_stop_pct + '%' : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderTop: `1px solid ${t.hair}`, fontSize: 12.5, color: t.dim }}>
                <span>Classification</span><span style={{ fontFamily: t.mono, color: t.ink, whiteSpace: 'nowrap' }}>{w.layer != null ? 'Layer ' + w.layer + ' · ' : ''}{w.thesis_type}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 18 }}>
              <button className="f2-press" onClick={() => setEditing(true)} style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Edit entry →</button>
              <button className="f2-press" onClick={archive} disabled={busy} style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.red, background: 'none', border: 'none', padding: 0, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'Archiving…' : 'Archive'}</button>
            </div>
          </React.Fragment>
        )
      )}
    </DetailDrawer2>
  );
}

function WatchlistTab2() {
  const t = useTheme2();
  const F = window.FINCR;
  const [addOpen, setAddOpen] = React.useState(false);
  const [drawerTicker, setDrawerTicker] = React.useState(null);
  const watchlist = F.watchlist || [];
  const drawerEntry = drawerTicker ? watchlist.find((w) => w.ticker === drawerTicker) : null;
  // If the open entry is archived/removed out from under the drawer (e.g. the
  // owner archives it, or another device does), close rather than show stale
  // data — matches PositionDrawer2's own "open = !!h" derived-not-stored posture.
  React.useEffect(() => {
    if (drawerTicker && !drawerEntry) setDrawerTicker(null);
  }, [watchlist, drawerTicker, drawerEntry]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, paddingBottom: 18, borderBottom: `1px solid ${t.hair}` }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', color: t.ink }}>Watchlist</h1>
        <MonoTxt size={10.5} color={t.faint} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', paddingBottom: 2 }}>{watchlist.length} tracked · not owned</MonoTxt>
        <div style={{ flex: 1 }}></div>
        <button className="f2-press" onClick={() => setAddOpen(true)} style={{ fontFamily: t.sans, fontSize: 12.5, fontWeight: 600, color: t.dim, background: 'transparent', border: `1px solid ${t.hair}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>+ Add</button>
      </div>

      {/* Empty-state discipline mirrors Decision Rules (C2-D157) / the old
          Positions-tab section (C2-D159) — unchanged wording, just moved. */}
      {watchlist.length === 0 ? (
        <div style={{ padding: '9px 0', fontSize: 12.5, color: t.faint, fontStyle: 'italic' }}>No watchlist entries yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Asset', 'Thesis', 'Layer', 'Stop', 'Conviction'].map((h, i) => (
                <th key={h} style={{ fontFamily: t.mono, fontSize: 9.5, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.faint, textAlign: i >= 3 ? 'right' : 'left', padding: '0 8px 9px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {watchlist.map((w) => (
              <tr key={w.ticker} className="f2-row" onClick={() => setDrawerTicker(w.ticker)} style={{ cursor: 'pointer' }}>
                <td style={{ padding: '12px 8px', borderTop: `1px solid ${t.hair}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{w.ticker}</div>
                  <div style={{ fontSize: 11, color: t.faint }}>{w.company}</div>
                </td>
                <td style={{ padding: '12px 8px', borderTop: `1px solid ${t.hair}` }}>
                  <div style={{ color: t.dim, fontSize: 12.5, maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.core_argument}</div>
                  <div style={{ fontFamily: t.mono, fontSize: 11, color: t.faint, marginTop: 3 }}>{w.entry_triggers.length} entry trigger{w.entry_triggers.length !== 1 ? 's' : ''}</div>
                </td>
                <td style={{ padding: '12px 8px', borderTop: `1px solid ${t.hair}`, fontSize: 11, color: t.faint }}>
                  {w.layer != null ? 'Layer ' + w.layer : ''}{w.layer != null && w.thesis_type ? ' · ' : ''}{w.thesis_type || ''}
                </td>
                <td style={{ padding: '12px 8px', borderTop: `1px solid ${t.hair}`, textAlign: 'right', fontFamily: t.mono, fontSize: 12.5, color: t.faint }}>
                  {w.trailing_stop_pct != null ? w.trailing_stop_pct + '%' : '—'}
                </td>
                <td style={{ padding: '12px 8px', borderTop: `1px solid ${t.hair}`, textAlign: 'right' }}>
                  <Chip2 tone={w.conviction === 'high' ? 'ok' : w.conviction === 'medium' ? 'watch' : 'mute'}>{w.conviction}</Chip2>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <WatchlistDrawer2 w={drawerEntry} onClose={() => setDrawerTicker(null)} t={t} />
      <AddWatchlistModal2 open={addOpen} onClose={() => setAddOpen(false)} t={t} />
    </div>
  );
}
window.WatchlistTab2 = WatchlistTab2;
