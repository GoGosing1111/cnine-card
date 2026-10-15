// Requested SD replacement; preserve the portrait, prior sources and every other character.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
const base=new URL('../preview/icon-battle-assets-v1/',import.meta.url);
const spec=JSON.parse(await fs.readFile(new URL('joeun-medic-chibi-20261015.json',base),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
async function inspect(input){
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let edgeMax=0,nonempty=0,partial=0,alphaTotal=0,minX=info.width,minY=info.height,maxX=-1,maxY=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];alphaTotal+=a;if(a>0)nonempty++;if(a>0&&a<255)partial++;
  if(a>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  if(x===0||y===0||x===info.width-1||y===info.height-1)edgeMax=Math.max(edgeMax,a);
 }
 return {edgeMax,nonempty,partial,alphaTotal,transparentFraction:1-nonempty/(info.width*info.height),bounds:[minX,minY,maxX+1,maxY+1]};
}
const source=await fs.readFile(new URL(spec.source,base));if(hash(source)!==spec.sourceSha256)throw Error('Joeun SD source hash differs');
const meta=await sharp(source).metadata(),sourceAlpha=await inspect(source);
if(!meta.hasAlpha||sourceAlpha.edgeMax!==0||sourceAlpha.transparentFraction<.2)throw Error('Transparent SD boundary required');
const rendered=await sharp(source).resize(672,672,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).extend({left:48,top:48,right:48,bottom:48,background:{r:0,g:0,b:0,alpha:0}}).webp({lossless:true,effort:6}).toBuffer();
await fs.writeFile(new URL(spec.runtime,base),rendered);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',base),'utf8')),row=manifest.characters.find(c=>c.code===spec.code),runtimeAlpha=await inspect(rendered);
if(!row)throw Error('Existing ICON Joeun is required');
Object.assign(row,{source:spec.source,sourceSha256:spec.sourceSha256,sourceSize:[meta.width,meta.height],sourceAlpha,generation:spec.method,visualApproval:spec.visualStatus,
 weapon:'SD 메딕 의료 슈트 · 녹색 치료 주입기',runtime:spec.runtime,runtimeSha256:hash(rendered),runtimeBytes:rendered.length,size:[768,768],runtimeAlpha,
 // Midpoint between the boot ground contacts, in the unchanged 1024x1536 source.
 footAnchor:{x:(160+592*672/1536)/768,y:(48+1506*672/1536)/768}});
await fs.writeFile(new URL('manifest.json',base),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({code:row.code,runtime:row.runtime,sha256:row.runtimeSha256,footAnchor:row.footAnchor,alpha:runtimeAlpha}));
