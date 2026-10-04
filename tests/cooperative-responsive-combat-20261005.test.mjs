import test from 'node:test';
import assert from 'node:assert/strict';
import inputs from './fixtures/cooperative-mixed-speed-20261004.json' with {type:'json'};
import {candidate} from '../scripts/measure-berkan-balance.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {cooperativeCombatGroupMs} from '../shared/cooperative-combat-clock-v3.mjs';
const squads=()=>inputs.map(s=>({...structuredClone(s),mercenary:candidate(s.mercenaryCode)}));
const battle=version=>createCooperativeBattle({squads:squads(),difficulty:'HARD',seed:3375805316,turnClockVersion:version});
test('three-squad tempo removes presentation waits without changing this fight outcomes or gauge order',()=>{
 const before=battle(2).payload.battleV2,after=battle(3).payload.battleV2;
 const strip=t=>t.map(({combatAtMs,combatGroupDurationMs,combatEndedAtMs,...event})=>event);
 assert.deepEqual(strip(after.result.timeline),strip(before.result.timeline));
 assert.deepEqual(after.result.final,before.result.final);
 for(const actor of [...after.teams.A.cards,...after.teams.A.mercenaries]){
  const event=after.result.timeline.find(e=>e.actorId===actor.id&&['TURN','MERCENARY_WINDUP'].includes(e.type));
  assert.ok(event&&event.combatAtMs<(actor.isMercenary?4000:11000),actor.id);
 }
 assert.ok(after.result.timeline.some(e=>e.type==='TEAM_HEAL'&&e.combatAtMs<11000));
});
test('heals and guard reactions add no global delay; mercenary skills no longer occupy zero-time slots',()=>{
 assert.equal(cooperativeCombatGroupMs([{type:'TEAM_HEAL'},{type:'REGEN'},{type:'GUARD_PROTECT'}]),0);
 assert.equal(cooperativeCombatGroupMs([{type:'TURN'},{type:'TEAM_HEAL'},{type:'REGEN'}]),cooperativeCombatGroupMs([{type:'TURN'}]));
 assert.ok(cooperativeCombatGroupMs([{type:'MERCENARY_WINDUP'},{type:'MERCENARY_STARFALL'}])>0);
});
test('v3 withdrawal preserves already-shared timeline and removes only departing owner',()=>{
 const initial=battle(3),atMs=9000;
 const withdrawn=createCooperativeBattle({squads:squads(),difficulty:'HARD',seed:3375805316,withdrawals:[{ownerId:2,atMs}]});
 const before=t=>t.filter(e=>e.combatAtMs<atMs);
 assert.deepEqual(before(withdrawn.payload.battleV2.result.timeline),before(initial.payload.battleV2.result.timeline));
 assert.ok(withdrawn.states.filter(s=>s.atMs>=atMs).every(s=>s.A.filter(a=>a.ownerId===2).every(a=>a.hp===0)));
 assert.equal(withdrawn.payload.battleV2.result.timeline.filter(e=>e.combatAtMs>=atMs&&e.actorId?.startsWith('A:OWNER:2:')).length,0);
});
