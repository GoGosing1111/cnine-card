import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const {ORIGINAL_IP_MONSTERS}=await import(pathToFileURL(path.resolve('shared/monster-original-ip-data-v1.mjs')));
const root=process.cwd(),out='assets/ui/reverse-call/world-story-v2',archive='docs/qa/reverse-call-world-story-20261018/expansion/sources';
await fs.mkdir(out,{recursive:true});
const jobs=JSON.parse(await fs.readFile(archive+'/prompts.json','utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest={version:1,createdAt:'2026-10-18',scope:'World story presentation only; no roster, rewards or encounter settings changed.',generator:'built-in image_gen',promptSet:archive+'/prompts.json',visualApproval:'USER_REVIEW_PENDING',files:[]};
for(const job of jobs){
 const original=await fs.readFile(job.generatedPath),source=archive+'/'+job.id+'-source.png';
 await fs.writeFile(source,original);
 const portrait=job.id.endsWith('bust'),file=out+'/'+job.id+'.webp';
 await sharp(original).resize(portrait?720:1536,null,{withoutEnlargement:true}).webp({quality:88,alphaQuality:100}).toFile(file);
 const bytes=await fs.readFile(file),meta=await sharp(bytes).metadata();
 manifest.files.push({id:job.id,file,sha256:sha(bytes),source,sourceSha256:sha(original),reference:job.source||null,type:portrait?'generated-dialogue-cutout':'generated-scene',width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha});
}
const pairs=[['orze','raid-004-orthen'],['renzo','raid-006-haeryun'],['zeno','raid-008-noaren'],['isgen','raid-lich-nivar'],['varsen','raid-madara-vaelun'],['cedric','raid-core-astel']].map(([id,key])=>({id,...ORIGINAL_IP_MONSTERS.find(x=>x.key===key)}));
pairs.push({id:'valter',name:'발테르',sourceArt:'assets/ui/project-v/mercenaries/limited-20261002/v-996-source-art.png'},{id:'helios',name:'헬리오스',sourceArt:'assets/ui/project-v/mercenaries/approved-20261009/solar-sword-sss-limited-source-art.png'});
for(const item of pairs){
 const source=item.sourceArt.replace(/^\//,''),original=await fs.readFile(source),file=out+'/'+item.id+'.webp';
 await sharp(original).resize({width:1024,withoutEnlargement:true}).webp({quality:86}).toFile(file);
 const bytes=await fs.readFile(file),meta=await sharp(bytes).metadata();
 manifest.files.push({id:item.id,name:item.name,key:item.key||null,file,sha256:sha(bytes),source,sourceSha256:sha(original),type:'existing-approved-art-web-encoding',width:meta.width,height:meta.height});
}
await fs.writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({files:manifest.files.length,bytes:(await Promise.all(manifest.files.map(x=>fs.stat(x.file)))).reduce((s,x)=>s+x.size,0),alpha:manifest.files.filter(x=>x.type==='generated-dialogue-cutout').map(x=>[x.id,x.hasAlpha])}));
