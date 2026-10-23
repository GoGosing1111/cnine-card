// Mystic is an equipment family stored with the canonical MYTHIC rarity.
export const LOOT_MYSTIC_RARITY='MYTHIC';
export const LOOT_MYSTIC_NAME_PREFIX='미스틱 ';
// User-approved fixed pool: adding other MYTHIC/Mystic gear never changes these odds.
export const LOOT_MYSTIC_NAMES=Object.freeze(['미스틱 슈트','미스틱 레깅스','미스틱 슈즈','미스틱 듀얼디스크']);
export const LOOT_MYSTIC_CHANCE_PERCENT=25;
export const LOOT_PURCHASE_MAX_QUANTITY=100;
export function lootPurchaseMaximum(product,balance){
 if(!product?.canBuy||!Number.isSafeInteger(product.price)||product.price<1)return 0;
 return Math.max(0,Math.min(LOOT_PURCHASE_MAX_QUANTITY,Number(product.remaining)||0,Math.floor(Number(balance)/product.price)||0));
}
export function lootEquipmentMatchesProduct(item,type){
 if(type==='F_BODY')return item?.code==='BATTLE_SUIT_02';
 return type==='MYSTIC_EQUIPMENT'&&item?.rarity===LOOT_MYSTIC_RARITY&&LOOT_MYSTIC_NAMES.includes(item.name);
}
export const lootMysticPoolComplete=pool=>pool.length===LOOT_MYSTIC_NAMES.length&&LOOT_MYSTIC_NAMES.every(name=>pool.filter(item=>item.name===name&&lootEquipmentMatchesProduct(item,'MYSTIC_EQUIPMENT')).length===1);
export const PIG_COIN_IMAGE='assets/items/pig-coin-v1.png';
export const LOOT_SOURCE_LABELS={TERRITORY:'영토전',CLAN:'클랜전',CORE_RAID:'신규 레이드'};
export const LOOT_LEGACY_PRODUCT_TYPES={SUPERSTAR_CHOICE:'슈퍼스타 선택팩',FUR_CHOICE:'FUR 선택팩',F_BODY:'F바디',MYSTIC_EQUIPMENT:'미스틱 장비',MERCENARY_PACK:'용병 A~S등급 카드팩',MERCENARY_SS_PACK:'SS 용병 카드팩'};
export const LOOT_PRODUCT_TYPES={...LOOT_LEGACY_PRODUCT_TYPES,ITEM_BUNDLE:'아이템 · 재료 묶음',EQUIPMENT_DIRECT:'지정 장비',CARD_CHOICE:'자유 구성 카드 선택팩',MERCENARY_CUSTOM_PACK:'자유 구성 용병팩'};
export const LOOT_MERCENARY_RANKS=['C','B','A','S','SS','SSS'];
export const LOOT_CATEGORIES={ALL:'전체',CARD:'카드',MERCENARY:'용병',EQUIPMENT:'장비',ITEM:'아이템 · 재료'};
export const LOOT_LIMIT_PERIODS={LIFETIME:'계정 누적',DAILY:'매일',WEEKLY:'매주',MONTHLY:'매월'};
export const lootMercenaryRanks=type=>type==='MERCENARY_CUSTOM_PACK'?LOOT_MERCENARY_RANKS:type==='MERCENARY_SS_PACK'?['SS']:type==='MERCENARY_PACK'?['A','S']:[];
export const lootProductCategory=p=>p.category|| (p.type.endsWith('_CHOICE')?'CARD':lootMercenaryRanks(p.type).length?'MERCENARY':p.type==='ITEM_BUNDLE'?'ITEM':'EQUIPMENT');
export const lootIsDirect=type=>['F_BODY','MYSTIC_EQUIPMENT','EQUIPMENT_DIRECT','ITEM_BUNDLE'].includes(type);
export function createLootProductDraft(type,id){
 return {id,type,name:LOOT_PRODUCT_TYPES[type],enabled:false,price:null,accountLimit:null,equipmentId:null,cardIds:[],mercenaryWeights:{A:null,S:null},mercenaryCodes:[],sortOrder:0,description:'',image:'',category:lootProductCategory({type}),badge:'',featured:false,visible:true,startsAt:null,endsAt:null,limitPeriod:'LIFETIME',items:[],rankWeights:Object.fromEntries(LOOT_MERCENARY_RANKS.map(r=>[r,0]))};
}
// KST boundaries are shared by the server and the editor. Purchase records remain
// immutable; changing a period never rewrites or clears lifetime history.
export function lootPurchaseWindow(period='LIFETIME',at=Date.now()){
 if(period==='LIFETIME')return {startsAt:null,resetsAt:null};
 const d=new Date(at+9*3600000),year=d.getUTCFullYear(),month=d.getUTCMonth(),day=d.getUTCDate();
 let start=Date.UTC(year,month,day),end=start+86400000;
 if(period==='WEEKLY'){start-=((d.getUTCDay()+6)%7)*86400000;end=start+7*86400000;}
 if(period==='MONTHLY'){start=Date.UTC(year,month,1);end=Date.UTC(year,month+1,1);}
 return {startsAt:new Date(start-9*3600000).toISOString(),resetsAt:new Date(end-9*3600000).toISOString()};
}
export function lootSaleState(product,at=Date.now()){
 if(product.visible===false)return 'HIDDEN';
 if(!product.enabled)return 'DISABLED';
 if(product.startsAt&&Date.parse(product.startsAt)>at)return 'SCHEDULED';
 if(product.endsAt&&Date.parse(product.endsAt)<=at)return 'ENDED';
 return 'ACTIVE';
}
// User-approved 2026-09-15. Values are prepared; explicit CMS saving enables payment.
export const PIG_COIN_SOURCE_DEFAULTS=[
 {code:'TERRITORY',enabled:false,victoryAmount:100,participationAmount:50},
 {code:'CLAN',enabled:false,victoryAmount:30,participationAmount:30,minAttacks:30},
 {code:'CORE_RAID',enabled:false,amount:30,weeklyLimit:90}
];
export const PIG_COIN_SOURCE_FIELDS={
 TERRITORY:[['victoryAmount','승리 보상',1,1000000000],['participationAmount','최소 공격 조건 충족 보상',1,1000000000]],
 CLAN:[['victoryAmount','회차 승리 보상',1,1000000000],['participationAmount','공격 참여 보상',1,1000000000],['minAttacks','회차별 최소 완료 공격 횟수',1,10000]],
 CORE_RAID:[['amount','붕괴 코어 격파 보상',1,1000000000],['weeklyLimit','계정당 주간 지급 한도',1,1000000000]]
};
export const PIG_COIN_SOURCE_NOTES={TERRITORY:'회차당 승리·참여 보상 합산. 참여 기준은 영토전 CMS의 보상 최소 공격 횟수를 따릅니다.',CLAN:'정규전 회차 종료 시 승리·참여 보상 합산 지급. 해당 회차의 완료 공격만 세며 방어·오류·진행 중 공격은 제외합니다. 전투 패배도 완료 공격에 포함합니다.',CORE_RAID:'최종 보스 제압 후 보상 수령 시 지급. 매주 월요일 00:00(한국 시간)에 한도를 초기화합니다.'};
export const LOOT_SHOP_DEFAULTS={revision:0,salesEnabled:false,rewardsEnabled:false,sources:structuredClone(PIG_COIN_SOURCE_DEFAULTS),products:Object.entries(LOOT_LEGACY_PRODUCT_TYPES).map(([type,name],index)=>({id:type.toLowerCase(),type,name,enabled:false,price:null,accountLimit:null,equipmentId:null,cardIds:[],mercenaryWeights:{A:null,S:null},mercenaryCodes:[],sortOrder:index}))};
// Old flat rewards have no victory/participation or weekly contract. Require an
// explicit save of the new rules, preserving all products and purchase identities.
export function upgradeLootShopPolicy(raw){
 const next=structuredClone(raw);
 // Expose the new draft on existing installations without rewriting saved settings.
 // Price, lifetime cap and candidates remain unset until the OWNER saves them.
 if(Array.isArray(next?.products)&&!next.products.some(p=>p.type==='MERCENARY_SS_PACK')&&!(Array.isArray(next.retiredProductIds)&&next.retiredProductIds.includes('mercenary_ss_pack')))next.products.push(structuredClone(LOOT_SHOP_DEFAULTS.products.find(p=>p.type==='MERCENARY_SS_PACK')));
 if(!Array.isArray(next?.sources))return next;
 next.sources=next.sources.map(s=>PIG_COIN_SOURCE_FIELDS[s.code]?.some(([key])=>!Object.hasOwn(s,key))?structuredClone(PIG_COIN_SOURCE_DEFAULTS.find(d=>d.code===s.code)):s);
 if(!next.sources.some(s=>s.enabled))next.rewardsEnabled=false;return next;
}
export function pigCoinSourceSummary(source){
 const n=v=>v==null?'미설정':Number(v).toLocaleString('ko-KR');
 return source.code==='CORE_RAID'?`격파 ${n(source.amount)}개 · 주간 ${n(source.weeklyLimit)}개 한도`:source.code==='CLAN'?`회차 승리 ${n(source.victoryAmount)}개 + ${n(source.minAttacks)}회 이상 공격 ${n(source.participationAmount)}개`:`승리 ${n(source.victoryAmount)}개 + ${Number.isSafeInteger(source.participationMinimumAttacks)?n(source.participationMinimumAttacks)+'회 이상 공격':'최소 공격 조건 충족'} ${n(source.participationAmount)}개`;
}
export function pigCoinRewardWeek(at=Date.now()){
 const day=86400000,offset=9*3600000,kst=new Date(at+offset);
 const monday=Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate())-((kst.getUTCDay()+6)%7)*day;
 return {weekKey:new Date(monday).toISOString().slice(0,10),startsAt:new Date(monday-offset).toISOString(),resetsAt:new Date(monday-offset+7*day).toISOString()};
}
const error=message=>Object.assign(new Error(message),{code:'JOINT_LOOT_CONFIG',status:400});
const int=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw error(`${label} 값을 확인하세요.`);return v;};
const nullable=(v,min,max,label)=>v===null?null:int(v,min,max,label);
const bool=(v,label)=>{if(typeof v!=='boolean')throw error(`${label} 설정을 확인하세요.`);return v;};
const ids=(v,pattern,label,max=500)=>{if(!Array.isArray(v)||v.length>max||new Set(v).size!==v.length||v.some(id=>typeof id!=='string'||!pattern.test(id)))throw error(`${label} 목록을 확인하세요.`);return [...v];};
// 2026-10-03: every product has an OWNER-configured lifetime cap of 1–1,000.
export const lootProductMaxAccountLimit=()=>1000;
export function validateLootShopPolicy(raw){
 if(!raw||!Array.isArray(raw.products)||raw.products.length>100||!Array.isArray(raw.sources))throw error('상점 설정을 확인하세요.');
 const next={revision:int(raw.revision,0,2147483646,'수정 버전'),salesEnabled:bool(raw.salesEnabled,'판매'),rewardsEnabled:bool(raw.rewardsEnabled,'재화 지급'),sources:[],products:[]};
 // Keep legacy snapshots unchanged; only stored deletion history reserves IDs.
 // Retired identities do not consume the 100 currently registered product slots.
 if(Object.hasOwn(raw,'retiredProductIds'))next.retiredProductIds=ids(raw.retiredProductIds,/^[a-z0-9_-]{3,70}$/,'삭제된 상품 코드',Infinity);
 for(const code of Object.keys(LOOT_SOURCE_LABELS)){
  const rows=raw.sources.filter(s=>s.code===code);if(rows.length!==1)throw error('콘텐츠별 지급 설정이 필요합니다.');
  const s=rows[0],r={code,enabled:bool(s.enabled,'콘텐츠 지급')};
  for(const [key,label,min,max] of PIG_COIN_SOURCE_FIELDS[code]){r[key]=nullable(s[key],min,max,label);if(r.enabled&&r[key]===null)throw error(`${LOOT_SOURCE_LABELS[code]} ${label}을 입력하세요.`);}
  if(code==='CORE_RAID'&&r.amount!==null&&r.weeklyLimit!==null&&r.weeklyLimit<r.amount)throw error('주간 한도는 1회 격파 보상 이상이어야 합니다.');next.sources.push(r);
 }
 if(raw.sources.length!==3)throw error('허용되지 않은 지급 콘텐츠입니다.');
 for(const p of raw.products){
  if(typeof p.id!=='string'||!/^[a-z0-9_-]{3,70}$/.test(p.id)||!Object.hasOwn(LOOT_PRODUCT_TYPES,p.type)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80)throw error('상품 코드·종류·이름을 확인하세요.');
  const r={id:p.id,type:p.type,name:p.name.trim(),enabled:bool(p.enabled,'상품 판매'),price:nullable(p.price,1,1000000000,'가격'),accountLimit:nullable(p.accountLimit,1,lootProductMaxAccountLimit(p.type),'계정당 구매 횟수'),equipmentId:nullable(p.equipmentId,1,2147483647,'장비'),cardIds:ids(p.cardIds,/^[A-Za-z0-9_-]{1,100}$/,'선택 카드'),mercenaryCodes:ids(p.mercenaryCodes,/^V-\d{3}$/,'용병'),mercenaryWeights:{A:nullable(p.mercenaryWeights?.A,0,10000,'A 가중치'),S:nullable(p.mercenaryWeights?.S,0,10000,'S 가중치')},sortOrder:int(p.sortOrder,0,10000,'정렬')};
  // Keep absent v1 fields absent so previously purchased packs and in-flight
  // receipts retain the exact product snapshot they were bought with.
  for(const [key,max] of [['description',800],['badge',20],['image',500]])if(Object.hasOwn(p,key)){
   if(typeof p[key]!=='string'||p[key].length>max)throw error(`${r.name}의 ${key==='image'?'이미지':key==='badge'?'상품 표식':'설명'}을 확인하세요.`);r[key]=p[key].trim();
  }
  if(r.image&&!/^\/?assets\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|svg|gif)$/i.test(r.image))throw error('상품 이미지는 프로젝트 assets 경로를 사용하세요.');
  if(r.image?.split('/').some(s=>s==='..'))throw error('상품 이미지 경로를 확인하세요.');
  for(const key of ['featured','visible'])if(Object.hasOwn(p,key))r[key]=bool(p[key],key==='visible'?'상품 노출':'추천 상품');
  if(Object.hasOwn(p,'category')){if(!Object.hasOwn(LOOT_CATEGORIES,p.category)||p.category==='ALL')throw error('상품 분류를 확인하세요.');r.category=p.category;}
  if(Object.hasOwn(p,'limitPeriod')){if(!Object.hasOwn(LOOT_LIMIT_PERIODS,p.limitPeriod))throw error('구매 한도 주기를 확인하세요.');r.limitPeriod=p.limitPeriod;}
  for(const key of ['startsAt','endsAt'])if(Object.hasOwn(p,key)){
   if(p[key]!==null&&(typeof p[key]!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(p[key])||!Number.isFinite(Date.parse(p[key]))))throw error('판매 기간을 확인하세요.');r[key]=p[key]===null?null:new Date(p[key]).toISOString();if(p[key]!==null&&r[key]!==p[key].replace(/(?<=:\d\d)Z$/,'.000Z'))throw error('판매 기간의 날짜와 시간을 확인하세요.');
  }
  if(r.startsAt&&r.endsAt&&r.startsAt>=r.endsAt)throw error('판매 종료는 시작 시간 이후여야 합니다.');
  if(Object.hasOwn(p,'items')){
   if(!Array.isArray(p.items)||p.items.length>20||new Set(p.items.map(i=>i?.code)).size!==p.items.length)throw error('묶음 아이템은 중복 없이 최대 20종을 등록하세요.');
   r.items=p.items.map(i=>{if(typeof i?.code!=='string'||!/^[A-Z0-9_]{1,80}$/.test(i.code))throw error('아이템 코드를 확인하세요.');return {code:i.code,quantity:int(i.quantity,1,1000000,'아이템 수량')};});
  }
  if(Object.hasOwn(p,'rankWeights')){r.rankWeights={};for(const rank of LOOT_MERCENARY_RANKS)r.rankWeights[rank]=int(p.rankWeights?.[rank]??0,0,10000,`${rank} 등급 가중치`);}
  if(r.enabled){
   if(r.price===null||r.accountLimit===null)throw error(`${r.name}의 가격과 구매 횟수를 입력하세요.`);
   if(r.type.endsWith('_CHOICE')&&!r.cardIds.length)throw error(`${r.name}의 선택 카드를 등록하세요.`);
   if(r.type==='F_BODY'&&!r.equipmentId)throw error(`${r.name}의 지급 장비를 선택하세요.`);
   if(r.type==='MERCENARY_PACK'&&(!r.mercenaryCodes.length||r.mercenaryWeights.A===null||r.mercenaryWeights.S===null||r.mercenaryWeights.A+r.mercenaryWeights.S<=0))throw error('용병 목록과 A/S 등급 가중치를 설정하세요.');
   if(r.type==='MERCENARY_SS_PACK'&&!r.mercenaryCodes.length)throw error('SS등급 용병 후보를 선택하세요.');
   if(r.type==='ITEM_BUNDLE'&&!r.items?.length)throw error('지급할 아이템과 수량을 등록하세요.');
   if(r.type==='EQUIPMENT_DIRECT'&&!r.equipmentId)throw error('지급할 장비를 선택하세요.');
   if(r.type==='MERCENARY_CUSTOM_PACK'&&(!r.mercenaryCodes.length||!r.rankWeights||Object.values(r.rankWeights).reduce((a,b)=>a+b,0)<=0))throw error('용병 후보와 등급 가중치를 입력하세요.');
  }
  next.products.push(r);
 }
 if(new Set(next.products.map(p=>p.id)).size!==next.products.length)throw error('상품 코드가 중복되었습니다.');
 if(next.products.some(p=>next.retiredProductIds?.includes(p.id)))throw error('삭제한 상품 코드는 다시 사용할 수 없습니다. 새 상품을 추가하세요.');
 if(next.salesEnabled&&!next.products.some(p=>p.enabled))throw error('판매할 상품을 먼저 설정하세요.');
 if(next.rewardsEnabled&&!next.sources.some(s=>s.enabled))throw error('지급 콘텐츠를 먼저 설정하세요.');
 return next;
}
