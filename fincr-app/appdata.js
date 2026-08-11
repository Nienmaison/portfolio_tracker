/* Fincr app — extra sample data for Agent, Charts, Import tabs.
   Extends window.FINCR (data.js must load first). */
(function () {
  const F = window.FINCR;

  // Single-user owner identity. Shape mirrors send_email.py ACCOUNT_DEFAULT
  // ({name, avatar}) so the SaaS migration only swaps how this is populated,
  // not the shape or the components that read it. See decision [C2-D55].
  // INTERIM single-user value - at multi-user time this is hydrated from the
  // backend (planned GET /account route), not a literal here.
  // avatar: empty string means derive from name - first letter uppercased,
  // matching the email convention (send_email.py:238).
  F.account = { name: "Daan", avatar: "" };

  // F.thesis is now live-fetched + transformed from GET /thesis by
  // fincr-v2/thesis-adapter.js (Spec C2-S2, C2-D60). The old 4-item sample
  // (NVDA/BTC/ETH/VOO) is removed from the startup path; default to [] so the
  // Positions tab always has a valid array before the adapter resolves and on
  // no-key devices. F.rules (the old decision-rules fixture) is removed here:
  // C2-D145 repointed positions2.jsx's Decision Rules card to the real
  // F.decisionRules (thesis-adapter.js / thesis.json decision_rules), and
  // F.rules had no other reader in the codebase. F.watchlist (the AMD/SOL/MSFT
  // sample below) is removed the same way, for the same reason, as of the
  // Watchlist Frontend build: thesis-adapter.js now sets F.watchlist for real
  // from thesis.json's watchlist section (Object.entries -> array, same shape
  // as this file's own F.thesis pattern above), and F.watchlist had no other
  // reader in the codebase besides positions2.jsx's Watchlist section, which
  // is now repointed to the real data.
  F.thesis = [];

  F.conversations = []; // C2-S4b: agent2.jsx is now live
  F.chatThread = [];

  // Chart sample: a watchlist of pickable tickers (holdings already exist)
  F.chartRanges = ['1W', '1M', '3M', '6M', '1Y'];

  F.connections = [
    { name: 'Finnhub', label: 'Stocks & ETFs', status: 'Connected', detail: 'USD → EUR auto-converted', ok: true },
    { name: 'CoinGecko', label: 'Crypto prices', status: 'Connected', detail: 'EUR direct', ok: true },
    { name: 'EUR / USD', label: 'FX rate', status: '€0.9210', detail: 'Refreshed 2m ago', ok: true },
    { name: 'GitHub', label: 'Portfolio sync', status: 'Synced', detail: 'portfolio.json · 2m ago', ok: true },
  ];
})();
