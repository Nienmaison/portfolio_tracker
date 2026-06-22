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

  F.thesis = [
    { ticker: 'NVDA', name: 'Nvidia', conviction: 'High', stance: 'Hold', target: '€1,300',
      argument: 'AI compute demand still outruns supply; data-center revenue compounding faster than the market prices in. Core long-term position.',
      triggers: ['Trim 25% above €1,300', 'Reassess if data-center growth <40% YoY', 'Add on any >15% drawdown'] },
    { ticker: 'BTC', name: 'Bitcoin', conviction: 'High', stance: 'Accumulate', target: '€110k',
      argument: 'Post-halving supply shock plus ETF inflows. Treating as a multi-year store-of-value sleeve, not a trade.',
      triggers: ['DCA €250/week', 'Take 20% off above €110k', 'Never exceed 35% of book'] },
    { ticker: 'ETH', name: 'Ethereum', conviction: 'Medium', stance: 'Hold', target: '€3,200',
      argument: 'Staking yield + L2 fee capture, but ETF flows lag BTC. Watching the rotation closely before adding.',
      triggers: ['Add below €2,200', 'Reassess if L2 fees decline 2 quarters'] },
    { ticker: 'VOO', name: 'Vanguard S&P 500', conviction: 'Medium', stance: 'Hold', target: '—',
      argument: 'The boring core. Automatic monthly buy regardless of price. This is the ballast.',
      triggers: ['€500/month auto-buy', 'Never sell'] },
  ];

  F.watchlist = [
    { ticker: 'AMD',  name: 'Advanced Micro Devices', conviction: 'Medium', note: 'Second-source AI compute. Waiting for a better entry below €130.', color: '#ED1C24' },
    { ticker: 'SOL',  name: 'Solana',                 conviction: 'Medium', note: 'High beta to crypto risk-on. Would start a position on a market-wide flush.', color: '#14F195' },
    { ticker: 'MSFT', name: 'Microsoft',              conviction: 'Low',    note: 'Quality compounder but fully valued. No edge here yet.', color: '#5BB4E5' },
  ];

  F.rules = [
    { title: 'Position sizing', lines: ['No single name above 35% of book', 'New positions start at 2–4%', 'Crypto sleeve capped at 45%'] },
    { title: 'Selling discipline', lines: ['Trim into strength, never panic-sell', 'Take profits in tranches of 20–25%', 'Tax-loss harvest in December'] },
  ];

  F.conversations = [
    { id: 1, title: 'Is my crypto allocation too high?', when: 'Today', tickers: ['BTC', 'ETH'], active: true },
    { id: 2, title: 'NVDA — trim or hold into earnings?', when: 'Today', tickers: ['NVDA'] },
    { id: 3, title: 'Rebalancing for Q3', when: 'Yesterday', tickers: ['VOO', 'BTC'] },
    { id: 4, title: 'Tax-loss harvesting plan', when: 'Mar 14', tickers: ['ETH'] },
  ];

  // A representative chat thread (for the active conversation)
  F.chatThread = [
    { who: 'user', text: 'Is my crypto allocation too high right now?' },
    { who: 'agent', text: 'Crypto is 42.5% of your €128,440 book (BTC 30.3%, ETH 12.2%). Your own rule caps the crypto sleeve at 45%, so you are inside your guardrail — but only just.\n\nBTC alone is 30.3%, approaching your 35% single-name ceiling. If BTC runs another ~15% without you trimming, you would breach it.' },
    { who: 'agent', card: { ticker: 'BTC', field: 'Suggested action', value: 'Trim 5% on strength', argument: 'Keeps you clear of the 35% single-name cap while staying long the thesis.', summary: 'Aligns with your “take 20% off above €110k” trigger.' } },
  ];

  // Chart sample: a watchlist of pickable tickers (holdings already exist)
  F.chartRanges = ['1W', '1M', '3M', '6M', '1Y'];

  F.connections = [
    { name: 'Finnhub', label: 'Stocks & ETFs', status: 'Connected', detail: 'USD → EUR auto-converted', ok: true },
    { name: 'CoinGecko', label: 'Crypto prices', status: 'Connected', detail: 'EUR direct', ok: true },
    { name: 'EUR / USD', label: 'FX rate', status: '€0.9210', detail: 'Refreshed 2m ago', ok: true },
    { name: 'GitHub', label: 'Portfolio sync', status: 'Synced', detail: 'portfolio.json · 2m ago', ok: true },
  ];
})();
