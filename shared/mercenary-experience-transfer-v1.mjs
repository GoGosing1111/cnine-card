import {MERCENARY_LEVEL_RULES,mercenaryLevelState,mercenaryLevelRequiredXp,mercenaryLevelXpMultiplier,levelProgress,levelError} from './mercenary-level-v1.mjs';
import {MERCENARY_RANKS} from './mercenary-ranks-v1.mjs';

export const TRANSFER_VERSION='mercenary-experience-transfer-20261025-v1';
export const TRANSFER_ITEM={code:'MERCENARY_XP_TRANSFER_POTION',name:'용병 경험치 이전 물약',image:'/assets/items/mercenary-experience-transfer-20261025/potion.webp'};
export const transferError=(code,message,status=409)=>levelError('MERCENARY_TRANSFER_'+code,message,status);
const requireValue=(ok,code,message)=>{if(!ok)throw transferError(code,message);};
const integer=(n,max=100000000000000)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
export function transferGroup(card){
 requireValue(MERCENARY_RANKS.includes(card?.rank),'RANK','용병의 등급을 확인하세요.');
 // The user explicitly separates ordinary SSS from SSS LIMITED. Other ranks
 // retain their existing rank boundary; seasonal SS variants remain SS.
 return card.rank==='SSS'&&mercenaryLevelXpMultiplier(card)>1?'SSS_LIMITED':card.rank;
}
export const transferGroupLabel=group=>group==='SSS_LIMITED'?'SSS 리미티드':group==='SSS'?'일반 SSS':group;
export const emptyTransferState=()=>({version:TRANSFER_VERSION,revision:0,potions:[],mercenaries:{}});
export function decodeTransferState(raw){
 if(raw===null||raw===undefined)return emptyTransferState();
 let s;try{s=JSON.parse(raw);}catch{}
 const valid=s?.version===TRANSFER_VERSION&&integer(s.revision,2147483646)&&Array.isArray(s.potions)&&s.potions.length<=200&&s.mercenaries&&typeof s.mercenaries==='object'&&!Array.isArray(s.mercenaries);
 requireValue(valid,'STATE','물약 보관 기록을 읽지 못했습니다. 다시 불러오세요.');
 const ids=new Set();
 for(const p of s.potions){requireValue(typeof p.id==='string'&&/^[A-Za-z0-9_-]{16,100}$/.test(p.id)&&!ids.has(p.id)&&/^V-\d{3}$/.test(p.sourceCode)&&typeof p.sourceName==='string'&&[...MERCENARY_RANKS,'SSS_LIMITED'].includes(p.group)&&integer(p.xp)&&p.xp>0&&typeof p.createdAt==='string','STATE','물약 보관 기록을 확인하세요.');ids.add(p.id);}
 for(const [code,m] of Object.entries(s.mercenaries))requireValue(/^V-\d{3}$/.test(code)&&typeof m.used==='boolean'&&integer(m.bankedXp)&&integer(m.resetRevision,2147483646),'STATE','용병의 물약 사용 기록을 확인하세요.');
 return s;
}
export const mercenaryTransferState=(s,code)=>s.mercenaries[code]||{used:false,bankedXp:0,resetRevision:0};

// Count retained growth only. Successful level costs use their immutable receipt
// policy when present, so a subsequent CMS change cannot reprice recorded XP.
// Legacy/manual levels without receipts use the current curve, shown in the quote.
export function retainedMercenaryXp({policy,state,target,transfer,history=[]}){
 const s=mercenaryLevelState(state),costs=new Map();let fallbackLevels=0;
 for(const {plan} of history){
  const r=plan.result;
  if(plan.mercenaryCode!==target.code||!r?.before||!r?.after||r.after.revision<=transfer.resetRevision||r.after.revision>s.revision||!plan.policyRaw||plan.action==='EXTRACT')continue;
  if(r.after.level<=r.before.level)continue;
  const historical=JSON.parse(plan.policyRaw);
  for(let level=r.before.level;level<r.after.level&&level<s.level;level++){
   const xp=mercenaryLevelRequiredXp(historical,level,target);
   requireValue(integer(xp)&&xp>0,'HISTORY','이전 레벨 경험치 기록을 확인하지 못했습니다.');
   const prior=costs.get(level);if(!prior||prior.revision<r.after.revision)costs.set(level,{xp,revision:r.after.revision});
  }
 }
 let total=s.experience+transfer.bankedXp;
 for(let level=1;level<s.level;level++){const found=costs.get(level);if(!found)fallbackLevels++;total+=found?.xp??mercenaryLevelRequiredXp(policy,level,target);}
 requireValue(integer(total),'AMOUNT','추출 경험치 범위를 확인하세요.');
 return {totalXp:total,xp:Math.floor(total/2),fallbackLevels,bankedXp:transfer.bankedXp};
}

