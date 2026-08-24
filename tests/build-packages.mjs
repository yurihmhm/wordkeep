// Syncs the package catalogue in index.html with the files in packages/.
//
//   node tests/build-packages.mjs           sync + verify (writes index.html)
//   node tests/build-packages.mjs --check   verify only, never writes
//
// packages/<id>.json is the single source of truth. Drop a file in, run this,
// and the catalogue entry (id, version, word count, titles) is written for you.
// The catalogue stays the runtime authority on the version -- the app fetches
// ?v=<catalogue version> and stores that -- but a human only ever edits the
// file, so the two cannot drift.
//
// --check exists for the pre-commit hook: a hook that rewrites index.html after
// it has been staged would commit something different from what was verified.
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const LANGS = ['ja','en','zh','fr','ar','ko','ru'];
const CHECK = process.argv.includes('--check');
const root = new URL('../', import.meta.url);
const htmlPath = fileURLToPath(new URL('index.html', root));
const pkgDir = fileURLToPath(new URL('packages/', root));

let html = fs.readFileSync(htmlPath, 'utf8');
const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const m = /const PKG_CATALOG=(\[[\s\S]*?\n\]);/.exec(js);
if (!m) { console.error('PKG_CATALOG not found in index.html'); process.exit(1); }
const current = (0, eval)(m[1]);

const files = fs.readdirSync(pkgDir).filter(f => f.endsWith('.json')).sort();
let bad = 0;
const entries = [];

for (const f of files) {
  const id = f.replace(/\.json$/, '');
  let d;
  try { d = JSON.parse(fs.readFileSync(pkgDir + f, 'utf8')); }
  catch (e) { console.error(f + ': not valid JSON -- ' + e.message); bad++; continue; }

  const err = s => { console.error(f + ': ' + s); bad++; };
  if (d.id !== id) err('"id" is "' + d.id + '" but the filename says "' + id + '"');
  if (!Number.isInteger(d.v) || d.v < 1) err('"v" must be a whole number from 1 up (bump it when you change the words)');
  if (!d.title || typeof d.title !== 'object') err('no "title"');
  else { const miss = LANGS.filter(l => !d.title[l]); if (miss.length) err('title missing: ' + miss.join(', ')); }
  if (!Array.isArray(d.words) || !d.words.length) { err('no "words"'); continue; }

  const seen = new Set();
  for (const w of d.words) {
    if (!w || typeof w.word !== 'string' || !w.word.trim()) { err('a word has no spelling'); break; }
    if (seen.has(w.word)) { err('"' + w.word + '" appears twice (progress is keyed by the word, so duplicates collide)'); break; }
    seen.add(w.word);
    const miss = LANGS.filter(l => !w.meaning || !String(w.meaning[l] || '').trim());
    if (miss.length) { err('"' + w.word + '" has no meaning in: ' + miss.join(', ')); break; }
  }
  entries.push({ id, v: d.v, count: d.words.length, title: d.title });
}

// A file that vanished is not removed automatically: people have progress in it,
// and progress is kept even when the words are not on the device. Say so and let
// a human decide.
for (const c of current)
  if (!entries.some(e => e.id === c.id))
    console.warn('note: "' + c.id + '" is in the catalogue but has no file. Its entry was left alone '
               + '-- delete it by hand if the package is really retired (people may have progress in it).');
for (const c of current) if (!entries.some(e => e.id === c.id)) entries.push(c);

if (bad) { console.error('\n' + bad + ' problem(s). Nothing was written.'); process.exit(1); }

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const block = 'const PKG_CATALOG=[\n' + entries.map(e =>
  "  {id:'" + e.id + "',v:" + e.v + ",count:" + e.count + ",title:{" +
  LANGS.map(l => l + ":'" + esc(e.title[l]) + "'").join(',') + "}},").join('\n') + '\n];';

const before = m[0];
const after = block;
if (before.replace(/;$/, '') === after.replace(/;$/, '')) {
  console.log(entries.length + ' package(s) verified, catalogue already in sync');
  process.exit(0);
}
const added = entries.filter(e => !current.some(c => c.id === e.id)).map(e => e.id);
const changed = entries.filter(e => { const c = current.find(x => x.id === e.id);
  return c && (c.v !== e.v || c.count !== e.count || JSON.stringify(c.title) !== JSON.stringify(e.title)); }).map(e => e.id);

if (CHECK) {
  console.error('BLOCKED: the catalogue is out of date.');
  if (added.length)   console.error('  new package(s): ' + added.join(', '));
  if (changed.length) console.error('  changed: ' + changed.join(', '));
  console.error('  run: node tests/build-packages.mjs');
  process.exit(1);
}

const out = html.replace(before, after);
// Never hand back a file that will not parse.
const tmp = fileURLToPath(new URL('tests/check-pkg.js', root));
fs.writeFileSync(tmp, out.slice(out.lastIndexOf('<script>') + 8, out.lastIndexOf('</script>')));
const { execFileSync } = await import('node:child_process');
try { execFileSync('node', ['--check', tmp]); } finally { fs.unlinkSync(tmp); }
fs.writeFileSync(htmlPath, out);
console.log('catalogue updated: ' + entries.length + ' package(s)'
  + (added.length ? ' | added: ' + added.join(', ') : '')
  + (changed.length ? ' | updated: ' + changed.join(', ') : ''));
