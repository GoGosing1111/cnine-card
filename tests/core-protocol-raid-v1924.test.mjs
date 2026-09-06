import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  CORE_RAID_ENTRY_TICKET,
  CORE_RAID_ENTRY_TICKET_IMAGE,
  defaultCoreRaidSettings,
  cleanCoreRaidSettings,
  createCoreRaidChallenge,
  evaluateCoreRaidQte,
  coreRaidContribution,
  coreRaidAttemptOutcome,
  coreRaidBalanceState,
  applyCoreRaidBalanceGate,
  resolveCoreRaidRoomState,
  buildCoreRaidBattlePayload,
  coreRaidFeatureAccess,
  handleRaidCoreProtocol
} from '../functions/_raid_core_protocol.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const cards = [
  { id: 'A1', title: '공격', power_type: 'ATTACK', power: 50000, image: '/a.png', battleSprite: '/a-sd.png' },
  { id: 'D1', title: '방어', power_type: 'DEFENSE', power: 50000, image: '/d.png', battleSprite: '/d-sd.png' },
  { id: 'S1', title: '속도', power_type: 'SPEED', power: 50000, image: '/s.png', battleSprite: '/s-sd.png' },
  { id: 'H1', title: '생명', power_type: 'HP', power: 50000, image: '/h.png', battleSprite: '/h-sd.png' },
  { id: 'A2', title: '공격2', power_type: 'ATTACK', power: 50000, image: '/a2.png', battleSprite: '/a2-sd.png' }
];

test('room expedition defaults stay TEST-only and reward-locked', () => {
  const defaults = defaultCoreRaidSettings();
  assert.equal(defaults.mode, 'TEST');
  assert.equal(defaults.rewardLocked, true);
  assert.equal(defaults.lobbyMinutes, 10);
  assert.equal(defaults.battleMinutes, 30);
  assert.equal(defaults.partyMaxHp, 1000);
  assert.equal(defaults.mechanicFailureDamage, 125);
  assert.equal(defaults.coreBalanceTolerancePercent, 34);
  assert.equal(defaults.coreImbalanceDamage, 100);
  assert.equal(defaults.sequenceLength, 6);
  assert.equal(defaults.mashTarget, 24);
  assert.equal(CORE_RAID_ENTRY_TICKET, 'CORE_RAID_ENTRY_TICKET');
  assert.equal(CORE_RAID_ENTRY_TICKET_IMAGE, 'assets/items/core-raid-entry-ticket-v1.png');
  assert.equal('dailyEntries' in defaults, false, 'the old one-entry cycle must not survive');

  const cleaned = cleanCoreRaidSettings({ minParticipants: 20, maxParticipants: 3, rewardLocked: false });
  assert.equal(cleaned.minParticipants, 20);
  assert.equal(cleaned.maxParticipants, 3);
  assert.equal(cleaned.rewardLocked, false, 'OWNER may explicitly unlock only after review');

  assert.equal(coreRaidFeatureAccess({ id: 1, nickname: '운영자', role: 'OWNER' }, defaults).accessible, true);
  assert.equal(coreRaidFeatureAccess({ id: 2, nickname: '테스터', role: 'USER' }, { ...defaults, testUsers: ['테스터'] }).accessible, true);
  assert.equal(coreRaidFeatureAccess({ id: 3, nickname: '일반유저', role: 'USER' }, defaults).accessible, false);
  assert.equal(coreRaidFeatureAccess({ id: 3, nickname: '일반유저', role: 'USER' }, { ...defaults, mode: 'ON' }).accessible, true);
});

