const KEY = "monster_siege_settings_v1";
const SIEGE_ENERGY_MAX = 5;
const SIEGE_ENERGY_RECHARGE_SECONDS = 180;
const SIEGE_AI_DEFAULT_FORTRESS_HP = 20000000;
const SIEGE_AI_SCHEMA_MARKER = "safe_runtime_upgrade_v1886_monster_siege_ai_companion_state";
const PARTICIPATION_BONUS_CODE = "MONSTER_SIEGE_5_PLUS_30M_V1";
const PARTICIPATION_BONUS_MIN_ATTACKS = 5;
const PARTICIPATION_BONUS_COIN = 30000000;
const MONSTER_AI_PROFILES = Object.freeze({
  OUTER: {
    code: "PACK_HUNT",
    skillName: "포식 군단 강습",
    basicName: "흑철 발톱 공세",
    role: "SWARM ASSAULT",
    description: "무리를 분산시킨 뒤 성채의 취약 구역을 동시에 덮칩니다.",
    attackPercent: 0.15,
    skillMultiplier: 2.15,
    skillEvery: 4,
    healPercent: 0,
    shieldPercent: 0,
    shieldSeconds: 0,
  },
  GATE: {
    code: "BREACH_QUAKE",
    skillName: "거신 성문파쇄",
    basicName: "충각 진군",
    role: "BREACH OPERATION",
    description: "충각과 지진파를 겹쳐 아군 성채의 구조 내구도를 크게 깎습니다.",
    attackPercent: 0.18,
    skillMultiplier: 2.65,
    skillEvery: 5,
    healPercent: 0,
    shieldPercent: 0,
    shieldSeconds: 0,
  },
  INNER: {
    code: "EMBER_VEIL",
    skillName: "잿불 마력장막",
    basicName: "마력 포격",
    role: "ARCANE SUPPRESSION",
    description: "성채를 포격하는 동시에 자신을 감싸는 장막으로 공성 피해를 줄입니다.",
    attackPercent: 0.16,
    skillMultiplier: 1.65,
    skillEvery: 4,
    healPercent: 0,
    shieldPercent: 22,
    shieldSeconds: 90,
  },
  GUARD: {
    code: "ROYAL_BULWARK",
    skillName: "왕실 수호방진",
    basicName: "근위대 역습",
    role: "COUNTER SIEGE",
    description: "근위대가 반격하는 동안 방진을 전개해 전선을 회복하고 피해를 흡수합니다.",
    attackPercent: 0.2,
    skillMultiplier: 1.85,
    skillEvery: 5,
    healPercent: 1.5,
    shieldPercent: 28,
    shieldSeconds: 105,
  },
  LORD: {
    code: "ECLIPSE_DECREE",
    skillName: "월식 종말선고",
    basicName: "심연의 파동",
    role: "ANNIHILATION",
    description: "성주가 전황을 읽고 성채가 약해진 순간 대규모 종말 파동을 방출합니다.",
    attackPercent: 0.24,
    skillMultiplier: 3.15,
    skillEvery: 4,
    healPercent: 0.5,
    shieldPercent: 18,
    shieldSeconds: 75,
  },
});
const SIEGE_MAP_NODES = Object.freeze([
  { index: 0, key: "ALLIANCE_BASE", name: "숲켓몬 연합 본진", code: "ALLIANCE HQ", x: 7, y: 60 },
  { index: 1, key: "OUTER", name: "검은 습지 초소", code: "OUTER POST", x: 24, y: 58 },
  { index: 2, key: "GATE", name: "철혈 관문", code: "IRON GATE", x: 40, y: 49 },
  { index: 3, key: "INNER", name: "잿불 시가지", code: "EMBER CITY", x: 56, y: 53 },
  { index: 4, key: "GUARD", name: "월식 왕궁", code: "ROYAL KEEP", x: 72, y: 43 },
  { index: 5, key: "LORD", name: "심연 성채", code: "ECLIPSE CITADEL", x: 91, y: 25 },
]);
const unit = (id, name, role, image, powerFactor = 1, isBoss = false) =>
  Object.freeze({ id, name, role, image, powerFactor, isBoss });
