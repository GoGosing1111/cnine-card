import {existsCommittedAssetSync,readCommittedAssetSync} from './helpers/sparse-media-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {__scrapyardTest} from '../functions/_scrapyard.js';
import {__dropPoolTest,invalidateUnifiedDropPoolCache,planUnifiedDropRoll} from '../functions/_drop_pool.js';
import {settleFieldOperation} from '../functions/_field_operations.js';
import {ensureEscortSchema} from '../functions/_escort_operation.js';
import {fieldDailyQuota,readFieldDay} from '../functions/_field_operation_quota.js';
import {operationTiers} from '../shared/field-operation-tiers.mjs';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {PVE_CONTINUOUS_OVERHAUL_RELEASE_ENABLED,loadScrapyardV3Snapshot,buildScrapyardV3Battle,validateScrapyardV3Config} from '../functions/_scrapyard_v3.js';
import {scrapyardRouteOptions,salvageResult} from '../functions/_scrapyard_salvage.js';
import {ensureScrapyardV3Schema,runScrapyardV3,scrapyardV3RecoveryStatus} from '../functions/_scrapyard_v3_runs.js';
import {isPvePublicPath} from '../shared/pve-public-release-v2092.mjs';
import forgeRelease from '../docs/releases/equipment-forge-approved-20260922.json' with {type:'json'};
import {EQUIPMENT_FORGE_RELEASE_KEY} from '../shared/equipment-forge-release-v1.mjs';
import {jointHash} from '../functions/_joint_transactions.js';
import {ensureRankRewardFixture} from './helpers/rank-reward-schema.mjs';

const read=path=>readCommittedAssetSync(new URL('../'+path,import.meta.url),'utf8');
const user={id:7,nickname:'LOCAL QA',role:'USER'};
const settings=()=>structuredClone({...__scrapyardTest.DEFAULT_SETTINGS,mode:'ON'});
function deck(power=200000){
  const cards=['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:String(i+1),title:`TEST ${i+1}`,rarity:'FUR',power_type,
    base_power:power,power:power*2,breakthrough_level:13,image:`/test-card-${i+1}.png`,uniqueAbility:{attackPercent:100}}));
  return {ids:['5','1','4','2','3'],cards,unique:{cards},synergy:{totals:{}},battleSettings:{engine:{}},
    characterBonus:{pve:100000,battleSuitPve:0}};
}
function dependencies(){
  let current=deck(),cfg=settings(),magic=[],reads=0;
  const deps={readSettings:async()=>structuredClone(cfg),
    raidDeckPower:async(_env,id,cardIds,mode)=>{assert.equal(id,7);assert.equal(cardIds,null);assert.equal(mode,'PVE');reads++;return structuredClone(current);},
    cardBattlePower:card=>Number(card.base_power),magicBattleLoadout:async()=>({cards:structuredClone(magic)}),selectActivatedUltimate:()=>null};
  return {deps,setDeck(value){current=value;},setSettings(value){cfg=value;},setMagic(value){magic=value;},get reads(){return reads;}};
}

class SQLiteDB{
  sql=new DatabaseSync(':memory:');failAt='';throwAfterCommit=false;throwAfterReservation=false;beforeBatch=null;
  prepare(source){const db=this;return {source,values:[],bind(...values){return {...this,values};},
    async first(){return db.sql.prepare(source).get(...this.values)||null;},
    async all(){return {results:db.sql.prepare(source).all(...this.values)};},
    async run(){const r=db.sql.prepare(source).run(...this.values);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}};}
  async batch(statements){
    await this.beforeBatch?.(statements);
    this.sql.exec('BEGIN');let results;
    try{results=statements.map(s=>{if(this.failAt&&s.source.includes(this.failAt))throw new Error('INJECTED_FAILURE');
      const r=this.sql.prepare(s.source).run(...s.values);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};});this.sql.exec('COMMIT');}
    catch(e){this.sql.exec('ROLLBACK');throw e;}
    if(this.throwAfterCommit&&statements.some(s=>s.source.includes("SET state='COMPLETED'"))){this.throwAfterCommit=false;throw new Error('RESPONSE_LOST_AFTER_COMMIT');}
    if(this.throwAfterReservation&&statements.some(s=>s.source.includes('INSERT INTO scrapyard_v3_operations_v1(request_id,user_id,seed,snapshot_json,battle_json,drop_plan_json,lease_token,lease_until)'))){this.throwAfterReservation=false;throw new Error('RESERVATION_RESPONSE_LOST');}
    return results;
  }
}

