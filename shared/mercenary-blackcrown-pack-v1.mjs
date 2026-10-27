import {blackcrownOwnedCodes,blackcrownAcceptSs,blackcrownPersonalOdds} from './mercenary-blackcrown-ownership-v1.mjs';
import {BLACKCROWN_PACK_CARDS,BLACKCROWN_LIMITED_CARDS,isBlackcrownLimited,blackcrownUnlimitedDraw,blackcrownStockLimit,isBlackcrownStockLimit} from './mercenary-blackcrown-pool-v3.mjs?v=20261027-v1';
import {PRIME_MATERIAL,PRIME_MATERIAL_STOCK_CODE,primeMaterialDraw,isPrimeMaterialDraw,bloodmoonDrawCode} from './mercenary-prime-material-v1.mjs';
import {BLACKCROWN_SERVER_LIMIT} from './mercenary-blackcrown-catalog-v1.mjs?v=20261027-v1';
import {isLimitedRate,limitedRateUnits,LIMITED_RATE_TOTAL,LIMITED_RATE_SCALE} from './mercenary-limited-rates-v1.mjs';
import {MERCENARY_RANKS} from './mercenary-ranks-v1.mjs';
import {BLACKCROWN_BULK_FORMAT,BLACKCROWN_BULK_MAX_COUNT,blackcrownBudget,validateBlackcrownBulkReceipt} from './mercenary-blackcrown-bulk-v1.mjs?v=20261027-v1';

