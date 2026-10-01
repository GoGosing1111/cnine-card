import test from 'node:test';
import assert from 'node:assert/strict';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {createCoopRoom,coopCommand,advanceCoopRoom,coopView} from '../functions/_cooperative_room.js';
import {COOP_RULES,validateCoopSelection} from '../shared/cooperative-battleground-v1.mjs';
import {coopSquads,COOP_MERCENARIES} from './helpers/cooperative-fixture.mjs';
const users=[1,2,3].map(id=>({id,nickname:'분대 '+id})),client=id=>'cooperative-client-'+id;
function lobby(){const r=createCoopRoom({id:'123456789A',user:users[0],clientId:client(1),difficulty:'NORMAL',seed:7919,now:1000});for(const u of users.slice(1))coopCommand(r,u,'join',{clientId:client(u.id)},1000);return r;}
function ready(r){const squads=coopSquads();for(const u of users)coopCommand(r,u,'ready',{clientId:client(u.id),loadout:squads[u.id-1]},2000);return r;}
function started(){const r=ready(lobby());for(const u of users)coopCommand(r,u,'loaded',{clientId:client(u.id)},3000);return r;}
test('3 owners each contribute exactly 2 cards and 1 mercenary; IDs and owner link stay independent',()=>{
 const squads=coopSquads(),b=createCooperativeBattle({squads,seed:21});const a=b.payload.battleV2.teams.A;
 assert.equal(a.cards.length,6);assert.equal(a.mercenaries.length,3);assert.equal(new Set([...a.cards,...a.mercenaries].map(c=>c.id)).size,9);
 squads[0].equipmentBonus*=5;const changed=createCooperativeBattle({squads,seed:21}).payload.battleV2.teams.A;
 assert.ok(changed.mercenaries[0].mercenaryLink.attackFloor>a.mercenaries[0].mercenaryLink.attackFloor);
 assert.deepEqual(changed.mercenaries.slice(1).map(c=>c.mercenaryLink),a.mercenaries.slice(1).map(c=>c.mercenaryLink));
 assert.ok(b.states.length>1);assert.equal(b.payload.battleV2.rules.monsterMinDamagePercent,0);
});
test('different players may use the same owned card/mercenary without actor collisions',()=>{
 const squads=coopSquads({mercenaries:['V-004','V-004','V-004']});squads.forEach(s=>s.cards=structuredClone(squads[0].cards));
 const t=createCooperativeBattle({squads}).payload.battleV2.teams.A;assert.equal(new Set([...t.cards,...t.mercenaries].map(c=>c.id)).size,9);
});
test('selection rejects duplicates, missing mercenary, 5-card contracts, and 2 superstars',()=>{
 for(const v of [{cardIds:['1','1'],mercenaryCode:'V-004'},{cardIds:['1','2']},{cardIds:['1','2','3','4','5'],mercenaryCode:'V-004'}])assert.throws(()=>validateCoopSelection(v));
 const s=coopSquads();s[0].cards=[s[0].cards[0],s[2].cards[0]];assert.throws(()=>createCooperativeBattle({squads:s}),/INVALID_COOPERATIVE_SQUAD/);
});
test('3 ready then 3 loaded starts a single shared timestamp; a late loader holds everyone',()=>{
 const r=ready(lobby());assert.equal(r.status,'LOADING');for(const u of users.slice(0,2))coopCommand(r,u,'loaded',{clientId:client(u.id)},3000);
 assert.equal(r.status,'LOADING');coopCommand(r,users[2],'loaded',{clientId:client(3)},4200);assert.equal(r.startsAt,7200);
 for(const u of users){const v=coopView(r,u,4200);assert.equal(v.state.startsAt,7200);assert.deepEqual(v.payload,r.payload);assert.equal(JSON.stringify(v).includes('clientId'),false);}
});
test('changing selection clears ready; fourth player, outsider, and post-start editing are rejected',()=>{
 const r=lobby(),loadout=coopSquads()[0];coopCommand(r,users[0],'ready',{clientId:client(1),loadout},2000);assert.equal(r.members[0].ready,true);
 coopCommand(r,users[0],'select',{clientId:client(1),loadout},2100);assert.equal(r.members[0].ready,false);
 assert.throws(()=>coopCommand(r,{id:4,nickname:'넷째'},'join',{clientId:client(4)},2100),/3명이/);
 assert.throws(()=>coopView(r,{id:4},2100),/참가한/);ready(r);assert.throws(()=>coopCommand(r,users[0],'select',{clientId:client(1),loadout},3100),/편성은 변경/);
});
test('lobby refresh clears ready, transfers host on leave, and never defeats the player',()=>{
 const r=lobby();coopCommand(r,users[0],'ready',{clientId:client(1),loadout:coopSquads()[0]},2000);
 coopCommand(r,users[0],'connect',{clientId:client(11)},2100);assert.equal(r.members[0].ready,false);assert.equal(r.members[0].result,undefined);
 coopCommand(r,users[0],'leave',{clientId:client(11)},2200);assert.equal(r.hostId,2);assert.equal(r.members.length,2);
});

