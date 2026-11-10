// Exercises compose() straight out of service-worker.js.
import fs from 'fs';
const src = fs.readFileSync('service-worker.js', 'utf8');
const cut = src.slice(src.indexOf('// Local calendar day'), src.indexOf("self.addEventListener('push'"));
const compose = eval(cut + '; compose');
const DAY = 86400000;
const dayIdx = ts => Math.floor(Date.UTC(new Date(ts).getFullYear(), new Date(ts).getMonth(), new Date(ts).getDate()) / DAY);

let pass = 0, fail = 0;
const pending = [];
// A check may return a promise -- the preview handler resolves through
// waitUntil -- so those are collected and settled before the summary.
const record = (n, r) => { if (r === true) { pass++; console.log('  PASS ' + n); }
                           else { fail++; console.log('  FAIL ' + n + ' -> ' + r); } };
const t = (n, f) => {
  try {
    const r = f();
    if (r && typeof r.then === 'function') pending.push(r.then(v => record(n, v), e => record(n, 'threw ' + e.message)));
    else record(n, r);
  } catch (e) { fail++; console.log('  FAIL ' + n + ' -> threw ' + e.message); }
};

// Templates carry their placeholders through so we can assert on substitution.
const T = { build_t:'D{0}/{1}left', build_b:'b', near_t:'near{0}/{1}', near_b:'nb',
  last_t:'last{0}h/{1}d', last_b:'lb', freeze_t:'freeze', freeze_b:'fz{0}',
  back_t:'best{0}', back_b:'bb', start_t:'start', start_b:'sb', hello_t:'welcome', hello_b:'hb',
  done_t:'done{0}!', done_b:'to{0}/{1}', done_b2:'keepgoing', streak_t:'streak{0}', streak_b:'sk',
  word_t:'word:{0}', word_b:'wb', due_t:'due{0}', due_b:'db', idle_t:'idle', idle_b:'ib' };
const at = h => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
const today = () => dayIdx(Date.now());
const hint = o => ({ t:T, streak:0, longest:0, nextMs:7, freezes:0, lastStudied:null, due:0, words:[], ...o });

console.log('\nalready studied today');
t('gets a reward, never a nudge', () => {
  const m = compose(hint({ streak:4, lastStudied:today(), nextMs:7 }), at(22));
  return (m.title === 'done4!' && m.body === 'to3/7') || JSON.stringify(m);
});
t('past the last milestone it never prints a raw placeholder', () => {
  const m = compose(hint({ streak:400, longest:400, lastStudied:today(), nextMs:null }), at(20));
  if (/\{\d\}/.test(m.title + m.body)) return 'placeholder leaked: ' + m.title + ' / ' + m.body;
  return m.body === 'keepgoing' || JSON.stringify(m);
});
t('no template anywhere keeps an unfilled placeholder', () => {
  const states = [
    { streak:3, longest:3, nextMs:7, lastStudied:today()-1 },
    { streak:6, longest:6, nextMs:7, lastStudied:today()-1 },
    { streak:12, longest:12, nextMs:30, freezes:0, lastStudied:today()-1 },
    { streak:12, longest:12, nextMs:30, freezes:2, lastStudied:today()-1 },
    { streak:0, longest:5, lastStudied:today()-4 },
    { streak:0, longest:0, lastStudied:null },
    { streak:0, longest:0, due:8 },
    { streak:9, longest:9, nextMs:30, lastStudied:today() },
    { streak:400, longest:400, nextMs:null, lastStudied:today() }
  ];
  for (const st of states) for (const h of [8, 20, 22]) {
    const m = compose(hint(st), at(h));
    if (/\{\d\}/.test(m.title + m.body)) return h + 'h ' + JSON.stringify(st) + ' -> ' + m.title + ' / ' + m.body;
  }
  return true;
});
t('no streak and done: nothing urgent', () => {
  const m = compose(hint({ lastStudied:today() }), at(20));
  return m.title === 'idle' || JSON.stringify(m);
});

console.log('\nlast call (22:00)');
t('fires only when the run really ends tonight', () => {
  const m = compose(hint({ streak:12, longest:12, nextMs:30, lastStudied:today()-1 }), at(22));
  return (m.title === 'last2h/12d' && m.renotify === true) || JSON.stringify(m);
});
t('a freeze in hand means it does NOT break -- says so instead', () => {
  const m = compose(hint({ streak:12, nextMs:30, freezes:2, lastStudied:today()-1 }), at(22));
  return (m.title === 'freeze' && m.body === 'fz2') || JSON.stringify(m);
});
t('a run that already died gets no loss-aversion line', () => {
  const m = compose(hint({ streak:12, longest:12, nextMs:30, lastStudied:today()-5 }), at(22));
  return m.title === 'best12' || JSON.stringify(m);
});
t('before 21:00 the same state is not a last call', () => {
  const m = compose(hint({ streak:12, nextMs:30, lastStudied:today()-1 }), at(20));
  return m.title === 'streak12' || JSON.stringify(m);
});
t('hours remaining is never zero or negative', () => {
  for (const h of [21,22,23]) {
    const m = compose(hint({ streak:9, nextMs:30, lastStudied:today()-1 }), at(h));
    const n = parseInt(/last(\d+)h/.exec(m.title)[1], 10);
    if (!(n >= 1)) return h + ' -> ' + m.title;
  }
  return true;
});

