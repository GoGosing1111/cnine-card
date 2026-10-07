// User-approved October 8 reform. Values are installed by the audited operation;
// importing this catalog does not overwrite later CMS edits or account progress.
export const PVE_REFORM_VERSION='PVE_REFORM_20261008';
export const SCRAPYARD_REFORM_DIFFICULTIES=Object.freeze([
  {id:'OUTER',name:'외곽 폐차장',waves:10,requiredPowerStart:140000,requiredPowerEnd:300000,clearCoin:50000000,accent:'#58ddff'},
  {id:'CORE',name:'압축 설비 구역',waves:10,requiredPowerStart:1590000,requiredPowerEnd:3000000,clearCoin:100000000,accent:'#ffb85c'},
  {id:'FURNACE',name:'용광로 심부',waves:10,requiredPowerStart:4240000,requiredPowerEnd:8000000,clearCoin:200000000,accent:'#ff596f'},
  {id:'FURNACE_ELITE',name:'용광로 심부 · 상위',waves:10,requiredPowerStart:6360000,requiredPowerEnd:12000000,clearCoin:300000000,accent:'#e89eeb'},
  {id:'FURNACE_ABYSS',name:'용광로 심부 · 초월',waves:10,requiredPowerStart:31800000,requiredPowerEnd:60000000,clearCoin:800000000,accent:'#9a9bff'}
].map(Object.freeze));
export const COW_REFORM_TIERS=Object.freeze([
  {id:'PASTURE',name:'목초지 · 입문',powerMultiplier:1,rewardIndex:0,normalPower:550000,elitePower:1000000,bossPower:2600000},
  {id:'BLOOD_PASTURE',name:'붉은 목초지',powerMultiplier:5,rewardIndex:1,normalPower:2750000,elitePower:5000000,bossPower:13000000},
  {id:'ABYSS_PASTURE',name:'심연의 목초지',powerMultiplier:60,rewardIndex:2,normalPower:33000000,elitePower:60000000,bossPower:156000000}
].map(Object.freeze));
export const COW_REFORM_REWARDS=Object.freeze([500000000,1500000000,3000000000]);
export const cowTiersForPolicy=policy=>policy.clearCoin?.length===3?COW_REFORM_TIERS:COW_REFORM_TIERS.slice(0,1);
export const SCRAPYARD_REWARD_COIN_LIMIT=1000000000;
// Preserve the early tutorial. At each later gate the operating guardian power
// rises continuously; ordinary/elite enemy power is derived by the live engine.
const towerAnchors=[[40,110000],[41,500000],[49,1500000],[50,2000000],[59,8000000],[60,10000000],[69,18000000],[70,20000000],[80,30000000],[90,100000000],[100,200000000]];
export function reformTowerPower(floor,oldPower){
  if(!Number.isSafeInteger(floor)||floor<1||floor>100)throw new Error('Invalid reform floor');
  if(floor<=40)return Math.round(oldPower*2);
  const index=towerAnchors.findIndex(([tier])=>tier>=floor),[end,power]=towerAnchors[index],[start,previous]=towerAnchors[index-1];
  return Math.round(previous+(power-previous)*(floor-start)/(end-start));
}
export function reformTowerReward(floor,oldReward){
  if(floor<=70)return oldReward*10;
  if(floor===80)return 10000000000;
  if(floor===90)return 15000000000;
  if(floor===100)return 20000000000;
  return floor<80?1000000000:floor<90?1500000000:2000000000;
}
