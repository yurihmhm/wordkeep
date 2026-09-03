#!/usr/bin/env node
// Given candidate words on stdin (one per line), say which are already taken.
// Cheaper than filing a package and finding out afterwards.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages');
const taken = new Map();
fs.readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  (d.words || []).forEach(w => taken.set(String(w.word).trim().toLowerCase(), f.slice(0, -5)));
});
const cands = fs.readFileSync(0, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const hit = cands.filter(c => taken.has(c.toLowerCase()));
const free = cands.filter(c => !taken.has(c.toLowerCase()));
if (hit.length) { console.log('TAKEN (' + hit.length + '):'); hit.forEach(c => console.log('  ' + c.padEnd(22) + taken.get(c.toLowerCase()))); }
console.log('\nFREE (' + free.length + '):'); free.forEach(c => console.log('  ' + c));
