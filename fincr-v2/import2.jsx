/* Fincr 2.0 — Add assets: multi-broker CSV pooling flow (ported from v1
   Import tab). Drop CSVs from any broker, pool transactions, review net
   positions, import. */

function ImportTab2() {
  const t = useTheme2();
  const F = window.FINCR;
  const [files, setFiles] = React.useState([
    { name: 'bitvavo_2024.csv', broker: 'Bitvavo', rows: 142, type: 'Crypto' },
    { name: 'degiro_transactions.csv', broker: 'DEGIRO', rows: 38, type: 'Stocks' },
  ]);
  const preview = [
    { ticker: 'NVDA', type: 'stock', qty: 40, avg: 765, buys: 6, sells: 1, on: true },
    { ticker: 'BTC', type: 'crypto', qty: 0.45, avg: 53690, buys: 11, sells: 3, on: true },
    { ticker: 'ETH', type: 'crypto', qty: 6.2, avg: 2610, buys: 8, sells: 2, on: true },
    { ticker: 'VOO', type: 'stock', qty: 25, avg: 484, buys: 4, sells: 0, on: true },
    { ticker: 'DOGE', type: 'crypto', qty: 0, avg: 0, buys: 3, sells: 3, on: false },
  ];
  const [sel, setSel] = React.useState(preview.map((p) => p.on));
  const pvCols = '1.4fr 1fr 1fr 0.7fr 0.7fr 0.7fr';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 860 }}>
      <Card2 pad="22px 26px 24px">
        <SecHead n="01" style={{ marginBottom: 14 }}>Upload from any broker</SecHead>
        <p style={{ fontSize: 13, color: t.dim, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 640 }}>
          Drop CSVs from multiple brokers at once. Fincr pools every transaction before calculating —
          a sell on one broker correctly cancels a buy on another. Works with Bitvavo, DEGIRO,
          Trading 212 and any other broker export.
        </p>
        <div style={{ border: `1.5px dashed ${t.inputBorder}`, borderRadius: 14, padding: '32px 24px', textAlign: 'center', background: t.hover }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${t.accent}, #3461C9)`, margin: '0 auto 13px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 24px -10px rgba(76,139,245,0.6)' }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"></path></svg>
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: t.ink, marginBottom: 4 }}>Drop CSV files here</div>
          <div style={{ fontSize: 12.5, color: t.dim }}>or <span style={{ color: t.accent, fontWeight: 600, cursor: 'pointer' }}>browse</span> · multiple files supported</div>
        </div>
      </Card2>

      <Card2 pad="22px 26px 22px">
        <SecHead n="02" right={
          <button onClick={() => setFiles([])} style={{ border: 'none', background: 'transparent', color: t.faint, fontSize: 12, cursor: 'pointer', fontFamily: t.sans }}>Clear all</button>
        } style={{ marginBottom: 14 }}>Loaded files · {files.length}</SecHead>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {files.length === 0 && <div style={{ fontSize: 12.5, color: t.faint, fontFamily: t.mono, padding: '8px 0 14px' }}>No files loaded yet.</div>}
          {files.map((f) => (
            <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderTop: `1px solid ${t.hair}` }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.hair}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.accent, flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M4 1.5h5l3 3v10h-8z"></path><path d="M9 1.5v3h3"></path></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <MonoTxt size={12} color={t.ink} style={{ fontWeight: 600, display: 'block' }}>{f.name}</MonoTxt>
                <div style={{ fontSize: 11.5, color: t.faint, marginTop: 1 }}>{f.broker} · {f.rows} transactions · {f.type}</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LiveDot2 /><MonoTxt size={10} color={t.green} style={{ letterSpacing: '0.1em' }}>PARSED</MonoTxt></span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${t.hair}`, paddingTop: 14 }}>
            <Btn2 primary>Calculate net positions across all files →</Btn2>
          </div>
        </div>
      </Card2>

      <Card2 pad="22px 26px 18px">
        <SecHead n="03" right={<MonoTxt size={10} color={t.faint}>CROSS-BROKER SELLS APPLIED</MonoTxt>} style={{ marginBottom: 4 }}>Net positions preview</SecHead>
        <div style={{ display: 'grid', gridTemplateColumns: pvCols, gap: 12, padding: '12px 4px 8px' }}>
          {['Ticker', 'Net qty', 'Avg buy', 'Buys', 'Sells', 'Import'].map((c, i) => (
            <span key={c} style={{ fontFamily: t.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.faint, textAlign: i === 0 ? 'left' : i === 5 ? 'center' : 'right' }}>{c}</span>
          ))}
        </div>
        {preview.map((p, i) => {
          const dead = p.qty === 0;
          return (
            <div key={p.ticker} className="f2-row" style={{ display: 'grid', gridTemplateColumns: pvCols, gap: 12, alignItems: 'center', padding: `${t.rowPadY}px 4px`, borderTop: `1px solid ${t.hair}`, opacity: dead ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: t.ink }}>{p.ticker}</span>
                <Chip2 tone={p.type === 'crypto' ? 'accent' : 'mute'}>{p.type}</Chip2>
                {dead && <span style={{ fontSize: 11, color: t.faint }}>fully sold</span>}
              </div>
              <Money size={12.5} style={{ textAlign: 'right' }}>{p.qty || '—'}</Money>
              <Money size={12.5} color={t.dim} style={{ textAlign: 'right' }}>{p.avg ? F.eur(p.avg) : '—'}</Money>
              <Money size={12} color={t.green} style={{ textAlign: 'right' }}>{p.buys}</Money>
              <Money size={12} color={t.red} style={{ textAlign: 'right' }}>{p.sells}</Money>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button onClick={() => setSel((s) => s.map((v, j) => j === i ? !v : v))} disabled={dead}
                  style={{ width: 19, height: 19, borderRadius: 5, border: `1.5px solid ${sel[i] && !dead ? t.green : t.inputBorder}`, background: sel[i] && !dead ? t.green : 'transparent', cursor: dead ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  {sel[i] && !dead && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={t.dark ? '#0A0B0D' : '#fff'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5"></path></svg>}
                </button>
              </div>
            </div>
          );
        })}
        <div style={{ borderTop: `1px solid ${t.hairStrong}`, paddingTop: 14, marginTop: 2, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Btn2 primary>Import {sel.filter(Boolean).length} selected</Btn2>
          <span style={{ fontSize: 12, color: t.faint }}>Existing positions are merged, not duplicated.</span>
        </div>
      </Card2>
    </div>
  );
}
window.ImportTab2 = ImportTab2;
