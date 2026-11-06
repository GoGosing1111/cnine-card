import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {inspect,plan,apply,verify,hash,protectedHash,OP,CODE,COST} from '../scripts/ops/x-body-craft-20261106.mjs';
const releaseCommit='a'.repeat(40);
async function fixture(){
 const c=new PGlite();await c.exec(`
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,code TEXT,slot TEXT,is_active BIGINT,is_public BIGINT,image_url TEXT);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,category TEXT,is_active BIGINT);
 CREATE TABLE workshop_recipes_v1668(id BIGSERIAL PRIMARY KEY,code TEXT UNIQUE,category TEXT,name TEXT,description TEXT,output_type TEXT,output_ref TEXT,output_quantity BIGINT,payment_mode TEXT,coin_cost BIGINT,master_star_cost BIGINT,success_rate REAL,is_featured BIGINT,is_active BIGINT,is_public BIGINT,owner_test_only BIGINT,sort_order BIGINT);
 CREATE TABLE workshop_recipe_materials_v1668(recipe_id BIGINT,item_code TEXT,quantity BIGINT,sort_order BIGINT,PRIMARY KEY(recipe_id,item_code));
 INSERT INTO users VALUES(1,'OWNER','ACTIVE');
 INSERT INTO character_equipment_items VALUES(48,'BATTLE_SUIT_Z_BODY','BATTLE_SUIT',1,1,'/assets/ui/project-v/account-battle-suits/z-sword-v1/z-body.png'),(49,'BATTLE_SUIT_X_BODY','BATTLE_SUIT',1,1,'/assets/ui/project-v/account-battle-suits/x-sword-v1/x-body.png');
 INSERT INTO inventory_items VALUES('SUIT_CORE_6','MATERIAL',1),('SUIT_CORE_7','MATERIAL',1);
 INSERT INTO workshop_recipes_v1668(code,category,name,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_active,is_public,sort_order) VALUES('Z','BATTLE_SUIT_CRAFT','Z 제작','EQUIPMENT','48',1,'COIN_OR_MASTER_STAR',1000000000000,1000000,10,1,1,101);
 INSERT INTO workshop_recipe_materials_v1668 VALUES(1,'SUIT_CORE_6',10,10);
 `);return c;
}
test('X recipe follows Z ordering and the exact user cost without star payment',async()=>{
 const c=await fixture();try{const p=plan(await inspect(c));assert.equal(p.coin_cost,COST);assert.equal(COST,25000000000000);assert.equal(p.master_star_cost,0);assert.equal(p.payment_mode,'COIN_ONLY');assert.equal(p.success_rate,10);assert.equal(p.output_quantity,1);assert.equal(p.output_ref,'49');assert.equal(p.sort_order,102);assert.deepEqual(p.material,{item_code:'SUIT_CORE_7',quantity:10,sort_order:10});}finally{await c.close();}
});
test('registration rolls back intermediate writes and a complete rehearsal atomically',async()=>{
 const c=await fixture();try{const before=await inspect(c),expectedHash=hash(before);for(const failAt of ['recipe','material']){await assert.rejects(apply(c,{expectedHash,releaseCommit,failAt}),/INJECTED_X_CRAFT/);assert.equal(hash(await inspect(c)),expectedHash);}const r=await apply(c,{expectedHash,releaseCommit,dryRun:true});assert.equal(r.rolledBack,true);assert.equal(hash(await inspect(c)),expectedHash);assert.equal((await c.query('SELECT COUNT(*)::int n FROM admin_logs')).rows[0].n,0);}finally{await c.close();}
});
test('registration is one atomic recipe/material/audit/receipt and replay never overwrites later CMS settings',async()=>{
 const c=await fixture();try{const before=await inspect(c),r=await apply(c,{expectedHash:hash(before),releaseCommit,dryRun:false});assert.equal(r.committed,true);const v=await verify(c);assert.equal(v.material.quantity,10);assert.equal(protectedHash(await inspect(c)),protectedHash(before));await c.query('UPDATE workshop_recipes_v1668 SET success_rate=12 WHERE code=$1',[CODE]);const queries=[],wrapped={query:async(...args)=>{queries.push(args[0]);return c.query(...args);}};const replay=await apply(wrapped);assert.equal(replay.replayed,true);assert.equal(queries.length,1);assert.match(queries[0],/^SELECT /);assert.equal((await c.query('SELECT success_rate FROM workshop_recipes_v1668 WHERE code=$1',[CODE])).rows[0].success_rate,12);assert.equal((await c.query('SELECT COUNT(*)::int n FROM admin_logs')).rows[0].n,1);assert.equal((await c.query('SELECT COUNT(*)::int n FROM app_meta WHERE key=$1',[OP])).rows[0].n,1);}finally{await c.close();}
});
test('stale preflight cannot register over a concurrent CMS change',async()=>{
 const c=await fixture();try{const expectedHash=hash(await inspect(c));await c.exec("UPDATE workshop_recipes_v1668 SET success_rate=11 WHERE code='Z'");await assert.rejects(apply(c,{expectedHash,releaseCommit,dryRun:false}),/CMS changed/);assert.equal((await c.query('SELECT COUNT(*)::int n FROM workshop_recipes_v1668')).rows[0].n,1);}finally{await c.close();}
});
