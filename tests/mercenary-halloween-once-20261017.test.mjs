import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK,halloweenReceiptResults} from '../shared/mercenary-halloween-pack-v1.mjs';
import {halloweenSsOnceKey,readHalloweenSsOnce} from '../functions/_mercenary_halloween_once.js';
import {handleHalloweenPack} from '../functions/_mercenary_halloween_pack.js';
import {halloweenBatchCinematic} from '../js/mercenary-halloween-pack-live.mjs';

async function fixture(t){
 const f=await halloweenFixture(t,{randomInt:max=>max-1});
 await f.pg.exec('ALTER TABLE app_meta ADD COLUMN updated_at TEXT');
 f.settings.normalRankRatesPpm.SSS=100;f.settings.missRatePpm=999900;await f.configure();
 const value={version:1,status:'ARMED',remaining:1,userId:1,actorId:1,operationId:'qa-halloween-once-20261017',packId:HALLOWEEN_PACK.id,rank:'SS',edition:'HALLOWEEN_LIMITED'};
 const arm=async(patch={})=>f.setting(halloweenSsOnceKey(1),{...value,...patch});await arm();
 const once=async()=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',halloweenSsOnceKey(1)).first()).value);
 return {...f,arm,once};
}
test('single opening guarantees one Halloween SS only to the armed account, then returns to ordinary odds',async t=>{
 const f=await fixture(t);const other=await f.service.open(f.env,{id:2},f.body());assert.equal(other.draws[0].outcomeId,'NONE');assert.equal((await f.once()).remaining,1);
 const b=f.body(),first=await f.service.open(f.env,f.user,b);assert.equal(first.draws[0].rank,'SS');assert.equal(first.draws[0].edition,'HALLOWEEN_LIMITED');assert.equal(first.draws[0].serial,1);assert.equal((await f.once()).acquisitionId,b.requestId+':0');assert.equal(await readHalloweenSsOnce(f.DB,1),null);
 assert.equal((await f.service.open(f.env,f.user,b)).replayed,true);assert.equal(await f.coin(),999900);
 const next=await f.service.open(f.env,f.user,f.body());assert.equal(next.draws[0].outcomeId,'NONE');assert.equal(await f.coin(),999800);assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows.length,1);
});
test('automatic ten-opening uses the same public route and exactly one forced slot; receipt recovery preserves the SS reveal',async t=>{
 const f=await fixture(t),body=f.body(10);f.loseAck();
 const response=await handleHalloweenPack({path:HALLOWEEN_PACK.openPath,request:new Request('https://qa.test/api/'+HALLOWEEN_PACK.openPath,{method:'POST',headers:{origin:'https://qa.test','content-type':'application/json'},body:JSON.stringify(body)}),env:f.env,deps:{authenticate:async()=>f.user,withUserMutationLock:async(_e,_u,_p,fn)=>fn(),json:(body,status)=>({body,status})}});
 assert.equal(response.status,200);assert.equal(response.body.draws[0].edition,'HALLOWEEN_LIMITED');assert.equal(response.body.count,10);assert.equal(await f.coin(),999100);
 const recovered=await f.service.receipt(f.env,f.user,body.requestId);assert.deepEqual(recovered.draws,response.body.draws);assert.equal(halloweenBatchCinematic(halloweenReceiptResults(recovered)).rank,'SS');
 assert.equal((await f.pg.query("SELECT * FROM admin_logs WHERE action_type='MERCENARY_HALLOWEEN_SS_ONCE_CONSUMED'")).rows.length,1);
 const next=await f.service.open(f.env,f.user,f.body(10));assert(next.draws.every(d=>d.outcomeId==='NONE'));assert.equal(await f.coin(),998200);
});
test('failed grant and insufficient funds retain the guarantee, stock and original durable result',async t=>{
 const f=await fixture(t),body=f.body();
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,f.user,body),/INJECTED/);f.fail('');
 assert.equal((await f.once()).remaining,1);assert.equal(await f.coin(),1000000);assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows.length,0);assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,0);
 const first=await f.service.open(f.env,f.user,body);assert.equal(first.draws[0].serial,1);assert.equal((await f.once()).remaining,0);
 await f.arm();await f.pg.exec('UPDATE users SET coin=0 WHERE id=1');await assert.rejects(f.service.open(f.env,f.user,f.body()),e=>e.code==='MERCENARY_HALLOWEEN_FUNDS');assert.equal((await f.once()).remaining,1);
});
test('concurrent requests, stale plans and lost acknowledgements cannot consume the same entitlement twice',async t=>{
 const f=await fixture(t),bodies=[f.body(),f.body()];
 const results=await Promise.allSettled(bodies.map(b=>f.service.open(f.env,f.user,b))),completed=results.filter(r=>r.status==='fulfilled');assert.equal(completed.flatMap(r=>r.value.draws).filter(d=>d.edition==='HALLOWEEN_LIMITED').length,1);assert.equal(await f.coin(),1000000-completed.length*100);assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows.length,1);
 assert.equal((await f.service.open(f.env,f.user,f.body())).draws[0].outcomeId,'NONE');
 const g=await fixture(t),stale=g.body();g.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(g.service.open(g.env,g.user,stale),/INJECTED/);g.fail('');await g.service.open(g.env,g.user,g.body());
 await assert.rejects(g.service.open(g.env,g.user,stale),e=>e.code==='MERCENARY_HALLOWEEN_ONCE_CHANGED');assert.equal(await g.coin(),999900);
});
test('sold out, OFF, mismatched identity and client supplied overrides never consume or bypass policy',async t=>{
 const f=await fixture(t);
 await f.arm({userId:2});await assert.rejects(f.service.open(f.env,f.user,f.body()),e=>e.code==='MERCENARY_HALLOWEEN_ONCE_CONFIG');
 await f.arm();await assert.rejects(f.service.open(f.env,f.user,{...f.body(),firstLimitedCode:'V-980'}),e=>e.code==='MERCENARY_HALLOWEEN_INPUT');
 await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code='V-980'");assert.equal((await f.service.open(f.env,f.user,f.body())).draws[0].outcomeId,'NONE');
 f.settings.mode='OFF';await f.configure();await assert.rejects(f.service.open(f.env,f.user,f.body()),e=>e.code==='MERCENARY_HALLOWEEN_CLOSED');assert.equal(await f.coin(),999900);assert.equal((await f.once()).remaining,1);
});
