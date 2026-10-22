import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
for(const slug of ['bongsoon','joeun','diim','claws','dagger']){
 const file=path.join(dir,'assets',slug,'motion.png');try{await fs.access(file);}catch{continue;}
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const w=info.width,h=info.height,seen=new Uint8Array(w*h),q=new Int32Array(w*h),items=[];
 for(let p=0;p<w*h;p++){
  if(seen[p]||data[p*4+3]<80)continue;
  let a=0,b=1,x0=w,y0=h,x1=0,y1=0;q[0]=p;seen[p]=1;
  while(a<b){const i=q[a++],x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
   for(const n of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>=80){seen[n]=1;q[b++]=n;}
  }
  if(b>3000)items.push({pixels:b,x0,y0,x1,y1});
 }
 console.log(JSON.stringify({slug,w,h,components:items.sort((a,b)=>a.y0-b.y0)}));
}
