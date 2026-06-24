/* Fincr 2.0 — Liquidity card for the right panel (C2-S5, decision C2-D65).
   Shows total available capital, liquidity vs realized split (hidden when
   realized = 0), gap vs dip_readiness cash target, staleness timestamp,
   and an inline edit form.
   Reads:  F.liquidity (set by loadThesis in thesis-adapter.js)
           F.totalValue (from store2.jsx derived totals)
           F.thesis is NOT used — the cash target lives at the raw level:
             thesis.json → dip_readiness.cash_target.target_pct
           Instead, the card fetches the cash target from F.liquidity's
           sibling on the FINCR bus: window.FINCR.cashTargetPct (set here).
           Simpler: expose cashTargetPct on F at the same time as F.liquidity
           in thesis-adapter.js — see note below.
   NOTE:   dip_readiness.cash_target.target_pct is read from the raw thesis
           response in thesis-adapter.js (added alongside F.liquidity) and
           exposed as F.cashTargetPct. This avoids a second fetch here.
   Writes: POST /liquidity/update via saveLiquidity(). */

// ── Helpers ───────────────────────────────────────────────────────────────────

// Relative time string from an ISO date string (e.g. "2026-06-21" → "3 days ago").
// Returns "today" on same day, "yesterday", "N days ago", or "Never updated" on null.
function relativeDate(isoDate) {
  if (!isoDate) return null;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var then = new Date(isoDate);
  then.setHours(0, 0, 0, 0);
  var diffDays = Math.round((today - then) / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return diffDays + ' days ago';
}

// POST /liquidity/update.
// Returns true on 200, false on 4xx/5xx/network/no-key (never throws).
async function saveLiquidity(total_eur, realized_eur) {
  var key = localStorage.getItem('fincr-api-key') || '';
  if (!key) { console.warn('[liquidity] saveLiquidity: no api key — skipped'); return false; }
  try {
    var r = await fetch('https://fincr.duckdns.org/liquidity/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify({ total_eur: total_eur, realized_eur: realized_eur }),
    });
    if (!r.ok) {
      var txt = await r.text();
      console.warn('[liquidity] POST /liquidity/update HTTP ' + r.status + ':', txt.slice(0, 200));
      return false;
    }
    // Update F.liquidity immediately from the server response so the card
    // re-renders without waiting for the next loadThesis() cycle.
    var d = await r.json();
    if (d.status === 'ok' && d.liquidity) {
      window.FINCR = window.FINCR || {};
      window.FINCR.liquidity = d.liquidity;
    }
    return true;
  } catch (e) {
    console.warn('[liquidity] POST /liquidity/update failed:', e.message);
    return false;
  }
}

