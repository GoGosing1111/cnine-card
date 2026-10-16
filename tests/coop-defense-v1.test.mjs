import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, startRoom, commandRoom, advanceRoom, publicSnapshot, RULES, WORLD, defaultLoadout } from '../preview/coop-defense-v1/source/defense-model.mjs';
import { DefenseRooms } from '../preview/coop-defense-v1/source/room-service.mjs';
import { createReviewServer } from '../scripts/serve-coop-defense-v1.mjs';

function team(capacity = 3, bots = false) {
  const room = createRoom({ id: 'ABC123', capacity, seed: 531 });
  for (let i = 0; i < capacity; i++) {
    joinRoom(room, { id: `p${i}`, name: `대원 ${i}`, bot: bots, loadout: defaultLoadout() });
    commandRoom(room, `p${i}`, { type: 'READY', ready: true });
  }
  startRoom(room, 'p0'); return room;
}
test('each player has exactly two distinct mercenaries and one card; two-player rooms use six actors and two lanes', () => {
  for (const capacity of [2, 3]) {
    const room = team(capacity);
    assert.equal(room.units.length, capacity * 3);
    for (const player of room.players) {
      const units = room.units.filter(u => u.ownerId === player.id);
      assert.equal(units.filter(u => u.role === 'CAPTAIN').length, 1);
      assert.equal(units.filter(u => u.code.startsWith('V-')).length, 2);
    }
    assert.throws(() => commandRoom(room, 'p0', { type: 'MOVE', unitId: 'p0:0', lane: capacity }), /방어선/);
  }
  const room = createRoom({ id: 'LOAD', capacity: 2 });
  assert.throws(() => joinRoom(room, { id: 'bad', name: 'bad', loadout: { card: 'FAKER', mercenaries: ['V-003', 'V-003'] } }), /서로 다른/);
  assert.throws(() => joinRoom(room, { id: 'locked', name: 'bad', loadout: { card: 'FAKER', mercenaries: ['V-980', 'V-003'] } }), /서로 다른/);
  assert.equal(room.players.length, 0);
});
test('only a full ready party can start, only host can start, late joins and repeated starts fail', () => {
  const room = createRoom({ id: 'READY', capacity: 2 });
  joinRoom(room, { id: 'a', name: 'A' });
  assert.throws(() => startRoom(room, 'a'), /준비/);
  joinRoom(room, { id: 'b', name: 'B' });
  commandRoom(room, 'a', { type: 'READY', ready: true });
  assert.throws(() => startRoom(room, 'a'), /준비/);
  commandRoom(room, 'b', { type: 'READY', ready: true });
  assert.throws(() => startRoom(room, 'b'), /방장/);
  startRoom(room, 'a'); assert.throws(() => startRoom(room, 'a'), /이미/);
  assert.throws(() => joinRoom(room, { id: 'c', name: 'C' }), /시작/);
});
test('support movement enforces ownership, travel time, valid lanes and cooldown', () => {
  const room = team(2), unit = room.units.find(u => u.id === 'p0:0');
  assert.throws(() => commandRoom(room, 'p1', { type: 'MOVE', unitId: unit.id, lane: 1 }), /내 유닛/);
  commandRoom(room, 'p0', { type: 'MOVE', unitId: unit.id, lane: 1 });
  assert.equal(unit.lane, 0); assert.ok(unit.move);
  assert.throws(() => commandRoom(room, 'p0', { type: 'MOVE', unitId: unit.id, lane: 1 }), /이동 중/);
  advanceRoom(room, RULES.moveMs - 100); assert.ok(unit.move);
  advanceRoom(room, 100); assert.equal(unit.move, null); assert.equal(unit.lane, 1);
  assert.throws(() => commandRoom(room, 'p0', { type: 'MOVE', unitId: unit.id, lane: 0 }), /충전/);
  advanceRoom(room, RULES.moveCooldownMs); commandRoom(room, 'p0', { type: 'MOVE', unitId: unit.id, lane: 0 });
  for (const capacity of [2, 3]) {
    const shared = team(capacity);
    for (const ally of shared.units.filter(u => u.lane !== 1)) commandRoom(shared, ally.ownerId, { type: 'MOVE', unitId: ally.id, lane: 1 });
    advanceRoom(shared, RULES.moveMs);
    assert.ok(shared.units.every(u => u.lane === 1));
    assert.equal(new Set(shared.units.map(u => `${u.x},${u.y}`)).size, capacity * 3, 'supporters must not share a resident station');
  }
});
test('temporary upgrades spend once and cannot mutate another squad or an active wave', () => {
  const room = team(), owner = room.players[0], otherAttack = room.units.find(u => u.ownerId === 'p1').attack;
  assert.throws(() => commandRoom(room, 'p0', { type: 'UPGRADE' }), /부족/);
  owner.credits = 100; commandRoom(room, 'p0', { type: 'UPGRADE' });
  assert.equal(owner.credits, 0); assert.equal(owner.upgrades, 1);
  assert.equal(room.units.find(u => u.ownerId === 'p1').attack, otherAttack);
  advanceRoom(room, RULES.prepMs); owner.credits = 1000;
  assert.throws(() => commandRoom(room, 'p0', { type: 'UPGRADE' }), /정비/);
});
test('wave rewards are equal temporary resources; knocked-out units return on next preparation', () => {
  const room = team(); advanceRoom(room, RULES.prepMs);
  room.units[0].hp = 0; room.spawnQueue = []; room.enemies = [];
  advanceRoom(room, 100);
  assert.equal(room.phase, 'PREP'); assert.ok(room.units[0].hp > 0);
  assert.deepEqual(room.players.map(p => p.credits), [100, 100, 100]);
  assert.equal(room.rewardsEnabled, false);
});

