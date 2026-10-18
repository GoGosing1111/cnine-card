import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {increaseLegionEquipmentOdds,enableLegionEquipment,OPERATION_KEY,EQUIPMENT_PERCENT_KEYS} from '../scripts/ops/legion-equipment-enable-20261018.mjs';
import {legionRegionDefaults,REGION_EQUIPMENT,LEGION_REGIONS_KEY} from '../shared/legion-regions-v1.mjs';
import {defaultLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from '../functions/_legion_hunt_settings.js';
import {validateRegionPolicy} from '../functions/_legion_regions.js';
import {regionKillLoot} from '../shared/legion-region-loot-v1.mjs';
function current(){const p=legionRegionDefaults();p.mode='OFF';p.revision=5;for(const [i,d] of p.difficulties.entries())for(const k of EQUIPMENT_PERCENT_KEYS)d.loot[k]=k==='eliteSetPercent'&&i<3?0:.001;return p;}

test('equipment 50% increase retains zero and other policy, enables maps, supports exact .0015% roll boundaries',()=>{
 const before=current(),{policy,changes}=increaseLegionEquipmentOdds(before);assert.equal(changes.length,12);assert.equal(policy.mode,'ON');assert.equal(policy.revision,6);assert.ok(policy.regions.every(r=>r.enabled));
 for(const [i,d] of policy.difficulties.entries())for(const k of EQUIPMENT_PERCENT_KEYS)assert.equal(d.loot[k],before.difficulties[i].loot[k]? .0015:0);
 const a=structuredClone(before),b=structuredClone(policy);for(const p of [a,b]){delete p.mode;delete p.revision;for(const d of p.difficulties)for(const k of EQUIPMENT_PERCENT_KEYS)delete d.loot[k];}assert.deepEqual(a,b);
 assert.deepEqual(validateRegionPolicy(policy),policy);
 const invalid=structuredClone(policy);invalid.difficulties[0].loot.bossSetPercent=.00151;assert.throws(()=>validateRegionPolicy(invalid));
 for(const region of policy.regions){const p={regionId:region.id,regionLoot:policy.difficulties[0].loot,items:REGION_EQUIPMENT.filter(i=>i.regionId===region.id)};
  assert.equal(regionKillLoot(p,{boss:true},()=>.000015).length,0);
  assert.equal(regionKillLoot(p,{boss:true},()=>.000014999).length,2);
 }
});

test('enable operation atomically opens 30 regional items, preserves supply and economy; dry-run, failure and replay are safe',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id INTEGER,role TEXT,status TEXT);INSERT INTO users VALUES(1,'OWNER','ACTIVE');
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ);
 CREATE TABLE character_equipment_items(id INTEGER PRIMARY KEY,code TEXT,name TEXT,is_active INTEGER,is_public INTEGER,supply_enabled INTEGER,supply_weight INTEGER);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,is_active INTEGER);INSERT INTO inventory_items VALUES('EQUIPMENT_POLISH_STONE',1);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 const source=defaultLegionHuntPolicy();source.mode='ON';
 for(const [key,value] of [[LEGION_HUNT_SETTINGS_KEY,source],[LEGION_REGIONS_KEY,current()],['equipment_polish_settings_v1',{executionMode:'OFF'}]])await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(value)]);
 for(const [i,item] of REGION_EQUIPMENT.entries())await db.query('INSERT INTO character_equipment_items VALUES($1,$2,$3,0,0,0,0)',[i+1,item.code,item.name]);
 const client={query:(sql,args=[])=>sql.includes('current_database()')?Promise.resolve({rows:[{db:'cnine',recovery:false}]}):db.query(sql,args)};
 const read=async key=>(await db.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0]?.value;
 const before=await read(LEGION_REGIONS_KEY);
 const dry=await enableLegionEquipment(client);assert.equal(dry.dryRun,true);assert.equal(dry.receipt.changes.length,12);assert.equal(await read(LEGION_REGIONS_KEY),before);assert.equal(await read(OPERATION_KEY),undefined);
 const failing={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('audit write failed')):client.query(sql,args)};
 await assert.rejects(enableLegionEquipment(failing,{apply:true}),/audit write failed/);assert.equal(await read(LEGION_REGIONS_KEY),before);assert.equal((await db.query('SELECT sum(is_active) n FROM character_equipment_items')).rows[0].n,0);
 const applied=await enableLegionEquipment(client,{apply:true});assert.equal(applied.receipt.mode,'ON');assert.equal(applied.receipt.accountGrants,0);
 const gear=(await db.query('SELECT * FROM character_equipment_items')).rows;assert.equal(gear.length,30);assert.ok(gear.every(r=>r.is_active===1&&r.is_public===1&&r.supply_enabled===0&&r.supply_weight===0));
 const changed=JSON.parse(await read(LEGION_REGIONS_KEY));changed.difficulties[0].loot.bossSetPercent=0;
 await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(changed),LEGION_REGIONS_KEY]);assert.equal((await enableLegionEquipment(client,{apply:true})).replayed,true);assert.deepEqual(JSON.parse(await read(LEGION_REGIONS_KEY)),changed);
 assert.equal(await read(LEGION_HUNT_SETTINGS_KEY),JSON.stringify(source));assert.equal(Number((await db.query('SELECT COUNT(*) n FROM admin_logs')).rows[0].n),1);
});
