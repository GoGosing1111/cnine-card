import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PET_BUFF_VISUALS} from '../shared/pet-buff-visuals-v1.mjs';
const root=new URL('../',import.meta.url),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const resources=[];
for(const visual of Object.values(PET_BUFF_VISUALS)){
  const sourcePath='assets/ui/pets/buffs-v1/'+visual.slug+'-atlas-source.png',source=await readFile(new URL(sourcePath,root)),meta=await sharp(source).metadata();
  if(!meta.hasAlpha||meta.width!==meta.height*2)throw Error('Expected a transparent 4 x 2 source atlas');
  // Deterministic game export: preserve source art and align eight cells to whole pixels.
  const raster=await sharp(source).resize(1280,640).png().toBuffer();
  const atlas=await sharp(raster).webp({quality:94,alphaQuality:100,effort:6}).toBuffer();
  const frame=await sharp(raster).extract({left:960,top:0,width:320,height:320}).png().toBuffer();
  const icon=await sharp(frame).trim({threshold:12}).resize(192,192,{fit:'contain',background:'#00000000'}).webp({quality:96,alphaQuality:100,effort:6}).toBuffer();
  await writeFile(new URL(visual.atlas.slice(1),root),atlas);
  await writeFile(new URL(visual.icon.slice(1),root),icon);
  resources.push({type:visual.type,slug:visual.slug,frames:8,columns:4,rows:2,frameWidth:320,frameHeight:320,iconFrame:3,durationMs:visual.durationMs,source:{path:sourcePath,sha256:hash(source),width:meta.width,height:meta.height},atlas:{path:visual.atlas.slice(1),sha256:hash(atlas),bytes:atlas.length},icon:{path:visual.icon.slice(1),sha256:hash(icon),width:192,height:192,bytes:icon.length}});
}
await writeFile(new URL('assets/ui/pets/buffs-v1/manifest.json',root),JSON.stringify({version:1,created:'2026-10-03',generator:'image_gen.imagegen (built-in)',prompts:'preview/pet-buffs-v1/prompts.json',status:'RESOURCE_REVIEW',battleEnabled:false,acquisitionEnabled:false,resources},null,2)+'\n');
console.log(JSON.stringify(resources.map(({type,atlas,icon})=>({type,atlasBytes:atlas.bytes,iconBytes:icon.bytes}))));
