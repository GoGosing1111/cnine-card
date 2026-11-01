import fs from 'node:fs';import assert from 'node:assert/strict';import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {__postgresCompatTest} from '../../tmp/cardgu-live-20261027/functions/_postgres_d1_compat.js';
import {readTrophyHonors,readRenewedTrophyHonors} from '../../tmp/cardgu-live-20261027/functions/_trophy_honors.js';
import {TROPHY_RENEWAL_KEY,parseTrophyRenewal,RENEWED_TROPHY_CODES} from '../../tmp/cardgu-live-20261027/functions/_trophy_renewal.js';
const OP='ops:trophy-renewal:20261101:v1',mode=process.argv[2],out=new URL('./',import.meta.url),oldCodes=['CHALLENGER_STREAK_3','CLAN_CHAMPIONS_TROPHY','CLAN_CHAMPION'];let db;
const adapter=(cutover=null)=>new __postgresCompatTest.PostgresD1Database({async query(input){const q=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];assert(/^\s*(SELECT|WITH)\b/i.test(q),'Read-only projection');if(cutover&&q.includes('FROM app_meta WHERE key=')&&values[0]===TROPHY_RENEWAL_KEY)return {rows:[{value:JSON.stringify(cutover)}],rowCount:1};return db.query(q,values);}});
const existing=async()=>{const r=(await db.query('SELECT value FROM app_meta WHERE key=$1',[TROPHY_RENEWAL_KEY])).rows[0];return r?parseTrophyRenewal(r.value):null;};
try{
 assert(['preflight','apply','verify'].includes(mode));db=connect();await db.connect();
 const identity=(await db.query('SELECT current_database() AS database,current_user AS actor,pg_is_in_recovery() AS replica')).rows[0];assert.deepEqual(identity,{database:'cnine',actor:'cnine_migrator',replica:false});
 let result;
 if(mode==='preflight'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");assert.equal(await existing(),null);
  const record={version:1,launchedAt:new Date(Math.ceil(Date.now()/1000)*1000).toISOString()},ids=(await db.query("SELECT DISTINCT user_id::text FROM pvp_season_settlement_ranks WHERE tier_id='challenger' AND final_rank BETWEEN 1 AND 20 ORDER BY user_id::text LIMIT 3")).rows.map(r=>Number(r.user_id));assert(ids.length);
  const profiles=[];
  for(const id of ids){const start=Date.now(),before=await readTrophyHonors({DB:adapter()},id),after=await readTrophyHonors({DB:adapter(record)},id);for(const code of oldCodes)for(const key of ['count','progress','acquiredAt'])assert.equal(after[code][key],before[code][key],code+' '+key);for(const code of RENEWED_TROPHY_CODES)assert.equal(after[code].count,0);profiles.push({id,old:Object.fromEntries(oldCodes.map(c=>[c,before[c]])),new:Object.fromEntries(RENEWED_TROPHY_CODES.map(c=>[c,after[c]])),elapsedMs:Date.now()-start});}
  const blackwing=(await db.query("SELECT status,COUNT(*)::int count FROM raid_blackwing_rooms_v1 GROUP BY status")).rows;
  const bonuses=(await db.query("SELECT value FROM app_meta WHERE key='trophy_reward_bonuses_v1'")).rows[0]?.value||null;
  await db.query('ROLLBACK');result={readOnly:true,profiles,blackwing,bonuses,productionAccountWrites:0};
 }else if(mode==='apply'){
  const deployed=JSON.parse(fs.readFileSync(new URL('./live-verification.json',out),'utf8'));assert.equal(deployed.pages.status,'success');assert(deployed.sourceCommit);
  const prior=await existing();if(prior){assert.equal(prior.operationKey,OP);result={replayed:true,record:prior};}
  else{
   await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);assert.equal(await existing(),null);
   const actor=(await db.query("SELECT id,role FROM users WHERE id=1 AND role='OWNER'")).rows[0];assert(actor);
   const now=Number((await db.query('SELECT EXTRACT(EPOCH FROM clock_timestamp())*1000 AS ms')).rows[0].ms),record={version:1,launchedAt:new Date(Math.ceil(now/1000)*1000).toISOString(),operationKey:OP,sourceCommit:deployed.sourceCommit,oldCodes,newCodes:RENEWED_TROPHY_CODES,retroactive:false,accountWrites:0};parseTrophyRenewal(JSON.stringify(record));
   const log=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'TROPHY_DESIGN_CUTOVER','APP_META',$1,NULL,$2) RETURNING id",[TROPHY_RENEWAL_KEY,JSON.stringify(record)])).rows[0];record.auditId=String(log.id);
   await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[TROPHY_RENEWAL_KEY,JSON.stringify(record)]);await db.query('COMMIT');result={replayed:false,record};
  }
 }else{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");const record=await existing();assert(record);assert.equal(record.operationKey,OP);
  const pre=JSON.parse(fs.readFileSync(new URL('./preflight.json',out),'utf8')),profiles=[];
  for(const p of pre.profiles){const start=Date.now(),h=await readRenewedTrophyHonors({DB:adapter()},p.id);for(const code of oldCodes)assert(h[code].count>=p.old[code].count);profiles.push({id:p.id,honors:h,elapsedMs:Date.now()-start});}
  assert.equal((await db.query("SELECT value FROM app_meta WHERE key='trophy_reward_bonuses_v1'")).rows[0]?.value||null,pre.bonuses);
  const audits=(await db.query("SELECT id::text FROM admin_logs WHERE action_type='TROPHY_DESIGN_CUTOVER' AND target_id=$1",[TROPHY_RENEWAL_KEY])).rows;assert.deepEqual(audits,[{id:record.auditId}]);assert.deepEqual(await existing(),record);await db.query('ROLLBACK');result={record,profiles,readOnly:true,bonusSettingsUnchanged:true,accountWrites:0,messagesSent:0};
 }
 fs.writeFileSync(new URL('./'+mode+'.json',out),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({mode,record:result.record,profiles:result.profiles?.map(p=>({id:p.id,elapsedMs:p.elapsedMs})),readOnly:result.readOnly}));
}catch(e){await db?.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db?.end();}
