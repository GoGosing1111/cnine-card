import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {__clanTest} from '../functions/_clan.js';
import {JOINT_ATOMIC_SCHEMA} from '../functions/_joint_atomic.js';
import {clanWarParticipationSettings,prepareClanParticipationSettings} from '../functions/_clan_participation.js';
import {clanWarItemReceiptKey,settleClanWarItems,settlePendingClanWarItems} from '../functions/_clan_war_item_rewards.js';
import {CLAN_WAR_ITEM_REWARD_DEFAULTS,validateClanWarItemRewards} from '../shared/clan-war-item-rewards-v1.mjs';
import {LOOT_SHOP_DEFAULTS} from '../shared/loot-shop-policy-v1.mjs';

const start='2026-09-29T12:00:00.000Z',end='2026-09-29T13:00:00.000Z';
const coinStart='2026-10-06T12:00:00.000Z',coinEnd='2026-10-06T14:00:00.000Z';
async function fixture(t,postgres){
 const schema=[
  'CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT DEFAULT 300)',
  'CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,created_at TEXT)',
  'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
  'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,is_active BIGINT)',
  'CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT NOT NULL,unseen_quantity BIGINT NOT NULL,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code))',
  'CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT)',
  'CREATE TABLE clan_members(season_id BIGINT,user_id BIGINT,clan_id BIGINT,joined_at TEXT,PRIMARY KEY(season_id,user_id))',
  'CREATE TABLE clan_wars(id BIGINT PRIMARY KEY,season_id BIGINT,round_no BIGINT,clan_a_id BIGINT,clan_b_id BIGINT,winner_clan_id BIGINT,status TEXT,starts_at TEXT,ends_at TEXT,updated_at TEXT,score_a BIGINT DEFAULT 100,score_b BIGINT DEFAULT 50)',
  'CREATE TABLE clan_war_battles(war_id BIGINT,attacker_user_id BIGINT,attacker_clan_id BIGINT,defender_user_id BIGINT,status TEXT)',
  'CREATE TABLE clan_participation_progress(war_id BIGINT,user_id BIGINT,completed_attacks BIGINT,PRIMARY KEY(war_id,user_id))',
  'CREATE TABLE clan_participation_round_rules(season_id BIGINT,round_no BIGINT,rules_json TEXT,PRIMARY KEY(season_id,round_no))',
  'CREATE TABLE clan_season_teams(season_id BIGINT,clan_id BIGINT,score BIGINT DEFAULT 0,wins BIGINT DEFAULT 0,losses BIGINT DEFAULT 0,updated_at TEXT,PRIMARY KEY(season_id,clan_id))',
  'CREATE TABLE clan_reward_receipts(season_id BIGINT,status TEXT)',
  'CREATE TABLE clan_participation_receipts(season_id BIGINT,status TEXT,base_coin BIGINT,win_bonus_coin BIGINT,milestone_coin BIGINT)',
  ...JOINT_ATOMIC_SCHEMA
 ];
 let DB,fail='',skip='';
 if(postgres){
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");
  await pg.exec(schema.join(';'));
  DB=new __postgresCompatTest.PostgresD1Database({async query(input){
   const sql=typeof input==='string'?input:input.text;if(fail&&sql.includes(fail))throw Error('INJECTED');
   if(skip&&sql.includes(skip))return {rows:[],rowCount:0};
   const r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};
  }});
 }else{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(schema.join(';'));
  const execute=s=>{if(fail&&s.sql.includes(fail))throw Error('INJECTED');if(skip&&s.sql.includes(skip))return {meta:{changes:0}};const r=db.prepare(s.sql).run(...s.values);return {meta:{changes:Number(r.changes)}};};
  const prepare=(sql,values=[])=>({sql,values,bind(...v){return prepare(sql,v);},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return execute(this);}});
  DB={prepare,async batch(list){db.exec('BEGIN');try{const r=list.map(execute);db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 }
 const env={DB},p=(sql,...v)=>DB.prepare(sql).bind(...v),settings={...__clanTest.CLAN_ADMIN_SETTINGS_DEFAULTS,mode:'ON'};
 const setting=(key,value)=>p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value)).run();
 await setting('clan_settings_v1',settings);
 await p("INSERT INTO inventory_items VALUES('STARLIGHT_ARMOR_CORE',1),('MASTER_STAR',1)").run();
 for(let id=1;id<=6;id++){
  await p('INSERT INTO users(id) VALUES(?)',id).run();
  await p('INSERT INTO clan_members VALUES(5,?,?,?)',id,[1,2,6].includes(id)?1:2,id===6?'2026-09-29T13:00:01.000Z':'2026-09-28 10:00:00').run();
 }
 await p("INSERT INTO clan_wars(id,season_id,round_no,clan_a_id,clan_b_id,winner_clan_id,status,starts_at,ends_at) VALUES(64,5,1,1,2,1,'COMPLETED',?,?)",start,end).run();
 await p('INSERT INTO clan_season_teams(season_id,clan_id) VALUES(5,1),(5,2)').run();
 await p('INSERT INTO clan_participation_progress VALUES(64,1,30),(64,3,29),(64,4,1)').run();
 for(let i=0;i<30;i++)await p("INSERT INTO clan_war_battles VALUES(64,4,2,5,'COMPLETED')").run();
 await p("INSERT INTO clan_war_battles VALUES(64,3,2,1,'FAILED')").run();
 return {env,DB,p,settings,setting,fail:s=>{fail=s;},skip:s=>{skip=s;},quantity:async(id,code)=>Number((await p('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',id,code).first())?.quantity||0)};
}

