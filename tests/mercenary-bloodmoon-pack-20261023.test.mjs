import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BLOODMOON_PACK,BLOODMOON_PACK_KEY,BLOODMOON_NORMAL_RANKS,bloodmoonPackDraft,legacyBloodmoonPackDraft,validateBloodmoonPack,readBloodmoonPackSettings,bloodmoonPackState,bloodmoonEffectivePercent,pickBloodmoonBatch,bloodmoonPackCatalogRow,bloodmoonReceiptResults} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {handleBloodmoonPack,readBloodmoonPackState,bloodmoonPackShopRow,saveBloodmoonPack} from '../functions/_mercenary_bloodmoon_pack.js';
import {createBloodmoonPackService} from '../functions/_mercenary_bloodmoon_opening.js';
import {BloodmoonOpeningSession} from '../shared/mercenary-bloodmoon-session-v2.mjs';
import {bloodmoonBatchCinematic} from '../js/mercenary-bloodmoon-pack-live.mjs';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
const stock=d=>Object.keys(d.stockLimits).map(code=>({code,stock_limit:d.stockLimits[code]??7,issued:0}));
const normals=BLOODMOON_NORMAL_RANKS.map((rank,i)=>({code:'V-00'+i,name:rank+' 일반',rank,weight:1,sourceArt:'fixture.png'}));
function plan(){const s=bloodmoonPackDraft();s.prices={single:100,ten:900};s.normalRankRatesPpm={C:100000,B:100000,A:100000,S:100000,SS:200000,SSS:300000};s.missRatePpm=100000;s.cardRatesPpm=Object.fromEntries(Object.keys(s.cardRatesPpm).map(code=>[code,code==='V-960'?200000:0]));s.normalSssRatePpm=800000;return bloodmoonPackState(s,stock(s),normals);}
const rng=(values)=>max=>{assert.ok(values.length,'Unexpected extra lottery');const n=values.shift();assert.ok(n<max);return n;};

test('two independent rate totals, exact effective odds, null drafts and old absolute rates are not reinterpreted',()=>{
 const draft=bloodmoonPackDraft();assert.equal(draft.mode,'OFF');assert.ok(Object.values(draft.normalRankRatesPpm).every(n=>n===null));assert.equal(draft.normalSssRatePpm,null);
 assert.equal(bloodmoonEffectivePercent(300000,200000),'6');assert.equal(bloodmoonEffectivePercent(0.0001,0.0001),'0.000000000000000001');assert.equal(bloodmoonEffectivePercent(null,0),null);
 const s=plan().settings;assert.doesNotThrow(()=>validateBloodmoonPack(s));const over=structuredClone(s);over.normalSssRatePpm=800000.0001;assert.throws(()=>validateBloodmoonPack(over),/합계/);
 const old=legacyBloodmoonPackDraft();old.cardRatesPpm['V-960']=200;old.prices.single=123;
 const read=readBloodmoonPackSettings(old);assert.equal(read.cardRatesPpm['V-960'],null);assert.equal(read.prices.single,123);assert.equal(old.cardRatesPpm['V-960'],200);
 const row=bloodmoonPackCatalogRow();assert.equal(row.drawEnabled,false);assert.equal(row.ownerDrawEnabled,false);assert.equal(row.price,null);assert.ok(fs.existsSync(row.imageUrl));
});

test('only the SSS interval enters the second lottery; SS remains ordinary and misses stay misses',()=>{
 const state=plan();assert.equal(state.readiness.ready,true);
 const ss=pickBloodmoonBatch(state,1,rng([4000000000,0]))[0];assert.equal(ss.rank,'SS');assert.equal(ss.edition,'STANDARD');
 const limited=pickBloodmoonBatch(state,1,rng([6000000000,1999999999]))[0];assert.equal(limited.mercenaryCode,'V-960');assert.equal(limited.rank,'SS');assert.equal(limited.gateRank,'SSS');
 const fallback=pickBloodmoonBatch(state,1,rng([8999999999,2000000000,0]))[0];assert.equal(fallback.rank,'SSS');assert.equal(fallback.edition,'STANDARD');
 assert.deepEqual(pickBloodmoonBatch(state,1,rng([9000000000])),[{outcomeId:'NONE',quantity:0}]);
 const sold=plan();sold.stock[0].issued=sold.stock[0].limit;sold.stock[0].remaining=0;assert.equal(pickBloodmoonBatch(sold,1,rng([6000000000,0,0]))[0].outcomeId,'CARD_SSS');
});

test('unauthenticated opening performs no database query; OFF and incomplete ON never charge',async t=>{
 const f=await bloodmoonFixture(t);f.settings.mode='OFF';await f.configure();
 const queries=f.stats.queries,response=await handleBloodmoonPack({path:BLOODMOON_PACK.openPath,request:new Request('https://qa.test/api/'+BLOODMOON_PACK.openPath,{method:'POST'}),env:f.env,deps:{authenticate:async()=>null,json:(body,status)=>({body,status})}});
 assert.equal(response.status,423);assert.equal(f.stats.queries,queries);assert.equal((await bloodmoonPackShopRow(f.env)).drawEnabled,false);
 const s=bloodmoonPackDraft();s.mode='ON';await assert.rejects(saveBloodmoonPack(f.env,{id:1},{expectedRevision:1,requestId:crypto.randomUUID(),reason:'검수 ON 차단',settings:s}),e=>e.code==='MERCENARY_BLOODMOON_CONFIG');
 const closed=createBloodmoonPackService({readState:readBloodmoonPackState});await assert.rejects(closed.open(f.env,f.user,f.body()),e=>e.code==='MERCENARY_BLOODMOON_CLOSED');assert.equal(await f.coin(),1000000);
});

