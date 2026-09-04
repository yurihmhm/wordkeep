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

console.log('\nrankRows (leaderboard)');
{
  const T=20000;
  const rows=[
    {uid:'a',nickname:'A',todayN:5,todayIdx:T,streak:3},
    {uid:'b',nickname:'B',todayN:9,todayIdx:T-1,streak:9},   // studied yesterday
    {uid:'c',nickname:'C',todayN:7,todayIdx:T,streak:0},
    {uid:'d',nickname:'D',todayN:0,todayIdx:T,streak:4},
  ];
  t("yesterday's count does not lead today's board",()=>
    M.rankRows(rows,'todayN',T).map(r=>r.uid).join(',')==='c,a'||
    M.rankRows(rows,'todayN',T).map(r=>r.uid).join(','));
  t('zero values are left off the board',()=>
    M.rankRows(rows,'streak',T).map(r=>r.uid).join(',')==='b,d,a'||
    M.rankRows(rows,'streak',T).map(r=>r.uid).join(','));
  t('a row with no nickname is skipped',()=>
    M.rankRows([{uid:'x',todayN:9,todayIdx:T}],'todayN',T).length===0||'not skipped');
  t('null rows do not throw',()=>
    M.rankRows([null,undefined,{uid:'y',nickname:'Y',streak:2}],'streak',T).length===1||'wrong count');
  t('a numeric string still sorts as a number',()=>
    M.rankRows([{uid:'p',nickname:'P',streak:'10'},{uid:'q',nickname:'Q',streak:9}],'streak',T)
      .map(r=>r.uid).join(',')==='p,q'||'sorted as text');
  t('a row missing the field entirely is dropped',()=>
    M.rankRows([{uid:'m',nickname:'M'},{uid:'n',nickname:'N',streak:1}],'streak',T)
      .map(r=>r.uid).join(',')==='n'||'not dropped');
}

console.log('\nboardNum (what gets published is bounded)');
{
  t('passes a normal value through',()=>M.boardNum(12,100)===12||'no');
  t('negatives become 0',()=>M.boardNum(-4,100)===0||'no');
  t('NaN becomes 0',()=>M.boardNum(NaN,100)===0||'no');
  // Deliberately 0, not the cap: Infinity means something upstream is broken,
  // and clamping would publish that as a top score instead of a zero.
  t('Infinity becomes 0 rather than the cap',()=>M.boardNum(Infinity,100)===0||'no');
  t('a numeric string is coerced',()=>M.boardNum('37',100)===37||'no');
  t('a non-numeric string becomes 0',()=>M.boardNum('abc',100)===0||'no');
  t('undefined becomes 0',()=>M.boardNum(undefined,100)===0||'no');
  t('fractions are floored, so the rules see an int',()=>M.boardNum(9.9,100)===9||'no');
  t('over the cap clamps to the cap',()=>M.boardNum(500,100)===100||'no');
}

console.log('\nfmtNum');
{
  t('zero',()=>M.fmtNum(0)==='0'||M.fmtNum(0));
  t('below a thousand is untouched',()=>M.fmtNum(999)==='999'||M.fmtNum(999));
  t('thousands separator',()=>M.fmtNum(1000)==='1,000'||M.fmtNum(1000));
  t('millions',()=>M.fmtNum(1234567)==='1,234,567'||M.fmtNum(1234567));
}

console.log('\nwithRanks / stable order');
{
  const T=20000;
  const tied=[{uid:'e',nickname:'E',streak:5},{uid:'a',nickname:'A',streak:9},
              {uid:'c',nickname:'C',streak:9},{uid:'b',nickname:'B',streak:5},
              {uid:'d',nickname:'D',streak:1}];
  const fmt=x=>M.withRanks(M.rankRows(x,'streak',T),'streak')
                .map(r=>r._rank+':'+r.nickname).join(' ');
  t('equal scores share a place and the next one skips',()=>
    fmt(tied)==='1:A 1:C 3:B 3:E 5:D'||fmt(tied));
  // Firestore returns ties in no particular order, so without a tiebreak the
  // same people swapped rank numbers on every refresh.
  t('the order does not depend on the order Firestore returned',()=>
    fmt(tied)===fmt(tied.slice().reverse())||fmt(tied)+' vs '+fmt(tied.slice().reverse()));
  t('a lone row is rank 1',()=>
    fmt([{uid:'z',nickname:'Z',streak:3}])==='1:Z'||fmt([{uid:'z',nickname:'Z',streak:3}]));
  t('all tied share rank 1',()=>{
    const all=[1,2,3].map(i=>({uid:'u'+i,nickname:'U'+i,streak:4}));
    return M.withRanks(M.rankRows(all,'streak',T),'streak').every(r=>r._rank===1)||'not all 1';
  });
  t('empty input does not throw',()=>M.withRanks([],'streak').length===0||'no');
}

