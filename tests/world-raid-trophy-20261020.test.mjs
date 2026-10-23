import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {JointSQLiteDB} from './helpers/joint-db.mjs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {readWorldRaidClearHonors,prepareWorldRaidClearStatements,worldRaidClearKey,worldRaidReceiptKey,WORLD_RAID_BASELINE_KEY,worldRaidClearTime} from '../functions/_world_raid_trophy.js';
import {aggregateWorldRaidProofs,backfillWorldRaidTrophyBaseline} from '../scripts/ops/world-raid-trophy-baseline-20261020.mjs';
import {emptyTrophyBonuses,validateTrophyBonuses,TROPHY_BONUSES_KEY} from '../shared/trophy-bonuses-v1.mjs';
import {readTrophyBonusSettings} from '../functions/_collection_bonuses.js';
const at='2026-10-20T05:00:00.000Z',cfg={enabled:true,ownerOnlyTest:false};
const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
async function fixture(t,postgres){
 let pg,DB,fail='';
 const schema=`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE raid_instances(id INTEGER PRIMARY KEY,status TEXT,current_hp INTEGER,starts_at TEXT,ends_at TEXT,updated_at TEXT);
 CREATE TABLE raid_participants(instance_id INTEGER,user_id INTEGER,total_power INTEGER,total_damage INTEGER,is_active INTEGER,reward_claimed INTEGER DEFAULT 0,PRIMARY KEY(instance_id,user_id));
 CREATE TABLE raid_instance_v1293(instance_id INTEGER PRIMARY KEY,settings_json TEXT);`;
 if(postgres){
  pg=new PGlite();await pg.exec(schema.replaceAll('INTEGER','BIGINT'));
  const compat=readFileSync(new URL('../scripts/postgres-runtime-compat.sql',import.meta.url),'utf8');
  await pg.exec(compat.match(/CREATE OR REPLACE FUNCTION sqlite_json_extract[\s\S]*?\$\$;/)[0]);
  await pg.exec(`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
   CREATE FUNCTION sqlite_datetime(text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT $1$$;
   CREATE FUNCTION pg_advisory_xact_lock(integer,integer) RETURNS void LANGUAGE SQL AS $$SELECT$$;`);
  DB=new __postgresCompatTest.PostgresD1Database({async query(input){
   const text=typeof input==='string'?input:input.text;if(fail&&text.includes(fail))throw Error('INJECTED');
   const r=await pg.query(text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};
  }});
 }else{DB=new JointSQLiteDB();DB.sql.exec(schema);}
 t.after(()=>pg?pg.close():DB.sql.close());
 const env={DB},p=(sql,...args)=>DB.prepare(sql).bind(...args);
 const put=(key,value)=>p('INSERT INTO app_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value)).run();
 await put('raid_settings_v1',cfg);
 const room=async(id,{status='BATTLE',hp=100,settings=cfg,active=1,power=10,users=[1,2],finishedAt=at}={})=>{
  await p('INSERT INTO raid_instances VALUES(?,?,?,?,?,NULL)',id,status,hp,'2026-10-20T04:59:00Z',finishedAt).run();
  if(settings!==null)await p('INSERT INTO raid_instance_v1293 VALUES(?,?)',id,JSON.stringify(settings)).run();
  for(const uid of users)await p('INSERT INTO raid_participants(instance_id,user_id,total_power,total_damage,is_active) VALUES(?,?,?,?,?)',id,uid,power,100,active).run();
 };
 const plan=async(id,{settings=cfg,cleared=true,hp=0,users=[1,2],finishedAt=at}={})=>{
  const snapshot={cleared,bossHp:hp,states:users.map(userId=>({row:{userId,totalPower:10}}))};
  return [...await prepareWorldRaidClearStatements(env,{instanceId:id,settings,snapshot,finishedAt}),
   p("UPDATE raid_instances SET status='ENDED',current_hp=?,ends_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='BATTLE'",hp,finishedAt,id)];
 };
 return {pg,env,p,put,room,plan,fail:value=>{fail=value;DB.failAt=value;},read:id=>readWorldRaidClearHonors(env,id)};
}
for(const postgres of [false,true]){
 const label=postgres?'Postgres':'SQLite';
 test(label+': 5000th official clear is atomic, permanent and once per participant despite competing polls',async t=>{
  const f=await fixture(t,postgres);await f.put(WORLD_RAID_BASELINE_KEY,{ready:true});await f.put(worldRaidClearKey(1),{count:4999,acquiredAt:null});await f.room(1);
  const first=await f.plan(1),stale=await f.plan(1);
  f.fail('UPDATE raid_instances');await assert.rejects(f.env.DB.batch(first),/INJECTED/);f.fail('');
  assert.equal((await f.read(1)).progress,4999);assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',worldRaidReceiptKey(1)).first(),null);
  await f.env.DB.batch(first);await f.env.DB.batch(stale);await f.env.DB.batch(await f.plan(1));
  assert.deepEqual(await f.read(1),{count:1,progress:5000,goal:5000,acquiredAt:at});assert.equal((await f.read(2)).progress,1);assert.equal((await f.read(3)).progress,0);
  await f.room(2);await f.room(3);
  const a=await f.plan(2,{finishedAt:'2026-10-21T00:00:00Z'}),b=await f.plan(3,{finishedAt:'2026-10-22T00:00:00Z'});
  await f.env.DB.batch(a);await f.env.DB.batch(b);
  await f.p('DELETE FROM raid_instance_v1293').run();await f.p('DELETE FROM raid_participants').run();
  assert.deepEqual(await f.read(1),{count:1,progress:5002,goal:5000,acquiredAt:at});
 });
 test(label+': legacy proof excludes failed, cancelled, TEST, departed, zero-power and unverifiable rooms; next settlement includes history',async t=>{
  const f=await fixture(t,postgres);
  await f.room(1,{status:'ENDED',hp:0});await f.room(2,{status:'ENDED',hp:0,users:[1]});
  await f.room(3,{status:'ENDED',hp:1});await f.room(4,{status:'ENDED',hp:0,settings:{...cfg,ownerOnlyTest:true}});
  await f.room(5,{status:'ENDED',hp:0,active:0});await f.room(6,{status:'ENDED',hp:0,power:0});
  await f.room(7,{status:'ENDED',hp:0,settings:null});await f.room(8,{status:'LOBBY',hp:0});
  await f.room(9,{status:'ENDED',hp:0,settings:{...cfg,enabled:false}});
  assert.equal((await f.read(1)).progress,2);assert.equal((await f.read(2)).progress,1);
  await f.room(10);await f.env.DB.batch(await f.plan(10));assert.equal((await f.read(1)).progress,3);
  await f.room(11);await f.env.DB.batch(await f.plan(11,{settings:{...cfg,ownerOnlyTest:true}}));
  await f.room(12);await f.env.DB.batch(await f.plan(12,{cleared:false,hp:10}));
  await f.env.DB.batch(await f.plan(8));
  assert.equal((await f.read(1)).progress,3);assert.equal((await f.read(2)).progress,2);
 });
 test(label+': real raid refresh uses saved room settings and commits the trophy together with the end state',async t=>{
  const f=await fixture(t,postgres);await f.put(WORLD_RAID_BASELINE_KEY,{ready:true});await f.room(1);
  const refresh=vm.runInNewContext(api.slice(api.indexOf('async function refreshRaidForOwner('),api.indexOf('\nasync function ensureRaidFinalizedV1293'))+';refreshRaidForOwner',{
   Date,Number,prepareWorldRaidClearStatements,raidInstanceSettingsV1293:async()=>cfg,repairRaidZeroDamage:async()=>{},
   raidCombatSnapshot:rows=>({cleared:true,allDefeated:false,bossHp:0,elapsedMs:60000,states:rows.map(row=>({row}))}),
   accountRankAward:async()=>[],finalizeRaidV1293:async()=>{}
  });
  await refresh(f.env,await f.p('SELECT * FROM raid_instances WHERE id=1').first(),{...cfg,ownerOnlyTest:true});
  assert.equal((await f.read(1)).progress,1);assert.equal((await f.p('SELECT status FROM raid_instances WHERE id=1').first()).status,'ENDED');
  const statusPath=api.slice(api.indexOf("if(current.status==='BATTLE'&&(allDefeated||cleared"),api.indexOf("const result=allDefeated?"));
  assert.match(statusPath,/prepareWorldRaidClearStatements[\s\S]*env\.DB\.batch\(\[\.\.\.trophyWrites/);
 });
 test(label+': reading the saved eight-trophy CMS document adds only a zero default; incomplete saves remain invalid',async t=>{
  const f=await fixture(t,postgres),legacy=emptyTrophyBonuses(),laterCodes=new Set(['WORLD_RAID_CLEAR_5000','BLUE_EMPIRE_20','LIMITED_EDITION_80','LOYAL_SERVICE_POST_20']);legacy.trophies=legacy.trophies.filter(t=>!laterCodes.has(t.code));legacy.trophies[0].rewardBonuses.coinPercent=12.5;
  const state={revision:7,document:legacy,audit:[]};await f.put(TROPHY_BONUSES_KEY,state);
  const result=await readTrophyBonusSettings(f.env);assert.equal(result.revision,7);assert.equal(result.document.trophies.length,emptyTrophyBonuses().trophies.length);
  assert.equal(legacy.trophies.length,8);assert.deepEqual(result.document.trophies.slice(0,8),legacy.trophies);for(const row of result.document.trophies.filter(t=>laterCodes.has(t.code)))assert.deepEqual(row.rewardBonuses,{coinPercent:0,accountXpPercent:0,dropPercent:0});
  assert.deepEqual(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',TROPHY_BONUSES_KEY).first()).value),state);
  assert.throws(()=>validateTrophyBonuses(legacy));assert.equal(validateTrophyBonuses(result.document).trophies.length,emptyTrophyBonuses().trophies.length);
  const broken=structuredClone(result.document);broken.trophies.splice(0,1);assert.throws(()=>validateTrophyBonuses(broken,{allowLegacy:true}));
 });
}
test('historical baseline rolls back on dry run, preserves live counts, replays without writes, and freezes after source cleanup',async t=>{
 const f=await fixture(t,true);await f.room(1,{status:'ENDED',hp:0});await f.room(2,{status:'ENDED',hp:0,users:[1]});
 await f.put(worldRaidClearKey(1),{count:3,acquiredAt:null});
 const dry=await backfillWorldRaidTrophyBaseline(f.pg,{dryRun:true});assert.equal(dry.inserted,1);assert.equal(dry.preserved,1);
 assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',WORLD_RAID_BASELINE_KEY).first(),null);
 const saved=await backfillWorldRaidTrophyBaseline(f.pg);assert.equal(saved.participations,3);
 assert.equal((await backfillWorldRaidTrophyBaseline(f.pg)).replayed,true);
 await f.p('DELETE FROM raid_instance_v1293').run();assert.equal((await f.read(1)).progress,3);assert.equal((await f.read(2)).progress,1);assert.equal((await f.read(3)).progress,0);
});
test('historical threshold date is the 5000th actual UTC clear, with no duplicate trophy after further clears',()=>{
 const rows=Array.from({length:5001},(_,i)=>({id:i+1,user_id:1,ends_at:new Date(Date.parse(at)+i*60000).toISOString()}));
 const [[id,value]]=aggregateWorldRaidProofs(rows);assert.equal(id,1);assert.equal(value.count,5001);assert.equal(value.acquiredAt,rows[4999].ends_at);
 assert.equal(worldRaidClearTime('2026-10-20 05:00:00'),at);
});
