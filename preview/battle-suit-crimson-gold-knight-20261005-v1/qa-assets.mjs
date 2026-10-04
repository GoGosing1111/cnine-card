import assert from 'node:assert/strict';import fs from 'node:fs/promises';import sharp from 'sharp';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {MODES,sample} from './motion.mjs';
const root=new URL('./',import.meta.url),file=p=>fileURLToPath(new URL(p,root)),read=p=>fs.readFile(file(p)),hash=b=>createHash('sha256').update(b).digest('hex'),m=JSON.parse(await read('manifest.json'));
assert.equal(hash(await read(m.sourceArt)),'02ccd3d717c94cd001c538bb8a08cb9272fa1e7cae512e01f12a31b32f68d236');
const original=await sharp(await read(m.sourceArt)).ensureAlpha().raw().toBuffer({resolveWithObject:true}),blade=await sharp(await read(m.weapon.url)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let identical=0;for(let y=0;y<blade.info.height;y++)for(let x=0;x<blade.info.width;x++){const i=(y*blade.info.width+x)*4;if(!blade.data[i+3])continue;const j=((y+m.weapon.rect.top)*original.info.width+x+m.weapon.rect.left)*4;assert.ok(blade.data.subarray(i,i+4).equals(original.data.subarray(j,j+4)));identical++;}
assert.ok(identical>140000);assert.equal(hash(await read(m.weapon.url)),m.weapon.sha256);assert.equal(m.runtimeEnabled,false);
const frameReports=[];const contactSheets=[];
for(const [bank,seq]of Object.entries(m.motion)){
 assert.equal(hash(await read(seq.url)),seq.sha256);
 const atlas=await sharp(await read(seq.url)).metadata();assert.equal(atlas.width,seq.columns*768);assert.equal(atlas.height,seq.rows*768);
 const comps=[];for(const f of seq.frames){
  const bytes=await read(f.file);assert.equal(hash(bytes),f.sha256);assert.equal(f.weapon.sourceSha256,m.weapon.sha256);assert.equal(f.weapon.redrawnPixels,0);
  const {data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});assert.equal(info.channels,4);assert.equal(info.width,768);assert.equal(info.height,768);
  let minX=768,minY=768,maxX=-1,maxY=-1;for(let y=0;y<768;y++)for(let x=0;x<768;x++)if(data[(y*768+x)*4+3]>64){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  assert.ok(minX>=8&&minY>=8&&maxX<=759&&maxY<=759,f.id+' clips');
  assert.ok(Number.isFinite(f.pivot.x)&&Number.isFinite(f.grip.y)&&Number.isFinite(f.tip.x));
  frameReports.push({id:f.id,bounds:[minX,minY,maxX,maxY],uniformWeaponScale:f.weapon.uniformScale});
  comps.push({input:await sharp(bytes).resize(320,320).png().toBuffer(),left:(f.index%4)*320,top:Math.floor(f.index/4)*320});
 }
 const sheet='qa/body-'+bank+'.png';await sharp({create:{width:1280,height:640,channels:4,background:'#15121b'}}).composite(comps).png().toFile(file(sheet));contactSheets.push(sheet);
}
assert.equal(frameReports.length,44);
const effectReports=[];
for(const [key,s]of Object.entries(m.effects)){
 const bytes=await read(s.url);assert.equal(hash(bytes),s.sha256);const hashes=new Set();
 for(const f of s.frames){const b=await sharp(bytes).extract({left:f.rect.x,top:f.rect.y,width:f.rect.width,height:f.rect.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});hashes.add(hash(b.data));let edge=0,opaque=0;for(let y=0;y<b.info.height;y++)for(let x=0;x<b.info.width;x++){const a=b.data[(y*b.info.width+x)*4+3];if(a>128){opaque++;if(x===0||y===0||x===b.info.width-1||y===b.info.height-1)edge++;}}effectReports.push({key,frame:f.index,opaquePixels:opaque,boundaryPixels:edge});assert.ok(opaque>0);}
 assert.equal(hashes.size,12,key+' duplicate frames');
}
for(const [key,s]of Object.entries(MODES))for(let t=0;t<=s.duration;t+=.015){const f=sample(key,t);assert.ok(m.motion[f.pose.bank].frames[f.pose.index]);assert.ok(Number.isFinite(f.lift));for(const e of f.effects)assert.ok(m.effects[e.key].frames[e.frame]);}
const build=JSON.parse(await read('build-report.json'));assert.equal(build.pixiCopies,1);assert.equal(build.gsapCopies,1);
const report={passed:true,sourcePreserved:true,exactSourceWeaponPixels:identical,bodyFrames:44,effectFrames:effectReports.length,singleRenderer:true,singleTimelineLibrary:true,runtimeEnabled:false,frameReports,effectReports,contactSheets};
await fs.writeFile(file('qa/assets-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,bodyFrames:44,effectFrames:effectReports.length,exactSourceWeaponPixels:identical,fxBoundaryWarnings:effectReports.filter(r=>r.boundaryPixels>8).map(r=>({key:r.key,frame:r.frame,edge:r.boundaryPixels}))}));
