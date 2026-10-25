import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MERCENARY_LEVEL_KEY, MERCENARY_LEVEL_RULES, MERCENARY_LEVEL_RELEASE_ENABLED,
  MERCENARY_GROWTH_VERSION, mercenaryLevelDraft, mercenaryGrowthDraft,
  mercenaryGrowthSummary, mercenaryLevelReadiness, validateMercenaryLevelPolicy,
  mercenaryLevelRequiredXp, initialMercenaryLevel,
} from '../shared/mercenary-level-v1.mjs';
import {
  ensureMercenaryLevelSchema, readMercenaryLevelPolicy, readMercenaryLevelState,
  saveMercenaryLevelPolicy, attachReleasedMercenaryLevels,
} from '../functions/_mercenary_level_policy.js';
import {runPreparedMercenaryLevel, mercenaryLevelReceipt, handleMercenaryLevel} from '../functions/_mercenary_level.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';

// Small deterministic transaction fixture, never a proposed production balance.
function policy() {
  const p = mercenaryLevelDraft();
  p.mode = 'ON';
  p.revision = 7;
  p.xpPerCard = Object.fromEntries(Object.keys(p.xpPerCard).map(rank => [rank, 100]));
  p.levels.forEach(row => row.requiredXp = 300);
  p.milestones.forEach(row => row.successChancePpm = 500000);
  p.growth = mercenaryGrowthDraft();
  Object.assign(p.growth.perLevel, {hpPercent:2, attackPercent:3, defensePercent:1, speedPercent:.25});
  p.growth.milestones.forEach(row => Object.assign(row, {
    hpPercent:10, attackPercent:15, defensePercent:4, speedPercent:.5,
    skillPowerPercent:2.5, mitigationBypassPercent:5, actionCatchupPercent:2, actionCreditPercent:1,
  }));
  return p;
}
const cards = [
  {code:'V-049', name:'크라이베른', rank:'SSS'},
  {code:'V-055', name:'베르칸', rank:'SSS'},
  {code:'V-996', name:'발테르', rank:'SSS'},
];
const zero = () => ({hpPercent:0, attackPercent:0, defensePercent:0, speedPercent:0, skillPowerPercent:0, mitigationBypassPercent:0, actionCatchupPercent:0, actionCreditPercent:0});
const body = (overrides = {}) => ({requestId:crypto.randomUUID(), mercenaryCode:'V-049', revision:0, materials:[{code:'V-049', quantity:1}], ...overrides});
const inventory = async f => (await f.p('SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=7 ORDER BY mercenary_code').all()).results;
async function setState(f, code, state) {
  await f.p('INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,experience,breakthrough_mask,revision,updated_at) VALUES(7,?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET level=excluded.level,experience=excluded.experience,breakthrough_mask=excluded.breakthrough_mask,revision=excluded.revision,updated_at=excluded.updated_at', code, state.level, state.experience, state.breakthroughMask, state.revision, '2026-10-15').run();
}
async function fixture(t, postgres, supplied = policy()) {
  const f = await mercenaryFixture(t, {postgres});
  await ensureMercenaryLevelSchema(f.env);
  for (const row of f.document.mercenaries) if (cards.some(c => c.code === row.code)) row.rank = 'SSS';
  await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'", JSON.stringify(f.document)).run();
  for (const c of cards) await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,31,30,?,?)', c.code, '2026-10-15', '2026-10-15').run();
  await f.setting(MERCENARY_LEVEL_KEY, supplied);
  return {...f, growthPolicy:supplied};
}
function assertFrozenGrowth(receipt, p) {
  assert.equal(receipt.version, 'mercenary-level-20261015-v2');
  assert.equal(receipt.result.growth.version, MERCENARY_GROWTH_VERSION);
  assert.equal(receipt.result.growth.policyRevision, p.revision);
  assert.deepEqual(receipt.result.growth.before, mercenaryGrowthSummary(p.growth, receipt.result.before));
  assert.deepEqual(receipt.result.growth.after, mercenaryGrowthSummary(p.growth, receipt.result.after));
}

