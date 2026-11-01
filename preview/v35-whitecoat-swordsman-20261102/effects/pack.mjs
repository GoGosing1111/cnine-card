import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url));
const efk=JSON.parse(await fs.readFile(dir+'effects.json','utf8'));
const specs=efk.effects.map(s=>({...s,fps:efk.fps,first:0,tool:'Effekseer'}));
await fs.mkdir(dir+'runtime',{recursive:true});
const manifest={schema:1,id:'whitecoat-distinct-cuts-v1',sourceDate:'2026-11-02',phase:'local V3 integration',alpha:'straight PNG; Pixi premultiplies on upload',effects:{},decodedBytes:0};
for(const s of specs){
 let minX=512,minY=512,maxX=-1,maxY=-1;const files=[],stats=[];
 for(let i=0;i<s.frames;i++){const file=`${dir}frames/${s.id}/frame-${String(i+s.first).padStart(4,'0')}.png`;files.push(file);const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});let opaque=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]){opaque++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}stats.push(opaque);}
 if(maxX<0)throw Error('Empty '+s.id);if(minX===0||minY===0||maxX===511||maxY===511)throw Error('Clipped '+s.id);
 // Effekseer spawns particles after initial update frames. Remove only that
 // empty pre-roll so visible impact starts on the engine's contact event.
 const lead=stats.findIndex(n=>n>0),packedFiles=files.slice(lead),packedStats=stats.slice(lead),frameCount=packedFiles.length;
 const crop={left:Math.max(0,minX-2),top:Math.max(0,minY-2),width:Math.min(512,maxX+3)-Math.max(0,minX-2),height:Math.min(512,maxY+3)-Math.max(0,minY-2)};
 const rasterScale=.75,outWidth=Math.ceil(crop.width*rasterScale),outHeight=Math.ceil(crop.height*rasterScale);
 const cell={w:outWidth+4,h:outHeight+4},cols=Math.min(8,Math.floor(2048/cell.w)),rows=Math.ceil(frameCount/cols),width=cols*cell.w,height=rows*cell.h;
 if(height>4096)throw Error('Atlas too tall');const layers=[],frames=[];
 for(let i=0;i<frameCount;i++){const x=(i%cols)*cell.w+2,y=Math.floor(i/cols)*cell.h+2;layers.push({input:await sharp(packedFiles[i]).extract(crop).resize(outWidth,outHeight,{fit:'fill'}).png().toBuffer(),left:x,top:y});frames.push({x,y,w:outWidth,h:outHeight});}
 const output=dir+'runtime/'+s.id+'.png';await sharp({create:{width,height,channels:4,background:'#00000000'}}).composite(layers).png().toFile(output);
 const bytes=await fs.readFile(output);manifest.effects[s.id]={tool:s.tool,source:s.source,atlas:s.id+'.png',atlasSize:[width,height],sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,frames,fps:s.fps,pivot:[(s.pivot[0]-crop.left)*outWidth/crop.width,(s.pivot[1]-crop.top)*outHeight/crop.height],rasterScale:[outWidth/crop.width,outHeight/crop.height],crop,sourceSize:[512,512],sourceStartFrame:s.first+lead,trimmedEmptyPreroll:lead,blend:s.blend,nonemptyPixels:packedStats,playbackRate:s.id==='debris'?1.4:1};manifest.decodedBytes+=width*height*4;
}
await fs.writeFile(dir+'runtime/fx-manifest.json',JSON.stringify(manifest,null,2));console.log({effects:Object.fromEntries(Object.entries(manifest.effects).map(([id,s])=>[id,{crop:s.crop,atlas:s.atlasSize,bytes:s.bytes,frames:s.frames.length}])),decodedMiB:manifest.decodedBytes/1024/1024});
