const M=require('./pure.js');
const {DAY,INTERVALS}=M;
// The meaning-typing quiz format was retired in v5.4.0, taking closeEnough,
// foldMarks and typoOk with it. Their tests went too rather than being kept
// alive against deleted code; git history has them if the format returns.
let pass=0,fail=0;
const t=(n,f)=>{try{const r=f();if(r===true){pass++;console.log('  PASS '+n);}else{fail++;console.log('  FAIL '+n+'  -> '+r);}}
                catch(e){fail++;console.log('  FAIL '+n+'  -> threw '+e.message);}};

console.log('\nmergeCloud');
t('newer updatedAt wins',()=>{
  const r=M.mergeCloud([{id:'a',word:'x',updatedAt:100}],{},[{id:'a',word:'y',updatedAt:200}],{});
  return r.words[0].word==='y'||JSON.stringify(r);
});
t('tombstone newer than word removes it',()=>{
  const r=M.mergeCloud([{id:'a',updatedAt:100}],{},[],{a:200});
  return r.words.length===0||JSON.stringify(r);
});
t('edit AFTER a delete survives',()=>{
  const r=M.mergeCloud([{id:'a',updatedAt:300}],{},[],{a:200});
  return r.words.length===1||JSON.stringify(r);
});
t('tombstone equal to stamp removes (>=)',()=>{
  const r=M.mergeCloud([{id:'a',updatedAt:200}],{},[],{a:200});
  return r.words.length===0||JSON.stringify(r);
});
t('falls back to added when updatedAt missing',()=>{
  const r=M.mergeCloud([{id:'a',added:500,word:'local'}],{},[{id:'a',added:100,word:'remote'}],{});
  return r.words[0].word==='local'||JSON.stringify(r);
});
t('word with NO stamp at all is not silently dropped',()=>{
  const r=M.mergeCloud([{id:'a',word:'nostamp'}],{},[],{});
  return r.words.length===1||JSON.stringify(r.words);
});
t('tombstone at 0 does not kill an unstamped word',()=>{
  const r=M.mergeCloud([{id:'a',word:'x'}],{},[],{a:0});
  return r.words.length===1||'DROPPED: '+JSON.stringify(r.words);
});
t('sorted newest-added first',()=>{
  const r=M.mergeCloud([{id:'a',added:1},{id:'b',added:9}],{},[],{});
  return r.words[0].id==='b'||JSON.stringify(r.words.map(w=>w.id));
});
t('null inputs do not throw',()=>{
  const r=M.mergeCloud(null,null,null,null);
  return r.words.length===0||JSON.stringify(r);
});

console.log('\nmergeStreak');
t('empty remote does not spend freezes',()=>{
  const r=M.mergeStreak({current:5,longest:9,lastActiveDate:100,freezesAvailable:2},{});
  return r.freezesAvailable===2||JSON.stringify(r);
});
t('longest is kept at the max',()=>{
  const r=M.mergeStreak({current:1,longest:30,lastActiveDate:100,freezesAvailable:1},
                        {current:2,longest:3,lastActiveDate:200,freezesAvailable:1});
  return r.longest===30||JSON.stringify(r);
});
t('newer lastActiveDate wins for current',()=>{
  const r=M.mergeStreak({current:1,longest:1,lastActiveDate:100,freezesAvailable:1},
                        {current:7,longest:7,lastActiveDate:200,freezesAvailable:1});
  return r.current===7||JSON.stringify(r);
});
t('freezes take the MIN of the two sides',()=>{
  const r=M.mergeStreak({current:1,longest:1,lastActiveDate:100,freezesAvailable:2},
                        {current:1,longest:1,lastActiveDate:200,freezesAvailable:0});
  return r.freezesAvailable===0||JSON.stringify(r);
});
t('both empty returns an object',()=>{
  const r=M.mergeStreak(null,null);
  return typeof r==='object'||JSON.stringify(r);
});

console.log('\nlocalDayIndex / streak day boundaries');
t('same calendar day = same index',()=>{
  const a=new Date(2026,2,15,0,0,1).getTime(), b=new Date(2026,2,15,23,59,59).getTime();
  return M.localDayIndex(a)===M.localDayIndex(b)||M.localDayIndex(a)+' vs '+M.localDayIndex(b);
});
t('consecutive days differ by exactly 1',()=>{
  const a=new Date(2026,2,15,12).getTime(), b=new Date(2026,2,16,12).getTime();
  return M.localDayIndex(b)-M.localDayIndex(a)===1||'gap '+(M.localDayIndex(b)-M.localDayIndex(a));
});
t('across a DST boundary still 1 (US spring forward Mar 8 2026)',()=>{
  const a=new Date(2026,2,7,12).getTime(), b=new Date(2026,2,8,12).getTime();
  return M.localDayIndex(b)-M.localDayIndex(a)===1||'gap '+(M.localDayIndex(b)-M.localDayIndex(a));
});
t('across year end still 1',()=>{
  const a=new Date(2026,11,31,12).getTime(), b=new Date(2027,0,1,12).getTime();
  return M.localDayIndex(b)-M.localDayIndex(a)===1||'gap '+(M.localDayIndex(b)-M.localDayIndex(a));
});

