import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceRoom, commandRoom, createRoom, joinRoom, publicSnapshot, startRoom, WORLD} from '../preview/coop-defense-v1/source/defense-model.mjs';
import {defenseFieldView} from '../preview/coop-defense-v1/source/DefenseFieldView.mjs';
import {FORMATION_LATTICES, formationActorScale} from '../preview/project-v-v3/source/battle/FormationLayout.mjs';
import {fitCompactViewport} from '../preview/project-v-v3/source/battle/ViewportLayout.mjs';
import {allocationCost, settleWaveGrowth} from '../shared/monster-defense-growth-v2.mjs';
import {monsterDefenseFixture, defenseOwnedLoadout} from './helpers/monster-defense-fixture.mjs';

function wave(capacity) {
  const room = createRoom({id: 'OPEN', seed: 17, capacity});
  for (let i = 0; i < capacity; i++) joinRoom(room, {id: String(i), name: '분대' + i}).ready = true;
  startRoom(room, '0');
  room.phase = 'WAVE'; room.wave = 1;
  room.spawnQueue = Array.from({length: 24}, (_, i) => ({lane: i % capacity, type: 'NORMAL', archetype: 'RIVET'}));
  room.spawnAt = room.time;
  return room;
}

test('wave income is guaranteed once, and a mixed draft uses the exact cost across tier boundaries', () => {
  const room = wave(2), player = room.players[0];
  room.growthPolicy.drops.NORMAL.chance = 0;
  settleWaveGrowth(room); settleWaveGrowth(room);
  assert.equal(player.credits, room.growthPolicy.drops.NORMAL.amount);
  assert.equal(player.growth.draws.length, 1);
  room.phase = 'PREP'; player.credits = 500; player.growth.levels.ATTACK = 2;
  const draft = {ATTACK: 2, VITAL: 1};
  const command = {type: 'ALLOCATE', levels: draft, wave: room.wave, expectedAttempt: 0};
  assert.equal(allocationCost(room.growthPolicy, player.growth.levels, draft), 350);
  const units = room.units.filter(u => u.ownerId === player.id);
  const other = structuredClone(room.units.filter(u => u.ownerId !== player.id));
  units[0].hp = 0; units[1].hp = Math.floor(units[1].maxHp / 2);
  commandRoom(room, player.id, command);
  assert.deepEqual(player.growth.levels, {ATTACK: 4, VITAL: 1, TACTIC: 0});
  assert.equal(player.credits, 150); assert.equal(player.growth.spent, 350);
  assert.equal(units[0].hp, 0);
  assert.ok(Math.abs(units[1].hp / units[1].maxHp - .5) < .01);
  assert.deepEqual(other, room.units.filter(u => u.ownerId !== player.id));
  const before = structuredClone(room);
  for (const levels of [{}, {A:1}, {VITAL:-1}, {ATTACK:1.5}, {TACTIC:11}, {TACTIC:2}, {ATTACK:null}, JSON.parse('{"__proto__":1}')]) {
    assert.throws(() => commandRoom(room, player.id, {...command, expectedAttempt:1, levels}));
  }
  assert.throws(() => commandRoom(room, player.id, command), /변경/);
  assert.deepEqual(room, before);
});

test('direct allocation survives a duplicated durable request, a competing tab, and reconnect', async () => {
  const h = await monsterDefenseFixture();
  try {
    const s = await h.api(1, 'defense/create', {capacity:2, practice:true, difficulty:'NORMAL', loadout:defenseOwnedLoadout(), requestId:crypto.randomUUID()});
    await h.ready(s);
    const send = (command, requestId=crypto.randomUUID()) => h.live(s, 'command', {command, requestId});
    await send({type:'START'});
    const saved = await h.room(s.roomId);
    saved.players[0].credits = 500; saved.phaseUntil = saved.time + 60000; saved.serverAt = Date.now();
    await h.room(s.roomId, saved);
    const command = {type:'ALLOCATE', wave:0, levels:{ATTACK:1,VITAL:1}, expectedAttempt:0};
    const uuid = crypto.randomUUID(), repeat = await Promise.all([send(command, uuid), send(command, uuid)]);
    assert.deepEqual(repeat.map(r=>r.status),[200,200]);
    assert.equal(repeat.filter(r=>r.duplicate).length,1);
    const racing = await Promise.all([send({...command,expectedAttempt:1,levels:{TACTIC:1}}),send({...command,expectedAttempt:1,levels:{VITAL:1}})]);
    assert.deepEqual(racing.map(r=>r.status).sort(),[200,400]);
    const restored = (await h.api(1,'defense/session',{roomId:s.roomId})).snapshot;
    assert.equal(restored.allocationRevision,1);
    assert.equal(restored.players[0].credits,200);
    assert.equal(restored.players[0].growth.spent,300);
    assert.equal(restored.players[0].growth.attemptSeq,2);
  } finally { await h.dispose(); }
});

