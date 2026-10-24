import {Client} from 'pg';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
import {BLOODMOON_PACK_RELEASE_ENABLED} from '../../../shared/mercenary-bloodmoon-pack-v1.mjs';
import {baseSchema,tableNames,runSamples,scenarios} from './fixture.mjs';

export default {async fetch(request,env){
 if(!env.BENCH_KEY||request.headers.get('x-benchmark-key')!==env.BENCH_KEY)return new Response('Not found',{status:404});
 if(request.method!=='POST'||new URL(request.url).pathname!=='/benchmark')return new Response('Not found',{status:404});
 const input=await request.json();if(!scenarios.includes(input.scenario)||!Array.isArray(input.normalCards)||input.normalCards.length>100||!Number.isInteger(input.iterations)||input.iterations<1||input.iterations>5)return new Response('Invalid fixture',{status:400});
 if(BLOODMOON_PACK_RELEASE_ENABLED)throw Error('Production release must remain locked');
 const client=new Client({connectionString:env.HYPERDRIVE.connectionString,application_name:'bloodmoon-temp-performance-20261025'});let result,DB;
 const begin=Date.now();
 try{
  await client.connect();const connected=Date.now();
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='500ms'; SET LOCAL idle_in_transaction_session_timeout='20s'; SET LOCAL search_path=pg_temp,public,pg_catalog");
  const sql=baseSchema.map(s=>/^CREATE TABLE/.test(s)?s.replace(/^CREATE TABLE (?:IF NOT EXISTS )?/,'CREATE TEMP TABLE ')+' ON COMMIT DROP':s).join(';\n');
  await client.query(sql);
  // DB-enforced safety: all fixture DML occurs in READ ONLY, which only permits
  // writes to temporary tables. No real account, stock or setting can be changed.
  await client.query('SET TRANSACTION READ ONLY');
  const safety=await client.query("SELECT current_setting('transaction_read_only') AS read_only,COUNT(*)::integer AS tables,BOOL_AND(c.relpersistence='t' AND c.relnamespace=pg_my_temp_schema()) AS all_temp FROM unnest($1::text[]) AS n(name) JOIN pg_class c ON c.oid=to_regclass(n.name)",[tableNames]);
  if(safety.rows[0].read_only!=='on'||!safety.rows[0].all_temp||safety.rows[0].tables!==tableNames.length)throw Error('Temporary/read-only isolation failed');
  __postgresCompatTest.clearPostgresCatalogCache();
  const wrapped={escapeLiteral:value=>client.escapeLiteral(value),async query(input){
   let text=typeof input==='string'?input:input.text;
   if(/\b(?:CREATE|ALTER|DROP|TRUNCATE)\s|\bREAD\s+WRITE\b/i.test(text))throw Error('Fixture adapter cannot modify schema or read-only safety');
   // Keep Hyperdrive on the one outer READ ONLY transaction. The production
   // adapter's nested batch transaction becomes a savepoint with identical SQL.
   text=text.replace(/(^|\n;\n)BEGIN(?=$|\n;\n)/g,'$1SAVEPOINT bloodmoon_bench_batch').replace(/(^|\n;\n)COMMIT(?=$|\n;\n)/g,'$1RELEASE SAVEPOINT bloodmoon_bench_batch').replace(/^ROLLBACK$/,'ROLLBACK TO SAVEPOINT bloodmoon_bench_batch');
   if(DB?.benchStats)DB.benchStats.wireCalls++;
   return client.query(typeof input==='string'?text:{...input,text});
  }};
  DB=new __postgresCompatTest.PostgresD1Database(wrapped);const batch=DB.batch.bind(DB);DB.batch=list=>{if(DB.benchStats)DB.benchStats.batchStatements+=list.length;return batch(list);};
  result=await runSamples(DB,input.normalCards,input.scenario,{iterations:input.iterations,clock:()=>Date.now(),returnReceipt:input.returnReceipt===true});
  const after=(await client.query("SELECT current_setting('transaction_read_only') AS read_only")).rows[0];if(after.read_only!=='on')throw Error('Read-only safety changed');
  await client.query('ROLLBACK');
  const cleanup=(await client.query('SELECT COUNT(*)::integer AS n FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname=ANY($1::text[])',[tableNames])).rows[0];if(cleanup.n!==0)throw Error('Temporary relations remained');
  return Response.json({...result,platform:'Cloudflare remote preview -> production Hyperdrive -> Neon PostgreSQL; temporary tables only',colo:request.cf?.colo||null,connectMs:connected-begin,requestWorkerMs:Date.now()-begin,readOnly:true,temporaryTables:safety.rows[0].tables,temporaryTablesRemoved:true,productionReleaseEnabled:BLOODMOON_PACK_RELEASE_ENABLED,persistentWrites:0,limits:['Synthetic users and temporary table indexes; no live table-size contention','One outer read-only transaction; batch commits use savepoints','No real account auth or Durable Object lock included']});
 }catch(e){return Response.json({error:String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'),code:e.code,scenario:input.scenario},{status:500});}
 finally{await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}
}};
