import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeResourceShortage,forgeQuoteShortages} from '../shared/equipment-forge-resources-v1.mjs';
import {forgeFixture} from './helpers/forge-db.mjs';
import {forgeQuote,executeForge} from '../functions/_equipment_forge_transactions.js';
import {EQUIPMENT_FORGE_RELEASE_KEY} from '../shared/equipment-forge-release-v1.mjs';
import {FORGE_SETTINGS_KEY} from '../functions/_equipment_forge_public.js';
import {jointHash} from '../functions/_joint_transactions.js';
import release from '../docs/releases/equipment-forge-approved-20260922.json' with {type:'json'};

const protectionMessage='장비 보호권 부족: 3장 필요 / 보유 1장 / 2장 부족';
const quote={kind:'ENHANCE',protectedAttempt:true,cost:{coinCost:15000000000,itemCode:'MASTER_STAR',itemQuantity:150000,protectionQuantity:3}};
test('shortage text identifies only missing resources, with exact required/owned/missing quantities',()=>{
 const wallet={coins:'15000000000',masterStars:184958,protection:1};
 assert.deepEqual(forgeQuoteShortages(quote,wallet),[protectionMessage]);
 assert.deepEqual(forgeQuoteShortages({...quote,protectedAttempt:false},wallet),[]);
 assert.deepEqual(forgeQuoteShortages(quote,{...wallet,protection:3}),[]);
 assert.deepEqual(forgeQuoteShortages(quote,{coins:'14999999999',masterStars:149999,protection:1}),[
  '코인 부족: 15,000,000,000코인 필요 / 보유 14,999,999,999코인 / 1코인 부족',
  '마스터의 별 부족: 150,000개 필요 / 보유 149,999개 / 1개 부족',protectionMessage
 ]);
 assert.deepEqual(forgeQuoteShortages({...quote,kind:'RESTORE'},wallet),[]);
 assert.equal(forgeResourceShortage('장비 보호권',3,null,'장'),'');
 assert.equal(forgeResourceShortage('장비 보호권',3,0,'장'),'장비 보호권 부족: 3장 필요 / 보유 0장 / 3장 부족');
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: protected +10 reports one owned ticket, refuses before any charge, and safely retries after replenishment`,async t=>{
 const f=await forgeFixture(t,{postgres});
 await f.setting(EQUIPMENT_FORGE_RELEASE_KEY,{document:release,sha256:await jointHash(release)});
 await f.setting(FORGE_SETTINGS_KEY,{schemaVersion:1,revision:1,publicVisible:true,executionMode:'ON',notice:'ISOLATED QA'});
 await f.p('UPDATE users SET coin=15000000000 WHERE id=7').run();
 await f.p("UPDATE cnine_user_inventory SET quantity=184958 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
 await f.p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('EQUIPMENT_PROTECTION_TICKET','장비 보호권','SPECIAL','/test.png')").run();
 await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,'EQUIPMENT_PROTECTION_TICKET',1)").run();
 await f.p('INSERT INTO equipment_forge_states_v1 VALUES(?,7,9,1)',f.instanceId).run();
 const q=await forgeQuote(f.env,f.user,{requestId:crypto.randomUUID(),kind:'ENHANCE',instanceId:f.instanceId,useProtection:true});
 assert.equal(q.cost.protectionQuantity,3);assert.equal(q.cost.itemQuantity,150000);assert.equal(q.cost.successPpm,100000);
 const body={requestId:crypto.randomUUID(),quoteId:q.quoteId};
 const noRoll=()=>{throw Error('insufficient resources must not roll');};
 await f.p('UPDATE users SET coin=14999999999 WHERE id=7').run();
 await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE',{randomInt:noRoll}),{code:'FORGE_FUNDS',message:'코인 부족: 15,000,000,000코인 필요 / 보유 14,999,999,999코인 / 1코인 부족'});
 await f.p('UPDATE users SET coin=15000000000 WHERE id=7').run();
 for(let n=0;n<2;n++)await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE',{randomInt:noRoll}),{code:'FORGE_MATERIAL',message:protectionMessage});
 assert.equal(await f.coin(),15000000000);assert.equal(await f.qty('MASTER_STAR'),184958);assert.equal(await f.qty('EQUIPMENT_PROTECTION_TICKET'),1);
 assert.equal((await f.p('SELECT consumed_by FROM equipment_forge_quotes_v1 WHERE quote_id=?',q.quoteId).first()).consumed_by,null);
 assert.equal((await f.p('SELECT level FROM equipment_forge_states_v1 WHERE instance_id=?',f.instanceId).first()).level,9);
 await f.p("UPDATE cnine_user_inventory SET quantity=149999 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
 await assert.rejects(()=>executeForge(f.env,f.user,body,'ENHANCE',{randomInt:noRoll}),{code:'FORGE_MATERIAL',message:'마스터의 별 부족: 150,000개 필요 / 보유 149,999개 / 1개 부족'});
 await f.p("UPDATE cnine_user_inventory SET quantity=184958 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
 await f.p("UPDATE cnine_user_inventory SET quantity=3 WHERE user_id=7 AND item_code='EQUIPMENT_PROTECTION_TICKET'").run();
 const result=await executeForge(f.env,f.user,body,'ENHANCE',{randomInt:()=>500000});assert.equal(result.outcome,'MAINTAIN');
 await executeForge(f.env,f.user,body,'ENHANCE',{randomInt:noRoll});
 assert.equal(await f.coin(),0);assert.equal(await f.qty('MASTER_STAR'),34958);assert.equal(await f.qty('EQUIPMENT_PROTECTION_TICKET'),0);
});
