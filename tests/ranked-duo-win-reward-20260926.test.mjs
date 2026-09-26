import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyFixture} from './helpers/ranked-duo-weekly.mjs';
import {validateDuoPolicy,DUO_WEEKLY_POLICY_KEY} from '../shared/ranked-duo-weekly-v3.mjs';
import {applyDuoWinReward,inspectDuoWinReward,WIN_COIN,OPERATION_KEY} from '../scripts/ops/ranked-duo-win-reward-20260926.mjs';

test('duo win reward has no economic amount cap and still rejects unsafe numbers',async t=>{
 const f=await weeklyFixture(t);
 for(const winCoin of [0,50_000_000,10_000_000_000,Number.MAX_SAFE_INTEGER])assert.equal(validateDuoPolicy({...f.policy,rewards:{...f.policy.rewards,winCoin}}).rewards.winCoin,winCoin);
 for(const winCoin of [-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>validateDuoPolicy({...f.policy,rewards:{...f.policy.rewards,winCoin}}),/승리 코인/);
});

for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'} CMS applies 5000만 now; each distinct victory credits once with full rollback on failure`,async t=>{
 const f=await weeklyFixture(t,{postgres});await f.tick();
 const saved=await f.call('admin/ranked-duo/policy',{method:'PATCH',body:{policy:{...f.policy,rewards:{...f.policy.rewards,winCoin:WIN_COIN}},applyToCurrent:true}});
 assert.equal(saved.status,200);assert.equal((await f.season()).config.rewards.winCoin,WIN_COIN);
 await f.active();const team=(await f.call('ranked-duo/status',{user:2})).data.team;
 for(const m of team.members)await f.p('UPDATE user_cards SET breakthrough_level=200 WHERE user_id=?',m.userId).run();
 for(let i=0;i<2;i++){
  const ticket=(await f.call('ranked-duo/match',{user:2,method:'POST'})).data;
  const body={requestId:'duo-5000man-win-retry-'+i,matchToken:ticket.token};
  if(i===0){
   f.fail('INSERT INTO coin_logs');assert.equal((await f.call('ranked-duo/fight',{user:2,method:'POST',body})).status,500);
   assert.equal(Number((await f.p('SELECT SUM(coin) AS n FROM users').first()).n),0);
   assert.equal(Number((await f.p('SELECT SUM(wins) AS n FROM ranked_duo_teams_v1').first()).n),0);f.fail('');f.advance(31000);
  }
  const result=await f.call('ranked-duo/fight',{user:2,method:'POST',body});
  assert.equal(result.status,200);assert.equal(result.data.result,'WIN');assert.equal(result.data.rewardCoin,WIN_COIN);
  assert.deepEqual((await f.call('ranked-duo/fight',{user:2,method:'POST',body})).data,result.data);
 }
 assert.equal(Number((await f.p('SELECT coin AS n FROM users WHERE id=2').first()).n),2*WIN_COIN);
 assert.equal(Number((await f.p('SELECT SUM(coin) AS n FROM users WHERE id<>2').first()).n),0);
 assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n),2);
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,8);
});

async function operationFixture(t){
 const f=await weeklyFixture(t,{postgres:'pipeline'});await f.active();
 await f.pg.exec('ALTER TABLE admin_logs ADD COLUMN id BIGSERIAL PRIMARY KEY');
 const client={query:(sql,args=[])=>f.pg.query(sql,args)};
 return {...f,client};
}
async function snapshot(f){
 const rows={};for(const name of ['app_meta','ranked_duo_seasons_v1','ranked_duo_entries_v1','ranked_duo_teams_v1','ranked_duo_matches_v1','users','admin_logs'])rows[name]=(await f.pg.query('SELECT * FROM '+name+' ORDER BY 1')).rows;return rows;
}
test('one-time current-season operation preserves schedules, teams, energy and tiers; dry-run/replay never overwrite',async t=>{
 const f=await operationFixture(t),plan=await inspectDuoWinReward(f.client),before=await snapshot(f);
 const args={expectedSeasonId:plan.seasonId,expectedSnapshotHash:plan.snapshotHash};
 assert.equal((await applyDuoWinReward(f.client,{...args,dryRun:true})).dryRun,true);assert.deepEqual(await snapshot(f),before);
 const applied=await applyDuoWinReward(f.client,args),after=await inspectDuoWinReward(f.client);
 assert.equal(applied.status,'COMPLETED');assert.equal(after.config.rewards.winCoin,WIN_COIN);assert.equal(after.policy.rewards.winCoin,WIN_COIN);
 const expectedConfig=structuredClone(plan.config);expectedConfig.rewards.winCoin=WIN_COIN;expectedConfig.revision++;expectedConfig.weekly.policyRevision=plan.policy.revision+1;
 const expectedPolicy=structuredClone(plan.policy);expectedPolicy.rewards.winCoin=WIN_COIN;expectedPolicy.revision++;
 assert.deepEqual(after.config,expectedConfig);assert.deepEqual(after.policy,expectedPolicy);
 const changed=await snapshot(f);for(const key of ['ranked_duo_entries_v1','ranked_duo_teams_v1','ranked_duo_matches_v1','users'])assert.deepEqual(changed[key],before[key]);
 await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...after.policy,revision:after.policy.revision+1,rewards:{...after.policy.rewards,winCoin:60_000_000}}),DUO_WEEKLY_POLICY_KEY).run();
 const replayBefore=await snapshot(f);assert.equal((await applyDuoWinReward(f.client,args)).replayed,true);assert.deepEqual(await snapshot(f),replayBefore);
});

test('stale snapshot and failed audit leave current and next policy, season and receipt untouched',async t=>{
 const f=await operationFixture(t),plan=await inspectDuoWinReward(f.client),before=await snapshot(f);
 const args={expectedSeasonId:plan.seasonId,expectedSnapshotHash:plan.snapshotHash};
 await assert.rejects(()=>applyDuoWinReward(f.client,{...args,expectedSnapshotHash:'a'.repeat(64)}),/changed/);assert.deepEqual(await snapshot(f),before);
 const broken={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('audit unavailable')):f.client.query(sql,args)};
 await assert.rejects(()=>applyDuoWinReward(broken,args),/audit unavailable/);assert.deepEqual(await snapshot(f),before);
 assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',OPERATION_KEY).first(),null);
});
