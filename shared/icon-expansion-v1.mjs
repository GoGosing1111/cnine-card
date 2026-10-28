import {ICON_FUSION_POLICY} from './icon-fusion-recipe-v1.mjs';

// User release 2026-10-29: four prepared cards, normal crafting and live combat.
// Existing nine cards, choice tickets and the two-ICON deck limit are unchanged.
export const ICON_EXPANSION_RELEASE_ENABLED=true;
export const ICON_EXPANSION_VERSION='20261029-four-live-v1';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const ICON_EXPANSION_RECIPE=freeze({...ICON_FUSION_POLICY,coinCost:1000000000000,basePower:360000});
export const ICON_EXPANSION_STAT_MULTIPLIER=1.25;
export const ICON_EXPANSION_CARDS=freeze([
 {code:'ICON-NAMSUDAENG',name:'남수댕',techniqueCode:'CROWN_USURP',techniqueName:'왕관 찬탈',
  sourceArt:'preview/icon-namsudaeng-battle-20261015-v1/sources/namsudaeng-photo-original.png',
  sd:'preview/icon-namsudaeng-battle-20261015-v1/assets/namsudaeng-sd.webp',
  preview:'/preview/icon-namsudaeng-battle-20261015-v1/',
  tuning:{firstAction:1,cooldownActions:2,maxCasts:8}},
 {code:'ICON-DIIM-REDCAP',name:'디임',techniqueCode:'AUTONOMOUS_WEAPON',techniqueName:'자율 병기',
  sourceArt:'preview/icon-diim-redcap-battle-20261015-v1/sources/diim-photo-original.png',
  sd:'preview/icon-diim-redcap-battle-20261015-v1/assets/diim-sd.webp',
  preview:'/preview/icon-diim-redcap-battle-20261015-v1/',
  tuning:{firstAction:1,cooldownActions:4,maxCasts:3,hpPercent:50,attackPercent:80,speedPercent:110}},
 {code:'ICON-OH-JOEUN-WHITE',name:'오조은',techniqueCode:'SKILL_ADVANCE',techniqueName:'선불 출격',
  sourceArt:'preview/icon-joeun-white-battle-20261016-v1/assets/joeun-portrait.webp',
  sourceOriginal:'preview/icon-joeun-white-battle-20261016-v1/sources/joeun-photo-original.png',
  sd:'preview/icon-joeun-white-battle-20261016-v1/assets/joeun-sd.webp',
  preview:'/preview/icon-joeun-white-battle-20261016-v1/',
  tuning:{firstAction:1,cooldownActions:3,maxCasts:6}},
 {code:'ICON-NAMUNEUL-BONGSOON-20261016',name:'나무늘봉순',techniqueCode:'RETURN_OATH',techniqueName:'귀환 서약',
  sourceArt:'preview/icon-bongsoon-battle-20261016-v1/assets/bongsoon-portrait.webp',
  sourceOriginal:'preview/icon-bongsoon-battle-20261016-v1/sources/bongsoon-photo-original.png',
  sd:'preview/icon-bongsoon-battle-20261016-v1/assets/bongsoon-sd.webp',
  preview:'/preview/icon-bongsoon-battle-20261016-v1/',
  tuning:{firstAction:1,cooldownActions:4,maxCasts:2,reviveHpPercent:35,bossDamagePercent:10,windowActions:5}}
].map((card,index)=>({...card,cardId:`CN-1C0000${index+10}`,grade:'ICON',basePower:360000,releaseEnabled:true,acquisitionEnabled:true,battleEnabled:true,
 recipe:ICON_EXPANSION_RECIPE,statMultiplier:ICON_EXPANSION_STAT_MULTIPLIER,balanceStatus:'LIVE_360000',focusX:50,focusY:50})));
export function preparedIconForTechnique(code){return ICON_EXPANSION_CARDS.find(c=>c.techniqueCode===code)||null;}
export function preparedIconForCode(code){return ICON_EXPANSION_CARDS.find(c=>c.code===code)||null;}
// Isolated rehearsal only: the live battle/roster never imports this function.
// Call with an existing ICON benchmark; preserve its current HP ratio.
export function prepareStrongerIconFighter(reference,code){
 const spec=preparedIconForCode(code);if(!spec)throw Error('Unknown prepared ICON');
 const result={...reference,iconRole:null};
 for(const key of ['maxHp','attack','defense','speed']){
  if(!Number.isFinite(reference[key])||reference[key]<0)throw Error('Invalid ICON benchmark '+key);
  result[key]=Math.ceil(reference[key]*spec.statMultiplier);
 }
 result.hp=Math.min(result.maxHp,Math.round(result.maxHp*Math.max(0,reference.hp)/Math.max(1,reference.maxHp)));
 return result;
}

export function liveExpansionIcon(value){
 const id=typeof value==='string'?value:String(value?.cardId??value?.id??value?.card_id??'');
 return ICON_EXPANSION_CARDS.find(c=>c.cardId===id||c.code===id)||null;
}
