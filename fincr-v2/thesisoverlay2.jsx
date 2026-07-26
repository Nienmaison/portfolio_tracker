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

  // Escape closes; Tab is trapped inside the modal while open.
  React.useEffect(function () {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); store.actions.closeThesisOverlay(); return; }
      if (e.key !== 'Tab' || !modalRef.current) return;
      var focusables = modalRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return function () { window.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  if (!open) return null;

  var isNarrow = width < 900;
  var F = window.FINCR;
  var h = (F.holdings || []).find(function (x) { return x.ticker === ticker; });
  var headingId = 'thesis-overlay-ticker-' + ticker;

  return ReactDOM.createPortal(
    <div
      onMouseDown={function (e) { if (e.target === e.currentTarget) store.actions.closeThesisOverlay(); }}
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
          <button
            onClick={function () { store.actions.closeThesisOverlay(); }}
            className="f2-press"
            aria-label="Close thesis overlay"
            style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: '1px solid ' + t.hair, background: 'none', color: t.faint, cursor: 'pointer', fontSize: 15, lineHeight: 1, flexShrink: 0 }}
          >×</button>
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
          {!loading && !loadError && full && (isNarrow ? f2LayoutC(full, h, t) : f2LayoutA(full, h, t))}
        </div>

        {/* foot */}
        {full && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 26px', borderTop: '1px solid ' + t.hair, background: t.dark ? 'rgba(10,13,22,0.5)' : t.sunk, flexWrap: 'wrap' }}>
            <MonoTxt size={9.5} color={t.ghost} style={{ letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{'Updated ' + (full.last_updated || '—')}</MonoTxt>
            {full.last_update_reason && (
              <React.Fragment>
                <MonoTxt size={9.5} color={t.ghost}>·</MonoTxt>
                <MonoTxt size={9.5} color={t.ghost} style={{ textTransform: 'uppercase', letterSpacing: '0.1em', flex: 1, minWidth: 0 }}>{full.last_update_reason}</MonoTxt>
              </React.Fragment>
            )}
            <button
              onClick={function () { store.actions.closeThesisOverlay(); }}
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
