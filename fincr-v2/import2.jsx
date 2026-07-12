/* Fincr 2.0 — Add assets: multi-broker CSV import (P1 Task 2, [C2-D34]).
   Net-position snapshot reconciliation: parse CSV file(s) from any broker,
   extract atomic transactions, net buys/sells/staking per ticker, preview,
   then import the selected net positions into the store.

   Strategy (decisions.md [C2-D34..D38]):
   - Net-position snapshot, not full-ledger replay. Each ticker becomes ONE
     synthetic buy (qty = netQty, price = DCA) via addPosition()/addTxn().
   - Staking adds quantity at €0, lowering DCA. In net-position mode it is
     folded into the single net buy — never emitted as a standalone 'staking'
     txn (f2DeriveHolding treats any non-'buy' kind as a sell). This realises
     [C2-D35]'s intent: staking adds qty and lowers cost basis, never subtracts.
   - Fully-sold tickers (netQty <= 1e-6) are dropped ([C2-D36] — realized P&L
     deferred to Cycle 2).
   - CSV date used when present, else today; never synthesise fake history
     ([C2-D37]).
   - Broker auto-detected by header substring; unknown brokers fall back to a
     manual column mapper ([C2-D38]).

   Store contracts (verified against store2.jsx):
   - actions.addPosition({ ticker, name, type, price, color, qty, buyPrice, date })
       creates a holding (or appends a buy if the ticker already exists). When
       `color` is omitted the store assigns the next palette colour.
   - actions.addTxn(ticker, { kind, date, qty, price })
       appends a txn to an EXISTING holding (no-op if the ticker is unknown —
       so we always check store.holdings first and route new tickers to
       addPosition).
   Live prices: GET /crypto-prices?tickers= (batch) and /stock-price?ticker=
   are public (no key) and return EUR — same endpoints store2 Phase 3 uses. */

/* Pure parsing + netting. No React / window / DOM dependency — this block is
   unit-tested directly in V8 (see importcheck.py). */
/* @@PURE_START */

/* CSV line splitter that respects double-quoted fields (commas inside quotes
   are not delimiters). Mirrors v1's parser. */
function f2ParseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/* Split raw CSV text into { headers, rows }. Tolerates \r\n and blank lines. */
function f2ParseCsv(text) {
  const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  return { headers: f2ParseCsvLine(lines[0]), rows: lines.slice(1).map(f2ParseCsvLine) };
}

/* Numeric parser: strips a leading 3-letter currency code ("EUR 12,30"), drops
   any other non-numeric symbols (€, $, spaces), and normalises the decimal
   separator. If both ',' and '.' appear the LAST one is the decimal and the
   other is treated as a thousands separator (handles "1.234,56" and
   "1,234.56"). A lone ',' is a decimal comma (European). Returns 0 on failure.
   Generalises v1's stripCurrency + the spec §3/§9 decimal rule. */
