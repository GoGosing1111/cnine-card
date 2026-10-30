import {BLACKCROWN_CODES} from './mercenary-blackcrown-catalog-v1.mjs';
import {limitedRateUnits} from './mercenary-limited-rates-v1.mjs';

export const BLACKCROWN_OWNERSHIP_RULE=Object.freeze({basis:'CURRENT_DISTINCT_BLACKCROWN_SS',duplicatesAllowed:false,threshold:2,divisors:Object.freeze([1,1,2,4,8,16,32]),fallback:'STANDARD_SSS'});
export function blackcrownOwnedCodes(rows=[]){
 return [...new Set(rows.filter(row=>typeof row==='string'||Number(row.total_copies??row.totalCopies)>0).map(row=>typeof row==='string'?row:row.mercenary_code??row.code).filter(code=>BLACKCROWN_CODES.includes(code)))].sort();
}
export const blackcrownDivisor=codes=>2**Math.max(0,blackcrownOwnedCodes(codes).length-1);
export function blackcrownAcceptSs(code,owned,random){
 if(!BLACKCROWN_CODES.includes(code))return true;
 // Both single/batch and bulk update this set immediately after each new SS.
 // An owned interval keeps its probability mass in ordinary SSS, never another SS.
 if(owned.has(code))return false;
 const divisor=blackcrownDivisor([...owned]);
 if(divisor===1)return true;
 // A separate exact binary gate preserves even the smallest configured rate.
 // No rounding, redistribution among rare cards, or extra rank lottery.
 const ticket=random(32);if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=32)throw Error('Invalid random sample');
 return ticket<32/divisor;
}
function decimal(numerator,denominator){
 const whole=numerator/denominator;let rest=numerator%denominator,tail='';
 while(rest){rest*=10n;tail+=String(rest/denominator);rest%=denominator;}
 return String(whole)+(tail?'.'+tail:'');
}
export function blackcrownPersonalOdds(settings,stock,ownedCodes=[]){
 const codes=blackcrownOwnedCodes(ownedCodes),divisor=blackcrownDivisor(codes),first=limitedRateUnits(settings.normalRankRatesPpm.SSS);
 let ordinary=limitedRateUnits(settings.normalSssRatePpm);ordinary=ordinary===null?null:ordinary*32;
 const effectiveCardPercents={},cardRatesPpm={};
 for(const [code,rate] of Object.entries(settings.cardRatesPpm)){
  const base=limitedRateUnits(rate),row=stock.find(s=>s.code===code),soldOut=row?.prepared&&row.remaining===0;
  const excluded=soldOut||codes.includes(code);
  const weight=base===null?null:excluded?0:base*32/(BLACKCROWN_CODES.includes(code)?divisor:1);
  if(base===null||ordinary===null)ordinary=null;else ordinary+=base*32-weight;
  cardRatesPpm[code]=weight===null?null:weight/32/10000;
  effectiveCardPercents[code]=first===null||weight===null?null:decimal(BigInt(first)*BigInt(weight),32n*10n**18n);
 }
 return {ownershipRule:BLACKCROWN_OWNERSHIP_RULE,ownedCodes:codes,ownedDistinctCount:codes.length,ssProbabilityDivisor:divisor,currentRates:{cardRatesPpm,normalSssRatePpm:ordinary===null?null:ordinary/32/10000},effectiveCardPercents,effectiveNormalSssPercent:first===null||ordinary===null?null:decimal(BigInt(first)*BigInt(ordinary),32n*10n**18n)};
}
