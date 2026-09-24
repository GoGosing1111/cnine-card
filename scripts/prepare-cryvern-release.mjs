// Offline only: immutable approved art copies and preview candidate metadata.
// No production catalog changes unless the user-held release gate is opened.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {CRYVERN_RELEASE_ENABLED,CRYVERN_PREVIEW,CRYVERN_CODE,CRYVERN_ASSETS,CRYVERN_HASHES} from '../shared/mercenary-cryvern-v1.mjs';
import {prepareCryvernCandidate,appendCryvernRoster} from '../preview/mercenary-ice-crystal-dual-sword-v1/release/registration.mjs';
const root=new URL('../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root),'utf8'));
const manifest=await read(CRYVERN_PREVIEW+'manifest.json');
if(process.argv.includes('--register-local')&&!CRYVERN_RELEASE_ENABLED)throw Error('CRYVERN_HELD_BY_USER: live approval and reviewed release-switch change are required first');
for(const [path,hash] of [[manifest.sourceArt,manifest.sourceArtInfo.sha256],[manifest.battleSprite,manifest.battleSpriteInfo.sha256]])
 if(createHash('sha256').update(await fs.readFile(new URL(path,root))).digest('hex').toUpperCase()!==hash)throw Error('CRYVERN_ASSET_CHANGED');
const candidate=prepareCryvernCandidate(seed,manifest),rosterFile='assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase(),media=[];
for(const [kind,key] of [['art','sourceArt'],['sd','battleSprite']]){
 const bytes=await fs.readFile(new URL(manifest[key],root)),target=new URL(CRYVERN_ASSETS[key],root);
 try{if(hash(await fs.readFile(target))!==CRYVERN_HASHES[key])throw Error('CRYVERN_ASSET_COLLISION');}
 catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(target,bytes,{flag:'wx'});}
 for(const width of kind==='art'?[320,640]:[640]){
  const file=`v-049-${kind}-${width}.webp`,buffer=await sharp(bytes).resize({width,withoutEnlargement:true}).webp({quality:kind==='art'?88:90,effort:5}).toBuffer();
  await fs.writeFile(new URL('assets/ui/project-v/mercenaries/codex-v1/'+file,root),buffer);
  const meta=await sharp(buffer).metadata();media.push({code:CRYVERN_CODE,kind,file,width:meta.width,height:meta.height,bytes:buffer.length,source:CRYVERN_ASSETS[key],sourceSha256:hash(bytes),sha256:hash(buffer)});
 }
}
const fxBase='../../mercenary-ice-crystal-dual-sword-v1/',spec=manifest.effects.ultimate,frames=[];
for(const frame of spec.frames){
 const bytes=await fs.readFile(new URL(CRYVERN_PREVIEW+frame.file,root)),{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let x0=info.width,y0=info.height,x1=-1,y1=-1,alphaPixels=0,nonempty=0,edgeMax=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];if(a)nonempty++;
  if(a>=24){alphaPixels++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(x===0||y===0||x===info.width-1||y===info.height-1)edgeMax=Math.max(edgeMax,a);
 }
 frames.push({...frame,file:fxBase+frame.file,bounds:alphaPixels?[x0,y0,x1,y1]:null,alphaPixels,nonempty,edgeMax,size:[info.width,info.height],rawSha256:createHash('sha256').update(data).digest('hex').toUpperCase()});
}
const effect={id:'crystal-crown',skillId:'MS-049',name:'극빙 왕관',source:fxBase+spec.source,runtime:fxBase+spec.atlas,
 sourceSha256:spec.sourceInfo.sha256,runtimeSha256:spec.atlasSha256,sourceSize:[spec.sourceInfo.width,spec.sourceInfo.height],
 size:[spec.cellSize*spec.columns,spec.cellSize*spec.rows],cellSize:spec.cellSize,columns:4,rows:4,frameCount:16,
 generation:'BUILT_IN_IMAGE_GEN',visualReview:'2026-09-22 연출 승인 · 2026-09-24 라이브 승인',creationReferenceCode:CRYVERN_CODE,frames};
candidate.registration.effect=effect;
if(!candidate.catalog.effects.images.some(r=>r.skillId==='MS-049'))candidate.catalog.effects.images.push(effect);
candidate.catalog.effects.frameCount=candidate.catalog.effects.images.reduce((sum,r)=>sum+r.frameCount,0);
const roster=appendCryvernRoster(await read(rosterFile),candidate.registration.card);
const write=(p,v)=>fs.writeFile(new URL(p,root),JSON.stringify(v,null,2)+'\n');
if(process.argv.includes('--register-local')){
 if(!CRYVERN_RELEASE_ENABLED)throw Error('CRYVERN_HELD_BY_USER: live approval and reviewed release-switch change are required first');
 // Scope is local checked-out JSON only. No SQL, HTTP writes, deploy or push.
 const positionFile='preview/project-v-mercenary-system-v1/position-draft-v1.json',attachmentFile='assets/ui/project-v/mercenaries/mercenary-attachment-points-v1.json';
 const positions=await read(positionFile),attachments=await read(attachmentFile),fxFile='preview/project-v-mercenary-system-v1/skill-assets-v2/manifest.json',effects=await read(fxFile);
 if(!positions.assignments.some(c=>c.code===CRYVERN_CODE))positions.assignments.push(candidate.registration.position);
 if(attachments.cards[CRYVERN_CODE]&&attachments.cards[CRYVERN_CODE].battleSpriteSha256!==manifest.battleSpriteSha256)throw Error('CRYVERN_ATTACHMENT_COLLISION');
 attachments.cards[CRYVERN_CODE]||=candidate.registration.attachment;
 if(!effects.images.some(r=>r.skillId==='MS-049'))effects.images.push(effect);
 effects.frameCount=effects.images.reduce((sum,r)=>sum+r.frameCount,0);
 const mediaFile='assets/ui/project-v/mercenaries/codex-v1/manifest.json',mediaManifest=await read(mediaFile);
 mediaManifest.entries=[...mediaManifest.entries.filter(e=>e.code!==CRYVERN_CODE),...media];
 await write(rosterFile,roster);await write(positionFile,positions);await write(attachmentFile,attachments);await write(fxFile,effects);await write(mediaFile,mediaManifest);
 console.log('Local registration only. Build, full release gate and user-authorized deployment remain.');
}else{
 await write(CRYVERN_PREVIEW+'release/candidate.json',{status:'LIVE_APPROVED',runtimeEnabled:true,...candidate});
 await write(CRYVERN_PREVIEW+'release/roster.json',roster);
 await write(CRYVERN_PREVIEW+'release/media.json',media);
 console.log('Prepared offline candidate: 크라이베른 / no title / SSS. Production catalog unchanged.');
}
