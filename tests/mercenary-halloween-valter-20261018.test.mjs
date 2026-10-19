import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK_KEY,readHalloweenPackSettings,halloweenReceiptResults,pickHalloweenBatch} from '../shared/mercenary-halloween-pack-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {limitedRateUnits} from '../shared/mercenary-limited-rates-v1.mjs';
import {halloweenCollectionMarkup,halloweenRoomMarkup} from '../js/mercenary-halloween-presentation-v2.mjs';
import {OPERATION_KEY,addValterToHalloweenSettings,documentHash,applyHalloweenValter} from '../scripts/ops/halloween-valter-addition-20261018.mjs';

async function previousSettings(t){
 const f=await halloweenFixture(t);
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; UPDATE users SET role='OWNER' WHERE id=1; ALTER TABLE app_meta ADD COLUMN updated_at TEXT;");
 f.settings.cardRatesPpm=Object.fromEntries(HALLOWEEN_PACK_CARDS.filter(c=>c.code!=='V-996').map(c=>[c.code,c.code==='V-977'?0:c.rank==='SS'?10000:c.code==='V-999'?100:50]));
 delete f.settings.stockLimits['V-996'];f.settings.normalSssRatePpm=929850;
 await f.configure(12);return f;
}

test('existing ON document is readable with Valter zero; equal Helios odds move only the normal SSS remainder',async t=>{
 const f=await previousSettings(t),old=structuredClone(f.settings),read=readHalloweenPackSettings(old);
 assert.equal(read.mode,'ON');assert.equal(read.cardRatesPpm['V-996'],0);assert.equal(read.stockLimits['V-996'],null);assert.equal((await f.state()).userOpeningEnabled,true);
 const next=addValterToHalloweenSettings(old);assert.equal(next.cardRatesPpm['V-996'],100);assert.equal(next.cardRatesPpm['V-999'],100);assert.equal(next.normalSssRatePpm,929750);
 const compared=structuredClone(next);delete compared.cardRatesPpm['V-996'];delete compared.stockLimits['V-996'];compared.normalSssRatePpm=old.normalSssRatePpm;assert.deepEqual(compared,old);assert.deepEqual(f.settings,old);
 Object.assign(f.settings,next);await f.configure(13);const state=await f.state();assert.equal(state.effectiveCardPercents['V-996'],state.effectiveCardPercents['V-999']);
 for(const code of ['V-999','V-996']){
  const index=HALLOWEEN_PACK_CARDS.findIndex(c=>c.code===code),start=HALLOWEEN_PACK_CARDS.slice(0,index).reduce((n,c)=>n+limitedRateUnits(next.cardRatesPpm[c.code]),0),size=limitedRateUnits(next.cardRatesPpm[code]);
  for(const ticket of [start,start+size-1]){const samples=[0,ticket];assert.equal(pickHalloweenBatch(state,1,()=>samples.shift())[0].mercenaryCode,code);}
 }
 const markup=halloweenCollectionMarkup(state.cards,state.stock)+halloweenRoomMarkup(state.pack);
 assert.match(markup,/발테르/);assert.equal((markup.match(/data-hwp-stock-code=/g)||[]).length,HALLOWEEN_PACK_CARDS.length);assert.match(markup,/남은 \d+장/);assert.equal((markup.match(/data-code="V-996"/g)||[]).length,1);
});

test('settings operation rolls back every write, preserves inventory/stock, and replays without writes',async t=>{
 const f=await previousSettings(t),snapshot=async()=>{
  const data={};for(const table of ['app_meta','admin_logs','mercenary_limited_stock_v1','users','user_mercenary_cards_v1','cnine_user_inventory'])data[table]=(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return data;
 };
 const before=await snapshot(),raw=before.app_meta.find(s=>s.key===HALLOWEEN_PACK_KEY).value,opts={expectedDocumentHash:documentHash(raw)};
 await applyHalloweenValter(f.pg,opts);assert.deepEqual(await snapshot(),before);
 for(let at=1;at<=3;at++){
  let n=0;const fail={query:(sql,args)=>{if(/^(INSERT|UPDATE)/.test(sql)&&++n===at)throw Error('INJECTED');return f.pg.query(sql,args);}};
  await assert.rejects(applyHalloweenValter(fail,{...opts,dryRun:false}),/INJECTED/);assert.deepEqual(await snapshot(),before);
 }
 await assert.rejects(applyHalloweenValter(f.pg,{expectedDocumentHash:'wrong',dryRun:false}),/Reviewed settings changed/);
 const applied=await applyHalloweenValter(f.pg,{...opts,dryRun:false});assert.equal(applied.receipt.after.revision,13);
 const after=await snapshot();for(const table of ['mercenary_limited_stock_v1','users','user_mercenary_cards_v1','cnine_user_inventory'])assert.deepEqual(after[table],before[table]);
 const noWrites={query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql));return f.pg.query(sql,args);}};
 assert.equal((await applyHalloweenValter(noWrites,{...opts,dryRun:false})).replayed,true);assert.deepEqual(await snapshot(),after);assert.equal(after.app_meta.filter(s=>s.key===OPERATION_KEY).length,1);
});

test('Valter uses the existing last serial once; rollback/retry and concurrent buyers cannot duplicate or overcharge',async t=>{
 const f=await halloweenFixture(t);
 f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(c=>[c,c==='V-996'?1000000:0]));await f.configure();
 await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET stock_limit=12,issued=11 WHERE code='V-996'");
 const before=await f.coin(),body=f.body();f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(f.service.open(f.env,f.user,body),/INJECTED/);f.fail('');assert.equal(await f.coin(),before);assert.equal((await f.state()).stock.find(s=>s.code==='V-996').issued,11);
 const results=await Promise.all([f.service.open(f.env,f.user,body),f.service.open(f.env,{id:2},f.body())]);
 const result=results.find(r=>r.draws[0].mercenaryCode==='V-996');assert.equal(result.draws[0].serial,12);assert.equal(result.draws[0].rank,'SSS');assert.match(halloweenReceiptResults(result)[0].artUrl,/v-996-640/);assert.equal(results.filter(r=>r.draws[0].outcomeId==='CARD_SSS').length,1);
 assert.equal((await f.service.receipt(f.env,{id:result.accountId},result.requestId)).replayed,true);
 assert.equal(await f.coin()+await f.coin(2),1999800);assert.equal((await f.state()).stock.find(s=>s.code==='V-996').remaining,0);
 assert.equal((await f.pg.query("SELECT COUNT(*)::int AS count FROM mercenary_limited_issues_v1 WHERE code='V-996'")).rows[0].count,1);
 assert.equal((await f.service.open(f.env,{id:3},f.body())).draws[0].outcomeId,'CARD_SSS');assert.equal(await f.coin(3),999900);
});
