import {FORGE_SCROLL_ITEMS} from './equipment-forge-advanced-v1.mjs';
// Only the refreshed November 6 offer participates. Each paid purchase counts
// once (the promotional 1+1 package count is not a purchase count).
export const SUPPORT_PACKAGE_BONUS_CODE='SUPPORT_PACKAGE_PURCHASE_BONUS_20261106_V1';
export const SUPPORT_PACKAGE_BONUS_TIERS=Object.freeze([
  [1,200],[2,400],[3,500],[4,1000],[5,2000],[10,8000]
].map(([purchases,trillions])=>Object.freeze({purchases,coins:String(BigInt(trillions)*1000000000000n)})));
export const supportPackageBonusKey=userId=>'support_package_bonus_20261106_v1:'+Number(userId);
export const packageCoinValue=coins=>coins<=BigInt(Number.MAX_SAFE_INTEGER)?Number(coins):coins.toString();
export function supportPackageBonus(paidPurchases=0,quantity=0){
  if(!Number.isSafeInteger(paidPurchases)||paidPurchases<0||!Number.isInteger(quantity)||quantity<0||quantity>100||!Number.isSafeInteger(paidPurchases+quantity))throw Error('Invalid package purchase count');
  const after=paidPurchases+quantity,milestones=SUPPORT_PACKAGE_BONUS_TIERS.filter(t=>t.purchases>paidPurchases&&t.purchases<=after);
  return {policyCode:SUPPORT_PACKAGE_BONUS_CODE,paidPurchasesBefore:paidPurchases,paidPurchasesAfter:after,
    milestones,coins:milestones.reduce((sum,t)=>sum+BigInt(t.coins),0n).toString(),
    totalEarnedCoins:SUPPORT_PACKAGE_BONUS_TIERS.filter(t=>t.purchases<=after).reduce((sum,t)=>sum+BigInt(t.coins),0n).toString()};
}
export function supportPackageWithBonus(product,paidPurchases=0){
  if(product?.bonusPolicy!==SUPPORT_PACKAGE_BONUS_CODE)return product;
  const purchaseBonus=supportPackageBonus(paidPurchases,product.purchaseQuantity??1);
  return {...product,baseCoins:product.coins,coins:packageCoinValue(BigInt(product.coins)+BigInt(purchaseBonus.coins)),purchaseBonus};
}
export const supportPackageBonusSummary=bonus=>bonus?`누적 ${bonus.paidPurchasesBefore} → ${bonus.paidPurchasesAfter}회 · 이번 구매 보너스 ${BigInt(bonus.coins)/1000000000000n}조 코인`:'';
export const supportPackageItemQuantity=n=>n>=100000000&&n%100000000===0?`${n/100000000}억`:Number(n).toLocaleString('ko-KR');
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
export const SUPPORT_PACKAGE_500T_BOGO=Object.freeze({...SUPPORT_PACKAGE_CURRENT_UNIT,
  packageQuantity:2,eventCode:'SUPPORT_PACKAGE_BOGO_20261101',eventLabel:'1+1 이벤트',
  coins:SUPPORT_PACKAGE_CURRENT_UNIT.coins*2,
  items:Object.freeze(SUPPORT_PACKAGE_CURRENT_UNIT.items.map(item=>Object.freeze({...item,quantity:item.quantity*2})))
});
// These are the TOTAL rewards for one 49,800-won purchase, including 1+1.
// Define integer totals directly: five scrolls must never be doubled or halved.
export const SUPPORT_PACKAGE=Object.freeze({...SUPPORT_PACKAGE_UNIT,
  code:'SEASON_PASS_PACKAGE_20261106',packageQuantity:2,eventCode:'SUPPORT_PACKAGE_BOGO_20261106',eventLabel:'1+1 이벤트',
  coins:500000000000000,bonusPolicy:SUPPORT_PACKAGE_BONUS_CODE,items:Object.freeze([
    Object.freeze({code:'MASTER_STAR',name:'마스터의 별',quantity:1000000000,image:'assets/ui/icon-fusion-20261004/master-star.webp'}),
    Object.freeze({code:'SUIT_CORE_7',name:'슈트 코어 7',quantity:10,image:'assets/items/suit-core-7-20261006.png'}),
    ...FORGE_SCROLL_ITEMS.map(({code,name,image})=>Object.freeze({code,name,quantity:5,image})),
    Object.freeze({code:LIMITED_SHARD.code,name:LIMITED_SHARD.name,quantity:10,image:LIMITED_SHARD.image})
  ])
});
// Display metadata stays outside immutable order/fulfillment products.
const NOVEMBER_LEGACY_DEADLINE=Object.freeze({
  eventCode:'SUPPORT_PACKAGE_BOGO_20261101',endsAt:'2026-11-04T00:00:00+09:00',
  label:'11월 4일 00:00 판매 종료',detail:'11월 3일에서 4일로 넘어가는 자정 · 한국시간',
  notice:'1+1 패키지 판매 종료: 2026년 11월 4일 00:00 (한국시간)\n11월 3일에서 4일로 넘어가는 자정'
});
export const SUPPORT_PACKAGE_EVENT_DEADLINE=Object.freeze({
  eventCode:'SUPPORT_PACKAGE_BOGO_20261106',endsAt:'2026-11-09T00:00:00+09:00',
  label:'11월 9일 00:00 판매 종료',detail:'11월 8일에서 9일로 넘어가는 자정 · 한국시간',
  notice:'1+1 패키지 판매 종료: 2026년 11월 9일 00:00 (한국시간)\n11월 8일에서 9일로 넘어가는 자정'
});
export const supportPackageEventDeadline=product=>[SUPPORT_PACKAGE_EVENT_DEADLINE,NOVEMBER_LEGACY_DEADLINE].find(d=>d.eventCode===product?.eventCode)||null;
export const SUPPORT_PACKAGE_SALES_ENDS_AT=Date.parse(SUPPORT_PACKAGE_EVENT_DEADLINE.endsAt);
export const supportPackageSalesOpen=(now=Date.now())=>Number.isFinite(now)&&now<SUPPORT_PACKAGE_SALES_ENDS_AT;
const sameProduct=(product,known)=>JSON.stringify(product)===JSON.stringify(known);
const novemberProducts=[SUPPORT_PACKAGE_500T_BOGO,SUPPORT_PACKAGE_NOVEMBER_BOGO,SUPPORT_PACKAGE_SCROLLS_400_BOGO];
const quantityProducts=[SUPPORT_PACKAGE,...novemberProducts];
export const isSupportPackageProduct=product=>[SUPPORT_PACKAGE_UNIT,SUPPORT_PACKAGE_LEGACY_BOGO,...quantityProducts].some(known=>sameProduct(product,known));
export const supportPackageFulfillment=product=>quantityProducts.find(known=>sameProduct(product,known))||([SUPPORT_PACKAGE_UNIT,SUPPORT_PACKAGE_LEGACY_BOGO].some(known=>sameProduct(product,known))?SUPPORT_PACKAGE_LEGACY_BOGO:null);
export const SUPPORT_PACKAGE_MAX_QUANTITY=100;
export const supportPackageQuantityValid=n=>Number.isInteger(n)&&n>=1&&n<=SUPPORT_PACKAGE_MAX_QUANTITY;
export function supportPackageOrderProduct(order){
  let product=supportPackageFulfillment(order?.product);const quantity=order?.quantity??1;
  if(!product||!supportPackageQuantityValid(quantity)||!quantityProducts.includes(product)&&quantity!==1)return null;
  // The 500-trillion increase also applies when an existing November application is paid.
  // Preserve the application snapshot, other items and completed/rejected historical terms.
  if(novemberProducts.includes(product)&&(!order?.status||order.status==='PENDING'))product={...product,coins:SUPPORT_PACKAGE_500T_BOGO.coins};
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
export const supportPackageSummary=product=>`${product.coins/1000000000000}조 코인${product.purchaseBonus?` (기본 ${product.baseCoins/1000000000000}조 + 보너스 ${BigInt(product.purchaseBonus.coins)/1000000000000n}조)` : ''} · ${product.items.map(item=>`${item.name} ${product.bonusPolicy?supportPackageItemQuantity(item.quantity):item.quantity}개`).join(' · ')}${product.purchaseBonus?' · '+supportPackageBonusSummary(product.purchaseBonus):''}`;
