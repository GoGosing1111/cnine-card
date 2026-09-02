import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const assetDir=join(root,'assets','ui','project-v','fx','ballistic-impact-v1');
const sourceDir=join(assetDir,'sources');
const definitions=[
  {
    id:'muzzle',
    source:'muzzle-flash-authored-v1.png',
    output:'muzzle-flash-atlas-v1.png',
    width:1024,
    height:512,
    columns:4,
    rows:2,
    frameCount:8,
    fps:72
  },
  {
    id:'tracer',
    source:'tracer-authored-v1.png',
    output:'tracer-atlas-v1.png',
    width:768,
    height:512,
    columns:3,
    rows:2,
    frameCount:6,
    fps:0
  },
  {
    id:'impact',
    source:'monster-impact-authored-v1.png',
    output:'monster-impact-atlas-v1.png',
    width:1024,
    height:512,
    columns:4,
    rows:2,
    frameCount:8,
    fps:42
  }
];

const sha256=async file=>createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase();

async function inspectCells(file,{columns,rows,frameCount}){
  const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const cellWidth=info.width/columns;
  const cellHeight=info.height/rows;
  if(!Number.isInteger(cellWidth)||!Number.isInteger(cellHeight))throw new Error(`NON_INTEGER_GRID:${file}`);
  const cells=[];
  for(let index=0;index<frameCount;index+=1){
    const column=index%columns,row=Math.floor(index/columns);
    let left=cellWidth,top=cellHeight,right=-1,bottom=-1,pixels=0;
    for(let y=0;y<cellHeight;y+=1){
      for(let x=0;x<cellWidth;x+=1){
        const offset=((row*cellHeight+y)*info.width+(column*cellWidth+x))*4;
        if(data[offset+3]<8)continue;
        left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);pixels+=1;
      }
    }
    if(pixels<96)throw new Error(`EMPTY_VFX_CELL:${file}:${index}:${pixels}`);
    cells.push({index,column,row,visibleBounds:{left,top,right,bottom,width:right-left+1,height:bottom-top+1},alphaPixels:pixels});
  }
  return {width:info.width,height:info.height,cellWidth,cellHeight,cells};
}

const assets=[];
for(const definition of definitions){
  const sourcePath=join(sourceDir,definition.source);
  const outputPath=join(assetDir,definition.output);
  const sourceMetadata=await sharp(sourcePath).metadata();
  if(!sourceMetadata.hasAlpha)throw new Error(`SOURCE_ALPHA_REQUIRED:${definition.source}`);
  await sharp(sourcePath)
    .resize(definition.width,definition.height,{fit:'fill',kernel:sharp.kernel.lanczos3})
    .png({compressionLevel:9,adaptiveFiltering:true,palette:false})
    .toFile(outputPath);
  const grid=await inspectCells(outputPath,definition);
  assets.push({
    id:definition.id,
    source:`sources/${definition.source}`,
    sourceSha256:await sha256(sourcePath),
    url:`/assets/ui/project-v/fx/ballistic-impact-v1/${definition.output}`,
    output:definition.output,
    sha256:await sha256(outputPath),
    grid:{columns:definition.columns,rows:definition.rows,frameCount:definition.frameCount,...grid},
    fps:definition.fps,
    alpha:'STRAIGHT_RGBA'
  });
}

const manifest={
  schemaVersion:'project-v-v3-ballistic-vfx-v1',
  renderer:'PIXI_RASTER_ATLAS',
  cssEffects:false,
  assets
};
await writeFile(join(assetDir,'manifest-v1.json'),`${JSON.stringify(manifest,null,2)}\n`,'utf8');
console.log(JSON.stringify(manifest,null,2));
