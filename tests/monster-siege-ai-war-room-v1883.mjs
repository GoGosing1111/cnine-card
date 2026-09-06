import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { __siegeAiTest } from "../functions/_siege.js";

const {
  cleanSettings,
  monsterAiPlan,
  monsterAiProfile,
  monsterFormation,
  activeMonsterEffect,
  publicCampaign,
  phasePowerFor,
  calculatePlayerSiegeDamage,
  adminFormationCatalog,
  siegeEnergySnapshot,
  databaseNowSql,
} = __siegeAiTest;
assert.equal(databaseNowSql({ DB: { dialect: "postgres" } }), "NOW()");
assert.equal(databaseNowSql({ DB: { dialect: "sqlite" } }), "CURRENT_TIMESTAMP");
const cfg = cleanSettings({
  monsterAiEnabled: true,
  allianceFortressHp: 20_000_000,
  monsterAttackIntervalSeconds: 45,
  monsterAttackPowerPercent: 100,
});
const now = Date.parse("2026-08-28T03:00:00.000Z");
const baseEvent = {
  id: 77,
  status: "ACTIVE",
  version: 4,
  rally_ends_at: "2026-08-28T02:00:00.000Z",
  alliance_hp: 20_000_000,
  alliance_max_hp: 20_000_000,
  phase_index: 0,
  phase_hp: 1_200_000,
  phase_max_hp: 1_200_000,
  monster_ai_sequence: 0,
  next_monster_action_at: new Date(now - 4 * 45_000).toISOString(),
};

const tunedCfg = cleanSettings({
  siegeDamagePercent: 100,
  winContributionPercent: 120,
  defeatContributionPercent: 20,
  siegeDamageMin: 1000,
  siegeDamageMax: 50000,
  siegeDamageVariancePercent: 0,
  phases: [
    {
      allianceHp: 25000000,
      hp: 1800000,
      battlePower: 10000,
      damageMultiplierPercent: 150,
      defensePowers: [11111, 22222, 33333],
      assaultPowers: [14000, 15000, 16000],
      ai: {
        attackPercent: 0.45,
        skillMultiplier: 3.25,
        skillEvery: 3,
        healPercent: 2.5,
        shieldPercent: 31,
        shieldSeconds: 140,
      },
    },
  ],
});
const legacyCfg = cleanSettings({ allianceFortressHp: 31_000_000 });
assert.ok(
  legacyCfg.phases.every((phase) => phase.allianceHp === 31_000_000),
  "legacy global alliance HP must hydrate every phase until per-phase values are saved",
);
assert.equal(tunedCfg.phases[0].allianceHp, 25000000);
assert.deepEqual(tunedCfg.phases[0].defensePowers, [11111, 22222, 33333]);
assert.deepEqual(tunedCfg.phases[0].assaultPowers, [14000, 15000, 16000]);
assert.equal(tunedCfg.phases[0].ai.attackPercent, 0.45);
assert.equal(tunedCfg.phases[0].ai.skillMultiplier, 3.25);
assert.equal(
  phasePowerFor(
    tunedCfg.phases[0],
    "DEFENSE",
    1,
    monsterFormation("OUTER").defense[1],
  ),
  22222,
);
const tunedDamage = calculatePlayerSiegeDamage({
  playerPower: 10000,
  result: "WIN",
  cfg: tunedCfg,
  phase: tunedCfg.phases[0],
  seed: 1,
});
assert.equal(tunedDamage.damage, 18000);
assert.equal(tunedDamage.phaseMultiplierPercent, 150);
assert.equal(adminFormationCatalog(tunedCfg)[0].defense[1].battlePower, 22222);

const attackRuleCfg = cleanSettings({
  attackCountMax: 5,
  attackRechargeMinutes: 3,
});
assert.equal(attackRuleCfg.attackCountMax, 5);
assert.equal(attackRuleCfg.attackRechargeMinutes, 3);
const energyNow = Date.parse("2026-08-28T03:00:00.000Z");
const recharged = siegeEnergySnapshot(
  {
    energy: 0,
    energy_updated_at: "2026-08-28T02:53:00.000Z",
  },
  attackRuleCfg,
  energyNow,
);
assert.equal(recharged.energy, 2, "one attack charge regenerates every three minutes");
assert.equal(recharged.maxEnergy, 5);
assert.equal(recharged.rechargeSeconds, 180);
assert.equal(recharged.nextRechargeAt, "2026-08-28T03:02:00.000Z");

