import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {OVERHEAD,OVERHEAD_MODES,ACTIVE_MOTION_KEYS} from './skill.mjs';
import {SHOWCASE_MODES,SHOWCASE_DURATION} from './showcase.mjs';
const root=new URL('./',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const write=(file,data)=>fs.writeFile(new URL(file,root),JSON.stringify(data,null,2)+'\n');
const tracks=['twohandGrip','twohandLift','twohandStrike','twohandReturn'],locked={};
for(const key of tracks){const spec=manifest.motion[key],hash=createHash('sha256').update(await fs.readFile(new URL(spec.atlas,root))).digest('hex').toUpperCase();if(hash!==spec.atlasSha256)throw Error('Selected atlas hash mismatch: '+key);locked[key]={atlas:spec.atlas,sha256:hash,frames:spec.frameCount};}
const adoption={date:'2026-10-01',status:'USER_ADOPTED',userRequest:'내려찍기 모션을 모든 스킬,공격모션으로 채택해',appliesTo:OVERHEAD_MODES,selectedMotion:OVERHEAD.motion,selectedAtlases:locked,contactAt:OVERHEAD.contact,approvedIdle:manifest.returnPose.endpoint,policy:'The same existing grip, lift, descending strike and return artwork/timing is used for every attack and skill. Defensive ward uses the same forward casting position, with no enemy recoil. Effects remain skill-specific. Retired rising/turning attacks are preserved as history and never selected by playback.',newArtworkFrames:0,combatBalanceChanged:false,liveActivationApproved:false};
await write('motion-adoption-20261001.json',adoption);
manifest.version=12;manifest.motionVersion='COMMON_TWO_HAND_OVERHEAD_V12';manifest.motionStatus='USER_ADOPTED_TWO_HAND_OVERHEAD';manifest.motionAdoption={record:'motion-adoption-20261001.json',...adoption};
manifest.activeMotionKeys=ACTIVE_MOTION_KEYS;manifest.archivedMotionKeys=Object.keys(manifest.motion).filter(k=>!ACTIVE_MOTION_KEYS.includes(k));manifest.counts.activeMotionReferences=ACTIVE_MOTION_KEYS.reduce((n,k)=>n+manifest.motion[k].frameCount,0);
manifest.additionalMotion={...manifest.additionalMotion,role:'COMMON_ATTACK_AND_SKILL_MOTION',existingComboRuntimeActive:false,userReviewPending:false};
manifest.effectVersion='V12_OVERHEAD_CONTACT_AND_TORSO_WARD';
manifest.effectAlignment={motion:OVERHEAD.motion,allContactsAt:OVERHEAD.contact,guard:{anchor:'ACTOR_UPPER_BODY',bodyFractionAboveFeet:.54,forwardBodyFraction:.30,sizeBodyFactor:1.45,enemyCoordinatesUsed:false,impactFlashAnchor:'SAME_AS_WARD'},status:'USER_REVIEW_PENDING'};
manifest.renderer.guardAttachment='ACTOR_CHEST_CENTER_NATIVE_ATLAS';
manifest.showcase={...manifest.showcase,modes:SHOWCASE_MODES,duration:SHOWCASE_DURATION};
manifest.reviewPlayback={...manifest.reviewPlayback,motionOnly:manifest.reviewPlayback.twoHandMotion,slowMotion:manifest.reviewPlayback.twoHandSlow,actualV3:'qa/all-skills-overhead-v12.webp',allSkills:'qa/all-skills-overhead-v12.webp'};
manifest.release.status='OVERHEAD_MOTION_ADOPTED_EFFECT_ALIGNMENT_REVIEW_PENDING';
await write('manifest.json',manifest);
const edits={
 'source/preview.js':[['대시 · 올려베기 · 연속 베기 · 두손 강격 · 심판 · 방벽 · 궁극기','대시 · 기본 강격 · 홍련 강격 · 채택 모션 · 심판 · 방벽 · 궁극기']],
 'index.html':[
  ['허리 회전으로 대검에 온몸의 힘을 싣고,','두 손으로 대검의 무게를 모아,'],['참격과 결정 폭쇄로 전장을 압도하는 최상급 용병 시안.','내려찍는 일격과 결정 폭쇄로 전장을 압도합니다.'],
  ['캐릭터 54개 자세 · 이펙트 96프레임<br>대검은 승인본 원본 고정','공격·스킬 공통: 두손 내려찍기<br>이펙트 96프레임 · 승인 대검 고정'],
  ['대검 올려베기','대검 내려찍기'],['준비 · 올려베기 · 회수','두손 파지 · 강격 · 회수'],['홍련 연속 베기','홍련 강격'],['대각 베기 · 회전 베기','내려찍기 · 결정 파열'],['회전 베기 · 전장 폭쇄','내려찍기 · 전장 폭쇄'],
  ['대시 · 올려베기 · 연속 베기 · 두손 강격 · 심판 · 방벽 · 궁극기','대시 · 기본 강격 · 홍련 강격 · 채택 모션 · 심판 · 방벽 · 궁극기'],
  ['전장을 가르는 올려베기','두 손에 실린 대검의 무게'],['낮은 한손 파지에서 발로 지면을 밀고, 몸통과 팔이 함께 대검을 올려 벱니다. 망토는 몸의 회전을 뒤따릅니다. 승인 대검의 곧은 검신과 칼끝을 유지합니다.','한손 대기에서 두손 파지로 전환하고, 머리 위로 들어 올린 대검을 강하게 내려찍습니다. 기본 공격과 모든 스킬이 채택된 동일 모션을 사용합니다.'],
  ['./assets/motion-v7/frames/attack/02.png','./assets/motion-v10/frames/twohandStrike/01.png'],['전투 모션과 이펙트는 시각 검수 대기 중입니다.','두손 내려찍기 모션 채택 · 스킬별 연출 검수'],
  ["for(const [key,spec]of Object.entries(specs)){const figure", "for(const [key,spec]of Object.entries(specs)){if(kind==='motion'&&!manifest.activeMotionKeys.includes(key))continue;const figure"]
 ]
};
for(const [file,replacements] of Object.entries(edits)){const url=new URL(file,root);let text=await fs.readFile(url,'utf8');for(const [from,to] of replacements)text=text.replaceAll(from,to);await fs.writeFile(url,text);}
console.log(JSON.stringify({version:manifest.version,selected:OVERHEAD_MODES,activeMotionReferences:manifest.counts.activeMotionReferences,showcaseDuration:SHOWCASE_DURATION}));
