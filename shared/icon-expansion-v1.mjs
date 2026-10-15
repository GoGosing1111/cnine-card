import {ICON_FUSION_POLICY} from './icon-fusion-policy-v1.mjs';

// User correction: publish the preparations, keep acquisition/battle OFF and
// retain the existing two-ICON deck limit. This is not the live card roster.
export const ICON_EXPANSION_RELEASE_ENABLED=false;
export const ICON_EXPANSION_VERSION='20261015-public-off-v1';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const ICON_EXPANSION_RECIPE=freeze({...ICON_FUSION_POLICY,coinCost:1000000000000});
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
  tuning:{firstAction:1,cooldownActions:4,maxCasts:3,hpPercent:50,attackPercent:80,speedPercent:110}}
].map(card=>({...card,cardId:null,grade:'ICON',basePower:180000,releaseEnabled:false,acquisitionEnabled:false,battleEnabled:false,
 recipe:ICON_EXPANSION_RECIPE,statMultiplier:ICON_EXPANSION_STAT_MULTIPLIER,balanceStatus:'STRONGER_THAN_EXISTING_ICON_PREPARED',focusX:50,focusY:50})));
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