const catchup = monsterAiPlan({ event: baseEvent, cfg, now });
assert.ok(catchup, "a due monster assault force must produce an action plan");
assert.equal(catchup.dueTicks, 5, "offline time is caught up as one atomic five-wave assault");
assert.equal(catchup.skillCount, 1, "the OUTER assault force uses its operation every fourth action");
assert.equal(catchup.actionType, "SKILL");
assert.equal(catchup.profile.code, "PACK_HUNT");
assert.equal(catchup.assaultUnit.id.startsWith("OUTER-A"), true);
assert.ok(catchup.damage > 0 && catchup.allianceHpAfter < catchup.allianceHpBefore);
assert.ok(Date.parse(catchup.nextActionAt) > now);

const guardProfile = monsterAiProfile("GUARD");
const guard = monsterAiPlan({
  cfg,
  now,
  event: {
    ...baseEvent,
    phase_index: 3,
    phase_hp: 2_000_000,
    phase_max_hp: 4_800_000,
    monster_ai_sequence: guardProfile.skillEvery - 1,
    next_monster_action_at: new Date(now).toISOString(),
  },
});
assert.equal(guard.profile.code, "ROYAL_BULWARK");
assert.equal(guard.skillCount, 1);
assert.ok(guard.heal > 0, "the defense formation restores monster faction front HP");
assert.equal(guard.effect.percent, 28);
assert.equal(activeMonsterEffect({
  monster_effect_code: guard.effect.code,
  monster_effect_percent: guard.effect.percent,
  monster_effect_ends_at: guard.effect.endsAt,
}, now)?.percent, 28);

const guardFormation = monsterFormation("GUARD");
assert.equal(guardFormation.defense.length, 3);
assert.equal(guardFormation.assault.length, 3);
assert.notDeepEqual(
  guardFormation.defense.map((unit) => unit.id),
  guardFormation.assault.map((unit) => unit.id),
  "monster defense and assault formations must be separate rosters",
);

const campaign = publicCampaign(cfg, {
  ...baseEvent,
  phase_index: 3,
  phase_hp: 3_184_000,
  phase_max_hp: 4_800_000,
  alliance_hp: 12_740_000,
  monster_ai_sequence: 47,
});
assert.equal(campaign.mode, "TERRITORY_FRONTLINE");
assert.equal(campaign.nodes.length, 6, "alliance base plus five monster fronts must be visible");
assert.equal(campaign.currentFront.nodeIndex, 4);
assert.equal(campaign.nodes[3].status, "ALLIANCE");
assert.equal(campaign.nodes[4].status, "CONTESTED");
assert.equal(campaign.nodes[5].status, "MONSTER");
assert.equal(campaign.factions.alliance.hp, 12_740_000);
assert.equal(campaign.factions.monster.hp, 3_184_000);
assert.equal(campaign.formations.defense.units.length, 3);
assert.equal(campaign.formations.assault.units.length, 3);
assert.equal(campaign.formations.assault.targetNodeIndex, 3);
assert.ok(campaign.formations.defense.units.every((unit) => !("hp" in unit)));
assert.ok(campaign.formations.assault.units.every((unit) => !("hp" in unit)));

assert.equal(monsterAiPlan({ event: baseEvent, cfg: { ...cfg, monsterAiEnabled: false }, now }), null);
assert.equal(
  monsterAiPlan({
    event: { ...baseEvent, next_monster_action_at: new Date(now + 1_000).toISOString() },
    cfg,
    now,
  }),
  null,
);

const [server, apiRouter, client, battleLive, app, css, index, preview, admin, adminCss, adminIndex, migration, rules, agents] = await Promise.all([
  readFile(new URL("../functions/_siege.js", import.meta.url), "utf8"),
  readFile(new URL("../functions/api/[[path]].js", import.meta.url), "utf8"),
  readFile(new URL("../js/monster-siege-v1505.js", import.meta.url), "utf8"),
  readFile(new URL("../js/battle-v3-live.js", import.meta.url), "utf8"),
  readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  readFile(new URL("../css/monster-siege-v1887.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../preview/monster-siege-ai-v1883/index.html", import.meta.url), "utf8"),
  readFile(new URL("../admin/monster-siege-admin-v1505.js", import.meta.url), "utf8"),
  readFile(new URL("../admin/monster-siege-admin-v1890.css", import.meta.url), "utf8"),
  readFile(new URL("../admin/index.html", import.meta.url), "utf8"),
  readFile(new URL("../database/migrations/0085_v1883_monster_siege_ai_warfare.sql", import.meta.url), "utf8"),
  readFile(new URL("../docs/monster-siege-territory-war-standard.md", import.meta.url), "utf8"),
  readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
]);

