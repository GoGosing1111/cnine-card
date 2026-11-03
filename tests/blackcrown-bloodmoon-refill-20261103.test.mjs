import test from 'node:test';
import assert from 'node:assert/strict';
import {blackcrownFixture} from './helpers/blackcrown-pack-fixture.mjs';
import {BLACKCROWN_LIMITED_CARDS} from '../shared/mercenary-blackcrown-pool-v3.mjs';
import {BLOODMOON_LIMITED_CARDS} from '../shared/mercenary-bloodmoon-pool-v3.mjs';
import {BLOODMOON_PACK_KEY,bloodmoonPackDraft} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import * as black from '../functions/_mercenary_blackcrown_stock_schedule.js';
import * as blood from '../functions/_mercenary_stock_schedule.js';
import {processMercenaryPackStockSchedules} from '../workers/clan-draft/src/mercenary-stock-schedule.js';
const changes=cards=>cards.map(c=>({code:c.code,quantity:c.rank==='SS'?20:3}));
const request=(cards,at,condition)=>({action:'SCHEDULE_STOCK',requestId:crypto.randomUUID(),executeAt:at,changes:changes(cards),reason:'두 팩 같은 시각 리필 검증',...(condition?{condition}:{})});

test('one alarm processes both packs at 20:00 and 22:00, retaining the existing Bloodmoon schedules',async t=>{
 const f=await blackcrownFixture(t),settings=bloodmoonPackDraft();
 for(const [code,limit]of Object.entries(settings.stockLimits))await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,?)',code,limit).run();
 await f.setting(BLOODMOON_PACK_KEY,{revision:1,settings});
 const at20=new Date(Math.floor(Date.now()/1000)*1000+3600000).toISOString(),at22=new Date(Date.parse(at20)+7200000).toISOString();
 for(const [at,condition]of [[at20,undefined],[at22,'SOLD_OUT_ONLY']])await blood.changeMercenaryStockSchedule(f.env,f.user,request(BLOODMOON_LIMITED_CARDS,at,condition));
 const original=(await blood.readMercenaryStockSchedules(f.env)).raw;
 for(const [at,condition]of [[at20,undefined],[at22,'SOLD_OUT_ONLY']])await black.changeMercenaryStockSchedule(f.env,f.user,request(BLACKCROWN_LIMITED_CARDS,at,condition));
 assert.equal((await blood.readMercenaryStockSchedules(f.env)).raw,original);
 const before=await f.p('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 ORDER BY code').all();
 assert.equal((await processMercenaryPackStockSchedules(f.env,{clock:()=>Date.parse(at20)-1})).applied,0);
 const first=await processMercenaryPackStockSchedules(f.env,{clock:()=>Date.parse(at20)});assert.equal(first.applied,2);assert.equal(first.nextAt,at22);
 for(const c of [...changes(BLACKCROWN_LIMITED_CARDS),...changes(BLOODMOON_LIMITED_CARDS)]){const old=before.results.find(r=>r.code===c.code),row=await f.p('SELECT stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code=?',c.code).first();assert.equal(Number(row.stock_limit),Number(old.stock_limit)+c.quantity);assert.equal(row.issued,old.issued);}
 await f.p("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code IN ('V-950','V-970','V-961','V-975')").run();
 const last=await processMercenaryPackStockSchedules(f.env,{clock:()=>Date.parse(at22)});assert.equal(last.applied,2);assert.equal(last.nextAt,null);
 for(const [mod,total]of [[black,8],[blood,10]]){const done=(await mod.readMercenaryStockSchedules(f.env)).document.schedules.find(s=>s.executeAt===at22);assert.equal(done.limits.length,2);assert.equal(done.skipped.length,total-2);}
 assert.equal((await processMercenaryPackStockSchedules(f.env,{clock:()=>Date.parse(at22)})).applied,0);
 assert.equal(await f.coin(),1000000);
});

test('Blackcrown refilled SSS continues serial numbers and public state carries the sold-out condition',async t=>{
 const f=await blackcrownFixture(t);f.settings.cardRatesPpm['V-950']=0;f.settings.cardRatesPpm['V-970']=1000000;await f.configure();
 await f.p("UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code='V-970'").run();
 const before=Number((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-970'").first()).issued);
 const r=request(BLACKCROWN_LIMITED_CARDS,new Date(Math.floor(Date.now()/1000)*1000+3600000).toISOString(),'SOLD_OUT_ONLY');
 await black.changeMercenaryStockSchedule(f.env,f.user,r);
 const state=await f.state();assert.equal(state.stockSchedules[0].condition,'SOLD_OUT_ONLY');assert.equal(state.stockSchedules[0].changes.length,8);
 await black.processMercenaryStockSchedules(f.env,{clock:()=>Date.parse(r.executeAt)});
 const opened=await f.service.open(f.env,f.user,{...f.body(),expectedRevision:2});assert.equal(opened.draws[0].mercenaryCode,'V-970');
 const issue=await f.p("SELECT serial FROM mercenary_limited_issues_v1 WHERE code='V-970'").first();assert.equal(Number(issue.serial),before+1);
 assert.equal(Number((await f.p("SELECT stock_limit FROM mercenary_limited_stock_v1 WHERE code='V-970'").first()).stock_limit),before+3);
});
