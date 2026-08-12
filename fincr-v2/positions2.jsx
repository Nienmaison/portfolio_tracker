/* Fincr 2.0 — Positions: thesis per holding, desk rules.
   The "why I own it" layer that sits under the overview ledger.
   Watchlist Extraction (C2-D160) — the Watchlist section that used to live
   here (C2-D159) has moved to its own top-level route: watchlist2.jsx's
   WatchlistTab2. Owner's own reasoning (see decisions.md [C2-D160]): sharing
   this page with thesis cards and Decision Rules made Watchlist feel
   overstimulating rather than calm. WatchlistRow2/WatchlistEntryEdit2/
   AddWatchlistModal2 all moved with it, verbatim internals — confirmed via
   the IA-overhaul Researcher pass that each had exactly one reader, all
   self-contained in this file, so nothing here still depends on them. */

// C2-D129 — permanently-compact card, per the full-thesis-overlay design
// handoff. Reads window.FINCR.thesisGrid (GET /thesis/grid, C2-D128) — a
// fixed-shape payload capped to the first 2 indicators + a total count — not
// F.thesis. There is no fold anymore (C2-D126's whole-card fold retired this
// decision, per its own reasoning: once the body is server-capped to a fixed
// shape, there is no card content left long enough to ever need folding — it
// isn't redundant, it's structurally unreachable). drawer2.jsx/agent2.jsx are
// UNTOUCHED and keep reading the full F.thesis/GET /thesis exactly as before.
function ThesisCard2({ th, highlight }) {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const h = F.holdings.find((x) => x.ticker === th.ticker);
  const stanceTone = th.stance === 'Accumulate' ? 'accent' : th.stance === 'Trim' ? 'watch' : 'mute';
  const indicators = th.indicators || [];
  const totalCount = th.indicatorCount != null ? th.indicatorCount : indicators.length;
  const rest = totalCount - indicators.length;
  return (
    <div style={{ background: t.card, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, boxShadow: t.cardShadow, border: `1px solid ${highlight === th.ticker ? t.accent : t.cardBorder}`, borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 13, transition: 'border-color 0.4s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {h && <span style={{ width: 3, height: 24, borderRadius: 2, background: h.color }}></span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: t.ink, lineHeight: 1.15 }}>{th.ticker}</div>
          <div style={{ fontSize: 11.5, color: t.faint }}>{th.name}</div>
        </div>
        <Chip2 tone={stanceTone}>{th.stance}</Chip2>
        <Chip2 tone={th.conviction === 'High' ? 'ok' : 'mute'}>{th.conviction}</Chip2>
      </div>

      <div style={{ fontSize: 12.5, color: t.dim, lineHeight: 1.55 }}>{th.argument}</div>

      {/* C2-D125 — was th.triggers (flat thesis_challenge_signals strings under
          a single "THESIS RISKS" label). Now th.indicators: a typed list (risk /
          price_level / catalyst), server-capped to the first 2 here (C2-D128's
          GET /thesis/grid). Read-only display — the editor lives in
          drawer2.jsx's ThesisEditor2 (full list); the overlay (below) shows
          every indicator on open. */}
      {indicators.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.12em', padding: '2px 0 1px' }}>THESIS INDICATORS</MonoTxt>
          {indicators.map((ind, i) => (
            <div key={ind.id || i} style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '7px 0', borderTop: `1px solid ${t.hair}` }}>
              <span style={{ fontFamily: t.mono, fontSize: 9, color: t.faint, flexShrink: 0, letterSpacing: '0.06em', textTransform: 'uppercase', minWidth: 58 }}>
                {ind.type === 'price_level' ? 'Price' : ind.type === 'catalyst' ? 'Catalyst' : 'Risk'}
              </span>
              <span style={{ fontSize: 12, color: t.ink, flex: 1 }}>
                {ind.text}
                {ind.type === 'price_level' && ind.target_price != null && (
                  <span style={{ fontFamily: t.mono, color: t.faint }}>{' — €' + Number(ind.target_price).toLocaleString()}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Only render TARGET when a price target has been set (null until set via editor, C2-S3) */}
      {th.target && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${t.hair}`, paddingTop: 10 }}>
        <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.12em' }}>TARGET</MonoTxt>
        <Money size={12.5} weight={600}>{th.target}</Money>
      </div>
      )}

      {/* Card footer — count (left) + overlay trigger (right), per the design
          handoff's .pfoot. "+N more" only appears once there IS more. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 2 }}>
        <MonoTxt size={9.5} color={t.ghost} style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {(rest > 0 ? '+' + rest + ' more · ' : '') + totalCount + ' tracked'}
        </MonoTxt>
        <button
          className="f2-press"
          onClick={() => store.actions.openThesisOverlay(th.ticker)}
          style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          Read full thesis <span>→</span>
        </button>
      </div>
    </div>
  );
}

// C2-D156 — per-section empty-state row for the Rulebook group, styled to
// match f2RulesBlock's own group-label rhythm (a MonoTxt label + one row) so
// an empty section reads as part of the same visual system, not a bolted-on
// placeholder. Deliberately PER-SECTION rather than whole-group: the owner
// cleared rebalancing/value_gap/trailing_stops as never-decided placeholder
// data, but a future state where e.g. rebalancing gets set for real via
// Finn while the other two are still empty should show one real section and
// two empty ones — not fall back to an all-or-nothing empty message that
// would need revisiting the moment the first real rule lands. Still used
// as-is inside DecisionRulesDrawer2 below (C2-D161) — moved container, same
// component, same reasoning.
function DecisionRuleEmptySection({ label, first, t }) {
  return (
    <div style={{ marginTop: first ? 8 : 14 }}>
      <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>{label}</MonoTxt>
      <div style={{ padding: '9px 0', borderTop: `1px solid ${t.hair}`, fontSize: 12.5, color: t.faint, fontStyle: 'italic' }}>No rules defined yet.</div>
    </div>
  );
}

// C2-D161 — Decision Rules, moved from two side-by-side fold-cards (C2-D146/
// 147/148) into a drawer. The C2-D148 Show/Hide fold UI is retired entirely
// — per the build spec, "the drawer is the fold now": a closed drawer already
// hides all of this content, so a second, nested collapse control inside it
// would be redundant chrome, not a feature. f2RulesBlock() itself, and
// DecisionRuleEmptySection above, are UNCHANGED — only where they're mounted
// moved. The mock's own two per-card "Set up with agent" seed buttons
// collapse into ONE footer button here (confirmed against the mock's actual
// RULES template, which has a single trailing button, not two) — a real
// simplification the two-card layout couldn't make since each card needed
// its own conversation starter; one drawer can have one.
function DecisionRulesDrawer2({ open, onClose, t }) {
  const F = window.FINCR;
  const rulebookHasAny = !!(F.decisionRules && (F.decisionRules.rebalancing || F.decisionRules.value_gap || F.decisionRules.trailing_stops));
  return (
    <DetailDrawer2 open={open} onClose={onClose} title="Decision rules">
      {F.decisionRules && F.decisionRules.tranche_selling ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>Tranche selling</MonoTxt>
            <Chip2 tone="accent">Enforced</Chip2>
          </div>
          {/* showHeading/showGroupLabels both false — the header above already
              names this group; f2RulesBlock's own heading would repeat it. */}
          {f2RulesBlock({ tranche_selling: F.decisionRules.tranche_selling }, t, false, false)}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: t.faint, fontStyle: 'italic' }}>No decision rules on record.</div>
      )}

      {F.decisionRules ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>Rulebook</MonoTxt>
            {rulebookHasAny && <Chip2 tone="mute">Not yet enforced</Chip2>}
          </div>
          {F.decisionRules.rebalancing
            ? f2RulesBlock({ rebalancing: F.decisionRules.rebalancing }, t, false)
            : <DecisionRuleEmptySection label="Rebalancing" first t={t} />}
          {F.decisionRules.value_gap
            ? f2RulesBlock({ value_gap: F.decisionRules.value_gap }, t, false)
            : <DecisionRuleEmptySection label="Value gap" t={t} />}
          {F.decisionRules.trailing_stops
            ? f2RulesBlock({ trailing_stops: F.decisionRules.trailing_stops }, t, false)
            : <DecisionRuleEmptySection label="Trailing stops" t={t} />}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: t.faint, fontStyle: 'italic' }}>No rulebook on record.</div>
      )}

      <button
        className="f2-press"
        onClick={() => {
          window.__fincrAgentSeed = { text: "Let's review my decision rules." };
          window.dispatchEvent(new CustomEvent('fincr:go-tab', { detail: { tab: 'agent' } }));
        }}
        style={{ alignSelf: 'flex-start', fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >Set these up with the agent →</button>
    </DetailDrawer2>
  );
}

// C2-D161 — Panel 1, "Needs a thesis". Renders only when there's something to
// triage. Reuses the exact scaffold-sentinel predicate (isWritten, passed in
// from PositionsTab2) — confirmed byte-identical across positions2.jsx/
// agent2.jsx/drawer2.jsx despite differing em-dash source encoding, so this
// is the same real check, not a re-derivation. Row click opens the existing
// PositionDrawer2 (money/P&L/ledger) via store.actions.openDrawer — NOT the
// agent; the agent link lives only in the footer, for working through the
// whole list at once.
function TriagePanel2({ missingHoldings, t, F, store }) {
  if (missingHoldings.length === 0) return null;
  const sum = missingHoldings.reduce((s, h) => s + h.value, 0);
  // C2-D164 — was a hardcoded literal ('rgba(23,27,36,0.32)') transcribed
  // directly from the design mock's dark-only .spanel CSS; illegible/wrong
  // in Paper mode since it never adapted. No existing theme2.js token
  // reproduces this exact value (closest is t.card, at a higher opacity —
  // 0.55/0.64 dark/light vs. the mock's 0.32 — a real, flagged visual
  // approximation, not a hidden one) — using it rather than inventing a
  // new one-off literal, per this build's own instruction.
  return (
    <div style={{ border: `1px solid ${t.hair}`, borderRadius: 14, background: t.card, padding: '16px 16px 6px' }}>
      <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500, display: 'block' }}>Needs a thesis</MonoTxt>
      <div style={{ fontSize: 11.5, color: t.ghost, marginBottom: 10 }}>{missingHoldings.length} holdings · {F.eur(sum)} held without a written reason.</div>
      {missingHoldings.map((h) => (
        <div key={h.ticker} onClick={() => store.actions.openDrawer(h.ticker)} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${t.hair}`, cursor: 'pointer' }}>
          <span style={{ width: 3, height: 13, borderRadius: 2, background: h.color }}></span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink }}>{h.ticker}</span>
          <MonoTxt size={11.5} color={t.faint}>{F.eur(h.value)}</MonoTxt>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${t.hair}`, padding: '12px 0 10px' }}>
        <button
          className="f2-press"
          onClick={() => {
            window.__fincrAgentSeed = { text: "Let's work through my holdings without a thesis." };
            window.dispatchEvent(new CustomEvent('fincr:go-tab', { detail: { tab: 'agent' } }));
          }}
          style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >Work through these with the agent →</button>
      </div>
    </div>
  );
}

// C2-D161 — Panel 2, "Thesis coverage". Always renders (unlike Panel 1).
// last_reviewed_at build (C2-D162) — fills the seam left above: an "Oldest
// reviewed" sub-block, reusing the same 3-column row shape as TriagePanel2's
// rows (14px color bar / ticker / mono value — here the value is relative
// age, not a EUR figure). Only ever pulls from `authored` (real, written
// theses) — an unwritten holding isn't "reviewed", it's already surfaced in
// Panel 1, and mixing the two lists would double-count the same ticker in
// two different panels for two different reasons.
function CoveragePanel2({ written, total, authored, t, F, store }) {
  const pct = total > 0 ? Math.round((written / total) * 100) : 0;
  // Null last_reviewed_at (never stamped — either a genuinely never-reviewed
  // thesis, or, right now, EVERY thesis written before this build shipped,
  // since no backfill was done, per spec) sorts first: -Infinity beats any
  // real timestamp, and "never reviewed" is a more overdue state than any
  // finite age. Oldest 3, matching the mock.
  const oldest = authored
    .slice()
    .sort((a, b) => {
      const av = a.lastReviewedAt ? new Date(a.lastReviewedAt).getTime() : -Infinity;
      const bv = b.lastReviewedAt ? new Date(b.lastReviewedAt).getTime() : -Infinity;
      return av - bv;
    })
    .slice(0, 3);
  // C2-D164 — same literal-background fix as TriagePanel2 above (see its
  // comment for the full reasoning); was 'rgba(23,27,36,0.32)', now t.card.
  return (
    <div style={{ border: `1px solid ${t.hair}`, borderRadius: 14, background: t.card, padding: '16px 16px 6px' }}>
      <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500, display: 'block' }}>Thesis coverage</MonoTxt>
      <div style={{ height: 4, borderRadius: 999, background: t.press, overflow: 'hidden', margin: '2px 0 9px' }}>
        <span style={{ display: 'block', height: '100%', background: t.accent, opacity: 0.75, width: pct + '%' }}></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5, color: t.ghost, paddingBottom: 4 }}>
        <span style={{ fontFamily: t.mono, fontSize: 12.5, color: t.ink }}>{written} / {total}</span>
        <span>holdings with a written reason</span>
      </div>
      {oldest.length > 0 && (
        <div style={{ borderTop: `1px solid ${t.hair}`, marginTop: 12, paddingTop: 11 }}>
          <div style={{ fontSize: 11.5, color: t.ghost, marginBottom: 8 }}>Oldest reviewed — a thesis you have not revisited in a while.</div>
          {oldest.map((th) => {
            const h = F.holdings.find((x) => x.ticker === th.ticker);
            return (
              <div key={th.ticker} onClick={() => store.actions.openThesisOverlay(th.ticker)} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${t.hair}`, cursor: 'pointer' }}>
                <span style={{ width: 3, height: 13, borderRadius: 2, background: h ? h.color : t.hairStrong }}></span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink }}>{th.ticker}</span>
                {/* Uppercase, matching the mono AGO-string convention every
                    other value in this row shape already uses (Panel 1's
                    EUR figures, the day/hour/minute suffixes themselves) —
                    "never reviewed" isn't a blank or an error state, it's a
                    real value that happens to describe an absence. */}
                <MonoTxt size={11.5} color={t.faint}>{th.lastReviewedAt ? f2FormatRelativeTime(new Date(th.lastReviewedAt).getTime()) : 'NEVER REVIEWED'}</MonoTxt>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// C2-D161 — Panel 3, "Desk rules". The one-line state is derived from real
