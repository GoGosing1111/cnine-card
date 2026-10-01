import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import * as current from './skill.mjs';
const root=new URL('./',import.meta.url),prefix='preview/mercenary-crimson-silver-knight-battle-v1/';
const baseline='5cdb7ec614f509d3b15d617941420695f31eb9d2';
const read=file=>execFileSync('git',['show',`${baseline}:${prefix}${file}`],{encoding:'utf8'});
const previousCode=read('skill.mjs').replace('./motion-counts-v10.mjs',new URL('motion-counts-v10.mjs',root).href);
const previous=await import('data:text/javascript;base64,'+Buffer.from(previousCode).toString('base64'));
const priorManifest=JSON.parse(read('manifest.json')),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
for(const key of ['motion','effects','weapon','displaySizing','battleSprite','sizeCalibration'])assert.deepEqual(manifest[key],priorManifest[key],key+' must retain the delivered preview resources');
assert.equal(manifest.playbackTempo.rate,priorManifest.playbackTempo.rate);
const withoutPose=({pose,events,label,...state})=>state;
let samples=0,changedPoses=0;
for(const mode of Object.keys(current.MODES)){
 const next=current.makePlan({mode}),old=previous.makePlan({mode});
 for(const key of ['duration','contacts','audioCues'])assert.deepEqual(next[key],old[key],mode+' '+key);
 for(let t=0;t<=next.duration;t+=.005){
  const a=current.sample(next,t),b=previous.sample(old,t);
  assert.deepEqual(withoutPose(a),withoutPose(b),mode+' effects / position / clock at '+t);samples++;
  if(JSON.stringify(a.pose)!==JSON.stringify(b.pose)){
   assert.ok(current.OVERHEAD_MODES.includes(mode)&&t>=1.84&&t<2.20,'only the sword swing may change');changedPoses++;
  }
 }
}
assert.ok(changedPoses>0);
const report={passed:true,baseline,globalRateUnchanged:manifest.playbackTempo.rate,samplesCompared:samples,changedSwingSamples:changedPoses,skillDurationsAndAudioCuesUnchanged:true,effectSamplesUnchanged:true,resourceDefinitionsUnchanged:true};
await fs.mkdir(new URL('qa/v15/',root),{recursive:true});await fs.writeFile(new URL('qa/v15/isolation-report.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
