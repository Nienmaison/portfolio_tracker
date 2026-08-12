/* Fincr 2.0 — "Desk" theme tokens. Two surfaces: Ink (dark) and Paper (light).
   Flat, hairline-ruled, no glass. Exposes window.makeTheme2 + window.Theme2Ctx. */
(function () {
  window.makeTheme2 = function (mode, density) {
    const dark = mode !== 'paper';
    const compact = density === 'compact';
    return {
      mode, dark, density,
      sans: "'Hanken Grotesk', -apple-system, sans-serif",
      mono: "'Spline Sans Mono', 'SF Mono', Menlo, monospace",

      page: dark ? '#0C1120' : '#F2F3F5',
      wash: dark
        ? 'linear-gradient(96deg, rgba(110,150,238,0.14) 0%, rgba(72,106,202,0.08) 22%, rgba(28,44,104,0.05) 46%, transparent 68%),'
          + 'radial-gradient(760px 540px at 92% 6%, rgba(80,110,200,0.10), transparent 62%),'
          + 'radial-gradient(820px 640px at 55% 114%, rgba(48,78,168,0.10), transparent 60%)'
        : 'linear-gradient(96deg, rgba(108,148,232,0.17) 0%, rgba(108,148,232,0.08) 24%, transparent 56%),'
          + 'radial-gradient(720px 540px at 92% 8%, rgba(99,130,200,0.10), transparent 60%)',
      raise: dark ? '#171B24' : '#FCFBF8',
      sunk: dark ? '#0B0D12' : '#EFEDE8',
      card: dark ? 'rgba(26,30,41,0.55)' : 'rgba(255,255,255,0.64)',
      cardBorder: dark ? 'rgba(233,234,236,0.085)' : 'rgba(25,22,36,0.07)',
      // panelMuted (C2-D166) — a quieter surface than `card`, one step down.
      // Both values are `raise` (this file's own base surface color, line 19)
      // at low alpha, not independent estimates: dark is `#171B24` (=raise
      // dark) at 32% — the exact value the approved design mock specified for
      // its `.spanel` background, confirmed to be `raise`-derived rather than
      // an arbitrary rgba(); light is `#FCFBF8` (=raise light) at 42%, the
      // same "raise-at-low-alpha" logic applied to the Paper side by Claude
      // Design, since the mock itself is dark-only and never specified a
      // light value. Introduced to replace C2-D164's `t.card` stand-in
      // (0.55/0.64 opacity — materially higher than the mock's 0.32, flagged
      // as an approximation at the time) once the owner asked for pixel
      // fidelity to the mock instead. Currently has exactly one consumer
      // (positions2.jsx's three triage panels) — not a general-purpose token
      // yet, though nothing stops it becoming one.
      panelMuted: dark ? 'rgba(23,27,36,0.32)' : 'rgba(252,251,248,0.42)',
      cardShadow: dark
        ? '0 1px 0 rgba(255,255,255,0.035) inset, 0 22px 54px -32px rgba(0,0,0,0.8)'
        : '0 1px 0 rgba(255,255,255,0.7) inset, 0 16px 42px -28px rgba(40,34,48,0.28)',
      blur: 'blur(18px)',
      barBg: dark ? 'rgba(12,17,32,0.74)' : 'rgba(242,243,245,0.8)',

      /* Sidebar — the lightest point of one continuous blue→navy sweep that
         carries on into the page wash (rail glows, canvas fades to navy) */
      railGrad: dark
        ? 'linear-gradient(168deg, rgba(132,170,248,0.40) 0%, rgba(94,132,228,0.28) 42%, rgba(54,82,172,0.26) 100%)'
        : 'linear-gradient(168deg, rgba(128,164,242,0.97) 0%, rgba(94,128,220,0.96) 48%, rgba(66,96,192,0.97) 100%)',
      railInk: 'rgba(255,255,255,0.96)',
      railDim: 'rgba(255,255,255,0.62)',
      railFaint: 'rgba(255,255,255,0.4)',
      railHover: 'rgba(255,255,255,0.09)',
      railActive: 'rgba(255,255,255,0.16)',
      railBorder: 'rgba(255,255,255,0.1)',
      ink: dark ? '#E9EAEC' : '#17191E',
      dim: dark ? 'rgba(233,234,236,0.58)' : 'rgba(23,25,30,0.60)',
      faint: dark ? 'rgba(233,234,236,0.36)' : 'rgba(23,25,30,0.40)',
      ghost: dark ? 'rgba(233,234,236,0.22)' : 'rgba(23,25,30,0.26)',

      hair: dark ? 'rgba(233,234,236,0.09)' : 'rgba(23,25,30,0.11)',
      hairStrong: dark ? 'rgba(233,234,236,0.22)' : 'rgba(23,25,30,0.30)',
      hover: dark ? 'rgba(233,234,236,0.045)' : 'rgba(23,25,30,0.035)',
      press: dark ? 'rgba(233,234,236,0.08)' : 'rgba(23,25,30,0.06)',

      accent: dark ? '#5E94F0' : '#2F62CE',
      accentSoft: dark ? 'rgba(94,148,240,0.14)' : 'rgba(47,98,206,0.10)',
      green: dark ? '#3FB77F' : '#15794F',
      greenSoft: dark ? 'rgba(63,183,127,0.13)' : 'rgba(21,121,79,0.10)',
      red: dark ? '#E2615C' : '#BC413C',
      redSoft: dark ? 'rgba(226,97,92,0.13)' : 'rgba(188,65,60,0.10)',
      amber: dark ? '#D9A23F' : '#8F6512',
      amberSoft: dark ? 'rgba(217,162,63,0.14)' : 'rgba(143,101,18,0.11)',

      inputBg: dark ? 'rgba(233,234,236,0.05)' : 'rgba(255,255,255,0.9)',
      inputBorder: dark ? 'rgba(233,234,236,0.14)' : 'rgba(23,25,30,0.18)',

      rowPadY: compact ? 7 : 11,
      pad: compact ? 18 : 24,

      // C2-D138 — promoted from the "glass" design handoff's G2.plate/G2.inner
      // recipes (agentglass2.jsx prototype). Style-object tokens (not single
      // CSS-value strings like cardShadow/railGrad above) so a consumer spreads
      // them directly: style={{...t.g2Plate, ...}}. Kept flat as two more
      // top-level keys — the token file has no category structure to fit into.
      g2Plate: {
        background: dark ? 'rgba(28,34,52,0.42)' : 'rgba(255,255,255,0.52)',
        border: '1px solid ' + (dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.70)'),
        backdropFilter: 'blur(26px) saturate(150%)',
        WebkitBackdropFilter: 'blur(26px) saturate(150%)',
        boxShadow: dark
          ? '0 1px 0 rgba(255,255,255,0.07) inset, 0 30px 70px -34px rgba(0,0,0,0.85)'
          : '0 1px 0 rgba(255,255,255,0.90) inset, 0 26px 60px -34px rgba(40,44,60,0.35)',
      },
      g2Inner: {
        background: dark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.60)',
        border: '1px solid ' + (dark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.85)'),
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      },
    };
  };
  window.Theme2Ctx = React.createContext(window.makeTheme2('ink', 'comfortable'));
})();
