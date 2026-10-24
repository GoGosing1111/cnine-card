import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ultimateFixture,body} from './helpers/ultimate-pack-bulk-fixture.mjs';
import {ULTIMATE_BULK,ultimateBulkCount,ultimateBulkCost,validateUltimateBulkReceipt} from '../shared/ultimate-pack-bulk-v1.mjs';
import {sampleUltimateBulk,handleUltimateBulk} from '../functions/_ultimate_pack_bulk.js';
import {ultimateBulkDependencies} from '../functions/api/[[path]].js';

test('count and cost reject fractional, oversized, unsafe and other intervals',()=>{
 for(const n of [0,100,999,1001,100000.1,100100,'100000',Infinity])assert.throws(()=>ultimateBulkCount(n));
 assert.equal(ultimateBulkCount(100000),100000);assert.equal(ultimateBulkCost(10000000,100000),1000000000000);
 for(const p of [0,-1,1.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>ultimateBulkCost(p,100000));
});
test('100,000 grants exactly once with compact results, duplicate rewards, limited stock and recoverable receipt',async t=>{
 const f=await ultimateFixture(t),b=body(),started=performance.now();f.stats.wire=0;f.stats.statements=0;
 const r=await f.service.open(f.env,f.user,b);validateUltimateBulkReceipt(r,b);
 assert.equal(r.results.reduce((n,r)=>n+r.count,0),100000);assert(r.results.length<=301);assert(JSON.stringify(r).length<250000);
 assert.equal(Number((await f.p('SELECT SUM(quantity) n FROM user_cards WHERE user_id=1').first()).n),100000);
 assert.equal(Number((await f.p('SELECT issued_count FROM cards WHERE id=?','limited-a').first()).issued_count),10);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM limited_acquisition_audit').first()).n),10);
 const account=await f.p('SELECT * FROM users WHERE id=1').first();assert.equal(Number(account.coin),100000000000000-b.expectedCost);assert.equal(Number(account.card_shards),r.shardTotal);
 assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'").first()).quantity),r.masterStarTotal);
 const replay=await f.service.open(f.env,f.user,b);assert.equal(replay.replayed,true);assert.deepEqual(replay.results,r.results);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
 await assert.rejects(()=>f.service.open(f.env,f.user,{...b,count:1000,expectedCost:10000000000}),/다른 구매/);
 await assert.rejects(()=>f.service.receipt(f.env,{id:2},b.requestId),/다른 구매/);
 t.diagnostic(JSON.stringify({count:100000,ms:Math.round(performance.now()-started),types:r.results.length,bytes:JSON.stringify(r).length,wire:f.stats.wire,sql:f.stats.statements}));
});
test('receipt replay uses current balances and ownership, never historical totals',async t=>{
 const f=await ultimateFixture(t),b=body(1000),r=await f.service.open(f.env,f.user,b);
 await f.p('UPDATE users SET coin=123,card_shards=45 WHERE id=1').run();await f.p('UPDATE user_cards SET quantity=0 WHERE user_id=1').run();
 const replay=await f.service.receipt(f.env,f.user,b.requestId);assert.equal(replay.current.coin,123);assert.equal(replay.current.cardShards,45);assert(replay.current.cards.every(c=>Number(c.quantity)===0));assert.equal(replay.coinAfter,r.coinAfter);
});
test('insufficient coins, changed price, inactive pack and normal draw lock never charge',async t=>{
 const f=await ultimateFixture(t),b=body(1000);await assert.rejects(()=>f.service.open(f.env,f.user,{...b,expectedCost:1}),/가격/);
 await f.p("UPDATE card_packs SET is_active=0 WHERE id='ultimate'").run();await assert.rejects(()=>f.service.open(f.env,f.user,b),/판매/);
 await f.p("UPDATE card_packs SET is_active=1 WHERE id='ultimate'").run();await f.p('INSERT INTO draw_active_lock_v1480 VALUES(1,?,?)','other',Date.now()+10000).run();await assert.rejects(()=>f.service.open(f.env,f.user,b),/진행 중/);
 await f.p('DELETE FROM draw_active_lock_v1480').run();await f.p('UPDATE users SET coin=0 WHERE id=1').run();await assert.rejects(()=>f.service.open(f.env,f.user,b),/부족/);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),0);
});
test('failure rolls back every debit, reward, stock, receipt and audit; lost commit ack replays once',async t=>{
 const f=await ultimateFixture(t,{limitedRate:100}),b=body(1000);f.fail('INSERT INTO coin_logs');await assert.rejects(()=>f.service.open(f.env,f.user,b),/INJECTED/);
 assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),100000000000000);assert.equal(Number((await f.p('SELECT issued_count FROM cards WHERE id=?','limited-a').first()).issued_count),0);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM draw_request_receipts_v2').first()).n),0);
 f.loseAck();const r=await f.service.open(f.env,f.user,b);assert.equal(r.replayed,true);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});
