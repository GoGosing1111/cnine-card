import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {openMercenaryCards,MERCENARY_RUNTIME_KEY} from '../functions/_mercenary_account.js';
import {mercenarySsOnceKey,mercenarySsOnceState,pickMercenarySsOnce} from '../functions/_mercenary_ss_once.js';
import {handleMercenaryAccount} from '../functions/_mercenary_account_routes.js';
import {HYPER_OPENING_KEY} from '../functions/_hyper_pack_opening.js';
import {mercenaryPackResults} from '../shared/mercenary-pack-contract-v1.mjs';

async function fixture(t,postgres){
 const f=await mercenaryFixture(t,{postgres});
 for(const c of f.document.mercenaries)if(['V-004','V-040'].includes(c.code))c.rank='SS';
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
 await f.p('UPDATE users SET coin=60000000000').run();
 await f.setting(MERCENARY_RUNTIME_KEY,{...f.policy,opening:{...f.policy.opening,coinPerOpen:500000000}});
 await f.setting(HYPER_OPENING_KEY,{revision:1,mode:'ON',version:'hyper-opening-2093'});
 const state=mercenarySsOnceState({userId:7,actorId:7,operationId:'test-one-time-ss-2104',reason:'Test next batch only'});
 await f.setting(mercenarySsOnceKey(7),state);
 return {...f,state,once:async()=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',mercenarySsOnceKey(7)).first()).value)};
}
const open=(f,count=10,requestId=crypto.randomUUID(),user=f.user,randomInt=()=>0)=>openMercenaryCards(f.env,user,{count,requestId},{randomInt});
const grants=r=>r.draws.filter(d=>d.grantKind==='ONE_TIME_SS_GUARANTEE');
for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL':'SQLite';
 test(`${dialect}: only selected account's next ten-pack receives one SS; count, price and future odds remain unchanged`,async t=>{
  const f=await fixture(t,postgres),beforeDraw=await f.p('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1').first();
  assert.equal(grants(await open(f,1)).length,0);assert.equal((await f.once()).status,'ARMED');
  assert.equal(grants(await open(f,10,crypto.randomUUID(),{...f.user,id:8})).length,0);assert.equal((await f.once()).status,'ARMED');
  const receipt=await open(f);assert.equal(receipt.count,10);assert.equal(receipt.coinCost,5000000000);assert.equal(receipt.draws.length,10);
  assert.equal(grants(receipt).length,1);assert.equal(receipt.draws[9].rank,'SS');assert.equal(receipt.draws[9].mercenaryCode,'V-004');
  assert.equal(mercenaryPackResults(receipt).length,10);assert.equal((await f.once()).status,'CONSUMED');
  const replay=await open(f,10,receipt.requestId,f.user,()=>{throw Error('Must not reroll');});assert.equal(replay.replayed,true);assert.deepEqual(replay.draws,receipt.draws);
  assert.equal(grants(await open(f)).length,0);assert.equal(await f.coin(),49500000000);
  assert.equal(Number((await f.p('SELECT SUM(total_copies) n FROM user_mercenary_cards_v1 WHERE user_id=7').first()).n),21);
  assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='MERCENARY_SS_ONCE_CONSUMED'").first()).n),1);
  assert.deepEqual(await f.p('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1').first(),beforeDraw);
 });
 test(`${dialect}: failed payment or grant never consumes the guarantee; saved retry grants exactly once`,async t=>{
  const f=await fixture(t,postgres);await f.p('UPDATE users SET coin=1 WHERE id=7').run();
  await assert.rejects(()=>open(f),e=>e.code==='MERCENARY_FUNDS');assert.equal((await f.once()).status,'ARMED');
  await f.p('UPDATE users SET coin=60000000000 WHERE id=7').run();f.fail('INSERT INTO mercenary_card_acquisitions_v1');
  const id=crypto.randomUUID();await assert.rejects(()=>open(f,10,id));assert.equal((await f.once()).status,'ARMED');assert.equal(await f.coin(),60000000000);
  f.fail('');const r=await open(f,10,id,f.user,()=>{throw Error('Must reuse durable result');});assert.equal(grants(r).length,1);assert.equal(await f.coin(),55000000000);assert.equal((await f.once()).status,'CONSUMED');
 });
 test(`${dialect}: a stale competing pending request cannot consume a second grant or debit`,async t=>{
  const f=await fixture(t,postgres),stale=crypto.randomUUID();f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(()=>open(f,10,stale));f.fail('');
  const winner=await open(f);assert.equal(grants(winner).length,1);
  await assert.rejects(()=>open(f,10,stale),e=>e.code==='JOINT_OPERATION_SUPERSEDED');assert.equal(await f.coin(),55000000000);
  assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',stale).first()).status,'CANCELLED');
  assert.equal(Number((await f.p('SELECT SUM(total_copies) n FROM user_mercenary_cards_v1 WHERE user_id=7').first()).n),10);
 });
 test(`${dialect}: public aliases serialize concurrent requests; client fields cannot arm a guarantee`,async t=>{
  const f=await fixture(t,postgres),origin='https://game.test';
  const call=(path,body)=>handleMercenaryAccount({env:f.env,path,deps:{...f.deps,authenticate:async()=>({...f.user,role:'USER'})},request:new Request(origin+'/api/'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})});
  const results=await Promise.all(['mercenary-cards/open-batch','hyper-pack/open'].map(path=>call(path,{count:10,requestId:crypto.randomUUID()})));
  for(const r of results)assert.equal(r.status,200,await r.clone().text());
  assert.equal((await Promise.all(results.map(r=>r.json()))).flatMap(grants).length,1);assert.equal(await f.coin(),50000000000);
  assert.equal((await call('mercenary-cards/open-batch',{count:10,requestId:crypto.randomUUID(),ssOnce:{rank:'SS'}})).status,400);
 });
 test(`${dialect}: each SS remains equally selectable; duplicate grants use the existing copy accounting`,async t=>{
  const f=await fixture(t,postgres),pool=f.document.mercenaries.filter(c=>c.rank==='SS').map(c=>c.code).sort();
  for(let i=0;i<pool.length;i++)assert.equal(pickMercenarySsOnce({policy:f.draw,mercenaries:f.document.mercenaries,randomInt:max=>max===1000000?0:i}).mercenaryCode,pool[i]);
  const draw=structuredClone(f.draw);for(const o of draw.outcomes)o.chancePpm=o.id==='CARD_SS'?1000000:0;await f.setDraw(draw);await open(f,1);await f.setDraw(f.draw);
  const r=await open(f);assert.equal(r.draws[9].duplicate,true);assert.equal(r.draws[9].duplicateCount,1);assert.equal(r.draws[9].totalCopies,2);
 });
}

