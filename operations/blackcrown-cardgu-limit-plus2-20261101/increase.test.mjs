import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {blackcrownPackDraft} from '../../tmp/duo-settlement-recovery-20261027/shared/mercenary-blackcrown-pack-v1.mjs';
import {increase} from './increase.mjs';
import {OP,PACK,CODE,inspect} from './preflight.mjs';
async function fixture(){
 const db=new PGlite();await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT);INSERT INTO users VALUES(1,'OWNER','ACTIVE');
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE mercenary_limited_stock_v1(code TEXT PRIMARY KEY,stock_limit BIGINT,issued BIGINT,revision INTEGER,last_token TEXT);
 CREATE TABLE mercenary_limited_issues_v1(code TEXT,serial INTEGER,user_id BIGINT,request_id TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-970',5,4,9,'preserve'),('V-971',5,2,3,'other'),('SSS_MIRACLE_CUBE:V-978',5,5,6,'cube');
 INSERT INTO mercenary_limited_issues_v1 SELECT 'V-970',n,100+n,'draw-'||n FROM generate_series(1,4) n;`);
 await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[PACK,JSON.stringify({revision:8,settings:blackcrownPackDraft(),openingSchedule:{status:'SCHEDULED',opensAt:'2026-10-30T15:00:00.000Z'},lastStockScheduleId:'old-schedule'})]);
 for(const key of ['mercenary_blackcrown_stock_schedule_v1','mercenary_bloodmoon_ss_pack_v1','sss_miracle_cube_policy_20261021_v1'])await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify({preserve:key})]);
 return {db,before:await inspect(db)};
}
test('only Cardgu cap increases by two; issued, schedule, cube and odds remain unchanged; replay is read-only',async()=>{
 const {db,before}=await fixture();try{
  const result=await increase(db,{expectedDocumentHash:before.documentHash,dryRun:false});assert.equal(result.limit,7);assert.equal(result.issued,4);assert.equal(result.remaining,3);
  const after=await inspect(db);assert.deepEqual(after.protectedState,before.protectedState);assert.deepEqual(after.issues,before.issues);
  assert.deepEqual({...after.document.settings,stockLimits:before.document.settings.stockLimits},before.document.settings);assert.deepEqual(after.document.openingSchedule,before.document.openingSchedule);
  const readOnly={query(sql,args){assert(/^SELECT\b/.test(sql));return db.query(sql,args)}};
  assert((await increase(readOnly,{expectedDocumentHash:'stale'})).replayed);assert.deepEqual(await inspect(db),after);
  assert.equal((await db.query('SELECT id FROM admin_logs WHERE target_id=$1',[OP])).rows.length,1);
 }finally{await db.close()}
});
test('failure after stock update rolls both representations back',async()=>{
 const {db,before}=await fixture();try{await assert.rejects(()=>increase(db,{expectedDocumentHash:before.documentHash,injectFailure:true}),/INJECTED/);assert.deepEqual(await inspect(db),before)}finally{await db.close()}
});
test('stale policy hash cannot overwrite newer operator settings',async()=>{
 const {db,before}=await fixture();try{await assert.rejects(()=>increase(db,{expectedDocumentHash:'stale'}),/policy changed/);assert.deepEqual(await inspect(db),before)}finally{await db.close()}
});
test('normal rehearsal rolls back; mismatched issuance fails closed',async()=>{
 const {db,before}=await fixture();try{assert.equal((await increase(db,{expectedDocumentHash:before.documentHash})).limit,7);assert.deepEqual(await inspect(db),before);await db.query('UPDATE mercenary_limited_stock_v1 SET issued=3 WHERE code=$1',[CODE]);await assert.rejects(()=>increase(db,{expectedDocumentHash:before.documentHash}));assert.equal((await inspect(db)).receipt,null)}finally{await db.close()}
});
