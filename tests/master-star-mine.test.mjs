import test from 'node:test';
import assert from 'node:assert/strict';
import {jointFixture} from './helpers/joint-db.mjs';
import {ensureJointTransactionSchema} from '../functions/_joint_transactions.js';
import {ensureMineSchema,ensureMineCatalog,mineState,startMine,claimMine,saveMinePolicy,manageMineDrill,handleMasterStarMine} from '../functions/_master_star_mine.js';
import {MINE_KEY,MINE_DRILLS,MINE_DURATION_MS,emptyMinePolicy,validateMinePolicy} from '../shared/master-star-mine-v1.mjs';
const electric=MINE_DRILLS[0].code,gold=MINE_DRILLS[2].code,id=()=>crypto.randomUUID();
async function fixture(t,options){
 const f=await jointFixture(t,options);await ensureJointTransactionSchema(f.env);await ensureMineSchema(f.env);await ensureMineCatalog(f.env);
 await f.p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('MASTER_STAR','마스터의 별','SPECIAL','/star.svg')").run();
 const policy={...emptyMinePolicy(),mode:'TEST',testUserIds:[7],acquisition:'CMS'};
 await f.setting(MINE_KEY,{revision:1,policy});await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,1)',electric).run();
 return {...f,policy,stars:async()=>Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").first())?.quantity||0)};
}
for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL':'SQLite';
 test(dialect+': 4h boundary, reward snapshot, offline completion, same/new request replay and ownership',async t=>{
  const f=await fixture(t,{postgres});let clock=Date.now(),startId=id(),claimId=id(),clockFn={now:()=>clock};
  await assert.rejects(startMine(f.env,f.user,{requestId:id(),drillCode:gold},clockFn),{code:'MINE_OWNERSHIP'});
  const start=await startMine(f.env,f.user,{requestId:startId,drillCode:electric},clockFn);assert.equal(start.run.readyAt-clock,MINE_DURATION_MS);assert.equal(start.run.reward,5000);
  const replay=await startMine(f.env,f.user,{requestId:startId,drillCode:electric},clockFn);assert.equal(replay.replayed,true);
  await assert.rejects(startMine(f.env,f.user,{requestId:id(),drillCode:electric},clockFn),{code:'MINE_ACTIVE'});
  await assert.rejects(claimMine(f.env,{id:8,role:'OWNER'},{requestId:id(),runId:startId},clockFn),{code:'MINE_RUN'});
  clock=start.run.readyAt-1;await assert.rejects(claimMine(f.env,f.user,{requestId:claimId,runId:startId},clockFn),{code:'MINE_NOT_READY'});
  const changed={...f.policy,mode:'OFF',rewards:{...f.policy.rewards,[electric]:9000}};await saveMinePolicy(f.env,f.user,{requestId:id(),revision:1,policy:changed});
  clock++;const paid=await claimMine(f.env,f.user,{requestId:claimId,runId:startId},clockFn);assert.equal(paid.claimed.reward,5000);assert.equal(await f.stars(),5000);assert.equal(paid.run,null);
  assert.equal((await claimMine(f.env,f.user,{requestId:claimId,runId:startId},clockFn)).replayed,true);assert.equal(await f.stars(),5000);
  await assert.rejects(claimMine(f.env,f.user,{requestId:id(),runId:startId},clockFn),{code:'MINE_CLAIMED'});
  await assert.rejects(startMine(f.env,f.user,{requestId:id(),drillCode:electric},clockFn),{code:'MINE_CLOSED'});
  changed.mode='TEST';await saveMinePolicy(f.env,f.user,{requestId:id(),revision:2,policy:changed});assert.equal((await startMine(f.env,f.user,{requestId:id(),drillCode:electric},clockFn)).run.reward,9000);
  assert.equal(Number((await f.p("SELECT COUNT(*) n FROM inventory_logs WHERE item_code='MASTER_STAR'").first()).n),1);
 });
 test(dialect+': rollback and delayed start retry cannot accrue before commit',async t=>{
  const f=await fixture(t,{postgres});let clock=Date.now();const requestId=id(),clockFn={now:()=>clock};
  f.fail('INSERT INTO master_star_mine_runs_v1');await assert.rejects(startMine(f.env,f.user,{requestId,drillCode:electric},clockFn));assert.equal((await mineState(f.env,f.user)).run,null);
  f.fail('');clock+=MINE_DURATION_MS*3;const r=await startMine(f.env,f.user,{requestId,drillCode:electric},clockFn);assert.equal(r.run.startedAt,clock);assert.equal(r.run.status,'MINING');
  clock+=MINE_DURATION_MS;const claimId=id();f.fail('INSERT INTO inventory_logs');await assert.rejects(claimMine(f.env,f.user,{requestId:claimId,runId:requestId},clockFn));assert.equal(await f.stars(),0);assert.ok((await mineState(f.env,f.user)).run);
  f.fail('');await claimMine(f.env,f.user,{requestId:claimId,runId:requestId},clockFn);assert.equal(await f.stars(),5000);
  const logs=await f.p('SELECT COUNT(*) n FROM inventory_logs').first();assert.equal(Number(logs.n),1);
 });
 test(dialect+': CMS owner, readiness, CAS, audited permanent grants and revocation',async t=>{
  const f=await fixture(t,{postgres}),pending={...f.policy,acquisition:'PENDING',mode:'ON'};
  await assert.rejects(saveMinePolicy(f.env,f.user,{requestId:id(),revision:1,policy:pending}),{code:'MINE_NOT_READY'});
  await assert.rejects(saveMinePolicy(f.env,{id:7,role:'ADMIN'},{requestId:id(),revision:1,policy:f.policy}),{code:'MINE_PERMISSION'});
  await saveMinePolicy(f.env,f.user,{requestId:id(),revision:1,policy:f.policy});
  await assert.rejects(saveMinePolicy(f.env,f.user,{requestId:id(),revision:1,policy:f.policy}),{code:'MINE_REVISION_CONFLICT'});
  const body={requestId:id(),userId:7,drillCode:gold,action:'GRANT',reason:'격리 테스트 지급'};
  await manageMineDrill(f.env,f.user,body);assert.equal((await manageMineDrill(f.env,f.user,body)).replayed,true);
  await assert.rejects(manageMineDrill(f.env,f.user,{...body,requestId:id()}),{code:'MINE_OWNED'});
  const run=await startMine(f.env,f.user,{requestId:id(),drillCode:gold});
  await assert.rejects(manageMineDrill(f.env,f.user,{...body,requestId:id(),action:'REVOKE'}),{code:'MINE_ACTIVE'});
  await claimMine(f.env,f.user,{requestId:id(),runId:run.run.id},{now:()=>run.run.readyAt});
  await manageMineDrill(f.env,f.user,{...body,requestId:id(),action:'REVOKE'});assert.equal((await mineState(f.env,f.user)).drills.find(d=>d.code===gold).owned,false);
  assert.equal(await f.stars(),30000);assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='MASTER_STAR_MINE_DRILL'").first()).n),2);
 });
}
test('authenticated routes serialize simultaneous starts/claims and reject forged requests',async t=>{
 const f=await fixture(t);
 const request=async(path,body,{token='local-account-7',origin='https://game.test',method=body?'POST':'GET'}={})=>handleMasterStarMine({path,env:f.env,deps:f.deps,request:new Request('https://game.test/api/'+path,{method,headers:{authorization:'Bearer '+token,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})});
 assert.equal((await request('master-star-mine/state',null,{token:'bad'})).status,401);
 assert.equal((await request('master-star-mine/start',{requestId:id(),drillCode:electric,reward:999999})).status,400);
 assert.equal((await request('master-star-mine/start',{requestId:id(),drillCode:electric},{origin:'https://evil.test'})).status,403);
 assert.equal((await request('master-star-mine/start',{requestId:id(),drillCode:electric},{token:'local-account-8'})).status,409);
 const responses=await Promise.all([request('master-star-mine/start',{requestId:id(),drillCode:electric}),request('master-star-mine/start',{requestId:id(),drillCode:electric})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const run=(await mineState(f.env,f.user)).run,at=Date.now()-1000;await f.p('UPDATE master_star_mine_runs_v1 SET started_at_ms=?,ready_at_ms=? WHERE id=?',at-MINE_DURATION_MS,at,run.id).run();
 const claims=await Promise.all([request('master-star-mine/claim',{requestId:id(),runId:run.id}),request('master-star-mine/claim',{requestId:id(),runId:run.id})]);assert.deepEqual(claims.map(r=>r.status).sort(),[200,409]);assert.equal(await f.stars(),5000);
 const denied=await handleMasterStarMine({path:'admin/master-star-mine',env:f.env,deps:{...f.deps,authenticate:async()=>({id:8,role:'ADMIN'})},request:new Request('https://game.test/api/admin/master-star-mine')});assert.equal(denied.status,403);
});
test('lost commit acknowledgement is recovered without duplicate reward',async t=>{
 const f=await fixture(t),startId=id(),claimId=id();const start=await startMine(f.env,f.user,{requestId:startId,drillCode:electric});let injected=false;
 f.DB.afterCommit=async statements=>{if(!injected&&statements.some(s=>s.source.includes('INSERT INTO inventory_logs'))){injected=true;throw Error('LOST_ACK');}};
 const r=await claimMine(f.env,f.user,{requestId:claimId,runId:startId},{now:()=>start.run.readyAt});assert.equal(r.status,'COMPLETED');assert.equal(await f.stars(),5000);
 await claimMine(f.env,f.user,{requestId:claimId,runId:startId});assert.equal(await f.stars(),5000);
});
test('approved defaults and invalid rewards remain bounded',()=>{
 const p=emptyMinePolicy();assert.deepEqual(Object.values(p.rewards),[5000,15000,30000]);assert.equal(p.mode,'OFF');assert.equal(p.acquisition,'PENDING');
 for(const n of [-1,0,0.1,10000001,Infinity,'5000',undefined])assert.throws(()=>validateMinePolicy({...p,rewards:{...p.rewards,[electric]:n}}));
 assert.equal(validateMinePolicy({...p,rewards:{...p.rewards,[electric]:null}}).rewards[electric],null);
});
test('release preparation is rollbackable, defaults OFF, grants nothing and preserves later CMS changes',async t=>{
 const f=await jointFixture(t,{postgres:true});
 await f.pg.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
 await f.p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('MASTER_STAR','별','SPECIAL','/star.svg')").run();
 const client={query:async(sql,values=[])=>sql==='SELECT current_database() database,pg_is_in_recovery() recovery'?{rows:[{database:'cnine',recovery:false}]}:f.pg.query(sql,values)};
 const {prepareMasterStarMine}=await import('../scripts/ops/master-star-mine-prepare-20261003.mjs');
 const dry=await prepareMasterStarMine(client);assert.equal(dry.dryRun,true);assert.equal(dry.mode,'OFF');assert.equal((await f.pg.query("SELECT to_regclass('master_star_mine_runs_v1') name")).rows[0].name,null);
 const live=await prepareMasterStarMine(client,{apply:true});assert.equal(live.createdItems.length,3);assert.equal(live.granted,0);assert.equal(live.paid,0);assert.equal(live.acquisition,'PENDING');assert.deepEqual(Object.values(live.rewards),[5000,15000,30000]);
 await f.setting(MINE_KEY,{revision:2,policy:{...emptyMinePolicy(),rewards:{...emptyMinePolicy().rewards,MINE_ELECTRIC_DRILL:7000}}});
 const again=await prepareMasterStarMine(client,{apply:true});assert.equal(again.revision,2);assert.equal(again.rewards.MINE_ELECTRIC_DRILL,7000);assert.equal(again.createdPolicy,false);assert.equal(again.createdItems.length,0);assert.equal(Number((await f.p("SELECT COUNT(*) n FROM cnine_user_inventory WHERE item_code LIKE 'MINE_%'").first()).n),0);
});
