import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const dir=fileURLToPath(new URL('.',import.meta.url));await fs.mkdir(dir+'runtime',{recursive:true});
const manifest={version:2,theme:'ink black and pearl white',seconds:2.4,layers:{},decodedBytes:0};
for(const id of ['rear','front']) {
 const size=320,cell=size+4,layers=[],frames=[],unique=new Set(),ink=[];
 for(let i=0;i<8;i++) {
  // Frame 5/9/... contains Effekseer's one-frame emitter handover. Select
  // the stable centre of each cel; runtime blends the clean phases itself.
  const file=dir+`frames/ink-${id}/frame-${String(2+i*4).padStart(4,'0')}.png`;
  const input=await sharp(file).resize(size,size).png().toBuffer();unique.add(createHash('sha256').update(input).digest('hex'));
  const {data}=await sharp(input).raw().toBuffer({resolveWithObject:true});let minX=size,minY=size,maxX=0,maxY=0,count=0,headCount=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(data[(y*size+x)*4+3]>32){count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(y<size*.3)headCount++;}
  if(minX===0||minY===0||maxX===size-1||maxY===size-1||count<100)throw Error(id+' clipped or empty cel '+i);
  const x=i%4*cell+2,y=Math.floor(i/4)*cell+2;layers.push({input,left:x,top:y});frames.push({x,y,w:size,h:size});ink.push({minX,minY,maxX,maxY,count,headCount});
 }
 if(unique.size!==8)throw Error(id+' did not retain eight unique cels');
 const atlas='ink-'+id+'.png';await sharp({create:{width:cell*4,height:cell*2,channels:4,background:'#00000000'}}).composite(layers).png().toFile(dir+'runtime/'+atlas);
 const bytes=await fs.readFile(dir+'runtime/'+atlas);
 manifest.layers[id]={atlas,frames,ink,size:[cell*4,cell*2],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};manifest.decodedBytes+=cell*cell*8*4;
}
const rear=manifest.layers.rear.ink;
manifest.referenceInk=[Math.max(...rear.map(b=>b.maxX))-Math.min(...rear.map(b=>b.minX))+1,Math.max(...rear.map(b=>b.maxY))-Math.min(...rear.map(b=>b.minY))+1];
await fs.writeFile(dir+'runtime/manifest.json',JSON.stringify(manifest,null,2));console.log({referenceInk:manifest.referenceInk,decodedMiB:manifest.decodedBytes/1048576,layers:Object.fromEntries(Object.entries(manifest.layers).map(([k,v])=>[k,{bytes:v.bytes,ink:v.ink}]))});
