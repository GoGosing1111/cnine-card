// REJECTED HISTORICAL METHOD. Retained as evidence, never used to produce active SX assets.
throw new Error('Detached head/weapon composition was rejected. Use pack-connected.mjs for the active SX preview.');
// Original-pixel matte selection derived from X-BODY's approved compositor.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url),file=p=>fileURLToPath(new URL(p,root));
const cfg=JSON.parse(await fs.readFile(file('part-lock.json')));
const source=await fs.readFile(file(cfg.source)),hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(source)!==cfg.sha256)throw Error('Approved source changed');
const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const inside=(x,y,p)=>{let v=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])v=!v;}return v;};
await fs.mkdir(file('assets/locked'),{recursive:true});
for(const key of ['helmet','blade']){
 const def=cfg[key],r=def.rect,out=Buffer.alloc(r.width*r.height*4);let copiedPixels=0;
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
  const sx=x+r.left,sy=y+r.top;if(!def.polygons.some(p=>inside(sx+.5,sy+.5,p)))continue;
  const from=(sy*info.width+sx)*4,to=(y*r.width+x)*4;data.copy(out,to,from,from+4);if(data[from+3])copiedPixels++;
 }
 const png=await sharp(out,{raw:{width:r.width,height:r.height,channels:4}}).png().toBuffer();
 const local=p=>({x:p.x-r.left,y:p.y-r.top});
 const record={...def,source:cfg.source,sourceSha256:cfg.sha256,width:r.width,height:r.height,anchor:local(def.anchor),...(def.tip?{tip:local(def.tip)}:{}),sha256:hash(png),copiedPixels,redrawnPixels:0,operation:'ORIGINAL_PIXEL_SELECTION_ONLY',transformsAllowed:['uniformScale','rotation','translation']};
 await fs.writeFile(file('assets/locked/'+key+'.png'),png);await fs.writeFile(file('assets/locked/'+key+'-provenance.json'),JSON.stringify(record,null,2)+'\n');
 console.log(key,copiedPixels,record.sha256);
}
