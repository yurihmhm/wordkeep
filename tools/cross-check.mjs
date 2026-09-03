#!/usr/bin/env node
// Cross-package audit. add-package.mjs only ever sees the one package being
// filed, so it cannot know that "roster" already lives in another pack. This
// walks all of them at once and reports the same word, or the same meaning,
// appearing in two different packages -- in every language, not just Japanese.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const LANGS = ['ja', 'en', 'zh', 'fr', 'ar', 'ko', 'ru'];
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages');
const packs = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()
  .map(f => ({ id: f.slice(0, -5), data: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));

const only = process.argv[2] || null;
// Fold British/American spelling and the plural away, so "neighbour" and
// "neighbor" are seen as the one word they are.
const norm = s => String(s || '').trim().toLowerCase();
const wkey = s => norm(s).replace(/our\b/g, 'or').replace(/ise\b/g, 'ize').replace(/([bt])re\b/g, '$1er')
  .split(/\s+/).map(w => w.replace(/(?:ies)$/, 'y').replace(/(?:es|s)$/, '')).join(' ');
let issues = 0;

const byWord = new Map();
packs.forEach(p => (p.data.words || []).forEach(w => {
  const k = wkey(w.word);
  (byWord.get(k) || byWord.set(k, []).get(k)).push(p.id);
}));
const dupWords = [...byWord.entries()]
  .filter(([, ids]) => new Set(ids).size > 1)
  .filter(([, ids]) => !only || ids.includes(only));
if (dupWords.length) {
  issues += dupWords.length;
  console.log('\nSame word in more than one package (' + dupWords.length + '):');
  dupWords.forEach(([w, ids]) => console.log('  ' + w.padEnd(22) + [...new Set(ids)].join(', ')));
}

LANGS.forEach(lang => {
  const byMeaning = new Map();
  packs.forEach(p => (p.data.words || []).forEach(w => {
    const k = norm((w.meaning || {})[lang]);
    if (!k) return;
    (byMeaning.get(k) || byMeaning.set(k, []).get(k)).push(p.id + ':' + w.word);
  }));
  const dups = [...byMeaning.entries()]
    .filter(([, hits]) => new Set(hits.map(h => h.split(':')[0])).size > 1)
    .filter(([, hits]) => !only || hits.some(h => h.startsWith(only + ':')));
  if (!dups.length) return;
  issues += dups.length;
  console.log('\n[' + lang + '] same meaning across packages (' + dups.length + '):');
  dups.slice(0, 12).forEach(([m, hits]) => console.log('  ' + m.padEnd(26) + hits.join(' / ')));
  if (dups.length > 12) console.log('  ...and ' + (dups.length - 12) + ' more');
});

console.log(issues ? '\n' + issues + ' cross-package overlap(s)' + (only ? ' involving ' + only : '') : '\nno cross-package overlaps' + (only ? ' involving ' + only : ''));
