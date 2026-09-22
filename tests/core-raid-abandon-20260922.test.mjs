import test from 'node:test';
import assert from 'node:assert/strict';
import {coreLifecycleFixture} from './helpers/core-raid-lifecycle-fixture.mjs';
import {coreTraces} from './helpers/core-mechanic-traces.mjs';
import {handleRaidCoreProtocol} from '../functions/_raid_core_protocol.js';

for(const dialect of ['sqlite','postgres']) {
  test(dialect+': refresh without pagehide finalizes defeat; no replay or duplicated damage',async t=>{
    const h=await coreLifecycleFixture(dialect);t.after(h.close);
    const battle=(await h.begin()).body;
    assert.equal((await h.call('raid/core/status?roomId='+h.roomId)).body.pendingAttempt.id,battle.attemptId);
    const status=await h.call('raid/core/status?roomId='+h.roomId,undefined,{session:'reloaded-page-123456789'});
    assert.equal(status.body.pendingAttempt,null);assert.equal(status.body.me.failureCount,1);
    assert.equal(status.body.current.partyHp,875);assert.equal(status.body.me.lastResult.failureReason,'CORE_BATTLE_ABANDONED');
    for(const result of [await h.finish(battle),await h.call('raid/core/abandon',{roomId:h.roomId,attemptId:battle.attemptId}),await h.call('raid/core/battle?roomId='+h.roomId)]) {
      if(result.status===200){assert.equal(result.body.personalResult,'FAILED');assert.equal(result.body.outcome.bossDamage,0);assert.equal(result.body.outcome.coreProgress,0);}
      else assert.equal(result.status,409);
    }
    const member=await h.row('SELECT * FROM raid_core_members_v2024 WHERE room_id=? AND user_id=1',h.roomId);
    assert.equal(Number(member.attempt_count),1);assert.equal(Number(member.mechanic_score),0);
    assert.equal(Number((await h.row('SELECT party_hp FROM raid_core_rooms_v2024 WHERE room_id=?',h.roomId)).party_hp),875);
    assert.equal(Number((await h.row('SELECT failure_count FROM raid_core_members_v2024 WHERE room_id=? AND user_id=2',h.roomId)).failure_count),0);
  });
  test(dialect+': killed browser expiry is settled by another member polling; heartbeat cannot revive it',async t=>{
    const h=await coreLifecycleFixture(dialect);t.after(h.close);
    const battle=(await h.begin()).body;
    assert.equal((await h.call('raid/core/heartbeat',{roomId:h.roomId,attemptId:battle.attemptId})).status,200);
    await h.run('UPDATE raid_core_attempt_flights_v20260922 SET lease_expires_at=0 WHERE attempt_id=?',battle.attemptId);
    const status=await h.call('raid/core/status?roomId='+h.roomId,undefined,{user:2});
    assert.equal(status.body.current.partyHp,875);
    const pulse=await h.call('raid/core/heartbeat',{roomId:h.roomId,attemptId:battle.attemptId});
    assert.equal(pulse.body.personalResult,'FAILED');
    assert.equal((await h.finish(battle)).body.personalResult,'FAILED');
  });
  test(dialect+': normal completed result survives pagehide and refresh; interrupted terminal room cannot grant damage',async t=>{
    const h=await coreLifecycleFixture(dialect);t.after(h.close);
    const battle=(await h.begin()).body;
    const good=await h.finish(battle);assert.equal(good.body.personalResult,'SUCCESS');
    assert.equal((await h.call('raid/core/abandon',{roomId:h.roomId,attemptId:battle.attemptId})).body.personalResult,'SUCCESS');
    await h.call('raid/core/status',undefined,{session:'new-page-after-win-123'});
    assert.equal(Number((await h.row('SELECT success_count FROM raid_core_members_v2024 WHERE room_id=? AND user_id=1',h.roomId)).success_count),1);
    const next=(await h.begin({requestId:'NEXT'})).body;
    await h.run("UPDATE raid_core_rooms_v2024 SET status='FAILED' WHERE room_id=?",h.roomId);
    const abandoned=await h.call('raid/core/abandon',{roomId:h.roomId,attemptId:next.attemptId});
    assert.equal(abandoned.body.personalResult,'FAILED');assert.equal(abandoned.body.current.status,'FAILED');
    assert.equal(abandoned.body.outcome.coreProgress,0);
  });
  test(dialect+': ownership and page identity checks prevent foreign completion; committed attempts are idempotent after lost responses',async t=>{
    const h=await coreLifecycleFixture(dialect);t.after(h.close);
    const battle=(await h.begin()).body;
    assert.equal((await h.call('raid/core/abandon',{roomId:h.roomId,attemptId:battle.attemptId},{user:2})).status,404);
    assert.equal((await h.finish(battle,{}, {user:2})).status,404);
    h.fail('UPDATE raid_core_members_v2024');
    assert.equal((await h.finish(battle,{requestId:'ROLLBACK',results:{}})).status,500);
    h.fail('');
    assert.equal((await h.row('SELECT status FROM raid_core_attempts_v2024 WHERE attempt_id=?',battle.attemptId)).status,'PENDING');
    h.loseCommit();
    await h.finish(battle,{requestId:'LOST',results:{}});
    const replay=await h.finish(battle,{requestId:'LOST'});
    assert.equal(replay.body.personalResult,'FAILED');
    assert.equal(Number((await h.row('SELECT failure_count FROM raid_core_members_v2024 WHERE room_id=? AND user_id=1',h.roomId)).failure_count),1);
    assert.equal(Number((await h.row('SELECT party_hp FROM raid_core_rooms_v2024 WHERE room_id=?',h.roomId)).party_hp),875);
  });
}

