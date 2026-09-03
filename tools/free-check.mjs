#!/usr/bin/env node
// Given candidate words on stdin (one per line), say which are already taken.
// Cheaper than filing a package and finding out afterwards.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages');
// "neighbour" and "neighbor" are the same word, and so are "dietary
// requirement" and "dietary requirements". Comparing the raw strings let both
// pairs through and put a duplicate into a package. Fold the spelling and the
// plural away before comparing.
const key = s => String(s).trim().toLowerCase()
  .replace(/our\b/g, 'or').replace(/ise\b/g, 'ize').replace(/([bt])re\b/g, '$1er')
  .split(/\s+/).map(w => w.replace(/(?:ies)$/, 'y').replace(/(?:es|s)$/, '')).join(' ');
const taken = new Map();
fs.readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  (d.words || []).forEach(w => taken.set(key(w.word), f.slice(0, -5)));
});
const cands = fs.readFileSync(0, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const hit = cands.filter(c => taken.has(key(c)));
const free = cands.filter(c => !taken.has(key(c)));
if (hit.length) { console.log('TAKEN (' + hit.length + '):'); hit.forEach(c => console.log('  ' + c.padEnd(22) + taken.get(key(c)))); }
console.log('\nFREE (' + free.length + '):'); free.forEach(c => console.log('  ' + c));
