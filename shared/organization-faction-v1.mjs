import {DISTRICTS as SEOUL_DISTRICTS,FACTION_RULES,SQUADS} from './clan-faction-rules-v1.mjs';
import {FACTION_SESSION_RULES} from './clan-faction-sessions-v1.mjs';
export {FACTION_RULES,SQUADS};
export const ORGANIZATION_SESSION_RULES=Object.freeze({...FACTION_SESSION_RULES,version:'20261018-organization-season',requiredTerritories:6,coinPerRecipient:300000000000});
export const ORGANIZATION_DISTRICTS=Object.freeze([
 ...SEOUL_DISTRICTS.map(d=>({...d,area:'SEOUL'})),
 ...[
 ['41570','김포시','한강신도시 · 고촌'],['41190','부천시','상동 · 중동'],['41210','광명시','철산 · 일직'],
 ['41390','시흥시','배곧 · 정왕'],['41270','안산시','중앙 · 고잔'],['41170','안양시','평촌 · 범계'],
 ['41410','군포시','산본 · 금정'],['41430','의왕시','인덕원 · 백운'],['41290','과천시','중앙 · 지식정보타운'],
 ['41130','성남시','판교 · 분당'],['41450','하남시','미사 · 감일'],['41610','광주시','경안 · 태전'],
 ['41110','수원시','광교 · 인계'],['41460','용인시','수지 · 기흥'],['41370','오산시','오산 · 세교'],
 ['41590','화성시','동탄 · 향남'],['41220','평택시','고덕 · 평택항'],['41550','안성시','공도 · 중앙'],
 ['41500','이천시','창전 · 부발'],['41670','여주시','여주 · 가남'],['41830','양평군','양평 · 양서']
 ].map(([id,name,market])=>({id,name,market,area:'GYEONGGI_SOUTH'}))
].map(Object.freeze));
export const organizationDistrictById=id=>ORGANIZATION_DISTRICTS.find(d=>d.id===String(id));
export const ORGANIZATION_ELDER_LIMIT=3;
// Explicit lists replace the old single-leader field, including an empty list.
export function organizationElderIds(state,roster,organizationId){
 const raw=Object.hasOwn(state.elders||{},organizationId)?state.elders[organizationId]:[state.commanders?.[organizationId]];
 const members=new Set(roster.filter(m=>m.clanId===organizationId&&m.status==='ACTIVE').map(m=>m.userId));
 return Array.isArray(raw)?[...new Set(raw.filter(id=>Number.isSafeInteger(id)&&members.has(id)))].slice(0,ORGANIZATION_ELDER_LIMIT):[];
}
export function validateOrganizationElders(ids,roster,organizationId){
 const fail=(message,status=409)=>{throw Object.assign(Error(message),{status,code:'ORG_ELDERS'});};
 if(!Array.isArray(ids)||ids.length>ORGANIZATION_ELDER_LIMIT||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)fail('원로는 서로 다른 조직원 최대 3명까지 지정할 수 있습니다.',400);
 if(ids.some(id=>!roster.some(m=>m.clanId===organizationId&&m.userId===id&&m.status==='ACTIVE')))fail('해당 조직의 활성 구성원만 원로로 지정할 수 있습니다.');
 return [...ids];
}
export function rankedOrganizationElders(members){
 return Array.from({length:15},(_,i)=>({organizationId:i+1,userIds:members.filter(m=>m.clanId===i+1&&m.status==='ACTIVE')
  .sort((a,b)=>b.seedPower-a.seedPower||a.slot-b.slot||a.userId-b.userId).slice(0,ORGANIZATION_ELDER_LIMIT).map(m=>m.userId)}));
}
export const defaultOrganizationFactionPolicy=()=>({revision:0,mode:'OFF',fundsPerRegion:null,upgradeCosts:[0,null,null,null,null]});
export function validateOrganizationFactionPolicy(value){
 const fail=message=>{throw Object.assign(Error(message),{status:400,code:'ORG_FACTION_POLICY'});};
 if(!value||!['OFF','TEST','ON'].includes(value.mode)||!Number.isSafeInteger(value.revision)||value.revision<0)fail('조직 세력전 운영 설정을 확인하세요.');
 const amount=(v,label)=>{if(v!==null&&(!Number.isSafeInteger(v)||v<1||v>1000000000000))fail(label+'은 1~1조 또는 미입력이어야 합니다.');return v;};
 if(!Array.isArray(value.upgradeCosts)||value.upgradeCosts.length!==5||value.upgradeCosts[0]!==0)fail('아지트 단계별 비용을 확인하세요.');
 return {revision:value.revision,mode:value.mode,fundsPerRegion:amount(value.fundsPerRegion,'지역당 조직자금'),upgradeCosts:value.upgradeCosts.map((v,i)=>i?amount(v,(i+1)+'단계 비용'):0)};
}
