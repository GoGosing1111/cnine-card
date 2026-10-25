import {MERCENARY_LEVEL_RULES,mercenaryLevelState,mercenaryLevelRequiredXp,mercenaryLevelXpMultiplier,levelProgress,levelError} from './mercenary-level-v1.mjs';
import {MERCENARY_RANKS} from './mercenary-ranks-v1.mjs';

export const TRANSFER_VERSION='mercenary-experience-transfer-20261025-v1';
export const TRANSFER_RELEASE_ENABLED=true;
export const TRANSFER_REPAIR_MESSAGE='별도로 획득한 물약 1개를 소모해 두 용병 사이에 경험치를 이전합니다.';
export const TRANSFER_ITEM={code:'MERCENARY_XP_TRANSFER_POTION',name:'용병 경험치 50% 이전 물약',image:'/assets/items/mercenary-experience-transfer-20261025/potion.webp'};
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
// One real inventory item pays for both sides of one atomic transfer. Resetting
// a source never issues a potion. The target's lifetime usage flag is preserved.
export function planItemExperienceTransfer({policy,state,target,source,sourceState,transferState,history,requestId}){
 requireValue(source.code!==target.code,'SOURCE','서로 다른 두 용병을 선택하세요.');
 requireValue(transferGroup(source)===transferGroup(target),'RANK','같은 등급끼리만 이전할 수 있습니다. 일반 SSS와 SSS 리미티드는 별도입니다.');
 const before=mercenaryLevelState(state),sourceBefore=mercenaryLevelState(sourceState),prior=mercenaryTransferState(transferState,target.code),sourceMemory=mercenaryTransferState(transferState,source.code);
 requireValue(!prior.used,'USED','받는 용병은 경험치 이전 물약을 이미 1회 사용했습니다.');
 requireValue(!levelProgress(policy,before,target).complete,'MAX','최대 레벨 용병에게는 물약을 사용할 수 없습니다.');
 requireValue(transferState.potions.length===0,'REPAIR_PENDING','이전 사용 기록을 먼저 복구해야 합니다.');
 const amount=retainedMercenaryXp({policy,state:sourceBefore,target:source,transfer:sourceMemory,history});
 requireValue(amount.xp>0,'EMPTY','이전할 누적 경험치가 부족합니다. 최소 2 EXP가 필요합니다.');
 const applied=applyTransferXp({policy,state:before,target,xp:amount.xp}),after={...applied.after,revision:before.revision+1};
 const sourceAfter={level:1,experience:0,breakthroughMask:0,revision:sourceBefore.revision+1},next=structuredClone(transferState);
 next.revision++;next.mercenaries[source.code]={...sourceMemory,bankedXp:0,resetRevision:sourceAfter.revision};
 next.mercenaries[target.code]={...prior,used:true,usedRequestId:requestId,bankedXp:applied.bankedXp};
 return {result:{before,after,...amount,appliedXp:applied.appliedXp,bankedXp:applied.bankedXp,source:{code:source.code,name:source.name,before:sourceBefore,after:sourceAfter},item:{code:TRANSFER_ITEM.code,quantity:1}},next};
}
