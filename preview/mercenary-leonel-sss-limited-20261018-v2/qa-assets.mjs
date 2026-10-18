// Targeted asset checks; these do not confer user visual approval.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let sharp;try{sharp=require('sharp');}catch{sharp=require('C:/Users/User/Downloads/upload/cnine-card/node_modules/sharp');}
const root=fileURLToPath(new URL('.',import.meta.url)),file=p=>path.join(root,p),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile(file('manifest.json'),'utf8'));
const cfg=JSON.parse(await fs.readFile(file('asset-registration.json'),'utf8'));
const results=[];
const run=async(name,fn)=>{try{const detail=await fn();results.push({name,pass:true,...detail});}catch(error){results.push({name,pass:false,error:error.message});}};
await run('source-art-and-weapon-original-pixel-provenance',async()=>{
 const source=await fs.readFile(file(manifest.weapon.source)),blade=await fs.readFile(file(manifest.weapon.url));
 assert.equal(hash(source),manifest.weapon.sourceSha256);assert.equal(hash(blade),manifest.weapon.sha256);
 const a=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(blade).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let compared=0;
 for(let y=0;y<b.info.height;y++)for(let x=0;x<b.info.width;x++){
  const p=(y*b.info.width+x)*4;if(!b.data[p+3])continue;
  const q=((y+manifest.weapon.rect.top)*a.info.width+x+manifest.weapon.rect.left)*4;
  assert.deepEqual(b.data.subarray(p,p+4),a.data.subarray(q,q+4));compared++;
 }
 assert.equal(compared,manifest.weapon.copiedPixels);assert.ok(compared>10000);return{comparedPixels:compared,redrawnPixels:0};
});
await run('motion-atlas-alpha-pivots-and-one-rigid-weapon',async()=>{
 const hashes=new Set();let count=0;const maxContactGap=0;
 for(const [key,spec]of Object.entries(manifest.motion)){
  for(const page of spec.pages){const atlas=await fs.readFile(file(page.url));assert.equal(hash(atlas),page.sha256);assert.ok(page.width<=4096&&page.height<=4096);}
  assert.equal(spec.referenceHeight,cfg.referenceHeight);
  for(const f of spec.frames){
   assert.equal(f.weapon.sourceSha256,manifest.weapon.sha256);assert.equal(f.weapon.redrawnPixels,0);
   assert.equal(f.weapon.uniformScale,cfg.referenceHeight/manifest.weapon.standingHeight);
   const bytes=await fs.readFile(file(f.file));assert.equal(hash(bytes),f.sha256);hashes.add(f.sha256);
   const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   assert.equal(info.width,cfg.cellSize);assert.equal(info.height,cfg.cellSize);
   for(const p of [f.pivot,f.grip,f.tip,f.bladeStart])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<info.width&&p.y<info.height,f.id+' registration outside canvas');
   for(let x=0;x<info.width;x++)assert.equal(data[x*4+3]+data[((info.height-1)*info.width+x)*4+3],0,f.id+' touches top/bottom');
   for(let y=0;y<info.height;y++)assert.equal(data[y*info.width*4+3]+data[(y*info.width+info.width-1)*4+3],0,f.id+' touches side');
   const bx=f.tip.x-f.bladeStart.x,by=f.tip.y-f.bladeStart.y,gx=f.grip.x-f.bladeStart.x,gy=f.grip.y-f.bladeStart.y;
   const axisDistance=Math.abs(bx*gy-by*gx)/Math.hypot(bx,by);
   assert.ok(axisDistance<20,f.id+' grip off source weapon axis');
   count++;
  }
 }
 assert.equal(hashes.size,count);assert.equal(count,40,'V2 requires 40 body frames');return{frames:count,distinctRasters:hashes.size,weaponSources:1,referenceHeight:cfg.referenceHeight};
});
await run('effects-transparent-with-twelve-distinct-drawn-stages',async()=>{
 let count=0;const details={};
 for(const[key,spec]of Object.entries(manifest.effects)){
  const bytes=await fs.readFile(file(spec.url)),meta=await sharp(bytes).metadata();assert.equal(hash(bytes),spec.sha256);assert.ok(meta.hasAlpha);
  const hashes=new Set();let transparent=0,total=0;
  for(const f of spec.frames){const r=f.rect,raw=await sharp(bytes).extract({left:r.x,top:r.y,width:r.width,height:r.height}).ensureAlpha().raw().toBuffer();hashes.add(hash(raw));for(let p=3;p<raw.length;p+=4){if(raw[p]<16)transparent++;total++;}count++;}
  assert.equal(spec.frames.length,12);assert.equal(hashes.size,12);assert.ok(transparent/total>.15,key+' lacks transparent separation');
  details[key]={frames:spec.frames.length,transparentRatio:transparent/total};
 }
 assert.equal(count,84,'Final release candidate requires 84 FX frames');return{frames:count,details};
});
await run('awakening-four-drawings-and-independent-playback-rates',async()=>{
 const s=manifest.cinematics.awakening;assert.equal(s.frames.length,4);assert.equal(new Set(s.frames.map(f=>f.sha256)).size,4);assert.equal(hash(await fs.readFile(file(s.url))),s.sha256);
 assert.equal(manifest.playbackRates.attackMotion,2);assert.equal(manifest.playbackRates.skillEffect,1);assert.equal(manifest.combatProfile.basePower,1940890);return{cinematicFrames:4,attackMotionRate:2,effectRate:1,reviewBasePower:manifest.combatProfile.basePower};
});
await run('preview-only-no-operations-registration',async()=>{
 assert.equal(manifest.runtimeEnabled,false);assert.equal(manifest.runtimeRegistration,false);assert.equal(manifest.deployed,false);assert.equal(manifest.status,'USER_REVIEW_PENDING');assert.equal(manifest.code,undefined);
 assert.ok(manifest.sourceArt.startsWith('/preview/'));assert.ok(manifest.battleSprite.startsWith('/preview/'));return{operationsEnabled:false,userApproval:false};
});
const report={createdAt:new Date().toISOString(),status:results.every(r=>r.pass)?'PASS_TECHNICAL_ONLY':'FAIL',results,visualApproval:'PENDING_USER_REVIEW',meaning:'Pass confirms provenance, rigid composition, alpha, atlas and registration integrity. It does not approve anatomy, choreography or art quality.'};
await fs.writeFile(file('qa/asset-qa-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(report.status==='FAIL')process.exitCode=1;
