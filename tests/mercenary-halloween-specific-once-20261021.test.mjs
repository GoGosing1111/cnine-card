import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK,halloweenReceiptResults} from '../shared/mercenary-halloween-pack-v1.mjs';
import {halloweenSsOnceKey,readHalloweenSsOnce,consumeHalloweenSsOnce} from '../functions/_mercenary_halloween_once.js';
import {handleHalloweenPack} from '../functions/_mercenary_halloween_pack.js';
import {halloweenBatchCinematic} from '../js/mercenary-halloween-pack-live.mjs';

async function fixture(t,{armed=true}={}){
 const f=await halloweenFixture(t,{randomInt:max=>max-1});
 await f.pg.exec('ALTER TABLE app_meta ADD COLUMN updated_at TEXT');
 f.settings.normalRankRatesPpm.SSS=100;f.settings.missRatePpm=999900;
 f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,code==='V-996'?200:0]));
 f.settings.normalSssRatePpm=999800;await f.configure();
 await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET stock_limit=15,issued=14 WHERE code='V-996'");
 const value={version:2,status:'ARMED',remaining:1,userId:1,actorId:1,operationId:'qa-halloween-valter-once-20261021',packId:HALLOWEEN_PACK.id,rank:'SSS',edition:'SSS_LIMITED',mercenaryCode:'V-996'};
 const arm=async(patch={})=>f.setting(halloweenSsOnceKey(1),{...value,...patch});if(armed)await arm();
 const once=async()=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',halloweenSsOnceKey(1)).first()).value);
 const issues=async()=>(await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows;
 return {...f,arm,once,issues};
}

test('only the armed account receives Valter once, using the last shared serial and normal payment',async t=>{
 const f=await fixture(t),before=JSON.stringify((await f.state()).settings);
 assert.equal((await f.service.open(f.env,{id:2},f.body())).draws[0].outcomeId,'NONE');
 assert.equal((await f.once()).remaining,1);
 const body=f.body(),first=await f.service.open(f.env,f.user,body),draw=first.draws[0];
 assert.equal(draw.mercenaryCode,'V-996');assert.equal(draw.rank,'SSS');assert.equal(draw.edition,'SSS_LIMITED');assert.equal(draw.serial,15);
 assert.equal((await f.once()).remaining,0);assert.equal((await f.once()).acquisitionId,body.requestId+':0');assert.equal(await readHalloweenSsOnce(f.DB,1),null);
 assert.equal((await f.service.open(f.env,f.user,body)).replayed,true);assert.equal(await f.coin(),999900);
 assert.equal((await f.service.open(f.env,f.user,f.body())).draws[0].outcomeId,'NONE');assert.equal(await f.coin(),999800);
 assert.equal((await f.issues()).length,1);assert.equal(JSON.stringify((await f.state()).settings),before);
 assert.equal((await f.pg.query("SELECT * FROM admin_logs WHERE action_type='MERCENARY_HALLOWEEN_CARD_ONCE_CONSUMED'")).rows.length,1);
});

test('automatic ten-opening and lost-ack receipt recovery preserve exactly one Valter and SSS presentation',async t=>{
 const f=await fixture(t),body=f.body(10);f.loseAck();
 const response=await handleHalloweenPack({path:HALLOWEEN_PACK.openPath,request:new Request('https://qa.test/api/'+HALLOWEEN_PACK.openPath,{method:'POST',headers:{origin:'https://qa.test','content-type':'application/json'},body:JSON.stringify(body)}),env:f.env,deps:{authenticate:async()=>f.user,withUserMutationLock:async(_e,_u,_p,fn)=>fn(),json:(body,status)=>({body,status})}});
 assert.equal(response.status,200);assert.equal(response.body.draws[0].mercenaryCode,'V-996');assert(response.body.draws.slice(1).every(d=>d.outcomeId==='NONE'));
 assert.equal(halloweenBatchCinematic(halloweenReceiptResults(response.body)).rank,'SSS');
 assert.deepEqual((await f.service.receipt(f.env,f.user,body.requestId)).draws,response.body.draws);assert.equal(await f.coin(),999100);
 assert((await f.service.open(f.env,f.user,f.body(10))).draws.every(d=>d.outcomeId==='NONE'));assert.equal((await f.issues()).length,1);
});

