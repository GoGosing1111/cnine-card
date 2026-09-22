import test from 'node:test';
import assert from 'node:assert/strict';
import { mercenaryFixture } from './helpers/mercenary-db.mjs';
import { MERCENARY_FUSION_POLICY as POLICY } from '../shared/mercenary-fusion-policy-v1.mjs';
import { pickFusionResult, runPreparedMercenaryFusion, fusionReceipt, handleMercenaryFusion } from '../functions/_mercenary_fusion.js';
import { handleMercenaryAccount } from '../functions/_mercenary_account_routes.js';

const materials = [...Array(5).fill('V-004'),...Array(3).fill('V-009')];
const random = (...values) => max => { const n = values.shift(); assert.ok(n>=0&&n<max, `invalid fixture roll ${n}/${max}`); return n; };
const snapshot = async f => (await f.p('SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=7 ORDER BY mercenary_code').all()).results.map(c=>({...c}));
async function fixture(t,postgres) {
  const f=await mercenaryFixture(t,{postgres});
  for(const c of f.document.mercenaries.filter(c=>Number(c.code.slice(2))<44))c.rank=['V-004','V-009'].includes(c.code)?'SS':['V-020','V-021'].includes(c.code)?'SSS':'C';
  await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
  for(const [code,qty] of [['V-004',6],['V-009',4]])await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,?,?,?,?)',code,qty,qty-1,'2026-09-22','2026-09-22').run();
  await f.p("INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(7,'V-004',17,'2026-09-22')").run();
  await f.p('UPDATE users SET coin=0 WHERE id=7').run();
  return f;
}

