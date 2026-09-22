import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=(p,d)=>fs.writeFile(p,JSON.stringify(d,null,2)+'\n');
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const preview='preview/mercenary-black-moon-swordsman-ss-v1/',base='assets/ui/project-v/mercenaries/';
const m=await read(preview+'manifest.json'),roster=await read(base+'mercenary-system-roster-v1.json');
if(roster.cards.length!==47||roster.cards.at(-1).code!=='V-047')throw Error('Expected complete 47-card production roster before registration');
const sourceArt=base+'approved-20260922/mercenary-v048-heukwol-source-art-v1.png',battleSprite='assets/ui/project-v/characters/mercenary/mercenary-v048-heukwol-sd-v1.png';
await fs.mkdir(base+'approved-20260922',{recursive:true});
for(const [source,dest,hash]of [[m.sourceArt,sourceArt,m.sourceArtInfo.sha256],[m.battleSprite,battleSprite,m.battleSpriteInfo.sha256]]){
 const bytes=await fs.readFile(source);if(sha(bytes)!==hash)throw Error('Approved source hash mismatch');await fs.copyFile(source,dest);
}
roster.cards.push({code:'V-048',rank:'SS',rankStatus:'USER_ASSIGNED_RANK',name:'흑월',title:'고요를 가르는 검',nameStatus:'USER_ASSIGNED_NAME',role:'전위 돌격',weapon:'흑월 사검',outfit:'흑철 갑주 · 금은 장식 · 삿갓과 면갑',sourceArt,sourceArtSha256:m.sourceArtInfo.sha256,sourceArtStatus:'APPROVED_SOURCE_ART',sourceArtApprovedAt:'2026-09-22',catalogRelease:'USER_APPROVED_LIVE',approvalBatch:'2026-09-22-heukwol-live',battleSprite,battleSpriteSha256:m.battleSpriteInfo.sha256,battleSpriteStatus:'USER_APPROVED_LIVE',battleSpriteFootAnchor:m.battleSpriteFootAnchor,accent:'#e9c681'});
roster.updatedAt='2026-09-22';for(const k of ['total','sourceArtReady','battleSpriteReady'])roster.summary[k]++;
await write(base+'mercenary-system-roster-v1.json',roster);
const positions=await read('preview/project-v-mercenary-system-v1/position-draft-v1.json');
positions.assignments.push({code:'V-048',position:'FRONT',role:'VANGUARD',basicTarget:'FRONT_ENEMY',skillTarget:'FRONT_ENEMY',specialty:'전열 접근 · 내려베기 · 올려베기 · 횡베기',weakness:'제압과 단일 표적 소멸에 취약 · 방어 무시 없음',rationale:'승인한 다검 검객의 연속 베기를 SS 전열 역할로 연결한다.',rank:'SS'});
await write('preview/project-v-mercenary-system-v1/position-draft-v1.json',positions);
const attachments=await read(base+'mercenary-attachment-points-v1.json');
attachments.cards['V-048']={battleSpriteSha256:m.battleSpriteInfo.sha256,weaponKind:'SWORD',authoredFacing:1,weapon:{x:.91,y:.67},cast:{x:.53,y:.41},contact:{x:.53,y:.52}};
await write(base+'mercenary-attachment-points-v1.json',attachments);
const fxbase='preview/project-v-mercenary-system-v1/skill-assets-v2/',folder='black-moon-triple-sever/',spec=m.effects.triple;
await fs.mkdir(fxbase+folder+'frames',{recursive:true});
const original=await fs.readFile(preview+spec.source);await fs.writeFile(fxbase+folder+'sequence-source-v1.png',original);
const frames=[];
// Texture-cell exports for the existing CMS contact sheet. No repainting, masking,
// resizing or recompression of approved originals. The live player uses that original.
for(const f of spec.frames){
 const bytes=await sharp(original).extract({left:f.rect.x,top:f.rect.y,width:f.rect.width,height:f.rect.height}).png().toBuffer();
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let x0=info.width,y0=info.height,x1=-1,y1=-1,alphaPixels=0,nonempty=0,edgeMax=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a)nonempty++;if(a>=24){alphaPixels++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}if(x===0||y===0||x===info.width-1||y===info.height-1)edgeMax=Math.max(edgeMax,a);}
 const file=folder+`frames/${String(f.index+1).padStart(2,'0')}.png`;await fs.writeFile(fxbase+file,bytes);
 frames.push({...f,file,bounds:alphaPixels?[x0,y0,x1,y1]:null,alphaPixels,sha256:sha(bytes),rawSha256:sha(data),edgeMax,size:[info.width,info.height],nonempty});
}
const fx=await read(fxbase+'manifest.json');
fx.images.push({id:'black-moon-triple-sever',skillId:'MS-048',name:'흑월 삼연참',source:folder+'sequence-source-v1.png',runtime:folder+'sequence-source-v1.png',sourceSha256:sha(original),runtimeSha256:sha(original),sourceSize:[1254,1254],size:[1254,1254],cellSize:313.5,columns:4,rows:4,frameCount:16,generation:'BUILT_IN_IMAGE_GEN',prompt:await fs.readFile(preview+'prompts/triple-sever-fx-v2.txt','utf8'),visualReview:'2026-09-22 사용자: 용병 이름 흑월로 승인 라이브 배포해',runtimeBytes:original.length,creationReferenceCode:'V-048',frames});
fx.frameCount=fx.images.reduce((n,r)=>n+r.frameCount,0);await write(fxbase+'manifest.json',fx);
await write(base+'mercenary-heukwol-approval-20260922.json',{version:1,status:'USER_APPROVED_LIVE',approvedAt:'2026-09-22',liveApprovalRequest:'용병 이름 흑월로 승인 라이브 배포해',scope:'CATALOG_CMS_ACQUISITION_LOADOUT_COMBAT',runtimeConnected:true,code:'V-048',name:'흑월',rank:'SS',skillId:'MS-048',basePower:120000,entries:[roster.cards.at(-1)],motionFrames:12,effectFrames:16,previewManifest:preview+'manifest.json'});
Object.assign(m,{code:'V-048',codeStatus:'LIVE_REGISTERED',name:'흑월',nameStatus:'USER_ASSIGNED_NAME',battleSpriteStatus:'USER_APPROVED_LIVE',liveApprovedAt:'2026-09-22',liveApprovalRequest:'용병 이름 흑월로 승인 라이브 배포해',liveCode:'V-048',liveSkillId:'MS-048',runtimeEnabled:true,skillsAssigned:true});
Object.assign(m.skill,{id:'MS-048',nameStatus:'USER_APPROVED',status:'USER_APPROVED_LIVE',balanceStatus:'SS_SHARED_BASELINE_CMS_EDITABLE',runtimeEnabled:true});
await write(preview+'manifest.json',m);
console.log('Registered Heukwol SS / V-048 / MS-048 / 12 motion + 16 effect frames');
