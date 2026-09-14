// 2026-09-14: approved costs and pity; growth/refund values need explicit CMS input.
export const FUR_EXTENDED_STEPS=Object.freeze([
  Object.freeze({cost:20000,duplicateCards:5,rate:15,pityThreshold:10}),
  Object.freeze({cost:30000,duplicateCards:8,rate:10,pityThreshold:20})
]);
export const FUR_MAX_ENHANCEMENT=15;
const bounded=(value,fallback,max,min=0)=>Number.isFinite(Number(value))&&value!==null&&value!==''?Math.max(min,Math.min(max,Number(value))):fallback;
const pendingNumber=(value,max)=>value===null||value===undefined||value===''?null:bounded(value,null,max);

export function extendFurHighBreakthrough(base,raw={}){
  const steps=FUR_EXTENDED_STEPS.map((defaults,index)=>{
    const saved=raw.steps?.[index+3]||{};
    return {
      cost:Math.floor(bounded(saved.cost,defaults.cost,9999999,1)),
      duplicateCards:Math.floor(bounded(saved.duplicateCards,defaults.duplicateCards,99)),
      rate:bounded(saved.rate,defaults.rate,100),
      pityThreshold:Math.floor(bounded(saved.pityThreshold,defaults.pityThreshold,999)),
      powerBonusPercent:pendingNumber(saved.powerBonusPercent,1000000),
      uniqueBoostPercent:pendingNumber(saved.uniqueBoostPercent,1000),
      retirementShardRefund:pendingNumber(saved.retirementShardRefund,10000000)
    };
  });
  return {...base,extendedEnabled:raw.extendedEnabled===true,steps:[...base.steps.slice(0,3),...steps]};
}

export function furExtendedReady(config){
  return config?.steps?.length===5&&config.steps.slice(3).every(step=>
    Number.isFinite(step.powerBonusPercent)&&step.powerBonusPercent>0&&
    Number.isFinite(step.uniqueBoostPercent)&&step.uniqueBoostPercent>=0&&
    Number.isInteger(step.retirementShardRefund)&&step.retirementShardRefund>0&&
    (step.rate>0||step.pityThreshold>0));
}

export function furExtendedStepAvailable(config,level){
  return level<13||(config?.extendedEnabled===true&&furExtendedReady(config));
}
