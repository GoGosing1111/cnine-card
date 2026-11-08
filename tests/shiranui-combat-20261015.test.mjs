import test from 'node:test';
import assert from 'node:assert/strict';
import {SHIRANUI_CODE,SHIRANUI_COMBAT,SHIRANUI_AREA_SKILL,SHIRANUI_AREA_EVENT,shiranuiIncomingDamage} from '../shared/mercenary-shiranui-v1.mjs';
import {GENERAL_JOK_CODE,GENERAL_JOK_COMBAT,GENERAL_JOK_PVE_BALANCE,GENERAL_JOK_AREA_EVENT} from '../shared/mercenary-general-jok-v1.mjs';
import {JOKRO_COMBAT} from '../shared/mercenary-jokro-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {mercenaryTurnCadence,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {resolveShiranuiArea} from '../functions/_mercenary_shiranui.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {cards,snapshot,team,fighter} from './helpers/helios-king-balance-20261106.mjs';

const codes=['V-979',SHIRANUI_CODE,GENERAL_JOK_CODE];
function assertOrdered(values,label){
 assert(values[0]<values[1]&&values[1]<values[2],label+' '+values.join(' / '));
}

test('Shiranui sits between Jokro and General Jok across level, equipment and card strength',()=>{
 assert.deepEqual([JOKRO_COMBAT.basePower,SHIRANUI_COMBAT.basePower,GENERAL_JOK_COMBAT.basePower],[2200000,2600000,2700000]);
 for(const mode of ['PVE','PVP'])for(const level of [1,11,21])for(const gear of [0,1e8])for(const power of [1e5,2e7,1e9]){
  const actors=codes.map(code=>{
   const squad=team(code,'A',mode,level,gear,power);
   applyMercenaryCombatLink([squad]);
   return squad.at(-1);
  });
  for(const field of ['attack','maxHp','defense','shield'])assertOrdered(actors.map(a=>a[field]),mode+' '+field);
  assertOrdered(actors.map(mercenaryEffectiveAttack),mode+' effective attack');
  assert.equal(actors[1].speed,actors[2].speed);
  assert.deepEqual(actors[1].skills.map(s=>s.id),mode==='PVE'?['MS-987']:[]);
  assert.equal(actors[1].attackStyle,'RANGED');
  for(const field of ['counterImmune','controlImmune','poisonImmune'])assert.equal(actors[1][field],true);
 }
});

