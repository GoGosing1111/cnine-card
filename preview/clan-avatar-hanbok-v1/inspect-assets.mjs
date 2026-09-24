import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const dir=new URL('.',import.meta.url),root=new URL('../../',dir),manifest=JSON.parse(await readFile(new URL('manifest.json',dir),'utf8'));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const results=[];
for(const entry of manifest.entries){
 const file=new URL(entry.image,dir),bytes=await readFile(file),metadata=await sharp(bytes).metadata();
 assert.equal(metadata.width,1024,entry.name+' width');assert.equal(metadata.height,1536,entry.name+' height');assert.equal(metadata.hasAlpha,true,entry.name+' alpha');
 const {data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});let zero=0,nearOpaque=0,edge=0,minX=info.width,minY=info.height,maxX=-1,maxY=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const alpha=data[(y*info.width+x)*info.channels+info.channels-1];if(alpha===0)zero++;if(alpha>=240)nearOpaque++;if(alpha>16){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(x===0||y===0||x===info.width-1||y===info.height-1)edge++;}}
 const pixels=info.width*info.height;assert.ok(zero>pixels*.15,entry.name+' transparent exterior');assert.ok(nearOpaque>pixels*.1,entry.name+' opaque figure');assert.equal(edge,0,entry.name+' edge clipping');
 const source=await readFile(new URL(entry.identitySource,root));
 results.push({id:entry.id,name:entry.name,image:entry.image,width:info.width,height:info.height,bytes:bytes.length,sha256:hash(bytes),sourceSha256:hash(source),transparentPixels:zero,nearOpaquePixels:nearOpaque,bounds:[minX,minY,maxX,maxY],edgePixels:edge});
}
const report={checkedAt:new Date().toISOString(),count:results.length,allPassed:true,scope:'Dimensions, real alpha, opaque figure, frame margin and source/output hashes only. Visual costume and identity review is separate.',files:results};
await writeFile(new URL('asset-qa.json',dir),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
