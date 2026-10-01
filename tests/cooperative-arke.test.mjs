import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoopRoom,coopCommand,advanceCoopRoom,coopView} from '../functions/_cooperative_room.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {COOP_ENCOUNTER} from '../shared/cooperative-battleground-v1.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
const users=[1,2,3].map(id=>({id,nickname:'분대 '+id})),client=id=>'arke-qa-client-'+id;
function start(){
 const r=createCoopRoom({id:'ABC1234567',user:users[0],clientId:client(1),difficulty:'NORMAL',seed:7919,now:1000});
 for(const u of users.slice(1))coopCommand(r,u,'join',{clientId:client(u.id)},1000);
 const squads=coopSquads();for(const u of users)coopCommand(r,u,'ready',{clientId:client(u.id),loadout:squads[u.id-1]},2000);
 for(const u of users)coopCommand(r,u,'loaded',{clientId:client(u.id)},3000);return r;
}
function travel(r,to){
 let t=Math.min(...r.members.filter(m=>!m.result).map(m=>m.lastSeen));
 while(t<to){t=Math.min(t+3000,to);for(const u of users)if(!r.members.find(m=>m.id===u.id).result)coopCommand(r,u,'ping',{clientId:client(u.id)},t);}
 advanceCoopRoom(r,to);
}
function respond(r,id,action,now){return coopCommand(r,users[id-1],'mechanic',{clientId:client(id),patternId:r.pattern.id,action},now);}
test('new encounter has dedicated boss, separated art and scene; no Lich resources',()=>{
 const b=createCooperativeBattle({squads:coopSquads()});
 assert.equal(b.payload.monster.id,COOP_ENCOUNTER.id);assert.equal(b.payload.sceneAssetKey,COOP_ENCOUNTER.sceneAssetKey);
 assert.notEqual(b.payload.monster.image,b.payload.monster.battleSprite);assert.doesNotMatch(JSON.stringify(b.payload),/lich-king|COOP_LICH|리치왕/i);
});
test('all normal enemies, then the shielded miniboss, then Arke; party resources carry across both boundaries',()=>{
 const b=createCooperativeBattle({squads:coopSquads(),seed:7919}),events=b.payload.battleV2.result.timeline;
 const spawns=events.filter(e=>e.type==='ENEMY_SPAWN');assert.deepEqual(spawns.map(e=>e.wave),[2,3]);
 assert.equal(b.payload.cooperativeEncounter.initialIds.length,3);assert.equal(b.payload.cooperativeEncounter.instances.length,5);
 for(const spawn of spawns){
  const index=b.states.findIndex(s=>s.group===spawn.combatGroup),previous=b.states[index-1],current=b.states[index];
  assert.deepEqual(current.A,previous.A,'No heal, revive or shield reset at a wave boundary');
  assert.ok(previous.B.every(e=>e.hp===0),'Every previous enemy must be dead before reinforcement');
  assert.equal(current.B.filter(e=>e.hp>0).length,1);
 }
 assert.ok(spawns[0].targetShieldAfter>0);assert.equal(spawns[1].targetShieldAfter,0);
 assert.equal(b.payload.battleV2.result.winner,'A');
 assert.equal(b.payload.battleV2.result.encounter.remaining,0);
 const r=start();travel(r,r.startsAt+r.bossAtMs+9999);assert.equal(r.pattern,null,'No final-boss mechanics in earlier stages');
 assert.equal(coopView(r,users[0],r.startsAt+r.bossAtMs).state.stage.wave,3);
});
test('three authenticated owners must respond; shared input state and a single rupture after deadline',()=>{
 const r=start();travel(r,r.startsAt+r.bossAtMs+10000);const p=r.pattern;
 assert.equal(p.kind,'VENT');assert.equal(p.status,'OPEN');
 for(const id of [1,2,3])respond(r,id,'VENT',p.startsAt+100);
 respond(r,1,'VENT',p.startsAt+200);assert.equal(Object.keys(p.inputs).length,3);assert.equal(r.effects.length,0);
 for(const u of users)assert.deepEqual(coopView(r,u,p.startsAt+201).state.pattern.inputs,p.inputs);
 travel(r,p.endsAt);assert.equal(r.effects.length,1);assert.equal(r.effects[0].kind,'RUPTURE');assert.equal(r.effects[0].percent,8);
 const hit=r.payload.battleV2.result.timeline.find(e=>e.type==='COOP_MECHANIC');assert.ok(hit.hits[0].damage>0);assert.equal(hit.combatAtMs,p.endsAt-r.startsAt);
 const initial=createCooperativeBattle({squads:coopSquads(),seed:r.seed});
 assert.deepEqual(r.payload.battleV2.result.timeline.filter(e=>e.combatAtMs<hit.combatAtMs),initial.payload.battleV2.result.timeline.filter(e=>e.combatAtMs<hit.combatAtMs));
 advanceCoopRoom(r,p.endsAt+1);assert.equal(r.effects.length,1);
});
test('missing input overloads once; stale and unauthorized commands cannot alter the result',()=>{
 const r=start();travel(r,r.startsAt+r.bossAtMs+10000);const p=r.pattern;
 respond(r,1,'VENT',p.startsAt+1);respond(r,2,'VENT',p.startsAt+1);travel(r,p.endsAt);
 assert.equal(p.status,'FAILED');assert.equal(r.effects[0].kind,'OVERLOAD');
 assert.throws(()=>respond(r,3,'VENT',p.endsAt+1),/입력 시간이/);
 assert.throws(()=>coopCommand(r,{id:99},'mechanic',{clientId:client(99),patternId:p.id,action:'VENT'},p.endsAt+2),/참가한/);
 assert.equal(r.effects.length,1);
});
test('focus assigns guard to the target and jamming to two allies; all three actions reduce damage',()=>{
 const r=start();travel(r,r.startsAt+r.bossAtMs+40000);const p=r.pattern;assert.equal(p.kind,'FOCUS');
 assert.throws(()=>respond(r,p.targetId,'JAM',p.startsAt+1),/내 분대 행동/);
 for(const id of [1,2,3])respond(r,id,id===p.targetId?'GUARD':'JAM',p.startsAt+2);
 travel(r,p.endsAt);assert.equal(p.status,'SUCCESS');assert.equal(p.effect.percent,5);
 const event=r.payload.battleV2.result.timeline.find(e=>e.mechanicId===p.id);
 assert.ok(event.hits.length>0);assert.ok(event.hits.every(h=>h.targetId.includes('OWNER:'+p.targetId+':')));
});
test('leaving during a pattern removes only that squad from the requirement and defeats that owner',()=>{
 const r=start();travel(r,r.startsAt+r.bossAtMs+10000);const p=r.pattern;
 coopCommand(r,users[2],'leave',{clientId:client(3)},p.startsAt+100);
 for(const id of [1,2])respond(r,id,'VENT',p.startsAt+200);
 travel(r,p.endsAt);assert.equal(p.status,'SUCCESS');assert.deepEqual(p.required,[1,2]);assert.equal(r.members[2].result,'DEFEAT');
 assert.throws(()=>respond(r,3,'VENT',p.endsAt),/패배/);
});
test('past battle payloads survive deployment without acquiring new mechanics',()=>{
 const r=start();delete r.encounterVersion;delete r.effects;delete r.patternHistory;
 const original=structuredClone(r.payload.monster);original.id='OLD_ENCOUNTER';r.payload.monster=original;
 coopCommand(r,users[0],'leave',{clientId:client(1)},r.startsAt+1000);
 assert.deepEqual(r.payload.monster,original);travel(r,r.startsAt+r.bossAtMs+10000);assert.equal(r.pattern,null);
});
test('server simulation rejects unbounded or fabricated outcomes',()=>{
 for(const effects of [[{atMs:1,kind:'FOCUS',ownerId:999,percent:40}],[{atMs:1,kind:'RUPTURE',percent:100}],Array(7).fill({atMs:1,kind:'RUPTURE',percent:8})])
  assert.throws(()=>createCooperativeBattle({squads:coopSquads(),effects}),/INVALID_COOPERATIVE_EFFECTS/);
});
