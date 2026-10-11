// Deterministic atlas extraction only. Artwork is authored by image_gen, never redrawn here.
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('assets/',import.meta.url),out=new URL('animation/',folder);
await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const specs=[['cast','madara-cast-poses-v2.png',2,2],['illusion','illusion-fx-sheet-v3.png',4,3],['clones','clones-fx-sheet-v3.png',4,3],['fire','fire-fx-sheet-v3.png',4,3],['meteor','meteor-fx-sheet-v3.png',4,3],['awakening','azure-awakening-fx-sheet-v3.png',4,3]];
const manifest={version:2,reviewOnly:true,visualApproval:'PENDING',clock:'SHARED_V3_GSAP',bodyWeapon:'UNARMED; final-form original sword is preserved in the static source pose.',atlases:{}};
for(const [key,file,columns,rows]of specs){
  const source=await readFile(new URL(file,folder)),meta=await sharp(source).metadata();
  if(!meta.hasAlpha)throw new Error(file+' requires real alpha');
  const cellW=Math.floor(meta.width/columns),cellH=Math.floor(meta.height/rows),size=key==='cast'?640:384,pad=key==='cast'?16:8;
  const scale=(size-pad*2)/Math.max(cellW,cellH),w=Math.round(cellW*scale),h=Math.round(cellH*scale),x=Math.floor((size-w)/2),y=Math.floor((size-h)/2),frames=[],composite=[];
  for(let i=0;i<columns*rows;i++){
    const crop=await sharp(source).extract({left:i%columns*cellW,top:Math.floor(i/columns)*cellH,width:cellW,height:cellH}).resize(w,h,{fit:'fill'}).png().toBuffer();
    const frame=await sharp({create:{width:size,height:size,channels:4,background:'#00000000'}}).composite([{input:crop,left:x,top:y}]).png().toBuffer();
    const rgba=await sharp(frame).ensureAlpha().raw().toBuffer();let minX=size,minY=size,maxX=0,maxY=0;
    for(let py=0;py<size;py++)for(let px=0;px<size;px++)if(rgba[(py*size+px)*4+3]>160){minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);}
    const pivot=key==='cast'?{x:x+[320,340,332,335][i]*scale,y:y+620*scale}:{x:size/2,y:size/2};
    const emission=key==='cast'?{x:x+[195,278,54,187][i]*scale,y:y+[225,187,122,316][i]*scale}:null;
    await writeFile(new URL(`${key}-${String(i).padStart(2,'0')}.png`,out),frame);
    composite.push({input:frame,left:i%columns*size,top:Math.floor(i/columns)*size});
    frames.push({rect:{x:i%columns*size,y:Math.floor(i/columns)*size,width:size,height:size},pivot,emission,opaqueBounds:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},sha256:hash(frame)});
  }
  const packed=await sharp({create:{width:columns*size,height:rows*size,channels:4,background:'#00000000'}}).composite(composite).png().toBuffer();
  await writeFile(new URL(`${key}-atlas-v2.png`,out),packed);
  manifest.atlases[key]={url:`assets/animation/${key}-atlas-v2.png`,source:file,sourceSha256:hash(source),sha256:hash(packed),columns,rows,frameSize:size,referenceHeight:key==='cast'?600*scale:null,packing:{uniformScale:scale,padding:pad,sourceCell:[cellW,cellH]},frames};
}
await writeFile(new URL('presentation-manifest.json',folder),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(manifest.atlases).map(([key,s])=>[key,s.frames.length]))));
