import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {applyEquipmentRelease,readReleaseState,OPERATION_KEY} from '../scripts/ops/legion-equipment-release-20261029.mjs';
import {legionRegionDefaults,REGION_EQUIPMENT,LEGION_REGIONS_KEY} from '../shared/legion-regions-v1.mjs';
import {defaultLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from '../functions/_legion_hunt_settings.js';
test('catalog registration and settings are one transaction; failure, dry-run, idempotence and later edits survive',async()=>{
 const pg=new PGlite();const db={query:async(q,p)=>q==='SELECT current_database() db,pg_is_in_recovery() recovery'?{rows:[{db:'cnine',recovery:false}]}:pg.query(q,p)};
 try{
  await pg.exec(`CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
   CREATE TABLE users(id bigint PRIMARY KEY,role text,status text);INSERT INTO users VALUES(1,'OWNER','ACTIVE');
   CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
   CREATE TABLE character_equipment_items(id bigint PRIMARY KEY,code text UNIQUE,name text,slot text,subtype text DEFAULT '',rarity text,image_url text,description text,total_power bigint,pve_power bigint,pvp_power bigint,is_active bigint,is_public bigint,sort_order bigint,supply_enabled bigint,supply_weight double precision);`);
  const policy=legionRegionDefaults();policy.mode='ON';for(const [i,d]of policy.difficulties.entries())Object.assign(d.loot,{eliteSetPercent:i<3?0:.001,bossSetPercent:.06,bossUniquePercent:.015});
  for(const [key,value]of [[LEGION_REGIONS_KEY,policy],[LEGION_HUNT_SETTINGS_KEY,defaultLegionHuntPolicy()],['equipment_polish_settings_v1',{executionMode:'OFF'}]])await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
  for(const [i,g]of REGION_EQUIPMENT.entries())await db.query('INSERT INTO character_equipment_items(id,code,name,slot,rarity,total_power,pve_power,pvp_power,is_active,is_public,supply_enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,1,0)',[i+1,g.code,g.name,g.slot,g.rarity,g.totalPower,Math.floor(g.totalPower*.9),g.totalPower-Math.floor(g.totalPower*.9)]);
  const before=await readReleaseState(db),options={config:{baseExpectedRuns:210,tierExpectedRuns:Array.from({length:10},(_,i)=>420+i*170)},expectedSettings:before.settings,releaseCommit:'a'.repeat(40)};
  await assert.rejects(applyEquipmentRelease(db,{...options,failAfterCatalog:true}),/INJECTED_CATALOG_FAILURE/);assert.deepEqual(await readReleaseState(db),before);
  const dry=await applyEquipmentRelease(db,options);assert.equal(dry.receipt.created.length,50);assert.deepEqual(await readReleaseState(db),before);assert.equal((await db.query('SELECT * FROM admin_logs')).rows.length,0);
  const done=await applyEquipmentRelease(db,{...options,dryRun:false});assert.equal(done.receipt.created.length,50);assert.ok(done.receipt.created.every(g=>g.supply_enabled===0&&g.supply_weight===0));
  const after=await readReleaseState(db);assert.equal(after.gear.length,80);
  await db.query('BEGIN READ ONLY');assert.deepEqual((await applyEquipmentRelease(db)).receipt,done.receipt);await db.query('ROLLBACK');
  const changed={...JSON.parse(after.settings.find(s=>s.key===LEGION_REGIONS_KEY).value),revision:99};changed.ascendantDrops.enabled=false;
  await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(changed),LEGION_REGIONS_KEY]);
  assert.equal((await applyEquipmentRelease(db)).replayed,true);assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',[LEGION_REGIONS_KEY])).rows[0].value,JSON.stringify(changed));
  assert.equal((await db.query('SELECT * FROM admin_logs')).rows.length,1);assert.equal((await db.query('SELECT * FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,1);
 }finally{await pg.close();}
});
