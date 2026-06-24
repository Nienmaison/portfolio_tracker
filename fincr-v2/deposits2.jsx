/* Fincr 2.0 — Deposit ledger + true return display (C2-S6, decisions C2-D66/C2-D67).
   Shows: true return % and absolute, total deposited, source breakdown,
          deposit history list, Add deposit form, CSV import flow.
   Reads:  F.deposits (sorted newest-first by thesis-adapter.js loadThesis)
           F.totalDeposited (sum of deposits[].amount_eur)
           F.totalValue (from store2.jsx — holdings + liquidity, C2-S5)
   Writes: POST /deposits/add (single entry)
           POST /deposits/import (batch from CSV, max 500) */

// ── Constants ────────────────────────────────────────────────────────────────

const DEPOSITS_BASE = 'https://fincr.duckdns.org';
const VALID_SOURCES = ['broker', 'exchange'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function depositsApiKey() {
  return localStorage.getItem('fincr-api-key') || '';
}

// Format EUR amount without decimals for display.
function dep_eur(n) {
  return '€' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// POST /deposits/add — single entry.
// Returns { ok: true, deposit, thesis_version } or { ok: false, duplicate, error }.
async function apiAddDeposit(date, amount_eur, source, note) {
  const key = depositsApiKey();
  if (!key) return { ok: false, error: 'No API key — check Settings' };
  try {
    const r = await fetch(DEPOSITS_BASE + '/deposits/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify({ date, amount_eur, source, note }),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d.error || 'Server error' };
    if (d.status === 'duplicate') return { ok: true, duplicate: true };
    return { ok: true, deposit: d.deposit, thesis_version: d.thesis_version };
  } catch (e) {
    return { ok: false, error: 'Network error — try again' };
  }
}

// POST /deposits/import — batch insert.
// Returns { ok: true, imported, skipped } or { ok: false, error }.
async function apiImportDeposits(deposits) {
  const key = depositsApiKey();
  if (!key) return { ok: false, error: 'No API key — check Settings' };
  try {
    const r = await fetch(DEPOSITS_BASE + '/deposits/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify({ deposits }),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: d.error || 'Server error' };
    return { ok: true, imported: d.imported, skipped: d.skipped };
  } catch (e) {
    return { ok: false, error: 'Network error — try again' };
  }
}

// ── Minimal CSV parser (no papaparse available in this bundle) ────────────────
// Handles comma and semicolon delimiters, quoted fields, Windows line endings.
// Returns { headers: string[], rows: object[] } or { error: string }.
function parseCSV(text) {
  if (!text || !text.trim()) return { error: 'File is empty' };

  // Detect delimiter: whichever of , or ; appears more in the first non-empty line.
  const firstLine = text.split(/\r?\n/).find((l) => l.trim());
  const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

  // Split into raw rows (handle Windows \r\n).
  const rawRows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    .map((r) => r.trim()).filter((r) => r.length > 0);
  if (rawRows.length < 2) return { error: 'CSV has no data rows' };

  // Parse a single row into cells, respecting quoted fields.
  function parseRow(line) {
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === delim && !inQ) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const headers = parseRow(rawRows[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const rows = rawRows.slice(1).map((line) => {
    const cells = parseRow(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] || '').trim(); });
    return obj;
  });

  return { headers, rows };
}

// Parse a date string in YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY to a Date.
// Returns null on failure.
function parseDepDate(str) {
  if (!str) return null;
  str = str.trim();
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + 'T00:00:00');
    return isNaN(d) ? null : d;
  }
  // Try DD/MM/YYYY
  const dm = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) {
    const d1 = new Date(`${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}T00:00:00`);
    const d2 = new Date(`${dm[3]}-${dm[1].padStart(2,'0')}-${dm[2].padStart(2,'0')}T00:00:00`);
    // Prefer DD/MM/YYYY: if day > 12, must be DD/MM.
    if (parseInt(dm[1]) > 12) return isNaN(d1) ? null : d1;
    // Ambiguous: default to DD/MM/YYYY.
    return isNaN(d1) ? (isNaN(d2) ? null : d2) : d1;
  }
  return null;
}

