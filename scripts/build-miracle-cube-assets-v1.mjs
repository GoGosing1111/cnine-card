import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const dir=new URL('../assets/ui/miracle-cube-v1/',import.meta.url);
const jobs=[['cube-closed-source.png','cube-closed.webp',960,true],['cube-opening-sheet-source.png','cube-opening.webp',1792,true],['contract-vault-source.png','contract-vault.webp',1536,false]];
const assets=[];
for(const [source,target,width,transparent]of jobs){
 const bytes=await fs.readFile(new URL(source,dir)),metadata=await sharp(bytes).metadata();
 if(transparent&&!metadata.hasAlpha)throw Error(source+' requires transparency');
 if(source.includes('sheet')&&metadata.width/4!==metadata.height/2)throw Error('Expected square cells in a 4 × 2 atlas');
 await sharp(bytes).resize({width,withoutEnlargement:true}).webp({quality:93,alphaQuality:100,effort:6}).toFile(new URL(target,dir).pathname.replace(/^\/(?:([A-Z]):)/i,'$1:'));
 assets.push({source,target,width:metadata.width,height:metadata.height,hasAlpha:metadata.hasAlpha,sourceSha256:createHash('sha256').update(bytes).digest('hex')});
}
await fs.writeFile(new URL('manifest.json',dir),JSON.stringify({version:'20261003-v1',generator:'built-in image_gen',assets,animation:{columns:4,rows:2,frames:8,stages:['sealed','unlock','seams','lid-lift','unfold','core-exposed','energy-release','open']},sourcePolicy:'Generated PNG originals retained; WebP exports only resize/encode, with original alpha preserved.'},null,2)+'\n');
console.log(JSON.stringify(assets));
