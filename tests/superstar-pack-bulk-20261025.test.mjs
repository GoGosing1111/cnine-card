import test from 'node:test';
import assert from 'node:assert/strict';
import {superstarFixture} from './helpers/superstar-pack-bulk-fixture.mjs';
import {rollSuperstarBulk,resolveSuperstarPackRoll,handleSuperstarPackDraw} from '../functions/_superstar_pack.js';
import {superstarBulkRequestId,superstarBulkCost,validateSuperstarBulkReceipt} from '../shared/superstar-pack-bulk-v1.mjs';

test('bulk permits only 1000/10000 attempts and safe current-price totals',()=>{
 assert.equal(superstarBulkCost(300000000,1000),300000000000);assert.equal(superstarBulkCost(300000000,10000),3000000000000);
 for(const n of [1,10,999,1001,2000,100000,'1000',NaN])assert.throws(()=>superstarBulkCost(1,n));
 for(const p of [0,-1,1.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>superstarBulkCost(p,10000));
});
test('bulk keeps exactly the existing independent hit/card selection rolls',()=>{
 const cards=Array.from({length:40},(_,i)=>({id:String(i)}));
 const seeded=()=>{let n=12345;return ()=>((n=(n*1664525+1013904223)>>>0)/4294967296);};
 for(const successRate of [0,10,27.25,100]){
  const random=seeded(),expected=new Map();for(let i=0;i<10000;i++){const r=resolveSuperstarPackRoll({successRate,hitRoll:random(),cardRoll:random(),cards});if(r.hit)expected.set(r.card.id,(expected.get(r.card.id)||0)+1);}
  assert.deepEqual(rollSuperstarBulk({count:10000,successRate,cards,random:seeded()}).map(r=>[r.card.id,r.count]),[...expected]);
 }
});
for(const count of [1000,10000])for(const successRate of [0,10,100])test(`PostgreSQL ${count} independent attempts at ${successRate}% aggregate cards and preserve all win logs`,async t=>{
 let n=0;const f=await superstarFixture(t,{successRate,randomUnit:()=>{const i=n++;return i%2?((i>>1)%40)/40:((i>>1)%10)/10;}}),id=superstarBulkRequestId();
 const started=performance.now(),r=await f.call(count,id),ms=performance.now()-started;assert.equal(r.status,200,JSON.stringify(r));
 validateSuperstarBulkReceipt(r.body,{requestId:id,userId:1,count});const hits=successRate===100?count:successRate===0?0:count/10;
 assert.equal(r.body.hitCount,hits);assert.equal(r.body.missCount,count-hits);assert(r.body.results.length<=40);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM draw_logs').first()).n),hits);
 assert.equal(Number((await f.p('SELECT COALESCE(SUM(quantity),0) n FROM user_cards').first()).n),hits);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM draw_logs WHERE is_new=1').first()).n),r.body.results.length);
 assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),100000000000000-count*300000000);
 assert.equal(Number((await f.p('SELECT card_shards FROM users WHERE id=1').first()).card_shards),(hits-r.body.results.length)*600);
 assert(f.batches[0].length<400,'bounded statement count even with 10,000 wins');assert(JSON.stringify(r.body).length<30000);
 await f.p('UPDATE users SET coin=12345,card_shards=12 WHERE id=1').run();await f.p('UPDATE user_cards SET quantity=1').run();
 const replay=await f.call(count,id);assert.equal(replay.status,200);assert.equal(replay.body.coin,12345);assert.equal(replay.body.cardShards,12);assert(Object.values(replay.body.currentQuantities).every(q=>q===1));
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
 t.diagnostic(JSON.stringify({count,successRate,ms:Math.round(ms),types:r.body.results.length,bytes:JSON.stringify(r.body).length,statements:f.batches[0].length}));
});
test('bulk insufficient coins, OFF, changed price and stale unknown request cannot charge',async t=>{
 const f=await superstarFixture(t,{coin:1}),id=superstarBulkRequestId();assert.equal((await f.call(1000,id)).body.code,'SUPERSTAR_INSUFFICIENT_COIN');
 await f.p('UPDATE users SET coin=100000000000000').run();
 assert.equal((await f.call(1000,superstarBulkRequestId(),{expectedCost:1})).body.code,'SUPERSTAR_PRICE_CHANGED');
 assert.equal((await f.call(1000,superstarBulkRequestId(Date.now()-90000000))).body.code,'SUPERSTAR_BULK_EXPIRED');
 await f.p("UPDATE app_meta SET value=? WHERE key='superstar_pack_settings_v1'",JSON.stringify({price:300000000,drawEnabled:false})).run();assert.equal((await f.call()).status,423);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),0);
});
test('same receipt cannot change account/count/price or enter the old reveal protocol',async t=>{
 const f=await superstarFixture(t,{successRate:0}),id=superstarBulkRequestId();assert.equal((await f.call(1000,id)).status,200);
 assert.equal((await f.call(10000,id)).status,409);assert.equal((await f.call(1000,id,{expectedCost:1})).status,409);assert.equal((await f.call(1,id)).status,400);
 f.setUser(2);assert.equal((await f.call(1000,id)).status,409);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});
