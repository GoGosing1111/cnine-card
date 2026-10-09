import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {createLimitedPackService,saveLimitedPack,readLimitedPackState,handleLimitedPack,pickLimitedBatch} from '../functions/_mercenary_limited_pack.js';
import {limitedPackDraft,validateLimitedPack,limitedPackReadiness,LIMITED_PACK_KEY,LIMITED_PACK_RELEASE_ENABLED,LIMITED_PACK} from '../shared/mercenary-limited-pack-v1.mjs';
import {limitedPolicyDraft} from '../shared/mercenary-limited-policy-v1.mjs';
import {LimitedOpeningSession,limitedAutoPlan} from '../shared/mercenary-limited-session-v1.mjs';
const body=(count=1)=>({requestId:crypto.randomUUID(),count,expectedRevision:1,expectedPolicyRevision:1});
const service=()=>createLimitedPackService({releaseEnabled:true,randomInt:()=>0});
test('draft keeps actual opening OFF, unset economics and bounded exact input',async()=>{
 assert.equal(LIMITED_PACK_RELEASE_ENABLED,true);const draft=limitedPackDraft();assert.equal(draft.mode,'OFF');assert.deepEqual(draft.prices,{single:null,ten:null});assert.equal(limitedPackReadiness(draft,limitedPolicyDraft()).ready,false);
 assert.throws(()=>validateLimitedPack({...draft,mode:'ON'},{releaseEnabled:false}));for(const n of [-1,1.1,Number.MAX_SAFE_INTEGER]){const d=structuredClone(draft);d.stockLimits['V-990']=n;assert.throws(()=>validateLimitedPack(d));}
 for(const role of ['USER','OWNER']){
  await assert.rejects(createLimitedPackService({releaseEnabled:false}).open({DB:{prepare(){throw Error('must not touch DB');}}},{id:1,role},body()),error=>error.status===423);
 }
 assert.throws(()=>limitedAutoPlan({prices:{single:100,ten:900}},1001,10));assert.deepEqual(limitedAutoPlan({prices:{single:100,ten:900}},23,10),{total:23,batch:10,tens:2,ones:3,cost:'2100'});
});
test('OWNER CMS atomic revision, caps, retry and audit failure rollback',async t=>{
 const f=await limitedFixture(t);const fresh=await readLimitedPackState(f.env);assert.equal(fresh.packRevision,0);
 const b={expectedRevision:1,expectedPackRevision:0,policy:limitedPolicyDraft(),packSettings:limitedPackDraft(),reason:'설정 검수 준비',requestId:crypto.randomUUID()};
 f.fail('INSERT INTO admin_logs');await assert.rejects(saveLimitedPack(f.env,f.user,b),/INJECTED/);f.fail('');
 assert.equal((await readLimitedPackState(f.env)).packRevision,0);
 const saved=await saveLimitedPack(f.env,f.user,b);assert.equal(saved.packRevision,1);assert.equal(saved.userOpeningEnabled,false);
 assert.equal((await saveLimitedPack(f.env,f.user,b)).replayed,true);assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM admin_logs').first()).n),1);
 await assert.rejects(saveLimitedPack(f.env,f.user,{...b,requestId:crypto.randomUUID()}),e=>e.code==='MERCENARY_LIMITED_CONFLICT');
 await f.p("UPDATE mercenary_limited_stock_v1 SET stock_limit=5,issued=5 WHERE code='V-990'").run();
 const next={...b,requestId:crypto.randomUUID(),expectedRevision:2,expectedPackRevision:1};next.packSettings.stockLimits['V-990']=4;
 await assert.rejects(saveLimitedPack(f.env,f.user,next),e=>e.code==='MERCENARY_LIMITED_STOCK_LIMIT');
 const denied=await handleLimitedPack({path:LIMITED_PACK.adminPath,request:new Request('https://qa.test/api/'+LIMITED_PACK.adminPath),env:f.env,deps:{requirePermission:async()=>({id:2,role:'ADMIN'}),json:(body,status)=>({body,status})}});
 assert.equal(denied.status,403);
});
test('limited 10 draw commits exact CMS price, serials, duplicate counts; replay does not redraw',async t=>{
 const f=await limitedFixture(t);await f.configure();let rolls=0;const s=createLimitedPackService({releaseEnabled:true,randomInt:()=>{rolls++;return 0;}});
 const request=body(10),r=await s.open(f.env,f.user,request);assert.equal(r.coinCost,900);assert.equal(await f.coin(),999100);
 assert.deepEqual(r.draws.map(d=>d.serial),[1,2,3,4,5,6,7,8,9,10]);assert.equal(r.draws[0].duplicate,false);assert.equal(r.draws[9].duplicateCount,9);
 const count=rolls;const retry=await s.open(f.env,f.user,request);assert.equal(retry.replayed,true);assert.equal(rolls,count);assert.equal(await f.coin(),999100);
 await assert.rejects(s.open(f.env,f.user,{...request,count:1}),e=>e.code==='JOINT_REQUEST_CONFLICT');
 await assert.rejects(s.receipt(f.env,{id:2},request.requestId),e=>e.code==='JOINT_NOT_FOUND');
 assert.equal((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-990'").first()).issued,10);
 assert.equal((await f.p('SELECT COUNT(*) AS n FROM mercenary_limited_issues_v1').first()).n,10);
});
test('failed grant/debit rolls back all stock, card and serial changes; retry and lost ACK grant once',async t=>{
 const f=await limitedFixture(t);await f.configure();const s=service(),request=body(10);
 f.fail('INSERT INTO coin_logs');await assert.rejects(s.open(f.env,f.user,request),/INJECTED/);f.fail('');
 assert.equal(await f.coin(),1000000);assert.equal((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-990'").first()).issued,0);
 assert.equal((await f.p('SELECT COUNT(*) AS n FROM user_mercenary_cards_v1').first()).n,0);
 f.loseAck();const receipt=await s.open(f.env,f.user,request);assert.equal(receipt.draws.length,10);assert.equal(await f.coin(),999100);
 assert.equal((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n,1);
});
test('concurrent callers racing for a final quota never oversell, no charge on losers',async t=>{
 const f=await limitedFixture(t);await f.configure({limit:7});const s=service(),started=performance.now();
 const results=await Promise.allSettled(Array.from({length:64},(_,i)=>s.open(f.env,{id:i+1},body())));
 const winners=results.filter(r=>r.status==='fulfilled');assert.equal(winners.length,7);
 assert.equal((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-990'").first()).issued,7);
 assert.equal((await f.p('SELECT COUNT(DISTINCT serial) AS n FROM mercenary_limited_issues_v1').first()).n,7);
 assert.equal(Number((await f.p('SELECT SUM(1000000-coin) AS n FROM users').first()).n),700);
 for(const r of results.filter(r=>r.status==='rejected'))assert.ok(['MERCENARY_LIMITED_SOLD_OUT','MERCENARY_LIMITED_NOT_READY'].includes(r.reason.code),r.reason.message);
 t.diagnostic(JSON.stringify({mode:'PGlite serialized transactions / 64 concurrent service calls',winners:7,elapsedMs:Math.round(performance.now()-started),queries:f.stats.queries,batches:f.stats.batches}));
});
test('batch with insufficient stock is all-or-nothing; stale price and exhausted rank stop',async t=>{
 const f=await limitedFixture(t);await f.configure({limit:3});const s=service();
 await assert.rejects(s.open(f.env,f.user,body(10)),e=>e.code==='MERCENARY_LIMITED_SOLD_OUT');assert.equal(await f.coin(),1000000);
 await assert.rejects(s.open(f.env,f.user,{...body(),expectedRevision:0}),e=>e.code==='MERCENARY_LIMITED_PRICE_CHANGED');
 for(let i=0;i<3;i++)await s.open(f.env,f.user,body());
 await assert.rejects(s.open(f.env,f.user,body()),e=>e.code==='MERCENARY_LIMITED_NOT_READY');assert.equal(await f.coin(),999700);
});
test('material rewards aggregate, zero-weight and sold-out members never enter the same-rank pool',async t=>{
 const f=await limitedFixture(t);f.policy.rankRatesPpm={SS:1,SSS:0};f.packSettings.extraRewards=[{id:'MASTER_STAR',chancePpm:999999,quantity:13},{id:'MYSTIC_ENERGY',chancePpm:0,quantity:1},{id:'NONE',chancePpm:0,quantity:0}];await f.configure();
 const s=createLimitedPackService({releaseEnabled:true,randomInt:max=>max-1}),r=await s.open(f.env,f.user,body(10));assert.equal(r.draws.length,10);
 assert.equal((await f.p("SELECT quantity FROM cnine_user_inventory WHERE item_code='MASTER_STAR'").first()).quantity,130);assert.equal((await f.p('SELECT COUNT(*) AS n FROM inventory_logs').first()).n,1);
 const state=await readLimitedPackState(f.env,{releaseEnabled:true});state.policy.rankRatesPpm={SS:1000000,SSS:0};state.packSettings.extraRewards.forEach(r=>r.chancePpm=0);state.policy.cardWeights['V-991']=1;state.stock.find(s=>s.code==='V-990').issued=100;
 assert.equal(pickLimitedBatch(state,1,()=>0)[0].mercenaryCode,'V-991');
});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
function sessionFixture({present=async()=>true}={}){
 let opens=0,active=0,max=0,accountId=1,drop=false;const storage=memory(),receipts=new Map(),plan={packRevision:1,revision:1,packSettings:{prices:{single:100,ten:900}},userOpeningEnabled:true};
 const api=async(path,{body}={})=>{
  if(path.startsWith(LIMITED_PACK.receiptPath)){const r=receipts.get(path.split('requestId=')[1]);if(!r)throw Object.assign(Error('missing'),{code:'JOINT_NOT_FOUND'});return r;}
  active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,0));active--;opens++;
  const r={status:'COMPLETED',requestId:body.requestId,accountId:1,count:body.count,coin:'1000',draws:Array.from({length:body.count},()=>({outcomeId:'NONE',quantity:0}))};receipts.set(body.requestId,r);if(drop)throw Error('network');return r;
 };
 const session=new LimitedOpeningSession({api,storage,accountId:1,getAccountId:()=>accountId,present});
 return {session,plan,storage,receipts,api,setAccount:n=>accountId=n,drop:()=>drop=true,get opens(){return opens;},get max(){return max;}};
}
test('auto 1000 uses only one request at a time and awaits graphical presentation per receipt',async()=>{
 let shown=0;const f=sessionFixture({present:async receipt=>{await new Promise(r=>setTimeout(r,0));shown+=receipt.count;return true;}});
 const r=await f.session.start(f.plan,{total:1000,batch:10});assert.equal(r.completed,1000);assert.equal(shown,1000);assert.equal(f.opens,100);assert.equal(f.max,1);assert.equal(f.session.pending(),null);
});
test('stop during presentation, lost response, account switch and unavailable storage never start extra purchases',async()=>{
 let release;const f=sessionFixture({present:()=>new Promise(r=>release=r)}),running=f.session.start(f.plan,{total:10,batch:1});
 while(!release)await new Promise(r=>setTimeout(r,1));f.session.stop();release(true);assert.equal((await running).completed,1);assert.equal(f.opens,1);
 const lost=sessionFixture();lost.drop();await lost.session.start(lost.plan);assert.equal(lost.opens,1);assert.equal(lost.session.pending(),null);
 const changed=sessionFixture();changed.setAccount(2);await assert.rejects(changed.session.start(changed.plan),e=>e.code==='LIMITED_ACCOUNT_CHANGED');assert.equal(changed.opens,0);
 const denied=sessionFixture();denied.storage.setItem=()=>{throw Error('quota');};await assert.rejects(denied.session.start(denied.plan),/quota/);assert.equal(denied.opens,0);
});
test('unknown response preserves exact request for recovery and blocks any new auto run',async()=>{
 const f=sessionFixture();const original=f.session.api;let request;
 f.session.api=async(path,options)=>{if(path===LIMITED_PACK.openPath){request=options.body;throw Error('lost');}throw Error('offline');};
 await assert.rejects(f.session.start(f.plan,{total:10,batch:1}),e=>e.code==='LIMITED_RECOVERY_REQUIRED');
 assert.equal(f.session.pending().body.requestId,request.requestId);await assert.rejects(f.session.start(f.plan),e=>e.code==='LIMITED_RECOVERY_REQUIRED');
 f.session.api=original;await f.session.recover();assert.equal(f.opens,1);assert.equal(f.receipts.has(request.requestId),true);
});
test('shop/renderer integration keeps limited drawing separate and shipped renderer is versioned',()=>{
 const app=fs.readFileSync('js/app.js','utf8'),fx=fs.readFileSync('js/hyper-pack-fx-v2076.src.js','utf8'),client=fs.readFileSync('js/mercenary-limited-pack-live.mjs','utf8');
 assert.ok(app.includes("if (pack.id === 'mercenary-limited') return limitedMercenaryPackHero(pack)"));
 assert.ok(fx.includes('play(this.limited&&this.fastReveal?0.88'));assert.ok(client.includes('await fx.play(results)'));assert.ok(!client.includes('setInterval('));
 assert.ok(fs.statSync('js/hyper-pack-fx-v2076.bundle.js').size<25000);
});
