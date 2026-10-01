import fs from 'node:fs/promises';
import {OVERHEAD,STRIKE_PLAYBACK} from './skill.mjs';
const root=new URL('./',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8'),write=(p,v)=>fs.writeFile(new URL(p,root),v);
const edit=async(p,a,b)=>{const s=await read(p);if(!s.includes(a))throw Error(p+' edit missing');await write(p,s.replace(a,b));};
const m=JSON.parse(await read('manifest.json'));if(m.version!==16)throw Error('Expected V16');
m.version=17;m.playbackTempo={...m.playbackTempo,version:17,strikeRate:STRIKE_PLAYBACK.rate,strikeStart:OVERHEAD.strike,contactAt:OVERHEAD.contact,strikeEnd:OVERHEAD.recovery,approvedIdleAt:OVERHEAD.idle,previousSwingSeconds:.125,swingSeconds:.125/1.5,relativeSpeedToV16:1.5,record:'motion-tempo-request-20261001-v17.json'};delete m.playbackTempo.relativeSpeedToV15;
m.effectAlignment.allContactsAt=OVERHEAD.contact;m.reviewPlayback.historicalAllSkillsV16=m.reviewPlayback.allSkills;delete m.reviewPlayback.allSkills;
m.reviewPlayback.actualV3='qa/overhead-50percent-v17.webp';m.reviewPlayback.twoHandActualV3=m.reviewPlayback.actualV3;m.reviewPlayback.liveAllSkills='http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/?showcase=1&v=17#battle';
await write('manifest.json',JSON.stringify(m,null,2)+'\n');
await write('motion-tempo-request-20261001-v17.json',JSON.stringify({date:'2026-10-01',userRequest:'50% 더 빠르게 적용할것',baseVersion:16,additionalSpeed:1.5,appliesTo:m.playbackTempo.appliesTo,artworkChanged:false,effectPlaybackSpeedChanged:false,liveActivationApproved:false},null,2)+'\n');
await edit('battle.html','crimson-v16','crimson-v17');
await edit('index.html','./battle.html?v=16','./battle.html?v=17');await edit('index.html','./manifest.json?v=16','./manifest.json?v=17');
await edit('index.html','전체 공격·스킬 · 내려찍기 가속 V16','전체 공격·스킬 · 내려찍기 50% 추가 가속 V17');
await edit('index.html','전체 공격·스킬 · 내려찍기 스프라이트 2배 가속','전체 공격·스킬 · 내려찍기 50% 추가 가속');
await edit('source/preview.js','manifest.json?v=16','manifest.json?v=17');
let browser=await read('qa-fast-descent-v16.mjs');browser=browser.replaceAll('./qa/v16/','./qa/v17/').replaceAll('?v=16','?v=17').replace('manifest.version),16','manifest.version),17').replace('[1.63,1.70,1.74,OVERHEAD.contact,1.86,1.88,2.83]','[1.63,1.67,1.70,OVERHEAD.contact,1.785,1.80,2.75]');await write('qa-fast-descent-v17.mjs',browser);
let effects=await read('qa-effect-tempo-v16.mjs');effects=effects.replace('5e831ffb53b20721d115b20cf8db16f203ebf454','18464f195646f5c4a39205c42b26b638d75ba5d0').replaceAll('qa/v16/','qa/v17/');await write('qa-effect-tempo-v17.mjs',effects);
const previous=await read('README.md');await write('README.md',`# 은백·금색 대검 기사 — V17 내려찍기 50% 추가 가속

사용자 **“50% 더 빠르게 적용할것”**에 따라 V16의 모든 공격·스킬 공통 내려찍기 배율을 **2.4 → 3.6**으로 변경했다. 현재보다 정확히 1.5배 빠르며, 기본 재생에서 내려찍기 4프레임은 **0.125초 → 약 0.0833초**다.

**최신 전체 프리뷰:** ${m.reviewPlayback.liveAllSkills}

검이 내려가기 시작하는 들기 마지막 프레임도 함께 가속한다. 대기 삽입 없이 기존 속도의 복귀로 이어지며, 충돌 효과·방패·소리의 시작만 새 타격 시점에 맞춘다. 전체 시연 23초와 효과 재생 속도·원본 그림·체형·검 크기는 유지한다. 기존 PixiJS 8.20.0 / GSAP 3.13.0를 사용하며 운영 연결은 변경하지 않는다. 빠른 동작 확인용 녹화는 60fps의 공통 내려찍기 시연이다.

---

${previous}`);
console.log(JSON.stringify(m.playbackTempo));
