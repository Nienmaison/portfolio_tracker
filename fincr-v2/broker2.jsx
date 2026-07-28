/* Fincr 2.0 — Brokerage aggregation via SnapTrade (read-only). [C2-D77..D88]

   Connect a broker  → POST /broker/connect opens the Connection Portal; GET
     /broker/connections lists linked brokerages (disabled → RECONNECT NEEDED).
   Sync brokers (B2) → GET /broker/positions → syncBrokerPositions: source-aware
     snapshot merge. Guard 2 ([C2-D88]): tickers with established per-date-FX
     history are left untouched (kept: history-managed) — a snapshot must never
     overwrite the more accurate history cost basis.
   Sync history (C2) → GET /broker/activities (+ positions for the guard) →
     syncBrokerActivities: replay real trade history. Guard 1 ([C2-D87]): a
     ticker is only merged if its replayed net qty matches the CURRENT reported
     position; otherwise it's skipped (history_incomplete) so an activity feed
     missing a disposal can't fabricate a phantom holding. All calls auth via
     X-API-Key from localStorage. Read-only. */
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
    if (!key) { setConns([]); setErr('Enter your API key above (Data & connections) first.'); return; }
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

  // C2-D121 — reflect the mount-time auto-sync (store2.jsx) in this same UI, not just a
  // manual click. syncing/histing here now mean "a positions/activities sync is in
  // flight, whoever triggered it" — the window-level guard (checked in syncBrokers/
  // syncHistory below) is what actually prevents a manual click and the auto-trigger
  // from doing real work twice; this listener is just so the buttons/message honestly
  // reflect it either way.
  React.useEffect(() => {
    const onStatus = (e) => {
      const { kind, status, extra } = e.detail || {};
      const setBusyFor = kind === 'positions' ? setSyncing : setHisting;
      if (status === 'syncing') { setBusyFor(true); return; }
      setBusyFor(false);
      if (status === 'ok' && extra) { setMsg(summarize(kind === 'positions' ? 'position' : 'ticker history', extra, null)); setErr(null); }
      else if (status === 'error') { /* auto-sync fails silently by design — no owner-facing error from a background trigger */ }
    };
    window.addEventListener('fincr:broker-sync-status', onStatus);
    return () => window.removeEventListener('fincr:broker-sync-status', onStatus);
  }, []);

  const connect = async () => {
    if (busy) return;                       // Btn2 has no disabled prop — guard here
    const key = apiKey();
    if (!key) { setErr('Enter your API key above (Data & connections) first.'); return; }
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

  // skipped is [{ticker, reason}] — group by reason for a readable line.
  const SKIP_LABEL = { manual: 'kept manual', history_incomplete: 'skipped — incomplete history', history_managed: 'kept — history-managed' };
  // [C2-D133] aliasedFolds is [{raw, canonical, outcome}] — a broker-native
  // symbol (e.g. "NOKIA") that resolved to an already-known canonical ticker
  // ("NOK") instead of being counted as a new holding. Surfaced as its own
  // clause, distinct from the plain synced/new/skipped counts above, so an
  // aliased match is visible as exactly that — not indistinguishable from an
  // ordinary sync or silently folded into a bare count.
  const ALIAS_OUTCOME_LABEL = { replaced: 'synced', manual: 'kept manual', history_managed: 'kept — history-managed', history_incomplete: 'skipped — incomplete history' };
  const summarize = (label, res, extra) => {
    const n = res.added.length + res.replaced.length;
    const parts = [n + ' ' + label + (n === 1 ? '' : 's') + ' synced'];
    if (res.added.length) parts.push(res.added.length + ' new');
    const byReason = {};
    (res.skipped || []).forEach((s) => { const r = s.reason || 'skipped'; (byReason[r] = byReason[r] || []).push(s.ticker); });
    Object.keys(byReason).forEach((r) => parts.push(byReason[r].length + ' ' + (SKIP_LABEL[r] || r) + ' (' + byReason[r].join(', ') + ')'));
    (res.aliasedFolds || []).forEach((f) => parts.push(f.raw + ' → ' + f.canonical + ' (aliased, ' + (ALIAS_OUTCOME_LABEL[f.outcome] || f.outcome) + ')'));
    if (extra) parts.push(extra);
    return parts.join(' · ');
  };

  const syncBrokers = async () => {
    // C2-D121 — shared window-level guard with the mount-time auto-sync (store2.jsx): if
    // an auto-triggered positions sync is already in flight, don't fire a second,
    // redundant one — the onStatus listener above already reflects its progress here.
    if (syncing || window.__fincrBrokerPosSyncing) return;
    const key = apiKey();
    if (!key) { setErr('Enter your API key above (Data & connections) first.'); return; }
    window.__fincrBrokerPosSyncing = true;
    setSyncing(true); setMsg(null); setErr(null);
    try {
      const r = await fetch(BROKER_API_BASE + '/broker/positions', { headers: { 'X-API-Key': key } });
      const d = await r.json();
      if (!r.ok || d.configured === false) { setErr('Positions unavailable from the server.'); setSyncing(false); window.__fincrBrokerPosSyncing = false; return; }
      const res = await store.actions.syncBrokerPositions(d.positions || []);
      setMsg(summarize('position', res, null));
    } catch (e) { setErr('Sync failed. Try again.'); }
    setSyncing(false);
    window.__fincrBrokerPosSyncing = false;
  };

  const syncHistory = async () => {
    // C2-D121 — same shared guard, activities side.
    if (histing || window.__fincrBrokerActSyncing) return;
    const key = apiKey();
    if (!key) { setErr('Enter your API key above (Data & connections) first.'); return; }
    window.__fincrBrokerActSyncing = true;
    setHisting(true); setMsg(null); setErr(null);
    try {
      // Guard 1 needs the current-position truth alongside the activity feed.
      const [ra, rp] = await Promise.all([
        fetch(BROKER_API_BASE + '/broker/activities', { headers: { 'X-API-Key': key } }),
        fetch(BROKER_API_BASE + '/broker/positions', { headers: { 'X-API-Key': key } }),
      ]);
      const da = await ra.json();
      const dp = await rp.json();
      if (!ra.ok || da.configured === false) { setErr('Activity history unavailable from the server.'); setHisting(false); window.__fincrBrokerActSyncing = false; return; }
      const res = await store.actions.syncBrokerActivities(da.activities || [], dp.positions || []);
      const dropped = da.dropped_activity_count ? (da.dropped_activity_count + ' non-trade dropped') : null;
      setMsg(summarize('ticker history', res, dropped));
    } catch (e) { setErr('History sync failed. Try again.'); }
    window.__fincrBrokerActSyncing = false;
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
