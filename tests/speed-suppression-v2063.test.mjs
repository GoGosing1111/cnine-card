import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as after from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {operatingMercenaries} from './helpers/mercenary-operating-roster-v2144.mjs';

// Real pre-change engine, using current unchanged dependencies for parity.
const baselineRef='3d9d27829c316fcad2b433137e80838acfccb45f';
const engineUrl=new URL('../functions/_battle_v2_preview.js',import.meta.url);
const baseline=execFileSync('git',['show',`${baselineRef}:functions/_battle_v2_preview.js`],{cwd:new URL('..',import.meta.url),encoding:'utf8',maxBuffer:2e6});
const source=readFileSync(engineUrl,'utf8');
const inspect=async text=>import('data:text/javascript;base64,'+Buffer.from((text+'\nexport {hitResult};').replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,left,path,right)=>left+new URL(path,engineUrl).href+right)).toString('base64'));
const before=await inspect(baseline),current=await inspect(source);
const unique=(type,value=100)=>({dominantType:type,attackPercent:type==='ATTACK'?value:0,defensePercent:type==='DEFENSE'?value:0,hpPercent:type==='HP'?value:0,speedPercent:type==='SPEED'?value:0});
const card=(type,id,value=100)=>({id,title:id,power:120000,rarity:'FUR',uniqueAbility:unique(type,value)});
const deck=(types=['DEFENSE','DEFENSE','HP','ATTACK','ATTACK'])=>types.map((type,i)=>card(type,`card-${i}`));
const fighter=(type,id,side='A',slot=0,value=100,mode='PVP')=>after.buildFighter(card(type,id,value),slot,side,unique(type,value),mode);
const mercenary=(side='B',hpPercent=100)=>buildMercenaryFighter({...structuredClone(operatingMercenaries.find(m=>m.code==='V-021')),startingHpPercent:hpPercent,skills:[]},side,'PVP',after.buildFighter);
const frozen=f=>({...f,speed:1,gauge:0});
const firstSpeedHit=({healerRatio=.4,mercenaryRatio=.2,mode='PVP',hideHealer=false,hideMercenary=false,deadHealer=false,deadMercenary=false,suitMercenary=false}={})=>{
 const speed={...fighter('SPEED','speed','A',0,100,mode),gauge:100,speed:10000};
 const front=frozen(fighter('NONE','front','B',0,0,mode));
 const healer=frozen(fighter('HP','healer','B',2,100,mode));healer.hp=healer.maxHp*healerRatio;healer.untargetable=hideHealer;healer.alive=!deadHealer;
 const merc=frozen(mercenary('B'));merc.battleMode=mode;merc.hp=merc.maxHp*mercenaryRatio;merc.untargetable=hideMercenary;merc.alive=!deadMercenary;merc.isBattleSuit=suitMercenary;
 if(suitMercenary)merc.attack=1;
 const battle=after.simulateBattleV2Preview({teamA:[speed],teamB:[front,healer,merc],maxActions:1,seed:31,singleHealerBonus:{enabled:false}});
 return {battle,speed,front,healer,merc,hit:battle.timeline.find(e=>e.type==='TURN'&&e.actorId===speed.id)};
};

test('two living PVP guards remove 30% of the positive unique bonus and preserve opening gauge',()=>{
 for(const value of [0,30,100,300,-20]){
  const speed=fighter('SPEED','speed','A',0,value),guards=[fighter('DEFENSE','g1','B',0),fighter('DEFENSE','g2','B',1)];
  const result=after.simulateBattleV2Preview({teamA:[speed],teamB:guards,maxActions:0,seed:11});
  const actual=result.final.A[0],positive=Math.max(0,value)/100;
  assert.equal(actual.speed,Math.max(35,Math.round(speed.speed*(1+positive*.7)/(1+positive))));
  assert.ok(actual.gauge>=30&&actual.gauge<38,'opening gauge must survive');
  const events=result.timeline.filter(e=>e.type==='SPEED_UNIQUE_SUPPRESSED');
  assert.equal(events.length,value>0?1:0);if(value>0)assert.equal(events[0].bonusSuppressionPercent,30);
  assert.equal(actual.speedUniqueSuppressed,false,'dodge, crit and gauge manipulation remain enabled');
 }
});

