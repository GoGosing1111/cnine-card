import test from 'node:test';
import assert from 'node:assert/strict';
import {lootFixture} from './helpers/loot-shop-db.mjs';
import {LOOT_SHOP_DEFAULTS,validateLootShopPolicy,upgradeLootShopPolicy,pigCoinRewardWeek} from '../shared/loot-shop-policy-v1.mjs';
import {pigCoinRewardStatements,pigCoinBalance} from '../functions/_loot_shop.js';
import {territoryPigCoinStatements,clanPigCoinStatements,territoryPigCoinPreview} from '../functions/_pig_coin_content_rewards.js';
import {applyApprovedPigCoinRewards,policyHash,PIG_REWARD_OPERATION} from '../scripts/ops/pig-coin-rewards-20260915.mjs';

async function contentFixture(t,postgres){
 const f=await lootFixture(t,{postgres});
 const ddl=[
  'CREATE TABLE territory_war_v3_rounds(id BIGINT PRIMARY KEY,winner_side TEXT,settled_at TEXT)',
  'CREATE TABLE territory_war_v3_rewards(round_id BIGINT,user_id BIGINT,side TEXT,result TEXT,attacks INTEGER,required_attacks INTEGER,claimed_at TEXT,PRIMARY KEY(round_id,user_id))',
  'CREATE TABLE clan_reward_receipts(season_id BIGINT,user_id BIGINT,clan_id BIGINT,reward_tier TEXT,status TEXT,PRIMARY KEY(season_id,user_id))',
  'CREATE TABLE clan_wars(id BIGINT PRIMARY KEY,season_id BIGINT,round_no INTEGER,clan_a_id BIGINT,clan_b_id BIGINT)',
  'CREATE TABLE clan_war_battles(war_id BIGINT,attacker_user_id BIGINT,attacker_clan_id BIGINT,defender_user_id BIGINT,status TEXT)',
  'CREATE TABLE clan_participation_progress(season_id BIGINT,war_id BIGINT,user_id BIGINT,completed_attacks INTEGER,PRIMARY KEY(war_id,user_id))'
 ];
 if(f.DB.execSchema)await f.DB.execSchema(ddl);else for(const sql of ddl)await f.p(sql).run();return f;
}

test('approved separate rewards are explicit, additive and legacy flat policies require a CMS save',()=>{
 const p=structuredClone(LOOT_SHOP_DEFAULTS);assert.deepEqual(p.sources[0],{code:'TERRITORY',enabled:false,victoryAmount:100,participationAmount:50});
 const old={...p,rewardsEnabled:true,sources:p.sources.map(s=>({code:s.code,enabled:true,amount:10}))},converted=upgradeLootShopPolicy(old);
 assert.equal(converted.rewardsEnabled,false);assert.deepEqual(converted.products,p.products);assert.deepEqual(converted.sources,p.sources);
 for(const bad of [0,-1,30.5,'30',10001]){const draft=structuredClone(p);draft.sources[1].minAttacks=bad;assert.throws(()=>validateLootShopPolicy(draft));}
 p.sources[2].weeklyLimit=29;assert.throws(()=>validateLootShopPolicy(p));
 assert.equal(pigCoinRewardWeek(Date.parse('2026-09-13T14:59:59.999Z')).weekKey,'2026-09-07');
 assert.equal(pigCoinRewardWeek(Date.parse('2026-09-13T15:00:00Z')).weekKey,'2026-09-14');
});

