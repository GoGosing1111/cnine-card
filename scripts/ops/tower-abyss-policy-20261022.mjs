export const TOWER_ABYSS_BALANCE_VERSION='TOWER_ABYSS_20261022';
export const TOWER_ABYSS_MAX_FLOOR=120;
export const TOWER_ABYSS_POWER_ANCHORS=Object.freeze([[1,10000],[10,30000],[20,50000],[30,250000],[40,1000000],[50,5000000],[60,15000000],[70,30000000],[80,60000000],[90,160000000],[100,400000000],[110,900000000],[120,1800000000]]);
export function towerAbyssPower(floor){
 if(!Number.isSafeInteger(floor)||floor<1||floor>TOWER_ABYSS_MAX_FLOOR)throw Error('Invalid tower floor');
 const right=TOWER_ABYSS_POWER_ANCHORS.findIndex(([f])=>f>=floor);
 if(right===0)return TOWER_ABYSS_POWER_ANCHORS[0][1];
 const [a,x]=TOWER_ABYSS_POWER_ANCHORS[right-1],[b,y]=TOWER_ABYSS_POWER_ANCHORS[right];
 return Math.round(x*Math.pow(y/x,(floor-a)/(b-a))/100)*100;
}
export const towerAbyssRewardMultiplier=floor=>floor<=50?10:floor<=80?15:20;
export function towerAbyssNewReward(floor){
 if(!Number.isSafeInteger(floor)||floor<101||floor>120)throw Error('Invalid new floor');
 return floor===110?600000000000:floor===120?800000000000:floor<110?50000000000:60000000000;
}
// The operation multiplies the captured CMS baseline once. Runtime reads the
// resulting CMS values directly; later CMS edits are never multiplied again.
export function buildTowerAbyssFloorPlan(ranges){
 const current=floor=>ranges.filter(r=>Number(r.start_floor)<=floor&&Number(r.end_floor)>=floor).sort((a,b)=>(Number(a.end_floor)-Number(a.start_floor))-(Number(b.end_floor)-Number(b.start_floor))||Number(b.id)-Number(a.id))[0];
 if(Math.max(...ranges.map(r=>Number(r.end_floor)))!==100)throw Error('Expected current 100-floor tower');
 return Array.from({length:120},(_,i)=>{
  const floor=i+1,old=current(Math.min(floor,100)),monster=floor<=100?old:current(floor%10===0?100:99);
  if(!old||!monster)throw Error('Missing baseline floor');
  return {floor,monsterId:Number(monster.monster_id),boss:floor%10===0?1:Number(monster.is_boss||0),power:towerAbyssPower(floor),coin:floor<=100?Number(old.reward_coin)*towerAbyssRewardMultiplier(floor):towerAbyssNewReward(floor),multiplier:floor<=100?towerAbyssRewardMultiplier(floor):null};
 });
}
