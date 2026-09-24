import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {grantPinkCryvern,OPERATION_KEY} from '../scripts/ops/pink-cryvern-grant-20260924.mjs';

async function fixture({existing=false,failAudit=false}={}){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT,card_shards BIGINT,magic_crystals BIGINT);
 INSERT INTO users VALUES(1,'핑크빛유두','OWNER','ACTIVE',123,456,789),(2,'다른유저','USER','ACTIVE',10,20,30);
 CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,revision INTEGER,payload_json TEXT);
 CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT,revision INTEGER);
 INSERT INTO user_mercenary_loadout_v1 VALUES(1,'V-046',3);
 CREATE TABLE user_mercenary_growth_v1(user_id BIGINT,mercenary_code TEXT,level INTEGER,experience BIGINT,revision INTEGER,PRIMARY KEY(user_id,mercenary_code));
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT ${failAudit?"CHECK(action_type='REJECTED')":''},target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await db.exec(sql);
 await db.query('INSERT INTO mercenary_cms_documents_v1 VALUES($1,57,$2)',['config',JSON.stringify(seed.document)]);
 await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-046',3,2,'original','original'),(2,'V-049',1,0,'original','original')");
 if(existing)await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(1,'V-049',2,1,'original','original');INSERT INTO user_mercenary_growth_v1 VALUES(1,'V-049',5,123,2)");
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 return {db,q};
}
async function transaction(db,q){await db.exec('BEGIN');try{const result=await grantPinkCryvern(q);await db.exec('COMMIT');return result}catch(error){await db.exec('ROLLBACK');throw error}}
async function snapshot(q){const result={};for(const table of ['users','user_mercenary_cards_v1','mercenary_card_acquisitions_v1','mercenary_card_atomic_guard_v1','user_mercenary_loadout_v1','user_mercenary_growth_v1','app_meta','admin_logs'])result[table]=await q(`SELECT * FROM ${table} ORDER BY 1,2`);return result}

for(const existing of [false,true])test(`one-copy grant preserves balances/loadout/growth; replay never duplicates (existing=${existing})`,async()=>{
 const {db,q}=await fixture({existing});try{
  const before=await snapshot(q),receipt=await transaction(db,q),after=await snapshot(q);
  assert.equal(receipt.quantity,1);assert.equal(receipt.totalCopies,existing?3:1);
  assert.equal(receipt.duplicates,existing?2:0);assert.equal(after.mercenary_card_acquisitions_v1.length,1);
  assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);
  for(const table of ['users','user_mercenary_loadout_v1','user_mercenary_growth_v1','mercenary_card_atomic_guard_v1'])assert.deepEqual(after[table],before[table]);
  const unrelated=rows=>rows.filter(row=>Number(row.user_id)!==1||row.mercenary_code!=='V-049');
  assert.deepEqual(unrelated(after.user_mercenary_cards_v1),unrelated(before.user_mercenary_cards_v1));
  assert.equal((await transaction(db,q)).replayed,true);assert.deepEqual(await snapshot(q),after);
 }finally{await db.close()}
});

test('audit failure rolls ownership, acquisition and operation receipt back together',async()=>{
 const {db,q}=await fixture({failAudit:true});try{const before=await snapshot(q);await assert.rejects(()=>transaction(db,q),/check constraint/);assert.deepEqual(await snapshot(q),before)}finally{await db.close()}
});
