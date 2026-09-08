import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import {
  defaultCoreRaidSettings, cleanCoreRaidSettings, buildCoreRaidBattlePayload, coreRaidContribution, evaluateCoreRaidQte,
  handleRaidCoreProtocol
} from '../functions/_raid_core_protocol.js';
import { createPveBattleV2 } from '../functions/_battle_v2_preview.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
// Synthetic fixtures, not live account data or production balance defaults.
const configured = extra => ({ ...defaultCoreRaidSettings(), coreCombatPower: 500000, bossCombatPower: 750000, ...extra });
const deck = power => ['ATTACK', 'DEFENSE', 'SPEED', 'HP', 'ATTACK'].map((power_type, i) => ({
  id: 'FIXED-TEST-' + i, title: '테스트 ' + i, grade: 'FUR', power_type, power: power / 5,
  image: '/test-card-' + i + '.png', battleSprite: '/test-sd-' + i + '.png'
}));
const participant = (power, stage = 'CORE', extra = {}) => ({
  room_id: 'FIXED-TEST', attempt_id: 'TRY-1', user_id: 1, stage, operation: 'BREAK', total_power: power,
  deck_snapshot: JSON.stringify({ cards: deck(power), power, cardPower: power, characterBonus: { pve: 0 } }), ...extra
});
const engineStub = (input, winner = 'A') => ({
  teams: { A: { cards: input.cards }, B: { cards: [{ id: 'B:0', hp: 100, maxHp: 100 }] } },
  result: { winner, timeline: [{ type: 'RESULT', winner }] }
});
const traces = challenge => ({
  sequence: { inputs: challenge.sequence.map((key, i) => ({ key, at: 250 + i * 300 })) },
  mash: { presses: Array.from({ length: challenge.mashTarget }, (_, i) => 200 + i * 60) }
});

