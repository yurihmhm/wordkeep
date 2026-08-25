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
  if (!TEST_UID && !FORCE) {
    const localMin = (nowUtcMin + (d.tzOffset || 0) + 1440 * 2) % 1440;
    // Two sends, with different jobs. The first is aimed at the hour this
    // person actually studies -- a reminder that lands when they are already in
    // the habit of opening the app beats one that lands when the schedule says
    // so. The second is the last call before the day ends, and that one is
    // fixed because its timing is about the deadline, not about them.
    //
    // Matched to the hour: the workflow only runs hourly, so aiming finer than
    // that would just mean missing.
    const studyHour   = Math.floor(clamp(d.studyMin, 0, 1439, 9 * 60) / 60);
    const eveningHour = clamp(d.eveningHour, 0, 23, 20);
    // Legacy subscriptions still carry `hours`; honour them until they refresh.
    const wanted = Array.isArray(d.hours) && d.hours.length
      ? d.hours
      : [studyHour, eveningHour];
    if (!wanted.includes(Math.floor(localMin / 60))) { skipped++; continue; }
  }

  try {
    await webpush.sendNotification(
      { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
      null,                        // no payload, by design
      { TTL: 3 * 60 * 60 }         // a reminder that arrives 3 hours late is noise
    );
    sent++;
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