console.log('\npkgProgressPct (works before the words are downloaded)');
{
  // The catalogue knows the size; the word list may not be on this device.
  // Progress syncs between devices, the download does not, so the picker has to
  // show a real number for a package it does not hold.
  const setup=(count,prog)=>{ M.__setPkg([{id:'p',v:1,count}], {p:prog}); };
  t('no progress is 0%',()=>{ setup(50,{}); return M.pkgProgressPct('p')===0||M.pkgProgressPct('p'); });
  t('unknown package is 0%',()=>{ setup(50,{}); return M.pkgProgressPct('zzz')===0||'not 0'; });
  t('a package with no count is 0% and does not divide by zero',()=>{
    setup(0,{a:{box:3}}); return M.pkgProgressPct('p')===0||M.pkgProgressPct('p'); });
  t('every word at the top box is 100%',()=>{
    const prog={}; for(let i=0;i<10;i++)prog['w'+i]={box:INTERVALS.length-1};
    setup(10,prog); return M.pkgProgressPct('p')===100||M.pkgProgressPct('p'); });
  t('unlearned words count as zero, not negative',()=>{
    setup(10,{a:{box:-1},b:{box:-1}}); return M.pkgProgressPct('p')===0||M.pkgProgressPct('p'); });
  t('more progress keys than the catalogue count still caps at 100',()=>{
    const prog={}; for(let i=0;i<80;i++)prog['w'+i]={box:INTERVALS.length-1};
    setup(50,prog); return M.pkgProgressPct('p')===100||M.pkgProgressPct('p'); });
}

console.log('\nreview points');
{
  const {QUIZ_PTS}=M;
  // The whole point of the change: four-choice must not be the cheapest way to
  // the top of the board.
  t('four-choice is worth the least',()=>{
    const min=Math.min(...Object.values(QUIZ_PTS));
    return QUIZ_PTS.choice===min||'choice is '+QUIZ_PTS.choice+', min is '+min; });
  t('producing the spelling is worth more than picking it',()=>
    QUIZ_PTS.spell>QUIZ_PTS.choice||'spell '+QUIZ_PTS.spell+' vs choice '+QUIZ_PTS.choice);
  t('listening sits between the two',()=>
    (QUIZ_PTS.listen>QUIZ_PTS.choice&&QUIZ_PTS.listen<QUIZ_PTS.spell)||'listen is '+QUIZ_PTS.listen);
  t('dictation is worth as much as spelling',()=>
    QUIZ_PTS.dictation===QUIZ_PTS.spell||'dictation '+QUIZ_PTS.dictation);

  t('an entry from before the change counts as one point',()=>
    M.histPts({t:1,ok:true})===1||M.histPts({t:1,ok:true}));
  t('an unknown format counts as one point rather than zero',()=>
    M.histPts({t:1,ok:true,q:'telepathy'})===1||M.histPts({t:1,ok:true,q:'telepathy'}));
  t('null does not throw',()=>M.histPts(null)===1||M.histPts(null));
  t('each format scores its own weight',()=>{
    const got=Object.keys(QUIZ_PTS).map(k=>M.histPts({q:k}));
    const want=Object.keys(QUIZ_PTS).map(k=>QUIZ_PTS[k]);
    return JSON.stringify(got)===JSON.stringify(want)||got.join(',')+' vs '+want.join(','); });

  // Halves have to survive being added up before anything rounds, or two
  // listening answers would be worth 2 points instead of 3.
  t('halves add up before rounding',()=>{
    const total=[{q:'listen'},{q:'listen'}].reduce((a,h)=>a+M.histPts(h),0);
    return total===3||'got '+total; });
  t('a mixed day totals what the weights say',()=>{
    const hist=[...Array(4)].map(()=>({q:'choice'}))
      .concat([...Array(2)].map(()=>({q:'listen'})))
      .concat([...Array(3)].map(()=>({q:'spell'})))
      .concat([{q:'dictation'}])
      .concat([{t:1,ok:true}]);
    const total=hist.reduce((a,h)=>a+M.histPts(h),0);
    return total===16||'expected 16, got '+total; });
  t('the board floors rather than rounds up',()=>
    M.boardNum(7.5,100000)===7||M.boardNum(7.5,100000));
}

