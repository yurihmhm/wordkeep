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
// fence should not send somebody back to the chat to tidy it by hand -- and
// nor should having copied BOTH replies at once, which is the natural thing to
// do once the two are sitting there in the conversation. So: find every
// top-level {...} in what was pasted and apply them in order.
//
// Brace counting has to ignore braces inside strings, because a meaning may
// contain one, and has to respect backslash escapes so a \" does not look like
// the end of a string.
function topLevelObjects(text) {
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') { if (depth === 0) start = i; depth++; continue; }
    if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) { out.push(text.slice(start, i + 1)); start = -1; }
      // A stray closing brace in prose would take depth negative; ignore it.
      if (depth < 0) depth = 0;
    }
  }
  // depth > 0 at the end means the last object never closed.
  return { objects: out, truncated: depth > 0 || start >= 0 };
}

const found = topLevelObjects(raw);
if (!found.objects.length) {
  if (found.truncated) die('The pasted JSON never closes -- the reply was probably cut off.\nAsk the chat to send it again, or in two smaller pieces.');
  die('No JSON found in what was pasted. Copy the whole reply, braces included.');
}
if (found.truncated) console.error('note: there is an unfinished object after the last complete one -- it was ignored.');

const replies = [];
found.objects.forEach((txt, i) => {
  try { replies.push(JSON.parse(txt)); }
  catch (e) { die('Block ' + (i + 1) + ' of ' + found.objects.length + ' is not valid JSON -- ' + e.message); }
});

// Each block is filed in turn, so pasting reply 1 and reply 2 together does
// exactly what pasting them one after the other would.
let filed = 0;
for (const d of replies) { fileOne(d); filed++; }
if (filed > 1) console.log('\n' + filed + ' blocks filed.');

function fileOne(d) {
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

// ---- what the schema cannot catch ------------------------------------------
// Two words sharing a meaning is not a broken file, so it does not block. It is
// still a real defect: four-choice draws its wrong answers from the same
// package, so "sure" and "of course" both meaning もちろん can appear in one
// question with two correct answers and no way to pick right. Named here
// because it is invisible until somebody fails a question they knew.
// Each language has a script it is supposed to be written in. A meaning that
// carries stray Latin letters is almost always a half-typed word -- the kind of
// slip that survives forever because nobody reads the Russian column.
const LOANWORDS = ['cookie', 'cookies', 'wifi', 'email', 'web', 'app', 'online', 'offline', 'internet'];
const SCRIPTS = {
  ru: { re: /[\u0400-\u04ff]/, stray: /[A-Za-z]/, name: 'Cyrillic' },
  ar: { re: /[\u0600-\u06ff]/, stray: /[A-Za-z]/, name: 'Arabic' },
  ko: { re: /[\uac00-\ud7af]/, stray: /[A-Za-z]/, name: 'Hangul' },
  zh: { re: /[\u4e00-\u9fff]/, stray: /[A-Za-z]/, name: 'Chinese' },
  ja: { re: /[\u3040-\u30ff\u4e00-\u9fff]/, stray: /[A-Za-z]/, name: 'Japanese' }
};
Object.entries(SCRIPTS).forEach(([lang, sc]) => {
  const bad = out.words.filter(w => {
    const v = String((w.meaning || {})[lang] || '');
    // Acronyms and a few loanwords are genuinely written in Latin inside these
    // scripts -- "QR-код" and "файл cookie" are how Russian actually spells
    // them. Strip those before deciding anything is a typo.
    const rest = v.replace(/\b[A-Z]{2,6}\b/g, '')
      .replace(new RegExp('\\b(?:' + LOANWORDS.join('|') + ')\\b', 'gi'), '');
    return sc.stray.test(rest) && sc.re.test(v);
  });
  if (!bad.length) return;
  console.log('\n  [' + lang + '] ' + bad.length + ' meaning(s) mix Latin letters into ' + sc.name + ':');
  bad.slice(0, 8).forEach(w => console.log('    ' + w.word + '  →  ' + w.meaning[lang]));
  console.log('  This is usually a typo. Check them.');
});

// Checked in EVERY language, not just Japanese. Someone studying in Korean hits
// the same broken question as someone studying in Japanese, and until now only
// the Japanese column was ever looked at -- so a collision in the other six
// could sit there forever without anybody noticing.
LANGS.forEach(lang => {
  const byMeaning = new Map();
  out.words.forEach(w => {
    const k = String((w.meaning || {})[lang] || '').trim();
    if (!k) return;
    (byMeaning.get(k) || byMeaning.set(k, []).get(k)).push(w.word);
  });
  const collisions = [...byMeaning.entries()].filter(([, ws]) => ws.length > 1);
  if (!collisions.length) return;
  console.log('\n  [' + lang + '] ' + collisions.length + ' meaning(s) used by more than one word:');
  collisions.slice(0, 8).forEach(([m, ws]) => console.log('    ' + m + '  ←  ' + ws.join(' / ')));
  if (collisions.length > 8) console.log('    ...and ' + (collisions.length - 8) + ' more');
  console.log('  Four-choice would offer both as answers to somebody studying in ' + lang + '.');
});
// The package is meant to land on exactly 100. Say where it stands rather than
// leaving it to be noticed weeks later in the catalogue.
if (added !== 50) console.log('\n  note: this block had ' + added + ' new words, not 50.');
if (out.words.length > 100) console.log('  note: the package is now ' + out.words.length + ' words -- 100 was the target.');

try {
  execFileSync('node', [fileURLToPath(new URL('tests/build-packages.mjs', root))], { stdio: 'inherit' });
} catch (e) {
  console.error('\nThe file was written but the catalogue sync failed. Run it yourself:\n  node tests/build-packages.mjs');
  process.exit(1);
}

if (out.words.length < 100)
  console.log('\nnext: ask the chat for the rest, then paste it the same way');
}
