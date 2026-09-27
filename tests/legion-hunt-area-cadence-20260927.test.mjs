import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {ZBodyThunderFX} from '../preview/project-v-v3/source/battle/ZBodyThunderFX.js';
import {Z_BODY_AREA_SKILL as SKILL} from '../shared/z-body-area-skill.mjs';
import {SKILL_CHIP_CLOCK} from '../shared/battle-suit-skill-chips.mjs';
after(()=>gsap.ticker.sleep());
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function setup({lethal=false}={}){
 const targets=Array.from({length:12},(_,i)=>({id:'enemy-'+i,root:new Container(),battleActive:true,hp:100})),ticks=new Set(),hits=[],fades=[],notified=[];
 let finishCard;const cardReturn=new Promise(r=>finishCard=r);
 const engine={visible:true,playbackEpoch:1,combatClockRate:1,continuousAreaPlayback:true,audio:{enabled:()=>false},
  backgroundLayer:new Container(),effectLayer:new Container(),accountBattleUnit:{swordAnimation:{unit:{stopIdle(){}},cancel(){},pose(){}}},accountBattleUnitDamageQueue:[],
  app:{ticker:{add:fn=>ticks.add(fn),remove:fn=>ticks.delete(fn)}},combatantById:id=>targets.find(t=>t.id===id),eventHpPercent:(_t,hp)=>hp,
  syncTargetHp:(t,hp)=>{t.hp=hp;},showAccountBattleUnitDamage(t){hits.push({id:t.id,time:playback.clock.time});},updateStatus(){},
  playEvents:async([e])=>{if(e.type==='TURN')await cardReturn;if(e.type==='KO'){fades.push(e.targetId);engine.combatantById(e.targetId).root.visible=false;}},
  waitForAccountBattleUnitDamageQueueDrain:async()=>true};
 engine.battleSuitSkillEffectFactories=new Map([[SKILL.code,{create:(e,event,rows)=>new ZBodyThunderFX(e,{blade:Array(12).fill(Texture.EMPTY),ground:Array(12).fill(Texture.EMPTY)},event,rows)}]]);
 const events=[{type:'SKILL_CHIP_CAST',combatAtMs:0,chipCode:SKILL.code,castId:'area',targetId:targets[0].id,targetIds:targets.map(t=>t.id)},
  ...(lethal?[{type:'TURN',combatAtMs:100,targetId:targets[0].id}]:[]),
  ...SKILL.impactOffsetsMs.slice(0,lethal?1:5).flatMap((at,index)=>targets.flatMap(t=>[
   {type:'SKILL_CHIP_HIT',combatAtMs:at,chipCode:SKILL.code,castId:'area',targetId:t.id,hitIndex:index,damage:lethal?100:10,targetHpAfter:lethal?0:100-(index+1)*10},
   ...(lethal?[{type:'KO',combatAtMs:at,targetId:t.id}]:[])])),{type:'RESULT',combatAtMs:5000}]
  .map((e,i)=>({...e,seq:i+1,combatGroup:i,combatClock:SKILL_CHIP_CLOCK}));
 if(lethal)for(let i=2;i<events.length-1;i+=2)events[i+1].combatGroup=events[i].combatGroup;
 const playback=new BattleSuitSkillChipPlayback(engine,events,{sequential:true,afterEvent:e=>notified.push(e.seq)});
 return {engine,playback,targets,hits,fades,notified,events,finishCard,ticks};
}
test('hunt five area contacts retain their authored 1080–1540ms cadence without rearming each blade',async()=>{
 const h=setup();h.playback.play();await h.playback.ready;h.playback.timeline.pause();
 try{
  for(let ms=0;ms<=4000;ms+=10){h.playback.timeline.time(ms/1000,true);h.playback.pump();await flush();}
  assert.equal(h.hits.length,60);
  for(let i=0;i<5;i++)assert.ok(Math.abs(h.hits[i*12].time-SKILL.impactOffsetsMs[i]/1000)<.021,JSON.stringify(h.hits[i*12]));
  assert.ok(h.targets.every(t=>t.hp===50));assert.equal(h.playback.fx.size,0);assert.equal(h.engine.effectLayer.children.length,0);
 }finally{h.finishCard();h.playback.cancel();}
});
test('lethal area contact starts all retirements immediately while old card return still fences respawn',async()=>{
 const h=setup({lethal:true});h.playback.play();await h.playback.ready;h.playback.timeline.pause();
 try{
  h.playback.timeline.time(.1,true);h.playback.pump();await flush();
  h.playback.timeline.time(1.08,true);h.playback.pump();await flush();
  assert.equal(h.hits.length,12);assert.equal(h.fades.length,12,'no corpse waits for an unrelated card to return');
  assert.ok(h.targets.every(t=>t.hp===0&&!t.root.visible));assert.ok(h.playback.pending.size>0);
  h.playback.timeline.time(4,true);h.playback.render();assert.equal(h.playback.fx.size,0,'retirement does not keep a dead effect alive');
  h.finishCard();await flush();assert.deepEqual(h.notified,h.events.slice(0,-1).map(e=>e.seq));
 }finally{h.finishCard();h.playback.cancel();}
});
