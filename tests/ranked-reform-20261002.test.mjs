import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import nodePg from 'pg';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {rankedScoreAdjustment,rankedPowerDifference,rankedCandidateAllowed,rankedSqlUtc} from '../shared/ranked-reform-v1.mjs';
import {RANKED_REFORM_SCHEMA,readRankedEnergy,commitRankedFight,rankedFightReceipt} from '../functions/_ranked_reform.js';
import {reopenRankedIfDue,RANKED_REOPEN_KEY} from '../functions/_ranked_reopen.js';
import {runRankedReopenSchedule} from '../workers/clan-draft/src/ranked-reopen.js';

const schema=[
 'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
 'CREATE TABLE users(id INTEGER PRIMARY KEY,coin INTEGER,magic_crystals INTEGER)',
 'CREATE TABLE pvp_profiles(user_id INTEGER PRIMARY KEY,season_score INTEGER,highest_score INTEGER,wins INTEGER,losses INTEGER,updated_at TEXT)',
 'CREATE TABLE user_pvp_energy(user_id INTEGER PRIMARY KEY,energy INTEGER,last_recharged_at TEXT,updated_at TEXT)',
 'CREATE TABLE pvp_ranked_match_tickets_v1671(token TEXT PRIMARY KEY,attacker_id INTEGER,used_at TEXT,expires_at TEXT)',
 'CREATE TABLE pvp_match_history(id INTEGER PRIMARY KEY,attacker_id INTEGER,score_change INTEGER)',
 'CREATE TABLE coin_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT)',
 'CREATE TABLE pvp_season_lifecycle_lock_v1671(lock_key TEXT PRIMARY KEY,token TEXT,lease_until_ms BIGINT,updated_at TEXT)',
 'CREATE TABLE pvp_season_settlements(id INTEGER PRIMARY KEY,season_key TEXT,status TEXT)',
 'CREATE TABLE pvp_season_settlement_ranks(settlement_id INTEGER,user_id INTEGER,reward_coin INTEGER,reward_shards INTEGER)',
 'CREATE TABLE pvp_season_settlement_deliveries(settlement_id INTEGER,user_id INTEGER,reward_type TEXT,status TEXT)',
 ...RANKED_REFORM_SCHEMA
];
async function fixture(t,postgres){
 let now=Date.parse('2026-10-01T16:00:00Z'),fail='',calls=0,native,pg,DB;
 if(postgres){
  pg=new PGlite();await pg.exec("CREATE TABLE test_clock(value TEXT); INSERT INTO test_clock VALUES('2026-10-01 16:00:00'); CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT value FROM test_clock $$;"+schema.join(';'));
  DB=new __postgresCompatTest.PostgresD1Database({escapeLiteral:nodePg.Client.prototype.escapeLiteral,async query(input){
   calls++;const sql=typeof input==='string'?input:input.text;
   // Inject inside the transaction, including a production-style pipelined batch.
   if(fail&&sql.includes(fail)){fail='';if(typeof input==='string')return pg.exec(sql.replace('INSERT INTO coin_logs','INSERT INTO missing_coin_logs'));throw Error('INJECTED');}
   if(typeof input==='string'){const result=(await pg.exec(sql)).map(r=>({...r,rowCount:r.affectedRows??r.rows.length}));return result.length===1?result[0]:result;}
   const result=await pg.query(sql,input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};
  }});
 }else{
  native=new DatabaseSync(':memory:');native.function('current_timestamp',()=>rankedSqlUtc(now));native.exec(schema.join(';'));
  const execute=s=>{calls++;if(fail&&s.sql.includes(fail)){fail='';throw Error('INJECTED');}const stmt=native.prepare(s.sql);if(stmt.columns().length)return {results:stmt.all(...s.values),meta:{changes:0}};return {results:[],meta:{changes:Number(stmt.run(...s.values).changes)}};};
  DB={prepare(sql){return {sql,values:[],bind(...values){return {...this,values};},async all(){return execute(this);},async first(){return execute(this).results[0]||null;},async run(){return execute(this);}};},async batch(list){native.exec('BEGIN');try{const results=list.map(execute);native.exec('COMMIT');return results;}catch(error){native.exec('ROLLBACK');throw error;}}};
 }
 t.after(()=>pg?pg.close():native.close());const env={DB},q=(sql,...args)=>DB.prepare(sql).bind(...args);
 const settings={enabled:true,automaticSeasons:true,seasonName:'시즌 19',startsAt:'2026-10-01 15:00:00',endsAt:'2026-10-06 15:00:00',initialScore:1000,energy:{enabled:true,maxEnergy:10,costPerBattle:1,rechargeMinutes:5}};
 await q('INSERT INTO app_meta VALUES(?,?,?)','pvp_settings_v1',JSON.stringify(settings),rankedSqlUtc(now)).run();
 await q('INSERT INTO app_meta VALUES(?,?,?)','tier_settings_v1',JSON.stringify({unrelated:'keep',pvp:settings}),rankedSqlUtc(now)).run();
 for(const id of [1,2]){await q('INSERT INTO users VALUES(?,?,?)',id,500,3).run();await q('INSERT INTO pvp_profiles VALUES(?,?,?,?,?,?)',id,1000,1000,0,0,'original').run();}
 await q('INSERT INTO user_pvp_energy VALUES(?,?,?,?)',1,10,rankedSqlUtc(now),'original').run();
 await q('INSERT INTO pvp_ranked_match_tickets_v1671 VALUES(?,?,NULL,?)','ticket',1,'2026-10-01 16:01:30').run();
 const user={id:1,role:'USER'},ticket={token:'ticket'};
 const energy=()=>readRankedEnergy(env,user,settings.energy,{now});
 const commit=async overrides=>commitRankedFight(env,{user,settings,ticket,requestId:'request-one',energy:await energy(),beforeScore:1000,now,writes:[
  q('UPDATE pvp_profiles SET season_score=?,highest_score=?,wins=wins+1 WHERE user_id=?',1024,1024,1),
  q('INSERT INTO pvp_match_history VALUES(1,1,24)'),q('UPDATE users SET coin=coin+50 WHERE id=1'),
  q("INSERT INTO coin_logs SELECT id,50,coin,'PVP_ATTACK_BATTLE' FROM users WHERE id=1")
 ],response:{result:'WIN',scoreAfter:1024,scoreChange:24,coinReward:50},...overrides});
 const state=async()=>({profile:await q('SELECT * FROM pvp_profiles WHERE user_id=1').first(),defender:await q('SELECT * FROM pvp_profiles WHERE user_id=2').first(),energy:await q('SELECT * FROM user_pvp_energy WHERE user_id=1').first(),wallet:await q('SELECT * FROM users WHERE id=1').first(),ticket:await q("SELECT * FROM pvp_ranked_match_tickets_v1671 WHERE token='ticket'").first(),receipts:(await q('SELECT * FROM ranked_fight_receipts_v1').all()).results,history:(await q('SELECT * FROM pvp_match_history').all()).results});
 return {env,q,settings,user,ticket,energy,commit,state,clock:()=>now,calls:()=>calls,fail:sql=>fail=sql,async setNow(value){now=value;if(pg)await pg.query('UPDATE test_clock SET value=$1',[rankedSqlUtc(now)]);}};
}

