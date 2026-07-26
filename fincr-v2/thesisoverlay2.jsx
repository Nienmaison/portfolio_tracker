/* Fincr 2.0 — Full-thesis overlay (C2-D129, Phase 2 of the full-thesis-overlay
   line of work; schema/backend shipped in C2-D128). Read-only in this phase —
   Phase 3 adds inline editing. Design handoff: "Full-Thesis Overlay" prototype
   + README (Claude Design). Layout A (reading + rail) is the default above
   ~900px; Layout C (single-column sheet) is the fallback below it — also
   Layout A/B's mobile fallback per the handoff. Layout B (dossier/side-nav)
   and the prototype's layout switcher are explicitly out of scope: the
   switcher was a review affordance for picking a layout, not a shipped
   feature, and B was never chosen.

   Data reconciliation vs. the prototype's idealised model (documented in
   decisions.md [C2-D129]):
   - indicator.statement -> text, indicator type 'price' -> 'price_level' (data
     stays price_level; only the UI label reads "Price", per Phase 1's naming
     note).
   - Real thesis_indicators carry no `note` field (the prototype's is
     optional) — rendered conditionally, simply absent on all real data today.
   - Position stats: Phase 1's GET /thesis/<ticker>/full deliberately does not
     compute current value / unrealised P&L server-side (that would duplicate
     what store2.jsx already owns). This component merges that endpoint's
     static figures (avg_buy_price -> Cost basis) with F.holdings' already-live
     ones (value -> Position, weight, pnlPct -> Unrealised) instead.
   - Decision rules: the prototype's per-holding [Entry,Exit,Target,Size cap]
     rows have no equivalent in the real schema — decision_rules is a single
     GLOBAL object (tranche_selling/rebalancing/value_gap/trailing_stops, each
     a different shape), confirmed during Phase 1's Researcher pass. Rendered
     here as what it actually is (one labelled group per real sub-key), not
     forced into a fictional four-row shape.
   - full_thesis is absent on every real holding today (schema-only until
     Phase 3's editor exists) — falls back to rendering core_argument as a
     single "Core argument" section rather than an empty state, so the
     overlay is useful now, not just once theses are authored. */

// ── Sanitized-text renderer ───────────────────────────────────────────────────
// Renders a string that may contain <strong>/<em>/<code> tags — already
// restricted server-side (sanitize_thesis_html, C2-D128) — as real React
// elements. Never dangerouslySetInnerHTML, even though the input is
// pre-sanitized: a second, independent layer of defense per the design
// handoff's explicit instruction. Even if the server-side sanitizer had a
// bug, this only ever emits strong/em/code elements matched by this fixed
// pattern; everything else is pushed as a plain string (React escapes string
// children by default).
function f2RenderSanitized(text, tagStyles) {
  if (!text) return null;
  var re = /<(strong|em|code)>([\s\S]*?)<\/\1>/g;
  var out = [];
  var lastIndex = 0, m, key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index));
    out.push(React.createElement(m[1], { key: 'sn' + (key++), style: (tagStyles && tagStyles[m[1]]) || undefined }, m[2]));
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

// Same redeclare-per-file convention as THESIS_SENTINEL elsewhere in this
// codebase — thesis-adapter.js already has an identical titleCase, but that
// file isn't a shared-import target (plain <script> tags, no ES modules).
function f2TitleCase(s) {
  if (!s || typeof s !== 'string') return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const F2_INDICATOR_TYPE_LABEL = { risk: 'Risk', catalyst: 'Catalyst', price_level: 'Price' };
const F2_INDICATOR_TYPE_NOTE = { risk: 'Invalidates the thesis', catalyst: 'Would re-rate the position', price_level: 'Action rule on price' };
const F2_INDICATOR_TYPE_ORDER = ['risk', 'catalyst', 'price_level'];

// C2-D130 — local id generators, redeclared per this codebase's established
// per-file-constant convention (see THESIS_SENTINEL, f2indicatorId in
// drawer2.jsx/store2.jsx before C2-D130 retired the drawer's copy). Section
// ids are client-only (React keys) — the server schema has no id field on a
// full_thesis section, so this is never sent in the save payload. Indicator
// ids use the same `ind_` shape the rest of this codebase already uses.
function f2SectionId() { return 'sec_' + Math.random().toString(36).slice(2, 9); }
function f2IndicatorId() { return 'ind_' + Math.random().toString(36).slice(2, 9); }

// ── Shared blocks ──────────────────────────────────────────────────────────────

function f2Prose(fullThesis, coreArgument, t) {
  var sections = fullThesis && fullThesis.sections;
  if (!sections || !sections.length) {
    if (!coreArgument) {
      return <div style={{ fontSize: 13, color: t.faint, fontStyle: 'italic' }}>No thesis written yet.</div>;
    }
    return (
      <React.Fragment>
        <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: t.ink, margin: '0 0 8px' }}>Core argument</h3>
        <p style={{ fontSize: 13.5, lineHeight: 1.72, color: t.dim, margin: '0 0 12px', maxWidth: '66ch' }}>
          {f2RenderSanitized(coreArgument, { strong: { color: t.ink, fontWeight: 600 } })}
        </p>
      </React.Fragment>
    );
  }
  return sections.map(function (s, i) {
    return (
      <React.Fragment key={i}>
        <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: t.ink, margin: i === 0 ? '0 0 8px' : '24px 0 8px' }}>{s.heading}</h3>
        {(s.paragraphs || []).map(function (p, pi) {
          return (
            <p key={pi} style={{ fontSize: 13.5, lineHeight: 1.72, color: t.dim, margin: '0 0 12px', maxWidth: '66ch' }}>
              {f2RenderSanitized(p, { strong: { color: t.ink, fontWeight: 600 } })}
            </p>
          );
        })}
      </React.Fragment>
    );
  });
}

