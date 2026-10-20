import test from 'node:test';
import assert from 'node:assert/strict';
import {contentEnergy,contentEnergyView,CONTENT_ENERGY_RECHARGE_MS as H} from '../shared/content-energy-v1.mjs';
import {coopEnergy,coopEnergyKey,spendCoopEnergy,coopEntryKey} from '../functions/_cooperative_energy.js';
import {settleCoopRewards} from '../functions/_cooperative_rewards.js';
import {defaultCoopRewards,freezeCoopReward,COOP_SETTINGS_KEY,coopRewardDay} from '../shared/cooperative-rewards-v1.mjs';
import {legionHuntEnergy,legionHuntEntries} from '../functions/_legion_hunt.js';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
const at=Date.parse('2026-10-20T23:59:00+09:00');
const put=(f,key,value)=>f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run();
const read=async(f,key)=>{const row=await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();return row?JSON.parse(row.value):null;};
const policy=()=>{const rewards=defaultCoopRewards();rewards.enabled=true;rewards.difficulties[0].coin=100;return {mode:'ON',revision:1,rewards};};
const room=(id,cfg=policy())=>({id:String(id).padStart(10,'0'),creationRequest:'energy-test-'+id,createdAt:at-1000,finishedAt:at+10000,status:'VICTORY',difficulty:'NORMAL',rewardPolicy:freezeCoopReward(cfg,'NORMAL'),members:[1,2,3].map(id=>({id,name:'분대 '+id,result:'VICTORY'}))});
async function coopFixture(postgres){const f=await legionFixture({postgres});await f.DB.prepare("INSERT INTO users(id,nickname) VALUES(3,'세 번째 분대')").run();await put(f,COOP_SETTINGS_KEY,policy());return f;}

