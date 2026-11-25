import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {
 HALLOWEEN_PACK,HALLOWEEN_PACK_KEY,HALLOWEEN_RERUN_KEY,HALLOWEEN_RERUN_LIMITS,HALLOWEEN_RERUN_OPENS_AT,halloweenRerunStockKey
} from '../shared/mercenary-halloween-pack-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {LIMITED_RATE_TOTAL,limitedRateUnits} from '../shared/mercenary-limited-rates-v1.mjs';
import {createHalloweenPackService} from '../functions/_mercenary_halloween_opening.js';
import {readJinmuPackOwners} from '../functions/_mercenary_jinmu_access.js';
import {readJokroPackOwners} from '../functions/_mercenary_jokro_access.js';
import {halloweenPackShopRow,handleHalloweenPack,readHalloweenPackState} from '../functions/_mercenary_halloween_pack.js';
import {prepareHalloweenRerun,verifyHalloweenRerun} from '../scripts/ops/halloween-rerun-20261125.mjs';

const opens=Date.parse(HALLOWEEN_RERUN_OPENS_AT),codes=Object.keys(HALLOWEEN_RERUN_LIMITS);
const json=(body,status=200)=>({body,status});
function mockClock(t){
 let now=opens-1;
 t.mock.method(Date,'now',()=>now);
 return value=>{now=value;};
}
async function soldOutFixture(t,originalSale){
 const f=await halloweenFixture(t);
 f.settings.cardRatesPpm=Object.fromEntries(codes.map(code=>[code,10_000]));
 f.settings.normalSssRatePpm=1_000_000-codes.length*10_000;
 await f.configure();
 if(originalSale)await originalSale(f);
 await f.pg.exec("ALTER TABLE app_meta ADD COLUMN updated_at TEXT; ALTER TABLE users ADD COLUMN role TEXT; ALTER TABLE users ADD COLUMN status TEXT; UPDATE users SET role='OWNER',status='ACTIVE' WHERE id=1;");
 await f.pg.query('UPDATE mercenary_limited_stock_v1 SET issued=stock_limit WHERE code=ANY($1::text[])',[codes]);
 await f.pg.query(`INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at)
  SELECT stock.code||':'||serial,'old-sale',1,stock.code,serial,'2026-10-24' FROM mercenary_limited_stock_v1 stock
  CROSS JOIN LATERAL generate_series(1,stock.issued) AS serial WHERE stock.code=ANY($1::text[])
  ON CONFLICT(code,serial) DO NOTHING`,[codes]);
 const db={query:(sql,args)=>sql==='SELECT clock_timestamp() AS now'
  ? {rows:[{now:new Date(Date.now()).toISOString()}]} : f.pg.query(sql,args)};
 const stock=code=>f.p('SELECT stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code=?',code).first();
 return {...f,db,stock};
}
function serviceFor(code,options={}){
 const ticket=HALLOWEEN_PACK_CARDS.findIndex(card=>card.code===code)*limitedRateUnits(10_000);
 let nextStage=0;
 return createHalloweenPackService({readState:readHalloweenPackState,...options,randomInt:max=>max===LIMITED_RATE_TOTAL?nextStage++%2*ticket:0});
}