console.log('\nbuilding a first streak');
t('day 3 counts DOWN to seven', () => {
  const m = compose(hint({ streak:3, longest:3, nextMs:7, lastStudied:today()-1 }), at(20));
  return m.title === 'D3/4left' || JSON.stringify(m);
});
t('day 6 switches to the milestone that is one away', () => {
  const m = compose(hint({ streak:6, longest:6, nextMs:7, lastStudied:today()-1 }), at(20));
  return m.title === 'near1/7' || JSON.stringify(m);
});
t('day 5 is two away and also counts as near', () => {
  const m = compose(hint({ streak:5, longest:5, nextMs:7, lastStudied:today()-1 }), at(20));
  return m.title === 'near2/7' || JSON.stringify(m);
});
t('day 1 still counts down', () => {
  const m = compose(hint({ streak:1, longest:1, nextMs:7, lastStudied:today()-1 }), at(9));
  return m.title === 'D1/6left' || JSON.stringify(m);
});
t('day 29 is near the 30 milestone', () => {
  const m = compose(hint({ streak:29, longest:29, nextMs:30, lastStudied:today()-1 }), at(20));
  return m.title === 'near1/30' || JSON.stringify(m);
});

t('a freeze keeps a two-day gap alive', () => {
  const m = compose(hint({ streak:4, longest:4, nextMs:7, freezes:1, lastStudied:today()-2 }), at(20));
  return m.title === 'D4/3left' || JSON.stringify(m);
});
t('without a freeze the same gap is a dead run', () => {
  const m = compose(hint({ streak:4, longest:4, nextMs:7, freezes:0, lastStudied:today()-2 }), at(20));
  return m.title === 'best4' || JSON.stringify(m);
});
t('a streak with no study date at all is not believed', () => {
  const m = compose(hint({ streak:9, longest:9, nextMs:30, lastStudied:null }), at(20));
  return m.title === 'best9' || JSON.stringify(m);
});

console.log('\nno streak right now');
t('a personal best is offered back as the target', () => {
  const m = compose(hint({ streak:0, longest:5, lastStudied:today()-3 }), at(20));
  return m.title === 'best5' || JSON.stringify(m);
});
t('a best of 1 is not worth quoting', () => {
  const m = compose(hint({ streak:0, longest:1, words:[{w:'apple'}] }), at(20));
  return m.title === 'word:apple' || JSON.stringify(m);
});
t('never studied, has words: asks about one', () => {
  const m = compose(hint({ words:[{w:'adorable'}] }), at(9));
  return m.title === 'word:adorable' || JSON.stringify(m);
});
t('signed up and never started: welcomed, not asked the impossible', () => {
  const m = compose(hint({}), at(9));
  return (m.title === 'welcome' && m.body === 'hb') || JSON.stringify(m);
});
t('a broken streak with no words left is not welcomed again', () => {
  const m = compose(hint({ longest:4, lastStudied:today()-9 }), at(9));
  return m.title === 'best4' || JSON.stringify(m);
});
t('having words is enough to be asked one, welcome or not', () => {
  const m = compose(hint({ words:[{w:'apple'}] }), at(9));
  return m.title === 'word:apple' || JSON.stringify(m);
});
t('no words but reviews waiting', () => {
  const m = compose(hint({ due:8 }), at(9));
  return m.title === 'due8' || JSON.stringify(m);
});

console.log('\nrobustness');
t('a missing hint does not throw', () => {
  const m = compose(null, at(20));
  return m.title === 'Wordkeep' || JSON.stringify(m);
});
t('a hint with no strings still produces a notification', () => {
  const m = compose({ streak:3, nextMs:7, lastStudied:today()-1 }, at(20));
  return typeof m.title === 'string' || JSON.stringify(m);
});
t('only the last call re-alerts', () => {
  const quiet = [compose(hint({streak:3,nextMs:7,lastStudied:today()-1}), at(9)), compose(hint({streak:3,nextMs:7,lastStudied:today()-1}), at(20)),
                 compose(hint({streak:9,nextMs:30,lastStudied:today()}), at(22))];
  if (quiet.some(m => m.renotify)) return 'a quiet slot re-alerted';
  return compose(hint({streak:9,nextMs:30,lastStudied:today()-1}), at(22)).renotify === true || 'last call did not';
});