// F.decisionRules, not the mock's literal example text — confirmed live
// against production thesis.json before writing this (tranche_selling
// present, rebalancing/value_gap/trailing_stops all absent), so the mock's
// exact wording ("Tranche selling active. Rulebook not yet set.") happens to
// match today's real state, but the sentence recomputes from scratch either
// way and will read correctly once that changes.
function DeskRulesPanel2({ t, F, onOpenRules }) {
  const trancheActive = !!(F.decisionRules && F.decisionRules.tranche_selling);
  const rulebookSet = !!(F.decisionRules && (F.decisionRules.rebalancing || F.decisionRules.value_gap || F.decisionRules.trailing_stops));
  const note = (trancheActive ? 'Tranche selling active.' : 'Tranche selling not set.') + ' ' + (rulebookSet ? 'Rulebook set.' : 'Rulebook not yet set.');
  // C2-D164 — same literal-background fix as TriagePanel2 above (see its
  // comment for the full reasoning); was 'rgba(23,27,36,0.32)', now t.card.
  return (
    <div style={{ border: `1px solid ${t.hair}`, borderRadius: 14, background: t.card, padding: '16px 16px 6px' }}>
      <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500, display: 'block' }}>Desk rules</MonoTxt>
      <div style={{ fontSize: 11.5, color: t.ghost }}>{note}</div>
      <div style={{ borderTop: `1px solid ${t.hair}`, marginTop: 10, padding: '12px 0 10px' }}>
        <button className="f2-press" onClick={onOpenRules} style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Open decision rules →</button>
      </div>
    </div>
  );
}

