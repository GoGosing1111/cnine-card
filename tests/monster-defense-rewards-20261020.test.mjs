import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultDefenseSettings,validateDefenseSettings,defenseAccess,DEFENSE_DIFFICULTIES,DEFENSE_KEY} from '../shared/monster-defense-v1.mjs';
import {freezeDefenseReward} from '../shared/monster-defense-rewards-v1.mjs';
import {settleDefenseRewards} from '../functions/_monster_defense_rewards.js';
import {defenseRewardFixture} from './helpers/monster-defense-reward-db.mjs';
const at=Date.parse('2026-10-20T09:00:00+09:00');
function settings(){const s=defaultDefenseSettings();s.mode='ON';s.revision=4;s.rewardsEnabled=true;s.difficulties.forEach((d,i)=>d.clearReward={coin:100*(i+1),masterStars:i+1,items:[{code:'PET_ESSENCE',quantity:i+2}]});return s;}
function room(n,{config=settings(),difficulty='NORMAL',practice=false,phase='VICTORY'}={}){
 return {id:n.toString(16).padStart(12,'0').toUpperCase(),kind:'MONSTER_DEFENSE_V1',creationRequest:'qa-clear-'+n,createdAt:at-60000,startedAt:at-59000,finishedAt:at,phase,difficulty,practice,accountRoster:true,capacity:3,wave:30,coreHp:500,
  encounter:{waves:30,name:DEFENSE_DIFFICULTIES.find(d=>d.id===difficulty).name},rewardPolicy:freezeDefenseReward(config,difficulty,practice),players:[1,2,3].map(id=>({id:String(id),bot:false})),rewardParticipants:['1','2','3']};
}
test('ON access and five CMS rewards default empty; legacy TEST rows stay locked',()=>{
 const initial=defaultDefenseSettings();assert.equal(initial.mode,'TEST');assert.equal(initial.rewardsEnabled,false);assert(initial.difficulties.every(d=>d.clearReward.coin===0&&!d.clearReward.items.length));
 for(const d of initial.difficulties)delete d.clearReward;
 assert.deepEqual(validateDefenseSettings(initial),defaultDefenseSettings());
 assert.equal(defenseAccess({id:9,role:'USER'},initial),false);assert.equal(defenseAccess({id:9,role:'USER'},{...initial,mode:'ON'}),true);assert.equal(defenseAccess(null,{...initial,mode:'ON'}),false);assert.equal(defenseAccess({id:1,role:'OWNER'},{...initial,mode:'OFF'}),false);
 assert.deepEqual(validateDefenseSettings(settings()),settings());
 for(const change of [s=>s.mode='INVALID',s=>s.difficulties[0].clearReward.coin=-1,s=>s.difficulties[0].clearReward.coin=1e12+1,s=>s.difficulties[0].clearReward.masterStars=.5,s=>s.difficulties[0].clearReward.items[0].code='MASTER_STAR',s=>s.difficulties[0].clearReward.items[0].quantity=0,s=>s.difficulties[0].clearReward.items.push(s.difficulties[0].clearReward.items[0])]){const s=settings();change(s);assert.throws(()=>validateDefenseSettings(s));}
 assert.throws(()=>validateDefenseSettings({...defaultDefenseSettings(),rewardsEnabled:true}));
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} all five difficulty rewards: one atomic receipt per clear, frozen amounts, OFF and no retroactive TEST rewards`,async()=>{
 const f=await defenseRewardFixture(postgres);try{
  await f.writeSettings(settings());let total=1000;
  for(const [i,d]of DEFENSE_DIFFICULTIES.entries()){
   const r=room(i+1,{difficulty:d.id}),result=await settleDefenseRewards(f.env,r);total+=100*(i+1);
   assert.equal(result[1].coin,100*(i+1));assert.equal(result[2].masterStars,i+1);assert.equal(result[3].items[0].name,'펫 정수');
   assert.deepEqual(await settleDefenseRewards(f.env,r),result);
  }
  assert.equal(Number((await f.first('SELECT coin FROM users WHERE id=1')).coin),total);
  assert.equal(Number((await f.first('SELECT COUNT(*) n FROM coin_logs')).n),15);
  const changed=settings();changed.difficulties[1].clearReward.coin=900;await f.writeSettings(changed);
  assert.equal((await settleDefenseRewards(f.env,room(10)))[1].coin,200,'room uses creation-time reward');
  changed.rewardsEnabled=false;await f.writeSettings(changed);assert.equal((await settleDefenseRewards(f.env,room(11)))[1].status,'DISABLED');
  changed.rewardsEnabled=true;await f.writeSettings(changed);assert.equal((await settleDefenseRewards(f.env,room(11)))[1].status,'DISABLED','OFF receipt remains final');
  changed.mode='OFF';await f.writeSettings(changed);assert.equal((await settleDefenseRewards(f.env,room(12)))[1].status,'DISABLED');
  changed.mode='ON';await f.writeSettings(changed);
  for(const [r,status]of [[room(20,{config:{...settings(),mode:'TEST'}}),'TEST'],[room(21,{practice:true}),'PRACTICE'],[room(22,{phase:'DEFEAT'}),'DEFEAT']])assert.equal((await settleDefenseRewards(f.env,r))[1].status,status);
  const legacy=room(23);delete legacy.rewardPolicy;assert.equal((await settleDefenseRewards(f.env,legacy))[1].granted,false);
  for(const patch of [{phase:'WAVE'},{wave:29},{coreHp:0},{startedAt:null},{rewardParticipants:['1','2']},{players:[{id:'1'},{id:'1'},{id:'2'}]}])await assert.rejects(settleDefenseRewards(f.env,{...room(24),...patch}));
  const r=room(25);await settleDefenseRewards(f.env,r);await assert.rejects(settleDefenseRewards(f.env,{...r,creationRequest:'collision'}));
 }finally{await f.close();}
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} failed participant, unavailable item and overflow roll back every balance, receipt and log`,async()=>{
 const f=await defenseRewardFixture(postgres);try{
  await f.writeSettings(settings());await f.run('DELETE FROM users WHERE id=3');await assert.rejects(settleDefenseRewards(f.env,room(30)));
  assert.equal(Number((await f.first('SELECT coin FROM users WHERE id=1')).coin),1000);assert.equal(Number((await f.first('SELECT COUNT(*) n FROM inventory_logs')).n),0);assert.equal(await f.first("SELECT value FROM app_meta WHERE key='monster_defense_reward_receipt_v1:00000000001E'"),null);
  await f.run('INSERT INTO users VALUES(3,1000)');assert.equal((await settleDefenseRewards(f.env,room(30)))[3].granted,true);
  await f.run("UPDATE inventory_items SET is_active=0 WHERE code='PET_ESSENCE'");await assert.rejects(settleDefenseRewards(f.env,room(31)));await f.run("UPDATE inventory_items SET is_active=1 WHERE code='PET_ESSENCE'");
  await f.run('UPDATE users SET coin=9007199254740991 WHERE id=3');await assert.rejects(settleDefenseRewards(f.env,room(32)));
  assert.equal(Number((await f.first('SELECT coin FROM users WHERE id=1')).coin),1200);assert.equal(Number((await f.first('SELECT COUNT(*) n FROM coin_logs')).n),3);
  assert.equal(await f.first("SELECT value FROM app_meta WHERE key='monster_defense_reward_receipt_v1:000000000020'"),null);
 }finally{await f.close();}
});
test('concurrent terminal deliveries and independent clear rooms never duplicate a receipt',async()=>{
 const f=await defenseRewardFixture();try{
  await f.writeSettings(settings());const a=room(40),b=room(41);
  const results=await Promise.all([settleDefenseRewards(f.env,a),settleDefenseRewards(f.env,a),settleDefenseRewards(f.env,b)]);
  assert.deepEqual(results[0],results[1]);assert.equal(Number((await f.first('SELECT coin FROM users WHERE id=1')).coin),1400);assert.equal(Number((await f.first('SELECT COUNT(*) n FROM coin_logs')).n),6);
 }finally{await f.close();}
});
