import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const dir='preview/legion-mercenary-equipment-20261011',output='assets/ui/mercenary-equipment/legion-20261011';
const manifest=JSON.parse(await fs.readFile(dir+'/generation-manifest.json','utf8'));
await fs.mkdir(dir+'/sources',{recursive:true});await fs.mkdir(output,{recursive:true});
const assets=[];
for(const item of manifest.assets){
  const source=dir+'/sources/'+item.id+'.png',target=output+'/'+item.id+'.webp';
  try{await fs.access(source);}catch{await fs.copyFile(item.sourcePath,source);}
  const original=await fs.readFile(source),meta=await sharp(original).metadata();
  if(!meta.hasAlpha)throw Error('Missing real alpha: '+item.id);
  await sharp(original).resize(512,512,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality:90,alphaQuality:100,effort:6}).toFile(target);
  assets.push({id:item.id,source,target,sourceSha256:createHash('sha256').update(original).digest('hex'),width:meta.width,height:meta.height,bytes:(await fs.stat(target)).size});
}
await fs.writeFile(dir+'/assets.json',JSON.stringify({version:1,generator:'built-in image_gen',assets},null,2)+'\n');
console.log(JSON.stringify({assets:assets.length,runtimeBytes:assets.reduce((sum,item)=>sum+item.bytes,0)}));
