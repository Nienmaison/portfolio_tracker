/* Fincr 2.0 — Agent tab: live /chat + conversation management + THESIS_PROPOSAL cards.
   C2-S4b: V1 archive/v1.html ported to React. Replaces the static mock.
   Decision C2-D64. */

const AGENT_API_BASE = 'https://fincr.duckdns.org';
// Mirror api.py's server-side cap: last 10 messages = 5 exchanges.
const AGENT_HISTORY_CAP = 10;
// Same sentinel as positions2.jsx/drawer2.jsx (redeclared per this codebase's
// per-file-constant convention) — needed here so UnifiedThesisProposalCard2
// can diff a proposed core_argument against the real current text rather
// than the scaffold stub.
const THESIS_SENTINEL = "Position opened via dashboard — thesis details pending.";

// ── THESIS_PROPOSAL parser ────────────────────────────────────────────────────
// Strips <<<THESIS_PROPOSAL>>> blocks from agent response prose and returns
// a validated proposals array. Invalid blocks (wrong field, bad enum, ticker
// not in holdings) are discarded silently (console only). core_argument is a
// valid field (C2-D123) — free text, no enum check, forwarded like conviction/
// stance. target_price is also a valid field (C2-D123 extension) — no enum,
// parsed as a plain number and accepted only if finite and non-negative.
// thesis_indicators (C2-D125) is a THIRD, different shape again — a typed list
// entry (risk/price_level/catalyst), not a scalar current->proposed change; one
// block per indicator, no current/proposed keys at all (see the type/text/
// target_price handling below). The system prompt gates WHEN the agent may
// emit any of these three "drafted, not direct-commit" fields; this parser
// only validates shape.
// Returns { prose: string, proposals: ProposalObject[] }
// ProposalObject (conviction/stance/core_argument/target_price):
//   { ticker, field, current, proposed, reasoning }
// ProposalObject (thesis_indicators): { ticker, field: 'thesis_indicators',
//   type, text, target_price, reasoning, revisesId } — no current/proposed at
//   all. revisesId (C2-D127) is the existing indicator id the agent intends
//   this as a revision of, or null for a genuinely new indicator — validated
//   against this ticker's real current indicators in
//   UnifiedThesisProposalCard2, not here.
function parseAgentResponse(text) {
  const VALID_CONVICTIONS = new Set(['high', 'medium', 'low']);
  const VALID_STANCES = new Set(['accumulate', 'hold', 'trim']);
  const VALID_INDICATOR_TYPES = new Set(['risk', 'price_level', 'catalyst']);
  const proposals = [];

  const blockRe = /<<<THESIS_PROPOSAL\s*\n([\s\S]*?)>>>/g;
  let match;
  while ((match = blockRe.exec(text)) !== null) {
    const block = {};
    match[1].split('\n').forEach(function(line) {
      var ci = line.indexOf(':');
      if (ci === -1) return;
      var k = line.substring(0, ci).trim();
      var v = line.substring(ci + 1).trim();
      if (k) block[k] = v;
    });

    var ticker = block.ticker;
    var field = block.field;
    var current = block.current;
    var proposed = block.proposed;
    var reasoning = block.reasoning;

    if (!ticker) { console.warn('[agent] discarding proposal: missing ticker'); continue; }

    // ticker must be a current holding
    var holdings = (window.FINCR && window.FINCR.holdings) || [];
    if (!holdings.some(function(h) { return h.ticker === ticker.toUpperCase(); })) {
      console.warn('[agent] discarding proposal: ticker not in holdings:', ticker);
      continue;
    }
    if (field !== 'conviction' && field !== 'stance' && field !== 'core_argument' && field !== 'target_price' && field !== 'thesis_indicators') {
      console.warn('[agent] discarding proposal: invalid field:', field);
      continue;
    }
    if (field === 'thesis_indicators') {
      // C2-D125 — a different shape entirely: no current/proposed keys, a
      // type/text/target_price triple instead. Validated and pushed here, then
      // `continue`s past the generic current/proposed handling below (which
      // does not apply to this field at all).
      var indType = block.type;
      var indText = block.text;
      var indReasoning = block.reasoning;
      if (!VALID_INDICATOR_TYPES.has(indType)) {
        console.warn('[agent] discarding thesis_indicators proposal: invalid type:', indType);
        continue;
      }
      if (!indText || !indText.trim()) {
        console.warn('[agent] discarding thesis_indicators proposal: empty text');
        continue;
      }
      if (!indReasoning || !indReasoning.trim()) {
        console.warn('[agent] discarding thesis_indicators proposal: empty reasoning');
        continue;
      }
      // target_price only meaningful for price_level (validation mirrors the
      // scalar target_price field's own rule above) — required to be a finite,
      // non-negative number when present for price_level; silently nulled for
      // risk/catalyst even if the agent mistakenly included one (defensive,
      // same posture as the server-side guard in api.py's /thesis/update).
      var indTargetPrice = null;
      if (indType === 'price_level' && block.target_price != null && block.target_price.trim() !== '') {
        var tpParsed = Number(block.target_price);
        if (!Number.isFinite(tpParsed) || tpParsed < 0) {
          console.warn('[agent] discarding thesis_indicators proposal: invalid target_price:', block.target_price);
          continue;
        }
        indTargetPrice = tpParsed;
      }
      // C2-D127 — optional id, present only when the agent intends this as a
      // revision of an indicator already shown in its context (api.py's
      // build_system_prompt tags each with "[id:xxx]"). Tolerate the model
      // echoing that exact bracket/prefix form even though the prompt asks
      // for the bare id — strip it rather than discard a well-intentioned
      // revision over a formatting slip. Actual validation against this
      // ticker's real current indicator ids happens in
      // UnifiedThesisProposalCard2 (client-side, where F.thesis lives), not
      // here — this parser only extracts what the agent sent.
      var indRevisesId = null;
      if (block.id != null && block.id.trim() !== '') {
        indRevisesId = block.id.trim().replace(/^\[?id:/i, '').replace(/\]$/, '').trim() || null;
      }
      proposals.push({
        ticker: ticker.toUpperCase(),
        field: 'thesis_indicators',
        type: indType,
        text: indText.trim(),
        target_price: indTargetPrice,
        revisesId: indRevisesId,
        reasoning: indReasoning,
      });
      continue;
    }
    if (field === 'core_argument') {
      // Free-text field (C2-D123) — no enum to validate against, just require
      // non-empty proposed text. Persistence gated behind the owner's explicit
      // Commit click on UnifiedThesisProposalCard2 (C2-D126).
      if (!proposed || !proposed.trim()) { console.warn('[agent] discarding proposal: empty core_argument proposal'); continue; }
    } else if (field === 'target_price') {
      // Plain-number field (C2-D123 extension) — no enum; parse proposed and
      // accept only a finite, non-negative number. Malformed values are
      // discarded silently before ever reaching the proposal card, same
      // pattern as the other invalid-shape discards above. Note: proposed is
      // reassigned to a Number here (was a string from block parsing) so
      // downstream consumers (UnifiedThesisProposalCard2, NumberField2)
      // receive the right type.
      // Reject empty/missing proposed text before Number() conversion —
      // Number('') is 0, which would otherwise pass the finite/non-negative
      // check below and wrongly persist as target_price=0. Mirrors the
      // core_argument empty-check above.
      if (!proposed || !proposed.trim()) { console.warn('[agent] discarding proposal: empty target_price proposal'); continue; }
      var tpProposed = Number(proposed);
      if (!Number.isFinite(tpProposed) || tpProposed < 0) {
        console.warn('[agent] discarding proposal: invalid target_price:', proposed);
        continue;
      }
      proposed = tpProposed;
    } else {
      var validVals = field === 'conviction' ? VALID_CONVICTIONS : VALID_STANCES;
      if (!validVals.has(current)) { console.warn('[agent] discarding proposal: invalid current:', current); continue; }
      if (!validVals.has(proposed)) { console.warn('[agent] discarding proposal: invalid proposed:', proposed); continue; }
    }
    if (!reasoning || !reasoning.trim()) { console.warn('[agent] discarding proposal: empty reasoning'); continue; }

    proposals.push({ ticker: ticker.toUpperCase(), field: field, current: current, proposed: proposed, reasoning: reasoning });
  }

  // Strip all blocks from prose before display
  var prose = text.replace(/<<<THESIS_PROPOSAL[\s\S]*?>>>/g, '').trim();
  return { prose: prose, proposals: proposals };
}

