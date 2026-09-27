import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestedMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {PGlite} from '@electric-sql/pglite';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {replaceBerkanWithCryvern,disableBerkanAcquisition,OPERATION_KEY,SOURCE_ACQUISITION} from '../scripts/ops/jjok-berkan-cryvern-20260927.mjs';
async function fixture({existing=false,equipped=true,failAudit=false,owned=true}={}){
 const db=new PGlite();await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT,card_shards BIGINT,magic_crystals BIGINT);
 INSERT INTO users VALUES(1,'관리자','OWNER','ACTIVE',0,0,0),(303,'[C9]족쪽이','USER','ACTIVE',100,200,300),(304,'다른계정','USER','ACTIVE',10,20,30);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE mercenary_draw_config_v1(id INTEGER PRIMARY KEY,payload_json TEXT,revision INTEGER DEFAULT 1,last_request_id TEXT,updated_by BIGINT,updated_at TEXT);
 CREATE TABLE mercenary_draw_audit_v1(request_id TEXT PRIMARY KEY,actor_id BIGINT,payload_hash TEXT,revision INTEGER,reason TEXT,before_json TEXT,after_json TEXT,created_at TEXT);
 INSERT INTO mercenary_draw_config_v1(id,payload_json) VALUES(1,'{"cardRules":{"cardWeights":{"V-055":0}}}');
 CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT,revision INTEGER,updated_at TEXT);
 INSERT INTO user_mercenary_loadout_v1 VALUES(303,'${equipped?'V-055':'V-048'}',12,'original');
 CREATE TABLE user_mercenary_growth_v1(user_id BIGINT,mercenary_code TEXT,level INTEGER,PRIMARY KEY(user_id,mercenary_code));
 INSERT INTO user_mercenary_growth_v1 VALUES(303,'V-049',5),(303,'V-055',4);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT ${failAudit?"CHECK(action_type='REJECTED')":''},target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await db.exec(sql);
 await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(303,'V-048',2,1,'original','original'),(304,'V-055',1,0,'original','original')");
 if(owned)await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(303,'V-055',1,0,'original','original')");
 if(existing)await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(303,'V-049',2,1,'original','original')");
 await db.query('INSERT INTO mercenary_card_acquisitions_v1 VALUES($1,303,$2,0,1,0,$3)',[SOURCE_ACQUISITION,'V-055','original']);
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 return {db,q};
}
async function transaction(db,q){await db.exec('BEGIN');try{const r=await replaceBerkanWithCryvern(q);await db.exec('COMMIT');return r;}catch(e){await db.exec('ROLLBACK');throw e;}}
async function snapshot(q){const state={};for(const table of ['users','user_mercenary_cards_v1','mercenary_card_acquisitions_v1','user_mercenary_loadout_v1','user_mercenary_growth_v1','app_meta','admin_logs'])state[table]=await q(`SELECT * FROM ${table} ORDER BY 1,2`);return state;}
for(const existing of [false,true])test(`one-for-one replacement, equipped slot and retry (Cryvern owned=${existing})`,async()=>{
 const {db,q}=await fixture({existing});try{
  const before=await snapshot(q),r=await transaction(db,q),after=await snapshot(q);
  assert.equal(r.quantity,1);assert.equal(r.destinationCopiesAfter,existing?3:1);assert.equal(r.sourceCopiesAfter,0);assert.equal(r.loadoutReplaced,true);
  assert.equal(after.user_mercenary_loadout_v1[0].mercenary_code,'V-049');assert.equal(after.user_mercenary_loadout_v1[0].revision,13);
  for(const key of ['users','user_mercenary_growth_v1'])assert.deepEqual(after[key],before[key]);
  assert.deepEqual(after.mercenary_card_acquisitions_v1.find(a=>a.acquisition_id===SOURCE_ACQUISITION),before.mercenary_card_acquisitions_v1[0]);
  assert.equal(after.mercenary_card_acquisitions_v1.filter(a=>a.acquisition_id===OPERATION_KEY).length,1);assert.equal(after.admin_logs.length,1);
  assert.equal((await transaction(db,q)).replayed,true);assert.deepEqual(await snapshot(q),after);
 }finally{await db.close();}
});
test('another equipped mercenary is preserved',async()=>{const {db,q}=await fixture({equipped:false});try{const before=await snapshot(q);await transaction(db,q);assert.deepEqual((await snapshot(q)).user_mercenary_loadout_v1,before.user_mercenary_loadout_v1);}finally{await db.close();}});
test('audit failure rolls back removal, new ownership, loadout and receipt together',async()=>{const {db,q}=await fixture({failAudit:true});try{const before=await snapshot(q);await assert.rejects(()=>transaction(db,q),/check constraint/);assert.deepEqual(await snapshot(q),before);}finally{await db.close();}});
test('absent source does not grant a free replacement',async()=>{const {db,q}=await fixture({owned:false});try{const before=await snapshot(q);assert.equal((await transaction(db,q)).status,'NOT_OWNED');assert.deepEqual(await snapshot(q),before);}finally{await db.close();}});
test('nickname mismatch is rejected without writes',async()=>{const {db,q}=await fixture();try{await q("UPDATE users SET nickname='다른계정' WHERE id=303");const before=await snapshot(q);await assert.rejects(()=>transaction(db,q));assert.deepEqual(await snapshot(q),before);}finally{await db.close();}});

for(const failAudit of [false,true])test(`CMS OFF is audited, retry-safe and atomic (fail audit=${failAudit})`,async()=>{const {db,q}=await fixture({failAudit});try{const policy=suggestedMercenaryDraw();policy.cardRules.cardWeights={"V-055":17,"V-049":500};await q("UPDATE mercenary_draw_config_v1 SET payload_json=$1",[JSON.stringify(policy)]);const call=async()=>{await db.exec("BEGIN");try{const r=await disableBerkanAcquisition(q);await db.exec("COMMIT");return r;}catch(e){await db.exec("ROLLBACK");throw e;}};if(failAudit){await assert.rejects(call);assert.deepEqual(JSON.parse((await q("SELECT payload_json FROM mercenary_draw_config_v1"))[0].payload_json),policy);}else{const r=await call();assert.equal(r.weightAfter,0);const after=JSON.parse((await q("SELECT payload_json FROM mercenary_draw_config_v1"))[0].payload_json);assert.deepEqual(after,{...policy,cardRules:{...policy.cardRules,cardWeights:{"V-049":500,"V-055":0}}});assert.equal((await call()).replayed,true);assert.equal((await q("SELECT * FROM mercenary_draw_audit_v1")).length,1);}}finally{await db.close();}});
