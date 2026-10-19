import test from 'node:test';import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK_KEY,halloweenEffectivePercent,pickHalloweenBatch,readHalloweenPackSettings} from '../shared/mercenary-halloween-pack-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {limitedRateUnits} from '../shared/mercenary-limited-rates-v1.mjs';
import {registerBathory,documentHash} from '../scripts/ops/bathory-registration-20261019.mjs';
import {prepareHalloweenBathoryLaunch,launchHalloweenBathory,verifyHalloweenBathoryLaunch,ORIGINAL_CODES} from '../scripts/ops/halloween-bathory-launch-20261019.mjs';
const snapshot=async f=>{const result={};for(const table of ['app_meta','mercenary_limited_stock_v1','user_mercenary_cards_v1','mercenary_limited_issues_v1','cnine_user_inventory','admin_logs'])result[table]=(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return result;};
async function registered(t){
 const f=await halloweenFixture(t);await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; UPDATE users SET role='OWNER' WHERE id=1; ALTER TABLE app_meta ADD COLUMN updated_at TEXT;");
 for(const code of ORIGINAL_CODES){f.settings.stockLimits[code]=10;await f.pg.query('UPDATE mercenary_limited_stock_v1 SET stock_limit=10,issued=10,revision=11 WHERE code=$1',[code]);}
 f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,ORIGINAL_CODES.includes(code)?10000:code==='V-977'?0:code==='V-989'?50:100]));f.settings.normalSssRatePpm=929750;
 delete f.settings.cardRatesPpm['V-977'];delete f.settings.stockLimits['V-977'];await f.configure(13);await f.pg.query("DELETE FROM mercenary_limited_stock_v1 WHERE code='V-977'");
 const raw=(await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).rows[0].value;
 await registerBathory(f.pg,{dryRun:false,releaseApproved:true,approvalReference:'ISOLATED_TEST',expectedDocumentHash:documentHash(raw)});
 const stored=(await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).rows[0].value;
 return {...f,document:JSON.parse(stored),options:{expectedDocumentHash:documentHash(stored),approvalReference:'ISOLATED_TEST'}};
}
test('Bathory gets half of each original SS rate from ordinary SSS remainder; only reviewed exhausted stock gains one',async t=>{
 const f=await registered(t),before=await snapshot(f),next=prepareHalloweenBathoryLaunch(f.document.settings,before.mercenary_limited_stock_v1);
 assert.equal(next.cardRatesPpm['V-977'],5000);assert.equal(next.normalSssRatePpm,924750);
 assert.equal(halloweenEffectivePercent(500,10000),'0.0005');assert.equal(halloweenEffectivePercent(500,next.cardRatesPpm['V-977']),'0.00025');
 const compared=structuredClone(next);compared.cardRatesPpm['V-977']=0;compared.normalSssRatePpm=929750;for(const code of ORIGINAL_CODES)compared.stockLimits[code]=10;assert.deepEqual(compared,f.document.settings);
 for(const state of ['not-sold-out','different-odds','operator-off']){
  const settings=structuredClone(f.document.settings),stock=structuredClone(before.mercenary_limited_stock_v1);
  if(state==='not-sold-out')stock.find(s=>s.code==='V-980').issued=9;
  if(state==='different-odds')settings.cardRatesPpm['V-980']=9999;
  if(state==='operator-off')settings.mode='OFF';
  assert.throws(()=>prepareHalloweenBathoryLaunch(settings,stock));
 }
 await assert.rejects(launchHalloweenBathory(f.pg,{...f.options,expectedDocumentHash:'stale'}),/changed/);assert.deepEqual(await snapshot(f),before);
 await launchHalloweenBathory(f.pg,f.options);assert.deepEqual(await snapshot(f),before);
 const failing={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('INJECTED')):f.pg.query(sql,args)};
 await assert.rejects(launchHalloweenBathory(failing,f.options),/INJECTED/);assert.deepEqual(await snapshot(f),before);
 const result=await launchHalloweenBathory(f.pg,{...f.options,dryRun:false});assert.equal(result.receipt.totalAdded,7);assert.equal(result.currentRevision,15);
 const after=await snapshot(f);for(const table of ['user_mercenary_cards_v1','mercenary_limited_issues_v1','cnine_user_inventory'])assert.deepEqual(after[table],before[table]);
 for(const stock of result.stock){const old=before.mercenary_limited_stock_v1.find(s=>s.code===stock.code);assert.equal(stock.issued,Number(old.issued));assert.equal(stock.stock_limit,Number(old.stock_limit)+(ORIGINAL_CODES.includes(stock.code)?1:0));}
 const state=await f.state();assert(state.userOpeningEnabled);assert.equal(state.stock.find(s=>s.code==='V-977').remaining,10);assert(ORIGINAL_CODES.every(code=>state.stock.find(s=>s.code===code).remaining===1));
 const index=HALLOWEEN_PACK_CARDS.findIndex(c=>c.code==='V-977'),start=HALLOWEEN_PACK_CARDS.slice(0,index).reduce((n,c)=>n+limitedRateUnits(state.settings.cardRatesPpm[c.code]),0),size=limitedRateUnits(5000);
 for(const ticket of [start,start+size-1]){const samples=[0,ticket];assert.equal(pickHalloweenBatch(state,1,()=>samples.shift())[0].mercenaryCode,'V-977');}
 const purchase={...f.body(),expectedRevision:15},draw=await f.service.open(f.env,f.user,purchase);assert.equal(draw.draws[0].serial,11);assert.equal(draw.draws[0].mercenaryCode,'V-980');
 const used=await snapshot(f);assert.equal((await launchHalloweenBathory(f.pg,{...f.options,dryRun:false})).replayed,true);assert.deepEqual(await snapshot(f),used);await verifyHalloweenBathoryLaunch(f.pg);
 assert.equal((await f.state()).stock.find(s=>s.code==='V-980').remaining,0);assert.deepEqual((await f.service.open(f.env,f.user,purchase)).draws,draw.draws);
 assert.equal(readHalloweenPackSettings(state.settings).stockLimits['V-977'],10);
});
