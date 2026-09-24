import test from 'node:test';
import assert from 'node:assert/strict';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {suggestedMercenaryDraw,mercenaryCardChances,mercenaryGradePools,validateMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {pickMercenaryDraw} from '../functions/_mercenary_draw_accounting.js';
import {CRYVERN_CODE,CRYVERN_SKILL_ID,cryvernSelectionWeights} from '../shared/mercenary-cryvern-v1.mjs';
import {pickFusionResult} from '../functions/_mercenary_fusion.js';
const codes=seed.catalog.cards.map(c=>c.code);
const mercenaries=seed.document.mercenaries.map((c,i)=>({...c,rank:c.rank||['C','B','A','S','SS'][i%5]}));
const sss=mercenaryGradePools(mercenaries,codes).SSS;
const weights={'V-021':8991,'V-046':999,'V-049':10};
test('approved Cryvern uses a new code; Heukwol and every previous character survive',()=>{
 assert.equal(seed.catalog.cards.length,49);
 assert.equal(seed.catalog.skills.length,32);
 assert.equal(seed.catalog.cards.find(c=>c.code==='V-048').name,'흑월');
 const card=mercenaries.find(c=>c.code===CRYVERN_CODE);
 assert.equal(card.name,'크라이베른');assert.equal(card.title,'');assert.equal(card.rank,'SSS');
 assert.deepEqual(seed.document.assignments.find(c=>c.code===CRYVERN_CODE).skillIds,[CRYVERN_SKILL_ID]);
 assert.deepEqual(sss,['V-021','V-046','V-049']);
});
test('exactly 10 of 10000 SSS tickets select Cryvern, while the others stay 9:1',()=>{
 const policy=suggestedMercenaryDraw();policy.cardRules.cardWeights=weights;
 validateMercenaryDraw(policy,{catalogCodes:codes});
 assert.equal(policy.outcomes.find(o=>o.id==='CARD_SSS').chancePpm,1);
 const odds=mercenaryCardChances(1,sss,policy.cardRules);
 assert.deepEqual(odds.map(c=>c.withinRankPercent),[89.91,9.99,.1]);
 assert.equal(odds.at(-1).percent,.0000001);
 assert.equal(mercenaryCardChances(50,sss,policy.cardRules).at(-1).percent,.000005);
 const counts=Object.fromEntries(sss.map(c=>[c,0]));
 const rankTicket=policy.outcomes.slice(0,5).reduce((sum,r)=>sum+r.chancePpm,0);
 for(let ticket=0;ticket<10000;ticket++){
  const r=pickMercenaryDraw({policy,mercenaries,randomInt:max=>max===1000000?rankTicket:ticket});
  counts[r.mercenaryCode]++;
 }
 assert.deepEqual(counts,weights);
});
test('deployment-to-CMS-save gap uses 0.1%, never default weight 1; saved settings remain authoritative',()=>{
 const old={'V-021':9,'V-046':1,'V-044':3},before=structuredClone(old);
 const effective=cryvernSelectionWeights(sss,old);
 assert.deepEqual(effective,{...weights,'V-044':3});assert.deepEqual(old,before);
 assert.deepEqual(mercenaryCardChances(1,sss,{cardWeights:old}).map(c=>c.weight),[8991,999,10]);
 const future={...weights,'V-049':25};
 assert.equal(cryvernSelectionWeights(sss,future),future);
 assert.equal(cryvernSelectionWeights(['V-044','V-048'],old),old);
});
test('SS-to-SSS fusion shares the same rare within-rank selection without changing promotion odds',()=>{
 const pools=mercenaryGradePools(mercenaries,codes),rules={cardWeights:weights};
 assert.equal(pickFusionResult({rank:'SS',pools,rules,randomInt:max=>max===10000?9989:0}).mercenaryCode,'V-046');
 assert.equal(pickFusionResult({rank:'SS',pools,rules,randomInt:max=>max===10000?9990:0}).mercenaryCode,CRYVERN_CODE);
});