test('operator publication is atomic, preserves shop products, rejects stale inspection and never resets later CMS edits',async t=>{
 const f=await lootFixture(t,{postgres:true}),client={query:(s,v)=>f.pg.query(s,v)};
 await f.pg.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
 const raw=(await f.p("SELECT value FROM app_meta WHERE key='loot_shop_policy_v1'").first()).value,expectedHash=await policyHash(raw);
 await assert.rejects(()=>applyApprovedPigCoinRewards(client,{expectedHash:'stale'}));
 assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',PIG_REWARD_OPERATION).first(),null);
 const dry=await applyApprovedPigCoinRewards(client,{expectedHash,dryRun:true});assert.equal(dry.dryRun,true);assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',PIG_REWARD_OPERATION).first(),null);
 const result=await applyApprovedPigCoinRewards(client,{expectedHash});assert.equal(result.receipt.policy.rewardsEnabled,true);assert.deepEqual(result.receipt.policy.products,f.shopPolicy.products);assert.equal(result.receipt.policy.salesEnabled,true);assert.equal(await pigCoinBalance(f.env,7),500);
 f.shopPolicy.rewardsEnabled=false;await f.setShop(f.shopPolicy);assert.equal((await applyApprovedPigCoinRewards(client,{expectedHash})).replayed,true);assert.equal(JSON.parse((await f.p("SELECT value FROM app_meta WHERE key='loot_shop_policy_v1'").first()).value).rewardsEnabled,false);
});

test('operator first publication prepares an absent policy with sales OFF and no account grants',async t=>{
 const f=await lootFixture(t,{postgres:true}),client={query:(s,v)=>f.pg.query(s,v)};
 await f.pg.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; DELETE FROM app_meta WHERE key='loot_shop_policy_v1'");
 const result=await applyApprovedPigCoinRewards(client,{expectedHash:await policyHash(null)});
 assert.equal(result.receipt.policy.salesEnabled,false);assert.equal(result.receipt.policy.rewardsEnabled,true);assert.equal(result.receipt.policy.revision,1);
 assert.equal(await pigCoinBalance(f.env,7),500);assert.equal((await f.p('SELECT * FROM pig_coin_ledger_v1').all()).results.length,0);
});

