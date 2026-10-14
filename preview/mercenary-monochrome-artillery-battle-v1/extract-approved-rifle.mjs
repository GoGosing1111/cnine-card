import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const cfg=JSON.parse(await fs.readFile(file('rifle-lock.json'))),bytes=await fs.readFile(file(cfg.source));
if(hash(bytes)!==cfg.sourceSha256)throw Error('Approved source changed');
const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
function inside(x,y,p){let r=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])r=!r;}return r;}
const {left,top,width:w,height:h}=cfg.region,out=Buffer.alloc(w*h*4);let copiedPixels=0;
for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(cfg.polygons.some(p=>inside(x+.5,y+.5,p))&&!cfg.holes.some(p=>inside(x+.5,y+.5,p))){const o=(y*w+x)*4,s=((y+top)*info.width+x+left)*4;data.copy(out,o,s,s+4);copiedPixels++;}
await fs.mkdir(file('assets/locked'),{recursive:true});
const png=await sharp(out,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
await fs.writeFile(file('assets/locked/approved-rifle.png'),png);
await fs.writeFile(file('assets/locked/rifle-provenance.json'),JSON.stringify({...cfg,sha256:hash(png),width:w,height:h,copiedPixels,redrawnPixels:0,operation:'ORIGINAL_PIXEL_SELECTION_ONLY',implementationReference:'../mercenary-sapphire-archmage-battle-v1/extract-approved-staff.mjs'},null,2)+'\n');
await sharp(png).rotate(-cfg.axisDegrees,{background:'#00000000'}).png().toFile(file('qa/rigid-rifle-horizontal.png'));
console.log({copiedPixels,sha256:hash(png)});
