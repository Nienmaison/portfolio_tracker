/* Fincr 2.0 — primitives. Mono figures, numbered ledger sections, status chips,
   triangles, crosshair NAV chart, stacked allocation bar.
   Exports: useTheme2, useCountUp2, Money, MonoTxt, Tri, Delta2, SecHead, Chip2,
   Kbd2, HoverChart, StackBar2, Btn2, LiveDot2 */

function useTheme2() { return React.useContext(window.Theme2Ctx); }

function useCountUp2(target, dur = 900) {
  const [v, setV] = React.useState(target);
  const from = React.useRef(target);
  React.useEffect(() => {
    let raf, start; const a = from.current, b = target;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(a + (b - a) * e);
      if (p < 1) raf = requestAnimationFrame(step); else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

/* Money — every monetary figure runs through this: tabular mono + blur target
   for discrete mode. */
function Money({ children, size = 13, weight = 500, color, style }) {
  const t = useTheme2();
  return (
    <span className="f2-money" style={{ fontFamily: t.mono, fontSize: size, fontWeight: weight, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: color || t.ink, ...style }}>{children}</span>
  );
}
/* Mono but not money (dates, codes) — never blurred. */
function MonoTxt({ children, size = 11, color, style }) {
  const t = useTheme2();
  return <span style={{ fontFamily: t.mono, fontSize: size, fontVariantNumeric: 'tabular-nums', color: color || t.dim, ...style }}>{children}</span>;
}

function Tri({ up, size = 7, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" style={{ flexShrink: 0, display: 'block', transform: up ? 'none' : 'rotate(180deg)' }}>
      <path d="M4 1 L7.4 6.6 H0.6 Z" fill={color || 'currentColor'} />
    </svg>
  );
}

/* Signed delta as plain colored mono text — no pill chrome. */
function Delta2({ pct, value, size = 13, dim }) {
  const t = useTheme2();
  const up = pct >= 0;
  const c = dim ? t.dim : (up ? t.green : t.red);
  const F = window.FINCR;
  return (
    <span className="f2-money" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: t.mono, fontSize: size, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: c, whiteSpace: 'nowrap' }}>
      <Tri up={up} size={size * 0.52} />
      {value != null && <span>{F.signed(value)}</span>}
      <span>{value != null ? `(${F.pct(pct)})` : F.pct(pct)}</span>
    </span>
  );
}

/* Numbered ledger section head: "01 · NET ASSET VALUE ───────── [right]" */
function SecHead({ n, children, right, style }) {
  const t = useTheme2();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...style }}>
      <span style={{ fontFamily: t.mono, fontSize: 10.5, color: t.ghost }}>{n}</span>
      <span style={{ fontFamily: t.mono, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.faint, whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: t.hair }}></span>
      {right || null}
    </div>
  );
}

function Chip2({ tone = 'ok', children }) {
  const t = useTheme2();
  const map = {
    ok: { c: t.green, bg: t.greenSoft },
    watch: { c: t.amber, bg: t.amberSoft },
    bad: { c: t.red, bg: t.redSoft },
    mute: { c: t.dim, bg: t.press },
    accent: { c: t.accent, bg: t.accentSoft },
  };
  const m = map[tone] || map.mute;
  return (
    <span style={{ fontFamily: t.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: m.c, background: m.bg, padding: '3px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>{children}</span>
  );
}

function Kbd2({ children }) {
  const t = useTheme2();
  return <kbd style={{ fontFamily: t.mono, fontSize: 10, color: t.dim, border: `1px solid ${t.hair}`, borderBottomWidth: 2, borderRadius: 4, padding: '1px 5px', background: t.raise }}>{children}</kbd>;
}

function LiveDot2({ color }) {
  const t = useTheme2();
  return <span className="fincr-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: color || t.green, flexShrink: 0 }}></span>;
}

function Btn2({ children, onClick, primary, style, title }) {
  const t = useTheme2();
  return (
    <button onClick={onClick} title={title} className="f2-press" style={{ fontFamily: t.sans, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '7px 13px', borderRadius: 7,
      color: primary ? (t.dark ? '#0A0B0D' : '#FFF') : t.ink, background: primary ? t.ink : 'transparent', border: `1px solid ${primary ? t.ink : t.inputBorder}`, transition: 'all 0.13s', ...style }}>{children}</button>
  );
}

/* Soft glass panel — Apple-feel surface that the ledger internals sit on. */
function Card2({ children, style, pad = 22 }) {
  const t = useTheme2();
  return (
    <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: pad,
      backdropFilter: t.blur, WebkitBackdropFilter: t.blur, boxShadow: t.cardShadow, ...style }}>{children}</div>
  );
}

/* ── Deterministic € series for the NAV chart ─────────────────────────── */
function f2Series(seed, n, endValue, swing, trend) {
  let a = (seed * 2654435761) >>> 0;
  const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
  const vals = []; let v = 0.5;
  for (let i = 0; i < n; i++) { v += (rnd() - 0.5) * 0.16 + trend * 0.012; v = Math.max(0.04, Math.min(0.96, v)); vals.push(v); }
  const last = vals[n - 1];
  return vals.map((x) => endValue * (1 + (x - last) * swing));
}

/* Crosshair NAV chart. Width-responsive (ResizeObserver), hover readout,
   gridlines with € labels, optional dashed cost-basis line. */
