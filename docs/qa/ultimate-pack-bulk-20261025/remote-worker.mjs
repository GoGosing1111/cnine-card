import {Client} from 'pg';
import schema from './fixture-schema.json';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
import {ultimateBulkDependencies} from '../../../functions/api/[[path]].js';
import {createUltimateBulkService} from '../../../functions/_ultimate_pack_bulk.js';
import {ultimateBulkRequestId,validateUltimateBulkReceipt} from '../../../shared/ultimate-pack-bulk-v1.mjs';
const tables=schema.filter(s=>s.startsWith('CREATE TABLE')).map(s=>s.match(/CREATE TABLE (\w+)/)[1]);
export default {async fetch(request,env){
 if(!env.BENCH_KEY||request.headers.get('x-benchmark-key')!==env.BENCH_KEY)return new Response('Not found',{status:404});
 if(request.method!=='POST'||new URL(request.url).pathname!=='/benchmark')return new Response('Not found',{status:404});
 const input=await request.json();if(!['live','stock','soldout','maximum'].includes(input.scenario))return new Response('Bad scenario',{status:400});
 const context={...input.context,poolsByGrade:new Map(input.context.poolsByGrade)};
 if(input.scenario!=='live')context.limitedCards=context.limitedCards.map(c=>({...c,limited_total:input.scenario==='maximum'?1000:10}));
 const cards=[...new Map([...context.poolsByGrade.values()].flat().concat(context.limitedCards).map(c=>[String(c.id),c])).values()],client=new Client({connectionString:env.HYPERDRIVE.connectionString,application_name:'ultimate-temporary-benchmark-20261025'});let DB;
 try{
  await client.connect();await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='500ms'; SET LOCAL idle_in_transaction_session_timeout='20s'; SET LOCAL search_path=pg_temp,public,pg_catalog");
  await client.query(schema.map(s=>s.startsWith('CREATE TABLE')?s.replace('CREATE TABLE','CREATE TEMP TABLE')+' ON COMMIT DROP':s.replace('CREATE VIEW','CREATE TEMP VIEW')).join(';'));
  await client.query('SET TRANSACTION READ ONLY');
  const safety=(await client.query("SELECT current_setting('transaction_read_only') AS read_only,COUNT(*)::integer AS n,BOOL_AND(c.relpersistence='t' AND c.relnamespace=pg_my_temp_schema()) AS all_temp FROM unnest($1::text[]) n(name) JOIN pg_class c ON c.oid=to_regclass(n.name)",[tables.concat('cards_effective_v1210')])).rows[0];
  if(safety.read_only!=='on'||!safety.all_temp||safety.n!==tables.length+1)throw Error('Read-only temporary isolation failed');
  let wire=0;const wrapped={escapeLiteral:v=>client.escapeLiteral(v),async query(input){let text=typeof input==='string'?input:input.text;if(/\b(?:CREATE|ALTER|DROP|TRUNCATE)\s|\bREAD\s+WRITE\b/i.test(text))throw Error('No persistent/schema modifications allowed');text=text.replace(/(^|\n;\n)BEGIN(?=$|\n;\n)/g,'$1SAVEPOINT ultimate_bench').replace(/(^|\n;\n)COMMIT(?=$|\n;\n)/g,'$1RELEASE SAVEPOINT ultimate_bench').replace(/^ROLLBACK$/,'ROLLBACK TO SAVEPOINT ultimate_bench');wire++;return client.query(typeof input==='string'?text:{...input,text});}};
  __postgresCompatTest.clearPostgresCatalogCache();DB=new __postgresCompatTest.PostgresD1Database(wrapped);const p=(s,...v)=>DB.prepare(s).bind(...v);
  await p('INSERT INTO users(id,coin) VALUES(1,100000000000000)').run();await p("INSERT INTO members(id,name) VALUES(1,'임시 검수')").run();
  await p("INSERT INTO card_packs(id,price,allowed_rarities,guarantee_10) VALUES('ultimate',?,?,?)",Number(input.pack.price),input.pack.allowed_rarities,input.pack.guarantee_10).run();
  for(let offset=0;offset<cards.length;offset+=20){const chunk=cards.slice(offset,offset+20);await p('INSERT INTO cards(id,member_id,title,rarity,limited_total,issued_count) VALUES '+chunk.map(()=>'(?,1,?,?,?,?)').join(','),...chunk.flatMap(c=>[String(c.id),c.title,c.grade,c.limited_total==null?null:(input.scenario==='maximum'?1000:10),c.limited_total==null?0:(input.scenario==='soldout'?10:0)])).run();}
  const deps=ultimateBulkDependencies(),ctx=input.scenario==='maximum'?{...context,limitedRate:100}:context,service=createUltimateBulkService({...deps,loadContext:async()=>ctx,criticalSettings:async()=>input.critical}),samples=[];
  let receipt;
  for(let i=0;i<5;i++){
   for(const table of ['draw_request_receipts_v2','user_cards','cnine_user_inventory','coin_logs','shard_logs','inventory_logs','draw_logs','limited_acquisition_audit'])await p('DELETE FROM '+table).run();
   await p('UPDATE users SET coin=100000000000000,card_shards=0 WHERE id=1').run();await p('UPDATE cards SET issued_count=? WHERE limited_total IS NOT NULL',input.scenario==='soldout'?10:0).run();
   const body={requestId:ultimateBulkRequestId(),count:100000,expectedCost:Number(input.pack.price)*100000},start=Date.now();wire=0;
   receipt=await service.open({DB},{id:1,nickname:'임시 검수'},body);const ms=Date.now()-start,calls=wire;validateUltimateBulkReceipt(receipt,body);
   const total=await p('SELECT SUM(quantity) n FROM user_cards WHERE user_id=1').first(),issues=await p('SELECT COUNT(*) n FROM limited_acquisition_audit').first();if(Number(total.n)!==100000)throw Error('Quantity mismatch');
   const replayStart=Date.now();await service.open({DB},{id:1,nickname:'임시 검수'},body);const replayMs=Date.now()-replayStart;
   if(Number((await p('SELECT COUNT(*) n FROM coin_logs').first()).n)!==1)throw Error('Duplicate charge');
   samples.push({ms,replayMs,wire:calls,types:receipt.results.length,limited:Number(issues.n),bytes:JSON.stringify(receipt).length});
  }
  await client.query('ROLLBACK');const remaining=Number((await client.query('SELECT COUNT(*) n FROM pg_class WHERE relnamespace=pg_my_temp_schema()')).rows[0].n);if(remaining)throw Error('Temporary schema remains');
  return Response.json({at:new Date().toISOString(),scenario:input.scenario,colo:request.cf?.colo,samples,receipt,readOnly:true,temporaryTables:tables.length,removed:true,productionWrites:0,limits:['Temporary tables; no live account authentication or Durable Object wait','SAVEPOINT inside outer read-only transaction; no real COMMIT durability','Production draw helper and current pack probabilities; temporary stock only']});
 }catch(e){return Response.json({error:String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]')},{status:500});}finally{await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}
}};
