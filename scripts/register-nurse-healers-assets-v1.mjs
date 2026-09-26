import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {NURSE_CODES,NURSE_SKILL_ID,nursePosition} from '../shared/mercenary-nurse-healers-v1.mjs';
import {NURSE_SKILL} from '../preview/mercenary-nurse-healers-ss-v1/skill.mjs';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),write=(p,d)=>fs.writeFile(p,JSON.stringify(d,null,2)+'\n'),sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const preview='preview/mercenary-nurse-healers-ss-v1/',base='assets/ui/project-v/mercenaries/',m=await read(preview+'manifest.json'),roster=await read(base+'mercenary-system-roster-v1.json');
if(roster.cards.length!==50||roster.cards.at(-1).code!=='V-050')throw Error('Expected the complete previous 50-card roster');
const artdir=base+'approved-20260927/',sddir='assets/ui/project-v/characters/mercenary/nurse-healers-v1/';
await fs.mkdir(artdir,{recursive:true});await fs.mkdir(sddir,{recursive:true});
const positions=await read('preview/project-v-mercenary-system-v1/position-draft-v1.json'),attachments=await read(base+'mercenary-attachment-points-v1.json');
for(const card of m.cards){
 if(!NURSE_CODES.includes(card.code))throw Error('Unexpected nurse');
 const art=await fs.readFile(card.sourceArt),sd=await fs.readFile(card.battleSprite);
 if(sha(art)!==card.sourceArtSha256||sha(sd)!==card.battleSpriteSha256)throw Error('Approved resource hash changed');
 const sourceArt=artdir+card.id+'-source-art-v1.png',battleSprite=sddir+card.id+'-sd-v1.png';
 await fs.writeFile(sourceArt,art);await fs.writeFile(battleSprite,sd);
 roster.cards.push({code:card.code,rank:'SS',rankStatus:'USER_ASSIGNED_RANK',name:card.name,title:'백의의 치유사',nameStatus:'USER_ASSIGNED_NAME',role:'후열 힐러',weapon:'치유 도구',outfit:card.description,
  sourceArt,sourceArtSha256:card.sourceArtSha256,sourceArtStatus:'APPROVED_SOURCE_ART',sourceArtApprovedAt:'2026-09-27',catalogRelease:'USER_APPROVED_LIVE',approvalBatch:'2026-09-27-nurse-healers-live',
  battleSprite,battleSpriteSha256:card.battleSpriteSha256,battleSpriteStatus:'TECH_QA_COMPLETE_USER_REQUESTED_LIVE',battleSpriteFootAnchor:card.battleSpriteFootAnchor,accent:card.accent});
 positions.assignments.push(nursePosition(card.code));
 attachments.cards[card.code]={battleSpriteSha256:card.battleSpriteSha256,weaponKind:'STAFF',authoredFacing:1,weapon:{x:.56,y:.6},cast:{x:.56,y:.6},contact:{x:.5,y:.62}};
 Object.assign(card,{codeStatus:'REGISTERED_LIVE',runtimeEnabled:true,skillIds:[NURSE_SKILL_ID],battleSpriteStatus:'TECH_QA_COMPLETE_USER_REQUESTED_LIVE'});
}
roster.updatedAt='2026-09-27';for(const key of ['total','sourceArtReady','battleSpriteReady'])roster.summary[key]+=4;
await write(base+'mercenary-system-roster-v1.json',roster);await write('preview/project-v-mercenary-system-v1/position-draft-v1.json',positions);await write(base+'mercenary-attachment-points-v1.json',attachments);
const fxbase='preview/project-v-mercenary-system-v1/skill-assets-v2/',folder='white-oath/';await fs.mkdir(fxbase+folder+'frames',{recursive:true});
await fs.copyFile(m.skill.source,fxbase+folder+'sequence-source-v1.png');await fs.copyFile(m.skill.atlas,fxbase+folder+'atlas-v1.webp');
const frames=[];
for(const f of m.skill.frames){
 const bytes=await fs.readFile(f.file),{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let x0=info.width,y0=info.height,x1=-1,y1=-1,alphaPixels=0,nonempty=0,edgeMax=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a)nonempty++;if(a>=24){alphaPixels++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}if(x===0||y===0||x===info.width-1||y===info.height-1)edgeMax=Math.max(edgeMax,a);}
 const file=folder+'frames/'+String(f.index+1).padStart(2,'0')+'.webp';await fs.writeFile(fxbase+file,bytes);frames.push({index:f.index,file,bounds:alphaPixels?[x0,y0,x1,y1]:null,alphaPixels,sha256:sha(bytes),rawSha256:sha(data),edgeMax,size:[info.width,info.height],nonempty});
}
const atlas=await fs.readFile(m.skill.atlas),fx=await read(fxbase+'manifest.json');
fx.images.push({id:'white-oath',skillId:NURSE_SKILL_ID,name:NURSE_SKILL.name,source:folder+'sequence-source-v1.png',runtime:folder+'atlas-v1.webp',sourceSha256:m.skill.sourceSha256,runtimeSha256:sha(atlas),sourceSize:m.skill.sourceSize,size:[1256,1256],cellSize:314,columns:4,rows:4,frameCount:16,generation:'BUILT_IN_IMAGE_GEN',prompt:'Four nurses share one mint and ivory healing sequence; preparation, release, recovery and dissipation, 16 distinct continuous transparent frames.',sourceFilename:'sequence-source-v1.png',visualReview:'2026-09-27 사용자 프리뷰 확인 후 배포 지시',runtimeBytes:atlas.length,creationReferenceCode:'V-051',frames});
fx.frameCount=fx.images.reduce((n,r)=>n+r.frameCount,0);await write(fxbase+'manifest.json',fx);
Object.assign(m,{status:'USER_APPROVED_LIVE',runtimeEnabled:true,authorization:'SS 힐러 4명 · 단일 공통 스킬 · 배포 지시 및 320% 분배·4턴·자원25 승인'});Object.assign(m.skill,NURSE_SKILL);await write(preview+'manifest.json',m);
await write(base+'mercenary-nurse-healers-approval-20260927.json',{date:'2026-09-27',status:'USER_APPROVED_LIVE',codes:NURSE_CODES,names:m.cards.map(c=>c.name),rank:'SS',scope:'CATALOG_CMS_ACQUISITION_LOADOUT_COMBAT',runtimeConnected:true,skillId:NURSE_SKILL_ID,balance:{damageRatio:3.2,cooldownTurns:4,cost:25},basePower:120000,sourceArtUnchanged:true,skillCount:1,effectFrames:16,drawWeightPerNurse:3,drawApproval:'간호사 4종은 균등 한 3정도로 놔 좀 덜나오게',request:'간호사 4명 일러스트 ss용병 힐러로 sd이미지랑 스킬 리소스 만들어 스킬은 한개만 만들어서 통일시켜 / 배포해',numericApproval:'공격력 320% 분배 · 4턴 · 자원 25',manifest:preview+'manifest.json'});
console.log('Registered four SS healers and one shared skill: 54 mercenaries.');