test('lobby heartbeat expiry removes absent members and transfers host without defeat',()=>{
 const r=lobby();for(const u of users.slice(1))coopCommand(r,u,'ping',{clientId:client(u.id)},15000);
 advanceCoopRoom(r,16000);assert.deepEqual(r.members.map(m=>m.id),[2,3]);assert.equal(r.hostId,2);assert.equal(r.withdrawals.length,0);
 advanceCoopRoom(r,30000);assert.equal(r.status,'CANCELLED');assert.equal(r.members.length,0);
});
test('refresh during loading or battle defeats only that owner and removes exactly their 3 actors',()=>{
 for(const r of [ready(lobby()),started()]){
  coopCommand(r,users[0],'connect',{clientId:client(11)},r.startsAt?11000:3000);
  assert.equal(r.members[0].result,'DEFEAT');assert.equal(r.members.filter(m=>m.result).length,1);assert.equal(r.withdrawals.length,1);
  const view=coopView(r,users[1],11000);assert.ok(view.state.fighters.A.filter(f=>f.ownerId===1).every(f=>f.hp===0));
  assert.equal(view.state.fighters.A.filter(f=>f.ownerId!==1).length,6);
  assert.throws(()=>coopCommand(r,users[0],'ready',{clientId:client(11)},11000),/패배/);
 }
});
test('same-screen reconnect within grace is accepted; absence after 15 seconds forfeits once',()=>{
 const r=started();coopCommand(r,users[0],'connect',{clientId:client(1)},14000);assert.equal(r.members[0].result,undefined);
 for(const u of users.slice(1))coopCommand(r,u,'ping',{clientId:client(u.id)},14000);
 for(const u of users.slice(1))coopCommand(r,u,'ping',{clientId:client(u.id)},28000);
 advanceCoopRoom(r,29000);assert.equal(r.members[0].result,'DEFEAT');assert.equal(r.withdrawals.length,1);advanceCoopRoom(r,29100);assert.equal(r.withdrawals.length,1);
});
test('withdrawal keeps the exact authoritative prefix and removes all later actions by the owner',()=>{
 const squads=coopSquads(),base=createCooperativeBattle({squads,seed:83}),atMs=12000;
 const after=createCooperativeBattle({squads,seed:83,withdrawals:[{ownerId:1,atMs}]});
 assert.deepEqual(after.payload.battleV2.result.timeline.filter(e=>e.combatAtMs<atMs),base.payload.battleV2.result.timeline.filter(e=>e.combatAtMs<atMs));
 assert.equal(after.payload.battleV2.result.timeline.filter(e=>e.combatAtMs>=atMs&&e.actorId?.includes('OWNER:1:')).length,0);
 assert.equal(after.payload.battleV2.result.timeline.filter(e=>e.withdrawn).length,3);
});
test('server expiry resolves before victory and cannot award a victory after departure',()=>{
 const r=started();coopCommand(r,users[0],'leave',{clientId:client(1)},9000);
 for(let now=10000;now<r.startsAt+r.durationMs;now+=3000)for(const u of users.slice(1))coopCommand(r,u,'ping',{clientId:client(u.id)},now);
 advanceCoopRoom(r,r.startsAt+r.durationMs+1);assert.equal(r.members[0].result,'DEFEAT');assert.ok(['VICTORY','DEFEAT'].includes(r.status));assert.equal(r.withdrawals.length,1);
});
test('difficulty is fixed and clearing requires a dead boss, not a higher HP ratio',()=>{
 const weak=createCooperativeBattle({squads:coopSquads({equipment:0,level:0}),difficulty:'EXTREME',seed:5}).payload.battleV2;
 const strong=createCooperativeBattle({squads:coopSquads({equipment:2e7,mercenaries:COOP_MERCENARIES.SSS}),difficulty:'EXTREME',seed:7919}).payload.battleV2;
 assert.equal(weak.teams.B.cards[0].maxHp,strong.teams.B.cards[0].maxHp);assert.equal(weak.result.winner,'B');assert.ok(weak.result.final.B[0].hp>0);
 assert.ok(weak.result.timeline.at(-1).combatAtMs<=COOP_RULES.maxBattleMs);
});
