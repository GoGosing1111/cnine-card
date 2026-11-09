import test from 'node:test';
import assert from 'node:assert/strict';
import {territoryNetworkFixture} from './helpers/territory-network-fixture.mjs';
import {__territoryClanTest as T} from '../functions/_territory_war.js';
import {firstDraftPrize,draftSettlement,limitedShard} from '../functions/_territory_draft.js';
const now=()=>new Date().toISOString();
for(const pg of [false,true])test((pg?'PostgreSQL':'SQLite')+' opening-round prize uses the scheduled slot, counts 0, 49 and 50 attacks, and claims the actual limited item once',async t=>{
  const f=await territoryNetworkFixture(t,pg,{participants:5});
  const equip='CREATE TABLE character_equipment_items(id INTEGER PRIMARY KEY,code TEXT,name TEXT,rarity TEXT,slot TEXT,image_url TEXT)';
  if(pg){await f.pg.exec(equip);await f.pg.exec('ALTER TABLE territory_war_v3_rewards ALTER COLUMN base_result_coin TYPE BIGINT,ALTER COLUMN attack_adjusted_coin TYPE BIGINT');}else f.sqlite.exec(equip);
  const when=new Date(Math.ceil(Date.now()/60000)*60000+14*60000).toISOString();
  const settings={...f.cfg,autoOpen:{kind:'ONCE',battleAt:when}};
  await f.p("UPDATE app_meta SET value=? WHERE key='territory_war_settings_v3'",JSON.stringify(settings)).run();
  await f.p("UPDATE territory_war_v3_rounds SET status='DISABLED' WHERE id=1").run();
  const slot={key:'territory_auto_open_v1:'+when,battleAt:when,formationAt:new Date(Date.parse(when)-5*60000).toISOString()};
  await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)','territory_slot_prize_v1:'+when,firstDraftPrize).run();
  const id=await T.createRound(f.env,settings,slot);
  assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?','territory_round_prize_v1:'+id).first()).value,firstDraftPrize);
  await f.p("UPDATE territory_war_v3_rounds SET status='FINISHED',winner_side='A',settled_at=? WHERE id=?",now(),id).run();
  for(const [user,side,count] of [[1,'A',0],[2,'A',50],[3,'B',49],[4,'B',50],[5,'A',49]])
    await f.p("INSERT INTO territory_war_v3_users(round_id,user_id,side,status,attacks) VALUES(?,?,?,'ACTIVE',?)",id,user,side,count).run();
  const round={id,winner_side:'A',draft_prize:firstDraftPrize};
  await T.generateRewards(f.env,round,settings);
  for(const [user,coin,shards] of [[1,150e12,10],[2,200e12,15],[3,0,0],[4,50e12,5],[5,150e12,10]]){
    const row=await T.rewardForUser(f.env,user,id);
    assert.equal(Number(row.coin),coin);assert.equal(row.limitedShards,shards);assert.equal(Number(row.shards),0);
  }
  assert.deepEqual(draftSettlement(false,49),{coin:0,limitedShards:0});
  assert.deepEqual(draftSettlement(false,50),{coin:50e12,limitedShards:5});
  const schema=['ALTER TABLE users ADD COLUMN card_shards INTEGER DEFAULT 0',
    'CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code))',
    'CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT)',
    'CREATE TABLE shard_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT,card_id TEXT)'];
  if(pg)await f.env.DB.execSchema(schema);else for(const sql of schema)await f.p(sql).run();
  await f.p("UPDATE users SET coin=CAST('100000000000000001' AS BIGINT) WHERE id=2").run();
  const deps={json:(data,status=200)=>({data,status})};
  const forceFailure=pg?'ALTER TABLE inventory_logs ADD CONSTRAINT reject_draft CHECK(change_amount<0)':'CREATE TRIGGER reject_draft BEFORE INSERT ON inventory_logs BEGIN SELECT RAISE(ABORT,\'test failure\'); END';
  if(pg)await f.pg.exec(forceFailure);else f.sqlite.exec(forceFailure);
  await assert.rejects(()=>T.claimV3(f.env,deps,{id:2},4,id));
  assert.equal((await f.p("SELECT CAST(coin AS TEXT) value FROM users WHERE id=2").first()).value,'100000000000000001');
  assert.equal((await f.p('SELECT claimed_at FROM territory_war_v3_rewards WHERE round_id=? AND user_id=2',id).first()).claimed_at,null);
  if(pg)await f.pg.exec('ALTER TABLE inventory_logs DROP CONSTRAINT reject_draft');else f.sqlite.exec('DROP TRIGGER reject_draft');
  // A fresh scheduled slot is in the future; keep the response on the finished round.
  const result=await T.claimV3(f.env,deps,{id:2},4,id);
  assert.equal(result.status,200);assert.equal(result.data.limitedShards,15);assert.equal(result.data.coinAfterExact,'100200000000000001');
  assert.equal((await f.p("SELECT CAST(coin AS TEXT) value FROM users WHERE id=2").first()).value,'100200000000000001');
  assert.equal(Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',limitedShard).first()).quantity),15);
  assert.equal((await T.claimV3(f.env,deps,{id:2},4,id)).status,404);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM inventory_logs').first()).n),1);
});