// Somebody who has stopped. The sender thins these to five in a fortnight; the
// point of the test is that no two of the five read the same, and that the
// last one is the only one that says goodbye.
console.log('\nsomebody who has stopped');
{
  const TL = { ...T, again_t:'again', again_b:'ab', wait_t:'wait', wait_b:'wtb',
               away_t:'away{0}', away_b:'awb', pause_t:'pause', pause_b:'pb' };
  const gone = (days, o) => compose({ ...hint({ lastStudied: today() - days, ...o }), t: TL }, at(9));
  t('two days away: start again', () => gone(2).title === 'again' || JSON.stringify(gone(2)));
  t('three and four days: no pressure', () =>
    (gone(3).title === 'wait' && gone(4).title === 'wait') || gone(3).title + '/' + gone(4).title);
  t('five days: a word of their own, asked as a question', () => {
    const m = gone(5, { words: [{ w:'resilient', m:'x' }] });
    return (m.title === 'word:resilient' && m.tag === 'word') || JSON.stringify(m);
  });
  t('five days with no words saved falls back rather than asking about nothing', () =>
    gone(5).title === 'wait' || JSON.stringify(gone(5)));
  t('a week: says how long, with the real number', () =>
    (gone(7).title === 'away7' && gone(9).title === 'away9') || gone(7).title + '/' + gone(9).title);
  t('a fortnight: the reminders are stopping', () =>
    (gone(14).title === 'pause' && gone(40).title === 'pause') || gone(14).title + '/' + gone(40).title);
  t('the five the sender actually sends are five different messages', () => {
    const five = [2, 3, 5, 7, 14].map(d => gone(d, { words: [{ w:'resilient', m:'x' }] }).title);
    return new Set(five).size === 5 || five.join(' | ');
  });
  t('a past best does not turn every one of them back into the same line', () => {
    const five = [2, 3, 5, 7, 14].map(d => gone(d, { longest: 30, words: [{ w:'resilient', m:'x' }] }).title);
    return (new Set(five).size === 5 && !five.includes('best30')) || five.join(' | ');
  });
  t('goodbye is never said to somebody who can still save a run', () => {
    // Missed yesterday, but a freeze covers it: the run is alive, so this is a
    // streak message, not a lapse one.
    const m = gone(2, { streak: 12, longest: 12, freezes: 1, nextMs: 14 });
    return !['again', 'wait', 'pause'].includes(m.title) || JSON.stringify(m);
  });
  t('one day away is still an ordinary reminder', () =>
    !['again', 'wait', 'pause'].includes(gone(1).title) || JSON.stringify(gone(1)));
  t('somebody who studied today is never told they have been away', () =>
    gone(0, { streak: 3 }).title === 'done3!' || JSON.stringify(gone(0, { streak: 3 })));
  t('a mirror from an older build keeps its old wording', () => {
    const m = compose(hint({ lastStudied: today() - 9, longest: 5 }), at(9));
    return m.title === 'best5' || JSON.stringify(m);
  });
  t('no raw placeholder reaches the lock screen', () => {
    const all = [2, 3, 5, 7, 14].map(d => gone(d)).map(m => m.title + m.body).join(' ');
    return !/\{\d\}/.test(all) || all;
  });
  t('the app hands the worker every string this needs', () => {
    const app = fs.readFileSync('index.html', 'utf8');
    const missing = ['again_t','again_b','wait_t','wait_b','away_t','away_b','pause_t','pause_b']
      .filter(k => !new RegExp(k + ":t\\('ntf_" + k + "'\\)").test(app));
    return missing.length === 0 || 'buildHint() is missing ' + missing.join(', ');
  });
}

// The sender can only be as right as the document the app last wrote. For 42
// versions the refresh was wired to the nickname form instead of to study, and
// nothing failed -- the reminders simply went on using the first day's data.
console.log('\nthe sender is kept up to date');
{
  const app = fs.readFileSync('index.html', 'utf8');
  const body = (name) => {
    const a = app.indexOf('async function ' + name + '(');
    if (a < 0) return '';
    const b = app.indexOf('\nasync function ', a + 10), c = app.indexOf('\nfunction ', a + 10);
    return app.slice(a, Math.min(b < 0 ? 1e9 : b, c < 0 ? 1e9 : c));
  };
  t('a finished sync refreshes the push document', () =>
    /refreshPushTime\(\)/.test(body('cloudSync')) || 'cloudSync no longer calls refreshPushTime()');
  t('...but not on the way out of an account', () =>
    /reason!=='logout'\)refreshPushTime\(\)/.test(body('cloudSync')) || 'the logout guard is gone');
  t('the refresh writes the endpoint, not just the hours', () => {
    const b = body('refreshPushTime');
    return (/endpoint:j\.endpoint/.test(b) && /getSubscription\(\)/.test(b) && /merge:true/.test(b)) || 'refreshPushTime no longer repairs the subscription';
  });
  t('the refresh carries what the sender decides from', () => {
    const b = body('refreshPushTime');
    return (/pushState\(\)/.test(b) && /tzOffset/.test(b) && /studyMin/.test(b)) || 'a field the sender reads is missing';
  });
}

await Promise.all(pending);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
