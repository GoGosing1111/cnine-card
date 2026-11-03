import test from 'node:test';
import assert from 'node:assert/strict';
import {blackcrownFixture} from './helpers/blackcrown-pack-fixture.mjs';
import {BLACKCROWN_LIMITED_CARDS} from '../shared/mercenary-blackcrown-pool-v3.mjs';
import {BLACKCROWN_PACK_KEY} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {changeMercenaryStockSchedule,processMercenaryStockSchedules,readMercenaryStockSchedules,readBlackcrownStockSnapshot} from '../functions/_mercenary_blackcrown_stock_schedule.js';
const changes=BLACKCROWN_LIMITED_CARDS.map(c=>({code:c.code,quantity:c.rank==='SS'?20:3}));
const request=(condition)=>({action:'SCHEDULE_STOCK',requestId:crypto.randomUUID(),executeAt:new Date(Math.floor(Date.now()/1000)*1000+3600000).toISOString(),changes,reason:'블랙크라운 20시 전체, 22시 소진 종류만 각 SS20/SSS3 리필',...(condition?{condition}:{})});
const tick=(f,r)=>processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(r.executeAt)});

test('20:00 adds SS20 and SSS3 to all eight; 22:00 refills only the exhausted kinds, once',async t=>{
 const f=await blackcrownFixture(t),a=request(),b={...request('SOLD_OUT_ONLY'),executeAt:new Date(Date.parse(a.executeAt)+7200000).toISOString()},before=await readBlackcrownStockSnapshot(f.env);
 await changeMercenaryStockSchedule(f.env,f.user,a);await changeMercenaryStockSchedule(f.env,f.user,b);
 assert.deepEqual(await readBlackcrownStockSnapshot(f.env),before);
 assert.equal((await processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(a.executeAt)-1})).applied,0);
 assert.equal((await tick(f,a)).applied,1);
 const after20=await readBlackcrownStockSnapshot(f.env);
 for(const c of changes){const old=before.stock.find(s=>s.code===c.code),row=after20.stock.find(s=>s.code===c.code);assert.equal(Number(row.stock_limit),Number(old.stock_limit)+c.quantity);assert.equal(row.issued,old.issued);}
 await f.p("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code IN ('V-950','V-970','V-971')").run();
 await f.p("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit-1 WHERE code='V-951'").run();
 const at22=await readBlackcrownStockSnapshot(f.env);assert.equal((await tick(f,b)).applied,1);assert.equal((await tick(f,b)).applied,0);
 const after22=await readBlackcrownStockSnapshot(f.env);
 for(const c of changes){const old=at22.stock.find(s=>s.code===c.code),row=after22.stock.find(s=>s.code===c.code);assert.equal(Number(row.stock_limit),Number(old.stock_limit)+(Number(old.issued)===Number(old.stock_limit)?c.quantity:0));assert.equal(row.issued,old.issued);}
 const done=(await readMercenaryStockSchedules(f.env)).document.schedules.find(s=>s.id===b.requestId);assert.equal(done.limits.length,3);assert.equal(done.skipped.length,5);
 assert.deepEqual(JSON.parse(after22.row.value).settings.cardRatesPpm,f.settings.cardRatesPpm);assert.equal(await f.coin(),1000000);assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n),0);
});

test('22:00 with stock remaining everywhere closes once and does not alter the pack or stock',async t=>{
 const f=await blackcrownFixture(t),r=request('SOLD_OUT_ONLY');await changeMercenaryStockSchedule(f.env,f.user,r);const before=await readBlackcrownStockSnapshot(f.env);
 await tick(f,r);assert.deepEqual(await readBlackcrownStockSnapshot(f.env),before);
 await f.p('UPDATE mercenary_limited_stock_v1 SET issued=stock_limit').run();const sold=await readBlackcrownStockSnapshot(f.env);
 assert.equal((await tick(f,r)).applied,0);assert.deepEqual(await readBlackcrownStockSnapshot(f.env),sold);
 const done=(await readMercenaryStockSchedules(f.env)).document.schedules.find(s=>s.id===r.requestId);assert.deepEqual(done.limits,[]);assert.equal(done.skipped.length,8);
});

test('22:00 concurrent last-copy sale retries the stock decision inside the atomic receipt',async t=>{
 const f=await blackcrownFixture(t),r=request('SOLD_OUT_ONLY');await changeMercenaryStockSchedule(f.env,f.user,r);
 const batch=f.DB.batch.bind(f.DB);let injected=false;
 f.DB.batch=async list=>{if(!injected&&list.some(s=>s.source.includes('INSERT INTO admin_logs'))){injected=true;await f.p("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code='V-950'").run();}return batch(list);};
 await tick(f,r);assert(injected);const row=(await readBlackcrownStockSnapshot(f.env)).stock.find(s=>s.code==='V-950');assert.equal(Number(row.stock_limit),f.settings.stockLimits['V-950']+20);assert.equal(Number(row.issued),f.settings.stockLimits['V-950']);
 assert.equal((await readMercenaryStockSchedules(f.env)).document.schedules.find(s=>s.id===r.requestId).limits.length,1);
});

test('22:00 late audit failure rolls back policy, all stock changes and completion; replay adds once',async t=>{
 const f=await blackcrownFixture(t),r=request('SOLD_OUT_ONLY');await f.p('UPDATE mercenary_limited_stock_v1 SET issued=stock_limit').run();await changeMercenaryStockSchedule(f.env,f.user,r);
 const before=await readBlackcrownStockSnapshot(f.env),queue=(await readMercenaryStockSchedules(f.env)).raw;
 f.fail('INSERT INTO admin_logs');await assert.rejects(()=>tick(f,r),/INJECTED_FAILURE/);f.fail('');assert.deepEqual(await readBlackcrownStockSnapshot(f.env),before);assert.equal((await readMercenaryStockSchedules(f.env)).raw,queue);
 f.loseAck();await tick(f,r);await Promise.all([tick(f,r),tick(f,r)]);
 const after=await readBlackcrownStockSnapshot(f.env);for(const c of changes)assert.equal(Number(after.stock.find(s=>s.code===c.code).stock_limit),Number(before.stock.find(s=>s.code===c.code).stock_limit)+c.quantity);
 assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM admin_logs WHERE action_type='MERCENARY_STOCK_SCHEDULE_APPLY'").first()).n),1);
});

test('conditional registration rejects unknown modes and keeps request IDs content-bound',async t=>{
 const f=await blackcrownFixture(t),r=request('SOLD_OUT_ONLY');
 for(const condition of ['ALL',true,null,'SOLD_OUT'])await assert.rejects(()=>changeMercenaryStockSchedule(f.env,f.user,{...r,condition}));
 await changeMercenaryStockSchedule(f.env,f.user,r);assert((await changeMercenaryStockSchedule(f.env,f.user,r)).replayed);
 const {condition,...normal}=r;await assert.rejects(()=>changeMercenaryStockSchedule(f.env,f.user,normal),e=>e.status===409);
});
