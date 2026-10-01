import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {root,sha} from './compose-weapon.mjs';
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8')),write=(p,o)=>fs.writeFile(path.join(root,p),JSON.stringify(o,null,2)+'\n');
const m=await read('manifest.json'),size=await read('qa/v13/size-report.json'),browser=await read('qa/v13/browser-report.json');
if(browser.some(r=>r.errors.length))throw Error('Size/browser verification failed');
const previous=await read('qa-report.json');if(previous.status.startsWith('V12_'))await write('qa/v12/qa-report.json',previous);
m.motionApproval={record:'motion-approval-20261001-v13.json',status:'USER_APPROVED_MOTION',date:'2026-10-01',sizeCorrectionRequested:true};
m.sizeCalibration.status='TECH_QA_COMPLETE';m.sizeCalibration.visualReport='qa/v13/size-report.json';m.sizeCalibration.neutralPixelSpread={before:size.neutralPixelMeasurements.beforeSpread,after:size.neutralPixelMeasurements.afterSpread};
m.release.status='MOTION_APPROVED_SIZE_CORRECTED_PREVIEW';m.browserQaReport='qa/v13/browser-report.json';m.guardQaReport='qa/v13/browser-report.json';
m.reviewPlayback={motionOnly:'qa/v13/size-comparison.webp',comparison:'qa/v13/size-comparison.webp',actualV3:'qa/overhead-size-v13.webp',twoHandMotion:'qa/v13/size-comparison.webp',twoHandActualV3:'qa/overhead-size-v13.webp',allSkills:'qa/all-skills-size-v13.webp',historicalAllSkillsV12:'qa/all-skills-overhead-v12.webp'};
await write('manifest.json',m);
const playback={};for(const file of ['qa/v13/size-comparison.webp','qa/overhead-size-v13.webp','qa/all-skills-size-v13.webp']){
 try{const bytes=await fs.readFile(path.join(root,file)),info=await sharp(bytes,{animated:true}).metadata();playback[file]={sha256:sha(bytes),width:info.width,pageHeight:info.pageHeight,frames:info.pages,bytes:bytes.length};}catch(e){if(e.code!=='ENOENT')throw e;}
}
await write('qa-report.json',{date:'2026-10-01',scope:'preview/mercenary-crimson-silver-knight-battle-v1/',status:'V13_MOTION_APPROVED_SIZE_CORRECTION_QA_COMPLETE',motionApproval:m.motionApproval,sizeReport:'qa/v13/size-report.json',browserReport:m.browserQaReport,previousReport:'qa/v12/qa-report.json',relatedRegressionTests:{passed:6,failed:0,firstPattern:'every living|drawn collision|approved masters|Native packed|every attack',followupPattern:'Grounded strikes'},independentSizeVerification:{command:'node preview/mercenary-crimson-silver-knight-battle-v1/verify-size-v13.mjs',passed:true,activeFrameReferences:27,repackedFrames:17,newNativePoses:0,neutralSizeSpreadBefore:size.neutralPixelMeasurements.beforeSpread,neutralSizeSpreadAfter:size.neutralPixelMeasurements.afterSpread},browser:browser.map(r=>({viewport:r.name,errors:r.errors,framesInspected:r.poses.length,weaponLengthRange:r.weaponLengthRange,modes:r.contacts.map(x=>x.mode),horizontalOverflow:r.overflow.scroll>r.overflow.client})),sourceArtUnchanged:true,sourceMotionSheetsUnchanged:true,approvedIdleUnchanged:true,originalSwordUnchanged:true,gripAndFootRegistrationUnchanged:true,animationTimingUnchanged:true,displaySizing:m.displaySizing,playback,runtimeEnabled:false,limitations:[size.limitations,'The approved motion is retained. V13 changes only derived body normalization and original-sword repacking, not skill balance or live activation.']});
let html=await fs.readFile(path.join(root,'index.html'),'utf8');html=html.replace('전투 리소스 · 승인 대기','모션 승인 · 크기 보정 V13').replace('두손 내려찍기 모션 채택 · 스킬별 연출 검수','두손 내려찍기 모션 승인 · 프레임별 크기 보정 V13');
if(!html.includes('크기 보정 비교'))html=html.replace('<a href="./manifest.json">리소스 명세</a>','<a href="./qa/v13/size-comparison.webp">크기 보정 비교</a><a href="./manifest.json">리소스 명세</a>');await fs.writeFile(path.join(root,'index.html'),html);
const heading='# 은백·금색 대검 기사 — V13 모션 승인·프레임 크기 보정';
const text=`${heading}

2026-10-01 사용자 **“모션 승인,단 스프라이트 별로 캐릭터 크기가 일정하지 않던것을 확인함 다시 검수할것”**를 기록했다. 모션 승인은 유지하며, 추가 지시인 프레임별 크기 검수를 진행했다. 승인 기록은 \`motion-approval-20261001-v13.json\`이다.

**최신 전체 프리뷰:** http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/?showcase=1&v=13#battle

- 실제 사용 중인 **27프레임**을 승인 시작 자세와 같은 표시 배율·발 기준선에서 비교했다. 준비·들기·타격·복귀에 같은 원본 기준 높이 714를 넣어, 원본에서 달라진 크기가 그대로 노출되는 문제를 확인했다.
- 네 모션의 **17참조 프레임을 재패킹**했다. 목·골반·무릎·발목의 연결 길이로 자세와 크기를 구분하고, 똑바로 서는 복귀 2·3번은 실제 투구부터 발까지의 높이도 사용했다. 15개 프레임의 몸 배율이 바뀌었고 두 기준 프레임의 배율은 유지했다. 신규 작화는 0개다.
- 별도 검증에서는 계산식만 비교하지 않고 **패킹된 PNG의 실제 투구 픽셀**을 읽었다. 대기·중립 준비·서 있는 복귀 6개 기준 프레임의 크기 편차는 **7.56% → 1.09%**다. 이는 서 있는 기준 프레임에 대한 수치이며, 모든 자세가 같은 높이라는 의미가 아니다. 웅크림·기울기·무릎 굽힘은 유지했다.
- 원본 시트, 갑옷·망토·투구 작화, 검 PNG, 한손 대기, 파지 축·손 접점·발 접점은 보존했다. 몸 전체를 균일 배율로 보정하고 원본 대검을 같은 최종 길이로 다시 합성했다. 전체 이미지를 확대해 검까지 커지는 처리를 하지 않았다. 부위별 변형·리깅·카메라 변경은 없다.
- 대시·피격·쓰러짐도 같은 기준선에서 확인했다. 돌진의 기울기와 무릎을 꿇는 높이 변화를 크기 오류로 간주하지 않으며 해당 승인 시트는 유지했다. 크라이베른에 맞췄던 전역 표시 크기도 그대로다.
- PC·모바일에서 27개 실제 Pixi 텍스처, 모든 공격·스킬의 수정 아틀라스, 고정 검 길이, 검끝 여백, 아우라 추종과 방패 상체 부착을 확인했다. 오류는 0개다. 직접 관련 회귀 6개와 독립 크기 검증을 통과했다.

보정 전후 고정 카메라 비교는 [size-comparison.webp](qa/v13/size-comparison.webp), 적용된 실제 V3 내려찍기는 [overhead-size-v13.webp](qa/overhead-size-v13.webp), 모든 스킬은 [all-skills-size-v13.webp](qa/all-skills-size-v13.webp)다. 세부 좌표·판정은 \`size-landmarks-v13.json\`, \`qa/v13/scale-estimates.json\`, \`qa/v13/size-report.json\`에 남겼다. 랜드마크는 수동으로 검토한 2D 측정값이며 3D 관절의 완전 일치를 뜻하지 않는다.

PixiJS **8.20.0**, GSAP **3.13.0**, 기존 V3 렌더러·타임라인을 그대로 사용한다. 모든 공격의 타격 **1.98초**, 승인 대기 복귀 **3.15초**, 96개 이펙트 프레임도 유지한다. 독립 프리뷰만 반영했으며 등급·스킬 배정·운영 활성화는 변경하지 않았다.

재현 순서: \`audit-size-v13.mjs --before\` → \`build-size-v13.mjs\` → \`audit-size-v13.mjs\` → \`verify-size-v13.mjs\` → \`qa-size-v13.mjs\`. 기존 \`qa/v13/before-motion.json\`은 최초 V12 스냅샷이며 재실행으로 덮어쓰지 않는다. \`build-size-v13.mjs\`는 V13 파생 파일만 작성한다. 최종 메타데이터는 \`finalize-size-v13.mjs\`로 갱신한다.

`;
const old=await fs.readFile(path.join(root,'README.md'),'utf8');if(!old.startsWith(heading))await fs.writeFile(path.join(root,'README.md'),text+old.replace(/^# 은백·금색 대검 기사 — V12/,'## V12'));
console.log('V13 approval, size evidence and preview references recorded.');
