// sw.js — Financial Control Room Service Worker
//
// Cache strategy:
//   App shell (index.html, icons, manifest) → cache-first, background update
//   fincr.duckdns.org, finnhub.io, coingecko, anthropic → network-only (live data)
//   CDN scripts → cache-first, background update
//
// Bump CACHE_VERSION after any significant frontend change to force a full
// cache flush on all clients.

const CACHE_VERSION = 'fincr-v29'; // C2-D100 pool ledger UI + POST /pool/event (poolledger2 + store2 + thesis-adapter + settings2 + index)

const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Hosts that must never be served from cache — stale prices or stale API
// responses would be actively harmful
const NEVER_CACHE_HOSTS = [
  'fincr.duckdns.org',
  'finnhub.io',
  'api.coingecko.com',
  'api.anthropic.com'
];

// Install: pre-cache the app shell so the dashboard loads offline
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())  // activate immediately
  );
});

// Activate: remove any old cache versions from previous deployments
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: route by hostname, then cache-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Live data — bypass cache entirely
  if (NEVER_CACHE_HOSTS.includes(url.hostname)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first with background update
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const toCache = response.clone();
            caches.open(CACHE_VERSION)
              .then(cache => cache.put(event.request, toCache));
          }
          return response;
        })
        .catch(() => null);

      return cached || networkFetch;
    })
  );
});
