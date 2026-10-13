import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import sharp from 'sharp';import {createHash} from 'node:crypto';import {makePlan,sample,MODES} from './skill.mjs';
const read=p=>fs.readFile(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase(),m=JSON.parse(await read('manifest.json'));
test('approved source and every selected bow pixel preserved; rank confirmed, runtime remains separate',async()=>{
 assert.equal(m.rank,'SSS');assert.equal(m.name,null);assert.equal(m.code,null);assert.equal(m.runtimeEnabled,false);
 const original=await read('assets/sources/source-art-approved.png');assert.equal(hash(original),m.sourceArtSha256);
 const source=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true}),weapon=await sharp(await read('assets/locked/approved-bow.png')).raw().toBuffer({resolveWithObject:true});let count=0;const b=m.weapon.bounds;
 for(let y=0;y<weapon.info.height;y++)for(let x=0;x<weapon.info.width;x++){const i=(y*weapon.info.width+x)*4,j=((y+b.top)*source.info.width+x+b.left)*4;if(weapon.data[i+3]){assert.deepEqual(weapon.data.subarray(i,i+4),source.data.subarray(j,j+4));count++;}}assert.equal(count,m.weapon.copiedPixels);
});
test('authored motion/effects have exact hashes and real alpha, all poses retain same rigid bow scale',async()=>{
 const hashes=new Set();let motion=0,effects=0;
 for(const kind of ['motion','effects'])for(const spec of Object.values(m[kind])){
  assert.equal(hash(await read(spec.atlas)),spec.sha256);assert.equal(spec.frames.length,spec.frameCount);
  if(spec.derivedFrom)continue;
  for(const f of spec.frames){const bytes=await read(f.file);assert.equal(hash(bytes),f.sha256);assert.ok(!hashes.has(f.sha256));hashes.add(f.sha256);const meta=await sharp(bytes).metadata();assert.equal(meta.channels,4);
   if(kind==='motion'){motion++;assert.equal(f.weapon.redrawnPixels,0);assert.equal(f.weapon.sha256,m.weapon.sha256);assert.equal(f.weapon.uniformScale,.279);assert.equal(f.bodyPixels,360);for(const p of [f.grip,f.hand,f.tip,f.upperTip,f.lowerTip])assert.ok(p.x>0&&p.y>0&&p.x<768&&p.y<768);}
   else effects++;
  }
 }assert.equal(motion,24);assert.equal(effects,72);assert.deepEqual(m.effects.aura.sources.map(s=>s.path),[1,2,3].map(n=>`assets/sources/aura-red-${n}.png`));
});
test('complementary aura layers preserve the authored alpha and cannot double-count feathers',async()=>{
 const full=await sharp(await read(m.effects.aura.atlas)).raw().toBuffer(),rear=await sharp(await read(m.effects['aura-rear'].atlas)).raw().toBuffer(),front=await sharp(await read(m.effects['aura-front'].atlas)).raw().toBuffer();assert.equal(full.length,rear.length);assert.equal(full.length,front.length);
 for(let i=3;i<full.length;i+=4){assert.equal(rear[i]+front[i],full[i]);assert.ok(!rear[i]||!front[i]);}
});
test('cancel and target loss stop contacts and restore formation; authored phases reference valid poses',()=>{
 for(const mode of Object.keys(MODES)){
  for(const key of ['cancelAt','targetLostAt']){const p=makePlan({mode,[key]:.2}),s=sample(p,1);assert.equal(s.cancelled,true);assert.deepEqual(s.contacts,[]);assert.equal(s.travel,0);assert.equal(s.pose.key,'idle');}
  const p=makePlan({mode});for(let i=0;i<=100;i++){const s=sample(p,p.duration*i/100);assert.ok(m.motion[s.pose.key].frames[s.pose.frame]);if(mode!=='dash')assert.equal(s.jump,0);}
  const end=sample(p,p.duration);assert.equal(end.done,true);assert.equal(end.travel,0);assert.equal(end.pose.key,mode==='defeat'?'defeat':'idle');
 }
});
