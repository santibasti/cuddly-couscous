/* TopMop Operations – offline shell. Caches the app so it opens with a weak or lost connection. */
const CACHE = 'topmop-shell-v1';
const SHELL = ['./', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png'];

// precache the shell plus the built JS / CSS the page references, so the very first offline reload works
async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(SHELL);
  try {
    const html = await (await fetch('./', { cache: 'reload' })).text();
    const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]))];
    await Promise.all(assets.map((a) => c.add(a).catch(() => undefined)));
  } catch { /* offline during install: runtime caching fills in later */ }
}
self.addEventListener('install', (e) => { e.waitUntil(precache().then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // newest page when online, cached shell when not
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return r; }).catch(() => caches.match('./', { ignoreVary: true })));
    return;
  }
  // built assets are content-hashed: serve from cache, fill the cache on first use
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});
