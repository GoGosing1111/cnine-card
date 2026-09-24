import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCoreRaidBalanceGate,coreRaidAttemptOutcome} from '../functions/_raid_core_protocol.js';
import {coreLifecycleFixture} from './helpers/core-raid-lifecycle-fixture.mjs';
import {coreTraces,mechanicTrace} from './helpers/core-mechanic-traces.mjs';

const scores = (BREAK, BLOCK = 100, STABILIZE = 100) => ({BREAK,BLOCK,STABILIZE});
const entry = coreScores => ({version:1,coreTarget:360,coreScores});
const win = coreRaidAttemptOutcome({serverWinner:'A',qte:{allSuccess:true},contribution:{coreProgress:24}});
const gate = (entryBalance, extra = {}) => applyCoreRaidBalanceGate({
  room:{coreTarget:360,coreScores:scores(220)},operation:'BREAK',outcome:win,entryBalance,...extra
});

test('entry protection covers a tied lowest core and a safe leading core, but retains the actual live projection',()=>{
  for(const start of [scores(100),scores(140)]) {
    const result = gate(entry(start));
    assert.equal(result.success,true);
    assert.equal(result.balanceProtectedAtEntry,true);
    assert.equal(result.partyHpDamage,0);
    assert.equal(result.coreProgress,24);
    assert.equal(result.balance.spread,144,'do not replace the live gauge with entry scores');
    assert.equal(result.entryProjectedBalance.spread,start.BREAK + 24 - 100);
    assert.equal(result.entryProjectedBalance.tolerance,123);
  }
  const lowestRecovery = gate(entry(scores(100,300,300)));
  assert.equal(lowestRecovery.success,true,'the existing lowest-core recovery exemption also survives');
});

test('unsafe entry and missing/malformed legacy snapshots do not bypass the existing overload penalty',()=>{
  for(const snapshot of [entry(scores(220)),null,{},entry({BREAK:0}),
    {...entry(scores(100)),version:2},entry(scores(-1)),entry(scores(361)),entry(scores('100'))]) {
    const result=gate(snapshot);
    assert.equal(result.failureReason,'CORE_OVERLOAD');
    assert.equal(result.balanceProtectedAtEntry,undefined);
    assert.equal(result.coreProgress,0);
    assert.equal(result.partyHpDamage,100);
  }
});

test('an initially unsafe attack can still benefit from live recovery; saved settings cannot turn failures into wins',()=>{
  const healed=gate(entry(scores(220)),{room:{coreTarget:360,coreScores:scores(220,220,220)}});
  assert.equal(healed.success,true);
  assert.equal(healed.balanceProtectedAtEntry,undefined);
  assert.equal(gate(entry(scores(140)),{entrySettings:{coreBalanceTolerancePercent:10}}).success,false);
  for(const [serverWinner,allSuccess,stage] of [['B',true,'CORE'],['A',false,'CORE'],['A',true,'BOSS']]) {
    const outcome=coreRaidAttemptOutcome({serverWinner,qte:{allSuccess},stage,contribution:{coreProgress:24,totalDamage:999}});
    const result=gate(entry(scores(100)),{outcome});
    assert.equal(result.success,outcome.success);
    assert.equal(result.failureReason,outcome.failureReason);
    assert.equal(result.balanceProtectedAtEntry,undefined);
    assert.equal(result.bossDamage,outcome.bossDamage);
  }
});

async function setScores(h, coreScores) {
  await h.run('UPDATE raid_core_rooms_v2024 SET break_score=?,block_score=?,stabilize_score=? WHERE room_id=?',
    coreScores.BREAK,coreScores.BLOCK,coreScores.STABILIZE,h.roomId);
}

async function overlap(h) {
  await setScores(h,scores(100));
  const first=await h.begin({requestId:'ENTRY-FIRST'});
  const second=await h.begin({requestId:'ENTRY-SECOND'},{user:2});
  assert.equal(first.status,200);assert.equal(second.status,200);
  const done=await h.finish(second.body,{requestId:'SECOND-DONE'},{user:2});
  assert.equal(done.body.personalResult,'SUCCESS');
  return {battle:first.body,otherProgress:done.body.outcome.coreProgress};
}

