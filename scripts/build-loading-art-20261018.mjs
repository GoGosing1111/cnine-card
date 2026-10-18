import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const root=new URL('../assets/ui/loading/reverse-call-20261018/',import.meta.url);
const input=name=>new URL(name,root).pathname.replace(/^\/(?=[A-Za-z]:\/)/,'');
// Preserve generated originals. Only responsive encoding and alpha-margin extraction.
await sharp(input('scene-source.png')).webp({quality:84,effort:6}).toFile(input('scene-wide.webp'));
await sharp(input('scene-source.png')).resize({width:1100,withoutEnlargement:true}).webp({quality:82,effort:6}).toFile(input('scene-mobile.webp'));
await sharp(input('rail-source.png')).extract({left:69,top:319,width:2035,height:85}).webp({lossless:true,effort:6}).toFile(input('rail.webp'));
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
manifest.status='Implemented and technically reviewed; user visual approval not claimed';
manifest.derivation={scene:'Original dimensions, WebP quality 84. Mobile proportional 1100px, quality 82.',rail:'Only transparent outer margin removed at (69,319,2035,85), lossless WebP; no painted or regenerated pixels.'};
manifest.files=[];
for(const file of ['scene-source.png','rail-source.png','scene-wide.webp','scene-mobile.webp','rail.webp']){
  const bytes=await fs.readFile(new URL(file,root)),meta=await sharp(bytes).metadata();
  manifest.files.push({file,bytes:bytes.length,width:meta.width,height:meta.height,alpha:meta.hasAlpha,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest.files.map(({file,bytes,width,height})=>({file,bytes,width,height})),null,2));