function HoverChart({ series, dates, h = 180, cost, id }) {
  const t = useTheme2();
  const F = window.FINCR;
  const ref = React.useRef(null);
  const [w, setW] = React.useState(600);
  const [hov, setHov] = React.useState(null);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    setW(Math.max(240, el.getBoundingClientRect().width));
    const ro = new ResizeObserver((e) => setW(Math.max(240, e[0].contentRect.width)));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const padT = 10, padB = 18, padR = 56, padL = 0;
  const iw = w - padL - padR, ih = h - padT - padB;
  let min = Math.min(...series), max = Math.max(...series);
  if (cost != null) { min = Math.min(min, cost); max = Math.max(max, cost); }
  const rng = (max - min) || 1; min -= rng * 0.06; max += rng * 0.06;
  const X = (i) => padL + (i / (series.length - 1)) * iw;
  const Y = (v) => padT + (1 - (v - min) / (max - min)) * ih;
  const path = series.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  const area = path + ` L ${X(series.length - 1).toFixed(1)} ${h - padB} L ${padL} ${h - padB} Z`;
  const grid = [0.25, 0.5, 0.75].map((f) => ({ y: padT + f * ih, v: max - f * (max - min) }));
  const up = series[series.length - 1] >= series[0];
  const line = t.accent;
  const gid = 'f2g-' + (id || 'nav');

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = e.clientX - r.left - padL;
    const i = Math.max(0, Math.min(series.length - 1, Math.round((x / iw) * (series.length - 1))));
    setHov(i);
  };
  const hi = hov != null ? hov : null;
  const tipLeft = hi != null ? Math.min(Math.max(X(hi) - 60, 0), w - 132) : 0;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', cursor: 'crosshair' }} onMouseMove={onMove} onMouseLeave={() => setHov(null)}>
      <svg width={w} height={h} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={line} stopOpacity="0.14"></stop>
            <stop offset="1" stopColor={line} stopOpacity="0"></stop>
          </linearGradient>
        </defs>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={w - padR + 8} y2={g.y} stroke={t.hair} strokeWidth="1"></line>
            <text x={w - padR + 12} y={g.y + 3} fontFamily="Spline Sans Mono, monospace" fontSize="9.5" fill={t.faint}>{F.eur(Math.round(g.v / 100) / 10, 1)}k</text>
          </g>
        ))}
        {cost != null && (
          <g>
            <line x1={padL} y1={Y(cost)} x2={w - padR + 8} y2={Y(cost)} stroke={t.ghost} strokeWidth="1" strokeDasharray="2 4"></line>
            <text x={w - padR + 12} y={Y(cost) + 3} fontFamily="Spline Sans Mono, monospace" fontSize="9.5" fill={t.faint}>cost</text>
          </g>
        )}
        <path d={area} fill={`url(#${gid})`}></path>
        <path className="fincr-draw" d={path} fill="none" stroke={line} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round"></path>
        {hi != null && (
          <g>
            <line x1={X(hi)} y1={padT - 4} x2={X(hi)} y2={h - padB} stroke={t.hairStrong} strokeWidth="1"></line>
            <circle cx={X(hi)} cy={Y(series[hi])} r="3.5" fill={line} stroke={t.page} strokeWidth="2"></circle>
          </g>
        )}
        {/* x labels: first / mid / last */}
        {dates && [0, Math.floor((series.length - 1) / 2), series.length - 1].map((di, k) => (
          <text key={k} x={k === 0 ? padL : k === 1 ? padL + iw / 2 : padL + iw} y={h - 4} textAnchor={k === 0 ? 'start' : k === 1 ? 'middle' : 'end'} fontFamily="Spline Sans Mono, monospace" fontSize="9.5" fill={t.faint}>{dates[di]}</text>
        ))}
      </svg>
      {hi != null && (
        <div style={{ position: 'absolute', top: -6, left: tipLeft, pointerEvents: 'none', background: t.raise, border: `1px solid ${t.hair}`, borderRadius: 6, padding: '5px 9px', display: 'flex', alignItems: 'baseline', gap: 8, boxShadow: t.dark ? '0 8px 24px -10px rgba(0,0,0,0.7)' : '0 8px 24px -14px rgba(23,25,30,0.35)' }}>
          <MonoTxt size={10}>{dates ? dates[hi] : ''}</MonoTxt>
          <Money size={12} weight={600}>{F.eur(series[hi])}</Money>
        </div>
      )}
    </div>
  );
}

/* Squared stacked allocation bar with 2px joints. */
function StackBar2({ data, height = 14, onHover, hovered }) {
  const t = useTheme2();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ display: 'flex', gap: 2, width: '100%', height }}>
      {data.map((d) => (
        <div key={d.ticker} title={d.ticker}
          onMouseEnter={() => onHover && onHover(d.ticker)} onMouseLeave={() => onHover && onHover(null)}
          style={{ flex: d.value / total, background: d.color, borderRadius: 2, transition: 'opacity 0.15s, transform 0.15s',
            opacity: hovered && hovered !== d.ticker ? 0.3 : 1 }}></div>
      ))}
    </div>
  );
}

Object.assign(window, { useTheme2, useCountUp2, Money, MonoTxt, Tri, Delta2, SecHead, Chip2, Kbd2, LiveDot2, Btn2, Card2, f2Series, HoverChart, StackBar2 });
