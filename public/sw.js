// SanoFarmacia — Service Worker (PWA, funcionamiento sin conexión)
const VERSION = 'sanofarmacia-v1.0.2';
const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const VIEWS = ['admin', 'card', 'cash', 'clients', 'dashboard', 'inventory', 'invoices', 'kiosk', 'loyalty', 'orders', 'pos', 'purchases', 'reports', 'rx', 'search', 'settings', 'shop'];
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/css/app.css',
  '/js/auth.js', '/js/client.js', '/js/demo.js', '/js/firebase.js', '/js/icons.js', '/js/install.js', '/js/main.js', '/js/ops.js', '/js/pay.js', '/js/pharma.js', '/js/shared.js', '/js/store.js', '/js/tour.js', '/js/utils.js', '/js/vendor/qrcode.js',
  ...VIEWS.map((v) => `/js/views/${v}.js`),
  '/assets/logo.svg', '/assets/icon-192.png', '/assets/icon-512.png', '/assets/favicon.png', '/assets/apple-touch-icon.png',
  SDK + 'firebase-app.js', SDK + 'firebase-auth.js', SDK + 'firebase-firestore.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => Promise.all(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch((e) => console.warn('[SW] precache', u, e)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(fallbackUrl || req, res.clone());
    return res;
  } catch (_) {
    return (await cache.match(fallbackUrl || req)) || (await cache.match('/index.html')) || Response.error();
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return cached || (await net) || Response.error();
}
async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req, '/index.html')); return; }
  if (url.origin === self.location.origin) {
    if (url.pathname === '/sw.js' || url.pathname.startsWith('/tutorial/')) return; // el video se transmite directo (rangos)
    if (/\.(js|css|webmanifest)$/.test(url.pathname)) { event.respondWith(networkFirst(req)); return; }
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (req.url.startsWith(SDK)) { event.respondWith(cacheFirst(req)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { event.respondWith(cacheFirst(req)); return; }
});
