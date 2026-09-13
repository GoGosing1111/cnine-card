import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {__dropPoolTest} from '../functions/_drop_pool.js';
import {TOWER_V3_DRAFT,buildTowerV3Battle,migrateTowerProgress,towerProgressAfter,validateTowerV3Config,validateTowerConfigChange} from '../functions/_tower_v3.js';
import {TOWER_V3_ECONOMY_DRAFT,TOWER_LEGACY_REWARD_SNAPSHOT,planTowerRewards,towerRepeatCoin,towerBudgetDate} from '../functions/_tower_v3_economy.js';
import {ensureTowerV3Schema,runTowerV3,towerV3Status,towerV3Result} from '../functions/_tower_v3_runs.js';
import {handleTowerV3Route} from '../functions/_tower_v3_routes.js';
import {readTowerV3Settings,saveTowerV3Draft} from '../functions/_tower_v3_settings.js';
import {loadTowerV3Legacy} from '../functions/_tower_v3_legacy.js';

const user={id:7,role:'OWNER',nickname:'LOCAL QA'};
const snapshot=(power=200000)=>({cards:Array.from({length:5},(_,i)=>({id:String(i+1),rarity:'FUR',power,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]})),accountNickname:'LOCAL QA'});
const battle=(tier=20,power=200000,seed=17,config=TOWER_V3_DRAFT)=>buildTowerV3Battle({snapshot:snapshot(power),tier,seed,config});
test('tower has 24+3+guardian, fixed enemies and bounded simultaneous slots',()=>{
  for(let seed=1;seed<=20;seed++){
    const b=battle(20,200000,seed),e=b.continuousEncounter,rows=new Map(e.instances.map(r=>[r.id,r])),active=new Set(e.initialIds),dead=new Set();
    assert.equal(e.total,28);let clock=0;
    for(const v of b.battleV2.result.timeline){
      assert.ok(v.elapsedCombatMs>=clock);clock=v.elapsedCombatMs;
      if(v.type==='KO'&&rows.has(v.targetId)){assert.ok(!dead.has(v.targetId));dead.add(v.targetId);active.delete(v.targetId);}
      if(v.type==='ENEMY_SPAWN'){const row=rows.get(v.targetId);assert.ok(row);if(row.boss){assert.equal(dead.size,27);assert.equal(v.guardianProgress,100);}active.add(v.targetId);assert.ok(active.size<=3);}
    }
    assert.equal(clock,b.elapsedCombatMs);assert.equal(b.success,true);assert.equal(dead.size,28);
    assert.deepEqual(battle(20,1,seed).continuousEncounter.instances,e.instances);
  }
});
test('strict losses, deterministic official time and overflow rejection',()=>{
  assert.equal(battle(20,1).success,false);assert.equal(battle(20,1).failureReason,'TIME_LIMIT');assert.equal(battle(20,1).elapsedCombatMs,180000);
  assert.deepEqual(battle().battleV2.result,battle().battleV2.result);
  const limited=battle(20,10000,17,{...TOWER_V3_DRAFT,maxActions:10});assert.equal(limited.success,false);
  for(const patch of [{maxTier:1000},{normalCount:40},{fastUnlockTwo:.7,fastUnlockThree:.6},{normalPoints:10},{powerGrowth:NaN}])assert.throws(()=>validateTowerV3Config({...TOWER_V3_DRAFT,...patch}));
  assert.throws(()=>buildTowerV3Battle({snapshot:{cards:snapshot().cards.slice(1)},tier:1,seed:1}));
  assert.throws(()=>validateTowerConfigChange(TOWER_V3_DRAFT,{...TOWER_V3_DRAFT,basePower:6000}));
});
test('legacy best has no invented time; farming cannot inflate unlocks or claim old first prizes',()=>{
  const p=migrateTowerProgress({highestFloor:59,currentFloor:60});assert.equal(p.bestCombatMs,null);
  const b=battle(20);assert.deepEqual(towerProgressAfter(p,b),p);
  assert.equal(planTowerRewards({battle:b,progress:p}).firstClear,false);
  assert.equal(towerProgressAfter(p,{success:true,tier:60,unlockStep:3}).maxUnlockedTier,63);
  const skipped=planTowerRewards({battle:{success:true,tier:62},progress:{...p,maxUnlockedTier:63}});assert.equal(skipped.firstClear,true);
  assert.equal(towerRepeatCoin(70),500000);assert.equal(towerRepeatCoin(60),200000);assert.equal(towerRepeatCoin(10),20000);
  assert.equal(towerBudgetDate(Date.parse('2026-09-11T14:59:59Z')),'2026-09-11');assert.equal(towerBudgetDate(Date.parse('2026-09-11T15:00:00Z')),'2026-09-12');
});

