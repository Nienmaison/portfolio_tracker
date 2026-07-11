/* Fincr 2.0 — Capital Ledger card (Settings ▸ C2-D100). The lifetime capital-flow
   ledger: log a deposit or withdrawal crossing the investing-pool boundary, and see
   the append-only event history. Distinct from the Overview Liquidity card, which
   shows the *derived idle cash* — this card is the *lifetime ledger* those figures
   are derived FROM (pool.events feeds both f2ComputePoolNetCapital and f2ComputeIdleCash).

   On submit: window.addPoolEvent (thesis-adapter.js) optimistically appends the event,
   recomputes F.poolNetCapitalDeposited, and re-fires fincr:thesis-update — so both the
   True Return and the idle-cash figures move immediately, with no new derivation logic.
   Append-only: existing events are read-only (a correction is a new offsetting event,
   never an edit of history — [C2-D100]). Exports window.PoolLedger2. */

function PoolLedger2() {
  var t = useTheme2();
  var F = window.FINCR;
  var [amount, setAmount] = React.useState('');
  var [direction, setDirection] = React.useState('in');           // 'in' = Deposit, 'out' = Withdrawal
  var [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  var [note, setNote] = React.useState('');
  var [saving, setSaving] = React.useState(false);
  var [error, setError] = React.useState(null);

  var events = (F.pool && Array.isArray(F.pool.events)) ? F.pool.events : [];
  var amountN = parseFloat(amount);
  var valid = amountN > 0 && (direction === 'in' || direction === 'out');

  var eur = function (n) { return '€' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); };

  async function submit() {
    setError(null);
    if (!(amountN > 0)) { setError('Amount must be greater than 0'); return; }
    if (direction !== 'in' && direction !== 'out') { setError('Choose Deposit or Withdrawal'); return; }
    if (!window.addPoolEvent) { setError('Not connected — set your API key in Settings first'); return; }
    setSaving(true);
    var ok = await window.addPoolEvent(amountN, direction, date, note.trim());
    setSaving(false);
    if (ok) { setAmount(''); setNote(''); }               // keep direction + date for quick repeat entries
    else setError('Could not save — check your connection and try again');
  }

  // Most-recent-first for display (append-only ledger; never mutated here).
  var sorted = events.slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });

  return (
    <section>
      <SecHead n="03">Capital ledger</SecHead>
      {/* marginTop:6 matches the SecHead→content gap every other Settings section uses
          (settings2.jsx §01/§02). Card2 spreads `style`, so no new spacing value. */}
      <Card2 pad="16px 18px 14px" style={{ marginTop: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Seg2
            options={[{ value: 'in', label: 'Deposit', tone: 'buy' }, { value: 'out', label: 'Withdrawal', tone: 'sell' }]}
            value={direction}
            onChange={setDirection}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 8 }}>
            <NumberField2 value={amount} onChange={setAmount} prefix="€" placeholder="amount" autoFocus />
            <TextField2 value={date} onChange={setDate} mono />
          </div>
          <TextField2 value={note} onChange={setNote} placeholder="note (optional)" />
          {error && <MonoTxt size={11} color={t.red}>{error}</MonoTxt>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <MonoTxt size={10} color={t.faint}>Bank ↔ investing pool. Not tied to a broker.</MonoTxt>
            <Btn2
              primary
              onClick={submit}
              style={{ opacity: (saving || !valid) ? 0.45 : 1, pointerEvents: (saving || !valid) ? 'none' : 'auto', padding: '6px 14px' }}
            >
              {saving ? 'Saving…' : (direction === 'in' ? 'Add deposit' : 'Add withdrawal')}
            </Btn2>
          </div>
        </div>

        {/* Append-only event history (read-only) */}
        <div style={{ marginTop: 14, borderTop: '1px solid ' + t.hair, paddingTop: 12 }}>
          <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>
            LEDGER · {events.length} EVENT{events.length !== 1 ? 'S' : ''}
          </MonoTxt>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }}>
            {sorted.map(function (e, i) {
              var isIn = e.direction === 'in';
              var label = e.type === 'seed' ? 'seed' : (e.type || (isIn ? 'deposit' : 'withdrawal'));
              return (
                <div key={e.id || i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, opacity: e._pending ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
                    <MonoTxt size={10} color={t.faint}>{e.date}</MonoTxt>
                    <span style={{ fontSize: 12, color: t.dim, textTransform: 'capitalize', flexShrink: 0 }}>{label}</span>
                    {e.note ? <span style={{ fontSize: 11, color: t.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {e.note}</span> : null}
                  </div>
                  <Money size={12.5} weight={600} color={isIn ? t.green : t.red} style={{ flexShrink: 0 }}>
                    {isIn ? '+' : '−'}{eur(e.amount_eur)}
                  </Money>
                </div>
              );
            })}
          </div>
        </div>
      </Card2>
    </section>
  );
}

window.PoolLedger2 = PoolLedger2;
