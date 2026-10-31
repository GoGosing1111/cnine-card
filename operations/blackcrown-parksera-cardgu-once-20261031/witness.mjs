import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {__postgresCompatTest} from '../../tmp/duo-settlement-recovery-20261027/functions/_postgres_d1_compat.js';
import {readBlackcrownOnce,blackcrownOnceCode} from '../../tmp/duo-settlement-recovery-20261027/functions/_mercenary_blackcrown_once.js';
import {blackcrownScheduledSettings} from '../../tmp/duo-settlement-recovery-20261027/shared/mercenary-blackcrown-pack-v1.mjs';
const OP='ops:blackcrown-parksera-cardgu-once:20261031:v1',ID=45,CODE='V-970',KEY='mercenary_blackcrown_card_once_v1:45';
const preflight=JSON.parse(fs.readFileSync(new URL('./preflight.json',import.meta.url),'utf8'));
const applied=JSON.parse(fs.readFileSync(new URL('./arm-apply.json',import.meta.url),'utf8'));
let db;
try{
 db=connect();await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 const q=async(sql,args=[])=>{assert(/^SELECT\b/.test(sql));return(await db.query(sql,args)).rows;};
 const now=(await q('SELECT CURRENT_TIMESTAMP AS now'))[0].now;
 const user=(await q('SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=$1',[ID]))[0];
 assert.equal(user.nickname,'박세라-ㅂ-');assert.equal(user.status,'ACTIVE');assert.equal(createHash('sha256').update(JSON.stringify({provider:user.provider,providerId:user.provider_user_id})).digest('hex'),preflight.target.identityHash);
 const values=new Map((await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[[OP,KEY,'mercenary_blackcrown_ss_pack_v1']])).map(r=>[r.key,JSON.parse(r.value)]));
 const receipt=values.get(OP),entitlement=values.get(KEY);assert.deepEqual(receipt.entitlement,applied.entitlement);assert.equal(receipt.audit,applied.audit);assert.equal(receipt.userId,ID);assert.equal(receipt.operationKey,OP);
 assert.equal(entitlement.userId,ID);assert.equal(entitlement.operationId,OP);assert.equal(entitlement.mercenaryCode,CODE);assert(['ARMED','CONSUMED'].includes(entitlement.status));assert.equal(entitlement.remaining,entitlement.status==='ARMED'?1:0);
 const audits=await q("SELECT id::text,action_type,target_type,target_id,created_at,before_data,after_data FROM admin_logs WHERE target_id=$1 AND action_type IN ('MERCENARY_BLACKCROWN_CARD_ONCE_ARMED','MERCENARY_BLACKCROWN_CARD_ONCE_CONSUMED') ORDER BY id",[String(ID)]);
 const registration=audits.filter(a=>a.action_type==='MERCENARY_BLACKCROWN_CARD_ONCE_ARMED');assert.equal(registration.length,1);assert.equal(registration[0].id,receipt.audit);assert.deepEqual(JSON.parse(registration[0].after_data),receipt.entitlement);
 const consumed=audits.filter(a=>a.action_type==='MERCENARY_BLACKCROWN_CARD_ONCE_CONSUMED');assert.equal(consumed.length,entitlement.status==='CONSUMED'?1:0);
 const pack=values.get('mercenary_blackcrown_ss_pack_v1');assert.deepEqual(pack,preflight.meta.find(r=>r.key==='mercenary_blackcrown_ss_pack_v1').document);
 const stock=(await q('SELECT code,stock_limit::int,issued::int,revision FROM mercenary_limited_stock_v1 WHERE code=$1',[CODE]))[0];assert.equal(stock.stock_limit,receipt.stockAtRegistration.stock_limit);assert(stock.issued>=receipt.stockAtRegistration.issued&&stock.issued<=stock.stock_limit);
 const DB=new __postgresCompatTest.PostgresD1Database({query:i=>{const sql=typeof i==='string'?i:i.text;assert(/^SELECT\b/.test(sql));return db.query(sql,typeof i==='string'?[]:i.values||[]);}});
 const runtime=await readBlackcrownOnce(DB,ID);assert.equal(runtime.mercenaryCode,CODE);assert.equal(runtime.status,entitlement.status);
 let acquisition=null;
 if(entitlement.status==='ARMED'){
  const state={oneTimeRewardState:runtime,settings:blackcrownScheduledSettings(pack,now.toISOString()).settings,stock:[{code:CODE,prepared:true,remaining:stock.stock_limit-stock.issued}]};assert.equal(blackcrownOnceCode(state),CODE);
 }else{
  assert.equal(entitlement.acquisitionId,entitlement.requestId+':0');assert.deepEqual(JSON.parse(consumed[0].after_data),entitlement);
  const rows=await q('SELECT a.acquisition_id,a.user_id::text,a.mercenary_code,l.serial,l.request_id FROM mercenary_card_acquisitions_v1 a JOIN mercenary_limited_issues_v1 l ON l.acquisition_id=a.acquisition_id AND l.user_id=a.user_id AND l.code=a.mercenary_code WHERE a.acquisition_id=$1 AND a.user_id=$2',[entitlement.acquisitionId,ID]);assert.equal(rows.length,1);acquisition=rows[0];assert.equal(acquisition.mercenary_code,CODE);assert.equal(acquisition.request_id,entitlement.requestId);
 }
 assert.equal((await q('SELECT 1 FROM user_mutation_locks_v1520 WHERE user_id=$1 AND action_path=$2',[ID,OP])).length,0);
 await db.query('ROLLBACK');const report={verifiedAt:new Date().toISOString(),serverNow:now,readOnly:true,writeStatements:0,operationKey:OP,userId:ID,nickname:user.nickname,receipt,entitlement,runtime:{name:runtime.name,mercenaryCode:runtime.mercenaryCode,status:runtime.status},stock,audits,acquisition,packSettingsPreserved:true,operationLocksReleased:true};
 fs.writeFileSync(new URL('./independent-readonly.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({readOnly:true,writeStatements:0,userId:ID,nickname:user.nickname,card:runtime.name,status:entitlement.status,remaining:entitlement.remaining,audit:receipt.audit,registeredAt:registration[0].created_at,operationLocksReleased:true}));
}catch(e){await db?.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db?.end();}
