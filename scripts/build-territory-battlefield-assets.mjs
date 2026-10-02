import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const root=new URL('../assets/ui/territory-war/battlefield-v5/',import.meta.url);
const source=new URL('battlefield-panorama-source-v1.png',root);
for(const width of [1600,960]){
  await sharp(source.pathname.replace(/^\/([A-Za-z]:)/,'$1')).resize({width,withoutEnlargement:true}).webp({quality:86}).toFile(new URL('battlefield-panorama-'+width+'.webp',root).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
}
const manifest={createdAt:'2026-10-03',tool:'image_gen.imagegen',type:'territory-war-environment',source:'battlefield-panorama-source-v1.png',sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),runtime:['battlefield-panorama-1600.webp','battlefield-panorama-960.webp'],constraints:['no baked-in UI','straight rigid guns and rails','preserve original generated PNG']};
manifest.facilities=[];
for(const key of ['relay','supply','cannon']){
  const input=new URL(key+'-source-v1.png',root),runtime=[];
  for(const width of [640,320]){
    const name=key+'-'+width+'.webp';
    await sharp(fileURLToPath(input)).resize({width,withoutEnlargement:true}).webp({quality:90}).toFile(fileURLToPath(new URL(name,root)));
    runtime.push(name);
  }
  manifest.facilities.push({key,source:key+'-source-v1.png',sha256:crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'),runtime});
}
fs.writeFileSync(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
