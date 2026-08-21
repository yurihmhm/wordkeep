import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import fs from 'fs';
const env = await initializeTestEnvironment({
  projectId: 'wordkeep-bb145',
  firestore: { rules: fs.readFileSync('firestore.rules','utf8'), host:'127.0.0.1', port:8099 },
});
let pass=0, fail=0;
const check=async(n,f)=>{try{await f();console.log('  PASS  '+n);pass++;}
  catch(e){console.log('  FAIL  '+n+' -> '+String(e.message||e).split('\n')[0]);fail++;}};

const CAROL='carol_uid';
const carol=env.authenticatedContext(CAROL).firestore();
const ref=doc(carol,'users',CAROL);

console.log('\nbrand-new account (the real signup path)');
await check('creates own doc from nothing (no nickname yet)',
  ()=>assertSucceeds(setDoc(ref,{username:'carol@example.com',wordCount:5,wordIds:['a','b']},{merge:true})));
await check('sets a nickname for the first time',
  ()=>assertSucceeds(setDoc(ref,{nickname:'キャロル',nicknameAt:Date.now()},{merge:true})));
await check('immediate rename denied',
  ()=>assertFails(setDoc(ref,{nickname:'ちがう名前',nicknameAt:Date.now()},{merge:true})));
const at=(await getDoc(ref)).data().nicknameAt;
await check('repeated syncs keep working (nickname written back unchanged)',
  ()=>assertSucceeds((async()=>{for(let i=0;i<3;i++)
      await setDoc(ref,{nickname:'キャロル',nicknameAt:at,wordCount:5+i,updatedAt:Date.now()},{merge:true});})()));

console.log('\ncreate-with-nickname in one shot (doc did not exist)');
const DAVE='dave_uid';
const dave=env.authenticatedContext(DAVE).firestore();
await check('first write already carries a nickname',
  ()=>assertSucceeds(setDoc(doc(dave,'users',DAVE),{username:'d@example.com',nickname:'デイヴ',nicknameAt:Date.now()})));
await check('and cannot immediately be renamed',
  ()=>assertFails(setDoc(doc(dave,'users',DAVE),{nickname:'別',nicknameAt:Date.now()},{merge:true})));

await env.cleanup();
console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
