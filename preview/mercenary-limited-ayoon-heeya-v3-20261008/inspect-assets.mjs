import sharp from 'sharp';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export const root=new URL('./',import.meta.url);
export const file=p=>fileURLToPath(new URL(p,root));
export async function components(path){
 const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true}),{width:w,height:h}=info;
 const seen=new Uint8Array(w*h),parts=[];
 for(let k=0;k<w*h;k++){
  if(seen[k]||data[k*4+3]<20)continue;
  const queue=[k],part={count:0,left:w,top:h,right:0,bottom:0,pixels:[]};seen[k]=1;
  for(let z=0;z<queue.length;z++){const p=queue[z],x=p%w,y=Math.floor(p/w);part.count++;part.pixels.push(p);part.left=Math.min(part.left,x);part.right=Math.max(part.right,x);part.top=Math.min(part.top,y);part.bottom=Math.max(part.bottom,y);
   for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>=20){seen[n]=1;queue.push(n);}
  }
  parts.push(part);
 }
 const main=parts.filter(p=>p.count>15000).sort((a,b)=>Math.abs(a.top-b.top)>h*.27?a.top-b.top:a.left-b.left);
 return {data,info,main,parts};
}
if(process.argv[1]===file('inspect-assets.mjs'))for(const char of ['ayoon','heeya'])for(const group of ['basic','skill','move']){
 const r=await components(file('assets/sources/'+char+'-'+group+'.png'));
 console.log(char,group,r.info.width,r.info.height,r.main.map(({pixels,...p})=>p));
}
