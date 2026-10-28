import {ZERO_ART,ZERO_AREA_EVENT,ZERO_AREA_SKILLS} from './mercenary-zero-v1.mjs';
import {PRIME_ART,PRIME_AREA_EVENT,PRIME_AREA_SKILLS} from './mercenary-prime-requiem-v1.mjs';
import {GENERAL_JOK_ART,GENERAL_JOK_AREA_EVENT,GENERAL_JOK_AREA_SKILLS} from './mercenary-general-jok-v1.mjs';
import {CARDGU_ART,CARDGU_AREA_EVENT,CARDGU_AREA_SKILLS} from './mercenary-cardgu-v1.mjs';
import {REVAN_ART,REVAN_AREA_EVENT,REVAN_AREA_FORMS} from './mercenary-revan-v1.mjs';

export const AREA_CUTIN_DURATION=1.15;
const profile=(art,event,skills,theme,face,position,lines)=>Object.freeze({
 code:art.code,name:art.name,art:'/'+art.sourceArt,artSha256:art.sourceArtSha256,event,face,
 skills:Object.freeze(skills.map((s,i)=>Object.freeze({id:s.id,name:s.name,visualMode:s.visualMode,line:lines[i]}))),
 dialogue:Object.freeze({code:art.code,name:art.name,theme,skill:'광역 궁극기',lines:Object.freeze(lines),idleLine:lines[0],portrait:'/'+art.sourceArt,position,size:'450% auto'})
});
export const AREA_CUTIN_PROFILES=Object.freeze([
 profile(ZERO_ART,ZERO_AREA_EVENT,ZERO_AREA_SKILLS,'sss-zero',[.475,.138],'47% 10%',[
  '도망칠 하늘은 없다. 천검, 전개.','하늘의 끝까지, 베어내겠다.'
 ]),
 profile(PRIME_ART,PRIME_AREA_EVENT,PRIME_AREA_SKILLS,'sss-prime-requiem',[.400,.211],'38% 18%',[
  '깨어나라, 혈호. 전부 집어삼켜라.','붉은 잔영이 보였다면, 이미 늦었다.',
  '이 하늘마저, 피로 물들여라.','적월이 지는 순간, 너희도 끝이다.'
 ]),
 profile(GENERAL_JOK_ART,GENERAL_JOK_AREA_EVENT,GENERAL_JOK_AREA_SKILLS,'sss-general-jok',[.261,.241],'20% 22%',[
  '전 함대, 조준 완료. 이 전장을 끝낸다.','야포단, 일제 사격. 한 놈도 놓치지 마라.',
  '그 방어선째로, 부숴주마.','내 탄환 앞에, 안전지대는 없다.',
  '고개를 들어라. 포화가 쏟아진다.','숨 쉴 틈도 주지 마라. 계속 쏴라.'
 ]),
 profile(CARDGU_ART,CARDGU_AREA_EVENT,CARDGU_AREA_SKILLS,'sss-cardgu',[.474,.101],'47% 6%',[
  '패는 다 돌렸다. 이제, 판을 뒤집지.','마지막 패다. 왕관은 내가 가져간다.'
 ]),
 profile(REVAN_ART,REVAN_AREA_EVENT,REVAN_AREA_FORMS,'sss-revan',[.484,.157],'48% 12%',[
  '기도는 끝났나. 이제, 종언이다.','남길 것은 없다. 전부 베어 없앤다.'
 ])
]);
export function resolveAreaCutin(event,actor){
 const profile=AREA_CUTIN_PROFILES.find(p=>p.code===actor?.cardId);
 if(!profile||!actor.isMercenary||event.type!==profile.event||event.battleMode!=='PVE'||!event.hits?.length)return null;
 // Both Revan forms use the MS-929 server budget; visualMode identifies 멸참.
 const skill=profile.code==='V-971'
  ?event.skillId==='MS-929'&&profile.skills.find(s=>s.visualMode===(event.visualMode==='myeol'?'myeol':'jongeon'))
  :profile.skills.find(s=>s.id===event.skillId);
 return skill?{profile,skill}:null;
}

// Engine-local presentation memory. Cancellation/visibility changes do not
// consume another showing; a new battle identity starts a fresh allowance.
export function areaCutinBattleKey(payload){
 const id=payload?.battleId??payload?.id??payload?.battleV2?.battleId;
 return id!=null?`${payload?.mode||''}:${id}`:payload;
}
export function claimAreaCutin(state,actor){
 const key=String(actor.id||`${actor.team}:${actor.ownerId||''}:${actor.cardId}`);
 if(state.shown.has(key))return false;state.shown.add(key);return true;
}
