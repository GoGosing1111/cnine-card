import test from 'node:test';import assert from 'node:assert/strict';
import {playLimitedBasic,playLimitedSkill,VALTER_ATTACK_PLAYBACK_RATE} from '../preview/project-v-v3/source/battle/LimitedMercenaryPlayback.js';
import {makePlan,OVERHEAD} from '../preview/mercenary-crimson-silver-knight-battle-v1/skill.mjs';
import {VALTER_AREA_EVENT} from '../shared/mercenary-valter-v1.mjs';
function fixture(code='V-996',{cancel=false}={}){
 const actor={cardId:code,id:'A:M',root:{},hp:100,animationController:{kill(){}}},target={id:'B:1',root:{},view:{x:0},fullBodySprite:{tint:0xffffff}};
 let impacts=0,knightCancels=0;
 const state={actor,knight:code==='V-996'?{captureFormation(){},cancel(){knightCancels++;}}:null,sprites:[],ambient:null};
 const engine={mercenaryEpoch:1,playbackEpoch:1,visible:true,limitedStates:new Map([[actor,state]]),isAlive:()=>true,
  combatantById:id=>id===actor.id?actor:target,syncTargetHp:(t,v)=>t.hp=v,syncTargetShield:(t,v)=>t.shield=v,eventHpPercent:(_t,v)=>v,
  showAccountBattleUnitDamage(){impacts++;},queueBanner(){},async timeline(build,cleanup,fixedSpeed,options){
   const to=[],calls=[];build({to:(clock,vars)=>to.push({clock,vars}),call:(fn,_args,at)=>calls.push({fn,at})});
   this.record={to,calls,fixedSpeed,options};if(cancel)this.playbackEpoch++;for(const call of calls){call.fn();call.fn();}
   state.stopped=true;cleanup();return !cancel;
  }};
 return {actor,target,state,engine,impacts:()=>impacts,knightCancels:()=>knightCancels};
}
for(const basic of [true,false])test(`Valter ${basic?'basic':'skill'}: 2.5x authored clock, single synchronized impact and scaled tail`,async()=>{
 const f=fixture(),plan=makePlan({mode:basic?'attack':'skill'});
 const result=await(basic?playLimitedBasic(f.engine,{attacker:f.actor,target:f.target,damage:12,targetHp:88}):playLimitedSkill(f.engine,{actorId:f.actor.id,targetId:f.target.id,damage:12,targetHpAfter:88}));
 assert.equal(result,true);assert.equal(VALTER_ATTACK_PLAYBACK_RATE,2.5);
 const r=f.engine.record;assert.equal(r.to[0].vars.time,plan.duration);assert.equal(r.to[0].vars.duration,plan.duration/2.5);
 assert.equal(r.calls[0].at,OVERHEAD.contact/2.5);assert.equal(r.options.releaseAt,(OVERHEAD.contact+.12)/2.5);
 assert.equal(r.fixedSpeed,null,'preserve user/global playback speed instead of replacing it');
 assert.equal(f.target.hp,88);assert.equal(f.impacts(),1);assert.equal(f.knightCancels(),1);assert.equal(f.state.busy,false);
 assert.equal(f.engine.lastMercenaryPlayback.playbackRate,2.5);
});
test('other limited mercenary playback stays at 1x and cancelled Valter cannot apply damage',async()=>{
 const other=fixture('V-990');await playLimitedBasic(other.engine,{attacker:other.actor,target:other.target,damage:12});
 assert.equal(other.engine.record.to[0].vars.duration,3.6);assert.equal(other.engine.record.calls[0].at,1.68);assert.equal(other.engine.lastMercenaryPlayback.playbackRate,1);
 const f=fixture('V-996',{cancel:true});assert.equal(await playLimitedBasic(f.engine,{attacker:f.actor,target:f.target,damage:12}),false);
 assert.equal(f.impacts(),0);assert.equal(f.knightCancels(),1);assert.equal(f.state.busy,false);
});
test('PVE area replays the approved ultimate at 2.5x and applies each server receipt once',async()=>{
 for(const mode of ['PVE','PVP','cancel']){
  const f=fixture('V-996',{cancel:mode==='cancel'}),targets=Array.from({length:12},(_,i)=>({...f.target,id:'T'+i}));
  f.engine.combatantById=id=>id===f.actor.id?f.actor:targets.find(t=>t.id===id);
  const hits=targets.map((t,i)=>({targetId:t.id,targetHpAfter:i===0?100:70,targetMaxHp:100,targetShieldAfter:0,damage:i===0?0:30,dodge:i===0}));
  await playLimitedSkill(f.engine,{type:VALTER_AREA_EVENT,actorId:f.actor.id,battleMode:mode==='PVP'?'PVP':'PVE',hits:[...hits,hits[1]]});
  if(mode==='PVP'){assert.equal(f.engine.record,undefined);continue;}
  assert.equal(f.state.knight.plan.mode,'ultimate');assert.equal(f.state.knight.targets.length,12);
  assert.equal(f.engine.record.to[0].vars.duration,makePlan({mode:'ultimate'}).duration/2.5);
  assert.equal(f.engine.record.calls[0].at,OVERHEAD.contact/2.5);assert.equal(f.impacts(),mode==='PVE'?11:0);
  if(mode==='PVE'){assert.equal(targets[0].hp,100);assert.ok(targets.slice(1).every(t=>t.hp===70));}
  assert.equal(f.knightCancels(),1);assert.equal(f.state.busy,false);
 }
});
