/* Service Worker — فلووسي FLOUSY
   Offline-first: precache app shell + runtime cache for local assets */
const VERSION = 'flosy-v4';
const ASSETS = `${VERSION}-assets`;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './src/main.js',
  './src/app.js',
  './src/styles/main.css',
  './src/utils/format.js',
  './src/utils/dates.js',
  './src/utils/dom.js',
  './src/database/db.js',
  './src/services/finance.js',
  './src/services/insights.js',
  './src/services/notifications.js',
  './src/services/recurring.js',
  './src/services/exporters.js',
  './src/services/seed.js',
  './src/charts/charts.js',
  './src/components/ui.js',
  './src/components/modals.js',
  './src/components/icons.js',
  './src/components/onboarding.js',
  './src/pages/dashboard.js',
  './src/pages/operations.js',
  './src/pages/accounts.js',
  './src/pages/budgets.js',
  './src/pages/goals.js',
  './src/pages/bills.js',
  './src/pages/stats.js',
  './src/pages/reports.js',
  './src/pages/settings.js',
  './assets/fonts/cairo-arabic-400-normal.woff2',
  './assets/fonts/cairo-arabic-600-normal.woff2',
  './assets/fonts/cairo-arabic-700-normal.woff2',
  './assets/fonts/cairo-arabic-800-normal.woff2',
  './assets/fonts/cairo-latin-400-normal.woff2',
  './assets/fonts/cairo-latin-700-normal.woff2',
  './assets/fonts/cairo-latin-800-normal.woff2',
  './assets/icons/favicon-16x16.png',
  './assets/icons/favicon-32x32.png',
  './assets/icons/favicon-48x48.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-144.png',
  './assets/icons/icon-256.png',
  './assets/icons/icon-384.png',
  './assets/icons/icon-1024.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSETS)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App navigation: network first, fallback to cached shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(ASSETS).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((hit) => hit || new Response('Offline', { status: 503, statusText: 'Offline' }))
        )
    );
    return;
  }

  // Static assets: cache first, then network (fill cache)
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && (url.pathname.startsWith('/src/') || url.pathname.startsWith('/assets/'))) {
          const copy = res.clone();
          caches.open(ASSETS).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
