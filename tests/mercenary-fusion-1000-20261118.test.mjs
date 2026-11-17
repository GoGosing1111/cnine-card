import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {runPreparedMercenaryFusion,fusionReceipt,normalizeFusionMaterials,handleMercenaryFusion} from '../functions/_mercenary_fusion.js';
import {validateFusionReceipt} from '../mercenary-codex/fusion/client.mjs';
import {autoMaterials,maxFusionAttempts} from '../mercenary-codex/fusion/model.mjs';

const materials=Array(8000).fill('V-004');
const snapshot=async f=>(await f.p('SELECT * FROM user_mercenary_cards_v1 ORDER BY mercenary_code').all()).results;
async function fixture(t,postgres){
 const f=await mercenaryFixture(t,{postgres});
 for(const c of f.document.mercenaries.filter(c=>Number(c.code.slice(2))<44))c.rank=c.code==='V-004'?'SS':['V-020','V-021'].includes(c.code)?'SSS':'C';
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
 await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(7,'V-004',8001,8000,'2026-11-18','2026-11-18')").run();
 return f;
}
test('1000 attempts use 8000 extras; one more attempt and malformed material groups are rejected',()=>{
 const rows=[{code:'V-004',rank:'SS',duplicates:8008}];
 assert.equal(maxFusionAttempts(rows,'SS'),1000);
 assert.equal(autoMaterials(rows,'SS',1000).length,8000);
 assert.deepEqual(normalizeFusionMaterials(materials),[{code:'V-004',quantity:8000}]);
 for(const n of [0,7,8001,8008])assert.throws(()=>normalizeFusionMaterials(Array(n).fill('V-004')));
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: 1000 independent rolls preserve exact per-result balances, originals, and retry`,async t=>{
 const f=await fixture(t,postgres),body={requestId:crypto.randomUUID(),materials},coin=await f.coin();
 const batch=f.DB.batch.bind(f.DB);let statementCount=0;
 f.DB.batch=s=>{statementCount+=s.length;return batch(s);};
 let calls=0;const start=performance.now();
 const receipt=await runPreparedMercenaryFusion(f.env,f.user,body,{randomInt:()=>calls++%2===0?(calls%4===1?99999:100000):0});
 t.diagnostic(JSON.stringify({attempts:1000,ms:performance.now()-start,statementCount,receiptBytes:Buffer.byteLength(JSON.stringify(receipt))}));
 assert.equal(calls,2000);assert.equal(receipt.results.length,1000);assert.equal(receipt.results.filter(r=>r.promoted).length,500);
 const balances=new Map([['V-004',1]]);
 for(const r of receipt.results){const total=(balances.get(r.mercenaryCode)||0)+1;balances.set(r.mercenaryCode,total);assert.equal(r.totalCopiesAfter,total);assert.equal(r.duplicatesAfter,total-1);assert.equal(r.isDuplicate,total>1);}
 for(const row of await snapshot(f))assert.equal(Number(row.total_copies),balances.get(row.mercenary_code));
 assert.equal(await f.coin(),coin);validateFusionReceipt(receipt,body.requestId,materials);
 const plan=await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?',body.requestId).first();
 assert.ok(plan.plan_json.length<250000);if(postgres)assert.ok(statementCount<30);
 const before=await snapshot(f),again=await runPreparedMercenaryFusion(f.env,f.user,body,{randomInt(){throw Error('rerolled');}});
 assert.equal(again.replayed,true);assert.deepEqual(again.results,receipt.results);assert.deepEqual(await snapshot(f),before);
 assert.deepEqual((await fusionReceipt(f.env,f.user,body.requestId)).results,receipt.results);
});
test('PostgreSQL: chunk failure rolls back 8000 materials; saved rolls obey CMS OFF and recover exactly',async t=>{
 const f=await fixture(t,true),before=await snapshot(f),body={requestId:crypto.randomUUID(),materials},batch=f.DB.batch.bind(f.DB);let injected=false;
 f.DB.batch=async statements=>{let chunk=0;return batch(statements.map(s=>!injected&&s.source.startsWith('WITH grants')&&++chunk===3?(injected=true,f.p('INSERT INTO missing_bulk_qa VALUES(0)')):s));};
 await assert.rejects(runPreparedMercenaryFusion(f.env,f.user,body,{randomInt:()=>0}));assert(injected);
 assert.deepEqual(await snapshot(f),before);assert.equal((await fusionReceipt(f.env,f.user,body.requestId)).status,'PENDING');
 const plan=JSON.parse((await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).plan_json);
 const code=plan.result.mercenaryCode;f.draw.cardRules.cardWeights[code]=0;await f.setDraw(f.draw);
 await assert.rejects(runPreparedMercenaryFusion(f.env,f.user,body,{randomInt(){throw Error('rerolled');}}));assert.deepEqual(await snapshot(f),before);
 f.draw.cardRules.cardWeights[code]=1;await f.setDraw(f.draw);
 const r=await runPreparedMercenaryFusion(f.env,f.user,body,{randomInt(){throw Error('rerolled');}});
 assert.equal(r.results.length,1000);assert(r.results.every(x=>x.promoted&&x.mercenaryCode===code));
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1').first()).n),1000);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM joint_atomic_guards_v1').first()).n),0);
});
test('HTTP: 8000-card request fits the scoped body limit; larger requests fail before spending',async t=>{
 const f=await fixture(t,true);
 const send=body=>handleMercenaryFusion({path:'mercenaries/v3/fusion',request:new Request('https://qa.test/api/mercenaries/v3/fusion',{method:'POST',headers:{origin:'https://qa.test','content-type':'application/json',authorization:'Bearer local-account-7'},body:JSON.stringify(body)}),env:f.env,deps:f.deps});
 const tooBig=await send({requestId:crypto.randomUUID(),materials:Array(12000).fill('V-004')});assert.equal(tooBig.status,413);
 const body={requestId:crypto.randomUUID(),materials};const response=await send(body);assert.equal(response.status,200);const receipt=await response.json();assert.equal(receipt.attempts,1000);
 const again=await (await send(body)).json();assert.equal(again.replayed,true);assert.deepEqual(again.results,receipt.results);
});