test('original and rerun Jinmu and Jokro owners remain eligible through every reissued serial',async t=>{
 const moveClock=mockClock(t);
 const checks=[['V-989',readJinmuPackOwners],['V-979',readJokroPackOwners]];
 const originalBuyer=7,rerunBuyer=8,otherUser=9,ids=[originalBuyer,rerunBuyer,otherUser];
 const f=await soldOutFixture(t,async original=>{
  for(const [code] of checks){
   const opened=await serviceFor(code,{shopEnabled:true}).open(original.env,{id:originalBuyer},original.body());
   assert.equal(opened.draws[0].mercenaryCode,code);
  }
 });
 await prepareHalloweenRerun(f.db);
 moveClock(opens);
 for(const [code,readOwners] of checks){
  const owners=()=>readOwners(f.env,ids);
  assert.deepEqual(await owners(),new Set([originalBuyer]));
  const service=serviceFor(code),base=Number((await f.stock(code)).issued);
  for(let i=1;i<=HALLOWEEN_RERUN_LIMITS[code];i++){
   const receipt=await service.open(f.env,{id:rerunBuyer},f.body());
   assert.equal(receipt.draws[0].serial,base+i);
   assert.deepEqual(await owners(),new Set([originalBuyer,rerunBuyer]));
  }
  const exhausted=await service.open(f.env,{id:otherUser},f.body());
  assert.notEqual(exhausted.draws[0].mercenaryCode,code);
  assert.deepEqual(await owners(),new Set([originalBuyer,rerunBuyer]));
  await f.p('UPDATE mercenary_limited_stock_v1 SET stock_limit=stock_limit+1 WHERE code=?',code).run();
  assert.deepEqual(await owners(),new Set());
 }
});

test('the scheduled rerun is listed before midnight KST and permits purchases at precisely midnight',async t=>{
 const moveClock=mockClock(t),f=await soldOutFixture(t);
 const before=await f.p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_PACK_KEY).first();
 const dry=await prepareHalloweenRerun(f.db,{dryRun:true});
 assert.equal(dry.stock.length,12);
 assert.equal(await f.stock(halloweenRerunStockKey('V-980')),null);
 assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_RERUN_KEY).first(),null);
 moveClock(opens);
 assert.equal(await halloweenPackShopRow(f.env),null);
 moveClock(opens-1);
 const scheduled=await prepareHalloweenRerun(f.db);
 assert.deepEqual(await verifyHalloweenRerun(f.db),{opensAt:HALLOWEEN_RERUN_OPENS_AT,auditId:scheduled.auditId,stock:dry.stock});
 assert.equal((await prepareHalloweenRerun(f.db)).replayed,true);
 assert.equal((await f.pg.query('SELECT COUNT(*) AS n FROM admin_logs')).rows[0].n,1);

 const path=HALLOWEEN_PACK.openPath;
 const open=authenticate=>handleHalloweenPack({path,request:new Request('https://qa.test/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(f.body())}),env:f.env,deps:{json,authenticate}});
 const preview=await halloweenPackShopRow(f.env),previewState=await readHalloweenPackState(f.env);
 assert.equal(preview.id,HALLOWEEN_PACK.id);
 assert.equal(preview.drawEnabled,false);
 assert.equal(preview.ownerDrawEnabled,false);
 assert.equal(preview.saleOpensAt,HALLOWEEN_RERUN_OPENS_AT);
 assert.equal(preview.saleLabel,'11월 25일 00:00 (한국 시간)');
 assert.deepEqual(preview.prices,f.settings.prices);
 assert.deepEqual(preview.previewCards.filter(c=>c.rank==='SS').map(c=>c.remaining),Array(8).fill(20));
 assert.deepEqual(preview.previewCards.filter(c=>c.rank==='SSS').map(c=>c.remaining),Array(4).fill(5));
 assert.equal(previewState.userOpeningEnabled,false);
 assert.equal(previewState.saleOpensAt,HALLOWEEN_RERUN_OPENS_AT);
 assert.equal((await open(()=>assert.fail('Opening before midnight reached authentication'))).status,423);
 await assert.rejects(serviceFor('V-980').open(f.env,f.user,f.body()),{status:423});
 assert.equal((await verifyHalloweenRerun(f.db)).stock.reduce((sum,row)=>sum+row.issued,0),0);

 moveClock(opens);
 const shop=await halloweenPackShopRow(f.env),state=await readHalloweenPackState(f.env);
 assert.equal((await open(async()=>null)).status,401);
 assert.equal(shop.drawEnabled,true);
 assert.equal(shop.saleOpensAt,HALLOWEEN_RERUN_OPENS_AT);
 assert.equal(state.userOpeningEnabled,true);
 assert.deepEqual(shop.previewCards.filter(c=>c.rank==='SS').map(c=>c.remaining),Array(8).fill(20));
 assert.deepEqual(shop.previewCards.filter(c=>c.rank==='SSS').map(c=>c.remaining),Array(4).fill(5));
 assert.deepEqual(await f.p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_PACK_KEY).first(),before);
 assert.equal(await f.coin(),1000000);
});

