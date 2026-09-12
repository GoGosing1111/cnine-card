import {towerInt,towerError} from './_tower_v3.js';

// Audited against operating tower ranges on 2026-09-11; proposals are never
// automatically written into admin_kv or activated in an operating route.
export const TOWER_V3_ECONOMY_DRAFT=Object.freeze({version:'TOWER_ECONOMY_DRAFT_20260911_1',approved:false,
  entryCoin:0,dailyRewardedClears:10,repeatCoinPercent:2,repeatCoinCap:500000,
  materialCode:'VEHICLE_PART_TIRE',materialName:'고성능 타이어',materialMinTier:20,materialEvery:5,materialQuantity:1,materialDailyCap:2,
  // High-value cores and premium drops must not be multiplied by free repeats.
  repeatMagicCrystals:0,repeatPremiumCube:0,repeatBlackMiracle:0,repeatMysticEnergy:0,repeatSuitCore:0});
export const TOWER_LEGACY_REWARD_SNAPSHOT=Object.freeze([
  [1,9,1000000],[10,10,5000000],[11,19,2000000],[20,20,10000000],[21,29,3000000],[30,30,30000000],
  [31,39,4000000],[40,40,50000000],[41,49,5000000],[50,50,100000000],[51,59,10000000],[60,60,300000000],
  [61,69,25000000],[70,70,500000000]
].map(([start,end,coin])=>Object.freeze({start,end,coin,magicCrystals:0})));
export function validateTowerEconomy(input=TOWER_V3_ECONOMY_DRAFT){
  const c={...input};if(!/^TOWER_[A-Z0-9_:-]{1,80}$/.test(c.version)||typeof c.approved!=='boolean')throw towerError('TOWER_V3_ECONOMY','보상 시안 버전을 확인하세요.');
  // The free-entry proposal has no debit/refund path. Adding a fee requires a
  // separately reviewed atomic admission implementation, not a CMS-only edit.
  towerInt(c.entryCoin,0,0,'입장 비용');towerInt(c.dailyRewardedClears,0,30,'일일 보상 횟수');
  towerInt(c.repeatCoinPercent,0,10,'반복 코인 비율');towerInt(c.repeatCoinCap,0,5000000,'반복 코인 상한');
  towerInt(c.materialMinTier,1,1000,'재료 지급 시작층');towerInt(c.materialEvery,1,30,'재료 지급 간격');
  towerInt(c.materialQuantity,0,5,'재료 수량');towerInt(c.materialDailyCap,0,10,'재료 일일 한도');
  if(!['VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE'].includes(c.materialCode))throw towerError('TOWER_V3_ECONOMY','기존 차량 제작 재료를 선택하세요.');
  for(const key of ['repeatMagicCrystals','repeatPremiumCube','repeatBlackMiracle','repeatMysticEnergy','repeatSuitCore'])towerInt(c[key],0,0,key);
  return c;
}
export const towerBudgetDate=at=>new Date(at+9*3600000).toISOString().slice(0,10);
export function towerFirstReward(tier,table=TOWER_LEGACY_REWARD_SNAPSHOT){
  const row=table.find(r=>tier>=r.start&&tier<=r.end);
  if(!row)return null;
  return {coin:towerInt(Number(row.coin),0,1e12,'최초 코인'),magicCrystals:towerInt(Number(row.magicCrystals||0),0,1e8,'최초 마력석')};
}
export function towerRepeatCoin(tier,policy=TOWER_V3_ECONOMY_DRAFT,table=TOWER_LEGACY_REWARD_SNAPSHOT){
  const c=validateTowerEconomy(policy);
  // A 500M milestone is not a repeat-farming baseline. Use the band's ordinary
  // floor; tiers above the old catalog use its last ordinary band without
  // fabricating new first-clear rewards.
  const ordinary=Math.min(61,Math.floor((tier-1)/10)*10+1);
  const base=towerFirstReward(ordinary,table)?.coin||0;
  return Math.min(c.repeatCoinCap,Math.floor(base*c.repeatCoinPercent/100));
}
export function planTowerRewards({battle,progress,firstClaimed=false,budget={rewarded:0,material:0,eligible:0},policy=TOWER_V3_ECONOMY_DRAFT,firstTable=TOWER_LEGACY_REWARD_SNAPSHOT}){
  const c=validateTowerEconomy(policy),items=[];
  const first=battle.success&&battle.tier>progress.legacyRewardThrough&&!firstClaimed;
  const firstReward=first?towerFirstReward(battle.tier,firstTable):null;
  const repeated=battle.success&&budget.rewarded<c.dailyRewardedClears;
  const eligible=repeated&&battle.tier>=c.materialMinTier;
  const material=eligible&&(budget.eligible+1)%c.materialEvery===0?Math.min(c.materialQuantity,Math.max(0,c.materialDailyCap-budget.material)):0;
  const coin=(firstReward?.coin||0)+(repeated?towerRepeatCoin(battle.tier,c,firstTable):0);
  if(coin)items.push({rewardType:'COIN',rewardRef:'COIN',quantity:coin,rewardName:'탑 돌파 코인'});
  if(firstReward?.magicCrystals)items.push({rewardType:'MAGIC_CRYSTAL',rewardRef:'MAGIC_CRYSTAL',quantity:firstReward.magicCrystals,rewardName:'최초 돌파 마력석'});
  if(material)items.push({rewardType:'INVENTORY_ITEM',rewardRef:c.materialCode,quantity:material,rewardName:c.materialName});
  return {policyVersion:c.version,firstClear:first,firstRewardConfigured:Boolean(firstReward),repeatReserved:repeated,eligibleMaterial:eligible,
    materialQuantity:material,rewardedAfter:budget.rewarded+(repeated?1:0),remaining:Math.max(0,c.dailyRewardedClears-budget.rewarded-(repeated?1:0)),rewards:items};
}
