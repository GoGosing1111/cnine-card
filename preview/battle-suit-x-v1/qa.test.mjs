import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import sharp from 'sharp';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {MODES,sample} from './motion.mjs';
const root=new URL('./',import.meta.url),file=p=>fileURLToPath(new URL(p,root)),hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await fs.readFile(file(p))),m=await read('manifest.json');
test('approved standing original unchanged and selected blade pixels copied exactly',async()=>{
 const source=await fs.readFile(file(m.sourceArt));assert.equal(hash(source),'91cdd399bb2e042b32b6fa7573c8491a913a97d456dcbb8a13dffbb5d49b8ddc');
 const blade=await fs.readFile(file(m.weapon.url));assert.equal(hash(blade),m.weapon.sha256);
 const a=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(blade).ensureAlpha().raw().toBuffer({resolveWithObject:true});let compared=0;
 for(let y=0;y<b.info.height;y++)for(let x=0;x<b.info.width;x++){const p=(y*b.info.width+x)*4;if(!b.data[p+3])continue;const q=((y+m.weapon.rect.top)*a.info.width+x+m.weapon.rect.left)*4;assert.deepEqual(b.data.subarray(p,p+4),a.data.subarray(q,q+4));compared++;}
 assert.ok(compared>25000);assert.equal(compared,m.weapon.copiedPixels);
});
test('all 24 posed composites lock to the same blade with uniform scaling and have clear borders',async()=>{
 const hashes=new Set();for(const spec of Object.values(m.motion)){assert.equal(spec.frames.length,8);for(const f of spec.frames){
  assert.equal(f.weapon.sourceSha256,m.weapon.sha256);assert.equal(f.weapon.redrawnPixels,0);assert.equal(f.weapon.uniformScale,600/1317*.6);
  const bytes=await fs.readFile(file(f.file));assert.equal(hash(bytes),f.sha256);hashes.add(f.sha256);const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let x=0;x<info.width;x++){assert.equal(data[x*4+3],0);assert.equal(data[((info.height-1)*info.width+x)*4+3],0);}
  for(let y=0;y<info.height;y++){assert.equal(data[y*info.width*4+3],0);assert.equal(data[(y*info.width+info.width-1)*4+3],0);}
 }}assert.equal(hashes.size,24);
});
test('40 independently drawn effect cells, RGBA assets, no repeated whole-image clones',async()=>{
 for(const spec of Object.values(m.effects)){const bytes=await fs.readFile(file(spec.url)),meta=await sharp(bytes).metadata();assert.ok(meta.hasAlpha);const hashes=new Set();for(const f of spec.frames){const r=f.rect;hashes.add(hash(await sharp(bytes).extract({left:r.x,top:r.y,width:r.width,height:r.height}).raw().toBuffer()));}assert.equal(hashes.size,spec.frames.length);}
 assert.equal(Object.values(m.effects).reduce((n,s)=>n+s.frames.length,0),40);
});
test('authored contact frames and effect cleanup are sampled by one clock',()=>{
 assert.equal(sample('attack',MODES.attack.contact).frame,3);assert.equal(sample('skill',MODES.skill.contact).frame,5);
 for(const [key,s]of Object.entries(MODES)){assert.equal(sample(key,0).effects.length,0);assert.equal(sample(key,s.duration).effects.length,0);for(const at of s.steps){assert.ok(sample(key,at).frame>=0);}}
});
test('review remains isolated and imports one shared runtime',async()=>{
 assert.equal(m.runtimeEnabled,false);const report=await read('build-report.json');assert.equal(report.pixiCopies,1);assert.equal(report.gsapCopies,1);
 const code=await fs.readFile(file('source/preview.js'),'utf8');assert.ok(code.includes('/preview/z-body-live-v1/fixture.json'));assert.doesNotMatch(code,/fetch\(['"]\/api\//);
});
