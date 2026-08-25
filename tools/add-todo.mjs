// Adds an item to the board.
//
//   node tools/add-todo.mjs "<section>" "<title>" "<why / what>"
//   node tools/add-todo.mjs --sections
//
// Ideas raised in conversation are worth nothing if they are not written down
// before the conversation moves on. This exists so capturing one costs a single
// command, and so the same verification that close-todo.mjs does -- did the
// file actually change -- applies to adding too.
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../todo.html', import.meta.url));
let s = fs.readFileSync(path, 'utf8');
const strip = h => h.replace(/<[^>]+>/g, '').trim();

function sections() {
  const out = [];
  const re = /<div class="sec-head"><h2>([\s\S]*?)<\/h2>/g;
  let m;
  while ((m = re.exec(s))) out.push({ name: strip(m[1]), at: m.index });
  return out;
}

if (process.argv.includes('--sections')) {
  sections().forEach(x => console.log('  ' + x.name));
  process.exit(0);
}

const [section, title, body] = process.argv.slice(2);
if (!section || !title) { console.error('usage: add-todo.mjs "<section>" "<title>" ["<body>"]'); process.exit(1); }

const hits = sections().filter(x => x.name.includes(section));
if (hits.length !== 1) {
  console.error((hits.length ? 'ambiguous' : 'no section matching') + ': ' + section +
    '\nsections:\n' + sections().map(x => '  - ' + x.name).join('\n'));
  process.exit(1);
}

// The <ul> that follows this section heading.
const ulAt = s.indexOf('<ul>', hits[0].at);
if (ulAt < 0) { console.error('no <ul> under that section'); process.exit(1); }
const insertAt = ulAt + '<ul>'.length;

const esc = x => String(x).replace(/&(?!#?\w+;)/g, '&amp;');
const li = '\n      <li data-s="open">\n' +
  '        <span class="chip open">未完了</span>\n' +
  '        <div>\n' +
  '          <div class="t">' + esc(title) + '</div>\n' +
  '          <div class="d">' + esc(body || '') + '</div>\n' +
  '        </div>\n' +
  '      </li>';

const before = s.length;
s = s.slice(0, insertAt) + li + s.slice(insertAt);
if (s.length === before) { console.error('nothing inserted -- not writing'); process.exit(1); }
fs.writeFileSync(path, s);
const open = (s.match(/data-s="open"/g) || []).length;
console.log('added to 「' + hits[0].name + '」: ' + title + '  (open now ' + open + ')');
