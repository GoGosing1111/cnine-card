// Bake emissive material masks in the exact coordinate system of each approved animation cel.
// The upper half of the atlas is steel. The lower half is embroidery and the lit armor rim.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const folder='assets/ui/project-v/mercenaries/lightning-saint-20261125';
const packed=await fs.readFile(path.join(folder,'battle-hd.bin'));
const head=packed.readUInt32LE(),bank=JSON.parse(packed.subarray(4,4+head));
const pages=bank.actor.pages,tiles=[],tileSize=512,columns=3,rows=Math.ceil(pages.length/columns);
const clamp=v=>Math.max(0,Math.min(1,v));
let found=0,total=0;
const tracks=[];

function steelAxis(data,pageWidth,rect){
 const [sx,sy,w,h]=rect,mask=new Uint8Array(w*h),queue=new Int32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const pos=((sy+y)*pageWidth+sx+x)*4,r=data[pos],g=data[pos+1],b=data[pos+2];
  if(data[pos+3]>115&&g>112&&g<248&&r>=g-6&&r-g<63&&g-b>=-7&&g-b<43)mask[y*w+x]=1;
 }
 let best=null;
 for(let start=0;start<mask.length;start++){
  if(mask[start]!==1)continue;
  let count=1,xx=0,yy=0,xy=0,xs=0,ys=0;queue[0]=start;mask[start]=2;
  for(let j=0;j<count;j++){
   const p=queue[j],x=p%w,y=(p/w)|0;xs+=x;ys+=y;xx+=x*x;yy+=y*y;xy+=x*y;
   for(let v=Math.max(0,y-1);v<=Math.min(h-1,y+1);v++)for(let u=Math.max(0,x-1);u<=Math.min(w-1,x+1);u++){
    const k=v*w+u;if(mask[k]===1){mask[k]=2;queue[count++]=k;}
   }
  }
  if(count<22)continue;
  const x=xs/count,y=ys/count,ax=xx/count-x*x,ay=yy/count-y*y,axy=xy/count-x*y;
  const gap=Math.hypot(ax-ay,2*axy),long=Math.sqrt(Math.max(0,(ax+ay+gap)/2)),short=Math.sqrt(Math.max(.55,(ax+ay-gap)/2));
  if(long<.056*Math.max(w,h)||long/short<3.1)continue;
  const angle=.5*Math.atan2(2*axy,ax-ay),dx=Math.cos(angle),dy=Math.sin(angle);
  let lo=Infinity,hi=-Infinity;
  for(let j=0;j<count;j++){const p=queue[j],d=(p%w-x)*dx+(((p/w)|0)-y)*dy;lo=Math.min(lo,d);hi=Math.max(hi,d);}
  const score=(hi-lo)*Math.min(18,long/short)*Math.min(1,count/(hi-lo)/2);
  if(!best||score>best.score)best={x,y,dx,dy,lo,hi,radius:Math.max(2.5,short*3.2),score};
 }
 return best;
}
function bakeCel(src,pw,ref,metal,cloth,key){
 const [sx,sy,w,h]=ref.rect,axis=steelAxis(src,pw,ref.rect);
 total++;tracks[key]=null;
 if(axis){
  found++;
  const endpoint=d=>[axis.x+d*axis.dx,axis.y+d*axis.dy];
  const lo=endpoint(axis.lo),hi=endpoint(axis.hi);
  const darkNear=([ex,ey])=>{
   const r=Math.max(7,Math.min(27,Math.max(w,h)*.065));let n=0;
   for(let y=Math.max(0,Math.floor(ey-r));y<Math.min(h,ey+r);y+=2)for(let x=Math.max(0,Math.floor(ex-r));x<Math.min(w,ex+r);x+=2){
    const j=((sy+y)*pw+sx+x)*4;
    if((x-ex)**2+(y-ey)**2<r*r&&src[j+3]>180&&src[j+1]<92)n++;
   }
   return n;
  };
  const order=darkNear(lo)>=darkNear(hi)?[...lo,...hi]:[...hi,...lo];
  tracks[key]=[...order,Math.min(axis.radius,(axis.hi-axis.lo)*.077)].map(Math.round);
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const off=((sy+y)*pw+sx+x)*4,alpha=src[off+3]/255;if(alpha<.04)continue;
  const r=src[off],g=src[off+1],b=src[off+2];
  let steel=0;
  if(axis){
   const ox=x-axis.x,oy=y-axis.y,along=ox*axis.dx+oy*axis.dy;
   const cross=Math.abs(oy*axis.dx-ox*axis.dy);
   const band=clamp((axis.radius+1.5-cross)/2)*clamp((along-axis.lo+2)/3)*clamp((axis.hi-along+2)/3);
   steel=band*clamp((g-70)/142)*clamp((b-35)/92)*alpha;
  }
  const hem=clamp((y/h-.44)*6);
  const seam=clamp((r-g-5)/28)*clamp((r-b-8)/38)*clamp((r-38)/55)*clamp((208-r)/37);
  const bright=Math.max(r,g,b),solidShade=clamp((142-bright)/49);
  const back=x>1&&y>1?src[off-(pw+1)*4+3]/255:0;
  const rim=clamp((alpha-back)*2.6)*solidShade;
  const left=x>2?src[off-11]:g,below=y+2<h?src[off+pw*8+1]:g;
  const ridge=clamp((g-Math.min(left,below)-4)/34)*clamp((g-28)/45)*clamp((147-r)/54);
  const armor=clamp((y/h-.20)*4.5)*(1-clamp((y/h-.78)*6));
  const lit=alpha*(1-steel)*clamp(hem*seam*1.25+armor*(rim*.70+ridge*.52));
  for(const [buf,v,R,G,B] of [[metal,steel,255,207,101],[cloth,lit,255,183,57]]){
   buf[off]=R;buf[off+1]=G;buf[off+2]=B;buf[off+3]=Math.round(255*v);
  }
 }
}
for(let page=0;page<pages.length;page++){
 const item=pages[page],where=bank.files['actor/'+item.image],bytes=packed.subarray(4+head+where[0],4+head+where[0]+where[1]);
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const steel=Buffer.alloc(data.length),cloth=Buffer.alloc(data.length);
 for(const [key,ref] of Object.entries(bank.actor.sprites))if(ref.page===page)bakeCel(data,info.width,ref,steel,cloth,key);
 for(const [kind,buf] of [steel,cloth].entries()){
  const input=await sharp(buf,{raw:{width:info.width,height:info.height,channels:4}}).extend({right:2048-info.width,bottom:2048-info.height,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const resized=await sharp(input).resize(tileSize,tileSize,{kernel:'lanczos3'}).png().toBuffer();
  tiles.push({input:resized,left:page%columns*tileSize,top:(Math.floor(page/columns)+kind*rows)*tileSize});
 }
}
// Page 8 ends above row 540 in source pixels. Its unused rightmost tile holds the unique rear corona.
if(pages.length!==9||pages[8].size[1]>592)throw Error('Repack the corona separately when adding actor frames to page 8.');
const corona=await sharp(fileURLToPath(new URL('corona-source.webp',import.meta.url))).resize(352,352).ensureAlpha().raw().toBuffer();
for(let i=3;i<corona.length;i+=4)corona[i]=Math.round(255*(corona[i]/255)**1.8);
const plate=await sharp(corona,{raw:{width:352,height:352,channels:4}}).png().toBuffer();
tiles.push({input:plate,left:1084,top:1178});
const target=path.join(folder,'storm-material-v1.webp');
await sharp({create:{width:columns*tileSize,height:rows*2*tileSize,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(tiles).webp({quality:94,alphaQuality:100,effort:6}).toFile(target);
await fs.writeFile(new URL('../blade-tracks.mjs',import.meta.url),'// Guard, point and half-width measured on each approved cropped cel.\nexport const bladeTracks=[\n'+tracks.map(row=>' '+JSON.stringify(row)).join(',\n')+'\n];\n');
console.log(JSON.stringify({poses:total,measurableBlade:found,bytes:(await fs.stat(target)).size}));
