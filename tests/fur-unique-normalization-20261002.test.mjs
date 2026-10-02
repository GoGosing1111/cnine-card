import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {DatabaseSync} from 'node:sqlite';
import {normalizeFurUnique,verifyFurUniqueNormalization,CONFIG_KEY,OPERATION_KEY,EXPECTED_BEFORE,EXPECTED_AFTER,ACTION_TYPE} from '../scripts/ops/fur-unique-normalization-20261002.mjs';
import {cardUniqueDeckStates} from '../functions/_magic.js';
import {buildFighter} from '../functions/_battle_v2_preview.js';
async function fixture(){
 const db=new PGlite();await db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT);INSERT INTO users VALUES(1,'OWNER','ACTIVE',123);CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,breakthrough_level INT);INSERT INTO user_cards VALUES(2,'CHEETAH',287,14);CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[CONFIG_KEY,JSON.stringify(EXPECTED_BEFORE),'before']);
 await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',['zenith_master_star_breakthrough_v1802','{"uniqueBoostPercent":60}','protected']);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){const result={};for(const name of ['app_meta','users','user_cards','admin_logs'])result[name]=(await db.query('SELECT * FROM '+name+' ORDER BY 1')).rows;return result;}
test('approved CMS update changes only two boost fields and replay never reapplies',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),result=await normalizeFurUnique(client);
  assert.equal(result.dryRun,false);assert.deepEqual(result.verification.multipliers,[1.3,1.6,2,2.5,3]);
  const reverted=structuredClone(EXPECTED_AFTER);reverted.steps[3].uniqueBoostPercent=200;reverted.steps[4].uniqueBoostPercent=500;assert.deepEqual(reverted,EXPECTED_BEFORE);
  const after=await snapshot(db);assert.deepEqual(after.users,before.users);assert.deepEqual(after.user_cards,before.user_cards);
  assert.deepEqual(after.app_meta.find(r=>r.key.startsWith('zenith_')),before.app_meta.find(r=>r.key.startsWith('zenith_')));assert.equal(after.admin_logs.length,1);assert.equal(after.admin_logs[0].action_type,ACTION_TYPE);
  assert.equal((await normalizeFurUnique(client)).replayed,true);assert.deepEqual(await snapshot(db),after);assert.equal((await verifyFurUniqueNormalization(client)).status,'VERIFIED');
 }finally{await db.close();}
});
test('dry run, changed CMS values and partial failures roll back the setting, receipt and audit',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db);await normalizeFurUnique(client,{dryRun:true});assert.deepEqual(await snapshot(db),before);
  const changed=structuredClone(EXPECTED_BEFORE);changed.steps[0].cost+=1;await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(changed),CONFIG_KEY]);
  const conflict=await snapshot(db);await assert.rejects(normalizeFurUnique(client),/changed after review/);assert.deepEqual(await snapshot(db),conflict);
  await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(EXPECTED_BEFORE),CONFIG_KEY]);
  const restored=await snapshot(db),failing={query:async(sql,args)=>{if(sql.startsWith('INSERT INTO admin_logs'))throw new Error('Injected audit failure');return client.query(sql,args)}};
  await assert.rejects(normalizeFurUnique(failing),/Injected audit failure/);assert.deepEqual(await snapshot(db),restored);
 }finally{await db.close();}
});
test('lost commit acknowledgement recovers the completed receipt without duplicate audit or reset',async()=>{
 const {db,client}=await fixture();try{
  let dropped=false;const uncertain={query:async(sql,args)=>{const result=await client.query(sql,args);if(sql==='COMMIT'&&!dropped){dropped=true;throw new Error('Commit response lost')}return result}};
  await assert.rejects(normalizeFurUnique(uncertain),/Commit response lost/);const committed=await snapshot(db);
  assert.equal((await normalizeFurUnique(client)).replayed,true);assert.deepEqual(await snapshot(db),committed);assert.equal(committed.admin_logs.length,1);
  await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify({status:'COMPLETED',operationKey:OPERATION_KEY}),OPERATION_KEY]);
  await assert.rejects(normalizeFurUnique(client));assert.equal((await db.query('SELECT COUNT(*) AS count FROM admin_logs')).rows[0].count,1);
 }finally{await db.close();}
});
test('actual PVE and PVP runtime scales the approved stages once; +13 and base HP stay unchanged',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE card_unique_effects(card_id TEXT PRIMARY KEY,attack_percent REAL,defense_percent REAL,hp_percent REAL,speed_percent REAL,effect_name TEXT,effect_description TEXT,effect_type TEXT,trigger_type TEXT,effect_value REAL,trigger_chance REAL,max_activations INTEGER,scope_pve INTEGER,scope_pvp INTEGER,scope_captain INTEGER,is_active INTEGER);INSERT INTO card_unique_effects VALUES('CHEETAH',30,30,0,50,'','','NONE','PASSIVE',0,100,1,1,1,1,1);CREATE TABLE card_unique_advancements_v1937(user_id INTEGER,card_id TEXT,class_code TEXT,dominant_type TEXT,config_version INTEGER,modifiers_json TEXT,activated_at TEXT);`);
 const save=(key,value)=>db.prepare('INSERT INTO app_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
 save('card_unique_effect_settings_v1',{enabled:true});save('card_unique_advancement_settings_v1937_release',{mode:'OFF'});
 const env={DB:{prepare(sql){let args=[];const stmt=db.prepare(sql),wrapped={bind(...values){args=values;return wrapped},async all(){return {results:stmt.all(...args)}},async first(){return stmt.get(...args)||null}};return wrapped}}};
 try{for(const mode of ['PVE','PVP']){
  const entries=[13,14,15].map((level,index)=>({user:{id:1,role:'USER'},cards:[{id:'CHEETAH',rarity:'FUR',breakthrough_level:level,power:[83200,124800,195200][index]}]}));
  save(CONFIG_KEY,EXPECTED_BEFORE);const before=await cardUniqueDeckStates(env,entries,mode,{fresh:true,batched:true});
  save(CONFIG_KEY,EXPECTED_AFTER);const after=await cardUniqueDeckStates(env,entries,mode,{fresh:true,batched:true});
  assert.deepEqual(after[0],before[0]);assert.deepEqual(after.map(s=>s.cards[0].uniqueAbility.attackPercent),[60,75,90]);assert.deepEqual(after.map(s=>s.cards[0].uniqueAbility.speedPercent),[100,125,150]);
  for(let i=0;i<3;i++){
   const raw=entries[i].cards[0],previous=buildFighter(raw,0,'A',before[i].cards[0].uniqueAbility,mode),next=buildFighter(raw,0,'A',after[i].cards[0].uniqueAbility,mode);
   assert.equal(next.maxHp,previous.maxHp);assert.equal(next.breakthroughLevel,previous.breakthroughLevel);assert.equal(next.uniqueAbility.hpPercent,0);
   if(i>0){assert.ok(next.attack<previous.attack);assert.ok(next.defense<previous.defense);assert.ok(next.speed<previous.speed);}
  }
 }}finally{db.close();}
});
