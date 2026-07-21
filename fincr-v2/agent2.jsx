/* Fincr 2.0 — Agent tab: live /chat + conversation management + THESIS_PROPOSAL cards.
   C2-S4b: V1 archive/v1.html ported to React. Replaces the static mock.
   Decision C2-D64. */

const AGENT_API_BASE = 'https://fincr.duckdns.org';
// Mirror api.py's server-side cap: last 10 messages = 5 exchanges.
const AGENT_HISTORY_CAP = 10;

// ── THESIS_PROPOSAL parser ────────────────────────────────────────────────────
// Strips <<<THESIS_PROPOSAL>>> blocks from agent response prose and returns
// a validated proposals array. Invalid blocks (wrong field, bad enum, ticker
// not in holdings) are discarded silently (console only). core_argument is a
// valid field (C2-D123) — free text, no enum check, forwarded like conviction/
// stance. The system prompt gates WHEN the agent may emit it; this parser only
// validates shape.
// Returns { prose: string, proposals: ProposalObject[] }
// ProposalObject: { ticker, field, current, proposed, reasoning }
function parseAgentResponse(text) {
  const VALID_CONVICTIONS = new Set(['high', 'medium', 'low']);
  const VALID_STANCES = new Set(['accumulate', 'hold', 'trim']);
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
    if (field !== 'conviction' && field !== 'stance' && field !== 'core_argument') {
      console.warn('[agent] discarding proposal: invalid field:', field);
      continue;
    }
    if (field === 'core_argument') {
      // Free-text field (C2-D123) — no enum to validate against, just require
      // non-empty proposed text. Persistence still gated behind the owner's
      // existing thesis-editor Save action — see ProposalCard2/ThesisEditor2.
      if (!proposed || !proposed.trim()) { console.warn('[agent] discarding proposal: empty core_argument proposal'); continue; }
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

// ── Proposal card component ───────────────────────────────────────────────────
// Renders one card per proposal below the assistant bubble that emitted it.
// Card is session-local state — resets on reload. Commit reuses window.saveThesis
// from Spec 3 (thesis-adapter.js), so no new write path. Exception (C2-D123):
// core_argument never gets a Commit control here — it is pushed straight into
// the thesis editor's draft state on arrival and only persists via that
// editor's own Save button (see handleCommit's guard and updateThesisDraft).
function ProposalCard2({ proposal, onCommit, onEdit }) {
  const t = useTheme2();
  const [status, setStatus] = React.useState('pending'); // pending | committed | dismissed
  const [cardError, setCardError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  async function handleCommit() {
    setBusy(true);
    setCardError(null);
    var ok = await onCommit(proposal);
    setBusy(false);
    if (ok) {
      setStatus('committed');
    } else {
      setCardError('Failed to save — try again');
    }
  }

  function handleEdit() {
    // Dismiss this card; drawer opens with prefill via store action
    setStatus('dismissed');
    onEdit(proposal);
  }

  function handleDismiss() {
    setStatus('dismissed');
  }

  if (status === 'dismissed') {
    return null; // fade handled via null render
  }

  return (
    <div style={{
      borderLeft: '3px solid ' + t.amber,
      background: status === 'committed' ? t.press : t.raise,
      border: '1px solid ' + t.cardBorder,
      borderLeft: '3px solid ' + t.amber,
      borderRadius: 8,
      padding: '10px 12px',
      marginTop: 8,
      opacity: status === 'committed' ? 0.7 : 1,
      transition: 'opacity 0.2s, background 0.2s',
    }}>
      {/* ticker · field · current → proposed */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontFamily: t.mono, fontSize: 11, fontWeight: 600, color: t.ink, letterSpacing: '0.04em' }}>
          {proposal.ticker}
        </span>
        <span style={{ fontFamily: t.mono, fontSize: 10, color: t.dim }}>{proposal.field}</span>
        <span style={{ fontFamily: t.mono, fontSize: 10, color: t.dim }}>{proposal.current}</span>
        <span style={{ fontFamily: t.mono, fontSize: 10, color: t.faint }}>{'→'}</span>
        <span style={{ fontFamily: t.mono, fontSize: 11, fontWeight: 600, color: t.ink }}>{proposal.proposed}</span>
      </div>

      {/* reasoning — max 2 lines */}
      <div style={{
        fontSize: 12, color: t.dim, fontStyle: 'italic', lineHeight: 1.5,
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        marginBottom: 8,
      }}>
        {proposal.reasoning}
      </div>

      {cardError && (
        <div style={{ fontSize: 11, color: t.red, marginBottom: 6 }}>{cardError}</div>
      )}

      {status === 'committed' ? (
        <div style={{ fontFamily: t.mono, fontSize: 11, color: t.dim }}>{'✓ Saved'}</div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {proposal.field === 'core_argument' ? (
            // C2-D123 — core_argument has no direct-commit control: it is already
            // drafted into the thesis editor (session-local) the moment this card
            // rendered. Persistence only happens via the editor's own Save button.
            <React.Fragment>
              <MonoTxt size={10.5} color={t.dim}>Drafted in thesis editor</MonoTxt>
              <Btn2 style={{ fontSize: 11, padding: '5px 12px' }} onClick={handleEdit}>
                Open editor
              </Btn2>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <Btn2 primary style={{ fontSize: 11, padding: '5px 12px' }} onClick={handleCommit} disabled={busy}>
                {busy ? '…' : 'Commit'}
              </Btn2>
              <Btn2 style={{ fontSize: 11, padding: '5px 12px' }} onClick={handleEdit}>
                Edit
              </Btn2>
            </React.Fragment>
          )}
          <button onClick={handleDismiss} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: t.mono, fontSize: 11, color: t.dim, padding: '5px 8px',
          }}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ── Conversation rail item ────────────────────────────────────────────────────
// One row in the sidebar thread list. Inline rename on double-click of the title.
function ConvRailItem2({ conv, active, t, onOpen, onRename }) {
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

  return (
    <div
      onClick={function() { if (!editing) onOpen(conv.id); }}
      className="f2-press"
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
          <div style={{
            fontSize: 12.5, fontWeight: 600,
            color: active ? t.ink : t.dim,
            lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            paddingRight: 18,
          }}>
            {conv.title || 'New conversation'}
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
          <button
            onClick={startEdit}
            title="Rename"
            style={{
              position: 'absolute', top: 8, right: 6, background: 'none', border: 'none',
              color: t.faint, fontSize: 11, cursor: 'pointer', padding: 0,
              opacity: active ? 0.6 : 0,
            }}
          >{'✎'}</button>
        </React.Fragment>
      )}
    </div>
  );
}

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
  const [inputText, setInputText] = React.useState('');
  const [sending, setSending] = React.useState(false);

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

  async function loadConversationList() {
    var key = apiKey();
    if (!key) return;
    try {
      var r = await fetch(AGENT_API_BASE + '/conversations', { headers: { 'X-API-Key': key } });
      var d = await r.json();
      if (d.status === 'ok') setConversations(d.conversations || []);
    } catch(e) { console.warn('[agent] loadConversationList failed:', e.message); }
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
      setThread(restoredThread);
      convMsgsRef.current = msgs.map(function(m) { return { role: m.role, content: m.content }; });
      setConvId(id);
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
  function startNewConversation() {
    setConvId(function(prev) {
      if (prev) endConversation(prev);
      return null;
    });
    setThread([]);
    convMsgsRef.current = [];
    if (inputRef.current) inputRef.current.focus();
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
      var d = await r.json();

      // Remove typing indicator
      setThread(function(prev) { return prev.filter(function(m) { return m.id !== typingId; }); });

      if (d.status === 'ok') {
        var parsed = parseAgentResponse(d.response);
        // C2-D123 — core_argument proposals populate the thesis-editor draft
        // immediately (not gated on the owner clicking Edit on the card), so an
        // already-open drawer for that ticker updates live. Purely client-side —
        // does not touch thesis.json. See updateThesisDraft in store2.jsx.
        var draftStore = window.__fincrStore;
        if (draftStore && draftStore.actions && draftStore.actions.updateThesisDraft) {
          parsed.proposals.forEach(function(p) {
            if (p.field === 'core_argument') {
              draftStore.actions.updateThesisDraft(p.ticker, { core_argument: p.proposed });
            }
          });
        }
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
    // Defense in depth (C2-D123): core_argument must only ever persist via the
    // ThesisEditor2 Save button (window.saveThesis called from drawer2.jsx),
    // never via this direct-commit path. Should be unreachable — ProposalCard2
    // does not render a Commit control for core_argument — but guarded here too.
    if (proposal.field === 'core_argument') {
      console.warn('[agent] refusing direct commit of core_argument — must go through thesis editor Save');
      return false;
    }
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
      <div style={{ borderRight: '1px solid ' + t.hair, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
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
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}
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
          <MonoTxt size={10} color={t.faint} style={{ flexShrink: 0 }}>CONTEXT: BOOK · THESIS · RULES</MonoTxt>
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

            // User bubble
            if (msg.role === 'user') {
              return (
                <div key={msg.id} style={{ alignSelf: 'flex-end', maxWidth: 440, background: t.press, border: '1px solid ' + t.hair, borderRadius: '12px 12px 3px 12px', padding: '10px 14px', fontSize: 13, color: t.ink, lineHeight: 1.5 }}>
                  {msg.text}
                </div>
              );
            }

            // Agent bubble + optional proposal cards below
            return (
              <div key={msg.id} style={{ alignSelf: 'flex-start', maxWidth: 560 }}>
                <MonoTxt size={9.5} color={t.faint} style={{ display: 'block', letterSpacing: '0.16em', marginBottom: 5 }}>FINCR</MonoTxt>
                <div style={{ fontSize: 13, color: t.ink, lineHeight: 1.62, whiteSpace: 'pre-line' }}>
                  {msg.text}
                </div>
                {msg.proposals && msg.proposals.map(function(p, pi) {
                  return (
                    <ProposalCard2
                      key={p.ticker + ':' + p.field + ':' + pi}
                      proposal={p}
                      onCommit={handleCommit}
                      onEdit={handleEdit}
                    />
                  );
                })}
              </div>
            );
          })}

          <div ref={threadEndRef} />
        </div>

        {/* Input row */}
        <div style={{ padding: '12px 22px 18px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.inputBg, border: '1px solid ' + t.inputBorder, borderRadius: 10, padding: '4px 6px 4px 14px' }}>
            <input
              ref={inputRef}
              value={inputText}
              onChange={function(e) { setInputText(e.target.value); }}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your portfolio…"
              disabled={sending}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: t.sans, fontSize: 13, color: t.ink, padding: '8px 0' }}
            />
            <Btn2 primary style={{ fontSize: 12, padding: '7px 14px' }} onClick={sendMessage} disabled={sending || !inputText.trim()}>
              {sending ? '…' : 'Send'}
            </Btn2>
          </div>
          <div style={{ fontSize: 10.5, color: t.ghost, marginTop: 7, fontFamily: t.mono }}>Answers are grounded in your book — not advice.</div>
        </div>
      </div>
    </div>
  );
}

window.AgentTab2 = AgentTab2;
