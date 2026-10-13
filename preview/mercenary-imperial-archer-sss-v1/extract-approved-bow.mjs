import fs from 'node:fs/promises';import sharp from 'sharp';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const cfg=JSON.parse(await fs.readFile(file('bow-lock.json'))),bytes=await fs.readFile(file(cfg.source));if(hash(bytes)!==cfg.sourceSha256)throw Error('Approved source changed');
const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
function inside(x,y,p){let r=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])r=!r;}return r;}
const {left,top,width:w,height:h}=cfg.bounds,out=Buffer.alloc(w*h*4);let pixels=0;
for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(cfg.polygons.some(p=>inside(x+left+.5,y+top+.5,p))&&!cfg.holes.some(p=>inside(x+left+.5,y+top+.5,p))){const o=(y*w+x)*4,s=((y+top)*info.width+x+left)*4;data.copy(out,o,s,s+4);pixels++;}
await fs.mkdir(file('assets/locked'),{recursive:true});const png=await sharp(out,{raw:{width:w,height:h,channels:4}}).png().toBuffer();await fs.writeFile(file('assets/locked/approved-bow.png'),png);
const local=p=>({x:p.x-left,y:p.y-top});await fs.writeFile(file('assets/locked/bow-provenance.json'),JSON.stringify({...cfg,width:w,height:h,sha256:hash(png),grip:local(cfg.grip),upperTip:local(cfg.upperTip),lowerTip:local(cfg.lowerTip),emission:local(cfg.emission),operation:'ORIGINAL_PIXEL_SELECTION_ONLY',copiedPixels:pixels,redrawnPixels:0},null,2));console.log({pixels,sha256:hash(png)});
