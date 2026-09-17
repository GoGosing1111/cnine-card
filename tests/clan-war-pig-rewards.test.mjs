import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {LOOT_SHOP_SCHEMA} from '../functions/_loot_shop.js';
import {LOOT_SHOP_DEFAULTS} from '../shared/loot-shop-policy-v1.mjs';
import {JOINT_ATOMIC_SCHEMA} from '../functions/_joint_atomic.js';
import {CLAN_PIG_ROUND_RELEASE_KEY,clanWarPigReceiptKey,settleClanWarPigCoins,settlePendingClanWarPigCoins} from '../functions/_clan_war_pig_rewards.js';
import {clanPigCoinStatements} from '../functions/_pig_coin_content_rewards.js';

async function fixture(t,postgres){
 const schema=[
  'CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT DEFAULT 300)',
  'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
  'CREATE TABLE clan_members(season_id BIGINT,user_id BIGINT,clan_id BIGINT,joined_at TEXT,PRIMARY KEY(season_id,user_id))',
  'CREATE TABLE clan_wars(id BIGINT PRIMARY KEY,season_id BIGINT,round_no BIGINT,clan_a_id BIGINT,clan_b_id BIGINT,winner_clan_id BIGINT,status TEXT,ends_at TEXT,updated_at TEXT,score_a BIGINT DEFAULT 100,score_b BIGINT DEFAULT 50)',
  'CREATE TABLE clan_war_battles(war_id BIGINT,attacker_user_id BIGINT,attacker_clan_id BIGINT,defender_user_id BIGINT,status TEXT)',
  'CREATE TABLE clan_participation_progress(war_id BIGINT,user_id BIGINT,completed_attacks BIGINT,PRIMARY KEY(war_id,user_id))',
  'CREATE TABLE clan_season_teams(season_id BIGINT,clan_id BIGINT,score BIGINT DEFAULT 0,wins BIGINT DEFAULT 0,losses BIGINT DEFAULT 0,updated_at TEXT,PRIMARY KEY(season_id,clan_id))',
  ...LOOT_SHOP_SCHEMA.slice(0,2),...JOINT_ATOMIC_SCHEMA
 ];
 let DB,pg,sqlite,fail='';
 if(postgres){
  pg=new PGlite();t.after(()=>pg.close());await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");await pg.exec(schema.join(';'));
  DB=new __postgresCompatTest.PostgresD1Database({async query(input){const sql=typeof input==='string'?input:input.text;if(fail&&sql.includes(fail))throw Error('INJECTED');const r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
 }else{
  sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(schema.join(';'));
  const execute=s=>{if(fail&&s.sql.includes(fail))throw Error('INJECTED');const r=sqlite.prepare(s.sql).run(...s.values);return {meta:{changes:Number(r.changes)}};};
  const prepare=(sql,values=[])=>({sql,values,bind(...v){return prepare(sql,v);},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){return execute(this);}});
  DB={prepare,async batch(list){sqlite.exec('BEGIN');try{const result=list.map(execute);sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 }
 const env={DB},p=(sql,...values)=>DB.prepare(sql).bind(...values),setting=(key,value)=>p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value)).run();
 const policy=structuredClone(LOOT_SHOP_DEFAULTS);policy.rewardsEnabled=true;policy.sources[1].enabled=true;
 await setting('loot_shop_policy_v1',policy);await setting(CLAN_PIG_ROUND_RELEASE_KEY,{firstSeasonId:5,firstWarId:64});
 for(let id=1;id<=6;id++){await p('INSERT INTO users(id) VALUES(?)',id).run();await p('INSERT INTO clan_members VALUES(5,?,?,?)',id,[1,2,6].includes(id)?1:2,id===6?'2026-09-17T13:00:01Z':'2026-09-17 10:00:00').run();}
 await p("INSERT INTO clan_wars(id,season_id,round_no,clan_a_id,clan_b_id,winner_clan_id,status,ends_at) VALUES(64,5,1,1,2,1,'COMPLETED','2026-09-17T13:00:00Z')").run();
 await p('INSERT INTO clan_season_teams(season_id,clan_id) VALUES(5,1),(5,2)').run();
 await p('INSERT INTO clan_participation_progress VALUES(64,1,30),(64,3,29)').run();
 for(let i=0;i<30;i++)await p("INSERT INTO clan_war_battles VALUES(64,4,2,5,'COMPLETED')").run();
 await p("INSERT INTO clan_war_battles VALUES(64,3,2,1,'FAILED')").run();
 return {env,DB,p,policy,setting,fail:s=>{fail=s;},balance:async id=>Number((await p('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=?',id).first())?.balance||0)};
}
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: each completed regular match pays independent 30/30, excludes defense/errors/late joins`,async t=>{
  const f=await fixture(t,postgres),result=await settleClanWarPigCoins(f.env,64);
  assert.equal(result.totalAmount,120);assert.equal(result.recipients,3);
  assert.deepEqual(await Promise.all([1,2,3,4,5,6].map(f.balance)),[60,30,0,30,0,0]);
  assert.equal(Number((await f.p('SELECT SUM(coin) n FROM users').first()).n),1800);
  assert.equal((await f.p('SELECT * FROM pig_coin_ledger_v1').all()).results.length,3);
  assert.deepEqual(await clanPigCoinStatements(f.env,{userId:1,seasonId:5}),[]);
 });
 test(`${label}: duplicate/concurrent retries and lost response cannot pay again; next match earns separately`,async t=>{
  const f=await fixture(t,postgres);
  const results=await Promise.all([settleClanWarPigCoins(f.env,64),settleClanWarPigCoins(f.env,64)]);
  assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal(await f.balance(1),60);
  await f.p('DELETE FROM clan_members WHERE user_id=1').run();f.policy.sources[1].victoryAmount=999;await f.setting('loot_shop_policy_v1',f.policy);
  assert.equal((await settleClanWarPigCoins(f.env,64)).totalAmount,120);assert.equal(await f.balance(1),60);
  f.policy.sources[1].victoryAmount=30;await f.setting('loot_shop_policy_v1',f.policy);
  await f.p("INSERT INTO clan_wars(id,season_id,round_no,clan_a_id,clan_b_id,winner_clan_id,status,ends_at) VALUES(65,5,2,1,2,2,'COMPLETED','2026-09-19T13:00:00Z')").run();
  const batch=f.DB.batch.bind(f.DB);let lost=true;f.DB.batch=async s=>{const r=await batch(s);if(lost){lost=false;throw Error('LOST_ACK');}return r;};
  await assert.rejects(()=>settleClanWarPigCoins(f.env,65),/LOST_ACK/);
  assert.equal((await settleClanWarPigCoins(f.env,65)).replayed,true);assert.equal(await f.balance(4),60);
 });
 test(`${label}: ledger/wallet failure and overflow roll back every recipient and receipt`,async t=>{
  const f=await fixture(t,postgres);
  for(const point of ['INSERT INTO pig_coin_ledger_v1','UPDATE pig_coin_wallets_v1']){
   f.fail(point);await assert.rejects(()=>settleClanWarPigCoins(f.env,64),/INJECTED/);f.fail('');
   assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',clanWarPigReceiptKey(64)).first(),null);
   assert.equal((await f.p('SELECT * FROM pig_coin_wallets_v1').all()).results.length,0);
   assert.equal((await f.p('SELECT * FROM pig_coin_ledger_v1').all()).results.length,0);
  }
  await f.p('INSERT INTO pig_coin_wallets_v1 VALUES(2,1000000000000)').run();await assert.rejects(()=>settleClanWarPigCoins(f.env,64));assert.equal(await f.balance(1),0);
  await f.p('UPDATE pig_coin_wallets_v1 SET balance=0 WHERE user_id=2').run();assert.equal((await settleClanWarPigCoins(f.env,64)).totalAmount,120);
 });
 test(`${label}: OFF, unreleased, active, pending battles and championships do not pay`,async t=>{
  const f=await fixture(t,postgres);
  await f.setting(CLAN_PIG_ROUND_RELEASE_KEY,{firstSeasonId:5,firstWarId:65});assert.equal((await settleClanWarPigCoins(f.env,64)).status,'INELIGIBLE');
  await f.setting(CLAN_PIG_ROUND_RELEASE_KEY,{firstSeasonId:5,firstWarId:64});
  f.policy.sources[1].enabled=false;await f.setting('loot_shop_policy_v1',f.policy);assert.equal((await settleClanWarPigCoins(f.env,64)).status,'INELIGIBLE');
  f.policy.sources[1].enabled=true;await f.setting('loot_shop_policy_v1',f.policy);
  for(const status of ['ACTIVE','CLOSING','CANCELLED']){await f.p('UPDATE clan_wars SET status=?',status).run();assert.equal((await settleClanWarPigCoins(f.env,64)).status,'INELIGIBLE');}
  await f.p("UPDATE clan_wars SET status='COMPLETED',round_no=1000").run();assert.equal((await settleClanWarPigCoins(f.env,64)).status,'INELIGIBLE');
  await f.p('UPDATE clan_wars SET round_no=1').run();await f.p("INSERT INTO clan_war_battles VALUES(64,3,2,1,'PENDING')").run();assert.equal((await settleClanWarPigCoins(f.env,64)).status,'INELIGIBLE');
  await f.p("UPDATE clan_war_battles SET status='FAILED' WHERE status='PENDING'").run();await settlePendingClanWarPigCoins(f.env,5,{mode:'TEST'});assert.equal(await f.balance(1),0);
  await settlePendingClanWarPigCoins(f.env,5,{mode:'ON'});assert.equal(await f.balance(1),60);
 });
 test(`${label}: actual match finalization pays once; failed payout is recovered after match completion`,async t=>{
  const f=await fixture(t,postgres),source=readFileSync(new URL('../functions/_clan.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('function warWinnerClanId('),source.indexOf('async function reconcileWarWindows('));
  const ctx=vm.createContext({settleClanWarPigCoins});vm.runInContext(code+';this.finalize=finalizeWar;',ctx);
  await f.p("UPDATE clan_wars SET status='ACTIVE',winner_clan_id=NULL").run();
  const war=await f.p('SELECT * FROM clan_wars WHERE id=64').first();f.fail('INSERT INTO pig_coin_ledger_v1');
  await assert.rejects(()=>ctx.finalize(f.env,war,{mode:'ON',seasonWinScore:3,seasonLossScore:0}),/INJECTED/);f.fail('');
  assert.equal((await f.p('SELECT status FROM clan_wars WHERE id=64').first()).status,'COMPLETED');assert.equal(await f.balance(1),0);
  await settlePendingClanWarPigCoins(f.env,5,{mode:'ON'});await settlePendingClanWarPigCoins(f.env,5,{mode:'ON'});assert.equal(await f.balance(1),60);
  assert.equal(Number((await f.p('SELECT wins FROM clan_season_teams WHERE clan_id=1').first()).wins),1);
 });
}
