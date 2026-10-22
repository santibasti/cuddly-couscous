/* Service worker: lets the app open offline and load fast.
   The app's data lives in the browser already, so once the files are cached everything works without a connection. */
const VERSION = 'v1';
const SHELL = `acr-shell-${VERSION}`;
const ASSETS = `acr-assets-${VERSION}`;
const FONTS = `acr-fonts-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'])).catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS, FONTS]);
      for (const key of await caches.keys()) if (key.startsWith('acr-') && !keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// The page asks to take over as soon as the person taps "Reload" on the update banner.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page loads: network first so a new release shows up, cached copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('./', copy));
          return res;
        })
        .catch(async () => (await caches.match('./')) || (await caches.match(req)) || Response.error()),
    );
    return;
  }

  // Built files have a hash in their name, so a cached copy never goes stale.
  if (url.origin === self.location.origin && url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(ASSETS).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Google Fonts: show the cached font immediately, refresh it in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS).then(async (cache) => {
        const hit = await cache.match(req);
        const refresh = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || refresh;
      }),
    );
    return;
  }

  // Icons, manifest and anything else from this site: cached copy first, then the network.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
  }
});