const MONSTER_FORMATIONS = Object.freeze({
  OUTER: Object.freeze({
    defense: Object.freeze([
      unit("OUTER-D1", "검은늪 척후병", "전방 감시", "/assets/ui/project-v/monsters/hunt-tower/tower-017-wijang-akseong-sd-v1.png", 0.92),
      unit("OUTER-D2", "외곽 주술사", "진형 지원", "/assets/ui/project-v/monsters/hunt-tower/tower-019-vampire-sd-v1.png", 1.0),
      unit("OUTER-D3", "흑철 방패병", "거점 수비", "/assets/ui/project-v/monsters/hunt-tower/tower-021-fallen-paladin-sd-v1.png", 1.08),
    ]),
    assault: Object.freeze([
      unit("OUTER-A1", "혈조 정찰수", "침투", "/assets/ui/project-v/monsters/hunt-tower/tower-024-blood-crow-sd-v1.png", 0.95),
      unit("OUTER-A2", "월영 추격자", "기동 타격", "/assets/ui/project-v/monsters/hunt-tower/tower-027-moon-wraith-sd-v1.png", 1.04),
      unit("OUTER-A3", "파성 선봉장", "돌격 지휘", "/assets/ui/project-v/monsters/hunt-tower/tower-064-commander-krieg-sd-v1.png", 1.12),
    ]),
  }),
  GATE: Object.freeze({
    defense: Object.freeze([
      unit("GATE-D1", "적철 문지기", "관문 수비", "/assets/ui/project-v/monsters/hunt-tower/tower-018-igris-boss-sd-v1.png", 1.05, true),
      unit("GATE-D2", "강철 파수기", "화력 차단", "/assets/ui/project-v/monsters/hunt-tower/hunt-068-omega-09-sd-v1.png", 1.0),
      unit("GATE-D3", "독안개 포대", "원거리 지원", "/assets/ui/project-v/monsters/hunt-tower/hunt-005-kyokasuigetsu-frog-sd-v1.png", 0.96),
    ]),
    assault: Object.freeze([
      unit("GATE-A1", "뇌광 돌격병", "고속 돌파", "/assets/ui/project-v/monsters/hunt-tower/hunt-016-thunder-swordsman-boss-sd-v1.png", 1.02, true),
      unit("GATE-A2", "화염 충각대", "성벽 파쇄", "/assets/ui/project-v/monsters/hunt-tower/hunt-026-flame-pillar-boss-sd-v1.png", 1.08, true),
      unit("GATE-A3", "황뢰 선도자", "돌격 지휘", "/assets/ui/project-v/monsters/hunt-tower/hunt-067-yellow-flash-boss-sd-v1.png", 1.14, true),
    ]),
  }),
  INNER: Object.freeze({
    defense: Object.freeze([
      unit("INNER-D1", "자색 결계술사", "마력 장벽", "/assets/ui/project-v/monsters/hunt-tower/tower-028-violet-magus-boss-sd-v1.png", 1.08, true),
      unit("INNER-D2", "빙결 포격관", "원거리 제압", "/assets/ui/project-v/monsters/hunt-tower/hunt-006-ice-admiral-boss-sd-v1.png", 1.02, true),
      unit("INNER-D3", "광휘 감시관", "시가지 수비", "/assets/ui/project-v/monsters/hunt-tower/hunt-004-light-admiral-boss-sd-v1.png", 1.04, true),
    ]),
    assault: Object.freeze([
      unit("INNER-A1", "용암 파괴관", "광역 포격", "/assets/ui/project-v/monsters/hunt-tower/hunt-007-magma-admiral-boss-sd-v1.png", 1.1, true),
      unit("INNER-A2", "공허 잠입자", "후방 교란", "/assets/ui/project-v/monsters/hunt-tower/hunt-062-obito-boss-sd-v1.png", 1.05, true),
      unit("INNER-A3", "낙뢰 추격자", "기동 섬멸", "/assets/ui/project-v/monsters/hunt-tower/hunt-014-lightning-rival-boss-sd-v1.png", 1.12, true),
    ]),
  }),
  GUARD: Object.freeze({
    defense: Object.freeze([
      unit("GUARD-D1", "빙벽 근위병", "좌익 방어", "/assets/ui/project-v/monsters/hunt-tower/tower-020-ice-swordsman-boss-sd-v1.png", 1.08, true),
      unit("GUARD-D2", "녹영 수호자", "중앙 방진", "/assets/ui/project-v/monsters/hunt-tower/tower-022-green-spirit-boss-sd-v1.png", 1.1, true),
      unit("GUARD-D3", "천화 검위", "우익 반격", "/assets/ui/project-v/monsters/hunt-tower/tower-023-petal-swordsman-boss-sd-v1.png", 1.12, true),
    ]),
    assault: Object.freeze([
      unit("GUARD-A1", "삼검 돌격장", "근접 돌파", "/assets/ui/project-v/monsters/hunt-tower/hunt-025-green-swordsman-boss-sd-v1.png", 1.08, true),
      unit("GUARD-A2", "화천 전술관", "작전 지휘", "/assets/ui/project-v/monsters/hunt-tower/hunt-029-flower-captain-boss-sd-v1.png", 1.1, true),
      unit("GUARD-A3", "가면 섬멸자", "전선 급습", "/assets/ui/project-v/monsters/hunt-tower/hunt-069-masked-soul-swordsman-boss-sd-v1.png", 1.16, true),
    ]),
  }),
  LORD: Object.freeze({
    defense: Object.freeze([
      unit("LORD-D1", "홍월 환술사", "정신 방벽", "/assets/ui/project-v/monsters/hunt-tower/hunt-015-crimson-eye-boss-sd-v1.png", 1.12, true),
      unit("LORD-D2", "암부 처형자", "근접 차단", "/assets/ui/project-v/monsters/hunt-tower/hunt-030-black-ops-boss-sd-v1.png", 1.1, true),
      unit("LORD-D3", "월백 대장", "최종 수비", "/assets/ui/project-v/monsters/hunt-tower/hunt-031-moon-demon-boss-sd-v1.png", 1.18, true),
    ]),
    assault: Object.freeze([
      unit("LORD-A1", "암해 군주", "대규모 침공", "/assets/ui/project-v/monsters/hunt-tower/hunt-011-black-beard-boss-sd-v1.png", 1.15, true),
      unit("LORD-A2", "황금 왕포대", "원거리 섬멸", "/assets/ui/project-v/monsters/hunt-tower/hunt-061-golden-king-boss-sd-v1.png", 1.17, true),
      unit("LORD-A3", "태양 사자왕", "최종 돌격", "/assets/ui/project-v/monsters/hunt-tower/hunt-063-solar-lion-king-boss-sd-v1.png", 1.22, true),
    ]),
  }),
});
function monsterFormation(phaseKey) {
  return MONSTER_FORMATIONS[String(phaseKey || "OUTER").toUpperCase()] || MONSTER_FORMATIONS.OUTER;
}
const DEFAULTS = {
  mode: "TEST",
  name: "심연의 황혼 성채",
  durationMinutes: 360,
  rallyMinutes: 30,
  attackCountMax: 5,
  attackRechargeMinutes: 3,
  siegeDamagePercent: 100,
  winContributionPercent: 100,
  defeatContributionPercent: 25,
  siegeDamageMin: 1000,
  siegeDamageMax: 500000,
  siegeDamageVariancePercent: 5,
  expectedPlayerPower: 20000,
  perBattleWinCoin: 3000,
  perBattleWinShards: 30,
  perBattleWinItems: [],
  rewardCoin: 50000,
  rewardShards: 500,
  finalRewardItems: [],
  minAttacks: 1,
  monsterAiEnabled: true,
  allianceFortressHp: SIEGE_AI_DEFAULT_FORTRESS_HP,
  monsterAttackIntervalSeconds: 45,
  monsterAttackPowerPercent: 100,
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
      allianceHp: 20000000,
      damageMultiplierPercent: 100,
      defensePowers: [19320, 21000, 22680],
      assaultPowers: [19950, 21840, 23520],
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
      allianceHp: 20000000,
      damageMultiplierPercent: 100,
      defensePowers: [26250, 25000, 24000],
      assaultPowers: [25500, 27000, 28500],
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
      allianceHp: 20000000,
      damageMultiplierPercent: 100,
      defensePowers: [32400, 30600, 31200],
      assaultPowers: [33000, 31500, 33600],
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
      allianceHp: 20000000,
      damageMultiplierPercent: 100,
      defensePowers: [38880, 39600, 40320],
      assaultPowers: [38880, 39600, 41760],
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
      allianceHp: 20000000,
      damageMultiplierPercent: 100,
      defensePowers: [49280, 48400, 51920],
      assaultPowers: [50600, 51480, 53680],
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
const clampDecimal = (value, min, max, fallback = min, precision = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const factor = 10 ** precision;
  return Math.round(Math.max(min, Math.min(max, n)) * factor) / factor;
};
const databaseNowSql = (env) =>
  env?.DB?.dialect === "postgres" ? "NOW()" : "CURRENT_TIMESTAMP";
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
  const legacyAllianceHp = clamp(
      raw?.allianceFortressHp,
      100000,
      2000000000,
      SIEGE_AI_DEFAULT_FORTRESS_HP,
    ),
    phases = Array.from({ length: 5 }, (_, i) => {
      const base = DEFAULTS.phases[i],
        x = raw?.phases?.[i] || {},
        formation = monsterFormation(base.key),
        powerList = (values, defaults, units) =>
          Array.from({ length: 3 }, (_, unitIndex) =>
            clamp(
              values?.[unitIndex],
              1,
              2000000000,
              defaults?.[unitIndex] ||
                Math.max(
                  1,
                  Math.round(
                    base.battlePower * Number(units[unitIndex]?.powerFactor || 1),
                  ),
                ),
            ),
          );
      return {
        ...base,
        ai: monsterAiProfile(base.key, x.ai),
        name: String(x.name || base.name)
          .trim()
          .slice(0, 40),
        subtitle: String(x.subtitle || base.subtitle)
          .trim()
          .slice(0, 80),
        hp: clamp(x.hp, 1000, 2000000000, base.hp),
        battlePower: clamp(x.battlePower, 1, 2000000000, base.battlePower),
        allianceHp: clamp(
          x.allianceHp,
          100000,
          2000000000,
          raw?.allianceFortressHp !== undefined
            ? legacyAllianceHp
            : Number(base.allianceHp || legacyAllianceHp),
        ),
        damageMultiplierPercent: clamp(
          x.damageMultiplierPercent,
          10,
          500,
          Number(base.damageMultiplierPercent || 100),
        ),
        defensePowers: powerList(
          x.defensePowers,
          base.defensePowers,
          formation.defense,
        ),
        assaultPowers: powerList(
          x.assaultPowers,
          base.assaultPowers,
          formation.assault,
        ),
        startMinute: base.startMinute,
      };
    }),
    siegeDamageMin = clamp(raw?.siegeDamageMin, 1, 2000000000, 1000),
    siegeDamageMax = Math.max(
      siegeDamageMin,
      clamp(raw?.siegeDamageMax, 1, 2000000000, 500000),
    );
  return {
    mode: ["OFF", "TEST", "ON"].includes(String(raw?.mode || "").toUpperCase())
      ? String(raw.mode).toUpperCase()
      : DEFAULTS.mode,
    name: String(raw?.name || DEFAULTS.name)
      .trim()
      .slice(0, 50),
    durationMinutes: clamp(raw?.durationMinutes, 30, 10080, 360),
    rallyMinutes: clamp(raw?.rallyMinutes, 1, 1440, 30),
    attackCountMax: clamp(raw?.attackCountMax, 1, 50, SIEGE_ENERGY_MAX),
    attackRechargeMinutes: clamp(
      raw?.attackRechargeMinutes,
      1,
      1440,
      SIEGE_ENERGY_RECHARGE_SECONDS / 60,
    ),
    siegeDamagePercent: clamp(raw?.siegeDamagePercent, 1, 1000, 100),
    winContributionPercent: clamp(raw?.winContributionPercent, 1, 300, 100),
    defeatContributionPercent: clamp(raw?.defeatContributionPercent, 0, 100, 25),
    siegeDamageMin,
    siegeDamageMax,
    siegeDamageVariancePercent: clamp(
      raw?.siegeDamageVariancePercent,
      0,
      50,
      5,
    ),
    expectedPlayerPower: clamp(raw?.expectedPlayerPower, 1, 2000000000, 20000),
    perBattleWinCoin: clamp(raw?.perBattleWinCoin, 0, 100000000, 3000),
    perBattleWinShards: clamp(raw?.perBattleWinShards, 0, 100000000, 30),
    perBattleWinItems: cleanRewardItems(raw?.perBattleWinItems),
    rewardCoin: clamp(raw?.rewardCoin, 0, 100000000, 50000),
    rewardShards: clamp(raw?.rewardShards, 0, 100000000, 500),
    finalRewardItems: cleanRewardItems(raw?.finalRewardItems),
    minAttacks: clamp(raw?.minAttacks, 1, 1000, 1),
    monsterAiEnabled: !(
      raw?.monsterAiEnabled === false ||
      ["OFF", "FALSE", "0"].includes(String(raw?.monsterAiEnabled || "").toUpperCase())
    ),
    allianceFortressHp: phases[0]?.allianceHp || legacyAllianceHp,
    monsterAttackIntervalSeconds: clamp(
      raw?.monsterAttackIntervalSeconds,
      15,
      300,
      45,
    ),
    monsterAttackPowerPercent: clamp(
      raw?.monsterAttackPowerPercent,
      10,
      500,
      100,
    ),
    phases,
  };
};
function utcMs(value) {
  if (value instanceof Date) return value.getTime();
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  return Date.parse(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
      ? `${raw.replace(" ", "T")}Z`
      : raw,
  );
}
function monsterAiProfile(phaseKey, override = null) {
  const base =
    MONSTER_AI_PROFILES[String(phaseKey || "OUTER").toUpperCase()] ||
    MONSTER_AI_PROFILES.OUTER;
  if (!override || typeof override !== "object") return base;
  return {
    ...base,
    attackPercent: clampDecimal(
      override.attackPercent,
      0.01,
      10,
      base.attackPercent,
    ),
    skillMultiplier: clampDecimal(
      override.skillMultiplier,
      0.1,
      20,
      base.skillMultiplier,
    ),
    skillEvery: clamp(override.skillEvery, 2, 100, base.skillEvery),
    healPercent: clampDecimal(
      override.healPercent,
      0,
      100,
      base.healPercent,
    ),
    shieldPercent: clamp(
      override.shieldPercent,
      0,
      90,
      base.shieldPercent,
    ),
    shieldSeconds: clamp(
      override.shieldSeconds,
      0,
      3600,
      base.shieldSeconds,
    ),
  };
}
function phasePowerFor(phase, formationType, index, entry) {
  const powers =
    formationType === "ASSAULT" ? phase?.assaultPowers : phase?.defensePowers;
  const configured = Number(powers?.[index]);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return Math.max(
    1,
    Math.round(
      Number(phase?.battlePower || 1) * Number(entry?.powerFactor || 1),
    ),
  );
}
function calculatePlayerSiegeDamage({
  playerPower,
  result,
  cfg,
  phase,
  seed = 0,
  monsterDamageReductionPercent = 0,
}) {
  const baseContribution = Math.max(
      1,
      Math.floor((Math.max(1, Number(playerPower || 1)) * cfg.siegeDamagePercent) / 100),
    ),
    contributionPercent =
      result === "WIN" ? cfg.winContributionPercent : cfg.defeatContributionPercent,
    phaseMultiplierPercent = clamp(
      phase?.damageMultiplierPercent,
      10,
      500,
      100,
    ),
    variancePercent = clamp(cfg.siegeDamageVariancePercent, 0, 50, 0),
    varianceUnit = ((Math.abs(Number(seed || 0)) % 10001) / 10000) * 2 - 1,
    varianceMultiplier = 1 + (varianceUnit * variancePercent) / 100,
    unmitigatedDamage =
      contributionPercent <= 0
        ? 0
        : Math.max(
            1,
            Math.floor(
              baseContribution *
                (contributionPercent / 100) *
                (phaseMultiplierPercent / 100) *
                varianceMultiplier,
            ),
          ),
    cappedDamage =
      unmitigatedDamage <= 0
        ? 0
        : Math.max(
            cfg.siegeDamageMin,
            Math.min(cfg.siegeDamageMax, unmitigatedDamage),
          ),
    damage = Math.max(
      0,
      Math.floor(
        cappedDamage *
          (1 - clamp(monsterDamageReductionPercent, 0, 90, 0) / 100),
      ),
    );
  return {
    damage,
    baseContribution,
    contributionPercent,
    phaseMultiplierPercent,
    variancePercent,
    varianceMultiplier,
    unmitigatedDamage,
    cappedDamage,
  };
}
function monsterThreat(event) {
  const monsterRatio = Number(event?.phase_hp || 0) / Math.max(1, Number(event?.phase_max_hp || 1));
  const fortressRatio = Number(event?.alliance_hp || 0) / Math.max(1, Number(event?.alliance_max_hp || 1));
  const rage = clamp(
    Math.round((1 - monsterRatio) * 62 + Number(event?.phase_index || 0) * 7 + (fortressRatio <= 0.25 ? 18 : 0)),
    0,
    100,
    0,
  );
  if (rage >= 80) return { level: "ANNIHILATION", label: "섬멸 태세", rage };
  if (rage >= 55) return { level: "FRENZY", label: "광폭 태세", rage };
  if (rage >= 30) return { level: "PRESSURE", label: "압박 태세", rage };
  return { level: "PROBE", label: "탐색 태세", rage };
}
function activeMonsterEffect(event, now = Date.now()) {
  const endsAt = utcMs(event?.monster_effect_ends_at);
  const percent = clamp(event?.monster_effect_percent, 0, 90, 0);
  if (!event?.monster_effect_code || !Number.isFinite(endsAt) || endsAt <= now || percent <= 0)
    return null;
  return {
    code: String(event.monster_effect_code),
    percent,
    endsAt: new Date(endsAt).toISOString(),
  };
}
function monsterAiPlan({ event, cfg, now = Date.now() }) {
  if (!event || cfg?.monsterAiEnabled === false || event.status !== "ACTIVE") return null;
  const rallyEndsAt = utcMs(event.rally_ends_at || event.starts_at);
  if (Number.isFinite(rallyEndsAt) && rallyEndsAt > now) return null;
  const intervalMs = clamp(cfg?.monsterAttackIntervalSeconds, 15, 300, 45) * 1000;
  const nextMs = utcMs(event.next_monster_action_at);
  if (!Number.isFinite(nextMs) || nextMs > now) return null;
  const dueTicks = Math.max(1, Math.floor((now - nextMs) / intervalMs) + 1);
  const sequenceBefore = Math.max(0, Number(event.monster_ai_sequence || 0));
  const sequenceAfter = sequenceBefore + dueTicks;
  const phase = cfg.phases[Math.max(0, Math.min(cfg.phases.length - 1, Number(event.phase_index || 0)))];
  const profile = phase?.ai || monsterAiProfile(phase?.key);
  const formation = monsterFormation(phase?.key);
  const skillEvery = Math.max(2, Number(profile.skillEvery || 4));
  const skillCount = Math.max(0, Math.floor(sequenceAfter / skillEvery) - Math.floor(sequenceBefore / skillEvery));
  const basicCount = Math.max(0, dueTicks - skillCount);
  const allianceMaxHp = Math.max(1, Number(event.alliance_max_hp || cfg.allianceFortressHp || SIEGE_AI_DEFAULT_FORTRESS_HP));
  const allianceHpBefore = Math.max(0, Math.min(allianceMaxHp, Number(event.alliance_hp ?? allianceMaxHp)));
  const threat = monsterThreat(event);
  const weakenedMultiplier = allianceHpBefore / allianceMaxHp <= 0.25 ? 1.15 : 1;
  const assaultLeadIndex = sequenceAfter % formation.assault.length;
  const assaultUnitBase = formation.assault[assaultLeadIndex];
  const assaultBattlePower = phasePowerFor(
    phase,
    "ASSAULT",
    assaultLeadIndex,
    assaultUnitBase,
  );
  const assaultPowerRatio = Math.max(
    0.25,
    Math.min(4, assaultBattlePower / Math.max(1, Number(phase?.battlePower || 1))),
  );
  const baseDamage = Math.max(
    1,
    Math.round(
      allianceMaxHp *
        (Number(profile.attackPercent || 0.15) / 100) *
        (clamp(cfg.monsterAttackPowerPercent, 10, 500, 100) / 100) *
        assaultPowerRatio *
        (1 + threat.rage / 250) *
        weakenedMultiplier,
    ),
  );
  const plannedDamage = Math.max(
    1,
    Math.round(baseDamage * basicCount + baseDamage * Number(profile.skillMultiplier || 1) * skillCount),
  );
  const damage = Math.min(allianceHpBefore, plannedDamage);
  const phaseMaxHp = Math.max(1, Number(event.phase_max_hp || phase?.hp || 1));
  const phaseHpBefore = Math.max(0, Math.min(phaseMaxHp, Number(event.phase_hp || 0)));
  const heal = skillCount > 0
    ? Math.min(
        Math.max(0, phaseMaxHp - phaseHpBefore),
        Math.round(phaseMaxHp * (Number(profile.healPercent || 0) / 100) * skillCount),
      )
    : 0;
  const existingEffect = activeMonsterEffect(event, now);
  const appliesShield = skillCount > 0 && Number(profile.shieldPercent || 0) > 0;
  const effect = appliesShield
    ? {
        code: profile.code,
        percent: Number(profile.shieldPercent),
        endsAt: new Date(now + Number(profile.shieldSeconds || 60) * 1000).toISOString(),
      }
    : existingEffect;
  const actionType = skillCount > 0 ? "SKILL" : "ATTACK";
  const title = skillCount > 0 ? profile.skillName : profile.basicName;
  const assaultUnit = { ...assaultUnitBase, battlePower: assaultBattlePower };
  const message = dueTicks > 1
    ? `${assaultUnit.name} 돌격대가 ${title} 포함 ${dueTicks}차 연속 공세로 연합 전선을 밀어붙였습니다.`
    : `${assaultUnit.name} 돌격대가 ${title}으로 연합 전선을 공격했습니다.`;
  return {
    actionType,
    title,
    message,
    profile,
    assaultUnit,
    assaultPowerRatio,
    threat,
    dueTicks,
    skillCount,
    sequenceBefore,
    sequenceAfter,
    damage,
    heal,
    allianceHpBefore,
    allianceHpAfter: Math.max(0, allianceHpBefore - damage),
    phaseHpBefore,
    phaseHpAfter: Math.min(phaseMaxHp, phaseHpBefore + heal),
    effect,
    nextActionAt: new Date(nextMs + dueTicks * intervalMs).toISOString(),
  };
}
async function ensureMonsterAiSchema(env) {
  const marker = await env.DB.prepare("SELECT value FROM app_meta WHERE key=?")
    .bind(SIEGE_AI_SCHEMA_MARKER)
    .first();
  if (marker) return;
  const postgres = env.DB?.dialect === "postgres";
  const stateTable = postgres
    ? `CREATE TABLE IF NOT EXISTS monster_siege_ai_state(
        event_id BIGINT PRIMARY KEY,alliance_hp BIGINT NOT NULL DEFAULT 20000000,
        alliance_max_hp BIGINT NOT NULL DEFAULT 20000000,monster_ai_sequence INTEGER NOT NULL DEFAULT 0,
        next_monster_action_at TIMESTAMPTZ,last_monster_action_at TIMESTAMPTZ,
        monster_effect_code TEXT NOT NULL DEFAULT '',monster_effect_percent INTEGER NOT NULL DEFAULT 0,
        monster_effect_ends_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    : `CREATE TABLE IF NOT EXISTS monster_siege_ai_state(
        event_id INTEGER PRIMARY KEY,alliance_hp INTEGER NOT NULL DEFAULT 20000000,
        alliance_max_hp INTEGER NOT NULL DEFAULT 20000000,monster_ai_sequence INTEGER NOT NULL DEFAULT 0,
        next_monster_action_at TEXT,last_monster_action_at TEXT,
        monster_effect_code TEXT NOT NULL DEFAULT '',monster_effect_percent INTEGER NOT NULL DEFAULT 0,
        monster_effect_ends_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`;
  const actionTable = postgres
    ? `CREATE TABLE IF NOT EXISTS monster_siege_ai_actions(
        id BIGSERIAL PRIMARY KEY,event_id BIGINT NOT NULL,sequence INTEGER NOT NULL,phase_index INTEGER NOT NULL,
        action_type TEXT NOT NULL,skill_code TEXT NOT NULL,skill_name TEXT NOT NULL,damage BIGINT NOT NULL DEFAULT 0,
        healing BIGINT NOT NULL DEFAULT 0,ticks INTEGER NOT NULL DEFAULT 1,alliance_hp_before BIGINT NOT NULL,
        alliance_hp_after BIGINT NOT NULL,phase_hp_before BIGINT NOT NULL,phase_hp_after BIGINT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id,sequence)
      )`
    : `CREATE TABLE IF NOT EXISTS monster_siege_ai_actions(
        id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,sequence INTEGER NOT NULL,phase_index INTEGER NOT NULL,
        action_type TEXT NOT NULL,skill_code TEXT NOT NULL,skill_name TEXT NOT NULL,damage INTEGER NOT NULL DEFAULT 0,
        healing INTEGER NOT NULL DEFAULT 0,ticks INTEGER NOT NULL DEFAULT 1,alliance_hp_before INTEGER NOT NULL,
        alliance_hp_after INTEGER NOT NULL,phase_hp_before INTEGER NOT NULL,phase_hp_after INTEGER NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id,sequence)
      )`;
  const actionIndex = "CREATE INDEX IF NOT EXISTS idx_monster_siege_ai_feed ON monster_siege_ai_actions(event_id,id DESC)";
  if (postgres && typeof env.DB.execSchema === "function") {
    await env.DB.execSchema([stateTable, actionTable, actionIndex]);
  } else {
    await env.DB.batch([
      env.DB.prepare(stateTable),
      env.DB.prepare(actionTable),
      env.DB.prepare(actionIndex),
    ]);
  }
  await env.DB.prepare(
    "INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)",
  )
    .bind(SIEGE_AI_SCHEMA_MARKER, "1")
    .run();
}
async function monsterAiStateRow(env, event, cfg, { create = true } = {}) {
  if (!event) return null;
  let row = await env.DB.prepare(
    "SELECT * FROM monster_siege_ai_state WHERE event_id=?",
  )
    .bind(event.id)
    .first();
  if (!row && create) {
    const intervalMs = clamp(cfg.monsterAttackIntervalSeconds, 15, 300, 45) * 1000,
      rallyEndsAt = utcMs(event.rally_ends_at || event.starts_at),
      nextActionAt = cfg.monsterAiEnabled === false
        ? null
        : new Date(Math.max(Date.now(), Number.isFinite(rallyEndsAt) ? rallyEndsAt : Date.now()) + intervalMs).toISOString(),
      phaseIndex = Math.max(
        0,
        Math.min(cfg.phases.length - 1, Number(event.phase_index || 0)),
      ),
      allianceHp = Math.max(
        1,
        Number(
          cfg.phases[phaseIndex]?.allianceHp ||
            cfg.allianceFortressHp ||
            SIEGE_AI_DEFAULT_FORTRESS_HP,
        ),
      );
    await env.DB.prepare(
      "INSERT OR IGNORE INTO monster_siege_ai_state(event_id,alliance_hp,alliance_max_hp,monster_ai_sequence,next_monster_action_at) VALUES(?,?,?,0,?)",
    )
      .bind(event.id, allianceHp, allianceHp, nextActionAt)
      .run();
    row = await env.DB.prepare("SELECT * FROM monster_siege_ai_state WHERE event_id=?")
      .bind(event.id)
      .first();
  }
  return row;
}
function mergeMonsterAiState(event, row, cfg) {
  if (!event) return null;
  const phaseIndex = Math.max(
      0,
      Math.min(cfg.phases.length - 1, Number(event.phase_index || 0)),
    ),
    phaseAllianceHp = Number(
      cfg.phases[phaseIndex]?.allianceHp ||
        cfg.allianceFortressHp ||
        SIEGE_AI_DEFAULT_FORTRESS_HP,
    );
  const allianceMaxHp = Math.max(
      1,
      Number(row?.alliance_max_hp || phaseAllianceHp),
    ),
    allianceHp = Math.max(0, Math.min(allianceMaxHp, Number(row?.alliance_hp ?? allianceMaxHp)));
  return {
    ...event,
    alliance_hp: allianceHp,
    alliance_max_hp: allianceMaxHp,
    monster_ai_sequence: Math.max(0, Number(row?.monster_ai_sequence || 0)),
    next_monster_action_at: row?.next_monster_action_at || null,
    last_monster_action_at: row?.last_monster_action_at || null,
    monster_effect_code: row?.monster_effect_code || "",
    monster_effect_percent: Number(row?.monster_effect_percent || 0),
    monster_effect_ends_at: row?.monster_effect_ends_at || null,
  };
}
async function hydrateMonsterAiState(env, event, cfg, options) {
  return mergeMonsterAiState(event, await monsterAiStateRow(env, event, cfg, options), cfg);
}
let ensurePromise = null;
async function ensureParticipationBonusTable(env) {
  const postgres = env.DB?.dialect === "postgres";
  const tableSql = postgres
    ? `CREATE TABLE IF NOT EXISTS monster_siege_participation_bonus_v1(
        event_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        bonus_code TEXT NOT NULL,
        min_attacks INTEGER NOT NULL,
        coin BIGINT NOT NULL,
        attacks INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(event_id,user_id,bonus_code)
      )`
    : `CREATE TABLE IF NOT EXISTS monster_siege_participation_bonus_v1(
        event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        bonus_code TEXT NOT NULL,
        min_attacks INTEGER NOT NULL,
        coin INTEGER NOT NULL,
        attacks INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        paid_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(event_id,user_id,bonus_code)
      )`;
  const indexSql =
    "CREATE INDEX IF NOT EXISTS idx_monster_siege_participation_bonus_status ON monster_siege_participation_bonus_v1(event_id,bonus_code,status)";
  if (postgres && typeof env.DB.execSchema === "function") {
    await env.DB.execSchema([tableSql, indexSql]);
    return;
  }
  await env.DB.batch([env.DB.prepare(tableSql), env.DB.prepare(indexSql)]);
}
async function ensure(env) {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await ensureParticipationBonusTable(env);
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
    await ensureMonsterAiSchema(env);
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
    await env.DB.prepare("UPDATE monster_siege_users SET energy=MAX(0,COALESCE(energy,5)),energy_updated_at=COALESCE(energy_updated_at,updated_at,joined_at,CURRENT_TIMESTAMP) WHERE energy_updated_at IS NULL OR energy IS NULL OR energy<0").run();
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
async function participationBonusState(env) {
  const event = await env.DB.prepare(
    "SELECT id,name,status,starts_at,ends_at,completed_at,total_damage,CURRENT_TIMESTAMP observed_at FROM monster_siege_events WHERE status IN ('CLEARED','FAILED') AND completed_at IS NOT NULL ORDER BY completed_at DESC,id DESC LIMIT 1",
  ).first();
  if (!event) {
    return {
      event: null,
      bonusCode: PARTICIPATION_BONUS_CODE,
      minAttacks: PARTICIPATION_BONUS_MIN_ATTACKS,
      coinPerUser: PARTICIPATION_BONUS_COIN,
      eligibleCount: 0,
      paidCount: 0,
      pendingCount: 0,
      totalCoin: 0,
      targets: [],
    };
  }
  const rows = (
    await env.DB.prepare(
      `SELECT s.user_id,u.nickname,s.attacks,s.damage,
        COALESCE(b.status,'PENDING') bonus_status,b.paid_at,CURRENT_TIMESTAMP observed_at
       FROM monster_siege_users s
       JOIN users u ON u.id=s.user_id
       LEFT JOIN monster_siege_participation_bonus_v1 b
         ON b.event_id=s.event_id AND b.user_id=s.user_id AND b.bonus_code=?
       WHERE s.event_id=? AND s.attacks>=?
       ORDER BY s.attacks DESC,s.damage DESC,s.user_id ASC`,
    )
      .bind(PARTICIPATION_BONUS_CODE, event.id, PARTICIPATION_BONUS_MIN_ATTACKS)
      .all()
  ).results || [];
  const targets = rows.map((row) => ({
    userId: Number(row.user_id),
    nickname: String(row.nickname || ""),
    attacks: Number(row.attacks || 0),
    damage: Number(row.damage || 0),
    paid: row.bonus_status === "DONE",
    paidAt: row.paid_at || null,
  }));
  const paidCount = targets.filter((target) => target.paid).length;
  return {
    event: {
      id: Number(event.id),
      name: event.name,
      status: event.status,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      completedAt: event.completed_at,
      totalDamage: Number(event.total_damage || 0),
    },
    bonusCode: PARTICIPATION_BONUS_CODE,
    minAttacks: PARTICIPATION_BONUS_MIN_ATTACKS,
    coinPerUser: PARTICIPATION_BONUS_COIN,
    eligibleCount: targets.length,
    paidCount,
    pendingCount: targets.length - paidCount,
    totalCoin: targets.length * PARTICIPATION_BONUS_COIN,
    targets,
  };
}
async function createEvent(env, cfg) {
  const first = cfg.phases[0],
    now = Date.now(),
    rallyEndsAt = new Date(now + cfg.rallyMinutes * 60000).toISOString(),
    endsAt = new Date(now + (cfg.rallyMinutes + cfg.durationMinutes) * 60000).toISOString();
  const result = await env.DB.prepare(
    "INSERT INTO monster_siege_events(name,status,phase_index,phase_hp,phase_max_hp,starts_at,rally_ends_at,ends_at) VALUES(?,'ACTIVE',0,?,?,CURRENT_TIMESTAMP,?,?)",
  )
    .bind(cfg.name, first.hp, first.hp, rallyEndsAt, endsAt)
    .run();
  const event = await env.DB.prepare("SELECT * FROM monster_siege_events WHERE id=?")
    .bind(result.meta.last_row_id)
    .first();
  return hydrateMonsterAiState(env, event, cfg);
}
async function advanceMonsterAi(env, event, cfg, now = Date.now()) {
  if (!event || event.status !== "ACTIVE") return event;
  event = await hydrateMonsterAiState(env, event, cfg);
  if (cfg.monsterAiEnabled === false) return event;
  const intervalMs = clamp(cfg.monsterAttackIntervalSeconds, 15, 300, 45) * 1000;
  const rallyEndsAt = utcMs(event.rally_ends_at || event.starts_at);
  if (!Number.isFinite(utcMs(event.next_monster_action_at))) {
    const firstActionAt = new Date(
      Math.max(now, Number.isFinite(rallyEndsAt) ? rallyEndsAt : now) + intervalMs,
    ).toISOString();
    await env.DB.prepare(
      `UPDATE monster_siege_ai_state SET next_monster_action_at=?,updated_at=${databaseNowSql(env)} WHERE event_id=? AND next_monster_action_at IS NULL`,
    )
      .bind(firstActionAt, event.id)
      .run();
    const current = await env.DB.prepare("SELECT * FROM monster_siege_events WHERE id=?")
      .bind(event.id)
      .first();
    return hydrateMonsterAiState(env, current, cfg);
  }
  if (Number.isFinite(rallyEndsAt) && rallyEndsAt > now) return event;
  const plan = monsterAiPlan({ event, cfg, now });
  if (!plan) return event;
  const currentIndex = Math.max(0, Math.min(cfg.phases.length - 1, Number(event.phase_index || 0))),
    retreat = plan.allianceHpAfter <= 0 && currentIndex > 0,
    finalDefeat = plan.allianceHpAfter <= 0 && currentIndex === 0,
    nextIndex = retreat ? currentIndex - 1 : currentIndex,
    nextPhase = cfg.phases[nextIndex],
    frontHpAfter = retreat ? Number(nextPhase.hp) : plan.phaseHpAfter,
    frontMaxHpAfter = retreat ? Number(nextPhase.hp) : Number(event.phase_max_hp || nextPhase.hp),
    resetAllianceHp = Math.max(1, Number(nextPhase.allianceHp || cfg.allianceFortressHp)),
    allianceMaxHpAfter = retreat
      ? resetAllianceHp
      : Math.max(1, Number(event.alliance_max_hp || nextPhase.allianceHp)),
    storedAllianceHp = retreat ? resetAllianceHp : plan.allianceHpAfter,
    retreatDelayMs = clamp(cfg.monsterAttackIntervalSeconds, 15, 300, 45) * 1000,
    nextActionAt = retreat ? new Date(now + retreatDelayMs).toISOString() : plan.nextActionAt,
    effect = retreat ? null : plan.effect,
    actionType = retreat ? "BREAKTHROUGH" : plan.actionType,
    actionCode = retreat ? "MONSTER_RECLAIM" : plan.profile.code,
    actionTitle = retreat ? "몬스터 거점 탈환" : plan.title,
    versionAfter = Number(event.version || 0) + 1,
    actionTimestamp = new Date(now).toISOString(),
    payload = {
      role: plan.profile.role,
      description: retreat
        ? `${plan.assaultUnit.name} 돌격대가 연합 방어선을 붕괴시키고 ${nextPhase.name} 전선을 탈환했습니다.`
        : plan.message,
      skillCount: plan.skillCount,
      threat: plan.threat,
      effect,
      assaultUnit: plan.assaultUnit,
      movement: {
        type: retreat ? "RECLAIM" : "ASSAULT",
        fromFrontIndex: currentIndex,
        toFrontIndex: nextIndex,
      },
    },
    results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE monster_siege_events SET phase_index=?,phase_hp=?,phase_max_hp=?,version=version+1,updated_at=?
         WHERE id=? AND version=? AND status='ACTIVE'`,
      ).bind(
        nextIndex,
        frontHpAfter,
        frontMaxHpAfter,
        actionTimestamp,
        event.id,
        event.version,
      ),
      env.DB.prepare(
        `UPDATE monster_siege_ai_state SET alliance_hp=?,alliance_max_hp=?,monster_ai_sequence=?,next_monster_action_at=?,
          last_monster_action_at=?,monster_effect_code=?,monster_effect_percent=?,monster_effect_ends_at=?,
          updated_at=${databaseNowSql(env)}
         WHERE event_id=? AND EXISTS(
           SELECT 1 FROM monster_siege_events WHERE id=? AND version=? AND updated_at=?
         )`,
      ).bind(
        storedAllianceHp,
        allianceMaxHpAfter,
        plan.sequenceAfter,
        nextActionAt,
        actionTimestamp,
        effect?.code || "",
        Number(effect?.percent || 0),
        effect?.endsAt || null,
        event.id,
        event.id,
        versionAfter,
        actionTimestamp,
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO monster_siege_ai_actions(
          event_id,sequence,phase_index,action_type,skill_code,skill_name,damage,healing,ticks,
          alliance_hp_before,alliance_hp_after,phase_hp_before,phase_hp_after,payload_json
        ) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?
          WHERE EXISTS(SELECT 1 FROM monster_siege_events WHERE id=? AND version=? AND updated_at=?)
            AND EXISTS(SELECT 1 FROM monster_siege_ai_state WHERE event_id=? AND monster_ai_sequence=?)`,
      ).bind(
        event.id,
        plan.sequenceAfter,
        currentIndex,
        actionType,
        actionCode,
        actionTitle,
        plan.damage,
        plan.heal,
        plan.dueTicks,
        plan.allianceHpBefore,
        plan.allianceHpAfter,
        plan.phaseHpBefore,
        frontHpAfter,
        JSON.stringify(payload),
        event.id,
        versionAfter,
        actionTimestamp,
        event.id,
        plan.sequenceAfter,
      ),
    ]);
  if (!Number(results[0]?.meta?.changes || 0))
    return hydrateMonsterAiState(
      env,
      await env.DB.prepare("SELECT * FROM monster_siege_events WHERE id=?").bind(event.id).first(),
      cfg,
    );
  const current = await env.DB.prepare("SELECT * FROM monster_siege_events WHERE id=?")
    .bind(event.id)
    .first();
  const hydrated = await hydrateMonsterAiState(env, current, cfg);
  if (finalDefeat && hydrated && Number(hydrated.alliance_hp || 0) <= 0) {
    await settle(env, hydrated, cfg, "FAILED");
    return null;
  }
  return hydrated;
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
  if (event && utcMs(event.ends_at) <= Date.now()) {
    await settle(env, event, cfg, "FAILED");
    event = null;
  }
  if (!event && create && cfg.mode !== "OFF")
    event = await createEvent(env, cfg);
  if (event) event = await advanceMonsterAi(env, event, cfg);
  return event;
}
function publicPhase(cfg, event) {
  const index = Math.max(0, Math.min(4, Number(event?.phase_index || 0))),
    phase = cfg.phases[index];
  return {
    ...phase,
    ai: phase.ai || monsterAiProfile(phase.key),
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
function publicCampaign(cfg, event) {
  if (!event) return null;
  const phaseIndex = Math.max(0, Math.min(cfg.phases.length - 1, Number(event.phase_index || 0))),
    frontNodeIndex = phaseIndex + 1,
    phase = cfg.phases[phaseIndex],
    formation = monsterFormation(phase.key),
    sequence = Math.max(0, Number(event.monster_ai_sequence || 0)),
    assaultLeadIndex = sequence % formation.assault.length,
    allianceMaxHp = Math.max(1, Number(event.alliance_max_hp || cfg.allianceFortressHp)),
    allianceHp = Math.max(0, Math.min(allianceMaxHp, Number(event.alliance_hp ?? allianceMaxHp))),
    monsterMaxHp = Math.max(1, Number(event.phase_max_hp || phase.hp)),
    monsterHp = Math.max(0, Math.min(monsterMaxHp, Number(event.phase_hp ?? monsterMaxHp))),
    unitView = (entry, index, formationType) => ({
      id: entry.id,
      name: entry.name,
      role: entry.role,
      image: entry.image,
      slot: index + 1,
      formationType,
      battlePower: phasePowerFor(phase, formationType, index, entry),
      isBoss: Boolean(entry.isBoss),
      status: formationType === "ASSAULT" && index === assaultLeadIndex ? "LEADING" : formationType === "ASSAULT" ? "MARCHING" : "HOLDING",
    });
  return {
    mode: "TERRITORY_FRONTLINE",
    direction: "ALLIANCE_TO_CITADEL",
    nodes: SIEGE_MAP_NODES.map((node) => ({
      ...node,
      status: node.index < frontNodeIndex ? "ALLIANCE" : node.index === frontNodeIndex ? "CONTESTED" : "MONSTER",
      current: node.index === frontNodeIndex,
      captured: node.index < frontNodeIndex,
    })),
    currentFront: {
      phaseIndex,
      nodeIndex: frontNodeIndex,
      key: phase.key,
      name: SIEGE_MAP_NODES[frontNodeIndex]?.name || phase.name,
      operationName: phase.name,
      subtitle: phase.subtitle,
      commanderName: phase.monsterName,
      commanderArt: phase.monsterImage,
      capturedFronts: phaseIndex,
      totalFronts: cfg.phases.length,
    },
    factions: {
      alliance: {
        code: "ALLIANCE",
        name: "숲켓몬 연합",
        hp: allianceHp,
        maxHp: allianceMaxHp,
        percent: Math.max(0, Math.min(100, (allianceHp / allianceMaxHp) * 100)),
      },
      monster: {
        code: "MONSTER_ARMY",
        name: "심연 몬스터 군단",
        hp: monsterHp,
        maxHp: monsterMaxHp,
        percent: Math.max(0, Math.min(100, (monsterHp / monsterMaxHp) * 100)),
      },
    },
    formations: {
      defense: {
        code: `${phase.key}_DEFENSE`,
        name: `${phase.name} 방어대`,
        mission: "현재 몬스터 거점 주둔 · 유저 공략 저지",
        nodeIndex: frontNodeIndex,
        units: formation.defense.map((entry, index) => unitView(entry, index, "DEFENSE")),
      },
      assault: {
        code: `${phase.key}_ASSAULT`,
        name: `${phase.name} 돌격대`,
        mission: "연합 점령지 공격 · 거점 탈환",
        originNodeIndex: frontNodeIndex,
        targetNodeIndex: Math.max(0, frontNodeIndex - 1),
        nextActionAt: event.next_monster_action_at || null,
        leadUnitId: formation.assault[assaultLeadIndex]?.id || null,
        units: formation.assault.map((entry, index) => unitView(entry, index, "ASSAULT")),
      },
    },
  };
}
function adminFormationCatalog(cfg) {
  return cfg.phases.map((phase, phaseIndex) => {
    const formation = monsterFormation(phase.key),
      units = (entries, formationType) =>
        entries.map((entry, unitIndex) => ({
          id: entry.id,
          name: entry.name,
          role: entry.role,
          image: entry.image,
          isBoss: Boolean(entry.isBoss),
          battlePower: phasePowerFor(
            phase,
            formationType,
            unitIndex,
            entry,
          ),
        }));
    return {
      phaseIndex,
      key: phase.key,
      name: phase.name,
      defense: units(formation.defense, "DEFENSE"),
      assault: units(formation.assault, "ASSAULT"),
    };
  });
}
function siegeEnergySnapshot(row, cfg, now = Date.now()) {
  const maxEnergy = clamp(
      cfg?.attackCountMax,
      1,
      50,
      SIEGE_ENERGY_MAX,
    ),
    rechargeSeconds =
      clamp(
        cfg?.attackRechargeMinutes,
        1,
        1440,
        SIEGE_ENERGY_RECHARGE_SECONDS / 60,
      ) * 60,
    stored = Math.max(0, Math.min(maxEnergy, Number(row?.energy ?? maxEnergy)));
  const rawUpdated = row?.energy_updated_at || row?.updated_at || row?.joined_at;
  const updatedMs = rawUpdated ? utcMs(rawUpdated) : now;
  const intervalMs = rechargeSeconds * 1000;
  const gained = stored >= maxEnergy ? 0 : Math.max(0, Math.floor((now - updatedMs) / intervalMs));
  const energy = Math.min(maxEnergy, stored + gained);
  const anchorMs = gained > 0 ? updatedMs + gained * intervalMs : updatedMs;
  return {
    energy,
    maxEnergy,
    rechargeSeconds,
    nextRechargeAt: energy >= maxEnergy ? null : new Date(anchorMs + intervalMs).toISOString(),
    anchorAt: new Date(energy >= maxEnergy ? now : anchorMs).toISOString().replace("T", " ").replace("Z", ""),
    gained,
  };
}
async function refreshSiegeEnergy(env, eventId, userId, row, cfg) {
  const snapshot = siegeEnergySnapshot(row, cfg);
  if (snapshot.gained > 0 || Number(row?.energy ?? snapshot.maxEnergy) !== snapshot.energy || !row?.energy_updated_at) {
    await env.DB.prepare("UPDATE monster_siege_users SET energy=?,energy_updated_at=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=?")
      .bind(snapshot.energy, snapshot.anchorAt, eventId, userId).run();
  }
  return snapshot;
}
async function state(env, user, cfg, event) {
  const rallyEndsAt = event?.rally_ends_at || event?.starts_at || null,
    rallyOpen = Boolean(event && utcMs(rallyEndsAt) > Date.now()),
    [mine, rankingResult, reward, aiResult] = await Promise.all([
      event
        ? env.DB.prepare("SELECT * FROM monster_siege_users WHERE event_id=? AND user_id=?")
            .bind(event.id, user.id)
            .first()
        : Promise.resolve(null),
      event
        ? env.DB.prepare(
            "SELECT s.user_id,u.nickname,s.damage,s.attacks FROM monster_siege_users s JOIN users u ON u.id=s.user_id WHERE s.event_id=? ORDER BY s.damage DESC,s.attacks DESC LIMIT 20",
          )
            .bind(event.id)
            .all()
        : Promise.resolve({ results: [] }),
      env.DB.prepare(
        "SELECT * FROM monster_siege_rewards WHERE user_id=? AND claimed_at IS NULL ORDER BY event_id DESC LIMIT 1",
      )
        .bind(user.id)
        .first(),
      event
        ? env.DB.prepare(
            "SELECT * FROM monster_siege_ai_actions WHERE event_id=? ORDER BY id DESC LIMIT 12",
          )
            .bind(event.id)
            .all()
        : Promise.resolve({ results: [] }),
    ]),
    ranking = rankingResult?.results || [],
    aiActions = (aiResult?.results || []).map((row) => {
      const payload = jsonSafe(row.payload_json, {});
      return {
        id: Number(row.id || 0),
        sequence: Number(row.sequence || 0),
        phaseIndex: Number(row.phase_index || 0),
        actionType: row.action_type,
        skillCode: row.skill_code,
        skillName: row.skill_name,
        damage: Number(row.damage || 0),
        healing: Number(row.healing || 0),
        ticks: Number(row.ticks || 1),
        allianceHpBefore: Number(row.alliance_hp_before || 0),
        allianceHpAfter: Number(row.alliance_hp_after || 0),
        phaseHpBefore: Number(row.phase_hp_before || 0),
        phaseHpAfter: Number(row.phase_hp_after || 0),
        role: payload.role || "MONSTER OPERATION",
        description: payload.description || "몬스터 군단이 독자 작전을 실행했습니다.",
        threat: payload.threat || null,
        effect: payload.effect || null,
        assaultUnit: payload.assaultUnit || null,
        movement: payload.movement || null,
        createdAt: row.created_at,
      };
    });
  const energy = mine ? await refreshSiegeEnergy(env, event.id, user.id, mine, cfg) : null;
  const phase = event ? publicPhase(cfg, event) : null,
    profile = phase?.ai || monsterAiProfile("OUTER"),
    sequence = Number(event?.monster_ai_sequence || 0),
    threat = event ? monsterThreat(event) : null,
    allianceMaxHp = Math.max(1, Number(event?.alliance_max_hp || cfg.allianceFortressHp)),
    allianceHp = Math.max(0, Math.min(allianceMaxHp, Number(event?.alliance_hp ?? allianceMaxHp))),
    currentEffect = event ? activeMonsterEffect(event) : null;
  const campaign = event ? publicCampaign(cfg, event) : null;
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
          version: Number(event.version || 0),
        }
      : null,
    phase,
    campaign,
    ai: event
      ? {
          enabled: cfg.monsterAiEnabled !== false,
          allianceHp,
          allianceMaxHp,
          allianceFactionHp: allianceHp,
          allianceFactionMaxHp: allianceMaxHp,
          monsterFactionHp: Number(event.phase_hp || 0),
          monsterFactionMaxHp: Number(event.phase_max_hp || 1),
          alliancePercent: Math.max(0, Math.min(100, (allianceHp / allianceMaxHp) * 100)),
          sequence,
          nextActionAt: event.next_monster_action_at,
          lastActionAt: event.last_monster_action_at,
          nextSkillIn: Math.max(1, Number(profile.skillEvery || 4) - (sequence % Number(profile.skillEvery || 4))),
          profile,
          threat,
          currentEffect,
          recentActions: aiActions,
        }
      : null,
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
    cardUniqueDeckState,
    writeAdminLog,
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
    if (utcMs(rallyEndsAt) <= Date.now())
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
      "INSERT INTO monster_siege_users(event_id,user_id,deck_snapshot,deck_power,energy,energy_updated_at) SELECT ?,?,?,?,?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM monster_siege_events WHERE id=? AND status='ACTIVE' AND datetime(COALESCE(rally_ends_at,starts_at))>CURRENT_TIMESTAMP) ON CONFLICT(event_id,user_id) DO UPDATE SET deck_snapshot=excluded.deck_snapshot,deck_power=excluded.deck_power,updated_at=CURRENT_TIMESTAMP",
    )
      .bind(event.id, user.id, JSON.stringify(deck), power, cfg.attackCountMax, event.id)
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
    if (utcMs(rallyEndsAt) > Date.now())
      return json({ error: "현재 집결 중입니다. 집결 시간이 끝난 뒤 공격할 수 있습니다." }, 409);
    const mine = await env.DB.prepare(
      "SELECT * FROM monster_siege_users WHERE event_id=? AND user_id=?",
    )
      .bind(event.id, user.id)
      .first();
    if (!mine) return json({ error: "공성전에 먼저 참가하세요." }, 403);
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
    // Battle Suit is an account-unit PVE bonus, but Monster Siege is a
    // territory-war mode. Subtract it at this server boundary as well as
    // hiding the account unit in the V3 renderer, so stale/corrupt DB values
    // cannot leak into siege power or battle simulation.
    const siegePveBonus = Math.max(
      0,
      Number(characterBonus?.pve || 0) -
        Number(characterBonus?.battleSuitPve || 0),
    );
    const uniqueBattle =
        typeof cardUniqueDeckState === "function"
          ? await cardUniqueDeckState(env, user, deck, "PVE")
          : null,
      battleDeck =
        uniqueBattle?.enabled && Array.isArray(uniqueBattle.cards) && uniqueBattle.cards.length === deck.length
          ? uniqueBattle.cards
          : deck;
    // V1935: 엔진에는 원본 전투력 + 고유효과 객체만 넘긴다.
    //   battleDeck 은 이미 공격%가 곱해진 카드라, 그대로 넣으면 buildFighter 가
    //   같은 %를 한 번 더 곱해 공성만 PVE 와 같은 이중 적용이 된다.
    //   화면에 나가는 cards 는 battleDeck 그대로 두어 표시 전투력은 바뀌지 않는다.
    const siegeUniqueById = new Map(
      (uniqueBattle?.cards || []).map(card => [String(card.id), card]),
    );
    const engineDeck = deck.map(card => {
      const uniqueCard = siegeUniqueById.get(String(card.id));
      return {
        ...card,
        uniqueAbility: uniqueCard?.uniqueAbility || card.uniqueAbility || null,
        uniqueAdvancement: uniqueCard?.uniqueAdvancement || null,
      };
    });
    const refreshedEnergy = await refreshSiegeEnergy(env, event.id, user.id, mine, cfg);
    if (refreshedEnergy.energy < 1)
      return json({ error: `공격권이 부족합니다. ${cfg.attackRechargeMinutes}분마다 1회 충전됩니다.`, energy: refreshedEnergy }, 429);
    const playerPower =
        (uniqueBattle?.enabled && Number.isFinite(Number(uniqueBattle.power))
          ? Number(uniqueBattle.power)
          : deck.reduce((sum, card) => sum + Number(card.power || 0), 0)) +
        siegePveBonus,
      seed = Array.from(`${event.id}:${user.id}:${requestId}`).reduce(
        (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
        2166136261,
      ),
      defenseFormation = monsterFormation(phase.key).defense,
      defenseIndex = seed % defenseFormation.length,
      defenseUnit = defenseFormation[defenseIndex],
      monsterPower = phasePowerFor(
        phase,
        "DEFENSE",
        defenseIndex,
        defenseUnit,
      ),
      monster = {
        id: `SIEGE-${defenseUnit.id}`,
        name: defenseUnit.name,
        image: defenseUnit.image,
        battle_power: monsterPower,
        is_boss: defenseUnit.isBoss ? 1 : 0,
        role: defenseUnit.role,
        formation: "DEFENSE",
      },
      battleV2 = createPveBattleV2({
        cards: engineDeck,
        characterBonus: siegePveBonus,
        monster,
        seed,
        singleHealerBonus: battleCfg?.engine?.singleHealerBonus,
      }),
      result = battleV2.result.winner === "A" ? "WIN" : "LOSE",
      monsterEffect = activeMonsterEffect(event),
      monsterDamageReductionPercent = Number(monsterEffect?.percent || 0),
      damageFormula = calculatePlayerSiegeDamage({
        playerPower,
        result,
        cfg,
        phase,
        seed,
        monsterDamageReductionPercent,
      }),
      baseContribution = damageFormula.baseContribution,
      contributionPercent = damageFormula.contributionPercent,
      unmitigatedDamage = damageFormula.unmitigatedDamage,
      raw = damageFormula.damage,
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
    ).bind(cfg.attackCountMax, event.id, user.id).run();
    if (!Number(energySpent.meta?.changes || 0)) {
      await env.DB.prepare("DELETE FROM monster_siege_actions WHERE request_id=? AND user_id=? AND result_json IS NULL").bind(requestId, user.id).run();
      return json({ error: `공격권이 부족합니다. ${cfg.attackRechargeMinutes}분마다 1회 충전됩니다.` }, 429);
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
            `몬스터 공성전 1판 승리 보상: ${defenseUnit.name}`,
            user.id,
          ),
        );
      if (winReward.shards > 0)
        statements.push(
          env.DB.prepare(
            "INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) SELECT id,?,card_shards,?,NULL FROM users WHERE id=?",
          ).bind(
            winReward.shards,
            `몬스터 공성전 1판 승리 보상: ${defenseUnit.name}`,
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
    if (cleared) {
      statements.push(
        env.DB.prepare(
          "UPDATE monster_siege_events SET phase_hp=0,total_damage=total_damage+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
        ).bind(damage, event.id),
      );
    } else if (nextIndex !== Number(event.phase_index)) {
      statements.push(
        env.DB.prepare(
          "UPDATE monster_siege_events SET phase_index=?,phase_hp=?,phase_max_hp=?,total_damage=total_damage+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
        ).bind(
          nextIndex,
          nextPhase.hp,
          nextPhase.hp,
          damage,
          event.id,
        ),
        env.DB.prepare(
          `UPDATE monster_siege_ai_state SET alliance_hp=?,alliance_max_hp=?,monster_effect_code='',monster_effect_percent=0,monster_effect_ends_at=NULL,next_monster_action_at=?,updated_at=${databaseNowSql(env)} WHERE event_id=?`,
        ).bind(
          nextPhase.allianceHp,
          nextPhase.allianceHp,
          new Date(Date.now() + cfg.monsterAttackIntervalSeconds * 1000).toISOString(),
          event.id,
        ),
      );
    } else {
      statements.push(
        env.DB.prepare(
          "UPDATE monster_siege_events SET phase_hp=MAX(0,phase_hp-?),total_damage=total_damage+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
        ).bind(damage, damage, event.id),
      );
    }
    try {
      await env.DB.batch(statements);
    } catch (error) {
      await env.DB.batch([
        env.DB.prepare("UPDATE monster_siege_users SET energy=MIN(?,energy+1),updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=?").bind(cfg.attackCountMax, event.id, user.id),
        env.DB.prepare("DELETE FROM monster_siege_actions WHERE request_id=? AND user_id=? AND result_json IS NULL").bind(requestId, user.id),
      ]).catch(() => {});
      throw error;
    }
    if (cleared) await settle(env, event, cfg, "CLEARED");
    const currentRow = await env.DB.prepare(
        "SELECT * FROM monster_siege_events WHERE id=?",
      )
        .bind(event.id)
        .first(),
      current = currentRow?.status === "ACTIVE"
        ? await hydrateMonsterAiState(env, currentRow, cfg)
        : currentRow,
      payload = {
        ok: true,
        result,
        damage,
        contributionPercent,
        baseContribution,
        unmitigatedDamage,
        damageFormula: {
          phaseMultiplierPercent: damageFormula.phaseMultiplierPercent,
          variancePercent: damageFormula.variancePercent,
          varianceMultiplier: damageFormula.varianceMultiplier,
          cappedDamage: damageFormula.cappedDamage,
        },
        monsterEffect,
        monsterDamageReductionPercent,
        winReward,
        playerPower,
        monsterPower,
        mode: "SIEGE",
        battlefieldMode: "SIEGE",
        contentType: "MONSTER_SIEGE",
        battleV2,
        cards: battleDeck,
        monster: {
          id: monster.id,
          name: monster.name,
          image: monster.image,
          isBoss: Boolean(monster.is_boss),
          role: monster.role,
          formation: monster.formation,
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
        formationCatalog: adminFormationCatalog(cfg),
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
      let running = await env.DB.prepare(
        "SELECT * FROM monster_siege_events WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1",
      ).first();
      if (running) {
        running = await hydrateMonsterAiState(env, running, cfg);
        const phaseIndex = Math.max(
            0,
            Math.min(4, Number(running.phase_index || 0)),
          ),
          phaseHp = next.phases[phaseIndex].hp,
          phaseAllianceHp = next.phases[phaseIndex].allianceHp,
          previousMonsterMax = Math.max(
            1,
            Number(running.phase_max_hp || phaseHp),
          ),
          previousMonsterHp = Math.max(
            0,
            Math.min(previousMonsterMax, Number(running.phase_hp ?? previousMonsterMax)),
          ),
          monsterHp = Math.round(
            phaseHp * (previousMonsterHp / previousMonsterMax),
          ),
          previousAllianceMax = Math.max(1, Number(running.alliance_max_hp || phaseAllianceHp)),
          previousAllianceHp = Math.max(0, Math.min(previousAllianceMax, Number(running.alliance_hp ?? previousAllianceMax))),
          allianceHp = Math.round(phaseAllianceHp * (previousAllianceHp / previousAllianceMax)),
          energyRulesChanged =
            cfg.attackCountMax !== next.attackCountMax ||
            cfg.attackRechargeMinutes !== next.attackRechargeMinutes,
          aiScheduleChanged =
            cfg.monsterAiEnabled !== next.monsterAiEnabled ||
            cfg.monsterAttackIntervalSeconds !== next.monsterAttackIntervalSeconds,
          nextMonsterActionAt = !next.monsterAiEnabled
            ? null
            : aiScheduleChanged || !running.next_monster_action_at
              ? new Date(Date.now() + next.monsterAttackIntervalSeconds * 1000).toISOString()
              : running.next_monster_action_at,
          monsterEffectCode = next.monsterAiEnabled ? String(running.monster_effect_code || "") : "",
          monsterEffectPercent = next.monsterAiEnabled ? Number(running.monster_effect_percent || 0) : 0,
          monsterEffectEndsAt = next.monsterAiEnabled ? running.monster_effect_ends_at || null : null,
          stateUpdate = env.DB.prepare(
            `UPDATE monster_siege_ai_state SET alliance_hp=?,alliance_max_hp=?,next_monster_action_at=?,monster_effect_code=?,monster_effect_percent=?,monster_effect_ends_at=?,updated_at=${databaseNowSql(env)} WHERE event_id=?`,
          ).bind(
            allianceHp,
            phaseAllianceHp,
            nextMonsterActionAt,
            monsterEffectCode,
            monsterEffectPercent,
            monsterEffectEndsAt,
            running.id,
          ),
          energyRuleUpdates = energyRulesChanged
            ? [
                env.DB.prepare(
                  "UPDATE monster_siege_users SET energy=MIN(?,MAX(0,energy)),energy_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE event_id=?",
                ).bind(next.attackCountMax, running.id),
              ]
            : [];
        const rallyOpen = utcMs(running.rally_ends_at) > Date.now();
        if (rallyOpen) {
          await env.DB.batch([
            env.DB.prepare(
              "UPDATE monster_siege_events SET rally_ends_at=datetime('now',?),ends_at=datetime('now',?),phase_hp=?,phase_max_hp=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
            ).bind(`+${next.rallyMinutes} minutes`, `+${next.rallyMinutes + next.durationMinutes} minutes`, monsterHp, phaseHp, running.id),
            stateUpdate,
            ...energyRuleUpdates,
          ]);
        } else {
          await env.DB.batch([
            env.DB.prepare(
              "UPDATE monster_siege_events SET ends_at=datetime('now',?),phase_hp=?,phase_max_hp=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
            ).bind(`+${next.durationMinutes} minutes`, monsterHp, phaseHp, running.id),
            stateUpdate,
            ...energyRuleUpdates,
          ]);
        }
      }
      return json({ ok: true, settings: next });
    }
  }
  if (path === "admin/siege/participation-bonus") {
    if (user.role !== "OWNER")
      return json({ error: "OWNER만 참여 보상을 지급할 수 있습니다." }, 403);
    if (request.method === "GET")
      return json({ ok: true, state: await participationBonusState(env) });
    if (request.method === "POST") {
      const body = await readBody(request);
      const before = await participationBonusState(env);
      if (!before.event)
        return json({ error: "지급할 종료 회차가 없습니다." }, 404);
      if (Number(body.eventId) !== before.event.id)
        return json(
          { error: "종료 회차가 변경되었습니다. 대상을 다시 확인해주세요.", state: before },
          409,
        );
      if (!before.eligibleCount)
        return json({ error: "5회 이상 참여한 지급 대상이 없습니다.", state: before }, 409);
      const reason = `MONSTER_SIEGE_EVENT_${before.event.id}_5_PLUS_PARTICIPATION_BONUS`;
      const ledgerNow = env.DB?.dialect === "postgres" ? "NOW()" : "CURRENT_TIMESTAMP";
      const results = await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO monster_siege_participation_bonus_v1(
            event_id,user_id,bonus_code,min_attacks,coin,attacks,status
          ) SELECT event_id,user_id,?,?,?,attacks,'PENDING'
            FROM monster_siege_users WHERE event_id=? AND attacks>=?`,
        ).bind(
          PARTICIPATION_BONUS_CODE,
          PARTICIPATION_BONUS_MIN_ATTACKS,
          PARTICIPATION_BONUS_COIN,
          before.event.id,
          PARTICIPATION_BONUS_MIN_ATTACKS,
        ),
        env.DB.prepare(
          `UPDATE users SET coin=coin+? WHERE id IN (
            SELECT user_id FROM monster_siege_participation_bonus_v1
            WHERE event_id=? AND bonus_code=? AND status='PENDING'
          )`,
        ).bind(PARTICIPATION_BONUS_COIN, before.event.id, PARTICIPATION_BONUS_CODE),
        env.DB.prepare(
          `INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
           SELECT id,?,coin,? FROM users WHERE id IN (
             SELECT user_id FROM monster_siege_participation_bonus_v1
             WHERE event_id=? AND bonus_code=? AND status='PENDING'
           )`,
        ).bind(
          PARTICIPATION_BONUS_COIN,
          reason,
          before.event.id,
          PARTICIPATION_BONUS_CODE,
        ),
        env.DB.prepare(
          `UPDATE monster_siege_participation_bonus_v1
           SET status='DONE',paid_at=${ledgerNow},updated_at=${ledgerNow}
           WHERE event_id=? AND bonus_code=? AND status='PENDING'`,
        ).bind(before.event.id, PARTICIPATION_BONUS_CODE),
      ]);
      const paidNow = Number(results[1]?.meta?.changes || 0);
      const after = await participationBonusState(env);
      try {
        await writeAdminLog?.(
          env,
          user,
          "MONSTER_SIEGE_PARTICIPATION_BONUS",
          "MONSTER_SIEGE_EVENT",
          String(before.event.id),
          { eligibleCount: before.eligibleCount, paidCount: before.paidCount },
          {
            minAttacks: PARTICIPATION_BONUS_MIN_ATTACKS,
            coinPerUser: PARTICIPATION_BONUS_COIN,
            paidNow,
            paidCount: after.paidCount,
          },
        );
      } catch (error) {
        console.error("monster siege participation bonus admin log failed", error);
      }
      return json({ ok: true, paidNow, state: after });
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
    if (utcMs(rallyEndsAt) <= Date.now())
      return json({ error: "이미 공성 전투가 시작되었습니다." }, 409);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE monster_siege_events SET rally_ends_at=CURRENT_TIMESTAMP,ends_at=datetime('now',?),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'",
      ).bind(`+${cfg.durationMinutes} minutes`, event.id),
      env.DB.prepare(
        `UPDATE monster_siege_ai_state SET next_monster_action_at=?,updated_at=${databaseNowSql(env)} WHERE event_id=?`,
      ).bind(
        new Date(Date.now() + cfg.monsterAttackIntervalSeconds * 1000).toISOString(),
        event.id,
      ),
    ]);
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

export const __siegeAiTest = {
  cleanSettings,
  monsterAiPlan,
  monsterAiProfile,
  monsterFormation,
  monsterThreat,
  activeMonsterEffect,
  publicCampaign,
  phasePowerFor,
  calculatePlayerSiegeDamage,
  adminFormationCatalog,
  siegeEnergySnapshot,
  databaseNowSql,
};
