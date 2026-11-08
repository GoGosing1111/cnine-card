import test from 'node:test';import assert from 'node:assert/strict';
import {SEASON_S1_SCHEMA,seasonAccount} from '../functions/_season_s1.js';
import {ensureJointAtomicSchema} from '../functions/_joint_atomic.js';
import {settleCoopRewards} from '../functions/_cooperative_rewards.js';
import {settleDefenseRewards} from '../functions/_monster_defense_rewards.js';
import {defaultCoopRewards,COOP_SETTINGS_KEY,freezeCoopReward} from '../shared/cooperative-rewards-v1.mjs';
import {defaultDefenseSettings} from '../shared/monster-defense-v1.mjs';
import {freezeDefenseReward} from '../shared/monster-defense-rewards-v1.mjs';
import {defenseEntryReceiptKey} from '../functions/_monster_defense_entry.js';
import {coopEntryKey} from '../functions/_cooperative_energy.js';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {defenseRewardFixture} from './helpers/monster-defense-reward-db.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
const time=Date.parse('2026-11-07T10:00:00+09:00');
async function install(env,postgres,clock){
 await ensureJointAtomicSchema(env);if(postgres)await env.DB.execSchema(SEASON_S1_SCHEMA.map(sql=>sql.replaceAll('INTEGER','BIGINT')));else for(const sql of SEASON_S1_SCHEMA)await env.DB.prepare(sql).run();
 env.SEASON_S1_ENABLED='1';env.SEASON_S1_SCHEDULE={PVE:{start:time-86400000}};env.SEASON_S1_NOW=clock;
}
const count=async(env,id,source)=>(await seasonAccount(env,id)).state.tracks.PVE.counts[source]||0;
const meta=(env,key,val)=>env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(val)).run();
for(const postgres of [false,true]){const tag=postgres?'PostgreSQL':'SQLite';
 test(tag+': actual legion start/begin/finish counts terminal combat once; retreat earns nothing; failed finish recovers',async t=>{
  const f=await legionFixture({postgres});t.after(()=>f.close());f.clock.now=time;await install(f.env,postgres,()=>f.clock.now);
  f.deps.createSession=opts=>Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy:{id:'normal',huntDurationMs:1000,...opts.dropPolicy},timeLimit:1000,eventTimes:[100,1000],timeline:[{seq:1,combatAtMs:100,huntKill:true},{seq:2,type:'RESULT',combatAtMs:1000,winner:'B',reason:'TIME_LIMIT'}],outcome:{}},{now:opts.now}),{payload:{}});
  f.setUser(f.owner);const policy=(await f.call('admin/legion-hunt')).body.policy;policy.mode='ON';assert.equal((await f.call('admin/legion-hunt',{policy},{method:'PATCH'})).status,200);f.setUser(f.player);
  const start=async()=>{const r=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(r.status,200,JSON.stringify(r.body));const id=r.body.id;assert.equal((await f.call('legion-hunt/begin',{id})).status,200);f.clock.now+=1100;return id;};
  const retreat=await start();assert.equal((await f.call('legion-hunt/finish',{id:retreat,seq:1})).body.reason,'RETREAT');assert.equal(await count(f.env,f.player.id,'LEGION'),0);
  const id=await start(),finish=()=>f.call('legion-hunt/finish',{id,seq:2});f.fail('UPDATE season_s1_accounts');assert.equal((await finish()).status,503);assert.equal(await count(f.env,f.player.id,'LEGION'),0);f.fail('');
  const settled=await finish();assert.equal(settled.status,200,JSON.stringify(settled.body));assert.equal(settled.body.reason,'TIME_LIMIT');await finish();assert.equal(await count(f.env,f.player.id,'LEGION'),1);
 });
 test(tag+': terminal battleground and defense settlements count wins + ordinary defeats, preserve base rewards and skip practice, absent or forfeited members',async t=>{
  const f=await defenseRewardFixture(postgres);t.after(()=>f.close());const env=f.env;await install(env,postgres,()=>time);
  const coop={mode:'ON',revision:1,rewards:defaultCoopRewards()};coop.rewards.enabled=true;coop.rewards.difficulties[0].coin=100;await meta(env,COOP_SETTINGS_KEY,coop);
  const def=defaultDefenseSettings();def.mode='ON';def.rewardsEnabled=true;def.difficulties.find(d=>d.id==='NORMAL').clearReward={coin:100,masterStars:0,items:[]};await f.writeSettings(def);
  const room=(src,i,win)=>{const result=win?'VICTORY':'DEFEAT',base={id:(src==='COOP'?'C':'D')+String(i).padStart(11,'0'),creationRequest:'run-'+src+'-'+i,createdAt:time-80000,finishedAt:time,difficulty:'NORMAL'};
   return src==='COOP'?{...base,status:result,startsAt:time-60000,durationMs:60000,withdrawals:[{ownerId:3}],rewardPolicy:freezeCoopReward(coop,'NORMAL'),members:[1,2,3].map(id=>({id,result:id===3?'DEFEAT':result,...(id===3?{reason:'전투 이탈'}:{})}))}:
    {...base,phase:result,startedAt:time-70000,practice:false,accountRoster:true,entryRequired:true,capacity:3,wave:win?30:3,coreHp:win?400:0,encounter:{waves:30,name:'디펜스'},rewardPolicy:freezeDefenseReward(def,'NORMAL'),players:[1,2,3].map(n=>({id:String(n),bot:false,lastSeen:n===3?time-65000:time})),rewardParticipants:['1','2','3']};};
  for(const src of ['COOP','DEFENSE']){
   const settle=src==='COOP'?settleCoopRewards:settleDefenseRewards,entryKey=src==='COOP'?coopEntryKey:defenseEntryReceiptKey;
   for(const [i,win] of [[1,false],[2,true]]){
    const r=room(src,i,win);await assert.rejects(settle(env,r),/entry proof/);await meta(env,entryKey(r.id),{creationRequest:r.creationRequest,createdAt:r.createdAt,userIds:[1,2,3],charged:true});
    const res=await settle(env,r);assert.equal(res[1].granted,win);assert.deepEqual(await settle(env,r),res);assert.equal(await count(env,1,src),i);assert.equal(await count(env,2,src),i);assert.equal(await count(env,3,src),src==='DEFENSE'&&win?1:0);
   }
   const bad=room(src,3,false);if(src==='DEFENSE')bad.practice=true;else {bad.status='CANCELLED';bad.members.forEach(m=>m.result='DEFEAT');}
   await settle(env,bad);assert.equal(await count(env,1,src),2);
  }
  assert.equal(Number((await f.first('SELECT coin FROM users WHERE id=1')).coin),1200);
 });
}