function f2ToNumber(s) {
  let v = String(s == null ? '' : s).trim();
  v = v.replace(/^[A-Za-z]{3}\s+/, '');     // leading currency code + space
  v = v.replace(/[^0-9.,\-]/g, '');         // strip €, $, spaces, letters
  if (v.indexOf(',') >= 0 && v.indexOf('.') >= 0) {
    if (v.lastIndexOf(',') > v.lastIndexOf('.')) v = v.replace(/\./g, '').replace(',', '.');
    else v = v.replace(/,/g, '');
  } else if (v.indexOf(',') >= 0) {
    v = v.replace(',', '.');
  }
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/* Ticker normaliser. Upper-cases, strips a SPACE-separated leading fiat prefix
   ("EUR NEAR" -> "NEAR", "USD BTC" -> "BTC"), then removes any remaining
   whitespace. Deliberately keyed on the space so a legitimate ticker like
   "EURN" is never truncated — a small, intent-preserving refinement of the
   spec's literal strip order (see BUILD_NOTES). This is the Run-6 footgun
   surface: a company-name column mapped to ticker yields garbage; the preview
   validates and flags it. */
function f2NormalizeTicker(raw) {
  let tk = String(raw == null ? '' : raw).toUpperCase().trim();
  tk = tk.replace(/^(EUR|USD)\s+/, '');
  tk = tk.replace(/\s+/g, '');
  return tk;
}

/* Best-effort date parser. Accepts ISO (yyyy-mm-dd[...]), European dd-mm-yyyy /
   dd/mm/yyyy, else falls back to the engine's Date(). Returns 'yyyy-mm-dd' or
   null when unparseable (caller then defaults to today — [C2-D37], never a
   fabricated historical date). */
function f2ParseDate(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function f2Today() { return new Date().toISOString().slice(0, 10); }

/* Stock tickers must look like real symbols; crypto is always accepted (its
   symbols are free-form). Same regex as api.py /stock-price + v1 preview. */
function f2ValidTicker(ticker, type) {
  if (type === 'crypto') return true;
  return /^[A-Z0-9]{1,5}(\.[A-Z]{1,3})?$/.test(ticker);
}

/* ── Broker auto-detection profiles ───────────────────────────────────────
   ORDER MATTERS: Trading 212 exports also contain an ISIN column, so it must
   be tested before DEGIRO (which detects on 'isin') or a 212 file would be
   misread as DEGIRO. Column accessors return a header index (-1 = absent). */
const F2_BROKER_PROFILES = [
  {
    key: 'bitvavo', label: 'Bitvavo', assetType: 'crypto',
    detect: (h) => h.some((c) => c.toLowerCase().includes('quote price')),
    ticker: (h) => h.findIndex((c) => c.toLowerCase() === 'currency'),
    qty: (h) => h.findIndex((c) => c.toLowerCase() === 'amount'),
    price: (h) => h.findIndex((c) => c.toLowerCase().includes('quote price')),
    type: (h) => h.findIndex((c) => c.toLowerCase() === 'type'),
    date: (h) => h.findIndex((c) => c.toLowerCase() === 'date'),
    status: (h) => h.findIndex((c) => c.toLowerCase() === 'status'),
    buyVal: 'buy', sellVal: 'sell', stakeVal: 'staking',
    skipTypes: ['deposit', 'withdrawal'], skipTickers: ['EUR', 'USD'],
    statusOk: ['completed', 'distributed'],
  },
  {
    key: 'trading212', label: 'Trading 212', assetType: 'stock',
    detect: (h) => h.some((c) => c.toLowerCase().includes('no. of shares')),
    ticker: (h) => h.findIndex((c) => c.toLowerCase() === 'ticker'),
    qty: (h) => h.findIndex((c) => c.toLowerCase().includes('no. of shares')),
    price: (h) => h.findIndex((c) => c.toLowerCase().includes('price / share')),
    type: (h) => h.findIndex((c) => c.toLowerCase() === 'action'),
    date: (h) => h.findIndex((c) => c.toLowerCase() === 'time'),
    buyVal: 'buy', sellVal: 'sell', stakeVal: '',
    skipTypes: [], skipTickers: [], statusOk: [],
  },
  {
    key: 'degiro', label: 'DEGIRO', assetType: 'stock',
    detect: (h) => h.some((c) => c.toLowerCase().includes('isin')),
    ticker: (h) => h.findIndex((c) => c.toLowerCase() === 'product'),
    qty: (h) => h.findIndex((c) => c.toLowerCase() === 'quantity'),
    price: (h) => h.findIndex((c) => c.toLowerCase() === 'price'),
    type: () => -1, // no type column — kind inferred from the sign of quantity
    date: (h) => h.findIndex((c) => c.toLowerCase() === 'date'),
    buyVal: '', sellVal: '', stakeVal: '',
    skipTypes: [], skipTickers: [], statusOk: [],
  },
  {
    key: 'revolut', label: 'Revolut', assetType: 'stock',
    detect: (h) => h.some((c) => c.toLowerCase().includes('price per share')),
    ticker: (h) => h.findIndex((c) => c.toLowerCase() === 'ticker'),
    qty: (h) => h.findIndex((c) => c.toLowerCase() === 'quantity'),
    price: (h) => h.findIndex((c) => c.toLowerCase().includes('price per share')),
    type: (h) => h.findIndex((c) => c.toLowerCase() === 'type'),
    date: (h) => h.findIndex((c) => c.toLowerCase() === 'date'),
    currency: (h) => h.findIndex((c) => c.toLowerCase() === 'currency'), // C2-D105
    fxRate: (h) => h.findIndex((c) => { const l = c.toLowerCase(); return l.includes('fx rate') || l === 'fx' || l.includes('exchange rate'); }), // C2-D105
    buyVal: 'buy', sellVal: 'sell', stakeVal: '',
    skipTypes: [], skipTickers: [], statusOk: [],
  },
];

/* First profile whose detector matches the header row, else null (-> manual
   mapper). */
function f2DetectBroker(headers) {
  for (let i = 0; i < F2_BROKER_PROFILES.length; i++) {
    if (F2_BROKER_PROFILES[i].detect(headers)) return F2_BROKER_PROFILES[i];
  }
  return null;
}

/* Resolve a column index from a cfg that may be an auto-profile (cfg[key] is a
   fn(headers)->idx) or a manual mapping (cfg[key+'Idx'] is a number). */
function f2ColIdx(cfg, key, headers) {
  if (typeof cfg[key] === 'function') return cfg[key](headers);
  if (typeof cfg[key + 'Idx'] === 'number' && !isNaN(cfg[key + 'Idx'])) return cfg[key + 'Idx'];
  return -1;
}

/* Resolve the kind of a row. CORRECTNESS NOTE (deviates from the spec's literal
   pseudo-code, intentionally — see BUILD_NOTES): when a type column exists the
   kind comes from the buy/sell/staking VALUES only — NOT the quantity sign.
   Bitvavo / Trading 212 / Revolut all report positive quantities on sell rows
   alongside a type column, so the spec's "|| qty > 0 => buy" clause would
   mislabel every sell as a buy and corrupt netting. The quantity sign is used
   ONLY when there is no type column (DEGIRO). This matches v1 exactly. */
function f2InferKind(typeRaw, qty, cfg, hasTypeCol) {
  if (!hasTypeCol) return qty > 0 ? 'buy' : (qty < 0 ? 'sell' : null);
  const tr = (typeRaw || '').toLowerCase();
  const buyVal = (cfg.buyVal || '').toLowerCase();
  const sellVal = (cfg.sellVal || '').toLowerCase();
  const stakeVal = (cfg.stakeVal || '').toLowerCase();
  if (stakeVal && tr.includes(stakeVal)) return 'staking';
  if (buyVal && tr.includes(buyVal)) return 'buy';
  if (sellVal && tr.includes(sellVal)) return 'sell';
  if (!buyVal && !sellVal && qty > 0) return 'buy'; // type col mapped but no buy/sell labels
  return null; // unrecognised -> skipped
}

/* Extract atomic transactions from one file given a profile or manual cfg.
   Output rows: { ticker, qty (absolute), price (unit, EUR), kind, assetType,
   date }. Skips transfers, fiat tickers, non-completed Bitvavo rows, zero-qty
   rows, and price-less buys — mirroring v1. */
function f2ExtractTransactions(headers, rows, cfg) {
  const iT = f2ColIdx(cfg, 'ticker', headers);
  const iQ = f2ColIdx(cfg, 'qty', headers);
  const iP = f2ColIdx(cfg, 'price', headers);
  const iTot = f2ColIdx(cfg, 'total', headers);
  const iTy = f2ColIdx(cfg, 'type', headers);
  const iDate = f2ColIdx(cfg, 'date', headers);
  const iStatus = f2ColIdx(cfg, 'status', headers);
  const iCur = f2ColIdx(cfg, 'currency', headers); // C2-D105 — per-row trade currency
  const iFx = f2ColIdx(cfg, 'fxRate', headers);     // C2-D105 — per-row FX rate (foreign per EUR)
  const hasTypeCol = iTy >= 0;

  const skipTypes = new Set((cfg.skipTypes || []).map((s) => String(s).toLowerCase()));
  const skipTickers = new Set((cfg.skipTickers || []).map((s) => String(s).toUpperCase()));
  const statusOk = (cfg.statusOk || []).map((s) => String(s).toLowerCase());
  const assetType = cfg.assetType || 'crypto';

  const txs = [];
  for (const row of rows) {
    const ticker = f2NormalizeTicker(iT >= 0 ? row[iT] : '');
    if (!ticker || skipTickers.has(ticker)) continue;

    // Bitvavo: only completed/distributed rows are real ownership changes.
    if (iStatus >= 0 && statusOk.length) {
      const st = String(row[iStatus] || '').trim().toLowerCase();
      if (!statusOk.includes(st)) continue;
    }

    const typeRaw = iTy >= 0 ? String(row[iTy] || '').trim().toLowerCase() : '';
    if (skipTypes.has(typeRaw)) continue; // deposit / withdrawal

    const qty = iQ >= 0 ? f2ToNumber(row[iQ]) : 0;
    const absQty = Math.abs(qty);
    if (absQty === 0) continue;

    const rawPrice = iP >= 0 ? f2ToNumber(row[iP]) : 0;
    const total = iTot >= 0 ? Math.abs(f2ToNumber(row[iTot])) : 0;
    let unitPrice = rawPrice > 0 ? rawPrice : (total > 0 ? total / absQty : 0);

    // C2-D105 — FX conversion for foreign-currency trade rows (e.g. Revolut USD).
    // Read the file's OWN Currency + FX Rate columns (more precise than a
    // reconstructed lookup). Revolut's FX Rate is foreign units per 1 EUR (e.g.
    // ~1.19 USD/EUR), so EUR price = price / fxRate. Only convert with a present,
    // sane rate; EUR rows (or no rate) pass through unchanged — no regression for
    // DEGIRO/already-EUR imports. Audit (origCurrency + fxRate) rides the row.
    let origCurrency = null, fxRate = null;
    if (iCur >= 0) {
      const cur = String(row[iCur] || '').trim().toUpperCase();
      const fx = iFx >= 0 ? f2ToNumber(row[iFx]) : 0;
      if (cur && cur !== 'EUR' && fx > 0.1 && fx < 50) {
        unitPrice = unitPrice / fx;
        origCurrency = cur;
        fxRate = fx;
      }
    }

    const kind = f2InferKind(typeRaw, qty, cfg, hasTypeCol);
    if (!kind) continue;
    // Suspicious buy with no resolvable price -> skip (v1 rule). Sells keep a
    // 0 price (price is irrelevant to net-position qty/DCA). Staking is €0.
    if (kind === 'buy' && unitPrice === 0) continue;

    const date = iDate >= 0 ? f2ParseDate(row[iDate]) : null;
    txs.push({
      ticker,
      qty: absQty,
      price: kind === 'staking' ? 0 : unitPrice,
      kind,
      assetType,
      date,
      origCurrency,
      fxRate,
    });
  }
  return txs;
}

/* Net every transaction (across ALL files) by ticker+type. Returns
   { positions, dropped }:
     positions — kept net positions, sorted by € size desc, each:
       { ticker, type, netQty, avgBuy, buyCount, sellCount, stakingQty, valid, date }
     dropped — tickers netted to <= 1e-6 (fully sold; excluded from import).
   DCA: avgBuy = Σ(buyQty·buyPrice) / (totalBought + stakingQty). Staking adds
   qty at €0, lowering DCA ([C2-D35] intent). */
function f2NetPositions(txns, todayStr) {
  const today = todayStr || f2Today();
  const groups = {};
  for (const tx of txns) {
    const key = tx.ticker + '|' + tx.assetType;
    if (!groups[key]) groups[key] = { ticker: tx.ticker, type: tx.assetType, buys: [], soldQty: 0, stakingQty: 0, sellCount: 0, dates: [] };
    const g = groups[key];
    if (tx.kind === 'buy') g.buys.push({ qty: tx.qty, price: tx.price });
    else if (tx.kind === 'sell') { g.soldQty += tx.qty; g.sellCount += 1; }
    else if (tx.kind === 'staking') g.stakingQty += tx.qty;
    if (tx.date) g.dates.push(tx.date);
    // C2-D105 — carry the FX audit (source currency + rate) onto the group; first
    // converted row wins (single-buy Revolut re-imports carry the exact rate).
    if (tx.origCurrency && !g.origCurrency) { g.origCurrency = tx.origCurrency; g.fxRate = tx.fxRate; }
  }

  const positions = [], dropped = [];
  Object.keys(groups).forEach((k) => {
    const g = groups[k];
    const totalBought = g.buys.reduce((s, b) => s + b.qty, 0);
    const netQty = totalBought + g.stakingQty - g.soldQty;
    if (netQty <= 1e-6) { dropped.push({ ticker: g.ticker, type: g.type, netQty: netQty }); return; }
    const totalCost = g.buys.reduce((s, b) => s + b.qty * b.price, 0);
    const denom = totalBought + g.stakingQty;
    const avgBuy = denom > 0 ? totalCost / denom : 0;
    const date = g.dates.length ? g.dates.slice().sort().slice(-1)[0] : today;
    positions.push({
      ticker: g.ticker, type: g.type,
      netQty: +netQty.toFixed(8), avgBuy: avgBuy,
      buyCount: g.buys.length, sellCount: g.sellCount, stakingQty: g.stakingQty,
      valid: f2ValidTicker(g.ticker, g.type), date: date,
      origCurrency: g.origCurrency || null, fxRate: g.fxRate || null, // C2-D105 audit
    });
  });
  positions.sort((a, b) => (b.netQty * b.avgBuy) - (a.netQty * a.avgBuy));
  return { positions, dropped };
}

/* @@PURE_END */


/* ============================ React component ============================ */
function ImportTab2({ go }) {
  const t = useTheme2();
  const F = window.FINCR;
  const store = useStore2();

  // Loaded & parsed files: { name, broker, rowCount, txns, headers, rows, profileKey }
  const [files, setFiles] = React.useState([]);
  // A single file awaiting manual column mapping (unknown broker).
  const [pending, setPending] = React.useState(null);
  const [mapDraft, setMapDraft] = React.useState(null);
  // Net positions after Calculate: { positions, dropped } | null
  const [calc, setCalc] = React.useState(null);
  const [sel, setSel] = React.useState([]);        // parallel to calc.positions
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null); // { imported, failed, estimated }
  const [err, setErr] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [drag, setDrag] = React.useState(false);

  const inputRef = React.useRef(null);
  const goTimer = React.useRef(null);
  React.useEffect(() => () => { if (goTimer.current) clearTimeout(goTimer.current); }, []);

  // Files dropped while the mapper is open, or queued behind an unknown-broker
  // file in a multi-file drop, wait here and are processed once the current
  // mapper resolves — nothing is ever silently discarded.
  const fileQueue = React.useRef([]);

  // Sync is disabled without an API key — imports still apply locally, they
  // just don't reach the backend until the key is set (store2 same behaviour).
  const hasKey = !!(typeof localStorage !== 'undefined' && localStorage.getItem('fincr-api-key'));

  /* ── File reading ── */
  const readFile = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve({ text: String((e.target && e.target.result) || '') });
    reader.onerror = () => resolve({ text: null, error: true });
    reader.readAsText(file);
  });

  const addFiles = async (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    // A mapper is already open — don't clobber its in-progress column choices.
    // Queue the new files; the [pending] effect drains them once it closes.
    if (pending) {
      fileQueue.current = fileQueue.current.concat(incoming);
      setErr('Finish mapping ' + pending.name + ' first — ' + incoming.length + ' more file(s) queued.');
      return;
    }
    // Accumulate every per-file problem so a multi-file batch surfaces them all
    // at once, instead of only the last setErr surviving the loop.
    const problems = [];
    const accepted = [];
    const known = new Set(files.map((f) => f.name));
    for (let i = 0; i < incoming.length; i++) {
      const file = incoming[i];
      if (!/\.csv$/i.test(file.name)) { problems.push('Skipped ' + file.name + ' — not a .csv'); continue; }
      if (known.has(file.name) || accepted.some((f) => f.name === file.name)) { problems.push('Already loaded: ' + file.name + ' (remove it to re-upload)'); continue; }
      const { text, error } = await readFile(file);
      if (error || text == null) { problems.push('Could not read ' + file.name); continue; }
      const { headers, rows } = f2ParseCsv(text);
      if (!headers.length || !rows.length) { problems.push('No rows found in ' + file.name); continue; }
      const profile = f2DetectBroker(headers);
      if (profile) {
        const txns = f2ExtractTransactions(headers, rows, profile);
        if (!txns.length) { problems.push('No valid transactions in ' + file.name + ' (all rows skipped)'); continue; }
        accepted.push({ name: file.name, broker: profile.label, rowCount: txns.length, txns: txns, headers: headers, rows: rows, profileKey: profile.key });
      } else {
        // Unknown broker — queue any files still behind this one, then open the
        // mapper. The [pending] effect resumes the queue once it resolves, so
        // trailing files are never lost.
        fileQueue.current = fileQueue.current.concat(incoming.slice(i + 1));
        openMapper({ name: file.name, headers: headers, rows: rows });
        break;
      }
    }
    if (accepted.length) {
      // Dedupe against committed state inside the updater so two near-simultaneous
      // reads (or a queue drain) can't double-add the same filename.
      setFiles((fs) => fs.concat(accepted.filter((a) => !fs.some((f) => f.name === a.name))));
      setCalc(null); setResult(null);
    }
    setErr(problems.length ? problems.join(' · ') : null);
  };

  // Resume any queued files once the manual mapper closes (applied or cancelled).
  React.useEffect(() => {
    if (!pending && fileQueue.current.length) {
      const q = fileQueue.current; fileQueue.current = [];
      addFiles(q);
    }
  }, [pending]);

  const removeFile = (i) => { setFiles((fs) => fs.filter((_, j) => j !== i)); setCalc(null); setResult(null); };
  const clearAll = () => { fileQueue.current = []; setFiles([]); setCalc(null); setSel([]); setPending(null); setMapDraft(null); setResult(null); setErr(null); };

  /* ── Manual column mapper (unknown brokers) ── */
  const openMapper = (file) => {
    setPending(file);
    setMapDraft({ ticker: '-1', qty: '-1', price: '-1', total: '-1', type: '-1', buyVal: 'buy', sellVal: 'sell', stakeVal: '', skipTypes: '', skipTickers: '', assetType: 'crypto' });
  };
  const cancelMapper = () => { setPending(null); setMapDraft(null); };
  const setMap = (k) => (v) => setMapDraft((d) => Object.assign({}, d, { [k]: v }));

  const applyMapping = () => {
    if (!pending || !mapDraft) return;
    const num = (id) => parseInt(mapDraft[id], 10);
    const cfg = {
      key: 'manual', label: 'Manual map', assetType: mapDraft.assetType,
      tickerIdx: num('ticker'), qtyIdx: num('qty'), priceIdx: num('price'), totalIdx: num('total'), typeIdx: num('type'),
      dateIdx: pending.headers.findIndex((c) => /date|time/i.test(c)),
      buyVal: mapDraft.buyVal.trim().toLowerCase(),
      sellVal: mapDraft.sellVal.trim().toLowerCase(),
      stakeVal: mapDraft.stakeVal.trim().toLowerCase(),
      skipTypes: mapDraft.skipTypes.split(',').map((s) => s.trim()).filter(Boolean),
      skipTickers: mapDraft.skipTickers.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      statusOk: [],
    };
    if (!(cfg.tickerIdx >= 0) || !(cfg.qtyIdx >= 0)) { setErr('Map at least the Ticker and Quantity columns.'); return; }
    const txns = f2ExtractTransactions(pending.headers, pending.rows, cfg);
    if (!txns.length) { setErr('No valid transactions parsed with that mapping — check the columns.'); return; }
    const added = { name: pending.name, broker: 'Manual map', rowCount: txns.length, txns: txns, headers: pending.headers, rows: pending.rows, profileKey: 'manual' };
    setFiles((fs) => fs.some((f) => f.name === added.name) ? fs : fs.concat([added]));
    setPending(null); setMapDraft(null); setCalc(null); setResult(null); setErr(null);
  };

  /* ── Calculate net positions across the whole pool ── */
  const calculate = () => {
    setErr(null); setResult(null);
    const allTxns = files.reduce((acc, f) => acc.concat(f.txns), []);
    if (!allTxns.length) { setErr('Load at least one broker CSV first.'); return; }
    const out = f2NetPositions(allTxns, f2Today());
    setCalc(out);
    setSel(out.positions.map((p) => p.valid)); // valid pre-checked, invalid off
  };

  const positions = calc ? calc.positions : [];
  const selectedCount = sel.filter(Boolean).length;
  const validCount = positions.filter((p) => p.valid).length;
  const allValidSelected = validCount > 0 && positions.every((p, i) => !p.valid || sel[i]);
  const toggleRow = (i) => setSel((s) => s.map((v, j) => (j === i ? !v : v)));
  const toggleAll = () => {
    const target = !allValidSelected;
    setSel(positions.map((p) => (p.valid ? target : false)));
  };

  /* ── Live price (EUR) for a single ticker — public endpoints, no key ── */
  const fetchLivePrice = async (ticker, type) => {
    const base = 'https://fincr.duckdns.org';
    try {
      if (type === 'crypto') {
        const r = await fetch(base + '/crypto-prices?tickers=' + encodeURIComponent(ticker));
        if (!r.ok) return null;
        const m = await r.json();
        const p = m && m[ticker.toUpperCase()];
        return typeof p === 'number' ? p : null;
      }
      const r = await fetch(base + '/stock-price?ticker=' + encodeURIComponent(ticker));
      if (!r.ok) return null;
      const d = await r.json();
      return d && typeof d.price === 'number' ? d.price : null;
    } catch (e) { return null; }
  };

  /* ── Import the selected net positions ── */
  const doImport = async () => {
    const rows = positions.filter((p, i) => sel[i] && p.valid);
    if (!rows.length) return;
    setBusy(true); setErr(null);

    // Snapshot existing positions ONCE, keyed by ticker+type (same key the
    // netting uses, and matching V1) so a same-symbol stock and crypto never
    // collide: new -> addPosition, existing -> addTxn. (The store actions still
    // match on ticker alone, so a held stock + imported crypto of the identical
    // symbol would still merge — a rare, documented limitation; this key at
    // least stops two same-symbol/different-type import rows colliding.)
    const keyOf = (x) => x.ticker + '|' + x.type;
    const existing = new Set((store.holdings || []).map(keyOf));
    const newRows = rows.filter((r) => !existing.has(keyOf(r)));

    // Fetch live prices for new positions in parallel (existing ones keep their
    // own live price; addTxn never sets price). Failures fall back to DCA.
    const priceByKey = {};
    await Promise.all(newRows.map(async (r) => { priceByKey[keyOf(r)] = await fetchLivePrice(r.ticker, r.type); }));

    // Apply synchronously so React batches every setHoldings into one render ->
    // exactly one POST /holdings sync (not one per row).
    const failed = [], estimated = [];
    const today = f2Today();
    rows.forEach((r) => {
      try {
        // C2-D105 — carry the FX audit onto the imported buy when the price was
        // converted from a foreign currency (undefined otherwise → JSON omits).
        const audit = r.origCurrency ? { original_currency: r.origCurrency, fx_rate: r.fxRate } : undefined;
        if (existing.has(keyOf(r))) {
          store.actions.addTxn(r.ticker, Object.assign({ kind: 'buy', date: r.date || today, qty: r.netQty, price: r.avgBuy }, audit || {}));
        } else {
          const live = priceByKey[keyOf(r)];
          if (live == null) estimated.push(r.ticker);
          store.actions.addPosition({
            ticker: r.ticker, name: r.ticker, type: r.type,
            qty: r.netQty, buyPrice: r.avgBuy,
            price: live != null ? live : r.avgBuy, date: r.date || today,
            audit: audit,
          });
        }
      } catch (e) {
        failed.push(r.ticker);
        if (typeof console !== 'undefined') console.warn('[import] failed for ' + r.ticker, e);
      }
    });

    const imported = rows.length - failed.length;
    setResult({ imported: imported, failed: failed, estimated: estimated });
    setToast({
      tone: failed.length ? 'watch' : 'ok',
      msg: 'Imported ' + imported + ' position' + (imported === 1 ? '' : 's') + (failed.length ? ' · ' + failed.length + ' failed' : ''),
    });
    setBusy(false);

    // Brief confirmation, then land on Overview where the updated book shows.
    if (typeof go === 'function') {
      goTimer.current = setTimeout(() => go('overview'), 1150);
    }
  };

  /* ── Render ── */
  const headerCols = ['', 'Ticker', 'Type', 'Net qty', 'Avg buy', 'Buys', 'Sells'];
  const pvCols = '28px 1.3fr 0.7fr 1fr 1fr 0.6fr 0.6fr';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 880 }}>

      {!hasKey && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: t.amber, background: t.amberSoft, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '10px 14px' }}>
          <LiveDot2 color={t.amber} />
          <span style={{ color: t.dim }}>Sync disabled — no API key on this device. Imports stay local until you authenticate.</span>
        </div>
      )}

      {err && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: t.red, background: t.redSoft, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: '10px 14px' }}>
          <span style={{ fontWeight: 700 }}>!</span><span style={{ color: t.dim }}>{err}</span>
        </div>
      )}

      {/* ── 01 · Upload ── */}
      <Card2 pad="22px 26px 24px">
        <SecHead n="01" style={{ marginBottom: 14 }}>Upload from any broker</SecHead>
        <p style={{ fontSize: 13, color: t.dim, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 640 }}>
          Drop CSV exports from any number of brokers. Fincr pools every transaction before netting — a sell on one
          broker correctly cancels a buy on another. Bitvavo, DEGIRO, Trading 212 and Revolut are detected automatically;
          anything else opens a quick column mapper.
        </p>

        <input ref={inputRef} type="file" accept=".csv,text/csv" multiple style={{ display: 'none' }}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

        <div
          onClick={() => inputRef.current && inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          style={{ border: `1.5px dashed ${drag ? t.accent : t.inputBorder}`, borderRadius: 14, padding: '32px 24px', textAlign: 'center', background: drag ? t.accentSoft : t.hover, cursor: 'pointer', transition: 'all 0.15s' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accent, margin: '0 auto 13px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 24px -10px ${t.accent}` }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"></path></svg>
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: t.ink, marginBottom: 4 }}>Drop CSV files here</div>
          <div style={{ fontSize: 12.5, color: t.dim }}>or <span style={{ color: t.accent, fontWeight: 600 }}>browse</span> · multiple files supported</div>
        </div>

        {/* Loaded files list */}
        {files.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <SecHead n="·" right={<button onClick={clearAll} style={{ border: 'none', background: 'transparent', color: t.faint, fontSize: 12, cursor: 'pointer', fontFamily: t.sans }}>Clear all</button>} style={{ marginBottom: 8 }}>Loaded files · {files.length}</SecHead>
            {files.map((f, i) => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderTop: `1px solid ${t.hair}` }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.hair}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.accent, flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M4 1.5h5l3 3v10h-8z"></path><path d="M9 1.5v3h3"></path></svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <MonoTxt size={12} color={t.ink} style={{ fontWeight: 600, display: 'block' }}>{f.name}</MonoTxt>
                  <div style={{ fontSize: 11.5, color: t.faint, marginTop: 1 }}>{f.broker} · {f.rowCount} transaction{f.rowCount === 1 ? '' : 's'}</div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LiveDot2 /><MonoTxt size={10} color={t.green} style={{ letterSpacing: '0.1em' }}>PARSED</MonoTxt></span>
                <button onClick={() => removeFile(i)} title="Remove" style={{ border: 'none', background: 'transparent', color: t.faint, cursor: 'pointer', fontSize: 12, padding: '2px 6px', fontFamily: t.sans }}>Remove</button>
              </div>
            ))}
          </div>
        )}

        {/* Manual column mapper for an unknown broker */}
        {pending && mapDraft && (
          <div style={{ marginTop: 18, border: `1px solid ${t.hairStrong}`, borderRadius: 12, padding: '16px 18px', background: t.hover }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginBottom: 2 }}>Map columns — {pending.name}</div>
            <div style={{ fontSize: 12, color: t.faint, marginBottom: 14 }}>Unrecognised broker. Tell Fincr which column is which.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['ticker', 'Ticker *'], ['qty', 'Quantity *'], ['price', 'Price / unit'], ['total', 'Total value'], ['type', 'Type / action']].map(([key, label]) => (
                <Field2 key={key} label={label}>
                  <select value={mapDraft[key]} onChange={(e) => setMap(key)(e.target.value)} style={Object.assign({}, window.f2InputStyle(t), { cursor: 'pointer' })}>
                    <option value="-1">— not mapped —</option>
                    {pending.headers.map((h, idx) => <option key={idx} value={idx}>{h || '(column ' + (idx + 1) + ')'}</option>)}
                  </select>
                </Field2>
              ))}
              <Field2 label="Asset class">
                <Seg2 options={[{ value: 'stock', label: 'Stock' }, { value: 'crypto', label: 'Crypto' }]} value={mapDraft.assetType} onChange={setMap('assetType')} />
              </Field2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
              <Field2 label="Buy value" hint="in Type col"><TextField2 value={mapDraft.buyVal} onChange={setMap('buyVal')} placeholder="buy" /></Field2>
              <Field2 label="Sell value"><TextField2 value={mapDraft.sellVal} onChange={setMap('sellVal')} placeholder="sell" /></Field2>
              <Field2 label="Staking value" hint="optional"><TextField2 value={mapDraft.stakeVal} onChange={setMap('stakeVal')} placeholder="staking" /></Field2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <Field2 label="Skip types" hint="comma-separated"><TextField2 value={mapDraft.skipTypes} onChange={setMap('skipTypes')} placeholder="deposit, withdrawal" /></Field2>
              <Field2 label="Skip tickers" hint="comma-separated"><TextField2 value={mapDraft.skipTickers} onChange={setMap('skipTickers')} placeholder="EUR, USD" /></Field2>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Btn2 primary onClick={applyMapping}>Apply mapping</Btn2>
              <Btn2 onClick={cancelMapper}>Cancel</Btn2>
            </div>
          </div>
        )}
      </Card2>

      {/* ── 02 · Net positions preview ── */}
      <Card2 pad="22px 26px 20px">
        <SecHead n="02" right={calc ? <MonoTxt size={10} color={t.faint}>{selectedCount} OF {validCount} SELECTED</MonoTxt> : null} style={{ marginBottom: 14 }}>Net positions preview</SecHead>

        {!calc && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Btn2 primary onClick={calculate} style={{ opacity: files.length ? 1 : 0.4, pointerEvents: files.length ? 'auto' : 'none' }}>Calculate net positions across all files →</Btn2>
            <span style={{ fontSize: 12, color: t.faint }}>{files.length ? 'Pools every file, applies cross-broker sells.' : 'Load a CSV above to begin.'}</span>
          </div>
        )}

        {calc && positions.length === 0 && (
          <div style={{ fontSize: 12.5, color: t.faint, fontFamily: t.mono, padding: '4px 0 8px' }}>
            No open positions after netting{calc.dropped.length ? ' — ' + calc.dropped.length + ' ticker' + (calc.dropped.length === 1 ? '' : 's') + ' netted to zero (fully sold).' : '.'}
            <span style={{ display: 'block', marginTop: 10 }}><Btn2 onClick={() => setCalc(null)}>Recalculate</Btn2></span>
          </div>
        )}

        {calc && positions.length > 0 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: pvCols, gap: 12, padding: '0 4px 8px', alignItems: 'center' }}>
              <button onClick={toggleAll} title={allValidSelected ? 'Deselect all' : 'Select all valid'}
                style={{ width: 19, height: 19, borderRadius: 5, border: `1.5px solid ${allValidSelected ? t.green : t.inputBorder}`, background: allValidSelected ? t.green : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                {allValidSelected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={t.dark ? '#0A0B0D' : '#fff'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5"></path></svg>}
              </button>
              {headerCols.slice(1).map((c, i) => (
                <span key={c} style={{ fontFamily: t.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.faint, textAlign: i === 0 || i === 1 ? 'left' : 'right' }}>{c}</span>
              ))}
            </div>

            {positions.map((p, i) => (
              <div key={p.ticker + '|' + p.type} className="f2-row" style={{ display: 'grid', gridTemplateColumns: pvCols, gap: 12, alignItems: 'center', padding: `${t.rowPadY}px 4px`, borderTop: `1px solid ${t.hair}`, opacity: p.valid ? 1 : 0.62 }}>
                <button onClick={() => p.valid && toggleRow(i)} disabled={!p.valid} title={p.valid ? undefined : 'Ticker looks invalid — fix the column mapping to import'}
                  style={{ width: 19, height: 19, borderRadius: 5, border: `1.5px solid ${sel[i] && p.valid ? t.green : t.inputBorder}`, background: sel[i] && p.valid ? t.green : 'transparent', cursor: p.valid ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  {sel[i] && p.valid && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={t.dark ? '#0A0B0D' : '#fff'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5"></path></svg>}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.ticker}</span>
                  {!p.valid && <Chip2 tone="watch">check</Chip2>}
                </div>
                <div><Chip2 tone={p.type === 'crypto' ? 'accent' : 'mute'}>{p.type}</Chip2></div>
                <Money size={12.5} style={{ textAlign: 'right' }}>{(+p.netQty.toFixed(p.netQty < 1 ? 6 : 4)).toString()}</Money>
                <Money size={12.5} color={t.dim} style={{ textAlign: 'right' }}>{p.avgBuy ? F.eur(p.avgBuy, 2) : '—'}</Money>
                <MonoTxt size={12} color={t.green} style={{ textAlign: 'right' }}>{p.buyCount}{p.stakingQty ? '+s' : ''}</MonoTxt>
                <MonoTxt size={12} color={t.red} style={{ textAlign: 'right' }}>{p.sellCount}</MonoTxt>
              </div>
            ))}

            {calc.dropped.length > 0 && (
              <div style={{ fontSize: 11.5, color: t.faint, padding: '12px 4px 0' }}>
                {calc.dropped.length} ticker{calc.dropped.length === 1 ? '' : 's'} netted to zero (fully sold) and {calc.dropped.length === 1 ? 'was' : 'were'} excluded.
              </div>
            )}
            {validCount < positions.length && (
              <div style={{ fontSize: 11.5, color: t.amber, padding: '6px 4px 0' }}>
                {positions.length - validCount} ticker{positions.length - validCount === 1 ? '' : 's'} look like a name, not a symbol — fix the column mapping to import {positions.length - validCount === 1 ? 'it' : 'them'}.
              </div>
            )}
            <div style={{ paddingTop: 12 }}><Btn2 onClick={() => setCalc(null)}>Recalculate</Btn2></div>
          </div>
        )}
      </Card2>

      {/* ── 03 · Import ── */}
      <Card2 pad="22px 26px 22px">
        <SecHead n="03" style={{ marginBottom: 14 }}>Import</SecHead>
        {!result && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Btn2 primary onClick={doImport} style={{ opacity: (!busy && selectedCount) ? 1 : 0.4, pointerEvents: (!busy && selectedCount) ? 'auto' : 'none' }}>
              {busy ? 'Importing…' : 'Import ' + selectedCount + ' selected'}
            </Btn2>
            <span style={{ fontSize: 12, color: t.faint }}>
              {selectedCount ? 'New tickers are created; existing ones get a buy at the new average. Live prices fetched on import.' : 'Select positions above to import.'}
            </span>
          </div>
        )}
        {result && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 600, color: result.failed.length ? t.amber : t.green, marginBottom: 4 }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.5 3.5 6.5-8"></path></svg>
              Imported {result.imported} position{result.imported === 1 ? '' : 's'}
            </div>
            {result.failed.length > 0 && <div style={{ fontSize: 12, color: t.red, marginBottom: 3 }}>Failed: {result.failed.join(', ')}</div>}
            {result.estimated.length > 0 && <div style={{ fontSize: 12, color: t.faint, marginBottom: 3 }}>Price estimated from cost basis (live fetch failed): {result.estimated.join(', ')}</div>}
            <div style={{ fontSize: 12, color: t.faint, marginTop: 6 }}>Opening your overview…</div>
          </div>
        )}
      </Card2>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', right: 28, bottom: 50, zIndex: 120, display: 'flex', alignItems: 'center', gap: 10, background: t.raise, border: `1px solid ${toast.tone === 'watch' ? t.amber : t.green}`, borderRadius: 10, padding: '11px 16px', boxShadow: t.dark ? '0 16px 40px -16px rgba(0,0,0,0.8)' : '0 16px 40px -20px rgba(23,25,30,0.4)', animation: 'fincrSlide 0.18s ease' }}>
          <LiveDot2 color={toast.tone === 'watch' ? t.amber : t.green} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink }}>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
window.ImportTab2 = ImportTab2;
