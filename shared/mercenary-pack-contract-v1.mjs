// The existing shop's Hyper pack is the mercenary pack. Its published price
// and four reward kinds are shared by the shop, account screen and API.
export const MERCENARY_PACK = Object.freeze({
  id:'hyper',name:'하이퍼팩',price:500000000,maxCount:10,
  openPath:'mercenary-cards/open',batchPath:'mercenary-cards/open-batch',
  receiptPath:'mercenaries/v3/receipt',statePath:'mercenaries/v3/state',
  featurePath:'mercenary-cards/feature',accountUrl:'/mercenary-hangar/',
});
export function mercenaryPackResults(receipt){
  if(receipt?.status!=='COMPLETED'||typeof receipt.requestId!=='string'||!Array.isArray(receipt.draws)||receipt.draws.length<1||receipt.draws.length>MERCENARY_PACK.maxCount)throw Error('확정된 개봉 결과가 필요합니다.');
  return receipt.draws.map((row,index)=>{
    const kind=row.mercenaryCode?'MERCENARY':row.outcomeId==='NONE'?'MISS':row.outcomeId;
    if(!['MERCENARY','MISS','MASTER_STAR','MYSTIC_ENERGY'].includes(kind))throw Error('개봉 보상 종류를 확인하세요.');
    // The released Omega-X source art is JPEG. Rejecting it traps a completed
    // receipt in local pending state, blocking every later opening on that client.
    if(kind==='MERCENARY'&&(!/^V-\d{3}$/.test(row.mercenaryCode)||!['C','B','A','S','SS','SSS'].includes(row.rank)||!/^\/?assets\/ui\/project-v\/mercenaries\/[A-Za-z0-9_./-]+\.(png|webp|jpe?g)$/.test(row.sourceArt||'')))throw Error('용병 원화와 등급을 확인하세요.');
    if(kind==='MERCENARY'&&(row.sourceArt.split('/').includes('..')||typeof row.name!=='string'||!row.name.trim()||typeof row.duplicate!=='boolean'||!Number.isSafeInteger(row.duplicateCount)||row.duplicateCount<0))throw Error('용병 계약 결과를 확인하세요.');
    if(['MASTER_STAR','MYSTIC_ENERGY'].includes(kind)&&(!Number.isSafeInteger(row.quantity)||row.quantity<1))throw Error('확정 보상 수량을 확인하세요.');
    return {...row,kind,index,receiptId:receipt.requestId,preview:false,granted:true};
  });
}
