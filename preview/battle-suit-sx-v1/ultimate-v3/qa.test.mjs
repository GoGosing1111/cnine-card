import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {MODES} from '../motion.mjs';
import {DURATION,STRIKE,POSES,sampleUltimate,areaHits} from './motion.mjs';
const read=p=>fs.readFile(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const approved=JSON.parse(await read('../approval-aura-dash-skill-20261007.json')),manifest=JSON.parse(await read('manifest.json')),base=JSON.parse(await read('../manifest.json'));
test('every approved asset and original renderer/choreography baseline remain byte-identical',async()=>{
 const visit=async value=>{
  if(!value||typeof value!=='object')return;
  if(value.path&&value.sha256)assert.equal(hash(await read('../'+value.path)),value.sha256,value.path);
  for(const child of Object.values(value))await visit(child);
 };
 await visit(approved);
 for(const key of ['idle','dash','skill'])assert.deepEqual(MODES[key],approved.approved[key].timeline);
 assert.equal(manifest.runtimeEnabled,false);assert.equal(base.runtimeEnabled,false);
});
test('the colossal blade has native alpha and a single rigid straight axis; effect frames have isolated gutters',async()=>{
 const bytes=await read(manifest.blade.url),m=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();
 assert.equal(hash(bytes),manifest.blade.sha256);assert.equal(m.hasAlpha,true);assert.equal(stats.channels[3].min,0);
 assert.equal(manifest.blade.tip.x,manifest.blade.pommel.x);
 let count=0;
 for(const bank of Object.values(manifest.effects)){
  assert.equal(hash(await read(bank.sourceUrl)),bank.sourceSha256);
  const bytes=await read(bank.url);assert.equal(hash(bytes),bank.sha256);
  const {data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
  for(const frame of bank.frames){
   const r=frame.rect;
   for(let x=0;x<512;x++)for(const y of [0,511])assert.equal(data[((r.y+y)*info.width+r.x+x)*4+3],0);
   assert.ok(frame.origin.x>0&&frame.origin.x<512&&frame.origin.y>0&&frame.origin.y<512);count++;
  }
 }
 assert.equal(count,24);
});
test('ground strike accelerates, holds at the ground, reaches scattered enemies and fully resolves',()=>{
 let previous=Infinity;
 for(let i=0;i<=30;i++){const s=sampleUltimate(1.72+i*.01);assert.ok(s.blade.tipHeight<=previous+1e-8);previous=s.blade.tipHeight;}
 assert.equal(sampleUltimate(STRIKE).blade.tipHeight,-.07);
 assert.equal(sampleUltimate(STRIKE+.14).blade.tipHeight,-.07);
 const points=[{x:-120,y:-40},{x:130,y:-100},{x:20,y:250},{x:0,y:0},{x:-90,y:200}],hits=areaHits(points,{x:0,y:0},100);
 assert.equal(hits.length,5);assert.ok(hits.every(h=>h.at>STRIKE&&h.at<STRIKE+.30));
 for(const a of hits)for(const b of hits)if(a.distance<b.distance)assert.ok(a.at<=b.at);
 assert.equal(sampleUltimate(DURATION).done,true);assert.equal(sampleUltimate(DURATION).blade.visible,false);
 for(const p of POSES){const frame=base.motion[p.bank].frames[p.index];assert.equal(frame.partComposites,0);assert.equal(frame.colorTransforms,0);}
});
