import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import read from './fixtures/limited-shard-all-plus5-20261027.json' with {type:'json'};
import {OP,PLAN_HASH,TARGETS,inspect,increaseStock} from '../scripts/ops/limited-shard-all-plus5-20261027.mjs';
import {MERCENARY_CRAFTS,mercenaryCraftDraft} from '../shared/mercenary-craft-v1.mjs';
import {decorateMercenaryCraft} from '../functions/_mercenary_craft.js';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
const options={expectedPlanHash:PLAN_HASH,dryRun:false};
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
 for(const row of read.ordinaryPolicies)await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[row.key,row.value,'unchanged']);
 for(const key of ['mercenary_bloodmoon_ss_pack_v1','mercenary_blackcrown_ss_pack_v1'])await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[key,JSON.stringify({enabled:false,limit:5}),'unchanged']);
 for(const d of MERCENARY_CRAFTS){
  const id=(await db.query('INSERT INTO workshop_recipes_v1668(code,output_ref) VALUES($1,$2) RETURNING id',[d.recipeCode,d.code])).rows[0].id;
  await db.query('INSERT INTO workshop_recipe_materials_v1668 VALUES($1,$2,2)',[id,d.scope==='SSS_LIMITED_SHARD'?'MERCENARY_SSS_LIMITED_SHARD':'MERCENARY_SSS_CARD_SHARD']);
  const count=TARGETS.find(t=>t.recipeCode===d.recipeCode)?.crafted??0;
  for(let i=0;i<count;i++)await db.query("INSERT INTO workshop_craft_logs_v1668(recipe_id,output_type,output_ref,success,output_quantity) VALUES($1,'MERCENARY',$2,1,1)",[id,d.code]);
  await db.query("INSERT INTO workshop_craft_logs_v1668(recipe_id,output_type,output_ref,success,output_quantity) VALUES($1,'MERCENARY',$2,0,99),($1,'MERCENARY','WRONG-REF',1,99),($1,'ITEM',$2,1,99)",[id,d.code]);
 }
 return {db,env:{DB:new __postgresCompatTest.PostgresD1Database({query:arg=>db.query(arg.text,arg.values)})}};
}
test('all 12 registered recipes gain exactly five; four reopen and eight retain unconfigured OFF states',async t=>{
 const {db,env}=await fixture(t),before=await inspect(db),playerBefore=await decorateMercenaryCraft(env,[]);
 assert.equal(playerBefore.filter(r=>TARGETS.some(t=>t.recipeCode===r.code)&&r.craftLocked).length,4);
 const result=await increaseStock(db,options);assert.equal(result.committed,true);assert.equal(result.verification.totalAdded,60);
 const after=await inspect(db);
 for(const s of after.stock){const old=before.stock.find(b=>b.code===s.code);assert.equal(s.limit,old.limit+5);assert.equal(s.crafted,old.crafted);assert.equal(s.remaining,old.remaining+5);assert.deepEqual({...s.policy,revision:old.policy.revision,stockLimit:old.policy.stockLimit},old.policy);}
 for(const field of ['recipesHash','materialsHash','issuesHash'])assert.equal(after[field],before[field]);
 const admin=await decorateMercenaryCraft(env,[],{admin:true}),player=await decorateMercenaryCraft(env,[]);
 for(const target of TARGETS){const row=admin.find(r=>r.code===target.recipeCode),old=before.stock.find(s=>s.code===target.code);assert.deepEqual(row.craftStock,{limit:target.after,crafted:target.crafted,remaining:target.after-target.crafted,soldOut:false});assert.equal(row.is_public,Number(old.policy.isPublic));assert.equal(row.craftConfiguredActive,old.policy.isActive);assert.equal(row.craftLocked,!old.policy.isActive);assert.equal(player.some(r=>r.code===target.recipeCode),old.policy.isPublic);}
 assert.equal(Number((await db.query('SELECT COUNT(*) n FROM admin_logs')).rows[0].n),13);
});
test('dry run and actual SQL failure roll back all caps, newly created draft rows, receipts and audits',async t=>{
 const {db}=await fixture(t),before=await inspect(db);
 const dry=await increaseStock(db,{...options,dryRun:true});assert.equal(dry.rollbackVerified,true);assert.deepEqual(await inspect(db),before);
 const failure={query:(sql,args)=>sql.startsWith('INSERT INTO app_meta')&&args[0]===OP?db.query('SELECT 1/0'):db.query(sql,args)};
 await assert.rejects(increaseStock(failure,options),error=>error.code==='22012');assert.deepEqual(await inspect(db),before);
 assert.equal(Number((await db.query('SELECT COUNT(*) n FROM admin_logs')).rows[0].n),0);
});
test('changed configured policy cannot be overwritten or partially increased',async t=>{
 const {db}=await fixture(t),target=TARGETS[0],raw=read.stock.find(s=>s.key===target.key).policyRaw;
 await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify({...JSON.parse(raw),successRate:99}),target.key]);
 const before=await inspect(db);await assert.rejects(increaseStock(db,options),/settings changed/);assert.deepEqual(await inspect(db),before);
});
test('a concurrent draft initialization is preserved and rejects the reviewed absent-row plan',async t=>{
 const {db}=await fixture(t),target=TARGETS.find(t=>t.expectedRevision===0),definition=MERCENARY_CRAFTS.find(d=>d.key===target.key);
 await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[target.key,JSON.stringify(mercenaryCraftDraft(definition)),'other-owner']);
 const before=await inspect(db);await assert.rejects(increaseStock(db,options),/settings changed/);assert.deepEqual(await inspect(db),before);
});
test('replay is SELECT-only and preserves subsequent legitimate crafting',async t=>{
 const {db}=await fixture(t);await increaseStock(db,options);
 await db.query("INSERT INTO workshop_craft_logs_v1668(recipe_id,output_type,output_ref,success,output_quantity) SELECT id,'MERCENARY',output_ref,1,1 FROM workshop_recipes_v1668 WHERE code=$1",[TARGETS[0].recipeCode]);
 const before=await inspect(db),noWrites={query:(sql,args)=>{assert(/^SELECT\b/i.test(sql));assert(!/FOR UPDATE|pg_advisory|nextval/i.test(sql));return db.query(sql,args);}};
 const replay=await increaseStock(noWrites,options);assert.equal(replay.replayed,true);assert.equal(replay.verification.targets[0].crafted,11);assert.equal(replay.verification.targets[0].remaining,4);assert.deepEqual(await inspect(db),before);
});