console.log('\nslang filters (region + explicit)');
{
  // A miniature slang package: two words everyone says, one American, one
  // British, and one coarse word tagged nsfw.
  const words=[
    {word:'vibe',region:'all',meaning:{ja:'a'}},
    {word:'sus',region:'all',meaning:{ja:'b'}},
    {word:'bucks',region:'us',meaning:{ja:'c'}},
    {word:'quid',region:'uk',meaning:{ja:'d'}},
    {word:'bloody',region:'uk',nsfw:true,meaning:{ja:'e'}}
  ];
  const setup=(settings,prog)=>{
    M.__setSettings(settings);
    M.__setPkg([{id:'p',v:1,count:words.length}],{p:prog||{}},{p:{v:1,words}});
  };
  const allowed=()=>words.filter(M.wordAllowed).map(w=>w.word);

  t('coarse words are hidden by default',()=>{
    setup({}); const a=allowed();
    return !a.includes('bloody')||'bloody leaked with explicit off'; });
  t('turning explicit on brings them back',()=>{
    setup({explicit:true}); return allowed().includes('bloody')||'bloody still hidden'; });
  t('an unticked country drops only its own words',()=>{
    setup({regions:{all:true,us:false,uk:true,au:true}});
    const a=allowed();
    return (!a.includes('bucks')&&a.includes('quid')&&a.includes('vibe'))||a.join(','); });
  t('a word with no region is never filtered out by country',()=>{
    M.__setSettings({regions:{all:false,us:false,uk:false,au:false}});
    return M.wordAllowed({word:'x'})===true||'a plain word was filtered'; });
  t('regions missing from settings default to shown',()=>{
    M.__setSettings({regions:{}});
    return M.wordAllowed({word:'x',region:'au'})===true||'au was hidden without being switched off'; });
  t('both filters apply together',()=>{
    setup({explicit:true,regions:{all:false,us:true,uk:true,au:true}});
    const a=allowed();
    return (!a.includes('vibe')&&a.includes('bloody')&&a.includes('bucks'))||a.join(','); });

  // The percentage is the part that misleads if it gets this wrong: a reader
  // who has learned everything they can see must be told 100%.
  t('learning every visible word reads 100% with coarse words off',()=>{
    const prog={}; ['vibe','sus','bucks','quid'].forEach(w=>{prog[w]={box:INTERVALS.length-1};});
    setup({},prog); return M.pkgProgressPct('p')===100||M.pkgProgressPct('p'); });
  t('the same progress drops below 100% once coarse words are shown',()=>{
    const prog={}; ['vibe','sus','bucks','quid'].forEach(w=>{prog[w]={box:INTERVALS.length-1};});
    setup({explicit:true},prog);
    const v=M.pkgProgressPct('p'); return (v===80)||('expected 80, got '+v); });
  t('progress on a hidden word is kept but not counted',()=>{
    const prog={bloody:{box:INTERVALS.length-1}};
    setup({},prog); return M.pkgProgressPct('p')===0||M.pkgProgressPct('p'); });
  t('an unfiltered package still counts against the catalogue total',()=>{
    M.__setSettings({});
    M.__setPkg([{id:'q',v:1,count:100}],{q:{a:{box:INTERVALS.length-1}}},null);
    return M.pkgProgressPct('q')===1||M.pkgProgressPct('q'); });
}