// ── Markdown prose parser (C2-D138) ───────────────────────────────────────────
// Scoped to markdown ONLY — THESIS_PROPOSAL blocks are already fully parsed
// and stripped above, well before this redesign (confirmed via the Researcher
// pass against real stored replies); this parser never sees them. Input here
// is always already-stripped prose (parseAgentResponse's `prose` field).
// Splits on blank lines, classifies each block, renders inline **bold**/`code`
// within paragraph/list/heading/verdict text. Falls back to plain paragraph
// for anything unclassified — there is no path that produces a blank message
// for non-empty input, satisfying "malformed markdown degrades to prose."
function f2ParseProse(text) {
  if (!text || !text.trim()) return [];
  var blocks = text.split(/\n{2,}/).map(function(b) { return b.trim(); }).filter(Boolean);
  return blocks.map(function(b, i) {
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(b)) return { type: 'rule', key: 'b' + i };
    if (b.indexOf('## ') === 0) return { type: 'h2', text: b.slice(3).trim(), key: 'b' + i };
    if (b.indexOf('### ') === 0) return { type: 'h3', text: b.slice(4).trim(), key: 'b' + i };
    var strippedBold = b.replace(/^\*\*/, '').replace(/\*\*$/, '');
    if (/^Verdict:\s*/i.test(strippedBold)) {
      return { type: 'verdict', text: strippedBold.replace(/^Verdict:\s*/i, '').trim(), key: 'b' + i };
    }
    var lines = b.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
    var isList = lines.length > 0 && lines.every(function(l) { return /^(-|\*|•|\d+\.)\s+/.test(l); });
    if (isList) {
      return { type: 'list', items: lines.map(function(l) { return l.replace(/^(-|\*|•|\d+\.)\s+/, ''); }), key: 'b' + i };
    }
    return { type: 'p', text: b.replace(/\n/g, ' '), key: 'b' + i };
  });
}

// Leading emoji stripped per the design doc (⚠️ ✅ 🚩 etc.) — tone carries
// through color, not emoji. \p{Extended_Pictographic} covers the real emoji
// blocks; ️ (variation selector) and ‍ (ZWJ) ride along with them.
function f2StripLeadingEmoji(s) {
  return s.replace(/^[\p{Extended_Pictographic}️‍]+\s*/u, '');
}

// Renders **bold** as semibold ink and `code` as a mono chip, in order, as an
// array of strings/elements (safe to drop straight into JSX children).
function f2RenderInline(str, t, keyPrefix) {
  str = f2StripLeadingEmoji(str);
  var parts = [];
  var re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  var lastIndex = 0;
  var m;
  var i = 0;
  while ((m = re.exec(str)) !== null) {
    if (m.index > lastIndex) parts.push(str.slice(lastIndex, m.index));
    var token = m[0];
    if (token.charAt(0) === '*') {
      parts.push(<strong key={keyPrefix + '_b' + i} style={{ fontWeight: 650, color: t.ink }}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={keyPrefix + '_c' + i} style={{ fontFamily: t.mono, fontSize: '0.92em', background: t.press, padding: '1px 5px', borderRadius: 4 }}>{token.slice(1, -1)}</code>);
    }
    i++;
    lastIndex = re.lastIndex;
  }
  if (lastIndex < str.length) parts.push(str.slice(lastIndex));
  return parts;
}

// Shared prose renderer for an agent reply's already-stripped markdown text.
// Falls back to the raw text (still never blank, never raw block syntax —
// there is none left to leak by this point) if parsing somehow yields nothing.
function AgentProse2({ text, t }) {
  var blocks = f2ParseProse(text);
  if (blocks.length === 0) {
    return text ? <div style={{ fontSize: 13, color: t.dim, lineHeight: 1.66 }}>{text}</div> : null;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {blocks.map(function(blk) {
        if (blk.type === 'rule') {
          return <div key={blk.key} style={{ height: 1, background: t.hair }} />;
        }
        if (blk.type === 'h2') {
          return <div key={blk.key} style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{f2RenderInline(blk.text, t, blk.key)}</div>;
        }
        if (blk.type === 'h3') {
          return (
            <div key={blk.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 3, height: 13, borderRadius: 2, background: t.accent, flexShrink: 0 }}></span>
              <span style={{ fontSize: 12.5, fontWeight: 650, color: t.ink }}>{f2RenderInline(blk.text, t, blk.key)}</span>
            </div>
          );
        }
        if (blk.type === 'verdict') {
          return (
            <div key={blk.key} style={{ background: t.press, border: '1px solid ' + t.hair, borderRadius: 10, padding: '11px 13px' }}>
              <div style={{ fontFamily: t.mono, fontSize: 9, color: t.accent, letterSpacing: '0.14em', marginBottom: 4 }}>VERDICT</div>
              <div style={{ fontSize: 12.5, color: t.ink, lineHeight: 1.5 }}>{f2RenderInline(blk.text, t, blk.key)}</div>
            </div>
          );
        }
        if (blk.type === 'list') {
          return (
            <div key={blk.key} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {blk.items.map(function(item, ii) {
                return (
                  <div key={blk.key + '_' + ii} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ width: 4, height: 4, borderRadius: 999, background: t.ghost, marginTop: 7, flexShrink: 0 }}></span>
                    <span style={{ fontSize: 12.5, color: t.dim, lineHeight: 1.6 }}>{f2RenderInline(item, t, blk.key + '_' + ii)}</span>
                  </div>
                );
              })}
            </div>
          );
        }
        // paragraph — the default for anything unclassified, including any
        // malformed/half-written markdown the model produces.
        return <div key={blk.key} style={{ fontSize: 13, color: t.dim, lineHeight: 1.66 }}>{f2RenderInline(blk.text, t, blk.key)}</div>;
      })}
    </div>
  );
}

