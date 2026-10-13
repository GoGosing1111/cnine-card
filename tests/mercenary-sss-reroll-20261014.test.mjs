import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {SSS_REROLL,emptySssRerollPolicy,validateSssRerollPolicy,sssRerollReadiness,sssRerollOdds,pickSssReroll,parseSssRerollPercent} from '../shared/mercenary-sss-reroll-v1.mjs';
import {SSS_REROLL_KEY,ensureSssRerollCatalog,sssRerollState,saveSssRerollPolicy,executeSssReroll,sssRerollReceipt,handleSssReroll} from '../functions/_mercenary_sss_reroll.js';
const id=name=>'sss-reroll-test-'+name;
async function setup(t,options){
 const f=await mercenaryFixture(t,options);await ensureSssRerollCatalog(f.env);
 await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,3,3)',SSS_REROLL.code).run();
 const state=await sssRerollState(f.env,f.user),cards=state.catalog.filter(c=>c.available&&c.rank==='SSS'&&!c.limited).slice(0,3);assert.equal(cards.length,3);
 const policy={...emptySssRerollPolicy(),mode:'ON',cards:Object.fromEntries(cards.map((c,i)=>[c.code,[20,30,50][i]*1e6]))};
 const own=async(code,copies)=>f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',code,copies,copies-1).run();
 const balance=async()=>Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',SSS_REROLL.code).first()).quantity);
 const owned=code=>f.p('SELECT total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?',code).first();
 const save=(name,next=policy,revision=0)=>saveSssRerollPolicy(f.env,f.user,{requestId:id(name),revision,policy:next});
 await own(cards[0].code,1);return{...f,state,cards,policy,own,owned,balance,save};
}
test('independent exact odds exclude the input, limited cards, zero and unassigned entries',()=>{
 const catalog=[1,2,3,4].map(n=>({code:'V-00'+n,name:'Card'+n,rank:'SSS',available:true,limited:n===4,sourceArt:'/art.png'}));
 const policy={...emptySssRerollPolicy(),mode:'ON',cards:{'V-001':20e6,'V-002':30e6,'V-003':50e6}};
 assert.equal(sssRerollReadiness(validateSssRerollPolicy(policy,catalog),catalog).ready,true);
 assert.deepEqual(sssRerollOdds(policy,catalog,'V-001').map(c=>[c.code,c.percent]),[['V-002',37.5],['V-003',62.5]]);
 assert.equal(pickSssReroll(policy,catalog,'V-001',()=>29_999_999).mercenaryCode,'V-002');
 assert.equal(pickSssReroll(policy,catalog,'V-001',()=>30_000_000).mercenaryCode,'V-003');
 assert.throws(()=>validateSssRerollPolicy({...policy,cards:{'V-004':100e6}},catalog));
 assert.equal(sssRerollReadiness({...policy,cards:{'V-001':100e6}},catalog).ready,false);
 assert.equal(parseSssRerollPercent(''),null);assert.equal(parseSssRerollPercent('0.000001'),1);assert.throws(()=>parseSssRerollPercent('0.0000001'));assert.throws(()=>parseSssRerollPercent('100.000001'));
});
test('default OFF and incomplete settings cannot consume; CMS requires OWNER and valid origin',async t=>{
 const f=await setup(t);assert.equal(f.state.mode,'OFF');assert.deepEqual(f.state.policy.cards,{});
 await assert.rejects(executeSssReroll(f.env,f.user,{requestId:id('off'),sourceCode:f.cards[0].code}),{code:'SSS_REROLL_CLOSED'});
 assert.equal(await f.balance(),3);assert.equal(Number((await f.owned(f.cards[0].code)).total_copies),1);
 await f.save('draft',{...emptySssRerollPolicy(),notes:'OWNER only'});
 assert.equal((await sssRerollState(f.env,{id:8,role:'MEMBER'})).policy.notes,'');
 await assert.rejects(f.save('bad-on',{...emptySssRerollPolicy(),mode:'ON'},1),{code:'SSS_REROLL_NOT_READY'});
 await assert.rejects(saveSssRerollPolicy(f.env,{id:8,role:'MEMBER'},{requestId:id('forbidden'),revision:1,policy:f.policy}),{code:'SSS_REROLL_PERMISSION'});
 const request=new Request('https://local/api/admin/mercenary-sss-reroll',{method:'PATCH',headers:{authorization:'Bearer local-account-7','content-type':'application/json',origin:'https://evil.test'},body:JSON.stringify({requestId:id('origin'),revision:1,policy:f.policy})});
 assert.equal((await handleSssReroll({path:'admin/mercenary-sss-reroll',request,env:f.env,deps:f.deps})).status,403);
});
for(const postgres of [false,true])test('last copy replacement, duplicates and exact retries are atomic on '+(postgres?'Postgres':'SQLite'),async t=>{
 const f=await setup(t,{postgres});await f.save('enable');const [source,target]=f.cards;
 await f.own(target.code,2);await f.p('INSERT INTO user_mercenary_growth_v1(user_id,mercenary_code,level,experience,revision) VALUES(7,?,4,123,2)',source.code).run();
 const input={requestId:id('replace'),sourceCode:source.code};let rolls=0;
 const result=await executeSssReroll(f.env,f.user,input,{randomInt:()=>{rolls++;return 0;}});
 assert.equal(result.status,'COMPLETED');assert.equal(result.result.mercenaryCode,target.code);assert.equal(result.itemConsumed,1);assert.equal(result.source.totalAfter,0);assert.equal(result.balance,2);assert.equal(rolls,1);
 assert.equal(await f.owned(source.code),null);assert.equal(Number((await f.owned(target.code)).total_copies),3);assert.equal(result.result.duplicatesAfter,2);
 assert.equal(Number((await f.p('SELECT level FROM user_mercenary_growth_v1 WHERE user_id=7 AND mercenary_code=?',source.code).first()).level),4);
 const replay=await executeSssReroll(f.env,f.user,input,{randomInt:()=>{throw Error('must not roll twice');}});assert.deepEqual(replay.result,result.result);assert.equal(replay.replayed,true);assert.equal(await f.balance(),2);
 await assert.rejects(executeSssReroll(f.env,f.user,{...input,sourceCode:target.code}),{code:'JOINT_REQUEST_CONFLICT'});
 await assert.rejects(sssRerollReceipt(f.env,{id:8},input.requestId),{code:'JOINT_NOT_FOUND'});
 assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM inventory_logs WHERE item_code=?',SSS_REROLL.code).first()).n),1);
});
test('PVE and PVP equipped last copies are protected; equipped duplicates remain usable',async t=>{
 const f=await setup(t);await f.save('enable');const code=f.cards[0].code;
 await f.p('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(7,?,1,CURRENT_TIMESTAMP)',code).run();
 await assert.rejects(executeSssReroll(f.env,f.user,{requestId:id('equipped-pve'),sourceCode:code}),{code:'SSS_REROLL_EQUIPPED'});
 await f.p('UPDATE user_mercenary_loadout_v1 SET mercenary_code=NULL,revision=2 WHERE user_id=7').run();
 await f.setting('mercenary_pvp_loadout_v1:7',{mercenaryCode:code,revision:1});
 assert.equal((await sssRerollState(f.env,f.user)).cards[0].selectable,false);
 await assert.rejects(executeSssReroll(f.env,f.user,{requestId:id('equipped-pvp'),sourceCode:code}),{code:'SSS_REROLL_EQUIPPED'});
 await f.p('UPDATE user_mercenary_cards_v1 SET total_copies=2,duplicate_count=1 WHERE user_id=7 AND mercenary_code=?',code).run();
 await executeSssReroll(f.env,f.user,{requestId:id('duplicate'),sourceCode:code},{randomInt:()=>0});
 assert.equal(Number((await f.owned(code)).total_copies),1);assert.equal(await f.balance(),2);
});
for(const postgres of [false,true])test('failed grant rolls back both materials, resumes frozen result and cancels stale plans '+postgres,async t=>{
 const f=await setup(t,{postgres});await f.save('enable');const input={requestId:id('rollback'),sourceCode:f.cards[0].code};let rolls=0;
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(executeSssReroll(f.env,f.user,input,{randomInt:()=>{rolls++;return 0;}}));
 assert.equal(await f.balance(),3);assert.equal(Number((await f.owned(input.sourceCode)).total_copies),1);assert.equal(await f.owned(f.cards[1].code),null);
 assert.equal((await sssRerollReceipt(f.env,f.user,input.requestId)).status,'PENDING');f.fail('');
 const result=await executeSssReroll(f.env,f.user,input,{randomInt:()=>{throw Error('no second roll');}});assert.equal(result.result.mercenaryCode,f.cards[1].code);assert.equal(rolls,1);
 const blocked={requestId:id('pending-off'),sourceCode:f.cards[1].code};f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(executeSssReroll(f.env,f.user,blocked,{randomInt:()=>0}));f.fail('');
 await f.save('disable',{...f.policy,mode:'OFF'},1);await assert.rejects(executeSssReroll(f.env,f.user,blocked),{code:'SSS_REROLL_POLICY_CHANGED'});assert.equal(await f.balance(),2);
 await assert.rejects(sssRerollReceipt(f.env,f.user,blocked.requestId),{code:'JOINT_OPERATION_SUPERSEDED'});
});
test('global acquisition OFF cancels a prepared result; separate probabilities and revision remain intact',async t=>{
 const f=await setup(t);await f.save('enable');const input={requestId:id('acquisition-off'),sourceCode:f.cards[0].code};
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(executeSssReroll(f.env,f.user,input,{randomInt:()=>0}));f.fail('');
 f.draw.cardRules.cardWeights[f.cards[1].code]=0;await f.setDraw(f.draw);
 await assert.rejects(executeSssReroll(f.env,f.user,input),{code:'SSS_REROLL_CATALOG_CHANGED'});assert.equal(await f.balance(),3);
 assert.deepEqual(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',SSS_REROLL_KEY).first()).value).policy.cards,f.policy.cards);
 await assert.rejects(f.save('stale',{...f.policy,mode:'OFF'},0),{code:'SSS_REROLL_REVISION_CONFLICT'});
});
test('new requests reject non-SSS, limited, missing ownership and empty ticket balance',async t=>{
 const f=await setup(t);await f.save('enable');
 for(const code of ['V-001','V-981'])await assert.rejects(executeSssReroll(f.env,f.user,{requestId:id('source-'+code),sourceCode:code}),{code:'SSS_REROLL_SOURCE'});
 await assert.rejects(executeSssReroll(f.env,f.user,{requestId:id('not-owned'),sourceCode:f.cards[1].code}),{code:'SSS_REROLL_OWNERSHIP'});
 await f.p('UPDATE cnine_user_inventory SET quantity=0 WHERE user_id=7 AND item_code=?',SSS_REROLL.code).run();
 await assert.rejects(executeSssReroll(f.env,f.user,{requestId:id('no-ticket'),sourceCode:f.cards[0].code}),{code:'SSS_REROLL_BALANCE'});
});
