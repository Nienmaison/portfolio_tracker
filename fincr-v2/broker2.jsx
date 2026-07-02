/* Fincr 2.0 — Brokerage aggregation via SnapTrade (read-only). [C2-D77..D85]

   Connect a broker  → POST /broker/connect opens the Connection Portal; GET
     /broker/connections lists linked brokerages (disabled → RECONNECT NEEDED,
     poll-based per [C2-D79]); re-checks on tab focus.
   Sync brokers (B2) → GET /broker/positions → syncBrokerPositions: source-aware
     snapshot merge (replace snaptrade, skip manual, add new). Idempotent.
   Sync history (C2) → GET /broker/activities → syncBrokerActivities: replay real
     trade history into the ledger (replace snaptrade tickers' txns, skip manual,
     add new). Idempotent via st_{activity_id}. Run AFTER "Sync brokers" for real
     cost basis. All calls auth via X-API-Key from localStorage. Read-only. */
const BROKER_API_BASE = 'https://fincr.duckdns.org';

function BrokerConnect2() {
  const t = useTheme2();
  const store = useStore2();
  const [conns, setConns] = React.useState(null);   // null = loading
  const [busy, setBusy] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [histing, setHisting] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
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

  const summarize = (label, res, extra) => {
    const n = res.added.length + res.replaced.length;
    const parts = [n + ' ' + label + (n === 1 ? '' : 's') + ' synced'];
    if (res.added.length) parts.push(res.added.length + ' new');
    if (res.skipped.length) parts.push(res.skipped.length + ' kept manual (' + res.skipped.join(', ') + ')');
    if (extra) parts.push(extra);
    return parts.join(' · ');
  };

  const syncBrokers = async () => {
    if (syncing) return;
    const key = apiKey();
    if (!key) { setErr('Set your API key in the agent panel first.'); return; }
    setSyncing(true); setMsg(null); setErr(null);
    try {
      const r = await fetch(BROKER_API_BASE + '/broker/positions', { headers: { 'X-API-Key': key } });
      const d = await r.json();
      if (!r.ok || d.configured === false) { setErr('Positions unavailable from the server.'); setSyncing(false); return; }
      const res = await store.actions.syncBrokerPositions(d.positions || []);
      setMsg(summarize('position', res, null));
    } catch (e) { setErr('Sync failed. Try again.'); }
    setSyncing(false);
  };

  const syncHistory = async () => {
    if (histing) return;
    const key = apiKey();
    if (!key) { setErr('Set your API key in the agent panel first.'); return; }
    setHisting(true); setMsg(null); setErr(null);
    try {
      const r = await fetch(BROKER_API_BASE + '/broker/activities', { headers: { 'X-API-Key': key } });
      const d = await r.json();
      if (!r.ok || d.configured === false) { setErr('Activity history unavailable from the server.'); setHisting(false); return; }
      const res = await store.actions.syncBrokerActivities(d.activities || []);
      const dropped = d.dropped_activity_count ? (d.dropped_activity_count + ' non-trade dropped') : null;
      setMsg(summarize('ticker history', res, dropped));
    } catch (e) { setErr('History sync failed. Try again.'); }
    setHisting(false);
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
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '14px 4px', borderTop: `1px solid ${t.hair}` }}>
        <Btn2 onClick={connect}>{busy ? 'Opening…' : 'Connect a broker'}</Btn2>
        <Btn2 onClick={syncBrokers}>{syncing ? 'Syncing…' : 'Sync brokers'}</Btn2>
        <Btn2 onClick={syncHistory}>{histing ? 'Syncing…' : 'Sync history'}</Btn2>
        <span style={{ fontSize: 11.5, color: t.faint }}>{hint}</span>
      </div>
      {msg && <div style={{ fontSize: 11.5, color: t.green, padding: '2px 4px 0' }}>{msg}</div>}
      {err && <div style={{ fontSize: 11.5, color: t.red, padding: '2px 4px 0' }}>{err}</div>}
    </div>
  );
}
window.BrokerConnect2 = BrokerConnect2;