// Convert a parsed CSV to deposit objects.
// Returns { deposits: [], skipped: N, errorMsg: string|null }
function csvToDeposits(csvResult, defaultSource) {
  if (csvResult.error) return { deposits: [], skipped: 0, errorMsg: csvResult.error };

  const { headers, rows } = csvResult;

  // Column detection — case-insensitive, partial match.
  function findCol(keywords) {
    return headers.find((h) => keywords.some((kw) => h.includes(kw))) || null;
  }

  const dateCol   = findCol(['date']);
  const amountCol = findCol(['amount', 'deposit', 'credit', 'value']);
  const noteCol   = findCol(['note', 'description', 'details', 'narration']);
  const sourceCol = findCol(['source']);

  if (!dateCol || !amountCol) {
    return {
      deposits: [], skipped: rows.length,
      errorMsg: 'Could not detect date/amount columns. Expected headers containing "date" and "amount" (or "deposit", "credit", "value").',
    };
  }

  const today = new Date(); today.setHours(23, 59, 59, 999);
  const deposits = [];
  let skipped = 0;

  for (const row of rows) {
    const rawDate = row[dateCol];
    const rawAmt  = row[amountCol];

    const date = parseDepDate(rawDate);
    if (!date || date > today) { skipped++; continue; }

    // Parse amount: strip currency symbols, spaces, thousands separators.
    const amtStr = (rawAmt || '').replace(/[€$£,\s]/g, '').replace(',', '.');
    const amount = parseFloat(amtStr);
    // Skip withdrawals (negative) and zero rows silently.
    if (!amount || amount <= 0 || isNaN(amount)) { skipped++; continue; }

    const note = noteCol ? (row[noteCol] || '').slice(0, 200) : '';
    const source = sourceCol && VALID_SOURCES.includes(row[sourceCol])
      ? row[sourceCol]
      : defaultSource;

    deposits.push({
      date: date.toISOString().slice(0, 10),
      amount_eur: amount,
      source,
      note,
    });
  }

  return { deposits, skipped, errorMsg: null };
}

// ── Section A — True Return Display ──────────────────────────────────────────

