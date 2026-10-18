import {berkanVolleyTargets} from './mercenary-berkan-v1.mjs';
const SHOTS=[.98,1.26,1.54,1.82,2.10,2.68],RAIN_HITS=Array.from({length:15},(_,i)=>2.35+i*.085);
export const KANGYUN_CODE='V-057',KANGYUN_VOLLEY_SKILL='MS-059',KANGYUN_AREA_SKILL='MS-060';

// User-authorized live policy, shared by server combat and the authored preview.
export const IMPERIAL_ARCHER_COMBAT=Object.freeze({
 version:'kangyun-balance-20261019-v2',status:'RELEASED',runtimeEnabled:true,
 basePower:324000,statScale:5.5,speedScale:3,actionCredit:3,actionEnergy:10,pvpBasicDamageScale:.9,basicCapScale:1.5,pvpSkillCapScale:2.7,
 link:Object.freeze({attackPercent:1210,hpPercent:1540,shieldPercent:825})
});
export const ARCHER_VOLLEY='IMPERIAL_PIERCING_VOLLEY',ARCHER_RAIN='IMPERIAL_ARROW_RAIN';
export const IMPERIAL_ARCHER_SKILLS=Object.freeze([
 Object.freeze({id:KANGYUN_VOLLEY_SKILL,name:'연환 파갑',mechanic:ARCHER_VOLLEY,target:'BACK_THREAT',
  balance:Object.freeze({damageRatio:8.4,cooldownTurns:2,cost:25}),
  description:'후열 우선 핵심 적 1명에게 관통 화살을 집중합니다. 고속 연사와 일곱 화살은 합계 840%의 한 시전 피해 예산을 사용합니다.'}),
 Object.freeze({id:KANGYUN_AREA_SKILL,name:'천궁 멸진',mechanic:ARCHER_RAIN,target:'ALL_ENEMIES',pveOnly:true,
  balance:Object.freeze({damageRatio:12,cooldownTurns:4,cost:35}),
  description:'PVE 적 전체에 화살비와 거대 화살을 내립니다. 합계 1,200%를 지정 대상 수로 나누며 한 대상이면 전체 예산을 적용합니다.'})
]);
// Upgrade only the released defaults. Preserve explicit operator overrides,
// unconfigured skills, assignments and all other cards; never write the CMS DB.
export function upgradeKangyunBalance(document){
 if(!Array.isArray(document?.skills))return document;
 const old={ [KANGYUN_VOLLEY_SKILL]:{damageRatio:6.8,cooldownTurns:4,cost:35},[KANGYUN_AREA_SKILL]:{damageRatio:7,cooldownTurns:5,cost:35} };
 let changed=false;
 const skills=document.skills.map(s=>{
  const policy=IMPERIAL_ARCHER_SKILLS.find(p=>p.id===s.id),previous=old[s.id];
  if(!policy||s.mechanic!==policy.mechanic||!Object.entries(previous).every(([k,v])=>s.balance?.[k]===v))return s;
  changed=true;return {...s,balance:{...policy.balance},effect:policy.description};
 });
 return changed?{...document,skills}:document;
}
// Code is sufficient for snapshots; combat helpers also check rank-fixed actors.
export const isImperialArcher=a=>a?.code===KANGYUN_CODE;
export const imperialArcherCredit=actors=>actors.some(a=>isImperialArcher(a)&&a.isMercenary&&a.statMode==='RANK_FIXED'&&a.alive!==false&&a.hp>0)?IMPERIAL_ARCHER_COMBAT.actionCredit:1;
export const imperialArcherBasicScale=a=>isImperialArcher(a)&&a.battleMode==='PVP'?IMPERIAL_ARCHER_COMBAT.pvpBasicDamageScale:1;
export const imperialArcherCap=(a,s)=>isImperialArcher(a)&&s?.mechanic===ARCHER_VOLLEY&&a.battleMode==='PVP'?IMPERIAL_ARCHER_COMBAT.pvpSkillCapScale:1;
export function imperialArcherTargets(actor,skill,enemies){
 if(!isImperialArcher(actor))return [];
 if(skill.mechanic===ARCHER_RAIN)return actor.battleMode==='PVE'?enemies:[];
 return skill.mechanic===ARCHER_VOLLEY&&['PVE','PVP'].includes(actor.battleMode)?berkanVolleyTargets(enemies).slice(0,1):[];
}
export function imperialArcherCandidate(combat,{equipment}={}){
 return {code:KANGYUN_CODE,name:'신궁 강윤',title:'신궁',rank:'SSS',position:'REAR',role:'SNIPER',attackStyle:'RANGED',
  level:1,statMode:'RANK_FIXED',basePower:IMPERIAL_ARCHER_COMBAT.basePower,previewPolicy:IMPERIAL_ARCHER_COMBAT.version,
  runtimeEnabled:true,combat:structuredClone(combat),skills:structuredClone(IMPERIAL_ARCHER_SKILLS),
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
  // PVE arrows share the ordinary ranged skill floor, already divided by
  // target count. Escort/co-op disable that floor in the canonical engine.
  const result=ratio>0?hit(actor,target,ratio,{rangedSkill:actor.battleMode==='PVE',castShare:share,capScale:capActions,varyDamageCap:!area&&actor.battleMode==='PVP'}):{damage:0,dodge:false};
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

export const KANGYUN_ROOT='preview/mercenary-imperial-archer-sss-v1/';
export const KANGYUN_SOURCE_ART="assets/ui/project-v/mercenaries/approved-20261018/kangyun-source-art.png";
export const KANGYUN_BATTLE_SPRITE="assets/ui/project-v/characters/mercenary/kangyun-sss-v1/kangyun-battle-sprite.png";
export const KANGYUN_POSITION=Object.freeze({code:KANGYUN_CODE,rank:'SSS',position:'REAR',role:'SNIPER',basicTarget:'FRONT_ENEMY',skillTarget:'BACK_THREAT',specialty:'후열 핵심 적 집중 관통 · PVE 화살비와 거대 화살',weakness:'회피·방어·보호막에 대응되며 기절·침묵 중에는 스킬을 사용하지 않음',rationale:'거대한 활로 핵심 적을 관통하는 신궁. PVE에서는 적 전체에 화살비를 퍼붓습니다.'});
export function createKangyunSkills(definition,art){
 return IMPERIAL_ARCHER_SKILLS.map((s,i)=>definition(s.id,s.name,'SNIPER',s.target,s.mechanic,
  (i?'PVE에서 살아 있는 적 전체를 지정합니다. PVP에서는 사용하지 않습니다.':'PVE·PVP에서 후열 우선, 전투 시작 공격력 순으로 핵심 적 1명을 지정합니다.')+' 자원과 재사용 조건을 충족할 때 발동합니다.',s.description,
  '회피·방어·방벽·피해 경감을 적용하며 사망·기절·침묵 중에는 발동하지 않습니다. 대상이 없으면 자원을 소모하지 않습니다.',
  '한 시전의 피해 예산을 지정 대상 수로 나눕니다. 화살 연출은 추가 피해나 행동을 만들지 않으며 회피한 몫은 재분배하지 않습니다.',
  art(i?'kangyun-arrow-rain':'kangyun-piercing-volley',s.mechanic,.8,[i?4.05:2.68],i?6.6:4.1,'#ffce72'),i?['천공 화살','화살비','거대 화살 · 멸진']:['강궁 조준','고속 연사','일곱 화살 · 관통']));
}
export function prepareKangyunDefaults(document){
 const card=document.mercenaries.find(c=>c.code===KANGYUN_CODE);if(!card)return document;
 Object.assign(card,{...KANGYUN_POSITION,name:'신궁 강윤',title:'신궁',rank:'SSS',review:'REVIEWED',acquisition:{type:'DROP',source:'하이퍼팩·리미티드팩의 일반 SSS 풀 및 SSS 재뽑기권. 일반 SSS 내부 강윤 선택 확률 1%.',coinPrice:null,dropRate:null}});
 for(const policy of IMPERIAL_ARCHER_SKILLS){const skill=document.skills.find(s=>s.id===policy.id);if(!skill)throw Error('KANGYUN_SKILL_MISSING');skill.balance={...policy.balance};skill.review='REVIEWED';}
 document.assignments.find(a=>a.code===KANGYUN_CODE).skillIds=IMPERIAL_ARCHER_SKILLS.map(s=>s.id);return document;
}
