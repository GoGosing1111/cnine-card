import test from 'node:test';
import assert from 'node:assert/strict';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {BLOODMOON_MERCENARIES} from '../shared/mercenary-bloodmoon-catalog-v1.mjs';
import {BLOODMOON_PACK_KEY,bloodmoonPackDraft,legacyBloodmoonPackDraft,readBloodmoonPackSettings,validateBloodmoonPack} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {OP,TARGETS,documentHash,prepareStockIncrease,increaseStock,verify} from '../scripts/ops/bloodmoon-restock-ss5-leonel2-20261025.mjs';

const accountTables=['user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','inventory_logs','coin_logs','users','joint_operations_v1'];
const snapshot=async f=>{
 const result={};for(const table of ['app_meta','mercenary_limited_stock_v1','admin_logs',...accountTables])result[table]=(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return result;
};
async function setup(t){
 const f=await bloodmoonFixture(t);
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER';ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE';UPDATE users SET role='OWNER' WHERE id=1;ALTER TABLE app_meta ADD COLUMN updated_at TEXT");
 for(const target of TARGETS){f.settings.stockLimits[target.code]=target.before;await f.pg.query('UPDATE mercenary_limited_stock_v1 SET stock_limit=$1 WHERE code=$2',[target.before,target.code]);}
 await f.pg.query("INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(1,'V-978',1,0,'direct-before','direct-before')");
 // Exhaust the genuine old SS and pack-only Leonel serials using the real opening service.
 for(const target of TARGETS){
  f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(c=>[c,c===target.code?1000000:0]));await f.configure(10);
  for(let offset=0;offset<target.before;){const count=target.before-offset>=10?10:1;const result=await f.service.open(f.env,f.user,{...f.body(count),expectedRevision:10});assert.deepEqual(result.draws.map(d=>d.serial),Array.from({length:count},(_,i)=>i+1+offset));offset+=count;}
 }
 await f.setting('mercenary_halloween_ss_pack_v1',{preserve:'halloween'});await f.setting('mercenary_prime_craft_v1',{enabled:false,price:null});
 const raw=(await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[BLOODMOON_PACK_KEY])).rows[0].value;
 return {...f,raw,document:JSON.parse(raw),options:{expectedDocumentHash:documentHash(raw)}};
}

test('SS30 and Leonel7 policy preserves other SSS limits and reads the prior 25/5 policy without mutation',()=>{
 const draft=bloodmoonPackDraft();assert.equal(BLOODMOON_MERCENARIES.length,6);assert(BLOODMOON_MERCENARIES.every(c=>c.serverLimit===30));
 assert.deepEqual(Object.fromEntries(['V-978','V-974','V-975'].map(c=>[c,draft.stockLimits[c]])),{'V-978':7,'V-974':3,'V-975':3});
 const old=structuredClone(draft);for(const t of TARGETS)old.stockLimits[t.code]=t.before;const unchanged=structuredClone(old);
 assert.deepEqual(readBloodmoonPackSettings(old),old);assert.deepEqual(old,unchanged);assert.throws(()=>validateBloodmoonPack(old),/한도/);
 const next=prepareStockIncrease(old);assert.deepEqual(next,draft);assert.deepEqual(old,unchanged);
 const mixed=structuredClone(old);mixed.stockLimits['V-960']=30;assert.throws(()=>readBloodmoonPackSettings(mixed),/한도/);
 const legacy=legacyBloodmoonPackDraft();assert(Object.values(legacy.stockLimits).every(v=>v===10));const read=readBloodmoonPackSettings(legacy);assert(TARGETS.filter(t=>t.code!=='V-978').every(t=>read.stockLimits[t.code]===10));assert.equal(read.mode,'OFF');
 const codex=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1}));assert(TARGETS.filter(t=>t.code!=='V-978').every(t=>codex.cards.find(c=>c.code===t.code).serverLimit===30));
 const invalid=structuredClone(old);invalid.stockLimits['V-978']=6;assert.throws(()=>readBloodmoonPackSettings(invalid),/한도/);
});

test('dry run and stale review preserve every stock row, account, issue, receipt and configuration',async t=>{
 const f=await setup(t),before=await snapshot(f);assert.equal((await f.state()).userOpeningEnabled,true);
 await assert.rejects(increaseStock(f.pg,{...f.options,expectedDocumentHash:'stale',dryRun:false}),/Pack settings changed/);assert.deepEqual(await snapshot(f),before);
 const result=await increaseStock(f.pg,f.options);assert.equal(result.verified,true);assert.equal(result.receipt.stockAdded,32);assert.equal(result.dryRun,true);assert.deepEqual(await snapshot(f),before);
});

