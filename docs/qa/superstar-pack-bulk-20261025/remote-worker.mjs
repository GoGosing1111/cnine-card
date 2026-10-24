import {Client} from 'pg';
import schema from './fixture-schema.json';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
import {handleSuperstarPackDraw} from '../../../functions/_superstar_pack.js';
import {superstarBulkRequestId,validateSuperstarBulkReceipt} from '../../../shared/superstar-pack-bulk-v1.mjs';
const tables=schema.filter(s=>s.startsWith('CREATE TABLE')).map(s=>s.match(/CREATE TABLE (\w+)/)[1]);
export default {async fetch(request,env){
 if(!env.BENCH_KEY||request.headers.get('x-benchmark-key')!==env.BENCH_KEY||request.method!=='POST'||new URL(request.url).pathname!=='/benchmark')return new Response('Not found',{status:404});
 const input=await request.json();if(![1000,10000].includes(input.count)||!['live','maximum','miss'].includes(input.scenario))return new Response('Invalid scenario',{status:400});
 const settings={...input.settings,...(input.scenario==='maximum'?{successRate:100}:input.scenario==='miss'?{successRate:0}:{})},client=new Client({connectionString:env.HYPERDRIVE.connectionString,application_name:'superstar-temporary-benchmark-20261025'});
 try{
  await client.connect();await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='500ms'; SET LOCAL idle_in_transaction_session_timeout='20s'; SET LOCAL search_path=pg_temp,public,pg_catalog");
  await client.query(schema.map(s=>s.startsWith('CREATE TABLE')?s.replace('CREATE TABLE','CREATE TEMP TABLE')+' ON COMMIT DROP':s.startsWith('CREATE VIEW')?s.replace('CREATE VIEW','CREATE TEMP VIEW'):s).join(';'));
  await client.query('SET TRANSACTION READ ONLY');
  const safety=(await client.query("SELECT current_setting('transaction_read_only') AS read_only,COUNT(*)::integer AS n,BOOL_AND(c.relpersistence='t' AND c.relnamespace=pg_my_temp_schema()) AS all_temp FROM unnest($1::text[]) n(name) JOIN pg_class c ON c.oid=to_regclass(n.name)",[tables.concat('cards_effective_v1210')])).rows[0];
  if(safety.read_only!=='on'||!safety.all_temp||safety.n!==tables.length+1)throw Error('Read-only temporary isolation failed');
  let wire=0;const wrapped={escapeLiteral:v=>client.escapeLiteral(v),async query(input){let text=typeof input==='string'?input:input.text;if(/\b(?:CREATE|ALTER|DROP|TRUNCATE)\s|\bREAD\s+WRITE\b/i.test(text))throw Error('No persistent/schema modifications allowed');text=text.replace(/(^|\n;\n)BEGIN(?=$|\n;\n)/g,'$1SAVEPOINT superstar_bench').replace(/(^|\n;\n)COMMIT(?=$|\n;\n)/g,'$1RELEASE SAVEPOINT superstar_bench').replace(/^ROLLBACK$/,'ROLLBACK TO SAVEPOINT superstar_bench');wire++;return client.query(typeof input==='string'?text:{...input,text});}};
  __postgresCompatTest.clearPostgresCatalogCache();const DB=new __postgresCompatTest.PostgresD1Database(wrapped),p=(s,...v)=>DB.prepare(s).bind(...v),localEnv={DB};
  await p("INSERT INTO users(id,nickname,coin) VALUES(1,'임시 검수',100000000000000)").run();await p("INSERT INTO members(id,name) VALUES(1,'임시 검수')").run();
  await p("INSERT INTO app_meta VALUES('superstar_pack_settings_v1',?,NULL),('superstar_pack_public_release_v2047','1',NULL)",JSON.stringify(settings)).run();
  for(const c of input.cards)await p('INSERT INTO cards(id,title,image_url,focus_x,focus_y,power_type,base_power) VALUES(?,?,?,?,?,?,?)',c.id,c.title,c.image,c.focusX,c.focusY,c.powerType,c.basePower).run();
  const deps={authenticate:async()=>({id:1,nickname:'임시 검수',role:'USER'}),readBody:r=>r.json(),json:(body,status=200)=>({body,status})},samples=[];
  const call=body=>handleSuperstarPackDraw({env:localEnv,deps,request:new Request('https://benchmark.test/api/superstar-pack/draw',{method:'POST',headers:{origin:'https://benchmark.test','content-type':'application/json','x-cnine-draw-client':'temporary_benchmark_20261025'},body:JSON.stringify(body)})});
  let receipt;
  for(let i=0;i<5;i++){
   for(const table of ['superstar_pack_receipts_v1','superstar_pack_debits_v1','user_cards','coin_logs','shard_logs','draw_logs'])await p('DELETE FROM '+table).run();await p('UPDATE users SET coin=100000000000000,card_shards=0 WHERE id=1').run();
   const body={requestId:superstarBulkRequestId(),count:input.count,expectedCost:settings.price*input.count},start=Date.now();wire=0;
   const result=await call(body),ms=Date.now()-start,calls=wire;if(result.status!==200)throw Error(JSON.stringify(result));receipt=result.body;validateSuperstarBulkReceipt(receipt,{...body,userId:1});
   const quantity=Number((await p('SELECT COALESCE(SUM(quantity),0) n FROM user_cards').first()).n),logs=Number((await p('SELECT COUNT(*) n FROM draw_logs').first()).n);if(quantity!==receipt.hitCount||logs!==receipt.hitCount)throw Error('Quantity or audit mismatch');
   const replayStart=Date.now();if((await call(body)).status!==200)throw Error('Replay failed');const replayMs=Date.now()-replayStart;
   if(Number((await p('SELECT COUNT(*) n FROM coin_logs').first()).n)!==1)throw Error('Duplicate charge');
   samples.push({ms,replayMs,wire:calls,hits:receipt.hitCount,misses:receipt.missCount,types:receipt.results.length,bytes:JSON.stringify(receipt).length});
  }
  await client.query('ROLLBACK');const remaining=Number((await client.query('SELECT COUNT(*) n FROM pg_class WHERE relnamespace=pg_my_temp_schema()')).rows[0].n);if(remaining)throw Error('Temporary schema remains');
  return Response.json({at:new Date().toISOString(),scenario:input.scenario,count:input.count,colo:request.cf?.colo,samples,receipt,readOnly:true,temporaryTables:tables.length,removed:true,productionWrites:0,limits:['Temporary tables; no live account authentication or shared account contention','SAVEPOINT inside outer read-only transaction; no real COMMIT durability','Production handler, cryptographic RNG and current pool; changed rates only in temporary worst-case scenarios']});
 }catch(e){return Response.json({error:String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]')},{status:500});}finally{await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}
}};
