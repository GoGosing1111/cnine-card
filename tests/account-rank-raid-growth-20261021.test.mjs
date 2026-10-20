import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {rankLevelTicks,rankNextTicks,MAX_RANK_TICKS,PRE_GROWTH_MAX_RANK_TICKS,preGrowthLevelTicks,preGrowthLevelFromTicks,preserveRankProgress,levelFromTicks} from '../functions/_account_rank_curve.js';
import {SHIRANUI_MIN_RANK_TICKS,ensureAccountRank} from '../functions/_account_rank.js';
import {prepareRankGrowthCap,migrateRankGrowth,MIGRATION_KEY,CAP_KEY} from '../scripts/ops/account-rank-raid-growth-20261021.mjs';
import {madaraLiveFixture} from './helpers/madara-live-fixture.mjs';
import {prepareMadaraRewards,madaraWeeklyReward} from '../functions/_raid_madara_rewards.js';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {readyLichClear} from './helpers/lich-clear-fixture.mjs';
import {lichWeeklyReward} from '../functions/_raid_lich_rewards.js';

test('strong growth begins at 185, adds 5 percentage points per level and preserves rank boundaries',()=>{
  let total=0,previousCost=0,previousIncrease=0;
  for(let level=1;level<250;level++){
    const old=(4*(level-1)+64)*8;
    const expected=Math.ceil(old*(100+Math.max(0,level-184)*5)/100);
    assert.equal(rankLevelTicks(level),total*600);
    assert.equal(rankNextTicks(level),expected*600);
    if(level<185)assert.equal(rankLevelTicks(level),preGrowthLevelTicks(level));
    if(level>185){
      assert.ok(expected-previousCost>=previousIncrease);
      previousIncrease=expected-previousCost;
    }
    previousCost=expected;total+=expected;
  }
  assert.equal(total,1948378);assert.equal(MAX_RANK_TICKS,total*600);
  assert.equal(SHIRANUI_MIN_RANK_TICKS,1466820*600);
  assert.equal(levelFromTicks(SHIRANUI_MIN_RANK_TICKS-1),234);
  assert.equal(levelFromTicks(SHIRANUI_MIN_RANK_TICKS),235);
  for(let level=1;level<250;level++){
    const oldStart=preGrowthLevelTicks(level),oldRequired=preGrowthLevelTicks(level+1)-oldStart;
    for(const progress of [0,1,Math.floor(oldRequired/3),oldRequired/2,oldRequired-1]){
      const before=oldStart+progress,after=preserveRankProgress(before);
      assert.equal(preGrowthLevelFromTicks(before),level);assert.equal(levelFromTicks(after),level);
      const newProgress=after-rankLevelTicks(level),expected=progress*rankNextTicks(level)/oldRequired;
      assert.ok(newProgress>=expected-1e-7&&newProgress-expected<1);
    }
  }
  assert.equal(preserveRankProgress(PRE_GROWTH_MAX_RANK_TICKS),MAX_RANK_TICKS);
});

test('PostgreSQL migration expands safely, rolls back, preserves every level and progress and replays once',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE account_rank_progress_v1(user_id BIGINT PRIMARY KEY,total_ticks BIGINT CHECK(total_ticks>=0 AND total_ticks<=${PRE_GROWTH_MAX_RANK_TICKS}),updated_at TEXT DEFAULT 'preserved');
    CREATE TABLE account_rank_receipts_v1(user_id BIGINT,ticks BIGINT);
    CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT);
    INSERT INTO users VALUES(1,'OWNER','ACTIVE');
    INSERT INTO account_rank_receipts_v1 VALUES(1,24000);
    CREATE TABLE admin_logs(admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
  const before=[0,preGrowthLevelTicks(184)+1,preGrowthLevelTicks(185)+123456,preGrowthLevelTicks(234)+9999,PRE_GROWTH_MAX_RANK_TICKS];
  for(let i=0;i<before.length;i++)await db.query('INSERT INTO account_rank_progress_v1(user_id,total_ticks) VALUES($1,$2)',[i+1,before[i]]);
  const rows=async()=> (await db.query('SELECT * FROM account_rank_progress_v1 ORDER BY user_id')).rows;
  const snapshot=await rows();
  assert.equal((await prepareRankGrowthCap(db,{dryRun:true})).dryRun,true);
  assert.deepEqual(await rows(),snapshot);
  assert.equal((await db.query('SELECT * FROM app_meta')).rows.length,0);
  await prepareRankGrowthCap(db);assert.equal((await prepareRankGrowthCap(db)).replayed,true);
  assert.deepEqual(await rows(),snapshot);
  const options={deployedSource:'a'.repeat(40)};
  await assert.rejects(()=>migrateRankGrowth(db),/deployed source/);
  const dry=await migrateRankGrowth(db,{...options,dryRun:true});assert.equal(dry.changed,3);assert.deepEqual(await rows(),snapshot);
  await db.exec("ALTER TABLE admin_logs ADD CONSTRAINT injected_failure CHECK(action_type<>'ACCOUNT_RANK_RAID_GROWTH')");
  await assert.rejects(()=>migrateRankGrowth(db,options),/injected_failure/);
  assert.deepEqual(await rows(),snapshot);
  assert.equal((await db.query('SELECT * FROM app_meta WHERE key=$1',[MIGRATION_KEY])).rows.length,0);
  await db.exec('ALTER TABLE admin_logs DROP CONSTRAINT injected_failure');
  const applied=await migrateRankGrowth(db,options);assert.equal(applied.changed,3);
  const after=await rows();assert.deepEqual(after.map(r=>Number(r.total_ticks)),before.map(preserveRankProgress));
  assert.ok(after.every(r=>r.updated_at==='preserved'));
  await db.query('UPDATE account_rank_progress_v1 SET total_ticks=total_ticks+4800 WHERE user_id=1');
  assert.equal((await migrateRankGrowth(db,options)).replayed,true);
  assert.equal(Number((await rows())[0].total_ticks),4800);
  assert.equal((await db.query('SELECT * FROM admin_logs')).rows.length,1);
  assert.equal((await db.query('SELECT * FROM account_rank_receipts_v1')).rows.length,1);
  assert.equal((await db.query('SELECT * FROM app_meta WHERE key=$1',[CAP_KEY])).rows.length,1);
  await assert.rejects(()=>db.query('UPDATE account_rank_progress_v1 SET total_ticks=$1 WHERE user_id=1',[MAX_RANK_TICKS+1]),/check constraint/);
});

