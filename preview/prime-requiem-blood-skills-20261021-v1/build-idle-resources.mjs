import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const labels={
  'fx-idle-shattered-moon-v7':'정자세 · 부서진 원형 적월',
  'fx-idle-blackflame-v6':'정자세 · 검은 살기'
};

// Inspect the two new atlases without rebuilding or editing approved assets.
export async function attachIdleResources(root,manifest){
  const promptPath=path.join(root,'prompts-idle-v7.json');
  const prompts=JSON.parse(await fs.readFile(promptPath,'utf8'));
  const specs=[...prompts.assets];
  for(const ref of prompts.preservedAssets||[]){
    const previous=JSON.parse(await fs.readFile(path.join(root,ref.source),'utf8'));
    const spec=previous.assets.find(asset=>asset.key===ref.key);
    if(!spec)throw Error('PRESERVED_IDLE_ASSET_MISSING: '+ref.key);
    specs.push(spec);
  }
  for(const spec of specs){
    const bytes=await fs.readFile(path.join(root,spec.output.path));
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const meta=await sharp(bytes).metadata(),[columns,rows]=spec.grid,frames=[];
    if(!meta.hasAlpha)throw Error('IDLE_ASSET_REQUIRES_TRUE_ALPHA: '+spec.key);
    for(let i=0;i<columns*rows;i++){
      const col=i%columns,row=Math.floor(i/columns);
      const x=Math.round(col*info.width/columns),y=Math.round(row*info.height/rows);
      const width=Math.round((col+1)*info.width/columns)-x,height=Math.round((row+1)*info.height/rows)-y;
      let x0=width,y0=height,x1=-1,y1=-1,clear=0,border=0;const pixels=[];
      for(let yy=0;yy<height;yy++){
        const start=((y+yy)*info.width+x)*4;pixels.push(data.subarray(start,start+width*4));
        for(let xx=0;xx<width;xx++){
          const a=data[start+xx*4+3];if(a<=8)clear++;
          if(a>96){
            x0=Math.min(x0,xx);y0=Math.min(y0,yy);x1=Math.max(x1,xx);y1=Math.max(y1,yy);
            if(xx<2||yy<2||xx>=width-2||yy>=height-2)border++;
          }
        }
      }
      if(x1<0||clear/(width*height)<.2)throw Error('IDLE_ASSET_EMPTY_OR_OPAQUE: '+spec.key+' '+i);
      frames.push({index:i,rect:{x,y,width,height},bounds:[x0,y0,x1,y1],clearRatio:clear/(width*height),
        borderPixels:border,pixelSha256:hash(Buffer.concat(pixels))});
    }
    const record={path:spec.output.path,label:labels[spec.key],width:info.width,height:info.height,
      sha256:hash(bytes),bytes:bytes.length,hasAlpha:true,columns,rows,frames,
      frameCount:frames.length,uniqueFrameCount:new Set(frames.map(f=>f.pixelSha256)).size,
      artHeight:Math.max(...frames.map(f=>f.bounds[3]-f.bounds[1]+1)),
      frameConsumption:'ORIGINAL_RGBA_ATLAS_WITH_INTERPOLATED_FRAME_BLEND'};
    if(record.uniqueFrameCount!==record.frameCount)throw Error('DUPLICATE_IDLE_FRAMES: '+spec.key);
    manifest.sheets[spec.key]=record;spec.output.sha256=record.sha256;
  }
  delete manifest.sheets['fx-idle-shattered-moon-v6'];
  manifest.revision.idleAura={name:'부서진 원형 적월 · 검은 살기',moon:'fx-idle-shattered-moon-v7',
    blackflame:'fx-idle-blackflame-v6',duration:6.4,standingBloodVisible:false,bodyPixelsChanged:false,
    motion:'SLOW_FRAME_BLEND_AND_NEON_BREATH',source:'prompts-idle-v7.json',
    alignment:'MIDPOINT_OF_HELMET_AND_CHEST_AXIS_NO_RIGHT_OFFSET',
    silhouette:'BLUNT_FRACTURED_CIRCULAR_MOON_WITHOUT_HORN_TIPS',
    previousSource:'prompts-idle-v6.json'};
  manifest.renderer.idleEffects='source/PrimeIdleAura.js';
  await fs.writeFile(promptPath,JSON.stringify(prompts,null,2)+'\n');
  return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.dirname(fileURLToPath(import.meta.url)),file=path.join(root,'manifest.json');
  const manifest=await attachIdleResources(root,JSON.parse(await fs.readFile(file,'utf8')));
  await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify(Object.keys(labels).map(key=>({key,frames:manifest.sheets[key].frameCount,
    alpha:manifest.sheets[key].hasAlpha,edgeWarnings:manifest.sheets[key].frames.filter(f=>f.borderPixels).map(f=>({frame:f.index,pixels:f.borderPixels}))}))));
}
