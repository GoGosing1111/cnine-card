export const LIMITED_SHARD=Object.freeze({code:'MERCENARY_SSS_LIMITED_SHARD',name:'SSS 리미티드 조각',subtitle:'SSS LIMITED MERCENARY SHARD',description:'SSS 리미티드 용병을 위한 별도 보관용 재료입니다. 교환 방법과 필요 수량은 추후 안내됩니다.',category:'MATERIAL',rarity:'SSS',image:'assets/items/sss-limited-shard-20261020/item.webp',sortOrder:174903});
export const SUPPORT_PACKAGE_UNIT=Object.freeze({code:'SEASON_PASS_PACKAGE_20261020',name:'리버스콜 코인 패키지',priceWon:49800,coins:100000000000000,coinImage:'assets/ui/icon-fusion-20261004/coin.webp',items:Object.freeze([
  Object.freeze({code:'EMPEROR_ENERGY',name:'엠퍼러 에너지',quantity:200,image:'assets/items/emperor-energy-v1.webp'}),
  Object.freeze({code:LIMITED_SHARD.code,name:LIMITED_SHARD.name,quantity:5,image:LIMITED_SHARD.image})
])});
// Keep one package immutable for historical receipts and explicitly authorized extras.
export const SUPPORT_PACKAGE=Object.freeze({...SUPPORT_PACKAGE_UNIT,
  packageQuantity:2,eventCode:'SUPPORT_PACKAGE_BOGO_20261025',eventLabel:'1+1 이벤트',
  coins:SUPPORT_PACKAGE_UNIT.coins*2,
  items:Object.freeze(SUPPORT_PACKAGE_UNIT.items.map(item=>Object.freeze({...item,quantity:item.quantity*2})))
});
// Display metadata stays outside immutable order/fulfillment products.
export const SUPPORT_PACKAGE_EVENT_DEADLINE=Object.freeze({
  eventCode:'SUPPORT_PACKAGE_BOGO_20261025',endsAt:'2026-10-27T00:00:00+09:00',
  label:'10월 27일 00:00 종료',detail:'10월 26일에서 27일로 넘어가는 자정 · 한국시간',
  notice:'1+1 이벤트 종료: 2026년 10월 27일 00:00 (한국시간)\n10월 26일에서 27일로 넘어가는 자정'
});
export const supportPackageEventDeadline=product=>product?.eventCode===SUPPORT_PACKAGE_EVENT_DEADLINE.eventCode?SUPPORT_PACKAGE_EVENT_DEADLINE:null;
export const SUPPORT_PACKAGE_SALES_ENDS_AT=Date.parse(SUPPORT_PACKAGE_EVENT_DEADLINE.endsAt);
export const supportPackageSalesOpen=(now=Date.now())=>Number.isFinite(now)&&now<SUPPORT_PACKAGE_SALES_ENDS_AT;
export const isSupportPackageProduct=product=>[SUPPORT_PACKAGE_UNIT,SUPPORT_PACKAGE].some(known=>JSON.stringify(product)===JSON.stringify(known));
export const supportPackageSummary=product=>`${product.coins/1000000000000}조 코인 · ${product.items.map(item=>`${item.name} ${item.quantity}개`).join(' · ')}`;
