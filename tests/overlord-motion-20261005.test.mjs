import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {gsap} from 'gsap';
import {OVERLORD_MOTION_SPEED,overlordAreaMotionTime,overlordAreaMotionEnd} from '../preview/project-v-v3/source/battle/OverlordSuitModel.mjs';
import {MODES} from '../preview/battle-suit-crimson-gold-knight-20261005-v1/motion.mjs';
import {OVERLORD_AREA_SKILL} from '../shared/overlord-suit-v1.mjs';
import {BattleSuitSkillChipPlayback} from '../preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
after(()=>gsap.ticker.sleep());
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

test('faster anticipation and recovery preserve every authoritative tiger contact',()=>{
 const contacts=OVERLORD_AREA_SKILL.impactOffsetsMs.map(ms=>ms/1000);
 assert.ok(OVERLORD_MOTION_SPEED>=3&&OVERLORD_MOTION_SPEED<=4);
 contacts.forEach((at,i)=>close(overlordAreaMotionTime(at,contacts),MODES.aoe.contacts[i]));
 close(overlordAreaMotionTime(contacts[0]-.1,contacts),MODES.aoe.contacts[0]-.35);
 close(overlordAreaMotionTime(contacts.at(-1)+.1,contacts),MODES.aoe.contacts.at(-1)+.35);
 close(overlordAreaMotionTime(overlordAreaMotionEnd(contacts),contacts),MODES.aoe.duration);
 assert.ok(overlordAreaMotionEnd(contacts)<MODES.aoe.duration);
 assert.equal(OVERLORD_AREA_SKILL.intervalMs,18000);assert.equal(OVERLORD_AREA_SKILL.damageMultiplier,6);
});

test('delayed and same-frame contact receipts keep motion monotonic and aligned',()=>{
 const contacts=[4.1,4.1,4.4,4.9,5.2];
 close(overlordAreaMotionTime(4.1,contacts),MODES.aoe.contacts[1]);
 let previous=0;
 for(let t=0;t<7;t+=.005){const pose=overlordAreaMotionTime(t,contacts);assert.ok(pose>=previous);previous=pose;}
 for(let i=1;i<contacts.length;i++)close(overlordAreaMotionTime(contacts[i],contacts),MODES.aoe.contacts[i]);
 close(overlordAreaMotionTime(overlordAreaMotionEnd(contacts),contacts),MODES.aoe.duration);
});

test('shorter presentation may finish only after all receipts; other skill lifetimes stay unchanged',()=>{
 for(const shortened of [false,true]){
  const engine={playbackEpoch:1,visible:true},playback=new BattleSuitSkillChipPlayback(engine,[]);
  let destroyed=0;const hit={hitIndex:0};
  const fx={clock:{},render(){},sequence:{life:.2},destroy(){destroyed++;},...(shortened?{effectDurationSeconds:3.35}:{})};
  playback.fx.set('cast',{fx,at:0,chip:{effectDurationMs:5350},impacts:new Map([[0,2.55]]),started:true});
  playback.castHits.set('cast',[hit]);playback.clock.time=3.4;playback.render();assert.equal(destroyed,0,'pending damage receipt must keep the effect alive');
  playback.finishedEvents.add(hit);playback.render();assert.equal(destroyed,shortened?1:0);
  playback.clock.time=5.4;playback.render();assert.equal(destroyed,1);
 }
});
