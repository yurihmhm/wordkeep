// Moves all but the newest KEEP releases out of index.html and into
// changelog.json. Run after bumping the version; the inline list is meant to
// stay at KEEP entries, and it grows by one with every release.
//
// The guards are not decoration. An earlier version of this used a DOTALL
// non-greedy regex, which ran past its own entry and deleted the word package
// definitions. It writes nothing unless every check passes.
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const KEEP = 3;
const LANGS = ['ja','en','zh','fr','ar','ko','ru'];
const htmlPath = new URL('../index.html', import.meta.url);
const jsonPath = new URL('../changelog.json', import.meta.url);
let s = fs.readFileSync(htmlPath, 'utf8');
const before = s.length;

const ci = s.indexOf('const CHANGELOG=['), cend = s.indexOf('];', ci);
const entries = [...s.slice(ci, cend).matchAll(/\{version:'([^']+)'(?:,date:'([^']*)')?,keys:\[([^\]]*)\]\}/g)]
  .map(m => ({ version: m[1], date: m[2] || '', keys: [...m[3].matchAll(/'([^']+)'/g)].map(x => x[1]) }));
if (entries.length <= KEEP) { console.log('nothing to move (' + entries.length + ' inline)'); process.exit(0); }
const keep = entries.slice(0, KEEP), move = entries.slice(KEEP);
const moved = move.flatMap(e => e.keys);

const store = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
// One note per line, and no `s` flag: a dot that crosses newlines is what
// caused the deletion described above.
const pats = Object.fromEntries(moved.map(k => [k, new RegExp('^  ' + k + ':\\{.*\\},?[ \\t]*$\\n', 'm')]));
const unmatched = moved.filter(k => !pats[k].test(s));
if (unmatched.length) { console.error('not on a single line: ' + unmatched.join(', ')); process.exit(1); }

let removed = 0;
for (const k of moved) {
  const m = pats[k].exec(s);
  removed += m[0].length;
  const body = m[0].trim().replace(/,$/, '');
  const inner = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'));
  const d = {};
  for (const lm of inner.matchAll(/(\w+):(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g))
    d[lm[1]] = (lm[2] ?? lm[3]).replace(/\\(.)/g, '$1');
  const miss = LANGS.filter(l => !(l in d));
  if (miss.length) { console.error(k + ' missing ' + miss.join(',')); process.exit(1); }
  store.notes[k] = Object.fromEntries(LANGS.map(l => [l, d[l]]));
  s = s.slice(0, m.index) + s.slice(m.index + m[0].length);
}
if (before - s.length !== removed) { console.error('removed more than the matched lines'); process.exit(1); }
// Landmarks are things that must survive the edit. Keep them current: the
// package definitions used to be here and are now in packages/*.json, so
// checking for them would fail forever rather than catching anything.
for (const landmark of ['const PKG_CATALOG=[', 'const PACKAGES=PKG_CATALOG', 'function t(key', 'const T={'])
  if (!s.includes(landmark)) { console.error('landmark lost: ' + landmark); process.exit(1); }

store.versions = [...move.map(e => ({ version: e.version, date: e.date, keys: e.keys })), ...store.versions];
const ci2 = s.indexOf('const CHANGELOG=['), cend2 = s.indexOf('];', ci2);
s = s.slice(0, ci2) + 'const CHANGELOG=[\n' +
    keep.map(e => "  {version:'" + e.version + "',date:'" + e.date + "',keys:[" +
                  e.keys.map(k => "'" + k + "'").join(',') + ']},').join('\n') + '\n' + s.slice(cend2);

// fileURLToPath, not .pathname: the repo lives under a directory with a space
// in its name, and .pathname hands back the percent-encoded form.
const tmp = fileURLToPath(new URL('./check-trim.js', import.meta.url));
fs.writeFileSync(tmp, s.slice(s.lastIndexOf('<script>') + 8, s.lastIndexOf('</script>')));
try { execFileSync('node', ['--check', tmp]); } finally { fs.unlinkSync(tmp); }

fs.writeFileSync(jsonPath, JSON.stringify(store));
fs.writeFileSync(htmlPath, s);
console.log('moved ' + move.map(e => e.version).join(', ') + ' (' + moved.length + ' notes, ' + removed + ' chars)');
