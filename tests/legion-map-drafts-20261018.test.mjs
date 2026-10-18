import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {fillLegionMapDrafts,prepareLegionMapDrafts,OPERATION_KEY} from '../scripts/ops/legion-map-drafts-20261018.mjs';
import {legionRegionDefaults,LEGION_REGIONS_KEY} from '../shared/legion-regions-v1.mjs';
import {defaultLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from '../functions/_legion_hunt_settings.js';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {seedRegionalCatalog} from './helpers/legion-regions-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {regionKillLoot} from '../shared/legion-region-loot-v1.mjs';

test('copy five independent drafts, use inferno for calamity, preserve later map edits and force OFF',()=>{
  const source=defaultLegionHuntPolicy();source.mode='ON';source.difficulties[3].dropPercent=8;
  const before=legionRegionDefaults(),filled=fillLegionMapDrafts(source,before);
  assert.equal(filled.policy.mode,'OFF');assert.equal(filled.added.length,5);assert.equal(before.mode,'TEST');
  assert.equal(filled.policy.regions[0].fieldDrops.difficulties[4].dropPercent,8);
  assert.deepEqual(filled.policy.difficulties,before.difficulties);
  filled.policy.regions[0].fieldDrops.difficulties[0].dropPercent=37;
  assert.notEqual(filled.policy.regions[1].fieldDrops.difficulties[0].dropPercent,37);
  assert.notEqual(source.difficulties[0].dropPercent,37);
  const second=fillLegionMapDrafts(source,filled.policy);assert.deepEqual(second.policy,filled.policy);assert.deepEqual(second.added,[]);
});
test('one-time draft operation rolls back, audits atomically, preserves source/gear and never overwrites later edits',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE TABLE users(id INTEGER,role TEXT,status TEXT);INSERT INTO users VALUES(1,'OWNER','ACTIVE');
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ);
    CREATE TABLE character_equipment_items(code TEXT PRIMARY KEY,is_active INTEGER,is_public INTEGER,supply_enabled INTEGER);
    INSERT INTO character_equipment_items VALUES('HUNT_COAST_WEAPON',0,0,0);
    CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
  const source=JSON.stringify(defaultLegionHuntPolicy()),region=JSON.stringify(legionRegionDefaults());
  for(const [key,value] of [[LEGION_HUNT_SETTINGS_KEY,source],[LEGION_REGIONS_KEY,region],['equipment_polish_settings_v1','{"executionMode":"OFF"}']])await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,value]);
  const client={query:(sql,args=[])=>sql.includes('current_database()')?Promise.resolve({rows:[{db:'cnine',recovery:false}]}):db.query(sql,args)};
  const dry=await prepareLegionMapDrafts(client);assert.equal(dry.dryRun,true);assert.equal(dry.receipt.regions.length,5);
  assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',[LEGION_REGIONS_KEY])).rows[0].value,region);
  assert.equal((await db.query('SELECT * FROM admin_logs')).rows.length,0);
  const applied=await prepareLegionMapDrafts(client,{apply:true});assert.equal(applied.receipt.mode,'OFF');assert.equal((await db.query('SELECT * FROM admin_logs')).rows.length,1);
  const current=JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[LEGION_REGIONS_KEY])).rows[0].value);current.regions[0].fieldDrops.difficulties[0].dropPercent=19;
  await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(current),LEGION_REGIONS_KEY]);
  const replay=await prepareLegionMapDrafts(client,{apply:true});assert.equal(replay.replayed,true);
  assert.deepEqual(JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[LEGION_REGIONS_KEY])).rows[0].value),current);
  assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',[LEGION_HUNT_SETTINGS_KEY])).rows[0].value,source);
  assert.equal((await db.query('SELECT * FROM admin_logs')).rows.length,1);
  assert.equal((await db.query('SELECT key FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,1);
});
for(const postgres of [false,true])test(`map editor save, OFF gate, independent reward snapshot and TEST settlement (${postgres?'PG':'SQLite'})`,async t=>{
  const f=await legionFixture({postgres,regions:true});t.after(f.close);await seedRegionalCatalog(f);
  let source=await f.configure(3);source.mode='ON';source=(await f.call('admin/legion-hunt',{policy:source},{method:'PATCH'})).body.policy;
  let regional=fillLegionMapDrafts(source,legionRegionDefaults()).policy;regional.revision=0;
  regional.regions[1].fieldDrops.items[0].minQuantity=7;regional.regions[1].fieldDrops.items[0].maxQuantity=7;
  for(const d of regional.difficulties){d.loot.stonePercent=0;d.loot.eliteStonePercent=0;d.loot.eliteSetPercent=0;d.loot.bossSetPercent=0;d.loot.bossUniquePercent=0;}
  const save=await f.call('admin/legion-hunt/regions',{policy:regional},{method:'PATCH'});assert.equal(save.status,200,JSON.stringify(save));regional=save.body.policy;
  const loaded=await f.call('admin/legion-hunt/regions');assert.equal(loaded.body.policy.regions[1].fieldDrops.items[0].minQuantity,7);assert.ok(loaded.body.catalog.length);
  for(const user of [f.owner,f.player]){f.setUser(user);for(const r of regional.regions)assert.equal((await f.call('legion-hunt/start',{regionId:r.id,difficulty:'normal',version:5})).status,403,r.id);}
  f.setUser(f.owner);
  const bad=structuredClone(regional);bad.regions[0].fieldDrops.items[0].code='INVENTORY_ITEM:OFF_ITEM';assert.equal((await f.call('admin/legion-hunt/regions',{policy:bad},{method:'PATCH'})).status,400);
  const duplicate=structuredClone(regional);duplicate.regions[0].fieldDrops.difficulties[4].id='inferno';assert.equal((await f.call('admin/legion-hunt/regions',{policy:duplicate},{method:'PATCH'})).status,400);
  regional.mode='TEST';regional=(await f.call('admin/legion-hunt/regions',{policy:regional},{method:'PATCH'})).body.policy;
  let snapshot;
  f.deps.createSession=options=>{snapshot=options.dropPolicy;return Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy:{id:options.difficulty,huntDurationMs:1000,regionId:options.regionId,...options.dropPolicy},timeLimit:1000,eventTimes:[100,200],timeline:[{seq:1,combatAtMs:100,huntKill:true},{seq:2,combatAtMs:200,type:'RESULT',winner:'A'}],outcome:{}},{now:options.now,random:()=>0}),{payload:{}});};
  for(const [regionId,quantity] of [['coast',3],['desert',7]]){
    const started=await f.call('legion-hunt/start',{regionId,difficulty:'calamity',version:5});assert.equal(started.status,200,JSON.stringify(started));const id=started.body.id;
    assert.equal(snapshot.fieldDrops.items[0].minQuantity,quantity);assert.equal(snapshot.dropLifeMs,9000);
    await f.call('legion-hunt/begin',{id});f.clock.now+=250;
    const drop=(await f.call('legion-hunt/reveal',{id,seq:1})).body.drop;assert.equal(drop.rewards[0].quantity,quantity);
    await f.call('legion-hunt/claim',{id,dropId:drop.id,token:drop.token,...drop.position});
    const receipt=await f.call('legion-hunt/finish',{id,seq:2});assert.equal(receipt.status,200);assert.equal(receipt.body.liveRewards,false);
  }
  assert.equal(Number((await f.DB.prepare('SELECT COUNT(*) n FROM cnine_user_inventory').first()).n),0);
  regional.mode='ON';regional=(await f.call('admin/legion-hunt/regions',{policy:regional},{method:'PATCH'})).body.policy;
  const live=await f.call('legion-hunt/start',{regionId:'desert',difficulty:'normal',version:5});assert.equal(live.status,200);const id=live.body.id;
  await f.call('legion-hunt/begin',{id});f.clock.now+=250;
  const drop=(await f.call('legion-hunt/reveal',{id,seq:1})).body.drop;
  await f.call('legion-hunt/claim',{id,dropId:drop.id,token:drop.token,...drop.position});
  const settled=await f.call('legion-hunt/finish',{id,seq:2});assert.equal(settled.status,200);assert.equal(settled.body.liveRewards,true);
  assert.equal(Number((await f.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(f.owner.id,source.items[0].ref).first()).quantity),7);
  assert.deepEqual((await f.call('legion-hunt/finish',{id,seq:2})).body,settled.body);
  assert.deepEqual((await f.call('admin/legion-hunt')).body.policy,source);
});
test('field pool uses enabled weights and quantities without removing regional unique rewards',()=>{
  const items=[{kind:'UNIQUE',regionId:'coast',code:'unique'}],candidate={code:'field',enabled:true,weight:.001,minQuantity:2,maxQuantity:4};
  const policy={regionId:'coast',regionLoot:{bossUniquePercent:100},items,fieldDrops:{dropChance:0,bossDropChance:1,items:[{...candidate,code:'disabled',enabled:false},candidate]}};
  const loot=regionKillLoot(policy,{boss:true},()=>.5);assert.deepEqual(loot.map(r=>r.code),['unique','field']);assert.equal(loot[1].quantity,3);
  assert.equal(regionKillLoot(policy,{boss:false},()=>.5).length,0);
});