// ── Proposal card component (glass redesign, C2-D138) ─────────────────────────
// Renders one card per conviction/stance proposal below the assistant bubble
// that emitted it. Card is session-local state — resets on reload; keyed by
// proposal identity (ticker+field+index) at the call site, not list index, so
// re-renders of the surrounding list don't remount and reset an open card.
// Commit reuses window.saveThesis from Spec 3 (thesis-adapter.js), relabeled
// "Apply to thesis" per the design handoff — same write, new label only.
// core_argument / target_price / thesis_indicators never reach this component
// (C2-D126) — those three render as one UnifiedThesisProposalCard2 instead
// (below), grouped by ticker at the call site.
//
// Deviation from the design doc, flagged rather than silently applied: the
// doc's footer lists only "Apply to thesis" / "Dismiss" / "LOGS TO HISTORY" —
// no third action. The existing "Edit" button (opens the position drawer
// prefilled with the proposed value) was kept rather than dropped, since
// removing it would be an undiscussed functional regression the spec never
// asked for; styled to match as a plain glass text button alongside Dismiss.
//
// No "Undo" after Apply: confirmed during this spec's Builder pass that
// window.saveThesis / POST /thesis/update has no revert path (no
// saveThesisVersioned rollback, no undo endpoint) — per this spec's own
// instruction, Undo is dropped from the applied state rather than offered
// speculatively. Dismiss IS undoable (no write ever happened, so reverting to
// pending is always safe).
function ProposalCard2({ proposal, onCommit, onEdit }) {
  const t = useTheme2();
  const [status, setStatus] = React.useState('pending'); // pending | applied | dismissed
  const [cardError, setCardError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  async function handleCommit() {
    setBusy(true);
    setCardError(null);
    var ok = await onCommit(proposal);
    setBusy(false);
    if (ok) {
      setStatus('applied');
    } else {
      setCardError('Failed to save — try again');
    }
  }

  function handleEdit() {
    // Dismiss this card; drawer opens with prefill via store action
    setStatus('dismissed');
    onEdit(proposal);
  }

  function handleDismiss() { setStatus('dismissed'); }
  function handleUndoDismiss() { setStatus('pending'); }

  var fieldLabel = proposal.field === 'stance' ? 'STANCE' : 'CONVICTION';
  var chip = status === 'applied'
    ? { text: 'APPLIED', color: t.green, bg: t.greenSoft }
    : status === 'dismissed'
      ? { text: 'DISMISSED', color: t.faint, bg: t.press }
      : { text: 'THESIS CHANGE', color: t.accent, bg: t.accentSoft };

  return (
    <div style={{ ...t.g2Plate, maxWidth: 540, borderRadius: 20, padding: 6, marginTop: 8, opacity: status === 'dismissed' ? 0.55 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px 11px' }}>
        <span style={{ fontFamily: t.mono, fontSize: 11.5, fontWeight: 600, color: t.ink }}>{proposal.ticker}</span>
        <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.faint, letterSpacing: '0.13em' }}>{fieldLabel}</span>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontFamily: t.mono, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: chip.color, background: chip.bg, borderRadius: 999, padding: '2px 8px' }}>{chip.text}</span>
      </div>

      <div style={{ ...t.g2Inner, borderRadius: 15, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 14, color: t.faint }}>{proposal.current}</span>
          <svg width="18" height="10" viewBox="0 0 18 10" fill="none" stroke={t.ghost} strokeWidth="1.4" strokeLinecap="round"><path d="M1 5h15M12 1l4 4-4 4"></path></svg>
          <span style={{ fontSize: 14, fontWeight: 650, color: t.ink }}>{proposal.proposed}</span>
        </div>
      </div>

      {proposal.reasoning && (
        <div style={{ padding: '12px 12px 4px', display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontFamily: t.mono, fontSize: 9, color: t.ghost, flexShrink: 0 }}>WHY</span>
          <span style={{ fontSize: 12, color: t.dim, lineHeight: 1.5 }}>{proposal.reasoning}</span>
        </div>
      )}

      {cardError && <div style={{ padding: '0 12px', fontSize: 11, color: t.red }}>{cardError}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, rowGap: 6, padding: '10px 12px 8px' }}>
        {status === 'pending' && (
          <React.Fragment>
            <Btn2 primary style={{ fontSize: 12, padding: '7px 16px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 6px 16px -8px rgba(0,0,0,0.6)' }} onClick={handleCommit} disabled={busy}>
              {busy ? '…' : 'Apply to thesis'}
            </Btn2>
            <button onClick={handleDismiss} style={{ ...t.g2Inner, borderRadius: 999, padding: '7px 14px', fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.dim, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Dismiss
            </button>
            <button onClick={handleEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.mono, fontSize: 11, color: t.faint, padding: '5px 8px', whiteSpace: 'nowrap' }}>
              Edit
            </button>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.ghost, whiteSpace: 'nowrap' }}>LOGS TO HISTORY</span>
          </React.Fragment>
        )}
        {status === 'applied' && (
          <span style={{ fontFamily: t.mono, fontSize: 10, color: t.dim }}>Written to thesis</span>
        )}
        {status === 'dismissed' && (
          <React.Fragment>
            <span style={{ fontFamily: t.mono, fontSize: 10, color: t.dim }}>Dismissed</span>
            <button onClick={handleUndoDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.mono, fontSize: 10, color: t.accent, padding: '2px 6px' }}>
              Undo
            </button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

// ── Unified thesis proposal card (C2-D126) ────────────────────────────────────
// Replaces both ProposalCard2's old core_argument/target_price branch (C2-D123
// — "drafted in editor, Save gates it") AND IndicatorProposalCard2 above
// (C2-D125 — per-indicator accept/dismiss into a draft list). When an agent
// response proposes any combination of core_argument / target_price /
// thesis_indicators for one ticker, it renders as ONE card styled like the
// real thesis card (ThesisCard2, positions2.jsx), fully editable in place,
// with a single Commit that writes straight to /thesis/update
// (window.saveThesis) and a single Cancel that discards the whole thing — no
// staged intermediate save, no per-field review. The owner-gate principle
// both prior decisions existed to protect is preserved: still fully editable,
// still requires an explicit owner click, still only becomes real at that
// click — just one consistent gate instead of two differently-strict ones.
//
// thesis_indicators is replace-wholesale server-side (api.py's /thesis/update
// does `target[field] = body[field]`, no merge) — so committing indicator
// changes here sends the ticker's EXISTING saved indicators (F.thesis) plus
// whatever remains (possibly edited/removed) in this card's list, never the
// proposed subset alone. Sending the proposed subset alone would silently
// delete every already-saved indicator for that ticker.
//
// Registers itself in window.__fincrPendingUnifiedProposals (a flat Set) for
// the shared window.__fincrGuardedThreadReplace guard — one registration per
// card now, not per indicator, since a unified proposal is one review unit.
//
// C2-D127 — thesis_indicators proposals may now carry a revisesId (set by
// api.py's prompt when the agent references an [id:xxx] tag already visible
// in its context). Matched against this ticker's real current indicators at
// mount: a match replaces that entry in place on Commit instead of appending
// a near-duplicate; no match (including no revisesId at all) still appends,
// same as before C2-D127. Every row is labeled "Updates existing X" / "New
// X" / a distinct mismatch flag in the preview — see the render below.
function UnifiedThesisProposalCard2({ ticker, proposals }) {
  const t = useTheme2();
  const [status, setStatus] = React.useState('pending'); // pending | committed | dismissed
  const [busy, setBusy] = React.useState(false);
  const [cardError, setCardError] = React.useState(null);

  const coreArgProposal = proposals.find(function(p) { return p.field === 'core_argument'; }) || null;
  const targetProposal = proposals.find(function(p) { return p.field === 'target_price'; }) || null;
  const indicatorProposals = proposals.filter(function(p) { return p.field === 'thesis_indicators'; });

  const [text, setText] = React.useState(coreArgProposal ? coreArgProposal.proposed : null);
  const [targetStr, setTargetStr] = React.useState(targetProposal ? String(targetProposal.proposed) : '');
  const [showFullArg, setShowFullArg] = React.useState(false); // C2-D138 — NOW-block truncation toggle
  // C2-D127 — each proposed indicator is matched against the ticker's REAL
  // current indicators (F.thesis, read once at mount) by `revisesId`:
  //   - revisesId present + matches an existing id -> matchStatus 'revision',
  //     row's own `id` is set to that EXISTING id (not a fresh one), so
  //     handleCommit's merge below can replace the right entry in place.
  //   - revisesId present but matches nothing -> matchStatus 'mismatch'
  //     (stale/hallucinated/wrong-ticker id) — safe fallback is "new", but
  //     flagged distinctly in the preview rather than silently treated as
  //     an ordinary new addition (a wrong id is the one failure mode this
  //     feature must never paper over quietly).
  //   - revisesId absent -> matchStatus 'new', same as all indicator
  //     proposals before this decision.
  const [indicators, setIndicators] = React.useState(function() {
    var existingIndicators = ((window.FINCR.thesis || []).find(function(x) { return x.ticker === ticker; }) || {}).indicators || [];
    return indicatorProposals.map(function(p) {
      var matchStatus = 'new';
      var rowId = 'up_' + Math.random().toString(36).slice(2, 9);
      if (p.revisesId) {
        var matched = existingIndicators.some(function(e) { return e.id === p.revisesId; });
        if (matched) { matchStatus = 'revision'; rowId = p.revisesId; }
        else { matchStatus = 'mismatch'; }
      }
      return { id: rowId, type: p.type, text: p.text, target_price: p.target_price, _matchStatus: matchStatus };
    });
  });

  const idRef = React.useRef('unified_' + Math.random().toString(36).slice(2, 9));
  React.useEffect(function() {
    var id = idRef.current;
    window.__fincrPendingUnifiedProposals = window.__fincrPendingUnifiedProposals || new Set();
    window.__fincrPendingUnifiedProposals.add(id);
    return function() {
      if (window.__fincrPendingUnifiedProposals) window.__fincrPendingUnifiedProposals.delete(id);
    };
  }, []);
  React.useEffect(function() {
    if (status === 'pending') return;
    if (window.__fincrPendingUnifiedProposals) window.__fincrPendingUnifiedProposals.delete(idRef.current);
  }, [status]);

  function updateIndicatorRow(id, patch) {
    setIndicators(function(prev) {
      return prev.map(function(ind) {
        if (ind.id !== id) return ind;
        var next = Object.assign({}, ind, patch);
        if (next.type !== 'price_level') next.target_price = null;
        return next;
      });
    });
  }
  function removeIndicatorRow(id) {
    setIndicators(function(prev) { return prev.filter(function(ind) { return ind.id !== id; }); });
  }

  async function handleCommit() {
    setBusy(true);
    setCardError(null);
    var F = window.FINCR;
    var th = (F.thesis || []).find(function(x) { return x.ticker === ticker; });
    var changes = {};

    if (coreArgProposal) {
      var origArg = (th && th.argument && th.argument !== THESIS_SENTINEL) ? th.argument : '';
      if (text !== origArg) changes.core_argument = text;
    }
    if (targetProposal) {
      var newTarget = targetStr.trim() === '' ? null : Number(targetStr);
      var origTarget = th && th.target_price != null ? th.target_price : null;
      if (newTarget !== origTarget) changes.target_price = newTarget;
    }
    if (indicatorProposals.length > 0) {
      // C2-D127 — 'revision' rows replace their matched existing entry in
      // place (same id, edited content); 'new'/'mismatch' rows append as a
      // fresh entry, exactly like every indicator proposal before this
      // decision. A revision row the owner deleted from the preview simply
      // isn't in `indicators` anymore, so its original entry passes through
      // `existing` untouched below — deleting a proposed revision means
      // "don't apply it," not "delete the original."
      var existing = (th && th.indicators) || [];
      var cleanRows = indicators
        .filter(function(ind) { return ind.text && ind.text.trim(); })
        .map(function(ind) {
          return {
            id: ind.id, type: ind.type, text: ind.text.trim(),
            target_price: ind.type === 'price_level' ? ind.target_price : null,
            _matchStatus: ind._matchStatus,
          };
        });
      // C2-D128 — a revised entry is built by spreading the ORIGINAL existing
      // entry and overriding only the fields this card actually lets the
      // owner edit (type/text/target_price), not by reconstructing a bare
      // 4-key object. Once indicators carry fields this card never renders
      // (state, condition), reconstructing narrowly would silently drop them
      // off any indicator the agent revises — this preserves everything else
      // on that entry untouched.
      var existingById = {};
      existing.forEach(function(e) { existingById[e.id] = e; });
      var revisionsById = {};
      var additions = [];
      cleanRows.forEach(function(row) {
        if (row._matchStatus === 'revision') {
          var orig = existingById[row.id] || {};
          revisionsById[row.id] = Object.assign({}, orig, { id: row.id, type: row.type, text: row.text, target_price: row.target_price });
        } else {
          additions.push({ id: row.id, type: row.type, text: row.text, target_price: row.target_price });
        }
      });
      var merged = existing.map(function(e) { return revisionsById[e.id] || e; }).concat(additions);
      if (JSON.stringify(merged) !== JSON.stringify(existing)) changes.thesis_indicators = merged;
    }

    if (Object.keys(changes).length === 0) { setBusy(false); setStatus('committed'); return; }

    var reasoning = Array.from(new Set(proposals.map(function(p) { return p.reasoning; }).filter(Boolean))).join(' ');
    if (!window.saveThesis) { setBusy(false); setCardError('Failed to save — try again'); return; }
    var ok = await window.saveThesis(ticker, changes, reasoning);
    if (ok && window.loadThesis) await window.loadThesis();
    setBusy(false);
    if (ok) { setStatus('committed'); } else { setCardError('Failed to save — try again'); }
  }

  function handleCancel() { setStatus('dismissed'); }

  // C2-D138 — no Undo-from-dismissed here (unlike the simpler ProposalCard2
  // below): this card participates in window.__fincrPendingUnifiedProposals
  // (the shared guardedSetTab/thread-switch guard), which only removes a
  // dismissed card's pending-registration, it never re-adds one if the card
  // goes back to 'pending'. Adding Undo would let a card silently drop out of
  // that guard's tracking — deferred rather than risk that under time
  // pressure; behavior here is otherwise unchanged from before this phase.
  if (status === 'dismissed') return null;

  var F = window.FINCR;
  var h = (F.holdings || []).find(function(x) { return x.ticker === ticker; });
  var th = (F.thesis || []).find(function(x) { return x.ticker === ticker; });
  var combinedReasoning = Array.from(new Set(proposals.map(function(p) { return p.reasoning; }).filter(Boolean))).join(' ');
  var chip = status === 'committed' ? { text: 'APPLIED', color: t.green, bg: t.greenSoft } : { text: 'THESIS CHANGE', color: t.accent, bg: t.accentSoft };
  // Mirrors handleCommit's own origArg computation above, for display only.
  var origArgDisplay = (th && th.argument && th.argument !== THESIS_SENTINEL) ? th.argument : '';

  return (
    <div style={{
      ...t.g2Plate, borderRadius: 20, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8,
      opacity: status === 'committed' ? 0.7 : 1, transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {h && <span style={{ width: 3, height: 24, borderRadius: 2, background: h.color }}></span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: t.ink, lineHeight: 1.15 }}>{ticker}</div>
          {th && <div style={{ fontSize: 11.5, color: t.faint }}>{th.name}</div>}
        </div>
        <span style={{ fontFamily: t.mono, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: chip.color, background: chip.bg, borderRadius: 999, padding: '2px 8px' }}>{chip.text}</span>
      </div>

      {status === 'committed' ? (
        <div style={{ fontFamily: t.mono, fontSize: 11, color: t.dim }}>Written to thesis</div>
      ) : (
        <React.Fragment>
          {combinedReasoning && (
            <div style={{
              fontSize: 12, color: t.dim, fontStyle: 'italic', lineHeight: 1.5,
              overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {combinedReasoning}
            </div>
          )}

          {coreArgProposal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* C2-D138 — NOW/PROPOSED long-variant per the design handoff.
                  The card previously showed only the editable proposed text,
                  with no comparison against the real current argument at all
                  — this adds that read-only NOW context (truncated at 240
                  chars past a 260-char threshold, toggle to expand) above the
                  unchanged editable PROPOSED textarea. */}
              {origArgDisplay && (
                <div>
                  <MonoTxt size={9} color={t.ghost} style={{ letterSpacing: '0.16em', display: 'block', marginBottom: 4 }}>NOW</MonoTxt>
                  <div style={{ fontSize: 12.5, color: t.faint, lineHeight: 1.62 }}>
                    {showFullArg || origArgDisplay.length <= 260 ? origArgDisplay : origArgDisplay.slice(0, 240) + '…'}
                  </div>
                  {origArgDisplay.length > 260 && (
                    <button onClick={function() { setShowFullArg(function(v) { return !v; }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.mono, fontSize: 10, color: t.accent, padding: '4px 0' }}>
                      {showFullArg ? 'Show less' : 'Read full argument'}
                    </button>
                  )}
                  <div style={{ height: 1, background: t.hair, marginTop: 8 }}></div>
                </div>
              )}
              <MonoTxt size={9} color={t.accent} style={{ letterSpacing: '0.16em' }}>PROPOSED</MonoTxt>
              <textarea
                value={text}
                onChange={function(e) { setText(e.target.value); }}
                rows={3}
                style={Object.assign({}, window.f2InputStyle(t), { resize: 'vertical', minHeight: 60, lineHeight: 1.5, fontSize: 12.5 })}
              />
            </div>
          )}

          {indicatorProposals.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.12em' }}>THESIS INDICATORS (PROPOSED)</MonoTxt>
              {indicators.map(function(ind) {
                // C2-D127 — the owner is the review gate for this whole
                // feature; a silent id match (or mismatch) is exactly the
                // kind of thing they need to see before Commit, not trust.
                var typeLabel = ind.type === 'price_level' ? 'price level' : ind.type === 'catalyst' ? 'catalyst' : 'risk';
                var matchLabel = ind._matchStatus === 'revision'
                  ? { text: 'Updates existing ' + typeLabel, color: t.accent }
                  : ind._matchStatus === 'mismatch'
                    ? { text: "Proposed id didn't match any existing indicator — added as new", color: t.amber }
                    : { text: 'New ' + typeLabel, color: t.faint };
                return (
                  <div key={ind.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 9, border: '1px solid ' + t.hair, borderRadius: 8 }}>
                    <MonoTxt size={9.5} color={matchLabel.color} style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>{matchLabel.text}</MonoTxt>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <Seg2
                          options={[
                            { value: 'risk', label: 'Risk', tone: 'bad' },
                            { value: 'price_level', label: 'Price level', tone: 'watch' },
                            { value: 'catalyst', label: 'Catalyst', tone: 'ok' },
                          ]}
                          value={ind.type}
                          onChange={function(v) { updateIndicatorRow(ind.id, { type: v }); }}
                        />
                      </div>
                      <button onClick={function() { removeIndicatorRow(ind.id); }} title="Remove indicator" className="f2-press"
                        style={{ background: 'none', border: 'none', color: t.faint, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 6px', borderRadius: 6, flexShrink: 0 }}>
                        {'×'}
                      </button>
                    </div>
                    <TextField2 value={ind.text} onChange={function(v) { updateIndicatorRow(ind.id, { text: v }); }} />
                    {ind.type === 'price_level' && (
                      <NumberField2
                        value={ind.target_price != null ? String(ind.target_price) : ''}
                        onChange={function(v) { updateIndicatorRow(ind.id, { target_price: v.trim() === '' ? null : Number(v) }); }}
                        prefix="€" placeholder="—"
                      />
                    )}
                  </div>
                );
              })}
              {indicators.length === 0 && (
                <MonoTxt size={11} color={t.faint} style={{ fontStyle: 'italic' }}>All proposed indicators removed — none will be added.</MonoTxt>
              )}
            </div>
          )}

          {targetProposal && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTop: '1px solid ' + t.hair, paddingTop: 10 }}>
              <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.12em' }}>TARGET (PROPOSED)</MonoTxt>
              <div style={{ width: 140 }}>
                <NumberField2 value={targetStr} onChange={setTargetStr} prefix="€" placeholder="—" />
              </div>
            </div>
          )}

          {cardError && <div style={{ fontSize: 11, color: t.red }}>{cardError}</div>}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, rowGap: 6 }}>
            <Btn2 primary style={{ fontSize: 12, padding: '7px 16px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 6px 16px -8px rgba(0,0,0,0.6)' }} onClick={handleCommit} disabled={busy}>
              {busy ? '…' : 'Apply to thesis'}
            </Btn2>
            <button onClick={handleCancel} style={{ ...t.g2Inner, borderRadius: 999, padding: '7px 14px', fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.dim, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Dismiss
            </button>
            <span style={{ flex: 1 }}></span>
            <span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.ghost, whiteSpace: 'nowrap' }}>LOGS TO HISTORY</span>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

// ── Conversation rail item ────────────────────────────────────────────────────
// One row in the sidebar thread list. Inline rename on double-click of the title.
function ConvRailItem2({ conv, active, t, onOpen, onRename, onDelete }) {
  const [editing, setEditing] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState(conv.title || 'New conversation');
  const inputRef = React.useRef(null);

  function startEdit(e) {
    e.stopPropagation();
    setEditing(true);
    setTimeout(function() { if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, 0);
  }

  async function finishEdit() {
    setEditing(false);
    var trimmed = editTitle.trim();
    if (trimmed && trimmed !== (conv.title || 'New conversation')) {
      await onRename(conv.id, trimmed);
    } else {
      setEditTitle(conv.title || 'New conversation');
    }
  }

  // Hard delete, no undo — routed through the app-wide Confirm2 modal
  // (C2-D136). C2-D137: this site's copy/content was replaced with the
  // owner-supplied design (title/sub/GONE-KEPT detail rows/footer labels) —
  // a one-time, explicit exception to C2-D136's "message text unchanged"
  // rule for this call site only, not a reversal of it (see decisions.md).
  // The other 4 Confirm2 call sites still call it with a bare message string
  // and are unaffected.
  async function handleDelete(e) {
    e.stopPropagation();
    var confirmed = await window.confirm2('', {
      title: 'Delete “' + (conv.title || 'New conversation') + '”?',
      sub: 'This thread and its messages leave your history for good.',
      detail: [
        { label: 'GONE', tone: 'danger', text: 'Every message in the thread, plus the context the agent built up while answering.' },
        { label: 'KEPT', tone: 'faint', text: 'Decisions you already logged, and any thesis edits committed from this thread.' },
      ],
      confirmLabel: 'Delete permanently',
      cancelLabel: 'Keep thread',
    });
    if (confirmed) {
      onDelete(conv.id);
    }
  }

  return (
    <div
      onClick={function() { if (!editing) onOpen(conv.id); }}
      className="f2-press f2-rail-item"
      style={{
        textAlign: 'left', cursor: 'pointer',
        padding: '9px 10px', borderRadius: 8,
        background: active ? t.press : 'transparent',
        position: 'relative', marginBottom: 1,
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={editTitle}
          onChange={function(e) { setEditTitle(e.target.value); }}
          onBlur={finishEdit}
          onKeyDown={function(e) {
            if (e.key === 'Enter') { e.preventDefault(); finishEdit(); }
            if (e.key === 'Escape') { setEditTitle(conv.title || 'New conversation'); setEditing(false); }
          }}
          onClick={function(e) { e.stopPropagation(); }}
          style={{
            width: '100%', background: t.inputBg, border: '1px solid ' + t.accent,
            color: t.ink, fontSize: 12, padding: '2px 6px', borderRadius: 4,
            fontFamily: t.mono, outline: 'none',
          }}
        />
      ) : (
        <React.Fragment>
          {/* C2-D136 layout fix: title is a shrinking flex column (minWidth:0 is
              what actually lets it truncate inside a flex row) and the icons are
              a fixed-width sibling group, rather than the old paddingRight-tuned-
              for-one-icon + position:absolute pair that only cleared the rename
              icon and let the delete icon's wider inset overlap the ellipsized
              title. Sibling layout generalizes to any future icon count without
              re-tuning a padding number. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <div style={{
              flex: 1, minWidth: 0,
              fontSize: 12.5, fontWeight: 600,
              color: active ? t.ink : t.dim,
              lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {conv.title || 'New conversation'}
            </div>
            {/* Reveal on hover (new interaction convention, no prior precedent in
                this app — see architecture.md) via .f2-rail-item:hover in
                shell2.jsx's shared stylesheet; the active-selection reveal below
                stays as the inline fallback so click/tap access (touch, keyboard-
                selected row) is never lost. */}
            <div className="f2-rail-actions" style={{ display: 'flex', gap: 2, flexShrink: 0, opacity: active ? 0.6 : 0 }}>
              <button
                onClick={startEdit}
                title="Rename"
                style={{ background: 'none', border: 'none', color: t.faint, fontSize: 11, cursor: 'pointer', padding: 2 }}
              >{'✎'}</button>
              <button
                onClick={handleDelete}
                title="Delete conversation"
                style={{ background: 'none', border: 'none', color: t.faint, fontSize: 11, cursor: 'pointer', padding: 2 }}
              >{'🗑'}</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <MonoTxt size={9.5} color={t.faint}>
              {conv.started_at ? new Date(conv.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
            </MonoTxt>
            {(conv.tickers_mentioned || []).slice(0, 3).map(function(tk) {
              return (
                <span key={tk} style={{ fontFamily: t.mono, fontSize: 9, color: t.faint, border: '1px solid ' + t.hair, borderRadius: 3, padding: '1px 4px' }}>
                  {tk}
                </span>
              );
            })}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

// ── Shared pending-thesis-proposal guard (consolidates 3 prior one-offs) ──────
// Three independent call sites used to each carry their OWN copy of the same
// "sum pending proposals, confirm() if > 0" logic: guardedSetTab (shell2.jsx,
// C2-D125 tab-switch addendum), startNewConversation (agent2.jsx, C2-D125
// "+"-button addendum), and openConversation (agent2.jsx, found unguarded
// during that same addendum's sweep). Three occurrences of the identical bug
// class is the trigger signal for a structural fix rather than a fourth
// copy-pasted guard — see decisions.md [C2-D125] addendum.
//
// C2-D126 — the source this sums from changed. Was
// window.__fincrPendingIndicatorProposals (a per-ticker Set of pending
// IndicatorProposalCard2 instances); IndicatorProposalCard2 is retired, so
// this now sums window.__fincrPendingUnifiedProposals (a flat Set — a unified
// proposal is already one review unit per ticker, not N per-indicator units,
// so no per-ticker grouping is needed here anymore). The guard FUNCTION
// itself, and its two callers in shell2.jsx, are unchanged — only what it
// counts is different.
//
// Defined ONCE here (agent2.jsx owns window.__fincrPendingUnifiedProposals
// and two of the three call sites) and exposed as a window global so shell2.jsx
// — a separate <script type="text/babel"> tag with no ES-module import between
// them — can call into the identical logic instead of duplicating it. This is
// a deliberate exception to this codebase's usual "small helpers/constants get
// redeclared per file" convention: that convention is fine when only the
// output *shape* matters, but here the whole point of consolidating is that
// the exact confirm() wording and summing behavior must be the SAME code, not
// three copies that could drift. index.html loads agent2.jsx (line 62) before
// shell2.jsx (line 71), so this global is guaranteed to exist by the time any
// guarded action can actually fire (all three are click-time actions, long
// after both scripts have run).
//
// actionFn: the real thread/tab-replacing action, called only if the caller
//   should proceed (zero pending, or the owner confirmed).
// actionPhrase: gerund-style clause slotted into the existing sentence shape,
//   e.g. "Leaving now", "Starting a new conversation", "Switching conversations".
// closeQuestion: the confirm's final question, e.g. "Leave anyway?" — kept as
//   its own parameter (rather than hardcoded) so each of the two already-
//   shipped call sites keeps its EXACT prior copy verbatim (no visible copy
//   regression from this refactor).
// Returns true if actionFn ran (or wasn't gated), false if the owner canceled.
// C2-D136: now async (routes the confirm through window.confirm2 instead of
// native confirm()) — every caller either doesn't use the return value at all
// (openConversation, startNewConversation: bare statement calls, safe as-is)
// or has been updated to await it (guardedSetTab in shell2.jsx, whose own
// caller focusTicker synchronously branched on the old boolean return — see
// that file's comments for the fix). Do not add a new synchronous caller of
// this function without checking that chain first.
window.__fincrGuardedThreadReplace = async function(actionFn, actionPhrase, closeQuestion) {
  var pending = window.__fincrPendingUnifiedProposals;
  var count = pending ? pending.size : 0;
  if (count > 0) {
    var msg = 'You have ' + count + ' uncommitted thesis proposal' + (count === 1 ? '' : 's') +
      ". " + actionPhrase + ' will lose ' + (count === 1 ? 'it' : 'them') +
      ' permanently. ' + closeQuestion;
    if (!(await window.confirm2(msg))) return false; // Cancel — nothing runs, state untouched
  }
  actionFn();
  return true;
};

// ── AgentTab2 — main component ────────────────────────────────────────────────
// Live /chat integration ported from archive/v1.html.
// Thread rail: full conversation management (list/new/open/resume/rename/end).
// conversation_id is started lazily on first send, not on mount.
function AgentTab2() {
  const t = useTheme2();

  // Thread: [{id, role: 'user'|'agent'|'typing', text, proposals: []}]
  const [thread, setThread] = React.useState([]);
  // convMsgs mirrors thread for the API payload: [{role, content}]
  const convMsgsRef = React.useRef([]);

  const [convId, setConvId] = React.useState(null);      // null = lazy start on first send
  const [conversations, setConversations] = React.useState([]);
  const [hasMoreConversations, setHasMoreConversations] = React.useState(false);
  const [loadingMoreConversations, setLoadingMoreConversations] = React.useState(false);
  const [inputText, setInputText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [composerFocused, setComposerFocused] = React.useState(false); // C2-D138 glass composer focus ring

  const threadEndRef = React.useRef(null);
  const inputRef = React.useRef(null);

  // Inject typing animation CSS once
  React.useEffect(function() {
    var id = 'fincr-agent-bounce';
    if (!document.getElementById(id)) {
      var s = document.createElement('style');
      s.id = id;
      s.textContent = '@keyframes agentBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}';
      document.head.appendChild(s);
    }
  }, []);

  // Auto-scroll to newest message
  React.useEffect(function() {
    if (threadEndRef.current) threadEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  // On mount: load conversation list (don't start a new one — lazy on first send)
  React.useEffect(function() {
    var key = localStorage.getItem('fincr-api-key');
    if (!key) return;
    loadConversationList();
    // End active conversation on unmount
    var capturedConvId = null;
    var setter = function(id) { capturedConvId = id; };
    setConvId(function(prev) { capturedConvId = prev; return prev; });
    return function() {
      if (capturedConvId) endConversation(capturedConvId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: consume a one-shot agent seed set by positions2.jsx's "Write one
  // with the agent" button (window.__fincrAgentSeed, mirrors store2.jsx's
  // window.__fincrDrawerPrefill one-shot-slot convention). <main key={tab}> in
  // shell2.jsx remounts this component on every switch into the agent tab, so
  // this fires each time the seeded button is clicked. Prefills the input and
  // focuses it so the conversation opens in context for that ticker — the
  // owner still has to hit Send/Enter themselves, same as normal typing.
  // (Patch: was auto-send via sendMessage(seed.text); corrected per
  // decisions.md [C2-D123] addendum — owner must trigger every send.)
  React.useEffect(function() {
    var seed = window.__fincrAgentSeed;
    if (seed && seed.text) {
      window.__fincrAgentSeed = null;
      setInputText(seed.text);
      if (inputRef.current) inputRef.current.focus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API helpers ──────────────────────────────────────────────────────────────
  function apiKey() { return localStorage.getItem('fincr-api-key') || ''; }

  // First page (20 most recent). Replaces the list wholesale — used on mount
  // and after any action that should reset pagination to the top (rename,
  // delete of the active conversation's neighbors, etc.).
  async function loadConversationList() {
    var key = apiKey();
    if (!key) return;
    try {
      var r = await fetch(AGENT_API_BASE + '/conversations', { headers: { 'X-API-Key': key } });
      var d = await r.json();
      if (d.status === 'ok') {
        setConversations(d.conversations || []);
        setHasMoreConversations(!!d.has_more);
      }
    } catch(e) { console.warn('[agent] loadConversationList failed:', e.message); }
  }

  // Scroll-triggered next page: cursors off the oldest thread currently
  // rendered and appends, so already-rendered rows and scroll position are
  // untouched. Guarded by loadingMoreConversations against overlapping fetches
  // from repeated scroll events, and stops for good once has_more is false.
  async function loadMoreConversations() {
    var key = apiKey();
    if (!key || loadingMoreConversations || !hasMoreConversations || conversations.length === 0) return;
    var oldest = conversations[conversations.length - 1];
    setLoadingMoreConversations(true);
    try {
      var r = await fetch(AGENT_API_BASE + '/conversations?before=' + encodeURIComponent(oldest.started_at), { headers: { 'X-API-Key': key } });
      var d = await r.json();
      if (d.status === 'ok') {
        setConversations(function(prev) { return prev.concat(d.conversations || []); });
        setHasMoreConversations(!!d.has_more);
      }
    } catch(e) {
      console.warn('[agent] loadMoreConversations failed:', e.message);
    } finally {
      setLoadingMoreConversations(false);
    }
  }

  // Rail onScroll handler — fetches the next page once the rail is scrolled
  // near its bottom.
  function handleRailScroll(e) {
    var el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) loadMoreConversations();
  }

  // Hard delete (no archive/soft-delete — deliberate, see decisions.md). Confirm
  // step lives in ConvRailItem2; by the time this runs the owner has confirmed.
  async function deleteConversation(id) {
    var key = apiKey();
    if (!key) return;
    try {
      var r = await fetch(AGENT_API_BASE + '/conversations/' + id, {
        method: 'DELETE',
        headers: { 'X-API-Key': key },
      });
      var d = await r.json();
      if (d.status !== 'ok') { console.warn('[agent] deleteConversation failed:', d.error); return; }
      setConversations(function(prev) { return prev.filter(function(c) { return c.id !== id; }); });
      if (convId === id) {
        setConvId(null);
        setThread([]);
        convMsgsRef.current = [];
      }
    } catch(e) { console.warn('[agent] deleteConversation failed:', e.message); }
  }

  // Lazy: called on first send if convId is null. Returns new conversation_id or null.
  async function startConversation() {
    var key = apiKey();
    if (!key) return null;
    try {
      var r = await fetch(AGENT_API_BASE + '/conversations/new', {
        method: 'POST',
        headers: { 'X-API-Key': key },
      });
      var d = await r.json();
      if (d.status === 'ok') {
        setConvId(d.conversation_id);
        return d.conversation_id;
      }
    } catch(e) { console.warn('[agent] startConversation failed:', e.message); }
    return null;
  }

  // Load a past conversation into the thread (open/resume).
  // Guarded (C2-D125 "+"-button addendum, target updated for C2-D126):
  // switching to a different past conversation replaces `thread` wholesale,
  // silently unmounting any UnifiedThesisProposalCard2 still pending for the
  // conversation being left. Routed through the shared
  // window.__fincrGuardedThreadReplace (defined above AgentTab2) — same
  // mechanism guardedSetTab (shell2.jsx) and startNewConversation (below) use,
  // so this is the third and final call site consolidated onto one guard
  // rather than a fourth hand-copied confirm(). Cancel leaves thread/convId
  // completely untouched — the fetch already happened, but nothing from it
  // is applied unless the owner confirms (or there was nothing to lose).
  async function openConversation(id) {
    var key = apiKey();
    if (!key) return;
    try {
      var r = await fetch(AGENT_API_BASE + '/conversations/' + id, { headers: { 'X-API-Key': key } });
      var d = await r.json();
      if (d.status !== 'ok') return;
      // Rebuild thread from stored messages. No proposal cards in history (session-local state).
      var msgs = d.messages || [];
      var restoredThread = msgs.map(function(m) {
        return { id: 'h_' + Math.random().toString(36).slice(2, 8), role: m.role === 'user' ? 'user' : 'agent', text: m.content, proposals: [] };
      });
      await window.__fincrGuardedThreadReplace(function() {
        setThread(restoredThread);
        convMsgsRef.current = msgs.map(function(m) { return { role: m.role, content: m.content }; });
        setConvId(id);
      }, 'Switching conversations', 'Continue anyway?');
    } catch(e) { console.warn('[agent] openConversation failed:', e.message); }
  }

  // End conversation via sendBeacon — reliable on unmount/page unload.
  function endConversation(id) {
    var key = apiKey();
    if (!key || !id) return;
    navigator.sendBeacon(
      AGENT_API_BASE + '/conversations/' + id + '/end',
      new Blob(['{}'], { type: 'application/json' })
    );
  }

  // Clear thread and start fresh. Lazy — no API call until user sends.
  // Guarded via the shared window.__fincrGuardedThreadReplace (defined above
  // AgentTab2) — this used to carry its own duplicated summing+confirm copy
  // (C2-D125 "+"-button addendum); consolidated this session alongside
  // guardedSetTab (shell2.jsx) and openConversation (above) onto one guard.
  // Cancel leaves convId, thread, and the pending Set completely untouched —
  // nothing unmounts.
  function startNewConversation() {
    window.__fincrGuardedThreadReplace(function() {
      setConvId(function(prev) {
        if (prev) endConversation(prev);
        return null;
      });
      setThread([]);
      convMsgsRef.current = [];
      if (inputRef.current) inputRef.current.focus();
    }, 'Starting a new conversation', 'Continue anyway?');
  }

  // ── Send message ─────────────────────────────────────────────────────────────
  // explicitText (Pass 2): originally let the seed effect above auto-send a
  // specific string without going through inputText state. The seed effect no
  // longer calls this with an argument (patch: seed now prefills inputText
  // instead of auto-sending — see decisions.md [C2-D123] addendum); the
  // explicitText parameter is left in place since it's harmless and no call
  // site currently exercises it. Button onClick and Enter-key call sites pass
  // no argument (or pass their native event, which fails the typeof check and
  // falls back to inputText) — existing call sites are unaffected.
  async function sendMessage(explicitText) {
    var text = (typeof explicitText === 'string' ? explicitText : inputText).trim();
    if (!text || sending) return;
    var key = apiKey();
    if (!key) {
      setThread(function(prev) {
        return [...prev, { id: 'err_' + Date.now(), role: 'agent', text: 'Set your Fincr API key in Settings to use the agent.', proposals: [] }];
      });
      return;
    }

    setSending(true);
    setInputText('');

    // 1. Append user message optimistically
    setThread(function(prev) {
      return [...prev, { id: 'u_' + Math.random().toString(36).slice(2, 8), role: 'user', text: text, proposals: [] }];
    });
    convMsgsRef.current = [...convMsgsRef.current, { role: 'user', content: text }];

    // 2. Lazy-start conversation on first send
    var activeConvId = convId;
    if (!activeConvId) {
      activeConvId = await startConversation();
    }

    // 3. Show typing indicator
    var typingId = 'typing_' + Date.now();
    setThread(function(prev) {
      return [...prev, { id: typingId, role: 'typing', text: '', proposals: [] }];
    });

    // 4. POST /chat with history capped at AGENT_HISTORY_CAP
    try {
      var messages = convMsgsRef.current.slice(-AGENT_HISTORY_CAP);
      var r = await fetch(AGENT_API_BASE + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify({ messages: messages, conversation_id: activeConvId }),
      });

      if (!r.ok) {
        // Gateway/timeout-class responses (e.g. nginx 504 when a web-search-heavy
        // reply outruns proxy_read_timeout) are not JSON — never hand these to
        // r.json(). See decisions.md [C2-D124].
        setThread(function(prev) { return prev.filter(function(m) { return m.id !== typingId; }); });
        var isGatewayTimeout = (r.status === 502 || r.status === 503 || r.status === 504);
        var statusMsg = isGatewayTimeout
          ? 'The agent is taking longer than expected to respond. It may still complete — try again in a moment, or shorten your message.'
          : 'Something went wrong (status ' + r.status + ') — try again.';
        setThread(function(prev) {
          return [...prev, { id: 'err_' + Date.now(), role: 'agent', text: statusMsg, proposals: [] }];
        });
        return;
      }

      var d = await r.json();

      // Remove typing indicator
      setThread(function(prev) { return prev.filter(function(m) { return m.id !== typingId; }); });

      if (d.status === 'ok') {
        var parsed = parseAgentResponse(d.response);
        // C2-D126 — core_argument/target_price/thesis_indicators proposals no
        // longer stage into a session-local thesis-editor draft on arrival
        // (that was C2-D123/C2-D125's "drafted, editor Save gates it" posture).
        // They render as one UnifiedThesisProposalCard2 below and commit
        // directly from chat — nothing to pre-populate into drawer2.jsx.
        setThread(function(prev) {
          return [...prev, { id: 'a_' + Math.random().toString(36).slice(2, 8), role: 'agent', text: parsed.prose, proposals: parsed.proposals }];
        });
        // Store full response (with block) in convMsgsRef for conversation continuity
        convMsgsRef.current = [...convMsgsRef.current, { role: 'assistant', content: d.response }];
        // Refresh sidebar so title appears after first turn
        if (activeConvId) loadConversationList();
      } else {
        setThread(function(prev) {
          return [...prev, { id: 'err_' + Date.now(), role: 'agent', text: 'Error: ' + (d.error || 'Unknown error from server.'), proposals: [] }];
        });
      }
    } catch(e) {
      setThread(function(prev) { return prev.filter(function(m) { return m.id !== typingId; }); });
      setThread(function(prev) {
        return [...prev, { id: 'err_' + Date.now(), role: 'agent', text: 'Network error — check your connection and try again.', proposals: [] }];
      });
    } finally {
      setSending(false);
    }
  }

  // ── Proposal handlers ─────────────────────────────────────────────────────────
  // Commit: calls saveThesis (Spec 3, thesis-adapter.js) + refreshes F.thesis.
  // reasoning → conversation_summary → last_update_reason in thesis.json.
  async function handleCommit(proposal) {
    // C2-D126 — core_argument/target_price/thesis_indicators no longer reach
    // this handler at all: the render loop above routes those three fields to
    // UnifiedThesisProposalCard2 (which commits via its own handleCommit),
    // never to ProposalCard2's onCommit. This handler now only ever sees
    // conviction/stance.
    if (!window.saveThesis) { console.warn('[agent] saveThesis not available'); return false; }
    var ok = await window.saveThesis(
      proposal.ticker,
      { [proposal.field]: proposal.proposed },
      proposal.reasoning  // conversation_summary
    );
    if (ok && window.loadThesis) await window.loadThesis();
    return ok;
  }

  // Edit: opens position drawer pre-filled with proposed value via openDrawerWithPrefill
  // (added to store2.jsx in C2-S4b). Proposal card self-dismisses.
  function handleEdit(proposal) {
    var store = window.__fincrStore;
    if (store && store.actions && store.actions.openDrawerWithPrefill) {
      store.actions.openDrawerWithPrefill(proposal.ticker, { [proposal.field]: proposal.proposed });
    } else if (store && store.actions && store.actions.openDrawer) {
      // Fallback: clipboard copy if openDrawerWithPrefill not yet available
      var text = proposal.field + ': ' + proposal.proposed;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          window.dispatchEvent(new CustomEvent('fincr:toast', { detail: { message: 'Copied — open the position drawer and paste.' } }));
        });
      }
      store.actions.openDrawer(proposal.ticker);
    }
  }

  // ── Rename conversation ───────────────────────────────────────────────────────
  async function renameConversation(id, newTitle) {
    var key = apiKey();
    if (!key || !newTitle.trim()) return;
    try {
      await fetch(AGENT_API_BASE + '/conversations/' + id + '/title', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify({ title: newTitle }),
      });
      await loadConversationList();
    } catch(e) { /* non-fatal */ }
  }

  // ── Input helpers ─────────────────────────────────────────────────────────────
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // ── Sidebar: group conversations by date ──────────────────────────────────────
  function groupConversations(convs) {
    var groups = {};
    var now = new Date();
    convs.forEach(function(conv) {
      var date = conv.started_at ? new Date(conv.started_at) : now;
      var diffDays = Math.floor((now - date) / 86400000);
      var label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday'
                : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      if (!groups[label]) groups[label] = [];
      groups[label].push(conv);
    });
    return groups;
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  var hasKey = !!apiKey();
  var groups = groupConversations(conversations);
  var activeConvTitle = convId ? (conversations.find(function(c) { return c.id === convId; }) || {}).title : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 0, border: '1px solid ' + t.cardBorder, borderRadius: 16, overflow: 'hidden', background: t.card, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, boxShadow: t.cardShadow, minHeight: 560 }}>

      {/* ── Sidebar rail ─────────────────────────────────────────────────── */}
      {/* maxHeight added so overflowY:auto actually engages instead of the grid
          row just growing taller as threads accumulate — same fixed-height +
          overflow pattern as guardrails2.jsx/palette2.jsx. onScroll drives
          scroll-triggered pagination (loadMoreConversations). */}
      <div onScroll={handleRailScroll} style={{ borderRight: '1px solid ' + t.hair, display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 560 }}>
        <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.16em' }}>THREADS</MonoTxt>
          <button
            onClick={startNewConversation}
            className="f2-press"
            title="New conversation"
            style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid ' + t.hair, background: 'none', color: t.dim, cursor: 'pointer', fontSize: 15, lineHeight: 1 }}
          >{'+'}</button>
        </div>

        {!hasKey ? (
          <button onClick={() => window.dispatchEvent(new CustomEvent('fincr:go-tab', { detail: { tab: 'settings' } }))} className="f2-press" style={{ padding: '6px 14px', fontSize: 11, color: t.accent, fontFamily: t.mono, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>Set API key in Settings →</button>
        ) : conversations.length === 0 ? (
          <div style={{ padding: '6px 14px', fontSize: 11, color: t.faint, fontFamily: t.mono }}>No conversations yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', padding: '0 6px' }}>
            {Object.entries(groups).map(function(entry) {
              var label = entry[0];
              var convs = entry[1];
              return (
                <React.Fragment key={label}>
                  <div style={{ fontFamily: t.mono, fontSize: 9.5, color: t.faint, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px 8px 2px' }}>
                    {label}
                  </div>
                  {convs.map(function(conv) {
                    return (
                      <ConvRailItem2
                        key={conv.id}
                        conv={conv}
                        active={conv.id === convId}
                        t={t}
                        onOpen={openConversation}
                        onRename={renameConversation}
                        onDelete={deleteConversation}
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}
            {loadingMoreConversations ? (
              <div style={{ padding: '8px 8px', fontSize: 10.5, color: t.faint, fontFamily: t.mono, textAlign: 'center' }}>Loading…</div>
            ) : null}
          </div>
        )}
      </div>

      {/* ── Main chat area ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: t.dark ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.38)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 22px', borderBottom: '1px solid ' + t.hair, flexShrink: 0 }}>
          <LiveDot2 color={t.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: t.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeConvTitle || (convId ? 'Conversation' : 'New conversation')}
          </span>
          <div style={{ ...t.g2Inner, borderRadius: 999, padding: '4px 11px', flexShrink: 0 }}>
            <MonoTxt size={9.5} color={t.faint}>CONTEXT: BOOK · THESIS · RULES</MonoTxt>
          </div>
        </div>

        {/* Thread */}
        <div style={{ flex: 1, padding: '16px 22px 6px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: 480 }}>
          {thread.length === 0 && (
            <div style={{ fontFamily: t.mono, fontSize: 12, color: t.faint, fontStyle: 'italic', textAlign: 'center', padding: '36px 0' }}>
              Ask anything about your portfolio, your thesis, or the markets.
            </div>
          )}

          {thread.map(function(msg) {
            // Typing indicator
            if (msg.role === 'typing') {
              return (
                <div key={msg.id} style={{ alignSelf: 'flex-start', display: 'flex', gap: 4, padding: '9px 12px', background: t.raise, borderRadius: '8px 8px 8px 3px', border: '1px solid ' + t.hair }}>
                  {[0, 0.2, 0.4].map(function(delay, i) {
                    return (
                      <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: t.faint, animation: 'agentBounce 1.2s ' + delay + 's infinite' }} />
                    );
                  })}
                </div>
              );
            }

            // User bubble — glass gradient recipe from the design handoff
            if (msg.role === 'user') {
              return (
                <div key={msg.id} style={{
                  alignSelf: 'flex-end', maxWidth: 430,
                  background: t.dark
                    ? 'linear-gradient(150deg, rgba(126,164,248,0.34), rgba(74,110,206,0.26))'
                    : 'linear-gradient(150deg, rgba(120,158,246,0.30), rgba(72,110,214,0.20))',
                  border: '1px solid ' + (t.dark ? 'rgba(160,190,255,0.26)' : 'rgba(255,255,255,0.8)'),
                  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  boxShadow: '0 10px 26px -18px rgba(20,40,90,0.7)',
                  borderRadius: '20px 20px 6px 20px', padding: '11px 16px',
                  fontSize: 13, color: t.ink, lineHeight: 1.55,
                }}>
                  {msg.text}
                </div>
              );
            }

            // Agent bubble + optional proposal cards below. Prose plate (glass
            // tokens, C2-D138) replaces the old bare pre-line text div; content
            // is rendered through AgentProse2's markdown parser rather than as
            // literal text. No per-message timestamp is shown here — confirmed
            // during this spec's Builder pass that stored messages carry no
            // per-message time at all (only conversation-level started_at/
            // ended_at), so the design doc's HH:MM/day-divider pieces are not
            // buildable without a backend schema change; out of scope here,
            // flagged in decisions.md rather than faked with client-side-only
            // send times that would be wrong for any reloaded conversation.
            return (
              <div key={msg.id} style={{ alignSelf: 'flex-start', maxWidth: 620 }}>
                <MonoTxt size={9.5} color={t.faint} style={{ display: 'block', letterSpacing: '0.16em', marginBottom: 5 }}>FINCR</MonoTxt>
                <div style={{ ...t.g2Plate, maxWidth: 560, borderRadius: '20px 20px 20px 6px', padding: '14px 18px' }}>
                  <AgentProse2 text={msg.text} t={t} />
                </div>
                {(function() {
                  // C2-D126 — conviction/stance keep their existing per-proposal
                  // ProposalCard2 (direct commit, unaffected by this change).
                  // core_argument / target_price / thesis_indicators group by
                  // ticker into ONE UnifiedThesisProposalCard2 per ticker present
                  // in this message — the whole point of the consolidation is
                  // that text + indicators + target for the same holding commit
                  // together, not as N separate cards.
                  var msgProposals = msg.proposals || [];
                  var scalarProposals = msgProposals.filter(function(p) { return p.field === 'conviction' || p.field === 'stance'; });
                  var unifiedFieldSet = { core_argument: true, target_price: true, thesis_indicators: true };
                  var unifiedByTicker = {};
                  msgProposals.forEach(function(p) {
                    if (!unifiedFieldSet[p.field]) return;
                    (unifiedByTicker[p.ticker] = unifiedByTicker[p.ticker] || []).push(p);
                  });
                  return (
                    <React.Fragment>
                      {scalarProposals.map(function(p, pi) {
                        return (
                          <ProposalCard2
                            key={p.ticker + ':' + p.field + ':' + pi}
                            proposal={p}
                            onCommit={handleCommit}
                            onEdit={handleEdit}
                          />
                        );
                      })}
                      {Object.keys(unifiedByTicker).map(function(tk) {
                        return (
                          <UnifiedThesisProposalCard2
                            key={tk + ':unified'}
                            ticker={tk}
                            proposals={unifiedByTicker[tk]}
                          />
                        );
                      })}
                    </React.Fragment>
                  );
                })()}
              </div>
            );
          })}

          <div ref={threadEndRef} />
        </div>

        {/* Composer — suggestion chips + glass input (C2-D138) */}
        <div style={{ padding: '12px 20px 18px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Create a thesis card proposal', 'Are there holdings not backed by my thesis?', 'Summarise this chat'].map(function(chip) {
              return (
                <button
                  key={chip}
                  onClick={function() { setInputText(chip); if (inputRef.current) inputRef.current.focus(); }}
                  className="f2-press"
                  style={{ ...t.g2Inner, borderRadius: 999, padding: '5px 11px', fontFamily: t.mono, fontSize: 10, color: t.faint, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {chip}
                </button>
              );
            })}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, borderRadius: 999, padding: '6px 7px 6px 18px',
            background: t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid ' + (composerFocused ? t.accent : (t.dark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.95)')),
            boxShadow: composerFocused ? '0 0 0 4px ' + t.accentSoft : '0 8px 22px -18px rgba(0,0,0,0.6)',
            transition: 'border-color 0.13s, box-shadow 0.13s',
          }}>
            <input
              ref={inputRef}
              value={inputText}
              onChange={function(e) { setInputText(e.target.value); }}
              onKeyDown={handleKeyDown}
              onFocus={function() { setComposerFocused(true); }}
              onBlur={function() { setComposerFocused(false); }}
              placeholder="Ask about your portfolio…"
              disabled={sending}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: t.sans, fontSize: 13, color: t.ink, padding: '8px 0' }}
            />
            <Btn2 primary style={{ fontSize: 12, padding: '8px 18px', borderRadius: 999 }} onClick={sendMessage} disabled={sending || !inputText.trim()}>
              {sending ? '…' : 'Send'}
            </Btn2>
          </div>
          <div style={{ fontSize: 10, color: t.ghost, fontFamily: t.mono }}>Grounded in your book — not advice. Thesis edits need your approval.</div>
        </div>
      </div>
    </div>
  );
}

window.AgentTab2 = AgentTab2;
