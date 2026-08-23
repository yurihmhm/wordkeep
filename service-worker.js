// Minimal service worker for Wordkeep.
// Exists mainly so Chrome/Android treats the app as installable (the install
// banner needs a registered SW with a fetch handler), and as a bonus caches
// the app shell so it opens offline. Cache strategy is deliberately
// simple: cache the shell on install, serve navigations from cache when the
// network is unavailable.
const CACHE = 'wordkeep-v4';
const ASSETS = ['./index.html', './manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // For page navigations, try the network first (so updates land), fall back
  // to the cached page when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      // GitHub Pages sends Cache-Control: max-age=600, so a plain fetch()
      // here could silently replay a stale index.html for up to 10 minutes
      // after a deploy -- 'no-cache' forces the browser to revalidate with
      // the server (a cheap conditional request) instead of trusting that.
      fetch(req, { cache: 'no-cache' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  // Other same-origin GETs: cache-first, and keep what the network returns.
  // changelog.json is deliberately NOT precached -- it is 138KB that most
  // people never open -- but once someone has asked for it, holding on to it
  // means the back catalogue still opens offline and is not re-fetched.
  if (new URL(req.url).origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }))
    );
  }
});
