import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import growth from '../docs/qa/razak-balance-20261026/live-input.json' with {type:'json'};
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {buildMercenaryFighter,mercenarySkillCapActions} from '../functions/_mercenary_combat.js';
import {buildFighter,createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {resolveAwakenedOmegaCast} from '../functions/_mercenary_awakened_omega.js';
import {AWAKENED_OMEGA_COMBAT} from '../shared/mercenary-awakened-omega-v1.mjs';
import {SHIRANUI_COMBAT,shiranuiDeploymentAllowed} from '../shared/mercenary-shiranui-v1.mjs';
import {KAMISHIRO_COMBAT} from '../shared/mercenary-kamishiro-v1.mjs';
import {JOKRO_COMBAT} from '../shared/mercenary-jokro-v1.mjs';
import {JINMU_COMBAT} from '../shared/mercenary-jinmu-v1.mjs';
import {PRIME_COMBAT} from '../shared/mercenary-prime-requiem-v1.mjs';
const codes=['V-972','V-987','V-969'],cards=tierCards(2e7);
const snapshot=(code,level=1)=>({...limitedDeploymentSnapshot(code),combat:fixture.combat,mercenaryLevel:{version:2,level,policyRevision:growth.policyRevision,breakthroughMask:[5,10,15,20].reduce((m,t,i)=>m|(t<level?1<<i:0),0),growth:growth.growth}});
const fighter=(code,level,mode,gear)=>buildMercenaryFighter({...snapshot(code,level),equipment:{schemaVersion:1,mode,power:gear}},'A',mode,buildFighter);

test('all three share Jokro stat and link growth at 1/11/21 with and without equipment in PVE/PVP',()=>{
 for(const mode of ['PVE','PVP'])for(const level of [1,11,21])for(const gear of [0,1e8]){
  const actors=[...codes,'V-979'].map(code=>fighter(code,level,mode,gear));
  for(const a of actors)applyMercenaryCombatLink([[...cards.map((c,i)=>buildFighter(c,i,'A',null,mode)),a]]);
  for(const a of actors.slice(0,3)){
   for(const key of ['basePower','attack','maxHp','defense','shield','speed','counterImmune','controlImmune','poisonImmune'])assert.equal(a[key],actors[3][key],`${a.code} ${mode} L${level} gear${gear} ${key}`);
   assert.equal(mercenaryEffectiveAttack(a),mercenaryEffectiveAttack(actors[3]));
  }
 }
 assert.equal(JINMU_COMBAT.basePower,1617408);assert.equal(PRIME_COMBAT.basePower,3000000);assert.equal(JOKRO_COMBAT.basePower,2200000);
 assert.notEqual(SHIRANUI_COMBAT,JINMU_COMBAT);assert.notEqual(KAMISHIRO_COMBAT,PRIME_COMBAT);
 assert.equal(shiranuiDeploymentAllowed('V-987',234),false);assert.equal(shiranuiDeploymentAllowed('V-987',235),true);
});

test('stale supplied base power and skills cannot override current battle policy or mutate saved input',()=>{
 for(const code of codes){
  const input={...snapshot(code,21),basePower:99e9,skills:[],stats:{attack:1,hp:1,defense:1}},before=structuredClone(input);
  const actual=buildMercenaryFighter(input,'A','PVP',buildFighter),expected=fighter(code,21,'PVP',0);
  assert.equal(actual.basePower,2200000);assert.equal(actual.attack,expected.attack);assert.deepEqual(input,before);
 }
});

test('Omega consumes grown PVE budget exactly once per target and its PVP forms use a single 100% packet',()=>{
 for(const mode of ['PVE','PVP'])for(const level of [1,21]){
  const actor=fighter('V-972',level,mode,0);applyMercenaryCombatLink([[...cards.map((c,i)=>buildFighter(c,i,'A',null,mode)),actor]]);const targets=Array.from({length:12},(_,i)=>({id:'B:'+i,side:'B',row:'FRONT',slot:i,hp:100000,alive:true}));
  for(const skill of actor.skills){
   const packets=[],seen=[];
   const result=resolveAwakenedOmegaCast({actor,skill,targets:[...targets,targets[0]],capActions:mercenarySkillCapActions(actor,skill,false),hit:(a,t,ratio,options)=>(packets.push({ratio,options}),{damage:1}),damage:(t,n)=>(seen.push(t.id),{hpDamage:n,absorbed:0}),knockout(){},emit(){}});
   assert.equal(result.length,skill.targetCount??12);assert.equal(new Set(seen).size,result.length);
   assert(Math.abs(packets.reduce((n,p)=>n+p.ratio,0)-(mode==='PVP'?1:skill.balance.damageRatio))<1e-9);
   if(mode==='PVP')assert.equal(packets[0].options.capScale,AWAKENED_OMEGA_COMBAT.basicCapScale);
   if(mode==='PVE'&&level===21)assert(skill.balance.damageRatio>15.12,'PVE skill growth remains active');
  }
 }
});

test('mirrored PVP matches retain ordinary outcomes and mixed duo applies the revised policy per owner',()=>{
 for(const code of codes)for(const level of [1,21]){
  const left=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(code,level),defenderMercenary:snapshot('V-979',level),seed:77});
  assert(['A','B'].includes(left.result.winner));assert.equal(left.teams.A.mercenaries[0].basePower,2200000);
 }
 const squad=(code,ownerId,level)=>({ownerId,ownerName:'검수',cards,mercenary:snapshot(code,level)});
 const args={attackerSquads:[squad('V-972',7,21),squad('V-987',8,11)],defenderSquads:[squad('V-969',9,21),squad('V-979',10,11)],seed:7719},before=structuredClone(args),r=createDuoBattleV2(args);
 assert.deepEqual(args,before);
 assert.deepEqual([...r.teams.A.mercenaries,...r.teams.B.mercenaries].map(a=>[a.code,a.ownerId,a.level,a.basePower]),[['V-972',7,21,2200000],['V-987',8,11,2200000],['V-969',9,21,2200000],['V-979',10,11,2200000]]);
});
