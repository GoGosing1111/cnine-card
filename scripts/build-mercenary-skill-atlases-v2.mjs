import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {MERCENARY_SKILLS} from '../shared/mercenary-skills-v1.mjs';

const root='preview/project-v-mercenary-system-v1/skill-assets-v2';
const inputPath=process.argv[2]||`${root}/generation-inputs.json`;
const inputs=JSON.parse(await fs.readFile(inputPath,'utf8'));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
const images=[];
const previous=JSON.parse(await fs.readFile(`${root}/manifest.json`,'utf8').catch(()=>'{"images":[]}'));
await fs.mkdir(`${root}/source`,{recursive:true});
for(const row of inputs){
  if(row.status!=='SELECTED')continue;
  const skill=MERCENARY_SKILLS.find(s=>s.id===row.skillId);
  if(!skill||row.id!==skill.visual.asset)throw new Error(`Unknown skill atlas: ${row.id}`);
  const source=await fs.readFile(row.path),meta=await sharp(source).metadata();
  const cached=previous.images.find(i=>i.id===row.id&&i.sourceSha256===digest(source)&&i.prompt===row.prompt);
  if(cached&&await fs.access(`${root}/${cached.runtime}`).then(()=>true,()=>false)){
    const {code,...asset}=cached;
    images.push({...asset,...(code?{creationReferenceCode:code}:{}),visualReview:row.visualReview||cached.visualReview,...(row.timeline?{timeline:row.timeline}:{})});console.log(`${skill.id}: preserved existing 16-frame sequence`);continue;
  }
  if(!meta.hasAlpha||meta.width!==meta.height||meta.width<1024)throw new Error(`${row.id}: expected square RGBA 4 by 4 sheet, >=256px native cells`);
  const cell=Math.ceil(meta.width/4),tiles=[];
  const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const frames=[];
  await fs.mkdir(`${root}/${row.id}/frames`,{recursive:true});
  for(let i=0;i<16;i++){
    const col=i%4,rowIndex=Math.floor(i/4),left=Math.round(col*meta.width/4),top=Math.round(rowIndex*meta.height/4);
    const width=Math.round((col+1)*meta.width/4)-left,height=Math.round((rowIndex+1)*meta.height/4)-top;
    let edgeMax=0,opaque=0,nonempty=0,alphaTotal=0,minX=cell,minY=cell,maxX=-1,maxY=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const a=data[((top+y)*info.width+left+x)*4+3];alphaTotal+=a;
      if(a>0)nonempty++;if(a>192)opaque++;
      if(a>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
      if(x<2||y<2||x>=width-2||y>=height-2)edgeMax=Math.max(edgeMax,a);
    }
    if(edgeMax>5)throw new Error(`${row.id} frame ${i+1}: visible material crosses cell edge (${edgeMax})`);
    if(nonempty===0&&i!==15)throw new Error(`${row.id} frame ${i+1}: only the final extinction frame may be empty`);
    const tile=await sharp(source).extract({left,top,width,height}).extend({top:0,left:0,right:cell-width,bottom:cell-height,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    const raw=await sharp(tile).raw().toBuffer();
    const webp=await sharp(tile).webp({lossless:true,effort:6}).toBuffer();
    tiles.push({input:tile,left:col*cell,top:rowIndex*cell});
    const file=`${row.id}/frames/${String(i+1).padStart(2,'0')}.webp`;
    await fs.writeFile(`${root}/${file}`,webp);
    frames.push({index:i,file,rawSha256:digest(raw),sha256:digest(webp),edgeMax,opaque,nonempty,alphaTotal,
      bounds:maxX<0?null:[minX,minY,maxX+1,maxY+1],size:[cell,cell]});
  }
  if(new Set(frames.map(f=>f.rawSha256)).size!==16)throw new Error(`${row.id}: duplicated animation frame`);
  // Exact source preservation, grid slicing and lossless encoding only. No
  // chroma key, content painting, alpha replacement or fabricated in-between frames.
  const runtime=await sharp({create:{width:cell*4,height:cell*4,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(tiles).webp({lossless:true,effort:6}).toBuffer();
  const sourceFile=`source/${row.id}-sequence-v2.png`,runtimeFile=`${row.id}/atlas-v2.webp`;
  await fs.writeFile(`${root}/${sourceFile}`,source);await fs.writeFile(`${root}/${runtimeFile}`,runtime);
  images.push({id:row.id,skillId:skill.id,name:skill.name,source:sourceFile,runtime:runtimeFile,
    sourceSha256:digest(source),runtimeSha256:digest(runtime),sourceSize:[meta.width,meta.height],size:[cell*4,cell*4],cellSize:cell,columns:4,rows:4,frameCount:16,
    generation:'BUILT_IN_IMAGEGEN',prompt:row.prompt,sourceFilename:row.originalFilename||path.basename(row.path.replaceAll('\\','/')),
    visualReview:row.visualReview||'PENDING',...(row.timeline?{timeline:row.timeline}:{}),runtimeBytes:runtime.length,frames});
  console.log(`${skill.id}: 16 unique RGBA frames, ${cell}px cells, clean alpha gutters`);
}
await fs.writeFile(`${root}/manifest.json`,JSON.stringify({id:'mercenary-authored-skill-atlases-v2',date:'2026-09-11',status:'USER_REVIEW_PENDING',
  assignmentPolicy:'INDEPENDENT_SKILL_CATALOG_USER_ASSIGNED',
  replaces:'USER_REJECTED_V1_SINGLE_SPRITE_TWEENS',runtimeEnabled:false,frameCount:images.length*16,images,
  reference:{skills:['SKILL_CHIP_ROCKET_LAUNCHER','SKILL_CHIP_HELICOPTER_AIRSTRIKE'],file:'preview/battle-suit-skill-chip-v1/source/SkillChipFX.js'},
  renderer:{pixi:'8.20.0',gsap:'3.13.0',timeline:'V3_REGISTERED_GSAP',autoAnimationTicker:false,
    files:['source/MercenarySpriteSequence.js','source/MercenarySkillFX.js','source/RenderAuthoredSkill.js','source/skills-lab.src.js'],
    layers:['EXISTING_V3_EFFECT_LAYER','EXISTING_V3_COMBAT_GROUND_LAYER'],
    atlasOrigin:{x:.5,y:.55},authoredContactFrame:4,
    contactAuthority:'skill-rehearsal.mjs resolved offline events; no live damage calculation',
    bodyContact:'SD foot origin minus fullBodyHeight * root.scale.y * 0.54',
    firearmEmission:'Approximate body-relative origin on existing idle SD; dedicated joint/aim sprites not authored'},
  processing:'Exact native grid extraction and lossless WebP encoding. Native original bytes preserved. No synthetic in-between images.',
  audio:'SILENT_VISUAL_REVIEW'},null,2)+'\n');
console.log(`${images.length} individual skill sequences / ${images.length*16} actual frames`);
