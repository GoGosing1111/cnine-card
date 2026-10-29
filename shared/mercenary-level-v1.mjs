import {HEUKMU_CODE} from './mercenary-heukmu-v1.mjs';
import {KAMISHIRO_CODE} from './mercenary-kamishiro-v1.mjs';
import {CARDGU_CODE} from './mercenary-cardgu-v1.mjs';
import {REVAN_CODE} from './mercenary-revan-v1.mjs';
import {AWAKENED_OMEGA_CODE} from './mercenary-awakened-omega-v1.mjs';
import {EUNSEOL_CODE} from './mercenary-eunseol-v1.mjs';
import {GENERAL_JOK_CODE} from './mercenary-general-jok-v1.mjs';
import {PRIME_CODE} from './mercenary-prime-requiem-v1.mjs';
import {MERCENARY_BREAKTHROUGH_PITY_LIMITS,mercenaryBreakthroughPity} from './mercenary-breakthrough-pity-v1.mjs';
import {ZERO_CODE} from './mercenary-zero-v1.mjs';
import {LEONEL_CODE} from './mercenary-leonel-v1.mjs';
import {JOKRO_CODE} from './mercenary-jokro-v1.mjs';
export {mercenaryGrowthDraft,mercenaryGrowthSummary,mercenaryGrowthStatPreview,mercenaryGrowthLevelTable,mercenaryGrowthReadiness,MERCENARY_GROWTH_VERSION,MERCENARY_GROWTH_REVIEW} from './mercenary-growth-review-v2.mjs?v=20261025-cap21-v1';
import {MERCENARY_GROWTH_MAX_LEVEL,validateMercenaryGrowth,mercenaryGrowthSummary,mercenaryGrowthStatPreview,mercenaryGrowthReadiness,mercenaryGrowthOpeningGauge} from './mercenary-growth-review-v2.mjs?v=20261025-cap21-v1';
import {SHIRANUI_CODE} from './mercenary-shiranui-v1.mjs';
import {MERCENARY_RANKS} from './mercenary-ranks-v1.mjs';
import {ALL_LIMITED_MERCENARIES as LIMITED_MERCENARIES} from './mercenary-limited-catalog-v1.mjs';
import {KAIRON_CODE} from './mercenary-kairon-v1.mjs';
import {JINMU_CODE} from './mercenary-jinmu-v1.mjs';