test('failure rolls back award, stock, debit and entitlement together; funds and OFF do not consume it',async t=>{
 const f=await fixture(t),body=f.body();f.fail('INSERT INTO mercenary_card_acquisitions_v1');
 await assert.rejects(f.service.open(f.env,f.user,body),/INJECTED/);f.fail('');
 assert.equal((await f.once()).remaining,1);assert.equal(await f.coin(),1000000);assert.equal((await f.issues()).length,0);
 assert.equal(Number((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-996'").first()).issued),14);
 await f.pg.exec('UPDATE users SET coin=0 WHERE id=1');await assert.rejects(f.service.open(f.env,f.user,f.body()),e=>e.code==='MERCENARY_HALLOWEEN_FUNDS');
 f.settings.mode='OFF';await f.configure();await assert.rejects(f.service.open(f.env,f.user,f.body()),e=>e.code==='MERCENARY_HALLOWEEN_CLOSED');assert.equal((await f.once()).remaining,1);
 f.settings.mode='ON';await f.configure();await f.pg.exec('UPDATE users SET coin=1000000 WHERE id=1');
 assert.equal((await f.service.open(f.env,f.user,body)).draws[0].serial,15);assert.equal((await f.once()).remaining,0);
});

test('sold out or disabled target and a stock race retain the specific entitlement without exceeding stock',async t=>{
 const f=await fixture(t),batch=f.DB.batch.bind(f.DB);let raced=false;
 f.DB.batch=async statements=>{if(!raced){raced=true;await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=15 WHERE code='V-996'");}return batch(statements);};
 const result=await f.service.open(f.env,f.user,f.body());assert.equal(result.draws[0].edition,'STANDARD');assert.equal(result.draws[0].rank,'SSS');
 assert.equal((await f.once()).remaining,1);assert.equal((await f.issues()).length,0);assert.equal(await f.coin(),999900);
 assert.equal((await f.service.open(f.env,f.user,f.body())).draws[0].outcomeId,'NONE');assert.equal((await f.once()).remaining,1);
 await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=14 WHERE code='V-996'");
 f.settings.cardRatesPpm['V-996']=0;f.settings.cardRatesPpm['V-980']=200;await f.configure();
 assert.equal((await f.service.open(f.env,f.user,f.body())).draws[0].outcomeId,'NONE');assert.equal((await f.once()).remaining,1);
});

test('concurrent requests and a stale pending plan cannot award the same entitlement twice',async t=>{
 const f=await fixture(t),results=await Promise.allSettled([f.body(),f.body()].map(b=>f.service.open(f.env,f.user,b)));
 assert.equal(results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value.draws).filter(d=>d.mercenaryCode==='V-996').length,1);assert.equal((await f.issues()).length,1);
 const g=await fixture(t),stale=g.body();g.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(g.service.open(g.env,g.user,stale),/INJECTED/);g.fail('');
 await g.pg.exec("UPDATE mercenary_limited_stock_v1 SET stock_limit=16 WHERE code='V-996'");
 await g.service.open(g.env,g.user,g.body());await assert.rejects(g.service.open(g.env,g.user,stale),e=>e.code==='MERCENARY_HALLOWEEN_ONCE_CHANGED');
 assert.equal((await g.issues()).length,1);assert.equal(await g.coin(),999900);
});

test('invalid identity, rank, code and client overrides cannot select or consume a specific reward',async t=>{
 const f=await fixture(t);
 for(const patch of [{userId:2},{rank:'SS'},{mercenaryCode:'V-980'},{mercenaryCode:'V-057'},{remaining:2}]){
  await f.arm(patch);await assert.rejects(f.service.open(f.env,f.user,f.body()),e=>e.code==='MERCENARY_HALLOWEEN_ONCE_CONFIG');
 }
 await f.arm();await assert.rejects(f.service.open(f.env,f.user,{...f.body(),firstLimitedCode:'V-996'}),e=>e.code==='MERCENARY_HALLOWEEN_INPUT');
 const once=await readHalloweenSsOnce(f.DB,1);
 await assert.rejects(consumeHalloweenSsOnce(f.DB,1,'wrong-card',once,{rank:'SSS',edition:'SSS_LIMITED',mercenaryCode:'V-999',quantity:1}),e=>e.code==='MERCENARY_HALLOWEEN_ONCE_CONFIG');
 assert.equal((await f.once()).remaining,1);assert.equal(await f.coin(),1000000);
});

test('arming never rewrites an already prepared opening; the next new opening receives Valter',async t=>{
 const f=await fixture(t,{armed:false}),old=f.body();f.fail('INSERT INTO coin_logs');await assert.rejects(f.service.open(f.env,f.user,old),/INJECTED/);f.fail('');
 await f.arm();assert.equal((await f.service.open(f.env,f.user,old)).draws[0].outcomeId,'NONE');assert.equal((await f.once()).remaining,1);
 assert.equal((await f.service.open(f.env,f.user,f.body())).draws[0].mercenaryCode,'V-996');assert.equal((await f.once()).remaining,0);
});
