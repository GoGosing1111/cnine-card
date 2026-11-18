import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {__postgresCompatTest} from '../coop-pc-performance-20261108/source/functions/_postgres_d1_compat.js';
import {connect,safe,source,out,CODES,save,git} from './common.mjs';
const phase=process.argv[2];assert(['before','after'].includes(phase));const api=path.join(source,'functions/api/[[path]].js'),dest=path.join(out,'runtime-'+phase+'.mjs');
if(phase==='before')assert(!fs.existsSync(path.join(out,'service-before.json')),'Baseline is already captured');
if(phase==='after'||!fs.existsSync(dest))await build({stdin:{contents:fs.readFileSync(api,'utf8')+'\nexport {handlePlayerCard,pvpSettings,resolvePvpTier,pvpSeasonKey,readAccountRank,readDuoHonors};',resolveDir:path.dirname(api)},bundle:true,platform:'node',format:'esm',packages:'external',outfile:dest,logLevel:'silent'});
const runtime=await import('./runtime-'+phase+'.mjs'),c=connect();
try{
 await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='20s'");const q=async(s,a=[])=>(await c.query(s,a)).rows;
 const catalog=await q('SELECT code,serial,name,is_active,is_public FROM avatar_catalog_v1 WHERE code=ANY($1::text[]) ORDER BY code',[CODES]);assert.equal(catalog.length,4);
 const owners=await q(`SELECT u.id::text,u.nickname,count(DISTINCT o.avatar_code)::int progress FROM users u JOIN avatar_user_ownership_v1 o ON o.user_id=u.id
 WHERE o.avatar_code=ANY($1::text[]) AND (o.expires_at IS NULL OR o.expires_at::timestamptz>CURRENT_TIMESTAMP) AND u.status='ACTIVE'
 GROUP BY u.id,u.nickname ORDER BY progress DESC,u.id`,[CODES]);
 const chosen=[owners.find(u=>u.progress===4),owners.find(u=>u.progress<4)].filter(Boolean);assert(chosen.length);
 let queries=0;const sqlSamples=[];const DB=new __postgresCompatTest.PostgresD1Database({async query(s,a){const sql=typeof s==='string'?s:s.text;assert.match(sql.trim(),/^(SELECT|WITH)\b/i);queries++;const start=performance.now();try{return await c.query(s,a);}finally{sqlSamples.push({sql:sql.slice(0,160),ms:performance.now()-start});}}});
 DB.batch=statements=>Promise.all(statements.map(s=>s.all()));
 DB.execSchema=async statements=>{const names=statements.map(s=>{const m=/^CREATE (?:TABLE|INDEX) IF NOT EXISTS ([a-z_0-9]+)\b/i.exec(s);assert(m,'Unexpected schema initialization');return m[1];});assert.deepEqual(await q("SELECT name FROM unnest($1::text[]) t(name) WHERE to_regclass('public.'||name) IS NULL",[names]),[]);};
 const env={DB},samples=[],profiles=[];
 for(const target of chosen)for(const visit of ['first','repeat']){
  const n=queries,start=performance.now(),result=await runtime.handlePlayerCard({path:'player-card',request:new Request('https://cnine-card.pages.dev/api/player-card?userId='+target.id),env,deps:{authenticate:async()=>({id:1,role:'OWNER'}),json:(body,status=200)=>({body,status}),pvpSettings:runtime.pvpSettings,resolvePvpTier:runtime.resolvePvpTier,pvpSeasonKey:runtime.pvpSeasonKey,readAccountRank:runtime.readAccountRank,readDuoHonors:runtime.readDuoHonors}});
  assert.equal(result.status,200);const vip=result.body.trophies.find(t=>t.code==='CNINE_VIP');if(phase==='before')assert.equal(vip,undefined);else{assert.equal(vip.progress,target.progress);assert.equal(vip.owned,target.progress===4);assert.equal(vip.goal,4);}
  samples.push({userId:target.id,progress:target.progress,visit,ms:Math.round(performance.now()-start),sql:queries-n});if(visit==='first')profiles.push({target,profile:result.body});
 }
 const explain=await q(`EXPLAIN (ANALYZE,FORMAT JSON) SELECT COUNT(DISTINCT avatar_code) progress FROM avatar_user_ownership_v1 WHERE user_id=$1 AND avatar_code=ANY($2::text[]) AND (expires_at IS NULL OR expires_at::timestamptz>CURRENT_TIMESTAMP)`,[chosen[0].id,CODES]);
 assert.deepEqual(await q('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins+n_tup_upd+n_tup_del>0'),[]);await c.query('ROLLBACK');save('service-'+(process.argv[3]||phase),{phase,head:git('rev-parse','HEAD'),readOnly:true,catalog,owners,qualified:owners.filter(u=>u.progress===4),samples,profiles,sqlSamples,explain,conditions:'Windows CLI, production player-card handler with all production read dependencies on live PostgreSQL; first/repeat on one connection, network included. No operating account mutations.'});console.log(JSON.stringify({phase,catalog,qualified:owners.filter(u=>u.progress===4),samples}));
}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error(safe(e));console.error(String(e.stack).split('\n').slice(1,4).join('\n'));process.exitCode=1;}finally{await c.end().catch(()=>{});}
