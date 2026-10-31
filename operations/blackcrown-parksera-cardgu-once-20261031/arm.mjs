import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {__postgresCompatTest} from '../../tmp/duo-settlement-recovery-20261027/functions/_postgres_d1_compat.js';
import {readBlackcrownOnce,blackcrownOnceKey} from '../../tmp/duo-settlement-recovery-20261027/functions/_mercenary_blackcrown_once.js';
import {BLACKCROWN_PACK,blackcrownScheduledSettings} from '../../tmp/duo-settlement-recovery-20261027/shared/mercenary-blackcrown-pack-v1.mjs';

const mode=process.argv[2],OP='ops:blackcrown-parksera-cardgu-once:20261031:v1',ID=45,NICK='박세라-ㅂ-',CODE='V-970',key=blackcrownOnceKey(ID);
const dir=path.dirname(fileURLToPath(import.meta.url)),token=randomBytes(32).toString('hex');
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sourceHash=digest(['arm.mjs','lock-worker.mjs','wrangler.jsonc','preflight.json'].map(f=>fs.readFileSync(path.join(dir,f),'utf8')));
const preflight=JSON.parse(fs.readFileSync(path.join(dir,'preflight.json'),'utf8'));
assert.equal(preflight.operationKey,OP);assert.equal(preflight.target.userId,ID);assert.equal(preflight.target.nickname,NICK);assert.equal(preflight.readOnly,true);
assert(['dry-run','apply','verify'].includes(mode));
let db,server,lease=0,report,queryCount=0,writeStatements=0;
const remote=async action=>{const r=await fetch('http://127.0.0.1:'+server.port+'/'+action,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(30000)}),body=await r.json();assert(r.ok,body.error);return body;};
const receipt=async()=>{const row=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];return row?JSON.parse(row.value):null;};
const runtime=()=>new __postgresCompatTest.PostgresD1Database({query:i=>{const sql=typeof i==='string'?i:i.text;assert(/^SELECT\b/.test(sql));return db.query(sql,typeof i==='string'?[]:i.values||[]);}});
const checkReceipt=value=>{assert(value);assert.equal(value.operationKey,OP);assert.equal(value.userId,ID);assert.equal(value.nickname,NICK);assert.equal(value.entitlement.mercenaryCode,CODE);assert.equal(value.entitlement.remaining,1);};
try {
 db=connect();await db.connect();const original=db.query.bind(db);db.query=(sql,...args)=>{queryCount++;const text=typeof sql==='string'?sql:sql.text;if(/^(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(text.trim()))writeStatements++;return original(sql,...args);};
 const prior=await receipt();
 if(mode==='verify'||prior){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const saved=await receipt();checkReceipt(saved);const state=await readBlackcrownOnce(runtime(),ID);assert(state);assert.equal(state.mercenaryCode,CODE);assert(['ARMED','CONSUMED'].includes(state.status));
  const value=JSON.parse(state.before);assert.equal(value.operationId,OP);assert.equal(value.remaining,state.status==='ARMED'?1:0);
  await db.query('ROLLBACK');assert.equal(writeStatements,0);report={sourceHash,receipt:saved,runtime:state,readOnly:true,replayed:Boolean(prior),writeStatements,queryCount};
 }else{
  if(mode==='apply'){const dry=JSON.parse(fs.readFileSync(path.join(dir,'arm-dry-run.json'),'utf8'));assert.equal(dry.sourceHash,sourceHash);assert(dry.rollbackVerified&&dry.injectedRollback&&dry.locksReleased);}
  const {unstable_dev}=await import('wrangler');server=await unstable_dev(path.join(dir,'lock-worker.mjs'),{config:path.join(dir,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+300000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
  const locked=await remote('acquire');assert(locked.acquired);lease=locked.leaseUntil;assert((await remote('state')).owned);
  assert.equal((await db.query('INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id',[ID,token,OP,lease,Date.now()])).rowCount,1);
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='2s'");await db.query("SET LOCAL statement_timeout='15s'");assert((await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok',[OP])).rows[0].ok);
  const user=(await db.query('SELECT id::text,nickname,status,coin::text,md5(row_to_json(u)::text) AS row_hash FROM users u WHERE id=$1 FOR UPDATE',[ID])).rows[0];assert.equal(user.nickname,NICK);assert.equal(user.status,'ACTIVE');
  const identity=(await db.query('SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[ID])).rows;assert.equal(identity.length,1);assert.equal(digest({provider:identity[0].provider,providerId:identity[0].provider_user_id}),preflight.target.identityHash);
  const owner=(await db.query('SELECT role,status FROM users WHERE id=1')).rows[0];assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
  assert.equal(await receipt(),null);assert.equal((await db.query('SELECT 1 FROM app_meta WHERE key=$1',[key])).rowCount,0,'Existing entitlement must not be overwritten');
  assert.equal((await db.query("SELECT 1 FROM admin_logs WHERE target_id=$1 AND action_type IN ('MERCENARY_BLACKCROWN_CARD_ONCE_ARMED','MERCENARY_BLACKCROWN_CARD_ONCE_CONSUMED')",[String(ID)])).rowCount,0,'Existing history requires review');
  assert.equal((await db.query("SELECT 1 FROM joint_operations_v1 WHERE user_id=$1 AND kind='MERCENARY_BLACKCROWN_OPEN' AND status='PENDING'",[ID])).rowCount,0,'Finish existing opening first');
  const now=(await db.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now.toISOString();
  const packRow=(await db.query("SELECT value FROM app_meta WHERE key='mercenary_blackcrown_ss_pack_v1' FOR SHARE")).rows[0];assert(packRow);const scheduled=blackcrownScheduledSettings(JSON.parse(packRow.value),now);assert.equal(scheduled.settings.mode,'ON');assert(scheduled.settings.cardRatesPpm[CODE]>0);
  const stock=(await db.query('SELECT stock_limit::int,issued::int,revision FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[CODE])).rows[0];assert(stock&&stock.issued<stock.stock_limit,'Cardgu stock exhausted');assert.equal(stock.stock_limit,scheduled.settings.stockLimits[CODE]);
  const ownedBefore=(await db.query('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code',[ID])).rows;
  const entitlement={version:1,status:'ARMED',remaining:1,userId:ID,packId:BLACKCROWN_PACK.id,mercenaryCode:CODE,actorId:1,operationId:OP,createdAt:now,reason:'사용자 요청: 박세라-ㅂ- 다음 정상 블랙크라운팩 개봉에서 카드구 1장 1회 지정. 기존 개봉 비용과 발행 한도 적용.'};
  const write=async()=>{
   await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(entitlement)]);
   const audit=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'MERCENARY_BLACKCROWN_CARD_ONCE_ARMED','USER',$1,NULL,$2) RETURNING id::text",[String(ID),JSON.stringify(entitlement)])).rows[0].id;
   const result={operationKey:OP,userId:ID,nickname:NICK,entitlement,audit,identityHash:preflight.target.identityHash,stockAtRegistration:stock,accountWrites:0};
   await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OP,JSON.stringify(result)]);return result;
  };
  if(mode==='dry-run'){
   await db.query('SAVEPOINT injected');await write();await assert.rejects(db.query('SELECT 1/0'));await db.query('ROLLBACK TO SAVEPOINT injected');
   assert.equal(await receipt(),null);assert.equal((await db.query('SELECT 1 FROM app_meta WHERE key=$1',[key])).rowCount,0);assert.equal((await db.query("SELECT 1 FROM admin_logs WHERE target_id=$1 AND action_type='MERCENARY_BLACKCROWN_CARD_ONCE_ARMED'",[String(ID)])).rowCount,0);
  }
  const result=await write();assert.equal((await readBlackcrownOnce(runtime(),ID)).mercenaryCode,CODE);
  assert.deepEqual((await db.query('SELECT id::text,nickname,status,coin::text,md5(row_to_json(u)::text) AS row_hash FROM users u WHERE id=$1',[ID])).rows[0],user);
  assert.deepEqual((await db.query('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code',[ID])).rows,ownedBefore);
  assert.equal((await db.query("SELECT value FROM app_meta WHERE key='mercenary_blackcrown_ss_pack_v1'")).rows[0].value,packRow.value);
  assert.deepEqual((await db.query('SELECT stock_limit::int,issued::int,revision FROM mercenary_limited_stock_v1 WHERE code=$1',[CODE])).rows[0],stock);
  assert(lease>Date.now()+5000);assert((await remote('state')).owned);
  const preservation={accountRow:true,mercenaryCollection:true,packSettings:true,stock:true};
  if(mode==='dry-run'){
   await db.query('ROLLBACK');assert.equal(await receipt(),null);assert.equal((await db.query('SELECT 1 FROM app_meta WHERE key=$1',[key])).rowCount,0);
   assert.equal((await db.query("SELECT 1 FROM admin_logs WHERE target_id=$1 AND action_type='MERCENARY_BLACKCROWN_CARD_ONCE_ARMED'",[String(ID)])).rowCount,0);
   report={sourceHash,rollbackVerified:true,injectedRollback:true,preservation,proposed:result};
  }else{await db.query('COMMIT');report={sourceHash,...result,preservation};}
 }
}catch(e){await db?.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{
 try{
  if(db&&lease){await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2',[ID,token]);assert.equal((await db.query('SELECT 1 FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2',[ID,token])).rowCount,0);}
  if(server){await remote('release');assert(!(await remote('state')).anyOwned);if(report)report.locksReleased=true;}
 }finally{await server?.stop();await db?.end();}
}
if(report){const name=mode==='apply'&&report.replayed?'arm-replay.json':'arm-'+mode+'.json';fs.writeFileSync(path.join(dir,name),JSON.stringify(report,null,2)+'\n',{flag:mode==='verify'?'w':'wx'});console.log(JSON.stringify({mode,audit:report.audit??report.receipt?.audit,status:report.entitlement?.status??report.runtime?.status,rollback:report.rollbackVerified,readOnly:report.readOnly,writeStatements:report.writeStatements,locksReleased:report.locksReleased}));}
