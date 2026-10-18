import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {normalizeFusionMaterials,runPreparedMercenaryFusion,fusionReceipt} from '../functions/_mercenary_fusion.js';
import {handleMercenaryAccount} from '../functions/_mercenary_account_routes.js';
import {materialRows,autoMaterials,validateMaterials,maxFusionAttempts} from '../mercenary-codex/fusion/model.mjs';
import {createFusionClient,validateFusionReceipt} from '../mercenary-codex/fusion/client.mjs';

const count=async f=>Number((await f.p('SELECT COUNT(*) AS n FROM mercenary_card_acquisitions_v1 WHERE user_id=7').first()).n);
const owned=async f=>(await f.p('SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=7 ORDER BY mercenary_code').all()).results.map(r=>({...r}));
async function fixture(t,postgres,extras=400){
  const f=await mercenaryFixture(t,{postgres});
  for(const c of f.document.mercenaries.filter(c=>Number(c.code.slice(2))<44))c.rank=['V-004','V-009'].includes(c.code)?'SS':['V-020','V-021'].includes(c.code)?'SSS':'C';
  await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
  for(const code of ['V-004','V-009'])await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,?,?,?,?)',code,extras+1,extras,'2026-10-19','2026-10-19').run();
  return f;
}
test('bulk selection uses existing duplicates, one rank, and whole sets capped at 100',()=>{
  const rows=materialRows({cards:[{code:'V-004',rank:'SS'},{code:'V-009',rank:'SS'},{code:'V-010',rank:'S'},{code:'V-021',rank:'SSS'}]},
    {cards:[{code:'V-004',totalCopies:46,duplicates:45},{code:'V-009',totalCopies:36,duplicates:35},{code:'V-010',totalCopies:1001,duplicates:1000},{code:'V-021',totalCopies:99,duplicates:98}]});
  assert.equal(maxFusionAttempts(rows,'SS'),10);assert.equal(maxFusionAttempts(rows,'S'),100);
  const selected=autoMaterials(rows,'SS',10);assert.equal(selected.length,80);assert.equal(selected.filter(c=>c==='V-004').length,45);
  assert.equal(validateMaterials(selected,rows,{attempts:10}).ok,true);
  assert.equal(validateMaterials(selected,rows,{attempts:11}).ok,false);
  assert.equal(validateMaterials([...selected.slice(1),'V-010'],rows,{attempts:10}).ok,false);
  assert.equal(validateMaterials(Array(88).fill('V-004'),rows,{attempts:11}).ok,false);
  for(const n of [0,7,9,799,801,808])assert.throws(()=>normalizeFusionMaterials(Array(n).fill('V-004')),{code:'MERCENARY_FUSION_MATERIALS'});
});

for(const postgres of [false,true]){
  const dialect=postgres?'Postgres':'SQLite';
  test(`${dialect}: 100 independent results commit together, preserve originals and replay exactly`,async t=>{
    const f=await fixture(t,postgres),beforeCoin=await f.coin(),body={requestId:crypto.randomUUID(),materials:[...Array(400).fill('V-004'),...Array(400).fill('V-009')]};
    let rolls=0;
    const result=await runPreparedMercenaryFusion(f.env,f.user,body,{randomInt:max=>{const index=rolls++;return index%2?0:(index/2)%2?100000:99999;}});
    assert.equal(rolls,200);assert.equal(result.attempts,100);assert.equal(result.results.filter(r=>r.promoted).length,50);
    assert.equal(result.consumed.reduce((n,c)=>n+c.quantity,0),800);assert.equal(await count(f),100);
    const after=await owned(f);assert.equal(after.reduce((n,c)=>n+Number(c.total_copies),0),102);
    assert.ok(after.every(c=>c.total_copies>=1&&c.duplicate_count===c.total_copies-1));assert.equal(await f.coin(),beforeCoin);
    validateFusionReceipt(result,body.requestId,body.materials);
    const plan=(await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).plan_json;
    assert.ok(plan.length<250000);
    const replay=await runPreparedMercenaryFusion(f.env,f.user,{...body,materials:[...body.materials].reverse()},{randomInt(){throw Error('rerolled');}});
    assert.deepEqual(replay.results,result.results);assert.deepEqual(await owned(f),after);assert.equal(await count(f),100);
    assert.deepEqual((await fusionReceipt(f.env,f.user,body.requestId)).results,result.results);
    await assert.rejects(runPreparedMercenaryFusion(f.env,f.user,{requestId:crypto.randomUUID(),materials:body.materials}),{code:'MERCENARY_FUSION_DUPLICATES'});
  });
  test(`${dialect}: failure at result 50 rolls back all 800 materials and grants; retry keeps all rolls`,async t=>{
    const f=await fixture(t,postgres),before=await owned(f),body={requestId:crypto.randomUUID(),materials:[...Array(400).fill('V-004'),...Array(400).fill('V-009')]};
    const batch=f.DB.batch.bind(f.DB);let injected=false;
    f.DB.batch=async statements=>{
      let grants=0;
      const failing=statements.map(s=>{if(!injected&&s.source?.startsWith('INSERT INTO mercenary_card_acquisitions_v1')&&++grants===50){injected=true;return f.p('INSERT INTO bulk_failure_fixture_missing_table VALUES(0)');}return s;});
      return batch(failing);
    };
    await assert.rejects(runPreparedMercenaryFusion(f.env,f.user,body,{randomInt:()=>0}));
    assert.equal(injected,true);assert.deepEqual(await owned(f),before);assert.equal(await count(f),0);
    assert.equal((await fusionReceipt(f.env,f.user,body.requestId)).status,'PENDING');
    const receipt=await runPreparedMercenaryFusion(f.env,f.user,body,{randomInt(){throw Error('rerolled');}});
    assert.equal(receipt.results.length,100);assert.equal(receipt.results.filter(r=>r.promoted).length,100);assert.equal(await count(f),100);
    assert.equal((await owned(f)).find(c=>c.mercenary_code==='V-004').total_copies,1);
  });
}

