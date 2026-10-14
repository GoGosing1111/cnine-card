import {HALLOWEEN_MERCENARIES} from './mercenary-halloween-catalog-v1.mjs';
import {isLimitedRate,limitedRateUnits,LIMITED_RATE_TOTAL} from './mercenary-limited-rates-v1.mjs';

// 2026-10-14: publish the seven approved illustrations first. The OWNER sets
// prices and probabilities later; saving a draft must never open acquisition.
export const HALLOWEEN_PACK_RELEASE_ENABLED=false;
export const HALLOWEEN_PACK_KEY='mercenary_halloween_ss_pack_v1';
export const HALLOWEEN_SERVER_LIMIT=5;
export const HALLOWEEN_PACK=Object.freeze({id:'mercenary-halloween-ss-limited',name:'SS 할로윈 리미티드 팩',rank:'SS',edition:'HALLOWEEN_LIMITED',featurePath:'mercenary-halloween-pack/config',openPath:'mercenary-halloween-pack/open',adminPath:'admin/mercenaries/halloween-pack'});
const codes=HALLOWEEN_MERCENARIES.map(c=>c.code);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export function halloweenPackDraft(){
 return {format:'MERCENARY_HALLOWEEN_SS_PACK_V1',mode:'OFF',prices:{single:null,ten:null},cardRatesPpm:Object.fromEntries(codes.map(code=>[code,null])),missRatePpm:null,stockLimits:Object.fromEntries(codes.map(code=>[code,HALLOWEEN_SERVER_LIMIT]))};
}
export function validateHalloweenPack(raw){
 if(!exact(raw,['format','mode','prices','cardRatesPpm','missRatePpm','stockLimits'])||raw.format!=='MERCENARY_HALLOWEEN_SS_PACK_V1'||raw.mode!=='OFF')throw Error('할로윈 팩은 추후 개방 예정입니다. OFF 초안만 저장할 수 있습니다.');
 if(!exact(raw.prices,['single','ten'])||Object.values(raw.prices).some(n=>n!==null&&(!Number.isSafeInteger(n)||n<1||n>100000000000000)))throw Error('가격은 미정 또는 1~100조 코인 정수로 입력하세요.');
 if(!exact(raw.cardRatesPpm,codes)||[...Object.values(raw.cardRatesPpm),raw.missRatePpm].some(n=>n!==null&&!isLimitedRate(n)))throw Error('할로윈 7종과 꽝 확률은 미정 또는 0~100%로 입력하세요.');
 const rates=[...Object.values(raw.cardRatesPpm),raw.missRatePpm];
 if(rates.reduce((sum,n)=>sum+(n===null?0:limitedRateUnits(n)),0)>LIMITED_RATE_TOTAL)throw Error('할로윈 팩 확률 합계는 100%를 초과할 수 없습니다.');
 if(!exact(raw.stockLimits,codes)||Object.values(raw.stockLimits).some(n=>n!==HALLOWEEN_SERVER_LIMIT))throw Error('할로윈 리미티드는 캐릭터별 서버 전체 5장 한정입니다.');
 return structuredClone(raw);
}
export function halloweenPackState(settings=halloweenPackDraft(),stockRows=[]){
 settings=validateHalloweenPack(settings);
 const stock=HALLOWEEN_MERCENARIES.map(c=>{const row=stockRows.find(s=>s.code===c.code),issued=Number(row?.issued??0);if(!Number.isSafeInteger(issued)||issued<0||issued>HALLOWEEN_SERVER_LIMIT||row&&Number(row.stock_limit)!==HALLOWEEN_SERVER_LIMIT)throw Error('할로윈 발행 수량을 확인해야 합니다.');return {code:c.code,limit:HALLOWEEN_SERVER_LIMIT,issued,remaining:HALLOWEEN_SERVER_LIMIT-issued,prepared:Boolean(row)};});
 return {pack:HALLOWEEN_PACK,settings,cards:HALLOWEEN_MERCENARIES,stock,releaseEnabled:HALLOWEEN_PACK_RELEASE_ENABLED,userOpeningEnabled:false,acquisitionSource:HALLOWEEN_PACK.id,limitScope:'PER_CHARACTER_SERVER_WIDE',illustrationsPublished:true};
}
