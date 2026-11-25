import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDuoBattleV2, createPveBattleV2, createPvpBattleV2 } from '../functions/_battle_v2_preview.js';
import { createCooperativeBattle } from '../functions/_cooperative_battle.js';
import { attachVehicleSupports, garageSupportText, garageTransit, readEquippedVehicleSupports } from '../functions/_mercenary_vehicle_support.js';
import { AETHER_ZERO_SUPPORT, HELIOS_R_SUPPORT, mercenaryVehicleSupport, vehicleTransitSnapshot } from '../shared/mercenary-vehicle-support-v1.mjs';
import { releasedMercenaryFormation, saveMercenaryLoadout } from '../functions/_mercenary_account.js';
import { fixture, coopSquads } from './helpers/cooperative-fixture.mjs';
import { mercenaryFixture } from './helpers/mercenary-db.mjs';
import { duoFixture } from './helpers/ranked-duo-db.mjs';
import { loadDuoProfiles } from '../functions/_ranked_duo_profiles.js';
import { isProductionFile } from '../scripts/prepare-production-assets.mjs';
import base from '../preview/equipment-sets-v3-20261019/fixture-pve.json' with {type:'json'};

const cards = base.cards;
const enemies = cards.map(c => ({...c, power: c.power * 3, base_power: c.base_power * 3}));
const boss = {...base.monster, battle_power: 10000000, pve_hp_percent: 650, pve_forced_action_every: 2};
const pair = fixture.mercenaries.filter(m => ['V-048', 'V-049'].includes(m.code));
const tag = (row, id = 1, spec = AETHER_ZERO_SUPPORT) => attachVehicleSupports(new Map([[id, row]]), new Map([[id, spec]])).get(id);
const pve = (mercenaries, seed = 1) => createPveBattleV2({cards, monster: boss, mercenaries, seed});
const pvp = (mercenaries, seed = 1, defenderMercenary = pair[0]) => createPvpBattleV2({
  attackerCards: cards, defenderCards: enemies, attackerMercenaries: mercenaries, defenderMercenary, seed
});
const amount = e => e.damage + e.absorbed;
const guards = b => b.result.timeline.filter(e => e.vehicleSupportGuard === 'AETHER_ZERO');

for (const [mode, simulate, missSeed] of [['PvE', pve, 1], ['PvP', pvp, 3]]) {
  test(mode + ' replays the v1 15% reduction on the original incoming basic packet', () => {
    const legacy = pair.map(row => ({...row,vehicleSupport:{vehicle:'AETHER_ZERO',version:1,ownerId:1}}));
    const on = simulate(legacy), off = simulate(pair);
    const protectedIds = on.teams.A.mercenaries.map(m => m.id);
    const hits = guards(on), first = hits[0], control = off.result.timeline.find(e => e.seq === first.seq);
    assert.equal(control.targetId, first.targetId);
    assert.equal(control.actorId, first.actorId);
    assert.equal(amount(first), Math.round(amount(control) * .85));
    assert.ok(first.absorbed > 0);
    if (mode === 'PvP') assert.ok(first.damage > 0);
    assert.deepEqual(new Set(hits.map(e => e.targetId)), new Set(protectedIds));
    assert.ok(hits.every(e => e.type === 'TURN' && !e.dodge && amount(e) > 0));
    const misses = simulate(legacy, missSeed).result.timeline.filter(e => protectedIds.includes(e.targetId) && e.dodge);
    assert.ok(misses.length && misses.every(e => !e.vehicleSupportGuard));
    assert.equal(guards(off).length, 0);
    assert.deepEqual(simulate(legacy).result.timeline, on.result.timeline);
  });
}

test('both PvP sides can defend, and the two different vehicles can activate on one impact', () => {
  const reversed = createPvpBattleV2({attackerCards: enemies, defenderCards: cards, attackerMercenary: pair[0],
    defenderMercenaries: tag(pair, 2), seed: 1});
  assert.deepEqual(new Set(guards(reversed).map(e => e.targetId)), new Set(reversed.teams.B.mercenaries.map(m => m.id)));
  const mixed = pvp(tag(pair), 1, tag(pair[0], 2, HELIOS_R_SUPPORT));
  const both = guards(mixed).filter(e => e.vehicleSupportHit === 'HELIOS_R');
  assert.ok(both.length && both.every(e => e.actorId.startsWith('B:MERCENARY:') && e.targetId.startsWith('A:MERCENARY:')));
  const combo = guards(mixed).find(e => e.speedCombo);
  assert.ok(combo.hits.length >= 2);
  assert.equal(combo.hits.reduce((sum, hit) => sum + amount(hit), 0), amount(combo));
  assert.ok(combo.hits.every(hit => !hit.vehicleSupportGuard));
});