async function fixture(t,postgres=false){
  invalidateUnifiedDropPoolCache();
  const schema=[...__scrapyardTest.FOUNDATION_SQL,...__dropPoolTest.FOUNDATION_SQL,
    'CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT DEFAULT \'USER\',coin INTEGER DEFAULT 10,card_shards INTEGER DEFAULT 0,magic_crystals INTEGER DEFAULT 0)',
    'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
    'CREATE TABLE avatar_catalog_v1(code TEXT PRIMARY KEY,effect_type TEXT,effect_value INTEGER,is_active INTEGER,is_public INTEGER)',
    'CREATE TABLE avatar_user_ownership_v1(user_id INTEGER,avatar_code TEXT,expires_at TEXT,PRIMARY KEY(user_id,avatar_code))',
    'CREATE TABLE avatar_user_loadout_v1(user_id INTEGER PRIMARY KEY,avatar_code TEXT)',
    'CREATE TABLE avatar_effect_options_v1(avatar_code TEXT,option_order INTEGER,effect_type TEXT,effect_value INTEGER,PRIMARY KEY(avatar_code,option_order))',
    'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,rarity TEXT,image_url TEXT,is_active INTEGER DEFAULT 1)',
    'CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER DEFAULT 0,unseen_quantity INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code))',
    'CREATE TABLE inventory_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT)',
    'CREATE TABLE coin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT)',
    'CREATE TABLE character_equipment_items(id INTEGER PRIMARY KEY,name TEXT,rarity TEXT,image_url TEXT,is_active INTEGER,is_public INTEGER)',
    'CREATE TABLE user_equipment_instances(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,equipment_id INTEGER,source_type TEXT,source_id TEXT,request_id TEXT UNIQUE)',
    "INSERT INTO character_equipment_items VALUES(42,'QA EQUIPMENT','MYTHIC','/qa.png',1,1)"
  ];
  let DB,pg,failAt='';
  if(postgres){
    pg=new PGlite();t.after(()=>pg.close());
    await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
    await pg.exec(schema.map(sql=>sql.replaceAll('INTEGER PRIMARY KEY AUTOINCREMENT','BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY').replaceAll('INTEGER','BIGINT').replaceAll('CURRENT_TIMESTAMP','sqlite_now()')).join(';'));
    DB=new __postgresCompatTest.PostgresD1Database({async query(input){const source=typeof input==='string'?input:input.text;
      if(failAt&&source.includes(failAt))throw new Error('INJECTED_FAILURE');
      const r=await pg.query(source,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
  }else{DB=new SQLiteDB();t.after(()=>DB.sql.close());DB.sql.exec(schema.join(';'));}
  const env={DB},p=(sql,...values)=>DB.prepare(sql).bind(...values);
  await ensureRankRewardFixture(env);
  await ensureScrapyardV3Schema(env);await ensureScrapyardV3Schema(env);
  await p("INSERT INTO users(id,nickname,coin) VALUES(7,'LOCAL QA',10)").run();
  for(const item of ['SCRAPYARD_ENTRY_TICKET','VEHICLE_PART_TIRE'])await p('INSERT INTO inventory_items(code,name,rarity,image_url) VALUES(?,?,?,?)',item,item,'SPECIAL','/test.png').run();
  await p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,'SCRAPYARD_ENTRY_TICKET',5)").run();
  await p("INSERT INTO unified_drop_pools_v1667(id,code,name,roll_mode,rolls) VALUES(1,'SCRAPYARD_PARTS_OUTER','LOCAL ONLY','WEIGHTED_ONE',50)").run();
  await p("INSERT INTO unified_drop_entries_v1667(id,pool_id,reward_type,reward_ref,reward_name,chance_percent,min_quantity,max_quantity) VALUES(1,1,'INVENTORY_ITEM','VEHICLE_PART_TIRE','고성능 타이어',100,2,2)").run();
  await p("INSERT INTO unified_drop_bindings_v1667(source_type,source_id,trigger_type,pool_id) VALUES('SCRAPYARD','OUTER','CLEAR',1)").run();
  const dep=dependencies();
  return {env,p,...dep,get reads(){return dep.reads;},DB,pg,
    fail(value){failAt=value;DB.failAt=value;},
    run:(requestId='qa-run',extra={})=>runScrapyardV3(env,user,{requestId,difficulty:'OUTER',...extra},dep.deps),
    ticket:async()=>Number((await p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='SCRAPYARD_ENTRY_TICKET'").first()).quantity),
    coin:async()=>Number((await p('SELECT coin FROM users WHERE id=7').first()).coin),
    parts:async()=>Number((await p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='VEHICLE_PART_TIRE'").first())?.quantity||0),
    count:async table=>Number((await p(`SELECT COUNT(*) count FROM ${table}`).first()).count)};
}

test('public scrapyard wiring preserves unreleased routes and legacy reward separation',()=>{
  assert.equal(PVE_CONTINUOUS_OVERHAUL_RELEASE_ENABLED,false);
  assert.match(read('functions/_pve_v3_routes.js'),/if\(!V3_JOINT_RELEASE_ENABLED&&!isPvePublicPath\(path\)&&path!==/);
  assert.equal(isPvePublicPath('scrapyard/v3/run'),true);
  assert.equal(isPvePublicPath('cow-room/v3/run'),false);
  assert.equal(isPvePublicPath('tower/v3/run'),false);
  assert.equal(isPvePublicPath('idle-dungeon/v3/state'),false);
  assert.match(read('shared/v3-joint-release-v1.mjs'),/V3_JOINT_RELEASE_ENABLED = false/);
  assert.match(read('docs/cow-tower-live-on-2092-20260913.md'),/현재 70층·최초 합계 14억 4,500만/);
  assert.match(read('functions/_scrapyard.js'),/response_json NOT LIKE '%"engineVersion":"PVE_CONTINUOUS_V1"%'/,'legacy stale-ticket refund excludes persisted V3 results');
});

test('legacy createPveBattleV2 full envelopes remain byte-identical to pre-reform commit d1c04a64',()=>{
  const cards=['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:'GOLDEN-'+i,title:'GOLDEN '+i,rarity:'FUR',power:200000,power_type}));
  const golden={"1":"9cc1222ba04b473bc2988f8fc8a68edfca61c828e16be1a91292961e008c3bb2","17":"c7d032b27bc7b98a36fda71aa221f2894976b97e4c091172abde710355f060c1","7123":"40cab2f9f9da0f62968b75c1af23bbc30dabc053cde8a95f722f22d71628e62d"};
  for(const [seed,hash] of Object.entries(golden)){
    const result=createPveBattleV2({cards,characterBonus:55000,monster:{id:991,battle_power:1500000},seed:Number(seed)});
    assert.equal(createHash('sha256').update(JSON.stringify(result)).digest('hex'),hash);
    assert.equal(result.encounter,undefined);
  }
});

test('latest saved slot order, raw enhanced power + unique once, equipment and suit are separate',async()=>{
  const d=dependencies(),raw=deck();
  raw.characterBonus={pve:400000,battleSuitPve:300000,equippedBattleSuit:{code:'BATTLE_SUIT_03'},equippedWeapon:{code:'EQ_1785961232958'}};d.setDeck(raw);
  const s=await loadScrapyardV3Snapshot({},user,d.deps);
  assert.deepEqual(s.cards.map(c=>c.id),raw.ids);assert.equal(s.cards[0].power,200000);
  assert.equal(s.cards[0].uniqueAbility.attackPercent,100);assert.equal(s.cardSupportBonus,100000);assert.equal(s.battleSuit.pvePower,300000);
  const b=buildScrapyardV3Battle({snapshot:s,difficulty:settings().difficulties[0],seed:72});
  assert.equal(b.battleV2.teams.A.cards.length,5);assert.equal(b.battleV2.teams.A.supports.length,1);
  assert.equal(b.battleV2.teams.A.summary.equipmentBonus,100000);assert.equal(b.deckPower,1400000);
  assert.equal(b.battleV2.rules.maxActions,180);assert.equal(b.battleV2.rules.maxDuration,2);
  const damage=b.battleV2.result.damageBreakdown;assert.equal(damage.total,damage.cards+damage.battleSuit+damage.skillChips+damage.ultimate);
  assert.equal(b.battleV2.result.final.A.length,5);
});

test('all 3 zone encounters use fixed CMS enemies; weak decks really lose; each has a separate battle SD',async()=>{
  const d=dependencies(),strong=await loadScrapyardV3Snapshot({},user,d.deps);
  const low=deck(100);low.characterBonus={pve:0};d.setDeck(low);const weak=await loadScrapyardV3Snapshot({},user,d.deps);
  for(const difficulty of settings().difficulties){
    const b=buildScrapyardV3Battle({snapshot:strong,difficulty,seed:72}),w=buildScrapyardV3Battle({snapshot:weak,difficulty,seed:72});
    assert.deepEqual(b.scrapyardEncounter.instances,w.scrapyardEncounter.instances);
    assert.equal(w.success,false);assert.equal(w.battleV2.result.winner,'B');
    assert.equal(b.resourceReady,true);
    for(const row of b.continuousEncounter.instances){assert.ok(existsCommittedAssetSync(new URL('..'+row.battleSprite,import.meta.url)));assert.notEqual(row.battleSprite,row.sourceArt);}
    assert.ok(b.scrapyardEncounter.instances.every(row=>typeof row.battleSprite==='string'));
    assert.ok(b.battleV2.result.encounter.defeated<=b.enemiesTotal);
  }
});

test('encounter validation is bounded; invalid arrays, IDs, live party sizes and caps are rejected',async()=>{
  const d=dependencies(),s=await loadScrapyardV3Snapshot({},user,d.deps),base={snapshot:s,difficulty:settings().difficulties[0],seed:7};
  for(const config of [{normalCount:99},{simultaneous:6},{maxActions:601},{maxDuration:NaN},{maxDuration:0},{forcedMonsterEvery:0}])assert.throws(()=>buildScrapyardV3Battle({...base,config:{...validateScrapyardV3Config('OUTER'),...config}}));
  assert.throws(()=>createPveBattleV2({cards:s.cards,encounter:{instances:[]}}),/INVALID_PVE_ENCOUNTER/);
  const encounter={instances:[{instanceId:'1',slot:0,monster:{battle_power:100}},{instanceId:'2',slot:1,monster:{battle_power:100}}],initialCount:1,maxActions:10,maxDuration:1,forcedMonsterEvery:6};
  for(const cards of [s.cards.slice(0,4),[...s.cards,s.cards[0]],[...s.cards.slice(0,4),s.cards[0]]])assert.throws(()=>createPveBattleV2({cards,encounter}),/INVALID_PVE_ENCOUNTER_PARTY/);
  for(const patch of [{instanceId:'1'},{instanceId:123},{slot:-1},{monster:{battle_power:NaN}}])assert.throws(()=>createPveBattleV2({cards:s.cards,encounter:{...encounter,instances:[encounter.instances[0],{...encounter.instances[1],...patch}]}}));
});

test('one magic activation budget and one opening ultimate span all enemy generations',async()=>{
  const d=dependencies();d.setMagic([{id:7,code:'QA',slotNo:1,effectType:'CHAIN_ECHO',effectValue:50,triggerChance:100,maxActivations:2}]);
  const s=await loadScrapyardV3Snapshot({},user,d.deps);s.ultimateDamage=1000;
  const b=buildScrapyardV3Battle({snapshot:s,difficulty:settings().difficulties[0],seed:72});
  const magic=b.battleV2.result.timeline.filter(e=>e.type==='MAGIC_CARD'&&e.magicCardId===7);
  assert.ok(magic.length>0);assert.ok(Math.max(...magic.map(e=>e.activation))<=2);
  assert.equal(b.battleV2.result.timeline.filter(e=>e.type==='PVE_ULTIMATE').length,1);
  assert.ok(b.battleV2.result.timeline.some(e=>e.type==='ENEMY_SPAWN'&&e.boss));
});

for(const postgres of [false,true]){
  const backend=postgres?'PostgreSQL compatibility':'SQLite';
  async function enableProtection(f,t){
    await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',EQUIPMENT_FORGE_RELEASE_KEY,JSON.stringify({document:forgeRelease,sha256:await jointHash(forgeRelease)})).run();
    await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)','equipment_forge_public_settings_v1',JSON.stringify({schemaVersion:1,revision:1,publicVisible:true,executionMode:'ON',notice:'LOCAL QA'})).run();
    await f.p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('EQUIPMENT_PROTECTION_TICKET','장비 보호권','SPECIAL','/test.png')").run();
    t.mock.method(crypto,'getRandomValues',array=>array.fill(0));
  }
  test(`${backend}: approved protection drop and pooled parts settle atomically with their own ledgers`,async t=>{
    const f=await fixture(t,postgres);await enableProtection(f,t);
    const result=await f.run('qa-protection-mixed');
    assert.equal(result.status,'COMPLETED');assert.equal(await f.ticket(),5);assert.equal(await f.coin(),100010);assert.equal(await f.parts(),2);
    assert.equal(result.rewards.find(r=>r.rewardRef==='EQUIPMENT_PROTECTION_TICKET').quantity,1);
    assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE item_code='EQUIPMENT_PROTECTION_TICKET'").first()).quantity),1);
    assert.equal(await f.count('unified_drop_ledger_v1667'),1,'pooled parts retain their ledger; direct protection has no invented pool ID');
    assert.equal(Number((await f.p("SELECT COUNT(*) n FROM inventory_logs WHERE item_code='EQUIPMENT_PROTECTION_TICKET' AND reference_id='SCRAPYARD:qa-protection-mixed'").first()).n),1);
    assert.equal((await f.run('qa-protection-mixed')).replayed,true);
    assert.equal(await f.ticket(),5);assert.equal(await f.coin(),100010);assert.equal(await f.parts(),2);assert.equal(await f.count('inventory_logs'),2);
  });
  test(`${backend}: frozen pending protection result recovers after rollback without another entry or roll`,async t=>{
    const f=await fixture(t,postgres);await enableProtection(f,t);f.fail('INSERT INTO scrapyard_runs_v1676');
    assert.equal((await f.run('qa-protection-resume')).code,'SCRAPYARD_V3_SETTLEMENT_PENDING');
    const saved=await f.p('SELECT battle_json,drop_plan_json FROM scrapyard_v3_operations_v1').first();
    assert.equal(await f.ticket(),5);assert.equal(await f.coin(),10);assert.equal(await f.parts(),0);
    assert.equal(await f.count('unified_drop_ledger_v1667'),0);assert.equal(await f.count('unified_drop_receipts_v1667'),0);
    assert.equal(await f.p("SELECT quantity FROM cnine_user_inventory WHERE item_code='EQUIPMENT_PROTECTION_TICKET'").first(),null);
    await f.p("UPDATE app_meta SET value=? WHERE key='equipment_forge_public_settings_v1'",JSON.stringify({schemaVersion:1,revision:2,publicVisible:true,executionMode:'OFF',notice:'LOCAL QA'})).run();
    f.setDeck(deck(100));f.fail('');const reads=f.reads;
    const recovered=await f.run('qa-protection-resume');assert.equal(recovered.status,'COMPLETED');assert.equal(f.reads,reads);
    assert.deepEqual(recovered.battleV2,JSON.parse(saved.battle_json).battleV2);
    assert.deepEqual((await f.p('SELECT battle_json,drop_plan_json FROM scrapyard_v3_operations_v1').first()),saved);
    assert.equal(await f.ticket(),5);assert.equal(await f.coin(),100010);assert.equal(await f.parts(),2);
    assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE item_code='EQUIPMENT_PROTECTION_TICKET'").first()).quantity),1);
    await f.run('qa-protection-resume');assert.equal(await f.count('scrapyard_runs_v1676'),1);assert.equal(await f.count('inventory_logs'),2);
  });
  test(`${backend}: avatar bonus is frozen with the expedition and survives expiry/CMS changes without reroll`,async t=>{
    const f=await fixture(t,postgres);
    await f.p("INSERT INTO app_meta(key,value) VALUES('avatar_settings_v1',?)",JSON.stringify({mode:'OFF'})).run();
    await f.p("INSERT INTO avatar_catalog_v1 VALUES('QA_AVATAR','NONE',0,1,1)").run();
    await f.p("INSERT INTO avatar_effect_options_v1 VALUES('QA_AVATAR',1,'DROP_RATE_PERCENT',100)").run();
    await f.p("INSERT INTO avatar_user_ownership_v1 VALUES(7,'QA_AVATAR',NULL)").run();
    await f.p("INSERT INTO avatar_user_loadout_v1 VALUES(7,'QA_AVATAR')").run();
    await f.p('UPDATE unified_drop_entries_v1667 SET chance_percent=50').run();invalidateUnifiedDropPoolCache();
    const plan=requestId=>planUnifiedDropRoll(f.env,{userId:7,requestId:`SCRAPYARD:${requestId}`,sourceType:'SCRAPYARD',sourceId:'OUTER',triggerType:'CLEAR',role:'OWNER'});
    let requestId;
    for(let i=0;i<32;i++){const id='avatar-frozen-'+i;if((await plan(id)).rewards.length===0){requestId=id;break;}}
    assert.ok(requestId,'deterministic base roll must include a losing sample');
    await f.p('UPDATE app_meta SET value=?',JSON.stringify({mode:'ON'})).run();
    assert.equal((await plan(requestId)).rewards[0].quantity,2,'100% bonus doubles 50% chance without multiplying the item quantity');
    f.fail('INSERT INTO scrapyard_runs_v1676');
    assert.equal((await f.run(requestId)).code,'SCRAPYARD_V3_SETTLEMENT_PENDING');
    assert.equal(await f.ticket(),5);assert.equal(await f.parts(),0);
    await f.p('UPDATE app_meta SET value=?',JSON.stringify({mode:'OFF'})).run();
    await f.p("UPDATE avatar_user_ownership_v1 SET expires_at='2000-01-01 00:00:00'").run();
    await f.p('UPDATE unified_drop_entries_v1667 SET chance_percent=0').run();invalidateUnifiedDropPoolCache();
    assert.equal((await plan(requestId)).rewards.length,0,'a fresh roll sees the changed settings');
    f.fail('');const recovered=await f.run(requestId);
    assert.equal(recovered.status,'COMPLETED');assert.equal(await f.parts(),2);assert.equal(await f.ticket(),5);
    await f.run(requestId);assert.equal(await f.parts(),2);assert.equal(await f.count('unified_drop_receipts_v1667'),1);
  });
  test(`${backend}: free entry / clear coin / one independent drop; same ID never recharges or rerolls`,async t=>{
    const f=await fixture(t,postgres),r=await f.run('qa-once',{cards:[{power:9e15}],seed:0,result:'WIN',clearCoin:9e15});
    assert.equal(r.status,'COMPLETED');assert.equal(r.success,true);assert.equal(await f.ticket(),5);
    assert.equal(await f.coin(),100010);assert.equal(await f.parts(),2);
    const reads=f.reads;f.setDeck(deck(100));const again=await f.run('qa-once',{difficulty:'FURNACE'});
    assert.equal(again.replayed,true);assert.equal(again.difficulty.id,'OUTER');assert.equal(f.reads,reads);
    assert.deepEqual(again.battleV2,r.battleV2);assert.equal(await f.ticket(),5);assert.equal(await f.parts(),2);
    assert.equal(await f.count('scrapyard_runs_v1676'),1);assert.equal(await f.count('unified_drop_receipts_v1667'),1);
    assert.equal((await scrapyardV3RecoveryStatus(f.env,user)).status,'IDLE');
  });
  test(`${backend}: final grant failure rolls back all prizes; saved battle survives deck/CMS changes`,async t=>{
    const f=await fixture(t,postgres);f.fail('INSERT INTO scrapyard_runs_v1676');
    const r=await f.run('qa-crash');assert.equal(r.code,'SCRAPYARD_V3_SETTLEMENT_PENDING');
    assert.equal(await f.ticket(),5);assert.equal(await f.coin(),10);assert.equal(await f.parts(),0);assert.equal(await f.count('unified_drop_receipts_v1667'),0);
    const op=await f.p('SELECT * FROM scrapyard_v3_operations_v1 WHERE request_id=?','qa-crash').first(),reads=f.reads;
    f.setDeck(deck(100));f.setSettings({...settings(),mode:'OFF'});await f.p('UPDATE unified_drop_entries_v1667 SET chance_percent=0').run();invalidateUnifiedDropPoolCache();
    f.fail('');const recovered=await f.run('qa-crash');assert.equal(recovered.status,'COMPLETED');assert.equal(f.reads,reads);
    assert.deepEqual(recovered.battleV2,JSON.parse(op.battle_json).battleV2);assert.equal(await f.coin(),100010);assert.equal(await f.parts(),2);assert.equal(await f.ticket(),5);
  });
  test(`${backend}: concurrent requests cannot create two active expeditions or duplicate a completed reward`,async t=>{
    const f=await fixture(t,postgres);f.fail('INSERT INTO scrapyard_runs_v1676');
    const results=await Promise.all([f.run('qa-a'),f.run('qa-b'),f.run('qa-a')]);
    assert.equal(await f.count('scrapyard_v3_operations_v1'),1);assert.equal(await f.ticket(),5);
    assert.ok(results.every(r=>r.status==='RUNNING'));
    const active=await scrapyardV3RecoveryStatus(f.env,user);f.fail('');
    const completed=await f.run(active.requestId);assert.equal(completed.status,'COMPLETED');assert.equal(await f.parts(),2);
    assert.equal(await f.count('inventory_logs'),1);
  });
  test(`${backend}: expired worker lease resumes same frozen run; fresh lease returns status, not an error`,async t=>{
    const f=await fixture(t,postgres);f.fail('INSERT INTO scrapyard_runs_v1676');await f.run('qa-lease');f.fail('');
    await f.p("UPDATE scrapyard_v3_operations_v1 SET lease_token='old-worker',lease_until=?",Date.now()+120000).run();
    assert.equal((await f.run('qa-lease')).code,'SCRAPYARD_V3_RUNNING');assert.equal(await f.ticket(),5);
    await f.p('UPDATE scrapyard_v3_operations_v1 SET lease_until=0').run();
    assert.equal((await f.run('qa-lease')).status,'COMPLETED');assert.equal(await f.parts(),2);
  });
  test(`${backend}: zero tickets permit free entry while daily limits, closed access and invalid decks still block`,async t=>{
    const f=await fixture(t,postgres);
    await f.p("UPDATE cnine_user_inventory SET quantity=0 WHERE item_code='SCRAPYARD_ENTRY_TICKET'").run();
    const free=await f.run('qa-empty');assert.equal(free.status,'COMPLETED');assert.equal(free.entryTicket.consumed,0);assert.equal(await f.ticket(),0);assert.equal(await f.count('scrapyard_ticket_reservations_v1680'),0);
    await f.p("UPDATE cnine_user_inventory SET quantity=5 WHERE item_code='SCRAPYARD_ENTRY_TICKET'").run();
    f.setSettings({...settings(),dailyRuns:1});await assert.rejects(()=>f.run('qa-limit'),/입장권|횟수/);
    f.setSettings({...settings(),mode:'OFF'});await assert.rejects(()=>f.run('qa-closed'),/잠겨/);
    f.setSettings(settings());const invalid=deck();invalid.ids.pop();f.setDeck(invalid);await assert.rejects(()=>f.run('qa-deck'),/덱 5장/);
    assert.equal(await f.ticket(),5);assert.equal(await f.parts(),2);
  });
  test(`${backend}: failure is saved, counts one daily attempt, and has no completion rewards`,async t=>{
    const f=await fixture(t,postgres),weak=deck(100);weak.characterBonus={pve:0};f.setDeck(weak);
    const r=await f.run('qa-loss');assert.equal(r.success,false);assert.equal(r.status,'COMPLETED');assert.equal(r.rewards.length,0);
    assert.equal(await f.ticket(),5);assert.equal(await f.coin(),10);assert.equal(await f.parts(),0);
    assert.ok(['ELIMINATION','ACTION_LIMIT','TIME_LIMIT'].includes(r.failureReason));
  });
  test(`${backend}: empty drop plan is frozen even if CMS rates increase during a retry`,async t=>{
    const f=await fixture(t,postgres);await f.p('UPDATE unified_drop_entries_v1667 SET chance_percent=0').run();invalidateUnifiedDropPoolCache();
    f.fail('INSERT INTO scrapyard_runs_v1676');await f.run('qa-no-drop');
    await f.p('UPDATE unified_drop_entries_v1667 SET chance_percent=100').run();invalidateUnifiedDropPoolCache();f.fail('');
    const r=await f.run('qa-no-drop');assert.equal(r.status,'COMPLETED');assert.equal(await f.parts(),0);assert.equal(await f.coin(),100010);
    assert.equal(await f.count('unified_drop_receipts_v1667'),1);
  });
  test(`${backend}: zero-row equipment grant rolls back rewards and can recover without a second ticket`,async t=>{
    const f=await fixture(t,postgres);await f.p("UPDATE unified_drop_entries_v1667 SET reward_type='EQUIPMENT',reward_ref='42',min_quantity=1,max_quantity=1").run();invalidateUnifiedDropPoolCache();
    if(postgres)await f.pg.exec("CREATE FUNCTION skip_equipment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER skip_equipment BEFORE INSERT ON user_equipment_instances FOR EACH ROW EXECUTE FUNCTION skip_equipment();");
    else f.DB.sql.exec("CREATE TRIGGER skip_equipment BEFORE INSERT ON user_equipment_instances BEGIN SELECT RAISE(IGNORE); END;");
    const r=await f.run('qa-no-row');assert.equal(r.code,'SCRAPYARD_V3_SETTLEMENT_PENDING');assert.equal(await f.ticket(),5);assert.equal(await f.coin(),10);
    assert.equal(await f.count('unified_drop_receipts_v1667'),0);assert.equal(await f.count('user_equipment_instances'),0);
    if(postgres)await f.pg.exec('DROP TRIGGER skip_equipment ON user_equipment_instances');else f.DB.sql.exec('DROP TRIGGER skip_equipment');
    const recovered=await f.run('qa-no-row');assert.equal(recovered.status,'COMPLETED');assert.equal(await f.ticket(),5);assert.equal(await f.count('user_equipment_instances'),1);
  });
  test(`${backend}: skipped guaranteed-coin update cannot complete an unpaid expedition`,async t=>{
    const f=await fixture(t,postgres);
    if(postgres)await f.pg.exec("CREATE FUNCTION skip_coin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER skip_coin BEFORE UPDATE OF coin ON users FOR EACH ROW EXECUTE FUNCTION skip_coin();");
    else f.DB.sql.exec("CREATE TRIGGER skip_coin BEFORE UPDATE OF coin ON users BEGIN SELECT RAISE(IGNORE); END;");
    assert.equal((await f.run('qa-no-coin')).code,'SCRAPYARD_V3_SETTLEMENT_PENDING');
    assert.equal(await f.coin(),10);assert.equal(await f.parts(),0);assert.equal(await f.count('scrapyard_runs_v1676'),0);
    if(postgres)await f.pg.exec('DROP TRIGGER skip_coin ON users');else f.DB.sql.exec('DROP TRIGGER skip_coin');
    assert.equal((await f.run('qa-no-coin')).status,'COMPLETED');assert.equal(await f.coin(),100010);assert.equal(await f.ticket(),5);
  });
}

test('response lost after final COMMIT returns the persisted receipt, with no second reward',async t=>{
  const f=await fixture(t);f.DB.throwAfterCommit=true;
  const r=await f.run('qa-response-lost');assert.equal(r.status,'COMPLETED');assert.equal(r.replayed,true);
  assert.equal(await f.ticket(),5);assert.equal(await f.parts(),2);assert.equal(await f.coin(),100010);
});

test('reservation response lost after COMMIT settles immediately with its original lease',async t=>{
  const f=await fixture(t);f.DB.throwAfterReservation=true;
  const r=await f.run('qa-reservation-lost');
  assert.equal(r.status,'COMPLETED');assert.equal(await f.ticket(),5);assert.equal(await f.parts(),2);
  assert.equal(await f.count('scrapyard_v3_operations_v1'),1);assert.equal(await f.count('inventory_logs'),1);
});

test('a missing or stolen operation at the grant boundary cannot bypass the transaction guard',async t=>{
  for(const mutation of ['DELETE FROM scrapyard_v3_operations_v1',"UPDATE scrapyard_v3_operations_v1 SET lease_token='different-worker'"]){
    const f=await fixture(t);
    f.DB.beforeBatch=async statements=>{
      if(statements.some(s=>s.source.includes("SET state='COMPLETED'"))){f.DB.beforeBatch=null;f.DB.sql.exec(mutation);}
    };
    const r=await f.run('qa-guard');assert.equal(r.status,'RUNNING');
    assert.equal(await f.parts(),0);assert.equal(await f.coin(),10);assert.equal(await f.count('unified_drop_receipts_v1667'),0);
  }
});

test('PostgreSQL actual scrapyard completes at 10경 plus one and replays without a second ticket',async t=>{
 const f=await fixture(t,true);await f.p('UPDATE users SET coin=100000000000000001 WHERE id=7').run();
 const result=await f.run('qa-10g');assert.equal(result.status,'COMPLETED');assert.equal(result.success,true);
 const exact=(await f.p('SELECT CAST(coin AS TEXT) AS coin FROM users WHERE id=7').first()).coin;
 const rewarded=result.rewards.filter(r=>r.rewardType==='COIN').reduce((n,r)=>n+BigInt(r.quantity),0n);
 assert.equal(exact,(100000000000000001n+rewarded).toString());assert.equal(await f.ticket(),5);
 await f.run('qa-10g');assert.equal(await f.ticket(),5);assert.equal((await f.p('SELECT CAST(coin AS TEXT) AS coin FROM users WHERE id=7').first()).coin,exact);
});

test('salvage dispatch quotes the exact encounter and the last secured checkpoint',async()=>{
  const d=dependencies(),snapshot=await loadScrapyardV3Snapshot({},user,d.deps);
  for(const zone of settings().difficulties){
    const [sort,deep]=scrapyardRouteOptions(zone);
    assert.ok(deep.bossPower>sort.bossPower && deep.normalCount>sort.normalCount);
    assert.ok(sort.checkpoints[1].coin>deep.checkpoints[1].coin && deep.checkpoints[2].coin>sort.checkpoints[2].coin);
    for(const route of [sort,deep]){
      const battle=buildScrapyardV3Battle({snapshot,difficulty:zone,routeKey:route.key,seed:17});
      assert.deepEqual(battle.salvage.checkpoints,route.checkpoints);
      assert.equal(battle.enemiesTotal,route.normalCount+1);
      for(const [i,step] of route.checkpoints.entries()){
        assert.equal(salvageResult(route,step.defeats-1,false).coin,route.checkpoints[i-1]?.coin||0);
        assert.equal(salvageResult(route,step.defeats,i===2).coin,step.coin);
      }
      assert.equal(salvageResult(route,route.normalCount+1,false).completed,2);
    }
  }
});

test('deep salvage freezes the selected route and payout through a retry with changed input',async t=>{
  const f=await fixture(t);
  await assert.rejects(()=>f.run('bad-route',{route:'UNKNOWN'}),{code:'SCRAPYARD_V3_ROUTE'});
  f.fail('INSERT INTO scrapyard_runs_v1676');
  assert.equal((await f.run('deep-retry',{route:'DEEP'})).status,'RUNNING');
  f.fail('');
  const result=await f.run('deep-retry',{route:'SORT'});
  assert.equal(result.salvage.key,'DEEP');assert.equal(result.salvage.completed,3);
  assert.equal(await f.coin(),125010);assert.equal(await f.parts(),2);
  assert.equal((await f.run('deep-retry')).replayed,true);
  assert.equal(await f.count('coin_logs'),1);
});

test('a failed battle keeps its checkpoint coins without rolling completion loot',async t=>{
  const f=await fixture(t);
  t.mock.method(crypto,'getRandomValues',array=>array.fill(17));
  const cfg=settings(),zone=cfg.difficulties[0];
  for(const power of [3500,7000,11000,15000,19000,23000,28000,35000,45000,60000,80000]){
    const candidate=deck(power);candidate.characterBonus={pve:0};
    f.setDeck(candidate);
    const snapshot=await loadScrapyardV3Snapshot({},user,f.deps);
    const {success,salvage}=buildScrapyardV3Battle({snapshot,difficulty:zone,seed:17});
    if(success||!salvage.completed)continue;
    const result=await f.run('salvage-withdraw');
    assert.equal(result.success,false);assert.equal(result.salvage.coin,salvage.coin);
    assert.equal(await f.coin(),10+salvage.coin);assert.equal(await f.parts(),0);
    assert.equal(await f.count('scrapyard_runs_v1676'),1);
    await f.run('salvage-withdraw');assert.equal(await f.count('coin_logs'),1);
    return;
  }
  assert.fail('Expected at least one deck to reach a checkpoint and lose');
});

for(const postgres of [false,true])test('independent V3 payouts, admission and rollback on '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const f=await fixture(t,postgres),cfg={mode:'ON',dailyRuns:2,dailyRunLimit:3,dailyRewardLimit:2};
  const ddl=['ALTER TABLE inventory_items ADD COLUMN description TEXT','ALTER TABLE inventory_items ADD COLUMN category TEXT','ALTER TABLE inventory_items ADD COLUMN sort_order INTEGER'];
  if(postgres)await f.pg.exec(ddl.join(';'));else f.DB.sql.exec(ddl.join(';'));
  await ensureEscortSchema(f.env);
  const at=Date.UTC(2026,10,28,9),tier=operationTiers.at(-1),userQA={...user,role:'USER'};
  const result=(mode,won=true)=>({mode,tier,deckPower:100000,settlement:{won,defeated:won?2:0,hull:won?97:0,cargo:won?95:0,grade:won?'S':'—',
    frames:won?6:0,scrap:won?60:0,coin:won?tier.coin:0,masterStars:won?tier.masterStars:0}});
  const run=(mode,key,won=true)=>settleFieldOperation(f.env,userQA,result(mode,won),key,cfg,at);
  const scalar=async(sql,...args)=>Number(Object.values(await f.p(sql,...args).first())[0]);
  const stars=()=>scalar("SELECT quantity FROM cnine_user_inventory WHERE item_code='MASTER_STAR' AND user_id=7");
  // A failure between currency and inventory must roll back the quota and the receipt.
  f.fail('INSERT INTO inventory_logs');
  await assert.rejects(run('yard','rollback-001'),/INJECTED_FAILURE/);f.fail('');
  assert.equal(await f.coin(),10);assert.equal(await f.count('scrapyard_runs_v1676'),0);
  const receipt=await run('yard','rollback-001');assert.equal(receipt.settlement.coin,30000000000000);
  assert.equal(await f.coin(),30000000000010);assert.equal(await stars(),300000000);
  assert.equal(await scalar("SELECT quantity FROM cnine_user_inventory WHERE item_code='SCRAPYARD_HYDRAULIC_FRAME'"),6);
  assert.equal((await run('yard','rollback-001')).replayed,true);
  await run('yard','yard-loss-02',false);
  await assert.rejects(run('yard','yard-cap-003'),e=>e.code==='PVE_V3_ENTRY');
  assert.equal(await f.count('scrapyard_runs_v1676'),2);assert.equal(await stars(),300000000);
  // Same client key is independent between contents.
  await run('escort','rollback-001');
  await run('escort','escort-loss-02',false);
  await f.p("INSERT INTO pve_escort_runs_v1830(run_id,user_id,week_key,vehicle_hp,vehicle_max_hp,deck_snapshot,started_at) VALUES('legacy',7,'2026-11-23',100,100,'[]','2026-11-27 00:00:00')").run();
  await assert.rejects(run('escort','escort-win-03'),e=>e.code==='PVE_V3_ENTRY');
  await f.p("UPDATE pve_escort_runs_v1830 SET status='FAILED' WHERE run_id='legacy'").run();
  await run('escort','escort-win-03');
  await assert.rejects(run('escort','escort-cap-04'),e=>e.code==='PVE_V3_ENTRY');
  assert.equal((await run('escort','escort-win-03')).replayed,true);
  assert.equal(await scalar('SELECT started_count FROM pve_escort_weekly_v1830'),3);
  assert.equal(await scalar('SELECT reward_count FROM pve_escort_weekly_v1830'),2);
  assert.equal(await f.coin(),90000000000010);assert.equal(await stars(),900000000);assert.equal(await f.count('coin_logs'),3);
});
test('field operation tiers use the approved fixed settlements in both modes',()=>{
  assert.deepEqual(operationTiers.map(t=>[t.coin,t.masterStars]),[[3e8,3e3],[3e9,3e4],[3e10,3e5],[3e11,3e6],[3e12,3e7],[12e12,12e7],[30e12,3e8]]);
  assert.equal(isPvePublicPath('escort/v3/operation'),true);
  assert.equal(isPvePublicPath('escort/v3/admin'),false);
});

for(const postgres of [false,true])test('field daily quotas are independent, roll over at KST midnight, count prior runs and replay once on '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const f=await fixture(t,postgres),cfg={mode:'ON'},owner={...user,role:'OWNER'};
  const playerId=Number(user.id);
  const sql='ALTER TABLE inventory_items ADD COLUMN description TEXT; ALTER TABLE inventory_items ADD COLUMN category TEXT; ALTER TABLE inventory_items ADD COLUMN sort_order INTEGER';
  if(postgres)await f.pg.exec(sql);else f.DB.sql.exec(sql);
  await ensureEscortSchema(f.env);
  const midnight=Date.UTC(2026,10,25,15),before=midnight-1;
  const day=(mode,at)=>readFieldDay(f.DB,fieldDailyQuota(mode,user.id,cfg,at));
  const result=(mode,won,tier)=>({mode,tier,deckPower:150000,settlement:{won,hull:won?94:0,cargo:won?90:0,grade:won?'A':'—',defeated:won?2:0,
    frames:won?1:0,scrap:won?4:0,coin:won?tier.coin:0,masterStars:won?tier.masterStars:0}});
  const run=(mode,i,at,won=true)=>settleFieldOperation(f.env,owner,result(mode,won,operationTiers[i%2]),'daily-qa-'+i,cfg,at,async()=>[]);
  await f.p("INSERT INTO pve_escort_weekly_v1830(user_id,week_key,started_count,reward_count) VALUES(?,'2026-11-23',35,20)",playerId).run();
  for(const mode of ['yard','escort']){
    for(let i=0;i<5;i++)await run(mode,i,before);
    const full=await day(mode,before);
    assert.deepEqual([full.startedCount,full.runLimit,full.rewardCount,full.rewardLimit,full.resetsAt],[5,5,5,5,'2026-11-25T15:00:00Z']);
    await assert.rejects(run(mode,5,before),e=>e.code==='PVE_V3_ENTRY');
    assert.equal((await run(mode,4,before)).replayed,true);
    const fresh=await day(mode,midnight);
    assert.deepEqual([fresh.startedCount,fresh.rewardCount],[0,0]);
    assert.equal((await run(mode,4,midnight)).replayed,true);
    assert.equal((await day(mode,midnight)).startedCount,0);
    for(let i=10;i<14;i++)await run(mode,i,midnight,i===10);
    if(postgres)await run(mode,14,midnight,false);
    else {
      const race=await Promise.allSettled([run(mode,14,midnight,false),run(mode,15,midnight,false)]);
      assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
      assert.equal(race.find(x=>x.status==='rejected').reason.code,'PVE_V3_ENTRY');
    }
    await assert.rejects(run(mode,16,midnight,false),e=>e.code==='PVE_V3_ENTRY');
    const used=await day(mode,midnight);assert.deepEqual([used.startedCount,used.rewardCount],[5,1]);
  }
  const next=midnight+86400000;
  for(let i=0;i<5;i++)await f.p("INSERT INTO pve_escort_runs_v1830(run_id,user_id,week_key,status,vehicle_hp,vehicle_max_hp,deck_snapshot,started_at,claimed_at) VALUES(?,?,'2026-11-23','CLAIMED',90,100,'[]','2026-11-23 00:00:00','2026-11-26 15:00:00')",'old-escort-'+i,playerId).run();
  const carried=await day('escort',next);
  assert.deepEqual([carried.startedCount,carried.rewardCount],[0,5]);
  await assert.rejects(run('escort',99,next),e=>e.code==='PVE_V3_ENTRY'&&e.message.includes('보상 수령'));
  await run('yard',99,next);
  await f.p("INSERT INTO scrapyard_runs_v1676(request_id,user_id,difficulty,success,rewards_json,created_at) VALUES('partial-legacy',?,'CORE',0,'[1]','2026-11-26 15:00:00')",playerId).run();
  const partial=await day('yard',next);assert.deepEqual([partial.startedCount,partial.rewardCount],[2,2]);
});