function PositionsTab2({ highlight }) {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  // C2-D161 — replaces collapsedA/collapsedB (C2-D148's per-card fold state,
  // retired along with the fold UI itself). One state, one drawer.
  const [rulesDrawerOpen, setRulesDrawerOpen] = React.useState(false);
  // C2-D129 — grid data lives on F.thesisGrid (GET /thesis/grid, C2-D128), a
  // second, independent fetch from F.thesis/loadThesis. Fetched per Positions-
  // tab mount (this component remounts on every tab switch via shell2.jsx's
  // <main key={tab}>, same convention every other per-tab fetch here relies on).
  React.useEffect(() => {
    if (window.loadThesisGrid) window.loadThesisGrid();
  }, []);
  const thesisGrid = F.thesisGrid || [];
  // C2-S2: a holding's thesis is "written" only if its argument exists AND is not
  // the scaffold sentinel (the auto-stub written by sync_thesis_with_holdings,
  // api.py). The sentinel must match api.py exactly (em-dash, not a hyphen).
  const THESIS_SENTINEL = "Position opened via dashboard — thesis details pending.";
  const isWritten = (th) => th && th.argument && th.argument !== THESIS_SENTINEL;
  // Count live holdings with a real authored argument; the rest are MISSING.
  const written = F.holdings.filter((h) =>
    thesisGrid.some((x) => x.ticker === h.ticker && isWritten(x))
  ).length;
  const total = F.holdings.length;
  const missingHoldings = F.holdings.filter((h) => !thesisGrid.some((x) => x.ticker === h.ticker && isWritten(x)));
  // Authored theses render as cards; stubs/unwritten no longer render inline
  // here at all (C2-D161) — they surface exclusively via TriagePanel2 in the
  // triage column now, so the card grid is only ever real, written theses.
  const authored = thesisGrid.filter(isWritten);
  // C2-D161 — the triage column (Panel 1/2/3) disappears entirely once there
  // is nothing left to triage, matching the mock's "nocolumn" state (cards
  // widen to three-up, no dead space where the column was) rather than
  // leaving an empty-Panel-1 column sitting at 296px alongside a narrower
  // card grid. The mock's own toggle UI only ever demonstrates two states
  // (5-of-14 / all-14, both WITH the column) — "nocolumn" is real code in
  // the mock but has no button wired to reach it there. Read literally
  // against the spec's own later, more specific instruction ("card grid
  // should widen to three-up... no dead space where the column was") rather
  // than its earlier, looser phrasing ("this panel is what the column
  // keeps") — those two read as in tension; this build takes the concrete
  // one. Flagged here for the Validator rather than silently picking one.
  const hasTriageColumn = missingHoldings.length > 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      {/* C2-D161 — page header replaces the old numbered SecHead-at-the-top
          convention for this page specifically (SecHead itself is untouched
          and still used below, just no longer the very first thing on the
          page). "18px above / 22px below" the hairline rule per the mock:
          18px is this div's own bottom padding, 22px is its marginBottom
          pushing the split-grid down. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, paddingBottom: 18, marginBottom: 22, borderBottom: `1px solid ${t.hair}` }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', color: t.ink }}>Positions</h1>
        <MonoTxt size={10.5} color={t.faint} style={{ letterSpacing: '0.14em', textTransform: 'uppercase', paddingBottom: 2 }}>{total} HOLDINGS · {written} WITH A THESIS</MonoTxt>
        <div style={{ flex: 1 }}></div>
        <button className="f2-press" onClick={() => setRulesDrawerOpen(true)} style={{ fontFamily: t.sans, fontSize: 12.5, fontWeight: 600, color: t.dim, background: 'transparent', border: `1px solid ${t.hair}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Decision rules</button>
      </div>

      {/* C2-D161 — responsive override for the split grid below: inline
          styles can't express a media query, so (same convention shell2.jsx
          already uses for hover states) a small injected <style> block
          handles just the one breakpoint the mock calls for. Below ~1100px
          the split collapses to a single column, which — because both the
          card grid and the triage column are DOM siblings in that order —
          stacks the column under the cards for free, matching the spec's
          "the column drops under the grid" requirement with no extra JS.
          The triage column's own position:sticky is disabled in the same
          breakpoint so it doesn't try to stick to the viewport top while
          the (now much taller, single-column) page scrolls past it. */}
      <style>{`
        @media (max-width: 1100px) {
          .f2-pos-split { grid-template-columns: 1fr !important; }
          .f2-triage-col { position: static !important; top: auto !important; }
        }
      `}</style>

      <div className="f2-pos-split" style={{ display: 'grid', gridTemplateColumns: hasTriageColumn ? '1fr 296px' : '1fr', gap: 28, alignItems: 'start' }}>
        <div>
          <SecHead n="01" right={<MonoTxt size={10.5} color={t.faint}>{written} WRITTEN</MonoTxt>}>Thesis on record</SecHead>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${hasTriageColumn ? 320 : 340}px, 1fr))`, gap: 16, marginTop: 16 }}>
            {authored.map((th) => <ThesisCard2 key={th.ticker} th={th} highlight={highlight} />)}
          </div>
        </div>

        {hasTriageColumn && (
          <div className="f2-triage-col" style={{ position: 'sticky', top: 18, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <TriagePanel2 missingHoldings={missingHoldings} t={t} F={F} store={store} />
            <CoveragePanel2 written={written} total={total} authored={authored} t={t} F={F} store={store} />
            <DeskRulesPanel2 t={t} F={F} onOpenRules={() => setRulesDrawerOpen(true)} />
          </div>
        )}
      </div>

      <ClosedPositions2 />
      <DecisionRulesDrawer2 open={rulesDrawerOpen} onClose={() => setRulesDrawerOpen(false)} t={t} />
    </div>
  );
}
window.PositionsTab2 = PositionsTab2;
