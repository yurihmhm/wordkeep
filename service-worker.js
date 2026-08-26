// Minimal service worker for Wordkeep.
// Exists mainly so Chrome/Android treats the app as installable (the install
// banner needs a registered SW with a fetch handler), and as a bonus caches
// the app shell so it opens offline. Cache strategy is deliberately
// simple: cache the shell on install, serve navigations from cache when the
// network is unavailable.
const CACHE = 'wordkeep-v6';
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

// What to say. Chosen from local state only -- the push that woke us carries
// nothing, so everything below is read off this device.
//
// The slot is inferred from the clock rather than from the payload there isn't
// one of. That is enough: the sender only ever fires at the habit hour, at 20,
// and at 22, and the three want different things said.
const HABIT_UNTIL = 7;
function compose(hint, now) {
  const T = (hint && hint.t) || {};
  const say = (k, d) => T[k] || d;
  const out = (t, b, tag, renotify) => ({ title: t, body: b, tag: tag, renotify: !!renotify });
  if (!hint) return out(say('generic_t', 'Wordkeep'), say('generic_b', ''));

  now = now || new Date();
  const today = dayIndex(now.getTime());
  const last = hint.lastStudied;
  const doneToday = last != null && last === today;
  const freezes = hint.freezes || 0;
  const best = hint.longest || 0;
  const nextMs = hint.nextMs || HABIT_UNTIL;
  // The app only recomputes the streak when somebody next answers something, so
  // a run that died on Tuesday still reads as 12 on Friday. Believing that
  // number would have the notification congratulate people on a streak they no
  // longer have -- and being caught in that once is enough to make every later
  // notification worthless. A run counts as live only while it can still be
  // continued: yesterday, or the day before if a freeze can cover the gap.
  const alive = last != null &&
    (last >= today - 1 || (last === today - 2 && freezes > 0));
  const streak = alive ? (hint.streak || 0) : 0;
  const fill = (k, ...a) => { let v = say(k, ''); a.forEach((x, i) => { v = v.split('{' + i + '}').join(x); }); return v; };

  // Nothing left to ask for. Say what they earned instead of asking again --
  // the sender normally skips these entirely, so this is the case where a
  // device synced late and the push went out anyway.
  if (doneToday) {
    if (streak > 0)
      return out(fill('done_t', streak),
                 nextMs > streak ? fill('done_b', nextMs - streak, nextMs) : say('done_b', ''),
                 'wordkeep');
    return out(say('idle_t', 'Wordkeep'), say('idle_b', ''), 'wordkeep');
  }

  // The last call. 21:00 onward, and the ONLY place a loss is mentioned. It is
  // reached only when the streak really does end tonight, so:
  const lastCall = now.getHours() >= 21;
  const breaksTonight = streak > 0 && last === today - 1;
  if (lastCall && breaksTonight) {
    // ...unless a freeze is in hand, in which case it does not end tonight and
    // saying so would be a straight lie. What IS lost is the freeze, and that
    // is a real thing to lose: one a month, two at most.
    if (freezes > 0)
      return out(say('freeze_t', ''), fill('freeze_b', freezes), 'wordkeep', true);
    return out(fill('last_t', Math.max(1, 24 - now.getHours()), streak),
               say('last_b', ''), 'wordkeep', true);
  }

  // One or two days from a milestone. This is the strongest thing that can be
  // said to somebody who has never held a streak: day 6 is not "keep going",
  // it is "one more day and you have done the thing".
  if (streak > 0 && nextMs - streak <= 2)
    return out(fill('near_t', nextMs - streak, nextMs), say('near_b', ''), 'wordkeep');

  // Still building. Counted DOWN to seven rather than up from one: "day 3" is a
  // fact about the past, "four more days" is a reason to open the app.
  if (streak > 0 && streak < HABIT_UNTIL)
    return out(fill('build_t', streak, HABIT_UNTIL - streak), say('build_b', ''), 'wordkeep');

  if (streak > 0)
    return out(fill('streak_t', streak), say('streak_b', ''), 'wordkeep');

  // No streak. If they have held one before, their own best is the only target
  // they already know is reachable -- they reached it.
  if (best >= 2)
    return out(fill('back_t', best), say('back_b', ''), 'wordkeep');

  // Never held one. Ask about an actual word if there is one: being asked
  // something specific beats being told there is work waiting. Otherwise make
  // the first day the whole of the offer.
  const words = hint.words || [];
  if (words.length) {
    const w = words[Math.floor(Math.random() * words.length)];
    return out(fill('word_t', w.w), say('word_b', ''), 'word');
  }
  if (hint.due > 0) return out(fill('due_t', hint.due), say('due_b', ''), 'wordkeep');
  return out(say('start_t', ''), say('start_b', ''), 'wordkeep');
}

self.addEventListener('push', e => {
  e.waitUntil(readHint().then(hint => {
    const m = compose(hint, new Date());
    return self.registration.showNotification(m.title, {
      body: m.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: m.tag || 'wordkeep',
      // The evening nudge and the last call share a tag, so the later one
      // REPLACES the earlier rather than stacking two rows saying the same
      // thing. renotify is what makes that replacement alert again, and only
      // the last call earns it.
      renotify: !!m.renotify,
      data: { url: './' }
    });
  }));
});

// The same composition a push triggers, asked for from the page. Without this
// the only way to see a notification was to wait for a real send -- which meant
// the wording could not be checked at all, let alone the 22:00 one.
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'wk-preview') return;
  e.waitUntil(readHint().then(hint => {
    const m = compose(hint, new Date());
    return self.registration.showNotification(m.title, {
      body: m.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'wordkeep-preview',
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