class SQLiteDB{
  sql=new DatabaseSync(':memory:');failAt='';lostCommit=false;lostReserve=false;beforeBatch=null;
  prepare(source){const db=this;return {source,values:[],bind(...values){return {...this,values};},async first(){return db.sql.prepare(source).get(...this.values)||null;},async all(){return {results:db.sql.prepare(source).all(...this.values)};},async run(){const r=db.sql.prepare(source).run(...this.values);return {meta:{changes:Number(r.changes)}};}};}
  async batch(stmts){await this.beforeBatch?.(stmts);this.sql.exec('BEGIN');try{for(const s of stmts){if(this.failAt&&s.source.includes(this.failAt))throw new Error('INJECTED');this.sql.prepare(s.source).run(...s.values);}this.sql.exec('COMMIT');}catch(e){this.sql.exec('ROLLBACK');throw e;}
    if(this.lostCommit&&stmts.some(s=>s.source.includes("SET state='COMPLETED'"))){this.lostCommit=false;throw new Error('RESPONSE_LOST');}
    if(this.lostReserve&&stmts.some(s=>s.source.includes('SET rewarded=rewarded+'))){this.lostReserve=false;throw new Error('RESERVATION_LOST');}
    return [];
  }
}
async function fixture(t,postgres=false){
  const schema=[...__dropPoolTest.FOUNDATION_SQL,
    'CREATE TABLE users(id INTEGER PRIMARY KEY,coin INTEGER DEFAULT 10,card_shards INTEGER DEFAULT 0,magic_crystals INTEGER DEFAULT 0)',
    'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,rarity TEXT,image_url TEXT,is_active INTEGER DEFAULT 1)',
    'CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER DEFAULT 0,unseen_quantity INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code))',
    'CREATE TABLE inventory_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT)',
    'CREATE TABLE coin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT)'];
  let DB,pg,failAt='';
  if(postgres){pg=new PGlite();t.after(()=>pg.close());await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
    await pg.exec(schema.map(s=>s.replaceAll('INTEGER PRIMARY KEY AUTOINCREMENT','BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY').replaceAll('INTEGER','BIGINT').replaceAll('CURRENT_TIMESTAMP','sqlite_now()')).join(';'));
    DB=new __postgresCompatTest.PostgresD1Database({async query(input){const text=typeof input==='string'?input:input.text;if(failAt&&text.includes(failAt))throw new Error('INJECTED');const r=await pg.query(text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
  }else{DB=new SQLiteDB();t.after(()=>DB.sql.close());DB.sql.exec(schema.join(';'));}
  const env={DB},p=(sql,...args)=>DB.prepare(sql).bind(...args);await ensureTowerV3Schema(env);await ensureTowerV3Schema(env);
  await p('INSERT INTO users(id) VALUES(7)').run();await p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('VEHICLE_PART_TIRE','고성능 타이어','RARE','/tire.png')").run();
  let clock=Date.parse('2026-09-11T14:59:00Z'),deck=snapshot(),config={...TOWER_V3_DRAFT,mode:'TEST'},policy={...TOWER_V3_ECONOMY_DRAFT},legacy={highestFloor:29,currentFloor:30,firstRewards:TOWER_LEGACY_REWARD_SNAPSHOT};
  const deps={now:()=>clock,readConfig:async()=>structuredClone(config),readEconomy:async()=>structuredClone(policy),loadLegacy:async()=>structuredClone(legacy),loadSnapshot:async()=>structuredClone(deck)};
  return {env,p,DB,pg,deps,config,policy,legacy,setClock:x=>clock=x,setDeck:x=>deck=x,fail:x=>{failAt=x;DB.failAt=x;},
    run:(requestId='qa-run',tier=20,extras={})=>runTowerV3(env,user,{requestId,tier,...extras},deps),
    coin:async()=>Number((await p('SELECT coin FROM users WHERE id=7').first()).coin),count:async table=>Number((await p(`SELECT COUNT(*) n FROM ${table}`).first()).n)};
}
for(const pg of [false,true]){
  test(`${pg?'Postgres':'SQLite'}: 100 repeats reserve only 10 coin payouts and 2 materials; no old first reward`,async t=>{
    const f=await fixture(t,pg);for(let i=0;i<100;i++){const r=await f.run('repeat-'+i);assert.equal(r.status,'COMPLETED');assert.equal(r.success,true);assert.equal(r.firstClear,false);}
    assert.equal(await f.coin(),10+10*40000);
    assert.equal(Number((await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='VEHICLE_PART_TIRE'").first()).quantity),2);
    assert.equal(await f.count('tower_v3_first_clears_v1'),0);assert.equal(await f.count('tower_v3_records_v1'),1);
    assert.equal((await towerV3Status(f.env,user,f.deps)).progress.bestClearedTier,29);
  });
  test(`${pg?'Postgres':'SQLite'}: new first clear paid once across retries and policy versions`,async t=>{
    const f=await fixture(t,pg);const first=await f.run('first',30,{seed:0,cards:[{power:1e15}],success:true});assert.equal(first.success,true);assert.equal(first.firstClear,true);
    const coin=await f.coin();assert.ok(coin>=30000010);
    for(let i=0;i<5;i++)assert.equal((await f.run('first',160)).requestId,'first');assert.equal(await f.coin(),coin);
    f.policy.version='TOWER_ECONOMY_DRAFT_2';await f.run('first-again',30);assert.equal(await f.coin(),coin+60000);assert.equal(await f.count('tower_v3_first_clears_v1'),1);
    const other=await towerV3Result(f.env,{id:8},'first');assert.equal(other.status,'NOT_FOUND');
  });
  test(`${pg?'Postgres':'SQLite'}: interrupted settlement rolls back coins/claims, freezes midnight and CMS/deck`,async t=>{
    const f=await fixture(t,pg);f.fail('INSERT INTO tower_v3_records_v1');await assert.rejects(()=>f.run('recover',30));
    assert.equal(await f.coin(),10);assert.equal(await f.count('tower_v3_first_clears_v1'),0);
    const active=await f.run('other',20);assert.equal(active.requestId,'recover');assert.equal(active.status,'RUNNING');
    f.policy.dailyRewardedClears=0;f.config.mode='OFF';f.setDeck(snapshot(1));f.setClock(Date.parse('2026-09-11T15:01:00Z'));f.fail('');
    const r=await f.run('recover',1);assert.equal(r.success,true);assert.equal(r.budget.day,'2026-09-11');assert.equal(r.budget.rewarded,1);assert.equal(r.policyVersion,TOWER_V3_ECONOMY_DRAFT.version);
    assert.equal(await f.count('tower_v3_first_clears_v1'),1);assert.ok(await f.coin()>30000000);
  });
}
test('SQLite: commit response loss, concurrent tabs and zero-row grant destinations',async t=>{
  const f=await fixture(t);f.DB.lostCommit=true;const r=await f.run('lost');assert.equal(r.status,'COMPLETED');assert.equal(await f.coin(),40010);
  f.DB.lostReserve=true;assert.equal((await f.run('lost-reserve')).status,'COMPLETED');
  const results=await Promise.allSettled([f.run('tab-a'),f.run('tab-b')]);assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(await f.count('tower_v3_runs_v1')<=4,true);
  const before=await f.coin();f.DB.beforeBatch=async stmts=>{if(stmts.some(s=>s.source.includes("SET state='COMPLETED'"))){f.DB.beforeBatch=null;f.DB.sql.exec('DELETE FROM users WHERE id=7');}};
  await assert.rejects(()=>f.run('deleted-user'));assert.equal(await f.count('tower_v3_first_clears_v1'),0);
  assert.ok(before>=80010);
});
test('extended tower runs and re-ascent economy remain gated while native single-pass combat is released',async()=>{
  const r=await handleTowerV3Route({request:new Request('https://example.test/api/tower/v3/run',{method:'POST'}),env:{},user,path:'tower/v3/run',deps:{releaseEnabled:true}});assert.equal(r.status,404);
  for(const file of ['index.html','js/app.js','functions/api/[[path]].js'])assert.doesNotMatch(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),/_tower_v3_(?:routes|runs|economy)|tower\/v3\//);
});
test('CMS draft CAS, owner-only editing and no approval/ON through submitted fields',async t=>{
  const f=await fixture(t);f.DB.sql.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  const first=await readTowerV3Settings(f.env);assert.equal(first.config.mode,'OFF');
  await assert.rejects(()=>saveTowerV3Draft(f.env,{id:8,role:'USER'},first),{code:'TOWER_V3_PERMISSION'});
  const saved=await saveTowerV3Draft(f.env,user,{...first,config:{...first.config,mode:'TEST'},economy:{...first.economy,approved:true}});assert.equal(saved.economy.approved,false);
  await assert.rejects(()=>saveTowerV3Draft(f.env,user,first),{code:'TOWER_V3_CONFIG_CONFLICT'});
  // Pretty-printed existing CMS JSON is valid and remains protected by its raw CAS.
  await f.p('UPDATE app_meta SET value=?',JSON.stringify({...saved,ok:undefined},null,2)).run();
  const updated=await saveTowerV3Draft(f.env,user,{...await readTowerV3Settings(f.env),economy:{...saved.economy,dailyRewardedClears:0}});assert.equal(updated.economy.dailyRewardedClears,0);
  await assert.rejects(()=>saveTowerV3Draft(f.env,user,{...updated,config:{...updated.config,mode:'ON'}}),{code:'TOWER_V3_RELEASE_HELD'});
});
test('read-only legacy adapter preserves cross-season best, range priority and existing magic amounts',async t=>{
  const f=await fixture(t);f.DB.sql.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE tower_user_progress(user_id INTEGER,highest_floor INTEGER);
    CREATE TABLE tower_seasons(id INTEGER,status TEXT);
    CREATE TABLE battle_monsters(id INTEGER,is_active INTEGER,tower_enabled INTEGER);
    CREATE TABLE tower_floor_ranges(id INTEGER,season_id INTEGER,start_floor INTEGER,end_floor INTEGER,reward_coin INTEGER,monster_id INTEGER,is_active INTEGER);
    CREATE TABLE tower_floors(season_id INTEGER,floor_no INTEGER,reward_coin INTEGER,is_active INTEGER);
    INSERT INTO tower_user_progress VALUES(7,59),(7,10),(8,99);
    INSERT INTO tower_seasons VALUES(1,'ENDED'),(2,'ACTIVE');
    INSERT INTO battle_monsters VALUES(18,1,1);
    INSERT INTO tower_floor_ranges VALUES(1,2,1,10,1000000,18,1),(2,2,10,10,5000000,18,1);
    INSERT INTO tower_floors VALUES(2,10,1000,1),(2,11,2000000,1);`);
  await f.p('INSERT INTO app_meta VALUES(?,?)','magic_card_settings_v1',JSON.stringify({acquisition:{tower:{enabled:true,floorRewards:[{floor:10,amount:3}]}}})).run();
  const state=await loadTowerV3Legacy(f.env,user);assert.equal(state.highestFloor,59);assert.equal(state.currentFloor,60);assert.equal(state.firstRewards.find(r=>r.start===10).coin,5000000);assert.equal(state.firstRewards.find(r=>r.start===10).magicCrystals,3);assert.equal(state.firstRewards.find(r=>r.start===11).coin,2000000);
  assert.equal(await f.count('tower_v3_progress_v1'),0);
});