function f2ConditionTrack(c, t) {
  if (!c || c.op === 'schedule' || !isFinite(c.min) || !isFinite(c.max) || c.max <= c.min) return null;
  var pct = function (v) { return Math.max(0, Math.min(100, ((v - c.min) / (c.max - c.min)) * 100)); };
  var target = pct(c.value), now = pct(c.current);
  return (
    <div style={{ marginTop: 2 }}>
      <div style={{ position: 'relative', height: 3, borderRadius: 2, background: t.hair }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: now + '%', borderRadius: 2, background: 'linear-gradient(90deg, rgba(217,162,63,0.25), ' + t.amber + ')' }}></div>
        <div style={{ position: 'absolute', top: -4, left: target + '%', width: 2, height: 11, background: t.hairStrong, borderRadius: 1 }}></div>
        <div style={{ position: 'absolute', top: -3.5, left: 'calc(' + now + '% - 5px)', width: 10, height: 10, borderRadius: '50%', background: t.amber, boxShadow: '0 0 0 3px ' + t.page }}></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: t.mono, fontSize: 9.5, color: t.faint }}>
        <span>{'Now ' + c.unit + Number(c.current).toLocaleString('en-US')}</span>
        <span>{'Level ' + c.unit + Number(c.value).toLocaleString('en-US')}</span>
      </div>
    </div>
  );
}

function f2IndicatorCard(ind, t) {
  var mode = (ind.state && ind.state.mode) || 'static';
  var stLabel = mode === 'triggered' ? ('Triggered' + (ind.state.asOf ? ' · ' + ind.state.asOf : '')) : mode === 'armed' ? 'Armed' : 'Static';
  var dotColor = mode === 'triggered' ? t.red : mode === 'armed' ? t.accent : t.ghost;
  var typeColor = ind.type === 'risk' ? t.red : ind.type === 'catalyst' ? t.green : t.amber;
  var typeSoft = ind.type === 'risk' ? t.redSoft : ind.type === 'catalyst' ? t.greenSoft : t.amberSoft;
  return (
    <div key={ind.id} style={{ border: '1px solid ' + t.hair, borderRadius: 12, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 9, background: t.hover, marginTop: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 5, color: typeColor, background: typeSoft }}>
          {F2_INDICATOR_TYPE_LABEL[ind.type] || ind.type}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: t.mono, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.ghost, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, display: 'inline-block', boxShadow: mode !== 'static' ? '0 0 0 3px ' + (mode === 'triggered' ? t.redSoft : t.accentSoft) : 'none' }}></span>
          {stLabel}
        </span>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: t.ink }}>{ind.text}</div>
      {ind.note && <div style={{ fontSize: 11.5, lineHeight: 1.5, color: t.faint }}>{ind.note}</div>}
      {f2ConditionTrack(ind.condition, t)}
    </div>
  );
}

// Grouped by type (Layout A/rail) — one labelled group per type present,
// empty groups omitted, per the design handoff.
function f2IndicatorGroups(indicators, t) {
  indicators = indicators || [];
  return F2_INDICATOR_TYPE_ORDER.map(function (ty) {
    var list = indicators.filter(function (i) { return i.type === ty; });
    if (!list.length) return null;
    return (
      <div key={ty} style={{ marginBottom: 18 }}>
        <MonoTxt size={9.5} color={t.ghost} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block' }}>
          {(F2_INDICATOR_TYPE_LABEL[ty] || ty) + ' · ' + F2_INDICATOR_TYPE_NOTE[ty]}
        </MonoTxt>
        {list.map(function (ind) { return f2IndicatorCard(ind, t); })}
      </div>
    );
  });
}

