// Explicit isolated PostgreSQL contention check. It cannot use public game tables.
import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';import {Client} from 'pg';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {schema} from '../tests/helpers/limited-pack-fixture.mjs';
import {ensureJointTransactionSchema} from '../functions/_joint_transactions.js';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {ensureLimitedPackSchema,createLimitedPackService,saveLimitedPack,readLimitedPackState} from '../functions/_mercenary_limited_pack.js';
import {limitedPackDraft,LIMITED_PACK_KEY} from '../shared/mercenary-limited-pack-v1.mjs';
import {limitedPolicyDraft,LIMITED_POLICY_KEY} from '../shared/mercenary-limited-policy-v1.mjs';
if(!process.env.LIMITED_QA_CONNECT_MODULE)throw Error('An explicit QA connection provider is required.');
const {connect}=await import(pathToFileURL(process.env.LIMITED_QA_CONNECT_MODULE).href),first=await connect();
const schemaName='cnine_limited_qa_'+Date.now()+'_'+process.pid,proof=crypto.randomUUID(),clients=[first],metrics={queries:0,statements:0,batches:0},report={schema:schemaName,checks:[]};
assert.match(schemaName,/^cnine_limited_qa_[0-9]+_[0-9]+$/);
let created=false;
try{
 await first.query('CREATE SCHEMA "'+schemaName+'"');created=true;await first.query('COMMENT ON SCHEMA "'+schemaName+'" IS \''+proof+'\'');
 await first.query('SET search_path TO "'+schemaName+'"');
 await first.query("SET statement_timeout='15s'");await first.query("SET lock_timeout='5s'");
 await first.query("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$");
 await first.query(schema.join(';'));
 const makeDB=client=>{
  const counted={escapeLiteral:client.escapeLiteral.bind(client),query(...args){metrics.queries++;return client.query(...args);}};
  const db=new __postgresCompatTest.PostgresD1Database(counted),batch=db.batch.bind(db);
  db.batch=list=>{metrics.batches++;metrics.statements+=list.length;return batch(list);};return db;
 };
 const DB=makeDB(first),env={DB},p=(sql,...args)=>DB.prepare(sql).bind(...args);
 await ensureJointTransactionSchema(env);await DB.execSchema(MERCENARY_ACCOUNTING_SCHEMA);await ensureLimitedPackSchema(env);
 await first.query("INSERT INTO users(id) SELECT generate_series(1,70); INSERT INTO inventory_items(code) VALUES('MASTER_STAR'),('STARLIGHT_ARMOR_CORE')");
 const policy=limitedPolicyDraft(),settings=limitedPackDraft();policy.rankRatesPpm={SS:1000000,SSS:0};policy.cardWeights=Object.fromEntries(Object.keys(policy.cardWeights).map(c=>[c,c==='V-990'?1:0]));
 settings.mode='ON';settings.prices={single:100,ten:900};settings.stockLimits=Object.fromEntries(Object.keys(settings.stockLimits).map(c=>[c,7]));settings.extraRewards=settings.extraRewards.map(r=>({...r,chancePpm:0,quantity:r.id==='NONE'?0:10}));
 await p('INSERT INTO app_meta(key,value) VALUES(?,?),(?,?)',LIMITED_POLICY_KEY,JSON.stringify({revision:1,policy}),LIMITED_PACK_KEY,JSON.stringify({revision:1,settings})).run();
 for(const code in settings.stockLimits)await p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,7)',code).run();
 // Same database, strict private search_path. No fallback to public is allowed.
 const cp=first.connectionParameters;
 for(let i=1;i<8;i++){
  const client=new Client({host:cp.host,port:cp.port,user:cp.user,password:cp.password,database:cp.database,ssl:cp.ssl,application_name:'cnine-limited-isolated-qa',connectionTimeoutMillis:10000});
  await client.connect();clients.push(client);await client.query('SET search_path TO "'+schemaName+'"');await client.query("SET statement_timeout='15s'; SET lock_timeout='5s'");
 }
 for(const client of clients)assert.equal((await client.query('SELECT current_schema() AS s')).rows[0].s,schemaName);
 const environments=clients.map(c=>({DB:makeDB(c)})),service=createLimitedPackService({releaseEnabled:true,randomInt:()=>0});
 // Every request gets its own adapter/connection lane, with 8 simultaneous SQL transactions.
 Object.assign(metrics,{queries:0,statements:0,batches:0});const durations=[],start=performance.now();
 const requests=Array.from({length:64},()=>({requestId:crypto.randomUUID(),count:1,expectedRevision:1,expectedPolicyRevision:1}));
 const results=await Promise.allSettled(requests.map(async(body,i)=>{const began=performance.now();try{return await service.open(environments[i%8],{id:i+1},body);}finally{durations.push(performance.now()-began);}}));
 const winners=results.filter(r=>r.status==='fulfilled');assert.equal(winners.length,7);
 for(const r of results.filter(r=>r.status==='rejected'))assert.ok(['MERCENARY_LIMITED_SOLD_OUT','MERCENARY_LIMITED_NOT_READY'].includes(r.reason.code),r.reason.code+': '+r.reason.message);
 const dbState=(await first.query("SELECT (SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-990') AS issued,(SELECT count(DISTINCT serial) FROM mercenary_limited_issues_v1) AS serials,(SELECT sum(1000000-coin) FROM users) AS debit")).rows[0];
 assert.equal(Number(dbState.issued),7);assert.equal(Number(dbState.serials),7);assert.equal(Number(dbState.debit),700);
 durations.sort((a,b)=>a-b);report.contention={clients:8,concurrentRequests:64,limit:7,winners:7,losersWithoutDebit:57,elapsedMs:Math.round(performance.now()-start),p50Ms:Math.round(durations[31]),p95Ms:Math.round(durations[60]),...metrics};report.checks.push('atomic last-stock contention: no oversell, no duplicate serial, no losing debit');
 // Replay a completed request through another connection: no extra charge.
 const winner=results.findIndex(r=>r.status==='fulfilled'),again=await service.open(environments[(winner+1)%8],{id:winner+1},requests[winner]);assert.equal(again.replayed,true);
 assert.equal(Number((await first.query('SELECT sum(1000000-coin) AS n FROM users')).rows[0].n),700);report.checks.push('cross-connection receipt replay: exactly once');
 settings.mode='OFF';await p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({revision:2,settings}),LIMITED_PACK_KEY).run();
 const cms={expectedRevision:1,expectedPackRevision:2,policy,packSettings:settings,reason:'격리 동시 저장 검수',requestId:crypto.randomUUID()};
 const saves=await Promise.allSettled([saveLimitedPack(environments[0],{id:1},cms),saveLimitedPack(environments[1],{id:1},{...cms,requestId:crypto.randomUUID(),reason:'격리 동시 저장 다른 창'})]);
 assert.equal(saves.filter(r=>r.status==='fulfilled').length,1);assert.equal(saves.find(r=>r.status==='rejected').reason.code,'MERCENARY_LIMITED_CONFLICT');
 report.checks.push('two OWNER connections saving the same revision: one success, one stale rejection');
 const current=await readLimitedPackState(env);assert.equal(current.stock.find(s=>s.code==='V-990').issued,7);report.checks.push('CMS save preserves global issued count');
}finally{
 for(const client of clients.slice(1))await client.end().catch(()=>{});
 if(created){
  const marker=(await first.query('SELECT obj_description(oid,\'pg_namespace\') AS marker FROM pg_namespace WHERE nspname=$1',[schemaName])).rows[0]?.marker;
  assert.equal(marker,proof,'Refuse to remove a schema without this run marker');
  await first.query('DROP SCHEMA "'+schemaName+'" CASCADE');report.cleaned=true;
 }
 await first.end();
}
fs.writeFileSync('preview/mercenary-limited-pack-20261006-v1/qa/postgres-contention.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