for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL':'SQLite';
 const armTarget=async f=>f.setting(mercenarySsOnceKey(7),mercenarySsOnceState({...f.state,mercenaryCode:'V-004',slotIndex:2}));
 test(dialect+': targeted Vespera appears in third slot once, ordered receipt and other accounts remain normal',async t=>{
  const f=await fixture(t,postgres);await armTarget(f);
  const random=max=>max===1000000?0:max-1;
  assert.equal(grants(await open(f,1,crypto.randomUUID(),f.user,random)).length,0);
  assert.equal(grants(await open(f,10,crypto.randomUUID(),{...f.user,id:8},random)).length,0);
  assert.equal((await f.once()).status,'ARMED');
  const r=await open(f,10,crypto.randomUUID(),f.user,random);
  assert.equal(r.coinCost,5000000000);assert.equal(grants(r).length,1);
  assert.equal(r.draws[2].mercenaryCode,'V-004');assert.equal(r.draws[2].rank,'SS');assert.equal(r.draws[2].grantKind,'ONE_TIME_SS_GUARANTEE');
  assert.equal(mercenaryPackResults(r)[2].mercenaryCode,'V-004');
  assert.equal((await f.once()).acquisitionId,r.requestId+':2');
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?',r.requestId+':2').first()).n),1);
  assert.deepEqual((await open(f,10,r.requestId,f.user,()=>{throw Error('No reroll')})).draws,r.draws);
  assert.equal(grants(await open(f)).length,0);
 });
 test(dialect+': targeted grant rolls back on failure, competing stale request cannot grant or charge twice',async t=>{
  const f=await fixture(t,postgres);await armTarget(f);
  await f.p('UPDATE users SET coin=1 WHERE id=7').run();
  await assert.rejects(()=>open(f),e=>e.code==='MERCENARY_FUNDS');assert.equal((await f.once()).status,'ARMED');
  await f.p('UPDATE users SET coin=60000000000 WHERE id=7').run();
  const stale=crypto.randomUUID();f.fail('INSERT INTO mercenary_card_acquisitions_v1');
  await assert.rejects(()=>open(f,10,stale));assert.equal((await f.once()).status,'ARMED');assert.equal(await f.coin(),60000000000);f.fail('');
  const r=await open(f);assert.equal(r.draws[2].mercenaryCode,'V-004');
  await assert.rejects(()=>open(f,10,stale),e=>e.code==='JOINT_OPERATION_SUPERSEDED');
  assert.equal(await f.coin(),55000000000);assert.equal((await f.once()).status,'CONSUMED');
  assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='MERCENARY_SS_ONCE_CONSUMED'").first()).n),1);
 });
 test(dialect+': targeted configuration rejects non-SS card without consuming or charging',async t=>{
  const f=await fixture(t,postgres);await armTarget(f);
  f.document.mercenaries.find(c=>c.code==='V-004').rank='S';
  await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
  await assert.rejects(()=>open(f),e=>e.code==='MERCENARY_SS_ONCE_TARGET');
  assert.equal((await f.once()).status,'ARMED');assert.equal(await f.coin(),60000000000);
 });
 test(dialect+': third completed ten-pack grants once; single opens, other accounts and receipt replays do not advance',async t=>{
  const f=await fixture(t,postgres);
  await f.setting(mercenarySsOnceKey(7),mercenarySsOnceState({...f.state,mercenaryCode:'V-004',slotIndex:9,batchesRemaining:3}));
  const policyBefore=await f.p('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1').first();
  await open(f,1);await open(f,10,crypto.randomUUID(),{...f.user,id:8});assert.equal((await f.once()).batchesRemaining,3);
  const first=await open(f);assert.equal(grants(first).length,0);assert.equal((await f.once()).batchesRemaining,2);
  await open(f,10,first.requestId,f.user,()=>{throw Error('Do not reroll');});assert.equal((await f.once()).batchesRemaining,2);
  const second=await open(f);assert.equal(grants(second).length,0);assert.equal((await f.once()).batchesRemaining,1);
  const third=await open(f);assert.equal(grants(third).length,1);assert.equal(third.draws[9].mercenaryCode,'V-004');assert.equal((await f.once()).status,'CONSUMED');
  assert.equal(grants(await open(f)).length,0);
  assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='MERCENARY_SS_ONCE_ADVANCED'").first()).n),2);
  assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='MERCENARY_SS_ONCE_CONSUMED'").first()).n),1);
  assert.deepEqual(await f.p('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1').first(),policyBefore);
 });
 test(dialect+': deferred countdown rolls back with failed rewards and rejects stale saved batches without debit',async t=>{
  const f=await fixture(t,postgres);
  await f.setting(mercenarySsOnceKey(7),mercenarySsOnceState({...f.state,mercenaryCode:'V-004',slotIndex:9,batchesRemaining:3}));
  await f.p('UPDATE users SET coin=1 WHERE id=7').run();await assert.rejects(()=>open(f),e=>e.code==='MERCENARY_FUNDS');assert.equal((await f.once()).batchesRemaining,3);
  await f.p('UPDATE users SET coin=60000000000 WHERE id=7').run();
  const stale=crypto.randomUUID();f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(()=>open(f,10,stale));
  assert.equal((await f.once()).batchesRemaining,3);assert.equal(await f.coin(),60000000000);f.fail('');
  await open(f);assert.equal((await f.once()).batchesRemaining,2);
  await assert.rejects(()=>open(f,10,stale),e=>e.code==='JOINT_OPERATION_SUPERSEDED');assert.equal((await f.once()).batchesRemaining,2);assert.equal(await f.coin(),55000000000);
  const retry=crypto.randomUUID();f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(()=>open(f,10,retry));f.fail('');
  await open(f,10,retry,f.user,()=>{throw Error('Reuse saved rolls');});assert.equal((await f.once()).batchesRemaining,1);
  assert.equal(grants(await open(f)).length,1);
 });
 test(dialect+': concurrent public ten-pack requests advance the countdown serially and grant only once',async t=>{
  const f=await fixture(t,postgres);await f.setting(mercenarySsOnceKey(7),mercenarySsOnceState({...f.state,mercenaryCode:'V-004',slotIndex:9,batchesRemaining:3}));
  const origin='https://game.test',receipts=await Promise.all(Array.from({length:3},async()=>{
   const r=await handleMercenaryAccount({env:f.env,path:'hyper-pack/open',deps:{...f.deps,authenticate:async()=>({...f.user,role:'USER'})},request:new Request(origin+'/api/hyper-pack/open',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({count:10,requestId:crypto.randomUUID()})})});
   assert.equal(r.status,200,await r.clone().text());return r.json();
  }));
  assert.equal(receipts.flatMap(grants).length,1);assert.equal((await f.once()).status,'CONSUMED');assert.equal(await f.coin(),45000000000);
 });
}
test('targeted one-time grant requires a complete, bounded card and slot pair',()=>{
 const base={userId:7,actorId:7,operationId:'targeted-validation-test',reason:'test'};
 for(const extra of [{mercenaryCode:'V-004'},{slotIndex:2},{mercenaryCode:'V-004',slotIndex:-1},{mercenaryCode:'V-004',slotIndex:10},{mercenaryCode:'V-004',slotIndex:2.5},{mercenaryCode:'bad',slotIndex:2}])assert.throws(()=>mercenarySsOnceState({...base,...extra}));
 for(const batchesRemaining of [0,-1,101,1.5,'3',null,NaN])assert.throws(()=>mercenarySsOnceState({...base,batchesRemaining}));
});

