import test from 'node:test';
import assert from 'node:assert/strict';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {BLOODMOON_PACK_KEY,bloodmoonPackDraft,readBloodmoonPackSettings,validateBloodmoonPack} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {OP,prepareStockIncrease,increaseStock,inspect} from '../scripts/ops/bloodmoon-eunseol-plus1-20261025.mjs';
const tables=['users','user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','inventory_logs','coin_logs','joint_operations_v1'];
const snapshot=async f=>{const out={};for(const t of ['app_meta','mercenary_limited_stock_v1','admin_logs',...tables])out[t]=(await f.pg.query('SELECT * FROM '+t+' ORDER BY 1,2')).rows;return out;};
async function setup(t){
 const f=await bloodmoonFixture(t);await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER';ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE';UPDATE users SET role='OWNER' WHERE id=1;ALTER TABLE app_meta ADD COLUMN updated_at TEXT;UPDATE mercenary_limited_stock_v1 SET stock_limit=3 WHERE code='V-973'");
 f.settings.stockLimits['V-973']=3;f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(c=>[c,c==='V-973'?1000000:0]));await f.configure(8);
 await f.pg.query("INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-973',1,0,'direct-gift','direct-gift')");
 for(let i=1;i<=3;i++){const r=await f.service.open(f.env,f.user,{...f.body(),expectedRevision:8});assert.equal(r.draws[0].serial,i);}
 const read=await inspect(f.pg);return {...f,options:{expectedDocumentHash:read.documentHash}};
}
test('Eunseol four-copy policy reads the old three-copy document unchanged and updates only its limit',()=>{
 const now=bloodmoonPackDraft();assert.equal(now.stockLimits['V-973'],4);const old=structuredClone(now);old.stockLimits['V-973']=3;const before=structuredClone(old);
 assert.deepEqual(readBloodmoonPackSettings(old),old);assert.deepEqual(old,before);assert.throws(()=>validateBloodmoonPack(old),/한도/);assert.deepEqual(prepareStockIncrease(old),now);
 assert.throws(()=>prepareStockIncrease(now),/Reviewed limit changed/);
});
test('one added capacity preserves rates, accounts, existing serials and other stock; replay performs SELECT only',async t=>{
 const f=await setup(t),before=await snapshot(f);const dry=await increaseStock(f.pg,f.options);assert(dry.dryRun);assert.deepEqual(await snapshot(f),before);
 const r=await increaseStock(f.pg,{...f.options,dryRun:false}),after=await snapshot(f);assert.equal(r.currentRevision,9);assert.equal(r.receipt.stockAdded,1);assert.equal(r.receipt.grants,0);assert.equal(r.stock[0].remaining,1);
 for(const table of tables)assert.deepEqual(after[table],before[table],table);
 const restored=structuredClone(r.receipt.after.settings);restored.stockLimits['V-973']=3;assert.deepEqual(restored,r.receipt.before.settings);
 assert.deepEqual(after.mercenary_limited_stock_v1,before.mercenary_limited_stock_v1.map(s=>s.code==='V-973'?{...s,stock_limit:4,revision:s.revision+1}:s));
 assert.deepEqual(after.app_meta.filter(r=>![OP,BLOODMOON_PACK_KEY].includes(r.key)),before.app_meta.filter(r=>r.key!==BLOODMOON_PACK_KEY));
 const readonly={query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return f.pg.query(sql,args);}};assert((await increaseStock(readonly)).replayed);assert.deepEqual(await snapshot(f),after);
 const coin=await f.coin(),body={...f.body(10),expectedRevision:9},receipt=await f.service.open(f.env,f.user,body);assert.equal(receipt.draws[0].mercenaryCode,'V-973');assert.equal(receipt.draws[0].serial,4);assert(receipt.draws.slice(1).every(d=>d.edition==='STANDARD'));assert.deepEqual((await f.service.open(f.env,f.user,body)).draws,receipt.draws);assert.equal(await f.coin(),coin-900);
});
test('failed audit or changed settings roll back the stock increment and leave accounts untouched',async t=>{
 const f=await setup(t),before=await snapshot(f);await assert.rejects(increaseStock(f.pg,{dryRun:false,expectedDocumentHash:'stale'}),/Pack settings changed/);assert.deepEqual(await snapshot(f),before);
 const fail={query:(sql,args)=>{if(sql.startsWith('INSERT INTO admin_logs'))throw Error('INJECTED');return f.pg.query(sql,args);}};
 await assert.rejects(increaseStock(fail,{...f.options,dryRun:false}),/INJECTED/);assert.deepEqual(await snapshot(f),before);
});