test('last-stock race and concurrent coin/ownership changes retry atomically without overissue',async t=>{
 const f=await ultimateFixture(t,{limitedRate:100,stock:1}),b=body(1000);
 f.beforeCommit(async()=>{await f.pg.exec("UPDATE cards SET issued_count=1 WHERE id='limited-a'; UPDATE users SET coin=coin-1 WHERE id=1; INSERT INTO user_cards(user_id,card_id,quantity) VALUES(1,'0',5)");});
 const r=await f.service.open(f.env,f.user,b);assert(!r.results.some(r=>r.card.id==='limited-a'));assert.equal(Number((await f.p('SELECT issued_count FROM cards WHERE id=?','limited-a').first()).issued_count),1);assert.equal(r.coinBefore,99999999999999);
 assert.equal(Number((await f.p('SELECT SUM(quantity) n FROM user_cards WHERE user_id=1').first()).n),1005);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});
test('a last-stock-only race cannot mistake another purchase for its own reservation',async t=>{
 const f=await ultimateFixture(t,{limitedRate:100,stock:1}),b=body(1000);
 f.beforeCommit(()=>f.pg.exec("UPDATE cards SET issued_count=1 WHERE id='limited-a'"));
 const r=await f.service.open(f.env,f.user,b);assert(!r.results.some(r=>r.card.id==='limited-a'));assert.equal(Number((await f.p('SELECT COUNT(*) n FROM limited_acquisition_audit').first()).n),0);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});