// 2026-10-16 joint release approved. A complete, explicitly saved ON policy is
// still required; missing configuration never inherits a sample/default profile.
export const MERCENARY_LEVEL_RELEASE_ENABLED=true;
export const MERCENARY_LEVEL_KEY='mercenary_level_policy_v1';
export const MERCENARY_LEVEL_RULES=Object.freeze({version:'mercenary-level-20261015-v2',maxLevel:MERCENARY_GROWTH_MAX_LEVEL,levelCapVersion:'20261025-cap21-v1',milestones:Object.freeze([5,10,15,20]),materialKind:'MERCENARY',materialRank:'SAME_RANK',sameCardMultiplier:3,limitedRequiredXpMultiplier:5,preserveOriginal:true,coinCost:0,masterStarCost:0,maxMaterials:100,failure:'CURRENT_LEVEL_EXP_ZERO',breakthroughPity:{failuresBeforeGuarantee:MERCENARY_BREAKTHROUGH_PITY_LIMITS,retroactive:true}});
export const LEVEL_BONUS_TYPES=Object.freeze({HP_PERCENT:'최대 체력 증가',ATTACK_PERCENT:'공격력 증가',DEFENSE_PERCENT:'방어력 증가',SPEED_PERCENT:'행동 속도 증가',COMBAT_STATS_PERCENT:'체력·공격·방어·속도 증가',SKILL_POWER_PERCENT:'배정 스킬 계수 증가',SKILL_COOLDOWN_TURNS:'배정 스킬 재사용 감소'});
export function mercenaryLevelDraft(){return {version:MERCENARY_LEVEL_RULES.version,revision:0,mode:'OFF',growth:null,sameCardMultiplier:MERCENARY_LEVEL_RULES.sameCardMultiplier,xpPerCard:Object.fromEntries(MERCENARY_RANKS.map(rank=>[rank,null])),levels:Array.from({length:20},(_,i)=>({level:i+1,requiredXp:null})),milestones:[5,10,15,20].map(level=>({level,successChancePpm:null,bonus:{type:null,value:null}}))};}
const limitedCodes=new Set([HEUKMU_CODE,KAMISHIRO_CODE,CARDGU_CODE,AWAKENED_OMEGA_CODE,...LIMITED_MERCENARIES.map(card=>card.code),JINMU_CODE,KAIRON_CODE,SHIRANUI_CODE,JOKRO_CODE,LEONEL_CODE,ZERO_CODE,PRIME_CODE,GENERAL_JOK_CODE,REVAN_CODE,EUNSEOL_CODE]);
export const mercenaryLevelXpMultiplier=target=>limitedCodes.has(target?.code)?MERCENARY_LEVEL_RULES.limitedRequiredXpMultiplier:1;
export function mercenaryLevelRequiredXp(policy,level,target){if(level===MERCENARY_LEVEL_RULES.maxLevel)return 0;const base=policy.levels[level-1].requiredXp;return base===null?null:base*mercenaryLevelXpMultiplier(target);}
export const levelError=(code,message,status=400)=>Object.assign(Error(message),{code,status});
const check=(ok,message,code='MERCENARY_LEVEL_CONFIG')=>{if(!ok)throw levelError(code,message);};
const keys=(value,expected,label)=>check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===expected.length&&expected.every(k=>Object.hasOwn(value,k)),label+' 항목을 확인하세요.');
const int=(v,min,max,label,nullable=false)=>{check(nullable&&v===null||Number.isSafeInteger(v)&&v>=min&&v<=max,label+' 값을 확인하세요.');return v;};
export function validateMercenaryLevelPolicy(raw){
 raw={...raw,growth:raw?.growth??null};
 keys(raw,['version','revision','mode','sameCardMultiplier','xpPerCard','levels','milestones','growth'],'성장 정책');
 check(raw.version===MERCENARY_LEVEL_RULES.version,'성장 정책 버전을 확인하세요.');int(raw.revision,0,2147483646,'정책 수정 버전');
 check(['OFF','ON'].includes(raw.mode),'성장 실행 상태를 확인하세요.');
 check(raw.sameCardMultiplier===MERCENARY_LEVEL_RULES.sameCardMultiplier,'동일 용병 재료의 경험치는 기본 수치의 3배로 고정합니다.');
 keys(raw.xpPerCard,MERCENARY_RANKS,'등급별 경험치');for(const rank of MERCENARY_RANKS)int(raw.xpPerCard[rank],1,1e9,rank+' 재료 경험치',true);
 check(Array.isArray(raw.levels)&&raw.levels.length===20,'1~20레벨 경험치를 모두 설정하세요.');
 raw.levels.forEach((r,i)=>{keys(r,['level','requiredXp'],'레벨 경험치');check(r.level===i+1,'레벨 경험치 순서를 확인하세요.');int(r.requiredXp,1,1e12/MERCENARY_LEVEL_RULES.limitedRequiredXpMultiplier,`${r.level}레벨 필요 경험치`,true);});
 check(Array.isArray(raw.milestones)&&raw.milestones.length===4,'5·10·15·20레벨 돌파를 모두 설정하세요.');
 raw.milestones.forEach((r,i)=>{keys(r,['level','successChancePpm','bonus'],'돌파');check(r.level===MERCENARY_LEVEL_RULES.milestones[i],'돌파 레벨을 확인하세요.');int(r.successChancePpm,0,1000000,`${r.level}레벨 돌파 확률`,true);keys(r.bonus,['type','value'],'돌파 효과');check(r.bonus.type===null||Object.hasOwn(LEVEL_BONUS_TYPES,r.bonus.type),'돌파 효과 종류를 확인하세요.');
  const v=r.bonus.value;check(v===null||Number.isFinite(v)&&v>0&&v<=1000&&Math.abs(v*100-Math.round(v*100))<1e-8,'돌파 효과 수치를 확인하세요.');if(r.bonus.type==='SKILL_COOLDOWN_TURNS'&&v!==null)int(v,1,20,'재사용 감소 턴');});
 if(raw.growth!==null)validateMercenaryGrowth(raw.growth);
 return structuredClone(raw);
}
export function mercenaryLevelReadiness(policy,{requireGrowth=false}={}){
 const p=validateMercenaryLevelPolicy(policy),missing=[];
 for(const rank of MERCENARY_RANKS)if(p.xpPerCard[rank]===null)missing.push(rank+' 등급 재료 경험치');
 for(const r of p.levels)if(r.requiredXp===null)missing.push(`Lv.${r.level} 필요 경험치`);
 for(const r of p.milestones){if(r.successChancePpm===null)missing.push(`Lv.${r.level} 돌파 확률`);if(!p.growth&&!requireGrowth&&(r.bonus.type===null||r.bonus.value===null))missing.push(`Lv.${r.level} 돌파 효과`);}
 if(requireGrowth||p.growth!==null)missing.push(...mercenaryGrowthReadiness(p.growth).missing);
 return {ready:missing.length===0,missing};
}
export const initialMercenaryLevel=()=>({level:1,experience:0,breakthroughMask:0,revision:0});
export function mercenaryLevelState(row){
 if(!row)return initialMercenaryLevel();
 const s={level:Number(row.level),experience:Number(row.experience),breakthroughMask:Number(row.breakthroughMask??row.breakthrough_mask),revision:Number(row.revision)};
 int(s.level,1,MERCENARY_LEVEL_RULES.maxLevel,'용병 레벨');int(s.experience,0,1e12,'용병 경험치');int(s.breakthroughMask,0,15,'돌파 기록');int(s.revision,0,2147483646,'성장 수정 버전');
 const unlocked=MERCENARY_LEVEL_RULES.milestones.filter((_,i)=>s.breakthroughMask&(1<<i));
 check(unlocked.every((level,i)=>level===MERCENARY_LEVEL_RULES.milestones[i]&&(level<s.level||level===20&&s.level===20)),'연속 돌파 기록을 확인하세요.');
 for(const [i,level] of MERCENARY_LEVEL_RULES.milestones.entries())check(s.level<=level||Boolean(s.breakthroughMask&(1<<i)),'돌파를 건너뛴 성장 기록입니다.');
 check(!(s.breakthroughMask&8)||[20,MERCENARY_LEVEL_RULES.maxLevel].includes(s.level)&&s.experience===0,'최종 돌파 기록을 확인하세요.');return s;
}
// The persisted checkpoint (20 + final breakthrough bit) remains the durable
// encoding for completed growth. Decode it as Lv.21 for current accounts only;
// immutable receipts and historical battle snapshots keep their captured level.
export function mercenaryLevelStateFromStorage(row){
 const s=mercenaryLevelState(row);
 return s.level===20&&s.breakthroughMask===15?{...s,level:MERCENARY_LEVEL_RULES.maxLevel}:s;
}
export function mercenaryLevelStorageLevel(row){
 const s=mercenaryLevelState(row);return s.level===MERCENARY_LEVEL_RULES.maxLevel?20:s.level;
}
export const isLevelComplete=s=>[20,MERCENARY_LEVEL_RULES.maxLevel].includes(s.level)&&s.breakthroughMask===15;
export function levelProgress(policy,row,target){
 const s=mercenaryLevelState(row),requiredXp=mercenaryLevelRequiredXp(policy,s.level,target),complete=isLevelComplete(s),checkpoint=MERCENARY_LEVEL_RULES.milestones.includes(s.level)&&!(s.breakthroughMask&(1<<MERCENARY_LEVEL_RULES.milestones.indexOf(s.level)));
 check(requiredXp===null||s.experience<=requiredXp&&((checkpoint||complete)||s.experience<requiredXp),'현재 경험치와 성장 정책을 확인하세요.','MERCENARY_LEVEL_STATE');
 return {...s,requiredXp,requiredXpMultiplier:mercenaryLevelXpMultiplier(target),complete,percent:complete?100:requiredXp===null?null:Math.min(100,s.experience/requiredXp*100),breakthroughReady:!complete&&checkpoint&&requiredXp!==null&&s.experience===requiredXp};
}
export function normalizeLevelMaterials(value){
 check(Array.isArray(value)&&value.length>0&&value.length<=100,'재료 용병을 선택하세요.','MERCENARY_LEVEL_MATERIALS');
 const counts=new Map();for(const r of value){keys(r,['code','quantity'],'재료 용병');check(/^V-\d{3}$/.test(r.code),'재료 용병 코드를 확인하세요.');int(r.quantity,1,100,'재료 수량');counts.set(r.code,(counts.get(r.code)||0)+r.quantity);}
 check([...counts.values()].reduce((a,b)=>a+b,0)<=100,'한 번에 재료 100장까지 사용할 수 있습니다.','MERCENARY_LEVEL_MATERIALS');
 return [...counts].sort(([a],[b])=>a.localeCompare(b)).map(([code,quantity])=>({code,quantity}));
}
function configured(policy){const ready=mercenaryLevelReadiness(policy);if(!ready.ready)throw levelError('MERCENARY_LEVEL_UNCONFIGURED','경험치·돌파 확률과 효과 설정을 완료해야 합니다.',409);}
export function planMercenaryTraining({policy,state,target,materials,owned,catalog}){
 configured(policy);const before=mercenaryLevelState(state),progress=levelProgress(policy,before,target);
 check(!progress.complete,'최대 21레벨에 도달한 용병입니다.','MERCENARY_LEVEL_MAX');check(!progress.breakthroughReady,'경험치가 가득 찼습니다. 먼저 돌파를 시도하세요.','MERCENARY_LEVEL_BREAKTHROUGH_REQUIRED');
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
 while(after.experience>=mercenaryLevelRequiredXp(policy,after.level,target)){
  const required=mercenaryLevelRequiredXp(policy,after.level,target);
  if(MERCENARY_LEVEL_RULES.milestones.includes(after.level)){overflowXp=after.experience-required;after.experience=required;break;}
  after.experience-=required;after.level++;
 }
 return {before,after,consumed,xp,appliedXp:xp-overflowXp,overflowXp,requiredXpMultiplier:mercenaryLevelXpMultiplier(target),breakthroughReady:levelProgress(policy,after,target).breakthroughReady};
}
export function planMercenaryBreakthrough({policy,state,target,roll,pityFailures=0}){
 configured(policy);const before=mercenaryLevelState(state),progress=levelProgress(policy,before,target);
 check(!progress.complete,'최대 21레벨에 도달한 용병입니다.','MERCENARY_LEVEL_MAX');
 check(progress.breakthroughReady,'5·10·15·20레벨 경험치가 100%일 때 돌파할 수 있습니다.','MERCENARY_LEVEL_NOT_READY');int(roll,0,999999,'돌파 판정');
 const pity=mercenaryBreakthroughPity(before.level,pityFailures),milestone=policy.milestones.find(m=>m.level===before.level),success=pity.guaranteed||roll<milestone.successChancePpm,index=MERCENARY_LEVEL_RULES.milestones.indexOf(before.level);
 const after={...before,experience:0,revision:before.revision+1};
 if(success){after.breakthroughMask|=1<<index;after.level=Math.min(MERCENARY_LEVEL_RULES.maxLevel,before.level+1);}
 return {before,after,milestone:structuredClone(milestone),success,roll,pity:{version:pity.version,threshold:pity.threshold,failuresBefore:pity.failures,failuresAfter:success?0:pity.failures+1,guaranteed:pity.guaranteed,effectiveChancePpm:pity.guaranteed?1000000:milestone.successChancePpm},reward:success?structuredClone(policy.growth?policy.growth.milestones[index]:milestone.bonus):null,complete:isLevelComplete(after)};
}
export function mercenaryLevelBonuses(policy,state){
 const s=mercenaryLevelState(state);return policy.milestones.filter((_,i)=>s.breakthroughMask&(1<<i)).map(m=>({level:m.level,...m.bonus}));
}
// Only server-captured growth enters battle snapshots. Historical snapshots
// without this property retain their exact pre-growth behavior on replay.
export function attachMercenaryLevel(snapshot,policy,state){
 configured(policy);const s=mercenaryLevelStateFromStorage(state),bonuses=mercenaryLevelBonuses(policy,s);
 if(policy.growth)return {...snapshot,level:s.level,mercenaryLevel:{version:2,level:s.level,policyRevision:policy.revision,breakthroughMask:s.breakthroughMask,growth:validateMercenaryGrowth(policy.growth)}};
 return {...snapshot,level:s.level,mercenaryLevel:{version:1,level:s.level,policyRevision:policy.revision,breakthroughMask:s.breakthroughMask,bonuses}};
}
export function applyMercenaryLevelStats(actor){
 const g=actor.mercenaryLevel;if(!actor.isMercenary||![1,2].includes(g?.version)||actor.mercenaryLevelApplied)return;
 if(g.version===2){applyMercenaryGrowthV2(actor);return;}
 mercenaryLevelState({level:g.level,experience:0,breakthroughMask:g.breakthroughMask,revision:0});
 check(Array.isArray(g.bonuses)&&g.bonuses.length===MERCENARY_LEVEL_RULES.milestones.filter((_,i)=>g.breakthroughMask&(1<<i)).length&&g.bonuses.every((b,i)=>b.level===MERCENARY_LEVEL_RULES.milestones[i]&&Object.hasOwn(LEVEL_BONUS_TYPES,b.type)&&Number.isFinite(b.value)&&b.value>0&&b.value<=1000),'전투 성장 효과를 확인하세요.');
 const sum=type=>g.bonuses.filter(b=>b.type===type).reduce((n,b)=>n+b.value,0),scale=(n,percent)=>{const v=Math.floor(n*(1+percent/100));if(!Number.isSafeInteger(v)||v<0)throw Error('INVALID_MERCENARY_LEVEL_STATS');return v;};
 const combatPercent=sum('COMBAT_STATS_PERCENT'),hpPercent=sum('HP_PERCENT')+combatPercent,attackPercent=sum('ATTACK_PERCENT')+combatPercent,ratio=actor.maxHp>0?Math.max(0,Math.min(1,actor.hp/actor.maxHp)):0;
 actor.maxHp=scale(actor.maxHp,hpPercent);actor.hp=Math.floor(actor.maxHp*ratio);actor.attack=scale(actor.attack,attackPercent);actor.defense=scale(actor.defense,sum('DEFENSE_PERCENT')+combatPercent);
 const speedPercent=sum('SPEED_PERCENT')+combatPercent;if(speedPercent){actor.speed=scale(actor.speed,speedPercent);if(actor.stats)actor.stats={...actor.stats,speed:actor.speed};}
 if(actor.mercenaryLink)actor.mercenaryLink={...actor.mercenaryLink,attackFloor:scale(actor.mercenaryLink.attackFloor,attackPercent),hpFloor:scale(actor.mercenaryLink.hpFloor,hpPercent)};
 const power=sum('SKILL_POWER_PERCENT'),cooldown=sum('SKILL_COOLDOWN_TURNS');
 actor.skills=(actor.skills||[]).map(skill=>({...skill,balance:{...skill.balance,damageRatio:Math.min(10000,skill.balance.damageRatio*(1+power/100)),cooldownTurns:skill.balance.cooldownTurns===0?0:Math.max(1,skill.balance.cooldownTurns-cooldown)}}));
 actor.level=g.level;actor.mercenaryLevelApplied=true;
}

