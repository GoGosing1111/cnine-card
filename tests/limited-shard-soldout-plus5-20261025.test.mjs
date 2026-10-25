import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import read from '../docs/qa/limited-shard-soldout-plus5-20261025/read.json' with {type:'json'};
import {OP,PLAN_HASH,TARGETS,inspect,increaseStock} from '../scripts/ops/limited-shard-soldout-plus5-20261025.mjs';
import {MERCENARY_CRAFTS} from '../shared/mercenary-craft-v1.mjs';
import {decorateMercenaryCraft} from '../functions/_mercenary_craft.js';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id bigint PRIMARY KEY,role text,status text);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE admin_logs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE TABLE workshop_recipes_v1668(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,code text UNIQUE,output_ref text);
 CREATE TABLE workshop_recipe_materials_v1668(recipe_id bigint,item_code text,quantity bigint);
 CREATE TABLE workshop_craft_logs_v1668(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,recipe_id bigint,output_type text,output_ref text,success int,output_quantity int);
 INSERT INTO users VALUES(1,'OWNER','ACTIVE');`);
 for(const s of read.stock.filter(s=>s.policyRaw))await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[s.key,s.policyRaw,'unchanged']);
 await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',['mercenary_bloodmoon_ss_pack_v1',JSON.stringify({enabled:true,ssLimit:25}),'unchanged']);
 for(const d of MERCENARY_CRAFTS){
  const id=(await db.query('INSERT INTO workshop_recipes_v1668(code,output_ref) VALUES($1,$2) RETURNING id',[d.recipeCode,d.code])).rows[0].id;
  await db.query('INSERT INTO workshop_recipe_materials_v1668 VALUES($1,$2,2)',[id,d.scope==='SSS_LIMITED_SHARD'?'MERCENARY_SSS_LIMITED_SHARD':'MERCENARY_SSS_CARD_SHARD']);
  if(TARGETS.some(t=>t.recipeCode===d.recipeCode))for(let i=0;i<5;i++)await db.query("INSERT INTO workshop_craft_logs_v1668(recipe_id,output_type,output_ref,success,output_quantity) VALUES($1,'MERCENARY',$2,1,1)",[id,d.code]);
  await db.query("INSERT INTO workshop_craft_logs_v1668(recipe_id,output_type,output_ref,success,output_quantity) VALUES($1,'MERCENARY',$2,0,99),($1,'MERCENARY','WRONG-REF',1,99),($1,'ITEM',$2,1,99)",[id,d.code]);
 }
 const env={DB:new __postgresCompatTest.PostgresD1Database({query:arg=>db.query(arg.text,arg.values)})};
 return {db,env};
}
const opts={expectedPlanHash:PLAN_HASH,dryRun:false};

test('four exhausted LIMITED recipes gain five each; actual player recipe read unlocks with original costs and issue counts',async t=>{
 const {db,env}=await fixture(t),before=await inspect(db);
 const playerBefore=await decorateMercenaryCraft(env,[]);assert.equal(playerBefore.filter(r=>TARGETS.some(t=>t.recipeCode===r.code)&&r.craftLocked).length,4);
 const result=await increaseStock(db,opts);assert.equal(result.committed,true);assert.equal(result.verification.totalAdded,20);
 const after=await inspect(db);for(const s of after.stock){const old=before.stock.find(b=>b.code===s.code);if(TARGETS.some(t=>t.code===s.code)){assert.equal(s.limit,10);assert.equal(s.crafted,5);assert.equal(s.remaining,5);assert.deepEqual({...s.policy,revision:old.policy.revision,stockLimit:old.policy.stockLimit},old.policy);}else assert.deepEqual(s,old);}
 for(const field of ['recipesHash','materialsHash','issuesHash'])assert.equal(after[field],before[field]);
 const playerAfter=await decorateMercenaryCraft(env,[]);for(const target of TARGETS){const row=playerAfter.find(r=>r.code===target.recipeCode);assert.equal(row.craftLocked,false);assert.equal(row.is_active,1);assert.deepEqual(row.craftStock,{limit:10,crafted:5,remaining:5,soldOut:false});}
 assert.equal(Number((await db.query('SELECT COUNT(*) n FROM admin_logs')).rows[0].n),5);
});

test('dry run restores all rows; final receipt failure rolls every increase and audit back',async t=>{
 const {db}=await fixture(t),before=await inspect(db);
 const dry=await increaseStock(db,{...opts,dryRun:true});assert.equal(dry.rollbackVerified,true);assert.deepEqual(await inspect(db),before);
 const fail={query:(sql,args)=>{if(sql.startsWith('INSERT INTO app_meta')&&args[0]===OP)throw Error('INJECTED_FINAL_RECEIPT_FAILURE');return db.query(sql,args);}};
 await assert.rejects(increaseStock(fail,opts),/INJECTED_FINAL_RECEIPT_FAILURE/);assert.deepEqual(await inspect(db),before);assert.equal(Number((await db.query('SELECT COUNT(*) n FROM admin_logs')).rows[0].n),0);
});

test('changed settings or changed depleted list reject before any increase',async t=>{
 const {db}=await fixture(t),key=TARGETS[0].key,raw=read.stock.find(s=>s.key===key).policyRaw;
 await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify({...JSON.parse(raw),successRate:99}),key]);
 const changed=await inspect(db);await assert.rejects(increaseStock(db,opts),/settings changed/);assert.deepEqual(await inspect(db),changed);
 await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[raw,key]);
 await db.query("DELETE FROM workshop_craft_logs_v1668 WHERE id=(SELECT MIN(l.id) FROM workshop_craft_logs_v1668 l JOIN workshop_recipes_v1668 r ON r.id=l.recipe_id WHERE r.code=$1 AND l.success=1 AND l.output_type='MERCENARY' AND l.output_ref=r.output_ref)",[TARGETS[0].recipeCode]);
 const notSoldOut=await inspect(db);await assert.rejects(increaseStock(db,opts),/Exhausted recipe list changed/);assert.deepEqual(await inspect(db),notSoldOut);
});

test('replay is SELECT-only, adds nothing, and tolerates subsequent legitimate crafts',async t=>{
 const {db}=await fixture(t);await increaseStock(db,opts);
 await db.query("INSERT INTO workshop_craft_logs_v1668(recipe_id,output_type,output_ref,success,output_quantity) SELECT id,'MERCENARY',output_ref,1,1 FROM workshop_recipes_v1668 WHERE code=$1",[TARGETS[0].recipeCode]);
 const before=await inspect(db),readOnly={query:(sql,args)=>{assert(/^SELECT\b/i.test(sql));assert(!/FOR UPDATE|pg_advisory|nextval/i.test(sql));return db.query(sql,args);}};
 const replay=await increaseStock(readOnly,opts);assert.equal(replay.replayed,true);assert.equal(replay.verification.targets[0].crafted,6);assert.equal(replay.verification.targets[0].remaining,4);assert.deepEqual(await inspect(db),before);
});
