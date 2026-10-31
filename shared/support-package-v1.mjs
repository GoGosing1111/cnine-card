export const LIMITED_SHARD=Object.freeze({code:'MERCENARY_SSS_LIMITED_SHARD',name:'SSS 리미티드 조각',subtitle:'SSS LIMITED MERCENARY SHARD',description:'SSS 리미티드 용병을 위한 별도 보관용 재료입니다. 교환 방법과 필요 수량은 추후 안내됩니다.',category:'MATERIAL',rarity:'SSS',image:'assets/items/sss-limited-shard-20261020/item.webp',sortOrder:174903});
export const SUPPORT_PACKAGE_UNIT=Object.freeze({code:'SEASON_PASS_PACKAGE_20261020',name:'리버스콜 코인 패키지',priceWon:49800,coins:100000000000000,coinImage:'assets/ui/icon-fusion-20261004/coin.webp',items:Object.freeze([
  Object.freeze({code:'EMPEROR_ENERGY',name:'엠퍼러 에너지',quantity:200,image:'assets/items/emperor-energy-v1.webp'}),
  Object.freeze({code:LIMITED_SHARD.code,name:LIMITED_SHARD.name,quantity:5,image:LIMITED_SHARD.image})
])});
// Keep one package immutable for historical receipts and explicitly authorized extras.
export const SUPPORT_PACKAGE_LEGACY_BOGO=Object.freeze({...SUPPORT_PACKAGE_UNIT,
  packageQuantity:2,eventCode:'SUPPORT_PACKAGE_BOGO_20261025',eventLabel:'1+1 이벤트',
  coins:SUPPORT_PACKAGE_UNIT.coins*2,
  items:Object.freeze(SUPPORT_PACKAGE_UNIT.items.map(item=>Object.freeze({...item,quantity:item.quantity*2})))
});
// November orders have their own product snapshot. Completed and pending older orders keep their terms.
export const SUPPORT_PACKAGE_CURRENT_UNIT=Object.freeze({...SUPPORT_PACKAGE_UNIT,code:'SEASON_PASS_PACKAGE_20261101',coins:200000000000000});
export const SUPPORT_PACKAGE=Object.freeze({...SUPPORT_PACKAGE_CURRENT_UNIT,
  packageQuantity:2,eventCode:'SUPPORT_PACKAGE_BOGO_20261101',eventLabel:'1+1 이벤트',
  coins:SUPPORT_PACKAGE_CURRENT_UNIT.coins*2,
  items:Object.freeze(SUPPORT_PACKAGE_CURRENT_UNIT.items.map(item=>Object.freeze({...item,quantity:item.quantity*2})))
});
// Display metadata stays outside immutable order/fulfillment products.
export const SUPPORT_PACKAGE_EVENT_DEADLINE=Object.freeze({
  eventCode:'SUPPORT_PACKAGE_BOGO_20261101',endsAt:'2026-11-03T00:00:00+09:00',
  label:'11월 3일 00:00 판매 종료',detail:'11월 2일에서 3일로 넘어가는 자정 · 한국시간',
  notice:'웹 전용 1+1 패키지 판매 종료: 2026년 11월 3일 00:00 (한국시간)\n11월 2일에서 3일로 넘어가는 자정'
});
export const supportPackageEventDeadline=product=>product?.eventCode===SUPPORT_PACKAGE_EVENT_DEADLINE.eventCode?SUPPORT_PACKAGE_EVENT_DEADLINE:null;
export const SUPPORT_PACKAGE_SALES_ENDS_AT=Date.parse(SUPPORT_PACKAGE_EVENT_DEADLINE.endsAt);
export const supportPackageSalesOpen=(now=Date.now())=>Number.isFinite(now)&&now<SUPPORT_PACKAGE_SALES_ENDS_AT;
const sameProduct=(product,known)=>JSON.stringify(product)===JSON.stringify(known);
export const isSupportPackageProduct=product=>[SUPPORT_PACKAGE_UNIT,SUPPORT_PACKAGE_LEGACY_BOGO,SUPPORT_PACKAGE].some(known=>sameProduct(product,known));
export const supportPackageFulfillment=product=>sameProduct(product,SUPPORT_PACKAGE)?SUPPORT_PACKAGE:[SUPPORT_PACKAGE_UNIT,SUPPORT_PACKAGE_LEGACY_BOGO].some(known=>sameProduct(product,known))?SUPPORT_PACKAGE_LEGACY_BOGO:null;
export function supportPackageWebRequest(request){
  const agent=request.headers.get('user-agent')||'';
  if(/ReverseCallAndroid\/|Reversecall\/|ReverseCallStore\/|Electron\/|;\s*wv\)/i.test(agent))return false;
  try{if(new URL(request.headers.get('referer')).pathname.match(/^\/onestore(?:\/|$)/))return false;}catch{}
  return true;
}
export const supportPackageSummary=product=>`${product.coins/1000000000000}조 코인 · ${product.items.map(item=>`${item.name} ${item.quantity}개`).join(' · ')}`;
