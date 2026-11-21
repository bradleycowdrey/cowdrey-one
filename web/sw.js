/* Cowdrey One service worker: keeps the app itself on the device so it opens offline.
   Pages and files from this site: from the cache at once, refreshed in the background for next time.
   Anything else (GitHub's releases API, the stores, the downloads) goes straight to the network. */
const CACHE = 'cowdrey-one-1.0.0';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'catalog.js', 'vendor/qrcode.js', 'manifest.webmanifest',
  'fonts/fraunces.woff2', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-64.png', 'bradley.jpg',
  'apps/bearings.png', 'apps/two-degrees.png', 'apps/meridian.png', 'apps/cowdrey-md.png', 'apps/cowdrey-pdf.png', 'apps/golden-hour.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cowdrey-one-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
    const fresh = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    try { return await fresh; }
    catch (err) {
      if (e.request.mode === 'navigate') { const page = await cache.match('index.html'); if (page) return page; }
      throw err;
    }
  }));
});
