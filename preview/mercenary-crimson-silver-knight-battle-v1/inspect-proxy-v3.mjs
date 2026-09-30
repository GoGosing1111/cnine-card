import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {root,cleanAlpha} from './compose-weapon.mjs';
import {partition} from './partition-v3.mjs';

export const isKey=(r,g,b)=>g>50&&g>r*1.35&&g>b*1.2 || g>60&&b>60&&r<g*.72&&r<b*.72 || r>65&&b>65&&g<r*.62&&g<b*.62;
export async function analyze(file,count=8,rows=2){
 const bytes=await fs.readFile(path.join(root,file));
 const image=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const utility=file.endsWith('/utility-source.png');
 // Only these two cape edges touch. Assign their pixels to their native cell;
 // the arms, closed gloves, legs and registration markers do not cross this cut.
 const separated=utility?partitionUtility(image):partition(image,count,rows);
 const {components,owner}=separated,w=image.info.width,frames=[];
 for(let i=0;i<count;i++){
  const c=components[i],cyan=[],magenta=[],green=[];
  for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++){
   const p=y*w+x;if(owner[p]!==i+1)continue;
   const [r,g,b,a]=image.data.subarray(p*4,p*4+4);if(a<140)continue;
   if(g>90&&b>90&&r<g*.6&&r<b*.6)cyan.push([x,y]);
   else if(r>100&&b>100&&g<r*.5&&g<b*.5)magenta.push([x,y]);
   else if(g>75&&g>r*1.5&&g>b*1.4)green.push([x,y]);
  }
  if(cyan.length<3||magenta.length<3||green.length<5)throw Error(`${file} frame ${i}: missing registration colors`);
  const center=a=>a.reduce((s,p)=>[s[0]+p[0]/a.length,s[1]+p[1]/a.length],[0,0]);
  const p0=center(cyan),p1=center(magenta),length=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),d=[(p1[0]-p0[0])/length,(p1[1]-p0[1])/length];
  const occupancy=new Uint16Array(Math.ceil(length)+1);
  for(const p of green){const t=Math.round((p[0]-p0[0])*d[0]+(p[1]-p0[1])*d[1]);if(t>=0&&t<occupancy.length)occupancy[t]++;}
  const runs=[];let start=-1;
  for(let t=5;t<length-5;t++){if(occupancy[t]===0&&start<0)start=t;if((occupancy[t]>0||t>=length-6)&&start>=0){runs.push([start,t]);start=-1;}}
  const gap=runs.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]))[0];
  if(!gap||gap[1]-gap[0]<5)throw Error(`${file} frame ${i}: clenched fist must occlude handle`);
  let bottom=c.y0;for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++){const p=y*w+x,[r,g,b,a]=image.data.subarray(p*4,p*4+4);if(owner[p]===i+1&&a>=180&&g>35&&!isKey(r,g,b)&&!(r>g*1.6&&r>b*1.6))bottom=Math.max(bottom,y);}
  let footMin=c.x1,footMax=c.x0;for(let y=Math.floor(bottom-(c.y1-c.y0)*.12);y<=bottom;y++)for(let x=c.x0;x<=c.x1;x++){const p=y*w+x,[r,g,b,a]=image.data.subarray(p*4,p*4+4);if(owner[p]===i+1&&a>=180&&g>35&&!isKey(r,g,b)&&!(r>g*1.6&&r>b*1.6)){footMin=Math.min(footMin,x);footMax=Math.max(footMax,x);}}
  const handT=(gap[0]+gap[1])/2,grip=[p0[0]+handT*d[0],p0[1]+handT*d[1]],angle=Math.atan2(-d[0],d[1])*180/Math.PI;
  frames.push({i,bounds:[c.x0,c.y0,c.x1,c.y1],cyan:p0,magenta:p1,greenPixels:green.length,grip,gap,angle,feet:[(footMin+footMax)/2,bottom]});
 }
 return {image,components,owner,frames};
}
function partitionUtility(image){
 const {width:w,height:h}=image.info,owner=new Uint8Array(w*h);
 const components=Array.from({length:4},(_,i)=>({label:i+1,pixels:0,x0:w,y0:h,x1:0,y1:0}));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=y*w+x;if(image.data[p*4+3]<1)continue;
  const i=(y<850?0:2)+(x<(y<850?500:518)?0:1),c=components[i];owner[p]=i+1;
  if(image.data[p*4+3]<100)continue;c.pixels++;c.x0=Math.min(c.x0,x);c.x1=Math.max(c.x1,x);c.y0=Math.min(c.y0,y);c.y1=Math.max(c.y1,y);
 }
 return {components,owner};
}
if(process.argv[1]?.endsWith('inspect-proxy-v3.mjs')){
 for(const key of process.argv.slice(2)){
  const v5=key.startsWith('v5:'),name=v5?key.slice(3):key,folder=v5?'motion-v5':'rig-v3',count=v5?4:8;
  const file=`assets/${folder}/${name}-source.png`,result=await analyze(file,count);
  console.log(JSON.stringify({key,frames:result.frames}));
  const {image,components,owner}=result,c=components[count-1],pad=4,w=c.x1-c.x0+1+pad*2,h=c.y1-c.y0+1+pad*2,raw=Buffer.alloc(w*h*4);
  for(let y=c.y0;y<=c.y1;y++)for(let x=c.x0;x<=c.x1;x++){const p=y*image.info.width+x;if(owner[p]===count)image.data.copy(raw,((y-c.y0+pad)*w+x-c.x0+pad)*4,p*4,p*4+4);}
  await fs.writeFile(path.join(root,`assets/${folder}/${name}-end.png`),await cleanAlpha(await sharp(raw,{raw:{width:w,height:h,channels:4}}).png().toBuffer()));
 }
}
