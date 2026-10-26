import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFighter,simulateBattleV2Preview,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryCombat,mercenaryTurnCadence,mercenarySkillCapActions,mercenaryBaseActionCredit} from '../functions/_mercenary_combat.js';
import {RAZAK_COMBAT,RAZAK_SKILLS,razakIncomingDamage,razakActionCredit} from '../shared/mercenary-razak-v1.mjs';
import {applyMercenaryCombatLink,mercenaryCombatLinkText} from '../shared/mercenary-combat-link-v2103.mjs';
import {mercenaryGrowthIncomingDamage} from '../shared/mercenary-growth-review-v2.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {snapshot} from '../scripts/measure-razak-balance-20261026.mjs';
const fighter=(level=1,gear=0,mode='PVP')=>buildMercenaryFighter(snapshot('V-058',level,mode,gear),'A',mode,buildFighter);

test('server policy overrides forged stats and immunities, preserving ordinary SSS power and equipment accounting',()=>{
 for(const mode of ['PVE','PVP'])for(const gear of [0,1e6,1e8]){
  const a=buildMercenaryFighter({...snapshot('V-058',1,mode,gear),rank:'C',basePower:1,stats:{hp:1,attack:1,defense:1,speed:1},counterImmune:true,controlImmune:true,poisonImmune:true},'A',mode,buildFighter);
  const base=buildFighter({id:'V-058',power:1e6+gear,type:'NONE'},5,'A',null,mode),unarmed=buildFighter({id:'V-058',power:1e6,type:'NONE'},5,'A',null,mode);
  assert.equal(a.rank,'SSS');assert.equal(a.edition,'STANDARD');assert.equal(a.basePower,1e6+gear);assert.equal(a.razakPolicyVersion,4);
  assert.equal(a.maxHp,Math.round(base.maxHp*2.4));assert.equal(a.defense,Math.round(base.defense*2.4));assert.equal(a.speed,Math.round(base.speed*4));
  if(gear){assert.equal(a.equipmentStats.hp,a.maxHp-Math.round(unarmed.maxHp*2.4));assert.equal(a.equipmentStats.attack,a.attack-Math.round(unarmed.attack*2.4));}
  for(const key of ['controlImmune','counterImmune','poisonImmune'])assert.equal(a[key],false);
 }
});

test('link grants health, attack and shield once per owner, retaining damaged entry and level 21 equipment',()=>{
 for(const level of [1,6,11,16,21])for(const gear of [0,1e6]){
  const cards=tierCards(2e7).map((c,i)=>({...buildFighter(c,i,'A',null,'PVP'),ownerId:1})),a={...fighter(level,gear),ownerId:1};a.hp=Math.round(a.maxHp/2);
  const other=tierCards(1e4).map((c,i)=>({...buildFighter(c,i,'A',null,'PVP'),ownerId:2})),before=structuredClone([...cards,...other]);
  const teams=[[...cards,...other,a],[]];applyMercenaryCombatLink(teams);
  const avgHp=cards.reduce((n,c)=>n+c.maxHp,0)/5,avgAttack=cards.reduce((n,c)=>n+c.attack,0)/5;
  assert.equal(a.mercenaryLink.hpFloor,Math.floor(Math.round(avgHp*8+(a.equipmentStats?.hp||0))*(1+a.mercenaryGrowth.total.hpPercent/100)));
  assert.equal(a.mercenaryLink.attackFloor,Math.floor(Math.round(avgAttack*14+(a.equipmentStats?.attack||0))*(1+a.mercenaryGrowth.total.attackPercent/100)));
  assert(Math.abs(a.hp/a.maxHp-.5)<1e-5);assert(a.shield>0);assert.equal(a.mercenaryLevel.level,level);
  assert.deepEqual([...cards,...other],before);const once=structuredClone(teams);applyMercenaryCombatLink(teams);assert.deepEqual(teams,once);
 }
 assert.match(mercenaryCombatLinkText('SSS','MIDDLE',{code:'V-058'}),/800%/);
});

