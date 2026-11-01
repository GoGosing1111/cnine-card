import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const TOWER_EXPANSION_VERSION='TOWER_121_150_20261102';
export const TOWER_EXPANSION_OPERATION='ops:tower-121-150:20261102:v1';
export const TOWER_EXPANSION_MAX=150;
export const TOWER_EXPANSION_ASSUMPTIONS=Object.freeze({regularCards:5,mercenaries:2,level:21,breakthroughMask:15,sssLimit:1,ssLimit:1});
export const TOWER_EXPANSION_ANCHORS=Object.freeze([[120,1800000000],[130,3000000000],[140,5200000000],[150,9000000000]].map(Object.freeze));
export const towerExpansionHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validFloor=floor=>assert(Number.isSafeInteger(floor)&&floor>=121&&floor<=150,'Expected a new floor between 121 and 150');

export function towerExpansionPower(floor){
 validFloor(floor);
 const right=TOWER_EXPANSION_ANCHORS.findIndex(([at])=>at>=floor);
 const [a,x]=TOWER_EXPANSION_ANCHORS[right-1],[b,y]=TOWER_EXPANSION_ANCHORS[right];
 return Math.round(x*Math.pow(y/x,(floor-a)/(b-a))/100)*100;
}

// Match the existing milestone economy. Ordinary floors and each tenth-floor
// guardian have separate increasing curves; no multiplier runs in the game API.
export function towerExpansionCoin(floor,{ordinaryCoin,bossCoin}){
 validFloor(floor);
 for(const value of [ordinaryCoin,bossCoin])assert(Number.isSafeInteger(value)&&value>0,'Invalid captured coin reward');
 const band=Math.ceil((floor-120)/10),boss=floor%10===0,offset=(floor-121)%10;
 const numerator=BigInt(boss?bossCoin:ordinaryCoin)*13n**BigInt(band)*BigInt(boss?100:100+3*offset);
 const denominator=10n**BigInt(band)*100n;
 assert.equal(numerator%denominator,0n,'Reward must be an exact integer');
 const coin=Number(numerator/denominator);
 assert(Number.isSafeInteger(coin)&&coin>0,'Reward exceeds the safe integer range');
 return coin;
}

export function buildTowerExpansionPlan({before,monsters}){
 assert.equal(before.season.status,'ACTIVE');
 assert.equal(Number(before.season.max_floor),120,'Expected the reviewed 120-floor tower');
 assert.equal(before.floors.length,0,'Unexpected individual-floor overrides');
 const rows=[...before.ranges].sort((a,b)=>Number(a.start_floor)-Number(b.start_floor));
 assert.equal(rows.length,120,'Expected exactly 120 active floors');
 rows.forEach((r,i)=>{
  assert.equal(Number(r.start_floor),i+1,'Missing or overlapping floor');assert.equal(Number(r.end_floor),i+1);
  assert.equal(Number(r.is_active),1);assert.equal(Number(r.season_id),Number(before.season.id));
  assert(Number.isSafeInteger(Number(r.reward_coin))&&Number(r.reward_coin)>0);
 });
 assert.equal(Number(rows[119].power_override),TOWER_EXPANSION_ANCHORS[0][1],'Rebalance against the changed floor 120 power first');
 assert.equal(Number(rows[118].is_boss),0);assert.equal(Number(rows[119].is_boss),1);
 const rewards={ordinaryCoin:Number(rows[118].reward_coin),bossCoin:Number(rows[119].reward_coin)};
 const families=[[64,67],[68,69],[17,18]];
 for(const id of families.flat())assert(monsters.some(m=>Number(m.id)===id&&Number(m.is_active)===1&&Number(m.tower_enabled)===1),'Required tower monster is unavailable: '+id);
 const floors=Array.from({length:30},(_,i)=>{
  const floor=121+i,boss=floor%10===0,family=families[Math.floor(i/10)];
  return {floor,monsterId:family[boss?1:0],boss:Number(boss),power:towerExpansionPower(floor),coin:towerExpansionCoin(floor,rewards)};
 });
 return {version:TOWER_EXPANSION_VERSION,operationKey:TOWER_EXPANSION_OPERATION,seasonId:Number(before.season.id),
  assumptions:TOWER_EXPANSION_ASSUMPTIONS,baseline:rewards,preservedFloors:120,maxFloor:150,floors,
  totalCoin:floors.reduce((sum,r)=>sum+r.coin,0),progressReset:false,retroactiveGrant:false,accountWrites:0};
}