console.log('\nwordsToPush / tombsToPush (incremental sync)');
{
  const map=arr=>new Map((arr||[]).map(w=>[w.id,w]));
  const ids=r=>r.map(w=>w.id).join(',');

  // --- first sync on a device: no watermark, remote copy is complete ---
  t('first sync uploads what the remote lacks',()=>
    ids(M.wordsToPush([{id:'a',updatedAt:5},{id:'b',updatedAt:5}],map([{id:'a',updatedAt:5}]),null))==='b'||'no');
  t('first sync uploads what is newer locally',()=>
    ids(M.wordsToPush([{id:'a',updatedAt:9}],map([{id:'a',updatedAt:5}]),null))==='a'||'no');
  t('first sync leaves an identical word alone',()=>
    M.wordsToPush([{id:'a',updatedAt:5}],map([{id:'a',updatedAt:5}]),null).length===0||'no');

  // --- incremental: the remote map holds only the delta ---
  // This is the whole point. Under the old rule every word missing from the
  // delta looked new, so a 1000-word account re-uploaded 1000 documents a sync.
  t('an unchanged word missing from the delta is NOT re-uploaded',()=>
    M.wordsToPush([{id:'a',updatedAt:100}],map([]),500).length===0||'re-uploaded');
  t('a locally edited word is uploaded',()=>
    ids(M.wordsToPush([{id:'a',updatedAt:900}],map([]),500))==='a'||'no');
  t('a word edited on both sides uploads only if ours is newer',()=>{
    const local=[{id:'a',updatedAt:900},{id:'b',updatedAt:900}];
    const remote=map([{id:'a',updatedAt:950},{id:'b',updatedAt:800}]);
    return ids(M.wordsToPush(local,remote,500))==='b'||ids(M.wordsToPush(local,remote,500));
  });
  t('exactly at the watermark counts as unchanged',()=>
    M.wordsToPush([{id:'a',updatedAt:500}],map([]),500).length===0||'no');
  t('falls back to `added` when updatedAt is missing',()=>
    ids(M.wordsToPush([{id:'a',added:900}],map([]),500))==='a'||'no');
  t('empty input does not throw',()=>M.wordsToPush(null,map([]),500).length===0||'no');

  // --- tombstones ---
  // A word deleted today may have been written months ago, so it is nowhere in
  // the delta. Gating the delete on the remote map dropped it and the word came
  // back from the other device.
  t('a fresh delete is pushed even though the delta does not mention it',()=>
    M.tombsToPush({x:900},map([]),500).join(',')==='x'||'delete was dropped');
  t('an old delete already applied is not re-sent',()=>
    M.tombsToPush({x:100},map([]),500).length===0||'no');
  t('an old delete is still sent while the remote copy survives',()=>
    M.tombsToPush({x:100},map([{id:'x'}]),500).join(',')==='x'||'no');
  t('first sync only deletes what the remote actually has',()=>
    M.tombsToPush({x:900,y:900},map([{id:'x'}]),null).join(',')==='x'||'no');
  t('no tombstones does not throw',()=>M.tombsToPush(null,map([]),500).length===0||'no');
}

console.log('\nshuffle / marks');
t('shuffle keeps every element exactly once',()=>{
  const src=[1,2,3,4,5,6,7,8,9,10];
  for(let i=0;i<40;i++){
    const r=M.shuffle(src);
    if(r.length!==src.length)return 'length '+r.length;
    if(r.slice().sort((a,b)=>a-b).join()!==src.join())return 'contents '+r.join();
  }
  return true;
});
t('shuffle does not mutate its input',()=>{
  const src=[1,2,3,4,5,6,7,8];
  for(let i=0;i<20;i++)M.shuffle(src);
  return src.join()==='1,2,3,4,5,6,7,8'||src.join();
});
t('shuffle actually reorders over repeated runs',()=>{
  const src=[1,2,3,4,5,6,7,8,9,10];
  // Vanishingly unlikely to be identical 30 times running; if it is, the
  // shuffle is not shuffling.
  for(let i=0;i<30;i++)if(M.shuffle(src).join()!==src.join())return true;
  return 'never reordered';
});
t('markOf only accepts a known mark',()=>
  M.markOf({mark:'fav'})==='fav'&&M.markOf({mark:'hard'})==='hard'&&
  M.markOf({mark:'banana'})===null&&M.markOf({})===null||'wrong');
t('the one-day-old star reads as a favourite',()=>
  M.markOf({mark:'star'})==='fav'||'wrong');
t('markOf survives a missing word',()=>M.markOf(null)===null&&M.markOf(undefined)===null||'threw or wrong');

