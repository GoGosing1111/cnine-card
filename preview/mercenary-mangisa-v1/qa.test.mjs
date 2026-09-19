import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {MANGISA_SKILL,compileMangisaPreview,sampleMangisaPreview,mangisaPoseAt} from './skill.mjs';
const root=new URL('./',import.meta.url),project=new URL('../../',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
test('six shots share one cast cost and a bounded SS damage budget',()=>{
 for(const mode of ['PVE','PVP'])for(const targetCount of [1,2,3]){
  const plan=compileMangisaPreview({mode,targetCount}),scale=mode==='PVP'?.82:1;
  assert.equal(plan.events.filter(e=>e.kind==='CAST').length,1);assert.equal(plan.events[0].cost,25);
  assert.equal(plan.events.filter(e=>e.kind==='SHOT').length,6);assert.equal(plan.events.filter(e=>e.kind==='HIT').length,6);
  assert.equal(plan.events.filter(e=>e.kind==='SPLASH').length,targetCount-1);
  assert.ok(Math.abs(plan.budget-(3.2+.4*(targetCount-1))*scale)<1e-6);
  assert.ok(plan.budget<=MANGISA_SKILL.balance.totalRatioCap*scale+1e-6);
  assert.equal(plan.events.filter(e=>e.kind==='SPLASH').every(e=>e.at===1.305),true);
 }
});
test('interruption and target loss discard remaining damage without retargeting or refunds',()=>{
 for(const key of ['cancelAt','targetLostAt']){
  const plan=compileMangisaPreview({[key]:.82});assert.equal(plan.events.filter(e=>e.kind==='HIT').length,3);
  assert.equal(plan.events.filter(e=>e.kind==='SPLASH').length,0);assert.equal(plan.events.filter(e=>e.kind==='CAST').length,1);
  assert.equal(sampleMangisaPreview(plan,1.31).cancelled,true);
 }
});
test('seeking backward recomputes a stable offline sample, not cumulative damage',()=>{
 const plan=compileMangisaPreview();const end=sampleMangisaPreview(plan,2.4);sampleMangisaPreview(plan,.1);
 assert.deepEqual(sampleMangisaPreview(plan,2.4),end);assert.equal(sampleMangisaPreview(plan,.1).damage.E1,0);
 assert.equal(mangisaPoseAt(1.25),4);assert.equal(mangisaPoseAt(2.5),0);
});
test('approved name, SS rank, immutable source, separate alpha SD and disabled runtime',async()=>{
 assert.equal(manifest.name,'망이사');assert.equal(manifest.rank,'SS');assert.equal(manifest.sourceArtStatus,'APPROVED_SOURCE_ART');assert.equal(manifest.runtimeEnabled,false);
 assert.notEqual(manifest.sourceArt,manifest.battleSprite);
 for(const [file,expected]of [[manifest.sourceArt,manifest.sourceArtInfo.sha256],[manifest.battleSprite,manifest.battleSpriteInfo.sha256]]){
  const bytes=await fs.readFile(new URL(file,project));assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(),expected);
 }
 const m=await sharp(await fs.readFile(new URL(manifest.battleSprite,project))).metadata();assert.equal(m.hasAlpha,true);
 assert.equal(m.width,1024);assert.equal(m.height,1536);assert.equal(manifest.battleSpriteInfo.borderPixels,0);
 assert.ok(manifest.battleSpriteInfo.transparentFraction>.6);assert.ok(manifest.battleSpriteInfo.opaqueFraction>.2);
});
test('six distinct poses and sixteen actual RGBA impact frames with safe atlas padding',async()=>{
 for(const spec of [manifest.motion,manifest.impact]){
  assert.equal(new Set(spec.frames.map(f=>f.sha256)).size,spec.frameCount);
  const m=await sharp(await fs.readFile(new URL(spec.atlas,root))).metadata();assert.equal(m.width,spec.cellSize*spec.columns);assert.equal(m.height,spec.cellSize*spec.rows);assert.equal(m.hasAlpha,true);
  for(const frame of spec.frames){const {data,info}=await sharp(await fs.readFile(new URL(frame.file,root))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   for(let x=0;x<info.width;x++){assert.equal(data[x*4+3],0);assert.equal(data[((info.height-1)*info.width+x)*4+3],0);}
   for(let y=0;y<info.height;y++){assert.equal(data[(y*info.width)*4+3],0);assert.equal(data[(y*info.width+info.width-1)*4+3],0);}
  }
 }
});
