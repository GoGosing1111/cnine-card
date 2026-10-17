import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_MERCENARIES} from '../shared/mercenary-halloween-catalog-v1.mjs';
import {halloweenPackDraft,readHalloweenPackSettings,validateHalloweenPack,halloweenPackState,HALLOWEEN_PACK_KEY} from '../shared/mercenary-halloween-pack-v1.mjs';
import {halloweenStockText,halloweenCollectionMarkup} from '../js/mercenary-halloween-presentation-v2.mjs';
import {increaseHalloweenSsStock,HALLOWEEN_SS_STOCK_PLUS5_KEY} from '../scripts/ops/halloween-ss-stock-plus5-20261017.mjs';
const codes=HALLOWEEN_MERCENARIES.map(c=>c.code);
async function original(t){
 const f=await halloweenFixture(t);
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; UPDATE users SET role='OWNER' WHERE id=1");
 for(const code of codes){f.settings.stockLimits[code]=5;await f.pg.query('UPDATE mercenary_limited_stock_v1 SET stock_limit=5 WHERE code=$1',[code]);}
 await f.configure();return f;
}
const snapshot=async f=>({stock:(await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows,meta:(await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows,audit:(await f.pg.query('SELECT * FROM admin_logs ORDER BY id')).rows,holdings:(await f.pg.query('SELECT * FROM user_mercenary_cards_v1')).rows});

test('new SS limits are ten; the prior five-copy state stays readable during rollout, while saves reject it',()=>{
 const current=halloweenPackDraft();assert.ok(codes.every(code=>current.stockLimits[code]===10));
 const old=structuredClone(current);for(const code of codes)old.stockLimits[code]=5;
 assert.deepEqual(readHalloweenPackSettings(old),old);assert.throws(()=>validateHalloweenPack(old));
 const rows=codes.map(code=>({code,stock_limit:5,issued:2}));assert.equal(halloweenPackState(old,rows).stock[0].remaining,3);
 assert.throws(()=>halloweenPackState(current,rows));
 const mixed=structuredClone(current);mixed.stockLimits['V-980']=5;assert.throws(()=>readHalloweenPackSettings(mixed));
 assert.equal(halloweenStockText({code:'V-980'},{prepared:true,limit:10,remaining:8}),'잔여 8 / 10장');
 assert.match(halloweenCollectionMarkup(HALLOWEEN_MERCENARIES,codes.map(code=>({code,prepared:true,limit:10,remaining:8}))),/캐릭터별 서버 10장/);
 assert.equal(current.stockLimits['V-989'],3);assert.equal(current.stockLimits['V-999'],null);
});

test('adding thirty-five slots is atomic and idempotent; issuance, SSS, settings and holdings are preserved',async t=>{
 const f=await original(t);for(let i=0;i<codes.length;i++)await f.pg.query('UPDATE mercenary_limited_stock_v1 SET issued=$1 WHERE code=$2',[i%3,codes[i]]);
 const before=await snapshot(f);
 assert.equal((await increaseHalloweenSsStock(f.pg,{dryRun:true})).status,'DRY_RUN_PASSED');assert.deepEqual(await snapshot(f),before);
 const failing={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('INJECTED')):f.pg.query(sql,args)};
 await assert.rejects(increaseHalloweenSsStock(failing),/INJECTED/);assert.deepEqual(await snapshot(f),before);
 const result=await increaseHalloweenSsStock(f.pg);assert.equal(result.receipt.totalAdded,35);assert.equal(result.replayed,false);
 const after=await snapshot(f),settings=JSON.parse(after.meta.find(r=>r.key===HALLOWEEN_PACK_KEY).value);
 assert.equal(settings.revision,2);assert.deepEqual({...settings.settings,stockLimits:f.settings.stockLimits},f.settings);
 for(const row of after.stock){const old=before.stock.find(s=>s.code===row.code);assert.equal(row.issued,old.issued);if(codes.includes(row.code))assert.equal(Number(row.stock_limit),10);else assert.deepEqual(row,old);}
 assert.deepEqual(after.holdings,before.holdings);assert.equal(after.audit.length,1);
 assert.equal((await increaseHalloweenSsStock(f.pg)).replayed,true);assert.deepEqual(await snapshot(f),after);
 assert.equal(after.meta.filter(r=>r.key===HALLOWEEN_SS_STOCK_PLUS5_KEY).length,1);
});

test('an exhausted SS receives exactly serials six through ten after expansion; the next request never charges',async t=>{
 const f=await original(t);await f.pg.query("UPDATE mercenary_limited_stock_v1 SET issued=5 WHERE code='V-980'");
 await increaseHalloweenSsStock(f.pg);const coin=await f.coin(),serials=[];
 for(let i=0;i<5;i++)serials.push((await f.service.open(f.env,f.user,{...f.body(),expectedRevision:2})).draws[0].serial);
 assert.deepEqual(serials,[6,7,8,9,10]);assert.equal(await f.coin(),coin-500);
 await assert.rejects(f.service.open(f.env,f.user,{...f.body(),expectedRevision:2}),e=>e.code==='MERCENARY_HALLOWEEN_NOT_READY');
 assert.equal(await f.coin(),coin-500);assert.equal((await f.state()).stock.find(s=>s.code==='V-980').remaining,0);
});
