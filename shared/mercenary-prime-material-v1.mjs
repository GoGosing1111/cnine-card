// The Bloodmoon V-975 probability/stock slot awards an inventory material.
// Existing completed mercenary receipts and owned Prime cards remain unchanged.
export const PRIME_MATERIAL=Object.freeze({
 code:'MERCENARY_PRIME_DEPLETED_CARD',name:'기운잃은 프라임 카드',subtitle:'DEPLETED PRIME CARD',
 description:'블러드문팩에서 획득하는 프라임 레퀴엠 제작 재료입니다. 필요 수량·성공률·추가 비용은 추후 결정되며 현재 제작은 잠겨 있습니다.',
 category:'MATERIAL',rarity:'SSS',image:'assets/items/prime-depleted-20261025/card.webp',sortOrder:174904
});
export const PRIME_MATERIAL_STOCK_CODE='V-975';
export const PRIME_CRAFT_RELEASE_ENABLED=false;
export const bloodmoonDrawCode=draw=>draw?.stockCode||draw?.mercenaryCode;
export const isPrimeMaterialDraw=draw=>draw?.kind==='ITEM'&&draw.itemCode===PRIME_MATERIAL.code&&draw.stockCode===PRIME_MATERIAL_STOCK_CODE&&!draw.mercenaryCode&&draw.quantity===1&&draw.rank==='SSS';
export function primeMaterialDraw(draw){
 const {mercenaryCode,...rest}=draw;
 return {...rest,kind:'ITEM',stockCode:PRIME_MATERIAL_STOCK_CODE,itemCode:PRIME_MATERIAL.code,name:PRIME_MATERIAL.name,sourceArt:PRIME_MATERIAL.image};
}