test('triple-core resonance accepts the lowest core but rejects overdriving an advanced core', () => {
  const settings = { ...defaultCoreRaidSettings(), coreRequired: 360 };
  const current = coreRaidBalanceState({ BREAK: 80, BLOCK: 0, STABILIZE: 0 }, 360, settings);
  assert.equal(current.status, 'STABLE');
  assert.deepEqual(current.recommendedOperations, ['BLOCK', 'STABILIZE']);
  assert.deepEqual(current.leadingOperations, ['BREAK']);

  const baseOutcome = {
    success: true,
    engineSuccess: true,
    mechanicSuccess: true,
    stage: 'CORE',
    partyHpDamage: 0,
    coreProgress: 77,
    bossDamage: 0
  };
  const overload = applyCoreRaidBalanceGate({
    room: { coreScores: current.scores, coreTarget: 360 },
    operation: 'BREAK',
    outcome: baseOutcome,
    settings
  });
  assert.equal(overload.success, false);
  assert.equal(overload.balanceSuccess, false);
  assert.equal(overload.failureReason, 'CORE_OVERLOAD');
  assert.equal(overload.attemptedCoreProgress, 77);
  assert.equal(overload.coreProgress, 0);
  assert.equal(overload.partyHpDamage, settings.coreImbalanceDamage);

  const recovery = applyCoreRaidBalanceGate({
    room: { coreScores: current.scores, coreTarget: 360 },
    operation: 'BLOCK',
    outcome: baseOutcome,
    settings
  });
  assert.equal(recovery.success, true);
  assert.equal(recovery.balanceSuccess, true);
  assert.equal(recovery.coreProgress, 77);
  assert.equal(recovery.balance.scores.BLOCK, 77);
});

test('every repeated attempt gets a deterministic but attempt-specific QTE', () => {
  const settings = defaultCoreRaidSettings();
  const first = createCoreRaidChallenge({ roomId: 'ROOM-1', attemptId: 'TRY-1', userId: 7, stage: 'CORE', operation: 'BREAK', cards, settings });
  const replay = createCoreRaidChallenge({ roomId: 'ROOM-1', attemptId: 'TRY-1', userId: 7, stage: 'CORE', operation: 'BREAK', cards, settings });
  const next = createCoreRaidChallenge({ roomId: 'ROOM-1', attemptId: 'TRY-2', userId: 7, stage: 'CORE', operation: 'BREAK', cards, settings });
  assert.deepEqual(first, replay);
  assert.notEqual(first.challengeId, next.challengeId);
  assert.equal(first.sequence.length, settings.sequenceLength);
  assert.equal(first.weaknessCycle.length, 5);
  assert.equal(first.issuedFor.roomId, 'ROOM-1');
  assert.equal(first.issuedFor.attemptId, 'TRY-1');
});

