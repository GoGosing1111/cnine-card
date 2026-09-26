import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {BERKAN_CODE,BERKAN_SKILL_ID,BERKAN_POSITION,BERKAN_SOURCE_ART,BERKAN_BATTLE_SPRITE} from '../shared/mercenary-berkan-v1.mjs';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),write=(p,d)=>fs.writeFile(p,JSON.stringify(d,null,2)+'\n'),sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const root='preview/mercenary-berkan-sss-v1/',base='assets/ui/project-v/mercenaries/',m=await read(root+'manifest.json');
for(const [file,hash] of [[m.sourceArt,m.sourceArtInfo.sha256],[m.battleSprite,m.battleSpriteInfo.sha256]])if(sha(await fs.readFile(file))!==hash)throw Error('BERKAN_APPROVED_SOURCE_CHANGED');
if(!m.runtimeEnabled||m.effectStatus!=='USER_APPROVED_LIVE')throw Error('BERKAN_APPROVAL_REQUIRED');
for(const [source,target] of [[m.sourceArt,BERKAN_SOURCE_ART],[m.battleSprite,BERKAN_BATTLE_SPRITE]]){
 await fs.mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});
 try{if(sha(await fs.readFile(target))!==sha(await fs.readFile(source)))throw Error('BERKAN_LIVE_ASSET_COLLISION');}catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.copyFile(source,target);
}
const roster=await read(base+'mercenary-system-roster-v1.json'),old=roster.cards.find(c=>c.code===BERKAN_CODE);
if(old&&old.sourceArtSha256!==m.sourceArtInfo.sha256)throw Error('BERKAN_CODE_COLLISION');
if(!old){
 roster.cards.push({code:BERKAN_CODE,rank:'SSS',rankStatus:'USER_ASSIGNED_RANK',name:'베르칸',title:'흑금의 궁수',nameStatus:'USER_ASSIGNED_NAME',role:'후열 궁수',weapon:'흑금 장궁',outfit:'흑금 판금 갑옷',sourceArt:m.sourceArt,sourceArtSha256:m.sourceArtInfo.sha256,sourceArtStatus:'APPROVED_SOURCE_ART',sourceArtApprovedAt:'2026-09-27',catalogRelease:'USER_APPROVED_LIVE',approvalBatch:'2026-09-27-berkan-live',battleSprite:m.battleSprite,battleSpriteSha256:m.battleSpriteInfo.sha256,battleSpriteStatus:'TECH_QA_COMPLETE_USER_REQUESTED_LIVE',battleSpriteFootAnchor:m.battleSpriteFootAnchor,accent:'#edc878'});
 roster.updatedAt='2026-09-27';for(const key of ['total','sourceArtReady','battleSpriteReady'])roster.summary[key]++;await write(base+'mercenary-system-roster-v1.json',roster);
}
const posPath='preview/project-v-mercenary-system-v1/position-draft-v1.json',pos=await read(posPath);
Object.assign(roster.cards.find(c=>c.code===BERKAN_CODE),{sourceArt:BERKAN_SOURCE_ART,battleSprite:BERKAN_BATTLE_SPRITE});
await write(base+'mercenary-system-roster-v1.json',roster);
if(!pos.assignments.some(c=>c.code===BERKAN_CODE)){pos.assignments.push({...BERKAN_POSITION});await write(posPath,pos);}
const ap=base+'mercenary-attachment-points-v1.json',attachments=await read(ap);
attachments.cards[BERKAN_CODE]??={battleSpriteSha256:m.battleSpriteInfo.sha256,weaponKind:'BOW',authoredFacing:1,weapon:{x:.82,y:.47},cast:{x:.57,y:.53},contact:{x:.57,y:.53}};await write(ap,attachments);
const fxbase='preview/project-v-mercenary-system-v1/skill-assets-v2/',folder='berkan-gilded-starfall/',fx=await read(fxbase+'manifest.json');
if(!fx.images.some(s=>s.skillId===BERKAN_SKILL_ID)){
 const s=m.effects.impact;await fs.mkdir(fxbase+folder+'frames',{recursive:true});
 await fs.copyFile(root+s.source,fxbase+folder+'sequence-source-v1.png');await fs.copyFile(root+s.atlas,fxbase+folder+'atlas-v1.webp');
 const frames=[];
 for(const f of s.frames){
  const bytes=await fs.readFile(root+f.file),{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let x0=info.width,y0=info.height,x1=-1,y1=-1,alphaPixels=0,nonempty=0,edgeMax=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a)nonempty++;if(a>=24){alphaPixels++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}if(x===0||y===0||x===info.width-1||y===info.height-1)edgeMax=Math.max(edgeMax,a);}
  const file=folder+'frames/'+String(f.index+1).padStart(2,'0')+'.png';await fs.writeFile(fxbase+file,bytes);frames.push({index:f.index,file,bounds:alphaPixels?[x0,y0,x1,y1]:null,alphaPixels,sha256:sha(bytes),rawSha256:sha(data),edgeMax,size:[info.width,info.height],nonempty});
 }
 const atlas=await fs.readFile(root+s.atlas);
 fx.images.push({id:'berkan-gilded-starfall',skillId:BERKAN_SKILL_ID,name:'흑금 낙성',source:folder+'sequence-source-v1.png',runtime:folder+'atlas-v1.webp',sourceSha256:s.sourceInfo.sha256,runtimeSha256:sha(atlas),sourceSize:[s.sourceInfo.width,s.sourceInfo.height],size:[2048,2048],cellSize:512,columns:4,rows:4,frameCount:16,generation:'BUILT_IN_IMAGE_GEN',prompt:await fs.readFile(root+'prompts/fx-impact-v2.txt','utf8'),sourceFilename:'sequence-source-v1.png',visualReview:'2026-09-27 사용자 현재 모션·오라로 확정',runtimeBytes:atlas.length,creationReferenceCode:BERKAN_CODE,frames});
 fx.frameCount=fx.images.reduce((n,r)=>n+r.frameCount,0);await write(fxbase+'manifest.json',fx);
}
await write(base+'mercenary-berkan-approval-20260927.json',{date:'2026-09-27',code:BERKAN_CODE,skillId:BERKAN_SKILL_ID,name:'베르칸',rank:'SSS',status:'USER_APPROVED_LIVE',runtimeConnected:true,scope:'CATALOG_CMS_ACQUISITION_LOADOUT_COMBAT',request:'SSS 등록, 크라이베른과 동일 희귀도. 현재 모션·오라로 확정.',sourceArt:BERKAN_SOURCE_ART,sourceArtSha256:m.sourceArtInfo.sha256,battleSprite:BERKAN_BATTLE_SPRITE,battleSpriteSha256:m.battleSpriteInfo.sha256,motionFrames:56,effectFrames:60,sourceArtUnchanged:true,manifest:root+'manifest.json'});
console.log('Registered Berkan V-055 / MS-055 without altering existing roster entries.');