test('unbounded LIMITED cards retain individual acquisition logs and per-100 selection limit',async t=>{
 const f=await ultimateFixture(t,{limitedRate:100});await f.p("UPDATE cards SET limited_total=NULL WHERE id='limited-a'").run();
 const r=await f.service.open(f.env,f.user,body(1000));assert.equal(r.results.find(r=>r.card.id==='limited-a').count,10);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM draw_logs').first()).n),10);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM limited_acquisition_audit').first()).n),0);
});
test('suppressed card grant cannot produce a paid success receipt',async t=>{
 const f=await ultimateFixture(t,{normalTypes:9,limitedRate:0});await f.pg.exec("CREATE FUNCTION suppress_cards() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER suppress_cards BEFORE INSERT OR UPDATE ON user_cards FOR EACH ROW EXECUTE FUNCTION suppress_cards()");
 await assert.rejects(()=>f.service.open(f.env,f.user,body(1000)),/joint_atomic_guards/);assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),100000000000000);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),0);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM draw_request_receipts_v2').first()).n),0);
});
test('mid-transaction SQL failure rolls back already-executed stock, cards and currency statements',async t=>{
 const f=await ultimateFixture(t,{limitedRate:100,stock:10}),b=body(1000);
 await f.pg.exec('ALTER TABLE coin_logs ADD CONSTRAINT injected_failure CHECK(change_amount>0)');
 await assert.rejects(()=>f.service.open(f.env,f.user,b),/injected_failure/);
 for(const table of ['user_cards','coin_logs','shard_logs','inventory_logs','cnine_user_inventory','draw_request_receipts_v2','limited_acquisition_audit','joint_atomic_guards_v1'])assert.equal(Number((await f.p('SELECT COUNT(*) n FROM '+table).first()).n),0,table);
 assert.equal(Number((await f.p('SELECT issued_count FROM cards WHERE id=?','limited-a').first()).issued_count),0);assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),100000000000000);
});
test('simultaneous same-ID calls charge once; two users competing for the last limited card never overissue',async t=>{
 const f=await ultimateFixture(t,{limitedRate:100,stock:1}),b=body(1000);
 const [a,replay]=await Promise.all([f.service.open(f.env,f.user,b),f.service.open(f.env,f.user,b)]);assert.deepEqual(a.results,replay.results);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
 await f.p("UPDATE cards SET issued_count=0 WHERE id='limited-a'").run();await f.p('DELETE FROM limited_acquisition_audit').run();
 const results=await Promise.all([f.service.open(f.env,f.user,body(1000)),f.service.open(f.env,{id:2,nickname:'검수 2'},body(1000))]);
 assert.equal(results.flatMap(r=>r.results).filter(r=>r.card.id==='limited-a').reduce((n,r)=>n+r.count,0),1);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM limited_acquisition_audit').first()).n),1);
});
test('expired unknown request and corrupted receipt cannot trigger another purchase',async t=>{
 const f=await ultimateFixture(t),b=body(1000),old={...b,requestId:b.requestId.replace(/\d{13}/,String(Date.now()-2*86400000))};await assert.rejects(()=>f.service.open(f.env,f.user,old),/오래된/);
 const r=await f.service.open(f.env,f.user,b);assert.throws(()=>validateUltimateBulkReceipt({...r,count:100000}),/합계/);assert.throws(()=>validateUltimateBulkReceipt({...r,results:[...r.results,r.results[0]]}),/수량/);
 await f.p("UPDATE draw_request_receipts_v2 SET status='ARCHIVED',response_json=NULL WHERE request_id=?",b.requestId).run();await assert.rejects(()=>f.service.open(f.env,f.user,b),/이전 지급/);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
});
test('every 10-card guarantee and one LIMITED roll success per 100 remain intact',()=>{
 const deps=ultimateBulkDependencies(),calls=[];let slot=0;const low={id:'low',grade:'C',limited_total:null},guarantee={id:'g',grade:'UR',limited_total:null},limited={id:'l',grade:'LIMITED',limited_total:1000};
 const plan=sampleUltimateBulk({context:{},pack:{guarantee_10:'UR'},count:100000,critical:{enabled:true,chance:100,bonus:30},stock:[{id:'l',issued_count:0,limited_total:1000}],order:deps.order,draw:(_c,_p,min,allow,bonus)=>{calls.push({min,allow,bonus});return allow?limited:min?guarantee:low;}});
 assert.equal(plan.limited.length,1000);assert.equal(plan.criticalBlocks,1000);assert.equal(calls.length,100000);assert(calls.every(c=>c.bonus===30));
 for(let i=0;i<100000;i+=100){assert.equal(calls.slice(i,i+100).filter(c=>c.allow).length,1);assert.equal(calls.slice(i,i+100).filter(c=>c.min==='UR').length,9);}
});
test('sampler gives exact legacy 100-card distribution with the production draw helper',async t=>{
 const f=await ultimateFixture(t,{stock:10000}),deps=ultimateBulkDependencies(),pack=await f.p("SELECT * FROM card_packs WHERE id='ultimate'").first(),context=await deps.queryContext(f.env,pack);
 const original=Math.random;let seed=12;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 try{Math.random=rng;const a=sampleUltimateBulk({context,pack,count:1000,critical:{enabled:true,chance:20,bonus:30},stock:[{id:'limited-a',issued_count:0,limited_total:10000}],draw:deps.draw,order:deps.order,random:rng});seed=12;const expected=new Map();
  for(let block=0;block<10;block++){const bonus=rng()*100<20?30:0,cards=[];let limited=false;for(let index=0;index<100;index++){const min=index%10===9&&!cards.slice(Math.floor(index/10)*10).some(c=>deps.order[c.grade]>=deps.order[pack.guarantee_10])?pack.guarantee_10:null;const c=deps.draw(context,pack,min,!limited,bonus);cards.push(c);if(c.grade==='LIMITED')limited=true;}for(const c of cards)expected.set(c.id,(expected.get(c.id)||0)+1);}
  assert.deepEqual(Object.fromEntries(a.rows.map(r=>[r.card.id,r.count])),Object.fromEntries(expected));
 }finally{Math.random=original;}
});
test('authenticated route blocks cross-origin, wrong browser and other paths before purchase',async()=>{
 let purchases=0;const deps={authenticate:async()=>({id:1}),json:(v,status=200)=>Response.json(v,{status}),withUserMutationLock:async()=>{purchases++;},claimBrowser:async()=>({allowed:true})};
 const request=new Request('https://game.test/api/draw/ultimate-bulk',{method:'POST',headers:{origin:'https://bad.test','content-type':'application/json'},body:JSON.stringify(body())});
 const r=await handleUltimateBulk({path:'draw/ultimate-bulk',request,env:{},deps});assert.equal(r.status,403);assert.equal(purchases,0);
 assert.equal(await handleUltimateBulk({path:'draw',request,env:{},deps}),null);
 const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');assert.match(source,/startsWith\('ult-'\).*ULTIMATE_BULK_ROUTE_REQUIRED/);
});
