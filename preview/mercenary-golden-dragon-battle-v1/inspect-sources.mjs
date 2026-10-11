import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=fileURLToPath(new URL('.',import.meta.url));
export async function components(file){
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true}),{width:w,height:h}=info;
 const labels=new Int32Array(w*h),queue=new Int32Array(w*h),parts=[];let id=0;
 for(let p=0;p<w*h;p++){
  if(labels[p]||data[p*4+3]<24)continue;
  id++;let head=0,tail=1;queue[0]=p;labels[p]=id;
  let left=w,right=0,top=h,bottom=0,count=0,sx=0,sy=0;
  while(head<tail){const at=queue[head++],x=at%w,y=Math.floor(at/w);count++;sx+=x;sy+=y;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
   for(const n of [x>0?at-1:-1,x<w-1?at+1:-1,y>0?at-w:-1,y<h-1?at+w:-1])if(n>=0&&!labels[n]&&data[n*4+3]>=24){labels[n]=id;queue[tail++]=n;}
  }
  if(count>100)parts.push({id,count,left,right,top,bottom,cx:sx/count,cy:sy/count});
 }
 return {data,info,labels,parts:parts.sort((a,b)=>b.count-a.count)};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const results={};
 for(const name of ['master','idle','dash','slash','cast','ultimate','hit','defeat']){
  const file=path.join(root,'assets/sources',name+'.png');try{await fs.access(file);}catch{continue;}
  const c=await components(file);results[name]={width:c.info.width,height:c.info.height,parts:c.parts.slice(0,8)};
  await sharp(file).flatten({background:'#111720'}).resize({width:1000,withoutEnlargement:true}).png().toFile(path.join(root,'qa',name+'-on-dark.png'));
 }
 await fs.writeFile(path.join(root,'qa/source-components.json'),JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify(results,null,2));
}
