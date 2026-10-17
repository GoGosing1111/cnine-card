import baseline from './references/jinmu-operating-baseline-20261018.json' with {type:'json'};
export const JINMU_BASELINE=Object.freeze(baseline);
const up=n=>Math.round(n*1.2*1000000)/1000000;
// Review package only: no operational code, grant, roster or acquisition changes.
export const JOKRO_COMBAT=Object.freeze({
 status:'IMPLEMENTED_FOR_REVIEW_NOT_LIVE',basePower:up(baseline.basePower),statsReferencePower:baseline.statsReferencePower,statScale:up(baseline.statScale),speedReferencePower:baseline.speedReferencePower,speedScale:baseline.speedScale,actionCredit:baseline.actionCredit,
 motionRate:2,effectRate:1,link:Object.freeze(Object.fromEntries(Object.entries(baseline.link).map(([k,v])=>[k,up(v)]))),basicCapScale:up(baseline.basicCapScale),damageTakenScale:.2,hardCounter:baseline.hardCounter,counterImmune:true,controlImmune:true,poisonImmune:true,
 skills:Object.freeze({ultimate:Object.freeze({name:'청룡참',target:'ALL_ENEMIES',pveOnly:true,damageRatio:6.72,cooldownTurns:4,cost:30}),awakening:Object.freeze({name:'청룡단천',target:'ALL_ENEMIES',pveOnly:true,damageRatio:8.4,cooldownTurns:5,cost:35})})
});
export const jokroIncomingDamage=(incoming,sourceCode)=>sourceCode===JOKRO_COMBAT.hardCounter?0:Math.floor(Math.max(0,Number(incoming)||0)*JOKRO_COMBAT.damageTakenScale);
export function jokroLinkedStats(reference){return Object.fromEntries(['hp','attack','defense'].map(k=>[k,Math.max(1,Math.round(reference[k]*JOKRO_COMBAT.statScale))]));}
// One total damage pool and one receipt entry per unique living target.
// Multiple visual contacts or particles never apply extra damage.
export function resolveJokroPreviewCast({skillKey,mode='PVE',attack,targets,castId,receipts}){
 const s=JOKRO_COMBAT.skills[skillKey];if(!s||mode!=='PVE'||!castId||!(receipts instanceof Map)||!Number.isFinite(attack)||attack<=0)return null;
 if(receipts.has(castId))return receipts.get(castId);
 const alive=[...new Map(targets.filter(t=>t?.id&&t.alive!==false&&t.hp>0&&!t.untargetable&&!t.isBattleSuit).map(t=>[t.id,t])).values()];if(!alive.length)return null;
 const total=Math.floor(attack*s.damageRatio),share=Math.floor(total/alive.length),remainder=total%alive.length;
 const receipt=Object.freeze({castId,skill:skillKey,totalDamage:total,cost:s.cost,cooldownTurns:s.cooldownTurns,hits:Object.freeze(alive.map((t,i)=>Object.freeze({targetId:t.id,damage:share+(i<remainder?1:0)}))),authority:'LOCAL_REVIEW_SIMULATION'});
 receipts.set(castId,receipt);return receipt;
}
