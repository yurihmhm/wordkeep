import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const ADMIN = '5shCkAHirbgDVrkDmcM0KNr0ouq1';
const ALICE = 'alice_uid';
const BOB   = 'bob_uid';
const WEEK  = 7 * 24 * 60 * 60 * 1000;

const env = await initializeTestEnvironment({
  projectId: 'wordkeep-bb145',
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8099 },
});

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '  -> ' + (e.message || e).split('\n')[0]); fail++; }
}

const alice = env.authenticatedContext(ALICE).firestore();
const bob   = env.authenticatedContext(BOB).firestore();
const admin = env.authenticatedContext(ADMIN).firestore();
const anon  = env.unauthenticatedContext().firestore();

// Seed as a privileged context so setup never depends on the rules under test.
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', ALICE), { username: 'alice', wordCount: 2, wordIds: ['w1', 'w2'] });
  await setDoc(doc(db, 'users', ALICE, 'words', 'w1'), { id: 'w1', word: 'important' });
  await setDoc(doc(db, 'users', ALICE, 'words', 'w2'), { id: 'w2', word: 'weather' });
});

console.log('\nownership');
await check('owner reads own summary',      () => assertSucceeds(getDoc(doc(alice, 'users', ALICE))));
await check('owner reads own words',        () => assertSucceeds(getDocs(collection(alice, 'users', ALICE, 'words'))));
await check('other user cannot read summary', () => assertFails(getDoc(doc(bob, 'users', ALICE))));
await check('other user cannot read words',   () => assertFails(getDocs(collection(bob, 'users', ALICE, 'words'))));
await check('signed out cannot read',       () => assertFails(getDoc(doc(anon, 'users', ALICE))));
await check('other user cannot delete words', () => assertFails(deleteDoc(doc(bob, 'users', ALICE, 'words', 'w1'))));

console.log('\nadmin: can manage accounts, cannot read study content');
await check('admin reads summary',          () => assertSucceeds(getDoc(doc(admin, 'users', ALICE))));
await check('admin CANNOT read a word',     () => assertFails(getDoc(doc(admin, 'users', ALICE, 'words', 'w1'))));
await check('admin CANNOT list words',      () => assertFails(getDocs(collection(admin, 'users', ALICE, 'words'))));
await check('admin CAN delete a word by id',() => assertSucceeds(deleteDoc(doc(admin, 'users', ALICE, 'words', 'w1'))));
await check('admin CAN delete the summary', () => assertSucceeds(deleteDoc(doc(admin, 'users', ALICE))));
await check('admin CANNOT write a summary', () => assertFails(setDoc(doc(admin, 'users', BOB), { username: 'x' })));

console.log('\nnickname cooldown');
await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), 'users', BOB), { username: 'bob' });
});
await check('first nickname allowed (none set yet)',
  () => assertSucceeds(setDoc(doc(bob, 'users', BOB), { username: 'bob', nickname: 'ボブ', nicknameAt: Date.now() }, { merge: true })));
await check('immediate rename DENIED',
  () => assertFails(setDoc(doc(bob, 'users', BOB), { nickname: 'べつの名前', nicknameAt: Date.now() }, { merge: true })));
const bobAt = (await getDoc(doc(bob, 'users', BOB))).data().nicknameAt;
await check('routine sync (nickname unchanged) allowed',
  () => assertSucceeds(setDoc(doc(bob, 'users', BOB), { nickname: 'ボブ', nicknameAt: bobAt, wordCount: 9 }, { merge: true })));
await check('sync that omits nickname entirely allowed',
  () => assertSucceeds(setDoc(doc(bob, 'users', BOB), { wordCount: 12, updatedAt: Date.now() }, { merge: true })));
await check('rename DENIED even if client back-dates nicknameAt',
  () => assertFails(setDoc(doc(bob, 'users', BOB), { nickname: 'ずるい名前', nicknameAt: Date.now() - 99 * WEEK }, { merge: true })));

await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), 'users', BOB), { nicknameAt: Date.now() - WEEK - 1000 }, { merge: true });
});
await check('rename allowed once 7 days have passed',
  () => assertSucceeds(setDoc(doc(bob, 'users', BOB), { nickname: 'あたらしい名前', nicknameAt: Date.now() }, { merge: true })));

console.log('\nowner can delete their own data');
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', BOB, 'words', 'bw1'), { id: 'bw1', word: 'travel' });
});
await check('owner deletes own word',    () => assertSucceeds(deleteDoc(doc(bob, 'users', BOB, 'words', 'bw1'))));
await check('owner deletes own summary', () => assertSucceeds(deleteDoc(doc(bob, 'users', BOB))));

console.log('\nfeedback');
const fid = 'f' + Date.now();
await check('anyone may send feedback',     () => assertSucceeds(setDoc(doc(anon, 'feedback', fid), { text: 'hello' })));
await check('empty feedback rejected',      () => assertFails(setDoc(doc(anon, 'feedback', 'f2'), { text: '' })));
await check('oversized feedback rejected',  () => assertFails(setDoc(doc(anon, 'feedback', 'f3'), { text: 'x'.repeat(2001) })));
await check('non-admin cannot read feedback', () => assertFails(getDoc(doc(alice, 'feedback', fid))));
await check('admin reads feedback',         () => assertSucceeds(getDoc(doc(admin, 'feedback', fid))));

await env.cleanup();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