test('one prepared ten-draw transaction grants both ordinary and limited cards once and survives a lost response',async t=>{
 const samples=[];for(let i=0;i<10;i++)samples.push(6000000000,i<2?0:9000000000,...(i<2?[]:[0]));
 const f=await bloodmoonFixture(t,{randomInt:rng(samples)});Object.assign(f.settings,plan().settings,{mode:'ON'});await f.configure();
 const b=f.body(10),first=await f.service.open(f.env,f.user,b);assert.equal(first.draws.length,10);assert.equal(first.draws.filter(r=>r.edition==='BLOODMOON_LIMITED').length,2);assert.equal(await f.coin(),999100);
 const again=await f.service.open(f.env,f.user,b);assert.equal(again.replayed,true);assert.equal(await f.coin(),999100);assert.equal(samples.length,0);
 assert.equal((await f.pg.query('SELECT * FROM mercenary_card_acquisitions_v1')).rows.length,10);
 assert.deepEqual(first.draws.filter(r=>r.serial).map(r=>r.serial),[1,2]);
 assert.equal(bloodmoonReceiptResults(first).length,10);assert.equal(bloodmoonBatchCinematic(bloodmoonReceiptResults(first)).rank,'SSS');
 const read=await f.service.receipt(f.env,f.user,b.requestId);assert.deepEqual(read.draws,first.draws);await assert.rejects(f.service.receipt(f.env,{id:2},b.requestId));
});

test('failure after stock reservation rolls back stock, coins and cards; retry uses the original fixed draw',async t=>{
 let randomCalls=0;const f=await bloodmoonFixture(t,{randomInt:()=>{randomCalls++;return 0;}}),b=f.body();
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,f.user,b),/INJECTED/);f.fail('');
 assert.equal(await f.coin(),1000000);assert.equal((await f.pg.query("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-960'")).rows[0].issued,0);assert.equal((await f.pg.query('SELECT * FROM user_mercenary_cards_v1')).rows.length,0);
 const calls=randomCalls;const r=await f.service.open(f.env,f.user,b);assert.equal(r.draws[0].serial,1);assert.equal(randomCalls,calls);assert.equal(await f.coin(),999900);
});

test('last remaining card is granted once and the other nine slots award ordinary SSS',async t=>{
 const f=await bloodmoonFixture(t);await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit-1 WHERE code='V-960'");
 const body=f.body(10),result=await f.service.open(f.env,f.user,body);assert.equal(result.draws.filter(r=>r.mercenaryCode==='V-960').length,1);assert.equal(result.draws.filter(r=>r.outcomeId==='CARD_SSS').length,9);
 assert.deepEqual((await f.service.open(f.env,f.user,body)).draws,result.draws);
 assert.equal(Number((await f.pg.query("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-960'")).rows[0].issued),f.settings.stockLimits['V-960']);
 assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1')).rows.length,1);assert.equal(await f.coin(),999100);
});

test('prepared request cancels on settings change without charging or resampling',async t=>{
 let calls=0;const f=await bloodmoonFixture(t,{randomInt:()=>{calls++;return 0;}}),b=f.body();f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,f.user,b));f.fail('');const before=calls;
 f.settings.prices.single=200;await f.configure(2);await assert.rejects(f.service.open(f.env,f.user,b),e=>e.code==='MERCENARY_BLOODMOON_CHANGED');assert.equal(calls,before);assert.equal(await f.coin(),1000000);
});

test('SS videos use the awarded rank, never the SSS entry gate or fake preview results',()=>{
 const receipt={status:'COMPLETED',packId:BLOODMOON_PACK.id,count:1,requestId:'qa-bloodmoon-video',draws:[{outcomeId:'BLOODMOON_SS',mercenaryCode:'V-960',rank:'SS',gateRank:'SSS'}]};
 assert.equal(bloodmoonBatchCinematic(bloodmoonReceiptResults(receipt)).rank,'SS');assert.equal(bloodmoonBatchCinematic(bloodmoonReceiptResults(receipt).map(r=>({...r,preview:true}))),null);
});

test('client persists one request before POST, recovers without a new lottery, and isolates accounts',async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};let account=1,posts=0,offline=true,receipt;
 const session=new BloodmoonOpeningSession({accountId:1,getAccountId:()=>account,storage,present:async()=>{},api:async(path,options)=>{
  if(path===BLOODMOON_PACK.openPath){posts++;assert.ok(session.read(session.pendingKey));receipt={requestId:options.body.requestId,packId:BLOODMOON_PACK.id,status:'COMPLETED',accountId:1,count:1,draws:[{outcomeId:'NONE',quantity:0}]};throw Error('lost response');}
  if(offline)throw Error('offline');return receipt;
 }});
 const config={userOpeningEnabled:true,revision:1};await assert.rejects(session.start(config,1),e=>e.code==='BLOODMOON_RECOVERY_REQUIRED');await assert.rejects(session.start(config,1),e=>e.code==='BLOODMOON_RECOVERY_REQUIRED');assert.equal(posts,1);
 offline=false;await session.recover();assert.equal(posts,1);assert.equal(session.read(session.pendingKey),null);
 account=2;await assert.rejects(session.start(config,1),e=>e.code==='BLOODMOON_ACCOUNT_CHANGED');assert.equal(posts,1);
});
