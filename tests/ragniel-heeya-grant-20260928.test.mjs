import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {grantRagnielToHeeya} from '../scripts/ops/ragniel-heeya-grant-20260928.mjs';

async function fixture(copies=0) {
 const db=new PGlite();
 await db.exec(`
 CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT,card_shards BIGINT,magic_crystals BIGINT);
 INSERT INTO users VALUES(1,'운영자','OWNER','ACTIVE',1,2,3),(4977,'하이희야♡','USER','ACTIVE',4,5,6),(22,'다른유저','USER','ACTIVE',10,11,12);
 CREATE TABLE mercenary_draw_config_v1(id INTEGER PRIMARY KEY,payload_json TEXT);
 INSERT INTO mercenary_draw_config_v1 VALUES(1,'{}');
 CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,revision INTEGER,payload_json TEXT);
 CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT,revision INTEGER);
 INSERT INTO user_mercenary_loadout_v1 VALUES(4977,'V-049',5);
 CREATE TABLE user_mercenary_growth_v1(user_id BIGINT,mercenary_code TEXT,level INTEGER,experience BIGINT,revision INTEGER,PRIMARY KEY(user_id,mercenary_code));
 INSERT INTO user_mercenary_growth_v1 VALUES(4977,'V-046',12,345,4);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 `);
 for(const sql of MERCENARY_ACCOUNTING_SCHEMA) await db.exec(sql);
 await db.query("INSERT INTO mercenary_cms_documents_v1 VALUES('config',71,$1)",[JSON.stringify(seed.document)]);
 await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(4977,'V-049',1,0,'original','original'),(22,'V-046',1,0,'other','other')");
 if(copies) await db.query("INSERT INTO user_mercenary_cards_v1 VALUES(4977,'V-046',$1,$2,'original','original')",[copies,copies-1]);
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const run=async()=>{
  await db.exec('BEGIN');
  try {const result=await grantRagnielToHeeya(q);await db.exec('COMMIT');return result;}
  catch(error){await db.exec('ROLLBACK');throw error;}
 };
 const tables=['users','user_mercenary_cards_v1','mercenary_card_acquisitions_v1','mercenary_card_atomic_guard_v1','user_mercenary_loadout_v1','user_mercenary_growth_v1','mercenary_cms_documents_v1','mercenary_draw_config_v1','app_meta','admin_logs'];
 const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await q('SELECT * FROM '+table+' ORDER BY 1,2')])));
 return {db,q,run,snapshot};
}

for(const copies of [0,2]) test(`grant one permanent SSS Ragniel with ${copies} existing copies; preserve other state and prevent duplicate retry`,async()=>{
 const f=await fixture(copies);
 try {
  const before=await f.snapshot(),result=await f.run(),after=await f.snapshot();
  assert.equal(result.count,1);assert.equal(result.rank,'SSS');assert.equal(result.permanent,true);
  assert.deepEqual(result.recipients.map(r=>[r.userId,r.nickname,r.beforeCopies,r.totalCopies,r.duplicateCount]),[[4977,'하이희야♡',copies,copies+1,copies]]);
  assert.equal(after.mercenary_card_acquisitions_v1.length,1);assert.equal(after.admin_logs.length,1);
  for(const table of ['users','mercenary_card_atomic_guard_v1','user_mercenary_loadout_v1','user_mercenary_growth_v1','mercenary_cms_documents_v1','mercenary_draw_config_v1'])assert.deepEqual(after[table],before[table]);
  const other=r=>Number(r.user_id)!==4977||r.mercenary_code!=='V-046';
  assert.deepEqual(after.user_mercenary_cards_v1.filter(other),before.user_mercenary_cards_v1.filter(other));
  assert.equal((await f.run()).replayed,true);assert.deepEqual(await f.snapshot(),after);
 }finally{await f.db.close();}
});

test('audit failure rolls ownership, acquisition and receipt back together',async()=>{
 const f=await fixture();
 try {
  await f.q("ALTER TABLE admin_logs ADD CONSTRAINT reject_grant CHECK(target_id<>'4977')");
  const before=await f.snapshot();await assert.rejects(f.run,/reject_grant/);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.db.close();}
});

test('disabled acquisition or changed target identity prevents the grant',async()=>{
 const f=await fixture();
 try {
  await f.q('UPDATE mercenary_draw_config_v1 SET payload_json=$1 WHERE id=1',[JSON.stringify({cardRules:{cardWeights:{'V-046':0}}})]);
  let before=await f.snapshot();await assert.rejects(f.run,/acquisition is OFF/);assert.deepEqual(await f.snapshot(),before);
  await f.q("UPDATE mercenary_draw_config_v1 SET payload_json='{}' WHERE id=1");
  await f.q("UPDATE users SET nickname='다른이름' WHERE id=4977");
  before=await f.snapshot();await assert.rejects(f.run);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.db.close();}
});
