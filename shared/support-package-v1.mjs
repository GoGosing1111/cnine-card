import {FORGE_SCROLL_ITEMS} from './equipment-forge-advanced-v1.mjs';
// Each campaign has its own progress key; old orders continue using their purchase terms.
export const SUPPORT_PACKAGE_BONUS_CODE='SUPPORT_PACKAGE_PURCHASE_BONUS_20261121_V1';
export const SUPPORT_PACKAGE_NOVEMBER15_BONUS_CODE='SUPPORT_PACKAGE_PURCHASE_BONUS_20261115_V1';
export const SUPPORT_PACKAGE_LEGACY_BONUS_CODE='SUPPORT_PACKAGE_PURCHASE_BONUS_20261106_V1';
const bonusTiers=tiers=>Object.freeze(tiers.map(([purchases,trillions,cubes])=>Object.freeze({purchases,coins:String(BigInt(trillions)*1000000000000n),...(cubes===undefined?{}:{cubes})})));
const legacyBonusTiers=bonusTiers([[1,200],[2,400],[3,500],[4,1000],[5,2000],[10,8000]]);
const november15BonusTiers=bonusTiers([[1,1000,5],[2,2000,10],[3,3000,15],[4,6000,20],[5,8000,40],[10,8000,100]]);
const masterStarsByPurchase={1:5_000_000_000,2:10_000_000_000,3:20_000_000_000,4:40_000_000_000,5:80_000_000_000,10:100_000_000_000};
export const SUPPORT_PACKAGE_BONUS_TIERS=Object.freeze(november15BonusTiers.map(tier=>Object.freeze({...tier,masterStars:masterStarsByPurchase[tier.purchases]})));
export const SUPPORT_PACKAGE_CUBE=Object.freeze({code:'SSS_MIRACLE_CUBE',name:'SSS 미라클큐브',image:'assets/ui/sss-miracle-cube-20261021/cube-768.webp'});
const policies=new Map([
  [SUPPORT_PACKAGE_BONUS_CODE,{tiers:SUPPORT_PACKAGE_BONUS_TIERS,key:'support_package_bonus_20261121_v1:',repeats:true}],
  [SUPPORT_PACKAGE_NOVEMBER15_BONUS_CODE,{tiers:november15BonusTiers,key:'support_package_bonus_20261115_v1:',repeats:true}],
  [SUPPORT_PACKAGE_LEGACY_BONUS_CODE,{tiers:legacyBonusTiers,key:'support_package_bonus_20261106_v1:',repeats:false}]
]);
const policyFor=code=>{const policy=policies.get(code);if(!policy)throw Error('Invalid package bonus policy');return policy;};
export const supportPackageHasBonus=product=>policies.has(product?.bonusPolicy);
export const supportPackageBonusTiers=code=>policyFor(code).tiers;
export const supportPackageBonusKey=(userId,policy=SUPPORT_PACKAGE_BONUS_CODE)=>policyFor(policy).key+Number(userId);
export const packageCoinValue=coins=>coins<=BigInt(Number.MAX_SAFE_INTEGER)?Number(coins):coins.toString();
export const SUPPORT_PACKAGE_REPEAT_EVERY=10;
const validCount=n=>Number.isSafeInteger(n)&&n>=0;
function bonusTotals(count,policy,repeat=true){
  const {tiers,repeats}=policyFor(policy),loops=repeat&&repeats?Math.floor(count/SUPPORT_PACKAGE_REPEAT_EVERY):0;
  const remainder=repeat&&repeats?count%SUPPORT_PACKAGE_REPEAT_EVERY:count;
  const coins=tiers.reduce((sum,t)=>sum+BigInt(t.coins)*BigInt(loops+(remainder>=t.purchases?1:0)),0n);
  const cubes=tiers.reduce((sum,t)=>sum+(t.cubes??0)*(loops+(remainder>=t.purchases?1:0)),0);
  if(!Number.isSafeInteger(cubes))throw Error('Invalid package cube total');
  return {coins,cubes};
}
export function supportPackageBonus(paidPurchases=0,quantity=0,policyCode=SUPPORT_PACKAGE_BONUS_CODE){
  if(!validCount(paidPurchases)||!Number.isInteger(quantity)||quantity<0||quantity>100||!validCount(paidPurchases+quantity))throw Error('Invalid package purchase count');
  const after=paidPurchases+quantity,{tiers,repeats}=policyFor(policyCode),milestones=[];
  // At most eleven cycles for a 100-unit order; never iterate over historical purchases.
  if(repeats){for(let cycle=Math.floor(paidPurchases/10);cycle<=Math.floor(after/10);cycle++)for(const t of tiers){const at=cycle*10+t.purchases;if(at>paidPurchases&&at<=after)milestones.push({...t,cycle:cycle+1,atPurchase:at});}}
  else milestones.push(...tiers.filter(t=>t.purchases>paidPurchases&&t.purchases<=after));
  const beforeTotal=bonusTotals(paidPurchases,policyCode),afterTotal=bonusTotals(after,policyCode);
  return {policyCode,paidPurchasesBefore:paidPurchases,paidPurchasesAfter:after,milestones,
    coins:(afterTotal.coins-beforeTotal.coins).toString(),totalEarnedCoins:afterTotal.coins.toString(),
    ...(policyCode===SUPPORT_PACKAGE_BONUS_CODE?{masterStars:milestones.reduce((sum,t)=>sum+t.masterStars,0)}:{}),
    ...(repeats?{cubes:afterTotal.cubes-beforeTotal.cubes,totalEarnedCubes:afterTotal.cubes,repeatEvery:10,cycleBefore:Math.floor(paidPurchases/10)+1,cycleAfter:Math.floor(after/10)+1,cyclePurchasesBefore:paidPurchases%10,cyclePurchasesAfter:after%10}:{})};
}
const repeatStart=state=>state.repeatBaseline??{paidPurchases:state.paidPurchases,totalBonusCoins:state.totalBonusCoins,totalBonusCubes:state.totalBonusCubes??0};
const repeatPosition=(state,baseline=repeatStart(state))=>(baseline.paidPurchases<10?baseline.paidPurchases:0)+state.paidPurchases-baseline.paidPurchases;
function validLegacyState(state,policy){
  if(!validCount(state.paidPurchases))return false;
  const total=bonusTotals(state.paidPurchases,policy,false);
  return state.totalBonusCoins===total.coins.toString()&&(state.totalBonusCubes===undefined||validCount(state.totalBonusCubes)&&state.totalBonusCubes<=total.cubes);
}
export function supportPackageBonusState(value=null,policyCode=SUPPORT_PACKAGE_BONUS_CODE){
  const state=value??{version:1,policyCode,paidPurchases:0,totalBonusCoins:'0'};
  if(state.policyCode!==policyCode||!validCount(state.paidPurchases))throw Error('Invalid package bonus state');
  if(state.version===1){if(state.repeatBaseline!==undefined||!validLegacyState(state,policyCode))throw Error('Invalid package bonus state');}
  else if(state.version===2&&policyFor(policyCode).repeats){
    const base=state.repeatBaseline;
    if(!base||!validLegacyState(base,policyCode)||!validCount(base.totalBonusCubes)||base.paidPurchases>state.paidPurchases)throw Error('Invalid package repeat baseline');
    const start=bonusTotals(base.paidPurchases<10?base.paidPurchases:0,policyCode),end=bonusTotals(repeatPosition(state),policyCode);
    if(state.totalBonusCoins!==(BigInt(base.totalBonusCoins)+end.coins-start.coins).toString()||!validCount(state.totalBonusCubes)||state.totalBonusCubes!==base.totalBonusCubes+end.cubes-start.cubes)throw Error('Invalid package repeat totals');
  }else throw Error('Invalid package bonus version');
  return state;
}
export function supportPackageCycleProgress(value=null){
  const state=supportPackageBonusState(value,value?.policyCode??SUPPORT_PACKAGE_BONUS_CODE);
  if(!policyFor(state.policyCode).repeats)return {repeats:false,paidPurchases:state.paidPurchases,cycle:1};
  const position=repeatPosition(state),prior=repeatStart(state).paidPurchases>=10?1:0;
  return {repeats:true,paidPurchases:position%10,cycle:prior+Math.floor(position/10)+1};
}
export function supportPackageWithBonus(product,progress=0){
  if(!supportPackageHasBonus(product))return product;
  let purchaseBonus;
  if(typeof progress==='number')purchaseBonus=supportPackageBonus(progress,product.purchaseQuantity??1,product.bonusPolicy);
  else{
    const state=supportPackageBonusState(progress,product.bonusPolicy),{repeats}=policyFor(product.bonusPolicy);
    const position=repeats?repeatPosition(state):state.paidPurchases,quantity=product.purchaseQuantity??1,calculated=supportPackageBonus(position,quantity,product.bonusPolicy),prior=repeats&&repeatStart(state).paidPurchases>=10?1:0;
    purchaseBonus={...calculated,paidPurchasesBefore:state.paidPurchases,paidPurchasesAfter:state.paidPurchases+quantity,totalEarnedCoins:(BigInt(state.totalBonusCoins)+BigInt(calculated.coins)).toString(),
      ...(repeats?{cycleBefore:calculated.cycleBefore+prior,cycleAfter:calculated.cycleAfter+prior,milestones:calculated.milestones.map(t=>({...t,cycle:t.cycle+prior})),totalEarnedCubes:(state.totalBonusCubes??0)+calculated.cubes}:{})};
    if(!validCount(purchaseBonus.paidPurchasesAfter))throw Error('Invalid package purchase count');
  }
  const items=product.items.map(item=>item.code==='MASTER_STAR'&&purchaseBonus.masterStars
    ?{...item,quantity:item.quantity+purchaseBonus.masterStars}:item);
  if(purchaseBonus.cubes)items.push({...SUPPORT_PACKAGE_CUBE,quantity:purchaseBonus.cubes});
  return {...product,items,baseCoins:product.coins,coins:packageCoinValue(BigInt(product.coins)+BigInt(purchaseBonus.coins)),purchaseBonus};
}
export function supportPackageAdvanceBonus(value,bonus,{orderId,now}){
  const state=supportPackageBonusState(value,bonus.policyCode),repeat=policyFor(state.policyCode).repeats;
  if(bonus.paidPurchasesBefore!==state.paidPurchases)throw Error('Package bonus revision changed');
  const next={...state,...(repeat?{version:2,repeatBaseline:repeatStart(state)}:{}),paidPurchases:bonus.paidPurchasesAfter,totalBonusCoins:bonus.totalEarnedCoins,
    ...(bonus.cubes!==undefined?{totalBonusCubes:(state.totalBonusCubes??0)+bonus.cubes}:{}),lastOrderId:orderId,updatedAt:now};
  return supportPackageBonusState(next,bonus.policyCode);
}
export const supportPackageBonusSummary=bonus=>bonus?`${bonus.repeatEvery?`${bonus.cycleBefore}주기 ${bonus.cyclePurchasesBefore}회 → ${bonus.cycleAfter}주기 ${bonus.cyclePurchasesAfter}회 · 10회마다 자동 반복`:`누적 ${bonus.paidPurchasesBefore} → ${bonus.paidPurchasesAfter}회`} · 이번 구매 보너스 ${BigInt(bonus.coins)/1000000000000n}조 코인${bonus.masterStars?` · 마스터의 별 ${supportPackageItemQuantity(bonus.masterStars)}개`:''}${bonus.cubes?` · SSS 미라클큐브 ${bonus.cubes}개`:''}`:'';
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
export const SUPPORT_PACKAGE_NOVEMBER6=Object.freeze({...SUPPORT_PACKAGE_UNIT,
  code:'SEASON_PASS_PACKAGE_20261106',packageQuantity:2,eventCode:'SUPPORT_PACKAGE_BOGO_20261106',eventLabel:'1+1 이벤트',
  coins:500000000000000,bonusPolicy:SUPPORT_PACKAGE_LEGACY_BONUS_CODE,items:Object.freeze([
    Object.freeze({code:'MASTER_STAR',name:'마스터의 별',quantity:1000000000,image:'assets/ui/icon-fusion-20261004/master-star.webp'}),
    Object.freeze({code:'SUIT_CORE_7',name:'슈트 코어 7',quantity:10,image:'assets/items/suit-core-7-20261006.png'}),
    ...FORGE_SCROLL_ITEMS.map(({code,name,image})=>Object.freeze({code,name,quantity:5,image})),
    Object.freeze({code:LIMITED_SHARD.code,name:LIMITED_SHARD.name,quantity:10,image:LIMITED_SHARD.image})
  ])
});
// New applications use the revised materials. Existing order snapshots stay valid.
export const SUPPORT_PACKAGE_NOVEMBER15=Object.freeze({...SUPPORT_PACKAGE_NOVEMBER6,
  code:'SEASON_PASS_PACKAGE_20261115',eventCode:'SUPPORT_PACKAGE_BOGO_20261115',bonusPolicy:SUPPORT_PACKAGE_NOVEMBER15_BONUS_CODE,items:Object.freeze([
    Object.freeze({code:'MASTER_STAR',name:'마스터의 별',quantity:1000000000,image:'assets/ui/icon-fusion-20261004/master-star.webp'}),
    Object.freeze({code:'ARDEN_ENERGY',name:'아르덴 에너지',quantity:50,image:'assets/items/arden-energy-v1.webp'}),
    ...FORGE_SCROLL_ITEMS.map(({code,name,image})=>Object.freeze({code,name,quantity:10,image})),
    Object.freeze({code:LIMITED_SHARD.code,name:LIMITED_SHARD.name,quantity:25,image:LIMITED_SHARD.image})
  ])
});
export const SUPPORT_PACKAGE_NOVEMBER15_PETS=Object.freeze({...SUPPORT_PACKAGE_NOVEMBER15,
  code:'SEASON_PASS_PACKAGE_20261115_PETS',items:Object.freeze([
    ...SUPPORT_PACKAGE_NOVEMBER15.items,
    Object.freeze({code:'PET_SEAL_ORB',name:'펫 봉인구',quantity:50,image:'assets/items/pet-opening-v1/pet-seal-orb.webp'}),
    Object.freeze({code:'PET_ESSENCE',name:'펫 정수',quantity:500,image:'assets/items/pet-opening-v1/pet-essence.webp'})
  ])
});
const currencyPackageQuantities=Object.freeze({
  MASTER_STAR:25_000_000_000, WEAPON_ENHANCEMENT_SCROLL:5,
  ARMOR_ENHANCEMENT_SCROLL:20, MERCENARY_SSS_LIMITED_SHARD:10
});
export const SUPPORT_PACKAGE=Object.freeze({...SUPPORT_PACKAGE_NOVEMBER15_PETS,
  code:'SEASON_PASS_PACKAGE_20261121_BUNDLE',name:'묶음패키지',eventCode:'SUPPORT_PACKAGE_BOGO_20261121',bonusPolicy:SUPPORT_PACKAGE_BONUS_CODE
});
export const SUPPORT_PACKAGE_CURRENCY=Object.freeze({...SUPPORT_PACKAGE,
  code:'SEASON_PASS_PACKAGE_20261121_CURRENCY',name:'재화패키지',coins:1_500_000_000_000_000,
  items:Object.freeze(SUPPORT_PACKAGE.items.filter(item=>Object.hasOwn(currencyPackageQuantities,item.code))
    .map(item=>Object.freeze({...item,quantity:currencyPackageQuantities[item.code]})))
});
export const SUPPORT_PACKAGE_OFFERS=Object.freeze([SUPPORT_PACKAGE,SUPPORT_PACKAGE_CURRENCY]);
// Display metadata stays outside immutable order/fulfillment products.
const NOVEMBER_LEGACY_DEADLINE=Object.freeze({
  eventCode:'SUPPORT_PACKAGE_BOGO_20261101',endsAt:'2026-11-04T00:00:00+09:00',
  label:'11월 4일 00:00 판매 종료',detail:'11월 3일에서 4일로 넘어가는 자정 · 한국시간',
  notice:'1+1 패키지 판매 종료: 2026년 11월 4일 00:00 (한국시간)\n11월 3일에서 4일로 넘어가는 자정'
});
const NOVEMBER6_DEADLINE=Object.freeze({
  eventCode:'SUPPORT_PACKAGE_BOGO_20261106',endsAt:'2026-11-09T00:00:00+09:00',
  label:'11월 9일 00:00 판매 종료',detail:'11월 8일에서 9일로 넘어가는 자정 · 한국시간',
  notice:'1+1 패키지 판매 종료: 2026년 11월 9일 00:00 (한국시간)\n11월 8일에서 9일로 넘어가는 자정'
});
const NOVEMBER15_DEADLINE=Object.freeze({
  eventCode:'SUPPORT_PACKAGE_BOGO_20261115',endsAt:'2026-11-24T00:00:00+09:00',
  label:'11월 23일 23:59까지 판매',detail:'한국시간 · 11월 24일 00:00부터 구매 불가',
  notice:'1+1 패키지 판매: 2026년 11월 23일 23:59까지 (한국시간)'
});
export const SUPPORT_PACKAGE_EVENT_DEADLINE=Object.freeze({
  eventCode:SUPPORT_PACKAGE.eventCode,endsAt:null,label:'상시 판매',notice:'49,800원 1+1 패키지 상시 판매'
});
export const supportPackageEventDeadline=product=>[SUPPORT_PACKAGE_EVENT_DEADLINE,NOVEMBER15_DEADLINE,NOVEMBER6_DEADLINE,NOVEMBER_LEGACY_DEADLINE].find(d=>d.eventCode===product?.eventCode)||null;
export const SUPPORT_PACKAGE_SALES_ENDS_AT=null;
export const supportPackageSalesOpen=(now=Date.now())=>Number.isFinite(now);
const novemberProducts=[SUPPORT_PACKAGE_500T_BOGO,SUPPORT_PACKAGE_NOVEMBER_BOGO,SUPPORT_PACKAGE_SCROLLS_400_BOGO];
const quantityProducts=[...SUPPORT_PACKAGE_OFFERS,SUPPORT_PACKAGE_NOVEMBER15_PETS,SUPPORT_PACKAGE_NOVEMBER15,SUPPORT_PACKAGE_NOVEMBER6,...novemberProducts];
const fulfillmentBySnapshot=new Map(quantityProducts.map(product=>[JSON.stringify(product),product]));
for(const historical of [SUPPORT_PACKAGE_UNIT,SUPPORT_PACKAGE_LEGACY_BOGO])fulfillmentBySnapshot.set(JSON.stringify(historical),SUPPORT_PACKAGE_LEGACY_BOGO);
export const isSupportPackageProduct=product=>fulfillmentBySnapshot.has(JSON.stringify(product));
export const supportPackageFulfillment=product=>fulfillmentBySnapshot.get(JSON.stringify(product))??null;
export const SUPPORT_PACKAGE_MAX_QUANTITY=100;
export const supportPackageQuantityValid=n=>Number.isInteger(n)&&n>=1&&n<=SUPPORT_PACKAGE_MAX_QUANTITY;
export function supportPackageOrderProduct(order){
  let product=supportPackageFulfillment(order?.product);const quantity=order?.quantity??1;
  if(!product||!supportPackageQuantityValid(quantity)||!quantityProducts.includes(product)&&quantity!==1)return null;
  // The 500-trillion increase also applies when an existing November application is paid.
  // Preserve the application snapshot, other items and completed/rejected historical terms.
  if(novemberProducts.includes(product)&&(!order?.status||order.status==='PENDING'))product={...product,coins:SUPPORT_PACKAGE_500T_BOGO.coins};
  if(product===SUPPORT_PACKAGE_NOVEMBER15&&(!order?.status||order.status==='PENDING'))product=SUPPORT_PACKAGE_NOVEMBER15_PETS;
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
export const supportPackageSummary=product=>`${product.bonusPolicy===SUPPORT_PACKAGE_BONUS_CODE?product.name+' · ':''}${BigInt(product.coins)/1000000000000n}조 코인${product.purchaseBonus?` (기본 ${product.baseCoins/1000000000000}조 + 보너스 ${BigInt(product.purchaseBonus.coins)/1000000000000n}조)` : ''} · ${product.items.map(item=>`${item.name} ${product.bonusPolicy?supportPackageItemQuantity(item.quantity):item.quantity}개`).join(' · ')}${product.purchaseBonus?' · '+supportPackageBonusSummary(product.purchaseBonus):''}`;
