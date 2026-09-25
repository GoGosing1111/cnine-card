import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {SNIPER_ORIKKUNG_POSITION} from '../shared/mercenary-sniper-orikkung-v1.mjs';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),write=(p,d)=>fs.writeFile(p,JSON.stringify(d,null,2)+'\n'),sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const preview='preview/mercenary-sniper-orikkung-v1/',base='assets/ui/project-v/mercenaries/',m=await read(preview+'manifest.json'),roster=await read(base+'mercenary-system-roster-v1.json');
if(roster.cards.some(c=>c.code==='V-050')||roster.cards.length!==49||roster.cards.at(-1).code!=='V-049')throw Error('Expected previous complete roster of 49');
if(m.sourceArtInfo.sha256!=='6D5A5D58F2A85E1BCA8269508F6E69BAB56D3AD7F318FF471054B98DF3E3EF01')throw Error('Approved V3 source art changed');
roster.cards.push({code:'V-050',rank:'SS',rankStatus:'USER_ASSIGNED_RANK',name:'저격 오리꿍',title:'후열의 명사수',nameStatus:'USER_ASSIGNED_NAME',role:'최상위 원거리 저격',weapon:'에메랄드 대물저격총',outfit:'고글 헤드기어 · 사막색 전술복',sourceArt:m.sourceArt,sourceArtSha256:m.sourceArtInfo.sha256,sourceArtStatus:'APPROVED_SOURCE_ART',sourceArtApprovedAt:'2026-09-26',catalogRelease:'USER_APPROVED_LIVE',approvalBatch:'2026-09-26-sniper-orikkung-live',battleSprite:m.battleSprite,battleSpriteSha256:m.battleSpriteInfo.sha256,battleSpriteStatus:'TECH_QA_COMPLETE_USER_REQUESTED_LIVE',battleSpriteFootAnchor:m.battleSpriteFootAnchor,accent:'#8ce5ba'});
roster.updatedAt='2026-09-26';for(const k of ['total','sourceArtReady','battleSpriteReady'])roster.summary[k]++;
await write(base+'mercenary-system-roster-v1.json',roster);
const posPath='preview/project-v-mercenary-system-v1/position-draft-v1.json',positions=await read(posPath);positions.assignments.push({...SNIPER_ORIKKUNG_POSITION});await write(posPath,positions);
const attachmentPath=base+'mercenary-attachment-points-v1.json',attachments=await read(attachmentPath);
attachments.cards['V-050']={battleSpriteSha256:m.battleSpriteInfo.sha256,weaponKind:'GUN',authoredFacing:1,weapon:m.battleSpriteMuzzle,cast:{x:.45,y:.53},contact:{x:.45,y:.53}};await write(attachmentPath,attachments);
const fxbase='preview/project-v-mercenary-system-v1/skill-assets-v2/',folder='emerald-antimateriel/';await fs.mkdir(fxbase+folder+'frames',{recursive:true});
await fs.copyFile(preview+m.impact.source,fxbase+folder+'sequence-source-v1.png');await fs.copyFile(preview+m.impact.atlas,fxbase+folder+'atlas-v1.webp');
const frames=[];
for(const f of m.impact.frames){
 const bytes=await fs.readFile(preview+f.file),{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let x0=info.width,y0=info.height,x1=-1,y1=-1,alphaPixels=0,nonempty=0,edgeMax=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a)nonempty++;if(a>=24){alphaPixels++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}if(x===0||y===0||x===info.width-1||y===info.height-1)edgeMax=Math.max(edgeMax,a);}
 const file=folder+'frames/'+String(f.index+1).padStart(2,'0')+'.png';await fs.writeFile(fxbase+file,bytes);frames.push({index:f.index,file,bounds:alphaPixels?[x0,y0,x1,y1]:null,alphaPixels,sha256:sha(bytes),rawSha256:sha(data),edgeMax,size:[info.width,info.height],nonempty});
}
const atlas=await fs.readFile(fxbase+folder+'atlas-v1.webp'),fx=await read(fxbase+'manifest.json');
fx.images.push({id:'emerald-antimateriel',skillId:'MS-050',name:'에메랄드 대물저격',source:folder+'sequence-source-v1.png',runtime:folder+'atlas-v1.webp',sourceSha256:m.impact.sourceInfo.sha256,runtimeSha256:sha(atlas),sourceSize:[m.impact.sourceInfo.width,m.impact.sourceInfo.height],size:[1536,1536],cellSize:384,columns:4,rows:4,frameCount:16,generation:'BUILT_IN_IMAGE_GEN',prompt:await fs.readFile(preview+'prompt-impact-v1.txt','utf8'),sourceFilename:'sequence-source-v1.png',visualReview:'2026-09-26 사용자 제작·적용 지시, 신규 SD/FX는 구현 후 기술·시각 검수',runtimeBytes:atlas.length,creationReferenceCode:'V-050',frames});
fx.frameCount=fx.images.reduce((n,r)=>n+r.frameCount,0);await write(fxbase+'manifest.json',fx);
await write(base+'mercenary-sniper-orikkung-approval-20260926.json',{date:'2026-09-26',code:'V-050',name:'저격 오리꿍',rank:'SS',status:'USER_REQUESTED_LIVE',request:'승인 SS용병으로 올리고 잘안나오게 처리해 스킬 SD이미지 다 만들어서 적용해라 원거리에서는 가장 강한 포지션으로 이름은 저격 오리꿍',scope:'CATALOG_CMS_ACQUISITION_LOADOUT_COMBAT',runtimeConnected:true,skillId:'MS-050',basePower:120000,sourceArt:m.sourceArt,sourceArtSha256:m.sourceArtInfo.sha256,battleSprite:m.battleSprite,battleSpriteSha256:m.battleSpriteInfo.sha256,motionFrames:6,effectFrames:16,sourceArtUnchanged:true,userVisualApproval:'SOURCE_ART_V3',newAssetAuthorization:'CREATE_AND_APPLY',manifest:preview+'manifest.json'});
console.log('Registered V-050, MS-050, SS: 50 mercenaries.');
