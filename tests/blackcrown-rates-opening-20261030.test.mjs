import test from 'node:test';import assert from 'node:assert/strict';
import reference from './fixtures/blackcrown-sss-reference-20261027.json' with {type:'json'};
import {blackcrownFixture} from './helpers/blackcrown-pack-fixture.mjs';
import {prepareSettings,apply,inspect,OPENS_AT} from '../scripts/ops/blackcrown-rates-opening-20261030.mjs';
import {BLACKCROWN_PACK_KEY,blackcrownScheduledSettings,blackcrownPackState} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {BLOODMOON_PACK_KEY} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {blackcrownPackShopRow,saveBlackcrownPack} from '../functions/_mercenary_blackcrown_pack.js';
import {BlackcrownOpeningSession} from '../shared/mercenary-blackcrown-session-v2.mjs';
import {blackcrownLargeOpening,BLACKCROWN_LARGE_OPENING_MS} from '../js/mercenary-blackcrown-presentation-v2.mjs';
const prepared=()=>prepareSettings(reference.blackcrown.settings,reference.bloodmoon.settings);
test('all base rates match Bloodmoon and General Jok, with a complete ordinary remainder and preserved limits/prices',()=>{
 const before=structuredClone(reference),p=prepared();assert.deepEqual(reference,before);
 assert.deepEqual(p.settings.normalRankRatesPpm,reference.bloodmoon.settings.normalRankRatesPpm);assert.equal(p.settings.missRatePpm,800000);
 for(const code of ['V-950','V-951','V-952','V-953','V-954','V-955'])assert.equal(p.settings.cardRatesPpm[code],5000);
 for(const code of ['V-970','V-971'])assert.equal(p.settings.cardRatesPpm[code],10);
 assert.equal(p.settings.cardRatesPpm['V-058'],400);assert.equal(p.settings.normalSssRatePpm,969580);
 assert.equal(Object.values(p.settings.cardRatesPpm).reduce((a,b)=>a+b,0)+p.settings.normalSssRatePpm,1000000);
 assert.equal(p.ssPercent,'0.0004');assert.equal(p.sssPercent,'0.0000008');assert.equal(p.razakPercent,'0.000032');assert.deepEqual(p.settings.prices,before.blackcrown.settings.prices);
});
test('all ownership tiers block owned SS and reduce unowned SS only; stock exhaustion redirects to ordinary SSS',()=>{
 const settings=prepared().settings,codes=['V-950','V-951','V-952','V-953','V-954','V-955'],stock=Object.entries(settings.stockLimits).map(([code,stock_limit])=>({code,stock_limit,issued:0}));
 for(let n=0;n<=6;n++){
  const state=blackcrownPackState(settings,stock,[],{ownedCodes:codes.slice(0,n)});assert.equal(state.ssProbabilityDivisor,2**Math.max(0,n-1));assert.equal(Number(state.effectiveCardPercents['V-955']),n===6?0:.0004/2**Math.max(0,n-1));for(const code of codes.slice(0,n))assert.equal(state.effectiveCardPercents[code],'0');assert.equal(state.effectiveCardPercents['V-970'],'0.0000008');
 }
 const full=blackcrownPackState(settings,stock.map(s=>({...s,issued:s.stock_limit})));assert.equal(full.effectiveCardPercents['V-950'],'0');assert.equal(full.effectiveCardPercents['V-970'],'0');
});
test('KST midnight boundary opens at exactly 2026-10-30T15:00Z and never modifies persisted OFF',()=>{
 const saved={settings:prepared().settings,openingSchedule:{status:'SCHEDULED',opensAt:OPENS_AT}},before=structuredClone(saved);
 assert.equal(blackcrownScheduledSettings(saved,'2026-10-30T14:59:59.999Z').settings.mode,'OFF');assert.equal(blackcrownScheduledSettings(saved,OPENS_AT).settings.mode,'ON');assert.equal(blackcrownScheduledSettings(saved,'2026-10-31T15:00:00.000Z').settings.mode,'ON');assert.deepEqual(saved,before);
 assert.throws(()=>blackcrownScheduledSettings({...saved,openingSchedule:{status:'SCHEDULED',opensAt:'bad'}},OPENS_AT));
});
test('real shop and purchase gate agree before/after opening; early request cannot charge, completed request cannot charge twice',async t=>{
 const f=await blackcrownFixture(t);f.settings.mode='OFF';
 const save=opensAt=>f.setting(BLACKCROWN_PACK_KEY,{revision:1,settings:f.settings,openingSchedule:{status:'SCHEDULED',opensAt}});
 await save('2099-10-30T15:00:00.000Z');const balance=await f.coin(),stock=(await f.state()).stock;
 assert.equal((await blackcrownPackShopRow(f.env)).drawEnabled,false);assert.equal((await f.state()).userOpeningEnabled,false);
 await assert.rejects(f.service.open(f.env,f.user,f.body()),e=>e.code==='MERCENARY_BLACKCROWN_CLOSED');assert.equal(await f.coin(),balance);assert.deepEqual((await f.state()).stock,stock);
 await save('2000-10-30T15:00:00.000Z');assert.equal((await blackcrownPackShopRow(f.env)).drawEnabled,true);assert.equal((await f.state()).userOpeningEnabled,true);
 const body=f.body(),receipt=await f.service.open(f.env,f.user,body);assert.equal(receipt.status,'COMPLETED');assert.equal(await f.coin(),balance-100);assert((await f.service.open(f.env,f.user,body)).replayed);assert.equal(await f.coin(),balance-100);
 // Explicit OWNER save supersedes the scheduled opening and can close it.
 await saveBlackcrownPack(f.env,f.user,{expectedRevision:1,requestId:crypto.randomUUID(),reason:'예약 이후 수동 판매 중지',settings:f.settings});assert.equal((await f.state()).userOpeningEnabled,false);
});
test('100 trillion threshold uses budget, not rounded debit; other batch sizes have no added film',()=>{
 assert.equal(BLACKCROWN_LARGE_OPENING_MS,10000);assert(blackcrownLargeOpening({budget:'100000000000000',coinCost:'99999000000000'}));assert(!blackcrownLargeOpening({budget:'50000000000000'}));assert(!blackcrownLargeOpening({count:10}));
});
test('animation holds the session lock and creates no pending purchase or POST until it finishes; cancellation is free',async()=>{
 let release,posts=0;const entries=new Map(),storage={getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
 const session=new BlackcrownOpeningSession({api:async()=>{posts++;throw Error('Unexpected POST');},accountId:1,getAccountId:()=>1,storage,present:async()=>{},beforeOpen:()=>new Promise((_,reject)=>{release=reject;})});
 const opening=session.startBulk({userOpeningEnabled:true,revision:1},{count:66666,budget:'100000000000000'});
 await Promise.resolve();await assert.rejects(session.start({userOpeningEnabled:true,revision:1},1),e=>e.code==='BLACKCROWN_BUSY');assert.equal(posts,0);assert.equal(entries.size,0);
 release(Error('Animation cancelled'));await assert.rejects(opening,/cancelled/);assert.equal(posts,0);assert.equal(entries.size,0);assert.equal(session.busy,false);
});
test('rate/schedule operation rolls back failure and rehearsal, preserves stock, and replays with SELECT only',async t=>{
 const f=await blackcrownFixture(t);await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'OWNER'");
 await f.setting(BLACKCROWN_PACK_KEY,{revision:5,settings:prepared().settings});await f.setting(BLOODMOON_PACK_KEY,reference.bloodmoon);
 const db={query:(sql,args)=>f.pg.query(sql,args)},before=await inspect(db),options={expectedPackHash:before.packHash,expectedReferenceHash:before.referenceHash};
 await assert.rejects(apply(db,{...options,failAfterWrite:true}),/INJECTED_FAILURE/);assert.deepEqual(await inspect(db),before);
 assert.equal((await apply(db,{...options,dryRun:true})).status,'DRY_RUN_PASSED');assert.deepEqual(await inspect(db),before);
 const result=await apply(db,options);assert.equal(result.after.pack.settings.mode,'OFF');assert.equal(result.after.pack.openingSchedule.opensAt,OPENS_AT);assert.equal(result.after.stockHash,before.stockHash);
 const replay=await apply({query:(sql,args)=>{assert(/^SELECT\b/.test(sql));return db.query(sql,args);}});assert.equal(replay.replayed,true);
});
