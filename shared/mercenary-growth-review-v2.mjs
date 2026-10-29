// Isolated balance candidate. Importing this profile never enables leveling.
// Production policy begins with growth:null; only an explicit future CMS setting
// and the joint level/PVP release can activate a configured growth profile.
export const MERCENARY_GROWTH_MAX_LEVEL=21;
export const MERCENARY_GROWTH_VERSION='mercenary-growth-v2-20261015';
export const MERCENARY_GROWTH_STAT_KEYS=Object.freeze(['hpPercent','attackPercent','defensePercent','speedPercent']);
export const MERCENARY_GROWTH_BONUS_KEYS=Object.freeze([...MERCENARY_GROWTH_STAT_KEYS,'skillPowerPercent','mitigationBypassPercent','actionCatchupPercent','actionCreditPercent']);
const MILESTONES=[5,10,15,20];
export const MERCENARY_GROWTH_REVIEW=Object.freeze({version:MERCENARY_GROWTH_VERSION,
 perLevel:Object.freeze({hpPercent:25,attackPercent:25,defensePercent:6,speedPercent:1}),
 milestones:Object.freeze(MILESTONES.map((level,i)=>Object.freeze({level,hpPercent:100,attackPercent:125,defensePercent:15,speedPercent:2,skillPowerPercent:5,mitigationBypassPercent:12.5,actionCatchupPercent:[10,15,20,25][i],actionCreditPercent:[10,15,20,30][i]})))
});
const fail=()=>{throw Object.assign(Error('용병 성장 능력치 설정을 확인하세요.'),{code:'MERCENARY_LEVEL_CONFIG',status:400});};
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));
const amount=(n,max)=>Number.isFinite(n)&&n>=0&&n<=max&&Math.abs(n*100-Math.round(n*100))<1e-7;
const labels={hpPercent:'체력 증가',attackPercent:'공격력 증가',defensePercent:'방어력 증가',speedPercent:'속도 증가',skillPowerPercent:'스킬 위력',mitigationBypassPercent:'경감 관통',actionCatchupPercent:'행동 대응',actionCreditPercent:'추가 행동 숙련'};
const empty=()=>Object.fromEntries(MERCENARY_GROWTH_BONUS_KEYS.map(k=>[k,0]));
export const mercenaryGrowthDraft=()=>({version:MERCENARY_GROWTH_VERSION,perLevel:Object.fromEntries(MERCENARY_GROWTH_STAT_KEYS.map(k=>[k,null])),milestones:MILESTONES.map(level=>({level,...Object.fromEntries(MERCENARY_GROWTH_BONUS_KEYS.map(k=>[k,null]))}))});
export function validateMercenaryGrowth(growth){
 if(!exact(growth,['version','perLevel','milestones'])||growth.version!==MERCENARY_GROWTH_VERSION||!exact(growth.perLevel,MERCENARY_GROWTH_STAT_KEYS)||!Array.isArray(growth.milestones)||growth.milestones.length!==4)fail();
 for(const k of MERCENARY_GROWTH_STAT_KEYS)if(growth.perLevel[k]!==null&&!amount(growth.perLevel[k],k==='speedPercent'?5:100))fail();
 for(const [i,row]of growth.milestones.entries()){
  if(!exact(row,['level',...MERCENARY_GROWTH_BONUS_KEYS])||row.level!==MILESTONES[i])fail();
  for(const k of MERCENARY_GROWTH_BONUS_KEYS)if(row[k]!==null&&!amount(row[k],k==='mitigationBypassPercent'?12.5:k==='actionCatchupPercent'?25:k==='actionCreditPercent'?30:k==='speedPercent'?10:400))fail();
 }
 const totals=empty();for(const k of MERCENARY_GROWTH_STAT_KEYS)totals[k]=growth.perLevel[k]*19;
 for(const row of growth.milestones)for(const k of MERCENARY_GROWTH_BONUS_KEYS)totals[k]+=row[k];
 if(totals.hpPercent>1600||totals.attackPercent>1600||totals.defensePercent>400||totals.speedPercent>80||totals.skillPowerPercent>100||totals.mitigationBypassPercent>50||totals.actionCatchupPercent>70||totals.actionCreditPercent>75)fail();
 return structuredClone(growth);
}
export function mercenaryGrowthReadiness(growth){
 if(growth===null||growth===undefined)return {ready:false,missing:['레벨별 성장 능력치·돌파 숙련']};
 const p=validateMercenaryGrowth(growth),missing=[];
 for(const k of MERCENARY_GROWTH_STAT_KEYS)if(p.perLevel[k]===null)missing.push('레벨당 '+labels[k]);
 for(const row of p.milestones)for(const k of MERCENARY_GROWTH_BONUS_KEYS)if(row[k]===null)missing.push('Lv.'+row.level+' 돌파 '+labels[k]);
 return {ready:missing.length===0,missing};
}
export function mercenaryGrowthSummary(growth,state){
 if(growth===null||growth===undefined)return null;
 if(!mercenaryGrowthReadiness(growth).ready)fail();
 const profile=validateMercenaryGrowth(growth),level=Number(state?.level),mask=Number(state?.breakthroughMask??state?.breakthrough_mask??0);
 if(!Number.isInteger(level)||level<1||level>MERCENARY_GROWTH_MAX_LEVEL||![0,1,3,7,15].includes(mask))fail();
 for(let i=0;i<4;i++)if((mask&(1<<i))&&!(MILESTONES[i]<level||MILESTONES[i]===20&&level===20)||level>MILESTONES[i]&&!(mask&(1<<i)))fail();
 const perLevelBonus=empty(),breakthroughBonus=empty();
 for(const k of MERCENARY_GROWTH_STAT_KEYS)perLevelBonus[k]=Number((profile.perLevel[k]*(level-1)).toFixed(2));
 for(const [i,row]of profile.milestones.entries())if(mask&(1<<i))for(const k of MERCENARY_GROWTH_BONUS_KEYS)breakthroughBonus[k]=Number((breakthroughBonus[k]+row[k]).toFixed(2));
 const total=Object.fromEntries(MERCENARY_GROWTH_BONUS_KEYS.map(k=>[k,Number((perLevelBonus[k]+breakthroughBonus[k]).toFixed(2))]));
 return {version:profile.version,level,breakthroughMask:mask,breakthroughCount:profile.milestones.filter((_,i)=>mask&(1<<i)).length,perLevelBonus,breakthroughBonus,total,nextMilestone:MILESTONES.find((_,i)=>!(mask&(1<<i)))??null};
}
export function mercenaryGrowthStatPreview(base,summary){
 const before=Object.fromEntries(['hp','attack','defense','speed'].map(k=>[k,Number(base[k])]));
 if(Object.values(before).some(n=>!Number.isSafeInteger(n)||n<0)||!summary?.total)fail();
 const after=Object.fromEntries(Object.entries(before).map(([k,n])=>[k,Math.floor(n*(1+summary.total[k+'Percent']/100))]));
 if(Object.values(after).some(n=>!Number.isSafeInteger(n)))fail();return {before,after};
}
export function mercenaryGrowthLevelTable(growth){
 return Array.from({length:MERCENARY_GROWTH_MAX_LEVEL},(_,i)=>{const level=i+1,breakthroughMask=MILESTONES.reduce((mask,m,j)=>mask|(m<level?1<<j:0),0);return {level,beforeBreakthrough:mercenaryGrowthSummary(growth,{level,breakthroughMask}),afterBreakthrough:MILESTONES.includes(level)?mercenaryGrowthSummary(growth,{level:Math.min(MERCENARY_GROWTH_MAX_LEVEL,level+1),breakthroughMask:breakthroughMask|(1<<MILESTONES.indexOf(level))}):null};});
}
// 2026-10-20: the capped-hit / lost-gauge defect affects every growing fighter.
// Keep the bounded Diim correction as one common PvP growth policy. Legacy
// snapshots, ordinary cards, Lv.1 and PvE retain their existing calculations.
// Keep the learned square-root curve through the final Lv.20 -> 21 breakthrough.
// The former 3x ceiling flattened the current profile from Lv.18 onward.
// This ceiling changes basic outgoing packets only; durability and initiative
// retain their independent bounds. The current Lv.21 profile yields sqrt(11).
export const MERCENARY_PVP_GROWTH_COMBAT=Object.freeze({version:2,maxBasicCapScale:4,maxDurabilityCapScale:3,maxOpeningGauge:75});
const pvpGrowth=actor=>actor?.isMercenary===true&&actor.statMode==='RANK_FIXED'&&actor.battleMode==='PVP'&&actor.mercenaryLevelApplied&&actor.mercenaryLevel?.version===2?actor.mercenaryGrowth?.total:null;
export function mercenaryGrowthBasicCapScale(actor){
 const growth=pvpGrowth(actor);
 return growth?Math.min(MERCENARY_PVP_GROWTH_COMBAT.maxBasicCapScale,Math.sqrt(1+Math.max(0,growth.attackPercent)/100)):1;
}
export function mercenaryGrowthDamageCapHp(actor){
 const growth=pvpGrowth(actor);
 // Only learned HP changes this divisor. Equipment/team HP buffs still grow
 // the hit budget; the caller adds the unmodified opening shield afterwards.
 const scale=growth?Math.min(MERCENARY_PVP_GROWTH_COMBAT.maxDurabilityCapScale,Math.sqrt(1+Math.max(0,growth.hpPercent)/100)):1;
 return actor.maxHp/scale;
}
export function mercenaryGrowthOpeningGauge(actor){
 const growth=pvpGrowth(actor);
 return growth?Math.min(MERCENARY_PVP_GROWTH_COMBAT.maxOpeningGauge,Math.max(0,growth.actionCatchupPercent)+Math.max(0,growth.actionCreditPercent)):0;
}
export const mercenaryGrowthKeepsNaturalGauge=actor=>!!pvpGrowth(actor)&&actor.mercenaryLevel.level>1;
export const MERCENARY_PVP_GROWTH_DESCRIPTION='용병 성장 V2가 적용된 PVP에서는 기본 공격 피해 상한에 성장 공격력 배율의 제곱근을 별도로 곱합니다(최대 4배). 고레벨 성장과 마지막 돌파도 이 배율에 반영됩니다. 받는 타격 상한의 체력 기준은 성장 HP 배율의 제곱근으로 나눕니다(최대 3배 보정, 시작 방벽 제외). 돌파의 행동 대응·추가 행동 숙련 합계만큼 시작 행동 게이지를 얻습니다(최대 75). Lv.2부터 추가 행동은 자연 행동 게이지를 소모하지 않으며 자연 행동은 100을 소모합니다. 스킬의 고유 상한 배율과 PVE 계산은 유지합니다.';
// Restore only a fraction of a higher-level mercenary's damage removed by an
// enemy mercenary's innate mitigation. Same-level, cards, PVE, poison/counters
// without a direct source and legacy snapshots retain their existing rules.
// Ten levels of advantage uses the learned bypass in full, capped at 50%.
export function mercenaryGrowthMitigationBypass(source,target){
 if(!source?.isMercenary||!target?.isMercenary||source.battleMode!=='PVP'||target.battleMode!=='PVP'||!source.mercenaryLevelApplied||source.mercenaryLevel?.version!==2)return 0;
 const own=source.mercenaryLevel.level,other=target.mercenaryLevel?.level??1,gap=Math.max(0,own-other);
 return Math.min(.5,Math.max(0,source.mercenaryGrowth?.total?.mitigationBypassPercent||0)/100)*Math.min(1,gap/10);
}
export function mercenaryGrowthIncomingDamage(target,beforeMitigation,afterMitigation,source){
 const bypass=mercenaryGrowthMitigationBypass(source,target);
 return bypass>0&&beforeMitigation>afterMitigation?Math.floor(afterMitigation+(beforeMitigation-afterMitigation)*bypass):afterMitigation;
}

