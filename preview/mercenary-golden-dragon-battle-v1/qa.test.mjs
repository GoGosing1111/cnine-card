import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import sharp from 'sharp';import {MODES,makePlan,sample} from './skill.mjs';
const root=new URL('.',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
test('all sequences seek deterministically within generated frames and cancellation discards future impacts',()=>{
 for(const mode of Object.keys(MODES)){
  const p=makePlan({mode});
  for(let i=0;i<=500;i++){const t=p.duration*i/500,s=sample(p,t);assert.deepEqual(s,sample(p,t));assert.ok(s.pose.frame>=0&&s.pose.frame<manifest.motion[s.pose.key].frameCount,mode);for(const f of s.effects)assert.ok(f.frame>=0&&f.frame<12);assert.equal('damage' in s,false);}
  for(const stopKey of ['cancelAt','targetLostAt']){const stopped=makePlan({mode,[stopKey]:.32}),s=sample(stopped,.32);assert.equal(s.cancelled,true);assert.equal(s.effects.length,0);assert.equal(s.impacts.length,0);assert.equal(s.travel,0);assert.equal(s.flash,0);assert.ok(stopped.contacts.every(t=>t<.32));assert.ok(stopped.audioCues.every(c=>c[1]<.32));}
 }
 assert.throws(()=>makePlan({mode:'unknown'}));assert.throws(()=>makePlan({cancelAt:NaN}));
});
test('drawn contact poses and authored VFX peaks agree',()=>{
 let s=sample(makePlan({mode:'attack'}),.79);assert.deepEqual(s.pose,{key:'slash',frame:3});assert.equal(s.effects.find(f=>f.key==='blade').frame,4);
 s=sample(makePlan({mode:'skill'}),1.5);assert.equal(s.pose.key,'cast');assert.equal(s.effects.find(f=>f.key==='dragon').frame,5);
 s=sample(makePlan({mode:'ultimate'}),2.08);assert.equal(s.pose.key,'ultimate');assert.equal(s.pose.frame,3);assert.equal(s.effects.find(f=>f.key==='eruption').frame,4);
});
test('124 active frames are native-alpha derivatives with distinct real frame pixels and immutable source art',async()=>{
 let total=0;
 for(const kind of ['motion','effects'])for(const spec of Object.values(manifest[kind])){
  const b=await fs.readFile(new URL(spec.atlas,root)),m=await sharp(b).metadata();assert.equal(m.hasAlpha,true);assert.equal(m.width,spec.cellSize*spec.columns);assert.equal(m.height,spec.cellSize*spec.rows);assert.equal(createHash('sha256').update(b).digest('hex').toUpperCase(),spec.sha256);
  assert.equal(new Set(spec.frames.map(f=>f.sha256)).size,spec.frameCount);total+=spec.frameCount;
  for(const f of spec.frames){const p=await fs.readFile(new URL(f.file,root));assert.equal(createHash('sha256').update(p).digest('hex').toUpperCase(),f.sha256);}
 }
 assert.equal(total,124);assert.equal(manifest.runtimeEnabled,true);assert.equal(manifest.sourceArtSha256,'263725DD2B2B568CF5091B864BEA537161F6D7A4D3123DB0E9A2A0D040CFF21B');assert.notEqual(manifest.battleSprite,manifest.sourceArt);
});
