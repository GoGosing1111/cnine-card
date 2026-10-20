import test from 'node:test';
import assert from 'node:assert/strict';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';

test('owned Zero can select and ready first or last through the real cooperative API',async()=>{
 const h=await cooperativeMiniflare();
 try{
  const cfg=(await h.request(1,'settings')).settings;cfg.mode='ON';
  assert.equal((await h.request(1,'settings',{settings:cfg})).status,200);
  // Isolated QA ownership only. Production ownership is never changed here.
  await h.db.batch([{sql:"INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count) VALUES(1,'V-976',1,0)"}]);
  const options=await h.request(1,'options');assert.equal(options.status,200);
  assert(options.mercenaries.some(m=>m.code==='V-976'&&m.canDeploy));
  const squads=coopSquads();
  for(const order of [[1,2,3],[2,3,1]]){
   const clients=[1,2,3].map(id=>'zero-ready-'+order.join('')+'-client-'+id);let roomId;
   const command=(id,kind,extra={})=>h.request(id,kind,{clientId:clients[id-1],requestId:crypto.randomUUID(),roomId,...extra});
   const created=await command(1,'create',{difficulty:'NORMAL'});assert.equal(created.status,200);roomId=created.roomId;
   for(const id of [2,3])assert.equal((await command(id,'join')).status,200);
   for(const id of order){
    const loadout={cardIds:squads[id-1].cards.map(c=>c.id),mercenaryCode:id===1?'V-976':squads[id-1].mercenary.code};
    const selected=await command(id,'select',loadout);assert.equal(selected.status,200,JSON.stringify(selected));
    const ready=await command(id,'ready',loadout);assert.equal(ready.status,200,JSON.stringify(ready));
    assert(ready.state.members.find(m=>m.id===id).ready);
   }
   const current=await h.request(1,'current');assert.equal(current.state.status,'LOADING');
   assert(current.state.members.every(m=>m.ready));
   assert.equal(current.state.members.find(m=>m.id===1).selection.mercenary.code,'V-976');
   assert.equal(current.state.energy.current,order[0]===1?2:1);
   for(const id of [1,2,3])assert.equal((await command(id,'leave')).status,200);
  }
 }finally{await h.dispose();}
});

test('zero energy blocks room creation and second-seat joining before membership changes, but a charged battle remains accessible',async()=>{
 const h=await cooperativeMiniflare();
 try{
  const cfg=(await h.request(1,'settings')).settings;cfg.mode='ON';
  assert.equal((await h.request(1,'settings',{settings:cfg})).status,200);
  await h.db.batch([{sql:"UPDATE app_meta SET value=json_set(value,'$.encounterVersion',3) WHERE key='cooperative_battleground_settings_v1'"},
   {sql:"INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count) VALUES(1,'V-976',1,0)"}]);
  const setEnergy=at=>h.db.batch([{sql:'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',args:['coop_energy_v1:2',JSON.stringify({version:1,current:0,maximum:3,updatedAt:at})]}]);
  await setEnergy(Date.now());
  const clients=[1,2,3].map(id=>'zero-second-seat-client-'+id);let roomId;
  const command=(id,kind,extra={})=>h.request(id,kind,{clientId:clients[id-1],requestId:crypto.randomUUID(),roomId,...extra});
  const denied=await command(2,'create',{difficulty:'NORMAL'});assert.equal(denied.status,409);assert.equal(denied.code,'COOP_ENERGY_EMPTY');
  assert.equal((await h.request(2,'current')).state,null);
  const created=await command(1,'create',{difficulty:'NORMAL'});assert.equal(created.status,200);roomId=created.roomId;
  const joined=await command(2,'join');assert.equal(joined.status,409);assert.equal(joined.code,'COOP_ENERGY_EMPTY');
  assert.equal((await h.request(2,'current')).state,null);assert.equal((await h.request(1,'current')).state.members.length,1);
  await setEnergy(Date.now()-3*60*60*1000);
  assert.equal((await command(2,'join')).status,200);assert.equal((await h.request(2,'feature')).energy.current,1,'lobby entry does not spend energy');
  assert.equal((await command(3,'join')).status,200);
  const squads=coopSquads();
  for(const id of [1,3,2]){
   const ready=await command(id,'ready',{cardIds:squads[id-1].cards.map(c=>c.id),mercenaryCode:id===1?'V-976':squads[id-1].mercenary.code});
   assert.equal(ready.status,200,JSON.stringify(ready));
  }
  const current=await h.request(2,'current');assert.equal(current.state.status,'LOADING');assert.equal(current.state.energy.current,0);
  assert.equal((await command(2,'ticket')).status,200,'zero after admission cannot prevent loading or reconnecting');
  assert.equal((await command(2,'leave')).status,200,'leaving is always allowed');
  for(const id of [1,3])assert.equal((await command(id,'leave')).status,200);
  cfg.mode='TEST';cfg.revision=(await h.request(1,'settings')).settings.revision;
  assert.equal((await h.request(1,'settings',{settings:cfg})).status,200);
  const practice=await command(2,'create',{difficulty:'NORMAL'});assert.equal(practice.status,200,'TEST remains free');
 }finally{await h.dispose();}
});