test('failure midway through stock, settings, audit or operation receipt rolls back atomically',async t=>{
 const f=await setup(t),before=await snapshot(f);
 for(const failure of [{prefix:'UPDATE mercenary_limited_stock_v1',occurrence:4},{prefix:'UPDATE app_meta',occurrence:1},{prefix:'INSERT INTO admin_logs',occurrence:1},{prefix:'INSERT INTO app_meta',occurrence:1}]){
  let matched=0;const failing={query:(sql,args)=>sql.startsWith(failure.prefix)&&++matched===failure.occurrence?Promise.reject(Error('INJECTED_FAILURE')):f.pg.query(sql,args)};
  await assert.rejects(increaseStock(failing,{...f.options,dryRun:false}),/INJECTED_FAILURE/);assert.equal(matched,failure.occurrence);assert.deepEqual(await snapshot(f),before);
 }
});

test('adds exactly 32 capacity once, preserves holdings, direct Leonel gifts and all other policies, and replays using reads only',async t=>{
 const f=await setup(t),before=await snapshot(f),result=await increaseStock(f.pg,{...f.options,dryRun:false}),after=await snapshot(f);
 assert.equal(result.currentRevision,11);assert.equal(result.receipt.stockAdded,32);assert.equal(result.receipt.grants,0);
 assert(result.stock.every(s=>s.issued===s.before&&s.remaining===s.after-s.before));assert.equal(result.stock.find(s=>s.code==='V-978').remaining,2);
 for(const table of accountTables)assert.deepEqual(after[table],before[table],table);
 assert.deepEqual(after.mercenary_limited_stock_v1,before.mercenary_limited_stock_v1.map(s=>TARGETS.some(t=>t.code===s.code)?{...s,stock_limit:TARGETS.find(t=>t.code===s.code).after,revision:s.revision+1}:s));
 assert.deepEqual(after.app_meta.filter(r=>![OP,BLOODMOON_PACK_KEY].includes(r.key)),before.app_meta.filter(r=>r.key!==BLOODMOON_PACK_KEY));
 const normalized=structuredClone(result.receipt.after.settings);normalized.stockLimits=result.receipt.before.settings.stockLimits;assert.deepEqual(normalized,result.receipt.before.settings);
 assert.equal(after.admin_logs.length,before.admin_logs.length+1);assert.equal((await verify(f.pg)).verified,true);
 const noWrites={query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return f.pg.query(sql,args);}};
 assert.equal((await increaseStock(noWrites,{dryRun:false})).replayed,true);assert.deepEqual(await snapshot(f),after);
});

test('real openings continue Leonel serials 6/7 and SS serials 26..30, then fall back without replay charges',async t=>{
 const f=await setup(t),restock=await increaseStock(f.pg,{...f.options,dryRun:false}),coin=await f.coin();
 await assert.rejects(f.service.open(f.env,f.user,{...f.body(),expectedRevision:10}),e=>e.code==='MERCENARY_BLOODMOON_CHANGED');assert.equal(await f.coin(),coin);
 const body={...f.body(10),expectedRevision:11},result=await f.service.open(f.env,f.user,body);
 assert(result.draws.slice(0,2).every(d=>d.mercenaryCode==='V-978'));assert.deepEqual(result.draws.slice(0,2).map(d=>d.serial),[6,7]);assert(result.draws.slice(2).every(d=>d.outcomeId==='CARD_SSS'));
 assert.deepEqual((await f.service.open(f.env,f.user,body)).draws,result.draws);
 Object.assign(f.settings,restock.receipt.after.settings);f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(c=>[c,c==='V-965'?1000000:0]));await f.configure(12);
 const ssBody={...f.body(10),expectedRevision:12},ss=await f.service.open(f.env,f.user,ssBody);
 assert(ss.draws.slice(0,5).every(d=>d.mercenaryCode==='V-965'));assert.deepEqual(ss.draws.slice(0,5).map(d=>d.serial),[26,27,28,29,30]);assert(ss.draws.slice(5).every(d=>d.outcomeId==='CARD_SSS'));
 assert.deepEqual((await f.service.open(f.env,f.user,ssBody)).draws,ss.draws);assert.equal((await verify(f.pg)).verified,true);
});

test('inconsistent counters and serials are rejected before any committed change',async t=>{
 const f=await setup(t);await f.pg.query("UPDATE mercenary_limited_stock_v1 SET issued=19 WHERE code='V-960'");const before=await snapshot(f);
 await assert.rejects(increaseStock(f.pg,{...f.options,dryRun:false}),/Counter must match genuine issues/);assert.deepEqual(await snapshot(f),before);
});
