export const SSS_CUBE_STOCK_SCOPE='SSS_MIRACLE_CUBE';
export const SSS_CUBE_LIMITED_CODES=Object.freeze(['V-999','V-989','V-996','V-979','V-973','V-974','V-975','V-978']);
export const sssCubeStockCode=code=>`${SSS_CUBE_STOCK_SCOPE}:${code}`;
export function sssCubeCatalogWithLimits(catalog,limits={}){
 return catalog.map(card=>{
  if(!card.limited||!card.cubeEligible)return card;
  const stockLimit=Object.hasOwn(limits,card.code)?limits[card.code]:card.stockLimit;
  const issued=card.issued??0,prepared=Number.isSafeInteger(stockLimit)&&stockLimit>=issued&&stockLimit>0;
  const remaining=prepared?stockLimit-issued:stockLimit===0?0:null;
  return {...card,stockLimit,issued,remaining,available:prepared&&remaining>0,
   lockReason:!prepared?'큐브 전용 한도를 등록하세요.':remaining===0?'큐브 전용 한정 수량이 소진됐습니다.':''};
 });
}
