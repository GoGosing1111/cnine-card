import test from 'node:test';
import assert from 'node:assert/strict';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
import {ACCOUNT_RANK_SCHEMA} from '../functions/_account_rank.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
test('each authenticated participant carries their own server rank through ready and battle payload',async()=>{
 const h=await cooperativeMiniflare();let roomId;const squads=coopSquads(),levels=[1,100,250];
 const cmd=(id,kind,extra={})=>h.request(id,kind,{roomId,clientId:'rank-regression-client-'+id,requestId:crypto.randomUUID(),...extra});
 try{
  await h.db.exec(ACCOUNT_RANK_SCHEMA.join(';'));
  await h.db.batch(levels.map((l,i)=>({sql:'INSERT INTO account_rank_progress_v1(user_id,total_ticks) VALUES(?,?)',args:[i+1,(2*(l-1)**2+62*(l-1))*600*8]})));
  const created=await cmd(1,'create',{difficulty:'NORMAL'});assert.equal(created.status,200,JSON.stringify(created));roomId=created.roomId;
  for(const id of [2,3])assert.equal((await cmd(id,'join')).status,200);
  for(const id of [1,2,3]){
   const squad=squads[id-1],result=await cmd(id,'ready',{cardIds:squad.cards.map(c=>c.id),mercenaryCode:squad.mercenary.code});
   assert.equal(result.status,200,JSON.stringify(result));
  }
  for(const id of [1,2,3]){
   const response=await h.request(id,'current');
   const members=response.payload.battleV2.teams.A.members;
   assert.deepEqual(members.map(m=>[m.ownerId,m.ownerRankLevel]),[[1,1],[2,100],[3,250]]);
   assert.ok(members.every(m=>!('progress'in m)&&!('total_ticks'in m)));
  }
 }finally{await h.dispose();}
});
test('legacy loadouts have unknown ranks without affecting combat',()=>{
 const squads=coopSquads(),plain=createCooperativeBattle({squads,seed:123});
 const ranked=createCooperativeBattle({squads:squads.map((s,i)=>({...s,ownerRankLevel:[1,100,250][i]})),seed:123});
 assert.deepEqual(plain.payload.battleV2.result,ranked.payload.battleV2.result);
 assert.ok(plain.payload.battleV2.teams.A.members.every(m=>m.ownerRankLevel===null));
});

