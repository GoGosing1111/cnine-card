import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {grantHeeyaCryvern} from '../scripts/ops/heeya-cryvern-grant-20260925.mjs';
import {revokeHeeyaCryvern,GRANT_KEY,OPERATION_KEY} from '../scripts/ops/heeya-cryvern-revoke-20260925.mjs';

async function fixture({extra=0,equipped=false,failAudit=false}={}){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT,card_shards BIGINT,magic_crystals BIGINT);
 INSERT INTO users VALUES(1,'핑크빛유두','OWNER','ACTIVE',100,200,300),(4977,'하이희야♡','USER','ACTIVE',123,456,789),(2,'다른유저','USER','ACTIVE',10,20,30);
 CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,revision INTEGER,payload_json TEXT);
 CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT,revision INTEGER,updated_at TEXT);
 INSERT INTO user_mercenary_loadout_v1 VALUES(4977,'V-021',5,'original');
 CREATE TABLE user_mercenary_growth_v1(user_id BIGINT,mercenary_code TEXT,level INTEGER,experience BIGINT,revision INTEGER,PRIMARY KEY(user_id,mercenary_code));
 INSERT INTO user_mercenary_growth_v1 VALUES(4977,'V-049',1,0,0);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT ${failAudit?"CHECK(action_type<>'OPS_MERCENARY_REVOKE')":''},target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await db.exec(sql);
 await db.query('INSERT INTO mercenary_cms_documents_v1 VALUES($1,57,$2)',['config',JSON.stringify(seed.document)]);
 await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(4977,'V-021',2,1,'original','original'),(2,'V-049',1,0,'original','original')");
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 await transaction(db,()=>grantHeeyaCryvern(q));
 if(extra)await q("UPDATE user_mercenary_cards_v1 SET total_copies=total_copies+$1,duplicate_count=duplicate_count+$1 WHERE user_id=4977 AND mercenary_code='V-049'",[extra]);
 if(equipped)await db.exec("UPDATE user_mercenary_loadout_v1 SET mercenary_code='V-049',revision=6 WHERE user_id=4977");
 return {db,q};
}
async function transaction(db,fn){await db.exec('BEGIN');try{const result=await fn();await db.exec('COMMIT');return result}catch(error){await db.exec('ROLLBACK');throw error}}
async function snapshot(q){const result={};for(const table of ['users','user_mercenary_cards_v1','mercenary_card_acquisitions_v1','mercenary_card_atomic_guard_v1','user_mercenary_loadout_v1','user_mercenary_growth_v1','mercenary_cms_documents_v1','app_meta','admin_logs'])result[table]=await q(`SELECT * FROM ${table} ORDER BY 1,2`);return result}
for(const [extra,equipped] of [[0,false],[0,true],[2,true]])test(`revoke one source grant only, preserve later copies; replay is safe (extra=${extra}, equipped=${equipped})`,async()=>{
 const {db,q}=await fixture({extra,equipped});try{
  const before=await snapshot(q),receipt=await transaction(db,()=>revokeHeeyaCryvern(q)),after=await snapshot(q);
  assert.equal(receipt.quantity,1);assert.equal(receipt.remainingCopies,extra);assert.equal(receipt.sourceGrantKey,GRANT_KEY);
  assert.equal(receipt.loadoutCleared,equipped&&!extra);assert.equal(receipt.operationKey,OPERATION_KEY);
  for(const table of ['users','user_mercenary_growth_v1','mercenary_cms_documents_v1','mercenary_card_acquisitions_v1','mercenary_card_atomic_guard_v1'])assert.deepEqual(after[table],before[table]);
  const others=rows=>rows.filter(row=>Number(row.user_id)!==4977||row.mercenary_code!=='V-049');
  assert.deepEqual(others(after.user_mercenary_cards_v1),others(before.user_mercenary_cards_v1));
  if(equipped&&!extra){assert.equal(after.user_mercenary_loadout_v1[0].mercenary_code,null);assert.equal(after.user_mercenary_loadout_v1[0].revision,7)}
  else assert.deepEqual(after.user_mercenary_loadout_v1,before.user_mercenary_loadout_v1);
  assert.equal((await transaction(db,()=>revokeHeeyaCryvern(q))).replayed,true);assert.deepEqual(await snapshot(q),after);
  assert.equal((await transaction(db,()=>grantHeeyaCryvern(q))).replayed,true);assert.deepEqual(await snapshot(q),after);
 }finally{await db.close()}
});
test('audit failure rolls back removal and slot change',async()=>{
 const {db,q}=await fixture({equipped:true,failAudit:true});try{const before=await snapshot(q);await assert.rejects(()=>transaction(db,()=>revokeHeeyaCryvern(q)),/check constraint/);assert.deepEqual(await snapshot(q),before)}finally{await db.close()}
});
test('missing source receipt prevents removal',async()=>{
 const {db,q}=await fixture();try{await q('DELETE FROM app_meta WHERE key=$1',[GRANT_KEY]);const before=await snapshot(q);await assert.rejects(()=>transaction(db,()=>revokeHeeyaCryvern(q)),/Original grant receipt/);assert.deepEqual(await snapshot(q),before)}finally{await db.close()}
});
test('missing owned copy fails without removing any other card',async()=>{
 const {db,q}=await fixture();try{await q("DELETE FROM user_mercenary_cards_v1 WHERE user_id=4977 AND mercenary_code='V-049'");const before=await snapshot(q);await assert.rejects(()=>transaction(db,()=>revokeHeeyaCryvern(q)),/No copy available/);assert.deepEqual(await snapshot(q),before)}finally{await db.close()}
});
