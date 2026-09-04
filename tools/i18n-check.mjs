#!/usr/bin/env node
// Sweeps the UI strings in index.html the way add-package.mjs sweeps a package.
//
//   node tools/i18n-check.mjs
//
// Three times now a gloss has shipped with the wrong alphabet inside it --
// "halturить" in Russian, 良し悪しを judge する in Japanese, "Читаете и пишете
// academic тексты". Each was written by hand, read once, and never looked at
// again, because only the Japanese column ever gets read. The package files are
// guarded; the interface strings were not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LANGS = ['ja', 'en', 'zh', 'fr', 'ar', 'ko', 'ru'];
// Written in Latin inside these scripts on purpose. Acronyms are handled by the
// all-caps rule below; these are the lowercase words that are genuinely borrowed.
const LOANWORDS = ['cookie', 'cookies', 'wifi', 'email', 'web', 'app', 'online', 'offline', 'internet', 'pt', 'pts'];
// Product names and keyboard keys are written in Latin in every language.
const PROPER = ['firestore', 'firebase', 'google', 'apple', 'safari', 'chrome', 'line',
  'enter', 'backspace', 'wordkeep', 'duolingo', 'ios', 'android', 'iphone', 'password'];
// Two strings are English by design: the bulk-import prompt and its example
// input. Flagging the English inside them would be flagging the feature.
const SKIP_KEYS = ['bulk_prompt_body', 'bulk_ph', 'leech_ph'];
// Release notes quote the English words a package teaches -- "get along",
// "actually", "kind of". That is the note doing its job, not a typo.
const SKIP_RE = /^(?:wn\d*|v\d{4}_\d+)$/;
const SCRIPTS = {
  ru: { re: /[Ѐ-ӿ]/, name: 'Cyrillic' },
  ar: { re: /[؀-ۿ]/, name: 'Arabic' },
  ko: { re: /[가-힯]/, name: 'Hangul' },
  zh: { re: /[一-鿿]/, name: 'Chinese' },
  ja: { re: /[぀-ヿ一-鿿]/, name: 'Japanese' }
};

const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

// One entry per line is the house style, so a line-wise read is enough and
// avoids trying to parse the whole object.
const entries = [];
for (const line of js.split('\n')) {
  const m = /^\s{2}([A-Za-z_][A-Za-z0-9_]*):\{(ja:.*)\},?\s*$/.exec(line);
  if (!m) continue;
  const key = m[1], body = m[2];
  const vals = {};
  for (const lang of LANGS) {
    const v = new RegExp("(?:^|,)" + lang + ":(?:'((?:\\\\.|[^'\\\\])*)'|\"((?:\\\\.|[^\"\\\\])*)\")").exec(body);
    if (v) vals[lang] = v[1] !== undefined ? v[1] : v[2];
  }
  entries.push({ key, vals });
}

let problems = 0;
const say = (kind, key, lang, detail) => {
  problems++;
  console.log('  [' + lang + '] ' + key + ' — ' + kind + (detail ? ': ' + detail : ''));
};

for (const { key, vals } of entries) {
  const missing = LANGS.filter(l => !(l in vals));
  if (missing.length) say('missing translation', key, missing.join(','), '');

  // Placeholders must line up, or {0} prints literally in one language only.
  // The SET of placeholders, not how many times each appears: the English
  // prompt uses {0} twice where the Japanese uses it once, and both are correct.
  const slots = s => [...new Set(String(s).match(/\{\d\}/g) || [])].sort().join('');
  const want = slots(vals.ja || '');
  for (const lang of LANGS) {
    if (!(lang in vals) || lang === 'ja') continue;
    if (slots(vals[lang]) !== want) say('placeholders differ from ja', key, lang, vals[lang]);
  }

  if (SKIP_KEYS.includes(key) || SKIP_RE.test(key)) continue;
  for (const [lang, sc] of Object.entries(SCRIPTS)) {
    const v = vals[lang];
    if (!v || !sc.re.test(v)) continue;
    const rest = v
      .replace(/\{\d\}/g, '')
      .replace(/<\/?[A-Za-z][^>]*>/g, '')
      .replace(/\b[A-Z][A-Za-z]*[A-Z][A-Za-z]*\b/g, '')   // CEFR, AI, PIN, LINE, GPA…
      .replace(/\b[A-Z]{1,6}\b/g, '')
      .replace(new RegExp('\\b(?:' + LOANWORDS.concat(PROPER).join('|') + ')\\b', 'gi'), '');
    if (/[a-z]{3,}/.test(rest)) say('Latin words inside ' + sc.name, key, lang, v.slice(0, 70));
  }
}

console.log(problems
  ? '\n' + problems + ' problem(s) across ' + entries.length + ' strings'
  : entries.length + ' interface strings checked, all clean');
process.exit(problems ? 1 : 0);
