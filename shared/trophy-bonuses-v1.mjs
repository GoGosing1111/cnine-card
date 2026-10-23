import {TROPHY_CATALOG} from '../js/player-card-model-v2052.js?v=20261023-milestones1';
import {ZERO_REWARD_BONUSES,validateRewardBonuses,hasRewardBonuses,rewardBonusDescription,sumRewardBonuses} from './collection-bonuses-v1.mjs';
export const TROPHY_BONUSES_KEY='trophy_reward_bonuses_v1';
const LEGACY_OPTIONAL_CODES=new Set(['WORLD_RAID_CLEAR_5000','BLUE_EMPIRE_20','LIMITED_EDITION_80','LOYAL_SERVICE_POST_20']);
export function emptyTrophyBonuses(){return {version:1,trophies:TROPHY_CATALOG.map(t=>({code:t.code,rewardBonuses:{...ZERO_REWARD_BONUSES}}))};}
export function validateTrophyBonuses(raw,{allowLegacy=false}={}){
  if(!raw||Object.keys(raw).sort().join(',')!=='trophies,version'||raw.version!==1||!Array.isArray(raw.trophies))throw Error('전체 트로피의 보너스 설정을 확인해 주세요.');
  const codes=new Set();
  const trophies=raw.trophies.map(row=>{
    if(!row||Object.keys(row).sort().join(',')!=='code,rewardBonuses'||!TROPHY_CATALOG.some(t=>t.code===row.code)||codes.has(row.code))throw Error('알 수 없거나 중복된 트로피입니다.');
    codes.add(row.code);return {code:row.code,rewardBonuses:validateRewardBonuses(row.rewardBonuses)};
  });
  const missing=TROPHY_CATALOG.filter(t=>!codes.has(t.code));
  // Read old eight/nine-trophy CMS documents without changing any saved rate.
  // Only known additions receive zero defaults; the original eight remain required.
  // Saving still requires the full current catalog and never grants a new bonus.
  if(missing.length){
    if(!allowLegacy||missing.some(t=>!LEGACY_OPTIONAL_CODES.has(t.code)))throw Error('전체 트로피의 보너스 설정을 확인해 주세요.');
    trophies.push(...missing.map(t=>({code:t.code,rewardBonuses:{...ZERO_REWARD_BONUSES}})));
  }
  return {version:1,trophies};
}
export function trophyBonusProjection(document,honors){
  const trophies=TROPHY_CATALOG.map(t=>{
    const rewardBonuses=document.trophies.find(row=>row.code===t.code)?.rewardBonuses||ZERO_REWARD_BONUSES,owned=Number(honors[t.code]?.count||0)>0;
    return {...t,...honors[t.code],owned,rewardBonuses,effect:{enabled:owned&&hasRewardBonuses(rewardBonuses),description:rewardBonusDescription(rewardBonuses)}};
  });
  return {trophies,totals:sumRewardBonuses(trophies.filter(t=>t.owned).map(t=>t.rewardBonuses))};
}
