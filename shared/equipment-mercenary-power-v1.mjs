// User-approved power baselines only. Acquisition, growth, costs and runtime activation are separate gates.
const approval={revision:'20260912-power1',status:'USER_APPROVED_BASELINE',approvedOn:'2026-09-12'};
export const EQUIPMENT_POWER_STANDARD=Object.freeze({
  ...approval,
  basis:'BASE_ITEM_TOTAL_POWER',
  maxLevel:10,
  bonusPercentByLevel:Object.freeze([0,6,12,18,24,30,36,42,48,80,120]),
  rounding:'FLOOR',
  pvePercent:90,
  pvpRemainder:true,
  supportedSlots:Object.freeze(['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY']),
});
export const MERCENARY_POWER_STANDARD=Object.freeze({
  ...approval,
  basis:'BEFORE_GROWTH_EQUIPMENT_SKILLS',
  basePowerByRank:Object.freeze({C:10000,B:20000,A:40000,S:70000,SS:120000,SSS:180000}),
  comparison:Object.freeze({grade:'SUPERSTAR',enhancementLevel:13,power:93200,verifiedOn:'2026-09-12'}),
  statAllocation:null,
  growth:null,
});
