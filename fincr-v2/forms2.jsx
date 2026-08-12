/* Fincr 2.0 — mutation primitives: Modal2 (centered overlay), Drawer2 (right
   slide-over), Field2 / NumberField2 / SegPick2 / Select2, and small action
   buttons. All flat, hairline-ruled, mono figures — matches the Desk system.
   Exports under window.* at file end. */

/* Centered modal. Click backdrop or Esc to close. */
function Modal2({ open, onClose, title, sub, width = 460, children, footer }) {
  const t = useTheme2();
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {if (e.key === 'Escape') onClose();};
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // Portal to body: cards use backdrop-filter, which creates a stacking context
  // that would trap this modal behind later sibling cards. Escaping to body
  // makes zIndex global again.
  return ReactDOM.createPortal(
    <div onMouseDown={(e) => {if (e.target === e.currentTarget) onClose();}}
    style={{ position: 'fixed', inset: 0, zIndex: 95, background: t.dark ? 'rgba(4,5,7,0.62)' : 'rgba(23,25,30,0.28)', backdropFilter: 'blur(2px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '11vh' }}>
      {/* C2-D116: maxHeight (not height) caps the card without forcing short content to grow
          to fill it; display:flex + the content area's flex:1/minHeight:0/overflowY:auto is
          what actually makes ONLY the middle scroll -- minHeight:0 is load-bearing here (a
          flex child otherwise refuses to shrink below its content's natural height, so the
          scrollbar would never kick in without it). Header and footer get flexShrink:0 so
          they stay pinned in view regardless of how tall the content gets. */}
      <div style={{ width, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 22vh)', display: 'flex', flexDirection: 'column', background: t.raise, border: `1px solid ${t.hairStrong}`, borderRadius: 16, overflow: 'hidden', boxShadow: t.dark ? '0 40px 100px -24px rgba(0,0,0,0.92)' : '0 40px 100px -34px rgba(23,25,30,0.5)', animation: 'fincrSlide 0.18s ease' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${t.hair}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: t.ink, letterSpacing: '-0.01em' }}>{title}</div>
              {sub && <div style={{ fontSize: 12.5, color: t.faint, marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
            </div>
            <button onClick={onClose} className="f2-press" style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', color: t.dim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 3l8 8M11 3l-8 8"></path></svg>
            </button>
          </div>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>{children}</div>
        {footer && <div style={{ padding: '14px 24px', borderTop: `1px solid ${t.hair}`, display: 'flex', justifyContent: 'flex-end', gap: 10, background: t.dark ? 'rgba(255,255,255,0.015)' : 'rgba(23,25,30,0.015)', flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>, document.body);

}

/* Right slide-over drawer. */
function Drawer2({ open, onClose, width = 480, children }) {
  const t = useTheme2();
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {if (e.key === 'Escape') onClose();};
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return ReactDOM.createPortal(
    <div onMouseDown={(e) => {if (e.target === e.currentTarget) onClose();}}
    style={{ position: 'fixed', inset: 0, zIndex: 94, background: t.dark ? 'rgba(4,5,7,0.5)' : 'rgba(23,25,30,0.22)', display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width, maxWidth: 'calc(100vw - 24px)', height: '100%', background: t.raise, borderLeft: `1px solid ${t.hairStrong}`, overflowY: 'auto', boxShadow: t.dark ? '-30px 0 80px -20px rgba(0,0,0,0.8)' : '-30px 0 80px -34px rgba(23,25,30,0.35)', animation: 'f2drawer 0.24s cubic-bezier(.2,.7,.3,1)' }}>
        {children}
      </div>
    </div>, document.body);

}

/* C2-D161 — generic detail-drawer shell (title + body swap), matching the
   Claude Design handoff's exact glass/blur/translateX values (Direction B,
   "Fincr Positions - Calmer.html"). Deliberately a NEW component, not a
   Drawer2 variant: Drawer2 above is flat/opaque (`background: t.raise`,
   mount-triggered keyframe animation, full unmount on close) and
   PositionDrawer2 (drawer2.jsx, money/P&L/ledger) already depends on that
   exact look — out of scope for this build, so Drawer2 itself is untouched.
   Investigated first, per the build spec's explicit instruction: C2-D160's
   WatchlistDrawer2 had NOT extracted a shared shell — it called the plain
   Drawer2 above directly with its own duplicated inline header markup, no
   abstraction to reuse. This is that abstraction, generalized now rather
   than building a third bespoke drawer for Decision Rules. Two consumers as
   of this build: WatchlistDrawer2 (watchlist2.jsx, refactored to use this
   instead of raw Drawer2) and DecisionRulesDrawer2 (positions2.jsx, new). A
   third content type (transaction-row detail, per the handoff's mock) isn't
   built yet — this shell is ready for it whenever that lands.

   Stays mounted even while closed (no `if (!open) return null`) so the
   opacity/transform CSS transitions below actually have something to
   animate — matches the mock's own vanilla-JS drawer, which never clears
   #dbody on close, only toggles a class. One known minor gap: a caller
   whose children depend on a prop that goes null on close (WatchlistDrawer2's
   `w`) will still blank its body slightly before the 280ms slide-out
   finishes, since React unmounts that conditional content immediately.
   Accepted as a small, documented rough edge rather than adding a
   last-known-content cache for a half-second cosmetic gap. */
function DetailDrawer2({ open, onClose, title, children }) {
  const t = useTheme2();
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return ReactDOM.createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 94, background: 'rgba(6,9,18,0.5)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.22s' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 420, maxWidth: '92vw', background: 'rgba(19,23,33,0.92)', backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)', borderLeft: '1px solid rgba(255,255,255,0.10)', boxShadow: '-30px 0 70px -34px rgba(0,0,0,0.85)', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.28s cubic-bezier(.2,.7,.3,1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 22px 16px', borderBottom: `1px solid ${t.hair}`, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: t.ink }}>{title}</div>
          <button onClick={onClose} className="f2-press" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${t.hair}`, background: 'transparent', color: t.dim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 3l8 8M11 3l-8 8"></path></svg>
          </button>
        </div>
        <div style={{ padding: '18px 22px 40px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {children}
        </div>
      </div>
    </div>, document.body);
}

/* Labeled field wrapper. */
function Field2({ label, hint, children, style }) {
  const t = useTheme2();
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: t.mono, fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.faint }}>{label}</span>
        {hint && <span style={{ fontSize: 11, color: t.ghost }}>{hint}</span>}
      </span>
      {children}
    </label>);

}

const f2InputStyle = (t) => ({
  fontFamily: t.sans, fontSize: 14, color: t.ink, background: t.inputBg,
  border: `1px solid ${t.inputBorder}`, borderRadius: 9, padding: '10px 12px',
  outline: 'none', width: '100%', transition: 'border-color 0.13s'
});

/* Text input. */
function TextField2({ value, onChange, placeholder, mono, autoFocus, onEnter }) {
  const t = useTheme2();
  return (
    <input value={value} autoFocus={autoFocus} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => {if (e.key === 'Enter' && onEnter) onEnter();}}
    onFocus={(e) => e.target.style.borderColor = t.accent}
    onBlur={(e) => e.target.style.borderColor = t.inputBorder}
    style={{ ...f2InputStyle(t), fontFamily: mono ? t.mono : t.sans, fontVariantNumeric: mono ? 'tabular-nums' : 'normal' }} />);

}

/* Numeric input with a leading unit (€, qty) and tabular mono. */
function NumberField2({ value, onChange, prefix, placeholder, step, autoFocus, onEnter }) {
  const t = useTheme2();
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {prefix && <span style={{ position: 'absolute', left: 12, fontFamily: t.mono, fontSize: 13, color: t.faint, pointerEvents: 'none' }}>{prefix}</span>}
      <input type="number" inputMode="decimal" step={step || 'any'} value={value} autoFocus={autoFocus} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {if (e.key === 'Enter' && onEnter) onEnter();}}
      onFocus={(e) => e.target.style.borderColor = t.accent}
      onBlur={(e) => e.target.style.borderColor = t.inputBorder}
      style={{ ...f2InputStyle(t), fontFamily: t.mono, fontVariantNumeric: 'tabular-nums', paddingLeft: prefix ? 26 : 12 }} />
    </div>);

}

/* Two/three-way segmented pick (buy/sell, conviction, stance, …). The active
   segment fills with a tone colour: buy/ok → green, sell/bad → red, watch → amber,
   anything else (incl. 'mute' or no tone) → neutral press. White text on a colour
   fill, ink on neutral. buy/sell behaviour is unchanged (C2-S3 added ok/watch/bad). */
function Seg2({ options, value, onChange }) {
  const t = useTheme2();
  const fillFor = (tone) => (
    tone === 'sell' || tone === 'bad' ? t.red :
    tone === 'buy'  || tone === 'ok'  ? t.green :
    tone === 'watch'                  ? t.amber : null
  );
  return (
    <div style={{ display: 'flex', gap: 4, background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 9, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        const fill = fillFor(o.tone);
        return (
          <button key={o.value} onClick={() => onChange(o.value)} type="button"
          style={{ flex: 1, fontFamily: t.sans, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '7px 10px', borderRadius: 6, border: 'none', transition: 'all 0.13s',
            color: on ? (fill ? '#fff' : t.ink) : t.dim,
            background: on ? (fill || t.press) : 'transparent' }}>{o.label}</button>);

      })}
    </div>);

}

/* Drawer section header — like SecHead but lighter, for drawer internals. */
function DrawerSec2({ label, right, style }) {
  const t = useTheme2();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 2px', ...style }}>
      <span style={{ fontFamily: t.mono, fontSize: 10, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.faint, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: t.hair }}></span>
      {right || null}
    </div>);

}

/* Danger / text button. */
function TextBtn2({ children, onClick, tone, style }) {
  const t = useTheme2();
  const c = tone === 'danger' ? t.red : tone === 'accent' ? t.accent : t.dim;
  return (
    <button onClick={onClick} type="button" className="f2-press" style={{ fontFamily: t.sans, fontSize: 12.5, fontWeight: 600, color: c, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: 6, ...style }}>{children}</button>);

}

/* Confirm2 — styled destructive-confirm dialog replacing native confirm()
   (C2-D136). Built on Modal2, not a new overlay/backdrop. Imperative
   Promise-based API — window.confirm2(message[, opts]) — so each existing
   `if (confirm(msg)) {...}` call site converts with a minimal, uniform diff:
   make the enclosing function async and swap the condition to
   `if (await window.confirm2(msg)) {...}`. whiteSpace:'pre-line' preserves
   each message's own existing \n\n paragraph breaks verbatim — no message
   text is re-authored or split into a separate title, this is a mechanism
   swap only. Title defaults to a fixed generic string rather than parsing
   one out of the message, since messages don't share a consistent shape to
   split on. Host is mounted once at the app root (shell2.jsx).

   C2-D137 — optional richer body, additive only. `opts` may carry:
     - title, sub: passed straight to Modal2 (sub only renders when truthy,
       same as Modal2 always did — old callers never pass it, so nothing
       changes for them)
     - detail: [{label, tone, text}] — when present, renders as hairline-
       divided mono-label rows INSTEAD of the plain message (tone 'danger'
       colors the label t.red, anything else t.faint)
     - confirmLabel, cancelLabel: swap the footer buttons from the original
       plain TextBtn2 Cancel/OK to Btn2 (this codebase's existing bordered
       modal-footer button, e.g. ClosedReviewModal2's own Cancel/Save) with
       custom text and a red border/background on the affirmative button —
       only engages when these are actually passed; a bare
       `window.confirm2(msg)` call renders exactly as it did before this
       phase, byte-for-byte. Every existing call site keeps calling it that
       way — this extension is for the thread-delete site only. */
function Confirm2Host() {
  const t = useTheme2();
  const [state, setState] = React.useState(null); // {message, title, sub, detail, confirmLabel, cancelLabel, resolve}

  React.useEffect(function () {
    window.confirm2 = function (message, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        setState({
          message: message,
          title: opts.title || 'Confirm',
          sub: opts.sub,
          detail: opts.detail,
          confirmLabel: opts.confirmLabel,
          cancelLabel: opts.cancelLabel,
          resolve: resolve,
        });
      });
    };
    return function () { delete window.confirm2; };
  }, []);

  function settle(result) {
    setState(function (prev) {
      if (prev && prev.resolve) prev.resolve(result);
      return null;
    });
  }

  var richFooter = !!(state && (state.confirmLabel || state.cancelLabel));

  return (
    <Modal2
      open={!!state}
      onClose={function () { settle(false); }}
      title={state ? state.title : ''}
      sub={state ? state.sub : undefined}
      width={state && state.detail ? 420 : 400}
      footer={
        richFooter ? (
          <React.Fragment>
            <Btn2 onClick={function () { settle(false); }}>{state.cancelLabel || 'Cancel'}</Btn2>
            <Btn2 onClick={function () { settle(true); }} style={{ borderColor: t.red, color: t.red, background: t.dark ? 'rgba(226,97,92,0.10)' : 'rgba(205,74,70,0.07)' }}>{state.confirmLabel || 'OK'}</Btn2>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <TextBtn2 onClick={function () { settle(false); }}>Cancel</TextBtn2>
            <TextBtn2 tone="danger" onClick={function () { settle(true); }}>OK</TextBtn2>
          </React.Fragment>
        )
      }
    >
      {state && state.detail ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {state.detail.map(function (row, i) {
            return (
              <div key={i} style={i === 0 ? { display: 'flex', gap: 9, alignItems: 'baseline' } : { display: 'flex', gap: 9, alignItems: 'baseline', borderTop: '1px solid ' + t.hair, paddingTop: 10 }}>
                <MonoTxt size={9.5} color={row.tone === 'danger' ? t.red : t.faint} style={{ letterSpacing: '0.16em', flexShrink: 0, paddingTop: 2 }}>{row.label}</MonoTxt>
                <span style={{ fontSize: 12.5, color: t.dim, lineHeight: 1.55 }}>{row.text}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 13.5, color: t.dim, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{state ? state.message : ''}</div>
      )}
    </Modal2>
  );
}

Object.assign(window, { Modal2, Drawer2, Field2, TextField2, NumberField2, Seg2, DrawerSec2, TextBtn2, f2InputStyle, Confirm2Host });