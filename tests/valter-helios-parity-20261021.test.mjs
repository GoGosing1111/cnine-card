import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {VALTER_COMBAT,VALTER_AREA_SKILL} from '../shared/mercenary-valter-v1.mjs';
import {HELIOS_COMBAT} from '../shared/mercenary-helios-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {MERCENARY_GROWTH_REVIEW} from '../shared/mercenary-growth-review-v2.mjs';
import {applyMercenaryCombatLink} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';

const snapshot=(code,mode,gear=0,level=1)=>({...limitedDeploymentSnapshot(code),combat:fixture.combat,
 equipment:{schemaVersion:1,mode,power:gear},
 mercenaryLevel:{version:2,level,breakthroughMask:level===20?15:0,growth:structuredClone(MERCENARY_GROWTH_REVIEW)}});
const fighter=(code,mode,gear=0,level=1,side='A')=>buildMercenaryFighter(snapshot(code,mode,gear,level),side,mode,buildFighter);

test('approved Valter V3 adds innate armor without raising power or multiplying equipment defense',()=>{
 for(const mode of ['PVE','PVP'])for(const side of ['A','B'])for(const gear of [0,100000,100000000]){
  const v=fighter('V-996',mode,gear,1,side),h=fighter('V-999',mode,gear,1,side);
  const native=buildFighter({id:'V-996',power:1080000,type:'NONE'},5,side,null,mode);
  const equipped=buildFighter({id:'V-996',power:1080000+gear,type:'NONE'},5,side,null,mode);
  assert.equal(v.defense,equipped.defense+Math.round(native.defense*.12));
  assert.equal(v.stats.defense,v.defense);assert.equal(v.power,1080000+gear);assert.equal(v.basePower,v.power);
  assert.equal(v.attack,equipped.attack);assert.equal(v.maxHp,equipped.maxHp);assert.equal(v.speed,h.speed);
  assert.equal(v.valterPolicyVersion,3);assert.equal(h.heliosPolicyVersion,2);
  assert.equal(h.defense,buildFighter({id:'V-999',power:1123200+gear,type:'NONE'},5,side,null,mode).defense);
 }
 assert.equal(VALTER_COMBAT.damageTakenScale,.25);assert.equal(VALTER_COMBAT.basicCapScale,2);
 assert.deepEqual(VALTER_AREA_SKILL.balance,{damageRatio:5.6,cooldownTurns:5,cost:35});
 assert.deepEqual(HELIOS_COMBAT,{version:2,basePower:1123200,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,motionPlaybackRate:2.6,
  link:{attackPercent:1830.4,shieldPercent:626.4,hpPercent:1164.8},basicCapScale:2,damageTakenScale:.25,hardCounter:'V-055'});
});

test('innate armor enters level growth once and link floors retain the approved parity without changing card stats',()=>{
 for(const mode of ['PVE','PVP'])for(const level of [1,3,20])for(const gear of [0,100000000]){
  const v=fighter('V-996',mode,gear,level),h=fighter('V-999',mode,gear,level,'B');
  const teams=[v,h].map(m=>[...tierCards(2e7).map((c,i)=>buildFighter(c,i,m.side,null,mode)),m]);
  const ordinary=structuredClone(teams.map(t=>t.slice(0,5))),defense=v.defense;
  applyMercenaryCombatLink(teams);
  assert.equal(v.defense,Math.floor(defense*(1+v.mercenaryGrowth.total.defensePercent/100)));
  assert.equal(v.power,1080000+gear);assert.equal(v.basePower,v.power);
  assert.equal(v.mercenaryLink.attackFloor,h.mercenaryLink.attackFloor);
  assert.equal(v.mercenaryLink.hpFloor,h.mercenaryLink.hpFloor);
  assert.equal(v.mercenaryLink.openingShield,h.mercenaryLink.openingShield);
  assert.deepEqual(teams.map(t=>t.slice(0,5)),ordinary);
  const once=structuredClone(teams);applyMercenaryCombatLink(teams);assert.deepEqual(teams,once);
 }
});

test('real PVE and PVP results use approved V3 while keeping nominal team power and mode-specific skills',()=>{
 for(const mode of ['PVE','PVP'])for(const level of [1,3,20])for(const gear of [0,100000000]){
  const v=snapshot('V-996',mode,gear,level),h=snapshot('V-999',mode,gear,level),cards=tierCards(2e7);
  const inputs=mode==='PVE'?{cards,mercenary:v,monster:{id:1,battle_power:6e10},seed:7919}:
   {attackerCards:cards,defenderCards:cards,attackerMercenary:v,defenderMercenary:h,seed:7919};
  const before=structuredClone(inputs),battle=mode==='PVE'?createPveBattleV2(inputs):createPvpBattleV2(inputs);
  assert.deepEqual(inputs,before);
  const actor=battle.teams.A.mercenaries[0];
  assert.equal(actor.power,1080000+gear);assert.equal(actor.valterPolicyVersion,3);
  assert.equal(battle.result.timeline.some(e=>e.type==='MERCENARY_VALTER_AREA'),mode==='PVE');
  assert.ok(battle.result.timeline.some(e=>e.actorId===actor.id&&(e.damage>0||e.absorbed>0)));
  if(mode==='PVP')assert.equal(battle.teams.A.cards[0].pvpPowerBalance.formationPower,5*2e7+1080000+gear);
 }
});

test('public codex exposes the new Valter passive and removes the obsolete Helios superiority claim',()=>{
 const doc=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61});
 const v=doc.cards.find(c=>c.code==='V-996'),h=doc.cards.find(c=>c.code==='V-999');
 assert.match(v.combatLinkDescription,/1,080,000/);assert.match(v.combatLinkDescription,/고유 방어력이 12%/);
 assert.match(v.combatLinkDescription,/장비 방어력은 이 보너스에서 제외/);
 for(const c of [v,h]){assert.match(c.combatLinkDescription,/25회 행동당 추가 78회/);assert.match(c.combatLinkDescription,/1,830.4%/);}
 assert.doesNotMatch(h.combatLinkDescription,/4% 높/);
 assert.equal(v.deploymentEnabled,true);assert.equal(h.deploymentEnabled,true);
});
