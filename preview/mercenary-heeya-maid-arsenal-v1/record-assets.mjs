import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);
const approval=JSON.parse(await readFile(new URL('approval-20261004.json',root),'utf8'));
async function png(file){
 const b=await readFile(new URL(file,root));assert.equal(b.subarray(1,4).toString(),'PNG');
 return {file,sha256:createHash('sha256').update(b).digest('hex').toUpperCase(),bytes:b.length,width:b.readUInt32BE(16),height:b.readUInt32BE(20),colorType:b[25]};
}
const versions=[
 {version:1,file:'assets/mercenary-heeya-maid-arsenal-source-art-v1.png',status:'SUPERSEDED'},
 {version:2,file:'assets/mercenary-heeya-maid-single-gatling-v2-rejected.png',status:'USER_REJECTED',notes:'나머지 무장 삭제와 얼굴 변경으로 반려.'},
 {version:3,file:'assets/mercenary-heeya-maid-arsenal-source-art-v3-review.png',status:'USER_REJECTED',notes:'무장·머릿결·고개·배경 반려. 이후 사용자가 몸의 포즈·복장·가터만 V7 기준으로 다시 지정.'},
 {version:5,file:'assets/mercenary-heeya-maid-arsenal-source-art-v5.png',status:'WEAPONS_APPROVED_FACE_HEAD_REJECTED',notes:'사용자 재첨부 원본은 references/user-approved-weapons-v5.png. 무장 7개만 승인.'},
 {version:6,file:'assets/mercenary-heeya-maid-arsenal-source-art-v6-rejected.png',status:'USER_REJECTED',notes:'좁은 자세·의상 실루엣·가터 불일치, 얼굴 사진 3장과 배경 교체 재지정.'},
 {version:7,file:'assets/mercenary-heeya-maid-arsenal-source-art-v7.png',status:'APPROVED_SOURCE_ART',notes:'최신 사진 3장 얼굴·지정 포즈/복장/가터·승인 무장·달빛 해안 요새. 사용자 전체 원화 승인, SS 리미티드 하이희야로 도감 공개 지시.'}
];
for(const row of versions)Object.assign(row,await png(row.file));
const latest=versions.at(-1);
assert.equal(latest.width,1024);assert.equal(latest.height,1536);assert.equal(latest.colorType,2);
assert.equal(latest.sha256,approval.sourceArtSha256);
const references=await Promise.all([
 'references/maid-outfit-user-reference.png','references/user-selected-base-v1.png','references/user-corrected-base-v3.png',
 'references/user-approved-weapons-v5.png','references/user-straight-leg-pose-reference.png',
 'references/heeya-face-photo-01-20261004.png','references/heeya-face-photo-02-20261004.png','references/heeya-face-photo-03-20261004.png',
 'references/user-exact-pose-outfit-garter-v7.png'
].map(png));
const manifest={
 title:'SS 리미티드 하이희야 · 메이드 등 장착 복합 중화기',dateKst:'2026-10-04',status:'APPROVED_SOURCE_ART',
 currentVersion:7,currentSourceArt:latest.file,mercenaryCode:approval.code,name:approval.name,rank:approval.rank,edition:approval.edition,
 publicSourceArt:approval.sourceArt,approval:'approval-20261004.json',approvalInstruction:approval.userInstruction,
 creationMode:'BUILT_IN_IMAGE_GEN',originalGeneratedFilesCopiedWithoutModification:true,generatedPixelEditsUsed:false,
 styleAnchor:'assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png',styleAnchorSha256:'629564D768A4BCEFCD0BE746E744DA49A64F1CF2BE7D048E7485FC6CB14FF874',
 identityReferences:['references/heeya-face-photo-01-20261004.png','references/heeya-face-photo-02-20261004.png','references/heeya-face-photo-03-20261004.png'],
 poseOutfitGarterReference:'references/user-exact-pose-outfit-garter-v7.png',weaponApproval:'weapon-approval-20261004.json',
 frame:approval.frame,frameSha256:approval.frameSha256,frameSeparateFromOriginal:true,
 prompts:['prompt-v1.json','prompt-v2.json','prompt-v3.json','prompt-v4.json','prompt-v5.json','prompt-v6.json','prompt-v7.json'],
 unexecutedPrompts:[{version:4,reason:'전면 신규 제작 지시로 실행 전 대체'}],
 visualReview:{userApprovedVersion:7,background:'달빛 해안 요새',weapons:{leftGatling:1,rightEnergyCannon:1,rightLowerAuxiliaryCannon:1,shoulderCannons:2,upperLauncherPods:2,totalUnits:7,barrelGeometry:'총몸부터 총구까지 직선 강체와 일관된 원근 유지. 승인 원본을 그대로 보존.'},hair:'과한 층·띠·떡진 가닥 없이 자연스러운 모발 흐름',poseOutfitGarter:'사용자가 지정한 넓게 뻗은 다리 자세, 메이드 의상 및 세로 연결 스트랩·허벅지 밴드·금장 가터'},
 skill:null,battleSprite:null,catalogRegistered:true,acquisitionEnabled:false,deploymentEnabled:false,
 versions,references
};
await writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:manifest.status,code:manifest.mercenaryCode,rank:manifest.rank,width:latest.width,height:latest.height,colorType:latest.colorType,sha256:latest.sha256}));
