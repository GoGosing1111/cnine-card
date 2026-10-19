import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=new URL('../',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('organization map artwork preserves provenance and complete transparent emblems',async()=>{
 const manifest=JSON.parse(await readFile(new URL('assets/ui/organization/faction-v3-20261019/manifest.json',root)));
 assert.equal(sha(await readFile(new URL(manifest.original,root))),manifest.originalSha256);
 assert.deepEqual(manifest.assets.filter(a=>a.kind==='emblem').map(a=>a.id),Array.from({length:15},(_,i)=>i+1));
 const atlas=await readFile(new URL(manifest.runtimeAtlas.file,root)),atlasMeta=await sharp(atlas).metadata();assert.equal(sha(atlas),manifest.runtimeAtlas.sha256);assert.equal(atlasMeta.width,1152);assert.equal(atlasMeta.height,1920);assert.equal(atlasMeta.hasAlpha,true);
 for(const asset of manifest.assets){
  const source=await readFile(new URL(asset.source,root)),runtime=await readFile(new URL(asset.file,root));assert.equal(sha(source),asset.sha256,asset.name+' source');assert.equal(sha(runtime),asset.webpSha256,asset.name+' runtime');
  assert.ok(asset.prompt.length>100);
  if(asset.id==='terrain')continue;
  const meta=await sharp(runtime).metadata();assert.equal(meta.hasAlpha,true,asset.name);
  const {data,info}=await sharp(runtime).ensureAlpha().raw().toBuffer({resolveWithObject:true});let transparent=0,opaque=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
   const alpha=data[(y*info.width+x)*4+3];if(alpha<10)transparent++;if(alpha>245)opaque++;
   if(x===0||y===0||x===info.width-1||y===info.height-1)assert.ok(alpha<=20,asset.name+' silhouette must not touch the crop edge');
  }
  assert.ok(transparent/(info.width*info.height)>.2,asset.name+' actual transparent exterior');assert.ok(opaque/(info.width*info.height)>.2,asset.name+' opaque emblem interior');
  if(asset.kind==='emblem'){const [left,top,width,height]=asset.atlasRect,stats=await sharp(atlas).extract({left,top,width,height}).stats();assert.equal(stats.channels[3].min,0);assert.equal(stats.channels[3].max,255);}
 }
});
