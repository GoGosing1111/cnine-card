import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {reduceLegionEquipmentOdds,applyLegionEquipmentRarity,OPERATION_KEY,EQUIPMENT_PERCENT_KEYS} from '../scripts/ops/legion-equipment-extreme-rare-20261018.mjs';
import {legionRegionDefaults,REGION_EQUIPMENT,LEGION_REGIONS_KEY} from '../shared/legion-regions-v1.mjs';
import {defaultLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from '../functions/_legion_hunt_settings.js';
import {regionKillLoot} from '../shared/legion-region-loot-v1.mjs';
import {applyMiracleDropChance} from '../functions/_miracle_burning.js';
import {rewardDropWithBonus} from '../shared/collection-bonuses-v1.mjs';

test('every positive equipment rate is capped, zero stays off and unrelated policy is preserved',()=>{
 const original=legionRegionDefaults();original.mode='OFF';original.revision=4;
 for(const d of original.difficulties.slice(0,3))d.loot.eliteSetPercent=0;
 for(const d of original.difficulties.slice(3)){d.loot.eliteSetPercent=.001;d.loot.bossSetPercent=.001;}
 const {policy,changes}=reduceLegionEquipmentOdds(original);
 assert.equal(policy.revision,5);assert.equal(changes.length,8);
 const protectedBefore=structuredClone(original),protectedAfter=structuredClone(policy);
 for(let i=0;i<5;i++)for(const key of EQUIPMENT_PERCENT_KEYS){
  assert.equal(policy.difficulties[i].loot[key],Math.min(original.difficulties[i].loot[key],.001));
  delete protectedBefore.difficulties[i].loot[key];delete protectedAfter.difficulties[i].loot[key];
 }
 protectedAfter.revision=protectedBefore.revision;assert.deepEqual(protectedAfter,protectedBefore);
 assert.deepEqual(reduceLegionEquipmentOdds(policy),{policy,changes:[]});
});

test('real loot RNG honors 0.001% boundaries for all 30 items; set choice divides by five',()=>{
 const policy=reduceLegionEquipmentOdds(legionRegionDefaults()).policy;
 const below=.000009999,edge=.00001;
 for(const region of policy.regions)for(const d of policy.difficulties){
  const items=REGION_EQUIPMENT.filter(i=>i.regionId===region.id);
  const input={regionId:region.id,regionLoot:d.loot,items};
  assert.deepEqual(regionKillLoot(input,{boss:true},()=>edge),[]);
  const rolls=[below,.7,below];const loot=regionKillLoot(input,{boss:true},()=>rolls.shift());
  assert.deepEqual(loot.map(i=>i.kind),['UNIQUE','SET']);assert.equal(loot[1].code,items.filter(i=>i.kind==='SET')[3].code);
  assert.equal(.001/items.filter(i=>i.kind==='SET').length,.0002);
  assert.equal(regionKillLoot(input,{elite:true},()=>edge).length,0);
  assert.equal(regionKillLoot(input,{elite:true},()=>below).length,1);
 }
 assert.ok(Math.abs(rewardDropWithBonus(applyMiracleDropChance(.001,30),50)-.00195)<1e-12);
});

test('production operation is atomic, dry-run rolls back, replay preserves later owner edits',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id INTEGER,role TEXT,status TEXT);INSERT INTO users VALUES(1,'OWNER','ACTIVE');
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ);
 CREATE TABLE character_equipment_items(id INTEGER PRIMARY KEY,code TEXT,name TEXT,is_active INTEGER,is_public INTEGER,supply_enabled INTEGER);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 const regional=legionRegionDefaults();regional.mode='OFF';
 const source=defaultLegionHuntPolicy();source.mode='ON';
 for(const [key,value] of [[LEGION_HUNT_SETTINGS_KEY,source],[LEGION_REGIONS_KEY,regional],['equipment_polish_settings_v1',{executionMode:'OFF'}]])await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
 for(const [i,item] of REGION_EQUIPMENT.entries())await db.query('INSERT INTO character_equipment_items VALUES($1,$2,$3,0,0,0)',[i+1,item.code,item.name]);
 const client={query:(sql,args=[])=>sql.includes('current_database()')?Promise.resolve({rows:[{db:'cnine',recovery:false}]}):db.query(sql,args)};
 const read=async key=>(await db.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0]?.value;
 const before=await read(LEGION_REGIONS_KEY);
 const dry=await applyLegionEquipmentRarity(client);assert.equal(dry.dryRun,true);assert.equal(dry.receipt.changes.length,15);
 assert.equal(await read(LEGION_REGIONS_KEY),before);assert.equal(await read(OPERATION_KEY),undefined);
 const failing={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('audit write failed')):client.query(sql,args)};
 await assert.rejects(applyLegionEquipmentRarity(failing,{apply:true}),/audit write failed/);
 assert.equal(await read(LEGION_REGIONS_KEY),before);assert.equal(await read(OPERATION_KEY),undefined);
 const applied=await applyLegionEquipmentRarity(client,{apply:true});assert.equal(applied.receipt.mode,'OFF');assert.equal(applied.receipt.equipmentCount,30);
 const changed=JSON.parse(await read(LEGION_REGIONS_KEY));changed.difficulties[0].loot.bossSetPercent=0;
 await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(changed),LEGION_REGIONS_KEY]);
 const replay=await applyLegionEquipmentRarity(client,{apply:true});assert.equal(replay.replayed,true);
 assert.deepEqual(JSON.parse(await read(LEGION_REGIONS_KEY)),changed);
 assert.equal(Number((await db.query('SELECT COUNT(*) n FROM admin_logs')).rows[0].n),1);
 assert.equal(await read(LEGION_HUNT_SETTINGS_KEY),JSON.stringify(source));
});
