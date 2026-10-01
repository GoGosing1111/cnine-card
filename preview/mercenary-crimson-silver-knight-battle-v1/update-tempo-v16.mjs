import fs from 'node:fs/promises';
import {OVERHEAD,STRIKE_PLAYBACK,OVERHEAD_MODES} from './skill.mjs';
const root=new URL('./',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8'),write=(p,v)=>fs.writeFile(new URL(p,root),v);
const m=JSON.parse(await read('manifest.json'));
if(m.version!==15&&m.version!==16)throw Error('Expected V15/V16 preview');
if(m.version===15)m.reviewPlayback.historicalAllSkillsV15=m.reviewPlayback.allSkills;
m.version=16;m.playbackTempo={version:16,rate:1.2,strikeRate:STRIKE_PLAYBACK.rate,scope:'ALL_ATTACKS_AND_SKILLS_FAST_DESCENT',appliesTo:OVERHEAD_MODES,clock:'EXISTING_V3_GSAP_TIMELINE',descentAt:OVERHEAD.descent,strikeStart:OVERHEAD.strike,contactAt:OVERHEAD.contact,strikeEnd:OVERHEAD.recovery,approvedIdleAt:OVERHEAD.idle,previousSwingSeconds:.25,swingSeconds:.125,relativeSpeedToV15:2,lateLiftAlsoAccelerated:true,compensatingHold:false,effectPlaybackSpeedUnchanged:true,audioPlaybackSpeedUnchanged:true,impactCuesFollowContact:true,artworkUnchanged:true,record:'motion-tempo-request-20261001-v16.json'};
m.reviewPlayback.allSkills='qa/all-skills-fast-descent-v16.webp';m.reviewPlayback.actualV3=m.reviewPlayback.allSkills;m.reviewPlayback.liveAllSkills='http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/?showcase=1&v=16#battle';m.release.status='APPROVED_MOTION_ALL_SKILLS_FAST_DESCENT_PREVIEW';m.effectAlignment.allContactsAt=OVERHEAD.contact;
await write('manifest.json',JSON.stringify(m,null,2)+'\n');
await write('motion-tempo-request-20261001-v16.json',JSON.stringify({date:'2026-10-01',userRequest:'전체 스킬 모션에 대한 내려찍기 스프라이트를 빠르게 하라는거야 티가 안나는데 더빠르게 해야될듯',retainedApproval:'motion-approval-20261001-v14.json',appliesTo:OVERHEAD_MODES,change:'Double the V15 strike-sprite speed, include the descending last lift frame, remove added holds, and start recovery immediately. Shift impact cues to the earlier hit without accelerating effects or audio.',artworkChanged:false,liveActivationApproved:false},null,2)+'\n');
await write('qa.test.mjs',(await read('qa.test.mjs')).replace('fx.seek(1.98);const ward','fx.seek(OVERHEAD.contact);const ward'));
let browser=await read('qa-browser.mjs');if(!browser.includes("import {OVERHEAD}"))browser=browser.replace("import fs from 'node:fs/promises';","import fs from 'node:fs/promises';\nimport {OVERHEAD} from './skill.mjs';");await write('qa-browser.mjs',browser.replaceAll('1.98','OVERHEAD.contact'));
let previous=await read('README.md');if(!previous.startsWith('# 은백·금색 대검 기사 — V16'))await write('README.md',`# 은백·금색 대검 기사 — V16 모든 공격·스킬 내려찍기 가속

사용자 **“전체 스킬 모션에 대한 내려찍기 스프라이트를 빠르게 하라는거야 티가 안나는데 더빠르게 해야될듯”**에 따라 기본 공격·홍련 강격·두손 내려찍기·전장 심판·루비 반격벽·종결 집행의 공통 동작을 수정했다.

**최신 전체 프리뷰:** ${m.reviewPlayback.liveAllSkills}

- V15의 내려찍기 4프레임 재생 시간을 **0.25초 → 0.125초**로 줄였다. 이미 검이 내려가기 시작하는 들기 마지막 프레임도 가속한다. 앞뒤에 줄인 시간을 대기로 다시 넣지 않으며 내려찍기가 끝나면 즉시 기존 속도의 복귀 동작으로 연결한다.
- 준비와 들어 올리기의 앞 3프레임·대시·복귀 속도·전체 스킬 길이는 유지한다. 전체 재생 배율은 기존 1.2, 전체 시연은 23초다.
- 검이 빨리 닿는 시점으로 충돌 이펙트·방패·효과음·카메라 충격 시작을 함께 앞당긴다. 각 효과의 지속 시간·프레임 진행 속도와 소리 재생 배율은 같다. 소스 타격은 약 **1.7817초**, 기본 배속의 실제 타격은 **1.4847초**다.
- 실제 원본과 V13 아틀라스는 그대로다. 기존 PixiJS 8.20.0 / GSAP 3.13.0에서 모든 6개 모드가 같은 skill.mjs 동작을 사용한다. 별도 시계·리깅·재작화는 없다.
- 번들·전장 iframe·매니페스트 URL도 V16으로 갱신한다. 빠른 동작을 확인할 수 있도록 녹화는 30fps로 제공한다.
- 변경은 독립 프리뷰에 반영하며 운영 활성화·등급·능력치·스킬 배정은 변경하지 않는다.

---

${previous}`);
console.log(JSON.stringify(m.playbackTempo));
