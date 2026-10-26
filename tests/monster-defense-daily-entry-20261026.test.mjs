import test from 'node:test';import assert from 'node:assert/strict';
import {defenseRewardFixture} from './helpers/monster-defense-reward-db.mjs';
import {defenseEntryDay,defenseDailyEntryKey,defenseEntryReceiptKey,readDefenseDailyEntry,spendDefenseDailyEntry} from '../functions/_monster_defense_entry.js';
import {defaultDefenseSettings} from '../shared/monster-defense-v1.mjs';
import {MonsterDefenseHost} from '../workers/api-runtime/src/monster-defense.js';
import {monsterDefenseFixture,defenseOwnedLoadout} from './helpers/monster-defense-fixture.mjs';
const at=Date.parse('2026-10-26T23:59:59+09:00'),now=()=>crypto.randomUUID();
const room=n=>({id:n.toString(16).padStart(12,'A').toUpperCase(),creationRequest:'entry-test-'+n,createdAt:at-1000,phase:'PREP',entryPending:{requestKey:'start'},accountRoster:true,operatingMode:'ON',practice:false,capacity:3,players:[1,2,3].map(id=>({id:String(id),name:'대원 '+id}))});
const enable=async f=>{const settings=defaultDefenseSettings();settings.mode='ON';await f.writeSettings(settings);};
const create=extra=>({capacity:2,difficulty:'NORMAL',loadout:defenseOwnedLoadout(),requestId:now(),...extra});
async function on(h){const settings=(await h.api(1,'admin/defense/settings')).settings;settings.mode='ON';assert.equal((await h.api(1,'admin/defense/settings',{settings,requestId:now()})).status,200);}
async function pair(h,host=2,guest=3){const a=await h.api(host,'defense/create',create()),b=await h.api(guest,'defense/join',{roomId:a.roomId,loadout:defenseOwnedLoadout(),requestId:now()});assert.equal(a.status,200);assert.equal(b.status,200);for(const s of [a,b])assert.equal((await h.ready(s)).status,200);return [a,b];}
const start=(h,a,requestId=now())=>h.live(a,'command',{requestId,command:{type:'START'}});

test('daily quota resets at KST midnight, reads never initialize storage and TEST/practice are free',async()=>{
 assert.equal(defenseEntryDay(at).day,'2026-10-26');assert.equal(defenseEntryDay(at).resetAt,at+1000);assert.equal(defenseEntryDay(at+1000).day,'2026-10-27');
 const f=await defenseRewardFixture();try{
  assert.equal((await readDefenseDailyEntry(f.env,1,at)).remaining,3);assert.equal(Number((await f.first('SELECT COUNT(*) n FROM app_meta')).n),1);
  for(const r of [{...room(1),operatingMode:'TEST'},{...room(2),practice:true}])assert.equal((await spendDefenseDailyEntry(f.env,r,at)).charged,false);
  assert.equal(Number((await f.first('SELECT COUNT(*) n FROM app_meta')).n),1);
 }finally{await f.close();}
});

for(const pg of [false,true])test(`${pg?'PostgreSQL':'SQLite'} all-player atomic debit, failure rollback, receipt replay and exact daily cap`,async()=>{
 const f=await defenseRewardFixture(pg);try{
  await enable(f);const batch=f.env.DB.batch.bind(f.env.DB);let once=true;
  f.env.DB.batch=async rows=>{if(once){once=false;return batch([...rows.slice(0,5),f.env.DB.prepare('INSERT INTO missing_entry_failure VALUES(1)'),...rows.slice(5)]);}return batch(rows);};
  await assert.rejects(spendDefenseDailyEntry(f.env,room(1),at));for(const id of [1,2,3])assert.equal((await readDefenseDailyEntry(f.env,id,at)).remaining,3);
  f.env.DB.batch=async rows=>{const result=await batch(rows);if(rows.some(r=>(r.sql||r.source)?.startsWith('INSERT INTO app_meta'))){throw Error('lost response after commit');}return result;};
  const first=await spendDefenseDailyEntry(f.env,room(1),at);assert.equal(first.quotas[1].remaining,2);f.env.DB.batch=batch;
  assert.deepEqual(await spendDefenseDailyEntry(f.env,room(1),at+1000),first,'midnight replay uses immutable receipt');
  for(const n of [2,3])await spendDefenseDailyEntry(f.env,room(n),at);
  for(const id of [1,2,3])assert.equal((await readDefenseDailyEntry(f.env,id,at)).remaining,0);
  await assert.rejects(spendDefenseDailyEntry(f.env,room(4),at),e=>e.code==='DEFENSE_ENTRY_EMPTY');
  assert.equal(Number((await f.first("SELECT COUNT(*) n FROM app_meta WHERE key LIKE 'monster_defense_entry_receipt_v1:%'")).n),3);
  const next=await spendDefenseDailyEntry(f.env,room(5),at+1000);assert.equal(next.quotas[1].remaining,2);assert.equal(next.day,'2026-10-27');
  const stored=await f.first(`SELECT value FROM app_meta WHERE key='${defenseDailyEntryKey(1)}'`);assert.equal(JSON.parse(stored.value).used,1);
 }finally{await f.close();}
});

