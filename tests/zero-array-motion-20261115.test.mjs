import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {MODES,sample} from '../preview/mercenary-cyan-knight-battle-20261020-v1/motion.mjs';
import {sampleBody} from '../preview/mercenary-cyan-knight-battle-20261020-v1/source/BodyMotion.mjs';
const base=new URL('../',import.meta.url);
const relative='preview/mercenary-cyan-knight-battle-20261020-v1/motion.mjs';
const original=execFileSync('git',['show','b23551f07:'+relative],{cwd:fileURLToPath(base),encoding:'utf8'}).replace("'./array-motion-v4.mjs'",JSON.stringify(new URL('preview/mercenary-cyan-knight-battle-20261020-v1/array-motion-v4.mjs',base).href));
const previous=await import('data:text/javascript;base64,'+Buffer.from(original).toString('base64'));

test('the conductor sequence is replaced by one release, a stable sword guard and one final cut',()=>{
 assert(MODES.array.poses.every(p=>p.bank!=='array'||p.index===0),'no open-palm conducting drawings');
 for(let i=0;i<241;i++)assert.deepEqual(sampleBody('array',.5+i/100).pose,{at:.52,bank:'horizon',index:6,facing:1});
 assert.equal(sampleBody('array',3.6).pose.index,4);
 assert.equal(sampleBody('array',3.6).pose.bank,'horizon');
 assert.equal(sampleBody('array',4.55).pose.bank,'idle');
 assert.equal(MODES.array.contacts.length,20);assert.equal(MODES.array.contacts.at(-1),3.6);
});

test('all sword routes, visual impacts, effect frames and damage contact timings remain unchanged',()=>{
 assert.deepEqual(MODES.array.contacts,previous.MODES.array.contacts);assert.equal(MODES.array.duration,previous.MODES.array.duration);
 for(let i=0;i<=Math.ceil(MODES.array.duration*240);i++){
  const t=Math.min(i/240,MODES.array.duration),a=sample('array',t),b=previous.sample('array',t);
  for(const key of ['effects','impact','phantoms','contactCount','ghosts','done'])assert.deepEqual(a[key],b[key],`${t} ${key}`);
 }
});

test('the other eight actions are untouched',()=>{
 for(const [mode,spec]of Object.entries(MODES))if(mode!=='array'){
  assert.deepEqual(spec,previous.MODES[mode]);
  for(let i=0;i<=Math.ceil(spec.duration*60);i++)assert.deepEqual(sample(mode,i/60),previous.sample(mode,i/60));
 }
});
