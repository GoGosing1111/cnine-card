import fs from 'node:fs/promises';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),read=p=>fs.readFile(new URL(p,root)),hash=b=>createHash('sha256').update(b).digest('hex');
const m=JSON.parse(await read('manifest.json')),w=m.weapon;
const original=await sharp(await read(w.source)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const blade=await sharp(await read(w.url)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
assert.equal(hash(await read(w.source)),w.sourceSha256);assert.equal(hash(await read(w.url)),w.sha256);
let copied=0;
for(let y=0;y<w.height;y++)for(let x=0;x<w.width;x++){
 const i=(y*w.width+x)*4;if(!blade.data[i+3])continue;
 const j=((y+w.rect.top)*original.info.width+x+w.rect.left)*4;
 assert.ok(blade.data.subarray(i,i+4).equals(original.data.subarray(j,j+4)),'Original sword pixel mismatch');copied++;
}
assert.equal(copied,w.copiedPixels);
const frames=Object.values(m.motion).flatMap(s=>s.frames),scale=360/w.standingHelmetToSole;
for(const f of frames){
 assert.equal(f.bodyPixels,360);assert.equal(f.weapon.sourceSha256,w.sha256);assert.equal(f.weapon.redrawnPixels,0);assert.ok(Math.abs(f.weapon.uniformScale-scale)<1e-10);
 const bytes=await read(f.file);assert.equal(hash(bytes),f.sha256);
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let x=0;x<info.width;x++)assert.equal(Math.max(data[x*4+3],data[((info.height-1)*info.width+x)*4+3]),0,'Clipped top or bottom');
 for(let y=0;y<info.height;y++)assert.equal(Math.max(data[y*info.width*4+3],data[(y*info.width+info.width-1)*4+3]),0,'Clipped side');
}
for(const bank of [...Object.values(m.motion),...Object.values(m.effects)])assert.equal(hash(await read(bank.url)),bank.sha256);
assert.equal(frames.length,64);assert.equal(Object.values(m.effects).reduce((n,s)=>n+s.frames.length,0),156);
const report={status:'PASS',sourcePixelEquality:true,originalSwordPixels:copied,redrawnSwordPixels:0,bodyFrames:frames.length,canonicalBodyHeight:360,weaponUniformScale:scale,clippedFrameEdges:0,effectFrames:156,visualApproval:false};
await fs.writeFile(new URL('qa/asset-check.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
