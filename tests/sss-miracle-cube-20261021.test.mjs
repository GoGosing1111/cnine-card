import test from 'node:test';
import {sssCubeStockCode} from '../shared/sss-miracle-cube-stock-v1.mjs';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {SSS_CUBE_TOTAL,emptySssCubePolicy,parseSssCubePercent,sssCubePercent,validateSssCubePolicy,pickSssCubeBatch} from '../shared/sss-miracle-cube-v1.mjs';
import {SSS_CUBE_KEY,ensureSssCubeCatalog,sssCubeState,saveSssCubePolicy,openSssCube,sssCubeReceipt,handleSssCube} from '../functions/_sss_miracle_cube.js';
import {readJokroPackOwners} from '../functions/_mercenary_jokro_access.js';
import {readJinmuPackOwners} from '../functions/_mercenary_jinmu_access.js';
import {prepareSssMiracleCube} from '../scripts/ops/sss-miracle-cube-prepare-20261021.mjs';
async function setup(t,postgres=false){
 const f=await mercenaryFixture(t,{postgres});await ensureLimitedPackSchema(f.env);await ensureSssCubeCatalog(f.env);
 f.document.mercenaries.find(c=>c.code==='V-021').rank='SSS';
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
 await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'SSS_MIRACLE_CUBE',13,13)").run();
 for(const [code,cap,issued] of [['V-996',15,14],['V-999',8,8],['V-989',4,0],['V-979',3,0]])await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES(?,?,?)',sssCubeStockCode(code),cap,issued).run();
 const state=await sssCubeState(f.env,f.user),normal=state.catalog.find(c=>!c.limited&&c.available),policy={...emptySssCubePolicy(),mode:'ON',cards:{[normal.code]:SSS_CUBE_TOTAL}};
 const save=(policy,revision=0)=>saveSssCubePolicy(f.env,f.user,{requestId:crypto.randomUUID(),revision,policy});
 const open=(options={})=>openSssCube(f.env,f.user,{requestId:crypto.randomUUID(),count:1,expectedRevision:1,...options},{randomInt:()=>0});
 const quantity=async()=>Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='SSS_MIRACLE_CUBE'").first()).quantity);
 return {...f,state,normal,policy,save,open,quantity};
}
test('SSS-only direct percentages preserve exact eight-decimal boundaries and explicit exclusions',()=>{
 assert.equal(parseSssCubePercent('0.00000001'),1);assert.equal(parseSssCubePercent('100'),SSS_CUBE_TOTAL);assert.equal(parseSssCubePercent(''),null);assert.equal(sssCubePercent(1),'0.00000001');
 assert.throws(()=>parseSssCubePercent('0.000000001'));assert.throws(()=>parseSssCubePercent('100.1'));
 const catalog=[{code:'V-001',rank:'SSS',available:true,limited:false},{code:'V-996',rank:'SSS',available:true,limited:true,remaining:1,stockLimit:15},{code:'V-990',rank:'SS',available:true}];
 const p={mode:'ON',cards:{'V-001':SSS_CUBE_TOTAL-1,'V-996':1},notes:''};
 assert.equal(pickSssCubeBatch(p,catalog,1,()=>SSS_CUBE_TOTAL-2)[0].mercenaryCode,'V-001');
 assert.equal(pickSssCubeBatch(p,catalog,1,()=>SSS_CUBE_TOTAL-1)[0].mercenaryCode,'V-996');
 assert.throws(()=>validateSssCubePolicy({...p,cards:{'V-990':SSS_CUBE_TOTAL}},catalog),/SSS/);
 assert.throws(()=>pickSssCubeBatch(p,catalog,10,()=>SSS_CUBE_TOTAL-1),{code:'SSS_CUBE_STOCK'});
});
test('older CMS documents include released Azant/Kangyun without overriding acquisition OFF or writing defaults',async t=>{
 const f=await setup(t),codes=['V-056','V-057'],removed=new Set(f.document.assignments.filter(a=>codes.includes(a.code)).flatMap(a=>a.skillIds));
 const legacy={...f.document,mercenaries:f.document.mercenaries.filter(c=>!codes.includes(c.code)),assignments:f.document.assignments.filter(a=>!codes.includes(a.code)),skills:f.document.skills.filter(s=>!removed.has(s.id))};
 const raw=JSON.stringify(legacy);await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",raw).run();
 const row=await f.p('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1').first(),draw=JSON.parse(row.payload_json);draw.cardRules.cardWeights['V-057']=0;
 await f.p('UPDATE mercenary_draw_config_v1 SET payload_json=?,revision=revision+1 WHERE id=1',JSON.stringify(draw)).run();
 const state=await sssCubeState(f.env,f.user);assert.equal(state.catalog.find(c=>c.code==='V-056')?.available,true);assert.equal(state.catalog.find(c=>c.code==='V-057')?.available,false);
 assert.equal((await f.p("SELECT payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first()).payload_json,raw);
 await assert.rejects(f.save({...f.policy,cards:{'V-057':SSS_CUBE_TOTAL}}),{code:'SSS_CUBE_NOT_READY'});
 await f.save({...f.policy,cards:{'V-056':SSS_CUBE_TOTAL}});assert.equal((await f.open()).draws[0].mercenaryCode,'V-056');
});

test('OFF/null defaults, SS exclusion, unreleased and sold-out locks, OWNER authorization and version checks',async t=>{
 const f=await setup(t);assert.equal(f.state.mode,'OFF');assert.equal(f.state.ready,false);assert.deepEqual(f.state.policy.cards,{});
 assert.ok(f.state.catalog.every(c=>c.rank==='SSS'&&c.units===null));
 assert.equal(f.state.catalog.find(c=>c.code==='V-999').available,false);
 assert.ok(f.state.catalog.filter(c=>c.limited&&!['V-996','V-999','V-989','V-979'].includes(c.code)).every(c=>!c.available));
 await assert.rejects(f.open(),{code:'SSS_CUBE_CLOSED'});assert.equal(await f.quantity(),13);
 await assert.rejects(saveSssCubePolicy(f.env,{id:8,role:'MEMBER'},{revision:0,policy:f.policy}),{code:'SSS_CUBE_PERMISSION'});
 await assert.rejects(f.save({...f.policy,cards:{'V-999':SSS_CUBE_TOTAL}}),{code:'SSS_CUBE_NOT_READY'});
 await f.save({...emptySssCubePolicy(),notes:'private note'});assert.equal((await sssCubeState(f.env,{id:8,role:'MEMBER'})).policy.notes,'');
 await assert.rejects(f.save(f.policy),{code:'SSS_CUBE_REVISION_CONFLICT'});
 const request=new Request('https://game.test/api/admin/sss-miracle-cube',{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer local-account-7',origin:'https://evil.test'},body:JSON.stringify({requestId:crypto.randomUUID(),revision:1,policy:f.policy})});
 assert.equal((await handleSssCube({path:'admin/sss-miracle-cube',request,env:f.env,deps:f.deps})).status,403);
});
for(const postgres of [false,true])test(`normal/limited debit, independent last serial, duplicate and replay accounting (${postgres?'Postgres':'SQLite'})`,async t=>{
 const f=await setup(t,postgres);await f.save(f.policy);
 const input={requestId:crypto.randomUUID(),count:10,expectedRevision:1};
 const normal=await openSssCube(f.env,f.user,input,{randomInt:()=>0});assert.equal(normal.draws.length,10);assert.equal(normal.balance,3);assert.equal(normal.draws[9].duplicateCount,9);
 const repeated=await openSssCube(f.env,f.user,input,{randomInt:()=>{throw Error('reroll');}});assert.deepEqual(repeated.draws,normal.draws);assert.equal(repeated.balance,3);
 await assert.rejects(sssCubeReceipt(f.env,{id:8},input.requestId),{code:'JOINT_NOT_FOUND'});
 await assert.rejects(openSssCube(f.env,f.user,{...input,count:1}),{code:'JOINT_REQUEST_CONFLICT'});
 await f.save({...f.policy,cards:{'V-996':SSS_CUBE_TOTAL}},1);
 const limited=await f.open({expectedRevision:2});assert.equal(limited.balance,2);assert.equal(limited.draws[0].serial,15);assert.equal(limited.draws[0].limited,true);
 assert.equal(Number((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='SSS_MIRACLE_CUBE:V-996'").first()).issued),15);
 assert.equal((await sssCubeState(f.env,f.user)).openingEnabled,false);
 await assert.rejects(f.open({expectedRevision:2}),{code:'SSS_CUBE_NOT_READY'});assert.equal(await f.quantity(),2);
});
test('failed payment/grant rolls back, retry reuses draw; changed settings cancel without debit',async t=>{
 const f=await setup(t,true);await f.save({...f.policy,cards:{'V-996':SSS_CUBE_TOTAL}});const input={requestId:crypto.randomUUID(),count:1,expectedRevision:1};let rolls=0;
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(openSssCube(f.env,f.user,input,{randomInt:()=>{rolls++;return 0;}}));f.fail('');
 assert.equal(await f.quantity(),13);assert.equal(Number((await f.p("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='SSS_MIRACLE_CUBE:V-996'").first()).issued),14);
 const result=await openSssCube(f.env,f.user,input,{randomInt:()=>{throw Error('reroll');}});assert.equal(rolls,1);assert.equal(result.draws[0].serial,15);
 await f.save(f.policy,1);const pending={requestId:crypto.randomUUID(),count:1,expectedRevision:2};
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(openSssCube(f.env,f.user,pending,{randomInt:()=>0}));f.fail('');
 await f.save({...f.policy,mode:'OFF'},2);await assert.rejects(openSssCube(f.env,f.user,pending),{code:'SSS_CUBE_POLICY_CHANGED'});assert.equal(await f.quantity(),12);
});
test('another cube consuming the last stock during commit cannot over-issue or debit a cube',async t=>{
 const f=await setup(t);await f.save({...f.policy,cards:{'V-996':SSS_CUBE_TOTAL}});
 const db=f.env.DB,batch=db.batch.bind(db);let raced=false;
 db.batch=async statements=>{
  if(!raced&&statements.some(s=>s.source.includes('UPDATE mercenary_limited_stock_v1'))){raced=true;await f.p("UPDATE mercenary_limited_stock_v1 SET issued=15,revision=revision+1 WHERE code='SSS_MIRACLE_CUBE:V-996'").run();}
  return batch(statements);
 };
 await assert.rejects(f.open(),{code:'SSS_CUBE_STOCK'});assert.equal(await f.quantity(),13);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_limited_issues_v1').first()).n),0);
});
test('Jinmu/Jokro entitlement requires a completed cube receipt, acquisition and a valid serial within each approved limit',async t=>{
 const f=await setup(t,true);
 await f.p("UPDATE mercenary_limited_stock_v1 SET issued=3 WHERE code='SSS_MIRACLE_CUBE:V-989'").run();
 await f.save({...f.policy,cards:{'V-989':SSS_CUBE_TOTAL}});const jinmu=await f.open();assert.equal(jinmu.draws[0].serial,4);assert.equal((await readJinmuPackOwners(f.env,[7])).has(7),true);
 await f.save({...f.policy,cards:{'V-979':SSS_CUBE_TOTAL}},1);await f.open({expectedRevision:2});assert.equal((await readJokroPackOwners(f.env,[7])).has(7),true);
 await f.p("UPDATE joint_operations_v1 SET status='PENDING' WHERE kind='SSS_MIRACLE_CUBE_OPEN'").run();
 assert.equal((await readJinmuPackOwners(f.env,[7])).size,0);assert.equal((await readJokroPackOwners(f.env,[7])).size,0);
});
test('preparation is OFF, no grants or stock changes, dry-run-safe and preserves later CMS settings',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});await ensureLimitedPackSchema(f.env);await f.pg.query("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
 const dry=await prepareSssMiracleCube(f.pg);assert.equal(dry.dryRun,true);assert.equal(dry.mode,'OFF');assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[SSS_CUBE_KEY])).rows.length,0);
 const broken={query:async(sql,args)=>{if(sql.startsWith('INSERT INTO admin_logs'))throw Error('AUDIT_FAILURE');return f.pg.query(sql,args);}};
 await assert.rejects(prepareSssMiracleCube(broken,{apply:true}),/AUDIT_FAILURE/);assert.equal((await f.pg.query("SELECT code FROM inventory_items WHERE code='SSS_MIRACLE_CUBE'")).rows.length,0);
 const saved=await prepareSssMiracleCube(f.pg,{apply:true});assert.equal(saved.createdPolicy,true);assert.equal(saved.configuredCards,0);assert.equal(saved.granted,0);assert.equal(saved.stockChanges,0);
 await f.pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify({revision:4,policy:{mode:'OFF',cards:{'V-021':100},notes:'operator changed'}}),SSS_CUBE_KEY]);
 const repeat=await prepareSssMiracleCube(f.pg,{apply:true});assert.equal(repeat.createdPolicy,false);assert.equal(repeat.revision,4);assert.equal(repeat.configuredCards,1);assert.equal(repeat.auditId,undefined);
 assert.equal((await f.pg.query("SELECT user_id FROM cnine_user_inventory WHERE item_code='SSS_MIRACLE_CUBE'")).rows.length,0);
});
