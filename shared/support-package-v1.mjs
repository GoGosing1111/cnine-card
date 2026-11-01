import {FORGE_SCROLL_ITEMS} from './equipment-forge-advanced-v1.mjs';
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
export const SUPPORT_PACKAGE_NOVEMBER_UNIT=Object.freeze({...SUPPORT_PACKAGE_UNIT,code:'SEASON_PASS_PACKAGE_20261101',coins:200000000000000});
export const SUPPORT_PACKAGE_NOVEMBER_BOGO=Object.freeze({...SUPPORT_PACKAGE_NOVEMBER_UNIT,
  packageQuantity:2,eventCode:'SUPPORT_PACKAGE_BOGO_20261101',eventLabel:'1+1 이벤트',
  coins:SUPPORT_PACKAGE_NOVEMBER_UNIT.coins*2,
  items:Object.freeze(SUPPORT_PACKAGE_NOVEMBER_UNIT.items.map(item=>Object.freeze({...item,quantity:item.quantity*2})))
});
export const SUPPORT_PACKAGE_SCROLLS_400_UNIT=Object.freeze({...SUPPORT_PACKAGE_NOVEMBER_UNIT,code:'SEASON_PASS_PACKAGE_20261101_SCROLLS',items:Object.freeze([
  ...SUPPORT_PACKAGE_NOVEMBER_UNIT.items,...FORGE_SCROLL_ITEMS.map(({code,name,image})=>Object.freeze({code,name,quantity:5,image}))
])});
export const SUPPORT_PACKAGE_SCROLLS_400_BOGO=Object.freeze({...SUPPORT_PACKAGE_SCROLLS_400_UNIT,
  packageQuantity:2,eventCode:'SUPPORT_PACKAGE_BOGO_20261101',eventLabel:'1+1 이벤트',
  coins:SUPPORT_PACKAGE_SCROLLS_400_UNIT.coins*2,
  items:Object.freeze(SUPPORT_PACKAGE_SCROLLS_400_UNIT.items.map(item=>Object.freeze({...item,quantity:item.quantity*2})))
});
export const SUPPORT_PACKAGE_CURRENT_UNIT=Object.freeze({...SUPPORT_PACKAGE_SCROLLS_400_UNIT,code:'SEASON_PASS_PACKAGE_20261101_500T',coins:250000000000000});
export const SUPPORT_PACKAGE=Object.freeze({...SUPPORT_PACKAGE_CURRENT_UNIT,
  packageQuantity:2,eventCode:'SUPPORT_PACKAGE_BOGO_20261101',eventLabel:'1+1 이벤트',
  coins:SUPPORT_PACKAGE_CURRENT_UNIT.coins*2,
  items:Object.freeze(SUPPORT_PACKAGE_CURRENT_UNIT.items.map(item=>Object.freeze({...item,quantity:item.quantity*2})))
});
// Display metadata stays outside immutable order/fulfillment products.
export const SUPPORT_PACKAGE_EVENT_DEADLINE=Object.freeze({
  eventCode:'SUPPORT_PACKAGE_BOGO_20261101',endsAt:'2026-11-03T00:00:00+09:00',
  label:'11월 3일 00:00 판매 종료',detail:'11월 2일에서 3일로 넘어가는 자정 · 한국시간',
  notice:'1+1 패키지 판매 종료: 2026년 11월 3일 00:00 (한국시간)\n11월 2일에서 3일로 넘어가는 자정'
});
export const supportPackageEventDeadline=product=>product?.eventCode===SUPPORT_PACKAGE_EVENT_DEADLINE.eventCode?SUPPORT_PACKAGE_EVENT_DEADLINE:null;
export const SUPPORT_PACKAGE_SALES_ENDS_AT=Date.parse(SUPPORT_PACKAGE_EVENT_DEADLINE.endsAt);
export const supportPackageSalesOpen=(now=Date.now())=>Number.isFinite(now)&&now<SUPPORT_PACKAGE_SALES_ENDS_AT;
const sameProduct=(product,known)=>JSON.stringify(product)===JSON.stringify(known);
const novemberProducts=[SUPPORT_PACKAGE,SUPPORT_PACKAGE_NOVEMBER_BOGO,SUPPORT_PACKAGE_SCROLLS_400_BOGO];
export const isSupportPackageProduct=product=>[SUPPORT_PACKAGE_UNIT,SUPPORT_PACKAGE_LEGACY_BOGO,...novemberProducts].some(known=>sameProduct(product,known));
export const supportPackageFulfillment=product=>novemberProducts.find(known=>sameProduct(product,known))||([SUPPORT_PACKAGE_UNIT,SUPPORT_PACKAGE_LEGACY_BOGO].some(known=>sameProduct(product,known))?SUPPORT_PACKAGE_LEGACY_BOGO:null);
export const SUPPORT_PACKAGE_MAX_QUANTITY=100;
export const supportPackageQuantityValid=n=>Number.isInteger(n)&&n>=1&&n<=SUPPORT_PACKAGE_MAX_QUANTITY;
export function supportPackageOrderProduct(order){
  let product=supportPackageFulfillment(order?.product);const quantity=order?.quantity??1;
  if(!product||!supportPackageQuantityValid(quantity)||!novemberProducts.includes(product)&&quantity!==1)return null;
  // The 500-trillion increase also applies when an existing November application is paid.
  // Preserve the application snapshot, other items and completed/rejected historical terms.
  if(novemberProducts.includes(product)&&(!order?.status||order.status==='PENDING'))product={...product,coins:SUPPORT_PACKAGE.coins};
  if(quantity===1)return product;
  const coins=BigInt(product.coins)*BigInt(quantity);
  return {...product,purchaseQuantity:quantity,priceWon:product.priceWon*quantity,packageQuantity:product.packageQuantity*quantity,
    coins:coins<=BigInt(Number.MAX_SAFE_INTEGER)?Number(coins):coins.toString(),items:product.items.map(item=>({...item,quantity:item.quantity*quantity}))};
}
export function supportPackageClientAllowed(request){
  const agent=request.headers.get('user-agent')||'';
  // Direct Windows/Android clients, browsers and installed PWAs share this offer.
  // The separately distributed ONE store edition remains excluded.
  if(/ReverseCallStore\//i.test(agent))return false;
  try{if(new URL(request.headers.get('referer')).pathname.match(/^\/onestore(?:\/|$)/))return false;}catch{}
  return true;
}
export const supportPackageSummary=product=>`${product.coins/1000000000000}조 코인 · ${product.items.map(item=>`${item.name} ${item.quantity}개`).join(' · ')}`;
