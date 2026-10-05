import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
const dest='assets/ui/packs/limited-v1';
await fs.mkdir(dest,{recursive:true});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const files=[];
async function build(source,name,width,quality=85,expected){
 const bytes=await fs.readFile(source),hash=digest(bytes);
 if(expected&&expected!==hash)throw Error('Approved asset hash mismatch: '+source);
 const target=dest+'/'+name;
 await sharp(bytes).resize({width,withoutEnlargement:true}).webp({quality,alphaQuality:95}).toFile(target);
 const out=await fs.readFile(target),meta=await sharp(out).metadata();
 files.push({source,sourceSha256:hash,path:target,sha256:digest(out),bytes:out.length,width:meta.width,height:meta.height});
 if(digest(await fs.readFile(source))!==hash)throw Error('Source modified');
}
await build('preview/mercenary-limited-pack-20261006-v1/assets/chamber-source.png','chamber.webp',1536,83);
await build('assets/ui/packs/mercenary-limited-edition-pack-20261003-v1.png','pack-640.webp',640,86);
await build(LIMITED_MERCENARIES[0].frame,'frame-640.webp',640,88,LIMITED_MERCENARIES[0].frameSha256);
for(const card of LIMITED_MERCENARIES)await build(card.sourceArt,card.code.toLowerCase()+'-640.webp',640,86,card.sourceArtSha256);
await fs.writeFile(dest+'/manifest.json',JSON.stringify({version:'20261006',originalsPreserved:true,files,totalBytes:files.reduce((n,f)=>n+f.bytes,0)},null,2)+'\n');
console.log(JSON.stringify({files:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0),largest:Math.max(...files.map(f=>f.bytes))}));
