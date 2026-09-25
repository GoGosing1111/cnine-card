// Mystic is an equipment family stored with the canonical MYTHIC rarity.
export const LOOT_MYSTIC_RARITY='MYTHIC';
export const LOOT_MYSTIC_NAME_PREFIX='미스틱 ';
// User-approved fixed pool: adding other MYTHIC/Mystic gear never changes these odds.
export const LOOT_MYSTIC_NAMES=Object.freeze(['미스틱 슈트','미스틱 레깅스','미스틱 슈즈','미스틱 듀얼디스크']);
export const LOOT_MYSTIC_CHANCE_PERCENT=25;
export function lootEquipmentMatchesProduct(item,type){
 if(type==='F_BODY')return item?.code==='BATTLE_SUIT_02';
 return type==='MYSTIC_EQUIPMENT'&&item?.rarity===LOOT_MYSTIC_RARITY&&LOOT_MYSTIC_NAMES.includes(item.name);
}
export const lootMysticPoolComplete=pool=>pool.length===LOOT_MYSTIC_NAMES.length&&LOOT_MYSTIC_NAMES.every(name=>pool.filter(item=>item.name===name&&lootEquipmentMatchesProduct(item,'MYSTIC_EQUIPMENT')).length===1);
export const PIG_COIN_IMAGE='assets/items/pig-coin-v1.png';
export const LOOT_SOURCE_LABELS={TERRITORY:'영토전',CLAN:'클랜전',CORE_RAID:'신규 레이드'};
export const LOOT_PRODUCT_TYPES={SUPERSTAR_CHOICE:'슈퍼스타 선택팩',FUR_CHOICE:'FUR 선택팩',F_BODY:'F바디',MYSTIC_EQUIPMENT:'미스틱 장비',MERCENARY_PACK:'용병 A~S등급 카드팩',MERCENARY_SS_PACK:'SS 용병 카드팩'};
export const lootMercenaryRanks=type=>type==='MERCENARY_SS_PACK'?['SS']:type==='MERCENARY_PACK'?['A','S']:[];
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
export const LOOT_SHOP_DEFAULTS={revision:0,salesEnabled:false,rewardsEnabled:false,sources:structuredClone(PIG_COIN_SOURCE_DEFAULTS),products:Object.entries(LOOT_PRODUCT_TYPES).map(([type,name],index)=>({id:type.toLowerCase(),type,name,enabled:false,price:null,accountLimit:null,equipmentId:null,cardIds:[],mercenaryWeights:{A:null,S:null},mercenaryCodes:[],sortOrder:index}))};
// Old flat rewards have no victory/participation or weekly contract. Require an
// explicit save of the new rules, preserving all products and purchase identities.
export function upgradeLootShopPolicy(raw){
 const next=structuredClone(raw);
 // Expose the new draft on existing installations without rewriting saved settings.
 // Price, lifetime cap and candidates remain unset until the OWNER saves them.
 if(Array.isArray(next?.products)&&!next.products.some(p=>p.type==='MERCENARY_SS_PACK'))next.products.push(structuredClone(LOOT_SHOP_DEFAULTS.products.find(p=>p.type==='MERCENARY_SS_PACK')));
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
const ids=(v,pattern,label)=>{if(!Array.isArray(v)||v.length>500||new Set(v).size!==v.length||v.some(id=>typeof id!=='string'||!pattern.test(id)))throw error(`${label} 목록을 확인하세요.`);return [...v];};
// SS has an owner-defined cap; the ceiling is an integer storage bound, not a sales policy.
export const lootProductMaxAccountLimit=type=>type==='MERCENARY_SS_PACK'?2147483647:type==='FUR_CHOICE'?10:3;
export function validateLootShopPolicy(raw){
 if(!raw||!Array.isArray(raw.products)||raw.products.length>100||!Array.isArray(raw.sources))throw error('상점 설정을 확인하세요.');
 const next={revision:int(raw.revision,0,2147483646,'수정 버전'),salesEnabled:bool(raw.salesEnabled,'판매'),rewardsEnabled:bool(raw.rewardsEnabled,'재화 지급'),sources:[],products:[]};
 for(const code of Object.keys(LOOT_SOURCE_LABELS)){
  const rows=raw.sources.filter(s=>s.code===code);if(rows.length!==1)throw error('콘텐츠별 지급 설정이 필요합니다.');
  const s=rows[0],r={code,enabled:bool(s.enabled,'콘텐츠 지급')};
  for(const [key,label,min,max] of PIG_COIN_SOURCE_FIELDS[code]){r[key]=nullable(s[key],min,max,label);if(r.enabled&&r[key]===null)throw error(`${LOOT_SOURCE_LABELS[code]} ${label}을 입력하세요.`);}
  if(code==='CORE_RAID'&&r.amount!==null&&r.weeklyLimit!==null&&r.weeklyLimit<r.amount)throw error('주간 한도는 1회 격파 보상 이상이어야 합니다.');next.sources.push(r);
 }
 if(raw.sources.length!==3)throw error('허용되지 않은 지급 콘텐츠입니다.');
 for(const p of raw.products){
  if(typeof p.id!=='string'||!/^[a-z0-9_-]{3,70}$/.test(p.id)||!LOOT_PRODUCT_TYPES[p.type]||typeof p.name!=='string'||!p.name.trim()||p.name.length>80)throw error('상품 코드·종류·이름을 확인하세요.');
  const r={id:p.id,type:p.type,name:p.name.trim(),enabled:bool(p.enabled,'상품 판매'),price:nullable(p.price,1,1000000000,'가격'),accountLimit:nullable(p.accountLimit,1,lootProductMaxAccountLimit(p.type),'계정당 구매 횟수'),equipmentId:nullable(p.equipmentId,1,2147483647,'장비'),cardIds:ids(p.cardIds,/^[A-Za-z0-9_-]{1,100}$/,'선택 카드'),mercenaryCodes:ids(p.mercenaryCodes,/^V-\d{3}$/,'용병'),mercenaryWeights:{A:nullable(p.mercenaryWeights?.A,0,10000,'A 가중치'),S:nullable(p.mercenaryWeights?.S,0,10000,'S 가중치')},sortOrder:int(p.sortOrder,0,10000,'정렬')};
  if(r.enabled){
   if(r.price===null||r.accountLimit===null)throw error(`${r.name}의 가격과 구매 횟수를 입력하세요.`);
   if(r.type.endsWith('_CHOICE')&&!r.cardIds.length)throw error(`${r.name}의 선택 카드를 등록하세요.`);
   if(r.type==='F_BODY'&&!r.equipmentId)throw error(`${r.name}의 지급 장비를 선택하세요.`);
   if(r.type==='MERCENARY_PACK'&&(!r.mercenaryCodes.length||r.mercenaryWeights.A===null||r.mercenaryWeights.S===null||r.mercenaryWeights.A+r.mercenaryWeights.S<=0))throw error('용병 목록과 A/S 등급 가중치를 설정하세요.');
   if(r.type==='MERCENARY_SS_PACK'&&!r.mercenaryCodes.length)throw error('SS등급 용병 후보를 선택하세요.');
  }
  next.products.push(r);
 }
 if(new Set(next.products.map(p=>p.id)).size!==next.products.length)throw error('상품 코드가 중복되었습니다.');
 if(next.salesEnabled&&!next.products.some(p=>p.enabled))throw error('판매할 상품을 먼저 설정하세요.');
 if(next.rewardsEnabled&&!next.sources.some(s=>s.enabled))throw error('지급 콘텐츠를 먼저 설정하세요.');
 return next;
}
