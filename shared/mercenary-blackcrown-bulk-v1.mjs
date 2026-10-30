import {blackcrownOwnedCodes,blackcrownAcceptSs} from './mercenary-blackcrown-ownership-v1.mjs';
import {BLACKCROWN_PACK_CARDS,isBlackcrownLimited,blackcrownUnlimitedDraw} from './mercenary-blackcrown-pool-v3.mjs?v=20261027-v1';
import {PRIME_MATERIAL_STOCK_CODE,primeMaterialDraw,isPrimeMaterialDraw,bloodmoonDrawCode} from './mercenary-prime-material-v1.mjs';
import {MERCENARY_RANKS} from './mercenary-ranks-v1.mjs';
import {limitedRateUnits,LIMITED_RATE_TOTAL} from './mercenary-limited-rates-v1.mjs';

export const BLACKCROWN_BULK_FORMAT='BLACKCROWN_BULK_V1';
export const BLACKCROWN_BULK_MAX_COST='100000000000000';
export const BLACKCROWN_BULK_MAX_COUNT=100000;
// Reference for the locked preparation screen only, not a saved price or odds.
export const BLACKCROWN_BULK_REFERENCE_PRICES=Object.freeze({single:1000000000,ten:10000000000});
export const BLACKCROWN_BULK_PRESETS=Object.freeze(['10000000000','100000000000','1000000000000','10000000000000','50000000000000','100000000000000']);
export function blackcrownCoinText(value){
 let rest=BigInt(value);const parts=[];
 for(const [unit,label] of [[1000000000000n,'조'],[100000000n,'억'],[10000n,'만'],[1n,'']]){const amount=rest/unit;if(amount){parts.push(amount.toLocaleString('ko-KR')+label);rest%=unit;}}
 return (parts.join(' ')||'0')+' 코인';
}
const fail=message=>Object.assign(Error(message),{code:'MERCENARY_BLACKCROWN_INPUT',status:400});
export function blackcrownBudget(value){
 if(typeof value!=='string'||!/^\d{1,15}$/.test(value)||BigInt(value)<1n||BigInt(value)>BigInt(BLACKCROWN_BULK_MAX_COST))throw fail('사용 한도는 1~100조 코인 정수로 입력하세요.');
 return BigInt(value);
}
export function blackcrownBulkQuote(prices,budget){
 const cap=blackcrownBudget(budget);
 if(!prices||![prices.single,prices.ten].every(n=>Number.isSafeInteger(n)&&n>0&&n<=1e14))throw fail('블랙크라운팩 가격을 먼저 설정하세요.');
 const one=BigInt(prices.single),ten=BigInt(prices.ten);
 // Buy the best-value combination of the existing 1/10 prices. No new discount.
 let count,cost;
 if(ten<=one*10n){
  const tens=cap/ten,singles=(cap%ten)/one;
  count=tens*10n+singles;cost=tens*ten+singles*one;
 }else{count=cap/one;cost=count*one;}
 if(count<1n)throw fail('최소 1회 개봉 금액 이상을 입력하세요.');
 if(count>BigInt(BLACKCROWN_BULK_MAX_COUNT))throw fail('한 번에 최대 100,000회입니다. 사용 한도를 낮춰 주세요.');
 return Object.freeze({budget:String(cap),count:Number(count),coinCost:Number(cost),unused:String(cap-cost)});
}
export function blackcrownBulkPriceSource(config){
 const saved=config?.settings?.prices;
 return saved&&[saved.single,saved.ten].every(n=>Number.isSafeInteger(n)&&n>0)
  ?{prices:saved,reference:false}:{prices:BLACKCROWN_BULK_REFERENCE_PRICES,reference:true};
}
export function addBlackcrownNormal(rows,draw){
 const prior=rows.find(r=>r.mercenaryCode===draw.mercenaryCode);
 if(prior)prior.quantity+=draw.quantity;else{const {drawIndex,...row}=draw;rows.push(row);}
}
// One O(count) lottery in memory; ordinary results occupy O(card types), not O(count).
// Cumulative integer intervals exactly preserve the existing two-stage odds.
export function pickBlackcrownBulk(state,count,random,{firstLimitedCode=null}={}){
 if(!Number.isSafeInteger(count)||count<1||count>BLACKCROWN_BULK_MAX_COUNT)throw fail('대량 개봉 횟수를 확인하세요.');
 const table=(rows,total)=>{
  let sum=0;const choices=rows.map(r=>{const weight=r.weight;if(!Number.isSafeInteger(weight)||weight<0)throw fail('추첨 가중치를 확인하세요.');sum+=weight;return {...r,end:sum};});
  if(!Number.isSafeInteger(sum)||sum<1||total!==undefined&&sum!==total)throw fail('단계별 확률 합계를 확인하세요.');
  return ()=>{const n=random(sum);if(!Number.isSafeInteger(n)||n<0||n>=sum)throw Error('Invalid random sample');return choices.find(r=>n<r.end).value;};
 };
 const first=table([...MERCENARY_RANKS.map(rank=>({value:rank,weight:limitedRateUnits(state.settings.normalRankRatesPpm[rank])})),{value:'NONE',weight:limitedRateUnits(state.settings.missRatePpm)}],LIMITED_RATE_TOTAL);
 const second=table([...BLACKCROWN_PACK_CARDS.map(c=>({value:c.code,weight:limitedRateUnits(state.settings.cardRatesPpm[c.code])})),{value:'STANDARD_SSS',weight:limitedRateUnits(state.settings.normalSssRatePpm)}],LIMITED_RATE_TOTAL);
 const owned=new Set(blackcrownOwnedCodes(state.ownedCodes)),normal=new Map(),remaining=new Map(state.stock.map(s=>[s.code,s.remaining]));
 const normalCard=rank=>{
  if(!normal.has(rank))normal.set(rank,table(state.normalCards.filter(c=>c.rank===rank&&c.weight>0).map(c=>({value:c,weight:c.weight}))));
  const c=normal.get(rank)();return {outcomeId:'CARD_'+rank,mercenaryCode:c.code,name:c.name,rank,edition:'STANDARD',quantity:1};
 };
 const result={format:BLACKCROWN_BULK_FORMAT,draws:[],normalDraws:[],missCount:0};
 const limited=(code,index)=>{
  const c=BLACKCROWN_PACK_CARDS.find(c=>c.code===code),s=state.stock.find(s=>s.code===code);
  if(!isBlackcrownLimited(code)||!c||!s?.prepared)throw fail('리미티드 발행 수량을 확인하세요.');
  if(!(remaining.get(code)>0)||!blackcrownAcceptSs(code,owned,random))return false;
  if(c.rank==='SS')owned.add(code);
  // Bound the serial ledger and transaction even if future stock policies grow.
  if(result.draws.length>=256)throw fail('리미티드 결과가 많습니다. 사용 한도를 낮춰 주세요.');
  remaining.set(code,remaining.get(code)-1);
  const draw={outcomeId:c.rank==='SSS'?'BLACKCROWN_SSS':'BLACKCROWN_SS',mercenaryCode:c.code,name:c.name,rank:c.rank,gateRank:'SSS',edition:c.rank==='SSS'?'SSS_LIMITED':'BLACKCROWN_LIMITED',stockLimit:s.limit,quantity:1,drawIndex:index};
  result.draws.push(c.code===PRIME_MATERIAL_STOCK_CODE?primeMaterialDraw(draw):draw);return true;
 };
 // Reserve an explicitly authorized guarantee before the normal lottery.
 if(firstLimitedCode){if(!BLACKCROWN_PACK_CARDS.some(c=>c.code===firstLimitedCode&&c.rank==='SSS')||!(state.settings.cardRatesPpm[firstLimitedCode]>0)||!limited(firstLimitedCode,0))throw fail('1회 확정 보상 수량을 확인하세요.');result.draws[0].guaranteed=true;}
 for(let i=0;i<count;i++){
  if(firstLimitedCode&&i===0)continue;
  const rank=first();if(rank==='NONE'){result.missCount++;continue;}
  if(rank==='SSS'){const code=second(),unlimited=blackcrownUnlimitedDraw(code);if(unlimited){addBlackcrownNormal(result.normalDraws,unlimited);continue;}if(code!=='STANDARD_SSS'&&limited(code,i))continue;}
  addBlackcrownNormal(result.normalDraws,normalCard(rank));
 }
 result.draws.sort((a,b)=>a.drawIndex-b.drawIndex);result.normalDraws.sort((a,b)=>a.mercenaryCode.localeCompare(b.mercenaryCode));return result;
}
export function validateBlackcrownBulkReceipt(receipt){
 const {count,draws,normalDraws,missCount}=receipt;
 if(receipt.format!==BLACKCROWN_BULK_FORMAT||!Number.isSafeInteger(count)||count<1||count>BLACKCROWN_BULK_MAX_COUNT||!Array.isArray(draws)||draws.length>256||!Array.isArray(normalDraws)||normalDraws.length>1000||!Number.isSafeInteger(missCount)||missCount<0)throw Error('대량 개봉 영수증을 확인하세요.');
 const codes=new Set(),indices=new Set();let total=missCount;
 for(const r of normalDraws){if(!r.mercenaryCode||codes.has(r.mercenaryCode)||isBlackcrownLimited(r.mercenaryCode)||!MERCENARY_RANKS.includes(r.rank)||!Number.isSafeInteger(r.quantity)||r.quantity<1)throw Error('일반 용병 수량을 확인하세요.');codes.add(r.mercenaryCode);total+=r.quantity;}
 for(const r of draws){if((r.kind==='ITEM'||r.itemCode||r.stockCode)&&!isPrimeMaterialDraw(r)||!(isBlackcrownLimited(bloodmoonDrawCode(r))&&BLACKCROWN_PACK_CARDS.some(c=>c.code===bloodmoonDrawCode(r)&&c.rank===r.rank))||r.quantity!==1||!Number.isSafeInteger(r.drawIndex)||r.drawIndex<0||r.drawIndex>=count||indices.has(r.drawIndex))throw Error('리미티드 개봉 영수증을 확인하세요.');indices.add(r.drawIndex);total++;}
 if(total!==count)throw Error('개봉 횟수와 결과 수량이 일치하지 않습니다.');
 return [...normalDraws,...draws,...(missCount?[{outcomeId:'NONE',quantity:missCount}]:[])];
}
