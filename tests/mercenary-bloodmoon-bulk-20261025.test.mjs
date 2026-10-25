import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {BLOODMOON_PACK,BLOODMOON_PACK_RELEASE_ENABLED,bloodmoonReceiptResults,pickBloodmoonBatch,validateBloodmoonOpeningBody} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {BLOODMOON_BULK_FORMAT,BLOODMOON_BULK_REFERENCE_PRICES,bloodmoonBulkQuote,bloodmoonBulkPriceSource,pickBloodmoonBulk} from '../shared/mercenary-bloodmoon-bulk-v1.mjs';
import {bloodmoonResultsMarkup} from '../js/mercenary-bloodmoon-presentation-v2.mjs';
import {bloodmoonBatchCinematics} from '../js/mercenary-bloodmoon-pack-live.mjs';
import {createBloodmoonBulkRandom} from '../functions/_mercenary_bloodmoon_bulk.js';
import {createBloodmoonPackService} from '../functions/_mercenary_bloodmoon_opening.js';
import {handleBloodmoonPack} from '../functions/_mercenary_bloodmoon_pack.js';
import {BloodmoonOpeningSession} from '../shared/mercenary-bloodmoon-session-v2.mjs';
import {bloodmoonSsOnceKey} from '../functions/_mercenary_bloodmoon_once.js';

const body=(f,budget)=>({...f.body(),...((q)=>({count:q.count,budget:q.budget}))(bloodmoonBulkQuote(f.settings.prices,budget))});
const sum=receipt=>receipt.missCount+receipt.draws.length+receipt.normalDraws.reduce((s,r)=>s+r.quantity,0);
test('100 trillion reference is exactly 100,000 draws with integer accounting and bounded input',()=>{
 const q=bloodmoonBulkQuote(BLOODMOON_BULK_REFERENCE_PRICES,'100000000000000');assert.equal(q.count,100000);assert.equal(q.coinCost,1e14);assert.equal(q.unused,'0');
 assert.deepEqual(bloodmoonBulkQuote({single:100,ten:900},'1001'),{budget:'1001',count:11,coinCost:1000,unused:'1'});
 assert.equal(bloodmoonBulkQuote({single:100,ten:2000},'1000').count,10);
 for(const value of ['100000000000001','0','-1','1e14','1.5','Infinity','',1e14])assert.throws(()=>bloodmoonBulkQuote(BLOODMOON_BULK_REFERENCE_PRICES,value));
 assert.throws(()=>bloodmoonBulkQuote({single:1,ten:10},'100001'));
 assert.equal(bloodmoonBulkPriceSource({settings:{prices:{single:null,ten:null}}}).reference,true);
 assert.equal(bloodmoonBulkPriceSource({settings:{prices:{single:100,ten:900}}}).reference,false);
 const request={requestId:crypto.randomUUID(),count:100000,expectedRevision:1,budget:q.budget};assert.doesNotThrow(()=>validateBloodmoonOpeningBody(request));
 assert.throws(()=>validateBloodmoonOpeningBody({...request,count:100001}));assert.throws(()=>validateBloodmoonOpeningBody({...request,budget:'100000000000001'}));
});

test('buffered cryptographic sampler rejects out-of-range samples without modulo bias',()=>{
 let calls=0;const random=createBloodmoonBulkRandom(words=>{calls++;words.fill(0xffffffff);words[2]=0;words[3]=123;words[4]=99;});
 assert.equal(random(10000000000),123);assert.equal(random(100),99);assert.equal(calls,1);
 assert.throws(()=>random(10000000001));
});

