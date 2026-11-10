// checkForUpdate() lifted out of index.html and run against a fake browser.
// It reloads the page, which is the one thing that cannot be exercised in a
// real one -- and a mistake here is either an app that never updates or one
// that reloads forever.
import fs from 'fs';
const app = fs.readFileSync('index.html', 'utf8');
const a = app.indexOf('async function checkForUpdate(){');
const b = app.indexOf('\n}\n', a);
if (a < 0 || b < 0) { console.error('index.html no longer has checkForUpdate()'); process.exit(1); }
const src = app.slice(a, b + 2);

function world(appVersion) {
  const store = {};
  const w = {
    served: appVersion, reloads: 0, cleared: 0, inRound: false, online: true,
    sessionStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  };
  w.window = { fetch: true, sessionStorage: w.sessionStorage,
               caches: { keys: async () => ['wordkeep-v8'], delete: async () => { w.cleared++; return true; } } };
  w.fetch = async () => { if (!w.online) throw new Error('offline'); return { ok: true, json: async () => ({ v: w.served }) }; };
  w.document = { body: { classList: { contains: c => c === 'in-round' && w.inRound } } };
  w.location = { reload: () => { w.reloads++; } };
  w.run = new Function('window', 'sessionStorage', 'fetch', 'caches', 'document', 'location', 'APP_VERSION', 'console',
    src + '; return checkForUpdate;')(w.window, w.sessionStorage, w.fetch, w.window.caches, w.document, w.location,
    appVersion, { warn() {} });
  return w;
}

let pass = 0, fail = 0;
async function t(name, fn) {
  let r; try { r = await fn(); } catch (e) { r = 'threw: ' + e.message; }
  if (r === true) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name + ' -- ' + r); }
}

console.log('\ncheckForUpdate');
await t('the current build does nothing', async () => {
  const w = world('5.0.0'); await w.run();
  return (w.reloads === 0 && w.cleared === 0) || 'reloaded with nothing new';
});
await t('a newer build drops the cache and reloads once', async () => {
  const w = world('5.0.0'); w.served = '5.0.1'; await w.run();
  return (w.reloads === 1 && w.cleared === 1) || `reloads=${w.reloads} cleared=${w.cleared}`;
});
await t('a reload that comes back stale does not loop', async () => {
  const w = world('5.0.0'); w.served = '5.0.1'; await w.run(); await w.run(); await w.run();
  return w.reloads === 1 || 'reloaded ' + w.reloads + ' times for one version';
});
await t('a second release in the same session is still taken', async () => {
  const w = world('5.0.0'); w.served = '5.0.1'; await w.run(); w.served = '5.0.2'; await w.run();
  return w.reloads === 2 || 'the later release was ignored (reloads=' + w.reloads + ')';
});
await t('never out from under a round in progress', async () => {
  const w = world('5.0.0'); w.served = '5.0.1'; w.inRound = true; await w.run();
  if (w.reloads !== 0) return 'reloaded mid-round';
  w.inRound = false; await w.run();
  return w.reloads === 1 || 'did not pick the update up once the round was over';
});
await t('offline keeps running what it has', async () => {
  const w = world('5.0.0'); w.online = false; await w.run();
  return w.reloads === 0 || 'reloaded while offline';
});
await t('a malformed answer is ignored', async () => {
  const w = world('5.0.0'); w.served = 12; await w.run();
  return w.reloads === 0 || 'reloaded on a non-string version';
});

console.log('\ncoming back to the app');
{
  const h = app.indexOf('const RESUME_HOME_AFTER=');
  const body = app.slice(h, app.indexOf('// Leaving the page:', h));
  await t('Home is redrawn when it was the screen left open', async () =>
    /if\(onHome\)renderHome\(\);/.test(body) || 'the handler no longer redraws Home');
  await t('a return checks for a new build and syncs', async () =>
    (/checkForUpdate\(\);/.test(body) && /cloudSync\('resume'\)/.test(body)) || 'the return no longer does what a launch does');
  await t('a round or an open sheet is left alone', async () =>
    (/in-round/.test(body) && /topOverlay\(\)/.test(body)) || 'a guard is gone');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
