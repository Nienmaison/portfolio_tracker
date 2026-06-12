/* Fincr — shared presentational helpers used across all three directions.
   Exports Sparkline, AreaSpark, DonutRing, AllocBars to window. */

// Thin stroke sparkline (no fill). w/h in px.
function Sparkline({ seed, trend, color, w = 100, h = 28, sw = 1.5, opacity = 1 }) {
  const s = window.FINCR.spark(seed, trend, 36, w, h, 2);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible', opacity }}>
      <path d={s.path} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Gradient-filled area sparkline.
function AreaSpark({ seed, trend, color, w = 100, h = 36, sw = 1.75, id }) {
  const s = window.FINCR.spark(seed, trend, 40, w, h, 2);
  const gid = 'asg-' + (id || seed) + '-' + Math.round(w);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={s.area} fill={`url(#${gid})`} stroke="none" />
      <path d={s.path} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Donut ring built from holdings (value-weighted). size px, thickness px.
function DonutRing({ data, size = 132, thickness = 16, gap = 0.012, track = 'rgba(0,0,0,0.05)', center }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const segs = data.map((d) => {
    const frac = d.value / total;
    const seg = { color: d.color, len: Math.max(0, frac - gap) * c, off: -acc * c, frac };
    acc += frac;
    return seg;
  });
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        {segs.map((s, i) => (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${s.len} ${c - s.len}`} strokeDashoffset={s.off}
            strokeLinecap="butt" />
        ))}
      </svg>
      {center && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>{center}</div>
      )}
    </div>
  );
}

// Horizontal stacked allocation bar.
function AllocBars({ data, height = 10, radius = 5, gap = 3 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ display: 'flex', gap, width: '100%', height, borderRadius: radius, overflow: 'hidden' }}>
      {data.map((d, i) => (
        <div key={i} title={d.ticker} style={{ flex: d.value / total, background: d.color, borderRadius: radius }} />
      ))}
    </div>
  );
}

Object.assign(window, { Sparkline, AreaSpark, DonutRing, AllocBars });