test('bulk sampler preserves exact ordinary, conditional and sold-out results for the same random stream',async t=>{
 const f=await bloodmoonFixture(t);f.settings.normalRankRatesPpm={C:100000,B:100000,A:100000,S:100000,SS:200000,SSS:300000};f.settings.missRatePpm=100000;
 f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(c=>[c,c==='V-960'?500000:0]));f.settings.normalSssRatePpm=500000;await f.configure();
 const state=await f.state(),samples=[0,0,1000000000,0,2000000000,0,3000000000,0,4000000000,0,6000000000,0,6000000000,9999999999,0,9000000000,9000000000,9000000000];
 const rng=()=>{const values=[...samples];return max=>{const n=values.shift();assert(n<max);return n;};};
 for(const sold of [false,true]){if(sold){state.stock.find(s=>s.code==='V-960').remaining=0;state.stock.find(s=>s.code==='V-960').issued=state.stock.find(s=>s.code==='V-960').limit;}
  const input=sold?[...samples.slice(0,12),0,...samples.slice(12)]:samples;
  const random=()=>{const values=[...input];return max=>{const n=values.shift();assert(n<max);return n;};};
  const ordinary=pickBloodmoonBatch(state,10,random()),bulk=pickBloodmoonBulk(state,10,random());
  const counts=rows=>{const out={};for(const row of rows)out[row.mercenaryCode||'MISS']=(out[row.mercenaryCode||'MISS']||0)+(row.mercenaryCode?row.quantity:1);return out;};
  assert.deepEqual(counts(ordinary),counts([...bulk.draws,...bulk.normalDraws,...Array(bulk.missCount).fill({})]));
 }
});

test('100,000 draws use one compact transaction and recover the identical receipt without another charge',async t=>{
 const f=await bloodmoonFixture(t);f.settings.prices={...BLOODMOON_BULK_REFERENCE_PRICES};await f.configure();await f.pg.exec('UPDATE users SET coin=200000000000000 WHERE id=1');
 const request=body(f,'100000000000000'),before={...f.stats},started=performance.now(),r=await f.service.open(f.env,f.user,request),elapsedMs=performance.now()-started;
 assert.equal(r.count,100000);assert.equal(sum(r),100000);assert.equal(r.draws.length,f.settings.stockLimits['V-960']);assert.equal(r.normalDraws.reduce((n,r)=>n+r.quantity,0),100000-f.settings.stockLimits['V-960']);assert.equal(await f.coin(),1e14);
 assert.equal(f.stats.batches-before.batches,1);assert.ok(f.stats.statements-before.statements<50+f.settings.stockLimits['V-960']*6);assert.ok(JSON.stringify(r).length<20000);
 const snapshot=await f.pg.query('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=1 ORDER BY mercenary_code');
 const replay=await f.service.open(f.env,f.user,request);assert.deepEqual(replay.draws,r.draws);assert.deepEqual(replay.normalDraws,r.normalDraws);assert.equal(await f.coin(),1e14);assert.deepEqual((await f.pg.query('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=1 ORDER BY mercenary_code')).rows,snapshot.rows);
 assert.equal((await f.pg.query('SELECT COUNT(*) AS n FROM coin_logs')).rows[0].n,1);
 await assert.rejects(f.service.open(f.env,{id:2},request),e=>e.code==='JOINT_REQUEST_CONFLICT');
 const receiptRows=bloodmoonReceiptResults(r),markup=bloodmoonResultsMarkup(receiptRows,BLOODMOON_PACK.image);assert.equal((markup.match(/<img /g)||[]).length,2);
 if(process.env.BLOODMOON_BULK_QA_OUT){fs.mkdirSync(process.env.BLOODMOON_BULK_QA_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.BLOODMOON_BULK_QA_OUT,'performance.json'),JSON.stringify({fixture:'PGlite, one session; not a production load test',count:r.count,elapsedMs,statements:f.stats.statements-before.statements,receiptBytes:Buffer.byteLength(JSON.stringify(r)),limitedSerials:r.draws.length,ordinaryRows:r.normalDraws.length,productionTransactions:0},null,2));}
});