console.log('\ngrantMonthlyFreeze');
t('first run does not double-grant',()=>{
  const st={freezesAvailable:1,freezeMonthGranted:null};
  M.grantMonthlyFreeze(st);
  return st.freezesAvailable===1||JSON.stringify(st);
});
t('new month grants one, capped at 2',()=>{
  const st={freezesAvailable:1,freezeMonthGranted:'1999-0'};
  M.grantMonthlyFreeze(st);
  return st.freezesAvailable===2||JSON.stringify(st);
});
t('cap holds at 2',()=>{
  const st={freezesAvailable:2,freezeMonthGranted:'1999-0'};
  M.grantMonthlyFreeze(st);
  return st.freezesAvailable===2||JSON.stringify(st);
});
t('same month grants nothing',()=>{
  const st={freezesAvailable:1,freezeMonthGranted:M.monthKey(Date.now())};
  M.grantMonthlyFreeze(st);
  return st.freezesAvailable===1||JSON.stringify(st);
});
t('monthKey is unique per month across years',()=>{
  const a=M.monthKey(new Date(2026,0,15).getTime());
  const b=M.monthKey(new Date(2027,0,15).getTime());
  return a!==b||a+' == '+b;
});

console.log('\nweightedSample');
t('never returns more than asked',()=>{
  const r=M.weightedSample(['a','b','c','d'],[1,1,1,1],3);
  return r.length===3||JSON.stringify(r);
});
t('never repeats an item',()=>{
  for(let i=0;i<200;i++){
    const r=M.weightedSample(['a','b','c','d'],[1,1,1,1],4);
    if(new Set(r).size!==r.length) return 'dupe: '+JSON.stringify(r);
  }
  return true;
});
t('handles n larger than the pool',()=>{
  const r=M.weightedSample(['a','b'],[1,1],10);
  return r.length===2||JSON.stringify(r);
});
t('all-zero weights still returns items',()=>{
  const r=M.weightedSample(['a','b','c'],[0,0,0],2);
  return r.length===2||'GOT '+JSON.stringify(r);
});
t('empty pool returns empty',()=>M.weightedSample([],[],3).length===0);

console.log('\nlevenshtein');
t('identical = 0',()=>M.levenshtein('abc','abc')===0);
t('empty vs word = length',()=>M.levenshtein('','abcd')===4);
t('one substitution = 1',()=>M.levenshtein('cat','cot')===1);
t('symmetric',()=>M.levenshtein('kitten','sitting')===M.levenshtein('sitting','kitten'));

console.log('\nnickLen (code points)');
t('emoji counts as 1',()=>M.nickLen('🎌')===1||M.nickLen('🎌'));
t('plain ascii',()=>M.nickLen('abc')===3);
t('japanese',()=>M.nickLen('たろう')===3);



/* --- appended: answer grading (see tests/README.md) --------------------- */

console.log('\nmigrateWord hardening');
{
  // typeof x!=='number' let NaN through: a NaN box makes INTERVALS[box]
  // undefined, the next due date NaN, and NaN is never <= now -- the word
  // drops out of review permanently and answering never brings it back.
  const revivable=raw=>{
    const w=M.migrateWord({...raw});
    const box=Math.min(w.box+1,INTERVALS.length-1);
    return Number.isFinite(Date.now()+INTERVALS[box]*DAY)&&Number.isFinite(w.nextDue);
  };
  t('NaN box/date recovers',()=>revivable({id:'a',box:NaN,nextDue:NaN,added:NaN})||'still stuck');
  t('Infinity box recovers',()=>revivable({id:'b',box:Infinity,nextDue:Date.now()})||'still stuck');
  t('box above range clamped',()=>M.migrateWord({id:'c',box:999}).box===INTERVALS.length-1||'not clamped');
  t('box below -1 clamped',()=>M.migrateWord({id:'d',box:-50}).box===-1||'not clamped');
  t('string box recovers',()=>revivable({id:'e',box:'3',nextDue:'oops'})||'still stuck');
  t('hist forced to an array',()=>Array.isArray(M.migrateWord({id:'f',hist:{bad:1}}).hist)||'not an array');
}

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
