// ICON enhancement is separate from ordinary card shards and FUR breakthrough.
export const ICON_ENHANCEMENT_KEY='icon_enhancement_settings_v1';
export const ICON_ENHANCEMENT_POLICY=Object.freeze({version:'20261024-v1',maxLevel:10,successRate:10,chanceTotal:1000000,successChance:100000,basePower:180000,powerBonusPerLevel:20,failure:'KEEP_LEVEL',pity:false,duplicateCards:0});
export const iconEnhancementLevel=value=>Math.max(0,Math.min(10,Math.floor(Number(value)||0)));
export const iconEnhancementMultiplier=level=>1+iconEnhancementLevel(level)/5;
export const iconEnhancementPower=(level,basePower=180000)=>Math.round(basePower*iconEnhancementMultiplier(level));
export const iconEnhancementSteps=(basePower=180000)=>Array.from({length:10},(_,i)=>({level:i+1,power:iconEnhancementPower(i+1,basePower),bonusPercent:(i+1)*20,rate:10}));
export const defaultIconEnhancementSettings=()=>({revision:0,enabled:false,steps:Array.from({length:10},()=>({masterStarCost:null,coinCost:null}))});
const keys=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k));
function cost(value,max){
  if(value===null||value==='')return null;
  if(!Number.isSafeInteger(value)||value<1||value>max)throw Error('재료 수량은 1 이상의 정수로 입력하세요.');
  return value;
}
export function validateIconEnhancementSettings(raw){
  if(!keys(raw,['enabled','steps'])||typeof raw.enabled!=='boolean'||!Array.isArray(raw.steps)||raw.steps.length!==10)throw Error('아이콘 +1~+10 설정 10개가 필요합니다.');
  const steps=raw.steps.map(step=>{
    if(!keys(step,['masterStarCost','coinCost'])||!Object.hasOwn(step,'masterStarCost')||!Object.hasOwn(step,'coinCost'))throw Error('마스터의 별과 코인 수량을 모두 입력하세요.');
    return {masterStarCost:cost(step.masterStarCost,1000000000),coinCost:cost(step.coinCost,100000000000000)};
  });
  if(raw.enabled&&!iconEnhancementStepReady(steps[0]))throw Error('운영 ON 전 +1 단계의 두 재료 수량을 입력하세요.');
  return {enabled:raw.enabled,steps};
}
export const iconEnhancementStepReady=step=>Number.isSafeInteger(step?.masterStarCost)&&step.masterStarCost>0&&Number.isSafeInteger(step?.coinCost)&&step.coinCost>0;
