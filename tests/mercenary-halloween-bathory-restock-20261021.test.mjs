import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK_KEY,readHalloweenPackSettings,validateHalloweenPack,halloweenEffectivePercent} from '../shared/mercenary-halloween-pack-v1.mjs';
import {BATHORY_SERVER_LIMIT,BATHORY_DESCRIPTION} from '../shared/mercenary-bathory-v1.mjs';
import {prepareHalloweenJokroLaunch} from '../scripts/ops/halloween-jokro-launch-20261021.mjs';
import {documentHash,prepareBathoryRestock,restockBathory,verifyBathoryRestock} from '../scripts/ops/halloween-bathory-restock-20261021.mjs';
const snapshot=async f=>{const result={};for(const table of ['app_meta','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','cnine_user_inventory','admin_logs'])result[table]=(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return result;};
async function soldOut(t){
 const f=await halloweenFixture(t);
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; UPDATE users SET role='OWNER' WHERE id=1; ALTER TABLE app_meta ADD COLUMN updated_at TEXT; UPDATE mercenary_limited_stock_v1 SET stock_limit=10,issued=10,revision=10 WHERE code='V-977'; UPDATE mercenary_limited_stock_v1 SET stock_limit=15,issued=14 WHERE code='V-996'; UPDATE mercenary_limited_stock_v1 SET stock_limit=8,issued=8 WHERE code='V-999'");
 f.settings.stockLimits['V-977']=10;
 f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,code==='V-977'?1000000:0]));
 await f.configure(17);
 const raw=(await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).rows[0].value;
 return {...f,document:JSON.parse(raw),options:{expectedDocumentHash:documentHash(raw),approvalReference:'ISOLATED_TEST'}};
}
test('only Bathory limit changes to fifteen; the ten-copy rollout and prior Jokro audit remain readable',async t=>{
 const f=await soldOut(t),state=await f.state();assert(state.userOpeningEnabled);assert.equal(state.stock.find(s=>s.code==='V-977').remaining,0);
 assert.equal(readHalloweenPackSettings(f.document.settings).stockLimits['V-977'],10);
 assert.throws(()=>validateHalloweenPack(f.document.settings));assert.equal(BATHORY_SERVER_LIMIT,15);assert.match(BATHORY_DESCRIPTION,/15장 한정/);
 const next=prepareBathoryRestock(f.document.settings);next.stockLimits['V-977']=10;assert.deepEqual(next,f.document.settings);
 const prior=JSON.parse(fs.readFileSync('docs/qa/halloween-jokro-launch-20261021/apply.json','utf8')).receipt;
 assert.deepEqual(prepareHalloweenJokroLaunch(prior.before.settings,prior.beforeStock),prior.after.settings);
 const real=prepareBathoryRestock(prior.after.settings);
 assert.equal(real.cardRatesPpm['V-977'],5000);assert.equal(halloweenEffectivePercent(real.normalRankRatesPpm.SSS,5000),'0.00025');
 assert.equal(real.cardRatesPpm['V-979'],real.cardRatesPpm['V-989']);assert.equal(real.stockLimits['V-979'],3);
 for(const limit of [5,11,14,16])assert.throws(()=>validateHalloweenPack({...real,stockLimits:{...real.stockLimits,'V-977':limit}}));
});
test('restock preserves all holdings, odds and other counters; stale input and transactional failures roll back',async t=>{
 const f=await soldOut(t),before=await snapshot(f);
 await assert.rejects(restockBathory(f.pg,{...f.options,expectedDocumentHash:'stale'}),/changed/);assert.deepEqual(await snapshot(f),before);
 await restockBathory(f.pg,f.options);assert.deepEqual(await snapshot(f),before);
 for(const prefix of ['UPDATE mercenary_limited_stock','UPDATE app_meta','INSERT INTO admin_logs','INSERT INTO app_meta']){
  const failing={query:(sql,args)=>sql.startsWith(prefix)?Promise.reject(Error('INJECTED')):f.pg.query(sql,args)};
  await assert.rejects(restockBathory(failing,{...f.options,dryRun:false}),/INJECTED/);assert.deepEqual(await snapshot(f),before);
 }
 const result=await restockBathory(f.pg,{...f.options,dryRun:false});assert.equal(result.currentRevision,18);assert.equal(result.receipt.stockAdded,5);
 const after=await snapshot(f);
 for(const table of ['user_mercenary_cards_v1','mercenary_limited_issues_v1','cnine_user_inventory'])assert.deepEqual(after[table],before[table]);
 assert.deepEqual(after.mercenary_limited_stock_v1.filter(s=>s.code!=='V-977'),before.mercenary_limited_stock_v1.filter(s=>s.code!=='V-977'));
 assert.equal((await f.state()).stock.find(s=>s.code==='V-977').remaining,5);
 const readOnly={query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql));return f.pg.query(sql,args);}};
 assert.equal((await restockBathory(readOnly,{...f.options,dryRun:false})).replayed,true);assert.deepEqual(await snapshot(f),after);
});
test('five added copies continue serials 11–15; retry, failure and concurrent last-slot requests cannot overissue',async t=>{
 const f=await soldOut(t);await restockBathory(f.pg,{...f.options,dryRun:false});
 const body=()=>({...f.body(),expectedRevision:18}),firstBody=body();
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,{id:2},firstBody),/INJECTED/);f.fail('');
 assert.equal((await f.state()).stock.find(s=>s.code==='V-977').issued,10);assert.equal(await f.coin(2),1000000);
 const first=await f.service.open(f.env,{id:2},firstBody);assert.equal(first.draws[0].serial,11);assert.equal((await f.service.open(f.env,{id:2},firstBody)).replayed,true);
 for(const [id,serial] of [[3,12],[4,13],[5,14]])assert.equal((await f.service.open(f.env,{id},body())).draws[0].serial,serial);
 const last=await Promise.all([2,3].map(id=>f.service.open(f.env,{id},body())));
 assert.equal(last.filter(r=>r.draws[0].mercenaryCode==='V-977').length,1);assert.equal(last.find(r=>r.draws[0].mercenaryCode==='V-977').draws[0].serial,15);
 assert.equal(last.filter(r=>r.draws[0].outcomeId==='CARD_SSS').length,1);
 const state=await f.state();assert.equal(state.stock.find(s=>s.code==='V-977').remaining,0);assert.equal(state.stock.find(s=>s.code==='V-996').remaining,1);
 assert.equal(state.stock.find(s=>s.code==='V-979').remaining,3);assert.equal(state.currentRates.cardRatesPpm['V-977'],0);
 const before=await snapshot(f);assert.equal((await restockBathory(f.pg,{...f.options,dryRun:false})).replayed,true);assert.deepEqual(await snapshot(f),before);await verifyBathoryRestock(f.pg);
});
