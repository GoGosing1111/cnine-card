import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const dir=new URL('./assets/sources/',import.meta.url);
export function components(data,w,h){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),found=[];
 for(let p=0;p<w*h;p++){
  if(seen[p]||data[p*4+3]<40)continue;
  let a=0,b=1,x0=w,y0=h,x1=0,y1=0;queue[0]=p;seen[p]=1;const ids=[];
  while(a<b){const q=queue[a++],x=q%w,y=(q/w)|0;ids.push(q);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
   for(const n of [x?q-1:-1,x<w-1?q+1:-1,y?q-w:-1,y<h-1?q+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>=40){seen[n]=1;queue[b++]=n;}
  }
  if(ids.length>10000)found.push({ids,box:{left:x0,top:y0,width:x1-x0+1,height:y1-y0+1},touchesBorder:x0===0||y0===0||x1===w-1||y1===h-1});
 }
 return found.sort((a,b)=>Math.floor((a.box.top+a.box.height/2)/(h/2))-Math.floor((b.box.top+b.box.height/2)/(h/2))||a.box.left-b.box.left);
}
if(process.argv[1]===fileURLToPath(import.meta.url))for(const f of await fs.readdir(dir))if(f.startsWith('body-')){
 const {data,info}=await sharp(new URL(f,dir).pathname.replace(/^\/C:/,'C:')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 console.log(f,JSON.stringify(components(data,info.width,info.height).map(({ids,...v})=>({...v,pixels:ids.length}))));
}
