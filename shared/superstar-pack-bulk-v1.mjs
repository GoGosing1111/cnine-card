export const SUPERSTAR_BULK=Object.freeze({counts:Object.freeze([1000,10000]),format:'SUPERSTAR_BULK_V1',maxAgeMs:86400000});
export function superstarBulkCost(price,count){
  const cost=Number(price)*count;
  if(!SUPERSTAR_BULK.counts.includes(count))throw Error('슈퍼스타팩은 1,000회 또는 10,000회 빠른 개봉을 선택하세요.');
  if(!Number.isSafeInteger(Number(price))||Number(price)<=0||!Number.isSafeInteger(cost))throw Error('카드팩 가격을 확인하세요.');
  return cost;
}
export const superstarBulkKey=userId=>'cnine:superstar-bulk:v1:'+userId;
export const superstarBulkRequestId=(now=Date.now())=>'ssb-'+now+'-'+crypto.randomUUID();
export function validateSuperstarBulkReceipt(receipt,{requestId,userId,count}={}){
  if(receipt?.format!==SUPERSTAR_BULK.format||receipt.drawProtocol?.status!=='COMPLETED'||receipt.packId!=='superstar'||!Array.isArray(receipt.results))throw Error('슈퍼스타 일괄 개봉 결과를 확인하지 못했습니다.');
  if((requestId&&receipt.requestId!==requestId)||(userId&&Number(receipt.userId)!==Number(userId))||(count&&receipt.count!==count))throw Error('개봉 요청과 결과가 일치하지 않습니다.');
  const cost=superstarBulkCost(receipt.unitPrice,receipt.count),ids=new Set();let hits=0,shards=0;
  for(const row of receipt.results){
    if(!row?.hit||row.card?.grade!=='SUPERSTAR'||!row.card.id||ids.has(String(row.card.id))||!Number.isSafeInteger(row.count)||row.count<1||!Number.isSafeInteger(row.quantityBefore)||row.quantityBefore<0||row.quantityAfter!==row.quantityBefore+row.count||row.duplicateCount!==row.count-(row.quantityBefore===0?1:0)||row.shardGained!==row.duplicateCount*600)throw Error('슈퍼스타 지급 수량을 확인하지 못했습니다.');
    ids.add(String(row.card.id));hits+=row.count;shards+=row.shardGained;
  }
  if(hits!==receipt.hitCount||!Number.isSafeInteger(receipt.missCount)||receipt.missCount<0||hits+receipt.missCount!==receipt.count||shards!==receipt.shardGained||receipt.cost!==cost||!Number.isSafeInteger(receipt.coinBefore)||receipt.coinAfter!==receipt.coinBefore-cost||receipt.coinAfter<0)throw Error('결제·당첨·꽝 합계가 일치하지 않습니다.');
  if(receipt.currentQuantities!==undefined&&(!receipt.currentQuantities||Array.isArray(receipt.currentQuantities)||[...ids].some(id=>!Number.isSafeInteger(receipt.currentQuantities[id])||receipt.currentQuantities[id]<0)))throw Error('현재 보유 수량을 확인하지 못했습니다.');
  return receipt;
}
