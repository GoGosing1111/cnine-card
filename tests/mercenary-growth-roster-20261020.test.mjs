import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {roster,cards,snapshot,options,growthProbe,unchangedBattleHashes} from '../scripts/measure-mercenary-growth-roster-20261020.mjs';
import {buildFighter} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {applyMercenaryCombatLink,mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {applyMercenaryLevelStats} from '../shared/mercenary-level-v1.mjs';
import {mercenaryGrowthBasicCapScale,mercenaryGrowthKeepsNaturalGauge,MERCENARY_PVP_GROWTH_DESCRIPTION} from '../shared/mercenary-growth-review-v2.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';

const probe=await growthProbe();
const baseline=JSON.parse(fs.readFileSync(new URL('../docs/qa/mercenary-growth-roster-20261020/unchanged-baseline.json',import.meta.url)));
const before=JSON.parse(fs.readFileSync(new URL('../docs/qa/mercenary-growth-roster-20261020/before.json',import.meta.url)));
function fighter(code,level){
 const actor=buildMercenaryFighter(snapshot(code,level),'A','PVP',buildFighter);
 applyMercenaryCombatLink([[...cards.map((c,i)=>buildFighter(c,i,'A',null,'PVP')),actor]]);
 return actor;
}
test('all 79 operating mercenaries gain real basic damage and durability across levels 1/10/11',()=>{
 assert.equal(roster.snapshots.length,79);
 for(const {code}of roster.snapshots){
  const [low,ten,high]=[1,10,11].map(level=>probe.direct(code,level));
  assert.ok(high.basicDamage>ten.basicDamage&&ten.basicDamage>low.basicDamage,code);
  assert.ok(high.maxHp/high.hpCapComponent>low.maxHp/low.hpCapComponent,code+' durability');
  assert.equal(high.openingGauge,50,code+' learned opening gauge');
 }
 const joeun=probe.direct('V-981',11);
 assert.equal(before.rows.find(r=>r.code==='V-981').direct[2].basicDamage,156000);
 assert.equal(joeun.basicDamage,382120);
 assert.equal(probe.direct('V-999',11).basicDamage,764241);
 assert.equal(probe.parityChecks,6);
});
test('163 complete PvE, level-one PvP/duo and legacy battle returns are unchanged',()=>{
 assert.deepEqual(unchangedBattleHashes(),baseline.rows);
});
test('growth is applied after the innate basic cap; skills and counters retain their budgets',()=>{
 const actor=fighter('V-999',20),target=buildFighter(cards[1],1,'B',null,'PVP');
 actor.attack=1e10;target.defense=0;
 const hit=(a,opts={},counter=false)=>probe.engine.hitResult(a,target,()=>.5,1,counter,{damageCapScale:100,...opts}).damage;
 const plain={...actor,mercenaryLevelApplied:false};
 assert.ok(Math.abs(hit(actor,{basicAttack:true})-hit(plain,{basicAttack:true})*Math.sqrt(10.75))<=1);
 assert.equal(hit(actor),hit(plain),'skill budget must not inherit basic growth');
 assert.equal(hit(actor,{basicAttack:true},true),hit(plain,{basicAttack:true},true),'counter budget');
 assert.equal(mercenaryGrowthBasicCapScale(actor),Math.sqrt(10.75));
 for(const change of [{battleMode:'PVE'},{isMercenary:false},{statMode:'LEGACY'},{mercenaryLevelApplied:false},{mercenaryLevel:{version:1,level:20}}]){
  const excluded={...actor,...change};assert.equal(mercenaryGrowthBasicCapScale(excluded),1);assert.equal(mercenaryGrowthKeepsNaturalGauge(excluded),false);
 }
});
test('max-level growth stays bounded, applies once and keeps opening shields out of the HP divisor',()=>{
 for(const {code}of roster.snapshots){
  const actor=fighter(code,20),once=structuredClone(actor),hpComponent=actor.maxHp/3;
  assert.equal(mercenaryGrowthBasicCapScale(actor),Math.sqrt(10.75),code);assert.equal(actor.gauge,75,code);
  assert.equal(mercenaryDamageCapHp(actor),(hpComponent+actor.mercenaryLink.openingShield)/(actor.mercenaryLink.tierGuard||1));
  applyMercenaryLevelStats(actor);assert.deepEqual(actor,once,code);
 }
});
test('reserved turns preserve all earned gauge, natural turns spend 100 and duo clocks stay owner-local',()=>{
 const checks={reserved:0,natural:0},owners=new Set(),codes=new Set();
 globalThis.__mercenaryGrowthAudit={clock(a,reserved,beforeGauge,afterGauge){
  if(!a.isMercenary||a.mercenaryLevel?.level<=1)return;
  if(a.ownerId)owners.add(a.ownerId);codes.add(a.code);
  if(reserved){assert.equal(afterGauge,beforeGauge,a.id+' extra turn');checks.reserved++;}
  else{assert.equal(afterGauge,Math.max(0,beforeGauge-100),a.id+' natural turn');checks.natural++;}
 }};
 try{
  for(const code of ['V-001','V-042','V-057','V-981','V-984','V-996','V-999']){
   const b=probe.engine.createPvpBattleV2(options(code,'V-985',20,'A',48011,20));
   assert.equal(b.result.reason,'ELIMINATION');assert.ok(Number.isFinite(b.result.actions));
  }
  const squads=(side,entries)=>entries.map(([code,level],i)=>({ownerId:side+i,ownerName:'Fixture',cards,mercenary:snapshot(code,level)}));
  const duo=probe.engine.createDuoBattleV2({attackerSquads:squads(1,[['V-981',11],['V-984',6]]),defenderSquads:squads(3,[['V-981',11],['V-984',6]]),seed:48013});
  const mercs=[...duo.teams.A.mercenaries,...duo.teams.B.mercenaries];
  assert.deepEqual(mercs.map(m=>m.mercenaryLevel.level),[11,6,11,6]);
  assert.equal(duo.result.reason,'ELIMINATION');
 }finally{delete globalThis.__mercenaryGrowthAudit;}
 assert.ok(checks.reserved>0&&checks.natural>0);assert.equal(owners.size,4);
 for(const code of ['V-981','V-984','V-996','V-999'])assert.ok(codes.has(code),code);
});
test('codex publishes the common rule for combat-ready fighters and QA stays outside Pages',()=>{
 const codex=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1,updated_at:'2026-10-20'});
 for(const code of ['V-001','V-057','V-981','V-984','V-996','V-999']){
  const card=codex.cards.find(c=>c.code===code);assert.ok(card.combatLinkDescription.includes(MERCENARY_PVP_GROWTH_DESCRIPTION),code);
  assert.equal(card.combatLinkDescription.split(MERCENARY_PVP_GROWTH_DESCRIPTION).length,2,code);
 }
 for(const file of ['tests/helpers/mercenary-growth-roster-20261020.json','scripts/measure-mercenary-growth-roster-20261020.mjs','docs/qa/mercenary-growth-roster-20261020/after.json'])assert.equal(isProductionFile(file),false);
});