test('CMS defaults, partial save and invalid item quantities',()=>{
 const clean=__clanTest.cleanClanAdminSettings({});
 for(const [key,value] of Object.entries(CLAN_WAR_ITEM_REWARD_DEFAULTS))assert.equal(clean[key],value);
 const saved=__clanTest.cleanClanAdminSettings({roundParticipationMysticEnergy:750,roundVictoryMasterStars:2000000},clean);
 const partial=__clanTest.cleanClanAdminSettings({mode:'OFF'},saved);
 assert.equal(partial.roundParticipationMysticEnergy,750);assert.equal(partial.roundVictoryMasterStars,2000000);
 for(const key of Object.keys(CLAN_WAR_ITEM_REWARD_DEFAULTS)){
  const max=key.endsWith('Coin')?1000000000000:1000000000;
  for(const value of [-1,1.5,max+1,'bad','',null,true])assert.throws(()=>validateClanWarItemRewards({[key]:value}));
  for(const value of [0,500,1500000,1000000000])assert.doesNotThrow(()=>validateClanWarItemRewards({[key]:value}));
  assert.doesNotThrow(()=>validateClanWarItemRewards({[key]:max}));
 }
});

async function coinFixture(t,postgres){
 const f=await fixture(t,postgres);
 await f.p('UPDATE clan_wars SET starts_at=?,ends_at=?',coinStart,coinEnd).run();
 await f.p('UPDATE clan_members SET joined_at=? WHERE user_id=6','2026-10-06T14:00:01.000Z').run();
 f.settings.roundParticipationMysticEnergy=1000;
 await f.setting('clan_settings_v1',f.settings);
 f.coins=async()=>Promise.all([1,2,3,4,5,6].map(async id=>Number((await f.p('SELECT coin FROM users WHERE id=?',id).first()).coin)));
 return f;
}
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(label+': round coin rewards pay 1000억 victory plus 500억 participation independently with existing items',async t=>{
  const f=await coinFixture(t,postgres),r=await settleClanWarItems(f.env,64,f.settings);
  assert.deepEqual(await f.coins(),[150000000300,100000000300,300,50000000300,300,300]);
  assert.deepEqual(r.coinGrants.map(g=>[g.userId,g.victory,g.participation]),[[1,100000000000,50000000000],[2,100000000000,0],[4,0,50000000000]]);
  assert.equal(await f.quantity(1,'MASTER_STAR'),1500000);assert.equal(await f.quantity(1,'STARLIGHT_ARMOR_CORE'),1000);
  assert.equal(await f.quantity(4,'STARLIGHT_ARMOR_CORE'),1000);
  const logs=(await f.p('SELECT l.* FROM coin_logs l JOIN users u ON u.id=l.user_id WHERE l.balance_after=u.coin').all()).results;
  assert.equal(logs.length,3);assert.equal(logs.reduce((sum,r)=>sum+Number(r.change_amount),0),300000000000);
 });
 test(label+': round coins, items and receipt roll back together on wallet, log or item failures and zero-row writes',async t=>{
  const f=await coinFixture(t,postgres);
  for(const kind of ['fail','skip'])for(const point of ['INSERT INTO coin_logs','UPDATE users SET coin=coin+','INSERT INTO inventory_logs']){
   f[kind](point);await assert.rejects(()=>settleClanWarItems(f.env,64,f.settings));f[kind]('');
   assert.deepEqual(await f.coins(),[300,300,300,300,300,300]);
   assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),0);
   assert.equal(Number((await f.p('SELECT COUNT(*) n FROM cnine_user_inventory').first()).n),0);
   assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',clanWarItemReceiptKey(64)).first(),null);
  }
  await settleClanWarItems(f.env,64,f.settings);assert.equal((await f.coins())[0],150000000300);
 });
 test(label+': concurrent completion, response loss and repeated recovery cannot duplicate round coins',async t=>{
  const f=await coinFixture(t,postgres);
  const r=await Promise.all([settleClanWarItems(f.env,64,f.settings),settleClanWarItems(f.env,64,f.settings)]);
  assert.equal(r.filter(x=>!x.replayed).length,1);
  await settlePendingClanWarItems(f.env,5,f.settings);await settleClanWarItems(f.env,64,f.settings);
  assert.equal((await f.coins())[0],150000000300);
  await f.p("INSERT INTO clan_wars(id,season_id,round_no,clan_a_id,clan_b_id,winner_clan_id,status,starts_at,ends_at) VALUES(65,5,2,1,2,2,'COMPLETED',?,?)",coinStart,coinEnd).run();
  const batch=f.DB.batch.bind(f.DB);let lost=true;
  f.DB.batch=async statements=>{const result=await batch(statements);if(lost){lost=false;throw Error('LOST_ACK');}return result;};
  assert.equal((await settleClanWarItems(f.env,65,f.settings)).replayed,true);
  await settleClanWarItems(f.env,65,f.settings);
  assert.deepEqual(await f.coins(),[150000000300,100000000300,100000000300,150000000300,100000000300,300]);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),6);
 });
 test(label+': frozen coin rules survive CMS edits; next round uses the edited amount and zero disables it',async t=>{
  const f=await coinFixture(t,postgres),changed={...f.settings,roundVictoryCoin:200000000000,roundParticipationCoin:0};
  await f.p("UPDATE clan_wars SET status='ACTIVE'").run();
  await prepareClanParticipationSettings(f.env,f.settings,changed,Date.parse(coinStart)+1000);
  await f.setting('clan_settings_v1',changed);await f.p("UPDATE clan_wars SET status='COMPLETED'").run();
  await settleClanWarItems(f.env,64,changed);assert.equal((await f.coins())[0],150000000300);
  await f.p("INSERT INTO clan_wars(id,season_id,round_no,clan_a_id,clan_b_id,winner_clan_id,status,starts_at,ends_at) VALUES(65,5,2,1,2,2,'COMPLETED',?,?)",coinStart,coinEnd).run();
  await f.p('INSERT INTO clan_participation_progress VALUES(65,1,30)').run();
  await settleClanWarItems(f.env,65,changed);
  assert.deepEqual(await f.coins(),[150000000300,100000000300,200000000300,250000000300,200000000300,300]);
 });
 test(label+': legacy snapshots, earlier rounds and existing receipts never gain retroactive coin grants',async t=>{
  const f=await coinFixture(t,postgres);
  await f.p("INSERT INTO clan_participation_round_rules VALUES(5,1,?)",JSON.stringify({roundParticipationMysticEnergy:1000,roundVictoryMasterStars:1500000})).run();
  const r=await settleClanWarItems(f.env,64,f.settings);assert.deepEqual(r.coinGrants,[]);
  assert.equal(await f.quantity(1,'MASTER_STAR'),1500000);
  await f.p('DELETE FROM clan_participation_round_rules').run();
  assert.equal((await settleClanWarItems(f.env,64,f.settings)).replayed,true);
  await f.p("INSERT INTO clan_wars(id,season_id,round_no,clan_a_id,clan_b_id,winner_clan_id,status,starts_at,ends_at) VALUES(65,5,2,1,2,2,'COMPLETED',?,?)",start,end).run();
  assert.deepEqual((await settleClanWarItems(f.env,65,f.settings)).coinGrants,[]);
  assert.deepEqual(await f.coins(),[300,300,300,300,300,300]);
 });
 test(label+': coin-only rewards remain payable with item quantities zero and reject unsafe balances atomically',async t=>{
  const f=await coinFixture(t,postgres),settings={...f.settings,roundParticipationMysticEnergy:0,roundVictoryMasterStars:0};
  await f.setting('clan_settings_v1',settings);
  await f.p('UPDATE users SET coin=? WHERE id=2',Number.MAX_SAFE_INTEGER-100000000000+1).run();
  await assert.rejects(()=>settleClanWarItems(f.env,64,settings));assert.equal((await f.coins())[0],300);
  await f.p('UPDATE users SET coin=? WHERE id=2',Number.MAX_SAFE_INTEGER-100000000000).run();
  const r=await settleClanWarItems(f.env,64,settings);
  assert.equal(r.grants.length,0);assert.equal(r.coinGrants.length,3);
  assert.equal((await f.coins())[1],Number.MAX_SAFE_INTEGER);
 });
}
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(label+': completed attacks and winners receive cumulative inventory rewards once',async t=>{
  const f=await fixture(t,postgres);
  await f.p("INSERT INTO cnine_user_inventory VALUES(1,'MASTER_STAR',10,2,'','')").run();
  const r=await settleClanWarItems(f.env,64,f.settings);
  assert.equal(r.grants.length,4);
  assert.deepEqual(await Promise.all([1,2,3,4,5,6].map(id=>f.quantity(id,'STARLIGHT_ARMOR_CORE'))),[500,0,0,500,0,0]);
  assert.deepEqual(await Promise.all([1,2,3,4,5,6].map(id=>f.quantity(id,'MASTER_STAR'))),[1500010,1500000,0,0,0,0]);
  assert.equal(Number((await f.p("SELECT unseen_quantity n FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'").first()).n),1500002);
  assert.equal(Number((await f.p('SELECT SUM(coin) n FROM users').first()).n),1800);
  assert.equal((await f.p('SELECT * FROM inventory_logs WHERE balance_after<change_amount').all()).results.length,0);
  assert.equal((await f.p('SELECT * FROM joint_atomic_guards_v1').all()).results.length,0);
 });
 test(label+': simultaneous retry, lost acknowledgement and next round remain exactly once',async t=>{
  const f=await fixture(t,postgres),r=await Promise.all([settleClanWarItems(f.env,64,f.settings),settleClanWarItems(f.env,64,f.settings)]);
  assert.equal(r.filter(x=>!x.replayed).length,1);assert.equal(await f.quantity(1,'MASTER_STAR'),1500000);
  await f.p("INSERT INTO clan_wars(id,season_id,round_no,clan_a_id,clan_b_id,winner_clan_id,status,starts_at,ends_at) VALUES(65,5,2,1,2,2,'COMPLETED',?,?)",start,end).run();
  const batch=f.DB.batch.bind(f.DB);let lost=true;f.DB.batch=async s=>{const value=await batch(s);if(lost){lost=false;throw Error('LOST_ACK');}return value;};
  assert.equal((await settleClanWarItems(f.env,65,f.settings)).replayed,true);
  await settleClanWarItems(f.env,65,f.settings);assert.equal(await f.quantity(4,'MASTER_STAR'),1500000);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM inventory_logs').first()).n),7);
 });
 test(label+': inventory/log failure, missing catalog and overflow roll back all grants and receipt',async t=>{
  const f=await fixture(t,postgres);
  for(const point of ['INSERT INTO cnine_user_inventory','INSERT INTO inventory_logs']){
   f.fail(point);await assert.rejects(()=>settleClanWarItems(f.env,64,f.settings),/INJECTED/);f.fail('');
   assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',clanWarItemReceiptKey(64)).first(),null);
   assert.equal(Number((await f.p('SELECT COUNT(*) n FROM cnine_user_inventory').first()).n),0);
   assert.equal(Number((await f.p('SELECT COUNT(*) n FROM inventory_logs').first()).n),0);
  }
  await f.p("UPDATE inventory_items SET is_active=0 WHERE code='MASTER_STAR'").run();
  await assert.rejects(()=>settleClanWarItems(f.env,64,f.settings));assert.equal(await f.quantity(1,'STARLIGHT_ARMOR_CORE'),0);
  await f.p('UPDATE inventory_items SET is_active=1').run();
  await f.p("INSERT INTO cnine_user_inventory VALUES(2,'MASTER_STAR',?,0,'','')",Number.MAX_SAFE_INTEGER).run();
  await assert.rejects(()=>settleClanWarItems(f.env,64,f.settings));assert.equal(await f.quantity(1,'STARLIGHT_ARMOR_CORE'),0);
  await f.p('DELETE FROM cnine_user_inventory').run();
  assert.equal((await settleClanWarItems(f.env,64,f.settings)).grants.length,4);
 });
 test(label+': test/off, earlier matches, active or unresolved matches and postseason do not pay',async t=>{
  const f=await fixture(t,postgres);
  for(const mode of ['TEST','OFF'])assert.equal((await settleClanWarItems(f.env,64,{...f.settings,mode})).status,'INELIGIBLE');
  await f.setting('clan_settings_v1',{...f.settings,mode:'OFF'});assert.equal((await settleClanWarItems(f.env,64,f.settings)).status,'INELIGIBLE');
  await f.setting('clan_settings_v1',f.settings);
  await f.p("UPDATE clan_wars SET starts_at='2026-09-28T12:00:00.000Z'").run();
  assert.equal((await settleClanWarItems(f.env,64,f.settings)).status,'INELIGIBLE');
  await f.p('UPDATE clan_wars SET starts_at=?,round_no=1000',start).run();assert.equal((await settleClanWarItems(f.env,64,f.settings)).status,'INELIGIBLE');
  await f.p("UPDATE clan_wars SET round_no=1,status='ACTIVE'").run();assert.equal((await settleClanWarItems(f.env,64,f.settings)).status,'INELIGIBLE');
  await f.p("UPDATE clan_wars SET status='COMPLETED'").run();await f.p("INSERT INTO clan_war_battles VALUES(64,3,2,1,'PENDING')").run();
  assert.equal((await settleClanWarItems(f.env,64,f.settings)).status,'INELIGIBLE');
  await f.p("UPDATE clan_war_battles SET status='FAILED' WHERE status='PENDING'").run();
  await settlePendingClanWarItems(f.env,5,f.settings);assert.equal(await f.quantity(1,'MASTER_STAR'),1500000);
 });
 test(label+': frozen round quantities survive CMS edits; next round and zero settings take effect',async t=>{
  const f=await fixture(t,postgres),now=Date.parse(start)+1000;
  await f.p("UPDATE clan_wars SET status='ACTIVE'").run();
  const changed={...f.settings,roundParticipationMysticEnergy:750,roundVictoryMasterStars:0};
  await prepareClanParticipationSettings(f.env,f.settings,changed,now);await f.setting('clan_settings_v1',changed);
  await f.p("UPDATE clan_wars SET status='COMPLETED'").run();
  await settleClanWarItems(f.env,64,changed);assert.equal(await f.quantity(1,'STARLIGHT_ARMOR_CORE'),500);assert.equal(await f.quantity(1,'MASTER_STAR'),1500000);
  await f.p("INSERT INTO clan_wars(id,season_id,round_no,clan_a_id,clan_b_id,winner_clan_id,status,starts_at,ends_at) VALUES(65,5,2,1,2,2,'COMPLETED',?,?)",start,end).run();
  await f.p('INSERT INTO clan_participation_progress VALUES(65,1,30)').run();
  const r=await settleClanWarItems(f.env,65,changed);assert.equal(r.grants.length,1);assert.equal(await f.quantity(1,'STARLIGHT_ARMOR_CORE'),1250);
  const war=await f.p('SELECT * FROM clan_wars WHERE id=65').first();
  await f.p("INSERT INTO clan_participation_round_rules VALUES(5,2,'{}')").run();
  const legacy=await clanWarParticipationSettings(f.env,war,changed);assert.equal(legacy.roundParticipationMysticEnergy,0);assert.equal(legacy.roundVictoryMasterStars,0);
 });
 test(label+': configurable completed-attack threshold works independently of pig-coin toggles',async t=>{
  const f=await fixture(t,postgres),policy=structuredClone(LOOT_SHOP_DEFAULTS);
  policy.sources.find(s=>s.code==='CLAN').minAttacks=29;await f.setting('loot_shop_policy_v1',policy);
  await settleClanWarItems(f.env,64,f.settings);assert.equal(await f.quantity(3,'STARLIGHT_ARMOR_CORE'),500);
  assert.equal(await f.quantity(5,'STARLIGHT_ARMOR_CORE'),0);
 });
 test(label+': actual finalization retries a rolled-back payout without duplicating season scores',async t=>{
  const f=await fixture(t,postgres),source=readFileSync(new URL('../functions/_clan.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('function warWinnerClanId('),source.indexOf('async function reconcileWarWindows('));
  const ctx=vm.createContext({settleClanWarPigCoins:async()=>{},settleClanWarItems});vm.runInContext(code+';this.finalize=finalizeWar;',ctx);
  await f.p("UPDATE clan_wars SET status='ACTIVE',winner_clan_id=NULL").run();const war=await f.p('SELECT * FROM clan_wars WHERE id=64').first();
  f.fail('INSERT INTO inventory_logs');await assert.rejects(()=>ctx.finalize(f.env,war,f.settings),/INJECTED/);f.fail('');
  assert.equal((await f.p('SELECT status FROM clan_wars WHERE id=64').first()).status,'COMPLETED');assert.equal(await f.quantity(1,'MASTER_STAR'),0);
  await settlePendingClanWarItems(f.env,5,f.settings);await settlePendingClanWarItems(f.env,5,f.settings);
  assert.equal(await f.quantity(1,'MASTER_STAR'),1500000);
  assert.equal(Number((await f.p('SELECT wins FROM clan_season_teams WHERE clan_id=1').first()).wins),1);
 });
 test(label+': actual reset guards preserve item-settled season history',async t=>{
  const f=await fixture(t,postgres),source=readFileSync(new URL('../functions/_clan.js',import.meta.url),'utf8');
  const queries=[...source.matchAll(/env\.DB\.prepare\("(SELECT \(SELECT COUNT\(\*\) FROM clan_reward_receipts[^"]+)"\)/g)].map(m=>m[1]);
  assert.equal(queries.length,2);
  for(const sql of queries)assert.equal(Number((await f.p(sql,...(sql.includes('season_id=?')?[5,5,5]:[])).first()).count),0);
  await settleClanWarItems(f.env,64,f.settings);
  for(const sql of queries)assert.equal(Number((await f.p(sql,...(sql.includes('season_id=?')?[5,5,5]:[])).first()).count),1);
 });
}