test('the co-op party protects only its equipped owner, including when sides share the field', () => {
  const squads = coopSquads();
  squads[1].mercenary = tag(squads[1].mercenary, squads[1].ownerId);
  const {battleV2} = createCooperativeBattle({squads, seed: 1}).payload;
  const hits = guards(battleV2), own = battleV2.teams.A.mercenaries.find(m => m.ownerId === squads[1].ownerId);
  assert.ok(hits.length && hits.every(e => e.targetId === own.id));
});

test('garage appearances work independently of a buff, a mercenary or the other side', () => {
  const row = {code:'ASTRA_VOLT', name:'아스트라 볼트', image_url:'assets/tire/silver-cyan-hypercar-aura-v2.png'};
  const visual = garageTransit({VEHICLE_TRANSIT_FX:'1'}, 7, row);
  assert.equal(visual.image, '/' + row.image_url);
  assert.equal(garageTransit({}, 7, row), null);
  assert.equal(garageSupportText({VEHICLE_TRANSIT_FX:'1'}, row.code), '');
  assert.match(garageSupportText({AETHER_ZERO_BATTLE_SUPPORT:'1'}, 'AETHER_ZERO'), /팬텀 베일.*공격력 \+20%.*방어력 \+20%/);
  const p = createPveBattleV2({cards, monster: boss, pveEquipmentRuntime:{vehicleTransit:visual}, seed:1});
  assert.deepEqual(p.teams.A.vehicleTransit, visual);
  assert.deepEqual(p.result.timeline, createPveBattleV2({cards, monster:boss, seed:1}).result.timeline);
  const b = createPvpBattleV2({attackerCards:cards, defenderCards:enemies, defenderVehicleTransit:visual, seed:1});
  assert.deepEqual(b.teams.B.vehicleTransit, visual);
  assert.equal(b.teams.A.vehicleTransit, undefined);
  assert.equal(guards(b).length, 0);
  assert.equal(vehicleTransitSnapshot({...visual, version:0}), null);
  assert.equal(vehicleTransitSnapshot({...visual, ownerId:-2}), null);
  assert.equal(vehicleTransitSnapshot({...visual, image:'javascript:invalid'}).image, '');
  assert.equal(vehicleTransitSnapshot({...visual, image:'https://art.example.com/garage.png'}).image, 'https://art.example.com/garage.png');
});

test('unrelated actors and unsupported or mismatched replay tags are inert', () => {
  const vehicleSupport = tag(pair[0]).vehicleSupport;
  for (const patch of [{isMercenary:false}, {ownerId:2}, {vehicleSupport:{...vehicleSupport, version:99}},
    {vehicleSupport:{...vehicleSupport, ownerId:0}}, {vehicleSupport:{...vehicleSupport, vehicle:'OTHER'}}]) {
    assert.equal(mercenaryVehicleSupport({isMercenary:true, vehicleSupport, ...patch}), null);
  }
  assert.deepEqual(pve(pair.map(row => ({...row, vehicleSupport:{...vehicleSupport, version:9}}))).result.timeline, pve(pair).result.timeline);
});