test('each squad wipe counts once, escalates 15/30/45/60 seconds, and returns home at half HP without resetting cooldowns', () => {
  const room = team(3); advanceRoom(room, RULES.prepMs);
  room.spawnAt = Number.MAX_SAFE_INTEGER;
  const player = room.players[0], squad = room.units.filter(u => u.ownerId === player.id);
  for (const [index, delay] of [15000, 30000, 45000, 60000, 60000].entries()) {
    squad.forEach(u => { u.hp = 0; u.lane = 1; u.x = 700; u.y = 520; u.skillReadyAt = room.time + delay + 5000; u.shieldUntil = room.time + 100000; });
    const skillDeadline = squad[0].skillReadyAt;
    advanceRoom(room, 100);
    assert.equal(player.wipeCount, index + 1); assert.equal(player.reviveDelayMs, delay);
    assert.equal(player.reviveAt - room.time, delay);
    advanceRoom(room, delay - 100);
    assert.ok(squad.every(u => u.hp === 0)); assert.equal(player.wipeCount, index + 1);
    advanceRoom(room, 100);
    assert.equal(player.reviveAt, 0);
    assert.ok(squad.every(u => u.hp === Math.round(u.maxHp * .5) && u.lane === player.lane && u.move === null));
    assert.equal(squad[0].x, WORLD.frontX); assert.equal(squad[0].shieldUntil, 0);
    assert.equal(squad[0].skillReadyAt, skillDeadline);
  }
  assert.equal(room.players[1].wipeCount, 0);
  assert.equal(room.events.filter(e => e.type === 'SQUAD_WIPE').length, 5);
  assert.equal(room.events.filter(e => e.type === 'SQUAD_REVIVE').length, 5);
});