assert.match(server, /monster_siege_ai_actions/);
assert.match(server, /WHERE id=\? AND version=\? AND status='ACTIVE'/, "AI writes use event-version CAS");
assert.match(server, /actionType = retreat \? "BREAKTHROUGH"/);
assert.match(server, /alliance_hp=\?,alliance_max_hp=\?/);
assert.match(server, /calculatePlayerSiegeDamage/);
assert.match(server, /phasePowerFor/);
assert.match(server, /attackRechargeMinutes/);
assert.doesNotMatch(server, /attackCooldownSeconds/);
assert.match(server, /defenseFormation = monsterFormation\(phase\.key\)\.defense/);
assert.match(server, /cardUniqueDeckState\(env, user, deck, "PVE"\)/, "siege cards must hydrate their unique effects");
assert.match(server, /cards: battleDeck/);
assert.match(server, /battlefieldMode: "SIEGE"/);
assert.match(apiRouter, /handleSiege\(\{path,request,env,deps:\{[^}]*cardUniqueDeckState/);
assert.match(client, /TACTICAL MAP/);
assert.match(client, /MONSTER DEFENSE FORCE/);
assert.match(client, /MONSTER ASSAULT FORCE/);
assert.match(client, /숲켓몬 연합 진영 체력/);
assert.match(client, /몬스터 군단 진영 체력/);
assert.match(client, /Date\.now\(\) - lastPollAt >= 5000/);
assert.match(client, /await window\.ensureFeatureResources\("battleV2"\)/, "mobile/direct siege entry must load the V3 battle feature first");
assert.ok(
  client.indexOf('await prepareMonsterSiegeBattle(modal, campaign, defender)') < client.indexOf('await api("siege/attack"'),
  "battle UI readiness must be confirmed before an attack can consume energy",
);
assert.match(client, /mode: "SIEGE"/);
assert.match(client, /data: \{ \.\.\.out, mode: "SIEGE", battlefieldMode: "SIEGE"/);
assert.doesNotMatch(client, /ms3-|ALLIANCE CITADEL|HOSTILE TARGET|>VS</);
assert.match(battleLive, /ability\?\.dominantType/);
assert.match(battleLive, /3\.31\.0-skill-chip-runtime/);
assert.match(app, /battle-v3-live\.js\?v=3\.31\.0-skill-chip-runtime/);
assert.match(css, /\.ms4-map-shell/);
assert.match(css, /\.ms4-map-unit/);
assert.match(css, /body\.monster-siege-open \.modal\.siege-v2-battle-modal/);
assert.match(css, /z-index: 100120 !important/);
assert.doesNotMatch(css, /rotate\(45deg\)/i);
assert.doesNotMatch(css, /clip-path/i);
assert.match(index, /monster-siege-v1887\.css\?v=1897-siege-battle-mobile/);
assert.match(index, /monster-siege-v1505\.js\?v=1897-siege-battle-mobile/);
assert.match(index, /js\/app\.js\?v=1991-battle-suit-sweep-result-front/);
assert.match(adminIndex, /monster-siege-admin-v1890\.css\?v=1890-frontline-balance-cms/);
assert.match(adminIndex, /monster-siege-admin-v1505\.js\?v=1893-postgres-timestamp-fix/);
assert.equal(
  (server.match(/updated_at=\$\{databaseNowSql\(env\)\}/g) || []).length,
  5,
  "every monster siege AI state update must preserve PostgreSQL timestamp types",
);
assert.match(preview, /mode:'TERRITORY_FRONTLINE'/);
assert.match(preview, /GUARD_DEFENSE/);
assert.match(preview, /GUARD_ASSAULT/);
assert.match(admin, /유저 공성 피해 공식/);
assert.match(admin, /const label = formationType === "Defense" \? "방어대" : "돌격대"/);
assert.match(admin, /개별 전투력/);
assert.match(admin, /돌격대 AI 세부 수치/);
assert.match(admin, /최대 공격권 \(회\)/);
assert.match(admin, /공격권 1회 충전 \(분\)/);
assert.doesNotMatch(admin, /유저 공격 재사용/);
assert.match(client, /rechargeRule/);
assert.match(client, /공격권 1개 사용/);
assert.doesNotMatch(client, /5분마다 1회/);
assert.match(client, /const markers = \[defense, assault\]\.filter\(Boolean\)/);
assert.match(client, /대표 방어대 1 \/ 돌격대 1/);
assert.match(admin, /msaPhase.*DefensePower/);
assert.doesNotMatch(admin, /step="100"/, "combat-power defaults must not fail native step validation");
assert.match(adminCss, /\.msa-unit-row/);
assert.doesNotMatch(adminCss, /rotate\(45deg\)/i);
assert.doesNotMatch(adminCss, /clip-path/i);
assert.match(migration, /CREATE TABLE IF NOT EXISTS monster_siege_ai_state/);
assert.doesNotMatch(migration, /ALTER TABLE monster_siege_events/);
assert.match(rules, /몬스터 진영은 AI가 돌격대와 방어대를 각각 운용/);
assert.match(rules, /마름모/);
assert.match(agents, /몬스터공성 고정 전황 규칙/);

console.log("monster siege territory-frontline, dual monster formations, and no-diamond UI checks passed");