function applyMercenaryGrowthV2(actor){
 const g=actor.mercenaryLevel;mercenaryLevelState({level:g.level,experience:0,breakthroughMask:g.breakthroughMask,revision:0});
 const summary=mercenaryGrowthSummary(g.growth,g),ratio=actor.maxHp>0?Math.max(0,Math.min(1,actor.hp/actor.maxHp)):0;
 actor.mercenaryGrowthBaseSpeed=actor.speed;
 const {after}=mercenaryGrowthStatPreview({hp:actor.maxHp,attack:actor.attack,defense:actor.defense,speed:actor.speed},summary);
 actor.maxHp=after.hp;actor.hp=Math.floor(after.hp*ratio);actor.attack=after.attack;actor.defense=after.defense;actor.speed=after.speed;
 if(actor.stats)actor.stats={...actor.stats,speed:actor.speed};
 // Link floors and intrinsic stats are alternatives (max), never additive.
 // Both are scaled once because effectiveAttack selects their maximum later.
 if(actor.mercenaryLink)actor.mercenaryLink={...actor.mercenaryLink,attackFloor:Math.floor(actor.mercenaryLink.attackFloor*(1+summary.total.attackPercent/100)),hpFloor:Math.floor(actor.mercenaryLink.hpFloor*(1+summary.total.hpPercent/100))};
 actor.skills=(actor.skills||[]).map(skill=>({...skill,balance:{...skill.balance,damageRatio:Math.min(10000,skill.balance.damageRatio*(1+summary.total.skillPowerPercent/100))}}));
 actor.level=g.level;actor.mercenaryGrowth=summary;actor.mercenaryLevelApplied=true;
 const openingGauge=mercenaryGrowthOpeningGauge(actor);
 if(openingGauge)actor.gauge=Math.min(95,Math.max(0,Number(actor.gauge)||0)+openingGauge);
}
