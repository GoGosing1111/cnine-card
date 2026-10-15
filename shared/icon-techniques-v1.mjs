// New ICON techniques are preparation-only; this catalog never assigns a live card.
import {preparedIconForTechnique} from './icon-expansion-v1.mjs';
export const ICON_TECHNIQUES_KEY='icon_technique_preparation_v1';
export const ICON_TECHNIQUES_VERSION='20261015-public-off-v1';
export const ICON_TECHNIQUES_RELEASE_ENABLED=false;
// The battle engine accepts this non-JSON capability only from isolated preparation callers.
export const ICON_TECHNIQUE_PREPARATION=Symbol('ICON_TECHNIQUE_PREPARATION');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const field=(key,label,min,max,unit,integer=true)=>({key,label,min,max,unit,integer});
const common=()=>[
 field('firstAction','첫 발동 행동',1,99,'본인 정규 행동'),
 field('cooldownActions','기본 재사용 간격',1,99,'본인 정규 행동'),
 field('maxCasts','전투당 최대 시전',1,99,'회')
];
const duration=()=>field('durationActions','효과 유지 기한',1,99,'대상 정규 행동');
export const ICON_TECHNIQUES=freeze([
 {code:'CROWN_USURP',name:'왕관 찬탈',target:'좋은 스탯 강화가 있는 적 1명',timing:'남은 강화 기간 그대로 이전',
  summary:'적의 제거 가능한 좋은 스탯 강화 1개를 빼앗아 자신에게 이전합니다.',
  safety:['복제가 아니라 원래 대상에게서 제거한 뒤 이전합니다.','고유 패시브·영구 스탯·보호막·보스 변신은 탈취하지 않습니다.','제거 가능한 행동 기한 스탯 강화만 선택합니다.'],
  fields:common()},
 {code:'FORMATION_EDIT',name:'전열 편집',target:'자리 교환이 가능한 적 전열·후열',timing:'자리 교환 이후 새로 결정하는 공격부터 적용',
  summary:'적의 전열과 후열의 실제 자리를 바꾸어 후속 공격의 대상 선정에 반영합니다.',
  safety:['진행 중인 공격의 확정 대상을 바꾸지 않습니다.','자리 이동이 불가능한 보스는 제외합니다.','겉모습만 이동시키지 않고 서버의 전열·후열 자리를 교환합니다.'],
  fields:common()},
 {code:'WOUND_DEFER',name:'상처 유예',target:'보호하는 아군',timing:'보호 대상의 다음 정규 행동이 끝나면 상환',
  summary:'직접 HP 피해 일부를 다음 정규 행동 종료에 상환하는 부채로 미룹니다.',
  safety:['피해를 삭제하거나 회복으로 바꾸지 않습니다.','미뤄진 부채는 보호막·정화·효과 해제로 지울 수 없습니다.','부채 상환은 재피격 효과를 다시 발동시키지 않습니다.'],
  fields:[...common(),duration(),field('deferPercent','직접 HP 피해 유예 비율',0,100,'%',false)]},
 {code:'SKILL_ADVANCE',name:'선불 출격',target:'재사용 대기 중인 아군 스킬',timing:'대상 아군의 다음 정규 행동',
  summary:'남은 재사용 대기를 당겨 다음 정규 행동에 스킬을 사용하고, 당긴 대기를 그다음 재사용 대기에 더합니다.',
  safety:['추가 행동이나 행동 게이지를 생성하지 않습니다.','상환을 마치기 전 같은 대상에게 다시 대출하지 않습니다.','스킬 사용은 기존 전투당 시전 횟수를 소모합니다.','정규 행동으로 시전하는 기존 9종·신규 ICON 기술만 대상이며 용병 스킬·장착 마법·일반 타입 패시브·보스 고유 기술은 제외합니다.','대상 스킬이 없으면 발동하거나 시전 횟수를 소모하지 않습니다.'],
  fields:common()},
 {code:'PURSUIT_BAN',name:'추적 금지',target:'보호하는 아군과 그를 단일 공격한 적',timing:'공격자가 다른 아군을 공격하기 전까지 재지정 제한',
  summary:'보호 아군을 단일 공격한 적은 다른 아군을 공격하기 전 같은 대상을 다시 지정하지 못합니다.',
  safety:['광역 공격의 대상에는 영향을 주지 않습니다.','보호 대상이 최후 생존자이면 공격을 막지 않습니다.','피해 면역이 아니라 후속 단일 공격의 대상 선정 제한입니다.','일반 단일 공격·ICON 단일기·용병의 신규 단일기에 적용하며 이미 시작한 다중 타격에는 개입하지 않습니다.'],
  fields:[...common(),duration()]},
 {code:'SKILL_CENSOR',name:'기술 검열',target:'적의 다음 공격 스킬',timing:'다음 공격 스킬의 부가 효과를 1회 억제',
  summary:'다음 공격 스킬의 본 피해는 유지하고 기절·표식·자가 강화 등 딸린 부가 효과를 한 번 억제합니다.',
  safety:['본 피해와 별개로 작동하는 패시브는 지우지 않습니다.','보스 페이즈 전환에는 개입하지 않습니다.','다음 공격 스킬 1회에 소비하며 기한 이후 남지 않습니다.','정규 행동으로 시전하는 기존 9종·신규 ICON 공격 기술만 대상이며 용병 스킬·장착 마법·일반 타입 패시브·보스 고유 기술은 제외합니다.','대상 스킬이 없으면 발동하거나 시전 횟수를 소모하지 않습니다.'],
  fields:[...common(),duration()]},
 {code:'AUTONOMOUS_WEAPON',name:'자율 병기',target:'주인에게 속한 별도 소환 슬롯',timing:'소환체가 독립적으로 행동하고 피격',
  summary:'독립 HP·행동·피격을 갖춘 병기를 별도 소환 슬롯에 생성합니다.',
  safety:['주인당 동시에 1기만 존재합니다.','주인이 사망하면 병기도 소멸합니다.','소환체가 다시 소환체를 만드는 재귀 소환은 금지합니다.','소환체는 부활·서약·추적 보호의 대상에서 제외하며 승패 HP 비율의 분모에 더하지 않습니다.'],
  fields:[...common(),field('hpPercent','병기 HP',1,1000,'주인 최대 HP %',false),field('attackPercent','병기 공격력',1,1000,'주인 공격력 %',false),field('speedPercent','병기 행동 속도',1,1000,'주인 속도 %',false)]},
 {code:'RETURN_OATH',name:'귀환 서약',target:'사망한 아군과 지정한 적 구출 목표',timing:'제한 행동 안에 목표 달성 시 낮은 HP로 귀환',
  summary:'아군 사망 후 지정한 적을 제한 행동 안에 처치하면 아군을 부활시킵니다. 단일 보스는 실제 피해 목표를 사용합니다.',
  safety:['목표를 달성하기 전까지 아군은 사망 상태를 유지합니다.','같은 아군을 이 기술로 반복 부활시키지 않습니다.','부활이나 구출 목표로 추가 보상·처치 보상을 만들지 않습니다.'],
  fields:[...common(),field('reviveHpPercent','귀환 HP',1,100,'대상 최대 HP %',false),field('bossDamagePercent','단일 보스 구출 피해 목표',1,100,'보스 최대 HP %',false),field('windowActions','구출 제한',1,99,'시전자 정규 행동')]}
]);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,names)=>plain(value)&&Object.keys(value).sort().join(',')===names.slice().sort().join(',');
export function iconTechniqueDefinition(code){return ICON_TECHNIQUES.find(row=>row.code===code)||null;}
export function emptyIconTechniqueTuning(code){const def=iconTechniqueDefinition(code);if(!def)throw Error('등록되지 않은 ICON 기술입니다.');return Object.fromEntries(def.fields.map(f=>[f.key,null]));}
export function validateIconTechniqueTuning(code,raw,{allowNull=false}={}){
 const def=iconTechniqueDefinition(code);if(!def)throw Error('등록되지 않은 ICON 기술입니다.');
 if(allowNull&&raw===null)return null;
 if(!exact(raw,def.fields.map(f=>f.key)))throw Error(def.name+'의 수치 항목을 확인해 주세요.');
 return Object.fromEntries(def.fields.map(f=>{
  const value=raw[f.key];if(allowNull&&value===null)return[f.key,null];
  if(typeof value!=='number'||!Number.isFinite(value)||value<f.min||value>f.max||(f.integer&&!Number.isSafeInteger(value)))throw Error(def.name+' · '+f.label+': '+f.min+'~'+f.max+' '+f.unit);
  return[f.key,value];
 }));
}
export function defaultIconTechniques(){return{version:1,enabled:false,techniques:ICON_TECHNIQUES.map(def=>({code:def.code,cardId:null,enabled:false,tuning:preparedIconForTechnique(def.code)?{...preparedIconForTechnique(def.code).tuning}:null,notes:''}))};}
export function applyPreparedIconTechniqueDefaults(document){
 return {...document,techniques:document.techniques.map(row=>({...row,tuning:row.tuning===null&&preparedIconForTechnique(row.code)?{...preparedIconForTechnique(row.code).tuning}:row.tuning}))};
}
export function validateIconTechniques(raw){
 if(!exact(raw,['version','enabled','techniques'])||raw.version!==1||raw.enabled!==false||!Array.isArray(raw.techniques)||raw.techniques.length!==ICON_TECHNIQUES.length)throw Error('신규 ICON 기술은 8종 준비 초안 · OFF로만 저장할 수 있습니다.');
 return{version:1,enabled:false,techniques:ICON_TECHNIQUES.map(def=>{
  const matches=raw.techniques.filter(row=>row?.code===def.code),row=matches[0];
  if(matches.length!==1||!exact(row,['code','cardId','enabled','tuning','notes'])||row.cardId!==null||row.enabled!==false||typeof row.notes!=='string'||row.notes.length>1200)throw Error(def.name+'은 카드 미배정 · OFF 상태여야 하며 메모는 1,200자 이내입니다.');
  return{code:def.code,cardId:null,enabled:false,tuning:validateIconTechniqueTuning(def.code,row.tuning,{allowNull:true}),notes:row.notes};
 })};
}
export function validateIconTechniquePreparation(raw){
 if(!exact(raw,['assignments'])||!Array.isArray(raw.assignments)||raw.assignments.length>10)throw Error('준비 전투에는 최대 10명의 기술 배정만 사용할 수 있습니다.');
 const seen=new Set();
 return{assignments:raw.assignments.map(row=>{
  if(!exact(row,['actorId','code','tuning'])||typeof row.actorId!=='string'||!row.actorId.trim()||row.actorId.length>128||/[\u0000-\u001f]/.test(row.actorId)||seen.has(row.actorId))throw Error('준비 전투의 배우 ID는 중복 없이 필요합니다.');
  seen.add(row.actorId);
  return{actorId:row.actorId,code:row.code,tuning:validateIconTechniqueTuning(row.code,row.tuning)};
 })};
}