test('paid bulk receipt survives response loss and an expired ID while OFF',async t=>{
 const f=await superstarFixture(t,{successRate:100,types:1});f.loseAck();const id=superstarBulkRequestId(),r=await f.call(1000,id);assert.equal(r.status,200);
 const old=superstarBulkRequestId(Date.now()-90000000);await f.p('UPDATE superstar_pack_receipts_v1 SET request_id=?,response_json=? WHERE request_id=?',old,JSON.stringify({...r.body,requestId:old}),id).run();
 await f.p("UPDATE app_meta SET value=? WHERE key='superstar_pack_settings_v1'",JSON.stringify({drawEnabled:false})).run();const replay=await f.call(1000,old);assert.equal(replay.status,200);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});
test('first bulk response uses current holdings after an intervening committed action',async t=>{
 const f=await superstarFixture(t,{successRate:100,types:1});f.afterCommit(async()=>{await f.p('UPDATE user_cards SET quantity=3').run();await f.p('UPDATE users SET coin=12345,card_shards=6 WHERE id=1').run();});
 const r=await f.call(1000);assert.equal(r.status,200);assert.equal(r.body.coin,12345);assert.equal(r.body.cardShards,6);assert.deepEqual(r.body.currentQuantities,{S000:3});assert.equal(r.body.results[0].quantityAfter,1000);validateSuperstarBulkReceipt(r.body);
});
for(const fault of ['coin','quantity','settings','card','log','receipt'])test(`bulk ${fault} race/write suppression rolls back all payment and grants`,async t=>{
 const f=await superstarFixture(t,{successRate:100,types:1});
 if(fault==='coin')f.beforeCommit(()=>f.p('UPDATE users SET coin=coin-7 WHERE id=1').run());
 if(fault==='quantity')f.beforeCommit(()=>f.p("INSERT INTO user_cards VALUES(1,'S000',9,NULL)").run());
 if(fault==='settings')f.beforeCommit(()=>f.p("UPDATE app_meta SET value=? WHERE key='superstar_pack_settings_v1'",JSON.stringify({drawEnabled:false})).run());
 if(['card','log','receipt'].includes(fault)){const table={card:'user_cards',log:'draw_logs',receipt:'superstar_pack_receipts_v1'}[fault],operation=fault==='receipt'?'UPDATE':'INSERT';await f.pg.exec(`CREATE FUNCTION suppress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;CREATE TRIGGER suppress BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION suppress()`);}
 const r=await f.call(1000);assert.equal(r.status,409,JSON.stringify(r));
 assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),100000000000000-(fault==='coin'?7:0));
 assert.equal(Number((await f.p('SELECT COALESCE(SUM(quantity),0) n FROM user_cards').first()).n),fault==='quantity'?9:0);
 for(const table of ['coin_logs','shard_logs','draw_logs','superstar_pack_debits_v1'])assert.equal(Number((await f.p('SELECT COUNT(*) n FROM '+table).first()).n),0,table);
});
test('normal and bulk overlapping requests cannot both claim the account; repeated bulk settles once',async t=>{
 const f=await superstarFixture(t,{successRate:100}),id=superstarBulkRequestId();
 const first=await Promise.all([f.call(1000,id),f.call(1000,id)]);assert(first.some(r=>r.status===200));assert(first.every(r=>[200,409].includes(r.status)));
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
 await f.p("INSERT INTO superstar_pack_receipts_v1(request_id,user_id,status,updated_at) VALUES('normal-open-pending',1,'PENDING',?)",new Date().toISOString().replace('T',' ').slice(0,19)).run();
 assert.equal((await f.call()).body.code,'SUPERSTAR_DRAW_PENDING');assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});
test('bulk validates receipt sums and blocks unauthenticated/cross-origin requests',async t=>{
 const f=await superstarFixture(t,{successRate:100,types:1}),r=await f.call(1000);for(const change of [x=>x.hitCount++,x=>x.missCount++,x=>x.results[0].count++,x=>x.results[0].shardGained++,x=>x.coinAfter++,x=>x.currentQuantities={}]){const copy=structuredClone(r.body);change(copy);assert.throws(()=>validateSuperstarBulkReceipt(copy));}
 for(const [origin,auth,status]of [['https://game.test',null,401],['https://bad.test',{id:1},403]]){const result=await handleSuperstarPackDraw({env:{},deps:{...f.deps,authenticate:async()=>auth},request:new Request('https://game.test/api/superstar-pack/draw',{method:'POST',headers:{origin},body:'{}'})});assert.equal(result.status,status);}
});
