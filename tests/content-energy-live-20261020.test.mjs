import test from 'node:test';
import assert from 'node:assert/strict';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
test('real room recovers a durable start intent after DB failure and a lost commit acknowledgement',async()=>{
 const h=await cooperativeMiniflare({worker:'tests/helpers/cooperative-energy-worker.mjs'});let roomId;
 const command=(id,kind,extra={})=>h.request(id,kind,{roomId,clientId:'energy-live-client-'+id,requestId:crypto.randomUUID(),...extra});
 try{
  const config=(await h.request(1,'settings')).settings;config.mode='ON';assert.equal((await h.request(1,'settings',{settings:config})).status,200);
  roomId=(await command(1,'create',{difficulty:'NORMAL'})).roomId;
  for(const id of [2,3])assert.equal((await command(id,'join')).status,200);
  const squads=coopSquads();
  for(const id of [1,2,3])await h.request(id,'feature');
  await h.db.batch([{sql:"CREATE TRIGGER energy_failure BEFORE INSERT ON app_meta WHEN NEW.key LIKE 'coop_entry_energy_v1:%' BEGIN SELECT RAISE(ABORT,'injected entry failure'); END"}]);
  for(const id of [1,2])assert.equal((await command(id,'ready',{cardIds:squads[id-1].cards.map(c=>c.id),mercenaryCode:squads[id-1].mercenary.code})).status,200);
  const third=await command(3,'ready',{cardIds:squads[2].cards.map(c=>c.id),mercenaryCode:squads[2].mercenary.code});assert.equal(third.code,'COOP_ENERGY_PENDING');
  for(const id of [1,2,3])assert.equal((await h.request(id,'feature')).energy.current,3);
  await h.db.batch([{sql:'DROP TRIGGER energy_failure'}]);
  const recovered=await h.request(1,'current');assert.equal(recovered.status,200);assert.equal(recovered.state.status,'LOADING');
  for(const id of [1,2,3])assert.equal((await h.request(id,'feature')).energy.current,2);
  await fetch(h.origin+'/__qa/energy-lost-ack',{method:'POST',body:JSON.stringify({id:roomId})});
  assert.equal((await h.request(1,'current')).state.status,'LOADING');
  for(const id of [1,2,3])assert.equal((await h.request(id,'feature')).energy.current,2,'recovery replays committed entry, never charges twice');
 }finally{await h.dispose();}
});
