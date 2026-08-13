import assert from 'node:assert/strict';
import { ULTIMATE_ALLOWED_GRADES,normalizeUltimateRequiredGrade,selectActivatedUltimate } from '../functions/_ultimate.js';

assert.equal(ULTIMATE_ALLOWED_GRADES.includes('ZENITH'),true);
assert.equal(normalizeUltimateRequiredGrade('zenith'),'ZENITH');
assert.equal(normalizeUltimateRequiredGrade('unknown'),'SSR');

const settings={ultimateRules:[
  {enabled:true,name:'FUR ULTIMATE',requiredGrade:'FUR',minBreakthrough:0,requiredCount:1,activationChance:100},
  {enabled:true,name:'ZENITH ULTIMATE',requiredGrade:'ZENITH',minBreakthrough:0,requiredCount:1,activationChance:100},
  {enabled:true,name:'PRESTIGE ULTIMATE',requiredGrade:'PRESTIGE',minBreakthrough:0,requiredCount:1,activationChance:100}
]};
const cards=[
  {id:1,rarity:'FUR',power:9000,breakthrough_level:10},
  {id:2,rarity:'ZENITH',power:5500,breakthrough_level:1},
  {id:3,rarity:'PRESTIGE',power:8000,breakthrough_level:10}
];

const activated=selectActivatedUltimate(settings,cards,()=>0);
assert.equal(activated?.rule?.requiredGrade,'ZENITH');
assert.equal(activated?.matchedCards?.[0]?.id,2);

const failedZenith=selectActivatedUltimate({...settings,ultimateRules:settings.ultimateRules.map(rule=>rule.requiredGrade==='ZENITH'?{...rule,activationChance:0}:rule)},cards,()=>0);
assert.equal(failedZenith,null,'lower-grade ultimate must not replace a failed ZENITH priority roll');

console.log('ZENITH ultimate: CMS grade and absolute activation priority verified');
