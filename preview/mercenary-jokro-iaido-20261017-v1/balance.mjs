import baseline from './references/jinmu-operating-baseline-20261018.json' with {type:'json'};
import {JOKRO_COMBAT as LIVE,JOKRO_AREA_SKILL} from '../../shared/mercenary-jokro-v1.mjs';
export const JINMU_BASELINE=Object.freeze(baseline);
const up=n=>Math.round(n*1.2*1000000)/1000000;
// The review table shares the released policy; preview receipts remain local.
export const JOKRO_COMBAT=Object.freeze({
 status:'USER_LIVE_RELEASE_AUTHORIZED',basePower:LIVE.basePower,statsReferencePower:LIVE.statsReferencePower,statScale:LIVE.statScale,speedReferencePower:LIVE.speedReferencePower,speedScale:LIVE.speedScale,actionCredit:LIVE.actionCredit,
 motionRate:2,effectRate:1,link:LIVE.link,basicCapScale:LIVE.basicCapScale,damageTakenScale:LIVE.damageTakenScale,hardCounter:LIVE.hardCounter,counterImmune:true,controlImmune:true,poisonImmune:true,
 skills:Object.freeze({ultimate:Object.freeze({name:'청룡참',target:'ALL_ENEMIES',pveOnly:true,damageRatio:6.72,cooldownTurns:4,cost:30}),awakening:Object.freeze({name:JOKRO_AREA_SKILL.name,target:JOKRO_AREA_SKILL.target,pveOnly:true,...JOKRO_AREA_SKILL.balance})})
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
