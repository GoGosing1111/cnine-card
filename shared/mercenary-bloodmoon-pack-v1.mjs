import {BLOODMOON_PACK_CARDS,bloodmoonStockLimit,isBloodmoonStockLimit} from './mercenary-bloodmoon-pool-v3.mjs?v=20261025-opening-v1';
import {PRIME_MATERIAL,PRIME_MATERIAL_STOCK_CODE,primeMaterialDraw,isPrimeMaterialDraw,bloodmoonDrawCode} from './mercenary-prime-material-v1.mjs';
import {BLOODMOON_MERCENARIES,BLOODMOON_ORIGINAL_CODES,BLOODMOON_SERVER_LIMIT} from './mercenary-bloodmoon-catalog-v1.mjs?v=20261025-opening-v1';
import {isLimitedRate,limitedRateUnits,LIMITED_RATE_TOTAL,LIMITED_RATE_SCALE} from './mercenary-limited-rates-v1.mjs';
import {MERCENARY_RANKS} from './mercenary-ranks-v1.mjs';
import {BLOODMOON_BULK_FORMAT,BLOODMOON_BULK_MAX_COUNT,bloodmoonBudget,validateBloodmoonBulkReceipt} from './mercenary-bloodmoon-bulk-v1.mjs?v=20261025-opening-v1';