for(const postgres of [false,true]){const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: territory WIN/LOSE/DRAW and CMS attack threshold pay independent 100+50 once`,async t=>{
  const f=await contentFixture(t,postgres);let expected=500;
  for(const [i,c] of [
   {winner:'A',attacks:30,min:30,amount:150},{winner:'B',attacks:30,min:30,amount:50},
   {winner:'DRAW',attacks:31,min:30,amount:50},{winner:'A',attacks:29,min:30,amount:100},
   {winner:'B',attacks:29,min:30,amount:0},{winner:'A',attacks:0,min:30,amount:100},
   {winner:'DRAW',attacks:0,min:0,amount:50},{winner:'B',attacks:50,min:51,amount:0}
  ].entries()){
   await f.p('INSERT INTO territory_war_v3_rounds VALUES(?,?,?)',i,c.winner,'2026-09-15T00:00:00Z').run();
   await f.p('INSERT INTO territory_war_v3_rewards VALUES(?,7,?,?,?,?,NULL)',i,'A',c.attacks<c.min?'INELIGIBLE':c.winner==='A'?'WIN':'LOSE',c.attacks,c.min).run();
   assert.equal(await territoryPigCoinPreview(f.env,{side:'A',pig_winner_side:c.winner,attacks:c.attacks,required_attacks:c.min}),c.amount);
   for(let n=0;n<2;n++)await f.DB.batch(await territoryPigCoinStatements(f.env,{userId:7,roundId:i,version:'V3'}));
   expected+=c.amount;assert.equal(await pigCoinBalance(f.env,7),expected);
  }
  await f.p('UPDATE territory_war_v3_rounds SET settled_at=NULL WHERE id=7').run();await f.p('UPDATE territory_war_v3_rewards SET attacks=100 WHERE round_id=7').run();
  await f.DB.batch(await territoryPigCoinStatements(f.env,{userId:7,roundId:7,version:'V3'}));assert.equal(await pigCoinBalance(f.env,7),expected);
  assert.deepEqual(await territoryPigCoinStatements(f.env,{userId:7,roundId:7,version:'LEGACY'}),[]);
 });
 test(`${label}: clan 29/30 completed attacks, defeat participation, champion bonus, defense and retries`,async t=>{
  const f=await contentFixture(t,postgres);let expected=500;
  for(const [i,c] of [{attacks:29,tier:'WINNER',amount:30},{attacks:30,tier:'WINNER',amount:60},{attacks:30,tier:'PARTICIPANT',amount:30},{attacks:29,tier:'RUNNER_UP',amount:0},{attacks:0,tier:'WINNER',amount:30}].entries()){
   await f.p('INSERT INTO clan_reward_receipts VALUES(?,7,1,?,?)',i,c.tier,'PENDING').run();await f.p('INSERT INTO clan_wars VALUES(?,?,1,1,2)',i,i).run();
   await f.p('INSERT INTO clan_participation_progress VALUES(?,?,7,?)',i,i,c.attacks).run();
   // Defense and unfinished attacks cannot inflate the participation total.
   await f.p("INSERT INTO clan_war_battles VALUES(?,8,2,7,'COMPLETED'),(?,7,1,8,'PENDING'),(?,7,1,8,'FAILED')",i,i,i).run();
   for(let n=0;n<2;n++)await f.DB.batch(await clanPigCoinStatements(f.env,{userId:7,seasonId:i}));
   expected+=c.amount;assert.equal(await pigCoinBalance(f.env,7),expected);
  }
  // Old scoring mode has completed battle receipts but no progress rows.
  await f.p("INSERT INTO clan_reward_receipts VALUES(9,7,1,'PARTICIPANT','PENDING')").run();await f.p('INSERT INTO clan_wars VALUES(9,9,1,1,2)').run();
  for(let i=0;i<30;i++)await f.p("INSERT INTO clan_war_battles VALUES(9,7,1,8,'COMPLETED')").run();
  await f.DB.batch(await clanPigCoinStatements(f.env,{userId:7,seasonId:9}));assert.equal(await pigCoinBalance(f.env,7),expected+30);
 });
 test(`${label}: core 30 per clear, independent weekly 90 cap, next-week replay, rollback and account isolation`,async t=>{
  const f=await contentFixture(t,postgres),at=Date.parse('2026-09-13T14:59:59Z');
  const grant=(ref,time=at,userId=7,guardSql='1=1')=>pigCoinRewardStatements(f.env,{userId,source:'CORE_RAID',referenceId:ref,at:time,guardSql});
  await f.DB.batch(await grant('not-clear',at,7,'1=0'));assert.equal(await pigCoinBalance(f.env,7),500);
  f.fail('UPDATE pig_coin_wallets_v1 SET balance=balance+');await assert.rejects(()=>grant('retry').then(s=>f.DB.batch(s)));assert.equal(await pigCoinBalance(f.env,7),500);assert.equal((await f.p('SELECT * FROM pig_coin_ledger_v1').all()).results.length,0);f.fail('');
  // Construct different claims before applying them, as with concurrent requests.
  const batches=await Promise.all(['retry','room-2','room-3','room-4','retry'].map(ref=>grant(ref)));for(const batch of batches)await f.DB.batch(batch);
  assert.equal(await pigCoinBalance(f.env,7),590);assert.equal((await f.p("SELECT * FROM pig_coin_ledger_v1 WHERE source='CORE_RAID'").all()).results.length,3);
  await f.DB.batch(await grant('another-account',at,8));assert.equal(await pigCoinBalance(f.env,8),530);
  const next=Date.parse('2026-09-13T15:00:00Z');await f.DB.batch(await grant('retry',next));assert.equal(await pigCoinBalance(f.env,7),590);
  for(const ref of ['room-4','room-5','room-6','room-7'])await f.DB.batch(await grant(ref,next));assert.equal(await pigCoinBalance(f.env,7),680);
 });
 test(`${label}: completed content and disabled source cannot issue a new reward`,async t=>{
  const f=await contentFixture(t,postgres);await f.p("INSERT INTO clan_reward_receipts VALUES(1,7,1,'WINNER','COMPLETED')").run();await f.DB.batch(await clanPigCoinStatements(f.env,{userId:7,seasonId:1}));assert.equal(await pigCoinBalance(f.env,7),500);
  f.shopPolicy.sources[1].enabled=false;await f.setShop(f.shopPolicy);assert.deepEqual(await clanPigCoinStatements(f.env,{userId:7,seasonId:1}),[]);
 });
}