test('rating: equal opponents have no 50% drift; stronger opponents pay more and cost less',()=>{
 for(const score of [-200,0,1000,6500]){
  assert.equal(rankedScoreAdjustment(true,score,score).change,24);assert.equal(rankedScoreAdjustment(false,score,score).change,24);
  assert.equal(10*rankedScoreAdjustment(true,score,score).change-10*rankedScoreAdjustment(false,score,score).change,0);
 }
 for(let gap=-250;gap<=250;gap++){
  const win=rankedScoreAdjustment(true,1000,1000+gap),lose=rankedScoreAdjustment(false,1000,1000+gap);
  assert.equal(win.change+lose.change,48);assert.equal(win.change,rankedScoreAdjustment(false,1000+gap,1000).change);
  if(gap>10){assert.ok(win.change>24);assert.ok(lose.change<24);}
 }
});
test('match limits are hard, symmetric, and independent of available candidate count',()=>{
 const cfg={matchCardRange:20,matchSeasonRange:250};
 for(const [a,b,ok] of [[100,120,true],[120,100,true],[100,121,false],[100,1000,false],[0,100,false]])assert.equal(rankedCandidateAllowed({powerDiff:rankedPowerDifference(a,b),scoreDiff:0},cfg),ok);
 assert.equal(rankedCandidateAllowed({powerDiff:0,scoreDiff:251},cfg),false);
});

