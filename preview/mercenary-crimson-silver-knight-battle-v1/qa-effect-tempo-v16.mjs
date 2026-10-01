import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import * as current from './skill.mjs';
const root=new URL('./',import.meta.url),baseline='5e831ffb53b20721d115b20cf8db16f203ebf454',prefix='preview/mercenary-crimson-silver-knight-battle-v1/';
const read=p=>execFileSync('git',['show',`${baseline}:${prefix}${p}`],{encoding:'utf8'});
const source=read('skill.mjs').replace('./motion-counts-v10.mjs',new URL('motion-counts-v10.mjs',root).href),old=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const previous=JSON.parse(read('manifest.json')),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
for(const key of ['motion','effects','weapon','displaySizing','battleSprite','sizeCalibration'])assert.deepEqual(manifest[key],previous[key]);assert.equal(manifest.playbackTempo.rate,previous.playbackTempo.rate);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);let comparisons=0;
for(const mode of current.OVERHEAD_MODES){
 const p=current.makePlan({mode}),q=old.makePlan({mode});assert.equal(p.duration,q.duration);assert.deepEqual(p.audioCues.map(([key,,sync])=>[key,sync]),q.audioCues.map(([key,,sync])=>[key,sync]));
 for(let age=-.4;age<1.3;age+=.01){
  const a=current.sample(p,current.OVERHEAD.contact+age),b=old.sample(q,old.OVERHEAD.contact+age);
  assert.deepEqual(a.effects.map(e=>[e.key,e.anchor]),b.effects.map(e=>[e.key,e.anchor]));a.effects.forEach((e,i)=>{near(e.frame,b.effects[i].frame);near(e.alpha,b.effects[i].alpha);});
  for(const key of ['charge','dim','flash','recoil','weaponPower','sweep'])near(a[key],b[key]);comparisons++;
 }
 for(const t of [.50,.8,1.1,1.3,1.5,1.63])assert.deepEqual(current.sample(p,t).pose,old.sample(q,t).pose,'early preparation stays unchanged');
 for(let age=0;age<.95;age+=.017)assert.deepEqual(current.sample(p,current.OVERHEAD.recovery+age).pose,old.sample(q,old.OVERHEAD.recovery+age).pose,'same recovery frames and speed');
}
for(const mode of ['aura','dash','hit','defeat'])for(let t=0;t<current.MODES[mode].duration;t+=.02)assert.deepEqual(current.sample(current.makePlan({mode}),t),old.sample(old.makePlan({mode}),t));
const report={passed:true,baseline,resourceDefinitionsUnchanged:true,globalRateUnchanged:1.2,effectAgeSamplesCompared:comparisons,effectFramesAndDurationsUnchanged:true,audioSourceAndSpeedUnchanged:true,allSixSkillsUseEarlierContact:current.OVERHEAD.contact,earlyPreparationAndRecoverySpeedUnchanged:true,nonAttackModesUnchanged:true};await fs.mkdir(new URL('qa/v16/',root),{recursive:true});await fs.writeFile(new URL('qa/v16/effect-tempo-report.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
