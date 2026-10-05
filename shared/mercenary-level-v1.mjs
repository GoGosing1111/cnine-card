import {MERCENARY_RANKS} from './mercenary-ranks-v1.mjs';

// Preparation only. A future user-approved release must explicitly open this gate.
export const MERCENARY_LEVEL_RELEASE_ENABLED=false;
export const MERCENARY_LEVEL_KEY='mercenary_level_policy_v1';
export const MERCENARY_LEVEL_RULES=Object.freeze({version:'mercenary-level-20261005',maxLevel:20,milestones:Object.freeze([5,10,15,20]),materialKind:'MERCENARY',materialRank:'SAME_RANK',preserveOriginal:true,coinCost:0,masterStarCost:0,maxMaterials:100,failure:'CURRENT_LEVEL_EXP_ZERO'});
export const LEVEL_BONUS_TYPES=Object.freeze({HP_PERCENT:'최대 체력 증가',ATTACK_PERCENT:'공격력 증가',DEFENSE_PERCENT:'방어력 증가',SKILL_POWER_PERCENT:'배정 스킬 계수 증가',SKILL_COOLDOWN_TURNS:'배정 스킬 재사용 감소'});
export function mercenaryLevelDraft(){return {version:MERCENARY_LEVEL_RULES.version,revision:0,mode:'OFF',sameCardMultiplier:null,xpPerCard:Object.fromEntries(MERCENARY_RANKS.map(rank=>[rank,null])),levels:Array.from({length:20},(_,i)=>({level:i+1,requiredXp:null})),milestones:[5,10,15,20].map(level=>({level,successChancePpm:null,bonus:{type:null,value:null}}))};}
export const levelError=(code,message,status=400)=>Object.assign(Error(message),{code,status});
const check=(ok,message,code='MERCENARY_LEVEL_CONFIG')=>{if(!ok)throw levelError(code,message);};
const keys=(value,expected,label)=>check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===expected.length&&expected.every(k=>Object.hasOwn(value,k)),label+' 항목을 확인하세요.');
const int=(v,min,max,label,nullable=false)=>{check(nullable&&v===null||Number.isSafeInteger(v)&&v>=min&&v<=max,label+' 값을 확인하세요.');return v;};
export function validateMercenaryLevelPolicy(raw){
 keys(raw,['version','revision','mode','sameCardMultiplier','xpPerCard','levels','milestones'],'성장 정책');
 check(raw.version===MERCENARY_LEVEL_RULES.version,'성장 정책 버전을 확인하세요.');int(raw.revision,0,2147483646,'정책 수정 버전');
 check(['OFF','ON'].includes(raw.mode),'성장 실행 상태를 확인하세요.');
 const m=raw.sameCardMultiplier;check(m===null||Number.isFinite(m)&&m>1&&m<=100&&Math.abs(m*100-Math.round(m*100))<1e-8,'동일 용병 배수는 1 초과 100 이하, 소수 둘째 자리까지 입력하세요.');
 keys(raw.xpPerCard,MERCENARY_RANKS,'등급별 경험치');for(const rank of MERCENARY_RANKS)int(raw.xpPerCard[rank],1,1e9,rank+' 재료 경험치',true);
 check(Array.isArray(raw.levels)&&raw.levels.length===20,'1~20레벨 경험치를 모두 설정하세요.');
 raw.levels.forEach((r,i)=>{keys(r,['level','requiredXp'],'레벨 경험치');check(r.level===i+1,'레벨 경험치 순서를 확인하세요.');int(r.requiredXp,1,1e12,`${r.level}레벨 필요 경험치`,true);});
 check(Array.isArray(raw.milestones)&&raw.milestones.length===4,'5·10·15·20레벨 돌파를 모두 설정하세요.');
 raw.milestones.forEach((r,i)=>{keys(r,['level','successChancePpm','bonus'],'돌파');check(r.level===MERCENARY_LEVEL_RULES.milestones[i],'돌파 레벨을 확인하세요.');int(r.successChancePpm,0,1000000,`${r.level}레벨 돌파 확률`,true);keys(r.bonus,['type','value'],'돌파 효과');check(r.bonus.type===null||Object.hasOwn(LEVEL_BONUS_TYPES,r.bonus.type),'돌파 효과 종류를 확인하세요.');
  const v=r.bonus.value;check(v===null||Number.isFinite(v)&&v>0&&v<=1000&&Math.abs(v*100-Math.round(v*100))<1e-8,'돌파 효과 수치를 확인하세요.');if(r.bonus.type==='SKILL_COOLDOWN_TURNS'&&v!==null)int(v,1,20,'재사용 감소 턴');});
 return structuredClone(raw);
}
export function mercenaryLevelReadiness(policy){
 const p=validateMercenaryLevelPolicy(policy),missing=[];
 if(p.sameCardMultiplier===null)missing.push('동일 용병 경험치 배수');
 for(const rank of MERCENARY_RANKS)if(p.xpPerCard[rank]===null)missing.push(rank+' 등급 재료 경험치');
 for(const r of p.levels)if(r.requiredXp===null)missing.push(`Lv.${r.level} 필요 경험치`);
 for(const r of p.milestones){if(r.successChancePpm===null)missing.push(`Lv.${r.level} 돌파 확률`);if(r.bonus.type===null||r.bonus.value===null)missing.push(`Lv.${r.level} 돌파 효과`);}
 return {ready:missing.length===0,missing};
}
export const initialMercenaryLevel=()=>({level:1,experience:0,breakthroughMask:0,revision:0});
export function mercenaryLevelState(row){
 if(!row)return initialMercenaryLevel();
 const s={level:Number(row.level),experience:Number(row.experience),breakthroughMask:Number(row.breakthroughMask??row.breakthrough_mask),revision:Number(row.revision)};
 int(s.level,1,20,'용병 레벨');int(s.experience,0,1e12,'용병 경험치');int(s.breakthroughMask,0,15,'돌파 기록');int(s.revision,0,2147483646,'성장 수정 버전');
 const unlocked=MERCENARY_LEVEL_RULES.milestones.filter((_,i)=>s.breakthroughMask&(1<<i));
 check(unlocked.every((level,i)=>level===MERCENARY_LEVEL_RULES.milestones[i]&&(level<s.level||level===20&&s.level===20)),'연속 돌파 기록을 확인하세요.');
 for(const [i,level] of MERCENARY_LEVEL_RULES.milestones.entries())check(s.level<=level||Boolean(s.breakthroughMask&(1<<i)),'돌파를 건너뛴 성장 기록입니다.');
 check(!(s.breakthroughMask&8)||s.level===20&&s.experience===0,'최종 돌파 기록을 확인하세요.');return s;
}
export const isLevelComplete=s=>s.level===20&&Boolean(s.breakthroughMask&8);
export function levelProgress(policy,row){
 const s=mercenaryLevelState(row),requiredXp=policy.levels[s.level-1].requiredXp,complete=isLevelComplete(s),checkpoint=MERCENARY_LEVEL_RULES.milestones.includes(s.level)&&!(s.breakthroughMask&(1<<MERCENARY_LEVEL_RULES.milestones.indexOf(s.level)));
 check(requiredXp===null||s.experience<=requiredXp&&((checkpoint||complete)||s.experience<requiredXp),'현재 경험치와 성장 정책을 확인하세요.','MERCENARY_LEVEL_STATE');
 return {...s,requiredXp,complete,percent:complete?100:requiredXp===null?null:Math.min(100,s.experience/requiredXp*100),breakthroughReady:!complete&&checkpoint&&requiredXp!==null&&s.experience===requiredXp};
}
export function normalizeLevelMaterials(value){
 check(Array.isArray(value)&&value.length>0&&value.length<=100,'재료 용병을 선택하세요.','MERCENARY_LEVEL_MATERIALS');
 const counts=new Map();for(const r of value){keys(r,['code','quantity'],'재료 용병');check(/^V-\d{3}$/.test(r.code),'재료 용병 코드를 확인하세요.');int(r.quantity,1,100,'재료 수량');counts.set(r.code,(counts.get(r.code)||0)+r.quantity);}
 check([...counts.values()].reduce((a,b)=>a+b,0)<=100,'한 번에 재료 100장까지 사용할 수 있습니다.','MERCENARY_LEVEL_MATERIALS');
 return [...counts].sort(([a],[b])=>a.localeCompare(b)).map(([code,quantity])=>({code,quantity}));
}
function configured(policy){const ready=mercenaryLevelReadiness(policy);if(!ready.ready)throw levelError('MERCENARY_LEVEL_UNCONFIGURED','경험치·동일 카드 배수·돌파 확률과 효과 설정을 완료해야 합니다.',409);}
export function planMercenaryTraining({policy,state,target,materials,owned,catalog}){
 configured(policy);const before=mercenaryLevelState(state),progress=levelProgress(policy,before);
 check(!progress.complete,'최종 돌파를 완료한 용병입니다.','MERCENARY_LEVEL_MAX');check(!progress.breakthroughReady,'경험치가 가득 찼습니다. 먼저 돌파를 시도하세요.','MERCENARY_LEVEL_BREAKTHROUGH_REQUIRED');
 const rank=target?.rank;check(MERCENARY_RANKS.includes(rank),'성장 대상의 등급을 확인하세요.','MERCENARY_LEVEL_RANK');
 const selected=normalizeLevelMaterials(materials),consumed=selected.map(m=>{
  const card=catalog.find(c=>c.code===m.code),row=owned.find(c=>(c.code||c.mercenary_code)===m.code),copies=Number(row?.totalCopies??row?.total_copies),duplicates=Number(row?.duplicates??row?.duplicate_count);
  check(card?.rank===rank,'대상과 같은 등급의 용병 카드만 사용할 수 있습니다.','MERCENARY_LEVEL_RANK');
  check(Number.isSafeInteger(copies)&&Number.isSafeInteger(duplicates)&&copies===duplicates+1&&duplicates>=m.quantity,'중복 카드가 부족합니다. 용병마다 기본 보유 1장은 보호합니다.','MERCENARY_LEVEL_DUPLICATES');
  const identical=m.code===target.code,xpEach=Math.floor(policy.xpPerCard[rank]*(identical?policy.sameCardMultiplier:1));
  return {...m,name:card.name,identical,xpEach,xp:xpEach*m.quantity,totalBefore:copies,duplicatesBefore:duplicates};
 });
 const xp=consumed.reduce((n,m)=>n+m.xp,0);check(Number.isSafeInteger(xp)&&xp>0,'획득 경험치가 올바르지 않습니다.');
 const after={...before,experience:before.experience+xp,revision:before.revision+1};let overflowXp=0;
 while(after.experience>=policy.levels[after.level-1].requiredXp){
  const required=policy.levels[after.level-1].requiredXp;
  if(MERCENARY_LEVEL_RULES.milestones.includes(after.level)){overflowXp=after.experience-required;after.experience=required;break;}
  after.experience-=required;after.level++;
 }
 return {before,after,consumed,xp,appliedXp:xp-overflowXp,overflowXp,breakthroughReady:levelProgress(policy,after).breakthroughReady};
}
export function planMercenaryBreakthrough({policy,state,roll}){
 configured(policy);const before=mercenaryLevelState(state),progress=levelProgress(policy,before);
 check(progress.breakthroughReady,'5·10·15·20레벨 경험치가 100%일 때 돌파할 수 있습니다.','MERCENARY_LEVEL_NOT_READY');int(roll,0,999999,'돌파 판정');
 const milestone=policy.milestones.find(m=>m.level===before.level),success=roll<milestone.successChancePpm,index=MERCENARY_LEVEL_RULES.milestones.indexOf(before.level);
 const after={...before,experience:0,revision:before.revision+1};
 if(success){after.breakthroughMask|=1<<index;after.level=Math.min(20,before.level+1);}
 return {before,after,milestone:structuredClone(milestone),success,roll,reward:success?structuredClone(milestone.bonus):null,complete:isLevelComplete(after)};
}
export function mercenaryLevelBonuses(policy,state){
 const s=mercenaryLevelState(state);return policy.milestones.filter((_,i)=>s.breakthroughMask&(1<<i)).map(m=>({level:m.level,...m.bonus}));
}
// Only server-captured growth enters battle snapshots. Historical snapshots
// without this property retain their exact pre-growth behavior on replay.
export function attachMercenaryLevel(snapshot,policy,state){
 configured(policy);const s=mercenaryLevelState(state),bonuses=mercenaryLevelBonuses(policy,s);
 return {...snapshot,level:s.level,mercenaryLevel:{version:1,level:s.level,policyRevision:policy.revision,breakthroughMask:s.breakthroughMask,bonuses}};
}
export function applyMercenaryLevelStats(actor){
 const g=actor.mercenaryLevel;if(!actor.isMercenary||g?.version!==1||actor.mercenaryLevelApplied)return;
 mercenaryLevelState({level:g.level,experience:0,breakthroughMask:g.breakthroughMask,revision:0});
 check(Array.isArray(g.bonuses)&&g.bonuses.length===MERCENARY_LEVEL_RULES.milestones.filter((_,i)=>g.breakthroughMask&(1<<i)).length&&g.bonuses.every((b,i)=>b.level===MERCENARY_LEVEL_RULES.milestones[i]&&Object.hasOwn(LEVEL_BONUS_TYPES,b.type)&&Number.isFinite(b.value)&&b.value>0&&b.value<=1000),'전투 성장 효과를 확인하세요.');
 const sum=type=>g.bonuses.filter(b=>b.type===type).reduce((n,b)=>n+b.value,0),scale=(n,percent)=>{const v=Math.floor(n*(1+percent/100));if(!Number.isSafeInteger(v)||v<0)throw Error('INVALID_MERCENARY_LEVEL_STATS');return v;};
 const hpPercent=sum('HP_PERCENT'),attackPercent=sum('ATTACK_PERCENT'),ratio=actor.maxHp>0?Math.max(0,Math.min(1,actor.hp/actor.maxHp)):0;
 actor.maxHp=scale(actor.maxHp,hpPercent);actor.hp=Math.floor(actor.maxHp*ratio);actor.attack=scale(actor.attack,attackPercent);actor.defense=scale(actor.defense,sum('DEFENSE_PERCENT'));
 if(actor.mercenaryLink)actor.mercenaryLink={...actor.mercenaryLink,attackFloor:scale(actor.mercenaryLink.attackFloor,attackPercent),hpFloor:scale(actor.mercenaryLink.hpFloor,hpPercent)};
 const power=sum('SKILL_POWER_PERCENT'),cooldown=sum('SKILL_COOLDOWN_TURNS');
 actor.skills=(actor.skills||[]).map(skill=>({...skill,balance:{...skill.balance,damageRatio:Math.min(10000,skill.balance.damageRatio*(1+power/100)),cooldownTurns:skill.balance.cooldownTurns===0?0:Math.max(1,skill.balance.cooldownTurns-cooldown)}}));
 actor.level=g.level;actor.mercenaryLevelApplied=true;
}