test('single basic packet and action cadence retain mitigation and the Berkan matchup',()=>{
 const squad=team(SHIRANUI_CODE,'A','PVP'),k=squad.at(-1),enemy=team(GENERAL_JOK_CODE,'B','PVP');
 const rt=mercenaryCombat({teams:{A:squad,B:enemy},emit(){},damage(){},knockout(){}});
 assert.equal(rt.beforeBasicDamage(k,enemy[0],1000),1250);
 assert.equal(rt.beforeBasicDamage(enemy.at(-1),squad[0],1000),1500);
 const cadence=mercenaryTurnCadence({A:squad,B:enemy});
 let count=0;
 for(let i=0;i<25;i++){
  cadence.acted(squad[0]);
  while(cadence.pending()){assert.equal(cadence.pending(),k);cadence.acted(k);count++;assert(count<100);}
 }
 assert.equal(count,78);
 assert.equal(shiranuiIncomingDamage(k,1000,{isMercenary:true,code:'V-055'}),0);
 assert.equal(shiranuiIncomingDamage(k,1000,{}),200);
});
test('Shiranui packs remain impossible even with a contaminated catalog and maximum CMS weight',()=>{
 const rules={cardWeights:{[SHIRANUI_CODE]:1000000}},cards=[{code:SHIRANUI_CODE,name:'시라누이',rank:'SSS'},{code:'V-001',name:'일반',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(SHIRANUI_CODE,rules),false);
 assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);
 assert.equal(mercenaryCardChances(1000000,[SHIRANUI_CODE],rules)[0].percent,0);
 assert.deepEqual(limitedNormalCards(cards,cards,rules).map(c=>c.code),['V-001']);
 assert(!LIMITED_MERCENARIES.some(c=>c.code===SHIRANUI_CODE));
});
test('artillery shares one budget across living targets and emits one authoritative receipt per target',()=>{
 assert.deepEqual(SHIRANUI_AREA_SKILL.balance,{damageRatio:25.2,cooldownTurns:4,cost:25});
 assert.equal(GENERAL_JOK_PVE_BALANCE.damageRatio,30.24);
 assert.equal(GENERAL_JOK_PVE_BALANCE.cooldownTurns,3);
 assert.equal(GENERAL_JOK_PVE_BALANCE.cost,20);
 const actor=fighter(SHIRANUI_CODE,'A','PVE'),events=[],ratios=[];
 const targets=Array.from({length:12},(_,i)=>({id:'t'+i,hp:10000,maxHp:10000,alive:true}));
 const args={
  actor,skill:SHIRANUI_AREA_SKILL,targets:[...targets,targets[0],{id:'dead',hp:0}],
  hit:(a,t,ratio,opts)=>{assert.equal(opts.pveCapScale,1.5);ratios.push(ratio);return {damage:100};},
  damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},
  knockout(){},emit:(type,row)=>events.push({type,...row})
 };
 const hits=resolveShiranuiArea(args);
 assert.deepEqual(hits.map(h=>h.targetId),targets.map(t=>t.id));
 assert(Math.abs(ratios.reduce((a,b)=>a+b,0)-25.2)<1e-9);
 assert.equal(events.length,1);assert.equal(events[0].type,SHIRANUI_AREA_EVENT);
 assert.equal(events[0].damage,1200);assert(targets.every(t=>t.hp===9900));
 assert.deepEqual(resolveShiranuiArea({...args,actor:{...actor,battleMode:'PVP'}}),[]);
});

test('own-action cooldown and energy yield 15 casts per 60 actions below General Jok at 20',()=>{
 for(const [code,type,interval] of [[SHIRANUI_CODE,SHIRANUI_AREA_EVENT,4],[GENERAL_JOK_CODE,GENERAL_JOK_AREA_EVENT,3]]){
  const actor=fighter(code),enemy=team(code,'B')[0],turns=[];
  const combat=mercenaryCombat({teams:{A:[actor],B:[enemy]},clock:()=>actor.actions,
   hit:()=>({damage:1}),damage:()=>({hpDamage:1,absorbed:0}),knockout(){},
   emit:event=>{if(event===type)turns.push(actor.actions);}
  });
  for(actor.actions=1;actor.actions<=60;actor.actions++){
   if(!combat.beforeAction(actor))combat.afterBasic(actor,enemy,true);
   assert(combat.state(actor).energy>=0);
  }
  assert.deepEqual(turns,Array.from({length:60/interval},(_,i)=>1+i*interval));
 }
});

test('new standard PVE battles scale actual basic and area damage in order and PVP uses basics',()=>{
 const party=cards(),events=['MERCENARY_JOKRO_AREA',SHIRANUI_AREA_EVENT,GENERAL_JOK_AREA_EVENT];
 const combats=codes.map(code=>createPveBattleV2({cards:party,mercenary:snapshot(code),monster:{id:1,battle_power:160e9},seed:7}));
 for(const kind of ['basic','area']){
  const damages=combats.map((r,i)=>{
   const type=kind==='basic'?'TURN':events[i],actor=r.teams.A.mercenaries[0];
   const event=r.result.timeline.find(e=>e.type===type&&e.actorId===actor.id&&!e.dodge);
   assert(event,codes[i]+' '+type);return event.damage+(event.absorbed??0);
  });
  assertOrdered(damages,kind);
 }
 const battle=createPvpBattleV2({attackerCards:party,defenderCards:party,attackerMercenary:snapshot(SHIRANUI_CODE,1,'PVP'),defenderMercenary:snapshot(GENERAL_JOK_CODE,1,'PVP'),seed:7});
 assert(battle.result.timeline.some(e=>e.type==='TURN'&&e.actorId===battle.teams.A.mercenaries[0].id));
 assert(!battle.result.timeline.some(e=>e.type===SHIRANUI_AREA_EVENT));
});
