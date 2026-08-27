// Sends the daily reminders. Run by .github/workflows/reminders.yml on the hour.
//
// The push carries NO payload. The service worker composes the text from data
// that never leaves the device, so this script -- and the machine it runs on --
// only ever sees that an account wants reminders and at what local hour.
//
// Needs two secrets:
//   FIREBASE_SERVICE_ACCOUNT  the JSON key for a service account
//   VAPID_PRIVATE_KEY         the private half of the pair in index.html
import webpush from 'web-push';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const VAPID_PUBLIC = 'BLxhLPDHN5C9896npEynjWCnGpKkTuEUJZ7iN_dQjzCxj34jLCBmFrO5bXjQhUeggedU8rHwgNZm78xH1HVMYsI';
const CONTACT = 'mailto:yuri.hmhm@icloud.com';

const priv = process.env.VAPID_PRIVATE_KEY;
const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!priv || !svc) { console.error('missing VAPID_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }

webpush.setVapidDetails(CONTACT, VAPID_PUBLIC, priv);
initializeApp({ credential: cert(JSON.parse(svc)) });
const db = getFirestore();

// TEST_UID sends to exactly one account and ignores the clock, so the admin
// page can prove the whole chain works without waiting for a scheduled hour.
const TEST_UID = (process.env.TEST_UID || '').trim();
// FORCE ignores the clock for everyone. Only reachable from a hand-run of the
// workflow -- the schedule never sets it, so a scheduled run can never fire at
// the wrong hour because of this.
const FORCE = (process.env.FORCE || '').trim() === 'true';

// The workflow fires hourly in UTC; each subscription says which LOCAL hours it
// wants. Matching here rather than scheduling per timezone keeps one cron job.
//
// Three possible slots:
//   habit      ~30 min before the hour they usually study, only if not studied
//   evening    20:00, always -- a nudge if the day is open, a receipt if it is
//              already done
//   last call  22:00, and ONLY when a streak really ends tonight
// So somebody keeping their streak hears once, in the evening, and somebody
// about to break one hears three escalating things.
const nowUtcMin = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
const clamp = (v, lo, hi, dflt) =>
  Number.isFinite(v) && v >= lo && v <= hi ? v : dflt;

const snap = TEST_UID
  ? { docs: [await db.collection('push').doc(TEST_UID).get()].filter(d => d.exists), size: 1 }
  : await db.collection('push').get();
if (TEST_UID && !snap.docs.length) { console.log('no subscription for ' + TEST_UID); process.exit(0); }
let sent = 0, skipped = 0, dropped = 0;

for (const doc of snap.docs) {
  const d = doc.data();
  // What this run decided to send, if anything. Written back only after the
  // push actually goes out, so a failure is retried on the next run.
  let mark = null;
  if (!TEST_UID && !FORCE) {
    const tz = d.tzOffset || 0;
    const localMin = (nowUtcMin + tz + 1440 * 2) % 1440;
    // The user's own calendar day, computed the way the app's localDayIndex()
    // does it, so `lastDay` can be compared to it directly.
    const localDay = Math.floor((Date.now() + tz * 60000) / 86400000);
    const lastDay = Number.isFinite(d.lastDay) ? d.lastDay : -1;
    const studied = lastDay === localDay;

    // Aimed 30 minutes BEFORE the hour they usually study, so the reminder
    // stays in front of the habit rather than arriving after it.
    const aim = (clamp(d.studyMin, 0, 1439, 9 * 60) - 30 + 1440) % 1440;
    const evening = clamp(d.eveningHour, 0, 23, 20) * 60;
    const lastCall = clamp(d.lastCallHour, 0, 23, 22) * 60;

    const slots = [];
    if (!studied) slots.push(aim);
    // The evening slot fires either way. On a day that is already done it is a
    // receipt rather than a nudge -- which is the only notification somebody
    // who never misses a day would ever see, and without it the app is silent
    // for exactly the people who use it most.
    slots.push(evening);
    // Only when a live run really ends tonight.
    if (!studied && d.hasStreak === true && lastDay === localDay - 1) slots.push(lastCall);

    // The latest slot whose time has already passed. Matching the exact hour
    // was the bug: GitHub's scheduler is best-effort and skips hours -- there
    // are 10-hour gaps in this repo's own history -- so a slot whose hour was
    // missed was simply lost. Taking the latest passed slot instead means a
    // missed hour is picked up by whatever run comes next.
    const due = slots.filter(m => localMin >= m).sort((a, b) => b - a)[0];
    if (due === undefined) { skipped++; continue; }
    // ...and never twice for the same slot. `sentMin` is the slot's own time,
    // not the send time, so it stays monotonic even when a habit hour lands
    // after the evening one.
    if (d.sentDay === localDay && Number.isFinite(d.sentMin) && d.sentMin >= due) { skipped++; continue; }
    mark = { sentDay: localDay, sentMin: due };
  }

  try {
    await webpush.sendNotification(
      { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
      null,                        // no payload, by design
      { TTL: 3 * 60 * 60 }         // a reminder that arrives 3 hours late is noise
    );
    sent++;
    // Recorded after the send, so a push that failed is tried again rather
    // than being marked done.
    if (mark) { try { await doc.ref.set(mark, { merge: true }); } catch (e) { /* next run retries */ } }
  } catch (e) {
    // 404/410 mean the browser threw the subscription away (uninstalled, cleared
    // storage, permission revoked). Keeping it would fail forever.
    if (e.statusCode === 404 || e.statusCode === 410) {
      await doc.ref.delete();
      dropped++;
    } else {
      console.error('send failed for', doc.id, e.statusCode || e.message);
    }
  }
}
console.log(`sent=${sent} skipped=${skipped} dropped=${dropped} total=${snap.size}`);