test('a failed bulk grant rolls back everything and retry never rerolls',async t=>{
 let calls=0;const f=await bloodmoonFixture(t,{randomInt:()=>{calls++;return 0;}}),request=body(f,'90000');f.fail('INSERT INTO mercenary_card_acquisitions_v1');
 await assert.rejects(f.service.open(f.env,f.user,request),/INJECTED/);assert.equal(await f.coin(),1000000);assert.equal((await f.pg.query('SELECT COUNT(*) AS n FROM user_mercenary_cards_v1')).rows[0].n,0);const sampled=calls;
 f.fail('');f.loseAck();const receipt=await f.service.open(f.env,f.user,request);assert.equal(calls,sampled);assert.equal(sum(receipt),1000);assert.equal(await f.coin(),910000);
 assert.deepEqual((await f.service.receipt(f.env,f.user,request.requestId)).normalDraws,receipt.normalDraws);
});

test('stock race replaces only unavailable serials, preserving normal quantities and total draws',async t=>{
 const f=await bloodmoonFixture(t),request=body(f,'90000');f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,f.user,request));f.fail('');
 await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit-1 WHERE code='V-960'");
 const receipt=await f.service.open(f.env,f.user,request);assert.equal(receipt.draws.length,1);assert.equal(receipt.draws[0].serial,f.settings.stockLimits['V-960']);assert.equal(sum(receipt),1000);assert.equal(receipt.normalDraws.reduce((n,r)=>n+r.quantity,0),999);
});

test('changed settings, insufficient funds and forged budget/count fail before payment',async t=>{
 const f=await bloodmoonFixture(t),request=body(f,'90000');await assert.rejects(f.service.open(f.env,f.user,{...request,count:999}),e=>e.code==='MERCENARY_BLOODMOON_INPUT');
 await f.pg.exec('UPDATE users SET coin=10 WHERE id=1');await assert.rejects(f.service.open(f.env,f.user,request),e=>e.code==='MERCENARY_BLOODMOON_FUNDS');assert.equal(await f.coin(),10);
 await f.pg.exec('UPDATE users SET coin=1000000 WHERE id=1');f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,f.user,request));f.fail('');await f.configure(2);
 await assert.rejects(f.service.open(f.env,f.user,request),e=>e.code==='MERCENARY_BLOODMOON_CHANGED');assert.equal(await f.coin(),1000000);
});

test('SS and below use counts without images, while limited SS and ordinary/limited SSS retain images',()=>{
 const rows=[{mercenaryCode:'V-001',rank:'C',name:'<script>',quantity:50000},{mercenaryCode:'V-039',rank:'SS',name:'SS',quantity:10000},{mercenaryCode:'V-021',rank:'SSS',name:'SSS',quantity:5},{mercenaryCode:'V-960',limited:true,rank:'SS',name:'한정',quantity:2,serial:1}];
 const markup=bloodmoonResultsMarkup(rows,BLOODMOON_PACK.image);assert.equal((markup.match(/<img /g)||[]).length,2);assert.ok(markup.includes('50,000'));assert.ok(markup.includes('상세보기'));assert.ok(markup.includes('&lt;script&gt;'));assert.ok(!markup.includes('<script>'));
 assert.deepEqual(bloodmoonBatchCinematics([{rank:'SS',granted:true,preview:false,mercenaryCode:'V-039',limited:false}]),[]);
});

test('compact receipts validate totals and client recovery uses the same durable bulk request',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let posts=0,offline=true,receipt;
 const config={revision:1,userOpeningEnabled:true},quote=bloodmoonBulkQuote(BLOODMOON_BULK_REFERENCE_PRICES,'100000000000000');
 const session=new BloodmoonOpeningSession({accountId:1,getAccountId:()=>1,storage,present:async()=>{},api:async(path,opt)=>{
  if(opt?.method==='POST'){posts++;assert.ok(storage.getItem(session.pendingKey));receipt={...opt.body,status:'COMPLETED',accountId:1,packId:BLOODMOON_PACK.id,coin:'0',coinCost:quote.coinCost,format:BLOODMOON_BULK_FORMAT,draws:[],normalDraws:[],missCount:100000};throw Error('lost response');}
  if(offline)throw Error('offline');return receipt;
 }});
 await assert.rejects(session.startBulk(config,quote),e=>e.code==='BLOODMOON_RECOVERY_REQUIRED');assert.equal(posts,1);
 assert.throws(()=>bloodmoonReceiptResults({...receipt,missCount:99999}));offline=false;await session.recover();assert.equal(posts,1);assert.equal(storage.getItem(session.pendingKey),null);
});

