import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=(p,d)=>fs.writeFile(p,JSON.stringify(d,null,2)+'\n');
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const preview='preview/mercenary-ragniel-v1/',base='assets/ui/project-v/mercenaries/';
const m=await read(preview+'manifest.json'),roster=await read(base+'mercenary-system-roster-v1.json');
if(roster.cards.length!==45||roster.cards.at(-1).code!=='V-045'||roster.cards.some(c=>c.code==='V-046'))throw Error('Expected the complete 45-card production roster');
const sourceArt=base+'approved-20260919/mercenary-v046-ragniel-source-art-v1.png',battleSprite='assets/ui/project-v/characters/mercenary/mercenary-v046-ragniel-sd-v1.png';
for(const [source,dest,hash]of [[m.sourceArt,sourceArt,m.sourceArtInfo.sha256],[m.battleSprite,battleSprite,m.battleSpriteInfo.sha256]]){
 const bytes=await fs.readFile(source);if(sha(bytes)!==hash)throw Error('Approved source hash mismatch');await fs.copyFile(source,dest);
}
roster.cards.push({code:'V-046',rank:'SSS',rankStatus:'USER_ASSIGNED_RANK',name:'라그니엘',title:'종말의 대천사',nameStatus:'USER_ASSIGNED_NAME',role:'전위 돌격',weapon:'백금 대천사 성검',outfit:'백색·금색 판금과 일체형 백색 고르젯',sourceArt,sourceArtSha256:m.sourceArtInfo.sha256,sourceArtStatus:'APPROVED_SOURCE_ART',sourceArtApprovedAt:'2026-09-19',catalogRelease:'USER_APPROVED_LIVE',approvalBatch:'2026-09-19-ragniel-live',battleSprite,battleSpriteSha256:m.battleSpriteInfo.sha256,battleSpriteStatus:'USER_APPROVED_LIVE',battleSpriteFootAnchor:m.battleSpriteFootAnchor,accent:'#f5d582'});
roster.updatedAt='2026-09-19';for(const k of ['total','sourceArtReady','battleSpriteReady'])roster.summary[k]++;
await write(base+'mercenary-system-roster-v1.json',roster);
const positions=await read('preview/project-v-mercenary-system-v1/position-draft-v1.json');
positions.assignments.push({code:'V-046',position:'FRONT',role:'VANGUARD',basicTarget:'FRONT_ENEMY',skillTarget:'FRONT_GROUP',specialty:'백금 질주 · 성검 검격 · 전열 성역 심판',weakness:'첫 검격 회피 시 해당 대상 후속 낙하 취소 · 제압에 취약',rationale:'승인된 성검과 광익 연출을 전위 돌격 역할로 연결한다.',rank:'SSS'});
await write('preview/project-v-mercenary-system-v1/position-draft-v1.json',positions);
const attachments=await read(base+'mercenary-attachment-points-v1.json');
attachments.cards['V-046']={battleSpriteSha256:m.battleSpriteInfo.sha256,weaponKind:'SWORD',authoredFacing:1,weapon:{x:.94,y:.57},cast:{x:.54,y:.42},contact:{x:.49,y:.52}};
await write(base+'mercenary-attachment-points-v1.json',attachments);
const spec=m.effects.judgment,fxbase='preview/project-v-mercenary-system-v1/skill-assets-v2/',folder='platinum-sanctuary/';
await fs.mkdir(fxbase+folder+'frames',{recursive:true});
await fs.copyFile(preview+spec.source,fxbase+folder+'sequence-source-v1.png');
await fs.copyFile(preview+spec.atlas,fxbase+folder+'atlas-v1.webp');
const frames=[];
for(const f of spec.frames){
 const bytes=await fs.readFile(preview+f.file),{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let x0=info.width,y0=info.height,x1=-1,y1=-1,alphaPixels=0,nonempty=0,edgeMax=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a)nonempty++;if(a>=24){alphaPixels++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}if(x===0||y===0||x===info.width-1||y===info.height-1)edgeMax=Math.max(edgeMax,a);}
 const file=folder+`frames/${String(f.index+1).padStart(2,'0')}.png`;await fs.writeFile(fxbase+file,bytes);
 frames.push({index:f.index,file,bounds:alphaPixels?[x0,y0,x1,y1]:null,alphaPixels,sha256:sha(bytes),rawSha256:sha(data),edgeMax,size:[info.width,info.height],nonempty});
}
const atlas=await fs.readFile(fxbase+folder+'atlas-v1.webp'),fx=await read(fxbase+'manifest.json');
fx.images.push({id:'platinum-sanctuary',skillId:'MS-046',name:'종언의 백금성역',source:folder+'sequence-source-v1.png',runtime:folder+'atlas-v1.webp',sourceSha256:spec.sourceInfo.sha256,runtimeSha256:sha(atlas),sourceSize:[spec.sourceInfo.width,spec.sourceInfo.height],size:[2048,2048],cellSize:512,columns:4,rows:4,frameCount:16,generation:'BUILT_IN_IMAGE_GEN',prompt:await fs.readFile(preview+'prompts/judgment-v2.txt','utf8'),sourceFilename:'sequence-source-v1.png',visualReview:'2026-09-19 사용자: 반영해 SSS로',runtimeBytes:atlas.length,creationReferenceCode:'V-046',frames});
fx.frameCount=fx.images.reduce((n,r)=>n+r.frameCount,0);await write(fxbase+'manifest.json',fx);
await write(base+'mercenary-ragniel-approval-20260919.json',{version:1,status:'USER_APPROVED_LIVE',approvedAt:'2026-09-19',liveApprovalRequest:'반영해 SSS로',scope:'CATALOG_CMS_ACQUISITION_LOADOUT_COMBAT',runtimeConnected:true,code:'V-046',name:'라그니엘',rank:'SSS',skillId:'MS-046',basePower:180000,entries:[roster.cards.at(-1)],motionFrames:26,effectFrames:28,previewManifest:preview+'manifest.json'});
Object.assign(m,{codeStatus:'LIVE_REGISTERED',sourceArtStatus:'USER_APPROVED_LIVE',battleSpriteStatus:'USER_APPROVED_LIVE',liveApprovedAt:'2026-09-19',liveApprovalRequest:'반영해 SSS로',liveCode:'V-046',liveSkillId:'MS-046',runtimeEnabled:true});
await write(preview+'manifest.json',m);
console.log('Registered Ragniel SSS: 46 cards, approved originals, 26 motion and 28 effect frames.');
