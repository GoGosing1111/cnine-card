export const CORE_REWARD_TYPES = Object.freeze({COIN:'코인',MASTER_STAR:'마스터의 별',MERCENARY:'용병',EQUIPMENT:'장비',INVENTORY_ITEM:'아이템 · 재료',CARD_SHARDS:'카드 조각',MAGIC_CRYSTAL:'마력 결정'});
export const CORE_REWARD_DEFAULT = Object.freeze({version:1,revision:0,enabled:false,minimum:{rewardType:'MASTER_STAR',quantity:null,weight:100},entries:[]});
export const rewardQuantityLimit = type => type==='COIN'?30000000000:['MERCENARY','EQUIPMENT'].includes(type)?10:100000000;
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export function validateCoreRewardPolicy(raw) {
  if(!raw||typeof raw.enabled!=='boolean'||!integer(raw.revision,0,2147483646)||!Array.isArray(raw.entries)||raw.entries.length>200)throw Error('보상 설정 형식을 확인하세요. 후보는 최대 200개입니다.');
  const m=raw.minimum;
  if(!m||!['COIN','MASTER_STAR'].includes(m.rewardType)||!integer(m.weight,1,1000000)||!(m.quantity===null&&!raw.enabled)&&!integer(m.quantity,1,rewardQuantityLimit(m.rewardType)))throw Error('최소 보상은 코인 또는 마스터의 별을 1개 이상 입력하세요.');
  const seen=new Set();
  const entries=raw.entries.map((row,index)=>{
    if(!row||!Object.hasOwn(CORE_REWARD_TYPES,row.rewardType)||typeof row.enabled!=='boolean'||!integer(row.quantity,1,rewardQuantityLimit(row.rewardType))||!integer(row.weight,1,1000000))throw Error(`${index+1}번째 보상의 종류·수량·가중치를 확인하세요. 0개와 꽝은 허용하지 않습니다.`);
    const rewardRef=['MERCENARY','EQUIPMENT','INVENTORY_ITEM'].includes(row.rewardType)?String(row.rewardRef||'').trim():row.rewardType==='MASTER_STAR'?'MASTER_STAR':'';
    if(['MERCENARY','EQUIPMENT','INVENTORY_ITEM'].includes(row.rewardType)&&(!rewardRef||rewardRef.length>100))throw Error(`${index+1}번째 지급 대상을 선택하세요.`);
    const key=`${row.rewardType}:${rewardRef}`;
    if(seen.has(key))throw Error('같은 보상은 한 줄에 설정하세요.');seen.add(key);
    if(row.rewardType===m.rewardType&&m.quantity!==null&&row.quantity<m.quantity)throw Error('코인·마별 후보의 수량은 지정한 같은 재화의 최소 수량 이상이어야 합니다.');
    return {rewardType:row.rewardType,rewardRef,quantity:row.quantity,weight:row.weight,enabled:row.enabled};
  });
  return {version:1,revision:raw.revision,enabled:raw.enabled,minimum:{rewardType:m.rewardType,quantity:m.quantity,weight:m.weight},entries};
}
export function minimumCoreReward(policy) {
  return {rewardType:policy.minimum.rewardType,rewardRef:policy.minimum.rewardType==='MASTER_STAR'?'MASTER_STAR':'',quantity:policy.minimum.quantity,weight:policy.minimum.weight};
}
export function drawCoreRewards(policy,randomInt) {
  policy=validateCoreRewardPolicy(policy);
  if(!policy.enabled)throw Error('추가 보상이 꺼져 있습니다.');
  const pool=[minimumCoreReward(policy),...policy.entries.filter(row=>row.enabled)],total=pool.reduce((sum,row)=>sum+row.weight,0);
  return Array.from({length:3},()=>{
    let n=randomInt(total);if(!integer(n,0,total-1))throw Error('Invalid reward random value');
    const {rewardType,rewardRef,quantity}=pool.find(row=>(n-=row.weight)<0);
    return {rewardType,rewardRef,quantity};
  });
}