test('one SS batch uses only its remaining rerun copies, rolls back on failure, and replays once',async t=>{
 const moveClock=mockClock(t),f=await soldOutFixture(t),code='V-980',key=halloweenRerunStockKey(code);
 await prepareHalloweenRerun(f.db);
 await f.p('UPDATE mercenary_limited_stock_v1 SET issued=18 WHERE code=?',key).run();
 const previous=await f.stock(code),base=Number(previous.issued),service=serviceFor(code),body=f.body(10);
 moveClock(opens);
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');
 await assert.rejects(service.open(f.env,f.user,body),/INJECTED_FAILURE/);
 assert.equal(Number((await f.stock(key)).issued),18);
 assert.deepEqual(await f.stock(code),previous);
 assert.equal(await f.coin(),1000000);
 f.fail('');
 f.loseAck();
 const paid=await service.open(f.env,f.user,body);
 assert.deepEqual(paid.draws.slice(0,2).map(d=>[d.mercenaryCode,d.serial]),[[code,base+1],[code,base+2]]);
 assert.ok(paid.draws.slice(2).every(d=>d.outcomeId==='CARD_SSS'));
 assert.equal(Number((await f.stock(key)).issued),20);
 const global=await f.stock(code);
 assert.equal(Number(global.issued),base+2);
 assert.equal(Number(global.stock_limit),base+2);
 assert.deepEqual((await service.open(f.env,f.user,body)).draws,paid.draws);
 assert.equal(await f.coin(),999100);
});

test('two simultaneous SSS draws cannot both take the last copy or open shared stock',async t=>{
 const moveClock=mockClock(t),f=await soldOutFixture(t),code='V-999',key=halloweenRerunStockKey(code);
 await prepareHalloweenRerun(f.db);
 await f.p('UPDATE mercenary_limited_stock_v1 SET issued=4 WHERE code=?',key).run();
 const base=Number((await f.stock(code)).issued),service=serviceFor(code);
 moveClock(opens+1);
 const batch=f.DB.batch.bind(f.DB);
 let winner,racing=false;
 f.DB.batch=async statements=>{
  if(!racing){racing=true;winner=await service.open(f.env,{id:2},f.body());}
  return batch(statements);
 };
 const result=await service.open(f.env,f.user,f.body());
 assert.equal(winner.draws[0].mercenaryCode,code);
 assert.equal(winner.draws[0].serial,base+1);
 assert.equal(result.draws[0].outcomeId,'CARD_SSS');
 assert.equal(Number((await f.stock(key)).issued),5);
 const global=await f.stock(code);
 assert.equal(Number(global.issued),base+1);
 assert.equal(Number(global.stock_limit),base+1);
 assert.equal(await f.coin(),999900);
 assert.equal(await f.coin(2),999900);
});

test('an unpaid request from the old sale cannot consume the new allotment',async t=>{
 const moveClock=mockClock(t),f=await soldOutFixture(t),body=f.body();
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');
 await assert.rejects(f.service.open(f.env,f.user,body),/INJECTED_FAILURE/);
 f.fail('');
 await prepareHalloweenRerun(f.db);
 moveClock(opens);
 await assert.rejects(serviceFor('V-980').open(f.env,f.user,body),{code:'MERCENARY_HALLOWEEN_CHANGED'});
 const op=await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',body.requestId).first();
 assert.equal(op.status,'CANCELLED');
 assert.equal(await f.coin(),1000000);
 assert.equal(Number((await f.stock(halloweenRerunStockKey('V-980'))).issued),0);
});
