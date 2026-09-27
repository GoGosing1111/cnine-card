import test from 'node:test';
import assert from 'node:assert/strict';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {suggestedMercenaryDraw,mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {mercenaryCardAcquisitionStatements,pickMercenaryDraw} from '../functions/_mercenary_draw_accounting.js';
import {pickMercenarySsOnce} from '../functions/_mercenary_ss_once.js';
import {pickFusionResult} from '../functions/_mercenary_fusion.js';
import {openMercenaryCards} from '../functions/_mercenary_account.js';
import {jointHash} from '../functions/_joint_transactions.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {cryvernSelectionWeights} from '../shared/mercenary-cryvern-v1.mjs';
import {sniperOrikkungSelectionWeights} from '../shared/mercenary-sniper-orikkung-v1.mjs';
const mercenaries=seed.document.mercenaries,ids=seed.catalog.cards.map(c=>c.code);
const policy=suggestedMercenaryDraw();policy.outcomes=policy.outcomes.map(o=>({...o,chancePpm:o.id==='CARD_SSS'?1000000:0}));

test('registration defaults preserve explicit OFF without dividing by zero',()=>{
 const allOff=Object.fromEntries(mercenaries.map(c=>[c.code,0]));
 assert.ok(mercenaryCardChances(1000000,ids,{...policy.cardRules,cardWeights:allOff}).every(c=>c.weight===0&&c.percent===0));
 const beforeCryvern={'V-021':0,'V-046':0};
 assert.deepEqual(cryvernSelectionWeights(['V-021','V-046','V-049'],beforeCryvern),{...beforeCryvern,'V-049':1});
 const beforeSniper={...allOff};delete beforeSniper['V-050'];
 assert.equal(sniperOrikkungSelectionWeights(ids,beforeSniper)['V-050'],1);
 const berkan=mercenaryCardChances(1000000,['V-049','V-055'],{...policy.cardRules,cardWeights:{'V-049':0}});
 assert.deepEqual(berkan.map(c=>[c.code,c.weight,c.percent]),[['V-049',0,0],['V-055',1,100]]);
});
test('CMS OFF excludes Berkan and preserves every other SSS relative weight',()=>{
 for(const weight of [0]){
  const rules={...policy.cardRules,cardWeights:{'V-021':8991,'V-046':2000,'V-049':500,...(weight===undefined?{}:{'V-055':weight})}},pools=mercenaryGradePools(mercenaries,ids,rules);
  assert.deepEqual(pools.SSS,['V-021','V-046','V-049']);
  const displayed=mercenaryCardChances(50,[...pools.SSS,'V-055'],rules);assert.equal(displayed.at(-1).percent,0);assert.equal(displayed.at(-1).weight,0);
  assert.equal(displayed[0].totalWeight,11491);
  for(const [ticket,expected] of [[0,'V-021'],[8990,'V-021'],[8991,'V-046'],[10990,'V-046'],[10991,'V-049'],[11490,'V-049']]){
   assert.equal(pickMercenaryDraw({policy:{...policy,cardRules:rules},mercenaries,randomInt:n=>n===1000000?0:ticket}).mercenaryCode,expected);
   assert.equal(pickFusionResult({rank:'SS',pools,rules,randomInt:n=>n===10000?0:ticket}).mercenaryCode,expected);
  }
 }
});
test('targeted guarantee cannot bypass CMS OFF; ON restores normal selection',()=>{
 const off={...policy,cardRules:{...policy.cardRules,cardWeights:{'V-021':8991,'V-046':2000,'V-049':500,'V-055':0}}};
 assert.throws(()=>pickMercenarySsOnce({policy:off,mercenaries,rank:'SSS',mercenaryCode:'V-055',randomInt:()=>0}),{code:'MERCENARY_ACQUISITION_DISABLED'});
 const on=structuredClone(off);on.cardRules.cardWeights['V-055']=1;
 assert.equal(pickMercenaryDraw({policy:on,mercenaries,randomInt:n=>n===1000000?0:11491}).mercenaryCode,'V-055');
 const allOff=structuredClone(off);for(const code of ['V-021','V-046','V-049'])allOff.cardRules.cardWeights[code]=0;assert.throws(()=>pickMercenaryDraw({policy:allOff,mercenaries,randomInt:()=>0}),{code:'MERCENARY_RANK_POOL_EMPTY'});
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} CMS OFF blocks a previously prepared result and direct grants without debit`,async t=>{
 const f=await mercenaryFixture(t,{postgres}),requestId=crypto.randomUUID(),before=await f.coin();
 f.draw.cardRules.cardWeights['V-055']=0;await f.setDraw(f.draw);
 const plan={count:1,draws:[{mercenaryCode:'V-055',rank:'SSS',outcomeId:'CARD_SSS',quantity:1}],coinCost:1000,payment:f.policy.opening};
 await f.p("INSERT INTO joint_operations_v1(request_id,user_id,kind,input_hash,plan_json,status,created_at) VALUES(?,?,'MERCENARY_OPEN',?,?,'PENDING',?)",requestId,f.user.id,await jointHash({kind:'MERCENARY_OPEN',input:{count:1}}),JSON.stringify(plan),new Date().toISOString()).run();
 await assert.rejects(()=>openMercenaryCards(f.env,f.user,{requestId,count:1}));
 await assert.rejects(()=>f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:f.user.id,mercenaryCode:'V-055',acquisitionId:crypto.randomUUID()})));
 assert.equal(await f.coin(),before);assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',requestId).first()).status,'PENDING');
 assert.equal((await f.p('SELECT * FROM mercenary_card_acquisitions_v1').all()).results.length,0);
 assert.equal((await f.p('SELECT * FROM user_mercenary_cards_v1').all()).results.length,0);
 f.draw.cardRules.cardWeights['V-055']=1;await f.setDraw(f.draw);
 const grantId=crypto.randomUUID(),grant=()=>f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:f.user.id,mercenaryCode:'V-055',acquisitionId:grantId}));await grant();
 f.draw.cardRules.cardWeights['V-055']=0;await f.setDraw(f.draw);await grant();
 assert.equal(Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',f.user.id,'V-055').first()).total_copies),1);
});
