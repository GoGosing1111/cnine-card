import test from 'node:test';import assert from 'node:assert/strict';
import {bluegearBulkFixture,bluegearBulkDocument as doc} from './helpers/bluegear-large-bulk-fixture.mjs';
import {BLUE_GEAR_PACK,BLUE_GEAR_DRAW_POLICY as policy} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {blackcrownBulkQuote} from '../shared/mercenary-blackcrown-bulk-v1.mjs';
import {bloodmoonBulkQuote} from '../shared/mercenary-bloodmoon-bulk-v1.mjs';
import {validateBlackcrownOpeningBody,blackcrownReceiptResults} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {BlackcrownOpeningSession} from '../shared/mercenary-blackcrown-session-v2.mjs';
import {bloodmoonResultsMarkup} from '../js/mercenary-bloodmoon-presentation-v2.mjs';
const quote=budget=>blackcrownBulkQuote(doc.settings.prices,budget,policy.bulkLimits);
const body=budget=>({requestId:crypto.randomUUID(),expectedRevision:4,count:quote(budget).count,budget});
const total=r=>r.missCount+r.draws.length+r.normalDraws.reduce((n,x)=>n+x.quantity,0);
const ssRandom=()=>{let samples=0;const random=max=>{samples++;return max===1e10?(samplesForGate++%2===0?1992000000:0):0;};let samplesForGate=0;return {random,calls:()=>samples};};
test('Blue Gear accepts 300/500/1000 trillion with exact existing prices; other packs retain 100 trillion',()=>{
 for(const [budget,count,unused]of [['100000000000000',44444,'1000000000'],['300000000000000',133333,'750000000'],['500000000000000',222222,'500000000'],['1000000000000000',444444,'1000000000']]){
  const q=quote(budget);assert.equal(q.count,count);assert.equal(q.unused,unused);assert.equal(BigInt(q.coinCost)+BigInt(q.unused),BigInt(budget));assert.doesNotThrow(()=>validateBlackcrownOpeningBody(body(budget),policy));
 }
 for(const value of ['1000000000000001','0','-1','1e15','1.5','9007199254740993'])assert.throws(()=>quote(value));
 assert.throws(()=>validateBlackcrownOpeningBody({...body('500000000000000'),bulkLimits:policy.bulkLimits},policy));
 assert.throws(()=>validateBlackcrownOpeningBody({...body('500000000000000'),count:1000001},policy));
 assert.throws(()=>validateBlackcrownOpeningBody(body('500000000000000')));
 assert.throws(()=>blackcrownBulkQuote(doc.settings.prices,'500000000000000'));
 assert.throws(()=>bloodmoonBulkQuote(doc.settings.prices,'500000000000000'));
});
test('500 and 1000 trillion settle in compact single transactions and replay without another debit or serial',async t=>{
 const rng=ssRandom(),f=await bluegearBulkFixture(t,{randomInt:rng.random});let balance=await f.coin();
 for(const budget of ['500000000000000','1000000000000000']){
  const request=body(budget),prior={...f.stats},r=await f.service.open(f.env,f.user,request);assert.equal(total(r),request.count);assert.equal(r.coinCost,quote(budget).coinCost);balance-=r.coinCost;assert.equal(await f.coin(),balance);
  assert.equal(f.stats.batches-prior.batches,1);assert(f.stats.statements-prior.statements<100);assert(Buffer.byteLength(JSON.stringify(r))<20000);
  assert.equal(blackcrownReceiptResults(r,BLUE_GEAR_PACK,policy).reduce((n,x)=>n+x.quantity,0),request.count);
  const replay=await f.service.open(f.env,f.user,request);assert.equal(replay.replayed,true);assert.deepEqual(replay.draws,r.draws);assert.deepEqual(replay.normalDraws,r.normalDraws);assert.equal(await f.coin(),balance);
  await assert.rejects(f.service.receipt(f.env,{id:2},request.requestId));
 }
 assert.equal((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='BLUE_GEAR:V-701'").first()).issued,1);
 assert.equal((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n,2);
});
test('large grant failure rolls back payment/stock/ownership; retry keeps the original lottery through lost commit acknowledgement',async t=>{
 const rng=ssRandom(),f=await bluegearBulkFixture(t,{randomInt:rng.random}),request=body('500000000000000'),initial=await f.coin();
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,f.user,request),/INJECTED/);
 assert.equal(await f.coin(),initial);assert.equal((await f.p('SELECT COUNT(*) AS n FROM user_mercenary_cards_v1').first()).n,0);assert.equal((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='BLUE_GEAR:V-701'").first()).issued,0);
 const sampled=rng.calls();f.fail('');f.loseAck();const r=await f.service.open(f.env,f.user,request);assert.equal(rng.calls(),sampled);assert.equal(total(r),request.count);assert.equal(await f.coin(),initial-r.coinCost);assert.equal((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n,1);
});
test('forged count, excessive budget and insufficient funds cannot debit',async t=>{
 const f=await bluegearBulkFixture(t),request=body('500000000000000'),initial=await f.coin();
 await assert.rejects(f.service.open(f.env,f.user,{...request,count:request.count+1}),e=>e.code==='MERCENARY_BLACKCROWN_INPUT');
 await assert.rejects(f.service.open(f.env,f.user,{...request,requestId:crypto.randomUUID(),budget:'1000000000000001'}),e=>e.code==='MERCENARY_BLACKCROWN_INPUT');assert.equal(await f.coin(),initial);
 await f.pg.exec('UPDATE users SET coin=1 WHERE id=1');await assert.rejects(f.service.open(f.env,f.user,{...request,requestId:crypto.randomUUID()}),e=>e.code==='MERCENARY_BLACKCROWN_FUNDS');assert.equal(await f.coin(),1);
});
test('browser session recovers a large receipt after lost POST response and keeps Bloodmoon count/image presentation',async t=>{
 const rng=ssRandom(),f=await bluegearBulkFixture(t,{randomInt:rng.random}),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let posts=0,presented;
 const session=new BlackcrownOpeningSession({pack:BLUE_GEAR_PACK,drawPolicy:policy,accountId:1,getAccountId:()=>1,storage,present:async r=>presented=r,api:async(p,o)=>{
  if(o?.method==='POST'){posts++;await f.service.open(f.env,f.user,o.body);throw Error('LOST_RESPONSE');}
  return f.service.receipt(f.env,f.user,new URL(p,'https://test/').searchParams.get('requestId'));
 }});
 const r=await session.startBulk(await f.state(),quote('500000000000000'));assert.equal(posts,1);assert.equal(total(r),222222);assert.equal(presented.requestId,r.requestId);assert.equal(storage.getItem(session.pendingKey),null);
 const markup=bloodmoonResultsMarkup(blackcrownReceiptResults(r,BLUE_GEAR_PACK,policy),BLUE_GEAR_PACK.image);assert.match(markup,/bwp-count-summary/);assert.match(markup,/bwp-featured-results/);assert(markup.length<20000);assert.match(markup,/222,221/);
});
