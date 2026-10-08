import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const base=path.resolve('preview/legion-regions-v1'),out=path.resolve('assets/ui/legion-regions-v1');
const manifest=JSON.parse(await fs.readFile(path.join(base,'asset-prompts.json'),'utf8')),records=[];
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
// Atlas export only: no repainting, stretching, background substitution or synthesis.
// Generated figures can slightly cross cell boundaries. Connected alpha components
// preserve those complete limbs instead of cutting at an arbitrary grid line.
async function splitSprites(buffer,count){
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h}=info,seen=new Uint8Array(w*h),queue=new Int32Array(w*h),components=[];
  for(let origin=0;origin<w*h;origin++){
    if(seen[origin]||data[origin*4+3]<=8)continue;
    let head=0,tail=1;queue[0]=origin;seen[origin]=1;const pixels=[];let sx=0,sy=0;
    while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);pixels.push(p);sx+=x;sy+=y;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;const q=ny*w+nx;if(!seen[q]&&data[q*4+3]>8){seen[q]=1;queue[tail++]=q;}}
    }
    if(pixels.length>=4)components.push({pixels,x:sx/pixels.length,y:sy/pixels.length});
  }
  const cols=count===4?2:3,rows=2,groups=Array.from({length:count},()=>[]);
  const anchors=Array.from({length:count},(_,i)=>({x:(i%cols+.5)*w/cols,y:(Math.floor(i/cols)+.5)*h/rows}));
  for(const c of components){let index=0,best=Infinity;for(let i=0;i<count;i++){const d=((c.x-anchors[i].x)/(w/cols))**2+((c.y-anchors[i].y)/(h/rows))**2;if(d<best){index=i;best=d;}}groups[index].push(c);}
  const sprites=[];
  for(let i=0;i<count;i++){
    const pixels=groups[i].flatMap(c=>c.pixels);if(pixels.length<800)throw Error('Missing atlas sprite '+i);
    const rgba=Buffer.alloc(data.length);let minX=w,minY=h,maxX=0,maxY=0;
    for(const p of pixels){const x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);data.copy(rgba,p*4,p*4,p*4+4);}
    const left=Math.max(0,minX-8),top=Math.max(0,minY-8),width=Math.min(w-left,maxX-minX+17),height=Math.min(h-top,maxY-minY+17);
    sprites.push(await sharp(rgba,{raw:{width:w,height:h,channels:4}}).extract({left,top,width,height}).webp({lossless:true}).toBuffer());
  }
  return sprites;
}
for(const entry of manifest.entries){
  if(!entry.source)continue;
  const source=await fs.readFile(entry.source),sourceName=`${entry.id}-${entry.kind}-source-v1.png`,sourceTarget=path.join(base,'sources',sourceName),dir=path.join(out,entry.id);
  await fs.mkdir(path.dirname(sourceTarget),{recursive:true});await fs.mkdir(dir,{recursive:true});await fs.copyFile(entry.source,sourceTarget);
  const files=[];
  if(entry.kind==='background'){const name='background-v1.webp';await sharp(source).resize({width:1920,withoutEnlargement:true}).webp({quality:92}).toFile(path.join(dir,name));files.push(name);}
  else {const count=entry.kind==='monsters'?4:6,sprites=await splitSprites(source,count);for(let i=0;i<count;i++){const name=entry.kind==='monsters'?(i===3?'boss-v1.webp':`monster-${i+1}-v1.webp`):`equipment-${i+1}-v1.webp`;await fs.writeFile(path.join(dir,name),sprites[i]);files.push(name);}}
  records.push({id:entry.id,kind:entry.kind,source:path.relative(process.cwd(),sourceTarget).replaceAll('\\','/'),sourceSha256:digest(source),files:await Promise.all(files.map(async name=>{const file=path.join(dir,name),b=await fs.readFile(file),meta=await sharp(b).metadata();return {path:path.relative(process.cwd(),file).replaceAll('\\','/'),sha256:digest(b),width:meta.width,height:meta.height,alpha:meta.hasAlpha};}))});
}
await fs.writeFile(path.join(base,'asset-manifest.json'),JSON.stringify({generator:'built-in imagegen',records},null,2)+'\n');
console.log(JSON.stringify({atlases:records.length,files:records.reduce((n,r)=>n+r.files.length,0)}));
