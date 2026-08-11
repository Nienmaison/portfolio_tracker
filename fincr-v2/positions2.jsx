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

// C2-D156 — per-section empty-state row for Card B, styled to match
// f2RulesBlock's own group-label rhythm (a MonoTxt label + one row) so an
// empty section reads as part of the same visual system, not a bolted-on
// placeholder. Deliberately PER-SECTION rather than whole-card: the owner
// cleared rebalancing/value_gap/trailing_stops as never-decided placeholder
// data, but a future state where e.g. rebalancing gets set for real via
// Finn while the other two are still empty should show one real section and
// two empty ones — not fall back to an all-or-nothing empty message that
// would need revisiting the moment the first real rule lands.
function DecisionRuleEmptySection({ label, first, t }) {
  return (
    <div style={{ marginTop: first ? 8 : 14 }}>
      <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>{label}</MonoTxt>
      <div style={{ padding: '9px 0', borderTop: `1px solid ${t.hair}`, fontSize: 12.5, color: t.faint, fontStyle: 'italic' }}>No rules defined yet.</div>
    </div>
  );
}

function PositionsTab2({ highlight }) {
  const t = useTheme2();
  const F = window.FINCR;
  // C2-D148 — whole-card fold for both Decision Rules cards, collapsed by
  // default so the tab loads compact (owner feedback: Card B was still too
  // long even side by side with Card A). Reuses closedpositions2.jsx's live
  // Show/Hide text-button convention (className="f2-press", plain mono
  // button, no chevron/animation) — the only whole-SECTION fold still live in
  // this codebase. (ThesisCard2 briefly had its own whole-card fold, C2-D126,
  // same plain-text-button styling, but it was fully retired by C2-D129 once
  // the grid became server-capped — dead code now, not something to extend;
  // its styling choice is corroborating evidence for reusing the plain-text
  // convention here rather than inventing a chevron.) Per-card state (not
  // one shared toggle) since the spec calls for independent whole-card fold,
  // not a per-subsection accordion. No persistence across reloads — like
  // closedpositions2.jsx's own `collapsed` state, this resets to its default
  // (folded) on every remount; ASSUMPTION: fine since the spec only asks for
  // fresh-collapsed-on-load behavior, not persistence, and no existing
  // fold convention in this codebase persists across reloads either.
  const [collapsedA, setCollapsedA] = React.useState(true);
  const [collapsedB, setCollapsedB] = React.useState(true);
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
  const missing = Math.max(0, F.holdings.length - written);
  // Authored theses render as cards; stubs/unwritten fall through to gap cards.
  const authored = thesisGrid.filter(isWritten);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <section>
        <SecHead n="01" right={<MonoTxt size={10.5} color={t.faint}>{written} WRITTEN · {missing} MISSING</MonoTxt>}>Thesis on record</SecHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginTop: 16 }}>
          {authored.map((th) => <ThesisCard2 key={th.ticker} th={th} highlight={highlight} />)}
          {/* positions without a written thesis — honest gap, not filler */}
          {F.holdings.filter((h) => !thesisGrid.some((x) => x.ticker === h.ticker && isWritten(x))).map((h) => (
            <div key={h.ticker} style={{ border: `1px dashed ${t.hairStrong}`, borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 3, height: 24, borderRadius: 2, background: h.color }}></span>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: t.ink }}>{h.ticker}</div>
                  <div style={{ fontSize: 11.5, color: t.faint }}>{h.name}</div>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: t.faint, lineHeight: 1.5 }}>No thesis on record. You hold <Money size={12} color={t.dim}>{F.eur(h.value)}</Money> without a written reason.</div>
              <button
                className="f2-press"
                onClick={() => {
                  // Pass 2 — seed the agent chat with this ticker so the conversation
                  // opens already in context. window.__fincrAgentSeed is a one-shot
                  // slot (mirrors store2.jsx's window.__fincrDrawerPrefill convention);
                  // fincr:go-tab is the existing tab-switch event (already used
                  // elsewhere in agent2.jsx, e.g. the "Set API key in Settings" link).
                  window.__fincrAgentSeed = { ticker: h.ticker, text: `Let's work on the thesis for ${h.ticker}.` };
                  window.dispatchEvent(new CustomEvent('fincr:go-tab', { detail: { tab: 'agent' } }));
                }}
                style={{ alignSelf: 'flex-start', fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Write one with the agent →</button>
            </div>
          ))}
        </div>
      </section>

      {/* C2-D160 — the "02 Watchlist" section that used to sit here has moved
          to its own route (watchlist2.jsx). SecHead numbering below is left
          as-is ("03 Decision rules" stays "03") rather than renumbered to
          "02" — same "gap tolerance" precedent this file already established
          when C2-D147 retired "04 Rulebook" as a standalone header and
          explicitly chose not to renumber closedpositions2.jsx's "05" down
          to "04" afterward (see that section's own comment below). */}

      {/* C2-D146 split Card A (tranche_selling) from Card B ("Rulebook":
          rebalancing/value_gap/trailing_stops) — see those comments (preserved
          below) for why the split exists. C2-D147 (this change): the two cards
          stacked vertically with a full "04 RULEBOOK" section header between
          them, which the owner found too long/heavy for what's meant to read as
          one paired unit. Reused this file's own existing side-by-side-card
          convention (the "01 Thesis on record" grid above, line ~113 —
          `repeat(auto-fill, minmax(Npx, 1fr))`) instead of inventing a new
          layout: it's the same grid CSS this exact card pair used pre-C2-D145,
          before the fixture was replaced with real data. auto-fill/minmax is
          why no explicit mobile breakpoint is needed — a track collapses to a
          single column on its own once the viewport can't fit two 320px+
          cards side by side, same as the Thesis-on-record grid already relies
          on. Per the reused precedent (a shared section header over a card
          grid, not a header per card), Card B's standalone "04 Rulebook"
          SecHead is dropped — the single "03 Decision rules" header above now
          covers both. closedpositions2.jsx's SecHead stays "05" unchanged (out
          of scope here) even though "04" is no longer used by any header —
          per this spec, not to be renumbered back. Neither card's content,
          f2RulesBlock() call, nor the seed button changed — container only. */}
      <section>
        <SecHead n="03">Decision rules</SecHead>
        {/* C2-D157 — alignItems: 'start' added. CSS Grid defaults to
            align-items: stretch, so with C2-D148's fold toggle, a collapsed
            Card A (short) sat next to an expanded Card B (tall) and grid
            stretched Card A's box to match Card B's height — it visually
            looked expanded even though its content was still fully
            collapsed. Scoped to this grid instance only: this is a separate
            inline style object from the Thesis-on-record grid above (line
            ~149, `repeat(auto-fill, minmax(340px, 1fr))`), not a shared
            class, so this change cannot affect that grid at all — confirmed
            by inspection, not just assumed, and left untouched. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginTop: 16, alignItems: 'start' }}>
          {/* Card A — tranche_selling, the ACTIVELY ENFORCED rule
              (triggerdistance2.jsx + the morning briefing agent both read and
              act on it) — unchanged formatting/data, on its own. C2-D148:
              header row (title + fold toggle) is new; f2RulesBlock() call
              and its content are untouched, just conditionally shown below
              the header instead of always. No badge here — Card A is the
              enforced side, nothing to distinguish it from. */}
          {F.decisionRules && F.decisionRules.tranche_selling ? (
            <div style={{ background: t.card, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, boxShadow: t.cardShadow, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: collapsedA ? 0 : 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <MonoTxt size={10.5} color={t.faint} style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tranche selling</MonoTxt>
                <button
                  className="f2-press"
                  onClick={() => setCollapsedA((c) => !c)}
                  style={{ fontFamily: t.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', color: t.accent, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                >{collapsedA ? 'Show' : 'Hide'}</button>
              </div>
              {!collapsedA && (
                <React.Fragment>
                  {/* C2-D150 — showHeading: false, same reasoning as ever:
                      card header above already shows "Tranche selling", so
                      f2RulesBlock's internal "Decision rules" heading is
                      suppressed. C2-D151 — showGroupLabels: false too: Card A
                      has exactly one group, and that group's own label is
                      "Tranche selling" — identical to the card's header text
                      above — so it repeated the same words twice even after
                      C2-D150 removed the "Decision rules" heading. Card B
                      keeps showGroupLabels at its true default: its three
                      group labels (Rebalancing/Value gap/Trailing stops)
                      aren't redundant with its "Rulebook" title. */}
                  {f2RulesBlock({ tranche_selling: F.decisionRules.tranche_selling }, t, false, false)}
                  {/* C2-D151 — seed button, copy-pasted from Card B's exact
                      mechanism (window.__fincrAgentSeed + fincr:go-tab, no
                      auto-send) with tranche-selling-appropriate seed text.
                      Parity with Card B, per owner request — tranche selling
                      is already live-enforced elsewhere, but the owner still
                      wants a way to start a conversation about it here. */}
                  <button
                    className="f2-press"
                    onClick={() => {
                      window.__fincrAgentSeed = { text: "Let's review my tranche selling rules." };
                      window.dispatchEvent(new CustomEvent('fincr:go-tab', { detail: { tab: 'agent' } }));
                    }}
                    style={{ alignSelf: 'flex-start', fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >Set up with agent →</button>
                </React.Fragment>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: t.faint }}>No decision rules on record.</div>
          )}

          {/* Card B — "Rulebook": rebalancing/value_gap/trailing_stops, named to
              read as declared-but-not-yet-enforced (unlike Card A, nothing
              currently reads or acts on these). "Set up with agent" reuses the
              exact one-shot seed mechanism as the "Write one with the agent"
              button above and drawer2.jsx's thesis-formulation entry points
              (window.__fincrAgentSeed + the fincr:go-tab event, C2-D123/
              C2-D127) — agent2.jsx's seed consumer only ever reads seed.text
              (seed.ticker in the button above is unused there too), so this
              seed carries text only; decision_rules has no ticker to scope it
              to anyway (a single global object, per thesisoverlay2.jsx's own
              comment). Per the C2-D123 auto-send correction, this only
              populates the agent input and focuses it — it does NOT send; the
              owner reviews and hits Send themselves. This button starts a
              conversation only — no new agent capability or write-back path
              for decision_rules exists yet (deferred to Part B, see
              decisions.md [C2-D146]). Button lives on Card B only, not Card A:
              tranche_selling is already live-enforced elsewhere, so there's
              nothing to "set up" for it yet.

              C2-D148 — header row (title + badge + fold toggle) is new,
              collapsed by default. The "Not yet enforced" badge reuses Chip2
              (ui2.jsx) — the same tag component ThesisCard2/watchlist already
              use for stance/conviction — tone="mute" (dim/neutral, not an
              alert color) since this is a factual state, not a warning.
              Restores the active-vs-declared distinction the old standalone
              "04 Rulebook" header used to carry before C2-D147 merged both
              cards under one shared section header. Badge stays visible even
              collapsed (per spec); f2RulesBlock() call and the seed button
              are unchanged, just hidden behind the fold along with everything
              else in the card body.

              C2-D156 — rebalancing/value_gap/trailing_stops were cleared as
              never-decided placeholder data (owner-confirmed; see
              decisions.md [C2-D156]). The card itself now always renders
              once F.decisionRules has loaded at all (the outer ternary below
              only falls back to "No rulebook on record" when the document
              itself failed to load, e.g. no API key) — emptiness lives
              PER-SECTION inside the card (DecisionRuleEmptySection above),
              not as a whole-card replacement, so a future state where only
              some of the three sections have real Finn-set data renders
              correctly with no further changes. The badge is hidden when
              all three sections are empty — there is nothing to badge as
              "declared but unenforced" when nothing is declared — and
              reappears automatically the moment any one of them has real
              data again. The seed button is unconditional: it's the
              explicit path forward from this empty state, per spec. */}
          {F.decisionRules ? (
            <div style={{ background: t.card, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, boxShadow: t.cardShadow, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: collapsedB ? 0 : 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MonoTxt size={10.5} color={t.faint} style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Rulebook</MonoTxt>
                  {(F.decisionRules.rebalancing || F.decisionRules.value_gap || F.decisionRules.trailing_stops) && (
                    <Chip2 tone="mute">Not yet enforced</Chip2>
                  )}
                </div>
                <button
                  className="f2-press"
                  onClick={() => setCollapsedB((c) => !c)}
                  style={{ fontFamily: t.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', color: t.accent, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                >{collapsedB ? 'Show' : 'Hide'}</button>
              </div>
              {!collapsedB && (
                <React.Fragment>
                  {/* C2-D150 — showHeading: false, same reasoning as Card A:
                      this card's own "Rulebook" header + badge above already
                      titles the section, so f2RulesBlock's internal
                      "Decision rules" heading is suppressed here too.
                      C2-D156 — split into three independent per-section
                      calls (was one call covering all three) so each section
                      can fall back to its own empty message instead of only
                      the whole call disappearing when all three are absent.
                      f2RulesBlock() itself is unchanged either way. */}
                  {F.decisionRules.rebalancing
                    ? f2RulesBlock({ rebalancing: F.decisionRules.rebalancing }, t, false)
                    : <DecisionRuleEmptySection label="Rebalancing" first t={t} />}
                  {F.decisionRules.value_gap
                    ? f2RulesBlock({ value_gap: F.decisionRules.value_gap }, t, false)
                    : <DecisionRuleEmptySection label="Value gap" t={t} />}
                  {F.decisionRules.trailing_stops
                    ? f2RulesBlock({ trailing_stops: F.decisionRules.trailing_stops }, t, false)
                    : <DecisionRuleEmptySection label="Trailing stops" t={t} />}
                  <button
                    className="f2-press"
                    onClick={() => {
                      window.__fincrAgentSeed = { text: "Let's set up my rebalancing, value gap, and trailing-stop rules." };
                      window.dispatchEvent(new CustomEvent('fincr:go-tab', { detail: { tab: 'agent' } }));
                    }}
                    style={{ alignSelf: 'flex-start', fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >Set up with agent →</button>
                </React.Fragment>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: t.faint }}>No rulebook on record.</div>
          )}
        </div>
      </section>

      <ClosedPositions2 />
    </div>
  );
}
window.PositionsTab2 = PositionsTab2;
