// Preserve stored ppm fields: one ppm is now divisible into 10,000 integer
// tickets. No saved rates are rescaled or rewritten when this module loads.
export const LIMITED_RATE_SCALE=10000;
export const LIMITED_RATE_TOTAL=10000000000;
export const LIMITED_RATE_STEP='0.00000001';
const percentScale=100000000;
function decimalUnits(text,digits){
 if(typeof text!=='string'||!new RegExp('^(?:0|[1-9]\\d*)(?:\\.\\d{1,'+digits+'})?$').test(text.trim()))return null;
 const [whole,fraction='']=text.trim().split('.'),units=Number(whole)*10**digits+Number(fraction.padEnd(digits,'0'));
 return Number.isSafeInteger(units)?units:null;
}
export const limitedRateUnits=ppm=>typeof ppm==='number'&&Number.isFinite(ppm)?decimalUnits(String(ppm),4):null;
export const isLimitedRate=ppm=>{const units=limitedRateUnits(ppm);return units!==null&&units<=LIMITED_RATE_TOTAL;};
export function parseLimitedPercent(value){
 const units=decimalUnits(value,8);
 return units!==null&&units<=LIMITED_RATE_TOTAL?units/LIMITED_RATE_SCALE:null;
}
export function formatLimitedPercent(ppm){
 const units=limitedRateUnits(ppm);if(units===null)return '미설정';
 const whole=Math.floor(units/percentScale),fraction=String(units%percentScale).padStart(8,'0').replace(/0+$/,'');
 return String(whole)+(fraction?'.'+fraction:'');
}
