import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=(p,d)=>fs.writeFile(p,JSON.stringify(d,null,2)+'\n');
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const preview='preview/mercenary-mangisa-v1/',base='assets/ui/project-v/mercenaries/';
const m=await read(preview+'manifest.json'),roster=await read(base+'mercenary-system-roster-v1.json');
if(roster.cards.some(c=>c.code==='V-045'))throw Error('V-045 already registered; review before changing released assets');
if(roster.cards.length!==44||roster.cards.at(-1).code!=='V-044')throw Error('Unexpected production roster');
roster.cards.push({code:'V-045',rank:'SS',rankStatus:'USER_ASSIGNED_RANK',name:'망이사',title:'금란의 사수',nameStatus:'USER_ASSIGNED_NAME',role:'중거리 사격',weapon:'화이트 골드 판타지 AK',outfit:'금색 자수의 붉은 치파오',sourceArt:m.sourceArt,sourceArtSha256:m.sourceArtInfo.sha256,sourceArtStatus:'APPROVED_SOURCE_ART',sourceArtApprovedAt:'2026-09-19',catalogRelease:'USER_APPROVED_LIVE',approvalBatch:'2026-09-19-mangisa-live',battleSprite:m.battleSprite,battleSpriteSha256:m.battleSpriteInfo.sha256,battleSpriteStatus:'USER_APPROVED_LIVE',battleSpriteFootAnchor:m.battleSpriteFootAnchor,accent:'#f3c475'});
roster.updatedAt='2026-09-19';for(const k of ['total','sourceArtReady','battleSpriteReady'])roster.summary[k]++;
await write(base+'mercenary-system-roster-v1.json',roster);
const positions=await read('preview/project-v-mercenary-system-v1/position-draft-v1.json');
positions.assignments.push({code:'V-045',position:'MIDDLE',role:'MARKSMAN',basicTarget:'FRONT_ENEMY',skillTarget:'FRONT_ENEMY',specialty:'빠른 6연사 · 마지막 탄 주변 2명 확산',weakness:'주 대상 소멸 시 후속탄 취소 · 기습과 제압에 취약',rationale:'승인된 수평 조준 AK와 금란 연사를 중열 사격 역할로 연결한다.',rank:'SS'});
await write('preview/project-v-mercenary-system-v1/position-draft-v1.json',positions);
const attachments=await read(base+'mercenary-attachment-points-v1.json');
attachments.cards['V-045']={battleSpriteSha256:m.battleSpriteInfo.sha256,weaponKind:'GUN',authoredFacing:1,weapon:{x:.984,y:.196},cast:{x:.42,y:.43},contact:{x:.42,y:.43}};
await write(base+'mercenary-attachment-points-v1.json',attachments);
const fxbase='preview/project-v-mercenary-system-v1/skill-assets-v2/',folder='golden-orchid-volley/';
await fs.mkdir(fxbase+folder+'frames',{recursive:true});
await fs.copyFile(preview+m.impact.source,fxbase+folder+'sequence-source-v1.png');
await fs.copyFile(preview+m.impact.atlas,fxbase+folder+'atlas-v1.webp');
const frames=[];
for(const f of m.impact.frames){
 const bytes=await fs.readFile(preview+f.file),{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let x0=info.width,y0=info.height,x1=-1,y1=-1,alphaPixels=0,nonempty=0,edgeMax=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a)nonempty++;if(a>=24){alphaPixels++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}if(x===0||y===0||x===info.width-1||y===info.height-1)edgeMax=Math.max(edgeMax,a);}
 const file=folder+`frames/${String(f.index+1).padStart(2,'0')}.png`;await fs.writeFile(fxbase+file,bytes);
 frames.push({index:f.index,file,bounds:alphaPixels?[x0,y0,x1,y1]:null,alphaPixels,sha256:sha(bytes),rawSha256:sha(data),edgeMax,size:[info.width,info.height],nonempty});
}
const atlas=await fs.readFile(fxbase+folder+'atlas-v1.webp'),fx=await read(fxbase+'manifest.json');
fx.images.push({id:'golden-orchid-volley',skillId:'MS-045',name:'금란 연사',source:folder+'sequence-source-v1.png',runtime:folder+'atlas-v1.webp',sourceSha256:m.impact.sourceInfo.sha256,runtimeSha256:sha(atlas),sourceSize:[m.impact.sourceInfo.width,m.impact.sourceInfo.height],size:[1536,1536],cellSize:384,columns:4,rows:4,frameCount:16,generation:'BUILT_IN_IMAGE_GEN',prompt:await fs.readFile(preview+'prompt-impact-v1.txt','utf8'),sourceFilename:'sequence-source-v1.png',visualReview:'2026-09-19 사용자 승인 용병 등록 지시',runtimeBytes:atlas.length,creationReferenceCode:'V-045',frames});
fx.frameCount=fx.images.reduce((n,r)=>n+r.frameCount,0);await write(fxbase+'manifest.json',fx);
const approval=await read(base+'mercenary-mangisa-approval-20260919.json');
approval.status='USER_APPROVED_LIVE';approval.liveApprovalRequest='승인 용병등록해라';approval.scope='CATALOG_CMS_ACQUISITION_LOADOUT_COMBAT';approval.runtimeConnected=true;approval.skillId='MS-045';approval.basePower=120000;approval.entries[0].battleSpriteStatus='USER_APPROVED_LIVE';
await write(base+'mercenary-mangisa-approval-20260919.json',approval);
console.log('Registered Mangisa SS: 45 cards, 28 skills, approved source/SD, 16 impact frames.');