test('competing rooms cannot spend a fourth attempt; one exhausted member charges nobody',async()=>{
 const f=await defenseRewardFixture();try{
  await enable(f);await spendDefenseDailyEntry(f.env,room(1),at);await spendDefenseDailyEntry(f.env,room(2),at);
  const results=await Promise.allSettled([spendDefenseDailyEntry(f.env,room(3),at),spendDefenseDailyEntry(f.env,room(4),at)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'DEFENSE_ENTRY_EMPTY');
  await f.env.DB.prepare('DELETE FROM app_meta WHERE key=?').bind(defenseDailyEntryKey(2)).run();await assert.rejects(spendDefenseDailyEntry(f.env,room(5),at),e=>e.code==='DEFENSE_ENTRY_EMPTY');assert.equal((await readDefenseDailyEntry(f.env,2,at)).remaining,3);
 }finally{await f.close();}
});

test('real ON rooms debit three failed runs, deny zero create/join, preserve last-run reconnect and apply to OWNER',async()=>{
 const h=await monsterDefenseFixture();try{
  await on(h);let last;
  for(let n=1;n<=3;n++){
   const [a,b]=await pair(h,1,2);assert.equal((await h.api(1,'defense/feature')).dailyEntry.remaining,4-n,'lobby is not charged');
   const requestId=now();assert.equal((await start(h,a,requestId)).status,200);assert.equal((await start(h,a,requestId)).status,200);assert.equal((await h.api(1,'defense/feature')).dailyEntry.remaining,3-n);
   const failed=await h.room(a.roomId);failed.phase='DEFEAT';failed.coreHp=0;await h.room(a.roomId,failed);last=a;
   for(const id of [1,2])assert.equal((await h.api(id,'defense/leave',{})).status,200);
  }
  assert.equal((await h.api(1,'defense/create',create())).code,'DEFENSE_ENTRY_EMPTY');
  const open=await h.api(4,'defense/create',create());assert.equal((await h.api(1,'defense/join',{roomId:open.roomId,loadout:defenseOwnedLoadout(),requestId:now()})).code,'DEFENSE_ENTRY_EMPTY');
  const resumed=await h.api(1,'defense/session',{roomId:last.roomId});assert.equal(resumed.status,200);assert.equal(resumed.snapshot.phase,'DEFEAT');assert.equal(resumed.snapshot.entryCharged,true);assert.equal((await h.api(1,'defense/feature')).dailyEntry.remaining,0);
  const practice=await h.api(1,'defense/create',create({practice:true}));assert.equal(practice.status,200);assert.equal((await h.ready(practice)).status,200);assert.equal((await start(h,practice)).status,200);assert.equal((await h.api(1,'defense/feature')).dailyEntry.remaining,0);
 }finally{await h.dispose();}
});

test('start outage freezes combat; alarm and lost DO acknowledgement recover exactly one debit',async()=>{
 const h=await monsterDefenseFixture();try{
  await on(h);const [a,b]=await pair(h);
  await h.db.batch([{sql:"CREATE TRIGGER qa_defense_entry_fail BEFORE INSERT ON app_meta WHEN NEW.key LIKE 'monster_defense_entry_receipt_v1:%' BEGIN SELECT RAISE(ABORT,'temporary entry failure'); END"}]);
  const requestId=now();assert.equal((await start(h,a,requestId)).status,503);const pending=await h.room(a.roomId);assert(pending.entryPending);assert.equal(pending.time,0);
  const waiting=await h.live(a,'state');assert.equal(waiting.phase,'LOBBY');assert.equal(waiting.entryPending,true);assert.equal((await h.api(2,'defense/feature')).dailyEntry.used,0);assert.equal((await h.ready(b)).status,503);
  await h.db.batch([{sql:'DROP TRIGGER qa_defense_entry_fail'}]);await fetch(h.origin+'/__qa/defense-alarm/'+a.roomId);
  assert.equal((await h.api(2,'defense/feature')).dailyEntry.used,1);assert.equal((await start(h,a,requestId)).status,200);
  await h.room(a.roomId,pending);await fetch(h.origin+'/__qa/defense-alarm/'+a.roomId);const restored=await h.room(a.roomId);assert.equal(restored.entryPending,undefined);assert.equal(restored.entryReceipt.charged,true);assert.equal((await h.api(2,'defense/feature')).dailyEntry.used,1);
  assert.equal((await h.db.batch([{sql:'SELECT COUNT(*) n FROM app_meta WHERE key=?',args:[defenseEntryReceiptKey(a.roomId)]}]))[0].results[0].n,1);
 }finally{await h.dispose();}
});

test('zero discovered at start rejects the entire party without starting combat',async()=>{
 const h=await monsterDefenseFixture();try{
  await on(h);const [a,b]=await pair(h);const value=JSON.stringify({version:1,day:defenseEntryDay().day,used:3});await h.db.batch([{sql:'INSERT INTO app_meta(key,value) VALUES(?,?)',args:[defenseDailyEntryKey(3),value]}]);
  assert.equal((await start(h,a)).status,409);const r=await h.room(a.roomId);assert.equal(r.phase,'LOBBY');assert.equal(r.entryPending,undefined);assert.match(r.entryError,/0회/);assert(r.players.every(p=>!p.ready));assert.equal((await h.api(2,'defense/feature')).dailyEntry.used,0);
 }finally{await h.dispose();}
});

test('charged results remain reconnectable for 24 hours; pre-release and practice retention stays unchanged',()=>{
 const host=new MonsterDefenseHost({},{}),finishedAt=at+5000,r={...room(1),phase:'DEFEAT',startedAt:at,finishedAt,entryReceipt:{charged:true}};
 assert.equal(host.cleanupAt(r),finishedAt+86400000);assert.equal(host.deadline(r),at+7200000);
 delete r.entryReceipt;assert.equal(host.cleanupAt(r),r.createdAt+7200000);
});
