import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {JINMU_COMBAT,JINMU_AREA_SKILL,JINMU_AREA_EVENT,jinmuIncomingDamage,jinmuActionCredit} from '../shared/mercenary-jinmu-v1.mjs';
import {KAIRON_COMBAT} from '../shared/mercenary-kairon-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {resolveJinmuArea} from '../functions/_mercenary_jinmu.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code='V-989',side='A',mode='PVP',power=0)=>buildMercenaryFighter({...snapshot(code),equipment:{schemaVersion:1,mode,power}},side,mode,buildFighter);
const near20=(a,b)=>assert(Math.abs(a-b*1.2)<=3,`${a} versus ${b}: expected +20% (integer rounding only)`);
test('Jinmu gains 20% offense and durability over Kairon with unchanged speed, including strong equipment and low-power decks',()=>{
 for(const mode of ['PVE','PVP'])for(const gear of [0,1e8])for(const power of [1e5,2e7,1e9]){
  const j=fighter('V-989','A',mode,gear),h=fighter('V-988','B',mode,gear);
  assert.equal(j.speed,h.speed);near20(j.attack,h.attack);near20(j.maxHp,h.maxHp);
  const teams=['A','B'].map((side,i)=>[...tierCards(power).map((c,k)=>buildFighter(c,k,side,null,mode)),[j,h][i]]);
  applyMercenaryCombatLink(teams);
  near20(mercenaryEffectiveAttack(j),mercenaryEffectiveAttack(h));near20(j.maxHp,h.maxHp);near20(j.shield,h.shield);
  assert.equal(j.basePower-gear,1617408);
  for(const k of ['counterImmune','controlImmune','poisonImmune'])assert.equal(j[k],true);
  assert.deepEqual(j.skills.map(s=>s.id),mode==='PVE'?['MS-989']:[]);
 }
 assert.equal(JINMU_COMBAT.actionCredit,KAIRON_COMBAT.actionCredit);
 assert.equal(JINMU_COMBAT.motionPlaybackRate,KAIRON_COMBAT.motionPlaybackRate);
 assert.equal(JINMU_COMBAT.basicCapScale,KAIRON_COMBAT.basicCapScale*1.2);
});
test('Jinmu cadence preserves fractions, owner isolation, death, and the canonical long-battle cap',()=>{
 const regular=(side,id)=>({id:side+id,ownerId:id,side,hp:1,alive:true});
 const j={...fighter(),ownerId:1},h={...fighter('V-999'),ownerId:2},a=regular('A',1),b=regular('A',2),e=regular('B',3);
 const cadence=mercenaryTurnCadence({A:[a,j,b,h],B:[e]});let total=0;
 for(let i=0;i<1000;i++){cadence.acted(a);let count=0;while(cadence.pending()){assert.equal(cadence.pending(),j);cadence.acted(j);count++;assert(count<=4);}total+=count;}
 assert.equal(total,3120);j.hp=0;j.alive=false;cadence.acted(a);assert.equal(cadence.pending(),null);assert.equal(jinmuActionCredit([j]),1);
 for(const mode of ['PVE','PVP'])for(const side of ['A','B']){
  const other=side==='A'?'B':'A',sturdy=(a,speed)=>({...a,attack:1,hp:1e15,maxHp:1e15,shield:0,maxShield:0,speed,gauge:0});
  const ally=sturdy(buildFighter({id:'ally',power:10000},0,side,null,mode),1e6),enemy=sturdy(buildFighter({id:'enemy',power:10000},0,other,null,mode),1),j=sturdy(fighter('V-989',side,mode),1);j.skills=[];
  const teams={[side]:[ally,j],[other]:[enemy]},input={teamA:teams.A,teamB:teams.B,seed:7919,maxActions:101,suddenDeathAfter:1000};
  const result=simulateBattleV2Preview(input);assert.equal(result.mercenaryActions,312);assert.deepEqual(result,simulateBattleV2Preview(input));
 }
});
test('personal defenses and the entire dragon cast use one authoritative damage receipt per living target',()=>{
 const j=fighter('V-989','A','PVE'),berkan={isMercenary:true,code:'V-055'};
 assert.equal(jinmuIncomingDamage(j,1000,berkan),0);assert.equal(jinmuIncomingDamage(j,1000,{...berkan,code:'V-999'}),250);
 assert.equal(jinmuIncomingDamage({...j,isMercenary:false},1000,berkan),1000);
 const foes=Array.from({length:5},(_,i)=>({id:'t'+i,alive:true,hp:10000,maxHp:10000,shield:0})),ratios=[],events=[];
 const args={actor:j,skill:JINMU_AREA_SKILL,targets:[...foes,foes[0],{id:'dead',hp:0},{id:'suit',hp:100,isBattleSuit:true}],
  hit:(a,t,ratio)=>{ratios.push(ratio);return {damage:100,dodge:false};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},
  knockout(){},emit:(type,e)=>events.push({type,...e})};
 assert.equal(resolveJinmuArea(args).length,5);assert.equal(ratios.length,5);assert(Math.abs(ratios.reduce((a,b)=>a+b)-6.72)<1e-9);
 assert.equal(events.length,1);assert.equal(events[0].type,JINMU_AREA_EVENT);assert(foes.every(t=>t.hp===9900));
 for(const flags of [{battleMode:'PVP'},{stunned:true},{silenced:true}])assert.deepEqual(resolveJinmuArea({...args,actor:{...j,...flags}}),[]);
});
test('real PVE/PVP payloads include Jinmu and only PVE emits the dedicated area skill',()=>{
 const cards=tierCards(2e7),j=snapshot('V-989');
 const pve=createPveBattleV2({cards,mercenary:j,monster:{id:1,battle_power:1.6e10},seed:77});
 assert(pve.result.timeline.some(e=>e.type===JINMU_AREA_EVENT));assert.equal(pve.teams.A.mercenaries[0].cardId,'V-989');
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:j,defenderMercenary:snapshot('V-999'),seed:77});
 assert(!pvp.result.timeline.some(e=>e.type===JINMU_AREA_EVENT));assert.equal(pvp.teams.A.cards.length,5);
});
