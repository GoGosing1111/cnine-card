import {EQUIPMENT_POWER_STANDARD as power} from './equipment-mercenary-power-v1.mjs';
export const FORGE_RUNTIME_KEY='equipment_forge_runtime_policy_v1';
export const FORGE_ENHANCEMENT_MATERIAL='MASTER_STAR';
export const FORGE_PROTECTION_SOURCES=Object.freeze(['TOWER','SCRAPYARD','COW_ROOM']);
export const protectionSourcesDraft=()=>FORGE_PROTECTION_SOURCES.map(content=>({content,enabled:false,chancePpm:null,quantity:null}));
export function forgeRuntimeDraft(){return {revision:0,version:'forge-runtime-draft-20260913',mode:'OFF',approved:false,quoteSeconds:120,
 steps:Array.from({length:10},(_,i)=>({level:i,successPpm:null,maintainPpm:null,destroyPpm:null,coinCost:null,itemCode:FORGE_ENHANCEMENT_MATERIAL,itemQuantity:null,protectionQuantity:null})),
 protection:{itemCode:null,consume:'UNSET',sources:protectionSourcesDraft()},restoration:{enabled:false,coinCost:null,itemCode:null,itemQuantity:null,levelMode:'UNSET',expiresHours:null}};}
export function validateForgePolicy(raw){
 const fail=message=>{throw Object.assign(Error(message),{code:'FORGE_POLICY',status:400});};
 const int=(v,min,max,label,nullable=false)=>{if(nullable&&v===null)return null;if(!Number.isSafeInteger(v)||v<min||v>max)fail(`${label} 범위를 확인하세요.`);return v;};
 const code=v=>{if(v!==null&&(typeof v!=='string'||!/^[A-Z0-9_]{1,80}$/.test(v)))fail('재료 코드를 확인하세요.');return v;};
 if(!raw||!['OFF','TEST'].includes(raw.mode)||typeof raw.version!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(raw.version)||!Array.isArray(raw.steps)||raw.steps.length!==10)fail('정책 버전·모드·10단계 확률을 확인하세요.');
 const steps=raw.steps.map((r,i)=>{if(!r||r.level!==i)fail('강화 단계가 중복되거나 순서가 잘못됐습니다.');if(r.itemCode!==null&&r.itemCode!==FORGE_ENHANCEMENT_MATERIAL)fail('강화 비용은 코인 + 마스터의 별만 사용합니다.');const n={level:i,successPpm:int(r.successPpm,100000,1000000,'성공률 (최소 10%)',true),maintainPpm:int(r.maintainPpm,0,1000000,'유지율',true),destroyPpm:int(r.destroyPpm,0,1000000,'파괴율',true),coinCost:int(r.coinCost,1,1e12,'코인 비용',true),itemCode:FORGE_ENHANCEMENT_MATERIAL,itemQuantity:int(r.itemQuantity,1,1e8,'마스터의 별 수량',true),protectionQuantity:int(r.protectionQuantity,1,10000,'보호권 수량',true)};
 if([n.successPpm,n.maintainPpm,n.destroyPpm].some(x=>x!==null)&&[n.successPpm,n.maintainPpm,n.destroyPpm].reduce((s,n)=>s+(n??0),0)!==1000000)fail('단계별 확률 합계는 100%여야 합니다.');return n;});
 const p=raw.protection,r=raw.restoration;if(!p||!['UNSET','ON_ATTEMPT','ON_DESTROY'].includes(p.consume)||!r||typeof r.enabled!=='boolean'||!['UNSET','PREVIOUS','ZERO'].includes(r.levelMode))fail('보호·복구 정책을 확인하세요.');
 const sources=p.sources??protectionSourcesDraft();if(!Array.isArray(sources)||sources.length!==3)fail('보호권은 탑·폐차장·카우방 게임 내 획득만 설정합니다.');
 const approvedSources=sources.map((s,i)=>{if(!s||s.content!==FORGE_PROTECTION_SOURCES[i]||typeof s.enabled!=='boolean')fail('보호권 획득처를 확인하세요.');const next={content:s.content,enabled:s.enabled,chancePpm:int(s.chancePpm,1,1000000,'보호권 획득 확률',!s.enabled),quantity:int(s.quantity,1,100,'보호권 획득량',!s.enabled)};if(s.enabled&&!p.itemCode)fail('보호권 코드를 먼저 설정하세요.');return next;});
 const protection={itemCode:code(p.itemCode),consume:p.consume,sources:approvedSources},restoration={enabled:r.enabled,coinCost:int(r.coinCost,0,1e12,'복구 코인',true),itemCode:code(r.itemCode),itemQuantity:int(r.itemQuantity,1,1e8,'복구 재료',true),levelMode:r.levelMode,expiresHours:int(r.expiresHours,0,87600,'복구 가능 시간',true)};
 if(protection.itemCode===FORGE_ENHANCEMENT_MATERIAL)fail('마스터의 별은 강화 재료입니다. 보호권은 별도 아이템을 선택하세요.');
 if((restoration.itemCode===null)!==(restoration.itemQuantity===null))fail('복구 재료와 수량을 함께 입력하세요.');
 if(r.enabled&&(restoration.coinCost===null||restoration.expiresHours===null||r.levelMode==='UNSET'))fail('복구 비용·기한·반환 단계를 모두 설정하세요.');
 return {revision:int(raw.revision??0,0,2147483646,'수정 버전'),version:raw.version,mode:raw.mode,approved:false,quoteSeconds:int(raw.quoteSeconds,15,900,'견적 유효 시간'),steps,protection,restoration};
}
export function forgePower(baseTotal,level){
 if(!Number.isSafeInteger(baseTotal)||baseTotal<0||!Number.isInteger(level)||level<0||level>10)throw Error('INVALID_FORGE_POWER');
 const total=Math.floor(baseTotal*(100+power.bonusPercentByLevel[level])/100),pve=Math.floor(total*power.pvePercent/100);return {total,pve,pvp:total-pve};
}