for (const capacity of [2, 3]) test(`${capacity} squads share one continuous approach and resume exactly mid-charge`, () => {
  const room = wave(capacity), entries = new Map();
  for (let i = 0; i < 65; i++) {
    advanceRoom(room, 100);
    for (const e of room.enemies) if (!entries.has(e.id)) entries.set(e.id, {x: e.x, y: e.y});
  }
  const bands = new Set([...entries.values()].map(p => Math.floor(p.y / 90)));
  assert.ok(bands.size >= 6, 'spawns cover the ground between squads');
  assert.ok(room.enemies.some(e => e.x < entries.get(e.id).x - 160 && Math.abs(e.y - entries.get(e.id).y) > 20));
  const saved = JSON.parse(JSON.stringify(room));
  advanceRoom(room, 3000); advanceRoom(saved, 3000);
  assert.deepEqual(publicSnapshot(saved), publicSnapshot(room));
});

test('a ranged defender and manual tactics can intercept a neighbouring squad’s attackers within range', () => {
  const room = wave(3);
  advanceRoom(room, 100);
  const e = room.enemies[0], u = room.units[1];
  for (const ally of room.units) ally.nextAttack = room.time + 10000;
  Object.assign(e, {x: u.x + 100, y: u.y + 55, lane: 1, speed: 0, hp: 9000, maxHp: 9000});
  u.nextAttack = room.time;
  advanceRoom(room, 100);
  assert.ok(e.hp < e.maxHp && room.events.some(evt => evt.type === 'HIT' && evt.actorId === u.id && evt.targetId === e.id));
  const remaining = e.hp;
  commandRoom(room, u.ownerId, {type: 'SKILL', unitId: u.id});
  assert.ok(e.hp < remaining);
  e.x = WORLD.width; u.skillReadyAt = 0;
  assert.throws(() => commandRoom(room, u.ownerId, {type: 'SKILL', unitId: u.id}), {code: 'NO_TARGET'});
});

test('an undefended pack reaches the common core from the edge of the apron', () => {
  const room = wave(2);
  room.spawnQueue.length = 3;
  advanceRoom(room, 1000);
  for (const p of room.players) p.reviveAt = room.time + 120000;
  for (const u of room.units) u.hp = 0;
  room.enemies[0].y = 110;
  for (let i = 0; i < 600 && room.phase === 'WAVE'; i++) advanceRoom(room, 100);
  assert.equal(room.coreMaxHp - room.coreHp, 3 * 18);
  assert.equal(room.events.filter(evt => evt.type === 'BREACH').length, 3);
});

test('overview and squad cameras preserve the Legion Hunt actor scale across desktop, portrait and landscape', () => {
  for (const [w, h] of [[1440, 680], [390, 510], [320, 420], [844, 230]]) {
    const compact = w <= 760, board = FORMATION_LATTICES.desktop;
    const scale = compact ? fitCompactViewport({width: w, height: h, top: 0, bottom: 0}).scale : Math.min(w / board.width, h / board.height);
    const expected = formationActorScale(compact, compact) * scale;
    for (const focus of [null, 0, 2]) {
      const view = defenseFieldView(w, h, focus, 3, WORLD.frontX);
      assert.ok(Math.abs(view.scale * view.actorScale - expected) < 1e-8);
      assert.ok(view.art.x <= view.left + 1e-8 && view.art.x + view.art.width >= view.left + view.viewWidth - 1e-8);
      assert.ok(view.art.y <= view.top + 1e-8 && view.art.y + view.art.height >= view.top + view.viewHeight - 1e-8);
    }
  }
});
