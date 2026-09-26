import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
export async function readImage(file){
 const bytes=await fs.readFile(file),meta=await sharp(bytes).metadata();
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let clear=0,border=0,x0=info.width,y0=info.height,x1=-1,y1=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];if(a===0)clear++;
  if(a>=16){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);if(x===0||y===0||x===info.width-1||y===info.height-1)border++;}
 }
 return {bytes,data,info,record:{width:info.width,height:info.height,hasAlpha:!!meta.hasAlpha,clear:clear/(info.width*info.height),border,bounds:[x0,y0,x1,y1],sha256:sha(bytes)}};
}
// Native-alpha pose ownership preserves bow tips that cross the nominal grid.
// Small detached highlights inherit the nearest pose; no alpha or colors change.
export function partition(image,count,rows){
 const {width:w,height:h}=image.info,labels=new Int32Array(w*h),components=[];let label=0;
 for(let n=0;n<w*h;n++){
  if(labels[n]||image.data[n*4+3]<48)continue;
  const stack=[n];labels[n]=++label;let pixels=0,x0=w,y0=h,x1=-1,y1=-1;
  while(stack.length){const p=stack.pop(),x=p%w,y=Math.floor(p/w);pixels++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!labels[q]&&image.data[q*4+3]>=48){labels[q]=label;stack.push(q);}
  }
  if(pixels>4000)components.push({label,pixels,x0,y0,x1,y1});
 }
 components.sort((a,b)=>Math.round(a.y1/(h/rows))-Math.round(b.y1/(h/rows))||a.x0-b.x0);
 if(components.length!==count)throw Error('Expected '+count+' disconnected poses, found '+components.length+' '+JSON.stringify(components));
 const big=new Map(components.map((c,i)=>[c.label,i+1])),owner=new Uint8Array(w*h),queue=new Int32Array(w*h);let end=0;
 for(let p=0;p<w*h;p++){const id=big.get(labels[p]);if(id){owner[p]=id;queue[end++]=p;}}
 for(let next=0;next<end;next++){const p=queue[next],x=p%w,y=Math.floor(p/w);
  for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!owner[q]&&image.data[q*4+3]>0){owner[q]=owner[p];queue[end++]=q;}
 }
 for(let p=0;p<w*h;p++)if(!owner[p]&&image.data[p*4+3]>0){
  const x=p%w,y=Math.floor(p/w);let best=Infinity,id=0;
  components.forEach((c,i)=>{const dx=Math.max(c.x0-x,0,x-c.x1),dy=Math.max(c.y0-y,0,y-c.y1),d=dx*dx+dy*dy;if(d<best){best=d;id=i+1;}});
  owner[p]=id;
 }
 return {components,owner};
}
