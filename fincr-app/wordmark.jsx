/* Fincr — in-app / website wordmark. The written-out "Fincr" (real DOM text so
   it renders in the exact dashboard font) with the candlestick + dotted-trend
   motif from the brand mark woven in as a twist. Theme-aware.
   The full tile logo is reserved for app-icon / marketing use.
   Exports FincrWordmark to window. */
function FincrWordmark({ height = 30, color = 'currentColor', accent = '#5481D4', compact = false }) {
  const uid = (React.useId ? React.useId() : 'fw').replace(/:/g, '');
  const fs = height * 0.92;
  // motif viewBox 0 0 44 40 — dot (period) + dotted trend weaving up + rising candles
  const candles = [
    [10, 21, 9, 17, 33, '#2E4A7C'],
    [18, 16, 10, 12, 29, '#3D6FD6'],
    [26, 11, 10, 7, 24, '#4C8BF5'],
    [34, 6, 10, 2, 19, '#6BA6F7'],
  ];
  const mW = (height / 40) * 44;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: height * 0.08 }} aria-label="Fincr">
      {!compact && <span style={{ fontFamily: 'inherit', fontWeight: 800, fontSize: fs, letterSpacing: '-0.03em', lineHeight: 1, color }}>Fincr</span>}
      <svg width={mW} height={height} viewBox="0 0 44 40" style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}>
        <defs>
          <linearGradient id={uid + 'tl'} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={accent} stopOpacity="0.5" />
            <stop offset="1" stopColor="#6BA6F7" />
          </linearGradient>
        </defs>
        {/* brand accent dot — reads as the period right after the wordmark */}
        <circle cx="4" cy="28.5" r="2.7" fill={accent} />
        {/* dotted trend line weaving up through the candlesticks */}
        <path d="M5 27 Q 18 25 26 17 T 39 5" fill="none" stroke={`url(#${uid}tl)`} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="0.2 3.4" />
        {/* rising candlesticks */}
        {candles.map((c, i) => (
          <g key={i}>
            <line x1={c[0] + 2} y1={c[3]} x2={c[0] + 2} y2={c[4]} stroke={c[5]} strokeWidth="1.1" />
            <rect x={c[0]} y={c[1]} width="4" height={c[2]} rx="1" fill={c[5]} />
          </g>
        ))}
      </svg>
    </div>
  );
}
window.FincrWordmark = FincrWordmark;
