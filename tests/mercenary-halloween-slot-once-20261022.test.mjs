import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK} from '../shared/mercenary-halloween-pack-v1.mjs';
import {halloweenSsOnceKey,readHalloweenSsOnce} from '../functions/_mercenary_halloween_once.js';
import {handleHalloweenPack} from '../functions/_mercenary_halloween_pack.js';

async function fixture(t,{armed=true,randomInt=max=>max-1}={}){
 const f=await halloweenFixture(t,{randomInt});await f.pg.exec('ALTER TABLE app_meta ADD COLUMN updated_at TEXT');
 f.settings.normalRankRatesPpm.SSS=100;f.settings.missRatePpm=999900;
 f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,code==='V-979'?300:0]));
 f.settings.normalSssRatePpm=999700;await f.configure();
 const value={version:3,status:'ARMED',remaining:1,userId:1,actorId:1,operationId:'qa-indexed-once',packId:HALLOWEEN_PACK.id,rank:'SSS',edition:'SSS_LIMITED',mercenaryCode:'V-979',slotIndex:2};
 const arm=async(patch={})=>f.setting(halloweenSsOnceKey(1),{...value,...patch});if(armed)await arm();
 const once=async()=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',halloweenSsOnceKey(1)).first()).value);
 const issues=async()=>(await f.pg.query("SELECT * FROM mercenary_limited_issues_v1 WHERE code='V-979'")).rows;
 return {...f,arm,once,issues};
}
test('third-slot guarantee affects only the target account once and waits through single openings',async t=>{
 const f=await fixture(t),settings=JSON.stringify((await f.state()).settings);
 assert((await f.service.open(f.env,{id:2},f.body(10))).draws.every(d=>d.outcomeId==='NONE'));
 assert.equal((await f.service.open(f.env,f.user,f.body())).draws[0].outcomeId,'NONE');assert.equal((await f.once()).remaining,1);
 const body=f.body(10),result=await f.service.open(f.env,f.user,body);
 assert.equal(result.draws[2].mercenaryCode,'V-979');assert(result.draws.filter((_,i)=>i!==2).every(d=>d.outcomeId==='NONE'));
 assert.equal((await f.once()).acquisitionId,body.requestId+':2');assert.equal((await f.once()).remaining,0);assert.equal(await readHalloweenSsOnce(f.DB,1),null);
 assert.equal((await f.service.open(f.env,f.user,body)).replayed,true);assert.equal(await f.coin(),999000);
 assert((await f.service.open(f.env,f.user,f.body(10))).draws.every(d=>d.outcomeId==='NONE'));
 assert.equal((await f.issues()).length,1);assert.equal(JSON.stringify((await f.state()).settings),settings);
});
test('automatic public ten-opening and lost acknowledgment preserve third-slot receipt and one debit',async t=>{
 const f=await fixture(t),body=f.body(10);f.loseAck();
 const result=await handleHalloweenPack({path:HALLOWEEN_PACK.openPath,request:new Request('https://qa.test/api/'+HALLOWEEN_PACK.openPath,{method:'POST',headers:{origin:'https://qa.test','content-type':'application/json'},body:JSON.stringify(body)}),env:f.env,deps:{authenticate:async()=>f.user,withUserMutationLock:async(_e,_u,_p,fn)=>fn(),json:(body,status)=>({body,status})}});
 assert.equal(result.status,200);assert.equal(result.body.draws[2].mercenaryCode,'V-979');
 assert.deepEqual((await f.service.receipt(f.env,f.user,body.requestId)).draws,result.body.draws);assert.equal(await f.coin(),999100);assert.equal((await f.issues()).length,1);
});
test('award failure rolls back stock, payment and entitlement; OFF and insufficient funds preserve it',async t=>{
 const f=await fixture(t),body=f.body(10);f.fail('INSERT INTO mercenary_card_acquisitions_v1');
 await assert.rejects(f.service.open(f.env,f.user,body),/INJECTED/);f.fail('');assert.equal((await f.once()).remaining,1);assert.equal((await f.issues()).length,0);assert.equal(await f.coin(),1000000);
 await f.pg.exec('UPDATE users SET coin=0 WHERE id=1');await assert.rejects(f.service.open(f.env,f.user,f.body(10)),e=>e.code==='MERCENARY_HALLOWEEN_FUNDS');
 f.settings.mode='OFF';await f.configure();await assert.rejects(f.service.open(f.env,f.user,f.body(10)),e=>e.code==='MERCENARY_HALLOWEEN_CLOSED');assert.equal((await f.once()).remaining,1);
 f.settings.mode='ON';await f.configure();await f.pg.exec('UPDATE users SET coin=1000000 WHERE id=1');
 assert.equal((await f.service.open(f.env,f.user,body)).draws[2].mercenaryCode,'V-979');assert.equal((await f.once()).remaining,0);
});
test('last serial stays in the third slot even if ordinary earlier slots roll the same limited card',async t=>{
 const f=await fixture(t,{randomInt:()=>0});await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=2 WHERE code='V-979'");
 const result=await f.service.open(f.env,f.user,f.body(10));
 assert.equal(result.draws[2].mercenaryCode,'V-979');assert.equal(result.draws[2].serial,3);assert.equal(result.draws.filter(d=>d.mercenaryCode==='V-979').length,1);assert.equal((await f.once()).remaining,0);
});
test('stock race reserves the remaining serial for the third slot and sold-out fallback retains entitlement',async t=>{
 const f=await fixture(t,{randomInt:()=>0}),batch=f.DB.batch.bind(f.DB);let raced=false;
 f.DB.batch=async statements=>{if(!raced){raced=true;await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=2 WHERE code='V-979'");}return batch(statements);};
 const result=await f.service.open(f.env,f.user,f.body(10));assert.equal(result.draws[2].mercenaryCode,'V-979');assert.equal(result.draws.filter(d=>d.mercenaryCode==='V-979').length,1);assert.equal((await f.once()).remaining,0);
 const g=await fixture(t),gBatch=g.DB.batch.bind(g.DB);let sold=false;
 g.DB.batch=async statements=>{if(!sold){sold=true;await g.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=3 WHERE code='V-979'");}return gBatch(statements);};
 const fallback=await g.service.open(g.env,g.user,g.body(10));assert.equal(fallback.draws[2].edition,'STANDARD');assert.equal((await g.once()).remaining,1);assert.equal((await g.issues()).length,0);
});
test('invalid slots and client-selected overrides cannot alter the grant',async t=>{
 const f=await fixture(t);
 for(const patch of [{slotIndex:-1},{slotIndex:10},{slotIndex:2.5},{slotIndex:'2'},{slotIndex:null},{slotIndex:undefined},{version:2},{userId:2},{mercenaryCode:'V-980'}]){
  await f.arm(patch);await assert.rejects(f.service.open(f.env,f.user,f.body(10)),e=>e.code==='MERCENARY_HALLOWEEN_ONCE_CONFIG');
 }
 await f.arm();for(const field of ['slotIndex','mercenaryCode'])await assert.rejects(f.service.open(f.env,f.user,{...f.body(10),[field]:2}),e=>e.code==='MERCENARY_HALLOWEEN_INPUT');
 assert.equal((await f.once()).remaining,1);assert.equal(await f.coin(),1000000);
});
test('old prepared results remain intact and concurrent requests cannot consume the guarantee twice',async t=>{
 const f=await fixture(t,{armed:false}),old=f.body(10);f.fail('INSERT INTO coin_logs');await assert.rejects(f.service.open(f.env,f.user,old),/INJECTED/);f.fail('');
 await f.arm();assert((await f.service.open(f.env,f.user,old)).draws.every(d=>d.outcomeId==='NONE'));assert.equal((await f.once()).remaining,1);
 const results=await Promise.allSettled([f.body(10),f.body(10)].map(body=>f.service.open(f.env,f.user,body)));
 assert.equal(results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value.draws).filter(d=>d.mercenaryCode==='V-979').length,1);assert.equal((await f.issues()).length,1);
});