function harness(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,coin INTEGER DEFAULT 0,card_shards INTEGER DEFAULT 0);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE coin_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
    CREATE TABLE shard_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
    INSERT INTO users(id,nickname,role) VALUES(1,'고정전투력 테스트','OWNER');
    INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,'CORE_RAID_ENTRY_TICKET',3,3);
  `);
  class Statement {
    constructor(sql, params = []) { this.sql = sql; this.params = params; }
    bind(...params) { return new Statement(this.sql, params); }
    first() { return db.prepare(this.sql).get(...this.params) || null; }
    all() { return { results: db.prepare(this.sql).all(...this.params) }; }
    run() { return { success: true, meta: { changes: Number(db.prepare(this.sql).run(...this.params).changes) } }; }
  }
  const env = { DB: {
    prepare: sql => new Statement(sql),
    batch(statements) {
      db.exec('BEGIN');
      try { const results = statements.map(statement => statement.run()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  } };
  const state = { user: { id: 1, nickname: '고정전투력 테스트', role: 'OWNER' }, power: 250000, winner: 'A', engineInputs: [], deckReads: 0 };
  const deps = {
    authenticate: async () => state.user,
    readBody: request => request.json(),
    json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    raidDeckPower: async () => {
      state.deckReads++;
      return { ids: deck(state.power).map(card => card.id), cards: deck(state.power), power: state.power, basePower: state.power, cardPower: state.power, characterBonus: { pve: 0 } };
    },
    createPveBattleV2: input => { state.engineInputs.push(input); return engineStub(input, state.winner); },
    profile: async (_env, user) => user,
    writeAdminLog: async () => {}
  };
  const call = async (path, method = 'GET', body) => {
    const request = new Request('https://test.invalid/api/' + path, {
      method, ...(method !== 'GET' ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {})
    });
    const response = await handleRaidCoreProtocol({ path: path.split('?')[0], request, env, deps });
    return { status: response.status, body: await response.json() };
  };
  const save = settings => call('admin/raid/core/settings', 'POST', settings);
  const room = async () => {
    assert.equal((await save(configured())).status, 200);
    const opened = await call('raid/core/open', 'POST', { requestId: 'OPEN' });
    assert.equal(opened.status, 200);
    const id = opened.body.current.id;
    assert.equal((await call('raid/core/start', 'POST', { roomId: id })).status, 200);
    return id;
  };
  const begin = id => call('raid/core/battle', 'POST', { roomId: id, operation: 'BREAK' });
  const resolve = (id, battle, requestId = 'RESOLVE') => call('raid/core/resolve', 'POST', {
    roomId: id, attemptId: battle.attemptId, requestId, results: traces(battle.challenge)
  });
  return { db, state, call, save, room, begin, resolve };
}

test('fixed power is deliberately unconfigured by default; legacy percentages cannot configure it', () => {
  for (const settings of [defaultCoreRaidSettings(), cleanCoreRaidSettings({ coreCombatPowerPercent: 55, bossCombatPowerPercent: 80 })]) {
    assert.equal(settings.coreCombatPower, 0);
    assert.equal(settings.bossCombatPower, 0);
    assert.equal(settings.mode, 'TEST');
    assert.equal(settings.rewardLocked, true);
    assert.throws(() => buildCoreRaidBattlePayload({ participant: participant(250000), settings }), /고정 전투력이 미설정/);
  }
});

test('all three cores and final boss keep their fixed engine stats regardless of player power or suit', () => {
  const inputs = [];
  const cfg = configured();
  for (const stage of ['CORE', 'BOSS']) for (const operation of ['BREAK', 'BLOCK', 'STABILIZE']) {
    const monsters = [];
    for (const power of [25000, 250000, 1000000, 10000000]) for (const suit of [false, true]) {
      const payload = buildCoreRaidBattlePayload({
        participant: participant(power, stage, { operation, deck_snapshot: JSON.stringify({
          cards: deck(power), power, characterBonus: suit ? {
            pve: power, battleSuitPve: power, equippedBattleSuit: { code: 'TEST-SUIT' }
          } : { pve: 0 }
        }) }),
        settings: cfg,
        createBattle: input => { inputs.push(input); monsters.push(input.monster); return engineStub(input); }
      });
      const expected = stage === 'CORE' ? cfg.coreCombatPower : cfg.bossCombatPower;
      assert.equal(payload.monsterPower, expected);
      assert.equal(payload.monster.battlePower, expected);
      assert.equal(payload.playerPower, power);
    }
    for (const monster of monsters) assert.deepEqual(monster, monsters[0]);
  }
  assert.ok(inputs.some(input => input.battleSuit));
  const cores = inputs.filter(input => input.monster.id.startsWith('CORE_NODE_'));
  assert.ok(cores.length > 0);
  for (const input of cores) assert.equal(input.monster.battle_power, cfg.coreCombatPower);
});

test('real server engine: the same fixed enemy defeats a weak deck and loses to a strong deck', () => {
  for (const stage of ['CORE', 'BOSS']) for (let seed = 1; seed <= 20; seed++) {
    let weakBoss, strongBoss;
    const fight = power => buildCoreRaidBattlePayload({
      participant: participant(power, stage, { attempt_id: 'FIXED-SEED-' + seed }), settings: configured(),
      createBattle: input => {
        const result = createPveBattleV2(input);
        if (power === 25000) weakBoss = result.teams.B.cards[0]; else strongBoss = result.teams.B.cards[0];
        return result;
      }
    });
    assert.equal(fight(25000).coreRaid.serverWinner, 'B');
    assert.equal(fight(10000000).coreRaid.serverWinner, 'A');
    for (const key of ['power', 'maxHp', 'attack', 'defense', 'speed', 'maxShield']) {
      assert.equal(weakBoss[key], strongBoss[key], `${stage}: enemy ${key} must not follow the player`);
    }
  }
});

test('QTE success cannot turn a server combat defeat into a V3 victory or core-break animation', () => {
  for (const stage of ['CORE', 'BOSS']) for (const winner of ['A', 'B']) {
    const payload = buildCoreRaidBattlePayload({
      participant: participant(250000, stage), settings: configured(), createBattle: input => engineStub(input, winner)
    });
    const timeline = payload.battleV2.result.timeline;
    assert.equal(timeline.find(event => event.type === 'RESULT' && event.qteCondition === 'ALL_SUCCESS').winner, winner);
    assert.equal(timeline.find(event => event.type === 'RESULT' && event.qteCondition === 'ANY_FAILURE').winner, 'B');
    assert.equal(timeline.some(event => ['RAID_CORE_BREAK', 'RAID_STAGGER'].includes(event.type)), winner === 'A');
    assert.equal(timeline.filter(event => event.type === 'RAID_PARTY_DAMAGE' && event.qteCondition === 'ALL_SUCCESS').length, winner === 'B' ? 1 : 0);
  }
});

test('CMS roundtrips absolute values; malformed, stale and unauthorized saves never change them', async t => {
  const h = harness(t);
  assert.equal((await h.save(configured({ coreCombatPower: 1234567, bossCombatPower: 2000000000 }))).status, 200);
  const original = (await h.call('admin/raid/core/settings')).body.settings;
  for (const body of [null, [], 'bad', { coreCombatPowerPercent: 200, bossCombatPowerPercent: 300 },
    ...[-1, 55, 999, 1000.5, 2000000001, '500000'].map(value => ({ ...original, coreCombatPower: value })),
    { ...original, bossCombatPower: 80 }, { ...original, bossCombatPower: null }]) {
    assert.equal((await h.save(body)).status, 400, JSON.stringify(body));
    assert.deepEqual((await h.call('admin/raid/core/settings')).body.settings, original);
  }
  const saved = await h.save({ ...original, coreCombatPowerPercent: 300, bossCombatPowerPercent: 300 });
  assert.equal(saved.body.settings.coreCombatPowerPercent, original.coreCombatPowerPercent, 'legacy replay ratio is read-only');
  assert.equal(saved.body.settings.bossCombatPowerPercent, original.bossCombatPowerPercent);
  const status = (await h.call('raid/core/status')).body;
  assert.equal(status.settings.coreCombatPower, 1234567);
  assert.equal(status.settings.bossCombatPower, 2000000000);
  assert.equal(status.settings.combatPowerReady, true);
  assert.equal('coreCombatPowerPercent' in status.settings, false);
  assert.equal('bossCombatPowerPercent' in status.settings, false);
  h.state.user = { ...h.state.user, role: 'USER' };
  assert.equal((await h.save(configured())).status, 403);
  assert.equal((await h.call('admin/raid/core/settings')).status, 403);
});

test('unconfigured power blocks tickets, room starts and fresh attempts before any combat mutation', async t => {
  const h = harness(t);
  for (const fields of [{ coreCombatPower: 0 }, { bossCombatPower: 0 }]) {
    assert.equal((await h.save(configured(fields))).status, 200);
    const open = await h.call('raid/core/open', 'POST', { requestId: 'UNCONFIGURED' });
    assert.equal(open.status, 503);
    assert.match(open.body.error, /미설정/);
    assert.equal(h.db.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=1').get().quantity, 3);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM raid_core_rooms_v2024').get().n, 0);
    assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM raid_core_receipts_v2024').get().n, 0);
  }
  await h.save(configured());
  const open = await h.call('raid/core/open', 'POST', { requestId: 'CONFIGURED' });
  const roomId = open.body.current.id;
  await h.save(configured({ coreCombatPower: 0 }));
  assert.equal((await h.call('raid/core/start', 'POST', { roomId })).status, 503);
  assert.equal(h.db.prepare('SELECT status FROM raid_core_rooms_v2024').get().status, 'LOBBY');
  await h.save(configured());
  await h.call('raid/core/start', 'POST', { roomId });
  await h.save(configured({ bossCombatPower: 0 }));
  assert.equal((await h.begin(roomId)).status, 503);
  assert.equal(h.state.deckReads, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM raid_core_attempts_v2024').get().n, 0);
});

test('resumes retain saved settings, deck and verdict; the next battle uses fresh CMS and current deck', async t => {
  const h = harness(t), roomId = await h.room();
  h.state.winner = 'B';
  const first = (await h.begin(roomId)).body;
  const originalInput = h.state.engineInputs.at(-1);
  const snapshot = JSON.parse(h.db.prepare('SELECT deck_snapshot FROM raid_core_attempts_v2024').get().deck_snapshot);
  assert.equal(snapshot.coreRaidCombatSettings.coreCombatPower, 500000);
  h.state.power = 10000000;
  h.state.winner = 'A'; // Even an engine change must not replace the persisted verdict.
  await h.save(configured({ coreCombatPower: 0, bossCombatPower: 0, mechanicFailureDamage: 999, bossAttackPercent: 500, damageScale: 300 }));
  for (const method of ['GET', 'POST']) {
    const replay = await h.call('raid/core/battle' + (method === 'GET' ? '?roomId=' + roomId : ''), method, { roomId });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.attemptId, first.attemptId);
    assert.equal(replay.body.coreRaid.serverWinner, 'B');
    assert.equal(replay.body.coreRaid.partyFailureDamage, 125);
    assert.deepEqual(h.state.engineInputs.at(-1), originalInput);
  }
  assert.equal(h.state.deckReads, 1);
  const resolved = await h.resolve(roomId, first);
  assert.equal(resolved.body.outcome.engineSuccess, false);
  assert.equal(resolved.body.outcome.mechanicSuccess, true);
  assert.equal(resolved.body.outcome.success, false);
  assert.equal(resolved.body.outcome.coreProgress, 0);
  assert.equal(resolved.body.outcome.bossDamage, 0);
  assert.equal(resolved.body.current.partyHp, 875);
  assert.equal((await h.resolve(roomId, first, 'DUPLICATE')).status, 409);
  assert.equal((await h.call('raid/core/status?roomId=' + roomId)).body.current.partyHp, 875);
  await h.save(configured({ coreCombatPower: 900000, bossCombatPower: 1500000 }));
  const next = await h.begin(roomId);
  assert.equal(next.status, 200);
  assert.notEqual(next.body.attemptId, first.attemptId);
  assert.equal(next.body.monsterPower, 900000);
  assert.equal(next.body.playerPower, 10000000);
  assert.equal(h.state.deckReads, 2);
  assert.equal(next.body.coreRaid.serverWinner, 'A');
});

test('legacy compatibility is confined to an already persisted pending attempt', async t => {
  const h = harness(t), roomId = await h.room();
  const first = (await h.begin(roomId)).body;
  const row = h.db.prepare('SELECT * FROM raid_core_attempts_v2024').get();
  const snapshot = JSON.parse(row.deck_snapshot);
  delete snapshot.coreRaidCombatSettings;
  h.db.prepare('UPDATE raid_core_attempts_v2024 SET deck_snapshot=?').run(JSON.stringify(snapshot));
  await h.save(configured({ coreCombatPower: 0, bossCombatPower: 0 }));
  const replay = await h.begin(roomId);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.monsterPower, Math.round(row.total_power * 0.55));
  assert.equal(replay.body.coreRaid.serverWinner, row.server_winner);
  assert.equal((await h.resolve(roomId, first)).status, 200);
  assert.equal((await h.begin(roomId)).status, 503, 'new attempt cannot use the legacy percentage');
  await h.save(configured());
  assert.equal((await h.begin(roomId)).body.monsterPower, 500000);
});

test('final boss resume and successful damage settlement use the original power, QTE and damage scale', async t => {
  const h = harness(t), roomId = await h.room();
  h.db.exec("UPDATE raid_core_rooms_v2024 SET status='BOSS',break_score=core_target,block_score=core_target,stabilize_score=core_target");
  const battle = (await h.begin(roomId)).body;
  assert.equal(battle.stage, 'BOSS');
  assert.equal(battle.monsterPower, 750000);
  const expected = coreRaidContribution({
    cards: deck(250000), totalPower: 250000, operation: 'FINAL', challenge: battle.challenge,
    qte: evaluateCoreRaidQte(battle.challenge, traces(battle.challenge)), settings: configured()
  });
  await h.save(configured({ bossCombatPower: 1999999, damageScale: 5000, sequenceLength: 12, mashTarget: 50 }));
  const replay = (await h.begin(roomId)).body;
  assert.equal(replay.monsterPower, 750000);
  assert.deepEqual(replay.challenge, battle.challenge);
  const resolved = await h.resolve(roomId, battle);
  assert.equal(resolved.body.outcome.success, true);
  assert.equal(resolved.body.outcome.bossDamage, expected.totalDamage);
  assert.equal(resolved.body.current.bossHp, configured().bossMaxHp - expected.totalDamage);
});

function expose(source, expression, globals) {
  const context = vm.createContext(globals);
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.testApi = ' + expression + ';\n})();'), context);
  return context.testApi;
}

test('raid UI shows both absolute values and blocks only new fights when power is unconfigured', () => {
  const view = { innerHTML: '' };
  const api = expose(read('js/core-protocol-raid-v1924.js'), '{roomListMarkup,lobbyActionMarkup,coreActionMarkup,bossActionMarkup,renderState(next){data=next;render();}}', {
    sessionStorage: { getItem() {}, setItem() {} }, MutationObserver: class {}, addEventListener() {},
    document: { getElementById: id => id === 'pveCoreRaidView' ? view : null, querySelectorAll: () => [], addEventListener() {} }
  });
  const state = { settings: configured(), entry: { quantity: 3 }, current: null, operations: [] };
  api.renderState(state);
  assert.match(view.innerHTML, /코어 고정 전투력 500,000/);
  assert.match(view.innerHTML, /최종 보스 고정 전투력 750,000/);
  assert.doesNotMatch(api.roomListMarkup(state), /data-core-action="open"[^>]*disabled/);
  state.settings = defaultCoreRaidSettings();
  api.renderState(state);
  assert.match(view.innerHTML, /고정 전투력 설정 대기/);
  assert.match(api.roomListMarkup(state), /data-core-action="open"[^>]*disabled/);
  state.current = { hostUserId: 1, participantCount: 1, minParticipants: 1, coreScores: {} };
  state.me = { userId: 1 };
  assert.match(api.lobbyActionMarkup(state), /data-core-action="start"[^>]*disabled/);
  assert.match(api.coreActionMarkup(state), /data-core-action="battle"[^>]*disabled/);
  assert.match(api.bossActionMarkup(state), /data-core-action="battle"[^>]*disabled/);
  state.pendingAttempt = { id: 'ALREADY-STARTED' };
  assert.doesNotMatch(api.coreActionMarkup(state), /data-core-action="battle"[^>]*disabled/);
  assert.doesNotMatch(api.bossActionMarkup(state), /data-core-action="battle"[^>]*disabled/);
});

test('CMS renders numeric absolute fields and sends them without percent conversion', async () => {
  const fields = new Map(), requests = [], alerts = [];
  const node = id => {
    if (!fields.has(id)) fields.set(id, { value: '', textContent: '', classList: { add() {}, remove() {} } });
    return fields.get(id);
  };
  const api = expose(read('admin/core-protocol-raid-admin-v2021.js'), '{panelMarkup,render,collect,save}', {
    document: { getElementById: () => ({}), querySelector: node, readyState: 'loading', addEventListener() {} },
    localStorage: { getItem() {} }, sessionStorage: { getItem() {} }, alert: text => alerts.push(text), confirm: () => true,
    fetch: async (_path, options) => { requests.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ settings: requests.at(-1) }) }; }
  });
  api.render(configured());
  assert.match(api.panelMarkup(), /코어 고정 전투력/);
  assert.doesNotMatch(api.panelMarkup(), /전투력 비율/);
  node('#coreRaidFixedCorePower').value = '1234567';
  node('#coreRaidFixedBossPower').value = '7654321';
  await api.save();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].coreCombatPower, 1234567);
  assert.equal(requests[0].bossCombatPower, 7654321);
  assert.equal('coreCombatPowerPercent' in requests[0], false);
  for (const value of ['55', '1234.5', '2000000001', '-1']) {
    node('#coreRaidFixedCorePower').value = value;
    await api.save();
  }
  assert.equal(requests.length, 1, 'invalid values must not reach the server');
  assert.ok(alerts.length >= 5);
});

test('new runtime and nested CMS cache tags are reachable from their actual entry points', () => {
  assert.match(read('index.html'), /core-protocol-raid-v1924\.js\?v=2070-fixed-power/);
  assert.match(read('scripts/verify-production-release.mjs'), /core-protocol-raid-v1924\.js\?v=2070-fixed-power/);
  assert.match(read('admin/index.html'), /raid-overhaul-v1293\.js\?v=2070-fixed-power/);
  assert.match(read('admin/raid-overhaul-v1293.js'), /core-protocol-raid-admin-v2021\.js\?v=2070-fixed-power/);
  assert.match(read('preview/core-protocol-raid-v1/index.html'), /core-protocol-raid-v1924\.js\?v=2070-fixed-power/);
  assert.match(read('preview/core-protocol-raid-v1/preview.js'), /운영 설정 아님/);
});
