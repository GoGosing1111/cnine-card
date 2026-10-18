import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root='assets/effects/equipment-sets-20261019';
const hash=data=>createHash('sha256').update(data).digest('hex');
const assets=[];
for(const set of ['emperor','arden'])for(const name of ['crest','ground','impact-sequence']){
  const source=`${root}/${set}/source/${name}.png`,runtime=`${root}/${set}/${name}.webp`,data=await fs.readFile(source),meta=await sharp(data).metadata();
  if(!meta.hasAlpha)throw Error(source+' must retain generated transparency');
  const animation=name==='impact-sequence',width=animation?1200:768,height=animation?900:768;
  await sharp(data).resize(width,height,{fit:'fill'}).webp({quality:88,alphaQuality:100,effort:6}).toFile(runtime);
  assets.push({set,name,source,sourceSha256:hash(data),sourceSize:[meta.width,meta.height],runtime,runtimeSha256:hash(await fs.readFile(runtime)),runtimeSize:[width,height],...(animation?{columns:4,rows:3,frames:12,durationSeconds:.7}:{} )});
}
await fs.writeFile(root+'/manifest.json',JSON.stringify({version:1,scope:'USER_EQUIPMENT_BATTLE_VISUAL_ONLY',trigger:'TOP + BOTTOM + SHOES + ACCESSORY, same set, each >=10',mode:'built-in image_gen',prompts:root+'/prompts.json',artReview:'Technical checks recorded; not a claim of separate user visual approval',assets},null,2)+'\n');
console.log(assets.map(a=>({set:a.set,name:a.name,sourceSize:a.sourceSize,runtimeSize:a.runtimeSize})));
