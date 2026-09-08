import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import sharp from 'sharp';
import {buildFighter, buildMonsterFighter, simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {createEncounter, NORMAL_COUNT, ACTION_LIMIT, SPECIMENS} from '../preview/scrapyard-v3-v1/source/encounter-model.mjs';

const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const catalog = ['fur/manifest-v2.json', 'zenith/manifest-v1.json', 'superstar/manifest-v1.json'].flatMap(p => {
  const m = JSON.parse(read('assets/ui/project-v/characters/' + p));
  return m.characters.map(c => ({...c, grade: m.rarity}));
});
const equipment = JSON.parse(read('assets/ui/project-v/account-battle-suits/manifest-v2.json'));
const encounter = (powerScale = 1, seed = 7123) => createEncounter({catalog, equipment, powerScale, seed});
const monster = (id, slot = 0) => ({...buildMonsterFighter({id, battle_power: 10000}), id: `B:${slot}:TEST:${id}`, slot});
const fighters = () => ['ATTACK', 'DEFENSE', 'SPEED', 'HP', 'ATTACK'].map((power_type, i) =>
  buildFighter({id: 'REG-' + i, title: 'REG ' + i, rarity: 'FUR', power: 200000, power_type}, i, 'A', null, 'PVE'));

test('existing one-monster calls retain byte-identical pre-change seeded outcomes', () => {
  const golden = {
    1: 'a99a65b5d1fc9cbbf6d4a874cf953ecfc15dbd31757b7783d540e2057a254551',
    17: '0bd19c030459b3b52f46cf44f7325d1d47093df641b437cd9bf8b1392823b6f5',
    7123: 'ff6a4f7a47bc04273cf00069fda34679f23f70a87b70195562189d58ea7470ed'
  };
  for (const [seed, hash] of Object.entries(golden)) {
    const args = {teamA: fighters(), teamB: [buildMonsterFighter({id: 991, battle_power: 1500000})], seed: +seed, maxActions: 80};
    const result = simulateBattleV2Preview(args);
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex'), hash);
    assert.deepEqual(simulateBattleV2Preview({...args, reinforcements: []}), result);
    assert.equal(result.encounter, undefined);
  }
});
test('PVP default and explicitly empty queue remain identical', () => {
  const args = {teamA: fighters(), teamB: fighters().map((c, i) => ({...c, id: `B:${i}:PVP`, side: 'B'})), seed: 52};
  assert.deepEqual(simulateBattleV2Preview(args), simulateBattleV2Preview({...args, reinforcements: []}));
});
test('only bounded, distinct PVE enemy instances and empty initial slots are accepted', () => {
  const run = (reinforcements, teamB = [monster(1)]) => simulateBattleV2Preview({teamA: fighters(), teamB, reinforcements});
  for (const invalid of [null, {}, new Array(41).fill(monster(2))]) assert.throws(() => run(invalid), /INVALID_REINFORCEMENTS/);
  for (const patch of [{isMonster: false}, {side: 'A'}, {slot: -1}, {slot: 5}, {slot: 1.5}, {hp: NaN}, {hp: 0}, {speed: 0}, {id: 'B:0:TEST:1'}]) {
    assert.throws(() => run([{...monster(2), ...patch}]), /INVALID_REINFORCEMENT_MONSTER/);
  }
  assert.throws(() => run([monster(3)], [monster(1), monster(2)]), /DUPLICATE_ENCOUNTER_SLOT/);
});
test('input fighter snapshots are not mutated by the continuous encounter', () => {
  const args = {teamA: fighters(), teamB: [monster(1)], reinforcements: [monster(2)], seed: 12};
  const before = structuredClone(args);
  simulateBattleV2Preview(args);
  assert.deepEqual(args, before);
});
test('exactly five real cards, separate suit and distinct original/SD resources', () => {
  const p = encounter();
  assert.equal(p.cards.length, 5);
  assert.equal(p.cards.filter(c => c.rarity === 'SUPERSTAR').length, 1);
  assert.equal(p.battleV2.teams.A.cards.length, 5);
  assert.equal(p.battleV2.result.final.A.length, 5);
  assert.equal(p.battleV2.teams.A.supports.length, 1);
  assert.equal(p.battleV2.teams.A.supports[0].untargetable, true);
  assert.equal(p.battleV2.teams.A.supports[0].consumesBattleAction, false);
  for (const c of p.cards) {
    assert.equal(c.image, c.sourceArt);
    assert.notEqual(c.image, c.battleSprite);
    assert.ok(fs.existsSync(new URL(c.image.replace(/^\//, ''), root)));
  }
});
test('fixed enemy stats, real loss at low power, no automatic player-strength scaling', () => {
  const low = encounter(.25), normal = encounter(1), high = encounter(2);
  assert.deepEqual(low.scrapyardPreview.instances, high.scrapyardPreview.instances);
  assert.equal(low.battleV2.result.winner, 'B');
  assert.equal(normal.battleV2.result.winner, 'A');
  assert.equal(high.battleV2.result.winner, 'A');
  assert.ok(low.battleV2.result.encounter.defeated < 10);
  for (const p of [low, normal, high]) assert.ok(p.battleV2.result.actions <= ACTION_LIMIT);
  for (const powerScale of [0, -1, 3, Infinity, NaN]) assert.throws(() => encounter(powerScale), /INVALID_PREVIEW_POWER/);
});
test('30 seeds: no more than 3 normals, exact spawn/KO generations, boss only after nine kills', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const p = encounter(1, seed), all = new Map(p.scrapyardPreview.instances.map(c => [c.id, c]));
    const active = new Map(p.scrapyardPreview.initialIds.map(id => [all.get(id).slot, id]));
    const dead = new Set(), seen = new Set(active.values());
    for (const e of p.battleV2.result.timeline) {
      if (e.type === 'ENEMY_SPAWN') {
        assert.equal(active.has(e.slot), false);
        assert.equal(seen.has(e.targetId), false);
        if (e.boss) {assert.equal(dead.size, NORMAL_COUNT); assert.equal(active.size, 0);}
        active.set(e.slot, e.targetId); seen.add(e.targetId);
        assert.ok(active.size <= 3);
      }
      for (const id of [e.actorId, e.targetId].filter(id => all.has(id))) {
        assert.equal(seen.has(id), true, 'cannot use an enemy before spawning');
        assert.equal(dead.has(id), false, 'no events reference a retired enemy generation');
      }
      if (e.type === 'KO' && all.has(e.targetId)) {active.delete(all.get(e.targetId).slot); dead.add(e.targetId);}
    }
    if (p.battleV2.result.winner === 'A') {assert.equal(seen.size, 10); assert.equal(dead.size, 10);}
  }
});
test('one RNG and combat session; opening auras are never replayed at spawn', () => {
  const first = encounter(), again = encounter();
  assert.deepEqual(again, first);
  const timeline = first.battleV2.result.timeline;
  const firstSpawn = timeline.findIndex(e => e.type === 'ENEMY_SPAWN');
  assert.ok(firstSpawn > 0);
  for (const e of timeline.slice(firstSpawn)) assert.ok(!['DEPLOY', 'START_EFFECT', 'SINGLE_HEALER_AURA', 'GUARD_PROTECT'].includes(e.type));
  const ending = first.battleV2.result.final.A;
  assert.ok(ending.some(c => c.hp < c.maxHp));
  assert.equal(timeline.filter(e => e.type === 'RESULT').length, 1);
});
test('boss pending / action or time cap is a loss, never a win by surviving HP ratio', () => {
  for (const limits of [{maxActions: 1}, {maxDuration: .0001}]) {
    const r = simulateBattleV2Preview({teamA: fighters(), teamB: [monster(1)],
      reinforcements: [{...monster(2), encounterAfterClear: true, isBoss: true}], seed: 5, ...limits});
    assert.equal(r.winner, 'B');
    assert.ok(r.encounter.remaining > 0 || r.final.B.some(c => c.hp > 0));
    assert.ok(['ACTION_LIMIT', 'TIME_LIMIT'].includes(r.reason));
  }
});
test('battle suit damage has one authoritative lane through all generations', () => {
  const p = encounter(), r = p.battleV2.result, support = p.battleV2.teams.A.supports[0];
  const shots = r.timeline.filter(e => e.actorId === support.id && e.type === 'TURN');
  assert.ok(shots.length > 10);
  assert.ok(shots.some(e => e.targetId.endsWith(':10')));
  assert.ok(shots.every(e => e.actionClock === 'INDEPENDENT_TIME_CADENCE'));
  assert.ok(!r.timeline.some(e => e.targetId === support.id));
  assert.equal(shots.reduce((n, e) => n + (e.damage || 0) + (e.absorbed || 0), 0), r.damageBreakdown.battleSuit);
  assert.equal(r.damageBreakdown.total, r.damageBreakdown.cards + r.damageBreakdown.battleSuit);
});
test('new monster PNGs have actual transparent alpha, intact padding and separate source art', async () => {
  for (const specimen of Object.values(SPECIMENS)) {
    assert.notEqual(specimen.sourceArt, specimen.battleSprite);
    assert.ok(fs.existsSync(new URL(specimen.sourceArt.slice(1), root)));
    const file = fs.readFileSync(new URL(specimen.battleSprite.slice(1), root));
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.hasAlpha, true);
    assert.ok(metadata.width >= 1024 && metadata.height >= 1024);
    const {data, info} = await sharp(file).extractChannel('alpha').raw().toBuffer({resolveWithObject: true});
    assert.ok(data.some(v => v === 0)); assert.ok(data.some(v => v === 255));
    // Faint generator alpha noise (observed max 4/255) is not a clipped limb.
    // Assert all visible pixels stay strictly inside the canvas on every edge.
    let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[y * info.width + x] > 8) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    assert.ok(minX >= 4 && minY >= 4 && maxX <= info.width - 5 && maxY <= info.height - 5);
  }
});
test('manifest pins generated SD, unchanged original art and approved battlefield hashes', () => {
  const manifest = JSON.parse(read('preview/scrapyard-v3-v1/manifest.json'));
  assert.equal(manifest.liveConnected, false);
  const hash = path => crypto.createHash('sha256').update(fs.readFileSync(new URL(path, root))).digest('hex').toUpperCase();
  for (const row of manifest.assets) {
    assert.equal(hash(row.path), row.sha256);
    assert.equal(hash(row.sourceArt), row.sourceSha256);
  }
  assert.equal(hash(manifest.battlefield.path), manifest.battlefield.sha256);
  const lock = JSON.parse(read('package-lock.json'));
  for (const [name, version] of Object.entries(manifest.libraries)) assert.equal(lock.packages['node_modules/' + name].version, version);
});
test('one shared Pixi renderer, original cards/adapters, no live navigation or API mutation', () => {
  const html = read('preview/scrapyard-v3-v1/battle.html');
  assert.equal((html.match(/\.\/battle\.bundle\.js/g) || []).length, 1);
  assert.doesNotMatch(html, /project-v-pixi-battle\.bundle/);
  for (const file of ['card.css', 'battle-v3-live.css', 'zenith-v1.css', 'superstar-v1.css', 'faker-card-v1.css',
    'project-v-battle-art-adapter-v1.js', 'project-v-tier-battle-art-adapter-v1.js', 'project-v-monster-battle-art-adapter-v1.js']) assert.ok(html.includes(file));
  const css = read('preview/scrapyard-v3-v1/style.css');
  assert.doesNotMatch(css, /\.battle-v3-|\.game-card|\.pv-pixi/);
  for (const file of ['index.html', 'js/app.js', 'functions/api/[[path]].js', 'js/pve-command-v2-live.js']) assert.doesNotMatch(read(file), /scrapyard-v3-v1|reinforcements\s*:/);
  const app = read('preview/scrapyard-v3-v1/app.bundle.js');
  assert.doesNotMatch(app, /\/api\/|localStorage|new Application|method:\s*["']POST/);
  assert.match(read('preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js'), /extends LiveBattleEngine/);
  assert.match(read('preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js'), /this\.timeline\(tl/);
});
test('replacement waits for bullets, exact IDs never use legacy suffix fallback, final state filters retired IDs', () => {
  const source = read('preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js');
  assert.match(source, /waitForAccountBattleUnitDamageQueueDrain\(6000\)/);
  assert.match(source, /await this\.drainGeneration\(\);[\s\S]+this\.bindMonster\(row\)/);
  assert.match(source, /actor\.id === id\) \|\| null/);
  assert.match(source, /STALE_ENEMY_INSTANCE/);
  assert.match(source, /if \(queued >= 16\) await this\.drainGeneration\(\)/);
  assert.match(source, /filter\(row => liveIds\.has\(row\.id\)\)/);
  assert.match(source, /for \(const actor of this\.enemies\) actor\.isBoss = Boolean/);
  assert.ok(source.indexOf('actor.animationAdapter?.kill?.()') < source.indexOf('actor.useFullBodySprite('));
  assert.ok(source.indexOf('actor.view.alpha = 1') < source.indexOf('actor.useFullBodySprite('));
});
test('silent bridge tears down audio and leaves production sound preferences alone', async () => {
  const audio = {destroyed: false, destroy() {this.destroyed = true;}};
  const api = {mountForBattle: async () => ({audio}), diagnostics: () => ({})};
  const win = {ProjectVPixiBattle: api, addEventListener() {}};
  vm.runInNewContext(read('preview/scrapyard-v3-v1/battle-bridge.js'), {window: win, parent: {},
    document: {querySelectorAll: () => []}, location: {replace() {}}, console});
  await api.mountForBattle();
  assert.equal(win.ScrapyardBattleBridge.diagnostics().audioDisposed, true);
  assert.doesNotMatch(read('preview/scrapyard-v3-v1/battle-bridge.js'), /localStorage|unlockAudio/);
});

test('binding a boss into a dead enemy slot cannot inherit its transparent, rotated death pose', () => {
  const source = read('preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js')
    .replace(/^import .*;$/gm, '').replace('export class BattleEngine', 'class BattleEngine');
  const sandbox = {LiveBattleEngine: class {}, CHARACTER_STATE: {IDLE: 'IDLE'}};
  vm.runInNewContext(source + '\nglobalThis.Engine = BattleEngine;', sandbox);
  const point = () => ({x: 1, y: 1, set(x, y = x) {this.x = x; this.y = y;}});
  const actor = {id: 'B:1:SCRAP:8', battleActive: true, view: {position: point(), scale: point(), alpha: .3, rotation: 1.13},
    fullBodySprite: {position: point(), scale: point(), alpha: .3, rotation: 1},
    root: {position: point(), scale: point()}, nameLabel: {}, hud: {}, baseX: 100, baseY: 100, restScale: .64,
    animationAdapter: {kill() {}},
    captureNeutralAvatarPose() {this.neutralAvatarPose = {alpha: this.view.alpha, rotation: this.view.rotation};},
    useFullBodySprite() {this.captureNeutralAvatarPose();}, setTint() {}, setState() {}, setHp() {}, setShield() {}};
  const engine = Object.create(sandbox.Engine.prototype);
  Object.assign(engine, {enemies: [null, actor], retiredIds: new Set(), spawnCount: 0, spriteTextures: new Map([['boss.png', {}]]), settlePendingTails() {}});
  engine.bindMonster({id: 'B:1:SCRAP:10', slot: 1, boss: true, name: 'Breaker', battleSprite: 'boss.png', maxHp: 100});
  assert.equal(actor.neutralAvatarPose.alpha, 1);
  assert.equal(actor.neutralAvatarPose.rotation, 0);
  assert.equal(actor.fullBodySprite.alpha, 1);
  assert.equal(actor.view.scale.x, -1);
  assert.equal(actor.root.visible, true);
  assert.equal(actor.isBoss, true);
  assert.equal(engine.retiredIds.has('B:1:SCRAP:8'), true);
});

function bridgeHarness() {
  const waiting = [], log = [], node = {style: {}, textContent: ''};
  const engine = {audio: {destroy() {}}, characters: [],
    startAccountBattleUnitSustainedFire() {log.push('start');},
    async stopAccountBattleUnitSustainedFire() {log.push('stop');},
    async drainGeneration() {log.push('drain');}, settlePendingTails() {}};
  const api = {mountForBattle: async () => engine, restoreDeployedFormation: async () => true,
    playEvents: () => new Promise(resolve => waiting.push(resolve)),
    async syncFinalState() {log.push('sync');}, cancelActiveAnimations() {}, destroy() {}, diagnostics: () => ({scrapyard: {}})};
  const live = {prepareLoading: () => ({stage: {querySelector: () => node}}),
    async createRenderer() {await api.mountForBattle(); return {destroy() {log.push('destroy');}, showResult() {log.push('result');}};}};
  const win = {ProjectVPixiBattle: api, addEventListener() {}};
  vm.runInNewContext(read('preview/scrapyard-v3-v1/battle-bridge.js'), {window: win, parent: {},
    ProjectVBattleV3Live: live, document: {getElementById: () => node, querySelectorAll: () => []}, location: {replace() {}}, console});
  return {bridge: win.ScrapyardBattleBridge, waiting, log,
    payload: {cards: [], battleV2: {result: {timeline: [{type: 'TURN'}], final: {}}}}};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('cancelled playback cannot finish or stop a newer encounter', async () => {
  const {bridge, waiting, log, payload} = bridgeHarness();
  await bridge.prepare(payload);
  const old = bridge.play(); await tick();
  assert.equal(waiting.length, 1);
  bridge.cancel(); await bridge.prepare(payload);
  const next = bridge.play(); await tick();
  assert.equal(waiting.length, 2);
  waiting[0](true); assert.equal(await old, false);
  assert.equal(bridge.diagnostics().playing, true);
  assert.equal(log.includes('result'), false);
  waiting[1](true); assert.equal(await next, true);
  assert.equal(log.filter(x => x === 'result').length, 1);
  assert.equal(log.filter(x => x === 'sync').length, 1);
  assert.equal(bridge.diagnostics().playing, false);
});
test('cancelling while paused releases the pending pause promise without awarding a result', async () => {
  const {bridge, waiting, log, payload} = bridgeHarness();
  await bridge.prepare(payload); bridge.pause();
  const run = bridge.play(); await tick();
  assert.equal(bridge.diagnostics().paused, true);
  assert.equal(waiting.length, 0);
  bridge.cancel(); assert.equal(await run, false);
  assert.equal(log.includes('sync'), false); assert.equal(log.includes('result'), false);
  assert.equal(bridge.diagnostics().playing, false);
});