console.log('\nspellDiff / spellWords');
const marks=(a,b)=>{const r=M.spellDiff(a,b);return r.dist+':'+Array.from(a).map((c,i)=>r.bad[i]?c.toUpperCase():c).join('');};
t('a substitution marks the wrong letter',()=>marks('brint','bring')==='1:brinT'||marks('brint','bring'));
t('an inserted letter marks the intruder',()=>marks('tgo','to')==='1:tGo'||marks('tgo','to'));
t('a missing letter has nothing to mark',()=>marks('brig','bring')==='1:brig'||marks('brig','bring'));
t('an exact match marks nothing',()=>marks('bring','bring')==='0:bring'||marks('bring','bring'));
t('distance counts every edit',()=>M.spellDiff('kat','cats').dist===2||M.spellDiff('kat','cats').dist);
t('empty against a word is its length',()=>M.spellDiff('','make').dist===4||'wrong');
t('a word against empty marks every letter',()=>marks('make','')==='4:MAKE'||marks('make',''));
t('flags are one per typed character',()=>{
  const r=M.spellDiff('abcdef','abXdef');
  return r.bad.length===6||'got '+r.bad.length;
});
t('a phrase with a space diffs the same way',()=>
  marks('make shre','make sure')==='1:make sHre'||marks('make shre','make sure'));
t('spellWords splits on spaces and keeps the gaps',()=>{
  const g=M.spellWords('make sure');
  return JSON.stringify(g)===JSON.stringify([{sp:false,a:0,b:4},{sp:true,a:4,b:5},{sp:false,a:5,b:9}])||JSON.stringify(g);
});
t('a single word is one group',()=>{
  const g=M.spellWords('apple');
  return (g.length===1&&g[0].a===0&&g[0].b===5)||JSON.stringify(g);
});
t('spellWords covers the whole string with no holes',()=>{
  for(const s of ['make sure','a b c','stay 2months','one']){
    const g=M.spellWords(s);
    let at=0;
    for(const x of g){ if(x.a!==at)return s+' hole at '+x.a; at=x.b; }
    if(at!==s.length)return s+' stops at '+at;
  }
  return true;
});
t('spellWords on an empty target is empty',()=>M.spellWords('').length===0||'not empty');

console.log('\nspellDiff: missing letters');
const shape=(a,b)=>{const r=M.spellDiff(a,b);let o='';
  for(let i=0;i<a.length;i++){if(r.miss[i])o+='_'.repeat(r.miss[i]);o+=r.bad[i]?a[i].toUpperCase():a[i];}
  if(r.miss[a.length])o+='_'.repeat(r.miss[a.length]);
  return r.dist+':'+o;};
t('a dropped letter shows as a gap where it belongs',()=>shape('exaple','example')==='1:exa_ple'||shape('exaple','example'));
t('a substitution still marks the letter, no gap',()=>shape('exampre','example')==='1:exampR e'.replace(' ','')||shape('exampre','example'));
t('a letter missing off the end',()=>shape('brin','bring')==='1:brin_'||shape('brin','bring'));
t('a letter missing at the very start',()=>shape('xample','example')==='1:_xample'||shape('xample','example'));
// Where a gap lands inside a run of repeated letters is a genuine tie
// (acc/omm), so this asserts what has to hold rather than one of the readings.
t('two dropped letters: two gaps, and the typed string survives',()=>{
  const r=M.spellDiff('acomodation','accommodation');
  const gaps=r.miss.reduce((a,b)=>a+b,0);
  return (r.dist===2&&gaps===2&&!r.bad.some(Boolean))||JSON.stringify({d:r.dist,gaps:gaps});
});
t('gaps never rewrite what was typed',()=>{
  for(const [a,b] of [['exaple','example'],['acomodation','accommodation'],['brin','bring'],['','word']]){
    const r=M.spellDiff(a,b);
    let o='';
    for(let i=0;i<a.length;i++)o+=a[i];
    if(o!==a)return a+' -> '+o;
    if(r.miss.length!==a.length+1)return a+' miss length '+r.miss.length;
  }
  return true;
});
t('miss has one more slot than the typed string',()=>M.spellDiff('abc','abcd').miss.length===4||'wrong length');
t('an exact match has no gaps at all',()=>{
  const r=M.spellDiff('example','example');
  return (r.dist===0&&r.miss.every(x=>x===0)&&r.bad.every(x=>!x))||'not clean';
});
t('typed longer than the answer marks the extra, not a gap',()=>shape('examplee','example')==='1:examplE e'.replace(' ','')||shape('examplee','example'));

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
