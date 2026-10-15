import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {VALTER_COMBAT,valterActionCredit} from '../shared/mercenary-valter-v1.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';

const snapshot=()=>({...limitedDeploymentSnapshot('V-996'),combat:fixture.combat});
const fighter=(side='A',mode='PVP')=>buildMercenaryFighter(snapshot(),side,mode,buildFighter);
const card=(side,ownerId)=>({id:side+':card:'+ownerId,side,ownerId,hp:1,alive:true});
const drain=c=>{const actors=[];while(c.pending()){const actor=c.pending();actors.push(actor);c.acted(actor);assert.ok(actors.length<=3,'Extra actions must terminate');}return actors;};

test('Valter receives 50% more natural speed in both modes while personal stats and PVE skill stay intact',()=>{
 for(const mode of ['PVE','PVP'])for(const side of ['A','B']){
  const stale={...snapshot(),valterPolicyVersion:1,stats:{speed:1}},before=structuredClone(stale),actor=buildMercenaryFighter(stale,side,mode,buildFighter);
  const base=buildFighter({id:'V-996',power:1080000,type:'NONE'},5,side,null,mode);
  assert.deepEqual(stale,before);assert.equal(actor.speed,base.speed*3);assert.equal(actor.speed/(base.speed*2),1.5);
  assert.equal(actor.stats.speed,actor.speed);assert.equal(actor.valterPolicyVersion,2);assert.equal(actor.basePower,1080000);
  assert.equal(actor.stats.hp,base.maxHp);assert.equal(actor.stats.attack,base.attack);assert.equal(actor.stats.defense,base.defense);
  assert.deepEqual(actor.skills.map(s=>s.id),mode==='PVE'?['MS-996']:[]);
 }
 assert.equal(VALTER_COMBAT.damageTakenScale,.25);assert.equal(VALTER_COMBAT.basicCapScale,2);
});

test('both sides earn three finite extra turns per allied card, with no enemy, suit, monster or dead-actor credit',()=>{
 for(const mode of ['PVE','PVP'])for(const side of ['A','B']){
  const other=side==='A'?'B':'A',ally=card(side),enemy=card(other),actor=fighter(side,mode);
  const c=mercenaryTurnCadence({[side]:[ally,actor],[other]:[enemy]});let count=0;
  for(let i=0;i<20;i++){
   for(const flags of [{isMonster:true},{isBattleSuit:true,actorKind:'BATTLE_SUIT'},{hp:0,alive:false}])c.acted({...ally,...flags});
   c.acted(enemy);assert.equal(c.pending(),null);c.acted(ally);const turns=drain(c);assert.equal(turns.length,3);assert.ok(turns.every(a=>a===actor));count+=turns.length;
  }
  assert.equal(count,60);actor.hp=0;actor.alive=false;c.acted(ally);assert.equal(c.pending(),null);assert.equal(valterActionCredit([actor]),1);
 }
 const v=fighter();assert.equal(valterActionCredit([{...v,isMercenary:false}]),1);assert.equal(valterActionCredit([{...v,code:'V-055',name:'발테르'}]),1);
});

test('duo teammate actions remain separate and Valter keeps three last-stand responses',()=>{
 const a=card('A',1),b=card('A',2),enemy=card('B',3),v={...fighter(),ownerId:1};
 const s={...buildMercenaryFighter({...limitedDeploymentSnapshot('V-990'),combat:fixture.combat},'A','PVP',buildFighter),ownerId:2};
 const c=mercenaryTurnCadence({A:[a,b,v,s],B:[enemy]});
 c.acted(a);assert.deepEqual(drain(c),[v,v,v]);c.acted(b);assert.deepEqual(drain(c),[s,s]);
 a.hp=0;a.alive=false;c.acted(enemy);assert.deepEqual(drain(c),[v,v,v]);
});

test('long canonical battles do not cut Valter off at the former two-turn budget',()=>{
 for(const mode of ['PVE','PVP'])for(const side of ['A','B']){
  const other=side==='A'?'B':'A';
  const sturdy=(actor,speed)=>({...actor,attack:1,hp:1e15,maxHp:1e15,shield:0,maxShield:0,speed,gauge:0});
  const ally=sturdy(buildFighter({id:'ally',power:10000},0,side,null,mode),1e6);
  const enemy=sturdy(buildFighter({id:'enemy',power:10000},0,other,null,mode),1);
  const v=sturdy(fighter(side,mode),1);v.skills=[];
  const teams={[side]:[ally,v],[other]:[enemy]};
  const input={teamA:teams.A,teamB:teams.B,seed:7919,maxActions:20,suddenDeathAfter:1000};
  const result=simulateBattleV2Preview(input),final=result.final[side].find(a=>a.isMercenary);
  assert.equal(result.actions,20);assert.equal(result.mercenaryActions,57);assert.ok(final.hp>0);
  assert.deepEqual(result,simulateBattleV2Preview(input));
 }
});

test('real PVE and PVP payloads publish the faster server fighter and preserve ordinary cards',()=>{
 const cards=tierCards(2e7),mercenary=snapshot();
 for(const mode of ['PVE','PVP']){
  const battle=mode==='PVE'?createPveBattleV2({cards,mercenary,monster:{id:1,battle_power:6e8},seed:7919}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,seed:7919});
  const v=battle.teams.A.mercenaries[0];assert.equal(v.valterPolicyVersion,2);assert.equal(v.stats.speed,Math.round(fighter('A',mode).speed*(v.pvpPowerBalance?.tempoMultiplier??1)));assert.equal(v.stats.speed,v.speed);
  assert.ok(battle.result.timeline.some(event=>event.actorId===v.id&&(event.damage>0||event.absorbed>0)));
  const without=mode==='PVE'?createPveBattleV2({cards,monster:{id:1,battle_power:6e8},seed:7919}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,seed:7919});
  if(mode==='PVE')assert.deepEqual(battle.teams.A.cards,without.teams.A.cards);
  else for(const [i,card]of battle.teams.A.cards.entries()){
   const baseline=without.teams.A.cards[i],effect=card.pvpPowerBalance;
   assert.equal(effect.formationPower,5*2e7+mercenary.basePower);
   assert.deepEqual(card,{...baseline,speed:Math.round(baseline.speed*effect.tempoMultiplier),pvpPowerBalance:effect},'ordinary cards receive only the independently approved formation bonus');
  }
 }
});