function TrueReturnSection({ totalDeposited, totalValue }) {
  const t = useTheme2();
  const eur = dep_eur;

  if (totalDeposited === 0) {
    return (
      <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid ' + t.hair }}>
        <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.14em', display: 'block', marginBottom: 6 }}>INVESTED CAPITAL</MonoTxt>
        <MonoTxt size={12} color={t.dim}>No deposits recorded yet.</MonoTxt>
      </div>
    );
  }

  const absoluteReturn  = totalValue - totalDeposited;
  const trueReturnPct   = (absoluteReturn / totalDeposited) * 100;
  const positive        = trueReturnPct >= 0;
  const returnColor     = positive ? t.green : t.red;
  const sign            = positive ? '+' : '';

  return (
    <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid ' + t.hair }}>
      <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.14em', display: 'block', marginBottom: 10 }}>INVESTED CAPITAL</MonoTxt>

      {/* Total deposited */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <MonoTxt size={11} color={t.dim}>Total deposited</MonoTxt>
        <Money size={14} weight={600}>{eur(totalDeposited)}</Money>
      </div>

      {/* True return — hidden when totalValue === 0 (no-key device) */}
      {totalValue > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', background: t.press, borderRadius: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.14em' }}>TRUE RETURN</MonoTxt>
            <span style={{ fontFamily: useTheme2().mono, fontSize: 22, fontWeight: 600, color: returnColor, letterSpacing: '-0.02em' }}>
              {sign}{trueReturnPct.toFixed(1)}%
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <MonoTxt size={10.5} color={t.dim}>
              {positive ? '+' : ''}{eur(absoluteReturn)} {positive ? 'gain' : 'loss'} on {eur(totalDeposited)} deposited
            </MonoTxt>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section A2 — Source Breakdown ─────────────────────────────────────────────

function SourceBreakdown({ deposits }) {
  const t = useTheme2();
  if (!deposits || deposits.length === 0) return null;

  const brokerTotal   = deposits.filter((d) => d.source === 'broker')  .reduce((s, d) => s + d.amount_eur, 0);
  const exchangeTotal = deposits.filter((d) => d.source === 'exchange').reduce((s, d) => s + d.amount_eur, 0);
  const total         = brokerTotal + exchangeTotal;
  if (total === 0) return null;

  const brokerPct   = total > 0 ? (brokerTotal   / total * 100).toFixed(0) : 0;
  const exchangePct = total > 0 ? (exchangeTotal / total * 100).toFixed(0) : 0;

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid ' + t.hair }}>
      {brokerTotal > 0 && (
        <div style={{ flex: 1, padding: '8px 10px', background: t.press, borderRadius: 7 }}>
          <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em', display: 'block', marginBottom: 3 }}>BROKER</MonoTxt>
          <Money size={12.5} weight={600}>{dep_eur(brokerTotal)}</Money>
          <MonoTxt size={10} color={t.dim} style={{ marginLeft: 5 }}>{brokerPct}%</MonoTxt>
        </div>
      )}
      {exchangeTotal > 0 && (
        <div style={{ flex: 1, padding: '8px 10px', background: t.press, borderRadius: 7 }}>
          <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em', display: 'block', marginBottom: 3 }}>EXCHANGE</MonoTxt>
          <Money size={12.5} weight={600}>{dep_eur(exchangeTotal)}</Money>
          <MonoTxt size={10} color={t.dim} style={{ marginLeft: 5 }}>{exchangePct}%</MonoTxt>
        </div>
      )}
    </div>
  );
}

// ── Add Deposit Form ──────────────────────────────────────────────────────────

function AddDepositForm({ onClose }) {
  const t = useTheme2();
  const today = new Date().toISOString().slice(0, 10);
  const [date,   setDate]   = React.useState(today);
  const [amount, setAmount] = React.useState('');
  const [source, setSource] = React.useState('broker');
  const [note,   setNote]   = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error,  setError]  = React.useState(null);
  const [dupMsg, setDupMsg] = React.useState(null);

  async function handleSave() {
    if (!date) { setError('Date is required'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Amount must be greater than 0'); return; }
    setSaving(true); setError(null); setDupMsg(null);

    const res = await apiAddDeposit(date, amt, source, note.trim());
    setSaving(false);

    if (!res.ok) { setError(res.error); return; }
    if (res.duplicate) { setDupMsg('Already recorded — not added again'); return; }

    if (window.loadThesis) window.loadThesis();
    onClose();
  }

  return (
    <div style={{ background: t.press, borderRadius: 9, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field2 label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={today}
            style={{ width: '100%', fontFamily: t.mono, fontSize: 13, background: t.inputBg, border: '1px solid ' + t.inputBorder, borderRadius: 7, padding: '7px 10px', color: t.ink, boxSizing: 'border-box' }}
          />
        </Field2>
        <Field2 label="Amount (EUR)">
          <NumberField2 value={amount} onChange={setAmount} prefix="€" autoFocus placeholder="0" />
        </Field2>
        <Field2 label="Source">
          <div style={{ display: 'flex', gap: 6 }}>
            {['broker', 'exchange'].map((s) => (
              <Btn2
                key={s}
                primary={source === s}
                onClick={() => setSource(s)}
                style={{ flex: 1, textTransform: 'capitalize' }}
              >{s.charAt(0).toUpperCase() + s.slice(1)}</Btn2>
            ))}
          </div>
        </Field2>
        <Field2 label="Note" hint="optional">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="e.g. March salary"
            style={{ width: '100%', fontFamily: t.sans || t.mono, fontSize: 13, background: t.inputBg, border: '1px solid ' + t.inputBorder, borderRadius: 7, padding: '7px 10px', color: t.ink, boxSizing: 'border-box' }}
          />
        </Field2>

        {error  && <MonoTxt size={11} color={t.red}>{error}</MonoTxt>}
        {dupMsg && <MonoTxt size={11} color={t.dim}>{dupMsg}</MonoTxt>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <Btn2 onClick={onClose}>Cancel</Btn2>
          <Btn2 primary onClick={handleSave} style={{ opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' : 'auto' }}>
            {saving ? 'Saving…' : 'Save'}
          </Btn2>
        </div>
      </div>
    </div>
  );
}

// ── CSV Import Flow ───────────────────────────────────────────────────────────

function CSVImportFlow({ onClose }) {
  const t = useTheme2();
  // step: 'select' | 'preview' | 'result'
  const [step,       setStep]       = React.useState('select');
  const [csvSource,  setCsvSource]  = React.useState('broker');
  const [parseError, setParseError] = React.useState(null);
  const [preview,    setPreview]    = React.useState(null); // { deposits, skipped, total }
  const [importing,  setImporting]  = React.useState(false);
  const [result,     setResult]     = React.useState(null); // { imported, skipped }
  const fileRef = React.useRef(null);

  function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      const text = ev.target.result;
      const csv = parseCSV(text);
      if (csv.error) { setParseError(csv.error); setPreview(null); return; }

      const { deposits, skipped, errorMsg } = csvToDeposits(csv, csvSource);
      if (errorMsg) { setParseError(errorMsg); setPreview(null); return; }

      setParseError(null);
      const total = deposits.reduce((s, d) => s + d.amount_eur, 0);
      setPreview({ deposits, skipped, total });
      setStep('preview');
    };
    reader.readAsText(file);
  }

  // Re-parse when source changes in 'select' step (hasn't parsed yet).
  // In 'preview' step, the source is already baked into preview.deposits.

  async function handleImport() {
    if (!preview || !preview.deposits.length) return;
    setImporting(true);
    const res = await apiImportDeposits(preview.deposits);
    setImporting(false);
    if (!res.ok) { setParseError(res.error); return; }
    setResult({ imported: res.imported, skipped: res.skipped });
    setStep('result');
    if (window.loadThesis) window.loadThesis();
  }

  // ── Step: select ──────────────────────────────────────────────────────────
  if (step === 'select') {
    return (
      <div style={{ background: t.press, borderRadius: 9, padding: '14px 16px', marginBottom: 12 }}>
        <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.12em', display: 'block', marginBottom: 10 }}>IMPORT FROM CSV</MonoTxt>

        <Field2 label="Default source (if CSV has no source column)">
          <div style={{ display: 'flex', gap: 6 }}>
            {['broker', 'exchange'].map((s) => (
              <Btn2 key={s} primary={csvSource === s} onClick={() => setCsvSource(s)} style={{ flex: 1 }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Btn2>
            ))}
          </div>
        </Field2>

        <div style={{ marginTop: 10 }}>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileChange} style={{ display: 'none' }} />
          <Btn2 onClick={() => fileRef.current && fileRef.current.click()} style={{ width: '100%', justifyContent: 'center' }}>
            Choose CSV file
          </Btn2>
        </div>

        {parseError && <MonoTxt size={11} color={t.red} style={{ display: 'block', marginTop: 8 }}>{parseError}</MonoTxt>}

        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <Btn2 onClick={onClose}>Cancel</Btn2>
        </div>

        <div style={{ marginTop: 10 }}>
          <MonoTxt size={10} color={t.faint} style={{ lineHeight: 1.6 }}>
            Expected columns: <strong>date</strong> (YYYY-MM-DD or DD/MM/YYYY), <strong>amount</strong> (positive EUR). Optional: note, description, source. Negative rows are skipped.
          </MonoTxt>
        </div>
      </div>
    );
  }

  // ── Step: preview ─────────────────────────────────────────────────────────
  if (step === 'preview') {
    const previewRows = preview.deposits.slice(0, 10);
    return (
      <div style={{ background: t.press, borderRadius: 9, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ marginBottom: 10 }}>
          <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.12em', display: 'block', marginBottom: 3 }}>PREVIEW</MonoTxt>
          <MonoTxt size={12} color={t.ink}>
            {preview.deposits.length} deposit{preview.deposits.length !== 1 ? 's' : ''}, {dep_eur(preview.total)} total
            {preview.skipped > 0 && ` (${preview.skipped} row${preview.skipped !== 1 ? 's' : ''} skipped — withdrawals or invalid)`}
          </MonoTxt>
        </div>

        {/* Preview table: max 10 rows */}
        <div style={{ overflowX: 'auto', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 80px 90px 1fr', gap: '6px 10px', minWidth: 340 }}>
            {/* Headers */}
            {['DATE', 'AMOUNT', 'SOURCE', 'NOTE'].map((h) => (
              <MonoTxt key={h} size={9.5} color={t.faint} style={{ letterSpacing: '0.12em', paddingBottom: 4 }}>{h}</MonoTxt>
            ))}
            {/* Rows */}
            {previewRows.map((d, i) => (
              <React.Fragment key={i}>
                <MonoTxt size={11} color={t.ink}>{d.date}</MonoTxt>
                <MonoTxt size={11} color={t.ink}>{dep_eur(d.amount_eur)}</MonoTxt>
                <MonoTxt size={11} color={t.dim}>{d.source.charAt(0).toUpperCase() + d.source.slice(1)}</MonoTxt>
                <MonoTxt size={11} color={t.dim} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.note || '—'}</MonoTxt>
              </React.Fragment>
            ))}
          </div>
          {preview.deposits.length > 10 && (
            <MonoTxt size={10} color={t.faint} style={{ marginTop: 6 }}>
              … and {preview.deposits.length - 10} more
            </MonoTxt>
          )}
        </div>

        {parseError && <MonoTxt size={11} color={t.red} style={{ display: 'block', marginBottom: 8 }}>{parseError}</MonoTxt>}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
          <Btn2 onClick={() => { setStep('select'); setPreview(null); }}>Back</Btn2>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn2 onClick={onClose}>Cancel</Btn2>
            <Btn2
              primary
              onClick={handleImport}
              style={{ opacity: importing ? 0.5 : 1, pointerEvents: importing ? 'none' : 'auto' }}
            >
              {importing ? 'Importing…' : `Import ${preview.deposits.length} deposit${preview.deposits.length !== 1 ? 's' : ''}`}
            </Btn2>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: result ──────────────────────────────────────────────────────────
  if (step === 'result') {
    return (
      <div style={{ background: t.press, borderRadius: 9, padding: '14px 16px', marginBottom: 12 }}>
        <MonoTxt size={12} color={t.green} style={{ display: 'block', marginBottom: 4 }}>
          Imported {result.imported} deposit{result.imported !== 1 ? 's' : ''}.
        </MonoTxt>
        {result.skipped > 0 && (
          <MonoTxt size={11} color={t.dim}>
            {result.skipped} already existed — skipped.
          </MonoTxt>
        )}
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <Btn2 onClick={onClose}>Done</Btn2>
        </div>
      </div>
    );
  }

  return null;
}

// ── Section B — Deposit History + Controls ────────────────────────────────────

function DepositHistory({ deposits }) {
  const t = useTheme2();
  const [mode, setMode] = React.useState(null); // null | 'add' | 'import'

  function closeForm() { setMode(null); }

  return (
    <div>
      {/* List header with controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.14em' }}>DEPOSITS</MonoTxt>
          {deposits.length > 0 && (
            <span style={{ fontFamily: t.mono, fontSize: 10, color: t.dim, background: t.press, borderRadius: 5, padding: '1px 6px' }}>
              {deposits.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn2 onClick={() => setMode(mode === 'add' ? null : 'add')} style={{ padding: '4px 10px', fontSize: 11 }}>
            + Add
          </Btn2>
          <Btn2 onClick={() => setMode(mode === 'import' ? null : 'import')} style={{ padding: '4px 10px', fontSize: 11 }}>
            ↑ Import CSV
          </Btn2>
        </div>
      </div>

      {/* Inline add form */}
      {mode === 'add' && <AddDepositForm onClose={closeForm} />}

      {/* Inline CSV import flow */}
      {mode === 'import' && <CSVImportFlow onClose={closeForm} />}

      {/* Empty state */}
      {deposits.length === 0 && mode === null && (
        <MonoTxt size={12} color={t.dim}>No deposits yet. Add one or import from CSV.</MonoTxt>
      )}

      {/* History list */}
      {deposits.length > 0 && (
        <div>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 80px 90px 1fr', gap: '4px 10px', padding: '0 0 6px' }}>
            {['DATE', 'SOURCE', 'AMOUNT', 'NOTE'].map((h) => (
              <MonoTxt key={h} size={9.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>{h}</MonoTxt>
            ))}
          </div>
          {/* Rows — newest-first (already sorted by thesis-adapter) */}
          {deposits.map((d) => (
            <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '100px 80px 90px 1fr', gap: '4px 10px', padding: '7px 0', borderTop: '1px solid ' + t.hair, alignItems: 'center' }}>
              <MonoTxt size={11.5} color={t.ink}>{d.date}</MonoTxt>
              <MonoTxt size={11.5} color={t.dim}>{d.source.charAt(0).toUpperCase() + d.source.slice(1)}</MonoTxt>
              <Money size={12} weight={600}>{dep_eur(d.amount_eur)}</Money>
              <MonoTxt size={11} color={t.faint} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.note || '—'}
              </MonoTxt>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DepositsSection2 — main export ───────────────────────────────────────────

function DepositsSection2() {
  const t = useTheme2();
  const F = window.FINCR;
  // Refresh when thesis-adapter dispatches after loadThesis().
  const [tick, setTick] = React.useState(0);
  React.useEffect(function() {
    const h = function() { setTick(function(n) { return n + 1; }); };
    window.addEventListener('fincr:thesis-update', h);
    return function() { window.removeEventListener('fincr:thesis-update', h); };
  }, []);

  const deposits      = (F.deposits)      || [];
  const totalDeposited = (F.totalDeposited) || 0;
  const totalValue     = (F.totalValue)    || 0;

  return (
    <Card2 pad="22px 26px 20px">
      <SecHead n="04">Invested capital</SecHead>

      <div style={{ marginTop: 16 }}>
        <TrueReturnSection totalDeposited={totalDeposited} totalValue={totalValue} />
        <SourceBreakdown deposits={deposits} />
        <DepositHistory deposits={deposits} />
      </div>
    </Card2>
  );
}

window.DepositsSection2 = DepositsSection2;
