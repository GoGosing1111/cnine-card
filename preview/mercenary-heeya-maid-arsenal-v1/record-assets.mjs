import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);
async function png(path){
 const b=await readFile(new URL(path,root));assert.equal(b.subarray(1,4).toString(),'PNG');
 return {file:path,sha256:createHash('sha256').update(b).digest('hex').toUpperCase(),bytes:b.length,width:b.readUInt32BE(16),height:b.readUInt32BE(20),colorType:b[25]};
}
const versions=[
 {version:1,file:'assets/mercenary-heeya-maid-arsenal-source-art-v1.png',status:'SUPERSEDED',notes:'최초 복합 중화기 시안. 이후 무기 수·방향·얼굴·머릿결·작화·구도 수정 요청.'},
 {version:2,file:'assets/mercenary-heeya-maid-single-gatling-v2-rejected.png',status:'USER_REJECTED',notes:'나머지 무장 삭제 해석과 얼굴 변경으로 반려. 후속 제작 입력에서 제외.'},
 {version:3,file:'assets/mercenary-heeya-maid-arsenal-source-art-v3-review.png',status:'USER_REJECTED',notes:'개틀링과 레일포 합쳐짐, 머릿결 과밀, 기존 고개·배경 반복. 이후 전면 신규 제작 지시.'},
 {version:5,file:'assets/mercenary-heeya-maid-arsenal-source-art-v5.png',status:'USER_REVIEW_PENDING',notes:'기존 생성본을 입력에서 제외한 새 구도·계단 자세·왼쪽 시선·온실 궁정 배경. 왼쪽 개틀링 1정과 나머지 6개 무장 유지.'}
];
for(const version of versions)Object.assign(version,await png(version.file));
const latest=versions.at(-1);assert.equal(latest.width,1024);assert.equal(latest.height,1536);assert.equal(latest.colorType,2,'Native RGB PNG required');
const refs=await Promise.all(['references/maid-outfit-user-reference.png','references/user-selected-base-v1.png','references/user-corrected-base-v3.png'].map(png));
assert.equal(refs[0].sha256,'9978E2D7B3CD97D0446D07510B8412CB99BB80BCB1EEB431966B68F8E7D39D6E');
const manifest={title:'하이희야 메이드 · 등 장착 복합 중화기',dateKst:'2026-10-04',status:'USER_REVIEW_PENDING',currentVersion:5,currentSourceArt:latest.file,
 creationMode:'BUILT_IN_IMAGE_GEN',originalGeneratedFilesCopiedWithoutModification:true,generatedPixelEditsUsed:false,
 latestRequest:'개틀링건 왼쪽으로 옮기고 등장착 무기 디자인 다시해, 머릿결 과하다니까 떡진거처럼 하지말라고 규정에 해놨는데 없나? 고개도 재탕하지마 그림 자체를 배경하고 다시만들어',
 sourceArtStyle:'Vespera painterly 2D fantasy splash art reference',styleAnchor:'assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png',styleAnchorSha256:'629564D768A4BCEFCD0BE746E744DA49A64F1CF2BE7D048E7485FC6CB14FF874',
 identityReference:'preview/avatar-lg-hi-heeya-uniform-v1/assets/avatar-lg-hi-heeya-lobby-source-art-v2.png',
 v5InputRoles:['베스페라: 작화만','LG 하이희야: 얼굴 정체성만, 고개/포즈 복사 금지','사용자 메이드: 복장만','사용자 복합 중화기: 무기 종류만'],
 previousGeneratedCompositesUsedForV5:false,prompts:['prompt-v1.json','prompt-v2.json','prompt-v3.json','prompt-v4.json','prompt-v5.json'],unexecutedPrompts:[{version:4,reason:'사용자의 전면 신규 제작 지시로 생성 전에 대체됨'}],
 visualReview:{scope:'현재 1024×1536 생성 원본 직접 확인; 사용자 최종 시각 승인 아님',
  head:'기존 기울어진 고개에서 직립한 왼쪽 방향 시선으로 변경',
  hair:'길게 흩날리던 과밀한 잔가닥 대신 등으로 내려오는 절제된 머릿결; 얼굴과 무장 분리',
  background:'기존 붉은 성당 거리에서 밝은 유리 천장 궁정·계단으로 전면 변경',
  pose:'양다리를 크게 벌린 자세에서 계단 위로 한 발을 올리는 비대칭 자세로 변경',
  weapons:{leftGatling:1,rightEnergyCannon:1,rightLowerAuxiliaryCannon:1,shoulderCannons:2,upperLauncherPods:2,totalUnits:7,gatlingDirection:'화면 왼쪽 장착부에서 오른쪽 아래로 뻗는 원근',barrelGeometry:'원본에서 총몸·총열·총구 연속성과 레일 직선 확인'},
  originalOutfit:'메이드 머리띠, 검정 긴팔, 흰 앞치마·골드 단추, 검정 스타킹·가터, 프릴 치마·검정 부츠 유지',
  limitations:'얼굴 닮음·작화 최종 승인 및 카드 160px/프레임 최종 승인 검수는 사용자 선택 후 별도'},
 rank:null,skill:null,battleSprite:null,catalogRegistered:false,runtimeChanges:false,productionDeployment:false,versions,references:refs};
await writeFile(new URL('./manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({currentSourceArt:manifest.currentSourceArt,width:latest.width,height:latest.height,colorType:latest.colorType,sha256:latest.sha256,status:manifest.status,weaponUnits:7}));