for (const postgres of [false, true]) {
  const label = postgres ? 'PostgreSQL' : 'SQLite';
  test(`${label}: V2 training freezes exact stat changes with same-card 3x and limited required XP 5x`, async t => {
    const f = await fixture(t, postgres), p = f.growthPolicy, coin = await f.coin();
    assert.equal(mercenaryLevelReadiness(p, {requireGrowth:true}).ready, true);
    const ordinary = await runPreparedMercenaryLevel(f.env, f.user, body(), 'TRAIN');
    assertFrozenGrowth(ordinary, p);
    assert.deepEqual(ordinary.result.growth.before.total, zero());
    assert.deepEqual(ordinary.result.growth.after.total, {...zero(), hpPercent:2, attackPercent:3, defensePercent:1, speedPercent:.25});
    assert.deepEqual(ordinary.result.after, {level:2, experience:0, breakthroughMask:0, revision:1});
    assert.equal(ordinary.result.xp, 300);
    assert.equal(ordinary.result.requiredXpMultiplier, 1);
    const other = await runPreparedMercenaryLevel(f.env, f.user, body({revision:1, materials:[{code:'V-055', quantity:1}]}), 'TRAIN');
    assert.equal(other.result.xp, 100);
    assert.equal(other.result.after.experience, 100);
    assert.deepEqual(other.result.growth.before, other.result.growth.after);
    const limited = await runPreparedMercenaryLevel(f.env, f.user, body({mercenaryCode:'V-996', materials:[{code:'V-996', quantity:1}]}), 'TRAIN');
    assertFrozenGrowth(limited, p);
    assert.equal(limited.result.xp, 300);
    assert.equal(limited.result.requiredXpMultiplier, 5);
    assert.deepEqual(limited.result.after, {level:1, experience:300, breakthroughMask:0, revision:1});
    assert.equal(mercenaryLevelRequiredXp(p, 1, cards[2]), 1500);
    assert.equal(mercenaryLevelRequiredXp(p, 1, cards[0]), 300);
    assert.deepEqual(limited.result.growth.after.total, zero());
    assert.ok((await inventory(f)).every(row => Number(row.total_copies) === 30 && Number(row.duplicate_count) === 29));
    assert.equal(await f.coin(), coin);
  });

  test(`${label}: every V2 breakthrough preserves earned stats on failure and grants the exact success delta once`, async t => {
    const f = await fixture(t, postgres), p = f.growthPolicy, beforeInventory = await inventory(f);
    for (const [i, level] of [5,10,15,20].entries()) for (const success of [false, true]) {
      const state = {level, experience:300, breakthroughMask:(1 << i) - 1, revision:i * 2 + Number(success)};
      await setState(f, 'V-049', state);
      const request = body({revision:state.revision});
      const r = await runPreparedMercenaryLevel(f.env, f.user, request, 'BREAKTHROUGH', {randomInt:() => success ? 499999 : 500000});
      assertFrozenGrowth(r, p);
      assert.equal(r.result.success, success);
      assert.equal(r.result.after.experience, 0);
      assert.equal(r.result.after.level, success ? Math.min(21, level + 1) : level);
      assert.equal(r.result.after.breakthroughMask, success ? (1 << (i + 1)) - 1 : state.breakthroughMask);
      assert.equal(r.result.complete, success && level === 20);
      if (!success) {
        assert.deepEqual(r.result.growth.after, r.result.growth.before);
        assert.equal(r.result.reward, null);
      } else {
        const after = r.result.growth.after.total, before = r.result.growth.before.total;
        assert.equal(after.hpPercent - before.hpPercent, 12);
        assert.equal(after.attackPercent - before.attackPercent, 18);
        assert.equal(after.defensePercent - before.defensePercent, 5);
        assert.equal(after.speedPercent - before.speedPercent, .75);
        assert.equal(after.skillPowerPercent - before.skillPowerPercent, 2.5);
        assert.equal(after.mitigationBypassPercent - before.mitigationBypassPercent, 5);
        assert.equal(after.actionCatchupPercent - before.actionCatchupPercent, 2);
        assert.equal(after.actionCreditPercent - before.actionCreditPercent, 1);
      }
      const replay = await runPreparedMercenaryLevel(f.env, f.user, request, 'BREAKTHROUGH', {randomInt:() => assert.fail('a completed breakthrough must never reroll')});
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.result, r.result);
      assert.deepEqual(await readMercenaryLevelState(f.env, 7, 'V-049'), r.result.after);
    }
    assert.deepEqual(await inventory(f), beforeInventory);
  });

  test(`${label}: committed V2 growth summaries survive policy replacement, OFF and receipt recovery`, async t => {
    const f = await fixture(t, postgres), p = f.growthPolicy, trainRequest = body();
    const training = await runPreparedMercenaryLevel(f.env, f.user, trainRequest, 'TRAIN');
    await setState(f, 'V-049', {level:5, experience:300, breakthroughMask:0, revision:2});
    const breakRequest = body({revision:2});
    const breakthrough = await runPreparedMercenaryLevel(f.env, f.user, breakRequest, 'BREAKTHROUGH', {randomInt:() => 0});
    const inventoryAfter = await inventory(f), changed = structuredClone(p);
    changed.revision++;
    changed.mode = 'OFF';
    changed.growth.perLevel.hpPercent = 4;
    changed.growth.milestones[0].attackPercent = 30;
    await f.setting(MERCENARY_LEVEL_KEY, changed);
    for (const [action, request, original] of [['TRAIN', trainRequest, training], ['BREAKTHROUGH', breakRequest, breakthrough]]) {
      const replay = await runPreparedMercenaryLevel(f.env, f.user, request, action, {randomInt:() => assert.fail('recovery must use the saved outcome')});
      const receipt = await mercenaryLevelReceipt(f.env, f.user, request.requestId);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.result, original.result);
      assert.deepEqual(receipt.result, original.result);
      assertFrozenGrowth(receipt, p);
      assert.notDeepEqual(receipt.result.growth.after, mercenaryGrowthSummary(changed.growth, receipt.result.after));
    }
    assert.deepEqual(await inventory(f), inventoryAfter);
    await assert.rejects(() => mercenaryLevelReceipt(f.env, {id:8}, trainRequest.requestId), {code:'JOINT_NOT_FOUND'});
  });

  test(`${label}: partially configured growth can be saved OFF but cannot consume cards or grow`, async t => {
    const f = await fixture(t, postgres), partial = structuredClone(f.growthPolicy);
    partial.mode = 'OFF';
    partial.growth.milestones[1].attackPercent = null;
    partial.growth.perLevel.speedPercent = null;
    assert.doesNotThrow(() => validateMercenaryLevelPolicy(partial));
    assert.equal(mercenaryLevelReadiness(partial, {requireGrowth:true}).ready, false);
    const saved = await saveMercenaryLevelPolicy(f.env, f.user, partial);
    assert.equal(saved.revision, partial.revision + 1);
    assert.equal(saved.mode, 'OFF');
    assert.equal(saved.growth.perLevel.speedPercent, null);
    assert.equal(saved.growth.milestones[1].attackPercent, null);
    const before = await inventory(f);
    await assert.rejects(() => runPreparedMercenaryLevel(f.env, f.user, body(), 'TRAIN'), {code:'MERCENARY_LEVEL_CLOSED'});
    // Isolated direct settings write proves incomplete data is rejected even if
    // a stale/manual ON policy bypasses the public release and CMS gates.
    await f.setting(MERCENARY_LEVEL_KEY, {...saved, mode:'ON'});
    await assert.rejects(() => runPreparedMercenaryLevel(f.env, f.user, body(), 'TRAIN'), {code:'MERCENARY_LEVEL_UNCONFIGURED'});
    assert.deepEqual(await inventory(f), before);
    assert.deepEqual(await readMercenaryLevelState(f.env, 7, 'V-049'), initialMercenaryLevel());
    await assert.rejects(() => saveMercenaryLevelPolicy(f.env, f.user, {...saved, mode:'ON'}), {code:'MERCENARY_LEVEL_PREPARATION'});
  });
}

