import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyFixture,day} from './helpers/ranked-duo-weekly.mjs';
import {duoLifecycle} from '../functions/_ranked_duo.js';
import {rankedDuoLiveOperation} from '../functions/_ranked_duo_live_operation.js';
import {openAdditionalRecruitment12h} from '../scripts/ops/ranked-duo-additional-recruitment-20260928.mjs';
const hour=3600000;
async function open(f,hours){
 const s=await f.season();
 return f.call('admin/ranked-duo/recruit',{method:'POST',body:{seasonId:s.id,revision:s.revision,...(hours===undefined?{}:{hours})}});
}
test('requested live opening and receipt are atomic; a retry cannot extend the 12h deadline',async t=>{
 const f=await weeklyFixture(t,{postgres:'pipeline'});await f.active();const s=await f.season(),args={seasonId:s.id,revision:s.revision,now:f.clock()};
 f.fail('INSERT INTO app_meta(key,value,updated_at) VALUES');
 await assert.rejects(openAdditionalRecruitment12h(f.env,args),/INJECTED/);f.fail('');
 assert.equal((await f.season()).config.additionalRecruitment,undefined);
 const first=await openAdditionalRecruitment12h(f.env,args);
 f.advance(hour);assert.deepEqual(await openAdditionalRecruitment12h(f.env,{...args,now:f.clock()}),{...first,replayed:true});
 assert.equal((await f.season()).config.additionalRecruitment.until,first.until);
});
async function paired(f){
 for(let i=0;i<12;i++){await f.tick();if((await f.season()).config.additionalRecruitment.phase==='CLOSED')return;}
 throw Error('Additional pairing did not finish');
}
const rows=async(f,table,where='')=>(await f.p('SELECT * FROM '+table+' '+where).all()).results;
for(const postgres of [false,'pipeline']){
 test(`${postgres||'SQLite'} active recruitment defaults to 12h; existing teams play and only new entrants pair`,async t=>{
  const f=await weeklyFixture(t,{postgres});await f.active();const before=await f.season();
  const teams=await rows(f,'ranked_duo_teams_v1'),entries=await rows(f,'ranked_duo_entries_v1');
  const opened=await open(f);assert.equal(opened.status,200);assert.equal(opened.data.season.status,'ACTIVE');
  const extra=opened.data.season.additionalRecruitment;
  assert.equal(extra.hours,12);assert.equal(Date.parse(extra.until)-f.clock(),12*hour);
  assert.equal(opened.data.season.startsAt,before.config.startsAt);assert.equal(opened.data.season.endsAt,before.config.endsAt);
  assert.equal(opened.data.season.recruitUntil,before.recruit_until);
  assert.deepEqual(await rows(f,'ranked_duo_teams_v1'),teams);assert.deepEqual(await rows(f,'ranked_duo_entries_v1'),entries);
  const item=await rankedDuoLiveOperation(f.env,f.clock());assert.equal(item.phase,'ACTIVE');assert.equal(item.additionalRecruiting,true);assert.equal(item.deadlineAt,extra.until);
  assert.equal((await f.call('ranked-duo/join',{user:2,method:'DELETE'})).data.code,'DUO_TEAM_ASSIGNED');
  assert.equal((await f.call('ranked-duo/join',{user:6,method:'POST'})).status,200);
  assert.equal((await f.call('ranked-duo/join',{user:6,method:'POST'})).status,200);
  assert.equal((await f.call('ranked-duo/join',{user:6,method:'DELETE'})).status,200);
  for(const user of [6,7])assert.equal((await f.call('ranked-duo/join',{user,method:'POST'})).status,200);
  assert.equal(Number((await f.season()).participant_count),6);
  const ticket=(await f.call('ranked-duo/match',{user:2,method:'POST'})).data;
  const battle=await f.call('ranked-duo/fight',{user:2,method:'POST',body:{matchToken:ticket.token,requestId:'additional-existing-battle-0001'}});
  assert.equal(battle.data.status,'COMPLETED',JSON.stringify(battle));
  const played=await rows(f,'ranked_duo_teams_v1'),resources=await rows(f,'ranked_duo_entries_v1','WHERE user_id<6');
  f.advance(12*hour-1);assert.equal((await f.tick()).additionalPhase,'RECRUITING');
  f.advance(1);assert.equal((await f.call('ranked-duo/join',{user:7,method:'DELETE'})).data.code,'DUO_RECRUIT_CLOSED');
  await paired(f);const s=await f.season();assert.equal(s.status,'ACTIVE');assert.equal(s.config.endsAt,before.config.endsAt);
  assert.deepEqual(await rows(f,'ranked_duo_teams_v1','WHERE user_a<6 AND user_b<6'),played);
  assert.deepEqual(await rows(f,'ranked_duo_entries_v1','WHERE user_id<6'),resources);
  assert.equal((await rows(f,'ranked_duo_teams_v1')).length,3);
  assert.equal((await rows(f,'ranked_duo_matches_v1')).length,1);
  const newcomer=(await f.call('ranked-duo/status',{user:6})).data;
  assert.equal(newcomer.energy.current,before.config.energy.maximum);assert.equal(newcomer.team.score,before.config.score.initial);
  assert.deepEqual(newcomer.team.members.map(m=>m.userId).sort(),[6,7]);
  assert.equal((await f.call('ranked-duo/match',{user:6,method:'POST'})).status,200);
 });
 test(`${postgres||'SQLite'} stale recruitment writes fail; custom hours, end bound and pairing authority are enforced`,async t=>{
  const f=await weeklyFixture(t,{postgres});await f.active();const s=await f.season(),body={hours:3,seasonId:s.id,revision:s.revision};
  assert.equal((await f.call('admin/ranked-duo/recruit',{method:'POST',user:2,body})).status,403);
  for(const hours of [0,-1,1.5,721,168])assert.equal((await open(f,hours)).data.code,'DUO_HOURS');
  assert.equal((await f.call('admin/ranked-duo/recruit',{method:'POST',body:{hours:12}})).data.code,'DUO_CONFIG_CONFLICT');
  assert.equal((await f.call('admin/ranked-duo/recruit',{method:'POST',body})).status,200);
  assert.equal((await f.call('admin/ranked-duo/recruit',{method:'POST',body})).data.code,'DUO_CONFIG_CONFLICT');
  assert.equal(Date.parse((await f.season()).config.additionalRecruitment.until)-f.clock(),3*hour);
  assert.equal((await f.call('admin/ranked-duo/pair',{method:'POST'})).data.code,'DUO_RECRUIT_OPEN');
  f.advance(hour);const changed=await open(f,4);assert.equal(changed.status,200);
  assert.equal(Date.parse(changed.data.season.additionalRecruitment.until)-f.clock(),4*hour);
  f.advance(4*hour);await f.tick();assert.equal((await open(f,1)).data.code,'DUO_PAIR_STATE');
  await paired(f);assert.equal((await rows(f,'ranked_duo_teams_v1')).length,2,'empty round publishes no teams');
  assert.equal((await open(f,1)).status,200);
  const current=await f.season();f.advance(Date.parse(current.config.endsAt)-f.clock());
  await f.tick();assert.equal((await f.season()).status,'SETTLING','original season end wins over recruitment');
 });
 test(`${postgres||'SQLite'} odd entrants wait for the next round; publication rolls back and retries once`,async t=>{
  const f=await weeklyFixture(t,{postgres});await f.active();
  await open(f,1);await f.call('ranked-duo/join',{user:6,method:'POST'});f.advance(hour);await paired(f);
  assert.equal((await f.call('ranked-duo/status',{user:6})).data.waiting,true);
  await open(f,1);await f.call('ranked-duo/join',{user:7,method:'POST'});f.advance(hour);
  while((await f.season()).config.additionalRecruitment.phase!=='PUBLISHING')await f.tick();
  const s=await f.season(),before=await rows(f,'ranked_duo_entries_v1');
  f.fail('UPDATE ranked_duo_entries_v1 SET team_id');await assert.rejects(f.tick(),/INJECTED/);f.fail('');
  assert.deepEqual(await rows(f,'ranked_duo_entries_v1'),before);assert.equal((await rows(f,'ranked_duo_teams_v1')).length,2);
  assert.equal((await f.season()).revision,s.revision);
  await duoLifecycle.pairStep(f.env,{id:1,role:'OWNER'},s,f.deps,f.clock());
  await assert.rejects(duoLifecycle.pairStep(f.env,{id:1,role:'OWNER'},s,f.deps,f.clock()));
  assert.equal((await rows(f,'ranked_duo_teams_v1')).length,3);
  assert.equal((await f.call('ranked-duo/status',{user:6})).data.waiting,false);
 });
 test(`${postgres||'SQLite'} an in-flight battle tolerates recruitment revisions but still rejects season closure`,async t=>{
  const f=await weeklyFixture(t,{postgres});await f.active();
  for(const close of [false,true]){
   const ticket=(await f.call('ranked-duo/match',{user:2,method:'POST'})).data,batch=f.env.DB.batch.bind(f.env.DB);let intercepted=false;
   f.env.DB.batch=async list=>{
    if(!intercepted&&list.some(s=>s.source.includes('INSERT INTO ranked_duo_matches_v1'))){
     intercepted=true;f.env.DB.batch=batch;
     if(close)await f.call('admin/ranked-duo/close',{method:'POST'});else assert.equal((await open(f,12)).status,200);
    }
    return batch(list);
   };
   const result=await f.call('ranked-duo/fight',{user:2,method:'POST',body:{matchToken:ticket.token,requestId:'extra-race-battle-'+String(close)}});
   f.env.DB.batch=batch;assert.equal(intercepted,true);
   assert.equal(result.data[close?'code':'status'],close?'DUO_CONFLICT':'COMPLETED',JSON.stringify(result));
  }
  assert.equal((await rows(f,'ranked_duo_matches_v1')).length,1);
 });
}
