import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enterRankedDuo} from '../js/ranked-duo-entry-v1.mjs';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';
import {duoFixture} from './helpers/ranked-duo-db.mjs';

const error=code=>Object.assign(new Error(code),{code});
function entryHarness(call,options={}){
 let now=0,saved=null;const calls=[],saves=[],waits=[];
 return {calls,saves,waits,pending:()=>saved,run:()=>enterRankedDuo({call:async(path,options)=>{calls.push({path,...structuredClone(options)});return call(path,options);},save:body=>{saved=body;saves.push(structuredClone(body));},requestId:()=> 'direct-entry-request-0001',now:()=>now,wait:async ms=>{waits.push(ms);now+=ms;},...options})};
}

test('one matching action immediately submits a fight; version contention reuses the same request',async()=>{
 let matches=0,fights=0,matched=0;
 const h=entryHarness(async path=>{
  if(path==='match'){if(++matches===1)throw error('DUO_PROFILE_BUILDING');return {token:'ticket'};}
  if(++fights===1)throw error('DUO_PROFILE_CHANGED');
  if(fights===2)throw error('DUO_CONFLICT');
  return {status:'COMPLETED',matchId:'match'};
 },{onMatched:()=>matched++});
 assert.equal((await h.run()).status,'COMPLETED');assert.equal(matched,1);assert.equal(matches,2);
 assert.deepEqual(h.calls.filter(c=>c.path==='fight').map(c=>c.body),Array(3).fill({requestId:'direct-entry-request-0001',matchToken:'ticket'}));
 assert.equal(h.pending(),null);
});

test('pending settlement and a lost response recover automatically without new matching or payment requests',async()=>{
 let fights=0,replays=0;
 const h=entryHarness(async path=>{
  if(path==='match')return {token:'ticket'};
  if(path==='fight'){if(++fights===1)throw error('REQUEST_TIMEOUT');return {status:'PENDING',matchId:'existing',retryAfterMs:1500};}
  return ++replays===1?{status:'PENDING',matchId:'existing',retryAfterMs:1500}:{status:'COMPLETED',matchId:'existing'};
 });
 assert.equal((await h.run()).matchId,'existing');assert.equal(h.calls.filter(c=>c.path==='match').length,1);
 assert.deepEqual(h.calls.filter(c=>c.path==='fight').map(c=>c.body),Array(2).fill({requestId:'direct-entry-request-0001',matchToken:'ticket'}));
 assert.ok(h.calls.filter(c=>c.path==='replay').every(c=>c.body.matchId==='existing'));assert.equal(h.pending(),null);
});

test('a saved paid match resumes on entry, and terminal errors are not retried',async()=>{
 const h=entryHarness(async path=>{assert.equal(path,'replay');return {status:'COMPLETED',matchId:'saved'};},{pending:{matchId:'saved'}});
 await h.run();assert.equal(h.calls.length,1);
 for(const code of ['DUO_DECK','DUO_ENERGY','DUO_CANCELLED','DUO_TICKET']){
  const failure=entryHarness(async()=>{throw error(code);},{pending:{requestId:'paid-request',matchToken:'ticket'}});
  await assert.rejects(failure.run(),{code});assert.equal(failure.calls.length,1);assert.equal(failure.waits.length,0);
  if(['DUO_CANCELLED','DUO_TICKET'].includes(code))assert.deepEqual(failure.saves,[null]);
 }
});

test('retry budget is finite and unmounting never sends a new fight',async()=>{
 const h=entryHarness(async()=>({status:'PENDING',matchId:'paid',retryAfterMs:1}),{pending:{matchId:'paid'}});
 await assert.rejects(h.run(),{code:'DUO_ENTRY_DELAYED'});assert.equal(h.calls.length,24);assert.equal(h.waits.length,23);assert.equal(h.pending().matchId,'paid');
 const busy=entryHarness(async()=>{throw error('DUO_PROFILE_BUILDING');});
 await assert.rejects(busy.run(),{code:'DUO_ENTRY_DELAYED'});assert.ok(busy.calls.length<=24);assert.ok(busy.waits.reduce((a,b)=>a+b,0)<45000);
 let active=true;const left=entryHarness(async()=>{active=false;return {token:'ticket'};},{isActive:()=>active});
 assert.equal(await left.run(),null);assert.equal(left.calls.length,1);assert.equal(left.saves.length,0);
});

