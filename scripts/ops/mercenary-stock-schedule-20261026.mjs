import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {changeMercenaryStockSchedule,processMercenaryStockSchedules,readMercenaryStockSchedules,readBloodmoonStockSnapshot} from '../../functions/_mercenary_stock_schedule.js';
import {STOCK_SCHEDULE_KEY} from '../../shared/mercenary-stock-schedule-v1.mjs';
export const FIRST_STOCK_RESERVATION=Object.freeze({action:'SCHEDULE_STOCK',requestId:'stock-20261026-2000-bloodmoon-ss10-leonel1-v1',executeAt:'2026-10-26T11:00:00.000Z',changes:[960,961,962,963,964,965,978].map(n=>({code:'V-'+n,quantity:n===978?1:10})),reason:'사용자 요청: 10월 26일 20:00 KST SS 블러드문 6종 각 10장, 레오넬 1장 한도 증가'});
const [mode,directory]=process.argv.slice(2);
if(!['read','rehearse','apply','verify'].includes(mode)||!directory)throw Error('Usage: read|rehearse|apply|verify <record directory>');
const out=path.resolve(directory);fs.mkdirSync(out,{recursive:true});
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'mercenary-stock-schedule-20261026',connectionTimeoutMillis:15000});
let nested=false;const observedSql=[];
const DB=new __postgresCompatTest.PostgresD1Database({query:async input=>{const sql=typeof input==='string'?input:input.text;observedSql.push(sql);const values=typeof input==='string'?[]:input.values||[];if(nested&&sql==='BEGIN')return db.query('SAVEPOINT schedule_rehearsal');if(nested&&sql==='COMMIT')return db.query('RELEASE SAVEPOINT schedule_rehearsal');if(nested&&sql==='ROLLBACK')return db.query('ROLLBACK TO SAVEPOINT schedule_rehearsal');return db.query(sql,values);}}),env={DB};
const hash=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
async function inspect(){
 const schedule=await readMercenaryStockSchedules(env),snapshot=await readBloodmoonStockSnapshot(env),settings=JSON.parse(snapshot.row.value);
 const issues=(await db.query('SELECT code,COUNT(*)::int AS count,MAX(serial)::int AS max_serial FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[]) GROUP BY code ORDER BY code',[FIRST_STOCK_RESERVATION.changes.map(c=>c.code)])).rows;
 const request=(await db.query('SELECT value FROM app_meta WHERE key=$1',[STOCK_SCHEDULE_KEY+':request:'+FIRST_STOCK_RESERVATION.requestId])).rows[0]?.value;
 const alarm=(await db.query('SELECT value FROM app_meta WHERE key=$1',['mercenary_stock_alarm_v1'])).rows[0]?.value;
 return {alarm:alarm?JSON.parse(alarm):null,serverNow:schedule.serverNow,packRevision:settings.revision,packHash:hash(settings),settings:settings.settings,stock:snapshot.stock,schedules:schedule.document,scheduleRaw:schedule.raw,issues,request:request?JSON.parse(request):null};
}
try{
 await db.connect();assert.equal((await db.query('SELECT role FROM users WHERE id=1')).rows[0]?.role,'OWNER');
 let result;
 if(mode==='read'||mode==='verify'){await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');result=await inspect();await db.query('ROLLBACK');}
 else{
  const before=await inspect(),reviewed=JSON.parse(fs.readFileSync(path.join(out,'read.json'),'utf8'));
  if(!before.request){assert.equal(before.packHash,reviewed.packHash,'Pack settings changed since review');assert.equal(before.scheduleRaw,reviewed.scheduleRaw,'Schedule list changed since review');}
  if(mode==='rehearse'){
   await db.query('BEGIN');nested=true;
   const registered=await changeMercenaryStockSchedule(env,{id:1,role:'OWNER'},FIRST_STOCK_RESERVATION);
   const pending=await inspect();assert.equal(pending.packHash,before.packHash);assert.deepEqual(pending.stock,before.stock);
   await processMercenaryStockSchedules(env,{clock:()=>Date.parse(FIRST_STOCK_RESERVATION.executeAt)-1});assert.deepEqual((await inspect()).stock,before.stock);
   const applied=await processMercenaryStockSchedules(env,{clock:()=>Date.parse(FIRST_STOCK_RESERVATION.executeAt)}),after=await inspect();
   for(const c of FIRST_STOCK_RESERVATION.changes){const old=before.stock.find(s=>s.code===c.code),now=after.stock.find(s=>s.code===c.code);assert.equal(Number(now.stock_limit),Number(old.stock_limit)+c.quantity);assert.equal(now.issued,old.issued);}
   assert.deepEqual(after.issues,before.issues);assert.deepEqual({...after.settings,stockLimits:before.settings.stockLimits},before.settings);
   await db.query('ROLLBACK');nested=false;const restored=await inspect();assert.equal(restored.packHash,before.packHash);assert.deepEqual(restored.stock,before.stock);assert.equal(restored.scheduleRaw,before.scheduleRaw);
   result={registered:registered.schedule,applied:applied.applied,afterStock:after.stock,rollbackVerified:true};
  }else{
   const receipt=await changeMercenaryStockSchedule(env,{id:1,role:'OWNER'},FIRST_STOCK_RESERVATION),after=await inspect();assert.equal(after.packHash,before.packHash);assert.deepEqual(after.stock,before.stock);assert.deepEqual(after.issues,before.issues);
   // Repeat with a separate SELECT-only adapter.
   const replayDB=new __postgresCompatTest.PostgresD1Database({query:input=>{const sql=typeof input==='string'?input:input.text;assert(/^SELECT\b/.test(sql));return db.query(sql,typeof input==='string'?[]:input.values||[]);}});
   const replay=await changeMercenaryStockSchedule({DB:replayDB},{id:1,role:'OWNER'},FIRST_STOCK_RESERVATION);assert(replay.replayed);
   result={...after,receipt,noWriteReplayVerified:true,accountWriteStatements:observedSql.filter(sql=>/^(UPDATE|INSERT INTO|DELETE FROM)\s+(users|user_mercenary_cards_v1|cnine_user_inventory|mercenary_limited_issues_v1)\b/i.test(sql)).length};
  }
 }
 fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({mode,alarm:result.alarm,serverNow:result.serverNow,stock:result.stock??result.afterStock,schedules:result.schedules?.schedules,rollbackVerified:result.rollbackVerified,noWriteReplayVerified:result.noWriteReplayVerified}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.stack||error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
