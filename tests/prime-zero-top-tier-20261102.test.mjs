import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFighter,createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryBaseActionCredit} from '../functions/_mercenary_combat.js';
import {applyMercenaryCombatLink,mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {ZERO_COMBAT,ZERO_ART,PRIME_ZERO_PVP} from '../shared/mercenary-zero-v1.mjs';
import {PRIME_ART} from '../shared/mercenary-prime-requiem-v1.mjs';
import {snapshot,scenarios} from '../scripts/measure-prime-zero-revan-cardgu-20261102.mjs';
const team=(code,side,level=1,gear=0,mode='PVP')=>[...scenarios[1].cards.map((c,i)=>buildFighter(c,i,side,null,mode)),buildMercenaryFighter(snapshot(code,level,mode,gear),side,mode,buildFighter)];

test('both champions gain real attack/cap and durability after linkage, preserving injury and innate cadence',()=>{
 for(const code of ['V-975','V-976']){
  const a=team(code,'A'),b=team('V-971','B'),m=a.at(-1),before=structuredClone(m);
  m.hp=Math.floor(m.maxHp*.4);const ratio=m.hp/m.maxHp;
  const avgHp=a.slice(0,5).reduce((n,c)=>n+c.maxHp,0)/5,avgAtk=a.slice(0,5).reduce((n,c)=>n+c.attack,0)/5;
  const baseHp=Math.max(m.maxHp,Math.round(avgHp*ZERO_COMBAT.link.hpPercent/100)),baseFloor=Math.round(avgAtk*ZERO_COMBAT.link.attackPercent/100);
  applyMercenaryCombatLink([a,b]);
  assert.equal(m.attack,Math.round(before.attack*1.3));assert.equal(m.mercenaryLink.attackFloor,Math.round(baseFloor*1.3));
  assert.equal(m.maxHp,Math.round(baseHp*6));assert(Math.abs(m.hp/m.maxHp-ratio)<1e-8);
  assert.equal(m.mercenaryLink.tierOffense,1.3);assert.equal(m.mercenaryLink.tierGuard,1);
  assert.deepEqual(m.mercenaryLink.primeZeroPvp,PRIME_ZERO_PVP);
  assert.equal(m.speed,before.speed);assert.equal(mercenaryBaseActionCredit([m]),3.12);assert.equal(m.basePower,3000000);
  assert(mercenaryDamageCapHp(m)<(m.maxHp+m.mercenaryLink.openingShield)/5,'incoming hit cap must not cancel durability');
  assert.equal(b.at(-1).mercenaryLink.primeZeroPvp,undefined);
 }
});

test('growth and equipment retain their values, and re-entry cannot heal or compound the buff',()=>{
 for(const code of ['V-975','V-976'])for(const level of [1,11,21]){
  const teams=[team(code,'A',level,1e8),team('V-970','B',level,1e8)],m=teams[0].at(-1);
  const source=structuredClone({growth:m.mercenaryLevel,equipment:m.equipment});applyMercenaryCombatLink(teams);
  assert.deepEqual({growth:m.mercenaryLevel,equipment:m.equipment},source);
  m.hp=Math.floor(m.hp*.37);m.shield=Math.floor(m.shield*.22);const once=structuredClone(teams);
  applyMercenaryCombatLink(teams);assert.deepEqual(teams,once);
  // Old captured links without this policy marker also remain unchanged.
  delete m.mercenaryLink.primeZeroPvp;const historical=structuredClone(teams);applyMercenaryCombatLink(teams);assert.deepEqual(teams,historical);
  m.hp=0;m.alive=false;const dead=structuredClone(teams);applyMercenaryCombatLink(teams);assert.deepEqual(teams,dead);
 }
});

test('PVE and existing General Jok priority keep their own policies without stacking',()=>{
 for(const code of ['V-975','V-976']){
  const pve=[team(code,'A',21,1e6,'PVE'),team('V-971','B',21,1e6,'PVE')];applyMercenaryCombatLink(pve);
  assert.equal(pve[0].at(-1).mercenaryLink.primeZeroPvp,undefined);
  const pvp=[team(code,'A'),team('V-974','B',21,1e8)];applyMercenaryCombatLink(pvp);
  const link=pvp[0].at(-1).mercenaryLink;assert(link.primeZeroGeneralJokPriority);assert.equal(link.tierGuard,16);assert.equal(link.tierOffense,4);assert.equal(link.primeZeroPvp,undefined);
 }
 for(const art of [ZERO_ART,PRIME_ART]){assert.match(art.combatLinkDescription,/PVP 최상위/);assert.match(art.combatLinkDescription,/30%/);assert.match(art.combatLinkDescription,/500%/);}
});

test('canonical team battles apply the same boost to either side with an SS companion',()=>{
 for(const code of ['V-975','V-976'])for(const opponent of ['V-970','V-971'])for(const side of ['A','B']){
  const own=[snapshot(code,21),snapshot('V-951',21)],other=[snapshot(opponent,21),snapshot('V-951',21)],f=scenarios[1];
  const b=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMercenaries:side==='A'?own:other,defenderMercenaries:side==='B'?own:other,seed:811101});
  assert.equal(b.result.winner,side);assert.equal(b.teams[side].mercenaries[0].mercenaryLink.primeZeroPvp.version,PRIME_ZERO_PVP.version);
  for(const s of ['A','B'])for(const m of b.teams[s].mercenaries)if(m.code!==code)assert.equal(m.mercenaryLink.primeZeroPvp,undefined);
 }
});

test('duo respects owner equipment and only buffs the two eligible champions',()=>{
 const squad=(ownerId,code,level,gear)=>({ownerId,cards:scenarios[1].cards,mercenaries:[snapshot(code,level,'PVP',gear),snapshot('V-951',level,'PVP',gear)]});
 const b=createDuoBattleV2({attackerSquads:[squad(101,'V-975',1,0),squad(102,'V-976',21,1e8)],defenderSquads:[squad(201,'V-971',1,0),squad(202,'V-970',21,1e8)],seed:83111});
 const a=b.teams.A.mercenaries,boosted=a.filter(m=>m.mercenaryLink.primeZeroPvp);
 assert.equal(boosted.length,2);assert.deepEqual(boosted.map(m=>m.ownerId),[101,102]);
 assert.equal(boosted[0].mercenaryLevel.level,1);assert.equal(boosted[1].mercenaryLevel.level,21);
 assert(boosted[1].mercenaryLink.attackFloor>boosted[0].mercenaryLink.attackFloor);
 assert(b.teams.B.mercenaries.every(m=>!m.mercenaryLink.primeZeroPvp));assert.equal(b.rules.mercenariesPerOwner,2);
});
