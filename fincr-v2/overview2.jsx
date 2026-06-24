/* Fincr 2.0 — Overview: the desk worksheet.
   Left: NAV + crosshair chart, allocation strip, positions ledger.
   Right rail: Guardrails (policy vs book), trigger distances, ask box. */

const F2_RANGES = {
  '1W': { n: 36, swing: 0.06, trend: 0.4, seed: 11, days: 7 },
  '1M': { n: 44, swing: 0.10, trend: 0.6, seed: 23, days: 30 },
  '6M': { n: 80, swing: 0.22, trend: 0.9, seed: 42, days: 182 },
  '1Y': { n: 110, swing: 0.30, trend: 1.0, seed: 7, days: 365 },
  'ALL': { n: 140, swing: 0.42, trend: 1.1, seed: 42, days: 910 }
};
function f2Dates(days, n) {
  const end = new Date(2026, 5, 10);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(end.getTime() - days * 86400e3 * (n - 1 - i) / (n - 1));
    out.push(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: days > 200 ? '2-digit' : undefined }).replace(',', ' ’'));
  }
  return out;
}

/* Range picker — flat text, active underlined. */
function RangeSeg2({ options, value, onChange }) {
  const t = useTheme2();
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button key={o} onClick={() => onChange(o)} style={{ fontFamily: t.mono, fontSize: 10.5, fontWeight: on ? 600 : 500, letterSpacing: '0.08em', cursor: 'pointer', padding: '4px 8px', border: 'none', borderRadius: 5, background: on ? t.press : 'transparent', color: on ? t.ink : t.faint, transition: 'all 0.13s' }}>{o}</button>);

      })}
    </div>);

}