test('a dead second guard cannot suppress speed; no-guard and one-guard cases retain their speed',()=>{
 const speed=fighter('SPEED','speed');
 for(const guards of [[fighter('NONE','n','B')],[fighter('DEFENSE','g1','B')],[fighter('DEFENSE','g1','B'),{...fighter('DEFENSE','dead','B',1),alive:false,hp:0}]]){
  const result=after.simulateBattleV2Preview({teamA:[speed],teamB:guards,maxActions:0,seed:12});
  assert.equal(result.final.A[0].speed,speed.speed);assert.equal(result.timeline.filter(e=>e.type==='SPEED_UNIQUE_SUPPRESSED').length,0);
 }
});

test('losing a guard restores exact speed after that action, including the final allowed action',()=>{
 const speed=frozen(fighter('SPEED','speed','A',2));speed.speed=4321;
 const attacker={...fighter('ATTACK','killer','A',0),gauge:100,speed:100000,attack:1e9};
 const guard={...frozen(fighter('DEFENSE','g1','B',0)),maxHp:1000,hp:1,shield:0,maxShield:0};
 const other={...frozen(fighter('DEFENSE','g2','B',1)),maxHp:1000,hp:1000,shield:0,maxShield:0,untargetable:true};
 const result=after.simulateBattleV2Preview({teamA:[attacker,speed],teamB:[guard,other],maxActions:1,seed:31});
 const ko=result.timeline.find(e=>e.type==='KO'&&e.targetId===guard.id),restore=result.timeline.filter(e=>e.type==='SPEED_UNIQUE_RESTORED');
 assert.ok(ko);assert.equal(restore.length,1);assert.ok(restore[0].at>=ko.at);assert.equal(restore[0].speedAfter,4321);
 assert.equal(result.final.A.find(f=>f.id===speed.id).speed,4321);
});

test('a guard saved by an existing revive keeps the two-living-guard suppression',()=>{
 const speed=frozen(fighter('SPEED','speed','A',2));speed.speed=4000;
 const attacker={...fighter('NONE','killer','A',0),gauge:100,speed:100000,attack:1e9};
 const guard={...frozen(fighter('DEFENSE','g1','B',0)),maxHp:1000,hp:1,shield:0,maxShield:0};
 const other={...frozen(fighter('DEFENSE','g2','B',1)),maxHp:1000,hp:1000,shield:0,maxShield:0,untargetable:true};
 const magicB=[{id:'revive',slotNo:1,code:'V2_PHOENIX_REVIVE',name:'부활',effectType:'PHOENIX_REVIVE',effectValue:30,triggerChance:100,maxActivations:1}];
 const result=after.simulateBattleV2Preview({teamA:[attacker,speed],teamB:[guard,other],magicB,maxActions:1,seed:31});
 assert.ok(result.timeline.some(e=>e.type==='MAGIC_CARD'&&e.revived));
 assert.equal(result.timeline.filter(e=>e.type==='SPEED_UNIQUE_RESTORED').length,0);
 assert.equal(result.final.A.find(f=>f.id===speed.id).speed,3400);
});

test('mercenaries and healers share strict lowest-HP-ratio priority, bypassing front cards',()=>{
 for(const [healerRatio,mercenaryRatio,expected] of [[.4,.2,'merc'],[.2,.6,'healer'],[.5,.5,'healer']]){
  const result=firstSpeedHit({healerRatio,mercenaryRatio});assert.equal(result.hit.targetId,result[expected].id);
 }
 for(let seed=1;seed<=32;seed++){
  const speed={...fighter('SPEED','speed'),gauge:100,speed:10000},healer=frozen(fighter('HP','healer','B',2)),merc=frozen(mercenary());
  healer.hp=healer.maxHp*.2;merc.hp=merc.maxHp*.8;healer.shield=healer.maxHp*10;
  const result=after.simulateBattleV2Preview({teamA:[speed],teamB:[healer,merc],seed,maxActions:1});
  assert.equal(result.timeline.find(e=>e.type==='TURN').targetId,healer.id,'HP ratio excludes shield amount');
 }
});

test('dead, untargetable and battle-suit units cannot take priority; fallback uses existing formation',()=>{
 for(const options of [{hideMercenary:true},{deadMercenary:true},{suitMercenary:true}]){
  const result=firstSpeedHit(options);assert.equal(result.hit.targetId,result.healer.id);
 }
 for(const options of [{hideHealer:true},{deadHealer:true}]){
  const result=firstSpeedHit(options);assert.equal(result.hit.targetId,result.merc.id);
 }
 const fallback=firstSpeedHit({deadHealer:true,deadMercenary:true});assert.equal(fallback.hit.targetId,fallback.front.id);
 const pve=firstSpeedHit({mode:'PVE'});assert.equal(pve.hit.targetId,pve.front.id);
});