test('10% boundary is exact and within-rank weights do not change promotion odds',()=>{
  const base={rank:'SS',pools:{SS:['V-004','V-009'],SSS:['V-021','V-046']},rules:{cardWeights:{'V-021':9,'V-046':1}}};
  assert.equal(pickFusionResult({...base,randomInt:random(99999,8)}).mercenaryCode,'V-021');
  assert.equal(pickFusionResult({...base,randomInt:random(99999,9)}).mercenaryCode,'V-046');
  assert.equal(pickFusionResult({...base,randomInt:random(100000,1)}).mercenaryCode,'V-009');
  assert.equal(pickFusionResult({...base,randomInt:random(999999,0)}).promoted,false);
  assert.throws(()=>pickFusionResult({...base,rank:'SSS'}),{code:'MERCENARY_FUSION_MAX_RANK'});
  assert.throws(()=>pickFusionResult({...base,pools:{SS:['V-004'],SSS:[]}}),{code:'MERCENARY_FUSION_POOL_EMPTY'});
});
for(const postgres of [false,true]) {
  const name=postgres?'Postgres':'SQLite';
  test(`${name}: success consumes exactly eight extras, grants one, and never changes wallet or deployment`,async t=>{
    const f=await fixture(t,postgres),body={requestId:crypto.randomUUID(),materials};
    const result=await runPreparedMercenaryFusion(f.env,f.user,body,{randomInt:random(0,0)});
    assert.equal(result.status,'COMPLETED');assert.equal(result.result.promoted,true);assert.equal(result.result.quantity,1);assert.equal(result.result.resultRank,'SSS');
    const after=await snapshot(f);assert.equal(after.reduce((n,c)=>n+Number(c.total_copies),0),3);
    assert.equal(after.find(c=>c.mercenary_code==='V-004').total_copies,1);assert.equal(after.find(c=>c.mercenary_code==='V-009').total_copies,1);
    assert.equal(await f.coin(),0);assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n),0);
    assert.equal((await f.p('SELECT mercenary_code,revision FROM user_mercenary_loadout_v1 WHERE user_id=7').first()).revision,17);
    const replay=await runPreparedMercenaryFusion(f.env,f.user,{...body,materials:[...materials].reverse()},{randomInt(){throw Error('rerolled');}});
    assert.equal(replay.replayed,true);assert.deepEqual(replay.result,result.result);assert.deepEqual(await snapshot(f),after);
    await assert.rejects(()=>runPreparedMercenaryFusion(f.env,f.user,{...body,materials:[...Array(6).fill('V-004'),...Array(2).fill('V-009')]}),{code:'JOINT_REQUEST_CONFLICT'});
    await assert.rejects(()=>fusionReceipt(f.env,{id:8},body.requestId),{code:'JOINT_NOT_FOUND'});
  });
  test(`${name}: failure returns one random same-rank card, including a consumed code`,async t=>{
    const f=await fixture(t,postgres),body={requestId:crypto.randomUUID(),materials};
    const result=await runPreparedMercenaryFusion(f.env,f.user,body,{randomInt:random(100000,1)});
    assert.equal(result.result.promoted,false);assert.equal(result.result.resultRank,'SS');assert.equal(result.result.mercenaryCode,'V-009');
    assert.equal(result.result.totalCopiesAfter,2);assert.equal(result.result.duplicatesAfter,1);assert.equal(result.result.isDuplicate,true);
    assert.equal((await snapshot(f)).reduce((n,c)=>n+Number(c.total_copies),0),3);assert.equal(await f.coin(),0);
  });
  test(`${name}: grant failure rolls back every material and saved randomness survives retry`,async t=>{
    const f=await fixture(t,postgres),before=await snapshot(f),body={requestId:crypto.randomUUID(),materials};
    f.fail('INSERT INTO mercenary_card_acquisitions_v1');
    await assert.rejects(()=>runPreparedMercenaryFusion(f.env,f.user,body,{randomInt:random(0,0)}));
    assert.deepEqual(await snapshot(f),before);assert.equal(await f.coin(),0);
    assert.deepEqual(await fusionReceipt(f.env,f.user,body.requestId),{requestId:body.requestId,status:'PENDING'});
    f.fail('');f.document.mercenaries.find(c=>c.code==='V-020').rank='C';
    await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
    const restored=await runPreparedMercenaryFusion(f.env,f.user,body,{randomInt(){throw Error('rerolled');}});
    assert.equal(restored.result.resultRank,'SSS');assert.equal(restored.result.mercenaryCode,'V-020');
  });
  test(`${name}: invalid or stale materials cannot spend original copies or expose unpaid results`,async t=>{
    const f=await fixture(t,postgres),before=await snapshot(f);
    await assert.rejects(()=>runPreparedMercenaryFusion(f.env,f.user,{requestId:crypto.randomUUID(),materials:Array(8).fill('V-004')}),{code:'MERCENARY_FUSION_DUPLICATES'});
    await assert.rejects(()=>runPreparedMercenaryFusion(f.env,f.user,{requestId:crypto.randomUUID(),materials:materials.slice(1)}),{code:'MERCENARY_FUSION_MATERIALS'});
    await assert.rejects(()=>runPreparedMercenaryFusion(f.env,f.user,{requestId:crypto.randomUUID(),materials:[...materials.slice(0,7),'V-001']}),{code:'MERCENARY_FUSION_RANK'});
    assert.deepEqual(await snapshot(f),before);
    const body={requestId:crypto.randomUUID(),materials};f.fail('INSERT INTO mercenary_card_acquisitions_v1');
    await assert.rejects(()=>runPreparedMercenaryFusion(f.env,f.user,body,{randomInt:random(0,0)}));f.fail('');
    await f.p("UPDATE user_mercenary_cards_v1 SET total_copies=total_copies+1,duplicate_count=duplicate_count+1 WHERE user_id=7 AND mercenary_code='V-004'").run();
    const changed=await snapshot(f);
    await assert.rejects(()=>runPreparedMercenaryFusion(f.env,f.user,body),{code:'MERCENARY_FUSION_INVENTORY_CHANGED'});
    assert.deepEqual(await snapshot(f),changed);assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).status,'CANCELLED');
  });
  test(`${name}: competing requests and a lost commit acknowledgement cannot duplicate results`,async t=>{
    const f=await fixture(t,postgres),batch=f.DB.batch.bind(f.DB);let lost=false;
    f.DB.batch=async statements=>{const result=await batch(statements);if(!lost&&statements.some(s=>s.source?.includes("SET status='COMPLETED'"))){lost=true;throw Error('LOST_COMMIT_ACK');}return result;};
    const requests=[crypto.randomUUID(),crypto.randomUUID()];
    const outcomes=await Promise.allSettled(requests.map(requestId=>f.deps.withUserMutationLock(f.env,7,'fusion',()=>runPreparedMercenaryFusion(f.env,f.user,{requestId,materials},{randomInt:random(0,0)}))));
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(lost,true,'the commit acknowledgement failure was actually injected');
    assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);
    assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM mercenary_card_acquisitions_v1 WHERE user_id=7').first()).n),1);
    assert.equal((await snapshot(f)).reduce((n,c)=>n+Number(c.total_copies),0),3);
    const completed=outcomes.find(r=>r.status==='fulfilled').value;
    const replay=await runPreparedMercenaryFusion(f.env,f.user,{requestId:completed.requestId,materials},{randomInt(){throw Error('rerolled');}});
    assert.equal(replay.replayed,true);assert.deepEqual(replay.result,completed.result);
  });
}
test('public feature publishes approved rules but preparation POST is hard-OFF even for OWNER',async()=>{
  let calls=0;const env={DB:new Proxy({},{get(){calls++;throw Error('DB touched');}})},deps={json:(body,status=200)=>({body,status}),authenticate:async()=>({id:1,role:'OWNER'})};
  const feature=await handleMercenaryFusion({path:'mercenaries/v3/fusion/feature',request:new Request('https://qa.test/api/mercenaries/v3/fusion/feature'),env,deps});
  assert.equal(feature.body.enabled,false);assert.deepEqual(feature.body.policy,POLICY);
  const closed=await handleMercenaryAccount({path:'mercenaries/v3/fusion',request:new Request('https://qa.test/api/mercenaries/v3/fusion',{method:'POST',body:JSON.stringify({requestId:crypto.randomUUID(),materials})}),env,deps});
  assert.equal(closed.status,423);assert.equal(closed.body.code,'MERCENARY_FUSION_PREPARATION');assert.equal(calls,0);
});