for(const postgres of [false,true]){
  test(`${postgres?'PostgreSQL':'SQLite'}: Barsen XP shares weekly quota, stale-plan rollback, retry and TEST/failed/left exclusions`,async t=>{
    const h=await madaraLiveFixture({postgres});t.after(()=>h.close());
    await h.call('feature');await ensureAccountRank(h.env);
    const room=(id,overrides={})=>({id,status:'CLEAR',releaseMode:'ON',finishedAt:Date.now(),members:[{id:'1'},{id:'2',left:true}],
      rewardPolicy:{enabled:true,coin:100,masterStars:0,petEssence:0,weeklyLimit:1},...overrides});
    for(const r of [room('test',{releaseMode:'TEST'}),room('failed',{status:'FAILED'}),room('off',{rewardPolicy:{enabled:false}})]){
      const plan=await prepareMadaraRewards(h.env,{status:'ACTIVE'},r);await h.env.DB.batch(plan.statements);
    }
    assert.equal((await h.all('SELECT * FROM account_rank_receipts_v1')).length,0);
    const first=room('first'),plan=await prepareMadaraRewards(h.env,{status:'ACTIVE'},first);
    const stale=await prepareMadaraRewards(h.env,{status:'ACTIVE'},room('competing-last-slot'));
    h.inject('UPDATE account_rank_progress_v1');
    await assert.rejects(()=>h.env.DB.batch(plan.statements));h.inject('');
    assert.equal((await madaraWeeklyReward(h.env,1,1)).used,0);
    assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),0);
    assert.equal((await h.all('SELECT * FROM account_rank_receipts_v1')).length,0);
    await h.env.DB.batch(plan.statements);
    await assert.rejects(()=>h.env.DB.batch(stale.statements));
    assert.equal((await prepareMadaraRewards(h.env,{status:'ACTIVE'},first)).statements.length,0);
    const limited=room('limited'),limitedPlan=await prepareMadaraRewards(h.env,{status:'ACTIVE'},limited);
    await h.env.DB.batch(limitedPlan.statements);assert.equal(limited.clearRewards['1'].status,'WEEKLY_LIMIT');
    const receipts=await h.all('SELECT user_id,source,ticks FROM account_rank_receipts_v1');
    assert.deepEqual(receipts.map(r=>[Number(r.user_id),r.source,Number(r.ticks)]),[[1,'MADARA_RAID_WEEKLY',100000]]);
    assert.equal(Number((await h.one('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=1')).total_ticks),100000);
  });
  test(`${postgres?'PostgreSQL':'SQLite'}: Isgen XP failure rolls back the clear and quota; retry pays all members once`,async t=>{
    const h=await lichLiveFixture({postgres});t.after(()=>h.close());
    const {body,roomId}=await readyLichClear(h);
    h.inject('UPDATE account_rank_progress_v1');
    assert.equal((await h.call('action',{body})).status,503);h.inject('');
    assert.equal((await lichWeeklyReward(h.env,1)).used,0);
    assert.equal((await h.one('SELECT status FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).status,'ACTIVE');
    assert.equal((await h.all('SELECT * FROM account_rank_receipts_v1')).length,0);
    assert.equal((await h.call('action',{body})).status,200);
    assert.equal((await h.call('action',{body})).status,200);
    await h.call('status?roomId='+roomId);
    const receipts=await h.all('SELECT user_id,source,ticks FROM account_rank_receipts_v1 ORDER BY user_id');
    assert.deepEqual(receipts.map(r=>[Number(r.user_id),r.source,Number(r.ticks)]),[1,2,3].map(id=>[id,'LICH_RAID_WEEKLY',100000]));
  });
}
