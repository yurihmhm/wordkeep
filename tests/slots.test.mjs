// Exercises the send/skip decision from tools/send-reminders.mjs. The file
// talks to Firestore at import time, so the decision is lifted out of the
// source rather than imported -- which also means this test fails loudly if
// that block is ever edited into a different shape.
import fs from 'fs';
const src = fs.readFileSync('tools/send-reminders.mjs', 'utf8');
const from = src.indexOf('const localMin = (nowUtcMin');
const to = src.indexOf('if (!slots.includes(localHour))');
if (from < 0 || to < 0) { console.error('send-reminders.mjs no longer has the slot block'); process.exit(1); }
const body = src.slice(from, to) + 'return slots.includes(localHour) ? "send" : "skip";';

const clamp = (v, lo, hi, dflt) => Number.isFinite(v) && v >= lo && v <= hi ? v : dflt;
// Runs the real block with the clock and the document under our control.
function decide(d, localHourNow) {
  const tz = d.tzOffset || 0;
  const nowUtcMin = (localHourNow * 60 - tz + 1440 * 2) % 1440;
  const fn = new Function('d', 'nowUtcMin', 'clamp', 'Date', `
    let skipped = 0;
    ${body.replace(/\{ skipped\+\+; continue; \}/g, '{ return "skip"; }')}
  `);
  const localDayNow = Math.floor((Date.now() + tz * 60000) / 86400000);
  const FakeDate = class extends Date {};
  FakeDate.now = () => (localDayNow * 86400000) - tz * 60000 + localHourNow * 3600000;
  return fn(d, nowUtcMin, clamp, FakeDate);
}
const TODAY = tz => Math.floor((Date.now() + (tz || 0) * 60000) / 86400000);

let pass = 0, fail = 0;
const t = (n, f) => { try { const r = f(); if (r === true) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' -> ' + r); } } catch (e) { fail++; console.log('  FAIL ' + n + ' -> threw ' + e.message); } };
// Studied yesterday, usually studies at 09:00, has a live streak.
const sub = o => ({ tzOffset: 540, studyMin: 9 * 60, eveningHour: 20, lastCallHour: 22,
                    lastDay: TODAY(540) - 1, hasStreak: true, ...o });

console.log('\nthe day is already done');
t('no reminder at any hour', () => {
  const d = sub({ lastDay: TODAY(540) });
  const sent = [8, 9, 20, 22].filter(h => decide(d, h) === 'send');
  return sent.length === 0 || 'sent at ' + sent.join(',');
});

console.log('\nthe habit slot aims 30 minutes early');
t('09:00 habit fires at 08:00, not 09:00', () =>
  (decide(sub(), 8) === 'send' && decide(sub(), 9) === 'skip') || decide(sub(), 8) + '/' + decide(sub(), 9));
t('00:15 wraps to 23:00 rather than going negative', () =>
  decide(sub({ studyMin: 15 }), 23) === 'send' || 'missed the wrap');
t('no study time yet falls back to 09:00 -> 08:30', () =>
  decide(sub({ studyMin: undefined }), 8) === 'send' || 'default aim wrong');

console.log('\nthe last call is conditional');
t('fires at 22 when a live run ends tonight', () =>
  decide(sub(), 22) === 'send' || 'did not fire');
t('does NOT fire without a streak', () =>
  decide(sub({ hasStreak: false }), 22) === 'skip' || 'fired anyway');
t('does NOT fire for a run that died days ago', () =>
  decide(sub({ lastDay: TODAY(540) - 6 }), 22) === 'skip' || 'fired anyway');
t('a dormant user still gets the ordinary slots', () => {
  const d = sub({ lastDay: TODAY(540) - 6, hasStreak: false });
  return (decide(d, 8) === 'send' && decide(d, 20) === 'send') || 'ordinary slots lost';
});
t('someone who never studied is not sent a last call', () =>
  decide(sub({ lastDay: -1, hasStreak: false }), 22) === 'skip' || 'fired anyway');

console.log('\ntimezones');
t('UTC-5 gets its own 20:00, not ours', () => {
  const d = sub({ tzOffset: -300, lastDay: TODAY(-300) - 1 });
  return (decide(d, 20) === 'send' && decide(d, 12) === 'skip') || 'wrong hour';
});
t('UTC+13 works across the date line', () => {
  const d = sub({ tzOffset: 780, lastDay: TODAY(780) - 1 });
  return decide(d, 22) === 'send' || 'missed';
});

console.log('\nlegacy subscriptions');
t('an old `hours` list is still honoured', () => {
  const d = sub({ hours: [7, 19] });
  return (decide(d, 7) === 'send' && decide(d, 8) === 'skip') || 'legacy list ignored';
});
t('but a finished day still silences it', () =>
  decide(sub({ hours: [7, 19], lastDay: TODAY(540) }), 7) === 'skip' || 'nagged anyway');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
