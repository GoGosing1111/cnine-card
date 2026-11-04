import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const dir=process.argv[2]?path.resolve(process.argv[2])+path.sep:fileURLToPath(new URL('.',import.meta.url)),efk=JSON.parse(await fs.readFile(dir+'effects.json','utf8'));
await fs.mkdir(dir+'runtime',{recursive:true});
const manifest={schema:2,id:efk.id,sourceDate:efk.sourceDate,phase:'LOCAL_REVIEW_NOT_VISUALLY_APPROVED',alpha:'straight PNG; Pixi premultiplies on upload',effects:{},decodedBytes:0,encodedBytes:0};
const audit=[];
for(const s of efk.effects){
 const sourceFrames=[],stats=[];let minX=512,minY=512,maxX=-1,maxY=-1;
 for(let i=0;i<s.frames;i++){
  const file=`${dir}frames/${s.id}/frame-${String(i).padStart(4,'0')}.png`,b=await fs.readFile(file),{data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});let visible=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]){visible++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  sourceFrames.push(b);stats.push(visible);
 }
 if(maxX<0||minX===0||minY===0||maxX===511||maxY===511)throw Error('Empty or clipped '+s.id+': '+[minX,minY,maxX,maxY]);
 const lead=stats.findIndex(n=>n>0),last=stats.findLastIndex(n=>n>0),buffers=sourceFrames.slice(lead,last+1),crop={left:minX-2,top:minY-2,width:maxX-minX+5,height:maxY-minY+5};
 const scale=.65,w=Math.ceil(crop.width*scale),h=Math.ceil(crop.height*scale),cw=w+4,ch=h+4;
 // Uniform per-clip pivot; duplicate frames share an atlas cell.
 const unique=[],indices=[],seen=new Map();
 for(const b of buffers){const hash=createHash('sha256').update(b).digest('hex');if(!seen.has(hash)){seen.set(hash,unique.length);unique.push(b);}indices.push(seen.get(hash));}
 let cols=Math.min(8,Math.floor(2048/cw)),rows=Math.ceil(unique.length/cols);if(rows*ch>2048)throw Error('Atlas exceeds 2048 '+s.id);
 while(cols>1&&Math.ceil(unique.length/(cols-1))===rows)cols--;
 const width=cols*cw,height=rows*ch,layers=[],rects=[];
 for(let i=0;i<unique.length;i++){
  const x=i%cols*cw+2,y=Math.floor(i/cols)*ch+2;
  layers.push({input:await sharp(unique[i]).extract(crop).resize(w,h,{fit:'fill'}).png().toBuffer(),left:x,top:y});rects.push({x,y,w,h});
 }
 const output=dir+'runtime/'+s.id+'.png';await sharp({create:{width,height,channels:4,background:'#00000000'}}).composite(layers).png().toFile(output);
 const bytes=await fs.readFile(output),source=await fs.readFile(dir+s.source);
 manifest.effects[s.id]={tool:'Effekseer 1.70e',source:s.source,sourceSha256:createHash('sha256').update(source).digest('hex'),atlas:s.id+'.png',atlasSize:[width,height],sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,decodedBytes:width*height*4,frames:indices.map(i=>rects[i]),uniquePackedFrames:unique.length,fps:efk.fps,pivot:[(256-crop.left)*w/crop.width,(256-crop.top)*h/crop.height],rasterScale:[w/crop.width,h/crop.height],crop,sourceSize:[512,512],sourceStartFrame:lead*2,trimmedEmptyPreroll:lead,duration:indices.length/efk.fps,blend:s.blend};
 manifest.decodedBytes+=width*height*4;manifest.encodedBytes+=bytes.length;
 audit.push({id:s.id,bounds:[minX,minY,maxX,maxY],clipped:false,frames:buffers.length,uniqueFrames:unique.length,transparentFinal:stats.at(-1)===0,firstVisible:lead,lastVisible:last});
}
await fs.writeFile(dir+'runtime/fx-manifest.json',JSON.stringify(manifest,null,2));
await fs.writeFile(dir+'qa/packing.json',JSON.stringify({clips:audit,decodedMiB:manifest.decodedBytes/1048576,encodedBytes:manifest.encodedBytes,maxAtlasEdge:Math.max(...Object.values(manifest.effects).flatMap(s=>s.atlasSize))},null,2));
console.log({clips:audit.length,frames:audit.reduce((a,s)=>a+s.frames,0),decodedMiB:manifest.decodedBytes/1048576,encodedMiB:manifest.encodedBytes/1048576});