test('wave clear and upgrades cannot bypass a wipe timer; partial casualties retain normal preparation recovery', () => {
  const room = team(2); advanceRoom(room, RULES.prepMs);
  const squad = room.units.filter(u => u.ownerId === 'p0'); squad.forEach(u => { u.hp = 0; });
  const partial = room.units.find(u => u.id === 'p1:0'); partial.hp = 0;
  room.spawnQueue = []; room.enemies = []; advanceRoom(room, 100);
  assert.equal(room.phase, 'PREP'); assert.ok(squad.every(u => u.hp === 0));
  assert.equal(partial.hp, Math.round(partial.maxHp * .7));
  const deadline = room.players[0].reviveAt, credit = room.players[0].credits;
  for (const command of [{ type: 'UPGRADE' }, { type: 'MOVE', unitId: squad[0].id, lane: 1 }, { type: 'SKILL', unitId: squad[0].id }])
    assert.throws(() => commandRoom(room, 'p0', command), /부활 대기/);
  assert.equal(room.players[0].credits, credit); assert.equal(room.players[0].reviveAt, deadline);
  advanceRoom(room, RULES.prepMs);
  assert.equal(room.phase, 'WAVE'); assert.ok(squad.every(u => u.hp === 0));
  assert.equal(room.players[0].reviveAt, deadline);
});

