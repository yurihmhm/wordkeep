// Exercises the send/skip decision from tools/send-reminders.mjs. The file
// talks to Firestore at import time, so the decision is lifted out of the
// source rather than imported -- which also means this test fails loudly if
// that block is ever edited into a different shape.
import fs from 'fs';
const src = fs.readFileSync('tools/send-reminders.mjs', 'utf8');
const from = src.indexOf('    const tz = d.tzOffset || 0;');
const to = src.indexOf('    mark = { sentDay: localDay, sentMin: due };');
if (from < 0 || to < 0) { console.error('send-reminders.mjs no longer has the slot block'); process.exit(1); }
const body = src.slice(from, to);

const clamp = (v, lo, hi, dflt) => Number.isFinite(v) && v >= lo && v <= hi ? v : dflt;
// Runs the real block with the clock and the document under our control, and
// reports what it decided: "skip", or the slot minute it would record.
function decide(d, localHourNow, minute) {
  const tz = d.tzOffset || 0;
  const localMin = localHourNow * 60 + (minute || 0);
  const nowUtcMin = (localMin - tz + 1440 * 2) % 1440;
  const localDayNow = Math.floor((Date.now() + tz * 60000) / 86400000);
  const FakeDate = { now: () => (localDayNow * 86400000) - tz * 60000 + localMin * 60000 };
  const fn = new Function('d', 'nowUtcMin', 'clamp', 'Date', `
    let skipped = 0;
    ${body.replace(/\{ skipped\+\+; continue; \}/g, '{ return "skip"; }')}
    return due;
  `);
  return fn(d, nowUtcMin, clamp, FakeDate);
}
const TODAY = tz => Math.floor((Date.now() + (tz || 0) * 60000) / 86400000);

let pass = 0, fail = 0;
const t = (n, f) => { try { const r = f(); if (r === true) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' -> ' + r); } } catch (e) { fail++; console.log('  FAIL ' + n + ' -> threw ' + e.message); } };
// Studies at 09:00, has a live streak, last studied yesterday.
const sub = o => ({ tzOffset: 540, studyMin: 9 * 60, eveningHour: 20, lastCallHour: 22,
                    lastDay: TODAY(540) - 1, hasStreak: true, ...o });
const HABIT = 8 * 60 + 30, EVE = 20 * 60, LAST = 22 * 60;

console.log('\nthe day is still open');
t('nothing before the first slot', () => decide(sub(), 7) === 'skip' || decide(sub(), 7));
t('habit fires once its time has passed', () => decide(sub(), 9) === HABIT || decide(sub(), 9));
t('evening supersedes habit later in the day', () => decide(sub(), 20) === EVE || decide(sub(), 20));
t('last call supersedes evening at 22', () => decide(sub(), 22) === LAST || decide(sub(), 22));

console.log('\na missed hour is picked up, not lost');
t('a run at 13:00 still delivers the missed habit slot', () =>
  decide(sub(), 13) === HABIT || decide(sub(), 13));
t('a run at 23:00 after a silent day delivers the last call', () =>
  decide(sub(), 23) === LAST || decide(sub(), 23));
t('the ten-hour gap this repo actually had is survivable', () => {
  // 02:50 -> 13:40 local: nothing due at 02:50, habit waiting at 13:40.
  const early = decide(sub(), 2, 50), late = decide(sub(), 13, 40);
  return (early === 'skip' && late === HABIT) || (early + '/' + late);
});

console.log('\nnothing sends twice');
t('the same slot is not sent again', () =>
  decide(sub({ sentDay: TODAY(540), sentMin: HABIT }), 9) === 'skip' || 'sent twice');
t('but the next slot still sends', () =>
  decide(sub({ sentDay: TODAY(540), sentMin: HABIT }), 20) === EVE || 'evening lost');
t('and the one after that', () =>
  decide(sub({ sentDay: TODAY(540), sentMin: EVE }), 22) === LAST || 'last call lost');
t('yesterday’s marker does not silence today', () =>
  decide(sub({ sentDay: TODAY(540) - 1, sentMin: LAST }), 9) === HABIT || 'silenced');
t('a habit hour later than the evening still cannot double-send', () => {
  const late = sub({ studyMin: 23 * 60, sentDay: TODAY(540), sentMin: 22 * 60 + 30 });
  return decide(late, 23, 40) === 'skip' || decide(late, 23, 40);
});

console.log('\nthe day is already done');
t('no habit reminder', () => {
  const d = sub({ lastDay: TODAY(540) });
  return decide(d, 9) === 'skip' || decide(d, 9);
});
t('but the evening receipt still goes out', () => {
  const d = sub({ lastDay: TODAY(540) });
  return decide(d, 20) === EVE || decide(d, 20);
});
t('and no last call, because nothing is at risk', () => {
  const d = sub({ lastDay: TODAY(540), sentDay: TODAY(540), sentMin: EVE });
  return decide(d, 22) === 'skip' || decide(d, 22);
});

console.log('\nthe last call is conditional');
t('never without a streak', () => {
  const d = sub({ hasStreak: false, sentDay: TODAY(540), sentMin: EVE });
  return decide(d, 22) === 'skip' || decide(d, 22);
});
t('never for a run that died days ago', () => {
  const d = sub({ lastDay: TODAY(540) - 6, sentDay: TODAY(540), sentMin: EVE });
  return decide(d, 22) === 'skip' || decide(d, 22);
});
t('a dormant user still gets the ordinary slots', () => {
  const d = sub({ lastDay: TODAY(540) - 6, hasStreak: false });
  return (decide(d, 9) === HABIT && decide(d, 20) === EVE) || 'ordinary slots lost';
});

console.log('\ntimezones');
t('UTC-5 gets its own evening, not ours', () => {
  const d = sub({ tzOffset: -300, lastDay: TODAY(-300) - 1 });
  return (decide(d, 20) === EVE && decide(d, 7) === 'skip') || 'wrong hour';
});
t('UTC+13 works across the date line', () => {
  const d = sub({ tzOffset: 780, lastDay: TODAY(780) - 1 });
  return decide(d, 22) === LAST || 'missed';
});

console.log('\ndefaults');
t('no study time yet falls back to 09:00 -> 08:30', () =>
  decide(sub({ studyMin: undefined }), 8, 45) === HABIT || decide(sub({ studyMin: undefined }), 8, 45));
t('a missing evening hour defaults to 20:00', () =>
  decide(sub({ eveningHour: undefined, sentDay: TODAY(540), sentMin: HABIT }), 20) === EVE || 'no default');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