/* ── Guardrails: policy caps measured against the live book ───────────── */
function GuardMeter({ label, detail, pct, cap }) {
  const t = useTheme2();
  const usage = pct / cap;
  const watch = usage >= 0.9;
  const c = watch ? t.amber : t.green;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink }}>{label}</span>
        <Chip2 tone={watch ? 'watch' : 'ok'}>{watch ? 'Watch' : 'OK'}</Chip2>
      </div>
      <div style={{ position: 'relative', height: 5, borderRadius: 999, background: t.press }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, usage * 100)}%`, borderRadius: 999, background: c, transition: 'width 0.7s cubic-bezier(.2,.7,.3,1)' }}></div>
        <div style={{ position: 'absolute', right: 0, top: -3, bottom: -3, width: 1.5, background: t.hairStrong }}></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11.5, color: t.dim }}>{detail}</span>
        <MonoTxt size={11} color={t.dim}><span style={{ color: c, fontWeight: 600 }}>{pct.toFixed(1)}%</span> / {cap}% cap</MonoTxt>
      </div>
    </div>);

}

function TriggerRow({ ticker, action, level, dist }) {
  const t = useTheme2();
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0', borderTop: `1px solid ${t.hair}` }}>
      <span style={{ fontFamily: t.mono, fontSize: 11, fontWeight: 600, color: t.ink, width: 42, flexShrink: 0 }}>{ticker}</span>
      <span style={{ fontSize: 12, color: t.dim, flex: 1 }}>{action} <Money size={11.5} weight={600}>{level}</Money></span>
      <MonoTxt size={11} color={t.faint}>{dist} away</MonoTxt>
    </div>);

}

function OverviewTab2({ go }) {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();
  const [range, setRange] = React.useState('1Y');
  const [hovAlloc, setHovAlloc] = React.useState(null);
  const [sort, setSort] = React.useState({ k: 'value', dir: -1 });
  const [vw, setVw] = React.useState(window.innerWidth);
  React.useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  const narrow = vw < 1220;  // rail (214px) + worksheet + right column no longer fit
  const slim = vw < 980;     // hide the 90D spark column
  const val = useCountUp2(F.totalValue, 950);

  const rc = F2_RANGES[range];
  const series = React.useMemo(() => f2Series(rc.seed, rc.n, F.totalValue, rc.swing, rc.trend), [range]);
  const dates = React.useMemo(() => f2Dates(rc.days, rc.n), [range]);

  const cryptoPct = F.cryptoValue / F.totalValue * 100;
  const top = [...F.holdings].sort((a, b) => b.value - a.value)[0];
  // Guard the empty book: with no holdings (no-key load, or the initial render
  // before GET /holdings hydrates), top is undefined — top.value would throw and
  // crash OverviewTab2 (no error boundary). Fall back to 0.
  const topPct = F.totalValue > 0 ? (top?.value ?? 0) / F.totalValue * 100 : 0;

  const sorted = React.useMemo(() => {
    const arr = [...F.holdings];
    const get = { asset: (h) => h.ticker, price: (h) => h.price, day: (h) => h.dayPct, value: (h) => h.value, weight: (h) => h.value, pnl: (h) => h.pnlPct }[sort.k];
    arr.sort((a, b) => (get(a) > get(b) ? 1 : -1) * sort.dir);
    return arr;
  }, [sort]);
  const clickSort = (k) => setSort((s) => s.k === k ? { k, dir: -s.dir } : { k, dir: -1 });

  const cols = slim ? '1.7fr 0.95fr 0.85fr 1.05fr 0.75fr 1fr' : '1.7fr 0.95fr 0.85fr 1.05fr 0.75fr 1fr 116px';
  const Th = ({ k, children, align }) =>
  <button onClick={() => clickSort(k)} style={{ fontFamily: t.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: sort.k === k ? t.ink : t.faint, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: align || 'right', display: 'flex', alignItems: 'center', gap: 4, justifyContent: align === 'left' ? 'flex-start' : 'flex-end' }}>
      {children}{sort.k === k && <Tri up={sort.dir === 1} size={6} color={t.dim} />}
    </button>;

  const fmtPrice = (p) => '€' + p.toLocaleString('en-US', { minimumFractionDigits: p < 1000 ? 2 : 0, maximumFractionDigits: p < 1000 ? 2 : 0 });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1fr) 324px', gap: narrow ? 18 : 36, alignItems: 'start' }}>
      {/* ── Left: the worksheet ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

        <Card2 pad="22px 26px 20px">
          <SecHead n="01" right={<RangeSeg2 options={Object.keys(F2_RANGES)} value={range} onChange={setRange} />}>Net asset value</SecHead>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', margin: '18px 0 6px' }}>
            <div>
              <Money size={52} weight={500} style={{ letterSpacing: '-0.04em', lineHeight: 1, display: 'block' }}>{F.eur(val)}</Money>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 12 }}>
                <Delta2 pct={F.dayChangePct} value={F.dayChange} size={12.5} />
                <span style={{ width: 1, height: 12, background: t.hair }}></span>
                <Delta2 pct={F.totalPnlPct} value={F.totalPnl} size={12.5} />
                <MonoTxt size={10.5} color={t.faint}>SINCE INCEPTION</MonoTxt>
              </div>
            </div>
            <div style={{ textAlign: 'right', paddingBottom: 2 }}>
              <MonoTxt size={10.5} color={t.faint} style={{ display: 'block', letterSpacing: '0.1em' }}>COST BASIS</MonoTxt>
              <Money size={14} weight={600} color={t.dim}>{F.eur(F.totalCost)}</Money>
            </div>
          </div>
          <HoverChart key={range} series={series} dates={dates} h={188} cost={range === 'ALL' || range === '1Y' ? F.totalCost : null} id={'nav' + range} />
        </Card2>

        <Card2 pad="22px 26px 20px">
          <SecHead n="02" right={<MonoTxt size={10.5} color={t.faint}>EQUITIES {Math.round(F.stocksValue / F.totalValue * 100)} · CRYPTO {Math.round(cryptoPct)}</MonoTxt>}>Allocation</SecHead>
          <div style={{ display: 'flex', alignItems: 'center', gap: 30, marginTop: 18 }}>
            <DonutRing data={F.holdings} size={122} thickness={14} track={t.press}
              center={<><MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>VALUE</MonoTxt>
                <Money size={16} weight={600} style={{ marginTop: 2 }}>{F.eur(F.totalValue / 1000, 0)}k</Money></>} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {F.holdings.map((h) =>
              <div key={h.ticker} onMouseEnter={() => setHovAlloc(h.ticker)} onMouseLeave={() => setHovAlloc(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: hovAlloc && hovAlloc !== h.ticker ? 0.35 : 1, transition: 'opacity 0.15s', cursor: 'default' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: h.color, flexShrink: 0 }}></span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink, width: 46 }}>{h.ticker}</span>
                  <div style={{ flex: 1, height: 4, borderRadius: 999, background: t.press, overflow: 'hidden' }}>
                    <div style={{ width: `${h.value / F.totalValue * 100}%`, height: '100%', background: h.color, borderRadius: 999 }}></div>
                  </div>
                  <MonoTxt size={11} color={t.dim} style={{ width: 44, textAlign: 'right' }}>{(h.value / F.totalValue * 100).toFixed(1)}%</MonoTxt>
                </div>
              )}
            </div>
          </div>
        </Card2>

        <Card2 pad="22px 26px 14px">
          <SecHead n="03" right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><LiveDot2 /><MonoTxt size={10.5} color={t.faint}>LIVE · {F.holdings.length} POSITIONS</MonoTxt></span><Btn2 onClick={store.actions.openAdd} style={{ padding: '5px 11px', fontSize: 11.5 }}>+ Add</Btn2></span>}>Positions</SecHead>
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '10px 8px', alignItems: 'center' }}>
              <Th k="asset" align="left">Asset</Th><Th k="price">Price</Th><Th k="day">Day</Th><Th k="value">Value</Th><Th k="weight">Weight</Th><Th k="pnl">P&L</Th>
              {!slim && <span style={{ fontFamily: t.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.faint, textAlign: 'right' }}>90D</span>}
            </div>
            {sorted.map((h) => {
              const up = h.pnlPct >= 0;
              return (
                <div key={h.ticker} onClick={() => store.actions.openDrawer(h.ticker)} className="f2-row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: `${t.rowPadY}px 8px`, alignItems: 'center', borderTop: `1px solid ${t.hair}`, borderRadius: 6, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 3, height: 26, borderRadius: 2, background: h.color, flexShrink: 0 }}></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, lineHeight: 1.2 }}>{h.ticker}</div>
                      <div style={{ fontSize: 11, color: t.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</div>
                    </div>
                  </div>
                  <Money size={12.5} style={{ textAlign: 'right' }}>{fmtPrice(h.price)}</Money>
                  <span style={{ textAlign: 'right' }}><Delta2 pct={h.dayPct} size={11.5} /></span>
                  <span style={{ textAlign: 'right' }}>
                    <Money size={12.5} weight={600} style={{ display: 'block' }}>{F.eur(h.value)}</Money>
                    <MonoTxt size={10} color={t.faint}>{h.qty} units</MonoTxt>
                  </span>
                  <Money size={12} color={t.dim} style={{ textAlign: 'right' }}>{(h.value / F.totalValue * 100).toFixed(1)}%</Money>
                  <span style={{ textAlign: 'right' }}><Delta2 pct={h.pnlPct} size={11.5} /></span>
                  {!slim && <span style={{ display: 'flex', justifyContent: 'flex-end' }}><Sparkline seed={h.seed} trend={up ? 1 : -1} color={up ? t.green : t.red} w={104} h={26} sw={1.4} opacity={0.85} /></span>}
                </div>);

            })}
            {/* accounting totals: single rule above, double rule below */}
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '12px 8px', alignItems: 'baseline', borderTop: `1px solid ${t.hairStrong}`, borderBottom: `3px double ${t.hairStrong}` }}>
              <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.14em' }}>TOTAL</MonoTxt>
              <span></span>
              <span style={{ textAlign: 'right' }}><Delta2 pct={F.dayChangePct} size={11.5} /></span>
              <Money size={13} weight={700} style={{ textAlign: 'right' }}>{F.eur(F.totalValue)}</Money>
              <Money size={12} color={t.dim} style={{ textAlign: 'right' }}>100%</Money>
              <span style={{ textAlign: 'right' }}><Delta2 pct={F.totalPnlPct} size={11.5} /></span>
              {!slim && <span></span>}
            </div>
          </div>
        </Card2>
      </div>

        <DepositsSection2 />

      {/* ── Right rail ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: narrow ? 'static' : 'sticky', top: 76 }}>
        <GuardrailsCard2 />

        <LiquidityCard2 />

        <Card2 pad="18px 20px 14px">
          <SecHead n="06" style={{ marginBottom: 4 }}>Trigger distance</SecHead>
          <TriggerRow ticker="NVDA" action="Trim 25% above" level="€1,300" dist="+22.9%" />
          <TriggerRow ticker="BTC" action="Take 20% off above" level="€110k" dist="+27.3%" />
          <TriggerRow ticker="ETH" action="Add below" level="€2,200" dist="−12.9%" />
          <div style={{ borderTop: `1px solid ${t.hair}`, paddingTop: 10 }}>
            <MonoTxt size={10} color={t.faint}>FROM YOUR THESIS · NEAREST FIRST</MonoTxt>
          </div>
        </Card2>

        <Card2 pad="18px 20px 16px">
          <SecHead n="07" style={{ marginBottom: 14 }}>Ask Fincr</SecHead>
          <button onClick={() => go('agent')} className="f2-press" style={{ width: '100%', textAlign: 'left', fontFamily: t.mono, fontSize: 11.5, color: t.faint, background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 9, padding: '11px 13px', cursor: 'text', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            Why is my day P&L positive?
            <Kbd2>⌘K</Kbd2>
          </button>
          <div style={{ fontSize: 11.5, color: t.faint, marginTop: 9, lineHeight: 1.5 }}>The agent answers with your thesis, rules and cost basis in context.</div>
        </Card2>
      </div>
    </div>);

}
window.OverviewTab2 = OverviewTab2;