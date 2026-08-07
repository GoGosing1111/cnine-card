const KEY = "monster_siege_settings_v1";
const SIEGE_ENERGY_MAX = 5;
const SIEGE_ENERGY_RECHARGE_SECONDS = 300;
const DEFAULTS = {
  mode: "TEST",
  name: "심연의 황혼 성채",
  durationMinutes: 360,
  rallyMinutes: 30,
  attackCooldownSeconds: 10,
  siegeDamagePercent: 100,
  defeatContributionPercent: 25,
  expectedPlayerPower: 20000,
  perBattleWinCoin: 3000,
  perBattleWinShards: 30,
  perBattleWinItems: [],
  rewardCoin: 50000,
  rewardShards: 500,
  finalRewardItems: [],
  minAttacks: 1,
  phases: [
    {
      key: "OUTER",
      name: "외곽 방어선",
      subtitle: "몬스터 군단을 돌파하라",
      hp: 1200000,
      startMinute: 0,
      monsterName: "흑철 송곳니 바르그",
      monsterImage: "/assets/siege/phase-1-outer.webp",
      battlePower: 21000,
      isBoss: false,
    },
    {
      key: "GATE",
      name: "철혈의 성문",
      subtitle: "공성 병기로 성문을 파괴하라",
      hp: 2400000,
      startMinute: 60,
      monsterName: "성문 파괴거인 골가스",
      monsterImage: "/assets/siege/phase-2-gate.webp",
      battlePower: 25000,
      isBoss: true,
    },
    {
      key: "INNER",
      name: "불타는 성내",
      subtitle: "마법탑과 병영을 무너뜨려라",
      hp: 3600000,
      startMinute: 120,
      monsterName: "잿불 첨탑의 마도사",
      monsterImage: "/assets/siege/phase-3-inner.webp",
      battlePower: 30000,
      isBoss: true,
    },
    {
      key: "GUARD",
      name: "성주 수호대",
      subtitle: "왕궁 계단의 정예군을 격파하라",
      hp: 4800000,
      startMinute: 240,
      monsterName: "월식의 왕실 수호자",
      monsterImage: "/assets/siege/phase-4-guard.webp",
      battlePower: 36000,
      isBoss: true,
    },
    {
      key: "LORD",
      name: "심연의 성주",
      subtitle: "붉은 달 아래 최후의 결전",
      hp: 7200000,
      startMinute: 300,
      monsterName: "심연의 월식 성주",
      monsterImage: "/assets/siege/phase-5-lord.webp",
      battlePower: 44000,
      isBoss: true,
    },
  ],
};
const jsonSafe = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
const clamp = (value, min, max, fallback = min) => {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.max(min, Math.min(max, Math.floor(n)))
    : fallback;
};
const cleanRewardItems = (items) => {
  const merged = new Map();
  for (const item of Array.isArray(items) ? items.slice(0, 10) : []) {
    const code = String(item?.code || item?.itemCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 80);
    const quantity = clamp(item?.quantity, 1, 100000, 1);
    if (code) merged.set(code, Math.min(100000, (merged.get(code) || 0) + quantity));
  }
  return [...merged].map(([code, quantity]) => ({ code, quantity }));
};
const cleanSettings = (raw) => {
  const phases = Array.from({ length: 5 }, (_, i) => {
    const base = DEFAULTS.phases[i],
      x = raw?.phases?.[i] || {};
    return {
      ...base,
      name: String(x.name || base.name)
        .trim()
        .slice(0, 40),
      subtitle: String(x.subtitle || base.subtitle)
        .trim()
        .slice(0, 80),
      hp: clamp(x.hp, 1000, 2000000000, base.hp),
      battlePower: clamp(x.battlePower, 1, 2000000000, base.battlePower),
      startMinute: base.startMinute,
    };
  });
  return {
    mode: ["OFF", "TEST", "ON"].includes(String(raw?.mode || "").toUpperCase())
      ? String(raw.mode).toUpperCase()
      : DEFAULTS.mode,
    name: String(raw?.name || DEFAULTS.name)
      .trim()
      .slice(0, 50),
    durationMinutes: clamp(raw?.durationMinutes, 30, 10080, 360),
    rallyMinutes: clamp(raw?.rallyMinutes, 1, 1440, 30),
    attackCooldownSeconds: clamp(raw?.attackCooldownSeconds, 2, 300, 10),
    siegeDamagePercent: clamp(raw?.siegeDamagePercent, 1, 1000, 100),
    defeatContributionPercent: clamp(raw?.defeatContributionPercent, 0, 100, 25),
    expectedPlayerPower: clamp(raw?.expectedPlayerPower, 1, 2000000000, 20000),
    perBattleWinCoin: clamp(raw?.perBattleWinCoin, 0, 100000000, 3000),
    perBattleWinShards: clamp(raw?.perBattleWinShards, 0, 100000000, 30),
    perBattleWinItems: cleanRewardItems(raw?.perBattleWinItems),
    rewardCoin: clamp(raw?.rewardCoin, 0, 100000000, 50000),
    rewardShards: clamp(raw?.rewardShards, 0, 100000000, 500),
    finalRewardItems: cleanRewardItems(raw?.finalRewardItems),
    minAttacks: clamp(raw?.minAttacks, 1, 1000, 1),
    phases,
  };
};
let ensurePromise = null;
async function ensure(env) {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await env.DB.batch([
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS monster_siege_events(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',phase_index INTEGER NOT NULL DEFAULT 0,phase_hp INTEGER NOT NULL,phase_max_hp INTEGER NOT NULL,total_damage INTEGER NOT NULL DEFAULT 0,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,completed_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS monster_siege_users(event_id INTEGER NOT NULL,user_id INTEGER NOT NULL,deck_snapshot TEXT NOT NULL DEFAULT '[]',deck_power INTEGER NOT NULL DEFAULT 0,attacks INTEGER NOT NULL DEFAULT 0,damage INTEGER NOT NULL DEFAULT 0,energy INTEGER NOT NULL DEFAULT 5,energy_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_attack_at TEXT,joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(event_id,user_id))`,
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS monster_siege_actions(request_id TEXT PRIMARY KEY,event_id INTEGER NOT NULL,user_id INTEGER NOT NULL,phase_index INTEGER NOT NULL,damage INTEGER NOT NULL DEFAULT 0,result_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS monster_siege_rewards(event_id INTEGER NOT NULL,user_id INTEGER NOT NULL,coin INTEGER NOT NULL DEFAULT 0,shards INTEGER NOT NULL DEFAULT 0,claimed_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(event_id,user_id))`,
      ),
      env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_monster_siege_event_status ON monster_siege_events(status,id DESC)`,
      ),
      env.DB.prepare(
        `CREATE INDEX IF NOT EXISTS idx_monster_siege_rank ON monster_siege_users(event_id,damage DESC)`,
      ),
    ]);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)",
    )
      .bind(KEY, JSON.stringify(DEFAULTS))
      .run();
    try {
      await env.DB.prepare(
        "ALTER TABLE monster_siege_rewards ADD COLUMN items_json TEXT NOT NULL DEFAULT '[]'",
      ).run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error?.message || error))) throw error;
    }
    try {
      await env.DB.prepare(
        "ALTER TABLE monster_siege_events ADD COLUMN rally_ends_at TEXT",
      ).run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error?.message || error))) throw error;
    }
    for (const sql of [
      "ALTER TABLE monster_siege_users ADD COLUMN energy INTEGER NOT NULL DEFAULT 5",
      "ALTER TABLE monster_siege_users ADD COLUMN energy_updated_at TEXT",
    ]) {
      try { await env.DB.prepare(sql).run(); }
      catch (error) { if (!/duplicate column/i.test(String(error?.message || error))) throw error; }
    }
    await env.DB.prepare("UPDATE monster_siege_users SET energy=MIN(5,MAX(0,COALESCE(energy,5))),energy_updated_at=COALESCE(energy_updated_at,updated_at,joined_at,CURRENT_TIMESTAMP) WHERE energy_updated_at IS NULL OR energy IS NULL OR energy<0 OR energy>5").run();
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });
  return ensurePromise;
}
async function settings(env) {
  await ensure(env);
  const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key=?")
    .bind(KEY)
    .first();
  return cleanSettings(jsonSafe(row?.value, {}));
}
async function territoryBenchmark(env) {
  try {
    const rows = (
      await env.DB.prepare(
        `SELECT r.id,COUNT(u.user_id) participants,COALESCE(SUM(u.attacks),0) attacks,ROUND(MAX(0,(julianday(COALESCE(r.settled_at,r.ends_at,r.updated_at))-julianday(COALESCE(r.starts_at,r.created_at)))*24),1) hours
         FROM territory_war_v3_rounds r LEFT JOIN territory_war_v3_users u ON u.round_id=r.id
         WHERE r.status IN ('FINISHED','COMPLETED') GROUP BY r.id ORDER BY r.id DESC LIMIT 5`,
      ).all()
    ).results || [];
    if (!rows.length) return { rounds: 0, averageParticipants: 0, averageAttacks: 0, averageHours: 0 };
    const average = (key) =>
      Math.round(
        (rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) /
          rows.length) *
          10,
      ) / 10;
    return {
      rounds: rows.length,
      averageParticipants: average("participants"),
      averageAttacks: average("attacks"),
      averageHours: average("hours"),
    };
  } catch {
    return { rounds: 0, averageParticipants: 0, averageAttacks: 0, averageHours: 0 };
  }
}
async function createEvent(env, cfg) {
  const first = cfg.phases[0],
    rallyEnd = `+${cfg.rallyMinutes} minutes`,
    end = `+${cfg.rallyMinutes + cfg.durationMinutes} minutes`;
  const result = await env.DB.prepare(
    "INSERT INTO monster_siege_events(name,status,phase_index,phase_hp,phase_max_hp,starts_at,rally_ends_at,ends_at) VALUES(?,'ACTIVE',0,?,?,CURRENT_TIMESTAMP,datetime('now',?),datetime('now',?))",
  )
    .bind(cfg.name, first.hp, first.hp, rallyEnd, end)
    .run();
  return env.DB.prepare("SELECT * FROM monster_siege_events WHERE id=?")
    .bind(result.meta.last_row_id)
    .first();
}
async function settle(env, event, cfg, status) {
  const participants =
      (
        await env.DB.prepare(
          "SELECT user_id,attacks,damage FROM monster_siege_users WHERE event_id=?",
        )
          .bind(event.id)
          .all()
      ).results || [],
    success = status === "CLEARED",
    statements = [];
  for (const row of participants) {
    const eligible = Number(row.attacks) >= cfg.minAttacks,
      ratio = success ? 1 : 0.35,
      coin = eligible ? Math.floor(cfg.rewardCoin * ratio) : 0,
      shards = eligible ? Math.floor(cfg.rewardShards * ratio) : 0,
      items = eligible && success ? cfg.finalRewardItems : [];
    statements.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO monster_siege_rewards(event_id,user_id,coin,shards,items_json) VALUES(?,?,?,?,?)",
      ).bind(event.id, row.user_id, coin, shards, JSON.stringify(items)),
    );
  }
  statements.push(
    env.DB.prepare(
      "UPDATE monster_siege_events SET status=?,completed_at=CURRENT_TIMESTAMP,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
    ).bind(status, event.id),
  );
  if (statements.length) await env.DB.batch(statements);
}
async function activeEvent(env, cfg, { create = true } = {}) {
  let event = await env.DB.prepare(
    "SELECT * FROM monster_siege_events WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1",
  ).first();
  if (event && Date.parse(`${event.ends_at}Z`) <= Date.now()) {
    await settle(env, event, cfg, "FAILED");
    event = null;
  }
  if (!event && create && cfg.mode !== "OFF")
    event = await createEvent(env, cfg);
  return event;
}
function publicPhase(cfg, event) {
  const index = Math.max(0, Math.min(4, Number(event?.phase_index || 0))),
    phase = cfg.phases[index];
  return {
    ...phase,
    index,
    hp: Number(event?.phase_hp || phase.hp),
    maxHp: Number(event?.phase_max_hp || phase.hp),
    percent: Math.max(
      0,
      Math.min(
        100,
        (Number(event?.phase_hp || 0) /
          Math.max(1, Number(event?.phase_max_hp || 1))) *
          100,
      ),
    ),
  };
}
function siegeEnergySnapshot(row, now = Date.now()) {
  const stored = Math.max(0, Math.min(SIEGE_ENERGY_MAX, Number(row?.energy ?? SIEGE_ENERGY_MAX)));
  const rawUpdated = row?.energy_updated_at || row?.updated_at || row?.joined_at;
  const updatedMs = rawUpdated ? Date.parse(String(rawUpdated).endsWith("Z") ? rawUpdated : `${rawUpdated}Z`) : now;
  const intervalMs = SIEGE_ENERGY_RECHARGE_SECONDS * 1000;
  const gained = stored >= SIEGE_ENERGY_MAX ? 0 : Math.max(0, Math.floor((now - updatedMs) / intervalMs));
  const energy = Math.min(SIEGE_ENERGY_MAX, stored + gained);
  const anchorMs = gained > 0 ? updatedMs + gained * intervalMs : updatedMs;
  return {
    energy,
    maxEnergy: SIEGE_ENERGY_MAX,
    rechargeSeconds: SIEGE_ENERGY_RECHARGE_SECONDS,
    nextRechargeAt: energy >= SIEGE_ENERGY_MAX ? null : new Date(anchorMs + intervalMs).toISOString(),
    anchorAt: new Date(energy >= SIEGE_ENERGY_MAX ? now : anchorMs).toISOString().replace("T", " ").replace("Z", ""),
    gained,
  };
}
async function refreshSiegeEnergy(env, eventId, userId, row) {
  const snapshot = siegeEnergySnapshot(row);
  if (snapshot.gained > 0 || Number(row?.energy ?? SIEGE_ENERGY_MAX) !== snapshot.energy || !row?.energy_updated_at) {
    await env.DB.prepare("UPDATE monster_siege_users SET energy=?,energy_updated_at=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=?")
      .bind(snapshot.energy, snapshot.anchorAt, eventId, userId).run();
  }
  return snapshot;
}
async function state(env, user, cfg, event) {
  const rallyEndsAt = event?.rally_ends_at || event?.starts_at || null,
    rallyOpen = Boolean(event && Date.parse(`${rallyEndsAt}Z`) > Date.now()),
    mine = event
      ? await env.DB.prepare(
          "SELECT * FROM monster_siege_users WHERE event_id=? AND user_id=?",
        )
          .bind(event.id, user.id)
          .first()
      : null,
    ranking = event
      ? (
          await env.DB.prepare(
            "SELECT s.user_id,u.nickname,s.damage,s.attacks FROM monster_siege_users s JOIN users u ON u.id=s.user_id WHERE s.event_id=? ORDER BY s.damage DESC,s.attacks DESC LIMIT 20",
          )
            .bind(event.id)
            .all()
        ).results
      : [],
    reward = await env.DB.prepare(
      "SELECT * FROM monster_siege_rewards WHERE user_id=? AND claimed_at IS NULL ORDER BY event_id DESC LIMIT 1",
    )
      .bind(user.id)
      .first();
  const energy = mine ? await refreshSiegeEnergy(env, event.id, user.id, mine) : null;
  return {
    settings: cfg,
    event: event
      ? {
          id: event.id,
          name: event.name,
          status: event.status,
          startsAt: event.starts_at,
          rallyEndsAt,
          rallyOpen,
          stage: rallyOpen ? "RALLY" : "BATTLE",
          endsAt: event.ends_at,
          totalDamage: Number(event.total_damage || 0),
          phaseIndex: Number(event.phase_index || 0),
        }
      : null,
    phase: event ? publicPhase(cfg, event) : null,
    mine: mine
      ? {
          joined: true,
          deckPower: Number(mine.deck_power || 0),
          attacks: Number(mine.attacks || 0),
          damage: Number(mine.damage || 0),
          lastAttackAt: mine.last_attack_at,
          energy: energy.energy,
          maxEnergy: energy.maxEnergy,
          rechargeSeconds: energy.rechargeSeconds,
          nextRechargeAt: energy.nextRechargeAt,
        }
      : null,
    ranking,
    reward: reward
      ? {
          ...reward,
          items: cleanRewardItems(jsonSafe(reward.items_json, [])),
        }
      : null,
    serverNow: new Date().toISOString(),
  };
}
export async function handleSiege({ path, request, env, deps }) {
  if (!path.startsWith("siege/") && !path.startsWith("admin/siege/"))
    return null;
  const {
    authenticate,
    readBody,
    json,
    isAdminRole,
    pveDeckSnapshot,
    battleSettings,
    cardBattlePower,
    createPveBattleV2,
    userEquipmentBonuses,
  } = deps;
  await ensure(env);
  const user = await authenticate(request, env);
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  const cfg = await settings(env);
  const adminPath = path.startsWith("admin/");
  if (adminPath && !isAdminRole(user))
    return json({ error: "관리자 권한이 필요합니다." }, 403);
  if (!adminPath && cfg.mode === "TEST" && !isAdminRole(user))
    return json({ error: "공성전 OWNER 테스트 중입니다." }, 403);
  if (path === "siege/state" && request.method === "GET") {
    const event = await activeEvent(env, cfg, { create: false });
    return json(await state(env, user, cfg, event));
  }
  if (path === "siege/join" && request.method === "POST") {
    if (cfg.mode === "OFF")
      return json({ error: "공성전이 중지되어 있습니다." }, 409);
    const event = await activeEvent(env, cfg, { create: false });
    if (!event)
      return json({ error: "CMS에서 공성전을 먼저 시작하세요." }, 409);
    const rallyEndsAt = event.rally_ends_at || event.starts_at;
    if (Date.parse(`${rallyEndsAt}Z`) <= Date.now())
      return json({ error: "집결 시간이 종료되어 더 이상 공성전에 참여할 수 없습니다." }, 409);
    const deck = await pveDeckSnapshot(env, user.id);
    if (deck.length !== 5)
      return json({ error: "PVE 덱 5장을 먼저 저장하세요." }, 400);
    const battleCfg = await battleSettings(env),
      power = deck.reduce(
        (sum, card) =>
          sum + cardBattlePower(card, card.breakthrough_level, battleCfg),
        0,
      );
    const joined = await env.DB.prepare(
      "INSERT INTO monster_siege_users(event_id,user_id,deck_snapshot,deck_power) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM monster_siege_events WHERE id=? AND status='ACTIVE' AND datetime(COALESCE(rally_ends_at,starts_at))>CURRENT_TIMESTAMP) ON CONFLICT(event_id,user_id) DO UPDATE SET deck_snapshot=excluded.deck_snapshot,deck_power=excluded.deck_power,updated_at=CURRENT_TIMESTAMP",
    )
      .bind(event.id, user.id, JSON.stringify(deck), power, event.id)
      .run();
    if (!Number(joined.meta?.changes || 0))
      return json({ error: "집결 시간이 종료되어 더 이상 공성전에 참여할 수 없습니다." }, 409);
    return json(await state(env, user, cfg, event));
  }
  if (path === "siege/attack" && request.method === "POST") {
    const body = await readBody(request),
      requestId = String(body.requestId || "")
        .trim()
        .slice(0, 120);
    if (!requestId) return json({ error: "공격 요청번호가 필요합니다." }, 400);
    const previous = await env.DB.prepare(
      "SELECT result_json FROM monster_siege_actions WHERE request_id=? AND user_id=?",
    )
      .bind(requestId, user.id)
      .first();
    if (previous?.result_json) return json(jsonSafe(previous.result_json, {}));
    if (previous) return json({ error: "동일한 공성 공격 요청을 처리 중입니다." }, 409);
    const event = await activeEvent(env, cfg, { create: false });
    if (!event) return json({ error: "진행 중인 공성전이 없습니다." }, 409);
    const rallyEndsAt = event.rally_ends_at || event.starts_at;
    if (Date.parse(`${rallyEndsAt}Z`) > Date.now())
      return json({ error: "현재 집결 중입니다. 집결 시간이 끝난 뒤 공격할 수 있습니다." }, 409);
    const mine = await env.DB.prepare(
      "SELECT * FROM monster_siege_users WHERE event_id=? AND user_id=?",
    )
      .bind(event.id, user.id)
      .first();
    if (!mine) return json({ error: "공성전에 먼저 참가하세요." }, 403);
    if (
      mine.last_attack_at &&
      Date.now() - Date.parse(`${mine.last_attack_at}Z`) <
        cfg.attackCooldownSeconds * 1000
    )
      return json(
        { error: `다음 공격까지 ${cfg.attackCooldownSeconds}초가 필요합니다.` },
        429,
      );
    const phase =
        cfg.phases[Math.max(0, Math.min(4, Number(event.phase_index || 0)))],
      battleCfg = await battleSettings(env),
      deck = jsonSafe(mine.deck_snapshot, []).map((card) => ({
        ...card,
        id: String(card.id),
        power: cardBattlePower(card, card.breakthrough_level, battleCfg),
      })),
      characterBonus =
        typeof userEquipmentBonuses === "function"
          ? await userEquipmentBonuses(env, user.id)
          : { pve: 0 };
    if (deck.length !== 5)
      return json(
        { error: "참가한 PVE 덱 5장을 확인할 수 없습니다. 다시 참가하세요." },
        409,
      );
    const refreshedEnergy = await refreshSiegeEnergy(env, event.id, user.id, mine);
    if (refreshedEnergy.energy < 1)
      return json({ error: "공성전 출전 횟수가 부족합니다. 5분마다 1회 충전됩니다.", energy: refreshedEnergy }, 429);
    const playerPower =
        deck.reduce((sum, card) => sum + Number(card.power || 0), 0) +
        Number(characterBonus?.pve || 0),
      monsterPower = Math.max(1, Math.floor(Number(phase.battlePower || 1))),
      monster = {
        id: `SIEGE-${phase.key}`,
        name: phase.monsterName,
        image: phase.monsterImage,
        battle_power: monsterPower,
        is_boss: phase.isBoss ? 1 : 0,
      },
      seed = Array.from(`${event.id}:${user.id}:${requestId}`).reduce(
        (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
        2166136261,
      ),
      battleV2 = createPveBattleV2({
        cards: deck,
        characterBonus: Number(characterBonus?.pve || 0),
        monster,
        seed,
        singleHealerBonus: battleCfg?.engine?.singleHealerBonus,
      }),
      result = battleV2.result.winner === "A" ? "WIN" : "LOSE",
      baseContribution = Math.max(
        1,
        Math.floor((playerPower * cfg.siegeDamagePercent) / 100),
      ),
      contributionPercent =
        result === "WIN" ? 100 : cfg.defeatContributionPercent,
      raw = Math.max(1, Math.floor((baseContribution * contributionPercent) / 100)),
      damage = Math.min(raw, Number(event.phase_hp || 0)),
      nextHp = Math.max(0, Number(event.phase_hp || 0) - damage),
      winReward = {
        coin: result === "WIN" ? cfg.perBattleWinCoin : 0,
        shards: result === "WIN" ? cfg.perBattleWinShards : 0,
        items: result === "WIN" ? cfg.perBattleWinItems : [],
      };
    let nextIndex = Number(event.phase_index || 0),
      cleared = false;
    if (nextHp <= 0) {
      if (nextIndex >= cfg.phases.length - 1) cleared = true;
      else nextIndex++;
    }
    const nextPhase = cfg.phases[nextIndex];
    const actionReserved = await env.DB.prepare(
      "INSERT OR IGNORE INTO monster_siege_actions(request_id,event_id,user_id,phase_index,damage) VALUES(?,?,?,?,0)",
    ).bind(requestId, event.id, user.id, event.phase_index).run();
    if (!Number(actionReserved.meta?.changes || 0))
      return json({ error: "동일한 공성 공격 요청을 처리 중입니다." }, 409);
    const energySpent = await env.DB.prepare(
      "UPDATE monster_siege_users SET energy=energy-1,energy_updated_at=CASE WHEN energy>=? THEN CURRENT_TIMESTAMP ELSE energy_updated_at END,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=? AND energy>0",
    ).bind(SIEGE_ENERGY_MAX, event.id, user.id).run();
    if (!Number(energySpent.meta?.changes || 0)) {
      await env.DB.prepare("DELETE FROM monster_siege_actions WHERE request_id=? AND user_id=? AND result_json IS NULL").bind(requestId, user.id).run();
      return json({ error: "공성전 출전 횟수가 부족합니다. 5분마다 1회 충전됩니다." }, 429);
    }
    const statements = [
      env.DB.prepare(
        "UPDATE monster_siege_actions SET damage=? WHERE request_id=? AND event_id=? AND user_id=?",
      ).bind(damage, requestId, event.id, user.id),
      env.DB.prepare(
        "UPDATE monster_siege_users SET attacks=attacks+1,damage=damage+?,last_attack_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=?",
      ).bind(damage, event.id, user.id),
    ];
    if (
      result === "WIN" &&
      (winReward.coin > 0 || winReward.shards > 0 || winReward.items.length)
    ) {
      statements.push(
        env.DB.prepare(
          "UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=?",
        ).bind(winReward.coin, winReward.shards, user.id),
      );
      if (winReward.coin > 0)
        statements.push(
          env.DB.prepare(
            "INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?",
          ).bind(
            winReward.coin,
            `몬스터 공성전 1판 승리 보상: ${phase.monsterName}`,
            user.id,
          ),
        );
      if (winReward.shards > 0)
        statements.push(
          env.DB.prepare(
            "INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) SELECT id,?,card_shards,?,NULL FROM users WHERE id=?",
          ).bind(
            winReward.shards,
            `몬스터 공성전 1판 승리 보상: ${phase.monsterName}`,
            user.id,
          ),
        );
      for (const item of winReward.items) {
        statements.push(
          env.DB.prepare(
            "INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP",
          ).bind(user.id, item.code, item.quantity, item.quantity),
          env.DB.prepare(
            "INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,?,quantity,'MONSTER_SIEGE_BATTLE_WIN','MONSTER_SIEGE',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?",
          ).bind(
            user.id,
            item.code,
            item.quantity,
            requestId,
            user.id,
            item.code,
          ),
        );
      }
    }
    if (cleared)
      statements.push(
        env.DB.prepare(
          "UPDATE monster_siege_events SET phase_hp=0,total_damage=total_damage+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
        ).bind(damage, event.id),
      );
    else if (nextIndex !== Number(event.phase_index))
      statements.push(
        env.DB.prepare(
          "UPDATE monster_siege_events SET phase_index=?,phase_hp=?,phase_max_hp=?,total_damage=total_damage+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
        ).bind(nextIndex, nextPhase.hp, nextPhase.hp, damage, event.id),
      );
    else
      statements.push(
        env.DB.prepare(
          "UPDATE monster_siege_events SET phase_hp=MAX(0,phase_hp-?),total_damage=total_damage+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
        ).bind(damage, damage, event.id),
      );
    try {
      await env.DB.batch(statements);
    } catch (error) {
      await env.DB.batch([
        env.DB.prepare("UPDATE monster_siege_users SET energy=MIN(?,energy+1),updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=?").bind(SIEGE_ENERGY_MAX, event.id, user.id),
        env.DB.prepare("DELETE FROM monster_siege_actions WHERE request_id=? AND user_id=? AND result_json IS NULL").bind(requestId, user.id),
      ]).catch(() => {});
      throw error;
    }
    if (cleared) await settle(env, event, cfg, "CLEARED");
    const current = await env.DB.prepare(
        "SELECT * FROM monster_siege_events WHERE id=?",
      )
        .bind(event.id)
        .first(),
      payload = {
        ok: true,
        result,
        damage,
        contributionPercent,
        baseContribution,
        winReward,
        playerPower,
        monsterPower,
        battleV2,
        cards: deck,
        monster: {
          id: monster.id,
          name: monster.name,
          image: monster.image,
          isBoss: Boolean(monster.is_boss),
        },
        phaseCleared: nextIndex !== Number(event.phase_index) || cleared,
        eventCleared: cleared,
        state: await state(
          env,
          user,
          cfg,
          current.status === "ACTIVE" ? current : null,
        ),
      };
    await env.DB.prepare(
      "UPDATE monster_siege_actions SET result_json=? WHERE request_id=?",
    )
      .bind(JSON.stringify(payload), requestId)
      .run();
    return json(payload);
  }
  if (path === "siege/claim" && request.method === "POST") {
    const reward = await env.DB.prepare(
      "SELECT * FROM monster_siege_rewards WHERE user_id=? AND claimed_at IS NULL ORDER BY event_id DESC LIMIT 1",
    )
      .bind(user.id)
      .first();
    if (!reward) return json({ error: "수령할 공성전 보상이 없습니다." }, 404);
    const rewardItems = cleanRewardItems(jsonSafe(reward.items_json, []));
    const statements = [
      env.DB.prepare(
        "UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=? AND EXISTS (SELECT 1 FROM monster_siege_rewards WHERE event_id=? AND user_id=? AND claimed_at IS NULL)",
      ).bind(reward.coin, reward.shards, user.id, reward.event_id, user.id),
      env.DB.prepare(
        "INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'MONSTER_SIEGE_FINAL_REWARD' FROM users WHERE id=? AND EXISTS (SELECT 1 FROM monster_siege_rewards WHERE event_id=? AND user_id=? AND claimed_at IS NULL) AND ?>0",
      ).bind(reward.coin, user.id, reward.event_id, user.id, reward.coin),
      env.DB.prepare(
        "INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) SELECT id,?,card_shards,'MONSTER_SIEGE_FINAL_REWARD',NULL FROM users WHERE id=? AND EXISTS (SELECT 1 FROM monster_siege_rewards WHERE event_id=? AND user_id=? AND claimed_at IS NULL) AND ?>0",
      ).bind(reward.shards, user.id, reward.event_id, user.id, reward.shards),
    ];
    for (const item of rewardItems) {
      statements.push(
        env.DB.prepare(
          "INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM monster_siege_rewards WHERE event_id=? AND user_id=? AND claimed_at IS NULL) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP",
        ).bind(user.id, item.code, item.quantity, item.quantity, reward.event_id, user.id),
        env.DB.prepare(
          "INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,?,quantity,'MONSTER_SIEGE_FINAL_REWARD','MONSTER_SIEGE',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND EXISTS (SELECT 1 FROM monster_siege_rewards WHERE event_id=? AND user_id=? AND claimed_at IS NULL)",
        ).bind(user.id, item.code, item.quantity, String(reward.event_id), user.id, item.code, reward.event_id, user.id),
      );
    }
    statements.push(
      env.DB.prepare(
        "UPDATE monster_siege_rewards SET claimed_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=? AND claimed_at IS NULL",
      ).bind(reward.event_id, user.id),
    );
    const results = await env.DB.batch(statements);
    if (
      !Number(results[0]?.meta?.changes || 0) ||
      !Number(results[results.length - 1]?.meta?.changes || 0)
    )
      return json({ error: "이미 수령한 보상입니다." }, 409);
    return json({ ok: true, coin: reward.coin, shards: reward.shards, items: rewardItems });
  }
  if (path === "admin/siege/settings") {
    if (request.method === "GET") {
      const event = await activeEvent(env, cfg, { create: false });
      return json({
        settings: cfg,
        state: await state(env, user, cfg, event),
        territoryBenchmark: await territoryBenchmark(env),
      });
    }
    if (request.method === "POST") {
      const next = cleanSettings(await readBody(request));
      const itemCodes = [
        ...next.perBattleWinItems,
        ...next.finalRewardItems,
      ].map((item) => item.code);
      if (itemCodes.length) {
        const uniqueCodes = [...new Set(itemCodes)];
        const found = (
          await env.DB.prepare(
            `SELECT code FROM inventory_items WHERE code IN (${uniqueCodes.map(() => "?").join(",")}) AND is_active=1`,
          )
            .bind(...uniqueCodes)
            .all()
        ).results || [];
        const foundCodes = new Set(found.map((row) => String(row.code)));
        const invalid = uniqueCodes.filter((code) => !foundCodes.has(code));
        if (invalid.length)
          return json(
            { error: `사용할 수 없는 아이템 코드입니다: ${invalid.join(", ")}` },
            400,
          );
      }
      await env.DB.prepare(
        "INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)",
      )
        .bind(KEY, JSON.stringify(next))
        .run();
      const running = await env.DB.prepare(
        "SELECT id,phase_index,rally_ends_at FROM monster_siege_events WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1",
      ).first();
      if (running) {
        const phaseHp = next.phases[
          Math.max(0, Math.min(4, Number(running.phase_index || 0)))
        ].hp;
        const rallyOpen = Date.parse(`${running.rally_ends_at || ""}Z`) > Date.now();
        if (rallyOpen) {
          await env.DB.prepare(
            "UPDATE monster_siege_events SET rally_ends_at=datetime('now',?),ends_at=datetime('now',?),phase_hp=MAX(0,?-(phase_max_hp-phase_hp)),phase_max_hp=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
          ).bind(`+${next.rallyMinutes} minutes`, `+${next.rallyMinutes + next.durationMinutes} minutes`, phaseHp, phaseHp, running.id).run();
        } else {
          await env.DB.prepare(
            "UPDATE monster_siege_events SET ends_at=datetime('now',?),phase_hp=MAX(0,?-(phase_max_hp-phase_hp)),phase_max_hp=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
          ).bind(`+${next.durationMinutes} minutes`, phaseHp, phaseHp, running.id).run();
        }
      }
      return json({ ok: true, settings: next });
    }
  }
  if (path === "admin/siege/start" && request.method === "POST") {
    const existing = await activeEvent(env, cfg, { create: false });
    if (existing)
      return json({ error: "이미 진행 중인 공성전이 있습니다." }, 409);
    return json({ ok: true, event: await createEvent(env, cfg) });
  }
  if (path === "admin/siege/begin-battle" && request.method === "POST") {
    const event = await activeEvent(env, cfg, { create: false });
    if (!event) return json({ error: "진행 중인 공성전 편성대기가 없습니다." }, 404);
    const rallyEndsAt = event.rally_ends_at || event.starts_at;
    if (Date.parse(`${rallyEndsAt}Z`) <= Date.now())
      return json({ error: "이미 공성 전투가 시작되었습니다." }, 409);
    await env.DB.prepare(
      "UPDATE monster_siege_events SET rally_ends_at=CURRENT_TIMESTAMP,ends_at=datetime('now',?),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
    ).bind(`+${cfg.durationMinutes} minutes`, event.id).run();
    return json({ ok: true, stage: "BATTLE" });
  }
  if (path === "admin/siege/finish" && request.method === "POST") {
    const event = await activeEvent(env, cfg, { create: false });
    if (!event) return json({ error: "진행 중인 공성전이 없습니다." }, 404);
    const body = await readBody(request),
      status = body.success === true ? "CLEARED" : "FAILED";
    await settle(env, event, cfg, status);
    return json({ ok: true, status });
  }
  return json({ error: "지원하지 않는 공성전 요청입니다." }, 405);
}