for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL pipeline':'SQLite';
 test(`${dialect}: score, energy, coin, history and receipt are atomic; defense stays unchanged`,async t=>{
  const f=await fixture(t,postgres),before=await f.state(),start=f.calls(),result=await f.commit();
  const after=await f.state();assert.equal(after.profile.season_score,1024);assert.deepEqual(after.defender,before.defender);assert.equal(after.energy.energy,9);assert.equal(after.wallet.coin,550);assert.equal(after.receipts.length,1);assert.equal(after.history.length,1);assert.equal(result.energy.energy,9);
  const receipt=await rankedFightReceipt(f.env,1,'request-one','ticket');assert.equal(receipt.replayed,true);assert.equal(receipt.coinAfter,550);
  await assert.rejects(rankedFightReceipt(f.env,1,'request-one','another-ticket'),/다른 경기/);assert.equal(await rankedFightReceipt(f.env,2,'request-one','ticket'),null);
  if(postgres)assert.ok(f.calls()-start<=15,'commit is pipelined, not one network round trip per write');
 });
 test(`${dialect}: failed write rolls back all changes and permits safe retry`,async t=>{
  const f=await fixture(t,postgres),before=await f.state();f.fail('INSERT INTO coin_logs');await assert.rejects(f.commit());assert.deepEqual(await f.state(),before);await f.commit();assert.equal((await f.state()).energy.energy,9);
 });
 test(`${dialect}: concurrent attempts using the same stale snapshot commit only once`,async t=>{
  const f=await fixture(t,postgres),snapshot=await f.energy();const results=await Promise.allSettled([f.commit({energy:snapshot}),f.commit({energy:snapshot})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.state()).wallet.coin,550);assert.equal((await f.state()).energy.energy,9);
 });
 test(`${dialect}: closed season or changed score refuses before any charge`,async t=>{
  const f=await fixture(t,postgres);await f.q("UPDATE app_meta SET value=? WHERE key='pvp_settings_v1'",JSON.stringify({...f.settings,enabled:false})).run();const before=await f.state();await assert.rejects(f.commit());assert.deepEqual(await f.state(),before);
  await f.q("UPDATE app_meta SET value=? WHERE key='pvp_settings_v1'",JSON.stringify(f.settings)).run();await f.q('UPDATE pvp_profiles SET season_score=900 WHERE user_id=1').run();const changed=await f.state();await assert.rejects(f.commit());assert.deepEqual(await f.state(),changed);
 });
 test(`${dialect}: recharge reads never overwrite a debit; old burning surplus is capped`,async t=>{
  const f=await fixture(t,postgres);await f.q('UPDATE user_pvp_energy SET energy=0,last_recharged_at=? WHERE user_id=1','2026-10-01 15:50:00').run();
  assert.equal((await f.energy()).state.energy,2);assert.equal((await f.state()).energy.energy,0);await f.commit();assert.equal((await f.energy()).state.energy,1);
  await f.setNow(f.clock()+300000);assert.equal((await f.energy()).state.energy,2);await f.q('UPDATE user_pvp_energy SET energy=50 WHERE user_id=1').run();assert.equal((await f.energy()).state.energy,10);
 });
 test(`${dialect}: scheduled reopening is gated by time and rewards, archives once and preserves payouts`,async t=>{
  const f=await fixture(t,postgres),opens=f.clock()+60000,opensAt=new Date(opens).toISOString(),requiredSettlementKey='시즌 18|old|end';
  const paused={...f.settings,enabled:false,automaticSeasons:false,scheduledReopenAt:opensAt};
  const schedule={id:'reopen-test',status:'SCHEDULED',opensAt,seasonDurationDays:5,resetScores:true,seasonName:'시즌 19',previousSeasonKey:[paused.seasonName,paused.startsAt,paused.endsAt].join('|'),requiredSettlementKey};
  await f.q("UPDATE app_meta SET value=? WHERE key='pvp_settings_v1'",JSON.stringify(paused)).run();await f.q('INSERT INTO app_meta VALUES(?,?,?)',RANKED_REOPEN_KEY,JSON.stringify(schedule),'original').run();
  await f.q("INSERT INTO pvp_season_settlements VALUES(18,?,'COMPLETED')",requiredSettlementKey).run();await f.q('INSERT INTO pvp_season_settlement_ranks VALUES(18,1,100,0)').run();
  await f.q('UPDATE pvp_profiles SET season_score=1224,highest_score=1224,wins=9,losses=1 WHERE user_id=1').run();
  const before=await f.state();assert.equal((await reopenRankedIfDue(f.env,{now:f.clock()})).state,'WAITING');assert.deepEqual(await f.state(),before);
  await f.setNow(opens);await assert.rejects(reopenRankedIfDue(f.env,{now:f.clock()}));assert.deepEqual(await f.state(),before,'missing delivery cannot reset profiles or reopen');
  await f.q("INSERT INTO pvp_season_settlement_deliveries VALUES(18,1,'COIN','SENT')").run();const opened=await reopenRankedIfDue(f.env,{now:f.clock()});
  assert.equal(opened.changed,true);assert.equal(opened.settings.startsAt,'2026-10-01 16:01:00');assert.equal(opened.settings.endsAt,'2026-10-06 16:01:00');assert.equal(opened.settings.automaticSeasons,true);
  assert.equal((await f.state()).profile.season_score,1000);assert.equal((await f.state()).profile.wins,0);assert.deepEqual((await f.state()).wallet,before.wallet);
  const archive=await f.q('SELECT * FROM ranked_reform_profile_archive_v1 WHERE operation_key=? AND user_id=1',schedule.id).first();assert.equal(archive.season_score,1224);assert.equal(archive.wins,9);
  await f.q('UPDATE pvp_profiles SET season_score=1024 WHERE user_id=1').run();assert.equal((await reopenRankedIfDue(f.env,{now:f.clock()})).changed,false);assert.equal((await f.state()).profile.season_score,1024);
  const tier=JSON.parse((await f.q("SELECT value FROM app_meta WHERE key='tier_settings_v1'").first()).value);assert.equal(tier.unrelated,'keep');assert.equal(tier.pvp.enabled,true);
 });
}

