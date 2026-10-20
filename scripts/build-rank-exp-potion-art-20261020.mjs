import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('../assets/items/rank-exp-potions-20261020/',import.meta.url),assets=[];
for(const name of ['2x','3x','panel']){
 const source=name+'-source.png',runtime=name+'.webp',buffer=await readFile(new URL(source,dir)),metadata=await sharp(buffer).metadata(),stats=await sharp(buffer).stats();
 await sharp(buffer).resize({width:name==='panel'?768:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:90,alphaQuality:100}).toFile(fileURLToPath(new URL(runtime,dir)));
 const output=await readFile(new URL(runtime,dir));
 assets.push({source,runtime,sourceSha256:createHash('sha256').update(buffer).digest('hex'),runtimeSha256:createHash('sha256').update(output).digest('hex'),width:metadata.width,height:metadata.height,hasAlpha:metadata.hasAlpha,transparentPixels:!stats.isOpaque,bytes:output.length});
}
await writeFile(new URL('manifest.json',dir),JSON.stringify({date:'2026-10-20',mode:'built-in image_gen',prompts:'prompts.json',userVisualApproval:false,derivation:'Unmodified generated originals; proportion-preserving resize and WebP encoding only.',consumers:['inventory','season-pass catalog','rank-potion confirmation','live-operations personal status'],assets},null,2)+'\n');
console.log(JSON.stringify(assets));
