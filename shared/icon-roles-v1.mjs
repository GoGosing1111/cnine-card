// ICON RPG identities. The legacy eight-stat CMS document is preserved separately.
// All durations/cooldowns are actor actions, never animation time or browser clocks.
export const ICON_ROLES_KEY='icon_role_settings_v1';
import {validatedIconSupremacy} from './icon-supremacy-v1.mjs';
export const ICON_ROLES_VERSION='20261005-fur15-v1';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const field=(key,label,min,max,value,unit='%',integer=false)=>({key,label,min,max,value,unit,integer});
const common=(first,cooldown)=>[
 field('firstAction','첫 발동 행동',1,8,first,'행동',true),field('cooldownActions','재사용 간격',2,12,cooldown,'본인 행동',true),
 field('maxCasts','전투당 최대 발동',1,15,6,'회',true),field('pveScale','PVE 효과 배율',25,150,100),field('pvpScale','PVP 효과 배율',25,150,90),
 field('damagePercent','대표 스킬 공격 배율',40,350,180),field('damageCapPercent','대상별 1회 스킬 피해 상한',10,60,46,'대상 최대 HP %')
];
export const ICON_ROLES=freeze([
 {code:'ICON-DIIM',cardId:'CN-1C000001',name:'디임',role:'ASSASSIN',label:'암살',archetype:'월영 추적자',color:'#75e4e0',glyph:'daggers',attackStyle:'MELEE',
  passive:'사냥 표식',skill:'월영 처형',passiveText:'체력이 가장 낮은 적에게 표식을 새겨 우선 공격합니다.',skillText:'표식 대상에게 연속 참격을 가합니다. 잃은 체력에 비례해 피해가 증가하며 처치 시 제한된 횟수만 행동 게이지를 회복합니다.',
  fields:[...common(2,4),field('executePercent','잃은 체력 비례 추가 배율',0,100,60),field('takedownGauge','처치 후 게이지 회복',0,40,25,'게이지'),field('maxTakedowns','처치 보너스 한도',0,3,2,'회',true)]},
 {code:'ICON-HI-HEEYA',cardId:'CN-1C000002',name:'하이희야',role:'ATTACK',label:'공격',archetype:'집중 포화 사수',color:'#ffae60',glyph:'barrage',attackStyle:'RANGED',
  passive:'집중 포화',skill:'오버드라이브',passiveText:'같은 적에게 평타를 적중시키면 화력이 중첩됩니다. 공격 대상을 바꾸면 중첩을 다시 쌓습니다.',skillText:'화력 중첩을 소비해 세 차례 집중 연사합니다. 남아 있는 방벽에 추가 피해를 줍니다.',
  fields:[...common(3,4),field('stackPercent','화력 중첩당 추가 피해',0,20,10),field('maxStacks','화력 중첩 상한',1,5,3,'중첩',true),field('shieldBreakPercent','방벽 추가 피해',0,80,40)]},
 {code:'ICON-NAMUNEUL-BONGSOON',cardId:'CN-1C000003',name:'나무늘봉순',role:'MAGIC',label:'마법',archetype:'백화 정령 마궁사',color:'#d9e9b7',glyph:'arcane',attackStyle:'RANGED',
  passive:'정령 집중',skill:'백화 유성우',passiveText:'마력을 집중한 뒤 다음 본인 행동에 마력 화살비를 방출합니다. 시전 도중 봉인되면 집중이 해제됩니다.',skillText:'최대 세 적에게 마력 화살비를 내립니다. 적이 적으면 남은 화력이 모이지만 단일 대상 상한을 넘지 않습니다.',
  fields:[...common(2,4),field('maxTargets','화살비 최대 대상',1,5,3,'명',true),field('focusPercent','빈 대상당 화력 집중',0,40,20),field('penetrationPercent','마력 화살 방어 무시',0,45,25)]},
 {code:'ICON-OH-JOEUN',cardId:'CN-1C000004',name:'오조은',role:'SUPPORT',label:'지원',archetype:'프리즘 공명술사',color:'#aaa8ff',glyph:'resonance',attackStyle:'CAST',
  passive:'공명 화음',skill:'프리즘 앙코르',passiveText:'아군의 본인 행동이 끝날 때 공명을 모읍니다. 추가타와 반격으로는 공명이 쌓이지 않습니다.',skillText:'공명을 소비해 부상한 아군을 회복하고 해로운 효과 한 종류를 정화합니다. 회복한 아군의 다음 직접 공격을 강화합니다.',
  fields:[...common(2,4).filter(f=>!['damagePercent','damageCapPercent'].includes(f.key)),field('healPercent','기본 회복량',1,25,20,'대상 최대 HP %'),field('resonancePercent','공명당 추가 회복량',0,3,2,'대상 최대 HP %'),field('maxStacks','공명 중첩 상한',1,8,5,'중첩',true),field('healBudgetPercent','전투당 회복 총량',10,150,80,'시전자 최대 HP %'),field('nextAttackPercent','다음 공격 강화',0,35,25),field('durationActions','강화 유지',1,4,2,'대상 행동',true)]},
 {code:'ICON-ORIKKUNG',cardId:'CN-1C000005',name:'오리꿍',role:'CURSE',label:'저주',archetype:'낙화 주술사',color:'#f2a5c5',glyph:'curse',attackStyle:'CAST',
  passive:'낙화 저주',skill:'화접 낙인',passiveText:'평타 적중 시 저주를 중첩합니다. 저주받은 적은 본인 행동 시작에 지속 피해를 받고 회복량이 감소합니다.',skillText:'대상에게 쌓인 저주를 폭발시키고 다른 적 한 명에게 일부 전이합니다. 보스에게도 저주 피해와 약화가 적용됩니다.',
  fields:[...common(3,4),field('maxStacks','저주 중첩 상한',1,4,3,'중첩',true),field('dotPercent','중첩당 지속 피해',1,20,9,'시전자 공격력 %'),field('healReductionPercent','중첩당 회복 감소',0,20,10),field('stackPercent','폭발 중첩당 추가 피해',0,35,15),field('durationActions','저주 지속',1,5,3,'대상 행동',true),field('bossVulnerabilityPercent','보스가 받는 피해 증가',0,15,6)]},
 {code:'ICON-KANGGUYEOL',cardId:'CN-1C000006',name:'강구열',role:'DEFENSE',label:'방어',archetype:'철벽 수호자',color:'#e6a771',glyph:'guard',attackStyle:'MELEE',
  passive:'수호 맹약',skill:'철벽 반격',passiveText:'위기에 처한 아군의 직접 피해 일부를 대신 받습니다. 한 번의 타격에는 수호자 한 명만 개입하며 보호 총량이 정해져 있습니다.',skillText:'자신에게 수호 방벽을 두르고 흡수한 피해를 축적합니다. 다음 철벽 반격에 축적분을 소비해 충격파를 방출합니다.',
  fields:[...common(2,4),field('guardThresholdPercent','보호 발동 아군 체력',10,70,50),field('guardSharePercent','대신 받는 피해',5,45,25),field('guardBudgetPercent','전투당 보호 총량',10,180,100,'시전자 최대 HP %'),field('shieldPercent','수호 방벽',5,40,20,'시전자 최대 HP %'),field('storedDamagePercent','축적 피해 환산',0,80,40),field('storedCapPercent','축적 반격 추가 피해 상한',10,120,60,'시전자 공격력 %'),field('durationActions','방벽 지속',1,5,3,'본인 행동',true)]},
 {code:'ICON-AYOON',cardId:'CN-1C000007',name:'아윤',role:'ASSAULT',label:'돌격',archetype:'백야 선봉장',color:'#a5deed',glyph:'charge',attackStyle:'MELEE',
  passive:'선봉 돌파',skill:'백야 진격',passiveText:'첫 진격 때 일시 보호막을 얻어 교전의 선두를 엽니다.',skillText:'전방 적을 강하게 공격하며 방벽을 추가로 파괴하고 행동 게이지를 지연시킵니다. 보스에게는 지연 대신 받는 피해 증가를 적용합니다.',
  fields:[...common(1,4).map(f=>f.key==='damagePercent'?{...f,value:140}:f),field('shieldPercent','첫 진격 보호막',5,30,18,'시전자 최대 HP %'),field('shieldBreakPercent','방벽 추가 피해',0,100,65),field('gaugeDelay','적 행동 게이지 감소',0,25,12,'게이지'),field('bossVulnerabilityPercent','보스가 받는 피해 증가',0,15,8),field('durationActions','진격 효과 지속',1,4,2,'대상 행동',true)]},
 {code:'ICON-ZEUS-CHEOLGU',cardId:'CN-1C000008',name:'제우스 철구',role:'MAGIC',label:'마법',archetype:'올림포스의 뇌신',color:'#f7d077',glyph:'lightning',attackStyle:'RANGED',
  acquisitionText:'일반 ICON 제작 획득 불가',
  passive:'뇌신의 권능',skill:'올림포스의 심판',passiveText:'번개의 힘을 모은 뒤 다음 본인 행동에 뇌격을 방출합니다. 집중 중 봉인되면 충전이 해제됩니다.',skillText:'최대 세 적에게 황금 번개를 내려 방어 일부를 무시합니다. 적이 적으면 남은 번개가 집중되며, 대상별 피해 상한을 적용합니다.',
  fields:[...common(2,4),field('maxTargets','뇌격 최대 대상',1,5,3,'명',true),field('focusPercent','빈 대상당 번개 집중',0,40,20),field('penetrationPercent','뇌격 방어 무시',0,45,25)]}
]);
export function iconDefinition(card){
 const id=typeof card==='string'?card:String(card?.cardId??card?.id??card?.card_id??'');
 return ICON_ROLES.find(d=>d.cardId===id||d.code===id)||null;
}
export function defaultIconRoles(){return {version:1,enabled:true,scopes:{pve:true,pvp:true,captain:true},cards:ICON_ROLES.map(d=>({code:d.code,enabled:true,tuning:Object.fromEntries(d.fields.map(f=>[f.key,f.value]))}))};}
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,names)=>plain(v)&&Object.keys(v).sort().join(',')===names.split(',').sort().join(',');
export function validateIconRoleTuning(def,value){
 if(!keys(value,def.fields.map(f=>f.key).join(',')))throw Error('역할 설정 항목을 확인해 주세요.');
 return Object.fromEntries(def.fields.map(f=>{const n=value[f.key];if(typeof n!=='number'||!Number.isFinite(n)||n<f.min||n>f.max||f.integer&&!Number.isInteger(n))throw Error(`${def.name} · ${f.label}: ${f.min}~${f.max}${f.unit}`);return [f.key,n];}));
}
export function validateIconRoles(raw,{allowLegacy=false}={}){
 if(allowLegacy&&Array.isArray(raw?.cards)&&raw.cards.length===7&&!raw.cards.some(c=>c?.code==='ICON-ZEUS-CHEOLGU'))return validateIconRoles({...raw,cards:[...raw.cards,defaultIconRoles().cards.find(c=>c.code==='ICON-ZEUS-CHEOLGU')]});
 if(!keys(raw,'version,enabled,scopes,cards')||raw.version!==1||typeof raw.enabled!=='boolean'||!keys(raw.scopes,'pve,pvp,captain')||Object.values(raw.scopes).some(v=>typeof v!=='boolean')||!Array.isArray(raw.cards)||raw.cards.length!==ICON_ROLES.length)throw Error('ICON 역할 설정 형식을 확인해 주세요.');
 return {version:1,enabled:raw.enabled,scopes:{...raw.scopes},cards:ICON_ROLES.map(d=>{const matches=raw.cards.filter(c=>c?.code===d.code),c=matches[0];if(matches.length!==1||!keys(c,'code,enabled,tuning')||typeof c.enabled!=='boolean')throw Error(`등록된 ICON ${ICON_ROLES.length}종이 중복 없이 필요합니다.`);return {code:c.code,enabled:c.enabled,tuning:validateIconRoleTuning(d,c.tuning)};})};
}
export function iconRoleSnapshot(card,document=defaultIconRoles(),scope='PVE',revision=1){
 const def=iconDefinition(card),row=def&&document.cards.find(c=>c.code===def.code),grade=String(card?.grade??card?.rarity??'').toUpperCase();
 if(!def||grade!=='ICON'||!document.enabled||!row?.enabled||document.scopes[String(scope).toLowerCase()]!==true)return null;
 return {version:1,code:def.code,role:def.role,revision,tuning:{...row.tuning}};
}
export function validatedIconSnapshot(card){
 const def=iconDefinition(card),s=card?.iconRole;
 if(!def||String(card.grade??card.rarity??'').toUpperCase()!=='ICON'||!s||s.version!==1||s.code!==def.code||s.role!==def.role||!Number.isSafeInteger(s.revision)||s.revision<1)return null;
 try{return {...s,tuning:validateIconRoleTuning(def,s.tuning),supremacy:validatedIconSupremacy(s.supremacy)};}catch{return null;}
}
export function iconHealingAmount(target,amount){
 const reduction=Math.max(0,Math.min(60,Number(target?.iconCurse?.healReductionPercent)||0));
 return Math.max(0,Math.floor(amount*(1-reduction/100)));
}
