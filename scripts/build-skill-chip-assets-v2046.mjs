import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=new URL('../assets/ui/project-v/skill-chips/',import.meta.url);
const rows=[];
await mkdir(base,{recursive:true});
for(const name of ['rocket-launcher','helicopter-airstrike']){
  const source=new URL(`source/${name}-source-v1.png`,base),bytes=await readFile(source),meta=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();
  if(!meta.hasAlpha||stats.channels[3].min!==0)throw new Error(`${name}: expected genuine generated alpha`);
  const png=await sharp(bytes).resize(512,512,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const webp=await sharp(png).webp({lossless:true,effort:6}).toBuffer();
  await writeFile(new URL(`${name}-v1.png`,base),png);await writeFile(new URL(`${name}-v1.webp`,base),webp);
  const hash=data=>createHash('sha256').update(data).digest('hex');
  rows.push({name,source:`source/${name}-source-v1.png`,sourceWidth:meta.width,sourceHeight:meta.height,sourceSha256:hash(bytes),image:`${name}-v1.webp`,width:512,height:512,alpha:true,pngSha256:hash(png),webpSha256:hash(webp),bytes:webp.length});
}
await writeFile(new URL('manifest-v1.json',base),JSON.stringify({generator:'BUILT_IN_IMAGEGEN',processing:'RESIZE_AND_LOSSLESS_ENCODE_ONLY',status:'RESOURCE_READY_RUNTIME_CONFIGURATION_PENDING',assets:rows},null,2)+'\n');
console.log(JSON.stringify(rows));
