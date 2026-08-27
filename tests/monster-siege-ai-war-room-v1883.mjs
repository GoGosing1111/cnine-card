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
} = __siegeAiTest;
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

const [server, client, css, index, preview, admin, migration, rules, agents] = await Promise.all([
  readFile(new URL("../functions/_siege.js", import.meta.url), "utf8"),
  readFile(new URL("../js/monster-siege-v1505.js", import.meta.url), "utf8"),
  readFile(new URL("../css/monster-siege-v1887.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../preview/monster-siege-ai-v1883/index.html", import.meta.url), "utf8"),
  readFile(new URL("../admin/monster-siege-admin-v1505.js", import.meta.url), "utf8"),
  readFile(new URL("../database/migrations/0085_v1883_monster_siege_ai_warfare.sql", import.meta.url), "utf8"),
  readFile(new URL("../docs/monster-siege-territory-war-standard.md", import.meta.url), "utf8"),
  readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
]);

assert.match(server, /monster_siege_ai_actions/);
assert.match(server, /WHERE id=\? AND version=\? AND status='ACTIVE'/, "AI writes use event-version CAS");
assert.match(server, /actionType = retreat \? "BREAKTHROUGH"/);
assert.match(server, /alliance_hp=alliance_max_hp/);
assert.match(server, /defenseFormation = monsterFormation\(phase\.key\)\.defense/);
assert.match(client, /TACTICAL CAMPAIGN MAP/);
assert.match(client, /MONSTER DEFENSE FORCE/);
assert.match(client, /MONSTER ASSAULT FORCE/);
assert.match(client, /숲켓몬 연합 진영 체력/);
assert.match(client, /몬스터 군단 진영 체력/);
assert.match(client, /Date\.now\(\) - lastPollAt >= 5000/);
assert.doesNotMatch(client, /ms3-|ALLIANCE CITADEL|HOSTILE TARGET|>VS</);
assert.match(css, /\.ms4-map-shell/);
assert.match(css, /\.ms4-map-unit/);
assert.doesNotMatch(css, /rotate\(45deg\)/i);
assert.doesNotMatch(css, /clip-path/i);
assert.match(index, /monster-siege-v1887\.css\?v=1888-territory-frontline/);
assert.match(index, /monster-siege-v1505\.js\?v=1888-territory-frontline/);
assert.match(preview, /mode:'TERRITORY_FRONTLINE'/);
assert.match(preview, /GUARD_DEFENSE/);
assert.match(preview, /GUARD_ASSAULT/);
assert.match(admin, /연합 진영 최대 HP/);
assert.match(admin, /돌격대 공격 간격/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS monster_siege_ai_state/);
assert.doesNotMatch(migration, /ALTER TABLE monster_siege_events/);
assert.match(rules, /몬스터 진영은 AI가 돌격대와 방어대를 각각 운용/);
assert.match(rules, /마름모/);
assert.match(agents, /몬스터공성 고정 전황 규칙/);

console.log("monster siege territory-frontline, dual monster formations, and no-diamond UI checks passed");
