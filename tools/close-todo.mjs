// Marks board items done, by title.
//
//   node tools/close-todo.mjs "<title>" "<version>" "<what shipped>"
//   node tools/close-todo.mjs --list        show every open item
//
// Exists because closing them with ad-hoc regexes kept missing entries -- one
// item carried an extra class and slipped past a pattern that assumed the exact
// shape, so it sat "open" for days after it shipped. This matches on the title
// alone, verifies the row actually changed, and refuses to write otherwise.
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../todo.html', import.meta.url));
let s = fs.readFileSync(path, 'utf8');
const strip = h => h.replace(/<[^>]+>/g, '').trim();

// Every <li>, whatever else is on it.
function items() {
  const out = [];
  const re = /<li\b([^>]*)>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(s))) {
    const t = /<div class="t">([\s\S]*?)<\/div>/.exec(m[2]);
    out.push({ start: m.index, end: m.index + m[0].length, attrs: m[1], html: m[0],
               open: /data-s="open"/.test(m[1]), title: t ? strip(t[1]) : '(no title)' });
  }
  return out;
}

if (process.argv.includes('--list')) {
  const open = items().filter(i => i.open);
  open.forEach((i, n) => console.log(String(n + 1).padStart(2) + '. ' + i.title));
  console.log('\n' + open.length + ' open');
  process.exit(0);
}

const [title, version, note] = process.argv.slice(2);
if (!title || !version) { console.error('usage: close-todo.mjs "<title>" "<version>" ["<note>"]'); process.exit(1); }

const hits = items().filter(i => i.open && i.title.includes(title));
if (!hits.length) {
  const near = items().filter(i => i.open).map(i => '  - ' + i.title).join('\n');
  console.error('no OPEN item matching: ' + title + '\nopen items:\n' + near);
  process.exit(1);
}
if (hits.length > 1) {
  console.error('ambiguous, matches ' + hits.length + ':\n' + hits.map(h => '  - ' + h.title).join('\n'));
  process.exit(1);
}

const it = hits[0];
let li = it.html
  .replace(/data-s="open"/, 'data-s="done"')
  .replace(/<span class="chip open">[^<]*<\/span>/, '<span class="chip done">完了</span>');
if (note) {
  li = li.replace(/(<div class="d">[\s\S]*?)(<\/div>)/,
    (_, body, close) => body + ' <b>→ ' + version + 'で対応：</b>' + note + close);
}
if (!/<div class="ver">/.test(li)) {
  li = li.replace(/(<\/div>\s*)<\/li>$/, '$1<div class="ver">' + version + '</div></li>');
}

// Refuse to write unless the row really flipped.
if (li === it.html) { console.error('nothing changed -- not writing'); process.exit(1); }
if (/data-s="open"/.test(li) || /chip open/.test(li)) { console.error('row still looks open -- not writing'); process.exit(1); }

s = s.slice(0, it.start) + li + s.slice(it.end);
fs.writeFileSync(path, s);
const left = items().filter(i => i.open).length;
console.log('closed: ' + it.title + '  (open now ' + left + ')');