for(const dialect of ['sqlite','postgres']) {
  test(dialect+': both safe entries succeed when the later entrant finishes first; retries never duplicate progress',async t=>{
    const h=await coreLifecycleFixture(dialect);t.after(h.close);
    const {battle,otherProgress}=await overlap(h);
    const stored=await h.row('SELECT deck_snapshot FROM raid_core_attempts_v2024 WHERE attempt_id=?',battle.attemptId);
    assert.deepEqual(JSON.parse(stored.deck_snapshot).coreRaidEntryBalance,entry(scores(100)));
    const retryStart=await h.begin({requestId:'ENTRY-FIRST'});
    assert.equal(retryStart.body.attemptId,battle.attemptId,'a start retry must retain its original snapshot');
    const result=await h.finish(battle);
    assert.equal(result.status,200);assert.equal(result.body.personalResult,'SUCCESS');
    assert.equal(result.body.outcome.balanceProtectedAtEntry,true);
    assert.equal(result.body.outcome.partyHpDamage,0);
    assert.equal(result.body.current.partyHp,1000);
    assert.deepEqual(result.body.current.coreScores,scores(100+otherProgress+result.body.outcome.coreProgress));
    for(const requestId of ['QA-FINISH','DIFFERENT-RETRY']) {
      const replay=await h.finish(battle,{requestId});
      assert.deepEqual(replay.body.outcome,result.body.outcome);
    }
    const member=await h.row('SELECT * FROM raid_core_members_v2024 WHERE room_id=? AND user_id=1',h.roomId);
    assert.equal(Number(member.success_count),1);assert.equal(Number(member.failure_count),0);
    assert.equal(Number(member.total_core_progress),result.body.outcome.coreProgress);
    const live=await h.row('SELECT * FROM raid_core_rooms_v2024 WHERE room_id=?',h.roomId);
    assert.equal(Number(live.break_score),100+otherProgress+result.body.outcome.coreProgress);
    assert.equal(Number(live.party_hp),1000);
  });

  test(dialect+': an unsafe selection and forged client snapshots still fail with the original cost exactly once',async t=>{
    const h=await coreLifecycleFixture(dialect);t.after(h.close);
    await setScores(h,scores(220));
    const forged={coreRaidEntryBalance:entry(scores(100)),entryBalance:entry(scores(100)),coreRaidCombatSettings:{coreBalanceTolerancePercent:75}};
    const battle=(await h.begin(forged)).body;
    const result=await h.finish(battle,forged);
    assert.equal(result.body.outcome.failureReason,'CORE_OVERLOAD');
    assert.equal(result.body.current.partyHp,900);assert.equal(result.body.outcome.coreProgress,0);
    await h.finish(battle,{requestId:'RETRY-UNSAFE',...forged});
    const live=await h.row('SELECT * FROM raid_core_rooms_v2024 WHERE room_id=?',h.roomId);
    assert.equal(Number(live.party_hp),900);assert.equal(Number(live.break_score),220);
  });

  test(dialect+': protected settlement rolls back completely on failure and recovers a lost commit without duplicate effects',async t=>{
    const h=await coreLifecycleFixture(dialect);t.after(h.close);
    const {battle,otherProgress}=await overlap(h);
    h.fail('UPDATE raid_core_members_v2024');
    assert.equal((await h.finish(battle,{requestId:'ROLLBACK'})).status,500);
    h.fail('');
    assert.equal((await h.row('SELECT status FROM raid_core_attempts_v2024 WHERE attempt_id=?',battle.attemptId)).status,'PENDING');
    assert.equal(Number((await h.row('SELECT break_score FROM raid_core_rooms_v2024 WHERE room_id=?',h.roomId)).break_score),100+otherProgress);
    h.loseCommit();
    assert.equal((await h.finish(battle,{requestId:'LOST-COMMIT'})).status,500);
    const replay=await h.finish(battle,{requestId:'LOST-COMMIT'});
    assert.equal(replay.body.personalResult,'SUCCESS');assert.equal(replay.body.outcome.balanceProtectedAtEntry,true);
    const member=await h.row('SELECT * FROM raid_core_members_v2024 WHERE room_id=? AND user_id=1',h.roomId);
    assert.equal(Number(member.attempt_count),1);assert.equal(Number(member.success_count),1);
    const live=await h.row('SELECT * FROM raid_core_rooms_v2024 WHERE room_id=?',h.roomId);
    assert.equal(Number(live.break_score),100+otherProgress+replay.body.outcome.coreProgress);
    assert.equal(Number(live.party_hp),1000);
  });
}

test('entry uses saved tolerance, while completed old attempts without a snapshot retain the legacy gate',async t=>{
  for(const legacy of [false,true]) {
    const h=await coreLifecycleFixture();t.after(h.close);
    await setScores(h,scores(140));
    const battle=(await h.begin({operation:'BLOCK'})).body;
    if(legacy) {
      const row=await h.row('SELECT deck_snapshot FROM raid_core_attempts_v2024 WHERE attempt_id=?',battle.attemptId);
      const snapshot=JSON.parse(row.deck_snapshot);delete snapshot.coreRaidEntryBalance;
      await h.run('UPDATE raid_core_attempts_v2024 SET deck_snapshot=? WHERE attempt_id=?',JSON.stringify(snapshot),battle.attemptId);
    }
    await setScores(h,scores(140,220));
    await h.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...h.settings,coreBalanceTolerancePercent:10}),'raid_core_protocol_settings_v2024');
    const result=await h.finish(battle);
    assert.equal(result.body.personalResult,legacy?'FAILED':'SUCCESS');
    if(!legacy) assert.equal(result.body.outcome.entryProjectedBalance.tolerance,123);
  }
});

test('a protected entry still needs a real combat win and both valid, successful mechanics',async t=>{
  for(const fault of ['combat','mechanic','abandoned']) {
    const h=await coreLifecycleFixture();t.after(h.close);
    const {battle}=await overlap(h);
    if(fault==='combat') await h.run("UPDATE raid_core_attempts_v2024 SET server_winner='B' WHERE attempt_id=?",battle.attemptId);
    const results=coreTraces(battle.challenge);
    if(fault==='mechanic') {
      const plan=battle.challenge.mechanics[0];
      results.mechanics[plan.kind]=mechanicTrace(plan,battle.challenge,false);
    }
    const result=await h.finish(battle,{results:fault==='abandoned'?{}:results});
    assert.equal(result.body.personalResult,'FAILED',fault);
    assert.equal(result.body.outcome.failureReason,({combat:'CORE_BATTLE_DEFEAT',mechanic:'CORE_MECHANIC_FAILED',abandoned:'CORE_BATTLE_ABANDONED'})[fault]);
    assert.equal(result.body.outcome.coreProgress,0);assert.equal(result.body.outcome.partyHpDamage,125);
    assert.equal(result.body.outcome.balanceProtectedAtEntry,undefined);
  }
});
