import test from 'node:test';
import assert from 'node:assert/strict';
import inputs from './fixtures/cooperative-mixed-speed-20261004.json' with {type:'json'};
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {fixture} from './helpers/cooperative-fixture.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {createCoopRoom,coopCommand} from '../functions/_cooperative_room.js';
const squads=(code='V-049')=>inputs.map((s,i)=>({...structuredClone(s),mercenary:candidate(i===2?code:s.mercenaryCode),singleHealerBonus:fixture.singleHealerBonus}));
const build=(party,version=2)=>createCooperativeBattle({squads:party,difficulty:'HARD',seed:3375805316,turnClockVersion:version});
const first=(b,id)=>b.payload.battleV2.result.timeline.find(e=>e.actorId===id&&['TURN','MERCENARY_WINDUP'].includes(e.type));

test('mixed-speed cooperative cards and each owner mercenary act before any allies fall',()=>{
 for(const code of ['V-049','V-055']){
  const party=squads(code),before=build(party,1),after=build(party);
  const id='A:OWNER:3:MERCENARY:'+code,event=first(after,id);
  assert.ok(event&&event.combatAtMs<15000,code+' must participate from the opening');
  const old=first(before,id);assert.ok(!old||old.combatAtMs>event.combatAtMs+30000,'fixture must reproduce delayed legacy participation');
  const state=after.states.find(s=>s.group===event.combatGroup);
  assert.equal(state.A.filter(a=>!a.isMercenary&&a.hp>0).length,6,'no card must die to unlock this owner');
  for(const s of party)for(const c of s.cards){const e=first(after,`A:OWNER:${s.ownerId}:CARD:${c.id}`);assert.ok(e&&e.combatAtMs<30000,'all six cards receive a turn');}
 }
});

test('cooperative basic attacks remain available at 1m, 20m and 100m card power without assigned skills',()=>{
 for(const power of [1e6,2e7,1e8]){
  const party=squads();for(const s of party){s.equipmentBonus=0;s.cards.forEach(c=>c.power=power);s.mercenary.skills=[];}
  const result=build(party);
  for(const s of party){const event=first(result,`A:OWNER:${s.ownerId}:MERCENARY:${s.mercenary.code}`);assert.equal(event?.type,'TURN');assert.ok(event.combatAtMs<20000);assert.equal(result.states.find(state=>state.group===event.combatGroup).A.filter(a=>a.hp>0).length,9);}
 }
});

test('new rooms snapshot the fixed clock; existing rooms rebuild with their original clock',()=>{
 for(const legacy of [false,true]){
  const party=squads(),room=createCoopRoom({id:'ABC1234567',user:{id:1,nickname:'분대 1'},clientId:'qa-clock-client-1',difficulty:'HARD',seed:3375805316,now:1000});
  assert.equal(room.turnClockVersion,2);if(legacy)delete room.turnClockVersion;
  for(const id of [2,3])coopCommand(room,{id,nickname:'분대 '+id},'join',{clientId:'qa-clock-client-'+id},1000);
  for(const s of party)coopCommand(room,{id:s.ownerId},'ready',{clientId:'qa-clock-client-'+s.ownerId,loadout:s},1100);
  const expected=createCooperativeBattle({squads:party,difficulty:'HARD',seed:room.seed,combat:room.combat,turnClockVersion:legacy?1:2});
  assert.deepEqual(room.payload.battleV2.result.timeline,expected.payload.battleV2.result.timeline);
  // A loading departure rebuilds the same time-zero prefix under that version.
  coopCommand(room,{id:2},'leave',{clientId:'qa-clock-client-2'},1200);
  const withdrawn=createCooperativeBattle({squads:party,difficulty:'HARD',seed:room.seed,combat:room.combat,withdrawals:[{ownerId:2,atMs:0}],turnClockVersion:legacy?1:2});
  assert.deepEqual(room.payload.battleV2.result.timeline,withdrawn.payload.battleV2.result.timeline);
 }
});
