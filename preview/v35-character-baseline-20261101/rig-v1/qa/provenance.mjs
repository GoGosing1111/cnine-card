import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const dir=fileURLToPath(new URL('../',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const map=JSON.parse(await fs.readFile(path.join(dir,'sources/rig-map.json'),'utf8'));
const bytes=await fs.readFile(path.join(dir,map.source));assert.equal(hash(bytes),map.sha256);
const {data:source,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),coverage=new Uint8Array(info.width*info.height);
let selectedPixels=0,changedSelectedPixels=0;
for(const part of map.parts){
 const png=await fs.readFile(path.join(dir,'images',part.name+'.png'));assert.equal(hash(png),part.sha256);
 const {data,info:pi}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true}),r=part.sourceRect;
 assert.equal(pi.width,r.width);assert.equal(pi.height,r.height);
 for(let y=0;y<pi.height;y++)for(let x=0;x<pi.width;x++){
  const i=(y*pi.width+x)*4;if(!data[i+3])continue;
  const p=(y+r.y)*info.width+x+r.x,j=p*4;coverage[p]=1;selectedPixels++;
  if(data[i]!==source[j]||data[i+1]!==source[j+1]||data[i+2]!==source[j+2]||data[i+3]!==source[j+3])changedSelectedPixels++;
 }
}
let sourceVisiblePixels=0,uncoveredSourcePixels=0;
for(let i=0;i<coverage.length;i++)if(source[i*4+3]){sourceVisiblePixels++;if(!coverage[i])uncoveredSourcePixels++;}
assert.equal(changedSelectedPixels,0);assert.equal(uncoveredSourcePixels,0);
const result={source:'../baseline-v4.png',sourceSha256:hash(bytes),parts:map.parts.length,sourceVisiblePixels,selectedPixelsIncludingOverlap:selectedPixels,changedSelectedPixels,uncoveredSourcePixels,sourceRepainted:false,hiddenArtworkAdded:false};
await fs.writeFile(path.join(dir,'qa/provenance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
