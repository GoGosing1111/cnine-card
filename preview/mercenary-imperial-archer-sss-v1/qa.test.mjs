import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import sharp from 'sharp';import {createHash} from 'node:crypto';import {makePlan,sample,MODES} from './skill.mjs';
import {sampleAura,AURA_REGISTRATION} from './aura-loop.mjs';
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
test('soft depth split preserves the authored alpha and RGB with no hard straight edge',async()=>{
 const full=await sharp(await read(m.effects.aura.atlas)).raw().toBuffer(),rear=await sharp(await read(m.effects['aura-rear'].atlas)).raw().toBuffer(),front=await sharp(await read(m.effects['aura-front'].atlas)).raw().toBuffer();assert.equal(full.length,rear.length);assert.equal(full.length,front.length);
 let feathered=0;for(let i=3;i<full.length;i+=4){assert.equal(rear[i]+front[i],full[i]);if(rear[i]&&front[i])feathered++;if(full[i])for(let c=1;c<=3;c++){assert.equal(rear[i-c],full[i-c]);assert.equal(front[i-c],full[i-c]);}}assert.ok(feathered>0);
});
test('idle keeps one body pose and a continuous, registered eight-second wingbeat',()=>{
 const p=makePlan({mode:'aura'}),r=m.auraPlayback;assert.equal(p.duration,AURA_REGISTRATION.periodSeconds);assert.equal(p.duration,8);assert.equal(r.bodyIdleFrame,0);
 const weights=t=>{const s=sampleAura(t),out=Array(4).fill(0);out[s.from]+=1-s.weight;out[s.to]+=s.weight;return out;};
 for(let i=0;i<=800;i++){const t=i/100;assert.deepEqual(sample(p,t).pose,{key:'idle',frame:0});const a=weights(t),b=weights(t+8);assert.ok(Math.abs(a.reduce((n,w)=>n+w,0)-1)<1e-12);for(let j=0;j<4;j++)assert.ok(Math.abs(a[j]-b[j])<1e-12);for(const index of [sampleAura(t).from,sampleAura(t).to]){const f=r.sourceFrames.find(f=>f.index===index);assert.ok(f.beak.x>f.alphaBounds.left&&f.beak.x<f.alphaBounds.right);assert.ok(f.beak.y>f.alphaBounds.top&&f.beak.y<f.alphaBounds.bottom);}}
 for(const t of [0,8/6,16/6,4,32/6,40/6,8]){const a=weights(t-.001),b=weights(t+.001);for(let j=0;j<4;j++)assert.ok(Math.abs(a[j]-b[j])<.000004,'loop/keyframe seam');}
 assert.deepEqual(sampleAura(4,true),sampleAura(0,true));
});
test('cancel and target loss stop contacts and restore formation; authored phases reference valid poses',()=>{
 for(const mode of Object.keys(MODES)){
  for(const key of ['cancelAt','targetLostAt']){const p=makePlan({mode,[key]:.2}),s=sample(p,1);assert.equal(s.cancelled,true);assert.deepEqual(s.contacts,[]);assert.equal(s.travel,0);assert.equal(s.pose.key,'idle');}
  const p=makePlan({mode});for(let i=0;i<=100;i++){const s=sample(p,p.duration*i/100);assert.ok(m.motion[s.pose.key].frames[s.pose.frame]);if(mode!=='dash')assert.equal(s.jump,0);}
  const end=sample(p,p.duration);assert.equal(end.done,true);assert.equal(end.travel,0);assert.equal(end.pose.key,mode==='defeat'?'defeat':'idle');
 }
});
