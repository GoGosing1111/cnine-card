import test from 'node:test';import assert from 'node:assert/strict';
import {blackcrownFixture} from './helpers/blackcrown-pack-fixture.mjs';
import {BLACKCROWN_PACK_KEY,blackcrownReceiptResults,pickBlackcrownBatch} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {STREAMER_PACK,STREAMER_PACK_KEY,streamerStockCode} from '../shared/reversecall-streamer-pack-v1.mjs';
import {registerStreamerPack,readStreamerPackState,createStreamerPackService,saveStreamerPack,streamerPackAccess,handleStreamerPack} from '../functions/_reversecall_streamer_pack.js';
import {BlackcrownOpeningSession} from '../shared/mercenary-blackcrown-session-v2.mjs';
async function fixture(t){
 const f=await blackcrownFixture(t);
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER',ADD COLUMN status TEXT DEFAULT 'ACTIVE',ADD COLUMN banned_until TIMESTAMPTZ;CREATE TABLE soopketland_accounts(slot TEXT PRIMARY KEY,user_id BIGINT UNIQUE,bound_at TEXT);INSERT INTO soopketland_accounts VALUES('registered',1,'2026-01-01'),('second',2,'2026-01-01')");
 const before=await f.p('SELECT value FROM app_meta WHERE key=?',BLACKCROWN_PACK_KEY).first();
 await registerStreamerPack(f.env,f.user);
 assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',BLACKCROWN_PACK_KEY).first()).value,before.value);
 const state=()=>readStreamerPackState(f.env,{userId:1}),service=createStreamerPackService({randomInt:()=>0});
 const body=async(count=1)=>({requestId:crypto.randomUUID(),count,expectedRevision:(await state()).revision,...(count>10?{budget:'9000'}:{})});
 const stock=async code=>f.p('SELECT * FROM mercenary_limited_stock_v1 WHERE code=?',streamerStockCode(code)).first();
 return {...f,state,service,body,stock};
}
test('registration creates only SS6 ×10 and SSS2 ×3, replays without resetting consumed stock',async t=>{
 const f=await fixture(t),state=await f.state();assert.equal(state.stock.length,8);assert.equal(state.stock.reduce((n,s)=>n+s.limit,0),66);assert(state.userOpeningEnabled);
 for(const c of state.cards.filter(c=>c.stockPolicy!=='UNLIMITED'))assert.equal(state.stock.find(s=>s.code===c.code).limit,c.rank==='SS'?10:3);
 await f.service.open(f.env,f.user,await f.body());assert((await registerStreamerPack(f.env,f.user)).replayed);assert.equal(Number((await f.stock('V-950')).issued),1);
});
test('registered stable IDs only: ordinary, OWNER, deleted registrations and banned accounts fail closed',async t=>{
 const f=await fixture(t);assert((await streamerPackAccess(f.DB,1)).allowed);assert(!(await streamerPackAccess(f.DB,3)).allowed);
 await f.p("UPDATE users SET role='OWNER' WHERE id=3").run();const before=await f.coin(3);
 await assert.rejects(f.service.open(f.env,{id:3,role:'OWNER'},await f.body()),e=>e.status===403);assert.equal(await f.coin(3),before);
 await f.p("UPDATE users SET status='BANNED' WHERE id=1").run();assert(!(await f.state()).userOpeningEnabled);await assert.rejects(f.service.open(f.env,f.user,await f.body()),e=>e.status===403);
 await f.p("UPDATE users SET status='ACTIVE',banned_until=? WHERE id=1",new Date(Date.now()+3600000).toISOString()).run();assert(!(await streamerPackAccess(f.DB,1)).allowed);
 await f.p('DELETE FROM soopketland_accounts WHERE user_id=2').run();assert(!(await streamerPackAccess(f.DB,2)).allowed);assert(!(await streamerPackAccess(f.DB,null)).allowed);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM joint_operations_v1').first()).n),0);
});
for(const count of [1,10,100])test(`${count} opens use independent stock, payment and receipt with same lottery`,async t=>{
 const f=await fixture(t),body=await f.body(count),before=await f.coin(),old=await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-950'").first();
 const receipt=await f.service.open(f.env,f.user,body);assert.equal(receipt.packId,STREAMER_PACK.id);assert.equal(blackcrownReceiptResults(receipt,STREAMER_PACK).filter(r=>r.mercenaryCode==='V-950').length,1);
 assert.throws(()=>blackcrownReceiptResults(receipt));assert.equal(Number((await f.stock('V-950')).issued),1);assert.deepEqual(await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-950'").first(),old);
 assert.equal(await f.coin(),before-receipt.coinCost);const replay=await f.service.open(f.env,f.user,body);assert(replay.replayed);assert.equal(await f.coin(),before-receipt.coinCost);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
 await assert.rejects(f.service.open(f.env,{id:2},body),e=>e.code==='JOINT_REQUEST_CONFLICT');
 await assert.rejects(f.service.receipt(f.env,{id:2},body.requestId),e=>e.code==='JOINT_NOT_FOUND');
});
test('existing ownership across either pack prevents duplicates while each pack keeps its stock',async t=>{
 const f=await fixture(t);await f.own('V-950',2);const result=await f.service.open(f.env,f.user,await f.body(10));assert(!result.draws.some(r=>r.mercenaryCode==='V-950'));assert.equal(Number((await f.stock('V-950')).issued),0);
 assert.equal((await f.state()).effectiveCardPercents['V-950'],'0');
});
test('base prices and rates stay identical, fresh source revision invalidates stale quotes',async t=>{
 const f=await fixture(t),first=await f.state(),body=await f.body();f.settings.prices={single:200,ten:1800};await f.configure(2);const next=await f.state();assert.deepEqual(next.settings.prices,f.settings.prices);assert.deepEqual(next.settings.cardRatesPpm,f.settings.cardRatesPpm);assert.equal(next.revision,first.revision+1);
 await assert.rejects(f.service.open(f.env,f.user,body),e=>e.code==='MERCENARY_BLACKCROWN_CHANGED');assert.equal(await f.coin(),1000000);
});
test('source change at commit rolls back planned grants and debit',async t=>{
 const f=await fixture(t),before=await f.coin(),batch=f.DB.batch.bind(f.DB);let injected=false;
 f.DB.batch=async list=>{if(!injected&&list.some(s=>s.source.includes('INSERT INTO coin_logs'))){injected=true;f.settings.prices.single=200;await f.configure(2);}return batch(list);};
 await assert.rejects(f.service.open(f.env,f.user,await f.body()),e=>e.code==='MERCENARY_BLACKCROWN_CHANGED');assert(injected);assert.equal(await f.coin(),before);assert.equal(Number((await f.stock('V-950')).issued),0);
});
test('registration revoked at commit fails atomic membership guard with no charge or reward',async t=>{
 const f=await fixture(t),before=await f.coin(),batch=f.DB.batch.bind(f.DB);let injected=false;
 f.DB.batch=async list=>{if(!injected&&list.some(s=>s.source.includes('INSERT INTO coin_logs'))){injected=true;await f.p('DELETE FROM soopketland_accounts WHERE user_id=1').run();}return batch(list);};
 await assert.rejects(f.service.open(f.env,f.user,await f.body()));assert(injected);assert.equal(await f.coin(),before);assert.equal(Number((await f.stock('V-950')).issued),0);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_card_acquisitions_v1').first()).n),0);
});
test('late ledger failure rolls back and lost acknowledgement reconciles once',async t=>{
 const f=await fixture(t),body=await f.body(10),before=await f.coin();f.fail('INSERT INTO coin_logs');await assert.rejects(f.service.open(f.env,f.user,body));f.fail('');assert.equal(await f.coin(),before);assert.equal(Number((await f.stock('V-950')).issued),0);
 f.loseAck();const result=await f.service.open(f.env,f.user,body);assert.equal(await f.coin(),before-result.coinCost);assert((await f.service.open(f.env,f.user,body)).replayed);assert.equal(Number((await f.stock('V-950')).issued),1);
});
test('SSS serials are independent and exhaustion redirects only its interval to ordinary SSS',async t=>{
 const f=await fixture(t);f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(c=>[c,c==='V-970'?1000000:0]));await f.configure(2);
 const receipt=await f.service.open(f.env,f.user,await f.body(10));assert.deepEqual(receipt.draws.filter(r=>r.mercenaryCode==='V-970').map(r=>r.serial),[1,2,3]);assert.equal(Number((await f.stock('V-970')).issued),3);assert.equal(Number((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-970'").first()).issued),0);
 const next=await f.service.open(f.env,f.user,await f.body());assert(!next.draws.some(r=>r.mercenaryCode==='V-970'));assert.equal((await f.state()).settings.mode,'ON');
});
test('CMS adds only requested independent stock and replays without a second increment',async t=>{
 const f=await fixture(t),before=await f.p('SELECT value FROM app_meta WHERE key=?',BLACKCROWN_PACK_KEY).first(),body={requestId:crypto.randomUUID(),expectedRevision:(await f.state()).revision,mode:'OFF',additions:[{code:'V-950',quantity:2}],reason:'독립 한도 추가 검수'};
 const saved=await saveStreamerPack(f.env,f.user,body);assert.equal(saved.settings.stockLimits['V-950'],12);assert.equal(saved.settings.mode,'OFF');assert.equal(Number((await f.stock('V-950')).issued),0);assert((await saveStreamerPack(f.env,f.user,body)).replayed);assert.equal(Number((await f.stock('V-950')).stock_limit),12);assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',BLACKCROWN_PACK_KEY).first()).value,before.value);
 await assert.rejects(saveStreamerPack(f.env,{id:2,role:'ADMIN'},body),e=>e.status===403);
 await assert.rejects(saveStreamerPack(f.env,f.user,{...body,requestId:crypto.randomUUID()}),e=>e.status===409);
 await assert.rejects(saveStreamerPack(f.env,f.user,{...body,additions:[{code:'V-950',quantity:-1}]}));
});
test('CMS audit failure cannot change mode or either stock ledger',async t=>{
 const f=await fixture(t),before=(await f.state()).rawPack,body={requestId:crypto.randomUUID(),expectedRevision:(await f.state()).revision,mode:'OFF',additions:[{code:'V-970',quantity:3}],reason:'원자 저장 실패 검수'};
 f.fail('INSERT INTO admin_logs');await assert.rejects(saveStreamerPack(f.env,f.user,body));f.fail('');assert.equal((await f.state()).rawPack,before);assert.equal(Number((await f.stock('V-970')).stock_limit),3);
});
test('last SSS copy contention never exceeds the streamer limit',async t=>{
 const f=await fixture(t);f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(c=>[c,c==='V-970'?1000000:0]));await f.configure(2);await f.p('UPDATE mercenary_limited_stock_v1 SET issued=2 WHERE code=?',streamerStockCode('V-970')).run();
 const results=await Promise.allSettled([f.service.open(f.env,f.user,await f.body()),f.service.open(f.env,{id:2},await f.body())]);assert(results.some(r=>r.status==='fulfilled'));assert.equal(Number((await f.stock('V-970')).issued),3);assert.equal(results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value.draws).filter(r=>r.mercenaryCode==='V-970').length,1);
});
test('client recovery keys and returned pack identity remain isolated',async t=>{
 const f=await fixture(t),receipt=await f.service.open(f.env,f.user,await f.body()),map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const common={api:async()=>receipt,accountId:1,getAccountId:()=>1,storage,present:async()=>{}};
 const streamer=new BlackcrownOpeningSession({...common,pack:STREAMER_PACK}),original=new BlackcrownOpeningSession(common);assert.notEqual(streamer.pendingKey,original.pendingKey);map.set(original.pendingKey,'old request');await streamer.accept(receipt);assert.equal(map.get(original.pendingKey),'old request');assert(map.has(streamer.receiptKey));await assert.rejects(original.accept(receipt));
});
test('route denies anonymous purchases and registration-free owner purchases, returns safe personalized state',async t=>{
 const f=await fixture(t);let viewer=null;const deps={authenticate:async()=>viewer,requirePermission:async()=>viewer,json:(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers}),withUserMutationLock:async(_e,_id,_path,work)=>work()};
 const request=(path,method='GET',body)=>handleStreamerPack({path,request:new Request('https://test.invalid/api/'+path,{method,...(body?{body:JSON.stringify(body)}:{})}),env:f.env,deps});
 assert.equal((await request(STREAMER_PACK.openPath,'POST',await f.body())).status,401);viewer={id:3,role:'OWNER'};assert.equal((await request(STREAMER_PACK.openPath,'POST',await f.body())).status,403);viewer=f.user;const feature=await(await request(STREAMER_PACK.featurePath)).json();assert(feature.userOpeningEnabled);for(const key of ['rawPack','rawDocument','policySnapshots'])assert(!(key in feature));
});
