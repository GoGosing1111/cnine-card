import fs from 'node:fs/promises';import sharp from 'sharp';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const cfg=JSON.parse(await fs.readFile(file('staff-lock.json'))),bytes=await fs.readFile(file(cfg.source));if(hash(bytes)!==cfg.sha256)throw Error('Approved source changed');
const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
function inside(x,y,p){let r=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])r=!r;}return r;}
const w=280,h=1536,out=Buffer.alloc(w*h*4);let pixels=0;
for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(cfg.polygons.some(p=>inside(x+.5,y+.5,p))&&!cfg.holes.some(p=>inside(x+.5,y+.5,p))){const o=(y*w+x)*4,s=(y*info.width+x)*4;data.copy(out,o,s,s+4);pixels++;}
await fs.mkdir(file('assets/locked'),{recursive:true});const png=await sharp(out,{raw:{width:w,height:h,channels:4}}).png().toBuffer();await fs.writeFile(file('assets/locked/approved-staff.png'),png);
await fs.writeFile(file('assets/locked/staff-provenance.json'),JSON.stringify({...cfg,width:w,height:h,sha256:hash(png),sourceSha256:cfg.sha256,operation:'ORIGINAL_PIXEL_SELECTION_ONLY',copiedPixels:pixels,redrawnPixels:0},null,2));console.log({pixels,sha256:hash(png)});