test('Postgres route accepts an 800-card body and serializes competing batches without overspending',async t=>{
  const f=await fixture(t,true),materials=[...Array(400).fill('V-004'),...Array(400).fill('V-009')];
  const requests=[crypto.randomUUID(),crypto.randomUUID()];
  const send=requestId=>handleMercenaryAccount({path:'mercenaries/v3/fusion',request:new Request('https://qa.test/api/mercenaries/v3/fusion',{
    method:'POST',headers:{origin:'https://qa.test','content-type':'application/json',authorization:'Bearer local-account-7'},body:JSON.stringify({requestId,materials})}),env:f.env,deps:f.deps});
  const responses=await Promise.all(requests.map(send)),statuses=responses.map(r=>r.status).sort();
  assert.deepEqual(statuses,[200,409]);assert.equal(await count(f),100);
  const index=responses.findIndex(r=>r.status===200),first=await responses[index].json(),after=await owned(f);
  const again=await (await send(requests[index])).json();assert.equal(again.replayed,true);assert.deepEqual(again.results,first.results);assert.deepEqual(await owned(f),after);
});

test('bulk client rejects partial receipts and recovers all results after a lost response with GET only',async()=>{
  const materials=Array(80).fill('V-004'),store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  let receipt;
  const make=request=>createFusionClient({accountId:7,token:'qa',currentToken:()=> 'qa',storage,locks:null,request});
  const first=make(async(_path,{body})=>{
    const results=Array.from({length:10},(_,i)=>({mercenaryCode:'V-021',name:'결과',inputRank:'SS',resultRank:'SSS',quantity:1,promoted:true,totalCopiesAfter:i+1,duplicatesAfter:i}));
    receipt={requestId:body.requestId,status:'COMPLETED',attempts:10,results,result:results[0],consumed:[{code:'V-004',quantity:80,totalBefore:81,duplicatesBefore:80}]};
    throw Error('lost response');
  });
  await assert.rejects(first.run(materials));assert.equal(first.pending().materials.length,80);
  for(const bad of [{...receipt,results:receipt.results.slice(1)},{...receipt,results:undefined,attempts:undefined,consumed:[{code:'V-004',quantity:8,totalBefore:81,duplicatesBefore:80}]},
    {...receipt,consumed:[{...receipt.consumed[0],code:'V-009'}]}])assert.throws(()=>validateFusionReceipt(bad,receipt.requestId,materials),{code:'FUSION_RESPONSE_INVALID'});
  const requests=[],reopened=make(async(path,options)=>{requests.push({path,options});return receipt;});
  assert.deepEqual(await reopened.run(undefined,{submit:false}),receipt);assert.equal(requests.length,1);assert.match(requests[0].path,/\/receipt\?/);assert.equal(requests[0].options.method,undefined);
  reopened.acknowledge(receipt.requestId);assert.equal(reopened.pending(),null);
});
