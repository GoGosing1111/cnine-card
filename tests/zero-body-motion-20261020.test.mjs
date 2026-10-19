import test from 'node:test';
import assert from 'node:assert/strict';
import {MODES,sample} from '../preview/mercenary-cyan-knight-battle-20261020-v1/motion.mjs';
import {bodyTime,sampleBody,BODY_PLAYBACK_RATE,EFFECT_PLAYBACK_RATE} from '../preview/mercenary-cyan-knight-battle-20261020-v1/source/BodyMotion.mjs';
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('Zero swings and recovers at 2x while original hit beats and skill duration stay fixed',()=>{
 assert.equal(BODY_PLAYBACK_RATE,2);assert.equal(EFFECT_PLAYBACK_RATE,1);
 for(const [mode,duration,contacts]of [
  ['horizon',1.65,[.55]],['flurry',2.6,[.46,.78,1.1,1.42,1.72]],
  ['meteor',2.7,[.64]],['zenith',4,[.72,1.48,2.65]]
 ]){
  assert.equal(MODES[mode].duration,duration);assert.deepEqual(MODES[mode].contacts,contacts);
  for(const hit of contacts){
   near(bodyTime(mode,hit),hit);
   near(bodyTime(mode,hit)-bodyTime(mode,hit-.02),.04);
   near(bodyTime(mode,hit+.02)-bodyTime(mode,hit),.04);
   assert.deepEqual(sampleBody(mode,hit).pose,sample(mode,hit).pose);
  }
  const finish=contacts.at(-1)+(duration-contacts.at(-1))/2;
  assert.equal(sampleBody(mode,finish+.001).pose.bank,'idle');
  let previous=-1;
  for(let t=0;t<=duration;t+=.005){const current=bodyTime(mode,t);assert(current>=previous&&current<=duration);previous=current;}
 }
 assert.equal(MODES.array.duration,4.55);
 for(const at of [.35,.9,3.05,3.6]){near(bodyTime('array',at),at);near(bodyTime('array',at)-bodyTime('array',at-.02),.04);}
});

test('idle keeps one upright pose; hit, dash and defeat retain their authored motion',()=>{
 for(let t=0;t<20;t+=.1){const s=sampleBody('idle',t);assert.equal(s.pose.bank,'idle');assert.equal(s.pose.index,0);assert.equal(s.pose.facing,1);assert.equal(s.lift,0);}
 for(const mode of ['hit','dash','defeat'])for(let t=0;t<MODES[mode].duration;t+=.05)assert.deepEqual(sampleBody(mode,t),sample(mode,t));
});

test('original effect frames and projectile flights continue after accelerated body recovery',()=>{
 assert.equal(sampleBody('meteor',1.7).pose.bank,'idle');
 const dragon=sample('meteor',1.7).effects.find(f=>f.key==='dragon-v3');
 assert(dragon);assert.equal(dragon.frame,11);near(dragon.progress,(1.7-.43)/(1.8-.43));
 assert.equal(sample('meteor',2.7).done,true);
 const burst=sample('horizon',.75).effects.find(f=>f.key==='burst-v3');
 assert.equal(burst.frame,6);near(burst.progress,(.75-.53)/(.91-.53));
 assert.equal(sample('array',3.6).effects.find(f=>f.key==='burst-v3').frame,0);
 assert(sample('array',1.8).phantoms.some(p=>p.alpha>0));
});