test('energy refills at exactly three hours, never at midnight, and cannot bank time above capacity',()=>{
 let e=contentEnergy(null,{at,maximum:3,initial:0});
 assert.equal(contentEnergyView(e,{at:at+60000,maximum:3}).current,0);
 assert.equal(contentEnergyView(e,{at:at+H-1,maximum:3}).current,0);
 assert.equal(contentEnergyView(e,{at:at+H,maximum:3}).current,1);
 assert.equal(contentEnergyView(e,{at:at+20*H,maximum:3}).current,3);
 e=contentEnergy(e,{at:at+20*H,maximum:3});e.current--;
 assert.equal(contentEnergyView(e,{at:at+20*H+1,maximum:3}).current,2);
 assert.equal(contentEnergyView(e,{at:at+21*H,maximum:3}).current,3);
 assert.equal(contentEnergyView({...e,current:0},{at:at-1,maximum:3}).current,0,'backward clock cannot mint energy');
});
for(const postgres of [false,true]){
 const engine=postgres?'PostgreSQL':'SQLite';
 test(`${engine}: old cooperative quota converts once, shared across difficulties and dates`,async()=>{
  const f=await coopFixture(postgres);try{
   await put(f,`coop_reward_day_v1:${coopRewardDay(at).day}:1`,{count:3});
   assert.equal((await coopEnergy(f.env,1,at)).current,0);
   assert.equal((await coopEnergy(f.env,1,at+60000)).current,0);
   assert.equal((await coopEnergy(f.env,1,at+H)).current,1);
   await spendCoopEnergy(f.env,room(1),at+H);
   assert.equal((await coopEnergy(f.env,1,at+H)).current,0);
  }finally{await f.close();}
 });
 test(`${engine}: three-player entry is atomic, replay safe, and reward no longer consumes a daily quota`,async()=>{
  const f=await coopFixture(postgres);try{
   for(let i=1;i<=3;i++){
    const r=room(i),proof=await spendCoopEnergy(f.env,r,at);
    assert.deepEqual(await spendCoopEnergy(f.env,r,at+10),proof);
    await settleCoopRewards(f.env,r);await settleCoopRewards(f.env,r);
   }
   assert.equal((await coopEnergy(f.env,1,at)).current,0);
   await assert.rejects(spendCoopEnergy(f.env,room(4),at+H-1),{code:'COOP_ENERGY_EMPTY'});
   assert.equal(await read(f,coopEntryKey(room(4).id)),null);
   await spendCoopEnergy(f.env,room(4),at+H);await settleCoopRewards(f.env,room(4));
   assert.equal(Number((await f.DB.prepare('SELECT coin FROM users WHERE id=1').first()).coin),400);
   assert.equal((await coopEnergy(f.env,1,at+H)).current,0);
   await assert.rejects(settleCoopRewards(f.env,room(5)),/entry proof/);
   await put(f,coopEnergyKey(3),{version:1,current:0,maximum:3,updatedAt:at+2*H});
   const before=await read(f,coopEnergyKey(1));
   await assert.rejects(spendCoopEnergy(f.env,room(6),at+2*H),{code:'COOP_ENERGY_EMPTY'});
   assert.deepEqual(await read(f,coopEnergyKey(1)),before,'one empty player cannot charge teammates');
   await put(f,COOP_SETTINGS_KEY,{...policy(),mode:'TEST'});
   assert.equal((await spendCoopEnergy(f.env,room(7,{...policy(),mode:'TEST'}),at+2*H)).charged,false);
   assert.deepEqual(await read(f,coopEnergyKey(1)),before,'TEST does not use live energy');
   await put(f,COOP_SETTINGS_KEY,{...policy(),mode:'OFF'});
   await assert.rejects(spendCoopEnergy(f.env,room(8),at+3*H),{code:'COOP_CLOSED'});
  }finally{await f.close();}
 });
 test(`${engine}: entry failure rolls all debits back; receipt and later reward survive lost acknowledgement`,async()=>{
  const f=await coopFixture(postgres);try{
   for(const id of [1,2,3])await coopEnergy(f.env,id,at);
   f.fail('UPDATE app_meta SET value');
   await assert.rejects(spendCoopEnergy(f.env,room(11),at));f.fail('');
   assert.equal((await coopEnergy(f.env,1,at)).current,3);assert.equal(await read(f,coopEntryKey(room(11).id)),null);
   await spendCoopEnergy(f.env,room(11),at);
   f.fail('UPDATE users SET coin');await assert.rejects(settleCoopRewards(f.env,room(11)));f.fail('');
   assert.equal((await coopEnergy(f.env,1,at)).current,2,'reward failure never charges twice');
   assert.equal(Number((await f.DB.prepare('SELECT coin FROM users WHERE id=1').first()).coin),0);
   await settleCoopRewards(f.env,room(11));
   await assert.rejects(spendCoopEnergy(f.env,{...room(11),creationRequest:'collision'},at),/collision/);
  }finally{await f.close();}
 });
 test(`${engine}: legion energy persists, regenerates, refunds once before coins, and keeps supporter capacity`,async()=>{
  const f=await legionFixture({postgres});try{
   const cfg=await f.configure();cfg.mode='ON';await f.call('admin/legion-hunt',{policy:cfg},{method:'PATCH'});f.setUser(f.player);f.clock.now=at;
   const key='legion_hunt_owner_session_v1:2';
   await put(f,key,{daily:{day:coopRewardDay(at).day,used:10}});
   const recovered=await f.call('legion-hunt/recover',{});assert.equal(recovered.body.entries.current,0);
   assert.equal((await f.call('legion-hunt/start',{difficulty:'normal'})).body.code,'HUNT_ENERGY_EMPTY');
   f.clock.now=at+60000;assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.current,0);
   f.clock.now=at+H;
   const start=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(start.status,200,JSON.stringify(start.body));
   const id=start.body.id;
   const begun=await f.call('legion-hunt/begin',{id});assert.equal(begun.body.entries.current,0);
   assert.equal((await f.call('legion-hunt/begin',{id})).body.entries.current,0,'repeated begin is free');
   const cancelled=await f.call('legion-hunt/cancel',{id});assert.equal(cancelled.body.recovery.refunded,true);assert.equal(cancelled.body.entries.current,1);
   await f.call('legion-hunt/cancel',{id});assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.current,1);
   const next=await f.call('legion-hunt/start',{difficulty:'normal'});await f.call('legion-hunt/begin',{id:next.body.id});
   const run=await read(f,key);run.coins.paid=1;await put(f,key,run);
   assert.equal((await f.call('legion-hunt/recover',{})).body.recovery.refunded,false);
   assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.current,0);
   const support={active:true,startsAt:at-1,endsAt:at+10*H};
   assert.equal(legionHuntEntries(null,at,f.player,support).maximum,13);
   assert.equal(legionHuntEnergy({energy:{version:1,current:13,updatedAt:at}},at,null).current,10);
   assert.equal(legionHuntEntries(null,at,f.owner).unlimited,true);
   assert.equal(legionHuntEnergy(null,at,null,f.owner).maximum,10);
  }finally{await f.close();}
 });
}
test('concurrent cooperative rooms cannot spend the same three energy charges twice',async()=>{
 const f=await coopFixture(false);try{
  const results=await Promise.allSettled([21,22,23,24,25].map(id=>spendCoopEnergy(f.env,room(id),at)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
  assert.equal((await coopEnergy(f.env,1,at)).current,0);
  const replay=await read(f,coopEntryKey(room(21).id));if(replay)assert.deepEqual(await spendCoopEnergy(f.env,room(21),at),replay);
 }finally{await f.close();}
});