test('reconnection preserves the wipe penalty, while total team wipe keeps combat running until the core is destroyed', () => {
  let now = 1000; const service = new DefenseRooms({ now: () => now });
  const owner = service.create({ name: 'A', capacity: 2, practice: true });
  service.command(owner.token, { requestId: 'ready_001', command: { type: 'READY', ready: true } });
  service.command(owner.token, { requestId: 'start_001', command: { type: 'START' } });
  const room = service.rooms.get(owner.roomId); room.players.forEach(p => { p.bot = false; });
  now += RULES.prepMs; service.tick(); room.spawnAt = Number.MAX_SAFE_INTEGER;
  room.units.forEach(u => { u.hp = 0; }); now += 100; service.tick();
  const deadline = room.players[0].reviveAt;
  assert.equal(room.phase, 'WAVE'); assert.ok(room.players.every(p => p.wipeCount === 1));
  now += 7000; service.tick(); assert.equal(room.players[0].connected, false);
  const recovered = service.snapshot(owner.token).players.find(p => p.id === owner.playerId);
  assert.equal(recovered.reviveAt, deadline); assert.equal(recovered.wipeCount, 1);
  room.coreHp = 18;
  room.enemies.push({ id: 'breach-fixture', type: 'NORMAL', lane: 0, x: WORLD.coreX + 65.1, y: WORLD.coreY, hp: 100, maxHp: 100,
    speed: 100, attack: 1, nextAttack: 0, slowUntil: 0, coreDamage: 18 });
  now += 100; service.tick(); assert.equal(room.phase, 'DEFEAT'); assert.equal(room.coreHp, 0);
  now += 30000; service.tick(); assert.ok(room.units.every(u => u.hp === 0));
  assert.ok(room.players.every(p => p.reviveAt === 0));
});
test('core destruction and final wave stop simulation permanently; snapshot cannot mutate authoritative state', () => {
  for (const win of [true, false]) {
    const room = team(); advanceRoom(room, RULES.prepMs);
    room.wave = 10; room.spawnQueue = []; room.enemies = []; if (!win) room.coreHp = 0;
    advanceRoom(room, 100); assert.equal(room.phase, win ? 'VICTORY' : 'DEFEAT');
    const time = room.time; advanceRoom(room, 60000); assert.equal(room.time, time);
    const snapshot = publicSnapshot(room); snapshot.players[0].credits = 99999;
    assert.notEqual(room.players[0].credits, 99999);
  }
});
test('skills enforce cooldown and server-owned health; no client damage input is trusted', () => {
  const room = team(2); advanceRoom(room, RULES.prepMs + 1000);
  const unit = room.units.find(u => u.id === 'p0:1');
  commandRoom(room, 'p0', { type: 'SKILL', unitId: unit.id, damage: 10000000 });
  assert.ok(unit.skillReadyAt > room.time);
  assert.throws(() => commandRoom(room, 'p0', { type: 'SKILL', unitId: unit.id }), /충전/);
  assert.throws(() => commandRoom(room, 'p1', { type: 'SKILL', unitId: unit.id }), /내 유닛/);
  assert.ok(room.players[0].stats.damage < 10000000);
});
test('server receipts prevent double spending and reject conflicting reuse; reconnection preserves player and units', () => {
  let now = 1000; const service = new DefenseRooms({ now: () => now });
  const a = service.create({ name: 'A', capacity: 2, loadout: defaultLoadout(), practice: true });
  service.command(a.token, { requestId: 'ready_001', command: { type: 'READY', ready: true } });
  service.command(a.token, { requestId: 'start_001', command: { type: 'START' } });
  const room = service.rooms.get(a.roomId), player = room.players[0]; player.credits = 100;
  const request = { requestId: 'upgrade_001', command: { type: 'UPGRADE' } };
  service.command(a.token, request); assert.equal(service.command(a.token, request).duplicate, true);
  assert.equal(player.upgrades, 1); assert.equal(player.credits, 0);
  assert.throws(() => service.command(a.token, { ...request, command: { type: 'MOVE', lane: 1, unitId: room.units[0].id } }), /식별자/);
  now += 7000; service.tick(); assert.equal(player.connected, false); assert.equal(room.time, 7000);
  const restored = service.snapshot(a.token); assert.equal(player.connected, true); assert.equal(restored.units[0].ownerId, a.playerId);
  assert.throws(() => service.snapshot('made-up'), /만료/);
  assert.equal(JSON.stringify(restored).includes(a.token), false);
});
test('both 2- and 3-player runs terminate with bounded enemies, event history and finite positions', () => {
  for (const capacity of [2, 3]) {
    const room = team(capacity, true);
    for (let i = 0; i < 30 && ['PREP', 'WAVE'].includes(room.phase); i++) {
      advanceRoom(room, 60000);
      assert.ok(room.enemies.length <= RULES.maxEnemies);
      assert.ok(room.events.length <= RULES.maxEvents);
      assert.ok(room.units.every(u => Number.isFinite(u.x) && Number.isFinite(u.y) && u.hp >= 0 && u.hp <= u.maxHp));
    }
    assert.ok(['VICTORY', 'DEFEAT'].includes(room.phase), `Unfinished ${capacity}-player run, wave ${room.wave}`);
  }
});
test('three independent HTTP clients share one room and only authenticated members can command it', async t => {
  const { server } = createReviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, data, token) => {
    const r = await fetch(`${origin}/__coop-defense/v1/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
    return { status: r.status, body: await r.json() };
  };
  const a = (await post('create', { name: 'A', capacity: 3, loadout: defaultLoadout() })).body;
  const b = (await post('join', { roomId: a.roomId, name: 'B', loadout: defaultLoadout() })).body;
  const c = (await post('join', { roomId: a.roomId, name: 'C', loadout: defaultLoadout() })).body;
  assert.equal((await post('join', { roomId: a.roomId, name: 'D' })).status, 400);
  for (const member of [a, b, c]) assert.equal((await post('command', { requestId: 'ready_001', command: { type: 'READY', ready: true } }, member.token)).status, 200);
  assert.equal((await post('command', { requestId: 'start_001', command: { type: 'START' } }, b.token)).status, 400);
  assert.equal((await post('command', { requestId: 'start_001', command: { type: 'START' } }, a.token)).status, 200);
  const snapshots = await Promise.all([a, b, c].map(async member => (await fetch(`${origin}/__coop-defense/v1/state`, { headers: { Authorization: `Bearer ${member.token}` } })).json()));
  assert.deepEqual(snapshots.map(s => s.id), [a.roomId, a.roomId, a.roomId]);
  assert.ok(snapshots.every(s => s.units.length === 9));
  assert.equal((await post('command', { requestId: 'move_0001', command: { type: 'MOVE', unitId: snapshots[0].units[0].id, lane: 1 } }, b.token)).status, 400);
  assert.equal((await fetch(`${origin}/__coop-defense/v1/state`)).status, 401);
  assert.equal((await fetch(`${origin}/__coop-defense/v1/create`, { method: 'POST', headers: { Origin: 'https://other.invalid', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${origin}/AGENTS.md`)).status, 404);
});