// RAGNIEL-0921: SSS 지정 1회 보장 (족게이다 · 라그니엘 V-046 · 두 번째 칸)
for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL':'SQLite';
 test(dialect+': targeted SSS Ragniel appears in the second slot once; SS states and odds untouched',async t=>{
  const f=await fixture(t,postgres);
  assert.equal(f.document.mercenaries.find(c=>c.code==='V-046').rank,'SSS');
  await f.setting(mercenarySsOnceKey(7),mercenarySsOnceState({...f.state,rank:'SSS',mercenaryCode:'V-046',slotIndex:1}));
  const random=max=>max===1000000?0:max-1;
  assert.equal(grants(await open(f,1,crypto.randomUUID(),f.user,random)).length,0);
  assert.equal(grants(await open(f,10,crypto.randomUUID(),{...f.user,id:8},random)).length,0);
  assert.equal((await f.once()).status,'ARMED');
  const r=await open(f,10,crypto.randomUUID(),f.user,random);
  assert.equal(r.coinCost,5000000000);assert.equal(grants(r).length,1);
  assert.equal(r.draws[1].mercenaryCode,'V-046');assert.equal(r.draws[1].rank,'SSS');assert.equal(r.draws[1].grantKind,'ONE_TIME_SS_GUARANTEE');
  assert.equal(mercenaryPackResults(r)[1].mercenaryCode,'V-046');
  assert.equal((await f.once()).status,'CONSUMED');assert.equal((await f.once()).acquisitionId,r.requestId+':1');
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?',r.requestId+':1').first()).n),1);
  assert.equal(grants(await open(f,10,crypto.randomUUID(),f.user,random)).length,0);
 });
 test(dialect+': SSS grant rejects an SS card and unknown ranks',async t=>{
  const f=await fixture(t,postgres);
  assert.throws(()=>mercenarySsOnceState({...f.state,rank:'S',mercenaryCode:'V-004',slotIndex:1}),/rank/);
  await f.setting(mercenarySsOnceKey(7),mercenarySsOnceState({...f.state,rank:'SSS',mercenaryCode:'V-004',slotIndex:1}));
  await assert.rejects(open(f),/SSS 용병/);
  assert.equal((await f.once()).status,'ARMED');
 });
}
