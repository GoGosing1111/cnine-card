// Presentation only. The server still validates and atomically debits resources.
export function forgeResourceShortage(name,required,owned,unit='개'){
 if(required===null||required===undefined||owned===null||owned===undefined)return '';
 const need=Number(required),have=Number(owned);
 if(!Number.isFinite(need)||!Number.isFinite(have)||need<=have)return '';
 const amount=value=>value.toLocaleString('ko-KR')+unit;
 return `${name} 부족: ${amount(need)} 필요 / 보유 ${amount(have)} / ${amount(need-have)} 부족`;
}
export function forgeQuoteShortages(quote,wallet){
 if(quote?.kind!=='ENHANCE'||!wallet)return [];
 const cost=quote.cost;
 return [
  forgeResourceShortage('코인',cost.coinCost,wallet.coins,'코인'),
  cost.itemCode==='MASTER_STAR'?forgeResourceShortage('마스터의 별',cost.itemQuantity,wallet.masterStars):'',
  quote.protectedAttempt?forgeResourceShortage('장비 보호권',cost.protectionQuantity,wallet.protection,'장'):''
 ].filter(Boolean);
}
