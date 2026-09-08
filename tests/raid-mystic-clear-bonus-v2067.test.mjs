import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {defaultRaidSettingsV1293,cleanRaidSettingsV1293,raidRewardPlanV1293,raidRewardDisplayV1293} from '../functions/_raid_overhaul.js';

const ENERGY='STARLIGHT_ARMOR_CORE';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin=read('admin/raid-overhaul-v1293.js');
const input={instanceId:70,userId:9,totalDamage:1000000,finalRank:1,cleared:true};
const quantity=plan=>plan.inventoryRewards.find(row=>row.itemCode===ENERGY)?.amount||0;
const copy=value=>JSON.parse(JSON.stringify(value));
let fixtureId=0;

async function fixture(){
  const mod=await import(new URL('../functions/_raid_overhaul.js?raidMysticFixture='+ ++fixtureId,import.meta.url));
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE cnine_user_inventory(user_id INTEGER NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,unseen_quantity INTEGER NOT NULL DEFAULT 0,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);`);
  db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('safe_runtime_upgrade_v1296_raid_20260731_entry_reset','1');
  db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('raid_v1293_cleanup_last',new Date().toISOString());
  const DB={
    prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this},
      async first(){return db.prepare(sql).get(...this.values)||null},
      async all(){return {results:db.prepare(sql).all(...this.values)}},
      async run(){const result=db.prepare(sql).run(...this.values);return {meta:{changes:Number(result.changes)}}}}},
    async batch(statements){
      db.exec('BEGIN');
      try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result}
      catch(error){db.exec('ROLLBACK');throw error}
    }
  };
  await mod.ensureRaidOverhaulV1293({DB});
  return {db,env:{DB},mod};
}

test('legacy raid adds three energy without replacing any existing reward or rare roll',()=>{
  const cfg=defaultRaidSettingsV1293();
  assert.equal(cfg.clearMysticEnergy,3);
  const before=raidRewardPlanV1293({...input,cfg:{...cfg,clearMysticEnergy:0}});
  const after=raidRewardPlanV1293({...input,cfg});
  assert.equal(quantity(after),3);
  assert.equal(after.coin,before.coin);assert.equal(after.shards,before.shards);
  assert.deepEqual(after.inventoryRewards.filter(x=>x.itemCode!==ENERGY),before.inventoryRewards);
  assert.deepEqual(after.entries.filter(x=>x.type!==ENERGY),before.entries);
  assert.deepEqual(after.rareDrops,before.rareDrops);
  assert.deepEqual(after.entries.filter(x=>x.type===ENERGY),[{type:ENERGY,amount:3,source:'처치',label:'미스틱 에너지'}]);
});

test('failed clears never grant the energy bonus and do not remove participation rewards',()=>{
  const cfg=defaultRaidSettingsV1293();
  const failed=raidRewardPlanV1293({...input,cfg,cleared:false});
  const previous=raidRewardPlanV1293({...input,cfg:{...cfg,clearMysticEnergy:0},cleared:false});
  assert.equal(quantity(failed),0);assert.deepEqual(failed,previous);
});

test('saved legacy CMS settings get only the new default; custom rewards remain intact',()=>{
  const raw={...defaultRaidSettingsV1293(),enabled:true,title:'운영 레이드',rewards:{
    participation:[{type:'COIN',amount:2500000}],clear:[{type:'COIN',amount:9000000},{type:'MASTER_STAR',amount:17}],
    damageMilestones:[{damage:500,rewards:[{type:'MAGIC_CARD_PACK',amount:4}]}],
    rankRewards:[{from:1,to:2,rewards:[{type:'EQUIPMENT_SUPPLY_BOX',amount:6}]}],
    rareDrops:[{type:'PREMIUM_CUBE',amount:2,chance:17.5}]
  }};
  delete raw.clearMysticEnergy;const original=copy(raw),clean=cleanRaidSettingsV1293(raw);
  assert.equal(clean.clearMysticEnergy,3);assert.deepEqual(clean.rewards,original.rewards);
  assert.equal(clean.enabled,true);assert.equal(clean.title,original.title);assert.deepEqual(raw,original);
  assert.deepEqual(cleanRaidSettingsV1293(clean),clean);
});

test('CMS quantities survive roundtrip, support zero, and are clamped to whole items',()=>{
  for(const [value,expected] of [[0,0],[8,8],['12',12],[2.9,2],[-1,0],[1000001,1000000],['invalid',3],[null,3]]){
    const cfg=cleanRaidSettingsV1293({clearMysticEnergy:value});
    assert.equal(cfg.clearMysticEnergy,expected);
    assert.equal(cleanRaidSettingsV1293(JSON.parse(JSON.stringify(cfg))).clearMysticEnergy,expected);
    assert.equal(quantity(raidRewardPlanV1293({...input,cfg})),expected);
  }
});

test('new room snapshots freeze the configured bonus while old snapshots are not backfilled',async()=>{
  const {db,env,mod}=await fixture();
  try{
    const cfg=defaultRaidSettingsV1293();await mod.snapshotRaidInstanceV1293(env,70,'A',cfg);
    const frozen=await mod.raidInstanceSettingsV1293(env,70,{...cfg,clearMysticEnergy:25});
    assert.equal(frozen.clearMysticEnergy,3);
    const old=copy(cfg);delete old.clearMysticEnergy;
    db.prepare('INSERT INTO raid_instance_v1293(instance_id,settings_json) VALUES(?,?)').run(71,JSON.stringify(old));
    const legacy=await mod.raidInstanceSettingsV1293(env,71,cfg);
    assert.equal(legacy.clearMysticEnergy,0);assert.deepEqual(legacy.rewards,old.rewards);
    assert.equal(quantity(raidRewardPlanV1293({...input,cfg:legacy})),0);
    assert.equal(JSON.parse(db.prepare('SELECT settings_json FROM raid_instance_v1293 WHERE instance_id=71').get().settings_json).clearMysticEnergy,undefined);
    const missing=await mod.raidInstanceSettingsV1293(env,72,cfg);assert.equal(missing.clearMysticEnergy,0);
    await mod.snapshotRaidInstanceV1293(env,73,'A',{...cfg,clearMysticEnergy:0});
    assert.equal((await mod.raidInstanceSettingsV1293(env,73,cfg)).clearMysticEnergy,0);
  }finally{db.close()}
});

test('retrying or rereading a completed reward keeps the single confirmed plan unchanged',async()=>{
  const {db,env,mod}=await fixture();
  try{
    const cfg=defaultRaidSettingsV1293();
    const first=await mod.ensureRaidUserRewardPlanV1293(env,{...input,cfg});
    assert.equal(quantity(first.plan),3);
    const retry=await mod.ensureRaidUserRewardPlanV1293(env,{...input,cfg:{...cfg,clearMysticEnergy:100}});
    assert.deepEqual(retry,first);
    db.prepare("UPDATE raid_user_reward_v1293 SET status='COMPLETED' WHERE instance_id=? AND user_id=?").run(input.instanceId,input.userId);
    const done=await mod.ensureRaidUserRewardPlanV1293(env,{...input,cfg:{...cfg,clearMysticEnergy:100}});
    assert.equal(done.status,'COMPLETED');assert.deepEqual(done.plan,first.plan);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM raid_user_reward_v1293').get().n,1);
    const oldPlan=raidRewardPlanV1293({...input,cfg:{...cfg,clearMysticEnergy:0}});
    db.prepare("INSERT INTO raid_user_reward_v1293(instance_id,user_id,status,reward_json) VALUES(71,9,'COMPLETED',?)").run(JSON.stringify(oldPlan));
    const old=await mod.ensureRaidUserRewardPlanV1293(env,{...input,instanceId:71,cfg});assert.equal(quantity(old.plan),0);
  }finally{db.close()}
});

test('energy grants use the existing material code, inventory counters and raid audit log',async()=>{
  const {db,env,mod}=await fixture();
  try{
    db.prepare('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,50,2)').run(9,ENERGY);
    const grant=await mod.raidInventoryGrantStatementsV1293(env,{userId:9,instanceId:70,inventoryRewards:[{itemCode:ENERGY,amount:3},{itemCode:'UNKNOWN',amount:99}]});
    assert.deepEqual(grant.balances,[{itemCode:ENERGY,amount:3,balanceAfter:53,label:'미스틱 에너지'}]);
    await env.DB.batch(grant.statements);
    const inventory=db.prepare('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=9 AND item_code=?').get(ENERGY);
    assert.equal(inventory.quantity,53);assert.equal(inventory.unseen_quantity,5);
    const log=db.prepare('SELECT * FROM inventory_logs').get();
    assert.equal(log.item_code,ENERGY);assert.equal(log.change_amount,3);assert.equal(log.balance_after,53);
    assert.equal(log.reference_type,'RAID');assert.equal(log.reference_id,'70');assert.equal(log.reason,'RAID_V1293_REWARD');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cnine_user_inventory').get().n,1);
  }finally{db.close()}
});

test('failed reward transaction rolls back the extra inventory and its audit log together',async()=>{
  const {db,env,mod}=await fixture();
  try{
    const grant=await mod.raidInventoryGrantStatementsV1293(env,{userId:9,instanceId:70,inventoryRewards:[{itemCode:ENERGY,amount:3}]});
    await assert.rejects(env.DB.batch([...grant.statements,env.DB.prepare('INSERT INTO inventory_logs(user_id) VALUES(NULL)')]),/NOT NULL/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cnine_user_inventory').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM inventory_logs').get().n,0);
  }finally{db.close()}
});

function adminFunction(name,context){
  const line=admin.split(/\r?\n/).find(line=>line.startsWith('  function '+name+'('));
  assert.ok(line,'missing CMS function '+name);return vm.runInNewContext('('+line.trim()+')',context);
}
test('CMS renders and reads default, edited and disabled bonus without losing zero',()=>{
  const field={value:''},state={raidData:{settings:{}}};
  const context={state,q:()=>field,n:value=>Math.max(0,Number(value)||0)};
  const render=adminFunction('renderClearMysticEnergy',context),read=adminFunction('readClearMysticEnergy',context);
  for(const [stored,expected] of [[undefined,3],[11,11],[0,0]]){
    state.raidData.settings.clearMysticEnergy=stored;render();assert.equal(field.value,expected);assert.equal(read(),expected);
  }
  field.value='19';assert.equal(read(),19);field.value='0';assert.equal(read(),0);
  const draft=adminFunction('draft',{...context,legacyDraft:()=>({enabled:true}),readSlots:()=>[],readDynamic:()=>({damageMilestones:[],rankRewards:[],rareDrops:[]}),readBundle:()=>[],readClearMysticEnergy:read});
  assert.equal(draft().clearMysticEnergy,0);field.value='19';assert.equal(draft().clearMysticEnergy,19);
  assert.match(admin,/id="raidClearMysticEnergy"[^>]+max="1000000"[^>]+aria-describedby="raidClearMysticEnergyHelp"/);
  assert.match(admin,/기존 격파 보상에 더해/);
});

test('result display includes the named material and only legacy raid CMS resources are refreshed',()=>{
  const display=raidRewardDisplayV1293(raidRewardPlanV1293({...input,cfg:defaultRaidSettingsV1293()}));
  assert.equal(quantity(display),3);assert.equal(display.inventoryRewards.find(x=>x.itemCode===ENERGY).label,'미스틱 에너지');
  const index=read('admin/index.html');
  for(const ext of ['js','css'])assert.ok(index.includes(`raid-overhaul-v1293.${ext}?v=2067-raid-mystic-bonus`));
  assert.match(admin,/core-protocol-raid-admin-v2021\.js\?v=2048-yhwach/);
  const core=read('functions/_raid_core_protocol.js');assert.doesNotMatch(core,/clearMysticEnergy|DEFAULT_CLEAR_MYSTIC_ENERGY/);
  assert.ok(JSON.parse(read('package.json')).scripts['test:raid-entry'].includes('raid-mystic-clear-bonus-v2067.test.mjs'));
});
