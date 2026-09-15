export const PIG_COIN_IMAGE='assets/items/pig-coin-v1.png';
export const LOOT_SOURCE_LABELS={TERRITORY:'영토전',CLAN:'클랜전',CORE_RAID:'신규 레이드'};
export const LOOT_PRODUCT_TYPES={SUPERSTAR_CHOICE:'슈퍼스타 선택팩',FUR_CHOICE:'FUR 선택팩',F_BODY:'F바디',MYSTIC_EQUIPMENT:'미스틱 장비',MERCENARY_PACK:'용병 A~S등급 카드팩'};
export const LOOT_SHOP_DEFAULTS={revision:0,salesEnabled:false,rewardsEnabled:false,sources:Object.keys(LOOT_SOURCE_LABELS).map(code=>({code,enabled:false,amount:null})),products:Object.entries(LOOT_PRODUCT_TYPES).map(([type,name],index)=>({id:type.toLowerCase(),type,name,enabled:false,price:null,accountLimit:null,equipmentId:null,cardIds:[],mercenaryWeights:{A:null,S:null},mercenaryCodes:[],sortOrder:index}))};
const error=message=>Object.assign(new Error(message),{code:'JOINT_LOOT_CONFIG',status:400});
const int=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw error(`${label} 값을 확인하세요.`);return v;};
const nullable=(v,min,max,label)=>v===null?null:int(v,min,max,label);
const bool=(v,label)=>{if(typeof v!=='boolean')throw error(`${label} 설정을 확인하세요.`);return v;};
const ids=(v,pattern,label)=>{if(!Array.isArray(v)||v.length>500||new Set(v).size!==v.length||v.some(id=>typeof id!=='string'||!pattern.test(id)))throw error(`${label} 목록을 확인하세요.`);return [...v];};
export function validateLootShopPolicy(raw){
 if(!raw||!Array.isArray(raw.products)||raw.products.length>100||!Array.isArray(raw.sources))throw error('상점 설정을 확인하세요.');
 const next={revision:int(raw.revision,0,2147483646,'수정 버전'),salesEnabled:bool(raw.salesEnabled,'판매'),rewardsEnabled:bool(raw.rewardsEnabled,'재화 지급'),sources:[],products:[]};
 for(const code of Object.keys(LOOT_SOURCE_LABELS)){
  const rows=raw.sources.filter(s=>s.code===code);if(rows.length!==1)throw error('콘텐츠별 지급 설정이 필요합니다.');
  const s=rows[0],r={code,enabled:bool(s.enabled,'콘텐츠 지급'),amount:nullable(s.amount,1,1000000000,'피그 코인 지급량')};if(r.enabled&&r.amount===null)throw error(`${LOOT_SOURCE_LABELS[code]} 지급량을 입력하세요.`);next.sources.push(r);
 }
 if(raw.sources.length!==3)throw error('허용되지 않은 지급 콘텐츠입니다.');
 for(const p of raw.products){
  if(typeof p.id!=='string'||!/^[a-z0-9_-]{3,70}$/.test(p.id)||!LOOT_PRODUCT_TYPES[p.type]||typeof p.name!=='string'||!p.name.trim()||p.name.length>80)throw error('상품 코드·종류·이름을 확인하세요.');
  const r={id:p.id,type:p.type,name:p.name.trim(),enabled:bool(p.enabled,'상품 판매'),price:nullable(p.price,1,1000000000,'가격'),accountLimit:nullable(p.accountLimit,1,3,'계정당 구매 횟수'),equipmentId:nullable(p.equipmentId,1,2147483647,'장비'),cardIds:ids(p.cardIds,/^[A-Za-z0-9_-]{1,100}$/,'선택 카드'),mercenaryCodes:ids(p.mercenaryCodes,/^V-\d{3}$/,'용병'),mercenaryWeights:{A:nullable(p.mercenaryWeights?.A,0,10000,'A 가중치'),S:nullable(p.mercenaryWeights?.S,0,10000,'S 가중치')},sortOrder:int(p.sortOrder,0,10000,'정렬')};
  if(r.enabled){
   if(r.price===null||r.accountLimit===null)throw error(`${r.name}의 가격과 구매 횟수를 입력하세요.`);
   if(r.type.endsWith('_CHOICE')&&!r.cardIds.length)throw error(`${r.name}의 선택 카드를 등록하세요.`);
   if(['F_BODY','MYSTIC_EQUIPMENT'].includes(r.type)&&!r.equipmentId)throw error(`${r.name}의 지급 장비를 선택하세요.`);
   if(r.type==='MERCENARY_PACK'&&(!r.mercenaryCodes.length||r.mercenaryWeights.A===null||r.mercenaryWeights.S===null||r.mercenaryWeights.A+r.mercenaryWeights.S<=0))throw error('용병 목록과 A/S 등급 가중치를 설정하세요.');
  }
  next.products.push(r);
 }
 if(new Set(next.products.map(p=>p.id)).size!==next.products.length)throw error('상품 코드가 중복되었습니다.');
 if(next.salesEnabled&&!next.products.some(p=>p.enabled))throw error('판매할 상품을 먼저 설정하세요.');
 if(next.rewardsEnabled&&!next.sources.some(s=>s.enabled))throw error('지급 콘텐츠를 먼저 설정하세요.');
 return next;
}