test('damage, dodge, critical, penetration and caps are unchanged for every target type',()=>{
 for(const battleMode of ['PVP','PVE'])for(const type of ['ATTACK','DEFENSE','HP','SPEED'])for(const counter of [false,true])for(const targetType of ['HP','DEFENSE','ATTACK','SPEED','MERCENARY']){
  const actor={type,battleMode,attack:1000,actions:2},target={type:targetType,isMercenary:targetType==='MERCENARY',defense:100,hp:100000,maxHp:100000,shield:0};
  for(const roll of [.05,.15,.5])assert.deepEqual(current.hitResult(actor,target,()=>roll,1,counter),before.hitResult(actor,target,()=>roll,1,counter));
 }
});

test('actual PVP API preserves five cards plus one mercenary and prioritizes the wounded mercenary',()=>{
 const a=deck(['NONE','NONE','SPEED','NONE','NONE']);a[2]=card('SPEED','card-2',300);
 const b=deck(['DEFENSE','DEFENSE','HP','ATTACK','ATTACK']);
 const m={...structuredClone(operatingMercenaries.find(m=>m.code==='V-021')),startingHpPercent:10,skills:[]};
 const result=after.createPvpBattleV2({attackerCards:a,defenderCards:b,defenderMercenary:m,seed:31});
 const speed=result.teams.A.cards.find(f=>f.type==='SPEED'),merc=result.teams.B.mercenaries[0];
 assert.equal(result.teams.A.cards.length,5);assert.equal(result.teams.B.cards.length,5);assert.equal(result.teams.B.mercenaries.length,1);
 assert.equal(result.result.timeline.find(e=>e.type==='TURN'&&e.actorId===speed.id).targetId,merc.id);
 assert.equal(result.result.final.B.length,5);assert.equal(result.result.final.mercenaries.B.length,1);
});

test('duo PVP keeps owner formations and selects the lowest ratio across both opposing mercenaries',()=>{
 const m=structuredClone(operatingMercenaries.find(m=>m.code==='V-021'));
 const squad=(ownerId,types,mercenaryHp)=>({ownerId,cards:deck(types).map((card,i)=>({...card,rarity:['FUR','FUR','ZENITH','ZENITH','SUPERSTAR'][i]})),...(mercenaryHp?{mercenary:{...m,skills:[],startingHpPercent:mercenaryHp}}:{})});
 const a=squad(1,['NONE','NONE','SPEED','NONE','NONE']);a.cards[2]={...card('SPEED','card-2',300),rarity:'ZENITH'};
 const result=after.createDuoBattleV2({attackerSquads:[a,squad(2,['NONE','NONE','NONE','NONE','NONE'])],defenderSquads:[squad(3,['DEFENSE','ATTACK','HP','ATTACK','NONE'],40),squad(4,['DEFENSE','ATTACK','HP','ATTACK','NONE'],10)],seed:31});
 const speed=result.teams.A.cards.find(f=>f.type==='SPEED'),mercs=result.teams.B.mercenaries;
 assert.equal(result.teams.A.cards.length,10);assert.equal(mercs.length,2);
 assert.equal(result.result.timeline.find(e=>e.type==='TURN'&&e.actorId===speed.id).targetId,mercs.find(m=>m.ownerId===4).id);
});

test('ordinary PVE and PVP without speed cards retain complete pre-change results',()=>{
 for(let i=0;i<32;i++){
  const args={cards:deck(['DEFENSE','DEFENSE','HP','ATTACK','SPEED']),characterBonus:500000,seed:1000+i*7919,monster:{id:'boss',name:'boss',battle_power:800000,is_boss:1}};
  assert.deepEqual(after.createPveBattleV2(args),before.createPveBattleV2(args));
  const pvpArgs={attackerCards:deck(),defenderCards:deck(['DEFENSE','HP','ATTACK','ATTACK','ATTACK']),attackerEquipmentBonus:500000,defenderEquipmentBonus:500000,seed:args.seed};
  assert.deepEqual(after.createPvpBattleV2(pvpArgs),before.createPvpBattleV2(pvpArgs));
 }
});
