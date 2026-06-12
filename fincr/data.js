/* Fincr — shared sample portfolio data + sparkline geometry.
   Pure JS (no JSX). Attaches everything to window.FINCR. */
(function () {
  // ── Holdings (EUR). Values chosen to sum cleanly. ───────────────────────────
  const holdings = [
    { ticker: 'NVDA', name: 'Nvidia',            type: 'stock',  qty: 40,   price: 1057.75, value: 42310, pnlPct: 38.2,  dayPct: 2.1,  color: '#5481D4', seed: 7 },
    { ticker: 'BTC',  name: 'Bitcoin',           type: 'crypto', qty: 0.45, price: 86444,   value: 38900, pnlPct: 61.0,  dayPct: 1.4,  color: '#5E7DA8', seed: 3 },
    { ticker: 'ETH',  name: 'Ethereum',          type: 'crypto', qty: 6.2,  price: 2526.6,  value: 15665, pnlPct: -3.2,  dayPct: -0.8, color: '#8B9EC9', seed: 11 },
    { ticker: 'VOO',  name: 'Vanguard S&P 500',  type: 'stock',  qty: 25,   price: 528.20,  value: 13205, pnlPct: 9.1,   dayPct: 0.3,  color: '#3D6B9E', seed: 5 },
    { ticker: 'AAPL', name: 'Apple',             type: 'stock',  qty: 60,   price: 199.00,  value: 11940, pnlPct: 12.4,  dayPct: 0.6,  color: '#A6B3CC', seed: 9 },
    { ticker: 'ASML', name: 'ASML Holding',      type: 'stock',  qty: 8,    price: 802.50,  value: 6420,  pnlPct: 4.7,   dayPct: -0.4, color: '#2E5480', seed: 13 },
  ];

  const totalValue = holdings.reduce((s, h) => s + h.value, 0);          // 128,440
  const totalCost = holdings.reduce((s, h) => s + h.value / (1 + h.pnlPct / 100), 0);
  const totalPnl = totalValue - totalCost;                               // ~28,622
  const totalPnlPct = (totalPnl / totalCost) * 100;                      // ~28.7
  const dayChange = 842;
  const dayChangePct = 0.66;
  const stocksValue = holdings.filter(h => h.type === 'stock').reduce((s, h) => s + h.value, 0);
  const cryptoValue = holdings.filter(h => h.type === 'crypto').reduce((s, h) => s + h.value, 0);

  // ── Deterministic random walk → sparkline geometry ─────────────────────────
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Returns {pts:[{x,y}], path, area, first, last, up} normalised to w×h with pad.
  function spark(seed, trend, n, w, h, pad) {
    n = n || 36; w = w || 100; h = h || 28; pad = pad == null ? 2 : pad;
    const rnd = mulberry((seed || 1) * 2654435761);
    const vals = [];
    let v = 0.5;
    for (let i = 0; i < n; i++) {
      const drift = (trend || 0) * 0.014;
      v += (rnd() - 0.5) * 0.16 + drift;
      v = Math.max(0.04, Math.min(0.96, v));
      vals.push(v);
    }
    const min = Math.min(...vals), max = Math.max(...vals), rng = (max - min) || 1;
    const pts = vals.map((val, i) => ({
      x: pad + (i / (n - 1)) * (w - pad * 2),
      y: pad + (1 - (val - min) / rng) * (h - pad * 2),
    }));
    const path = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join(' ');
    const area = path + ` L ${pts[pts.length - 1].x.toFixed(2)} ${h} L ${pts[0].x.toFixed(2)} ${h} Z`;
    return { pts, path, area, first: vals[0], last: vals[n - 1], up: (trend || 0) >= 0 };
  }

  // ── Formatting helpers ──────────────────────────────────────────────────────
  const eur = (n, dp) => '€' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dp == null ? 0 : dp, maximumFractionDigits: dp == null ? 0 : dp });
  const pct = (n) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1) + '%';
  const signed = (n) => (n >= 0 ? '+' : '−') + eur(Math.abs(n));

  window.FINCR = {
    holdings, totalValue, totalCost, totalPnl, totalPnlPct,
    dayChange, dayChangePct, stocksValue, cryptoValue,
    spark, eur, pct, signed,
  };
})();
