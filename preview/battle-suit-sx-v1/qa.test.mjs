import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {MODES,sample} from './motion.mjs';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const m=JSON.parse(await fs.readFile(file('manifest.json')));
test('approved original and accepted connected sheets remain byte-identical',async()=>{
 assert.equal(hash(await fs.readFile(file(m.sourceArt))),'0ecc36640e457a5ef33f5d5d34dfaac4c548504375f732dea0d456609a5bb73b');
 const approval=JSON.parse(await fs.readFile(file('connected-pose-approval-20261007.json')));
 for(const a of Object.values(approval.images))assert.equal(hash(await fs.readFile(file(a.path))),a.sha256);
 assert.equal(m.runtimeEnabled,false);assert.equal(m.method,'CONNECTED_FULL_FIGURE_DRAWINGS');
});
test('32 complete drawings: correct provenance, real alpha, uniform scale, no part or color edits',async()=>{
 let count=0;const hashes=new Set();
 for(const bank of Object.values(m.motion))for(const f of bank.frames){
  const b=await fs.readFile(file(f.file));assert.equal(hash(b),f.sha256);hashes.add(f.sha256);count++;
  assert.equal(hash(await fs.readFile(file(f.source))),f.sourceSha256);assert.equal(f.partComposites,0);assert.equal(f.colorTransforms,0);assert.ok(f.uniformScale>0);
  const {data,info}=await sharp(b).raw().toBuffer({resolveWithObject:true});assert.equal(info.channels,4);assert.equal(info.width,768);assert.equal(info.height,768);
  let opaque=0,border=0;for(let y=0;y<768;y++)for(let x=0;x<768;x++){const a=data[(y*768+x)*4+3];if(a>128)opaque++;if((x<8||y<8||x>759||y>759)&&a>0)border++;}
  assert.ok(opaque>5000,f.id+' empty');assert.equal(border,0,f.id+' cropped by atlas cell');
  for(const p of [f.pivot,f.grip,f.tip,f.head])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
 }
 assert.equal(count,32);assert.equal(hashes.size,32);
});
test('all 96 separately drawn effect frames have isolated transparent gutters',async()=>{
 let count=0;for(const [key,fx]of Object.entries(m.effects)){
  assert.equal(fx.frames.length,12);assert.equal(new Set(fx.frames.map(f=>f.sha256)).size,12,key+' repeated artwork');
  const b=await fs.readFile(file(fx.url));assert.equal(hash(b),fx.sha256);
  const {data,info}=await sharp(b).raw().toBuffer({resolveWithObject:true});for(const f of fx.frames){const r=f.rect;for(let x=0;x<r.width;x++){assert.equal(data[((r.y)*info.width+r.x+x)*4+3],0);assert.equal(data[((r.y+r.height-1)*info.width+r.x+x)*4+3],0);}count++;}
 }assert.equal(count,96);
});
test('authored paths return home and only intentional jumps lift the actor',()=>{
 for(const [key,mode]of Object.entries(MODES)){
  assert.equal(mode.path[0].anchor,'home');assert.equal(mode.path.at(-1).anchor,'home');
  for(const p of mode.poses)assert.ok(m.motion[p.bank].frames[p.index]);
  for(const t of mode.contacts){const s=sample(key,t);assert.equal(s.lift,0,key+' contact airborne');assert.equal(s.done,false);}
  assert.equal(sample(key,mode.duration).effects.length,0);
 }
 for(const key of ['dash','attack','skill','ultimate'])assert.ok(MODES[key].path.some((p,i,a)=>i&&p.anchor==='home'&&a[i-1].anchor!=='home'),key+' missing return');
});
test('preview uses a single shared renderer and clock, with no live feature activation',async()=>{
 const report=JSON.parse(await fs.readFile(file('build-report.json')));assert.equal(report.pixiCopies,1);assert.equal(report.gsapCopies,1);assert.ok(report.sharedRuntime.some(x=>x.endsWith('BattleEngine.js')));
 const source=await fs.readFile(file('source/SXBodyFX.js'),'utf8');assert.ok(source.includes('s.tint=0xffffff'));assert.ok(source.includes("clock:'V3_REGISTERED_GSAP'"));assert.ok(!source.includes('setInterval'));
 const entry=await fs.readFile(file('source/preview.js'),'utf8');assert.ok(!entry.includes('/api/'));assert.equal(m.audio.enabled,false);
});
