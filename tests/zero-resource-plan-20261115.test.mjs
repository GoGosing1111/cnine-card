import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MODES,sample} from '../preview/mercenary-cyan-knight-battle-20261020-v1/motion.mjs';
import {sampleBody} from '../preview/mercenary-cyan-knight-battle-20261020-v1/source/BodyMotion.mjs';
import {planKnightAssets} from '../preview/mercenary-cyan-knight-battle-20261020-v1/source/KnightAssetPlan.mjs';
import {ZERO_AREA_SKILLS,ZERO_BASIC_FORMS} from '../shared/mercenary-zero-v1.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../preview/mercenary-cyan-knight-battle-20261020-v1/manifest.json',import.meta.url)));
const liveModes=['idle',...ZERO_BASIC_FORMS.map(s=>s.visualMode),...ZERO_AREA_SKILLS.map(s=>s.visualMode).filter(mode=>MODES[mode])];

test('every currently authored pose, trail and effect remains available at 240 samples/second',()=>{
 for(const modes of [Object.keys(MODES),liveModes]){
  const plan=planKnightAssets(manifest,modes),body=new Set(plan.motion.map(x=>x.key)),effects=new Set(plan.effects.map(x=>x.key));
  assert(effects.has('rail-v4'),'eager rope pool');
  for(const mode of modes){
   for(let i=0;i<=Math.ceil(MODES[mode].duration*240);i++){
    const t=Math.min(i/240,MODES[mode].duration),state=sample(mode,t);
    for(const ago of [0,.03,.06,.1,.14])assert(body.has(sampleBody(mode,Math.max(0,t-ago)).pose.bank),mode+' body/ghost');
    for(const effect of state.effects)assert(effects.has(effect.key),mode+' effect '+effect.key);
   }
   if(mode==='array')assert(effects.has('snap-v4'),'independent sword contact effects');
  }
 }
});

test('live load omits four unused pose banks and seven obsolete effects without mutating the authored manifest',()=>{
 const before=JSON.stringify(manifest),plan=planKnightAssets(manifest,liveModes);
 assert.equal(plan.motion.length,5);assert.equal(plan.effects.length,8);assert.equal(plan.urls.length,17);
 for(const key of ['hit','defeat','meteor','zenith'])assert(!plan.motion.some(x=>x.key===key));
 for(const key of ['horizon','flurry','meteor','array','rift','vortex-v2','flight-v3'])assert(!plan.effects.some(x=>x.key===key));
 assert.equal(JSON.stringify(manifest),before);
});

test('both preserved backdrop alternatives retain their own required resources',()=>{
 for(const backdrop of Object.values(manifest.backdropVariants)){
  const plan=planKnightAssets({...manifest,backdrop});assert(plan.urls.includes(backdrop.url));
  if(backdrop.effect)assert(plan.urls.includes(backdrop.effect.url));
 }
});

test('an unprepared new mode or missing resource fails clearly before loading',()=>{
 assert.throws(()=>planKnightAssets(manifest,['new-area']),/ZERO_RESOURCE_MODE/);
 const broken=structuredClone(manifest);delete broken.effects['snap-v4'];
 assert.throws(()=>planKnightAssets(broken,['array']),/ZERO_RESOURCE_MISSING/);
});
