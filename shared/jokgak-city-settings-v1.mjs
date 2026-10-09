import {CITY_ROLES,CITY_PLACES,CITY_RULES} from './jokgak-city-v1.mjs';
import {defaultCityLifePolicy,validateCityLifePolicy} from './jokgak-city-life-v1.mjs';

export const CITY_SETTINGS_KEY='jokgak_city_settings_v1';
export const CITY_MODES=['OFF','TEST','ON'];
export const CITY_REWARD_EVENTS={ATTACK_WIN:'공격 승리',ATTACK_LOSE:'공격 패배',ATTACK_DRAW:'공격 무승부',ARREST_WIN:'체포 성공',INSPECT:'검문 완료',HEAL_OTHER:'다른 사람 치료'};
export const roleRewardEvents=code=>['ATTACK_WIN','ATTACK_LOSE','ATTACK_DRAW',...(code==='POLICE'?['ARREST_WIN','INSPECT']:[]),...(['NURSE','DOCTOR'].includes(code)?['HEAL_OTHER']:[])];
export function defaultCitySettings(){
  return {revision:0,mode:'TEST',testUserIds:[],rules:{moveCooldownMs:CITY_RULES.moveCooldownMs,targetProtectionMs:CITY_RULES.targetProtectionMs,rejoinCooldownMs:CITY_RULES.rejoinCooldownMs},
    rewards:{enabled:false,dailyLimit:20,sameTargetCooldownMs:3600000},life:defaultCityLifePolicy(),
    roles:CITY_ROLES.map(({code})=>({code,weight:1,startLocation:'HOME',attackEnabled:true,maxHealth:100,regenPerMinute:5,defeatDamage:25,attackCooldownMs:15000,wantedPerAttack:1,
      ...(code==='POLICE'?{inspectEnabled:true,inspectCooldownMs:10000,arrestEnabled:true,arrestMinWanted:1,arrestMs:60000}:{}),
      ...(['NURSE','DOCTOR'].includes(code)?{healAmount:code==='DOCTOR'?50:25,healCooldownMs:30000,selfHeal:true}:{}),
      rewards:roleRewardEvents(code).map(event=>({event,coin:0,items:[]}))}))};
}
export const cityCanAccess=(policy,user)=>!!user&&(policy.mode==='ON'||policy.mode==='TEST'&&(user.role==='OWNER'||policy.testUserIds.includes(Number(user.id))));
export const cityRolePolicy=(policy,code)=>policy.roles.find(role=>role.code===code);
export function cityRoleDescription(r){
  const common=`최대 체력 ${r.maxHealth} · 분당 회복 ${r.regenPerMinute} · ${r.attackEnabled?`승리 피해 ${r.defeatDamage} / 공격 대기 ${r.attackCooldownMs/1000}초`:'공격 사용 안 함'}`;
  return common+(r.code==='POLICE'?` · 검문 ${r.inspectEnabled?'사용':'OFF'} · 체포 ${r.arrestEnabled?`수배 ${r.arrestMinWanted} 이상 / ${r.arrestMs/1000}초 구금`:'OFF'}`:['NURSE','DOCTOR'].includes(r.code)?` · 치료 ${r.healAmount} / ${r.healCooldownMs/1000}초`:'');
}
const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(key=>keys.includes(key));
const number=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const fail=message=>{throw Object.assign(Error(message),{code:'CITY_POLICY',status:400});};
export function validateCitySettings(value){
  if(!object(value,['revision','mode','testUserIds','rules','rewards','roles','life','enabled','updatedAt','updatedBy'])||!number(value.revision,0,1e9)||!CITY_MODES.includes(value.mode))fail('운영 모드와 설정 버전을 확인하세요.');
  const life=validateCityLifePolicy(value.life??defaultCityLifePolicy());
  if(!Array.isArray(value.testUserIds)||value.testUserIds.length>100||new Set(value.testUserIds).size!==value.testUserIds.length||value.testUserIds.some(id=>!number(id,1,Number.MAX_SAFE_INTEGER)))fail('테스트 참여자는 중복 없이 최대 100명까지 지정하세요.');
  const rules=value.rules;
  if(!object(rules,['moveCooldownMs','targetProtectionMs','rejoinCooldownMs'])||!number(rules.moveCooldownMs,1000,60000)||!number(rules.targetProtectionMs,1000,3600000)||!number(rules.rejoinCooldownMs,0,3600000))fail('이동 1~60초, 교전 보호 1~3600초, 재입장 0~3600초를 확인하세요.');
  const reward=value.rewards;
  if(!object(reward,['enabled','dailyLimit','sameTargetCooldownMs'])||typeof reward.enabled!=='boolean'||!number(reward.dailyLimit,0,1000)||!number(reward.sameTargetCooldownMs,0,86400000))fail('보상 사용·일일 횟수(0~1000)·같은 상대 보상 대기(0~86400초)를 확인하세요.');
  if(!Array.isArray(value.roles)||value.roles.length!==7)fail('7가지 역할을 모두 설정하세요.');
  const defaults=defaultCitySettings(),seen=new Set();
  const roles=value.roles.map(r=>{
    const base=defaults.roles.find(row=>row.code===r?.code);
    if(!base||seen.has(r.code)||!object(r,Object.keys(base)))fail('역할 코드와 해당 역할의 설정 항목을 확인하세요.');
    seen.add(r.code);
    if(!number(r.weight,0,10000)||!CITY_PLACES.some(p=>p.id===r.startLocation)||typeof r.attackEnabled!=='boolean'||!number(r.maxHealth,10,100)||!number(r.regenPerMinute,0,100)||!number(r.defeatDamage,1,100)||!number(r.attackCooldownMs,1000,3600000)||!number(r.wantedPerAttack,0,5))fail('역할의 배정 비중·시작 장소·체력·회복·피해·공격 대기·수배 값을 확인하세요.');
    if(r.code==='POLICE'&&(typeof r.inspectEnabled!=='boolean'||typeof r.arrestEnabled!=='boolean'||!number(r.inspectCooldownMs,1000,3600000)||!number(r.arrestMinWanted,1,5)||!number(r.arrestMs,1000,3600000)))fail('경찰의 검문·체포 사용, 대기시간, 최소 수배와 구금 시간을 확인하세요.');
    if(['NURSE','DOCTOR'].includes(r.code)&&(!number(r.healAmount,0,100)||!number(r.healCooldownMs,1000,3600000)||typeof r.selfHeal!=='boolean'))fail('의료진의 회복량·치료 대기·자기 치료 설정을 확인하세요.');
    const events=roleRewardEvents(r.code);
    if(!Array.isArray(r.rewards)||r.rewards.length!==events.length||new Set(r.rewards.map(x=>x.event)).size!==events.length)fail('역할별 보상 조건을 빠짐없이 지정하세요.');
    for(const row of r.rewards){
      if(!object(row,['event','coin','items'])||!events.includes(row.event)||!number(row.coin,0,100000000)||!Array.isArray(row.items)||row.items.length>5)fail('조건별 코인은 0~1억, 아이템은 최대 5종입니다.');
      if(new Set(row.items.map(x=>x.code)).size!==row.items.length||row.items.some(x=>!object(x,['code','quantity'])||typeof x.code!=='string'||!/^[A-Z0-9_:-]{1,100}$/.test(x.code)||!number(x.quantity,1,1000000)))fail('보상 아이템 중복·코드와 수량(1~100만)을 확인하세요.');
    }
    return structuredClone(r);
  });
  if(!roles.some(r=>r.weight>0))fail('최소 한 역할의 배정 비중은 0보다 커야 합니다.');
  return {revision:value.revision,mode:value.mode,testUserIds:[...value.testUserIds].sort((a,b)=>a-b),rules:{...rules},rewards:{...reward},life,roles:CITY_ROLES.map(r=>roles.find(x=>x.code===r.code))};
}
