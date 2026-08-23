// Regenerates packages/*.json from the catalogue in index.html and keeps the
// two versions in step. Run after editing package content.
//
// The version lives in the catalogue and is stamped into the file, so there is
// exactly one place to bump. Getting that backwards -- letting the file declare
// its own version -- makes a stale file re-download on every open, because the
// stored copy can never satisfy a catalogue that asks for more.
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const m = /const PKG_CATALOG=(\[[\s\S]*?\n\]);/.exec(js);
if (!m) { console.error('PKG_CATALOG not found'); process.exit(1); }
const cat = (0, eval)(m[1]);
const LANGS = ['ja','en','zh','fr','ar','ko','ru'];
let bad = 0;
for (const c of cat) {
  const f = fileURLToPath(new URL('packages/' + c.id + '.json', root));
  if (!fs.existsSync(f)) { console.error('missing file: ' + c.id); bad++; continue; }
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (d.id !== c.id) { console.error(c.id + ': id mismatch'); bad++; }
  if (d.words.length !== c.count) { console.error(c.id + ': count ' + c.count + ' but file has ' + d.words.length); bad++; }
  for (const l of LANGS) if (!c.title[l]) { console.error(c.id + ': catalogue title missing ' + l); bad++; }
  for (const w of d.words) {
    if (!w.word) { console.error(c.id + ': a word has no spelling'); bad++; break; }
    const miss = LANGS.filter(l => !w.meaning || !w.meaning[l]);
    if (miss.length) { console.error(c.id + '/' + w.word + ': meaning missing ' + miss.join(',')); bad++; break; }
  }
  // The file carries the catalogue's version so a hand-edited JSON cannot drift.
  if (d.v !== c.v) { d.v = c.v; fs.writeFileSync(f, JSON.stringify(d)); console.log(c.id + ': stamped v' + c.v); }
}
console.log(bad ? bad + ' problem(s)' : cat.length + ' package(s) verified');
process.exit(bad ? 1 : 0);