// Freeze all opponents before applying any catch-up floor. Never read another
// actor's newly caught-up speed, its growth multiplier, or PVP power bonus.
export function applyMercenaryGrowthMatchups(teams,{baseActionCredit=()=>1}={}){
 const all=teams.flat();
 const cardsFor=actor=>all.filter(a=>a.side===actor.side&&(a.ownerId??null)===(actor.ownerId??null)&&!a.isMercenary&&!a.isMonster&&!a.isBattleSuit&&a.actorKind!=='BATTLE_SUIT'&&a.alive!==false&&a.hp>0&&!a.untargetable);
 const references=new Map(all.filter(a=>a.isMercenary&&a.battleMode==='PVP'&&a.alive!==false&&a.hp>0).map(a=>[a,{speed:a.mercenaryGrowthBaseSpeed??a.speed,level:a.mercenaryLevel?.level??1,cardClock:cardsFor(a).reduce((n,c)=>n+Math.max(0,Number(c.speed)||0),0),innateCredit:baseActionCredit([a]),growthCredit:mercenaryGrowthActionCredit([a])}]));
 for(const [actor,own]of references){
  if(actor.mercenaryLevel?.version!==2||!actor.mercenaryLevelApplied||actor.mercenaryGrowthMatchup)continue;
  const candidates=[...references].filter(([other])=>other.side!==actor.side&&!(other.mercenaryLevel?.version===1&&other.mercenaryLevelApplied)).map(([other,ref])=>({actorId:other.id,ownerId:other.ownerId??null,level:ref.level,referenceSpeed:ref.speed,referenceCardClock:ref.cardClock,referenceInnateCredit:ref.innateCredit,referenceActionRate:ref.speed+ref.cardClock*ref.innateCredit,gap:Math.max(0,own.level-ref.level)}));
  const learned=Math.min(70,Math.max(0,actor.mercenaryGrowth.total.actionCatchupPercent))/100,ownReservedRate=own.cardClock*(own.innateCredit+own.growthCredit),ownActionRate=actor.speed+ownReservedRate;
  const rows=candidates.map(r=>({...r,floor:Math.floor(actor.speed+Math.max(0,r.referenceActionRate-ownActionRate)*learned*Math.min(1,r.gap/10))}));
  const floor=Math.max(0,...rows.map(r=>r.floor)),before=actor.speed;
  actor.speed=Math.max(actor.speed,floor);if(actor.stats)actor.stats={...actor.stats,speed:actor.speed};
  actor.mercenaryGrowthMatchup={version:MERCENARY_GROWTH_VERSION,baseSpeed:own.speed,ownCardClock:own.cardClock,ownReservedRate,ownActionRate,speedBefore:before,speedAfter:actor.speed,floor,opponents:rows};
 }
}

export function mercenaryGrowthActionCredit(actors){
 return Math.max(0,...actors.filter(a=>a.isMercenary&&a.alive!==false&&a.hp>0&&a.battleMode==='PVP'&&a.mercenaryLevel?.version===2&&a.mercenaryLevelApplied).map(a=>Math.min(75,Math.max(0,a.mercenaryGrowth?.total.actionCreditPercent||0))/100));
}
