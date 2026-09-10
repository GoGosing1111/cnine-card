import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {MERCENARY_SKILLS} from '../shared/mercenary-skills-v1.mjs';
const root='preview/project-v-mercenary-system-v1/skill-assets';
const input=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
async function writeChanged(file,bytes){
  let previous;try{previous=await fs.readFile(file)}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!previous?.equals(bytes))await fs.writeFile(file,bytes);
}
await fs.mkdir(`${root}/source`,{recursive:true});
const images=[],errors=[];
for(const skill of MERCENARY_SKILLS){
  const id=skill.visual.asset,row=input.find(i=>i.id===id);if(!row)throw new Error(`Missing generation: ${id}`);
  const source=await fs.readFile(row.path),meta=await sharp(source).metadata();
  if(!meta.hasAlpha)throw new Error(`Transparent alpha missing: ${id}`);
  await writeChanged(`${root}/source/${id}.png`,source);
  // Mechanical, uniform deployment encoding only. No painting, cutout, recolor or alpha replacement.
  const runtime=await sharp(source).resize(512,512,{fit:'inside',withoutEnlargement:true}).webp({lossless:true,effort:6}).toBuffer();
  await writeChanged(`${root}/${id}.webp`,runtime);
  const {data,info}=await sharp(runtime).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let transparent=0,opaque=0,solid=0,edgeMax=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const a=data[(y*info.width+x)*4+3];if(a===0)transparent++;if(a===255)opaque++;if(a>=192)solid++;
    if(x<2||y<2||x>=info.width-2||y>=info.height-2)edgeMax=Math.max(edgeMax,a);
  }
  if(transparent<info.width*info.height*.15||solid<25||edgeMax>5)errors.push(`Alpha QA failed: ${id} (edge ${edgeMax}, solid ${solid})`);
  images.push({id,skillId:skill.id,code:skill.code,source:`skill-assets/source/${id}.png`,runtime:`skill-assets/${id}.webp`,
    sourceSha256:hash(source),runtimeSha256:hash(runtime),sourceSize:[meta.width,meta.height],runtimeSize:[info.width,info.height],bytes:runtime.length,
    alpha:{transparentFraction:transparent/(info.width*info.height),opaquePixels:opaque,solidPixels:solid,edgeMax},
    generation:'BUILT_IN_IMAGEGEN',prompt:row.prompt,originalFilename:path.basename(row.path.replaceAll('\\','/'))});
}
if(errors.length)throw new Error(errors.join('\n'));
const lock=JSON.parse(await fs.readFile('package-lock.json','utf8'));
await fs.writeFile(`${root}/manifest.json`,JSON.stringify({id:'mercenary-signature-skills-v1',date:'2026-09-10',status:'TECH_QA_PENDING_USER_REVIEW',runtimeEnabled:false,
  renderer:{pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version,engine:'preview/project-v-v3/source/battle/BattleEngine.js',effects:'preview/project-v-mercenary-system-v1/source/MercenarySkillFX.js',timeline:'V3_REGISTERED_GSAP',unit:'SECONDS',atlasAutoPlayback:false},
  encoding:'Uniform fit-inside 512px lossless WebP; original generated PNG bytes preserved.',audio:'SILENT_REVIEW_NO_NEW_AUDIO',images},null,2)+'\n');
console.log(`Prepared ${images.length} distinct effect sprites; ${images.reduce((n,r)=>n+r.bytes,0)} runtime bytes.`);
