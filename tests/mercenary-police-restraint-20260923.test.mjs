import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {gsap} from 'gsap';
import {Container,Sprite,Texture} from 'pixi.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {withMercenaryBattle} from '../preview/project-v-v3/source/battle/MercenaryCombatPlayback.js';
import {operatingMercenaries,tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';

after(()=>gsap.ticker.sleep());
const police=operatingMercenaries.find(m=>m.code==='V-042');
function harness({hp=10000,marks=0,mode='PVP',side='A',miss=false,revive=false}={}){
 const actor=buildMercenaryFighter({...structuredClone(police),statMode:'QA',basePower:120000,stats:{hp:10000,attack:1000,defense:100,speed:100}},side,mode);
 const enemySide=side==='A'?'B':'A',target={id:enemySide+':TARGET',side:enemySide,slot:0,row:'FRONT',hp,maxHp:10000,shield:0,alive:true,actions:4},other={...target,id:enemySide+':OTHER',slot:1,hp:10000};
 const events=[],rolls=[],teams={[side]:[actor],[enemySide]:[target,other]};
 const runtime=mercenaryCombat({teams,clock:()=>0,emit:(type,data)=>events.push({type,...data}),
  hit:(a,t,m)=>{rolls.push({actorId:a.id,targetId:t.id,ratio:m});return {damage:1000*m,dodge:miss};},
  damage:(t,n)=>{const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.shield-=absorbed;t.hp-=hpDamage;return {absorbed,hpDamage};},
  knockout:t=>{if(t.hp<=0){t.alive=false;if(revive){t.hp=100;t.alive=true;}}}});
 if(marks)runtime.debuffs.set(target.id,{offender:{[actor.id]:marks}});
 return {actor,target,other,runtime,events,rolls,turn:()=>{actor.actions++;return runtime.beforeAction(actor);}};
}

test('police killing shot never marks or weakens a dead enemy in PVE or either PVP team',()=>{
 for(const mode of ['PVE','PVP'])for(const side of ['A','B'])for(const marks of [0,police.combat.restraintHits]){
  const h=harness({hp:1,marks,mode,side});h.turn();
  assert.equal(h.target.hp,0);assert.equal(h.target.alive,false);
  assert.equal(h.events.filter(e=>e.type==='MERCENARY_HIT').length,1);
  assert.deepEqual(h.events.filter(e=>e.type==='MERCENARY_DEBUFF'),[],`${mode}/${side}/${marks}: no status after knockout`);
  assert.equal(h.runtime.debuffs.get(h.target.id)?.restraint,undefined);
  assert.equal(h.runtime.debuffs.get(h.target.id)?.offender?.[h.actor.id]||0,marks);
  assert.equal(h.rolls.length,1);assert.equal(h.other.hp,10000,'no invented second shot or retarget');
  assert.equal(h.runtime.state(h.actor).pending,null);assert.equal(h.runtime.state(h.actor).energy,police.combat.energyMax-police.skills[0].balance.cost);
  assert.equal(h.runtime.state(h.actor).cooldown.get('MS-042'),1+police.skills[0].balance.cooldownTurns);
 }
});
test('living targets retain the current mark, restraint duration, damage and one-shot budget',()=>{
 for(const marks of [0,police.combat.restraintHits]){
  const h=harness({marks});h.turn();const status=h.events.filter(e=>e.type==='MERCENARY_DEBUFF');
  assert.equal(h.rolls.length,1);assert.equal(h.events.filter(e=>e.type==='MERCENARY_HIT').length,1);assert.equal(status.length,1);
  assert.equal(status[0].effect,marks?'BASIC_WEAKENED':'OFFENDER_MARK');assert.equal(h.target.hp,10000-1000*police.skills[0].balance.damageRatio);
  if(marks){assert.equal(h.runtime.debuffs.get(h.target.id).restraint.percent,police.combat.restraintPercent);assert.equal(h.runtime.debuffs.get(h.target.id).restraint.expires,4+police.combat.statusTurns);}
  else assert.equal(h.runtime.debuffs.get(h.target.id).offender[h.actor.id],1);
 }
});
test('misses add no status; a canonical revival is still a living target',()=>{
 const miss=harness({miss:true});miss.turn();assert.equal(miss.target.hp,10000);assert.ok(!miss.events.some(e=>e.type==='MERCENARY_DEBUFF'));
 const revived=harness({hp:1,revive:true});revived.turn();assert.equal(revived.target.hp,100);assert.equal(revived.events.find(e=>e.type==='MERCENARY_DEBUFF')?.effect,'OFFENDER_MARK');
});

function playbackHarness(hp=100){
 const actor={id:'A:MERCENARY:V-042',hp:100,team:'ALLY',root:new Container()},target={id:'B:TARGET',hp,team:'ENEMY',battleActive:true,root:new Container()};
 for(const a of [actor,target])Object.assign(a,{baseX:a===actor?100:800,baseY:400,fullBodySprite:new Sprite(Texture.EMPTY)});
 const banners=[],loads=[],plans=[];
 class Base {
  constructor(){this.visible=true;this.playbackEpoch=1;this.mercenaryAuxiliary={};this.effectLayer=new Container();this.combatLayer=new Container();this.simpleTimelines=new Set();this.audio={enabled:()=>false};}
  combatantById(id){return [actor,target].find(a=>a.id===id);}
  queueBanner(...args){banners.push(args);}
  eventHpPercent(_target,value){return value;}
  syncTargetHp(t,value){t.hp=value;}
  syncTargetShield(){}
  async timeline(){plans.push(this.mercenaryFx.plan);}
 }
 const engine=new (withMercenaryBattle(Base))();
 // Exercise actual playback/FX planning with in-memory textures, no browser I/O.
 engine.sequenceFor=async id=>{loads.push(id);return {frames:Array(16).fill(Texture.EMPTY)};};
 const event={actorId:actor.id,targetId:target.id,skillId:'MS-042',skillName:'현행범 체포',mechanic:'REPEAT_OFFENDER_RESTRAINT',skillPhaseIndex:0};
 return {engine,actor,target,banners,loads,plans,event};
}
test('police status records never replay the gunshot, including old receipts with a visible corpse',async()=>{
 for(const hp of [100,0])for(const effect of ['OFFENDER_MARK','BASIC_WEAKENED','NEXT_BASIC_WEAKENED']){
  const h=playbackHarness(hp),key=h.actor.id+':MS-042';h.engine.mercenaryHitIndices.set(key,1);
  await h.engine.playMercenaryEvent({...h.event,type:'MERCENARY_DEBUFF',effect});
  if(hp>0&&effect!=='OFFENDER_MARK'){
   assert.equal(h.plans.length,1);assert.equal(h.plans[0].effectPhase,1,'preserve the binding ring, not phase-zero gunfire');
   assert.equal(h.plans[0].events[0].kind,'STATUS');assert.equal(h.plans[0].events[0].at,1.45);
  }else assert.deepEqual(h.loads,[],`${effect}/${hp}: a mark or dead target must not enter FX`);
  assert.equal(h.engine.mercenaryHitIndices.get(key),1);assert.equal(h.target.hp,hp);
  assert.equal(h.banners.length,hp>0&&effect==='OFFENDER_MARK'?1:0);
  assert.equal(h.engine.effectLayer.children.length,0);assert.equal(h.engine.simpleTimelines.size,0);
 }
});
test('the actual police HIT still enters the firing path exactly once, not its later status',async()=>{
 const h=playbackHarness();await h.engine.playMercenaryEvent({...h.event,type:'MERCENARY_HIT',damage:2400,targetHpAfter:70});
 assert.deepEqual(h.loads,['MS-042']);await h.engine.playMercenaryEvent({...h.event,type:'MERCENARY_DEBUFF',effect:'OFFENDER_MARK'});
 assert.deepEqual(h.loads,['MS-042']);assert.equal(h.target.hp,70);assert.equal(h.plans[0].effectPhase,0);assert.equal(h.plans[0].events[0].kind,'HIT');
});
test('a restraint target lost during asset loading cannot start the delayed binding effect',async()=>{
 const h=playbackHarness(),load=h.engine.sequenceFor;
 h.engine.sequenceFor=async id=>{const sequence=await load(id);h.target.hp=0;return sequence;};
 await h.engine.playMercenaryEvent({...h.event,type:'MERCENARY_DEBUFF',effect:'BASIC_WEAKENED'});
 assert.deepEqual(h.plans,[]);assert.equal(h.target.hp,0);assert.equal(h.engine.effectLayer.children.length,0);
});
test('canonical five-card PVE/PVP timelines never add police status after lethal HP state',()=>{
 let lethal=0,statuses=0;
 for(const power of [1000000,20000000,100000000])for(const side of ['A','B'])for(const seed of [7919,15838,55433]){
  const pvp=createPvpBattleV2({attackerCards:tierCards(power),defenderCards:tierCards(power),[side==='A'?'attackerMercenary':'defenderMercenary']:police,seed});
  const pve=createPveBattleV2({cards:tierCards(power),mercenary:police,monster:{id:1,name:'검수 몬스터',battle_power:power*5},seed});
  for(const battle of [pvp,pve]){
   const hp=new Map();
   for(const e of battle.result.timeline){
    if(Number.isFinite(e.targetHpAfter))hp.set(e.targetId,e.targetHpAfter);
    if(e.type==='REVIVE')hp.set(e.targetId,e.hpAfter??e.targetHpAfter??1);
    if(e.skillId!=='MS-042')continue;
    if(e.type==='MERCENARY_HIT'&&e.targetHpAfter===0)lethal++;
    if(e.type==='MERCENARY_DEBUFF'){statuses++;assert.ok(hp.get(e.targetId)>0,`${e.effect}: ${e.targetId} has no HP`);}
   }
   assert.equal(battle.teams.A.cards.length,5);
  }
 }
 assert.ok(lethal>0,'fixture must include actual lethal police shots');assert.ok(statuses>0,'fixture must include surviving targets too');
});
