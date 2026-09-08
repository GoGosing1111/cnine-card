import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {__scrapyardTest} from '../functions/_scrapyard.js';
import {__dropPoolTest,invalidateUnifiedDropPoolCache} from '../functions/_drop_pool.js';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {PVE_CONTINUOUS_OVERHAUL_RELEASE_ENABLED,loadScrapyardV3Snapshot,buildScrapyardV3Battle,validateScrapyardV3Config} from '../functions/_scrapyard_v3.js';
import {ensureScrapyardV3Schema,runScrapyardV3,scrapyardV3RecoveryStatus} from '../functions/_scrapyard_v3_runs.js';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
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
    if(this.throwAfterReservation&&statements.some(s=>s.source.includes("'SCRAPYARD_ENTRY'"))){this.throwAfterReservation=false;throw new Error('RESERVATION_RESPONSE_LOST');}
    return results;
  }
}

async function fixture(t,postgres=false){
  invalidateUnifiedDropPoolCache();
  const schema=[...__scrapyardTest.FOUNDATION_SQL,...__dropPoolTest.FOUNDATION_SQL,
    'CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,coin INTEGER DEFAULT 10,card_shards INTEGER DEFAULT 0,magic_crystals INTEGER DEFAULT 0)',
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

test('whole-overhaul staging: no production entry, no release flag, no tower or PVP wiring',()=>{
  assert.equal(PVE_CONTINUOUS_OVERHAUL_RELEASE_ENABLED,false);
  for(const path of ['functions/api/[[path]].js','index.html','js/app.js','js/pve-command-v2-live.js'])assert.doesNotMatch(read(path),/_scrapyard_v3|scrapyard-v3-session|scrapyard\/v3/);
  assert.match(read('docs/pve-continuous-overhaul-v1.md'),/무한의탑을 제외한 이번 개편안 전체를 한 번에 출시/);
  assert.match(read('functions/_scrapyard.js'),/response_json NOT LIKE '%"engineVersion":"PVE_CONTINUOUS_V1"%'/,'legacy stale-ticket refund excludes persisted V3 results');
});

test('legacy createPveBattleV2 full envelopes remain byte-identical to commit 425a0043',()=>{
  const cards=['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:'GOLDEN-'+i,title:'GOLDEN '+i,rarity:'FUR',power:200000,power_type}));
  const golden={1:'8c2f608300b6ccd59cbca4a23454e7f60b72c99df675a84622d568a2bfee557d',17:'95316083b3c3cfe032b69b318af439cd7aea924f11be7d2bc6ea6c2fe878fb29',7123:'7eb1d82cbb0618bd85be075d843b9a766c1ebadd5d493a3c8aa4caa00112378e'};
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

test('all 3 zone encounters use fixed CMS enemies; weak decks really lose; unfinished SD is explicitly absent',async()=>{
  const d=dependencies(),strong=await loadScrapyardV3Snapshot({},user,d.deps);
  const low=deck(100);low.characterBonus={pve:0};d.setDeck(low);const weak=await loadScrapyardV3Snapshot({},user,d.deps);
  for(const difficulty of settings().difficulties){
    const b=buildScrapyardV3Battle({snapshot:strong,difficulty,seed:72}),w=buildScrapyardV3Battle({snapshot:weak,difficulty,seed:72});
    assert.deepEqual(b.scrapyardEncounter.instances,w.scrapyardEncounter.instances);
    assert.equal(w.success,false);assert.equal(w.battleV2.result.winner,'B');
    assert.equal(b.resourceReady,difficulty.id==='OUTER');
    if(difficulty.id!=='OUTER')assert.ok(b.scrapyardEncounter.instances.every(row=>row.battleSprite===null));
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
  test(`${backend}: one ticket / old coin / one independent drop; same ID never recharges or rerolls`,async t=>{
    const f=await fixture(t,postgres),r=await f.run('qa-once',{cards:[{power:9e15}],seed:0,result:'WIN',clearCoin:9e15});
    assert.equal(r.status,'COMPLETED');assert.equal(r.success,true);assert.equal(await f.ticket(),4);
    assert.equal(await f.coin(),100010);assert.equal(await f.parts(),2);
    const reads=f.reads;f.setDeck(deck(100));const again=await f.run('qa-once',{difficulty:'FURNACE'});
    assert.equal(again.replayed,true);assert.equal(again.difficulty.id,'OUTER');assert.equal(f.reads,reads);
    assert.deepEqual(again.battleV2,r.battleV2);assert.equal(await f.ticket(),4);assert.equal(await f.parts(),2);
    assert.equal(await f.count('scrapyard_runs_v1676'),1);assert.equal(await f.count('unified_drop_receipts_v1667'),1);
    assert.equal((await scrapyardV3RecoveryStatus(f.env,user)).status,'IDLE');
  });
  test(`${backend}: final grant failure rolls back all prizes; saved battle survives deck/CMS changes`,async t=>{
    const f=await fixture(t,postgres);f.fail('INSERT INTO scrapyard_runs_v1676');
    const r=await f.run('qa-crash');assert.equal(r.code,'SCRAPYARD_V3_SETTLEMENT_PENDING');
    assert.equal(await f.ticket(),4);assert.equal(await f.coin(),10);assert.equal(await f.parts(),0);assert.equal(await f.count('unified_drop_receipts_v1667'),0);
    const op=await f.p('SELECT * FROM scrapyard_v3_operations_v1 WHERE request_id=?','qa-crash').first(),reads=f.reads;
    f.setDeck(deck(100));f.setSettings({...settings(),mode:'OFF'});await f.p('UPDATE unified_drop_entries_v1667 SET chance_percent=0').run();invalidateUnifiedDropPoolCache();
    f.fail('');const recovered=await f.run('qa-crash');assert.equal(recovered.status,'COMPLETED');assert.equal(f.reads,reads);
    assert.deepEqual(recovered.battleV2,JSON.parse(op.battle_json).battleV2);assert.equal(await f.coin(),100010);assert.equal(await f.parts(),2);assert.equal(await f.ticket(),4);
  });
  test(`${backend}: concurrent requests cannot create two active expeditions or duplicate a completed reward`,async t=>{
    const f=await fixture(t,postgres);f.fail('INSERT INTO scrapyard_runs_v1676');
    const results=await Promise.all([f.run('qa-a'),f.run('qa-b'),f.run('qa-a')]);
    assert.equal(await f.count('scrapyard_v3_operations_v1'),1);assert.equal(await f.ticket(),4);
    assert.ok(results.every(r=>r.status==='RUNNING'));
    const active=await scrapyardV3RecoveryStatus(f.env,user);f.fail('');
    const completed=await f.run(active.requestId);assert.equal(completed.status,'COMPLETED');assert.equal(await f.parts(),2);
    assert.equal(await f.count('inventory_logs'),2);
  });
  test(`${backend}: expired worker lease resumes same frozen run; fresh lease returns status, not an error`,async t=>{
    const f=await fixture(t,postgres);f.fail('INSERT INTO scrapyard_runs_v1676');await f.run('qa-lease');f.fail('');
    await f.p("UPDATE scrapyard_v3_operations_v1 SET lease_token='old-worker',lease_until=?",Date.now()+120000).run();
    assert.equal((await f.run('qa-lease')).code,'SCRAPYARD_V3_RUNNING');assert.equal(await f.ticket(),4);
    await f.p('UPDATE scrapyard_v3_operations_v1 SET lease_until=0').run();
    assert.equal((await f.run('qa-lease')).status,'COMPLETED');assert.equal(await f.parts(),2);
  });
  test(`${backend}: zero ticket, daily limit, closed access and invalid deck do not spend or award`,async t=>{
    const f=await fixture(t,postgres);
    await f.p("UPDATE cnine_user_inventory SET quantity=0 WHERE item_code='SCRAPYARD_ENTRY_TICKET'").run();
    await assert.rejects(()=>f.run('qa-empty'),/입장권|횟수/);assert.equal(await f.count('scrapyard_v3_operations_v1'),0);
    await f.p("UPDATE cnine_user_inventory SET quantity=5 WHERE item_code='SCRAPYARD_ENTRY_TICKET'").run();
    f.setSettings({...settings(),dailyRuns:1});await f.run('qa-first');await assert.rejects(()=>f.run('qa-limit'),/입장권|횟수/);
    f.setSettings({...settings(),mode:'OFF'});await assert.rejects(()=>f.run('qa-closed'),/잠겨/);
    f.setSettings(settings());const invalid=deck();invalid.ids.pop();f.setDeck(invalid);await assert.rejects(()=>f.run('qa-deck'),/덱 5장/);
    assert.equal(await f.ticket(),4);assert.equal(await f.parts(),2);
  });
  test(`${backend}: failure is saved, costs one entry, and has no completion rewards`,async t=>{
    const f=await fixture(t,postgres),weak=deck(100);weak.characterBonus={pve:0};f.setDeck(weak);
    const r=await f.run('qa-loss');assert.equal(r.success,false);assert.equal(r.status,'COMPLETED');assert.equal(r.rewards.length,0);
    assert.equal(await f.ticket(),4);assert.equal(await f.coin(),10);assert.equal(await f.parts(),0);
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
    const r=await f.run('qa-no-row');assert.equal(r.code,'SCRAPYARD_V3_SETTLEMENT_PENDING');assert.equal(await f.ticket(),4);assert.equal(await f.coin(),10);
    assert.equal(await f.count('unified_drop_receipts_v1667'),0);assert.equal(await f.count('user_equipment_instances'),0);
    if(postgres)await f.pg.exec('DROP TRIGGER skip_equipment ON user_equipment_instances');else f.DB.sql.exec('DROP TRIGGER skip_equipment');
    const recovered=await f.run('qa-no-row');assert.equal(recovered.status,'COMPLETED');assert.equal(await f.ticket(),4);assert.equal(await f.count('user_equipment_instances'),1);
  });
  test(`${backend}: skipped guaranteed-coin update cannot complete an unpaid expedition`,async t=>{
    const f=await fixture(t,postgres);
    if(postgres)await f.pg.exec("CREATE FUNCTION skip_coin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER skip_coin BEFORE UPDATE OF coin ON users FOR EACH ROW EXECUTE FUNCTION skip_coin();");
    else f.DB.sql.exec("CREATE TRIGGER skip_coin BEFORE UPDATE OF coin ON users BEGIN SELECT RAISE(IGNORE); END;");
    assert.equal((await f.run('qa-no-coin')).code,'SCRAPYARD_V3_SETTLEMENT_PENDING');
    assert.equal(await f.coin(),10);assert.equal(await f.parts(),0);assert.equal(await f.count('scrapyard_runs_v1676'),0);
    if(postgres)await f.pg.exec('DROP TRIGGER skip_coin ON users');else f.DB.sql.exec('DROP TRIGGER skip_coin');
    assert.equal((await f.run('qa-no-coin')).status,'COMPLETED');assert.equal(await f.coin(),100010);assert.equal(await f.ticket(),4);
  });
}

test('response lost after final COMMIT returns the persisted receipt, with no second reward',async t=>{
  const f=await fixture(t);f.DB.throwAfterCommit=true;
  const r=await f.run('qa-response-lost');assert.equal(r.status,'COMPLETED');assert.equal(r.replayed,true);
  assert.equal(await f.ticket(),4);assert.equal(await f.parts(),2);assert.equal(await f.coin(),100010);
});

test('reservation response lost after COMMIT settles immediately with its original lease',async t=>{
  const f=await fixture(t);f.DB.throwAfterReservation=true;
  const r=await f.run('qa-reservation-lost');
  assert.equal(r.status,'COMPLETED');assert.equal(await f.ticket(),4);assert.equal(await f.parts(),2);
  assert.equal(await f.count('scrapyard_v3_operations_v1'),1);assert.equal(await f.count('inventory_logs'),2);
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
