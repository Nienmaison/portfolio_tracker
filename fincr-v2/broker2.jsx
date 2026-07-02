/* Fincr 2.0 — Brokerage aggregation via SnapTrade (read-only). [C2-D77/D78]

   "Connect a broker" opens the SnapTrade Connection Portal in a new tab (URL
   from POST /broker/connect); GET /broker/connections lists linked brokerages.
   A `disabled` connection shows a "RECONNECT NEEDED" badge — the poll-based
   staleness signal used in place of a webhook ([C2-D79]). Re-checks on tab
   focus so completing the portal in another tab reflects back automatically.

   No holdings sync here (Spec B): this screen only establishes/inspects the
   connection. Same auth as every other call: X-API-Key from localStorage. */
const BROKER_API_BASE = 'https://fincr.duckdns.org';

function BrokerConnect2() {
  const t = useTheme2();
  const [conns, setConns] = React.useState(null);   // null = loading
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const apiKey = () => localStorage.getItem('fincr-api-key') || '';

  const load = React.useCallback(async () => {
    const key = apiKey();
    if (!key) { setConns([]); setErr('Set your API key in the agent panel first.'); return; }
    try {
      const r = await fetch(BROKER_API_BASE + '/broker/connections', { headers: { 'X-API-Key': key } });
      if (!r.ok) { setErr('Could not load connections (HTTP ' + r.status + ')'); return; }
      const d = await r.json();
      setConns(Array.isArray(d.connections) ? d.connections : []);
      setErr(null);
    } catch (e) { setErr('Network error loading connections.'); }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const connect = async () => {
    if (busy) return;                       // Btn2 has no disabled prop — guard here
    const key = apiKey();
    if (!key) { setErr('Set your API key in the agent panel first.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(BROKER_API_BASE + '/broker/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: '{}',
      });
      const d = await r.json();
      if (r.ok && d.redirect_url) {
        window.open(d.redirect_url, '_blank', 'noopener');
      } else if (r.status === 409 || d.configured === false) {
        setErr('SnapTrade is not configured on the server yet.');
      } else {
        setErr('Could not start a connection. Try again.');
      }
    } catch (e) { setErr('Network error starting connection.'); }
    setBusy(false);
  };

  const hint = conns === null ? 'Checking connections…'
    : (conns.length === 0 ? 'Link a brokerage via SnapTrade (read-only).'
       : (conns.length + (conns.length === 1 ? ' broker connected · via SnapTrade' : ' brokers connected · via SnapTrade')));

  return (
    <div>
      {conns && conns.map((c) => (
        <div key={c.connection_id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center', padding: '13px 4px', borderTop: `1px solid ${t.hair}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <LiveDot2 color={c.disabled ? t.red : t.green} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, textTransform: 'capitalize' }}>{c.brokerage || 'Brokerage'}</div>
              <div style={{ fontSize: 11.5, color: t.faint, marginTop: 1 }}>SnapTrade · read-only</div>
            </div>
          </div>
          {c.disabled
            ? <MonoTxt size={10} color={t.red}>RECONNECT NEEDED</MonoTxt>
            : <MonoTxt size={10} color={t.green}>CONNECTED</MonoTxt>}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 4px', borderTop: `1px solid ${t.hair}` }}>
        <Btn2 onClick={connect}>{busy ? 'Opening…' : 'Connect a broker'}</Btn2>
        <span style={{ fontSize: 11.5, color: t.faint }}>{hint}</span>
      </div>
      {err && <div style={{ fontSize: 11.5, color: t.red, padding: '2px 4px 0' }}>{err}</div>}
    </div>
  );
}
window.BrokerConnect2 = BrokerConnect2;