test('server wiring excludes burning energy, keeps defense untouched and uses the guarded commit',()=>{
 const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 const burn=Function(`${api.split('\n').find(s=>s.startsWith('function applyBurningPvpSettings'))}\nreturn applyBurningPvpSettings;`)();
 const original={energy:{maxEnergy:10,rechargeMinutes:5}};assert.deepEqual(burn(original,{enabled:true,pvpMaxEnergy:50,rechargeMinutes:1,activatedAt:new Date().toISOString()}),original);
 const fight=api.slice(api.indexOf("if(path==='pvp/fight'"),api.indexOf("if(path==='pvp/history'"));
 assert.ok(fight.includes('commitRankedFight'));assert.equal((fight.match(/UPDATE pvp_profiles SET/g)||[]).length,1);assert.ok(fight.includes('dAfter=dBefore'));assert.ok(!fight.includes('Math.max(0,aBefore'),'no score-floor farming drift');
 assert.ok(api.includes('if(rankedMatchBand({scoreDiff,powerDiff},settings)<0)continue'));
});
test('minute cron opens through the same operation and always closes its database connection',async()=>{
 let closed=0;await runRankedReopenSchedule({},{openDatabase:async()=>({db:{},close:async()=>closed++}),reopen:async()=>({changed:false})});assert.equal(closed,1);
 await assert.rejects(runRankedReopenSchedule({},{openDatabase:async()=>({db:{},close:async()=>closed++}),reopen:async()=>{throw Error('offline');}}),/offline/);assert.equal(closed,2);
});