test('authorized production release still requires authentication; an explicit closed service never reads DB',async()=>{
 assert.equal(BLOODMOON_PACK_RELEASE_ENABLED,true);const env={DB:new Proxy({}, {get(){throw Error('no database access');}})},deps={json:(data,status)=>({data,status}),authenticate:async()=>null};
 const response=await handleBloodmoonPack({path:BLOODMOON_PACK.openPath,request:{method:'POST'},env,deps});assert.equal(response.status,401);
 const service=createBloodmoonPackService({releaseEnabled:false,readState:()=>{throw Error('no state access');}});await assert.rejects(service.open(env,{id:1},{budget:'100000000000000'}),e=>e.code==='MERCENARY_BLOODMOON_CLOSED');
});

test('two accounts racing for the final limited copy receive at most one serial and exact totals',async t=>{
 const f=await bloodmoonFixture(t);await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit-1 WHERE code='V-960'");
 const a=body(f,'90000'),b=body(f,'90000'),receipts=await Promise.all([f.service.open(f.env,f.user,a),f.service.open(f.env,{id:2},b)]);
 assert.equal(receipts.reduce((n,r)=>n+r.draws.length,0),1);for(const r of receipts)assert.equal(sum(r),1000);
 assert.equal(await f.coin(1),910000);assert.equal(await f.coin(2),910000);assert.equal((await f.pg.query('SELECT COUNT(*) AS n FROM mercenary_limited_issues_v1')).rows[0].n,1);
});

test('simultaneous retries of the same bulk ID debit and grant only once',async t=>{
 const f=await bloodmoonFixture(t),request=body(f,'90000');const [a,b]=await Promise.all([f.service.open(f.env,f.user,request),f.service.open(f.env,f.user,request)]);
 assert.deepEqual(a.draws,b.draws);assert.deepEqual(a.normalDraws,b.normalDraws);assert.equal(await f.coin(),910000);assert.equal((await f.pg.query('SELECT COUNT(*) AS n FROM coin_logs')).rows[0].n,1);
});

test('an already armed indexed guarantee keeps its original slot and is consumed atomically',async t=>{
 const f=await bloodmoonFixture(t);await f.pg.exec('ALTER TABLE app_meta ADD COLUMN updated_at TEXT');
 f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(c=>[c,c==='V-974'?1000000:0]));await f.configure();
 const armed={version:3,status:'ARMED',remaining:1,userId:1,packId:BLOODMOON_PACK.id,operationId:'fixture-only-guarantee',actorId:1,rank:'SSS',edition:'SSS_LIMITED',mercenaryCode:'V-974',slotIndex:5};
 await f.setting(bloodmoonSsOnceKey(1),armed);const request=body(f,'90000'),receipt=await f.service.open(f.env,f.user,request);
 const guaranteed=receipt.draws.find(r=>r.drawIndex===5);assert.equal(guaranteed.mercenaryCode,'V-974');assert.equal(sum(receipt),1000);
 const saved=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',bloodmoonSsOnceKey(1)).first()).value);assert.equal(saved.status,'CONSUMED');assert.equal(saved.acquisitionId,request.requestId+':5');
 assert.equal((await f.p('SELECT code FROM mercenary_limited_issues_v1 WHERE acquisition_id=?',saved.acquisitionId).first()).code,'V-974');
});
