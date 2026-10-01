import {COOP_DIFFICULTIES,COOP_STAGES,COOP_PATTERNS,COOP_RULES} from './cooperative-battleground-v1.mjs';

// Encounter identity, art and the three-wave order are fixed. CMS edits combat
// values, never arbitrary actor IDs, assets or executable skill definitions.
export const COOP_MONSTERS=Object.freeze([
 {key:'STALKER_A',name:'용철 추적자 · 선봉',wave:1,slot:0,style:'MELEE',sprite:'forge-stalker-v1.png',height:240},
 {key:'STALKER_B',name:'용철 추적자 · 후위',wave:1,slot:1,style:'MELEE',sprite:'forge-stalker-v1.png',height:240},
 {key:'WATCHER',name:'불씨 감시기',wave:1,slot:2,style:'RANGED',sprite:'ember-watcher-v1.png',height:220},
 {key:'WARDEN',name:'노심 수문장',wave:2,slot:1,style:'MELEE',sprite:'core-warden-v1.png',height:300,boss:true},
 {key:'ARKE',name:'삼핵 거신 아르케',wave:3,slot:1,style:'MELEE',sprite:'arke-battle-sprite-v1.png',height:428,boss:true,finalBoss:true}
]);
export function defaultCoopCombat(){
 return {lobbySeconds:COOP_RULES.lobbyMs/1000,maxBattleSeconds:COOP_RULES.maxBattleMs/1000,
  stages:COOP_STAGES.map(s=>({wave:s.wave,name:s.name,hint:s.hint})),
  patterns:{firstSeconds:COOP_PATTERNS.firstAtMs/1000,intervalSeconds:COOP_PATTERNS.intervalMs/1000,count:COOP_PATTERNS.count,rupturePercent:COOP_PATTERNS.rupturePercent},
  difficulties:COOP_DIFFICULTIES.map(d=>({id:d.id,recommendation:d.recommendation,forcedEvery:d.forcedEvery,
   responseSeconds:COOP_PATTERNS.windowMs[d.id]/1000,overloadPercent:COOP_PATTERNS.overloadPercent[d.id],focusPercent:COOP_PATTERNS.focusPercent[d.id],
   monsters:COOP_MONSTERS.map((m,i)=>({key:m.key,power:Math.round(d.power*[.12,.12,.1,.42,1][i]),
    hpPercent:[100,100,100,240,d.hpPercent*.76][i],attackPercent:[100,100,100,100,d.attackPercent][i],
    defensePercent:d.defensePercent,shieldPercent:m.key==='WARDEN'?30:0,attackCount:[1,1,2,2,d.attackCount][i]}))}))};
}
export const defaultCoopEconomy=()=>({entryItemCode:'',entryQuantity:0,payer:'HOST',coin:0,masterStar:0,mysticEnergy:0});
export const defaultCoopSettings=()=>({mode:'TEST',testUserIds:[],revision:0,rewardLocked:true,combat:defaultCoopCombat(),economyDraft:defaultCoopEconomy()});
const invalid=message=>{throw Object.assign(Error(message),{code:'COOP_SETTINGS',status:400});};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function num(v,min,max,label){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)invalid(`${label}: ${min.toLocaleString()}~${max.toLocaleString()} 사이의 정수를 입력하세요.`);return v;}
function str(v,max,label){if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f]/.test(v))invalid(`${label}: 1~${max}자로 입력하세요.`);return v.trim();}
export function validateCoopCombat(v){
 if(!object(v)||!object(v.patterns)||!Array.isArray(v.stages)||v.stages.length!==3||!Array.isArray(v.difficulties)||v.difficulties.length!==3)invalid('전투 설정의 세 단계와 세 난이도를 확인하세요.');
 const p=v.patterns,patterns={firstSeconds:num(p.firstSeconds,1,60,'첫 기믹'),intervalSeconds:num(p.intervalSeconds,5,60,'기믹 간격'),count:num(p.count,1,6,'기믹 횟수'),rupturePercent:num(p.rupturePercent,0,60,'차단 성공 피해')};
 return {lobbySeconds:num(v.lobbySeconds,60,3600,'모집 시간'),maxBattleSeconds:num(v.maxBattleSeconds,30,180,'전투 제한 시간'),patterns,
  stages:v.stages.map((s,i)=>{if(!object(s)||s.wave!==i+1)invalid('단계 순서는 1 → 2 → 3입니다.');return {wave:i+1,name:str(s.name,30,'단계 이름'),hint:str(s.hint,180,'단계 안내')};}),
  difficulties:v.difficulties.map((d,i)=>{
   if(!object(d)||d.id!==COOP_DIFFICULTIES[i].id||!Array.isArray(d.monsters)||d.monsters.length!==5)invalid('난이도별 몬스터 5종을 확인하세요.');
   const responseSeconds=num(d.responseSeconds,3,15,'대응 시간');if(responseSeconds>=patterns.intervalSeconds)invalid('기믹 간격은 대응 시간보다 길어야 합니다.');
   return {id:d.id,recommendation:str(d.recommendation,100,'추천 편성'),forcedEvery:num(d.forcedEvery,1,12,'강제 행동 주기'),responseSeconds,
    overloadPercent:num(d.overloadPercent,0,60,'차단 실패 피해'),focusPercent:num(d.focusPercent,0,60,'집중 포화 피해'),
    monsters:d.monsters.map((m,j)=>{
     if(!object(m)||m.key!==COOP_MONSTERS[j].key)invalid('몬스터 종류와 순서를 확인하세요.');
     return {key:m.key,power:num(m.power,1000,2000000000,'몬스터 전투력'),hpPercent:num(m.hpPercent,100,1200,'체력 배율'),attackPercent:num(m.attackPercent,100,1200,'공격 배율'),
      defensePercent:num(m.defensePercent,100,1200,'방어 배율'),shieldPercent:num(m.shieldPercent,0,300,'방벽 비율'),attackCount:num(m.attackCount,1,5,'연속 공격 횟수')};
    })};
  })};
}
export function validateCoopEconomy(v){
 if(!object(v)||typeof v.entryItemCode!=='string'||!/^([A-Z][A-Z0-9_]{0,79})?$/.test(v.entryItemCode)||!['HOST','EACH'].includes(v.payer))invalid('입장 재료 코드와 부담 대상을 확인하세요.');
 const entryQuantity=num(v.entryQuantity,0,999,'입장 재료 수량');
 if(Boolean(v.entryItemCode)!==Boolean(entryQuantity))invalid('무료 입장은 재료 코드를 비우고 수량을 0으로, 재료 입장은 코드와 수량을 함께 입력하세요.');
 return {entryItemCode:v.entryItemCode,entryQuantity,payer:v.payer,coin:num(v.coin,0,1000000000000,'코인'),masterStar:num(v.masterStar,0,10000000,'마스터의 별'),mysticEnergy:num(v.mysticEnergy,0,100000,'미스틱 에너지')};
}
export function coopCombatSummary(combat=defaultCoopCombat(),revision=0){
 return {revision,maxBattleSeconds:combat.maxBattleSeconds,lobbySeconds:combat.lobbySeconds,stages:combat.stages.map((s,i)=>({...s,target:COOP_STAGES[i].target})),patterns:combat.patterns,
  difficulties:combat.difficulties.map(d=>({id:d.id,recommendation:d.recommendation,responseSeconds:d.responseSeconds,overloadPercent:d.overloadPercent,focusPercent:d.focusPercent,wardenShieldPercent:d.monsters.find(m=>m.key==='WARDEN').shieldPercent}))};
}
