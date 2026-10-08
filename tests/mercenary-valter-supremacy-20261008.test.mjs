import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {buildFighter,createPvpBattleV2,createPveBattleV2,createDuoBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {applyMercenaryCombatLink} from '../shared/mercenary-combat-link-v2103.mjs';
import {VALTER_CODE,valterIncomingDamage} from '../shared/mercenary-valter-v1.mjs';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {tierCards,tierDecks} from './helpers/mercenary-operating-roster-v2144.mjs';

const valter=()=>({...LIMITED_MERCENARIES.find(c=>c.code===VALTER_CODE),statMode:'RANK_FIXED',level:1,combat:fixture.combat});
const roster=fixture.roster.map(c=>({...c,combat:fixture.combat}));
const fighter=(snapshot,side='A',mode='PVP')=>buildMercenaryFighter(snapshot,side,mode,buildFighter);
const linked=(snapshot,side,power,types,mode='PVP')=>{
 const team=[...tierCards(power,types).map((c,i)=>buildFighter(c,i,side,null,mode)),fighter(snapshot,side,mode)];
 return team;
};
const berkan=()=>structuredClone(roster.find(c=>c.code==='V-055'));

test('prepared Valter uses a server-owned superior profile while limited release stays locked',()=>{
 const input=valter(),before=structuredClone(input),m=fighter({...input,rank:'C',position:'BACK',basePower:1,stats:{hp:1,attack:1,defense:1,speed:1}});
 assert.deepEqual(input,before);assert.equal(m.rank,'SSS');assert.equal(m.basePower,1080000);assert.equal(m.row,'FRONT');assert.equal(m.attackStyle,'MELEE');
 assert.equal(m.controlImmune,true);assert.equal(m.counterImmune,true);assert.equal(m.poisonImmune,true);
 for(const mode of ['PVE','PVP']){
  const teams=[linked(valter(),'A',2e7,tierDecks.balanced,mode),linked(berkan(),'B',2e7,tierDecks.balanced,mode)];
  const ordinary=structuredClone(teams.map(t=>t.slice(0,5)));applyMercenaryCombatLink(teams);
  const v=teams[0].at(-1),b=teams[1].at(-1);
  assert.equal(v.mercenaryLink.attackFloor,b.mercenaryLink.attackFloor*8);assert.equal(v.mercenaryLink.hpFloor,b.mercenaryLink.hpFloor*4);
  assert.ok(v.speed>b.speed);assert.deepEqual(teams.map(t=>t.slice(0,5)),ordinary);
  const once=structuredClone(teams);applyMercenaryCombatLink(teams);assert.deepEqual(teams,once);
 }
 assert.equal(input.acquisitionEnabled,false);assert.equal(input.deploymentEnabled,false);assert.equal(input.artOnly,true);
 assert.equal(mercenaryAcquisitionEnabled(VALTER_CODE,{cardWeights:{[VALTER_CODE]:1000000}}),false);
});

test('personal 75% mitigation and the exact Berkan counter cannot leak to allies or ordinary cards',()=>{
 const v=fighter(valter()),b=fighter(berkan(),'B');
 for(const amount of [0,1,4,10001,1e12]){
  assert.equal(valterIncomingDamage(v,amount,b),0);
  assert.equal(valterIncomingDamage(v,amount,fighter(roster.find(c=>c.code==='V-049'),'B')),Math.floor(amount*.25));
  assert.equal(valterIncomingDamage({...v,isMercenary:false},amount,b),amount);
  assert.equal(valterIncomingDamage({...v,code:'V-049',name:'발테르'},amount,b),amount);
  assert.equal(valterIncomingDamage(v,amount,{...b,isMercenary:false}),Math.floor(amount*.25));
 }
});

test('canonical basic shots, twin starfall and PVE arrow rain never consume Valter HP or shield',()=>{
 for(const [mode,skillId] of [['PVP',null],['PVP','MS-055'],['PVE',null],['PVE','MS-055'],['PVE','MS-056']])for(const shield of [0,5000]){
  const snapshot=berkan();snapshot.skills=snapshot.skills.filter(s=>s.id===skillId);
  const b=fighter(snapshot,'B',mode),v=fighter(valter(),'A',mode);
  Object.assign(b,{speed:100000,attack:1e12});Object.assign(v,{speed:1,attack:1,hp:10000,maxHp:10000,shield,maxShield:shield});
  const others=skillId==='MS-056'?[{...buildFighter({id:'ally',power:1e8},0,'A',null,mode),speed:1}]:[];
  const result=simulateBattleV2Preview({teamA:[v,...others],teamB:[b],seed:7919,maxActions:12});
  const hits=result.timeline.flatMap(e=>e.actorId===b.id?(e.impacts||[e]):[]).filter(e=>e.targetId===v.id&&typeof e.damage==='number'&&!e.dodge);
  assert.ok(hits.length>0,`${mode}/${skillId}: actual contacts required`);
  for(const hit of hits){assert.equal(hit.damage,0);assert.equal(hit.absorbed,0);assert.equal(hit.targetHpAfter,10000);assert.equal(hit.targetShieldAfter,shield);}
  assert.equal(result.final.A.find(c=>c.id===v.id).hp,10000);
  if(skillId){assert.ok(result.timeline.some(e=>e.skillId===skillId&&e.impacts?.some(i=>i.targetId===v.id)));
   if(others.length)assert.ok(result.timeline.some(e=>e.skillId===skillId&&e.impacts?.some(i=>i.targetId===others[0].id&&i.damage>0)));
  }
 }
});

test('all operating mercenary debuffs and melee parries leave Valter free to act',()=>{
 for(const snapshot of roster){
  const a=fighter(snapshot,'B'),v=fighter(valter()),initial={defense:v.defense,gauge:v.gauge};v.shield=1e9;
  const events=[],runtime=mercenaryCombat({teams:{A:[v],B:[a]},hit:()=>({damage:1,dodge:false}),damage:()=>({hpDamage:0,absorbed:0}),knockout(){},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
  for(let n=1;n<=12;n++){a.actions=n;runtime.state(a).energy=100;runtime.beforeAction(a);runtime.afterBasic(v,a,true);}
  assert.deepEqual(runtime.debuffs.get(v.id)||{},{},snapshot.code);assert.equal(v.defense,initial.defense);assert.equal(v.gauge,initial.gauge);
  assert.ok(!events.some(e=>e.type==='MERCENARY_DEBUFF'&&e.targetId===v.id),snapshot.code);
  runtime.buffs.set(a.id,{parry:{percent:90,expires:99,skill:{id:'parry'}}});
  assert.equal(runtime.beforeBasicDamage(v,a,10000),10000);assert.equal(runtime.state(a).riposte,undefined);
 }
});

test('Valter earns three turns per two owner card actions without affecting a duo teammate',()=>{
 const v={...fighter(valter()),ownerId:1},other={...fighter(berkan()),id:'A:other',ownerId:2};
 const a={ownerId:1,side:'A',hp:1,alive:true},b={ownerId:2,side:'A',hp:1,alive:true};
 const cadence=mercenaryTurnCadence({A:[a,b,v,other],B:[]});
 let turns=0;for(let i=0;i<2;i++){cadence.acted(a);while(cadence.pending()){assert.equal(cadence.pending(),v);cadence.acted(v);turns++;assert.ok(turns<=3);}}
 assert.equal(turns,3);assert.equal(cadence.pending(),null);cadence.acted(b);assert.equal(cadence.pending(),other);cadence.acted(other);assert.equal(cadence.pending(),null);
});

test('Valter defeats all 55 operating mercenaries on both sides across four deck styles and three power scales',t=>{
 assert.equal(roster.length,55);let duels=0,teams=0;
 for(const opponent of roster)for(const power of [10000,2e7,2e9])for(const [deck,types] of Object.entries(tierDecks))for(const side of ['A','B'])for(const seed of [7919,65537]){
  const snapshots=side==='A'?[valter(),opponent]:[opponent,valter()];
  const linkedTeams=snapshots.map((m,i)=>linked(m,i?'B':'A',power,types));applyMercenaryCombatLink(linkedTeams);
  const duel=simulateBattleV2Preview({teamA:[linkedTeams[0].at(-1)],teamB:[linkedTeams[1].at(-1)],seed,maxActions:83,suddenDeathAfter:64});
  assert.equal(duel.winner,side,`duel ${opponent.code}/${power}/${deck}/${side}/${seed}`);duels++;
  const cards=tierCards(power,types),battle=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshots[0],defenderMercenary:snapshots[1],seed});
  assert.equal(battle.result.winner,side,`team ${opponent.code}/${power}/${deck}/${side}/${seed}`);teams++;
 }
 t.diagnostic(JSON.stringify({cmsRevision:fixture.cmsRevision,opponents:roster.length,duels,teams}));
});

test('Valter clears the same PVE boss at least as quickly as all 55 operating mercenaries',()=>{
 for(const power of [10000,2e7,2e9]){
  const measure=mercenary=>[7919,65537].reduce((sum,seed)=>{
   const battle=createPveBattleV2({cards:tierCards(power),mercenary,monster:{id:1,battle_power:power*30},seed});
   assert.equal(battle.result.winner,'A',mercenary.code);
   return sum+battle.result.actions;
  },0);
  const turns=measure(valter());
  for(const opponent of roster)assert.ok(turns<=measure(opponent),`${opponent.code}/${power}: Valter must not require more regular actions`);
 }
});

test('canonical PVE and duo keep Valter personal strength and deterministic results',()=>{
 const cards=tierCards(2e7).map((c,i)=>({...c,rarity:['FUR','FUR','ZENITH','ZENITH','SUPERSTAR'][i]}));
 const pve=createPveBattleV2({cards,mercenary:valter(),monster:{id:1,name:'검수 보스',battle_power:6e8},seed:7919});
 assert.ok(pve.result.timeline.some(e=>e.actorId?.includes(VALTER_CODE)&&e.damage>0));
 const squad=(ownerId,mercenary)=>({ownerId,cards,mercenary});
 const input={attackerSquads:[squad(1,valter()),squad(2,berkan())],defenderSquads:[squad(3,berkan()),squad(4,berkan())],seed:7919};
 const duo=createDuoBattleV2(input);assert.equal(duo.result.winner,'A');assert.deepEqual(duo,createDuoBattleV2(input));
 const v=duo.teams.A.mercenaries.find(c=>c.cardId===VALTER_CODE),other=duo.teams.A.mercenaries.find(c=>c.cardId==='V-055');
 assert.ok(Math.abs(v.mercenaryLink.attackFloor-other.mercenaryLink.attackFloor*8)<=4,'independent integer rounding stays within four points');
 for(const e of duo.result.timeline.filter(e=>e.actorId?.includes('V-055')))for(const hit of e.impacts||[e])if(hit.targetId===v.id&&typeof hit.damage==='number')assert.equal(hit.damage,0);
});
