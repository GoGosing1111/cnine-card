import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyFixture,day} from './helpers/ranked-duo-weekly.mjs';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';
import {readDuoHonors} from '../functions/_ranked_duo_seasons.js';

test('ADMIN can join, retry and cancel recruitment while OWNER participation and CMS permissions remain unchanged',async t=>{
  const f=await weeklyFixture(t);await f.p("UPDATE users SET role='ADMIN' WHERE id=2").run();await f.tick();
  const join=()=>f.call('ranked-duo/join',{user:2,method:'POST'});
  assert.equal((await join()).status,200);assert.equal((await join()).status,200);
  assert.equal(Number((await f.season()).participant_count),1);
  assert.equal((await f.call('ranked-duo/join',{user:1,method:'POST'})).data.code,'DUO_ROLE');
  assert.equal((await f.call('admin/ranked-duo',{user:2})).status,403);
  assert.equal((await f.call('admin/ranked-duo/policy',{user:2,method:'PATCH',body:{policy:f.policy}})).status,403);
  assert.equal((await f.call('ranked-duo/join',{user:2,method:'DELETE'})).status,200);
  assert.equal(Number((await f.season()).participant_count),0);
  assert.equal((await join()).status,200);
});

for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'} ADMIN survives automatic pairing, fights with normal energy, and receives final standings and rewards once`,async t=>{
  const f=await weeklyFixture(t,{postgres});await f.p("UPDATE users SET role='ADMIN' WHERE id=2").run();
  await f.active();
  const status=await f.call('ranked-duo/status',{user:2});assert.equal(status.status,200);
  assert.ok(status.data.team?.members.some(m=>m.userId===2));assert.equal(status.data.energy.current,10);
  const ranking=await f.call('ranked-duo/ranking',{user:2});assert.equal(ranking.data.ranking.length,2);
  assert.ok(ranking.data.ranking.some(team=>team.id===status.data.team.id));
  const profiles=await loadDuoProfiles(f.env,[2],(await f.season()).config,f.deps,{now:f.clock()});
  assert.equal(profiles[0].user.role,'ADMIN');assert.ok(profiles[0].attackReady&&profiles[0].defenseReady);
  const ticket=await f.call('ranked-duo/match',{user:2,method:'POST'});assert.equal(ticket.status,200,JSON.stringify(ticket));
  const body={requestId:'admin-duo-fight-20260926',matchToken:ticket.data.token};
  const result=await f.call('ranked-duo/fight',{user:2,method:'POST',body});assert.equal(result.data.status,'COMPLETED',JSON.stringify(result));
  assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);
  const replay=await f.call('ranked-duo/fight',{user:2,method:'POST',body});assert.deepEqual(replay.data,result.data);
  assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);
  const coinBefore=Number((await f.p('SELECT coin FROM users WHERE id=2').first()).coin);
  const seasonId=(await f.season()).id;f.advance(7*day);await f.tick();await f.tick();await f.tick();
  assert.equal((await f.season()).status,'CLOSED');
  const final=(await f.call('ranked-duo/ranking',{user:2})).data.ranking;
  assert.equal(final.length,2);assert.ok(final.some(team=>team.id===status.data.team.id));
  const rewards=(await f.call('ranked-duo/rewards',{user:2})).data.rewards;
  assert.equal(rewards.length,1);assert.equal(rewards[0].coin,5000000000);
  assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=2').first()).coin),coinBefore+5000000000);
  assert.equal((await readDuoHonors(f.env,2)).count,1);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_rewards_v3 WHERE season_id=? AND user_id=2',seasonId).first()).n),1);
});

test('ADMIN keeps active-account, ban, deck and recruitment-window requirements',async t=>{
  const f=await weeklyFixture(t);await f.p("UPDATE users SET role='ADMIN' WHERE id=2").run();await f.tick();
  const join=()=>f.call('ranked-duo/join',{user:2,method:'POST'});
  await f.p("UPDATE users SET status='BANNED' WHERE id=2").run();assert.equal((await join()).data.code,'DUO_ACCOUNT');
  await f.p("UPDATE users SET status='ACTIVE',banned_until=? WHERE id=2",new Date(f.clock()+day).toISOString()).run();assert.equal((await join()).data.code,'DUO_ACCOUNT');
  await f.p('UPDATE users SET banned_until=NULL WHERE id=2').run();
  await f.p("UPDATE pvp_decks SET card_ids='[]' WHERE user_id=2").run();assert.equal((await join()).data.code,'DUO_DECK');
  await f.p('UPDATE pvp_decks SET card_ids=? WHERE user_id=2',JSON.stringify(['C-0','C-1','C-2','C-3','C-4'])).run();
  f.advance(day);assert.notEqual((await join()).status,200);
  assert.equal(Number((await f.season()).participant_count),0);
});
