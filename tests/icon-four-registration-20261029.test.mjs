import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {applyIconFour,inspectIconFour,OPERATION_KEY,MEMBER_IDS} from '../scripts/ops/icon-four-release-20261029.mjs';
import {ICON_EXPANSION_CARDS} from '../shared/icon-expansion-v1.mjs';
test('one atomic catalogue registration preserves settings and existing cards, rolls back all failure points and replays SELECT-only',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec(`CREATE TABLE users(id bigint PRIMARY KEY,role text,status text);
   INSERT INTO users VALUES(1,'OWNER','ACTIVE');
   CREATE TABLE members(id bigint PRIMARY KEY,name text,is_active int);
   CREATE TABLE cards(id text PRIMARY KEY,member_id bigint,title text,rarity text,rarity_override text,image_url text,focus_x int,focus_y int,is_active int,draw_weight int,card_status text,base_power bigint,reroll_material_enabled int,reroll_result_enabled int,batch_name text,batch_date text);
   CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at timestamp DEFAULT CURRENT_TIMESTAMP);
   CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
  for(const [i,c] of ICON_EXPANSION_CARDS.entries())await db.query('INSERT INTO members VALUES($1,$2,1)',[MEMBER_IDS[i],c.name]);
  await db.query("INSERT INTO cards(id,title,rarity_override,base_power) VALUES('LEGACY','기존','ICON',180000)");
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['icon_fusion_settings_v1',JSON.stringify({revision:3,enabled:true})]);
  const before=await inspectIconFour(db);
  for(const failAfter of [...ICON_EXPANSION_CARDS.map(c=>c.code),'receipt']){
   await assert.rejects(applyIconFour(db,{expectedStateHash:before.stateHash,failAfter}),/INJECTED_FAILURE/);
   assert.deepEqual(await inspectIconFour(db),before);assert.equal((await db.query('SELECT count(*)::int n FROM admin_logs')).rows[0].n,0);
  }
  await applyIconFour(db,{expectedStateHash:before.stateHash,dryRun:true});assert.deepEqual(await inspectIconFour(db),before);
  const result=await applyIconFour(db,{expectedStateHash:before.stateHash});assert.equal(result.receipt.cards.length,4);assert.equal(result.receipt.grants,0);
  const after=await inspectIconFour(db);assert.deepEqual(after.settings,before.settings);
  const readOnly={query(sql,args){assert.match(sql,/^SELECT\b/);return db.query(sql,args);}};
  const replay=await applyIconFour(readOnly);assert(replay.replayed);assert.equal(replay.receipt.auditId,result.receipt.auditId);
  assert.equal((await db.query('SELECT count(*)::int n FROM admin_logs')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0].n,1);
 }finally{await db.close();}
});