// User authorized public opening on 2026-10-25. CMS mode and readiness still gate sales.
// CMS drafts, purchases and receipts are isolated from the Halloween pack.
export const BLOODMOON_PACK_RELEASE_ENABLED=true;
export const BLOODMOON_PACK_KEY='mercenary_bloodmoon_ss_pack_v1';
export {BLOODMOON_SERVER_LIMIT};
export const BLOODMOON_PACK=Object.freeze({id:'mercenary-bloodmoon-ss-limited',name:'블러드문팩',rank:'SSS',edition:'BLOODMOON_LIMITED',maxBatch:10,featurePath:'mercenaries/v3/bloodmoon-pack/feature',openPath:'mercenaries/v3/bloodmoon-pack/open',receiptPath:'mercenaries/v3/bloodmoon-pack/receipt',adminPath:'admin/mercenaries/bloodmoon-pack',image:'assets/ui/packs/blood-pack-20261023/pack-768.webp'});
export const BLOODMOON_NORMAL_RANKS=MERCENARY_RANKS;
export const BLOODMOON_OPEN_KIND='MERCENARY_BLOODMOON_OPEN';
const legacyCodes=BLOODMOON_ORIGINAL_CODES,codes=BLOODMOON_PACK_CARDS.map(c=>c.code);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
// Original codex registration format is retained for audit replay.
export function legacyBloodmoonPackDraft(){
 return {version:1,mode:'OFF',prices:{single:null,ten:null},cardRatesPpm:Object.fromEntries(legacyCodes.map(code=>[code,null])),stockLimits:Object.fromEntries(legacyCodes.map(code=>[code,BLOODMOON_SERVER_LIMIT])),missRatePpm:null};
}
export function bloodmoonPackDraft(){
 return {mode:'OFF',prices:{single:null,ten:null},missRatePpm:null,format:'MERCENARY_BLOODMOON_SS_PACK_V3',normalRankRatesPpm:Object.fromEntries(MERCENARY_RANKS.map(rank=>[rank,null])),normalSssRatePpm:null,cardRatesPpm:Object.fromEntries(codes.map(code=>[code,null])),stockLimits:Object.fromEntries(codes.map(code=>[code,bloodmoonStockLimit(code)]))};
}
export function validateBloodmoonPack(raw,{releaseEnabled=BLOODMOON_PACK_RELEASE_ENABLED}={}){
 if(!exact(raw,['format','mode','prices','normalRankRatesPpm','cardRatesPpm','normalSssRatePpm','missRatePpm','stockLimits'])||raw.format!=='MERCENARY_BLOODMOON_SS_PACK_V3'||!['OFF','ON'].includes(raw.mode)||!releaseEnabled&&raw.mode!=='OFF')throw Error('블러드문팩은 출시 준비 중입니다. OFF 초안만 저장할 수 있습니다.');
 if(!exact(raw.prices,['single','ten'])||Object.values(raw.prices).some(n=>n!==null&&(!Number.isSafeInteger(n)||n<1||n>100000000000000)))throw Error('가격은 미정 또는 1~100조 코인 정수로 입력하세요.');
 if(!exact(raw.normalRankRatesPpm,MERCENARY_RANKS)||!exact(raw.cardRatesPpm,codes))throw Error('일반 6등급·블러드 SS 6종·SSS 리미티드 3종의 확률을 확인하세요.');
 const first=[...Object.values(raw.normalRankRatesPpm),raw.missRatePpm],second=[...Object.values(raw.cardRatesPpm),raw.normalSssRatePpm];
 for(const rates of [first,second]){
  if(rates.some(n=>n!==null&&!isLimitedRate(n)))throw Error('확률은 미정 또는 0~100%, 소수점 8자리까지 입력하세요.');
  if(rates.reduce((sum,n)=>sum+(n===null?0:limitedRateUnits(n)),0)>LIMITED_RATE_TOTAL)throw Error('각 단계 확률 합계는 100%를 초과할 수 없습니다.');
 }
 if(!exact(raw.stockLimits,codes)||!codes.every(code=>isBloodmoonStockLimit(code,raw.stockLimits[code])))throw Error('블러드문 SS 각 10장, 레오넬 5장, 제너럴 족 3장, 프라임 재료 3장 한도를 확인하세요.');
 return structuredClone(raw);
}
export function readBloodmoonPackSettings(raw=bloodmoonPackDraft(),options){
 if(raw.version===1){
  if(!exact(raw,['version','mode','prices','cardRatesPpm','stockLimits','missRatePpm'])||raw.mode!=='OFF'||!exact(raw.cardRatesPpm,legacyCodes)||!exact(raw.stockLimits,legacyCodes)||Object.values(raw.stockLimits).some(n=>n!==BLOODMOON_SERVER_LIMIT)||!exact(raw.prices,['single','ten'])||Object.values(raw.prices).some(n=>n!==null&&(!Number.isSafeInteger(n)||n<1||n>100000000000000))||[...Object.values(raw.cardRatesPpm),raw.missRatePpm].some(n=>n!==null&&!isLimitedRate(n)))throw Error('기존 블러드문팩 초안 형식을 확인하세요.');
  // Loading is read-only. Never reinterpret old absolute odds as conditional odds.
  return {...bloodmoonPackDraft(),prices:{...raw.prices},missRatePpm:raw.missRatePpm};
 }
 // The previous eight-card V3 draft remains valid and unchanged in storage.
 // A newly listed SS starts unset; never redistribute a saved probability.
 if(raw.format==='MERCENARY_BLOODMOON_SS_PACK_V3'&&exact(raw.cardRatesPpm,codes.filter(c=>c!=='V-965'))&&exact(raw.stockLimits,codes.filter(c=>c!=='V-965'))){
  raw={...raw,cardRatesPpm:{...raw.cardRatesPpm,'V-965':null},stockLimits:{...raw.stockLimits,'V-965':10}};
 }
 // Legacy null SSS limits become the authorized limits in memory; storage is changed only by an audited save.
 if(raw.stockLimits&&codes.every(c=>Object.hasOwn(raw.stockLimits,c)))raw={...raw,stockLimits:Object.fromEntries(Object.entries(raw.stockLimits).map(([code,limit])=>[code,limit===null&&BLOODMOON_PACK_CARDS.some(c=>c.code===code&&c.rank==='SSS')?bloodmoonStockLimit(code):limit]))};
 return validateBloodmoonPack(raw,options);
}
export function bloodmoonPackReadiness(settings,stock=[],normalCards=[]){
 const blockers=[],first=[...Object.values(settings.normalRankRatesPpm),settings.missRatePpm],second=[...Object.values(settings.cardRatesPpm),settings.normalSssRatePpm];
 if(Object.values(settings.prices).some(n=>n===null))blockers.push('1회·10회 가격을 설정하세요.');
 if(first.some(n=>n===null)||first.reduce((s,n)=>s+(limitedRateUnits(n)||0),0)!==LIMITED_RATE_TOTAL)blockers.push('1단계 일반 등급·꽝 확률 합계를 100%로 설정하세요.');
 if(second.some(n=>n===null)||second.reduce((s,n)=>s+(limitedRateUnits(n)||0),0)!==LIMITED_RATE_TOTAL)blockers.push('SSS 내부의 블러드 SS 6종·SSS 리미티드 3종·일반 SSS 확률 합계를 100%로 설정하세요.');
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
export function bloodmoonEffectivePercent(sssRate,conditionalRate){
 const a=limitedRateUnits(sssRate),b=limitedRateUnits(conditionalRate);if(a===null||b===null)return null;
 const units=BigInt(a)*BigInt(b),scale=10n**18n,decimal=String(units%scale).padStart(18,'0').replace(/0+$/,'');
 return String(units/scale)+(decimal?'.'+decimal:'');
}
export function bloodmoonCurrentRates(settings,stock){
 const cardRatesPpm={...settings.cardRatesPpm};let ordinary=limitedRateUnits(settings.normalSssRatePpm);
 for(const row of stock){
  if(!row.prepared||row.remaining!==0)continue;
  const units=limitedRateUnits(cardRatesPpm[row.code]);cardRatesPpm[row.code]=units===null?null:0;
  ordinary=ordinary===null||units===null?null:ordinary+units;
 }
 return {cardRatesPpm,normalSssRatePpm:ordinary===null?null:ordinary/LIMITED_RATE_SCALE};
}
export function bloodmoonPackState(settings=bloodmoonPackDraft(),stockRows=[],normalCards=[],{releaseEnabled=BLOODMOON_PACK_RELEASE_ENABLED}={}){
 const legacyAbsoluteRates=settings.version===1?structuredClone(settings.cardRatesPpm):null;
 settings=readBloodmoonPackSettings(settings,{releaseEnabled});
 const stock=BLOODMOON_PACK_CARDS.map(c=>{
  const row=stockRows.find(s=>s.code===c.code),expected=settings.stockLimits[c.code],limit=row?Number(row.stock_limit):expected,issued=Number(row?.issued??0);
  if(!Number.isSafeInteger(issued)||issued<0||limit!==null&&(!Number.isSafeInteger(limit)||limit<1||issued>limit)||row&&expected!==null&&limit!==expected)throw Error('리미티드 발행 수량을 확인해야 합니다.');
  return {code:c.code,limit,issued,remaining:row?limit-issued:null,prepared:Boolean(row),scope:c.stockPolicy==='EXISTING_SHARED'?'EXISTING_SHARED':c.stockPolicy==='PACK_ONLY'?'PACK_ONLY_EXCLUDING_EXCLUSIVE':'SEASONAL'};
 });
 const readiness=bloodmoonPackReadiness(settings,stock,normalCards),currentRates=bloodmoonCurrentRates(settings,stock);
 return {pack:BLOODMOON_PACK,settings,cards:BLOODMOON_PACK_CARDS,stock,normalCards,readiness,legacyAbsoluteRates,releaseEnabled,userOpeningEnabled:releaseEnabled&&settings.mode==='ON'&&readiness.ready,acquisitionSource:BLOODMOON_PACK.id,limitScope:'PER_CHARACTER_SERVER_WIDE',illustrationsPublished:true,drawModel:'SSS_THEN_BLOODMOON',soldOutPolicy:'STANDARD_SSS',currentRates,effectiveNormalSssPercent:bloodmoonEffectivePercent(settings.normalRankRatesPpm.SSS,currentRates.normalSssRatePpm),effectiveCardPercents:Object.fromEntries(codes.map(code=>[code,bloodmoonEffectivePercent(settings.normalRankRatesPpm.SSS,currentRates.cardRatesPpm[code])]))};
}
export function bloodmoonPackCatalogRow(settings=bloodmoonPackDraft(),stockRows=[]){
 settings=readBloodmoonPackSettings(settings);
 const enabled=BLOODMOON_PACK_RELEASE_ENABLED&&settings.mode==='ON',stock=bloodmoonPackState(settings,stockRows).stock;
 return {id:BLOODMOON_PACK.id,name:BLOODMOON_PACK.name,subtitle:'BLOODMOON LIMITED',theme:'bloodmoon',description:'블러드 SS 6종 · SSS 리미티드 레오넬·제너럴 족 · 기운잃은 프라임 카드(제작 재료)',range:'일반 C~SSS · SS·SSS 리미티드',price:settings.prices.single,prices:settings.prices,allowed:[],drawMode:'MERCENARY_BLOODMOON',drawEnabled:enabled,ownerDrawEnabled:false,maxDrawCount:10,imageUrl:BLOODMOON_PACK.image,revealMode:'BLOODMOON_FAST_GRID',comingSoon:!enabled,previewCards:BLOODMOON_PACK_CARDS.map(({code,name,rank,thumbnailArt,group})=>({code,name,rank,thumbnailArt,group,...stock.find(s=>s.code===code)}))};
}
export function bloodmoonPackPrice(settings,count){
 if(![1,10].includes(count))throw Error('1회 또는 10회를 선택하세요.');
 const price=count===10?settings.prices.ten:settings.prices.single;
 if(!Number.isSafeInteger(price)||price<1)throw Error('블러드문팩 가격이 아직 설정되지 않았습니다.');return price;
}
export function validateBloodmoonOpeningBody(body){
 const bulk=body&&Object.hasOwn(body,'budget');
 if(!exact(body,bulk?['requestId','count','expectedRevision','budget']:['requestId','count','expectedRevision'])||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId)||(bulk?(!Number.isSafeInteger(body.count)||body.count<1||body.count>BLOODMOON_BULK_MAX_COUNT):![1,10].includes(body.count))||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)throw Object.assign(Error('개봉 횟수와 설정 버전을 확인하세요.'),{code:'MERCENARY_BLOODMOON_INPUT',status:400});
 if(bulk)bloodmoonBudget(body.budget);return body;
}
export function pickBloodmoonNormalCard(state,rank,random){
 const pool=state.normalCards.filter(c=>c.rank===rank&&c.weight>0),weight=pool.reduce((s,c)=>s+c.weight,0);
 if(!Number.isSafeInteger(weight)||weight<1)throw Object.assign(Error('일반 용병 획득 대상을 확인하세요.'),{code:'MERCENARY_BLOODMOON_NORMAL_POOL',terminal:true,status:409});
 let ticket=random(weight);if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=weight)throw Error('Invalid random sample');
 const card=pool.find(c=>{ticket-=c.weight;return ticket<0;});
 return {outcomeId:'CARD_'+card.rank,mercenaryCode:card.code,name:card.name,rank:card.rank,edition:'STANDARD',quantity:1,sourceArt:card.sourceArt};
}
export function pickBloodmoonBatch(state,count,random,{firstLimitedCode=null}={}){
 if(![1,10].includes(count))throw Error('Invalid Bloodmoon batch');
 if(firstLimitedCode!==null&&(!BLOODMOON_PACK_CARDS.some(c=>c.code===firstLimitedCode)||!(state.settings.cardRatesPpm[firstLimitedCode]>0)))throw Error('Invalid one-time Bloodmoon limited card');
 const {settings}=state,used=Object.fromEntries(state.stock.map(s=>[s.code,s.issued]));
 const choose=rows=>{
  const units=rows.map(r=>limitedRateUnits(r.rate));if(units.some(n=>n===null)||units.reduce((s,n)=>s+n,0)!==LIMITED_RATE_TOTAL)throw Error('블러드 단계별 확률을 확인하세요.');
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
    const card=BLOODMOON_PACK_CARDS.find(c=>c.code===second.id),stock=state.stock.find(s=>s.code===card.code);
    if(!stock?.prepared)throw Object.assign(Error('리미티드 발행 수량을 확인해야 합니다.'),{code:'MERCENARY_BLOODMOON_NOT_READY',terminal:true,status:409});
    if((used[card.code]||0)<stock.limit){
     used[card.code]=(used[card.code]||0)+1;
     const draw={outcomeId:card.rank==='SSS'?'BLOODMOON_SSS':'BLOODMOON_SS',mercenaryCode:card.code,name:card.name,rank:card.rank,gateRank:'SSS',edition:card.rank==='SSS'?'SSS_LIMITED':'BLOODMOON_LIMITED',stockLimit:stock.limit,quantity:1,sourceArt:card.sourceArt};
     draws.push(card.code===PRIME_MATERIAL_STOCK_CODE?primeMaterialDraw(draw):draw);continue;
    }
    // Keep every other interval unchanged. This interval now awards ordinary SSS,
    // including when an earlier draw in the same batch took the last copy.
   }
  }
  draws.push(pickBloodmoonNormalCard(state,first.id,random));
 }
 return draws;
}
export function bloodmoonReceiptResults(receipt){
 const result=(r,index)=>{
  if((r.kind==='ITEM'||r.itemCode||r.stockCode)&&!isPrimeMaterialDraw(r))throw Error('재료 카드 영수증을 확인하세요.');
  const item=isPrimeMaterialDraw(r),card=BLOODMOON_PACK_CARDS.find(c=>c.code===bloodmoonDrawCode(r));
  // Completed pre-change receipts still describe the mercenary actually granted.
  const art=item?PRIME_MATERIAL.image:r.mercenaryCode===PRIME_MATERIAL_STOCK_CODE?'assets/ui/packs/blood-pack-20261023/v-975-640.webp':card?.displayArt;
  return {...r,limited:Boolean(card),kind:item?'ITEM':r.mercenaryCode?'MERCENARY':'MISS',receiptId:receipt.requestId+':'+index,preview:false,granted:true,artUrl:art?'/'+art:r.mercenaryCode?'/assets/ui/project-v/mercenaries/codex-v1/'+r.mercenaryCode.toLowerCase()+'-art-640.webp':null};
 };
 if(receipt?.status==='COMPLETED'&&receipt.packId===BLOODMOON_PACK.id&&receipt.format===BLOODMOON_BULK_FORMAT){
  return validateBloodmoonBulkReceipt(receipt).map(r=>result(r,r.drawIndex??'bulk:'+r.mercenaryCode));
 }
 if(receipt?.status!=='COMPLETED'||receipt.packId!==BLOODMOON_PACK.id||![1,10].includes(receipt.count)||receipt.draws?.length!==receipt.count)throw Error('확정된 블러드문팩 결과가 필요합니다.');
 return receipt.draws.map(result);
}