// User requested a separate Black Crown pack on 2026-10-27. CMS mode and readiness still gate sales.
// CMS drafts, purchases and receipts use independent Black Crown identities.
export const BLACKCROWN_PACK_RELEASE_ENABLED=true;
export const BLACKCROWN_PACK_KEY='mercenary_blackcrown_ss_pack_v1';
export {BLACKCROWN_SERVER_LIMIT};
export const BLACKCROWN_PACK=Object.freeze({id:'mercenary-blackcrown-ss-limited',name:'블랙크라운팩',rank:'SSS',edition:'BLACKCROWN_LIMITED',maxBatch:10,featurePath:'mercenaries/v3/blackcrown-pack/feature',openPath:'mercenaries/v3/blackcrown-pack/open',receiptPath:'mercenaries/v3/blackcrown-pack/receipt',adminPath:'admin/mercenaries/blackcrown-pack',image:'assets/ui/packs/black-crown-20261027-v1/pack-768.webp'});
export const BLACKCROWN_NORMAL_RANKS=MERCENARY_RANKS;
export const BLACKCROWN_OPEN_KIND='MERCENARY_BLACKCROWN_OPEN';
const codes=BLACKCROWN_PACK_CARDS.map(c=>c.code),stockCodes=BLACKCROWN_LIMITED_CARDS.map(c=>c.code);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export function blackcrownPackDraft(){
 return {mode:'OFF',prices:{single:null,ten:null},missRatePpm:null,format:'MERCENARY_BLACKCROWN_SS_PACK_V3',normalRankRatesPpm:Object.fromEntries(MERCENARY_RANKS.map(rank=>[rank,null])),normalSssRatePpm:null,cardRatesPpm:Object.fromEntries(codes.map(code=>[code,null])),stockLimits:Object.fromEntries(stockCodes.map(code=>[code,blackcrownStockLimit(code)]))};
}
export function validateBlackcrownPack(raw,{releaseEnabled=BLACKCROWN_PACK_RELEASE_ENABLED}={}){
 if(!exact(raw,['format','mode','prices','normalRankRatesPpm','cardRatesPpm','normalSssRatePpm','missRatePpm','stockLimits'])||raw.format!=='MERCENARY_BLACKCROWN_SS_PACK_V3'||!['OFF','ON'].includes(raw.mode)||!releaseEnabled&&raw.mode!=='OFF')throw Error('블랙크라운팩은 출시 준비 중입니다. OFF 초안만 저장할 수 있습니다.');
 if(!exact(raw.prices,['single','ten'])||Object.values(raw.prices).some(n=>n!==null&&(!Number.isSafeInteger(n)||n<1||n>100000000000000)))throw Error('가격은 미정 또는 1~100조 코인 정수로 입력하세요.');
 if(!exact(raw.normalRankRatesPpm,MERCENARY_RANKS)||!exact(raw.cardRatesPpm,codes))throw Error('일반 6등급·블랙크라운 SS 6종·일반 SSS 라자크의 확률을 확인하세요.');
 const first=[...Object.values(raw.normalRankRatesPpm),raw.missRatePpm],second=[...Object.values(raw.cardRatesPpm),raw.normalSssRatePpm];
 for(const rates of [first,second]){
  if(rates.some(n=>n!==null&&!isLimitedRate(n)))throw Error('확률은 미정 또는 0~100%, 소수점 8자리까지 입력하세요.');
  if(rates.reduce((sum,n)=>sum+(n===null?0:limitedRateUnits(n)),0)>LIMITED_RATE_TOTAL)throw Error('각 단계 확률 합계는 100%를 초과할 수 없습니다.');
 }
 if(!exact(raw.stockLimits,stockCodes)||!stockCodes.every(code=>isBlackcrownStockLimit(code,raw.stockLimits[code])))throw Error('한정 수량 한도는 용병별 1~1,000,000장의 정수로 확인하세요.');
 return structuredClone(raw);
}
export function readBlackcrownPackSettings(raw=blackcrownPackDraft(),options){
 // Read the superseded registration without reintroducing its removed rewards.
 // Existing current-mode and stock changes remain authoritative.
 const removed=['V-978','V-974','V-975','V-973'];
 if(exact(raw.cardRatesPpm,[...codes,...removed])&&exact(raw.stockLimits,[...stockCodes,...removed])){
  raw=structuredClone(raw);let units=limitedRateUnits(raw.normalSssRatePpm);
  for(const code of removed){const rate=limitedRateUnits(raw.cardRatesPpm[code]);units=units===null||rate===null?null:units+rate;delete raw.cardRatesPpm[code];delete raw.stockLimits[code];}
  raw.normalSssRatePpm=units===null?null:units/LIMITED_RATE_SCALE;
 }
 return validateBlackcrownPack(raw,options);
}
export function blackcrownPackReadiness(settings,stock=[],normalCards=[]){
 const blockers=[],first=[...Object.values(settings.normalRankRatesPpm),settings.missRatePpm],second=[...Object.values(settings.cardRatesPpm),settings.normalSssRatePpm];
 if(Object.values(settings.prices).some(n=>n===null))blockers.push('1회·10회 가격을 설정하세요.');
 if(first.some(n=>n===null)||first.reduce((s,n)=>s+(limitedRateUnits(n)||0),0)!==LIMITED_RATE_TOTAL)blockers.push('1단계 일반 등급·꽝 확률 합계를 100%로 설정하세요.');
 if(second.some(n=>n===null)||second.reduce((s,n)=>s+(limitedRateUnits(n)||0),0)!==LIMITED_RATE_TOTAL)blockers.push('SSS 내부의 블랙크라운 SS 6종·일반 SSS 라자크·일반 SSS 확률 합계를 100%로 설정하세요.');
 for(const rank of MERCENARY_RANKS){
  // Ordinary SSS is also the destination of every exhausted limited interval.
  const needed=settings.normalRankRatesPpm[rank]>0;
  if(needed&&!normalCards.some(c=>c.rank===rank&&c.weight>0))blockers.push(rank+' 일반 용병 획득 대상을 확인하세요.');
 }
 if(!(settings.normalRankRatesPpm.SSS>0)||!Object.values(settings.cardRatesPpm).some(n=>n>0))blockers.push('SSS 진입 확률과 내부 리미티드 확률을 설정하세요.');
 const selected=stockCodes.filter(code=>settings.cardRatesPpm[code]>0);
 for(const code of selected)if(!stock.find(s=>s.code===code)?.prepared)blockers.push(code+'의 한정 수량을 확인하세요.');
 // Empty stock redirects to ordinary SSS; it never closes an otherwise ready pack.
 return {ready:!blockers.length,blockers};
}
export function blackcrownEffectivePercent(sssRate,conditionalRate){
 const a=limitedRateUnits(sssRate),b=limitedRateUnits(conditionalRate);if(a===null||b===null)return null;
 const units=BigInt(a)*BigInt(b),scale=10n**18n,decimal=String(units%scale).padStart(18,'0').replace(/0+$/,'');
 return String(units/scale)+(decimal?'.'+decimal:'');
}
export function blackcrownCurrentRates(settings,stock){
 const cardRatesPpm={...settings.cardRatesPpm};let ordinary=limitedRateUnits(settings.normalSssRatePpm);
 for(const row of stock){
  if(!row.prepared||row.remaining!==0)continue;
  const units=limitedRateUnits(cardRatesPpm[row.code]);cardRatesPpm[row.code]=units===null?null:0;
  ordinary=ordinary===null||units===null?null:ordinary+units;
 }
 return {cardRatesPpm,normalSssRatePpm:ordinary===null?null:ordinary/LIMITED_RATE_SCALE};
}
export function blackcrownPackState(settings=blackcrownPackDraft(),stockRows=[],normalCards=[],{releaseEnabled=BLACKCROWN_PACK_RELEASE_ENABLED,ownedCodes=[]}={}){
 settings=readBlackcrownPackSettings(settings,{releaseEnabled});
 const stock=BLACKCROWN_LIMITED_CARDS.map(c=>{
  const row=stockRows.find(s=>s.code===c.code),expected=settings.stockLimits[c.code],limit=row?Number(row.stock_limit):expected,issued=Number(row?.issued??0);
  if(!Number.isSafeInteger(issued)||issued<0||limit!==null&&(!Number.isSafeInteger(limit)||limit<1||issued>limit)||row&&expected!==null&&limit!==expected)throw Error('리미티드 발행 수량을 확인해야 합니다.');
  return {code:c.code,limit,issued,remaining:row?limit-issued:null,prepared:Boolean(row),scope:c.stockPolicy==='EXISTING_SHARED'?'EXISTING_SHARED':c.stockPolicy==='PACK_ONLY'?'PACK_ONLY_EXCLUDING_EXCLUSIVE':'SEASONAL'};
 });
 const readiness=blackcrownPackReadiness(settings,stock,normalCards),currentRates=blackcrownCurrentRates(settings,stock);
 return {pack:BLACKCROWN_PACK,settings,cards:BLACKCROWN_PACK_CARDS,stock,normalCards,readiness,releaseEnabled,userOpeningEnabled:releaseEnabled&&settings.mode==='ON'&&readiness.ready,acquisitionSource:BLACKCROWN_PACK.id,limitScope:'PER_CHARACTER_SERVER_WIDE',illustrationsPublished:true,drawModel:'SSS_THEN_BLACKCROWN',soldOutPolicy:'STANDARD_SSS',currentRates,effectiveNormalSssPercent:blackcrownEffectivePercent(settings.normalRankRatesPpm.SSS,currentRates.normalSssRatePpm),effectiveCardPercents:Object.fromEntries(codes.map(code=>[code,blackcrownEffectivePercent(settings.normalRankRatesPpm.SSS,currentRates.cardRatesPpm[code])])),...blackcrownPersonalOdds(settings,stock,ownedCodes)};
}
export function blackcrownPackCatalogRow(settings=blackcrownPackDraft(),stockRows=[]){
 settings=readBlackcrownPackSettings(settings);
 const enabled=BLACKCROWN_PACK_RELEASE_ENABLED&&settings.mode==='ON',stock=blackcrownPackState(settings,stockRows).stock;
 return {id:BLACKCROWN_PACK.id,name:BLACKCROWN_PACK.name,subtitle:'BLACKCROWN LIMITED',theme:'blackcrown',description:'블랙크라운 SS 리미티드 6종 · 각 10장 · 일반 SSS 라자크(한도 없음)',range:'일반 C~SSS · SS 리미티드',price:settings.prices.single,prices:settings.prices,allowed:[],drawMode:'MERCENARY_BLACKCROWN',drawEnabled:enabled,ownerDrawEnabled:false,maxDrawCount:10,imageUrl:BLACKCROWN_PACK.image,revealMode:'BLACKCROWN_FAST_GRID',comingSoon:!enabled,previewCards:BLACKCROWN_PACK_CARDS.map(({code,name,rank,thumbnailArt,group,stockPolicy})=>({code,name,rank,thumbnailArt,group,stockPolicy,...stock.find(s=>s.code===code)}))};
}
export function blackcrownPackPrice(settings,count){
 if(![1,10].includes(count))throw Error('1회 또는 10회를 선택하세요.');
 const price=count===10?settings.prices.ten:settings.prices.single;
 if(!Number.isSafeInteger(price)||price<1)throw Error('블랙크라운팩 가격이 아직 설정되지 않았습니다.');return price;
}
export function validateBlackcrownOpeningBody(body){
 const bulk=body&&Object.hasOwn(body,'budget');
 if(!exact(body,bulk?['requestId','count','expectedRevision','budget']:['requestId','count','expectedRevision'])||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId)||(bulk?(!Number.isSafeInteger(body.count)||body.count<1||body.count>BLACKCROWN_BULK_MAX_COUNT):![1,10].includes(body.count))||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)throw Object.assign(Error('개봉 횟수와 설정 버전을 확인하세요.'),{code:'MERCENARY_BLACKCROWN_INPUT',status:400});
 if(bulk)blackcrownBudget(body.budget);return body;
}
export function pickBlackcrownNormalCard(state,rank,random){
 const pool=state.normalCards.filter(c=>c.rank===rank&&c.weight>0),weight=pool.reduce((s,c)=>s+c.weight,0);
 if(!Number.isSafeInteger(weight)||weight<1)throw Object.assign(Error('일반 용병 획득 대상을 확인하세요.'),{code:'MERCENARY_BLACKCROWN_NORMAL_POOL',terminal:true,status:409});
 let ticket=random(weight);if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=weight)throw Error('Invalid random sample');
 const card=pool.find(c=>{ticket-=c.weight;return ticket<0;});
 return {outcomeId:'CARD_'+card.rank,mercenaryCode:card.code,name:card.name,rank:card.rank,edition:'STANDARD',quantity:1,sourceArt:card.sourceArt};
}
export function pickBlackcrownBatch(state,count,random){
 if(![1,10].includes(count))throw Error('Invalid Blackcrown batch');
 const {settings}=state,used=Object.fromEntries(state.stock.map(s=>[s.code,s.issued]));
 const choose=rows=>{
  const units=rows.map(r=>limitedRateUnits(r.rate));if(units.some(n=>n===null)||units.reduce((s,n)=>s+n,0)!==LIMITED_RATE_TOTAL)throw Error('블랙크라운 단계별 확률을 확인하세요.');
  let ticket=random(LIMITED_RATE_TOTAL);if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=LIMITED_RATE_TOTAL)throw Error('Invalid random sample');
  return rows.find((r,i)=>{ticket-=units[i];return ticket<0;});
 };
 const draws=[],owned=new Set(blackcrownOwnedCodes(state.ownedCodes));
 for(let i=0;i<count;i++){
  const first=choose([...MERCENARY_RANKS.map(rank=>({id:rank,rate:settings.normalRankRatesPpm[rank]})),{id:'NONE',rate:settings.missRatePpm}]);
  if(first.id==='NONE'){draws.push({outcomeId:'NONE',quantity:0});continue;}
  if(first.id==='SSS'){
   const second=choose([...codes.map(code=>({id:code,rate:settings.cardRatesPpm[code]})),{id:'STANDARD_SSS',rate:settings.normalSssRatePpm}]);
   if(second.id!=='STANDARD_SSS'){
    const unlimited=blackcrownUnlimitedDraw(second.id);
    if(unlimited){draws.push(unlimited);continue;}
    const card=BLACKCROWN_PACK_CARDS.find(c=>c.code===second.id),stock=state.stock.find(s=>s.code===card.code);
    if(!stock?.prepared)throw Object.assign(Error('리미티드 발행 수량을 확인해야 합니다.'),{code:'MERCENARY_BLACKCROWN_NOT_READY',terminal:true,status:409});
    if((used[card.code]||0)<stock.limit&&blackcrownAcceptSs(card.code,owned,random)){
     used[card.code]=(used[card.code]||0)+1;
     if(card.rank==='SS')owned.add(card.code);
     const draw={outcomeId:card.rank==='SSS'?'BLACKCROWN_SSS':'BLACKCROWN_SS',mercenaryCode:card.code,name:card.name,rank:card.rank,gateRank:'SSS',edition:card.rank==='SSS'?'SSS_LIMITED':'BLACKCROWN_LIMITED',stockLimit:stock.limit,quantity:1,sourceArt:card.sourceArt};
     draws.push(card.code===PRIME_MATERIAL_STOCK_CODE?primeMaterialDraw(draw):draw);continue;
    }
    // Keep every other interval unchanged. This interval now awards ordinary SSS,
    // including when an earlier draw in the same batch took the last copy.
   }
  }
  draws.push(pickBlackcrownNormalCard(state,first.id,random));
 }
 return draws;
}
export function blackcrownReceiptResults(receipt){
 const result=(r,index)=>{
  if((r.kind==='ITEM'||r.itemCode||r.stockCode)&&!isPrimeMaterialDraw(r))throw Error('재료 카드 영수증을 확인하세요.');
  const item=isPrimeMaterialDraw(r),card=BLACKCROWN_PACK_CARDS.find(c=>c.code===bloodmoonDrawCode(r));
  // Completed pre-change receipts still describe the mercenary actually granted.
  const art=item?PRIME_MATERIAL.image:r.mercenaryCode===PRIME_MATERIAL_STOCK_CODE?'assets/ui/packs/blood-pack-20261023/v-975-640.webp':card?.displayArt;
  return {...r,limited:isBlackcrownLimited(bloodmoonDrawCode(r)),kind:item?'ITEM':r.mercenaryCode?'MERCENARY':'MISS',receiptId:receipt.requestId+':'+index,preview:false,granted:true,artUrl:art?'/'+art:r.mercenaryCode?'/assets/ui/project-v/mercenaries/codex-v1/'+r.mercenaryCode.toLowerCase()+'-art-640.webp':null};
 };
 if(receipt?.status==='COMPLETED'&&receipt.packId===BLACKCROWN_PACK.id&&receipt.format===BLACKCROWN_BULK_FORMAT){
  return validateBlackcrownBulkReceipt(receipt).map(r=>result(r,r.drawIndex??'bulk:'+r.mercenaryCode));
 }
 if(receipt?.status!=='COMPLETED'||receipt.packId!==BLACKCROWN_PACK.id||![1,10].includes(receipt.count)||receipt.draws?.length!==receipt.count)throw Error('확정된 블랙크라운팩 결과가 필요합니다.');
 return receipt.draws.map(result);
}
