import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {TextStyle} from 'pixi.js';
import {ACTION_LIMIT, BATTLE_SUIT, CARD_IDS, IdleSession, MAX_TRAINING, STAGES, STORAGE_KEY, VERSION, ZONES,
  buildPreviewDeck, farmableStages, freshState, powerMultiplier, restoreState, simulateStage, trainingCost}
  from '../preview/idle-v3-v1/source/idle-model.mjs';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const catalog = ['fur/manifest-v2.json', 'zenith/manifest-v1.json', 'superstar/manifest-v1.json'].flatMap(p => {
  const manifest = JSON.parse(read('assets/ui/project-v/characters/' + p));
  return manifest.characters.map(c => ({...c, grade: manifest.rarity}));
});
const monsters = JSON.parse(read('assets/ui/project-v/monsters/hunt-tower/manifest-v1.json')).sprites;
const equipment = JSON.parse(read('assets/ui/project-v/account-battle-suits/manifest-v2.json'));
const simulate = (index, training = 0, seed = 42) => simulateStage({catalog, monsters, equipment, stageIndex: index, training, seed});
const play = session => {
  const round = session.begin();
  const payload = simulate(round.stageIndex, round.training, round.seed);
  return {round, payload, outcome: session.finish(round, payload)};
};

test('real, approved five-card identities; one SUPERSTAR and one ZENITH; artwork separate from SD', () => {
  const deck = buildPreviewDeck(catalog);
  assert.equal(deck.length, 5);
  assert.equal(new Set(deck.map(c => c.id)).size, 5);
  assert.equal(deck.filter(c => c.rarity === 'ZENITH').length, 1);
  assert.equal(deck.filter(c => c.rarity === 'SUPERSTAR').length, 1);
  for (const c of deck) {
    assert.ok(CARD_IDS.includes(c.id));
    assert.equal(c.image, c.sourceArt);
    assert.notEqual(c.image, c.battleSprite);
    assert.ok(fs.existsSync(new URL(c.image, root)));
    assert.ok(fs.existsSync(new URL(c.battleSprite, root)));
  }
});
test('all twelve encounters use existing approved monster originals and SD', () => {
  assert.equal(STAGES.length, 12);
  assert.equal(ZONES.length, 3);
  assert.equal(STAGES.filter(s => s.boss).length, 3);
  for (const s of STAGES) {
    const m = monsters.find(m => m.mode === 'HUNT' && m.monsterId === s.monsterId);
    assert.equal(m.qa.visualApproval, true);
    assert.ok(fs.existsSync(new URL(m.sourceArt, root)));
    assert.ok(fs.existsSync(new URL(m.battleSprite, root)));
  }
});
test('monster stats do not scale to player strength', () => {
  for (const s of STAGES) {
    const low = simulate(s.index, 0).battleV2.teams.B.cards;
    const high = simulate(s.index, MAX_TRAINING).battleV2.teams.B.cards;
    assert.deepEqual(high, low);
  }
});
test('initial deck clears the first three areas across thirty seeds', () => {
  for (let seed = 1; seed <= 30; seed++) for (let s = 0; s < 3; s++) {
    assert.equal(simulate(s, 0, seed).battleV2.result.winner, 'A');
  }
});
test('first gate cannot be cleared at initial stats, but training breaks the wall', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const low = simulate(3, 0, seed).battleV2.result;
    assert.equal(low.winner, 'B');
    assert.ok(low.final.B[0].hp > 0);
    assert.ok(low.actions <= ACTION_LIMIT);
    assert.equal(low.timeline.at(-1).winner, 'B');
    assert.equal(simulate(3, 3, seed).battleV2.result.winner, 'A');
  }
});
test('all gates are reachable at maximum training without hidden player scaling', () => {
  for (let seed = 1; seed <= 30; seed++) for (const stage of STAGES) {
    assert.equal(simulate(stage.index, MAX_TRAINING, seed).battleV2.result.winner, 'A');
  }
});
test('first clear bonus paid only once, repeated farm pays normal reward', () => {
  const session = new IdleSession();
  const first = play(session);
  assert.equal(first.outcome.reward, STAGES[0].reward * 3);
  assert.equal(session.state.cleared, 0);
  assert.equal(session.setFarm(0), true);
  const repeat = play(session);
  assert.equal(repeat.outcome.reward, STAGES[0].reward);
  assert.equal(repeat.outcome.first, false);
  assert.equal(session.state.data, STAGES[0].reward * 4);
});
test('a failed gate preserves currency and clears, switches to previous normal farm', () => {
  const session = new IdleSession();
  for (let i = 0; i < 3; i++) assert.equal(play(session).outcome.won, true);
  const before = session.serialize();
  const loss = play(session).outcome;
  assert.equal(loss.won, false);
  assert.equal(loss.reward, 0);
  assert.equal(session.state.data, before.data);
  assert.equal(session.state.cleared, 2);
  assert.equal(session.state.wall, 3);
  assert.equal(session.state.mode, 'FARM');
  assert.equal(session.target, 2);
  assert.equal(play(session).outcome.reward, STAGES[2].reward);
});
test('begin rejects overlapping rounds; finish is idempotent; stale/cancelled results award nothing', () => {
  const session = new IdleSession();
  const round = session.begin();
  assert.throws(() => session.begin(), /진행 중/);
  const payload = simulate(round.stageIndex, round.training, round.seed);
  assert.ok(session.finish(round, payload));
  const balance = session.state.data;
  assert.equal(session.finish(round, payload), null);
  const cancelled = session.begin();
  session.cancel(cancelled);
  assert.equal(session.finish(cancelled, simulate(cancelled.stageIndex, cancelled.training, cancelled.seed)), null);
  assert.equal(session.state.data, balance);
  const active = session.begin();
  assert.equal(session.finish(cancelled, payload), null);
  assert.equal(session.active, active);
});
test('mismatched results cannot claim the active stage', () => {
  const session = new IdleSession();
  const round = session.begin();
  assert.throws(() => session.finish(round, simulate(1, 0, round.seed)), /일치/);
  assert.equal(session.state.data, 0);
  assert.equal(session.active, round);
});
test('unopened stages and bosses cannot be selected as safe farms', () => {
  const session = new IdleSession();
  assert.equal(session.setFarm(0), false);
  session.state.cleared = 6;
  for (const invalid of [-1, 3, 7, 8, 99, NaN]) assert.equal(session.setFarm(invalid), false);
  assert.equal(session.setFarm(4), true);
  assert.deepEqual(farmableStages(6).map(s => s.index), [0, 1, 2, 4, 5, 6]);
});
test('manual farm choice during an advancing fight is not overwritten by its result', () => {
  const session = new IdleSession();
  play(session);
  const round = session.begin();
  assert.equal(session.setFarm(0), true);
  session.finish(round, simulate(round.stageIndex, round.training, round.seed));
  assert.equal(session.state.cleared, 1);
  assert.equal(session.target, 0);
});
test('training is bounded, charged once, and does not mutate an in-progress snapshot', () => {
  const session = new IdleSession();
  assert.equal(session.train(), false);
  session.state.data = 1000;
  const round = session.begin();
  assert.equal(session.train(), true);
  assert.equal(session.state.training, 1);
  assert.equal(session.state.data, 1000 - trainingCost(0));
  assert.equal(round.training, 0);
  assert.equal(simulate(round.stageIndex, round.training, round.seed).battleV2.teams.A.summary.power, 1000000);
  session.cancel(round);
  assert.equal(session.begin().training, 1);
  session.state.training = MAX_TRAINING;
  assert.equal(session.train(), false);
  assert.equal(powerMultiplier(999), powerMultiplier(MAX_TRAINING));
});
test('reload cannot restore a running or pending round, and only scoped preview key is used', () => {
  const session = new IdleSession();
  session.begin();
  const reloaded = new IdleSession(session.serialize());
  assert.equal(reloaded.active, null);
  assert.equal(reloaded.state.data, 0);
  assert.equal(reloaded.state.attempts, 1);
  assert.equal(STORAGE_KEY, 'cnine_preview_idle_v3_v1');
  const app = read('preview/idle-v3-v1/source/idle-app.mjs');
  assert.match(app, /localStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(app, /localStorage\.(?:removeItem|clear)\(/);
  assert.match(app, /document\.hidden.*pause\(true\)/);
});
test('malformed and obsolete storage is normalized without pending state or unbounded numbers', () => {
  assert.deepEqual(restoreState({version: 99}), freshState());
  const state = restoreState({version: VERSION, training: Infinity, data: 1e100, cleared: null,
    farm: 99, mode: 'FARM', log: [{text: '<img onerror=alert(1)>', kind: 'evil'}]});
  assert.equal(state.cleared, -1);
  assert.equal(state.mode, 'ADVANCE');
  assert.equal(state.training, 0);
  assert.equal(state.data, 1000000000);
  assert.equal(state.log[0].kind, 'info');
  assert.doesNotMatch(read('preview/idle-v3-v1/source/idle-app.mjs'), /innerHTML/);
});
test('all-clear transitions to a cleared normal farm and cannot retry past the final stage', () => {
  const session = new IdleSession({...freshState(), training: MAX_TRAINING, cleared: 10, farm: 10});
  assert.equal(play(session).outcome.won, true);
  assert.equal(session.state.cleared, 11);
  assert.equal(session.state.mode, 'FARM');
  assert.equal(session.target, 10);
  assert.equal(session.advance(), false);
});
test('bridge loads one production V3 bundle and the original adapter/frame chain', () => {
  const html = read('preview/idle-v3-v1/battle.html');
  for (const file of ['css/card.css', 'css/battle-v3-live.css', 'css/zenith-v1.css', 'css/superstar-v1.css', 'css/faker-card-v1.css']) {
    assert.ok(html.includes(file));
  }
  const adapters = ['project-v-battle-art-adapter-v1.js', 'project-v-tier-battle-art-adapter-v1.js',
    'project-v-monster-battle-art-adapter-v1.js', 'project-v-unassigned-battle-fallback-v1.js'];
  for (let i = 1; i < adapters.length; i++) assert.ok(html.indexOf(adapters[i - 1]) < html.indexOf(adapters[i]));
  assert.equal((html.match(/project-v-pixi-battle\.bundle\.js/g) || []).length, 1);
  const css = read('preview/idle-v3-v1/idle.css');
  assert.doesNotMatch(css, /battle-v3-|\.game-card|\.zenith-|\.pv-pixi/);
  assert.match(read('preview/idle-v3-v1/battle-bridge.js'), /ProjectVBattleV3Live\.createRenderer/);
});
test('preview has no production UI entry, API mutations or independent Pixi/GSAP copy', () => {
  for (const file of ['index.html', 'js/app.js', 'functions/api/[[path]].js', 'js/pve-command-v2-live.js']) {
    assert.doesNotMatch(read(file), /idle-v3-v1/);
  }
  const bundle = read('preview/idle-v3-v1/app.bundle.js');
  assert.ok(Buffer.byteLength(bundle) < 90000);
  assert.doesNotMatch(bundle, /\/api\/|method:\s*["']POST["']|gsap\.timeline|new Application/);
});
test('silent bridge disposes the mixer before playback and never changes the live sound preference', async () => {
  const source = read('preview/idle-v3-v1/battle-bridge.js');
  const calls = [];
  const audio = {destroyed: false, destroy() { this.destroyed = true; calls.push('mute'); }};
  const api = {mountForBattle: async () => ({audio}), diagnostics: () => ({})};
  const win = {ProjectVPixiBattle: api, addEventListener() {}};
  const doc = {querySelectorAll: () => []};
  const context = {window: win, parent: {}, document: doc, location: {replace() {}}, console};
  vm.runInNewContext(source, context);
  await api.mountForBattle();
  assert.deepEqual(calls, ['mute']);
  assert.equal(win.IdleBattleBridge.diagnostics().audioDisposed, true);
  assert.equal(win.IdleBattleBridge.diagnostics().audioPolicy, 'MUTED');
  assert.doesNotMatch(source, /localStorage|unlockAudio|\.unlock\(/);
  assert.doesNotMatch(read('preview/idle-v3-v1/source/idle-app.mjs'), /unlockAudio/);
});
test('battle suit is a separate support with real suit/weapon assets and independent damage', () => {
  const payload = simulate(3);
  assert.equal(payload.equippedBattleSuit.code, BATTLE_SUIT.code);
  assert.equal(payload.equippedWeapon.code, BATTLE_SUIT.weaponCode);
  assert.ok(fs.existsSync(new URL(payload.equippedBattleSuit.appearance.battleSprite.replace(/^\//, ''), root)));
  assert.ok(fs.existsSync(new URL(payload.equippedWeapon.appearance.battleSprite.replace(/^\//, ''), root)));
  const battle = payload.battleV2;
  assert.equal(battle.teams.A.cards.length, 5);
  assert.equal(battle.result.final.A.length, 5);
  assert.equal(battle.teams.A.supports.length, 1);
  const support = battle.teams.A.supports[0];
  assert.equal(support.untargetable, true);
  assert.equal(support.usesSpeedGauge, false);
  assert.equal(support.consumesBattleAction, false);
  assert.equal(support.damageAuthority, 'SERVER_TIMELINE');
  assert.ok(battle.result.damageBreakdown.battleSuit > 0);
  assert.ok(battle.result.timeline.some(e => e.actorId === support.id && e.damage > 0));
  assert.ok(!battle.result.timeline.some(e => e.targetId === support.id));
  assert.equal(battle.result.damageBreakdown.total, battle.result.damageBreakdown.cards + battle.result.damageBreakdown.battleSuit);
});
test('preview damage style keys stay bounded with real Pixi TextStyle reuse and preserve appearance', () => {
  const win = {};
  vm.runInNewContext(read('preview/idle-v3-v1/damage-style-cache.js'), {window: win});
  const style = new TextStyle({fontFamily: 'Arial Black, Arial', fontSize: 68, fill: 0xffc553,
    stroke: {color: 0x250207, width: 13, join: 'round'}, letterSpacing: -2});
  const view = {numberLabel: {style}};
  const pool = {available: [view], inUse: new Set(), factory: () => ({numberLabel: {style: new TextStyle(style._toObject())}})};
  win.IdleDamageStyleCache.install({pools: {damage: pool}});
  const expected = style._toObject();
  const first = style.styleKey;
  for (let hit = 0; hit < 10000; hit++) {
    style.fill = 0xffc553; style.fontSize = 68; style.stroke = {color: 0x250207, width: 13, join: 'round'};
    assert.equal(style.styleKey, first);
  }
  assert.equal(pool.__idleStyleCache.keys.size, 1);
  assert.deepEqual(style._toObject(), expected);
  assert.equal(pool.factory().numberLabel.style.styleKey, first);
  style.fill = 0xffffff;
  assert.notEqual(style.styleKey, first);
  assert.equal(pool.__idleStyleCache.keys.size, 2);
});
