import {berkanVolleyTargets} from '../../shared/mercenary-berkan-v1.mjs';
import {SHOTS,RAIN_HITS} from './skill.mjs';

// Prepared combat policy. No live code, roster, acquisition or CMS registration.
export const IMPERIAL_ARCHER_COMBAT=Object.freeze({
 version:'imperial-archer-arrow-v2-20261018',status:'PREPARED_BALANCE',runtimeEnabled:false,
 basePower:216000,speedScale:1.5,actionCredit:1.5,pvpBasicDamageScale:.6,pvpSkillCapScale:2.15,
 link:Object.freeze({attackPercent:264,hpPercent:308,shieldPercent:165})
});
export const ARCHER_VOLLEY='IMPERIAL_PIERCING_VOLLEY',ARCHER_RAIN='IMPERIAL_ARROW_RAIN';
export const IMPERIAL_ARCHER_SKILLS=Object.freeze([
 Object.freeze({id:'PREVIEW-ARCHER-SINGLE',name:'연환 파갑',mechanic:ARCHER_VOLLEY,target:'BACK_THREAT',
  balance:Object.freeze({damageRatio:6.8,cooldownTurns:4,cost:35}),
  description:'후열 우선 핵심 적 1명에게 관통 화살을 집중합니다. 고속 연사와 일곱 화살은 합계 680%의 한 시전 피해 예산을 사용합니다.'}),
 Object.freeze({id:'PREVIEW-ARCHER-AREA',name:'천궁 멸진',mechanic:ARCHER_RAIN,target:'ALL_ENEMIES',pveOnly:true,
  balance:Object.freeze({damageRatio:7,cooldownTurns:5,cost:35}),
  description:'PVE 적 전체에 화살비와 거대 화살을 내립니다. 합계 700%를 지정 대상 수로 나누며 한 대상이면 전체 예산을 적용합니다.'})
]);
// V-000 is an existing preview adapter alias, never a production identity.
export const isImperialArcher=a=>a?.code==='V-000'&&a.previewPolicy===IMPERIAL_ARCHER_COMBAT.version;
export const imperialArcherCredit=actors=>actors.some(a=>isImperialArcher(a)&&a.isMercenary&&a.statMode==='RANK_FIXED')?IMPERIAL_ARCHER_COMBAT.actionCredit:1;
export const imperialArcherBasicScale=a=>isImperialArcher(a)&&a.battleMode==='PVP'?IMPERIAL_ARCHER_COMBAT.pvpBasicDamageScale:1;
export const imperialArcherCap=(a,s)=>isImperialArcher(a)&&s?.mechanic===ARCHER_VOLLEY&&a.battleMode==='PVP'?IMPERIAL_ARCHER_COMBAT.pvpSkillCapScale:1;
export function imperialArcherTargets(actor,skill,enemies){
 if(!isImperialArcher(actor))return [];
 if(skill.mechanic===ARCHER_RAIN)return actor.battleMode==='PVE'?enemies:[];
 return skill.mechanic===ARCHER_VOLLEY&&['PVE','PVP'].includes(actor.battleMode)?berkanVolleyTargets(enemies).slice(0,1):[];
}
export function imperialArcherCandidate(combat,{equipment}={}){
 return {code:'V-000',name:'이름 미정 SSS 궁사',rank:'SSS',position:'REAR',role:'SNIPER',attackStyle:'RANGED',
  level:1,statMode:'RANK_FIXED',basePower:IMPERIAL_ARCHER_COMBAT.basePower,previewPolicy:IMPERIAL_ARCHER_COMBAT.version,
  runtimeEnabled:false,combat:structuredClone(combat),skills:structuredClone(IMPERIAL_ARCHER_SKILLS),
  ...(equipment?{equipment:structuredClone(equipment)}:{})};
}
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
export function resolveImperialArcherCast({actor,skill,targets,hit,damage,knockout,emit,damageScale=1,capActions=1}){
 const area=skill.mechanic===ARCHER_RAIN;
 if(!isImperialArcher(actor)||!living(actor)||actor.stunned||actor.silenced||
  (area?actor.battleMode!=='PVE':skill.mechanic!==ARCHER_VOLLEY||!['PVE','PVP'].includes(actor.battleMode)))return [];
 const fixed=[...new Map(targets.filter(living).map(t=>[t.id,t])).values()].slice(0,area?Infinity:1);
 if(!fixed.length)return [];
 const share=1/fixed.length,ratio=skill.balance.damageRatio*share*damageScale,hits=[];
 // Every visible arrow belongs to this single paid cast. Neither particles nor
 // the final giant arrow add uncapped rolls, energy, extra actions or retargets.
 for(const target of fixed){
  const result=ratio>0?hit(actor,target,ratio,{rangedSkill:false,castShare:share,capScale:capActions,varyDamageCap:!area&&actor.battleMode==='PVP'}):{damage:0,dodge:false};
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  hits.push({targetId:target.id,at:area?4.05:SHOTS.at(-1),damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,
   targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 emit(area?'MERCENARY_IMPERIAL_ARROW_RAIN':'MERCENARY_IMPERIAL_ARROW_VOLLEY',{
  actorId:actor.id,actorKind:'MERCENARY',skillId:skill.id,skillName:skill.name,mechanic:skill.mechanic,
  targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),battleMode:actor.battleMode,hits,
  visualContacts:area?[...RAIN_HITS,4.05]:SHOTS,label:skill.name
 });
 for(const target of fixed)knockout(target);
 return hits;
}
