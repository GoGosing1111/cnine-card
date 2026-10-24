export const ULTIMATE_BULK = Object.freeze({min:1000,max:100000,step:100,block:100,format:'ULTIMATE_BULK_V1',receiptPack:'ultimate-bulk',maxAgeMs:86400000});
export function ultimateBulkCount(value){
  if(!Number.isSafeInteger(value)||value<ULTIMATE_BULK.min||value>ULTIMATE_BULK.max||value%ULTIMATE_BULK.step)throw Error('1,000~100,000장을 100장 단위로 입력하세요.');
  return value;
}
export function ultimateBulkCost(price,count){
  ultimateBulkCount(count);const cost=Number(price)*count;
  if(!Number.isSafeInteger(Number(price))||Number(price)<=0||!Number.isSafeInteger(cost))throw Error('카드팩 가격을 확인하세요.');
  return cost;
}
export const ultimateBulkKey=userId=>'cnine:ultimate-bulk:v1:'+userId;
export const ultimateBulkRequestId=(now=Date.now())=>'ult-'+now+'-'+crypto.randomUUID();
export function validateUltimateBulkReceipt(receipt,{requestId,userId,count}={}){
  if(receipt?.format!==ULTIMATE_BULK.format||receipt.status!=='COMPLETED'||receipt.packId!=='ultimate'||!Array.isArray(receipt.results))throw Error('일괄 개봉 결과를 확인하지 못했습니다.');
  ultimateBulkCount(receipt.count);
  if((requestId&&receipt.requestId!==requestId)||(userId&&Number(receipt.userId)!==Number(userId))||(count&&receipt.count!==count))throw Error('개봉 요청과 결과가 일치하지 않습니다.');
  const ids=new Set();let total=0,shards=0,stars=0;
  for(const row of receipt.results){
    if(!row?.card?.id||ids.has(String(row.card.id))||!Number.isSafeInteger(row.count)||row.count<1||!Number.isSafeInteger(row.quantityBefore)||row.quantityBefore<0||row.quantityAfter!==row.quantityBefore+row.count||row.duplicateCount!==row.count-(row.quantityBefore===0?1:0)||!Number.isSafeInteger(row.shardGained)||row.shardGained<0||!Number.isSafeInteger(row.masterStarGained)||row.masterStarGained<0)throw Error('지급 수량을 확인하지 못했습니다.');
    ids.add(String(row.card.id));total+=row.count;shards+=row.shardGained;stars+=row.masterStarGained;
  }
  if(total!==receipt.count||shards!==receipt.shardTotal||stars!==receipt.masterStarTotal||receipt.cost!==ultimateBulkCost(receipt.unitPrice,receipt.count)||receipt.coinAfter!==receipt.coinBefore-receipt.cost||receipt.coinAfter<0)throw Error('결제·지급 합계가 일치하지 않습니다.');
  return receipt;
}