// ── LiquidityCard2 ────────────────────────────────────────────────────────────
function LiquidityCard2() {
  var t = useTheme2();
  var F = window.FINCR;
  var [editing, setEditing] = React.useState(false);
  var [totalStr, setTotalStr] = React.useState('');
  var [realizedStr, setRealizedStr] = React.useState('');
  var [saving, setSaving] = React.useState(false);
  var [saveError, setSaveError] = React.useState(null);

  // Read liquidity from F.liquidity (set by thesis-adapter.js → loadThesis).
  // Null if key absent, auth failure, or pre-migration device.
  var liq = F.liquidity || { total_eur: 0, realized_eur: 0, last_updated: null };
  var total = Number(liq.total_eur) || 0;
  var realized = Number(liq.realized_eur) || 0;
  var liquidity_eur = total - realized;           // capital between moves

  // Cash target: F.cashTargetPct (set by thesis-adapter.js from
  // dip_readiness.cash_target.target_pct). Hide the TARGET row when absent.
  var cashTargetPct = (F.cashTargetPct != null && F.totalValue > 0)
    ? Number(F.cashTargetPct) : null;
  var target_eur = (cashTargetPct != null && F.totalValue > 0)
    ? (F.totalValue * cashTargetPct / 100) : null;

  // Gap and color (only shown when target_eur is computable).
  var gap_eur = target_eur != null ? (target_eur - total) : null;
  var gap_pct = (gap_eur != null && target_eur > 0)
    ? Math.abs(gap_eur / target_eur * 100) : null;

  // Gap color:
  // green  = at or above target (total >= target)
  // amber  = short by up to 25% of target
  // red    = short by more than 25% of target
  var gapColor = (target_eur == null) ? t.dim
    : total >= target_eur ? t.green
    : (target_eur - total) <= 0.25 * target_eur ? t.amber
    : t.red;
  var gapLabel = (gap_eur == null) ? null
    : total >= target_eur
      ? Math.abs(gap_pct).toFixed(0) + '% over'
      : gap_pct.toFixed(0) + '% short';

  // ── Inline edit form ────────────────────────────────────────────────────────
  function openEdit() {
    setTotalStr(String(total));
    setRealizedStr(realized > 0 ? String(realized) : '');
    setSaveError(null);
    setEditing(true);
  }

  async function handleSave() {
    var totalN = parseFloat(totalStr) || 0;
    var realizedN = parseFloat(realizedStr) || 0;
    if (realizedN > totalN) { setSaveError('Realized cannot exceed total'); return; }
    if (totalN < 0 || realizedN < 0) { setSaveError('Values must be 0 or above'); return; }
    setSaving(true);
    setSaveError(null);
    var ok = await saveLiquidity(totalN, realizedN);
    setSaving(false);
    if (ok) {
      // Refresh F.liquidity via loadThesis to pick up any server-side changes.
      if (window.loadThesis) window.loadThesis();
      setEditing(false);
    } else {
      setSaveError('Failed to save — try again');
    }
  }

  // Inline validation while typing
  var totalN = parseFloat(totalStr) || 0;
  var realizedN = parseFloat(realizedStr) || 0;
  var validationError = (realizedN > totalN && totalStr !== '' && realizedStr !== '')
    ? 'Realized cannot exceed total' : null;
  var canSave = totalStr !== '' && totalN >= 0 && realizedN >= 0 && !validationError;

  var eur = function(n) { return '€' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); };

  // ── Edit form view ─────────────────────────────────────────────────────────
  if (editing) {
    return (
      <Card2 pad="18px 20px 16px">
        <SecHead n="05">Liquidity</SecHead>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <Field2 label="Total in broker/exchange">
            <NumberField2
              value={totalStr}
              onChange={setTotalStr}
              prefix="€"
              autoFocus
            />
          </Field2>
          <Field2 label="Of which realized gains" hint="optional">
            <NumberField2
              value={realizedStr}
              onChange={setRealizedStr}
              prefix="€"
              placeholder="0"
            />
          </Field2>

          {(validationError || saveError) && (
            <MonoTxt size={11} color={t.red}>{validationError || saveError}</MonoTxt>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn2 onClick={function() { setEditing(false); setSaveError(null); }}>Cancel</Btn2>
            <Btn2
              primary
              onClick={handleSave}
              style={{
                opacity: (saving || !canSave) ? 0.45 : 1,
                pointerEvents: (saving || !canSave) ? 'none' : 'auto',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Btn2>
          </div>
        </div>
      </Card2>
    );
  }

  // ── Read view ─────────────────────────────────────────────────────────────
  var rel = relativeDate(liq.last_updated);

  return (
    <Card2 pad="18px 20px 16px">
      <SecHead n="05" right={
        <Btn2
          onClick={openEdit}
          style={{ padding: '4px 10px', fontSize: 11 }}
        >Update</Btn2>
      }>Liquidity</SecHead>

      {/* Large total balance */}
      <div style={{ margin: '12px 0 14px' }}>
        <Money size={36} weight={500} style={{ letterSpacing: '-0.03em', lineHeight: 1, display: 'block' }}>
          {eur(total)}
        </Money>
        <MonoTxt size={10} color={t.faint} style={{ letterSpacing: '0.1em', marginTop: 5 }}>
          AVAILABLE CAPITAL
        </MonoTxt>
      </div>

      {/* Liquidity / Realized split — only shown when realized > 0 */}
      {realized > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 12, borderBottom: '1px solid ' + t.hair, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: t.dim }}>Liquidity</span>
            <Money size={12.5} weight={600}>{eur(liquidity_eur)}</Money>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: t.dim }}>Realized</span>
            <Money size={12.5} weight={600} color={t.dim}>{eur(realized)}</Money>
          </div>
        </div>
      )}

      {/* TARGET row — hidden when cashTargetPct or totalValue is unavailable */}
      {target_eur != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
            <MonoTxt size={9.5} color={t.faint} style={{ letterSpacing: '0.12em' }}>TARGET</MonoTxt>
            <MonoTxt size={10.5} color={t.dim}>{cashTargetPct}% · {eur(target_eur)}</MonoTxt>
          </div>
          <span style={{ fontFamily: t.mono, fontSize: 11, fontWeight: 600, color: gapColor }}>
            {gapLabel}
          </span>
        </div>
      )}

      {/* Last updated */}
      <MonoTxt size={10} color={rel ? t.faint : t.ghost} style={{ marginTop: 4 }}>
        {rel ? 'Updated ' + rel : 'Never updated'}
      </MonoTxt>
    </Card2>
  );
}

window.LiquidityCard2 = LiquidityCard2;
