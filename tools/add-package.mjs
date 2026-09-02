// Files a package that Claude wrote in a chat, without the copy-into-a-file step.
//
//   pbpaste | node tools/add-package.mjs          copy the JSON, run this
//   node tools/add-package.mjs < some.json        or from a file
//
// The chat is asked for 50 words at a time, because 100 in one reply arrives
// with the second half translated carelessly and sometimes truncated. That
// means every package is two replies, and the second one has to LAND ON the
// first rather than replacing it -- which is the whole reason this exists.
//
//   reply 1  {"id":..,"v":1,"title":{..},"words":[50]}   creates the file
//   reply 2  {"id":..,"words":[50]}                      appends to it
//
// Both are handled by the same command, told apart by whether the file is
// already there. Nothing is written unless the result would pass the same
// checks tests/build-packages.mjs applies, so a bad reply cannot land a broken
// package and be discovered later by somebody studying it.
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const LANGS = ['ja', 'en', 'zh', 'fr', 'ar', 'ko', 'ru'];
const POS = ['noun', 'verb', 'adj', 'adv', 'phrase'];
const root = new URL('../', import.meta.url);
const pkgDir = fileURLToPath(new URL('packages/', root));

const die = m => { console.error('\n' + m + '\n'); process.exit(1); };

// ---- read whatever was pasted ---------------------------------------------
const raw = fs.readFileSync(0, 'utf8').trim();
if (!raw) die('Nothing on stdin. Copy the JSON from the chat, then:\n  pbpaste | node tools/add-package.mjs');

// A chat reply is usually clean JSON, but a stray "Here you go:" or a ```json
// fence should not send somebody back to the chat to tidy it by hand. Take the
// outermost {...} and let JSON.parse judge the rest.
const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
if (start < 0) die('No JSON found in what was pasted. Copy the whole reply, braces included.');
// A reply that ran out of room ends mid-word with no closing brace. Saying so
// beats "no JSON object found", because the fix is different: ask again rather
// than hunt for a typo.
if (end < start) die('The pasted JSON has no closing brace -- the reply was probably cut off.\nAsk the chat to send it again, or in two smaller pieces.');
let d;
try { d = JSON.parse(raw.slice(start, end + 1)); }
catch (e) { die('That is not valid JSON -- ' + e.message + '\nIf the reply was cut off, ask the chat to send it again.'); }

// ---- what did we get -------------------------------------------------------
if (!d.id || typeof d.id !== 'string') die('The JSON has no "id". Both replies must carry it, so this knows which package to file them under.');
if (!/^[a-z0-9_]+$/.test(d.id)) die('"' + d.id + '" is not a usable id. Lower-case letters, digits and underscores only.');
if (!Array.isArray(d.words) || !d.words.length) die('The JSON has no "words".');

const file = pkgDir + d.id + '.json';
const exists = fs.existsSync(file);

let out;
if (!exists) {
  if (!d.title || typeof d.title !== 'object') die('"' + d.id + '" is new, so this reply needs a "title" with all seven languages.');
  const miss = LANGS.filter(l => !String(d.title[l] || '').trim());
  if (miss.length) die('The title is missing: ' + miss.join(', '));
  out = { id: d.id, v: Number.isInteger(d.v) && d.v >= 1 ? d.v : 1, title: d.title, words: [] };
} else {
  out = JSON.parse(fs.readFileSync(file, 'utf8'));
  // A second reply may repeat the title; the file already has one and is the
  // authority, so it is ignored rather than overwritten with a re-translation.
}

// ---- merge -----------------------------------------------------------------
const before = out.words.length;
const seen = new Map(out.words.map(w => [w.word.toLowerCase(), true]));
const problems = [];
const dupes = [];
let added = 0;

d.words.forEach((w, i) => {
  const at = '#' + (i + 1);
  if (!w || typeof w.word !== 'string' || !w.word.trim()) { problems.push(at + ' has no "word"'); return; }
  const word = w.word.trim();
  const key = word.toLowerCase();
  // Duplicates are not a warning to skim past: progress is stored per WORD
  // inside a package, so two entries with the same spelling share one box and
  // one schedule. Dropped here, and named, because a repeat usually means the
  // second reply forgot what the first one covered.
  if (seen.has(key)) { dupes.push(word); return; }
  if (w.pos && POS.indexOf(w.pos) === -1) { problems.push('"' + word + '" has pos "' + w.pos + '" (expected one of ' + POS.join(', ') + ')'); return; }
  const miss = LANGS.filter(l => !w.meaning || !String(w.meaning[l] || '').trim());
  if (miss.length) { problems.push('"' + word + '" has no meaning in: ' + miss.join(', ')); return; }
  seen.set(key, true);
  out.words.push({ word, pos: w.pos || 'noun', meaning: Object.fromEntries(LANGS.map(l => [l, String(w.meaning[l]).trim()])) });
  added++;
});

if (problems.length) {
  console.error('\nNothing was written. ' + problems.length + ' problem(s):');
  problems.slice(0, 12).forEach(p => console.error('  ' + p));
  if (problems.length > 12) console.error('  ...and ' + (problems.length - 12) + ' more');
  console.error('\nAsk the chat to send those entries again with every language filled in.');
  process.exit(1);
}
if (!added) die('Every word in this reply is already in the package. Nothing to do.');

// ---- write, then let the existing script own the catalogue ------------------
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');

console.log('\n' + (exists ? 'appended to' : 'created') + '  packages/' + d.id + '.json');
console.log('  added   ' + added + (dupes.length ? '   (skipped ' + dupes.length + ' already there: ' + dupes.slice(0, 5).join(', ') + (dupes.length > 5 ? '…' : '') + ')' : ''));
console.log('  total   ' + out.words.length + (before ? '   (was ' + before + ')' : ''));

try {
  execFileSync('node', [fileURLToPath(new URL('tests/build-packages.mjs', root))], { stdio: 'inherit' });
} catch (e) {
  console.error('\nThe file was written but the catalogue sync failed. Run it yourself:\n  node tests/build-packages.mjs');
  process.exit(1);
}

if (out.words.length < 100)
  console.log('\nnext: ask the chat for the rest, then  pbpaste | node tools/add-package.mjs');
