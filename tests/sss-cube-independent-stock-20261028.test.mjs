import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {SSS_CUBE_LIMITED_CODES,sssCubeStockCode} from '../shared/sss-miracle-cube-stock-v1.mjs';
import {SSS_CUBE_TOTAL,validateSssCubePolicy} from '../shared/sss-miracle-cube-v1.mjs';
import {SSS_CUBE_KEY,ensureSssCubeCatalog,sssCubeState,saveSssCubePolicy,openSssCube,sssCubeReceipt} from '../functions/_sss_miracle_cube.js';
import {readJinmuPackOwners} from '../functions/_mercenary_jinmu_access.js';
import {readJokroPackOwners} from '../functions/_mercenary_jokro_access.js';
import {applySssCubeIndependentStock,OPERATION_KEY} from '../scripts/ops/sss-cube-independent-stock-20261028.mjs';
async function setup(t,postgres=false){
 const f=await mercenaryFixture(t,{postgres});await ensureLimitedPackSchema(f.env);await ensureSssCubeCatalog(f.env);
 await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'SSS_MIRACLE_CUBE',40,40)").run();
 for(const code of SSS_CUBE_LIMITED_CODES){await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES(?,5,0)',sssCubeStockCode(code)).run();await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES(?,3,3)',code).run();}
 const save=async(code,overrides={})=>{const state=await sssCubeState(f.env,f.user);return saveSssCubePolicy(f.env,f.user,{requestId:crypto.randomUUID(),revision:state.revision,policy:{...state.policy,mode:'ON',cards:{[code]:SSS_CUBE_TOTAL},...overrides}});};
 const open=async(options={})=>openSssCube(f.env,f.user,{requestId:crypto.randomUUID(),expectedRevision:(await sssCubeState(f.env,f.user)).revision,count:1,...options},{randomInt:()=>0});
 return {...f,save,open};
}
for(const postgres of [false,true])test('eight cube-only stocks ignore sold-out packs, retain probabilities and award actual mercenaries '+postgres,async t=>{
 const f=await setup(t,postgres),before=(await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code NOT LIKE 'SSS_MIRACLE_CUBE:%' ORDER BY code").all()).results;
 const state=await sssCubeState(f.env,f.user);assert.deepEqual(state.catalog.filter(c=>c.limited&&c.available).map(c=>c.code).sort(),[...SSS_CUBE_LIMITED_CODES].sort());
 for(const code of SSS_CUBE_LIMITED_CODES){await f.save(code);const r=await f.open();assert.equal(r.draws[0].mercenaryCode,code);assert.equal(r.draws[0].serial,1);assert.equal(r.draws[0].stockScope,'SSS_MIRACLE_CUBE');assert.equal(Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?',code).first()).total_copies),1);}
 assert.deepEqual((await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code NOT LIKE 'SSS_MIRACLE_CUBE:%' ORDER BY code").all()).results,before);
 for(const code of ['V-976','V-987','V-988'])assert.equal(state.catalog.find(c=>c.code===code)?.available??false,false);
 assert.equal(await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='PRIME_REQUIEM_DRAINED_CARD'").first(),null);
 assert.equal((await readJinmuPackOwners(f.env,[7])).has(7),true);assert.equal((await readJokroPackOwners(f.env,[7])).has(7),true);
});
test('CMS limits and odds save together, cannot lower below issued, and stock edits roll back on audit failure',async t=>{
 const f=await setup(t,true);await f.save('V-973');await f.open();let state=await sssCubeState(f.env,f.user);
 await assert.rejects(f.save('V-973',{stockLimits:{...state.policy.stockLimits,'V-973':0}}),{code:'SSS_CUBE_POLICY'});
 assert.throws(()=>validateSssCubePolicy({...state.policy,stockLimits:{'V-976':5}},state.catalog));
 const before=(await f.p('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code').all()).results,raw=(await f.p('SELECT value FROM app_meta WHERE key=?',SSS_CUBE_KEY).first()).value;
 f.fail('INSERT INTO admin_logs');await assert.rejects(f.save('V-973',{stockLimits:{...state.policy.stockLimits,'V-973':8}}));f.fail('');
 assert.deepEqual((await f.p('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code').all()).results,before);assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',SSS_CUBE_KEY).first()).value,raw);
 await f.save('V-973',{stockLimits:{...state.policy.stockLimits,'V-973':8}});state=await sssCubeState(f.env,f.user);assert.equal(state.catalog.find(c=>c.code==='V-973').remaining,7);assert.equal(state.policy.cards['V-973'],SSS_CUBE_TOTAL);
});
test('pack consumption cannot consume cube capacity; ten-draw shortage leaves all balances intact',async t=>{
 const f=await setup(t);await f.save('V-996');const before=(await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='SSS_MIRACLE_CUBE'").first()).quantity;
 await assert.rejects(f.open({count:10}),{code:'SSS_CUBE_STOCK'});assert.equal((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='SSS_MIRACLE_CUBE'").first()).quantity,before);
 const db=f.env.DB,batch=db.batch.bind(db);let raced=false;db.batch=async statements=>{if(!raced&&statements.some(s=>s.source.startsWith('UPDATE mercenary_limited_stock_v1'))){raced=true;await f.p("UPDATE mercenary_limited_stock_v1 SET issued=2 WHERE code='V-996'").run();}return batch(statements);};
 assert.equal((await f.open()).draws[0].serial,1);assert.equal((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-996'").first()).issued,2);
});
test('legacy completed receipts stay readable; legacy pending plans cannot charge shared stock',async t=>{
 const f=await setup(t);await f.save('V-996');const paid=await f.open();
 const row=await f.p('SELECT plan_json FROM joint_operations_v1 WHERE request_id=?',paid.requestId).first(),plan=JSON.parse(row.plan_json);delete plan.draws[0].stockCode;delete plan.draws[0].stockScope;plan.draws[0].stockLimit=3;
 await f.p('UPDATE joint_operations_v1 SET plan_json=? WHERE request_id=?',JSON.stringify(plan),paid.requestId).run();await f.p("UPDATE mercenary_limited_issues_v1 SET code='V-996' WHERE request_id=?",paid.requestId).run();
 assert.equal((await sssCubeReceipt(f.env,f.user,paid.requestId)).draws[0].serial,1);
 await f.p("UPDATE joint_operations_v1 SET status='PENDING' WHERE request_id=?",paid.requestId).run();await assert.rejects(f.open({requestId:paid.requestId}),{code:'SSS_CUBE_STOCK'});assert.equal((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='SSS_MIRACLE_CUBE'").first()).quantity,39);
});
test('concurrent cube issuance prevents a stale CMS limit decrease without saving any policy',async t=>{
 const f=await setup(t);await f.save('V-973');const state=await sssCubeState(f.env,f.user),raw=(await f.p('SELECT value FROM app_meta WHERE key=?',SSS_CUBE_KEY).first()).value;
 const batch=f.env.DB.batch.bind(f.env.DB);let raced=false;f.env.DB.batch=async list=>{if(!raced&&list.some(s=>s.source.startsWith('INSERT INTO mercenary_limited_stock_v1'))){raced=true;await f.p("UPDATE mercenary_limited_stock_v1 SET issued=3 WHERE code='SSS_MIRACLE_CUBE:V-973'").run();}return batch(list);};
 const requestId=crypto.randomUUID();await assert.rejects(saveSssCubePolicy(f.env,f.user,{requestId,revision:state.revision,policy:{...state.policy,mode:'OFF',stockLimits:{...state.policy.stockLimits,'V-973':2}}}),{code:'SSS_CUBE_STOCK'});
 assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',SSS_CUBE_KEY).first()).value,raw);assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',requestId).first()).status,'CANCELLED');assert.equal((await f.p("SELECT stock_limit FROM mercenary_limited_stock_v1 WHERE code='SSS_MIRACLE_CUBE:V-973'").first()).stock_limit,5);
});
test('cube serial alone never grants Jinmu/Jokro entitlement',async t=>{
 const f=await setup(t,true);
 for(const [code,check] of [['V-989',readJinmuPackOwners],['V-979',readJokroPackOwners]]){await f.save(code);const result=await f.open();assert.equal((await check(f.env,[7])).has(7),true);await f.p("UPDATE joint_operations_v1 SET kind='MERCENARY_HALLOWEEN_OPEN' WHERE request_id=?",result.requestId).run();assert.equal((await check(f.env,[7])).has(7),false);}
});
test('one-time operation is rollback-safe, preserves CMS rates/OFF and pack rows, and replays SELECT-only',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});await ensureLimitedPackSchema(f.env);await ensureSssCubeCatalog(f.env);await f.pg.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
 const policy={revision:2,policy:{mode:'OFF',cards:{'V-021':8800000000,'V-973':1200000000},notes:'keep'},updatedBy:7},raw=JSON.stringify(policy);await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[SSS_CUBE_KEY,raw]);await f.pg.query("INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES('V-973',4,2)");
 const client={query:async(sql,args)=>sql.startsWith('SELECT pg_try_advisory_xact_lock')?{rows:[{locked:true}]}:f.pg.query(sql,args)},options={expectedPolicy:raw,releaseCommit:'a'.repeat(40)};
 await assert.rejects(applySssCubeIndependentStock(client,{...options,failAfter:3}),/INJECTED_CUBE_STOCK_FAILURE/);assert.equal((await f.pg.query("SELECT * FROM mercenary_limited_stock_v1 WHERE code LIKE 'SSS_MIRACLE_CUBE:%'")).rows.length,0);
 const dry=await applySssCubeIndependentStock(client,options);assert.equal(dry.receipt.addedCapacity,40);assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[SSS_CUBE_KEY])).rows[0].value,raw);
 const result=await applySssCubeIndependentStock(client,{...options,dryRun:false});assert.deepEqual(result.receipt.probabilities,policy.policy.cards);assert.equal(result.receipt.mode,'OFF');assert.equal((await f.pg.query("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-973'")).rows[0].issued,2);
 const readOnly={query:(sql,args)=>{assert.match(sql,/^SELECT /);return f.pg.query(sql,args);}};assert.equal((await applySssCubeIndependentStock(readOnly,{})).replayed,true);assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,1);
});
