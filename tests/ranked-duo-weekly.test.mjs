import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyFixture,day} from './helpers/ranked-duo-weekly.mjs';
import {duoWeeklyConfig,copyRankedDuoPolicy,validateDuoPolicy,DUO_WEEKLY_POLICY_KEY} from '../shared/ranked-duo-weekly-v3.mjs';
import {readDuoHonors} from '../functions/_ranked_duo_seasons.js';
import {DUO_WEEKLY_SCHEMA_KEY} from '../functions/_ranked_duo_economy.js';
import {startDuoWeeklyRecruitment,DUO_FIRST_RECRUIT_AT} from '../scripts/ops/ranked-duo-weekly-start-20260925.mjs';
const num=(row,key='n')=>Number(row[key]);
for(const postgres of [false,true,'pipeline'])test(`${postgres||'SQLite'} weekly season outlives solo, pays both partners once, and opens the next full recruitment`,async t=>{
 const f=await weeklyFixture(t,{postgres});await f.active();const s=await f.season();
 assert.equal(Date.parse(s.config.endsAt)-Date.parse(s.recruit_until),7*day);
 f.settings.seasonName='시즌 18';f.settings.enabled=false;f.settings.endsAt=new Date(f.clock()).toISOString();
 await f.tick();assert.equal((await f.season()).status,'ACTIVE');
 f.advance(7*day);const first=await f.tick();assert.equal(first.snapshotFrozen,true);assert.equal((await f.season()).status,'SETTLING');
 await f.tick();assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM ranked_duo_rewards_v3').first()),4);
 for(const user of [2,3,4,5]){const u=await f.p('SELECT coin,card_shards FROM users WHERE id=?',user).first();assert.equal(num(u,'coin'),5000000000);assert.equal(num(u,'card_shards'),30);assert.equal((await readDuoHonors(f.env,user)).count,1);}
 await f.tick();assert.equal((await f.season()).status,'CLOSED');
 f.advance(1200);await f.tick();const next=await f.season();
 assert.equal(next.status,'RECRUITING');assert.equal(next.config.weekly.sequence,2);assert.equal(Date.parse(next.recruit_until)-f.clock(),day);assert.equal(Date.parse(next.config.endsAt)-f.clock(),8*day);
 assert.equal(num(await f.p('SELECT SUM(coin) AS n FROM users').first()),20000000000);
 assert.equal((await f.call('ranked-duo/rewards',{user:2})).data.rewards[0].coin,5000000000);
 assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()),4);
});
for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'} victory reward is atomic with match scores, frozen on admission and never paid to the partner`,async t=>{
 const f=await weeklyFixture(t,{postgres});await f.active();
 const team=(await f.call('ranked-duo/status',{user:2})).data.team;
 for(const m of team.members)await f.p('UPDATE user_cards SET breakthrough_level=200 WHERE user_id=?',m.userId).run();
 const ticket=(await f.call('ranked-duo/match',{user:2,method:'POST'})).data;
 const body={requestId:'weekly-victory-retry-0001',matchToken:ticket.token};
 f.fail('INSERT INTO coin_logs');const failed=await f.call('ranked-duo/fight',{user:2,method:'POST',body});assert.equal(failed.status,500);
 assert.equal(num(await f.p('SELECT SUM(coin) AS n FROM users').first()),0);assert.equal(num(await f.p('SELECT SUM(wins) AS n FROM ranked_duo_teams_v1').first()),0);
 f.fail('');f.advance(31000);
 const policy={...f.policy,rewards:{...f.policy.rewards,winCoin:999999}};
 assert.equal((await f.call('admin/ranked-duo/policy',{method:'PATCH',body:{policy,applyToCurrent:false}})).status,200);
 const result=(await f.call('ranked-duo/fight',{user:2,method:'POST',body})).data;
 assert.equal(result.status,'COMPLETED');assert.equal(result.result,'WIN');assert.equal(result.rewardCoin,250000);
 for(let i=0;i<3;i++)await f.call('ranked-duo/fight',{user:2,method:'POST',body});
 assert.equal(num(await f.p('SELECT coin AS n FROM users WHERE id=2').first()),250000);
 assert.equal(num(await f.p('SELECT SUM(coin) AS n FROM users WHERE id<>2').first()),0);
 assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()),1);
});
test('CMS authority, revision conflicts, atomic current recruitment save and active-season freeze',async t=>{
 const f=await weeklyFixture(t,{postgres:'pipeline'});await f.tick();
 const policy={...f.policy,energy:{...f.policy.energy,maximum:20,rechargeMinutes:7},rewards:{winCoin:333333,tierEnabled:true}};
 assert.equal((await f.call('admin/ranked-duo/policy',{user:2,method:'PATCH',body:{policy}})).status,403);
 assert.equal((await f.call('admin/ranked-duo/policy',{method:'PATCH',body:{policy,applyToCurrent:true}})).status,200);
 assert.equal((await f.season()).config.energy.maximum,20);
 assert.equal((await f.call('admin/ranked-duo/policy',{method:'PATCH',body:{policy}})).data.code,'DUO_CONFIG_CONFLICT');
 for(const user of [2,3,4,5])await f.call('ranked-duo/join',{user,method:'POST'});
 f.advance(day);for(let i=0;i<6;i++)await f.tick();
 assert.equal((await f.call('admin/ranked-duo/policy',{method:'PATCH',body:{policy:{...policy,revision:1},applyToCurrent:true}})).data.code,'DUO_CONFIG_LOCKED');
 assert.equal((await f.season()).config.rewards.winCoin,333333);
});
test('tier payout failure rolls back receipts, all balances, ledgers and cursor; retry safely resumes',async t=>{
 const f=await weeklyFixture(t,{postgres:'pipeline'});await f.active();f.advance(7*day);await f.tick();
 f.fail('INSERT INTO shard_logs');await assert.rejects(f.tick(),/INJECTED/);f.fail('');
 assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM ranked_duo_rewards_v3').first()),0);
 assert.equal(num(await f.p('SELECT SUM(coin) AS n FROM users').first()),0);
 assert.equal(num(await f.p('SELECT last_rank AS n FROM ranked_duo_settlement_v3').first()),0);
 await f.tick();assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM ranked_duo_rewards_v3').first()),4);
});
test('missing tier recipient cannot mark an unpaid batch as complete',async t=>{
 const f=await weeklyFixture(t);await f.active();f.advance(7*day);await f.tick();
 await f.p('DELETE FROM users WHERE id=2').run();await assert.rejects(f.tick());
 assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM ranked_duo_rewards_v3').first()),0);
 assert.equal(num(await f.p('SELECT SUM(coin) AS n FROM users').first()),0);assert.equal((await f.season()).status,'SETTLING');
});
test('pre-deployment recruitment is adopted without changing participants or requested timestamps',async t=>{
 const f=await weeklyFixture(t);const config={...duoWeeklyConfig(f.policy,f.clock()),automatic:false},id='bootstrap-existing';
 await f.p("INSERT INTO ranked_duo_seasons_v1(id,status,config_json,recruit_until,created_at) VALUES(?,'RECRUITING',?,?,?)",id,JSON.stringify(config),config.startsAt,config.weekly.recruitStartsAt).run();
 await f.p("INSERT INTO app_meta(key,value) VALUES('ranked_duo_current_v1',?)",id).run();
 await f.call('ranked-duo/join',{user:2,method:'POST'});f.advance(3600000);await f.tick();
 const s=await f.season();assert.equal(s.id,id);assert.equal(s.config.automatic,true);assert.equal(s.config.startsAt,config.startsAt);assert.equal(s.config.endsAt,config.endsAt);assert.equal(num(s,'participant_count'),1);
 assert.ok(await f.p('SELECT value FROM app_meta WHERE key=?',DUO_WEEKLY_SCHEMA_KEY).first());
});
test('top ten rewards follow final team rank, not the solo top twenty; chunks and concurrent retry remain bounded',async t=>{
 const f=await weeklyFixture(t,{postgres:'pipeline'});await f.active();const s=await f.season();
 await f.pg.exec(`INSERT INTO users(id,nickname,role) SELECT i,'참가'||i,'USER' FROM generate_series(100,157) i;`);
 for(let i=0;i<29;i++)await f.p('INSERT INTO ranked_duo_teams_v1(id,season_id,user_a,user_b,seed_power,score,created_at) VALUES(?,?,?,?,?,?,?)','extra-'+i,s.id,100+i*2,101+i*2,10,900+i,'2026-09-25').run();
 f.advance(7*day);await f.tick();await Promise.all([f.tick(),f.tick(),f.tick()]);
 assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM ranked_duo_rewards_v3').first()),40);
 await f.tick();await f.tick();assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM ranked_duo_rewards_v3').first()),62);
 assert.equal(num(await f.p("SELECT COUNT(*) AS n FROM ranked_duo_rewards_v3 WHERE tier_id='challenger'").first()),20);
 assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM ranked_duo_trophies_v2').first()),20);
 assert.ok(f.queries().some(q=>/final_rank>.+LIMIT/.test(q)));assert.equal((await f.season()).status,'CLOSED');
});
test('additional recruitment keeps a full seven-day battle window and existing teams',async t=>{
 const f=await weeklyFixture(t);await f.tick();for(const user of [2,3,4,5])await f.call('ranked-duo/join',{user,method:'POST'});
 f.advance(day);for(let i=0;i<4;i++)await f.tick();const teams=(await f.p('SELECT id FROM ranked_duo_teams_v1').all()).results;
 const r=await f.call('admin/ranked-duo/recruit',{method:'POST',body:{hours:24}});assert.equal(r.status,200);
 const s=await f.season();assert.equal(Date.parse(s.config.endsAt)-Date.parse(s.recruit_until),7*day);assert.deepEqual((await f.p('SELECT id FROM ranked_duo_teams_v1').all()).results,teams);
});
test('first recruitment operation copies actual settings and is idempotent',async t=>{
 const f=await weeklyFixture(t,{postgres:true});
 await f.p('DELETE FROM app_meta WHERE key=?',DUO_WEEKLY_POLICY_KEY).run();
 await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)','pvp_settings_v1',JSON.stringify(f.settings)).run();
 const client={query:(sql,args)=>sql.startsWith('SELECT current_user')?Promise.resolve({rows:[{role:'cnine_migrator',db:'cnine'}]}):f.pg.query(sql,args)};
 const first=await startDuoWeeklyRecruitment(client),again=await startDuoWeeklyRecruitment(client);
 assert.equal(first.openedAt,DUO_FIRST_RECRUIT_AT);assert.equal(first.endsAt,'2026-10-03T13:48:25.000Z');assert.equal(again.alreadyApplied,true);
 assert.equal(first.policy.rewards.winCoin,250000);assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM ranked_duo_seasons_v1').first()),1);
 const copied=copyRankedDuoPolicy(f.settings,DUO_FIRST_RECRUIT_AT);assert.equal(validateDuoPolicy(copied).challenger.rankLimit,10);
});
test('a concurrent CMS save cannot create the next season from a stale policy',async t=>{
 const f=await weeklyFixture(t,{postgres:'pipeline'}),batch=f.DB.batch.bind(f.DB);let changed=false;
 f.DB.batch=async list=>{
  if(!changed&&list.some(q=>q.sql?.includes('INSERT INTO ranked_duo_seasons_v1')||q.source?.includes('INSERT INTO ranked_duo_seasons_v1'))){
   changed=true;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...f.policy,revision:1,rewards:{...f.policy.rewards,winCoin:345678}}),DUO_WEEKLY_POLICY_KEY).run();
  }
  return batch(list);
 };
 // PostgreSQL prepared statements expose their SQL as .sql in the adapter.
 await assert.rejects(f.tick());assert.equal(changed,true);
 assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM ranked_duo_seasons_v1').first()),0);
 await f.tick();assert.equal((await f.season()).config.rewards.winCoin,345678);
});
test('no combat produces no rewards; disabling next recruitment does not reopen a closed season',async t=>{
 const f=await weeklyFixture(t);await f.tick();
 for(const user of [2,3])await f.call('ranked-duo/join',{user,method:'POST'});
 f.advance(day);for(let i=0;i<6;i++)await f.tick();
 assert.equal((await f.season()).status,'READY');
 const cms=await f.call('admin/ranked-duo/policy',{method:'PATCH',body:{policy:{...f.policy,enabled:false},applyToCurrent:false}});assert.equal(cms.status,200);
 f.advance(7*day);await f.tick();assert.equal((await f.season()).status,'CLOSED');
 assert.equal(num(await f.p('SELECT COUNT(*) AS n FROM ranked_duo_rewards_v3').first()),0);
 assert.equal((await f.tick()).phase,'WAITING_DUO_POLICY');
});
