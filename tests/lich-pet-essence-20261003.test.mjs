import test from 'node:test';
import assert from 'node:assert/strict';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
async function battle(h,{mode='ON',quantity=5,enabled=true}={}){
  const roomId=await h.party();await h.configure({mode,petEssenceReward:quantity,petEssenceEnabled:enabled});
  // Create a fresh room under the final release mode.
  await h.command('leave',{roomId});
  const next=(await h.command('open')).body.roomId;
  for(const user of [2,3])await h.command('join',{roomId:next},user);
  await h.command('assign',{roomId:next,targetId:'2',role:'WARDEN'});await h.command('assign',{roomId:next,targetId:'3',role:'RESCUE'});
  for(const user of [1,2,3])await h.command('ready',{roomId:next,ready:true},user);
  assert.equal((await h.command('start',{roomId:next})).status,200);
  const raw=JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',next)).state_json),now=Date.now();
  raw.step='EXPOSED';raw.round=6;raw.boss.hp=1;raw.challenge={id:'final-test',coop:true,kind:'FINALE',startedAt:now,deadline:now+60000,lastStrikes:{},inputEpochs:{},rescues:[],seals:[],chains:[]};raw.clock=now;raw.endsAt=now+120000;
  await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(raw),next);
  const view=(await h.call('status?roomId='+next)).body.state,control=view.controls.find(c=>c.action==='STRIKE');
  return {roomId:next,body:{roomId:next,challengeId:'final-test',action:'STRIKE',stepToken:control.token,requestId:h.uid()}};
}
for(const postgres of [false,true])test('final CLEAR atomically grants each present participant 5; replay/GET never duplicate '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const h=await lichLiveFixture({postgres});t.after(()=>h.close());const {roomId,body}=await battle(h);
  await h.configure({petEssenceReward:9});
  const clear=await h.call('action',{body});assert.equal(clear.status,200,JSON.stringify(clear.body));assert.equal(clear.body.state.status,'CLEAR');assert.equal(clear.body.state.petEssenceReward.quantity,5);assert.equal(clear.body.state.petEssenceReward.granted,true);
  await h.call('action',{body});await h.call('status?roomId='+roomId,{user:2});await h.call('status?roomId='+roomId);
  const rows=await h.all("SELECT * FROM cnine_user_inventory WHERE item_code='PET_ESSENCE' ORDER BY user_id");assert.deepEqual(rows.map(r=>[Number(r.user_id),Number(r.quantity),Number(r.unseen_quantity)]),[[1,5,5],[2,5,5],[3,5,5]]);
  assert.equal((await h.all("SELECT * FROM inventory_logs WHERE reference_type='LICH_RAID_CLEAR'")).length,3);
});
test('TEST clears do not grant and failed reward write leaves battle ACTIVE for safe retry',async t=>{
  const h=await lichLiveFixture();t.after(()=>h.close());const first=await battle(h,{mode:'TEST'});
  assert.equal((await h.call('action',{body:first.body})).body.state.petEssenceReward.status,'DISABLED');
  assert.equal((await h.all("SELECT * FROM cnine_user_inventory WHERE item_code='PET_ESSENCE'")).length,0);
  const second=await battle(h);h.inject('INSERT INTO inventory_logs');assert.equal((await h.call('action',{body:second.body})).status,503);h.inject('');
  assert.equal((await h.call('status?roomId='+second.roomId)).body.state.status,'ACTIVE');
  assert.equal((await h.call('action',{body:second.body})).body.state.petEssenceReward.granted,true);
});
test('editable reward, disable switch, range and departure exclusion',async t=>{
  const h=await lichLiveFixture();t.after(()=>h.close());
  assert.equal((await h.call('admin/raid/lich/settings')).body.settings.petEssenceReward,5);
  assert.equal((await h.configure({petEssenceReward:0})).status,400);
  const first=await battle(h,{quantity:7});await h.command('leave',{roomId:first.roomId},2);
  assert.equal((await h.call('action',{body:first.body})).body.state.status,'CLEAR');
  assert.equal(await h.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='PET_ESSENCE'"),null);
  assert.equal(Number((await h.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='PET_ESSENCE'")).quantity),7);
  const second=await battle(h,{enabled:false});assert.equal((await h.call('action',{body:second.body})).body.state.petEssenceReward.status,'DISABLED');
  assert.equal(Number((await h.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='PET_ESSENCE'")).quantity),7);
});
