/* Fincr 2.0 — Positions: thesis per holding, watchlist, desk rules.
   The "why I own it" layer that sits under the overview ledger. */

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

function PositionsTab2({ highlight }) {
  const t = useTheme2();
  const F = window.FINCR;
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

      <section>
        <SecHead n="02">Watchlist</SecHead>
        <div style={{ marginTop: 8 }}>
          {F.watchlist.map((w) => (
            <div key={w.ticker} className="f2-row" style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 16, alignItems: 'center', padding: `${t.rowPadY + 2}px 8px`, borderTop: `1px solid ${t.hair}`, borderRadius: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{w.ticker}</div>
                <div style={{ fontSize: 11, color: t.faint }}>{w.name}</div>
              </div>
              <div style={{ fontSize: 12.5, color: t.dim, lineHeight: 1.5 }}>{w.note}</div>
              <Chip2 tone={w.conviction === 'Medium' ? 'accent' : 'mute'}>{w.conviction}</Chip2>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${t.hair}` }}></div>
        </div>
      </section>

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
          {/* Card A — tranche_selling, the ACTIVELY ENFORCED rule
              (triggerdistance2.jsx + the morning briefing agent both read and
              act on it) — unchanged formatting, on its own. */}
          {F.decisionRules && F.decisionRules.tranche_selling ? (
            <div style={{ background: t.card, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, boxShadow: t.cardShadow, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: '18px 20px' }}>
              {f2RulesBlock({ tranche_selling: F.decisionRules.tranche_selling }, t)}
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
              nothing to "set up" for it yet. */}
          {F.decisionRules && (F.decisionRules.rebalancing || F.decisionRules.value_gap || F.decisionRules.trailing_stops) ? (
            <div style={{ background: t.card, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, boxShadow: t.cardShadow, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {f2RulesBlock({ rebalancing: F.decisionRules.rebalancing, value_gap: F.decisionRules.value_gap, trailing_stops: F.decisionRules.trailing_stops }, t)}
              <button
                className="f2-press"
                onClick={() => {
                  window.__fincrAgentSeed = { text: "Let's set up my rebalancing, value gap, and trailing-stop rules." };
                  window.dispatchEvent(new CustomEvent('fincr:go-tab', { detail: { tab: 'agent' } }));
                }}
                style={{ alignSelf: 'flex-start', fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >Set up with agent →</button>
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
