import {HALLOWEEN_PACK_CARDS,halloweenStockLimit,isHalloweenStockLimit} from './mercenary-halloween-pool-v3.mjs?v=20261023-halloween-stock-v1';
import {HALLOWEEN_MERCENARIES,HALLOWEEN_SERVER_LIMIT} from './mercenary-halloween-catalog-v1.mjs?v=20261023-halloween-stock-v1';
import {isLimitedRate,limitedRateUnits,LIMITED_RATE_TOTAL,LIMITED_RATE_SCALE} from './mercenary-limited-rates-v1.mjs';
import {MERCENARY_RANKS} from './mercenary-ranks-v1.mjs';

// 2026-10-17: OWNER can open only after readiness validation. Default and saved
// OFF remain OFF; enabling this capability never changes the persisted mode.
export const HALLOWEEN_PACK_RELEASE_ENABLED=true;
// 2026-10-25: removed from the shop; preserve saved economics and past receipts.
export const HALLOWEEN_PACK_SHOP_ENABLED=false;
export const HALLOWEEN_PACK_KEY='mercenary_halloween_ss_pack_v1';
export {HALLOWEEN_SERVER_LIMIT};
export const HALLOWEEN_PACK=Object.freeze({id:'mercenary-halloween-ss-limited',name:'할로윈 리미티드 용병팩',rank:'SSS',edition:'HALLOWEEN_LIMITED',maxBatch:10,featurePath:'mercenary-halloween-pack/config',openPath:'mercenary-halloween-pack/open',receiptPath:'mercenary-halloween-pack/receipt',adminPath:'admin/mercenaries/halloween-pack',image:'assets/ui/packs/reverse-call-20261016/halloween-768.webp'});
export const HALLOWEEN_NORMAL_RANKS=MERCENARY_RANKS;
export const HALLOWEEN_OPEN_KIND='MERCENARY_HALLOWEEN_OPEN';
const legacyCodes=['V-980','V-981','V-982','V-983','V-984','V-985','V-986'],codes=HALLOWEEN_PACK_CARDS.map(c=>c.code);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
function legacyHalloweenPackDraft(){
 return {format:'MERCENARY_HALLOWEEN_SS_PACK_V1',mode:'OFF',prices:{single:null,ten:null},cardRatesPpm:Object.fromEntries(legacyCodes.map(code=>[code,null])),missRatePpm:null,stockLimits:Object.fromEntries(legacyCodes.map(code=>[code,5]))};
}
function validateLegacyHalloweenPack(raw){
 if(!exact(raw,['format','mode','prices','cardRatesPpm','missRatePpm','stockLimits'])||raw.format!=='MERCENARY_HALLOWEEN_SS_PACK_V1'||raw.mode!=='OFF')throw Error('할로윈 팩은 추후 개방 예정입니다. OFF 초안만 저장할 수 있습니다.');
 if(!exact(raw.prices,['single','ten'])||Object.values(raw.prices).some(n=>n!==null&&(!Number.isSafeInteger(n)||n<1||n>100000000000000)))throw Error('가격은 미정 또는 1~100조 코인 정수로 입력하세요.');
 if(!exact(raw.cardRatesPpm,legacyCodes)||[...Object.values(raw.cardRatesPpm),raw.missRatePpm].some(n=>n!==null&&!isLimitedRate(n)))throw Error('할로윈 7종과 꽝 확률은 미정 또는 0~100%로 입력하세요.');
 const rates=[...Object.values(raw.cardRatesPpm),raw.missRatePpm];
 if(rates.reduce((sum,n)=>sum+(n===null?0:limitedRateUnits(n)),0)>LIMITED_RATE_TOTAL)throw Error('할로윈 팩 확률 합계는 100%를 초과할 수 없습니다.');
 if(!exact(raw.stockLimits,legacyCodes)||Object.values(raw.stockLimits).some(n=>n!==5))throw Error('할로윈 리미티드는 캐릭터별 서버 전체 5장 한정입니다.');
 return structuredClone(raw);
}
export function halloweenPackDraft(){
 return {...legacyHalloweenPackDraft(),format:'MERCENARY_HALLOWEEN_SS_PACK_V3',normalRankRatesPpm:Object.fromEntries(MERCENARY_RANKS.map(rank=>[rank,null])),normalSssRatePpm:null,cardRatesPpm:Object.fromEntries(codes.map(code=>[code,null])),stockLimits:Object.fromEntries(codes.map(code=>[code,halloweenStockLimit(code)]))};
}
export function validateHalloweenPack(raw,{releaseEnabled=HALLOWEEN_PACK_RELEASE_ENABLED,allowLegacyStock=false}={}){
 if(!exact(raw,['format','mode','prices','normalRankRatesPpm','cardRatesPpm','normalSssRatePpm','missRatePpm','stockLimits'])||raw.format!=='MERCENARY_HALLOWEEN_SS_PACK_V3'||!['OFF','ON'].includes(raw.mode)||!releaseEnabled&&raw.mode!=='OFF')throw Error('할로윈 팩은 출시 준비 중입니다. OFF 초안만 저장할 수 있습니다.');
 if(!exact(raw.prices,['single','ten'])||Object.values(raw.prices).some(n=>n!==null&&(!Number.isSafeInteger(n)||n<1||n>100000000000000)))throw Error('가격은 미정 또는 1~100조 코인 정수로 입력하세요.');
 if(!exact(raw.normalRankRatesPpm,MERCENARY_RANKS)||!exact(raw.cardRatesPpm,codes))throw Error('일반 6등급·할로윈 SS 8종·SSS 리미티드 4종의 확률을 확인하세요.');
 const first=[...Object.values(raw.normalRankRatesPpm),raw.missRatePpm],second=[...Object.values(raw.cardRatesPpm),raw.normalSssRatePpm];
 for(const rates of [first,second]){
  if(rates.some(n=>n!==null&&!isLimitedRate(n)))throw Error('확률은 미정 또는 0~100%, 소수점 8자리까지 입력하세요.');
  if(rates.reduce((sum,n)=>sum+(n===null?0:limitedRateUnits(n)),0)>LIMITED_RATE_TOTAL)throw Error('각 단계 확률 합계는 100%를 초과할 수 없습니다.');
 }
 // Keep complete previous approved documents readable during rollout.
 // Save uses the latest limits; reads retain earlier Jinmu/Jokro limits until
 // the explicit, atomic stock operation runs. Loading never retires a slot.
 const approvedLimits=exact(raw.stockLimits,codes)&&codes.every(code=>raw.stockLimits[code]===halloweenStockLimit(code));
 const legacyLimits=allowLegacyStock&&exact(raw.stockLimits,codes)&&codes.every(code=>isHalloweenStockLimit(code,raw.stockLimits[code]))&&legacyCodes.every(code=>raw.stockLimits[code]===raw.stockLimits[legacyCodes[0]]);
 if(!approvedLimits&&!legacyLimits)throw Error('기존 할로윈 SS 7종은 각 13장, 바토리는 20장, 진무는 팩 5장, 족로는 팩 3장, 헬리오스·발테르는 기존 공용 잔여 수량을 사용합니다.');
 return structuredClone(raw);
}
export function readHalloweenPackSettings(raw=halloweenPackDraft(),options){
 // Old V3 remains usable while the new member is deployed. Only the explicit
 // operational settings change assigns its probability; loading never does.
 for(const added of [['V-979'],['V-977','V-979'],['V-996','V-977','V-979'],['V-996','V-979'],['V-977'],['V-996','V-977'],['V-996']]){
  const previousCodes=codes.filter(code=>!added.includes(code));
  if(raw.format==='MERCENARY_HALLOWEEN_SS_PACK_V3'&&exact(raw.cardRatesPpm,previousCodes)&&exact(raw.stockLimits,previousCodes)){
   return validateHalloweenPack({...raw,cardRatesPpm:{...raw.cardRatesPpm,...Object.fromEntries(added.map(code=>[code,0]))},stockLimits:{...raw.stockLimits,...Object.fromEntries(added.map(code=>[code,halloweenStockLimit(code)]))}},{...options,allowLegacyStock:true});
  }
 }
 if(raw.format==='MERCENARY_HALLOWEEN_SS_PACK_V2'){
  if(!exact(raw.cardRatesPpm,legacyCodes)||!exact(raw.stockLimits,legacyCodes)||Object.values(raw.stockLimits).some(n=>n!==5))throw Error('이전 할로윈 초안의 대상과 수량을 확인하세요.');
  return validateHalloweenPack({...raw,format:'MERCENARY_HALLOWEEN_SS_PACK_V3',cardRatesPpm:{...halloweenPackDraft().cardRatesPpm,...raw.cardRatesPpm},stockLimits:halloweenPackDraft().stockLimits},options);
 }
 if(raw.format!=='MERCENARY_HALLOWEEN_SS_PACK_V1')return validateHalloweenPack(raw,{...options,allowLegacyStock:true});
 const old=validateLegacyHalloweenPack(raw);
 // Old absolute odds must never silently become conditional SSS odds. The
 // original document remains in storage and the save audit retains it.
 return {...halloweenPackDraft(),prices:old.prices,missRatePpm:old.missRatePpm};
}
export function halloweenPackReadiness(settings,stock=[],normalCards=[]){
 const blockers=[],first=[...Object.values(settings.normalRankRatesPpm),settings.missRatePpm],second=[...Object.values(settings.cardRatesPpm),settings.normalSssRatePpm];
 if(Object.values(settings.prices).some(n=>n===null))blockers.push('1회·10회 가격을 설정하세요.');
 if(first.some(n=>n===null)||first.reduce((s,n)=>s+(limitedRateUnits(n)||0),0)!==LIMITED_RATE_TOTAL)blockers.push('1단계 일반 등급·꽝 확률 합계를 100%로 설정하세요.');
 if(second.some(n=>n===null)||second.reduce((s,n)=>s+(limitedRateUnits(n)||0),0)!==LIMITED_RATE_TOTAL)blockers.push('SSS 내부의 할로윈 SS 8종·SSS 리미티드 4종·일반 SSS 확률 합계를 100%로 설정하세요.');
 for(const rank of MERCENARY_RANKS){
  // Ordinary SSS is also the destination of every exhausted limited interval.
  const needed=settings.normalRankRatesPpm[rank]>0;
  if(needed&&!normalCards.some(c=>c.rank===rank&&c.weight>0))blockers.push(rank+' 일반 용병 획득 대상을 확인하세요.');
 }
 if(!(settings.normalRankRatesPpm.SSS>0)||!Object.values(settings.cardRatesPpm).some(n=>n>0))blockers.push('SSS 진입 확률과 내부 리미티드 확률을 설정하세요.');
 const selected=codes.filter(code=>settings.cardRatesPpm[code]>0);
 for(const code of selected)if(!stock.find(s=>s.code===code)?.prepared)blockers.push(code+'의 한정 수량을 확인하세요.');
 // Empty stock redirects to ordinary SSS; it never closes an otherwise ready pack.
 return {ready:!blockers.length,blockers};
}
export function halloweenEffectivePercent(sssRate,conditionalRate){
 const a=limitedRateUnits(sssRate),b=limitedRateUnits(conditionalRate);if(a===null||b===null)return null;
 const units=BigInt(a)*BigInt(b),scale=10n**18n,decimal=String(units%scale).padStart(18,'0').replace(/0+$/,'');
 return String(units/scale)+(decimal?'.'+decimal:'');
}
export function halloweenCurrentRates(settings,stock){
 const cardRatesPpm={...settings.cardRatesPpm};let ordinary=limitedRateUnits(settings.normalSssRatePpm);
 for(const row of stock){
  if(!row.prepared||row.remaining!==0)continue;
  const units=limitedRateUnits(cardRatesPpm[row.code]);cardRatesPpm[row.code]=units===null?null:0;
  ordinary=ordinary===null||units===null?null:ordinary+units;
 }
 return {cardRatesPpm,normalSssRatePpm:ordinary===null?null:ordinary/LIMITED_RATE_SCALE};
}
export function halloweenPackState(settings=halloweenPackDraft(),stockRows=[],normalCards=[],{releaseEnabled=HALLOWEEN_PACK_RELEASE_ENABLED,shopEnabled=HALLOWEEN_PACK_SHOP_ENABLED}={}){
 const legacyAbsoluteRates=settings.format==='MERCENARY_HALLOWEEN_SS_PACK_V1'?structuredClone(settings.cardRatesPpm):null;
 settings=readHalloweenPackSettings(settings,{releaseEnabled});
 const stock=HALLOWEEN_PACK_CARDS.map(c=>{
  const row=stockRows.find(s=>s.code===c.code),expected=settings.stockLimits[c.code],limit=row?Number(row.stock_limit):expected,issued=Number(row?.issued??0);
  if(!Number.isSafeInteger(issued)||issued<0||limit!==null&&(!Number.isSafeInteger(limit)||limit<1||issued>limit)||row&&expected!==null&&limit!==expected)throw Error('리미티드 발행 수량을 확인해야 합니다.');
  return {code:c.code,limit,issued,remaining:row?limit-issued:null,prepared:Boolean(row),scope:c.stockPolicy==='EXISTING_SHARED'?'EXISTING_SHARED':c.stockPolicy==='PACK_ONLY'?'PACK_ONLY_EXCLUDING_EXCLUSIVE':'SEASONAL'};
 });
 const readiness=halloweenPackReadiness(settings,stock,normalCards),currentRates=halloweenCurrentRates(settings,stock);
 return {pack:HALLOWEEN_PACK,settings,cards:HALLOWEEN_PACK_CARDS,stock,normalCards,readiness,legacyAbsoluteRates,releaseEnabled,shopEnabled,userOpeningEnabled:shopEnabled&&releaseEnabled&&settings.mode==='ON'&&readiness.ready,acquisitionSource:HALLOWEEN_PACK.id,limitScope:'PER_CHARACTER_SERVER_WIDE',illustrationsPublished:true,drawModel:'SSS_THEN_HALLOWEEN',soldOutPolicy:'STANDARD_SSS',currentRates,effectiveNormalSssPercent:halloweenEffectivePercent(settings.normalRankRatesPpm.SSS,currentRates.normalSssRatePpm),effectiveCardPercents:Object.fromEntries(codes.map(code=>[code,halloweenEffectivePercent(settings.normalRankRatesPpm.SSS,currentRates.cardRatesPpm[code])]))};
}
export function halloweenPackCatalogRow(settings=halloweenPackDraft(),stockRows=[]){
 settings=readHalloweenPackSettings(settings);
 const enabled=HALLOWEEN_PACK_SHOP_ENABLED&&HALLOWEEN_PACK_RELEASE_ENABLED&&settings.mode==='ON',stock=halloweenPackState(settings,stockRows).stock;
 return {id:HALLOWEEN_PACK.id,name:HALLOWEEN_PACK.name,subtitle:'HALLOWEEN LIMITED',theme:'halloween',description:'할로윈 SS 8종 · SSS 리미티드 헬리오스·진무·발테르·족로',range:'일반 C~SSS · SS·SSS 리미티드',price:settings.prices.single,prices:settings.prices,allowed:[],drawMode:'MERCENARY_HALLOWEEN',drawEnabled:enabled,ownerDrawEnabled:false,maxDrawCount:10,imageUrl:HALLOWEEN_PACK.image,revealMode:'HALLOWEEN_FAST_GRID',comingSoon:!enabled,previewCards:HALLOWEEN_PACK_CARDS.map(({code,name,rank,thumbnailArt,group})=>({code,name,rank,thumbnailArt,group,...stock.find(s=>s.code===code)}))};
}
export function halloweenPackPrice(settings,count){
 if(![1,10].includes(count))throw Error('1회 또는 10회를 선택하세요.');
 const price=count===10?settings.prices.ten:settings.prices.single;
 if(!Number.isSafeInteger(price)||price<1)throw Error('할로윈팩 가격이 아직 설정되지 않았습니다.');return price;
}
export function validateHalloweenOpeningBody(body){
 if(!exact(body,['requestId','count','expectedRevision'])||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId)||![1,10].includes(body.count)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)throw Object.assign(Error('개봉 횟수와 설정 버전을 확인하세요.'),{code:'MERCENARY_HALLOWEEN_INPUT',status:400});return body;
}
export function pickHalloweenNormalCard(state,rank,random){
 const pool=state.normalCards.filter(c=>c.rank===rank&&c.weight>0),weight=pool.reduce((s,c)=>s+c.weight,0);
 if(!Number.isSafeInteger(weight)||weight<1)throw Object.assign(Error('일반 용병 획득 대상을 확인하세요.'),{code:'MERCENARY_HALLOWEEN_NORMAL_POOL',terminal:true,status:409});
 let ticket=random(weight);if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=weight)throw Error('Invalid random sample');
 const card=pool.find(c=>{ticket-=c.weight;return ticket<0;});
 return {outcomeId:'CARD_'+card.rank,mercenaryCode:card.code,name:card.name,rank:card.rank,edition:'STANDARD',quantity:1,sourceArt:card.sourceArt};
}
export function pickHalloweenBatch(state,count,random,{firstLimitedCode=null}={}){
 if(![1,10].includes(count))throw Error('Invalid Halloween batch');
 if(firstLimitedCode!==null&&(!HALLOWEEN_PACK_CARDS.some(c=>c.code===firstLimitedCode)||!(state.settings.cardRatesPpm[firstLimitedCode]>0)))throw Error('Invalid one-time Halloween limited card');
 const {settings}=state,used=Object.fromEntries(state.stock.map(s=>[s.code,s.issued]));
 const choose=rows=>{
  const units=rows.map(r=>limitedRateUnits(r.rate));if(units.some(n=>n===null)||units.reduce((s,n)=>s+n,0)!==LIMITED_RATE_TOTAL)throw Error('할로윈 단계별 확률을 확인하세요.');
  let ticket=random(LIMITED_RATE_TOTAL);if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=LIMITED_RATE_TOTAL)throw Error('Invalid random sample');
  return rows.find((r,i)=>{ticket-=units[i];return ticket<0;});
 };
 const draws=[];
 for(let i=0;i<count;i++){
  const forced=i===0&&firstLimitedCode!==null;
  const first=forced?{id:'SSS'}:choose([...MERCENARY_RANKS.map(rank=>({id:rank,rate:settings.normalRankRatesPpm[rank]})),{id:'NONE',rate:settings.missRatePpm}]);
  if(first.id==='NONE'){draws.push({outcomeId:'NONE',quantity:0});continue;}
  if(first.id==='SSS'){
   const second=forced?{id:firstLimitedCode}:choose([...codes.map(code=>({id:code,rate:settings.cardRatesPpm[code]})),{id:'STANDARD_SSS',rate:settings.normalSssRatePpm}]);
   if(second.id!=='STANDARD_SSS'){
    const card=HALLOWEEN_PACK_CARDS.find(c=>c.code===second.id),stock=state.stock.find(s=>s.code===card.code);
    if(!stock?.prepared)throw Object.assign(Error('리미티드 발행 수량을 확인해야 합니다.'),{code:'MERCENARY_HALLOWEEN_NOT_READY',terminal:true,status:409});
    if((used[card.code]||0)<stock.limit){
     used[card.code]=(used[card.code]||0)+1;
     draws.push({outcomeId:card.rank==='SSS'?'HALLOWEEN_SSS':'HALLOWEEN_SS',mercenaryCode:card.code,name:card.name,rank:card.rank,gateRank:'SSS',edition:card.rank==='SSS'?'SSS_LIMITED':'HALLOWEEN_LIMITED',stockLimit:stock.limit,quantity:1,sourceArt:card.sourceArt});continue;
    }
    // Keep every other interval unchanged. This interval now awards ordinary SSS,
    // including when an earlier draw in the same batch took the last copy.
   }
  }
  draws.push(pickHalloweenNormalCard(state,first.id,random));
 }
 return draws;
}
export function halloweenReceiptResults(receipt){
 if(receipt?.status!=='COMPLETED'||receipt.packId!==HALLOWEEN_PACK.id||![1,10].includes(receipt.count)||receipt.draws?.length!==receipt.count)throw Error('확정된 할로윈팩 결과가 필요합니다.');
 return receipt.draws.map((r,index)=>{const card=HALLOWEEN_PACK_CARDS.find(c=>c.code===r.mercenaryCode);return {...r,limited:Boolean(card),kind:r.mercenaryCode?'MERCENARY':'MISS',receiptId:receipt.requestId+':'+index,preview:false,granted:true,artUrl:card?'/'+card.displayArt:r.mercenaryCode?'/assets/ui/project-v/mercenaries/codex-v1/'+r.mercenaryCode.toLowerCase()+'-art-640.webp':null};});
}