// Checkpoints keep their original success/failure rules. The remainder is held
// with this mercenary and released after each normal breakthrough attempt.
export function applyTransferXp({policy,state,target,xp}){
 requireValue(integer(xp),'AMOUNT','물약 경험치를 확인하세요.');
 const after={...mercenaryLevelState(state)};let remaining=xp;
 while(remaining>0){
  const progress=levelProgress(policy,after,target);if(progress.complete||progress.breakthroughReady)break;
  requireValue(integer(progress.requiredXp)&&progress.requiredXp>0,'POLICY','레벨 경험치 설정을 확인하세요.');
  const take=Math.min(remaining,progress.requiredXp-after.experience);after.experience+=take;remaining-=take;
  if(after.experience===progress.requiredXp&&!MERCENARY_LEVEL_RULES.milestones.includes(after.level)){after.experience=0;after.level++;}
 }
 return {after,appliedXp:xp-remaining,bankedXp:remaining};
}
export function planExperienceExtraction({policy,state,target,transferState,history,requestId,createdAt}){
 const before=mercenaryLevelState(state),prior=mercenaryTransferState(transferState,target.code),amount=retainedMercenaryXp({policy,state,target,transfer:prior,history});
 requireValue(amount.xp>0,'EMPTY','추출할 누적 성장 경험치가 부족합니다. 최소 2 EXP가 필요합니다.');
 requireValue(transferState.potions.length<200,'STORAGE','물약 보관함이 가득 찼습니다. 보관 중인 물약을 먼저 사용하세요.');
 const potion={id:requestId,sourceCode:target.code,sourceName:target.name,group:transferGroup(target),xp:amount.xp,createdAt};
 const after={level:1,experience:0,breakthroughMask:0,revision:before.revision+1},next=structuredClone(transferState);
 next.revision++;next.potions.push(potion);
 next.mercenaries[target.code]={...prior,bankedXp:0,resetRevision:after.revision};
 return {result:{before,after,...amount,potion},next};
}
export function planExperienceInfusion({policy,state,target,transferState,potionId,requestId}){
 const before=mercenaryLevelState(state),prior=mercenaryTransferState(transferState,target.code);
 requireValue(!prior.used,'USED','이 용병은 경험치 이전 물약을 이미 1회 사용했습니다. 초기화해도 다시 사용할 수 없습니다.');
 const potion=transferState.potions.find(p=>p.id===potionId);
 requireValue(potion,'POTION','보유한 경험치 이전 물약을 선택하세요.');
 requireValue(potion.group===transferGroup(target),'RANK','대상과 같은 등급의 물약만 사용할 수 있습니다. 일반 SSS와 SSS 리미티드는 별도입니다.');
 requireValue(potion.sourceCode!==target.code,'SOURCE','경험치를 추출한 용병이 아닌 다른 용병에게 사용하세요.');
 requireValue(!levelProgress(policy,before,target).complete,'MAX','최대 레벨 용병에게는 물약을 사용할 수 없습니다.');
 const applied=applyTransferXp({policy,state:before,target,xp:potion.xp}),after={...applied.after,revision:before.revision+1},next=structuredClone(transferState);
 next.revision++;next.potions=next.potions.filter(p=>p.id!==potionId);
 next.mercenaries[target.code]={...prior,used:true,usedRequestId:requestId,bankedXp:applied.bankedXp};
 return {result:{before,after,potion,appliedXp:applied.appliedXp,bankedXp:applied.bankedXp},next};
}