// C2-D130 — editable full_thesis.sections. Controlled inputs throughout
// (TextField2 for headings, plain textareas bound to string state for
// paragraphs) — never DOM-level contenteditable, per the design handoff's own
// "recreate, don't paste" instruction; the prototype's contenteditable toggle
// was a prototyping shortcut, not something to port. `sections` carries a
// client-only `_id` per entry for React keys — never sent to the server
// (handleSave strips it before building the request body).
function F2EditableSections({ sections, onChange, coreArgument, t }) {
  function update(si, patch) {
    onChange(sections.map(function (s, i) { return i === si ? Object.assign({}, s, patch) : s; }));
  }
  function updateParagraph(si, pi, val) {
    var paragraphs = sections[si].paragraphs.map(function (p, i) { return i === pi ? val : p; });
    update(si, { paragraphs: paragraphs });
  }
  function addParagraph(si) {
    update(si, { paragraphs: sections[si].paragraphs.concat(['']) });
  }
  function removeParagraph(si, pi) {
    update(si, { paragraphs: sections[si].paragraphs.filter(function (_, i) { return i !== pi; }) });
  }
  function addSection() {
    onChange(sections.concat([{ _id: f2SectionId(), heading: '', paragraphs: [''] }]));
  }
  function removeSection(si) {
    onChange(sections.filter(function (_, i) { return i !== si; }));
  }
  // Empty full_thesis is the common case today (nothing has been authored
  // yet) — a "start a full thesis" entry point pre-seeds one section from
  // core_argument (a starting point to expand from, not a link between the
  // two fields — committing only ever writes full_thesis) rather than
  // showing a blank, contextless form.
  function startFullThesis() {
    onChange([{ _id: f2SectionId(), heading: 'Core argument', paragraphs: [coreArgument || ''] }]);
  }

  if (!sections.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, color: t.faint, lineHeight: 1.6, fontStyle: 'italic' }}>
          No long-form thesis yet — the compact card and this overlay currently show your core argument only.
        </div>
        <Btn2 primary onClick={startFullThesis} style={{ alignSelf: 'flex-start' }}>Start a full thesis</Btn2>
      </div>
    );
  }

  var inputStyle = window.f2InputStyle(t);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sections.map(function (sec, si) {
        return (
          <div key={sec._id} style={{ border: '1px solid ' + t.hair, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <TextField2 value={sec.heading} onChange={function (v) { update(si, { heading: v }); }} placeholder="Section heading" />
              </div>
              <button onClick={function () { removeSection(si); }} title="Remove section" className="f2-press"
                style={{ background: 'none', border: 'none', color: t.faint, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 6px', borderRadius: 6, flexShrink: 0 }}>×</button>
            </div>
            {sec.paragraphs.map(function (p, pi) {
              return (
                <div key={pi} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <textarea value={p} onChange={function (e) { updateParagraph(si, pi, e.target.value); }} rows={3}
                    style={Object.assign({}, inputStyle, { flex: 1, resize: 'vertical', lineHeight: 1.5 })} />
                  <button onClick={function () { removeParagraph(si, pi); }} title="Remove paragraph" className="f2-press"
                    style={{ background: 'none', border: 'none', color: t.faint, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 6px', borderRadius: 6, flexShrink: 0 }}>×</button>
                </div>
              );
            })}
            <TextBtn2 tone="accent" onClick={function () { addParagraph(si); }} style={{ alignSelf: 'flex-start' }}>+ Add paragraph</TextBtn2>
          </div>
        );
      })}
      <TextBtn2 tone="accent" onClick={addSection} style={{ alignSelf: 'flex-start' }}>+ Add section</TextBtn2>
    </div>
  );
}

// C2-D130 — editable thesis_indicators, consolidated from drawer2.jsx's now-
// retired ThesisEditor2 indicator editor and extended with the fields that
// editor never exposed: `note`, `state.mode` (this is the first UI anywhere
// to expose Phase 1's static/armed/triggered schema), and for `price_level`,
// the full `condition` object driving the price track. Visual treatment
// matches the read-only `.ind` card (f2IndicatorCard) made editable in place.
function F2EditableIndicators({ indicators, onChange, t }) {
  function update(idx, patch) {
    onChange(indicators.map(function (ind, i) {
      if (i !== idx) return ind;
      var next = Object.assign({}, ind, patch);
      // Type-conditional, same discipline as the retired drawer editor: a
      // price-only field must not survive a type change away from price_level.
      if (next.type !== 'price_level') { next.target_price = null; next.condition = null; }
      return next;
    }));
  }
  function updateState(idx, patch) {
    update(idx, { state: Object.assign({}, indicators[idx].state || { mode: 'static' }, patch) });
  }
  function updateCondition(idx, patch) {
    var cur = indicators[idx].condition || { op: 'schedule', value: null, unit: '€', current: null, min: null, max: null };
    update(idx, { condition: Object.assign({}, cur, patch) });
  }
  function addIndicator() {
    onChange(indicators.concat([{ id: f2IndicatorId(), type: 'risk', text: '', note: '', state: { mode: 'static' }, target_price: null, condition: null }]));
  }
  function removeIndicator(idx) {
    onChange(indicators.filter(function (_, i) { return i !== idx; }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {indicators.map(function (ind, idx) {
        var condOp = (ind.condition && ind.condition.op) || 'schedule';
        return (
          <div key={ind.id} style={{ border: '1px solid ' + t.hair, borderRadius: 12, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: t.hover }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <Seg2
                  options={[
                    { value: 'risk', label: 'Risk', tone: 'bad' },
                    { value: 'price_level', label: 'Price', tone: 'watch' },
                    { value: 'catalyst', label: 'Catalyst', tone: 'ok' },
                  ]}
                  value={ind.type}
                  onChange={function (v) { update(idx, { type: v }); }}
                />
              </div>
              <button onClick={function () { removeIndicator(idx); }} title="Remove indicator" className="f2-press"
                style={{ background: 'none', border: 'none', color: t.faint, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 6px', borderRadius: 6, flexShrink: 0 }}>×</button>
            </div>
            <TextField2 value={ind.text} onChange={function (v) { update(idx, { text: v }); }} placeholder="Statement" />
            <TextField2 value={ind.note || ''} onChange={function (v) { update(idx, { note: v }); }} placeholder="Note (optional)" />
            <Field2 label="State">
              <Seg2
                options={[
                  { value: 'static', label: 'Static' },
                  { value: 'armed', label: 'Armed', tone: 'accent' },
                  { value: 'triggered', label: 'Triggered', tone: 'bad' },
                ]}
                value={(ind.state && ind.state.mode) || 'static'}
                onChange={function (v) { updateState(idx, { mode: v }); }}
              />
            </Field2>
            {ind.type === 'price_level' && (
              <React.Fragment>
                <Field2 label="Target price" hint="optional — the headline TARGET row">
                  <NumberField2 value={ind.target_price != null ? String(ind.target_price) : ''}
                    onChange={function (v) { update(idx, { target_price: v.trim() === '' ? null : Number(v) }); }}
                    prefix="€" placeholder="—" />
                </Field2>
                <Field2 label="Condition" hint="drives the price track">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Seg2
                      options={[
                        { value: '<=', label: '≤ Level' },
                        { value: '>=', label: '≥ Level' },
                        { value: 'accumulate_below', label: 'Accumulate below' },
                        { value: 'schedule', label: 'No track' },
                      ]}
                      value={condOp}
                      onChange={function (v) { updateCondition(idx, { op: v }); }}
                    />
                    {condOp !== 'schedule' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <NumberField2 value={ind.condition && ind.condition.value != null ? String(ind.condition.value) : ''}
                          onChange={function (v) { updateCondition(idx, { value: v.trim() === '' ? null : Number(v) }); }}
                          prefix={(ind.condition && ind.condition.unit) || '€'} placeholder="Level" />
                        <NumberField2 value={ind.condition && ind.condition.current != null ? String(ind.condition.current) : ''}
                          onChange={function (v) { updateCondition(idx, { current: v.trim() === '' ? null : Number(v) }); }}
                          prefix={(ind.condition && ind.condition.unit) || '€'} placeholder="Current" />
                        <NumberField2 value={ind.condition && ind.condition.min != null ? String(ind.condition.min) : ''}
                          onChange={function (v) { updateCondition(idx, { min: v.trim() === '' ? null : Number(v) }); }}
                          placeholder="Track min" />
                        <NumberField2 value={ind.condition && ind.condition.max != null ? String(ind.condition.max) : ''}
                          onChange={function (v) { updateCondition(idx, { max: v.trim() === '' ? null : Number(v) }); }}
                          placeholder="Track max" />
                      </div>
                    )}
                  </div>
                </Field2>
              </React.Fragment>
            )}
          </div>
        );
      })}
      <TextBtn2 tone="accent" onClick={addIndicator} style={{ alignSelf: 'flex-start' }}>+ Add indicator</TextBtn2>
    </div>
  );
}

// C2-D130 — the editing body. One layout regardless of the A/C read-mode
// breakpoint (a single scrolling column) — the two-column reading layout
// exists to make long-form argument and indicators visible together while
// BROWSING; editing is inherently more form-like and gains nothing from the
// split. Stats and decision rules render read-only for context (per this
// decision's scope boundary — neither becomes editable here).
function f2EditBody(full, h, draftSections, setDraftSections, draftIndicators, setDraftIndicators, t) {
  var rulesBlock = f2RulesBlock(full.decision_rules, t);
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 30px 30px', display: 'flex', flexDirection: 'column' }}>
      {f2StatsBlock(full, h, t)}
      {f2Divider(t)}
      <MonoTxt size={9.5} color={t.ghost} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>Full thesis</MonoTxt>
      <F2EditableSections sections={draftSections} onChange={setDraftSections} coreArgument={full.core_argument} t={t} />
      {f2Divider(t)}
      <MonoTxt size={9.5} color={t.ghost} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>Thesis indicators</MonoTxt>
      <F2EditableIndicators indicators={draftIndicators} onChange={setDraftIndicators} t={t} />
      {rulesBlock && f2Divider(t)}
      {rulesBlock}
    </div>
  );
}

// decision_rules is a single GLOBAL object, not per-holding (confirmed live,
// C2-D128's Researcher pass) — rendered as its real four sub-keys, not forced
// into the prototype's per-holding Entry/Exit/Target/Size-cap shape, which
// has no equivalent in the real schema.
function f2RulesBlock(decisionRules, t) {
  if (!decisionRules) return null;
  var groups = [];
  var tr = decisionRules.tranche_selling;
  if (tr) groups.push({ label: 'Tranche selling', rows: Object.entries(tr).map(function (e) { return [e[0].replace(/_/g, ' '), String(e[1])]; }) });
  var rb = decisionRules.rebalancing;
  if (rb) {
    var rbRows = [];
    if (rb.method) rbRows.push(['Method', rb.method]);
    if (rb.drift_trigger_pct != null) rbRows.push(['Drift trigger', rb.drift_trigger_pct + '%']);
    if (rb.backstop) rbRows.push(['Backstop', rb.backstop]);
    if (rb.tier_targets) Object.entries(rb.tier_targets).forEach(function (e) { rbRows.push([e[0].replace(/_/g, ' '), String(e[1])]); });
    groups.push({ label: 'Rebalancing', rows: rbRows });
  }
  var vg = decisionRules.value_gap;
  if (vg) {
    var vgRows = [];
    if (vg.buy_threshold != null) vgRows.push(['Buy threshold', String(vg.buy_threshold)]);
    if (vg.description) vgRows.push(['Rule', vg.description]);
    groups.push({ label: 'Value gap', rows: vgRows });
  }
  var ts = decisionRules.trailing_stops;
  if (ts) {
    var tsRows = [];
    if (ts.applies_to && ts.applies_to.length) tsRows.push(['Applies to', ts.applies_to.map(function (s) { return String(s).replace(/_/g, ' '); }).join(', ')]);
    if (ts.default_pct != null) tsRows.push(['Default', ts.default_pct + '%']);
    if (ts.note) tsRows.push(['Note', ts.note]);
    groups.push({ label: 'Trailing stops', rows: tsRows });
  }
  if (!groups.length) return null;
  return (
    <div>
      <MonoTxt size={9.5} color={t.ghost} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Decision rules</MonoTxt>
      {groups.map(function (g, gi) {
        return (
          <div key={gi} style={{ marginTop: gi ? 14 : 8 }}>
            <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>{g.label}</MonoTxt>
            {g.rows.map(function (r, ri) {
              return (
                <div key={ri} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '9px 0', borderTop: '1px solid ' + t.hair }}>
                  <span style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.ghost, width: 108, flexShrink: 0 }}>{r[0]}</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.5, color: t.ink }}>{r[1]}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Merges Phase 1's static per-holding stats (avg_buy_price -> Cost basis) with
// F.holdings' already-live figures (value -> Position, weight, pnlPct ->
// Unrealised) — see the file header for why this isn't computed server-side.
// Every monetary figure goes through <Money>, the directional one through
// <Delta2>, per design.md §4.2 — never raw text, matching the rest of the app.
function f2StatsBlock(full, h, t) {
  var F = window.FINCR;
  var stats = full.stats || {};
  var weightPct = (h && F.totalValue) ? (h.value / F.totalValue * 100) : null;
  var cells = [
    { k: 'Position', node: h ? <Money size={14} weight={600}>{F.eur(h.value)}</Money> : <MonoTxt size={14} color={t.faint}>—</MonoTxt> },
    { k: 'Weight', node: weightPct != null ? <MonoTxt size={14} color={t.ink} style={{ fontWeight: 600 }}>{weightPct.toFixed(1) + '%'}</MonoTxt> : <MonoTxt size={14} color={t.faint}>—</MonoTxt> },
    { k: 'Cost basis', node: stats.avg_buy_price != null ? <Money size={14} weight={600}>{F.eur(stats.avg_buy_price, 2)}</Money> : <MonoTxt size={14} color={t.faint}>—</MonoTxt> },
    { k: 'Unrealised', node: (h && h.pnlPct != null) ? <Delta2 pct={h.pnlPct} size={14} /> : <MonoTxt size={14} color={t.faint}>—</MonoTxt> },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: t.hair, border: '1px solid ' + t.hair, borderRadius: 12, overflow: 'hidden' }}>
      {cells.map(function (c, i) {
        return (
          <div key={i} style={{ background: t.raise, padding: '12px 13px' }}>
            <MonoTxt size={9} color={t.ghost} style={{ letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block' }}>{c.k}</MonoTxt>
            <div style={{ marginTop: 5 }}>{c.node}</div>
          </div>
        );
      })}
    </div>
  );
}

function f2Divider(t) { return <div style={{ height: 1, background: t.hair, margin: '22px 0' }}></div>; }

// ── Layouts ────────────────────────────────────────────────────────────────────
// Layout A (default, >=900px): scrolling argument left, fixed rail right.
function f2LayoutA(full, h, t) {
  return (
    <React.Fragment>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 30px 30px' }}>
        {f2Prose(full.full_thesis, full.core_argument, t)}
      </div>
      <aside style={{ width: 330, flexShrink: 0, borderLeft: '1px solid ' + t.hair, overflowY: 'auto', padding: '22px 24px 30px', background: t.dark ? 'rgba(10,13,22,0.4)' : t.sunk }}>
        {f2StatsBlock(full, h, t)}
        {f2Divider(t)}
        {f2IndicatorGroups(full.thesis_indicators, t)}
        {f2Divider(t)}
        {f2RulesBlock(full.decision_rules, t)}
      </aside>
    </React.Fragment>
  );
}

// Layout C (fallback, <900px): single column, indicators in one responsive
// band (no type grouping) — per the design handoff.
function f2LayoutC(full, h, t) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '26px 34px 34px' }}>
      {f2StatsBlock(full, h, t)}
      {f2Divider(t)}
      {f2Prose(full.full_thesis, full.core_argument, t)}
      {f2Divider(t)}
      {(full.thesis_indicators || []).length > 0 && (
        <React.Fragment>
          <MonoTxt size={9.5} color={t.ghost} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Thesis indicators</MonoTxt>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
            {(full.thesis_indicators || []).map(function (ind) { return f2IndicatorCard(ind, t); })}
          </div>
          {f2Divider(t)}
        </React.Fragment>
      )}
      {f2RulesBlock(full.decision_rules, t)}
    </div>
  );
}

function ThesisOverlaySkeleton2({ t }) {
  var widths = [88, 96, 72, 84, 60];
  return (
    <div style={{ flex: 1, padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {widths.map(function (w, i) {
        return <div key={i} style={{ height: 13, width: w + '%', borderRadius: 4, background: t.hover }}></div>;
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
// Portals to document.body (same reason as Modal2/Drawer2, forms2.jsx: a
// backdrop-filter ancestor creates a stacking context that would trap a
// non-portalled overlay behind later sibling cards). Rendered once at the
// Shell2 level (mirrors PositionDrawer2's placement) so it persists across
// tab switches and survives a deep-link landing before the Positions tab has
// necessarily settled.
function ThesisOverlay2() {
  const t = useTheme2();
  const store = useStore2();
  const ticker = store.thesisOverlayTicker;
  const open = !!ticker;

  const [full, setFull] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [width, setWidth] = React.useState(function () { return window.innerWidth; });

  // C2-D130 — editing state. draftSections/draftIndicators are populated
  // ONLY when entering edit mode (startEditing) and cleared ONLY when
  // leaving it via an explicit Cancel or a successful Save — never reset as
  // a side effect of a failed save or a conflict, so an owner's in-progress
  // edits are never silently discarded (the whole point of this phase's
  // conflict-handling requirement).
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftSections, setDraftSections] = React.useState([]);
  const [draftIndicators, setDraftIndicators] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);
  const [conflict, setConflict] = React.useState(null); // { liveVersion } | null

  const modalRef = React.useRef(null);
  const restoreFocusRef = React.useRef(null);

  // Layout A/C breakpoint (900px, per the design handoff) — tracks live so
  // resizing the window while the overlay is open switches layout in place.
  React.useEffect(function () {
    function onResize() { setWidth(window.innerWidth); }
    window.addEventListener('resize', onResize);
    return function () { window.removeEventListener('resize', onResize); };
  }, []);

  const load = React.useCallback(function () {
    if (!ticker) return;
    setLoading(true); setLoadError(false); setFull(null);
    var p = window.loadThesisFull ? window.loadThesisFull(ticker) : Promise.resolve(null);
    p.then(function (d) {
      setLoading(false);
      if (d) setFull(d); else setLoadError(true);
    });
  }, [ticker]);

  React.useEffect(function () {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticker]);

  // Reset editing state whenever a different ticker's overlay opens — an
  // in-progress edit on ticker A must never bleed into ticker B's view.
  React.useEffect(function () {
    setIsEditing(false); setDraftSections([]); setDraftIndicators([]);
    setSaving(false); setSaveError(null); setConflict(null);
  }, [ticker]);

  // Focus management: capture the triggering element on open, move focus
  // into the modal, lock body scroll; on close, restore focus to whatever
  // triggered the open (not just "somewhere on the page").
  React.useEffect(function () {
    if (!open) return;
    restoreFocusRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    // Focus synchronously in the effect rather than deferring to
    // requestAnimationFrame — by the time this effect runs, the modal div is
    // already committed to the DOM, so there's nothing to wait a paint for.
    // (rAF here previously meant the focus-in never actually happened in any
    // environment where paint/compositing is paused or throttled.)
    if (modalRef.current) modalRef.current.focus();
    return function () {
      document.body.style.overflow = '';
      if (restoreFocusRef.current && typeof restoreFocusRef.current.focus === 'function') {
        restoreFocusRef.current.focus();
      }
    };
  }, [open]);

  // C2-D130 — any close path (×, footer, Escape, backdrop) routes through
  // this single guard: if an edit session is open, confirm before discarding
  // it. Deliberately a blanket "isEditing => confirm" rather than a precise
  // dirty-check against the original data — simpler, and erring toward one
  // extra confirm on a genuinely untouched edit session is a much smaller
  // cost than a subtly-wrong dirty comparison silently skipping the confirm
  // when it shouldn't.
  function requestClose() {
    if (isEditing) {
      if (!confirm('Discard unsaved changes?')) return;
      setIsEditing(false); setConflict(null); setSaveError(null);
    }
    store.actions.closeThesisOverlay();
  }

  // Escape closes; Tab is trapped inside the modal while open.
  React.useEffect(function () {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
      if (e.key !== 'Tab' || !modalRef.current) return;
      var focusables = modalRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return function () { window.removeEventListener('keydown', onKeyDown); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing]);

  // C2-D130 — enters edit mode: seeds the two draft states from the current
  // `full` snapshot. Sections get a client-only _id for React keys (never
  // sent to the server); indicators are shallow-copied so editing a draft
  // row never mutates the read-view's own objects.
  function startEditing() {
    if (!full) return;
    var sections = (full.full_thesis && full.full_thesis.sections) || [];
    setDraftSections(sections.map(function (s) {
      return { _id: f2SectionId(), heading: s.heading, paragraphs: (s.paragraphs || []).slice() };
    }));
    setDraftIndicators((full.thesis_indicators || []).map(function (ind) { return Object.assign({}, ind); }));
    setSaveError(null);
    setConflict(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setSaveError(null);
    setConflict(null);
  }

  // C2-D130 — save: only changed fields, optimistic update, conflict-aware.
  async function handleSave() {
    var cleanSections = draftSections
      .map(function (s) { return { heading: (s.heading || '').trim(), paragraphs: s.paragraphs.filter(function (p) { return p.trim(); }) }; })
      .filter(function (s) { return s.heading; });
    var newFullThesis = cleanSections.length ? { sections: cleanSections } : null;

    var cleanIndicators = draftIndicators
      .filter(function (ind) { return ind.text && ind.text.trim(); })
      .map(function (ind) {
        var clean = {
          id: ind.id, type: ind.type, text: ind.text.trim(),
          target_price: ind.type === 'price_level' ? ind.target_price : null,
          state: ind.state || { mode: 'static' },
          condition: ind.type === 'price_level' ? (ind.condition || null) : null,
        };
        if (ind.note && ind.note.trim()) clean.note = ind.note.trim();
        return clean;
      });

    var changes = {};
    var origFullThesis = full.full_thesis || null;
    if (JSON.stringify(newFullThesis) !== JSON.stringify(origFullThesis)) changes.full_thesis = newFullThesis;
    var origIndicators = full.thesis_indicators || [];
    if (JSON.stringify(cleanIndicators) !== JSON.stringify(origIndicators)) changes.thesis_indicators = cleanIndicators;

    if (Object.keys(changes).length === 0) { setIsEditing(false); return; } // no-op — nothing changed

    setSaving(true); setSaveError(null); setConflict(null);

    // Optimistic update — reflect the edit immediately, before the network
    // round-trip resolves.
    var previousFull = full;
    setFull(Object.assign({}, full, changes));
    setIsEditing(false);

    var result = await (window.saveThesisVersioned
      ? window.saveThesisVersioned(ticker, changes, full.thesis_version, '')
      : Promise.resolve({ ok: false, conflict: false }));
    setSaving(false);

    if (result.ok) {
      // Quiet background refresh (not `load()`, which would show the
      // skeleton again) — picks up the server-bumped last_updated/
      // last_update_reason and the new thesis_version, so the next edit's
      // compare-and-swap has the right baseline.
      if (window.loadThesisFull) {
        window.loadThesisFull(ticker).then(function (d) { if (d) setFull(d); });
      }
      return;
    }

    if (result.conflict) {
      // Never silently discard or silently overwrite: roll back the
      // optimistic UI to the last-known-good state, but re-enter edit mode
      // with the SAME draft still populated (draftSections/draftIndicators
      // were never cleared) and surface an explicit conflict notice.
      setFull(previousFull);
      setConflict({ liveVersion: result.liveVersion });
      setIsEditing(true);
      return;
    }

    // Non-conflict failure (network, non-409 error) — same posture: roll
    // back the optimistic UI, keep the draft, let the owner retry.
    setFull(previousFull);
    setSaveError('Failed to save — try again.');
    setIsEditing(true);
  }

  // Explicit reload after a conflict — the owner's deliberate choice to see
  // the latest server state, discarding the stale draft (which they've
  // already had the chance to see and reconsider, per the conflict notice).
  function reloadAfterConflict() {
    setConflict(null);
    setIsEditing(false);
    load();
  }

  if (!open) return null;

  var isNarrow = width < 900;
  var F = window.FINCR;
  var h = (F.holdings || []).find(function (x) { return x.ticker === ticker; });
  var headingId = 'thesis-overlay-ticker-' + ticker;

  return ReactDOM.createPortal(
    <div
      onMouseDown={function (e) { if (e.target === e.currentTarget) requestClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(6,9,18,0.74)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 36 }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        style={{
          background: t.dark ? 'linear-gradient(180deg, rgba(30,35,48,0.96), rgba(18,22,33,0.97))' : t.raise,
          border: '1px solid ' + t.hairStrong,
          borderRadius: 20,
          boxShadow: t.dark ? '0 40px 120px -30px rgba(0,0,0,0.9)' : '0 40px 120px -30px rgba(23,25,30,0.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          width: '100%',
          maxWidth: isNarrow ? 780 : 1080,
          height: isNarrow ? 'min(86vh, 900px)' : 'min(84vh, 820px)',
          outline: 'none',
        }}
      >
        {/* head */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '22px 26px 18px', borderBottom: '1px solid ' + t.hair, flexShrink: 0 }}>
          <span style={{ width: 3, height: 34, borderRadius: 2, background: h ? h.color : t.ghost, marginTop: 2, flexShrink: 0 }}></span>
          <div style={{ minWidth: 0 }}>
            <div id={headingId} style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: t.ink, lineHeight: 1.1 }}>{ticker}</div>
            <div style={{ fontSize: 12, color: t.faint, marginTop: 2 }}>{full ? full.company : ''}</div>
          </div>
          {full && (
            <div style={{ marginLeft: 18, alignSelf: 'center', display: 'flex', gap: 6, flexShrink: 0 }}>
              <Chip2 tone={full.stance === 'accumulate' ? 'accent' : full.stance === 'trim' ? 'watch' : 'mute'}>{f2TitleCase(full.stance)}</Chip2>
              <Chip2 tone={full.conviction === 'high' ? 'ok' : 'mute'}>{f2TitleCase(full.conviction)}</Chip2>
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {!isEditing && full && (
              <button
                onClick={startEditing}
                className="f2-press"
                style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.faint, background: 'none', border: '1px solid ' + t.hair, borderRadius: 7, padding: '7px 11px', cursor: 'pointer' }}
              >Edit</button>
            )}
            <button
              onClick={requestClose}
              className="f2-press"
              aria-label="Close thesis overlay"
              style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid ' + t.hair, background: 'none', color: t.faint, cursor: 'pointer', fontSize: 15, lineHeight: 1 }}
            >×</button>
          </div>
        </div>

        {/* body */}
        <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
          {loading && <ThesisOverlaySkeleton2 t={t} />}
          {!loading && loadError && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 }}>
              <div style={{ fontSize: 13, color: t.faint }}>Couldn't load this thesis.</div>
              <Btn2 onClick={load}>Retry</Btn2>
            </div>
          )}
          {!loading && !loadError && full && (
            isEditing
              ? f2EditBody(full, h, draftSections, setDraftSections, draftIndicators, setDraftIndicators, t)
              : (isNarrow ? f2LayoutC(full, h, t) : f2LayoutA(full, h, t))
          )}
        </div>

        {/* foot */}
        {full && isEditing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '13px 26px', borderTop: '1px solid ' + t.hair, background: t.dark ? 'rgba(10,13,22,0.5)' : t.sunk, flexShrink: 0 }}>
            {conflict && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.amberSoft, border: '1px solid ' + t.amber, borderRadius: 9, padding: '10px 13px' }}>
                <span style={{ fontSize: 12, color: t.ink, flex: 1 }}>
                  This thesis changed elsewhere since you opened it. Your edits are still here — reload to see the latest version (you'll need to redo your changes on top of it).
                </span>
                <Btn2 onClick={reloadAfterConflict} style={{ flexShrink: 0 }}>Reload</Btn2>
              </div>
            )}
            {saveError && <MonoTxt size={11} color={t.red}>{saveError}</MonoTxt>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn2 onClick={cancelEditing}>Cancel</Btn2>
              <Btn2 primary onClick={handleSave} style={{ opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' : 'auto' }}>{saving ? 'Saving…' : 'Save'}</Btn2>
            </div>
          </div>
        )}
        {full && !isEditing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 26px', borderTop: '1px solid ' + t.hair, background: t.dark ? 'rgba(10,13,22,0.5)' : t.sunk, flexWrap: 'wrap' }}>
            <MonoTxt size={9.5} color={t.ghost} style={{ letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{'Updated ' + (full.last_updated || '—')}</MonoTxt>
            {full.last_update_reason && (
              <React.Fragment>
                <MonoTxt size={9.5} color={t.ghost}>·</MonoTxt>
                <MonoTxt size={9.5} color={t.ghost} style={{ textTransform: 'uppercase', letterSpacing: '0.1em', flex: 1, minWidth: 0 }}>{full.last_update_reason}</MonoTxt>
              </React.Fragment>
            )}
            <button
              onClick={requestClose}
              className="f2-press"
              style={{ marginLeft: 'auto', fontFamily: t.mono, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.faint, background: 'none', border: '1px solid ' + t.hair, borderRadius: 7, padding: '7px 11px', cursor: 'pointer', flexShrink: 0 }}
            >Close</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
window.ThesisOverlay2 = ThesisOverlay2;
