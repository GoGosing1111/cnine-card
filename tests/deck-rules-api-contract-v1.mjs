import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const api=read('../functions/api/[[path]].js');
const engine=read('../functions/_battle_v2_preview.js');

const readLimit=name=>{
  const match=api.match(new RegExp(`const ${name}_DECK_LIMIT=(\\d+);`));
  assert.ok(match,`${name} deck limit must remain declared`);
  return Number(match[1]);
};

const limits={
  PRESTIGE:readLimit('PRESTIGE'),
  FUR:readLimit('FUR'),
  ZENITH:readLimit('ZENITH')
};
assert.deepEqual(limits,{PRESTIGE:2,FUR:2,ZENITH:2},'all public high-grade limits must be two cards');

const contractStart=api.indexOf("function deckRulesContract(scope='PVE')");
const contractEnd=api.indexOf('\nasync function deckGradeCounts',contractStart);
assert.ok(contractStart>=0&&contractEnd>contractStart,'pure deck rule contract helper must exist');
const contractSource=api.slice(contractStart,contractEnd);
assert.doesNotMatch(contractSource,/await|env\.DB|prepare\(/,'deck rule contract must not add a DB query');
assert.doesNotMatch(contractSource,/synerg/i,'retired deck synergy must not leak into the public rule contract');

const buildContract=Function(
  `const PRESTIGE_DECK_LIMIT=${limits.PRESTIGE};const FUR_DECK_LIMIT=${limits.FUR};const ZENITH_DECK_LIMIT=${limits.ZENITH};${contractSource};return deckRulesContract;`
)();
const expectedBase={
  schemaVersion:1,
  deckSize:5,
  gradeLimits:{PRESTIGE:2,FUR:2,ZENITH:2},
  healerDuplicatePenalty:{2:60,3:75,4:85,5:90},
  healerPenaltyScope:'PVE_PVP_HP_RECOVERY_AND_2PLUS_SURVIVE_DISABLED',
  formation:{code:'FRONT_2_BACK_3',frontSlots:2,backSlots:3,slots:['FRONT','FRONT','BACK','BACK','BACK']}
};
assert.deepEqual(buildContract('PVE'),{...expectedBase,scope:'PVE'});
assert.deepEqual(buildContract('pvp'),{...expectedBase,scope:'PVP'});
assert.equal(Object.hasOwn(buildContract('PVE'),'synergy'),false,'deck synergy must remain absent');

const endpointBlock=(start,end)=>{
  const from=api.indexOf(start),to=api.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from,`${start} endpoint block must exist`);
  return api.slice(from,to);
};
const pveConfig=endpointBlock("if(path==='battle/config')","if(path==='battle/deck'&&request.method==='POST')");
const pvpConfig=endpointBlock("if(path==='pvp/config')","if(path==='pvp/deck'&&request.method==='POST')");
assert.match(pveConfig,/deckRules:deckRulesContract\('PVE'\)/,'PVE config must expose the shared contract');
assert.match(pvpConfig,/deckRules:deckRulesContract\('PVP'\)/,'PVP config must expose the shared contract');

assert.match(engine,/formation:\s*'FRONT_2_BACK_3'/,'battle engine formation must match the API contract');
assert.match(engine,/healerDuplicatePenalty:\s*\{\s*2:\s*60,\s*3:\s*75,\s*4:\s*85,\s*5:\s*90\s*\}/,'battle engine healer penalties must match the API contract');

console.log('deck rules API contract: OK');
