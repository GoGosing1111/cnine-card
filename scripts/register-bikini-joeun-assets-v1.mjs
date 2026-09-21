import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=(p,d)=>fs.writeFile(p,JSON.stringify(d,null,2)+'\n');
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const preview='preview/mercenary-bikini-joeun-v1/',base='assets/ui/project-v/mercenaries/';
const m=await read(preview+'manifest.json'),roster=await read(base+'mercenary-system-roster-v1.json');
if(roster.cards.some(c=>c.code==='V-047'))throw Error('V-047 already registered; review before changing released assets');
if(roster.cards.length!==46||roster.cards.at(-1).code!=='V-046')throw Error('Unexpected production roster');
roster.cards.push({code:'V-047',rank:'SS',rankStatus:'USER_ASSIGNED_RANK',name:'비키니 조은',title:'라벤더의 사수',nameStatus:'USER_ASSIGNED_NAME',role:'중거리 사격',weapon:'라벤더 스킨 경기관총',outfit:'라벤더 비키니 · 불투명 랩 스커트',sourceArt:m.sourceArt,sourceArtSha256:m.sourceArtInfo.sha256,sourceArtStatus:'APPROVED_SOURCE_ART',sourceArtApprovedAt:'2026-09-21',catalogRelease:'USER_APPROVED_LIVE',approvalBatch:'2026-09-21-bikini-joeun-live',battleSprite:m.battleSprite,battleSpriteSha256:m.battleSpriteInfo.sha256,battleSpriteStatus:'USER_APPROVED_LIVE',battleSpriteFootAnchor:m.battleSpriteFootAnchor,accent:'#c4a5ef'});
roster.updatedAt='2026-09-21';for(const k of ['total','sourceArtReady','battleSpriteReady'])roster.summary[k]++;
await write(base+'mercenary-system-roster-v1.json',roster);
const positions=await read('preview/project-v-mercenary-system-v1/position-draft-v1.json');
positions.assignments.push({code:'V-047',position:'MIDDLE',role:'MARKSMAN',basicTarget:'FRONT_ENEMY',skillTarget:'FRONT_ENEMY',specialty:'빠른 6연사 · 마지막 탄 집중 타격',weakness:'단일 표적 집중 · 기습과 제압에 취약',rationale:'수평 조준 경기관총과 라벤더 리코셰를 중열 사격 역할로 연결한다.',rank:'SS'});
await write('preview/project-v-mercenary-system-v1/position-draft-v1.json',positions);
const attachments=await read(base+'mercenary-attachment-points-v1.json');
attachments.cards['V-047']={battleSpriteSha256:m.battleSpriteInfo.sha256,weaponKind:'GUN',authoredFacing:1,weapon:m.battleSpriteMuzzle,cast:{x:.42,y:.43},contact:{x:.42,y:.43}};
await write(base+'mercenary-attachment-points-v1.json',attachments);
const fxbase='preview/project-v-mercenary-system-v1/skill-assets-v2/',folder='lavender-ricochet/';
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
fx.images.push({id:'lavender-ricochet',skillId:'MS-047',name:'라벤더 리코셰',source:folder+'sequence-source-v1.png',runtime:folder+'atlas-v1.webp',sourceSha256:m.impact.sourceInfo.sha256,runtimeSha256:sha(atlas),sourceSize:[m.impact.sourceInfo.width,m.impact.sourceInfo.height],size:[1536,1536],cellSize:384,columns:4,rows:4,frameCount:16,generation:'BUILT_IN_IMAGE_GEN',prompt:await fs.readFile(preview+'prompt-impact-v1.txt','utf8'),sourceFilename:'sequence-source-v1.png',visualReview:'2026-09-21 사용자 승인 용병 등록 지시',runtimeBytes:atlas.length,creationReferenceCode:'V-047',frames});
fx.frameCount=fx.images.reduce((n,r)=>n+r.frameCount,0);await write(fxbase+'manifest.json',fx);
const approval={date:'2026-09-21',code:'V-047',name:'비키니 조은',rank:'SS',status:'USER_REQUESTED_LIVE',request:'비키니 조은으로 SS용병 처리, SD 리소스 전용스킬 만들어서 추가해',motionRequest:'망이사처럼 사격 모션 스프라이트',scope:'CATALOG_CMS_ACQUISITION_LOADOUT_COMBAT',runtimeConnected:true,skillId:'MS-047',basePower:120000,sourceArt:m.sourceArt,sourceArtSha256:m.sourceArtInfo.sha256,battleSprite:m.battleSprite,battleSpriteSha256:m.battleSpriteInfo.sha256,motionFrames:6,effectFrames:16,sourceArtUnchanged:true,sdCoverage:'노출을 줄인 스포츠 상의와 불투명 랩 스커트',manifest:preview+'manifest.json'};
await write(base+'mercenary-bikini-joeun-approval-20260921.json',approval);
console.log('Registered Bikini Joeun SS: 47 cards, 30 skills, 6 shooting poses and 16 impact frames.');