test('server replays direction and mash traces instead of trusting success booleans', () => {
  const challenge = { sequence: ['UP', 'RIGHT', 'DOWN', 'LEFT'], sequenceWindowMs: 5500, mashTarget: 10, mashWindowMs: 5000 };
  const success = evaluateCoreRaidQte(challenge, {
    sequence: { inputs: challenge.sequence.map((key, index) => ({ key, at: 300 + index * 400 })) },
    mash: { presses: Array.from({ length: 10 }, (_, index) => 200 + index * 90) }
  });
  assert.equal(success.allSuccess, true);
  assert.equal(success.suppressionScore, 120);

  const forged = evaluateCoreRaidQte(challenge, {
    sequence: { success: true, inputs: [{ key: 'LEFT', at: 100 }] },
    mash: { success: true, presses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
  });
  assert.equal(forged.allSuccess, false);
  assert.equal(forged.sequence.success, false);
  assert.equal(forged.mash.success, false, 'impossibly dense presses must be filtered');
});

test('a successful attempt advances one core or the boss; a failure damages shared party HP', () => {
  const settings = defaultCoreRaidSettings();
  const challenge = { weaknessCycle: ['ATTACK', 'DEFENSE', 'SPEED', 'HP', 'ATTACK'] };
  const qte = { allSuccess: true, suppressionScore: 110, perfectCount: 1 };
  const contribution = coreRaidContribution({ cards, totalPower: 250000, operation: 'BREAK', challenge, qte, settings });
  assert.equal(contribution.analysisScore, 100);
  assert.equal(contribution.coreScore, 70);
  assert.equal(contribution.coreProgress, 77);
  assert.ok(contribution.totalDamage > 0);

  const coreWin = coreRaidAttemptOutcome({ serverWinner: 'A', qte, contribution, stage: 'CORE', settings });
  assert.equal(coreWin.success, true);
  assert.equal(coreWin.coreProgress, contribution.coreProgress);
  assert.equal(coreWin.bossDamage, 0);
  assert.equal(coreWin.partyHpDamage, 0);

  const bossWin = coreRaidAttemptOutcome({ serverWinner: 'A', qte, contribution, stage: 'BOSS', settings });
  assert.equal(bossWin.success, true);
  assert.equal(bossWin.coreProgress, 0);
  assert.equal(bossWin.bossDamage, contribution.totalDamage);

  for (const failed of [
    coreRaidAttemptOutcome({ serverWinner: 'B', qte, contribution, stage: 'CORE', settings }),
    coreRaidAttemptOutcome({ serverWinner: 'A', qte: { ...qte, allSuccess: false }, contribution, stage: 'CORE', settings })
  ]) {
    assert.equal(failed.success, false);
    assert.equal(failed.coreProgress, 0);
    assert.equal(failed.bossDamage, 0);
    assert.equal(failed.partyHpDamage, settings.mechanicFailureDamage);
  }
});

test('room state requires all three cores before boss and respects time/party wipe', () => {
  const settings = { ...defaultCoreRaidSettings(), coreRequired: 100, bossMaxHp: 1000000 };
  const now = Date.parse('2026-09-05T00:00:00.000Z');
  const future = '2026-09-05T00:30:00.000Z';
  const base = {
    status: 'CORE',
    party_hp: 1000,
    party_max_hp: 1000,
    break_score: 100,
    block_score: 100,
    stabilize_score: 99,
    core_target: 100,
    boss_hp: 1000000,
    boss_max_hp: 1000000,
    ends_at: future
  };
  const almostReady = resolveCoreRaidRoomState(base, settings, now);
  assert.equal(almostReady.status, 'CORE');
  assert.equal(almostReady.coreBalance.balanced, true);
  assert.deepEqual(almostReady.coreBalance.recommendedOperations, ['STABILIZE']);
  const boss = resolveCoreRaidRoomState({ ...base, stabilize_score: 100 }, settings, now);
  assert.equal(boss.status, 'BOSS');
  assert.equal(boss.coresReady, true);
  assert.equal(boss.coreBalance.status, 'SYNCHRONIZED');
  assert.equal(resolveCoreRaidRoomState({ ...base, status: 'BOSS', boss_hp: 0 }, settings, now).status, 'CLEAR');
  const wiped = resolveCoreRaidRoomState({ ...base, party_hp: 0 }, settings, now);
  assert.equal(wiped.status, 'FAILED');
  assert.equal(wiped.failureReason, 'PARTY_WIPE');
  const timedOut = resolveCoreRaidRoomState({ ...base, ends_at: '2026-09-04T23:59:59.000Z' }, settings, now);
  assert.equal(timedOut.status, 'FAILED');
  assert.equal(timedOut.failureReason, 'TIME_LIMIT');
  const lobbyExpired = resolveCoreRaidRoomState({ status: 'LOBBY', lobby_ends_at: '2026-09-04T23:59:59.000Z' }, settings, now);
  assert.equal(lobbyExpired.status, 'FAILED');
  assert.equal(lobbyExpired.failureReason, 'LOBBY_EXPIRED');
});

test('V3 payload uses apocalypse tuning, ultimate, both QTEs and failure party damage', () => {
  const settings = defaultCoreRaidSettings();
  const challenge = createCoreRaidChallenge({ roomId: 'ROOM-2', attemptId: 'TRY-9', userId: 9, cards, settings });
  let engineInput;
  const createBattle = input => {
    engineInput = input;
    return {
      engine: 'BATTLE_ENGINE_V2',
      teams: {
        A: { cards: input.cards.map(card => ({ ...card, cardId: card.id })) },
        B: { cards: [{ id: 'B:0', cardId: 'MONSTER:CORE', name: input.monster.name, image: input.monster.image, maxHp: 100, hp: 100 }] }
      },
      result: { winner: 'A', timeline: [{ type: 'TURN', actorId: 'A1', targetId: 'B:0', damage: 10, targetHpAfter: 90 }, { type: 'RESULT', winner: 'A' }] }
    };
  };
  const payload = buildCoreRaidBattlePayload({
    participant: {
      room_id: 'ROOM-2', attempt_id: 'TRY-9', user_id: 9, stage: 'CORE', operation: 'STABILIZE', total_power: 250000,
      deck_snapshot: JSON.stringify({ cards, power: 250000, cardPower: 250000, characterBonus: { pve: 0 } }),
      challenge_json: JSON.stringify(challenge)
    },
    settings,
    createBattle
  });
  const types = payload.battleV2.result.timeline.map(event => event.type);
  assert.equal(engineInput.monster.pve_difficulty, 'APOCALYPSE');
  assert.equal(engineInput.monster.battle_power, Math.round(250000 * settings.coreCombatPowerPercent / 100));
  assert.equal(engineInput.bossUltimatePercent, settings.bossUltimatePercent);
  assert.equal(payload.battleV2.result.winner, 'PENDING');
  assert.equal(payload.coreRaid.serverWinner, 'A');
  for (const type of ['TURN', 'RAID_PHASE_CHANGE', 'RAID_WEAKNESS_REVEAL', 'RAID_QTE_SEQUENCE', 'RAID_QTE_MASH', 'RAID_CORE_BREAK', 'BOSS_ULTIMATE', 'RAID_PARTY_DAMAGE']) {
    assert.ok(types.includes(type), `${type} missing`);
  }
  assert.ok(payload.battleV2.result.timeline.some(event => event.type === 'BOSS_ULTIMATE' && event.qteCondition === 'ANY_FAILURE'));
  assert.ok(payload.battleV2.result.timeline.some(event => event.type === 'RAID_PARTY_DAMAGE' && event.damage === settings.mechanicFailureDamage));
});

test('core payload preserves live V3 source art and keeps battle sprites separate', () => {
  const sourceCard = { ...cards[0], image: '/assets/cards/source-card.webp', image_url: '/assets/cards/stale.webp', battleSprite: '/assets/ui/project-v/characters/card-sd-v1.png', battle_sprite: '/assets/ui/project-v/characters/stale-sd.png' };
  const challenge = { challengeId: 'CORE-PRESENTATION', weaknessCycle: ['ATTACK'], sequence: ['UP'], sequenceWindowMs: 5500, mashTarget: 10, mashWindowMs: 5000 };
  const payload = buildCoreRaidBattlePayload({ participant: { room_id: 'ROOM', attempt_id: 'TRY', deck_snapshot: JSON.stringify([sourceCard]), challenge_json: JSON.stringify(challenge), operation: 'BREAK', total_power: 50000 } });
  const normalized = payload.battleV2.teams.A.cards[0];
  assert.equal(normalized.image, '/assets/cards/source-card.webp');
  assert.equal(normalized.image_url, '/assets/cards/source-card.webp');
  assert.equal(normalized.battleSprite, '/assets/ui/project-v/characters/card-sd-v1.png');
  assert.equal(normalized.battle_sprite, '/assets/ui/project-v/characters/card-sd-v1.png');
  assert.deepEqual(payload.presentation, {
    owner: 'PROJECT_V_V3_LIVE',
    characterRenderer: 'PROJECT_V_PIXI_V3',
    rosterRenderer: 'LIVE_V3_ROSTER',
    cardFrameRenderer: 'LIVE_CARD_FRAME',
    preserveCardSourceArt: true
  });
  const noSourceArt = buildCoreRaidBattlePayload({ participant: { room_id: 'ROOM', attempt_id: 'TRY', deck_snapshot: JSON.stringify([{ ...sourceCard, image: '', image_url: '' }]), challenge_json: JSON.stringify(challenge), operation: 'BREAK', total_power: 50000 } }).battleV2.teams.A.cards[0];
  assert.equal(noSourceArt.image, '', 'SD must never be promoted into roster/card artwork');
});

test('server implements ticketed rooms, repeat attempts and terminal reward receipts', () => {
  const server = read('functions/_raid_core_protocol.js');
  for (const table of ['raid_core_rooms_v2024', 'raid_core_members_v2024', 'raid_core_active_members_v2024', 'raid_core_attempts_v2024', 'raid_core_receipts_v2024', 'raid_core_reward_receipts_v2024']) {
    assert.match(server, new RegExp(table));
  }
  for (const route of ['raid/core/status', 'raid/core/open', 'raid/core/join', 'raid/core/start', 'raid/core/battle', 'raid/core/resolve', 'raid/core/claim']) {
    assert.match(server, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(server, /CORE_RAID_ENTRY_TICKET/);
  assert.match(server, /quantity=quantity-1/);
  assert.match(server, /deps\.raidDeckPower\(env, user\.id, body\.cardIds, 'RAID'\)/);
  assert.match(server, /\{ raidDeckPower, createPveBattleV2 \}/);
  assert.match(server, /status IN \('CORE','BOSS'\)/);
  assert.match(server, /party_hp=CASE WHEN party_hp-\?/);
  assert.match(server, /break_score=CASE WHEN break_score\+\?/);
  assert.match(server, /boss_hp=CASE WHEN boss_hp-\?/);
  assert.doesNotMatch(server, /pveDeckSnapshot/);
  assert.doesNotMatch(server, /dailyEntries/);
  assert.doesNotMatch(server, /cycleIdentity/);
});

test('SQLite route flow consumes one host ticket, repeats attempts, damages party HP and clears after all cores', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,coin INTEGER DEFAULT 0,card_shards INTEGER DEFAULT 0);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE coin_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
    CREATE TABLE shard_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
    INSERT INTO users(id,nickname,role) VALUES(1,'공대장','OWNER'),(2,'공대원','USER');
    INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,'CORE_RAID_ENTRY_TICKET',1,1);
  `);
  const run = (sql, params = []) => {
    const result = sqlite.prepare(sql).run(...params);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  };
  class D1Statement {
    constructor(sql, params = []) { this.sql = sql; this.params = params; }
    bind(...params) { return new D1Statement(this.sql, params); }
    first() { return sqlite.prepare(this.sql).get(...this.params) || null; }
    all() { return { results: sqlite.prepare(this.sql).all(...this.params) }; }
    run() { return run(this.sql, this.params); }
  }
  const env = {
    DB: {
      prepare(sql) { return new D1Statement(sql); },
      batch(statements) {
        sqlite.exec('BEGIN');
        try {
          const results = statements.map(statement => statement.run());
          sqlite.exec('COMMIT');
          return results;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      }
    }
  };
  let activeUser = { id: 1, nickname: '공대장', role: 'OWNER' };
  const deps = {
    authenticate: async () => activeUser,
    readBody: request => request.json(),
    json: (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }),
    raidDeckPower: async () => ({ ids: cards.map(card => card.id), cards, power: 250000, basePower: 250000, cardPower: 250000, characterBonus: { pve: 0 }, synergy: {} }),
    createPveBattleV2: ({ cards: battleCards, monster }) => ({
      engine: 'BATTLE_ENGINE_V2',
      teams: { A: { cards: battleCards }, B: { cards: [{ id: 'B:0', cardId: 'MONSTER:' + monster.id, name: monster.name, image: monster.image, hp: 100, maxHp: 100 }] } },
      result: { winner: 'A', timeline: [{ type: 'TURN', actorId: battleCards[0].id, targetId: 'B:0', damage: 10, targetHpAfter: 90 }, { type: 'RESULT', winner: 'A' }] }
    }),
    profile: async (_env, user) => user,
    writeAdminLog: async () => {}
  };
  const call = async (pathWithQuery, method = 'GET', body = null) => {
    const path = pathWithQuery.split('?')[0];
    const request = new Request('https://example.test/api/' + pathWithQuery, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const response = await handleRaidCoreProtocol({ path, request, env, deps });
    return { status: response.status, body: await response.json() };
  };
  const traces = challenge => ({
    sequence: { inputs: challenge.sequence.map((key, index) => ({ key, at: 250 + index * 300 })) },
    mash: { presses: Array.from({ length: challenge.mashTarget }, (_, index) => 200 + index * 60) }
  });
  const fight = async (roomId, operation, requestSuffix, success = true) => {
    const started = await call('raid/core/battle', 'POST', { roomId, operation });
    assert.equal(started.status, 200);
    const resumed = await call('raid/core/battle?roomId=' + encodeURIComponent(roomId));
    assert.equal(resumed.body.attemptId, started.body.attemptId, 'resume must return the same pending attempt');
    const results = success ? traces(started.body.challenge) : { sequence: { inputs: [] }, mash: { presses: [] } };
    const resolved = await call('raid/core/resolve', 'POST', { roomId, attemptId: started.body.attemptId, requestId: 'RESOLVE-' + requestSuffix, results });
    assert.equal(resolved.status, 200);
    return resolved.body;
  };

  try {
    const configured = await call('admin/raid/core/settings', 'POST', { ...defaultCoreRaidSettings(), coreRequired: 100, bossMaxHp: 1000000, testUsers: ['공대원'] });
    assert.equal(configured.status, 200);
    assert.equal(configured.body.settings.coreBalanceTolerancePercent, 34);
    assert.equal(configured.body.settings.coreImbalanceDamage, 100);
    const opened = await call('raid/core/open', 'POST', { requestId: 'OPEN-1' });
    assert.equal(opened.status, 200);
    assert.equal(opened.body.current.status, 'LOBBY');
    assert.equal(opened.body.entry.quantity, 0);
    assert.equal(opened.body.entry.ticketImage, '/' + CORE_RAID_ENTRY_TICKET_IMAGE);
    const roomId = opened.body.current.id;
    assert.equal(sqlite.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='CORE_RAID_ENTRY_TICKET'").get().quantity, 0);
    assert.equal(
      sqlite.prepare("SELECT image_url FROM inventory_items WHERE code='CORE_RAID_ENTRY_TICKET'").get().image_url,
      CORE_RAID_ENTRY_TICKET_IMAGE
    );

    activeUser = { id: 2, nickname: '공대원', role: 'USER' };
    const joined = await call('raid/core/join', 'POST', { roomId });
    assert.equal(joined.status, 200);
    assert.equal(joined.body.current.participantCount, 2);

    activeUser = { id: 1, nickname: '공대장', role: 'OWNER' };
    const started = await call('raid/core/start', 'POST', { roomId });
    assert.equal(started.status, 200);
    assert.equal(started.body.current.status, 'CORE');

    const failed = await fight(roomId, 'BREAK', 'FAIL', false);
    assert.equal(failed.outcome.success, false);
    assert.equal(failed.current.partyHp, configured.body.settings.partyMaxHp - configured.body.settings.mechanicFailureDamage);
    assert.equal(failed.current.status, 'CORE');
    const duplicate = await call('raid/core/resolve', 'POST', { roomId, attemptId: failed.attemptId, requestId: 'RESOLVE-FAIL-DUPLICATE', results: {} });
    assert.equal(duplicate.status, 409);
    const afterDuplicate = (await call('raid/core/status?roomId=' + encodeURIComponent(roomId))).body;
    assert.equal(afterDuplicate.current.partyHp, failed.current.partyHp, 'a second receipt must not apply party damage twice');

    const firstCore = await fight(roomId, 'BREAK', 'BREAK-1');
    assert.equal(firstCore.outcome.success, true);
    const firstBreakScore = firstCore.current.coreScores.BREAK;
    const overload = await fight(roomId, 'BREAK', 'BREAK-OVERLOAD');
    assert.equal(overload.outcome.success, false);
    assert.equal(overload.outcome.mechanicSuccess, true, 'QTE success remains visible even when resonance fails');
    assert.equal(overload.outcome.balanceSuccess, false);
    assert.equal(overload.outcome.failureReason, 'CORE_OVERLOAD');
    assert.equal(overload.outcome.coreProgress, 0);
    assert.equal(overload.current.coreScores.BREAK, firstBreakScore, 'overloaded progress must be discarded');
    assert.equal(
      overload.current.partyHp,
      failed.current.partyHp - configured.body.settings.coreImbalanceDamage
    );

    for (const [index, operation] of ['BLOCK', 'STABILIZE', 'BLOCK', 'STABILIZE', 'BREAK'].entries()) {
      const resolved = await fight(roomId, operation, operation + '-BALANCE-' + index);
      assert.equal(
        resolved.outcome.success,
        true,
        `${operation} cycle ${index}: ${JSON.stringify({ outcome: resolved.outcome, scores: resolved.current.coreScores })}`
      );
    }
    const bossState = (await call('raid/core/status?roomId=' + encodeURIComponent(roomId))).body;
    assert.equal(bossState.current.status, 'BOSS');
    assert.equal(bossState.current.coresReady, true);

    const cleared = await fight(roomId, 'FINAL', 'BOSS');
    assert.equal(cleared.outcome.success, true);
    assert.equal(cleared.current.status, 'CLEAR');
    const claim = await call('raid/core/claim', 'POST', { roomId, requestId: 'CLAIM-1' });
    assert.equal(claim.status, 423);
    assert.equal(claim.body.code, 'CORE_RAID_REWARD_LOCKED');
  } finally {
    sqlite.close();
  }
});

test('Core UI is a room expedition overlay and delegates the actual fight to live V3', () => {
  const raidUi = read('js/core-protocol-raid-v1924.js');
  const raidCss = read('css/core-protocol-raid-v1924.css');
  const liveV3 = read('js/battle-v3-live.js');
  for (const endpoint of ['raid/core/open', 'raid/core/join', 'raid/core/start', 'raid/core/battle', 'raid/core/resolve']) {
    assert.match(raidUi, new RegExp(endpoint.replaceAll('/', '\\/')));
  }
  assert.match(raidUi, /data-core-action="open"/);
  assert.match(raidUi, /data-core-action="join"/);
  assert.match(raidUi, /data-core-action="start"/);
  assert.match(raidUi, /공대 HP/);
  assert.match(raidUi, /세 코어/);
  assert.match(raidUi, /core-balance-console/);
  assert.match(raidUi, /OVERLOAD RISK/);
  assert.match(raidUi, /CORE_OVERLOAD/);
  assert.match(raidUi, /core-raid-entry-ticket-v1\.png/);
  assert.match(raidUi, /최종 보스/);
  assert.match(raidUi, /playRaidBattleV3Live\s*\(\s*\{[\s\S]*?preserveServerTimeline\s*:\s*true/);
  assert.doesNotMatch(raidUi, /ProjectVBattleV3Live(?:\?\.|\.)createRenderer/);
  assert.match(raidUi, /core-v3-mechanic-result/);
  assert.match(raidCss, /\.core-party-integrity/);
  assert.match(raidCss, /\.core-room-browser/);
  assert.match(raidCss, /\.core-expedition-cores/);
  assert.match(raidCss, /\.core-balance-console/);
  assert.match(raidCss, /\.core-orb-card\.is-risk/);
  assert.match(raidCss, /conic-gradient/);

  const coreOwnedSource = `${raidUi}\n${raidCss}`;
  for (const selector of ['[data-v3-verdict]', '#battleMessage', '.card-frame', '.battle-v3-roster', '.battle-v3-roster-card', '[data-v3-roster', '.battle-character', '.project-v-battle-character', '[data-formation']) {
    assert.equal(coreOwnedSource.includes(selector), false, `Core must not target live V3 selector ${selector}`);
  }
  assert.match(liveV3, /class="zenith-card-frame"[^>]+zenith-frame-concept-v2\.png/);
  assert.match(liveV3, /class="superstar-card-frame"[^>]+superstar-championship-frame-v1\.webp/);
});

test('preview exercises room browse, repeated battle resume and the live art adapter chain', () => {
  const previewIndex = read('preview/core-protocol-raid-v1/index.html');
  const preview = read('preview/core-protocol-raid-v1/preview.js');
  for (const adapter of ['project-v-battle-art-adapter-v1.js', 'project-v-tier-battle-art-adapter-v1.js', 'project-v-monster-battle-art-adapter-v1.js', 'project-v-unassigned-battle-fallback-v1.js']) {
    assert.match(previewIndex, new RegExp(adapter.replaceAll('.', '\\.')));
  }
  for (const style of ['card.css', 'battle-v3-live.css', 'zenith-v1.css', 'superstar-v1.css', 'faker-card-v1.css', 'no-light-beams-v1789.css', 'breakthrough-tier-v1802.css']) {
    assert.match(previewIndex, new RegExp(style.replaceAll('.', '\\.')));
  }
  assert.match(preview, /cnineCardCatalog\s*=\s*\(\)\s*=>\s*deck/);
  assert.match(preview, /pendingBattle && pendingPayload/);
  assert.match(preview, /path\.includes\('browse=1'\)/);
  assert.match(preview, /state\.current\.coreScores\[currentAttempt\.operation\]/);
  assert.match(preview, /core-raid-entry-ticket-v1\.png/);
  assert.match(preview, /CORE_OVERLOAD/);
  assert.match(preview, /state\.current\.status = 'BOSS'/);
  assert.match(preview, /state\.current\.bossHp/);
  const deckBlock = preview.match(/const deck = \[(.*?)\];/s)?.[1] || '';
  const sampleCards = [...deckBlock.matchAll(/\{[^{}]*\}/g)].map(match => match[0]);
  assert.equal(sampleCards.length, 5);
  for (const card of sampleCards) {
    const sourceArt = card.match(/\bimage\s*:\s*'([^']+)'/)?.[1];
    const battleSprite = card.match(/\bbattleSprite\s*:\s*'([^']+)'/)?.[1];
    assert.ok(sourceArt);
    assert.ok(battleSprite);
    assert.notEqual(sourceArt, battleSprite);
  }
});

test('legacy world raid remains direct while Core ships as a hidden TEST tab', () => {
  const app = read('js/app.js');
  const pve = read('js/pve-command-v2-live.js');
  const api = read('functions/api/[[path]].js');
  const bridge = read('js/battle-v3-live.js');
  const qte = read('js/project-v-raid-qte-v1924.js');
  const index = read('index.html');
  const adminIndex = read('admin/index.html');
  const admin = read('admin/admin-v1276.js');
  const coreAdmin = read('admin/core-protocol-raid-admin-v2021.js');
  assert.match(pve, /id="pveRaidView"/);
  assert.match(pve, /data-raid-content="core"[^>]+aria-hidden="true"[^>]+hidden/);
  assert.match(pve, /id="pveCoreRaidView"/);
  assert.match(app, /if\(mode==='raid'\)[\s\S]{0,500}loadRaidView\(\);/);
  assert.match(app, /CNineCoreRaidBridge/);
  assert.match(api, /handleRaidCoreProtocol/);
  assert.match(api, /CORE_RAID_ENTRY_TICKET/);
  assert.match(bridge, /RAID_QTE_SEQUENCE/);
  assert.match(bridge, /RAID_QTE_MASH/);
  assert.match(bridge, /getInteractiveResults/);
  assert.match(qte, /addEventListener\('keydown'/);
  assert.match(qte, /addEventListener\('pointerdown'/);
  assert.match(qte, /swipeStart/);
  assert.doesNotMatch(qte, /data-qte-dir/);
  assert.match(index, /core-protocol-raid-v1924\.css\?v=2026-core-balance/);
  assert.match(index, /project-v-raid-qte-v1924\.js\?v=2021-sequence-swipe/);
  assert.match(index, /core-protocol-raid-v1924\.js\?v=2048-yhwach/);
  assert.match(adminIndex, /admin-v1276\.js\?v=2050-verified-coin-50eok/);
  assert.match(adminIndex, /raid-overhaul-v1293\.js\?v=2048-yhwach/);
  assert.match(coreAdmin, /coreRaidBalanceTolerance/);
  assert.match(coreAdmin, /coreRaidImbalanceDamage/);
  assert.match(admin, /option\.value='CORE_RAID_ENTRY_TICKET'/);
  assert.match(admin, /selectedUser\.core_raid_tickets/);
  assert.match(api, /AS core_raid_tickets/);
});
