import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {DURATION,CONTACTS,POSES,sampleDragon} from './motion.mjs';
const root=new URL('./',import.meta.url),read=p=>fs.readFile(new URL(p,root)),json=async p=>JSON.parse(await read(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const m=await json('manifest.json');
test('all approved X V2 artifacts stay immutable',async()=>{
 const a=await json('../battle-suit-x-v1/approval-20260927.json');
 for(const artifact of a.artifacts){let b=await fs.readFile(new URL('../../'+artifact.path,root));if(artifact.hashMode==='UTF8_LF')b=Buffer.from(b.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'));assert.equal(sha(b),artifact.sha256,artifact.path);}
 assert.equal(m.weapon.sha256,a.weaponSha256);assert.equal(m.runtimeEnabled,false);assert.equal(m.status,'USER_REVIEW_PENDING');
});
test('8 new body frames keep one uniformly transformed source blade and safe alpha edges',async()=>{
 assert.equal(m.summary.bodyFrames,8);const hashes=new Set();
 for(const f of m.motion.dragon.frames){
  assert.equal(f.weapon.sourceSha256,m.weapon.sha256);assert.equal(f.weapon.redrawnPixels,0);assert.ok(Math.abs(f.weapon.uniformScale-600/1317*.6)<1e-12);
  const bytes=await read(f.file);assert.equal(sha(bytes),f.sha256);hashes.add(f.sha256);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,768);assert.equal(info.height,768);
  for(let i=0;i<768;i++)for(const p of[i,767*768+i,i*768,i*768+767])assert.equal(data[p*4+3],0,f.id+' clips its cell');
  assert.ok(f.grip.x>=0&&f.grip.x<768&&f.tip.x>=0&&f.tip.x<768);assert.ok(f.tip.y>=0&&f.tip.y<768);
 }assert.equal(hashes.size,8);
});
test('four separately authored VFX sheets contain 48 nonempty distinct frames',async()=>{
 assert.equal(m.summary.effectFrames,48);assert.equal(Object.keys(m.effects).length,4);
 for(const [key,s]of Object.entries(m.effects)){
  const bytes=await read(s.url);assert.equal(sha(bytes),s.sha256);const meta=await sharp(bytes).metadata();assert.equal(meta.hasAlpha,true);
  const seen=new Set();for(const f of s.frames){const data=await sharp(bytes).extract({left:f.rect.x,top:f.rect.y,width:f.rect.width,height:f.rect.height}).raw().toBuffer();seen.add(sha(data));assert.ok(data.some((v,i)=>i%4===3&&v>30));}assert.equal(seen.size,12,key);
 }
});
test('one clock has five ordered area contacts, authored poses and a fully cleared tail',()=>{
 assert.equal(CONTACTS.length,5);assert.ok(CONTACTS.every((t,i)=>!i||t>CONTACTS[i-1]));
 assert.equal(new Set(POSES.filter(p=>p.bank==='dragon').map(p=>p.index)).size,8);
 for(let i=0;i<5;i++)assert.equal(sampleDragon(CONTACTS[i]).contactCount,i+1);
 for(const at of[.62,1.08,1.64,2.3,3.15])assert.ok(sampleDragon(at).effects.length>0);
 assert.deepEqual(sampleDragon(0).effects,[]);assert.deepEqual(sampleDragon(DURATION).effects,[]);assert.equal(sampleDragon(DURATION).done,true);
});
test('built preview shares the native multi-target V3 renderer and has no account mutation calls',async()=>{
 const b=await json('build-report.json');assert.equal(b.pixiCopies,1);assert.equal(b.gsapCopies,1);assert.equal(b.pixiVersion,'8.20.0');assert.equal(b.gsapVersion,'3.13.0');
 const build=(await read('build.mjs')).toString(),src=(await read('source/preview.js')).toString();assert.match(build,/__CNINE_NATIVE_CONTINUOUS__:'true'/);
 assert.match(src,/fixtures.multi/);assert.doesNotMatch(src,/fetch\(['"]\/api\//);
});
