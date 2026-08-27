import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { __siegeAiTest } from "../functions/_siege.js";

const { cleanSettings, monsterAiPlan, monsterAiProfile, activeMonsterEffect } = __siegeAiTest;
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
assert.ok(catchup, "a due AI front must produce an action plan");
assert.equal(catchup.dueTicks, 5, "offline time is caught up as one atomic five-wave assault");
assert.equal(catchup.skillCount, 1, "the OUTER monster uses its operation every fourth action");
assert.equal(catchup.actionType, "SKILL");
assert.equal(catchup.profile.code, "PACK_HUNT");
assert.ok(catchup.damage > 0 && catchup.allianceHpAfter < catchup.allianceHpBefore);
assert.ok(Date.parse(catchup.nextActionAt) > now, "the next action is scheduled after the catch-up window");

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
assert.ok(guard.heal > 0, "royal bulwark heals its own front");
assert.equal(guard.effect.percent, 28, "royal bulwark applies its damage-reduction field");
assert.equal(activeMonsterEffect({
  monster_effect_code: guard.effect.code,
  monster_effect_percent: guard.effect.percent,
  monster_effect_ends_at: guard.effect.endsAt,
}, now)?.percent, 28);

assert.equal(monsterAiPlan({ event: baseEvent, cfg: { ...cfg, monsterAiEnabled: false }, now }), null);
assert.equal(monsterAiPlan({ event: { ...baseEvent, next_monster_action_at: new Date(now + 1_000).toISOString() }, cfg, now }), null);

const [server, client, css, index, admin, migration] = await Promise.all([
  readFile(new URL("../functions/_siege.js", import.meta.url), "utf8"),
  readFile(new URL("../js/monster-siege-v1505.js", import.meta.url), "utf8"),
  readFile(new URL("../css/monster-siege-v1883.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../admin/monster-siege-admin-v1505.js", import.meta.url), "utf8"),
  readFile(new URL("../database/migrations/0085_v1883_monster_siege_ai_warfare.sql", import.meta.url), "utf8"),
]);

assert.match(server, /monster_siege_ai_actions/);
assert.match(server, /WHERE id=\? AND version=\? AND status='ACTIVE'/, "AI writes use event-version CAS");
assert.match(server, /monsterDamageReductionPercent/);
assert.match(client, /HOSTILE OPERATION FORECAST/);
assert.match(client, /Date\.now\(\) - lastPollAt >= 5000/);
assert.match(client, /ms3-operation-briefing/);
assert.match(css, /\.ms3-frontline/);
assert.match(css, /\.ms3-console/);
assert.match(index, /monster-siege-v1883\.css\?v=1883-ai-war-room/);
assert.match(index, /monster-siege-v1505\.js\?v=1883-ai-war-room/);
assert.match(admin, /msaAiEnabled/);
assert.match(admin, /msaAllianceHp/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS monster_siege_ai_actions/);

console.log("monster siege AI warfare and war-room UI regression checks passed");