test('every incomplete form and a foreign-page valid trace independently cause defeat with saved failure cost',async t=>{
  const h=await coreLifecycleFixture();t.after(h.close);
  for(const fault of ['missing','cancelled','malformed','foreign-page']){
    const battle=(await h.begin({requestId:'START-'+fault})).body,results=coreTraces(battle.challenge),kind=battle.challenge.mechanics[0].kind;
    if(fault==='missing')delete results.mechanics[kind];
    if(fault==='cancelled')results.mechanics[kind].cancelled=true;
    if(fault==='malformed')results.mechanics[kind].durationMs=-1;
    const result=await h.finish(battle,{requestId:'FINISH-'+fault,results},fault==='foreign-page'?{session:'foreign-page-123456789'}:{});
    assert.equal(result.body.personalResult,'FAILED',fault);assert.equal(result.body.outcome.failureReason,'CORE_BATTLE_ABANDONED');
    assert.equal(result.body.outcome.partyHpDamage,125);assert.equal(result.body.contribution.mechanicScore,0);
  }
  const next=(await h.begin({requestId:'SNAPSHOT'})).body;
  await h.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...h.settings,mechanicFailureDamage:999}),'raid_core_protocol_settings_v2024');
  const result=await h.call('raid/core/abandon',{roomId:h.roomId,attemptId:next.attemptId});
  assert.equal(result.body.outcome.partyHpDamage,125);
  assert.equal(result.body.current.partyHp,375);
});

test('existing foundation marker does not skip additive lifecycle schema or reset CMS',async t=>{
  const h=await coreLifecycleFixture();t.after(h.close);
  await h.run('DROP TABLE raid_core_attempt_flights_v20260922');
  const before=await h.row('SELECT value FROM app_meta WHERE key=?','raid_core_protocol_settings_v2024');
  const env={DB:{prepare:sql=>h.env.DB.prepare(sql),batch:rows=>h.env.DB.batch(rows)}};
  const result=await handleRaidCoreProtocol({path:'raid/core/feature',request:new Request('https://qa.invalid/api/raid/core/feature'),env,deps:h.deps});
  assert.equal(result.status,200);
  assert.equal((await h.row('SELECT COUNT(*) n FROM raid_core_attempt_flights_v20260922')).n,0);
  assert.deepEqual(await h.row('SELECT value FROM app_meta WHERE key=?','raid_core_protocol_settings_v2024'),before);
});

test('simultaneous pagehide, malformed resolve and refresh apply one failure only',async t=>{
  const h=await coreLifecycleFixture();t.after(h.close);const battle=(await h.begin()).body;
  const results=await Promise.all([
    h.call('raid/core/abandon',{roomId:h.roomId,attemptId:battle.attemptId}),
    h.finish(battle,{requestId:'MISSING',results:{}}),
    h.call('raid/core/status',undefined,{session:'new-page-1234567890'})
  ]);
  assert.ok(results.every(r=>r.status===200));
  assert.equal((await h.row('SELECT party_hp FROM raid_core_rooms_v2024 WHERE room_id=?',h.roomId)).party_hp,875);
  assert.equal((await h.row('SELECT failure_count FROM raid_core_members_v2024 WHERE room_id=? AND user_id=1',h.roomId)).failure_count,1);
});