for(const postgres of [false,'pipeline'])test('overlapping profile builds finish without duplicate inventory scans '+postgres,async t=>{
 const f=await duoFixture(t,{postgres});await f.ready();
 await f.p('UPDATE user_cards SET breakthrough_level=13 WHERE user_id IN(2,3,4)').run();
 let signal,release,builds=0;
 const started=new Promise(resolve=>signal=resolve),blocked=new Promise(resolve=>release=resolve);
 f.deps.readBattleSettings=async()=>{if(++builds===1){signal();await blocked;}return {};};f.resetQueries();
 const at=performance.now(),first=loadDuoProfiles(f.env,[2,3],f.config,f.deps,{now:f.clock()});await started;
 let waits=0;const second=loadDuoProfiles(f.env,[3,4],f.config,f.deps,{now:f.clock(),wait:async()=>{waits++;release();await first;}});
 const [a,b]=await Promise.all([first,second]);
 assert.deepEqual(a.map(p=>p.userId),[2,3]);assert.deepEqual(b.map(p=>p.userId),[3,4]);assert.equal(a[1].sourceVersion,b[0].sourceVersion);
 assert.equal(waits,1);assert.equal(builds,2);assert.equal(f.queries().filter(q=>q.includes('FROM user_cards uc JOIN')).length,2);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_profile_leases_v1').first()).n),0);
 t.diagnostic('overlap: '+f.queries().length+' bounded statements; 2 inventory batches for 3 changed accounts; 1 cache wait; '+(performance.now()-at).toFixed(1)+'ms fixture elapsed');
});

test('an inventory change during rebuilding is retried and publishes only the current version',async t=>{
 const f=await duoFixture(t);await f.ready();await f.p('UPDATE user_cards SET breakthrough_level=12 WHERE user_id=2').run();
 let changed=false,waits=0;f.deps.readBattleSettings=async()=>{if(!changed){changed=true;await f.p('UPDATE user_cards SET breakthrough_level=13 WHERE user_id=2').run();}return {};};
 const [profile]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock(),wait:async()=>waits++});
 assert.equal(waits,1);assert.equal(profile.sourceVersion,Number((await f.p('SELECT source_version FROM ranked_duo_accounts_v1 WHERE user_id=2').first()).source_version));
 assert.ok(profile.attack.cards.every(c=>c.breakthrough_level===13));
});

test('automatic entry survives the admission fence with one energy debit and one result',async t=>{
 const f=await duoFixture(t);await f.ready();const batch=f.DB.batch.bind(f.DB);let injected=false;
 f.DB.batch=async list=>{if(!injected&&list.some(s=>s.source.includes('INSERT INTO ranked_duo_matches_v1'))){injected=true;await f.p('UPDATE user_cards SET breakthrough_level=13 WHERE user_id=2').run();}return batch(list);};
 const h=entryHarness(async(path,options)=>{const r=await f.call('ranked-duo/'+path,{user:2,...options});if(r.status!==200)throw Object.assign(new Error(r.data.error),r.data);return r.data;});
 const result=await h.run();assert.equal(result.status,'COMPLETED');assert.equal(h.calls.filter(c=>c.path==='fight').length,2);
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_matches_v1').first()).n),1);
 assert.equal(Number((await f.p('SELECT SUM(wins) n FROM ranked_duo_teams_v1').first()).n),1);
});

test('automatic recovery waits out a failed settlement lease and charges only once',async t=>{
 const f=await duoFixture(t);await f.ready();let failed=false;
 const h=entryHarness(async(path,options)=>{
  if(path==='fight'&&!failed){failed=true;f.fail('UPDATE ranked_duo_teams_v1 SET score');}
  const r=await f.call('ranked-duo/'+path,{user:2,...options});f.fail('');
  if(r.status!==200)throw Object.assign(new Error(r.data.error),r.data);return r.data;
 },{now:f.clock,wait:async ms=>f.advance(ms)});
 const result=await h.run();assert.equal(result.status,'COMPLETED');assert.ok(h.calls.some(c=>c.path==='replay'));
 assert.equal(h.calls.filter(c=>c.path==='match').length,1);assert.equal(h.calls.filter(c=>c.path==='fight').length,2);
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_matches_v1').first()).n),1);
 assert.equal(Number((await f.p('SELECT SUM(wins) n FROM ranked_duo_teams_v1').first()).n),1);
});

test('the deployed lobby uses automatic entry and has no second fight confirmation',()=>{
 const source=readFileSync(new URL('../js/ranked-duo-v1.mjs',import.meta.url),'utf8');
 assert.match(source,/enterRankedDuo\(\{call,pending:pending\(\),save/);
 assert.match(source,/action==='recover'\|\|action==='match'\)await enterFight\(\)/);
 assert.doesNotMatch(source,/data-duo="fight"|최신 덱이 반영됩니다|진행 중인 경기 확인을 눌러/);
});