test('ranked duo caches the garage item per owner even with no mercenaries', async t => {
  const f = await duoFixture(t);
  await f.ready();
  for (const field of ['code','name','image_url']) await f.p('ALTER TABLE character_garage_items ADD COLUMN ' + field + ' TEXT').run();
  await f.p("INSERT INTO character_garage_items(id,pvp_power,is_active,code,name,image_url) VALUES(2,100,1,'GARAGE_TEST','시연 차량','assets/tire/1.jpeg')").run();
  await f.p('INSERT INTO user_garage_vehicles(user_id,garage_id) VALUES(2,2)').run();
  await f.p('INSERT INTO user_garage_loadout(user_id,garage_id) VALUES(2,2)').run();
  const profiles = () => loadDuoProfiles(f.env,[2,3,4,5],f.config,f.deps,{now:f.clock()});
  assert.equal((await profiles())[0].attack.vehicleTransit,undefined);
  f.env.VEHICLE_TRANSIT_FX = '1';
  const members = await profiles();
  const home = members.find(p => p.userId === 2);
  assert.deepEqual(home.attack.vehicleTransit, home.defense.vehicleTransit);
  assert.equal(home.attack.vehicleTransit.vehicle, 'GARAGE_TEST');
  const b = createDuoBattleV2({attackerSquads:members.slice(0,2).map(p=>p.attack),defenderSquads:members.slice(2).map(p=>p.defense),seed:7});
  const visible = [...b.teams.A.members,...b.teams.B.members].filter(m=>m.vehicleTransit);
  assert.deepEqual(visible.map(m=>m.vehicleTransit.ownerId),[2]);
});

for (const postgres of [false, true]) {
  test((postgres ? 'PostgreSQL' : 'SQLite') + ' binds both saved formations to the owned, active garage selection at entry', async t => {
    const f = await mercenaryFixture(t, {postgres});
    const schema = `CREATE TABLE IF NOT EXISTS character_garage_items(id INTEGER PRIMARY KEY,code TEXT,is_active INTEGER);
      CREATE TABLE IF NOT EXISTS user_garage_vehicles(user_id INTEGER,garage_id INTEGER);
      CREATE TABLE IF NOT EXISTS user_garage_loadout(user_id INTEGER,garage_id INTEGER);`;
    if (postgres) await f.pg.exec(schema); else f.DB.sql.exec(schema);
    for (const sql of [
      "INSERT INTO character_garage_items(id,code,is_active) VALUES(34,'AETHER_ZERO',1),(37,'HELIOS_R',1),(38,'AETHER_ZERO',0)",
      'INSERT INTO user_garage_vehicles(user_id,garage_id) VALUES(7,34),(7,37),(8,38)',
      'INSERT INTO user_garage_loadout(user_id,garage_id) VALUES(7,34),(8,38),(9,34)',
      "INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,'V-001',1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
    ]) await f.p(sql).run();
    const rosters = new Map([[7,pair],[8,pair],[9,pair]]);
    const lookup = () => readEquippedVehicleSupports(f.env, rosters);
    assert.equal((await lookup()).size, 0);
    f.env.AETHER_ZERO_BATTLE_SUPPORT = '1';
    assert.deepEqual([...(await lookup()).keys()], [7]);
    for (const mode of ['PVE','PVP']) {
      await saveMercenaryLoadout(f.env,f.user,{mode,mercenaryCodes:['V-001'],revision:0,requestId:crypto.randomUUID()});
      const snapshot = (await releasedMercenaryFormation(f.env,f.user,mode)).mercenaries[0];
      assert.deepEqual(snapshot.vehicleSupport, tag(pair[0],7).vehicleSupport);
    }
    const frozen = attachVehicleSupports(rosters, await lookup()).get(7);
    await f.p('UPDATE user_garage_loadout SET garage_id=37 WHERE user_id=7').run();
    assert.equal((await lookup()).size, 0);
    f.env.HELIOS_R_BATTLE_SUPPORT = '1';
    assert.equal((await lookup()).get(7), HELIOS_R_SUPPORT);
    assert.ok(frozen.every(row => row.vehicleSupport.vehicle === 'AETHER_ZERO'));
  });
}

test('all four authored transit layers and the three Aether sprites match their shipped hashes', async () => {
  for (const [folder, expected] of [['vehicle-transit-v1',['gate','pressure','wake','bloom']],['aether-zero-v1',['aircraft','wings','refraction']]]) {
    const dir = 'assets/effects/' + folder + '/';
    const manifest = JSON.parse(await readFile(dir + 'manifest.json'));
    assert.deepEqual(manifest.art.map(item => item.role), expected);
    for (const asset of manifest.art) {
      for (const [key, shipped] of [['runtime',true],['source',false]]) {
        const item = asset[key], file = dir + item.file;
        assert.equal(isProductionFile(file), shipped);
        assert.equal(item.hasAlpha, true);
        assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'), item.sha256);
      }
    }
    assert.equal(isProductionFile(dir + 'manifest.json'), false);
  }
  assert.equal(isProductionFile('preview/aether-zero-support-v1/pve.json'), false);
});