test('both previous OFF policy versions adapt in memory without writing or filling a growth profile', async () => {
  for (const version of ['mercenary-level-20261005', 'mercenary-level-20261014']) {
    const old = {...policy(), version, mode:'OFF'};
    delete old.growth;
    if (version === 'mercenary-level-20261005') old.sameCardMultiplier = null;
    const raw = JSON.stringify(old);
    let reads = 0;
    const env = {DB:{prepare(sql) {
      assert.equal(sql, 'SELECT value FROM app_meta WHERE key=?');
      return {bind(key) {assert.equal(key, MERCENARY_LEVEL_KEY);return {first:async () => {reads++;return {value:raw};}};}};
    }}};
    const actual = await readMercenaryLevelPolicy(env);
    assert.equal(reads, 1);
    assert.equal(actual.raw, raw);
    assert.equal(actual.policy.version, MERCENARY_LEVEL_RULES.version);
    assert.equal(actual.policy.growth, null);
    assert.equal(actual.policy.sameCardMultiplier, 3);
    assert.equal(actual.policy.revision, old.revision);
    assert.equal(actual.policy.mode, 'OFF');
    assert.deepEqual(actual.policy.levels, old.levels);
    assert.equal(mercenaryLevelReadiness(actual.policy, {requireGrowth:true}).ready, false);
  }
});

test('released leveling mutations and preview require authentication before database access', async () => {
  assert.equal(MERCENARY_LEVEL_RELEASE_ENABLED, true);
  assert.equal(MERCENARY_LEVEL_RULES.version, 'mercenary-level-20261015-v2');
  let touched = 0;
  const env = {DB:new Proxy({}, {get() {touched++;throw Error('release OFF must not access DB');}})};
  const deps = {json:(data, status = 200) => ({data, status}), authenticate:async () => null};
  for (const action of ['train','breakthrough','preview']) {
    const path = 'mercenaries/v3/leveling/' + action;
    const request = new Request('https://qa.test/api/' + path, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body())});
    const response = await handleMercenaryLevel({path, request, env, deps});
    assert.equal(response.status, 401);
    assert.equal(response.data.code, 'MERCENARY_LEVEL_AUTH');
  }
  const path = 'mercenaries/v3/leveling/feature';
  const feature = await handleMercenaryLevel({path, request:new Request('https://qa.test/api/' + path), env, deps});
  assert.equal(feature.data.releaseEnabled, true);
  assert.equal(touched, 0);
});