test('60% personal mitigation consumes shield before health in the canonical engine, without identity leakage',()=>{
 const target=fighter();Object.assign(target,{speed:1,attack:1,hp:10000,maxHp:10000,shield:5000,maxShield:5000,skills:[]});
 const source=buildFighter({id:'source',power:1e8},0,'B',null,'PVP');Object.assign(source,{speed:1e8,attack:1e8});
 const shot=t=>simulateBattleV2Preview({teamA:[t],teamB:[source],seed:7919,maxActions:1}).timeline.find(e=>e.type==='TURN'&&e.targetId===t.id&&!e.dodge);
 const protectedHit=shot(target),plainHit=shot({...target,code:'V-021',cardId:'V-021'});assert(protectedHit&&plainHit);
 assert.equal(protectedHit.damage+protectedHit.absorbed,Math.floor((plainHit.damage+plainHit.absorbed)*.4));assert(protectedHit.absorbed>0);assert.equal(protectedHit.targetHpAfter,10000);
 for(const amount of [0,1,5,10001,1e12]){assert.equal(razakIncomingDamage(target,amount),Math.floor(amount*.4));assert.equal(razakIncomingDamage({...target,isMercenary:false},amount),amount);assert.equal(razakIncomingDamage({...target,code:'V-021',name:'라자크'},amount),amount);}
 const grown={isMercenary:true,battleMode:'PVP',mercenaryLevel:{version:2,level:21},mercenaryLevelApplied:true,mercenaryGrowth:{total:{mitigationBypassPercent:50}}};
 assert.equal(mercenaryGrowthIncomingDamage(target,10000,4000,grown),7000);
});

test('two owner card actions fund eight Razak actions and no teammate or dead fighter receives that credit',()=>{
 const a={...fighter(),ownerId:1},b={...buildMercenaryFighter(snapshot('V-021'),'A','PVP',buildFighter),ownerId:2,id:'A:OTHER'},card={side:'A',ownerId:1,hp:1,alive:true},teammate={...card,ownerId:2};
 for(const duo of [false,true]){const team=duo?[card,teammate,a,b]:[...([card,a].map(x=>{const y={...x};delete y.ownerId;return y;}))],m=team.find(x=>x.code==='V-058'),c=team[0],cadence=mercenaryTurnCadence({A:team,B:[]});let count=0;
  for(let i=0;i<2;i++){cadence.acted(c);while(cadence.pending()){assert.equal(cadence.pending(),m);cadence.acted(m);assert(++count<=8);}}assert.equal(count,8);
  if(duo){cadence.acted(teammate);assert.equal(cadence.pending(),b);}
 }
 assert.equal(razakActionCredit([{...a,hp:0}]),1);assert.equal(razakActionCredit([{...a,isMercenary:false}]),1);assert.equal(mercenaryBaseActionCredit([a]),4);
});

test('skill caps and energy apply only to Razak; silence still prevents casts and repeated hooks cannot recharge twice',()=>{
 const a=fighter(),b=buildMercenaryFighter(snapshot('V-021'),'B','PVP',buildFighter);
 for(const skill of RAZAK_SKILLS){assert.equal(mercenarySkillCapActions(a,skill,false),3);assert.equal(mercenarySkillCapActions({...a,battleMode:'PVE'},skill,false),1);assert.equal(mercenarySkillCapActions(b,skill,false),1);}
 const events=[],runtime=mercenaryCombat({teams:{A:[a],B:[b]},clock:()=>0,hit:()=>({damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},emit:(type,data)=>events.push({type,...data})});
 runtime.state(a).energy=0;a.silenced=true;a.actions=1;runtime.beforeAction(a);const first=runtime.state(a).energy;assert.equal(first,10);runtime.beforeAction(a);assert.equal(runtime.state(a).energy,first);a.actions=2;runtime.beforeAction(a);assert.equal(runtime.state(a).energy,first+10);assert(!events.some(e=>e.type==='MERCENARY_RAZAK_ASSASSINATION'));assert.equal(runtime.basicDamageCapScale(a),1);
});

test('actual ranked duo accepts Razak and preserves each owner equipment, grade and common energy budget',()=>{
 const squad=(ownerId,code,level,gear)=>({ownerId,cards:tierCards(2e7),mercenary:snapshot(code,level,'PVP',gear)});
 const battle=createDuoBattleV2({attackerSquads:[squad(101,'V-058',21,1e6),squad(102,'V-021',1,0)],defenderSquads:[squad(201,'V-976',21,1e6),squad(202,'V-021',1,0)],seed:26026});
 const mercs=battle.teams.A.mercenaries;assert.equal(mercs.length,2);const a=mercs.find(m=>m.code==='V-058');assert.equal(a.basePower,2e6);assert.equal(a.rank,'SSS');assert.equal(a.razakPolicyVersion,4);assert.equal(new Set(mercs.map(m=>m.ownerId)).size,2);assert(battle.result.timeline.some(e=>e.type==='MERCENARY_RAZAK_ASSASSINATION'));assert(!battle.result.timeline.some(e=>e.skillId==='MS-063'));
});
