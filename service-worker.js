// Minimal service worker for Wordkeep.
// Exists mainly so Chrome/Android treats the app as installable (the install
// banner needs a registered SW with a fetch handler), and as a bonus caches
// the app shell so it opens offline. Cache strategy is deliberately
// simple: cache the shell on install, serve navigations from cache when the
// network is unavailable.
const CACHE = 'wordkeep-v5';
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


/* ---- notifications --------------------------------------------------------
   The push that arrives carries no content. Everything the notification says is
   composed HERE, from a small blob the app mirrors into IndexedDB, so the
   server that sends the reminder never learns a single word anybody studies --
   the same line the admin page already respects.

   A service worker cannot read localStorage, which is where the app keeps its
   data, hence the mirror.
   -------------------------------------------------------------------------- */
const HINT_DB = 'wordkeep-notify';
const HINT_STORE = 'hint';

function readHint() {
  return new Promise(resolve => {
    let req;
    try { req = indexedDB.open(HINT_DB, 1); } catch (e) { return resolve(null); }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(HINT_STORE)) req.result.createObjectStore(HINT_STORE);
    };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HINT_STORE)) { db.close(); return resolve(null); }
      const g = db.transaction(HINT_STORE, 'readonly').objectStore(HINT_STORE).get('v1');
      g.onerror = () => { db.close(); resolve(null); };
      g.onsuccess = () => { db.close(); resolve(g.result || null); };
    };
  });
}

// Local calendar day, matching the app's own localDayIndex.
function dayIndex(ts) {
  const d = new Date(ts);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// What to say. Chosen from local state only.
function compose(hint) {
  const T = (hint && hint.t) || {};
  const say = (k, d) => T[k] || d;
  if (!hint) return { title: say('generic_t', 'Wordkeep'), body: say('generic_b', '') };

  const doneToday = hint.lastStudied != null && dayIndex(Date.now()) === hint.lastStudied;

  // A live streak that has not been fed today is the one thing that is actually
  // urgent -- it is the only state the user can lose by doing nothing.
  if (hint.streak > 0 && !doneToday)
    return { title: say('streak_t', '').replace('{0}', hint.streak),
             body:  say('streak_b', '') };

  // Otherwise ask about a word. Being asked something specific beats being told
  // there is work waiting.
  const words = hint.words || [];
  if (words.length) {
    const w = words[Math.floor(Math.random() * words.length)];
    return { title: say('word_t', '').replace('{0}', w.w),
             body:  say('word_b', '') , tag: 'word' };
  }
  if (hint.due > 0)
    return { title: say('due_t', '').replace('{0}', hint.due), body: say('due_b', '') };
  return { title: say('idle_t', 'Wordkeep'), body: say('idle_b', '') };
}

self.addEventListener('push', e => {
  e.waitUntil(readHint().then(hint => {
    const m = compose(hint);
    return self.registration.showNotification(m.title, {
      body: m.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: m.tag || 'wordkeep',
      renotify: false,
      data: { url: './' }
    });
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    // Focus a tab that is already open rather than stacking another one.
    for (const c of list) if ('focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
