// 붕괴 코어 레이드는 라이브 월드 레이드와 분리된 방 기반 협동 콘텐츠다.
// PROJECT V V3는 전투 표현만 담당하며 방 상태, 기믹 판정과 보상은 서버가 확정한다.
const SETTINGS_KEY = 'raid_core_protocol_settings_v2024';
const LEGACY_SETTINGS_KEY = 'raid_core_protocol_settings_v2021';
const FOUNDATION_KEY = 'raid_core_protocol_foundation_v2024';
const ROOM_TABLE = 'raid_core_rooms_v2024';
const MEMBER_TABLE = 'raid_core_members_v2024';
const ACTIVE_MEMBER_TABLE = 'raid_core_active_members_v2024';
const ATTEMPT_TABLE = 'raid_core_attempts_v2024';
const RECEIPT_TABLE = 'raid_core_receipts_v2024';
const REWARD_RECEIPT_TABLE = 'raid_core_reward_receipts_v2024';
export const CORE_RAID_ENTRY_TICKET = 'CORE_RAID_ENTRY_TICKET';

const OPERATIONS = Object.freeze({
  BREAK: {
    key: 'BREAK',
    name: '파쇄',
    label: 'BREACH',
    roles: ['ATTACK', 'SPEED'],
    description: '공격형·속도형 카드로 붕괴 코어의 외피를 파괴합니다.'
  },
  BLOCK: {
    key: 'BLOCK',
    name: '차단',
    label: 'INTERCEPT',
    roles: ['DEFENSE'],
    description: '방어형 카드로 코어 간 에너지 연결을 차단합니다.'
  },
  STABILIZE: {
    key: 'STABILIZE',
    name: '안정화',
    label: 'STABILIZE',
    roles: ['HP'],
    description: 'HP형·회복 카드로 폭주 에너지를 안정화합니다.'
  }
});

const CORE_BUFFS = Object.freeze({
  BREAK: { id: 'GRAVITY_ARMOR', core: 'BREAK', name: '초중력 외피', effect: '누적 피해 18% 경감', damageReductionPct: 18 },
  BLOCK: { id: 'COUNTER_CURRENT', core: 'BLOCK', name: '역류 전도체', effect: '누적 피해 14% 경감', damageReductionPct: 14 },
  STABILIZE: { id: 'REGEN_LOOP', core: 'STABILIZE', name: '자가 복원 루프', effect: '누적 피해 16% 경감', damageReductionPct: 16 }
});

const DIRECTIONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
const WEAKNESSES = ['ATTACK', 'DEFENSE', 'SPEED', 'HP'];
const TERMINAL_ROOM_STATUSES = new Set(['CLEAR', 'FAILED']);

const integer = (value, fallback = 0, min = 0, max = 2147483647) =>
  Math.max(min, Math.min(max, Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback)));
const cleanText = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const jsonSafe = (value, fallback = {}) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};
const isOwner = user => String(user?.role || '').trim().toUpperCase() === 'OWNER';
const cleanStringList = (value, maxItems = 80, maxLength = 60) =>
  [...new Set((Array.isArray(value) ? value : String(value || '').split(/[\n,]/))
    .map(item => cleanText(item, maxLength))
    .filter(Boolean))].slice(0, maxItems);
const stableHash = value =>
  Array.from(String(value || '')).reduce(
    (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0,
    2166136261
  );
const normalizeOperation = value => OPERATIONS[String(value || '').trim().toUpperCase()]?.key || '';
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const nowIso = () => new Date().toISOString();
const plusMinutesIso = minutes => new Date(Date.now() + Math.max(1, Number(minutes) || 1) * 60000).toISOString();

function randomToken(prefix) {
  const native = globalThis.crypto?.randomUUID?.();
  if (native) return prefix + '-' + native.toUpperCase();
  const entropy = stableHash(prefix + ':' + Date.now() + ':' + Math.random());
  return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + entropy.toString(16).toUpperCase();
}

export function defaultCoreRaidSettings() {
  return {
    mode: 'TEST',
    title: '심연 관측소: 붕괴 코어',
    subtitle: 'ABYSS OBSERVATORY / CORE PROTOCOL',
    description: '입장권으로 공대를 만들고 제한 시간 안에 세 코어와 아르케온을 연속 제압하십시오.',
    bossName: '오메가 코어 · 아르케온',
    bossImage: '/assets/responsive/project-v/monsters/hunt-068-omega-09-sd-v1-768.webp',
    lobbyMinutes: 10,
    battleMinutes: 30,
    minParticipants: 1,
    maxParticipants: 12,
    partyMaxHp: 1000,
    mechanicFailureDamage: 125,
    coreRequired: 360,
    bossMaxHp: 900000000,
    damageScale: 130,
    coreCombatPowerPercent: 55,
    bossCombatPowerPercent: 80,
    bossHpPercent: 300,
    bossAttackPercent: 240,
    bossDefensePercent: 210,
    bossSpeedPercent: 170,
    bossShieldPercent: 45,
    bossAttackCount: 2,
    bossForcedActionEvery: 4,
    bossUltimatePercent: 32,
    sequenceLength: 6,
    sequenceWindowMs: 5500,
    mashTarget: 24,
    mashWindowMs: 5000,
    rewardLocked: true,
    rewardCoin: 0,
    rewardShards: 0,
    testUsers: [],
    testUserIds: []
  };
}

export function cleanCoreRaidSettings(raw = {}) {
  const base = defaultCoreRaidSettings();
  const requestedMode = String(raw.mode || '').toUpperCase();
  const mode = ['OFF', 'TEST', 'ON'].includes(requestedMode) ? requestedMode : base.mode;
  return {
    mode,
    title: cleanText(raw.title || base.title, 60),
    subtitle: cleanText(raw.subtitle || base.subtitle, 80),
    description: cleanText(raw.description || base.description, 240),
    bossName: cleanText(raw.bossName || base.bossName, 60),
    bossImage: cleanText(raw.bossImage || base.bossImage, 420),
    lobbyMinutes: integer(raw.lobbyMinutes, base.lobbyMinutes, 1, 60),
    battleMinutes: integer(raw.battleMinutes, base.battleMinutes, 5, 120),
    minParticipants: integer(raw.minParticipants, base.minParticipants, 1, 30),
    maxParticipants: integer(raw.maxParticipants, base.maxParticipants, 1, 30),
    partyMaxHp: integer(raw.partyMaxHp, base.partyMaxHp, 100, 100000),
    mechanicFailureDamage: integer(raw.mechanicFailureDamage, base.mechanicFailureDamage, 1, 100000),
    coreRequired: integer(raw.coreRequired, base.coreRequired, 50, 100000),
    bossMaxHp: integer(raw.bossMaxHp, base.bossMaxHp, 1000000, 2000000000),
    damageScale: integer(raw.damageScale, base.damageScale, 1, 5000),
    coreCombatPowerPercent: integer(raw.coreCombatPowerPercent, base.coreCombatPowerPercent, 20, 300),
    bossCombatPowerPercent: integer(raw.bossCombatPowerPercent, base.bossCombatPowerPercent, 20, 300),
    bossHpPercent: integer(raw.bossHpPercent, base.bossHpPercent, 100, 1000),
    bossAttackPercent: integer(raw.bossAttackPercent, base.bossAttackPercent, 50, 1000),
    bossDefensePercent: integer(raw.bossDefensePercent, base.bossDefensePercent, 50, 1000),
    bossSpeedPercent: integer(raw.bossSpeedPercent, base.bossSpeedPercent, 50, 1000),
    bossShieldPercent: integer(raw.bossShieldPercent, base.bossShieldPercent, 0, 500),
    bossAttackCount: integer(raw.bossAttackCount, base.bossAttackCount, 1, 10),
    bossForcedActionEvery: integer(raw.bossForcedActionEvery, base.bossForcedActionEvery, 1, 20),
    bossUltimatePercent: integer(raw.bossUltimatePercent, base.bossUltimatePercent, 0, 500),
    sequenceLength: integer(raw.sequenceLength, base.sequenceLength, 4, 12),
    sequenceWindowMs: integer(raw.sequenceWindowMs, base.sequenceWindowMs, 3000, 15000),
    mashTarget: integer(raw.mashTarget, base.mashTarget, 10, 80),
    mashWindowMs: integer(raw.mashWindowMs, base.mashWindowMs, 3000, 15000),
    rewardLocked: raw.rewardLocked !== false,
    rewardCoin: integer(raw.rewardCoin, base.rewardCoin, 0, 2000000000),
    rewardShards: integer(raw.rewardShards, base.rewardShards, 0, 1000000),
    testUsers: cleanStringList(raw.testUsers),
    testUserIds: cleanStringList(raw.testUserIds, 80, 24).map(Number).filter(Number.isInteger).filter(id => id > 0)
  };
}

export function coreRaidFeatureAccess(user, settings = {}) {
  const cfg = cleanCoreRaidSettings(settings);
  const owner = isOwner(user);
  const nickname = cleanText(user?.nickname, 60).toLocaleLowerCase('ko-KR');
  const userId = Number(user?.id || 0);
  const testerByName = cfg.testUsers.some(name => name.toLocaleLowerCase('ko-KR') === nickname);
  const testerById = cfg.testUserIds.includes(userId);
  const tester = owner || testerByName || testerById;
  const accessible = cfg.mode === 'ON' || (cfg.mode === 'TEST' && tester);
  return {
    visible: cfg.mode !== 'OFF' && accessible,
    accessible,
    owner,
    tester,
    mode: cfg.mode,
    rewardLocked: cfg.rewardLocked
  };
}

function roleOf(card = {}) {
  const role = String(
    card.power_type || card.powerType || card.type || card.uniqueAbility?.dominantType || 'NONE'
  ).trim().toUpperCase();
  return WEAKNESSES.includes(role) ? role : 'NONE';
}

export function coreRaidRoleCounts(cards = []) {
  return (Array.isArray(cards) ? cards : []).reduce(
    (out, card) => {
      const role = roleOf(card);
      out[role] = (out[role] || 0) + 1;
      return out;
    },
    { ATTACK: 0, DEFENSE: 0, SPEED: 0, HP: 0, NONE: 0 }
  );
}

export function createCoreRaidChallenge({
  roomId = '',
  instanceId = '',
  attemptId = '',
  userId = 0,
  stage = 'CORE',
  operation = '',
  cards = [],
  settings = {}
} = {}) {
  const cfg = cleanCoreRaidSettings(settings);
  const resolvedRoomId = roomId || instanceId;
  const seed = stableHash(
    [
      resolvedRoomId,
      attemptId,
      userId,
      stage,
      operation,
      (Array.isArray(cards) ? cards : []).map(card => card.id || card.cardId).join(','),
      'CORE-QTE-V2024'
    ].join(':')
  );
  const weaknessCycle = Array.from(
    { length: 5 },
    (_, index) => WEAKNESSES[stableHash(seed + ':W:' + index) % WEAKNESSES.length]
  );
  const sequence = Array.from(
    { length: cfg.sequenceLength },
    (_, index) => DIRECTIONS[stableHash(seed + ':S:' + index) % DIRECTIONS.length]
  );
  const mashTarget = cfg.mashTarget + (seed % 3) - 1;
  return {
    challengeId: 'QTE-' + seed.toString(16).padStart(8, '0'),
    seed,
    weaknessCycle,
    sequence,
    sequenceWindowMs: cfg.sequenceWindowMs,
    mashTarget,
    mashWindowMs: cfg.mashWindowMs,
    issuedFor: {
      roomId: String(resolvedRoomId),
      instanceId: String(resolvedRoomId),
      attemptId: String(attemptId),
      userId: Number(userId),
      stage: String(stage),
      operation: String(operation)
    }
  };
}

function normalizeDirection(value) {
  const key = String(value || '').trim().toUpperCase();
  return {
    ARROWUP: 'UP', W: 'UP', UP: 'UP',
    ARROWRIGHT: 'RIGHT', D: 'RIGHT', RIGHT: 'RIGHT',
    ARROWDOWN: 'DOWN', S: 'DOWN', DOWN: 'DOWN',
    ARROWLEFT: 'LEFT', A: 'LEFT', LEFT: 'LEFT'
  }[key] || '';
}

function normalizeTrace(rows = [], windowMs = 10000, max = 160) {
  let previous = -1;
  return (Array.isArray(rows) ? rows : []).slice(0, max).map((row, index) => {
    const at = clamp(typeof row === 'number' ? row : row?.at, 0, windowMs + 750);
    const key = normalizeDirection(row?.key || row?.direction || '');
    const monotonic = at >= previous;
    previous = Math.max(previous, at);
    return { at, key, index, monotonic };
  });
}

export function evaluateCoreRaidQte(challenge = {}, rawResults = {}) {
  const sequenceWindowMs = integer(challenge.sequenceWindowMs, 5500, 1000, 20000);
  const mashWindowMs = integer(challenge.mashWindowMs, 5000, 1000, 20000);
  const expected = (Array.isArray(challenge.sequence) ? challenge.sequence : [])
    .map(normalizeDirection)
    .filter(Boolean);
  const sequenceTrace = normalizeTrace(
    rawResults.sequence?.inputs || rawResults.sequence?.trace || [],
    sequenceWindowMs,
    64
  );
  let sequenceIndex = 0;
  let mistakes = 0;
  let completedAt = null;
  for (const input of sequenceTrace) {
    if (!input.monotonic || !input.key) {
      mistakes++;
      continue;
    }
    if (input.key === expected[sequenceIndex]) {
      sequenceIndex++;
      if (sequenceIndex >= expected.length) {
        completedAt = input.at;
        break;
      }
    } else {
      mistakes++;
    }
  }
  const sequenceSuccess =
    expected.length > 0 && sequenceIndex === expected.length && Number(completedAt) <= sequenceWindowMs;
  const sequencePerfect =
    sequenceSuccess && mistakes === 0 && Number(completedAt) <= sequenceWindowMs * 0.72;
  const mashTrace = normalizeTrace(
    rawResults.mash?.presses || rawResults.mash?.trace || [],
    mashWindowMs,
    180
  ).filter(row => row.monotonic && row.at <= mashWindowMs);
  const mashTarget = integer(challenge.mashTarget, 24, 1, 100);
  let validPresses = 0;
  let lastAt = -1000;
  let mashCompletedAt = null;
  for (const press of mashTrace) {
    if (press.at - lastAt >= 28) {
      validPresses++;
      lastAt = press.at;
      if (validPresses === mashTarget) mashCompletedAt = press.at;
    }
  }
  const mashSuccess = validPresses >= mashTarget;
  const mashPerfect = mashSuccess && Number(mashCompletedAt) <= mashWindowMs * 0.72;
  return {
    sequence: {
      success: sequenceSuccess,
      perfect: sequencePerfect,
      progress: sequenceIndex,
      total: expected.length,
      mistakes,
      completedAt: completedAt === null ? null : Math.round(completedAt)
    },
    mash: { success: mashSuccess, perfect: mashPerfect, count: validPresses, target: mashTarget },
    allSuccess: sequenceSuccess && mashSuccess,
    perfectCount: Number(sequencePerfect) + Number(mashPerfect),
    suppressionScore:
      (sequenceSuccess ? 50 : 0) +
      (mashSuccess ? 50 : 0) +
      (sequencePerfect ? 10 : 0) +
      (mashPerfect ? 10 : 0)
  };
}

function operationScore(operation, roles) {
  if (operation === 'BREAK') {
    return Math.min(100, roles.ATTACK * 22 + roles.SPEED * 18 + (roles.DEFENSE + roles.HP + roles.NONE) * 4);
  }
  if (operation === 'BLOCK') {
    return Math.min(100, roles.DEFENSE * 30 + roles.HP * 10 + (roles.ATTACK + roles.SPEED + roles.NONE) * 4);
  }
  if (operation === 'STABILIZE') {
    return Math.min(100, roles.HP * 30 + roles.DEFENSE * 10 + (roles.ATTACK + roles.SPEED + roles.NONE) * 4);
  }
  return 0;
}

export function coreRaidContribution({
  cards = [],
  totalPower = 0,
  operation = '',
  challenge = {},
  qte = {},
  settings = {}
} = {}) {
  const cfg = cleanCoreRaidSettings(settings);
  const roles = coreRaidRoleCounts(cards);
  const cycle = Array.isArray(challenge.weaknessCycle) ? challenge.weaknessCycle : [];
  const cardRows = Array.isArray(cards) ? cards : [];
  const analysisScore = cardRows
    .slice(0, 5)
    .reduce((score, card, index) => score + (roleOf(card) === cycle[index] ? 20 : 6), 0);
  const op = normalizeOperation(operation);
  const coreScore = operationScore(op, roles);
  const mechanicScore = analysisScore + coreScore + Number(qte.suppressionScore || 0);
  const qteFactor = qte.allSuccess ? 1.18 : 0.82;
  const analysisFactor = 0.8 + analysisScore / 500;
  const totalDamage = Math.max(
    1,
    Math.min(2000000000, Math.round(Number(totalPower || 0) * cfg.damageScale * qteFactor * analysisFactor))
  );
  const coreProgress = qte.allSuccess
    ? Math.max(1, Math.round(coreScore * (1 + Number(qte.perfectCount || 0) * 0.1)))
    : 0;
  return {
    operation: op,
    roles,
    analysisScore,
    coreScore,
    coreProgress,
    suppressionScore: Number(qte.suppressionScore || 0),
    mechanicScore,
    totalDamage
  };
}

export function coreRaidAttemptOutcome({
  serverWinner = '',
  qte = {},
  contribution = {},
  stage = 'CORE',
  settings = {}
} = {}) {
  const cfg = cleanCoreRaidSettings(settings);
  const engineSuccess = String(serverWinner || '').toUpperCase() === 'A';
  const mechanicSuccess = qte.allSuccess === true;
  const success = engineSuccess && mechanicSuccess;
  return {
    success,
    engineSuccess,
    mechanicSuccess,
    stage: String(stage || 'CORE').toUpperCase(),
    partyHpDamage: success ? 0 : cfg.mechanicFailureDamage,
    coreProgress: success && String(stage).toUpperCase() === 'CORE'
      ? Math.max(0, Number(contribution.coreProgress || 0))
      : 0,
    bossDamage: success && String(stage).toUpperCase() === 'BOSS'
      ? Math.max(0, Number(contribution.totalDamage || 0))
      : 0
  };
}

export function resolveCoreRaidRoomState(room = {}, settings = {}, at = Date.now()) {
  const cfg = cleanCoreRaidSettings(settings);
  const priorStatus = String(room.status || 'LOBBY').toUpperCase();
  const coreScores = {
    BREAK: Math.max(0, Number(room.break_score ?? room.coreScores?.BREAK ?? 0)),
    BLOCK: Math.max(0, Number(room.block_score ?? room.coreScores?.BLOCK ?? 0)),
    STABILIZE: Math.max(0, Number(room.stabilize_score ?? room.coreScores?.STABILIZE ?? 0))
  };
  const partyMaxHp = Math.max(1, Number(room.party_max_hp ?? room.partyMaxHp ?? cfg.partyMaxHp));
  const partyHp = clamp(room.party_hp ?? room.partyHp ?? partyMaxHp, 0, partyMaxHp);
  const bossMaxHp = Math.max(1, Number(room.boss_max_hp ?? room.bossMaxHp ?? cfg.bossMaxHp));
  const bossHp = clamp(room.boss_hp ?? room.bossHp ?? bossMaxHp, 0, bossMaxHp);
  const coreTarget = Math.max(1, Number(room.core_target ?? room.coreTarget ?? cfg.coreRequired));
  const lobbyDeadline = Date.parse(room.lobby_ends_at || room.lobbyEndsAt || 0);
  const battleDeadline = Date.parse(room.ends_at || room.endsAt || 0);
  const coresReady = Object.values(coreScores).every(score => score >= coreTarget);
  let status = priorStatus;
  let failureReason = cleanText(room.failure_reason || room.failureReason || '', 80);
  if (!TERMINAL_ROOM_STATUSES.has(status)) {
    if (status === 'LOBBY' && Number.isFinite(lobbyDeadline) && lobbyDeadline <= Number(at)) {
      status = 'FAILED';
      failureReason = 'LOBBY_EXPIRED';
    } else if (
      (status === 'CORE' || status === 'BOSS') &&
      Number.isFinite(battleDeadline) &&
      battleDeadline <= Number(at)
    ) {
      status = 'FAILED';
      failureReason = 'TIME_LIMIT';
    } else if ((status === 'CORE' || status === 'BOSS') && partyHp <= 0) {
      status = 'FAILED';
      failureReason = 'PARTY_WIPE';
    } else if (status === 'CORE' && coresReady) {
      status = 'BOSS';
    } else if (status === 'BOSS' && bossHp <= 0) {
      status = 'CLEAR';
      failureReason = '';
    }
  }
  const phase = status === 'LOBBY' ? 0 : status === 'CORE' ? 1 : status === 'BOSS' ? 2 : 3;
  const phaseLabel =
    status === 'LOBBY' ? '공대 집결' :
    status === 'CORE' ? '삼중 코어 공략' :
    status === 'BOSS' ? '최종 보스 · 멸절 프로토콜' :
    status === 'CLEAR' ? '작전 완료' : '작전 실패';
  return {
    status,
    phase,
    phaseLabel,
    coreScores,
    coreTarget,
    coresReady,
    partyHp,
    partyMaxHp,
    bossHp,
    bossMaxHp,
    failureReason,
    changed: status !== priorStatus
  };
}

// 구 버전 오프라인 비교 하네스가 참조하므로 집계 함수는 호환 유지한다.
export function resolveCoreRaidAggregate(rows = [], settings = {}) {
  const cfg = cleanCoreRaidSettings(settings);
  const resolved = (Array.isArray(rows) ? rows : []).filter(
    row => String(row.status || '').toUpperCase() === 'RESOLVED'
  );
  const sum = key => resolved.reduce((total, row) => total + Math.max(0, Number(row[key] || 0)), 0);
  const analysisScore = sum('analysis_score');
  const suppressionScore = sum('suppression_score');
  const rawDamage = sum('total_damage');
  const coreScores = {
    BREAK: resolved.filter(row => String(row.operation) === 'BREAK').reduce((n, row) => n + Number(row.core_score || 0), 0),
    BLOCK: resolved.filter(row => String(row.operation) === 'BLOCK').reduce((n, row) => n + Number(row.core_score || 0), 0),
    STABILIZE: resolved.filter(row => String(row.operation) === 'STABILIZE').reduce((n, row) => n + Number(row.core_score || 0), 0)
  };
  const coresReady = Object.values(coreScores).every(score => score >= cfg.coreRequired);
  const bossHp = coresReady ? Math.max(0, cfg.bossMaxHp - rawDamage) : cfg.bossMaxHp;
  return {
    phase: coresReady ? 2 : 1,
    phaseLabel: coresReady ? '최종 보스 · 멸절 프로토콜' : '삼중 코어 공략',
    analysisScore,
    analysisRequired: 0,
    coreScores,
    coreRequired: cfg.coreRequired,
    suppressionScore,
    suppressionRequired: 0,
    totalDamage: rawDamage,
    effectiveDamage: rawDamage,
    bossBuffs: coresReady ? [] : Object.values(CORE_BUFFS),
    bossDamageReductionPct: 0,
    bossHp,
    bossMaxHp: cfg.bossMaxHp,
    analysisReady: true,
    coresReady,
    suppressionReady: true,
    cleared: coresReady && bossHp <= 0,
    resolvedCount: resolved.length
  };
}

function normalizeBattleCard(card, index) {
  const id = String(card?.id || card?.cardId || 'CORE-CARD-' + (index + 1));
  const battleSprite = String(card?.battleSprite || card?.battle_sprite || '');
  // 하단 카드 도크는 카드 원본, Pixi 전투 캐릭터는 battleSprite를 각각 사용한다.
  const image = String(
    card?.sourceArt || card?.source_art || card?.originalCardArt || card?.image || card?.image_url || ''
  );
  return {
    ...card,
    id,
    cardId: id,
    name: card?.name || card?.title || 'CARD ' + (index + 1),
    title: card?.title || card?.name || 'CARD ' + (index + 1),
    image,
    image_url: image,
    ...(battleSprite ? { battleSprite, battle_sprite: battleSprite } : {}),
    grade: String(card?.grade || card?.rarity || 'SSR').toUpperCase(),
    powerType: roleOf(card),
    power_type: roleOf(card),
    hp: 100,
    maxHp: 100
  };
}

function participantDeckSnapshot(participant = {}) {
  const parsed = jsonSafe(
    participant.deck_snapshot,
    Array.isArray(participant.cards) ? participant.cards : []
  );
  const snapshot = Array.isArray(parsed) ? { cards: parsed } : parsed && typeof parsed === 'object' ? parsed : {};
  return {
    ...snapshot,
    cards: (Array.isArray(snapshot.cards) ? snapshot.cards : []).slice(0, 5).map(normalizeBattleCard)
  };
}

function coreBossEngineMonster(cfg, totalPower, stage, operation) {
  const finalBoss = String(stage).toUpperCase() === 'BOSS';
  const op = OPERATIONS[operation];
  return {
    id: finalBoss ? 'CORE_ARCHEON' : 'CORE_NODE_' + operation,
    name: finalBoss ? cfg.bossName : (op?.name || '미확인') + ' 코어',
    image: cfg.bossImage,
    image_url: cfg.bossImage,
    is_boss: 1,
    pve_difficulty: 'APOCALYPSE',
    battle_power: Math.max(
      1000,
      Math.round(
        Number(totalPower || 1) *
        (finalBoss ? cfg.bossCombatPowerPercent : cfg.coreCombatPowerPercent) /
        100
      )
    ),
    pve_hp_percent: finalBoss ? cfg.bossHpPercent : Math.max(180, Math.round(cfg.bossHpPercent * 0.72)),
    pve_attack_percent: finalBoss ? cfg.bossAttackPercent : Math.max(150, Math.round(cfg.bossAttackPercent * 0.78)),
    pve_defense_percent: finalBoss ? cfg.bossDefensePercent : Math.max(140, Math.round(cfg.bossDefensePercent * 0.78)),
    pve_speed_percent: finalBoss ? cfg.bossSpeedPercent : Math.max(130, Math.round(cfg.bossSpeedPercent * 0.82)),
    pve_shield_percent: finalBoss ? cfg.bossShieldPercent : Math.max(25, Math.round(cfg.bossShieldPercent * 0.7)),
    pve_attack_count: finalBoss ? cfg.bossAttackCount : Math.max(1, cfg.bossAttackCount - 1),
    pve_forced_action_every: finalBoss ? cfg.bossForcedActionEvery : Math.max(5, cfg.bossForcedActionEvery + 2)
  };
}

function mechanicTimeline({
  engineTimeline = [],
  cards = [],
  challenge = {},
  operation = '',
  stage = 'CORE',
  bossId = '',
  failureDamage = 0
}) {
  const combat = (Array.isArray(engineTimeline) ? engineTimeline : []).filter(
    event => String(event?.type || '').toUpperCase() !== 'RESULT'
  );
  const split = Math.ceil(combat.length * 0.58);
  const finalBoss = String(stage).toUpperCase() === 'BOSS';
  const weaknessEvents = cards.map((card, index) => {
    const weakness = challenge.weaknessCycle?.[index] || WEAKNESSES[index % 4];
    const match = roleOf(card) === weakness;
    return {
      type: 'RAID_WEAKNESS_REVEAL',
      weakness,
      matched: match,
      actorId: card.id || card.cardId,
      label: '약점 ' + weakness + ' · ' + (match ? '분석 성공' : '부분 분석')
    };
  });
  const timeline = [
    {
      type: 'RAID_PHASE_CHANGE',
      phase: finalBoss ? 3 : 2,
      label: finalBoss ? '최종 보스 · 멸절 프로토콜' : (OPERATIONS[operation]?.name || '미확인') + ' 코어 공략'
    },
    ...weaknessEvents,
    ...combat.slice(0, split),
    {
      type: 'RAID_QTE_SEQUENCE',
      qteId: 'SEQUENCE',
      title: finalBoss ? '멸절 좌표 해독' : '코어 좌표 추적',
      sequence: challenge.sequence,
      windowMs: challenge.sequenceWindowMs,
      label: '화면을 지정 방향으로 밀거나 방향키를 순서대로 입력하십시오.'
    },
    ...combat.slice(split),
    {
      type: 'RAID_QTE_MASH',
      qteId: 'MASH',
      title: finalBoss ? '멸절 구속 파쇄' : '코어 구속 파쇄',
      target: challenge.mashTarget,
      windowMs: challenge.mashWindowMs,
      label: '연타하여 즉사 구속을 파괴하십시오.'
    },
    {
      type: finalBoss ? 'RAID_STAGGER' : 'RAID_CORE_BREAK',
      operation,
      qteCondition: 'ALL_SUCCESS',
      label: finalBoss ? '멸절 프로토콜 차단 · 아르케온 그로기' : (OPERATIONS[operation]?.name || '코어') + ' 제압 신호 전송'
    },
    {
      type: 'BOSS_ULTIMATE',
      qteCondition: 'ANY_FAILURE',
      actorId: bossId,
      label: '멸절 프로토콜',
      hits: cards.map(card => ({
        targetId: card.id || card.cardId,
        damage: 99999999,
        targetHpAfter: 0,
        critical: true
      }))
    },
    {
      type: 'RAID_PARTY_DAMAGE',
      qteCondition: 'ANY_FAILURE',
      damage: failureDamage,
      label: '기믹 실패 · 공대 HP ' + failureDamage + ' 감소'
    },
    { type: 'RESULT', qteCondition: 'ALL_SUCCESS', winner: 'A', reason: 'CORE_PROTOCOL_SUCCESS', label: '공략 성공' },
    { type: 'RESULT', qteCondition: 'ANY_FAILURE', winner: 'B', reason: 'CORE_PROTOCOL_FAILURE', label: '공략 실패' }
  ];
  timeline.forEach((event, index) => {
    event.seq = index + 1;
  });
  return timeline;
}

export function buildCoreRaidBattlePayload({
  participant = {},
  settings = {},
  aggregate = {},
  createBattle = null,
  accountNickname = ''
} = {}) {
  const cfg = cleanCoreRaidSettings(settings);
  const snapshot = participantDeckSnapshot(participant);
  const cards = snapshot.cards;
  const challenge = jsonSafe(participant.challenge_json, participant.challenge || {});
  const stage = String(participant.stage || aggregate.status || 'CORE').toUpperCase() === 'BOSS' ? 'BOSS' : 'CORE';
  const operation = stage === 'BOSS' ? 'FINAL' : normalizeOperation(participant.operation);
  const equipment = snapshot.characterBonus && typeof snapshot.characterBonus === 'object'
    ? snapshot.characterBonus
    : {};
  const battleSuitPve = Math.max(0, Number(equipment.battleSuitPve || 0));
  const battleSuit = battleSuitPve > 0 && equipment.equippedBattleSuit
    ? {
        ...equipment.equippedBattleSuit,
        pvePower: battleSuitPve,
        weapon: equipment.equippedWeapon || null,
        accountNickname: cleanText(accountNickname, 60)
      }
    : null;
  const monster = coreBossEngineMonster(cfg, participant.total_power, stage, operation);
  const seed = stableHash(
    (participant.room_id || participant.instance_id || '') +
    ':' + (participant.attempt_id || participant.user_id || '') +
    ':CORE-BATTLE-V2024'
  );
  const engine = typeof createBattle === 'function'
    ? createBattle({
        cards,
        characterBonus: Math.max(0, Number(equipment.pve || 0) - battleSuitPve),
        battleSuit,
        monster,
        seed,
        bossUltimatePercent: cfg.bossUltimatePercent,
        bossUltimateCapPercent: 500
      })
    : null;
  const fallbackBoss = {
    id: 'B:0:MONSTER:' + monster.id,
    cardId: 'MONSTER:' + monster.id,
    name: monster.name,
    title: monster.name,
    image: cfg.bossImage,
    image_url: cfg.bossImage,
    grade: 'BOSS',
    isBoss: true,
    hp: 100,
    maxHp: 100
  };
  const engineBoss = engine?.teams?.B?.cards?.[0] || fallbackBoss;
  const boss = {
    ...engineBoss,
    monsterId: monster.id,
    name: monster.name,
    title: monster.name,
    image: cfg.bossImage,
    image_url: cfg.bossImage,
    grade: 'BOSS',
    isBoss: true,
    mode: 'RAID',
    contentType: 'CORE_PROTOCOL',
    projectVMonsterArt: {
      scope: 'BATTLE_ENGINE_ONLY',
      kind: stage === 'BOSS' ? 'CORE_PROTOCOL_BOSS_SD' : 'CORE_PROTOCOL_NODE_SD',
      primaryUrl: cfg.bossImage,
      pngFallbackUrl: cfg.bossImage,
      footAnchor: { x: 0.5, y: 0.94 },
      objectFit: 'contain',
      objectPosition: '50% 100%',
      scaleMultiplier: stage === 'BOSS' ? 1.15 : 0.98,
      approved: true,
      technicalPass: true
    }
  };
  const serverWinner = String(engine?.result?.winner || 'B').toUpperCase();
  const battleV2 = engine
    ? {
        ...engine,
        teams: { ...engine.teams, B: { ...engine.teams?.B, cards: [boss] } },
        result: {
          ...engine.result,
          winner: 'PENDING',
          reason: 'CORE_PROTOCOL_PENDING',
          timeline: mechanicTimeline({
            engineTimeline: engine.result?.timeline,
            cards: engine.teams?.A?.cards || cards,
            challenge,
            operation,
            stage,
            bossId: boss.id,
            failureDamage: cfg.mechanicFailureDamage
          })
        }
      }
    : {
        teams: { A: { cards }, B: { cards: [boss] } },
        result: {
          winner: 'PENDING',
          reason: 'CORE_PROTOCOL_PENDING',
          timeline: mechanicTimeline({
            cards,
            challenge,
            operation,
            stage,
            bossId: boss.id,
            failureDamage: cfg.mechanicFailureDamage
          })
        }
      };
  return {
    ok: true,
    mode: 'RAID',
    battlefieldMode: 'RAID',
    contentType: 'CORE_PROTOCOL',
    presentation: {
      owner: 'PROJECT_V_V3_LIVE',
      characterRenderer: 'PROJECT_V_PIXI_V3',
      rosterRenderer: 'LIVE_V3_ROSTER',
      cardFrameRenderer: 'LIVE_CARD_FRAME',
      preserveCardSourceArt: true
    },
    monster: boss,
    cards,
    playerPower: Number(snapshot.power || participant.total_power || 0),
    cardPower: Number(snapshot.cardPower || 0),
    characterBonus: equipment,
    equippedBattleSuit: equipment.equippedBattleSuit || null,
    equippedWeapon: equipment.equippedWeapon || null,
    coreRaid: {
      stage,
      operation,
      challengeId: challenge.challengeId,
      serverWinner,
      partyFailureDamage: cfg.mechanicFailureDamage
    },
    battleV2
  };
}

function schemaStatements(env) {
  const postgres = env.DB?.dialect === 'postgres';
  const userType = postgres ? 'BIGINT' : 'INTEGER';
  const nowDefault = postgres
    ? "to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')"
    : 'CURRENT_TIMESTAMP';
  return [
    "CREATE TABLE IF NOT EXISTS " + ROOM_TABLE + "(" +
      "room_id TEXT PRIMARY KEY,room_code TEXT NOT NULL UNIQUE,host_user_id " + userType + " NOT NULL," +
      "status TEXT NOT NULL DEFAULT 'LOBBY',party_hp INTEGER NOT NULL,party_max_hp INTEGER NOT NULL," +
      "break_score INTEGER NOT NULL DEFAULT 0,block_score INTEGER NOT NULL DEFAULT 0,stabilize_score INTEGER NOT NULL DEFAULT 0," +
      "core_target INTEGER NOT NULL,boss_hp BIGINT NOT NULL,boss_max_hp BIGINT NOT NULL,participant_count INTEGER NOT NULL DEFAULT 1," +
      "lobby_ends_at TEXT NOT NULL,starts_at TEXT,ends_at TEXT,completed_at TEXT,failure_reason TEXT NOT NULL DEFAULT ''," +
      "created_at TEXT NOT NULL DEFAULT " + nowDefault + ",updated_at TEXT NOT NULL DEFAULT " + nowDefault + ")",
    "CREATE INDEX IF NOT EXISTS idx_raid_core_rooms_v2024_status ON " + ROOM_TABLE + "(status,lobby_ends_at,ends_at,created_at)",
    "CREATE TABLE IF NOT EXISTS " + MEMBER_TABLE + "(" +
      "room_id TEXT NOT NULL,user_id " + userType + " NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',last_operation TEXT NOT NULL DEFAULT ''," +
      "attempt_count INTEGER NOT NULL DEFAULT 0,success_count INTEGER NOT NULL DEFAULT 0,failure_count INTEGER NOT NULL DEFAULT 0," +
      "mechanic_score INTEGER NOT NULL DEFAULT 0,total_damage BIGINT NOT NULL DEFAULT 0,total_core_progress INTEGER NOT NULL DEFAULT 0," +
      "total_boss_damage BIGINT NOT NULL DEFAULT 0,last_result_json TEXT NOT NULL DEFAULT '{}'," +
      "joined_at TEXT NOT NULL DEFAULT " + nowDefault + ",updated_at TEXT NOT NULL DEFAULT " + nowDefault + "," +
      "PRIMARY KEY(room_id,user_id))",
    "CREATE INDEX IF NOT EXISTS idx_raid_core_members_v2024_rank ON " + MEMBER_TABLE + "(room_id,mechanic_score DESC,total_damage DESC)",
    "CREATE TABLE IF NOT EXISTS " + ACTIVE_MEMBER_TABLE + "(" +
      "user_id " + userType + " PRIMARY KEY,room_id TEXT NOT NULL,joined_at TEXT NOT NULL DEFAULT " + nowDefault + ")",
    "CREATE INDEX IF NOT EXISTS idx_raid_core_active_room_v2024 ON " + ACTIVE_MEMBER_TABLE + "(room_id,user_id)",
    "CREATE TABLE IF NOT EXISTS " + ATTEMPT_TABLE + "(" +
      "attempt_id TEXT PRIMARY KEY,room_id TEXT NOT NULL,user_id " + userType + " NOT NULL,stage TEXT NOT NULL,operation TEXT NOT NULL," +
      "status TEXT NOT NULL DEFAULT 'PENDING',deck_snapshot TEXT NOT NULL,role_counts_json TEXT NOT NULL,challenge_json TEXT NOT NULL," +
      "total_power BIGINT NOT NULL DEFAULT 0,server_winner TEXT NOT NULL DEFAULT 'B',qte_result_json TEXT NOT NULL DEFAULT '{}'," +
      "result_json TEXT NOT NULL DEFAULT '{}',resolve_request_id TEXT UNIQUE,created_at TEXT NOT NULL DEFAULT " + nowDefault + "," +
      "resolved_at TEXT,updated_at TEXT NOT NULL DEFAULT " + nowDefault + ")",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_raid_core_pending_attempt_v2024 ON " + ATTEMPT_TABLE + "(room_id,user_id) WHERE status='PENDING'",
    "CREATE INDEX IF NOT EXISTS idx_raid_core_attempt_room_v2024 ON " + ATTEMPT_TABLE + "(room_id,created_at)",
    "CREATE TABLE IF NOT EXISTS " + RECEIPT_TABLE + "(" +
      "request_id TEXT PRIMARY KEY,room_id TEXT NOT NULL,user_id " + userType + " NOT NULL,action_type TEXT NOT NULL," +
      "status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT " + nowDefault + "," +
      "updated_at TEXT NOT NULL DEFAULT " + nowDefault + ")",
    "CREATE TABLE IF NOT EXISTS " + REWARD_RECEIPT_TABLE + "(" +
      "room_id TEXT NOT NULL,user_id " + userType + " NOT NULL,request_id TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'PENDING'," +
      "reward_coin BIGINT NOT NULL DEFAULT 0,reward_shards BIGINT NOT NULL DEFAULT 0,response_json TEXT,error_message TEXT," +
      "created_at TEXT NOT NULL DEFAULT " + nowDefault + ",updated_at TEXT NOT NULL DEFAULT " + nowDefault + "," +
      "PRIMARY KEY(room_id,user_id))",
    "CREATE INDEX IF NOT EXISTS idx_raid_core_reward_request_v2024 ON " + REWARD_RECEIPT_TABLE + "(request_id,status)"
  ];
}

async function ensure(env) {
  const marker = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FOUNDATION_KEY).first();
  if (marker?.value === '1') return true;
  const statements = schemaStatements(env);
  if (env.DB?.dialect === 'postgres' && typeof env.DB.execSchema === 'function') {
    await env.DB.execSchema(statements);
  } else {
    await env.DB.batch(statements.map(sql => env.DB.prepare(sql)));
  }
  const oldRow = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(LEGACY_SETTINGS_KEY).first();
  const old = cleanCoreRaidSettings(jsonSafe(oldRow?.value, {}));
  const base = defaultCoreRaidSettings();
  const seeded = cleanCoreRaidSettings({
    ...base,
    title: old.title,
    subtitle: old.subtitle,
    bossName: old.bossName,
    bossImage: old.bossImage,
    rewardCoin: old.rewardCoin,
    rewardShards: old.rewardShards,
    testUsers: old.testUsers,
    testUserIds: old.testUserIds,
    mode: 'TEST',
    rewardLocked: true
  });
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(key) DO NOTHING'
    ).bind(SETTINGS_KEY, JSON.stringify(seeded)),
    env.DB.prepare(
      'INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) ' +
      "VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle," +
      "description=excluded.description,category=excluded.category,rarity=excluded.rarity,image_url=excluded.image_url," +
      'sort_order=excluded.sort_order,is_active=1,updated_at=CURRENT_TIMESTAMP'
    ).bind(
      CORE_RAID_ENTRY_TICKET,
      '붕괴 코어 입장권',
      'CORE PROTOCOL ENTRY',
      '붕괴 코어 공대를 생성할 때 1장이 소모됩니다. 참가자는 입장권을 소모하지 않습니다.',
      'ENTRY_TICKET',
      'ZENITH',
      'assets/ui/pve-command-v2/world-raid-breach-v1.webp',
      126
    ),
    env.DB.prepare(
      'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP'
    ).bind(FOUNDATION_KEY, '1')
  ]);
  return true;
}

async function readSettings(env) {
  const row = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SETTINGS_KEY).first();
  return cleanCoreRaidSettings(jsonSafe(row?.value, {}));
}

function publicSettings(cfg) {
  const value = cleanCoreRaidSettings(cfg);
  delete value.testUsers;
  delete value.testUserIds;
  return value;
}

async function releaseTerminalMemberships(env, roomId = '') {
  if (roomId) {
    await env.DB.prepare(
      'DELETE FROM ' + ACTIVE_MEMBER_TABLE + ' WHERE room_id=? AND EXISTS(' +
      'SELECT 1 FROM ' + ROOM_TABLE + " r WHERE r.room_id=? AND r.status IN ('CLEAR','FAILED'))"
    ).bind(roomId, roomId).run();
    return;
  }
  await env.DB.prepare(
    'DELETE FROM ' + ACTIVE_MEMBER_TABLE + ' WHERE EXISTS(' +
    'SELECT 1 FROM ' + ROOM_TABLE + " r WHERE r.room_id=" + ACTIVE_MEMBER_TABLE + ".room_id AND r.status IN ('CLEAR','FAILED'))"
  ).run();
}

async function refreshRoom(env, row, cfg) {
  if (!row) return null;
  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) count FROM ' + MEMBER_TABLE + ' WHERE room_id=?'
  ).bind(row.room_id).first();
  const participantCount = Number(countRow?.count || 0);
  const state = resolveCoreRaidRoomState(row, cfg);
  const countChanged = participantCount !== Number(row.participant_count || 0);
  if (state.changed || countChanged) {
    const terminal = TERMINAL_ROOM_STATUSES.has(state.status);
    const completedAt = terminal ? (row.completed_at || nowIso()) : row.completed_at || null;
    await env.DB.prepare(
      'UPDATE ' + ROOM_TABLE + ' SET status=?,participant_count=?,completed_at=?,failure_reason=?,updated_at=CURRENT_TIMESTAMP WHERE room_id=?'
    ).bind(state.status, participantCount, completedAt, state.failureReason, row.room_id).run();
    row = {
      ...row,
      status: state.status,
      participant_count: participantCount,
      completed_at: completedAt,
      failure_reason: state.failureReason
    };
  }
  if (TERMINAL_ROOM_STATUSES.has(state.status)) await releaseTerminalMemberships(env, row.room_id);
  return { ...row, aggregate: { ...state, participantCount } };
}

async function roomById(env, roomId, cfg) {
  const row = await env.DB.prepare(
    'SELECT * FROM ' + ROOM_TABLE + ' WHERE room_id=?'
  ).bind(roomId).first();
  return refreshRoom(env, row, cfg);
}

async function activeRoomForUser(env, userId, cfg) {
  const row = await env.DB.prepare(
    'SELECT r.* FROM ' + ACTIVE_MEMBER_TABLE + ' a JOIN ' + ROOM_TABLE +
    ' r ON r.room_id=a.room_id WHERE a.user_id=?'
  ).bind(userId).first();
  const fresh = await refreshRoom(env, row, cfg);
  if (fresh && !TERMINAL_ROOM_STATUSES.has(fresh.status)) return fresh;
  if (fresh) await releaseTerminalMemberships(env, fresh.room_id);
  return null;
}

async function latestRoomForUser(env, userId, cfg) {
  const row = await env.DB.prepare(
    'SELECT r.* FROM ' + MEMBER_TABLE + ' m JOIN ' + ROOM_TABLE +
    ' r ON r.room_id=m.room_id WHERE m.user_id=? ORDER BY r.created_at DESC LIMIT 1'
  ).bind(userId).first();
  return refreshRoom(env, row, cfg);
}

async function availableRooms(env, cfg) {
  const rows = (await env.DB.prepare(
    'SELECT r.*,(SELECT COUNT(*) FROM ' + MEMBER_TABLE + ' m WHERE m.room_id=r.room_id) live_count FROM ' +
    ROOM_TABLE + " r WHERE r.status='LOBBY' ORDER BY r.created_at ASC LIMIT 20"
  ).all()).results || [];
  const output = [];
  for (const row of rows) {
    const participantCount = Number(row.live_count || 0);
    const state = resolveCoreRaidRoomState(row, cfg);
    if (state.changed || participantCount !== Number(row.participant_count || 0)) {
      await env.DB.prepare(
        'UPDATE ' + ROOM_TABLE +
        ' SET status=?,participant_count=?,completed_at=?,failure_reason=?,updated_at=CURRENT_TIMESTAMP WHERE room_id=?'
      ).bind(
        state.status,
        participantCount,
        TERMINAL_ROOM_STATUSES.has(state.status) ? (row.completed_at || nowIso()) : (row.completed_at || null),
        state.failureReason,
        row.room_id
      ).run();
    }
    if (TERMINAL_ROOM_STATUSES.has(state.status)) await releaseTerminalMemberships(env, row.room_id);
    if (state.status === 'LOBBY' && participantCount < cfg.maxParticipants) {
      output.push({
        id: row.room_id,
        code: row.room_code,
        hostUserId: Number(row.host_user_id),
        participantCount,
        maxParticipants: cfg.maxParticipants,
        lobbyEndsAt: row.lobby_ends_at
      });
    }
  }
  return output;
}

function publicMember(row, userId) {
  if (!row) return null;
  return {
    userId: Number(row.user_id),
    nickname: row.nickname || '',
    status: String(row.status || 'ACTIVE'),
    lastOperation: String(row.last_operation || ''),
    attemptCount: Number(row.attempt_count || 0),
    successCount: Number(row.success_count || 0),
    failureCount: Number(row.failure_count || 0),
    mechanicScore: Number(row.mechanic_score || 0),
    totalDamage: Number(row.total_damage || 0),
    totalCoreProgress: Number(row.total_core_progress || 0),
    totalBossDamage: Number(row.total_boss_damage || 0),
    rewardStatus: String(row.reward_status || ''),
    isMe: Number(row.user_id) === Number(userId)
  };
}

function publicRoom(room, cfg) {
  if (!room) return null;
  const state = room.aggregate || resolveCoreRaidRoomState(room, cfg);
  return {
    id: room.room_id,
    code: room.room_code,
    hostUserId: Number(room.host_user_id),
    isTerminal: TERMINAL_ROOM_STATUSES.has(state.status),
    status: state.status,
    phase: state.phase,
    phaseLabel: state.phaseLabel,
    partyHp: state.partyHp,
    partyMaxHp: state.partyMaxHp,
    coreScores: state.coreScores,
    coreTarget: state.coreTarget,
    coresReady: state.coresReady,
    bossName: cfg.bossName,
    bossImage: cfg.bossImage,
    bossHp: state.bossHp,
    bossMaxHp: state.bossMaxHp,
    participantCount: Number(room.participant_count || state.participantCount || 0),
    minParticipants: cfg.minParticipants,
    maxParticipants: cfg.maxParticipants,
    lobbyEndsAt: room.lobby_ends_at,
    startsAt: room.starts_at,
    endsAt: room.ends_at,
    completedAt: room.completed_at,
    failureReason: state.failureReason,
    rewardLocked: cfg.rewardLocked,
    reward: { coin: cfg.rewardCoin, shards: cfg.rewardShards }
  };
}

async function ticketBalance(env, userId) {
  const row = await env.DB.prepare(
    'SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?'
  ).bind(userId, CORE_RAID_ENTRY_TICKET).first();
  return Math.max(0, Number(row?.quantity || 0));
}

async function statusPayload(env, user, cfg, requestedId = '', browseOnly = false) {
  await releaseTerminalMemberships(env);
  let room = null;
  if (requestedId) {
    const member = await env.DB.prepare(
      'SELECT 1 joined FROM ' + MEMBER_TABLE + ' WHERE room_id=? AND user_id=?'
    ).bind(requestedId, user.id).first();
    if (member) room = await roomById(env, requestedId, cfg);
  } else if (!browseOnly) {
    room = await activeRoomForUser(env, user.id, cfg);
    if (!room) room = await latestRoomForUser(env, user.id, cfg);
  }

  let members = [];
  let me = null;
  let pendingAttempt = null;
  if (room) {
    const rows = (await env.DB.prepare(
      'SELECT m.*,u.nickname,COALESCE(r.status,\'\') reward_status FROM ' + MEMBER_TABLE +
      ' m JOIN users u ON u.id=m.user_id LEFT JOIN ' + REWARD_RECEIPT_TABLE +
      ' r ON r.room_id=m.room_id AND r.user_id=m.user_id WHERE m.room_id=? ' +
      'ORDER BY m.mechanic_score DESC,m.total_damage DESC,m.joined_at ASC'
    ).bind(room.room_id).all()).results || [];
    members = rows.map(row => publicMember(row, user.id));
    me = members.find(row => row.isMe) || null;
    const pending = await env.DB.prepare(
      "SELECT attempt_id,stage,operation,created_at FROM " + ATTEMPT_TABLE +
      " WHERE room_id=? AND user_id=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1"
    ).bind(room.room_id, user.id).first();
    if (pending) {
      pendingAttempt = {
        id: pending.attempt_id,
        stage: pending.stage,
        operation: pending.operation,
        createdAt: pending.created_at
      };
    }
  }
  const quantity = await ticketBalance(env, user.id);
  return {
    ok: true,
    settings: publicSettings(cfg),
    feature: coreRaidFeatureAccess(user, cfg),
    current: publicRoom(room, cfg),
    me,
    participants: members,
    pendingAttempt,
    rooms: room ? [] : await availableRooms(env, cfg),
    entry: {
      ticketCode: CORE_RAID_ENTRY_TICKET,
      ticketName: '붕괴 코어 입장권',
      quantity,
      required: 1
    },
    operations: Object.values(OPERATIONS),
    serverNow: nowIso()
  };
}

async function reserveReceipt(env, { requestId, roomId, userId, action }) {
  let prior = await env.DB.prepare(
    'SELECT * FROM ' + RECEIPT_TABLE + ' WHERE request_id=?'
  ).bind(requestId).first();
  if (prior && Number(prior.user_id) !== Number(userId)) {
    return { error: '이미 사용된 요청 ID입니다.', status: 409 };
  }
  if (prior?.status === 'COMPLETED' && prior.response_json) {
    return { replay: jsonSafe(prior.response_json, { ok: true, replayed: true }) };
  }
  if (prior?.status === 'PENDING') {
    const age = Math.max(0, Date.now() - Date.parse(prior.updated_at || prior.created_at || 0));
    if (age < 15000) return { error: '같은 요청을 처리 중입니다.', status: 409 };
    await env.DB.prepare(
      'UPDATE ' + RECEIPT_TABLE +
      " SET status='FAILED',error_message='STALE_PENDING_RECOVERED',updated_at=CURRENT_TIMESTAMP WHERE request_id=?"
    ).bind(requestId).run();
    prior = { ...prior, status: 'FAILED' };
  } else if (prior && !['FAILED', 'RETRYABLE'].includes(String(prior.status || '').toUpperCase())) {
    return { error: '같은 요청을 처리 중입니다.', status: 409 };
  }
  const reserved = prior
    ? await env.DB.prepare(
        'UPDATE ' + RECEIPT_TABLE +
        " SET room_id=?,action_type=?,status='PENDING',response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP " +
        "WHERE request_id=? AND user_id=? AND status IN ('FAILED','RETRYABLE')"
      ).bind(roomId, action, requestId, userId).run()
    : await env.DB.prepare(
        'INSERT INTO ' + RECEIPT_TABLE +
        "(request_id,room_id,user_id,action_type,status,created_at,updated_at) VALUES(?,?,?,?,'PENDING',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) " +
        'ON CONFLICT(request_id) DO NOTHING'
      ).bind(requestId, roomId, userId, action).run();
  if (Number(reserved?.meta?.changes || 0) !== 1) {
    const raced = await env.DB.prepare(
      'SELECT * FROM ' + RECEIPT_TABLE + ' WHERE request_id=?'
    ).bind(requestId).first();
    if (raced && Number(raced.user_id) !== Number(userId)) {
      return { error: '이미 사용된 요청 ID입니다.', status: 409 };
    }
    if (raced?.status === 'COMPLETED' && raced.response_json) {
      return { replay: jsonSafe(raced.response_json, { ok: true, replayed: true }) };
    }
    return { error: '같은 요청을 처리 중입니다.', status: 409 };
  }
  return { reserved: true };
}

async function completeReceipt(env, requestId, userId, response) {
  await env.DB.prepare(
    'UPDATE ' + RECEIPT_TABLE +
    " SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?"
  ).bind(JSON.stringify({ ...response, replayed: true, battleV2: undefined }), requestId, userId).run();
}

async function failReceipt(env, requestId, userId, error) {
  try {
    await env.DB.prepare(
      'UPDATE ' + RECEIPT_TABLE +
      " SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?"
    ).bind(cleanText(error?.message || error, 300), requestId, userId).run();
  } catch {}
}

async function openRoom(env, user, cfg, body) {
  const requestId = cleanText(body.requestId, 120);
  if (!requestId) return { error: '공대 생성 요청 ID가 필요합니다.', status: 400 };
  const active = await activeRoomForUser(env, user.id, cfg);
  if (active) return { response: await statusPayload(env, user, cfg, active.room_id) };
  const roomId = randomToken('CORE');
  const receipt = await reserveReceipt(env, {
    requestId,
    roomId,
    userId: user.id,
    action: 'OPEN'
  });
  if (receipt.replay) return { response: receipt.replay };
  if (receipt.error) return receipt;
  const roomCode = roomId.replace(/[^A-Z0-9]/g, '').slice(-6).padStart(6, '0');
  const lobbyEndsAt = plusMinutesIso(cfg.lobbyMinutes);
  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO ' + ACTIVE_MEMBER_TABLE + '(user_id,room_id) ' +
        'SELECT ?,? WHERE EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=1) ' +
        'ON CONFLICT(user_id) DO NOTHING'
      ).bind(user.id, roomId, user.id, CORE_RAID_ENTRY_TICKET),
      env.DB.prepare(
        'INSERT INTO ' + ROOM_TABLE +
        '(room_id,room_code,host_user_id,status,party_hp,party_max_hp,core_target,boss_hp,boss_max_hp,participant_count,lobby_ends_at) ' +
        "SELECT ?,?,?,'LOBBY',?,?,?,?,?,1,? FROM " + ACTIVE_MEMBER_TABLE + ' WHERE user_id=? AND room_id=? ' +
        'ON CONFLICT(room_id) DO NOTHING'
      ).bind(
        roomId,
        roomCode,
        user.id,
        cfg.partyMaxHp,
        cfg.partyMaxHp,
        cfg.coreRequired,
        cfg.bossMaxHp,
        cfg.bossMaxHp,
        lobbyEndsAt,
        user.id,
        roomId
      ),
      env.DB.prepare(
        'UPDATE cnine_user_inventory SET quantity=quantity-1,updated_at=CURRENT_TIMESTAMP ' +
        'WHERE user_id=? AND item_code=? AND quantity>=1 AND EXISTS(SELECT 1 FROM ' + ROOM_TABLE + ' WHERE room_id=?)'
      ).bind(user.id, CORE_RAID_ENTRY_TICKET, roomId),
      env.DB.prepare(
        'INSERT INTO ' + MEMBER_TABLE + '(room_id,user_id) SELECT ?,? WHERE EXISTS(' +
        'SELECT 1 FROM ' + ROOM_TABLE + ' WHERE room_id=?) ON CONFLICT(room_id,user_id) DO NOTHING'
      ).bind(roomId, user.id, roomId),
      env.DB.prepare(
        'INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) ' +
        'SELECT ?,?,-1,quantity,\'CORE_RAID_ROOM_OPEN\',\'CORE_RAID\',? FROM cnine_user_inventory ' +
        'WHERE user_id=? AND item_code=? AND EXISTS(SELECT 1 FROM ' + ROOM_TABLE + ' WHERE room_id=?)'
      ).bind(user.id, CORE_RAID_ENTRY_TICKET, roomId, user.id, CORE_RAID_ENTRY_TICKET, roomId)
    ]);
    const room = await roomById(env, roomId, cfg);
    if (!room) {
      await env.DB.prepare(
        'DELETE FROM ' + ACTIVE_MEMBER_TABLE + ' WHERE user_id=? AND room_id=?'
      ).bind(user.id, roomId).run();
      throw Object.assign(new Error('붕괴 코어 입장권이 없거나 이미 다른 공대에 참가 중입니다.'), { status: 409 });
    }
    const response = await statusPayload(env, user, cfg, roomId);
    await completeReceipt(env, requestId, user.id, response);
    return { response };
  } catch (error) {
    await failReceipt(env, requestId, user.id, error);
    return { error: cleanText(error?.message || error, 300), status: Number(error?.status || 500) };
  }
}

async function joinRoom(env, user, cfg, body) {
  const roomId = cleanText(body.roomId, 100);
  if (!roomId) return { error: '참가할 공대가 필요합니다.', status: 400 };
  const existing = await env.DB.prepare(
    'SELECT 1 joined FROM ' + MEMBER_TABLE + ' WHERE room_id=? AND user_id=?'
  ).bind(roomId, user.id).first();
  if (existing) return { response: await statusPayload(env, user, cfg, roomId) };
  const active = await activeRoomForUser(env, user.id, cfg);
  if (active) return { error: '이미 다른 붕괴 코어 공대에 참가 중입니다.', status: 409 };
  const room = await roomById(env, roomId, cfg);
  if (!room || room.status !== 'LOBBY') return { error: '참가 가능한 공대가 아닙니다.', status: 409 };
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO ' + ACTIVE_MEMBER_TABLE + '(user_id,room_id) SELECT ?,? WHERE EXISTS(' +
      'SELECT 1 FROM ' + ROOM_TABLE + " WHERE room_id=? AND status='LOBBY') AND (" +
      'SELECT COUNT(*) FROM ' + MEMBER_TABLE + ' WHERE room_id=?)<? ON CONFLICT(user_id) DO NOTHING'
    ).bind(user.id, roomId, roomId, roomId, cfg.maxParticipants),
    env.DB.prepare(
      'INSERT INTO ' + MEMBER_TABLE + '(room_id,user_id) SELECT ?,? WHERE EXISTS(' +
      'SELECT 1 FROM ' + ACTIVE_MEMBER_TABLE + ' WHERE user_id=? AND room_id=?) ' +
      'ON CONFLICT(room_id,user_id) DO NOTHING'
    ).bind(roomId, user.id, user.id, roomId),
    env.DB.prepare(
      'UPDATE ' + ROOM_TABLE + ' SET participant_count=(SELECT COUNT(*) FROM ' + MEMBER_TABLE +
      ' WHERE room_id=?),updated_at=CURRENT_TIMESTAMP WHERE room_id=?'
    ).bind(roomId, roomId)
  ]);
  const joined = await env.DB.prepare(
    'SELECT 1 joined FROM ' + MEMBER_TABLE + ' WHERE room_id=? AND user_id=?'
  ).bind(roomId, user.id).first();
  if (!joined) return { error: '공대 정원이 가득 찼거나 다른 공대에 참가 중입니다.', status: 409 };
  return { response: await statusPayload(env, user, cfg, roomId) };
}

async function startRoom(env, user, cfg, body) {
  const roomId = cleanText(body.roomId, 100);
  const room = await roomById(env, roomId, cfg);
  if (!room) return { error: '공대를 찾을 수 없습니다.', status: 404 };
  if (Number(room.host_user_id) !== Number(user.id)) return { error: '공대장만 작전을 시작할 수 있습니다.', status: 403 };
  if (room.status !== 'LOBBY') return { error: '이미 시작됐거나 종료된 공대입니다.', status: 409 };
  const memberCount = Number(room.participant_count || 0);
  if (memberCount < cfg.minParticipants) {
    return { error: '작전 시작에는 최소 ' + cfg.minParticipants + '명이 필요합니다.', status: 409 };
  }
  const startsAt = nowIso();
  const endsAt = plusMinutesIso(cfg.battleMinutes);
  const changed = await env.DB.prepare(
    'UPDATE ' + ROOM_TABLE +
    " SET status='CORE',starts_at=?,ends_at=?,updated_at=CURRENT_TIMESTAMP WHERE room_id=? AND status='LOBBY'"
  ).bind(startsAt, endsAt, roomId).run();
  if (Number(changed?.meta?.changes || 0) !== 1) return { error: '작전 시작 상태가 변경되었습니다.', status: 409 };
  return { response: await statusPayload(env, user, cfg, roomId) };
}

function deckSnapshot(deckInfo, cards) {
  return {
    ids: deckInfo.ids,
    power: Math.max(1, Math.round(deckInfo.power)),
    basePower: deckInfo.basePower,
    cardPower: deckInfo.cardPower,
    characterBonus: deckInfo.characterBonus,
    synergy: deckInfo.synergy,
    cards
  };
}

function battleResponseFromAttempt(attempt, cfg, createPveBattleV2, nickname) {
  const payload = buildCoreRaidBattlePayload({
    participant: attempt,
    settings: cfg,
    aggregate: { status: attempt.stage },
    createBattle: createPveBattleV2,
    accountNickname: nickname
  });
  return {
    ...payload,
    roomId: attempt.room_id,
    instanceId: attempt.room_id,
    attemptId: attempt.attempt_id,
    stage: attempt.stage,
    operation: attempt.operation,
    challenge: jsonSafe(attempt.challenge_json, {})
  };
}

async function battleAttempt(env, user, cfg, body, deps, resumeOnly = false) {
  const roomId = cleanText(body.roomId || body.instanceId, 100);
  if (!roomId) return { error: '붕괴 코어 공대 ID가 필요합니다.', status: 400 };
  const existing = await env.DB.prepare(
    "SELECT * FROM " + ATTEMPT_TABLE +
    " WHERE room_id=? AND user_id=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1"
  ).bind(roomId, user.id).first();
  if (existing) return { response: battleResponseFromAttempt(existing, cfg, deps.createPveBattleV2, user.nickname) };
  if (resumeOnly) return { error: '재개할 공략 전투가 없습니다.', status: 404 };

  const room = await roomById(env, roomId, cfg);
  if (!room || !['CORE', 'BOSS'].includes(room.status)) {
    return { error: room?.status === 'CLEAR' ? '이미 제압이 완료된 공대입니다.' : '현재 전투 가능한 공대가 아닙니다.', status: 409 };
  }
  const member = await env.DB.prepare(
    'SELECT * FROM ' + MEMBER_TABLE + ' WHERE room_id=? AND user_id=?'
  ).bind(roomId, user.id).first();
  if (!member) return { error: '이 공대에 참가하지 않았습니다.', status: 403 };
  const stage = room.status;
  const operation = stage === 'BOSS' ? 'FINAL' : normalizeOperation(body.operation);
  if (stage === 'CORE' && !operation) {
    return { error: '공략할 파쇄·차단·안정화 코어를 선택하세요.', status: 400 };
  }
  if (stage === 'CORE') {
    const state = room.aggregate;
    if (Number(state.coreScores[operation] || 0) >= Number(state.coreTarget || cfg.coreRequired)) {
      return { error: '이미 제압된 코어입니다. 다른 코어를 선택하세요.', status: 409 };
    }
  }

  let deckInfo;
  try {
    deckInfo = await deps.raidDeckPower(env, user.id, body.cardIds, 'RAID');
  } catch (error) {
    return { error: error.message, status: Number(error.status || 400) };
  }
  const cards = deckInfo.cards;
  if (cards.length !== 5) return { error: 'PVE 출전 덱 5장을 먼저 저장하세요.', status: 400 };
  const totalPower = Math.max(1, Math.round(deckInfo.power));
  const attemptId = randomToken('CORE-TRY');
  const challenge = createCoreRaidChallenge({
    roomId,
    attemptId,
    userId: user.id,
    stage,
    operation,
    cards,
    settings: cfg
  });
  const attempt = {
    attempt_id: attemptId,
    room_id: roomId,
    user_id: user.id,
    stage,
    operation,
    deck_snapshot: JSON.stringify(deckSnapshot(deckInfo, cards)),
    role_counts_json: JSON.stringify(coreRaidRoleCounts(cards)),
    challenge_json: JSON.stringify(challenge),
    total_power: totalPower
  };
  const payload = buildCoreRaidBattlePayload({
    participant: attempt,
    settings: cfg,
    aggregate: { status: stage },
    createBattle: deps.createPveBattleV2,
    accountNickname: user.nickname
  });
  const serverWinner = String(payload.coreRaid.serverWinner || 'B').toUpperCase();
  try {
    await env.DB.prepare(
      'INSERT INTO ' + ATTEMPT_TABLE +
      '(attempt_id,room_id,user_id,stage,operation,deck_snapshot,role_counts_json,challenge_json,total_power,server_winner) ' +
      'VALUES(?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      attemptId,
      roomId,
      user.id,
      stage,
      operation,
      attempt.deck_snapshot,
      attempt.role_counts_json,
      attempt.challenge_json,
      totalPower,
      serverWinner
    ).run();
  } catch (error) {
    const raced = await env.DB.prepare(
      "SELECT * FROM " + ATTEMPT_TABLE +
      " WHERE room_id=? AND user_id=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1"
    ).bind(roomId, user.id).first();
    if (raced) return { response: battleResponseFromAttempt(raced, cfg, deps.createPveBattleV2, user.nickname) };
    throw error;
  }
  return {
    response: {
      ...payload,
      roomId,
      instanceId: roomId,
      attemptId,
      stage,
      operation,
      challenge
    }
  };
}

async function resolveAttempt(env, user, cfg, body) {
  const roomId = cleanText(body.roomId || body.instanceId, 100);
  const attemptId = cleanText(body.attemptId, 120);
  const requestId = cleanText(body.requestId, 120);
  if (!roomId || !attemptId || !requestId) {
    return { error: '공대 ID·공략 ID·요청 ID가 필요합니다.', status: 400 };
  }
  const receipt = await reserveReceipt(env, {
    requestId,
    roomId,
    userId: user.id,
    action: 'RESOLVE'
  });
  if (receipt.replay) return { response: receipt.replay };
  if (receipt.error) return receipt;
  try {
    const [attempt, member] = await Promise.all([
      env.DB.prepare(
        'SELECT * FROM ' + ATTEMPT_TABLE + ' WHERE attempt_id=? AND room_id=? AND user_id=?'
      ).bind(attemptId, roomId, user.id).first(),
      env.DB.prepare(
        'SELECT * FROM ' + MEMBER_TABLE + ' WHERE room_id=? AND user_id=?'
      ).bind(roomId, user.id).first()
    ]);
    if (!attempt || attempt.status !== 'PENDING') {
      throw Object.assign(new Error('처리할 공략 전투가 없습니다.'), { status: 409 });
    }
    if (!member) throw Object.assign(new Error('공대 참가 정보를 찾을 수 없습니다.'), { status: 403 });
    const room = await roomById(env, roomId, cfg);
    if (!room || !['CORE', 'BOSS'].includes(room.status)) {
      throw Object.assign(new Error('작전 제한 시간이 종료됐거나 이미 끝난 공대입니다.'), { status: 409 });
    }
    if (attempt.stage === 'BOSS' && room.status !== 'BOSS') {
      throw Object.assign(new Error('최종 보스 단계가 아닙니다.'), { status: 409 });
    }
    const challenge = jsonSafe(attempt.challenge_json, {});
    if (
      String(challenge?.issuedFor?.roomId || challenge?.issuedFor?.instanceId || '') !== roomId ||
      String(challenge?.issuedFor?.attemptId || '') !== attemptId ||
      Number(challenge?.issuedFor?.userId || 0) !== Number(user.id)
    ) {
      throw Object.assign(new Error('기믹 시드 검증에 실패했습니다.'), { status: 409 });
    }
    const qte = evaluateCoreRaidQte(challenge, body.results || {});
    const cards = participantDeckSnapshot(attempt).cards;
    const contribution = coreRaidContribution({
      cards,
      totalPower: attempt.total_power,
      operation: attempt.operation,
      challenge,
      qte,
      settings: cfg
    });
    const outcome = coreRaidAttemptOutcome({
      serverWinner: attempt.server_winner,
      qte,
      contribution,
      stage: attempt.stage,
      settings: cfg
    });
    const breakProgress = attempt.operation === 'BREAK' ? outcome.coreProgress : 0;
    const blockProgress = attempt.operation === 'BLOCK' ? outcome.coreProgress : 0;
    const stabilizeProgress = attempt.operation === 'STABILIZE' ? outcome.coreProgress : 0;
    const resultJson = JSON.stringify({ qte, contribution, outcome });
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE ' + ATTEMPT_TABLE +
        " SET status='COMPLETED',qte_result_json=?,result_json=?,resolve_request_id=?,resolved_at=CURRENT_TIMESTAMP," +
        "updated_at=CURRENT_TIMESTAMP WHERE attempt_id=? AND room_id=? AND user_id=? AND status='PENDING'"
      ).bind(JSON.stringify(qte), resultJson, requestId, attemptId, roomId, user.id),
      env.DB.prepare(
        'UPDATE ' + MEMBER_TABLE + ' SET last_operation=?,attempt_count=attempt_count+1,' +
        'success_count=success_count+?,failure_count=failure_count+?,mechanic_score=mechanic_score+?,' +
        'total_damage=total_damage+?,total_core_progress=total_core_progress+?,total_boss_damage=total_boss_damage+?,' +
        'last_result_json=?,updated_at=CURRENT_TIMESTAMP WHERE room_id=? AND user_id=? AND EXISTS(' +
        'SELECT 1 FROM ' + ATTEMPT_TABLE +
        " a WHERE a.attempt_id=? AND a.room_id=? AND a.user_id=? AND a.status='COMPLETED' AND a.resolve_request_id=?)"
      ).bind(
        attempt.operation,
        outcome.success ? 1 : 0,
        outcome.success ? 0 : 1,
        contribution.mechanicScore,
        outcome.bossDamage,
        outcome.coreProgress,
        outcome.bossDamage,
        resultJson,
        roomId,
        user.id,
        attemptId,
        roomId,
        user.id,
        requestId
      ),
      env.DB.prepare(
        'UPDATE ' + ROOM_TABLE + ' SET ' +
        'party_hp=CASE WHEN party_hp-? < 0 THEN 0 ELSE party_hp-? END,' +
        'break_score=CASE WHEN break_score+? > core_target THEN core_target ELSE break_score+? END,' +
        'block_score=CASE WHEN block_score+? > core_target THEN core_target ELSE block_score+? END,' +
        'stabilize_score=CASE WHEN stabilize_score+? > core_target THEN core_target ELSE stabilize_score+? END,' +
        'boss_hp=CASE WHEN boss_hp-? < 0 THEN 0 ELSE boss_hp-? END,updated_at=CURRENT_TIMESTAMP ' +
        "WHERE room_id=? AND status IN ('CORE','BOSS') AND EXISTS(" +
        'SELECT 1 FROM ' + ATTEMPT_TABLE +
        " a WHERE a.attempt_id=? AND a.room_id=? AND a.user_id=? AND a.status='COMPLETED' AND a.resolve_request_id=?)"
      ).bind(
        outcome.partyHpDamage,
        outcome.partyHpDamage,
        breakProgress,
        breakProgress,
        blockProgress,
        blockProgress,
        stabilizeProgress,
        stabilizeProgress,
        outcome.bossDamage,
        outcome.bossDamage,
        roomId,
        attemptId,
        roomId,
        user.id,
        requestId
      )
    ]);
    const completed = await env.DB.prepare(
      'SELECT status,resolve_request_id FROM ' + ATTEMPT_TABLE + ' WHERE attempt_id=?'
    ).bind(attemptId).first();
    if (completed?.status !== 'COMPLETED' || completed?.resolve_request_id !== requestId) {
      throw Object.assign(new Error('공략 결과가 이미 처리되었습니다.'), { status: 409 });
    }
    const fresh = await roomById(env, roomId, cfg);
    const response = {
      ok: true,
      roomId,
      instanceId: roomId,
      attemptId,
      verified: qte,
      contribution,
      outcome,
      personalResult: outcome.success ? 'SUCCESS' : 'FAILED',
      current: publicRoom(fresh, cfg)
    };
    await completeReceipt(env, requestId, user.id, response);
    return { response };
  } catch (error) {
    await failReceipt(env, requestId, user.id, error);
    return { error: cleanText(error?.message || error, 300), status: Number(error?.status || 500) };
  }
}

async function claimCoreReward(env, user, cfg, body = {}, profile = null) {
  if (cfg.rewardLocked) {
    return {
      error: '붕괴 코어 보상은 테스트 기간 동안 잠겨 있습니다.',
      code: 'CORE_RAID_REWARD_LOCKED',
      status: 423
    };
  }
  const roomId = cleanText(body.roomId || body.instanceId, 100);
  const requestId = cleanText(body.requestId, 120);
  if (!roomId || !requestId) return { error: '공대 ID와 요청 ID가 필요합니다.', status: 400 };
  const [member, room, collision, existing] = await Promise.all([
    env.DB.prepare('SELECT status FROM ' + MEMBER_TABLE + ' WHERE room_id=? AND user_id=?').bind(roomId, user.id).first(),
    env.DB.prepare('SELECT status FROM ' + ROOM_TABLE + ' WHERE room_id=?').bind(roomId).first(),
    env.DB.prepare('SELECT user_id FROM ' + REWARD_RECEIPT_TABLE + ' WHERE request_id=?').bind(requestId).first(),
    env.DB.prepare('SELECT * FROM ' + REWARD_RECEIPT_TABLE + ' WHERE room_id=? AND user_id=?').bind(roomId, user.id).first()
  ]);
  if (!member || String(room?.status || '') !== 'CLEAR') {
    return { error: '공대가 최종 보스를 제압한 뒤 보상을 수령할 수 있습니다.', status: 409 };
  }
  if (collision && Number(collision.user_id) !== Number(user.id)) return { error: '이미 사용된 요청 ID입니다.', status: 409 };
  if (existing?.status === 'COMPLETED' && existing.response_json) {
    return { response: jsonSafe(existing.response_json, { ok: true, replayed: true }) };
  }
  if (existing?.status === 'PENDING') {
    const age = Math.max(0, Date.now() - Date.parse(existing.updated_at || existing.created_at || 0));
    if (age < 15000) {
      return {
        error: '붕괴 코어 보상을 정산 중입니다.',
        code: 'CORE_RAID_REWARD_PENDING',
        retryAfterMs: Math.max(1500, 15000 - age),
        status: 409
      };
    }
    await env.DB.prepare(
      'UPDATE ' + REWARD_RECEIPT_TABLE +
      " SET status='RETRYABLE',error_message='STALE_PENDING_RECOVERED',updated_at=CURRENT_TIMESTAMP " +
      "WHERE room_id=? AND user_id=? AND status='PENDING'"
    ).bind(roomId, user.id).run();
  }
  const rewardCoin = cfg.rewardCoin;
  const rewardShards = cfg.rewardShards;
  const response = {
    ok: true,
    roomId,
    instanceId: roomId,
    rewardClaimed: true,
    reward: { coin: rewardCoin, shards: rewardShards },
    replayed: false
  };
  const reserved = existing
    ? await env.DB.prepare(
        'UPDATE ' + REWARD_RECEIPT_TABLE +
        " SET request_id=?,status='PENDING',reward_coin=?,reward_shards=?,response_json=NULL,error_message=NULL," +
        "updated_at=CURRENT_TIMESTAMP WHERE room_id=? AND user_id=? AND status IN ('FAILED','RETRYABLE')"
      ).bind(requestId, rewardCoin, rewardShards, roomId, user.id).run()
    : await env.DB.prepare(
        'INSERT INTO ' + REWARD_RECEIPT_TABLE +
        "(room_id,user_id,request_id,status,reward_coin,reward_shards) VALUES(?,?,?,'PENDING',?,?) " +
        'ON CONFLICT(room_id,user_id) DO NOTHING'
      ).bind(roomId, user.id, requestId, rewardCoin, rewardShards).run();
  if (Number(reserved?.meta?.changes || 0) !== 1) {
    return {
      error: '붕괴 코어 보상을 정산 중입니다.',
      code: 'CORE_RAID_REWARD_PENDING',
      retryAfterMs: 2000,
      status: 409
    };
  }
  const guard =
    'EXISTS(SELECT 1 FROM ' + REWARD_RECEIPT_TABLE +
    " WHERE room_id=? AND user_id=? AND request_id=? AND status='PENDING')";
  const guardBind = [roomId, user.id, requestId];
  const statements = [
    env.DB.prepare(
      'UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=? AND ' + guard
    ).bind(rewardCoin, rewardShards, user.id, ...guardBind)
  ];
  if (rewardCoin > 0) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) " +
        "SELECT id,?,coin,'CORE_PROTOCOL_RAID_REWARD' FROM users WHERE id=? AND " + guard
      ).bind(rewardCoin, user.id, ...guardBind)
    );
  }
  if (rewardShards > 0) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) " +
        "SELECT id,?,card_shards,'CORE_PROTOCOL_RAID_REWARD' FROM users WHERE id=? AND " + guard
      ).bind(rewardShards, user.id, ...guardBind)
    );
  }
  statements.push(
    env.DB.prepare(
      'UPDATE ' + REWARD_RECEIPT_TABLE +
      " SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP " +
      "WHERE room_id=? AND user_id=? AND request_id=? AND status='PENDING'"
    ).bind(JSON.stringify(response), ...guardBind)
  );
  await env.DB.batch(statements);
  if (typeof profile === 'function') {
    const updated = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
    response.user = updated ? await profile(env, updated) : null;
    await env.DB.prepare(
      'UPDATE ' + REWARD_RECEIPT_TABLE +
      " SET response_json=?,updated_at=CURRENT_TIMESTAMP WHERE room_id=? AND user_id=? AND status='COMPLETED'"
    ).bind(JSON.stringify(response), roomId, user.id).run();
  }
  return { response };
}

export async function handleRaidCoreProtocol({ path, request, env, deps }) {
  if (!path.startsWith('raid/core/') && !path.startsWith('admin/raid/core/')) return null;
  const {
    authenticate,
    readBody,
    json,
    raidDeckPower,
    createPveBattleV2,
    profile,
    writeAdminLog
  } = deps;
  await ensure(env);
  const user = await authenticate(request, env);
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  let cfg = await readSettings(env);

  if (path === 'admin/raid/core/settings') {
    if (!isOwner(user)) return json({ error: 'OWNER 권한이 필요합니다.' }, 403);
    if (request.method === 'GET') return json({ settings: cfg });
    if (request.method === 'PATCH' || request.method === 'POST') {
      const before = cfg;
      const body = await readBody(request);
      cfg = cleanCoreRaidSettings(body);
      if (cfg.minParticipants > cfg.maxParticipants) {
        return json({ error: '최소 참가 인원은 최대 참가 인원보다 클 수 없습니다.' }, 400);
      }
      await env.DB.prepare(
        'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ' +
        'ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP'
      ).bind(SETTINGS_KEY, JSON.stringify(cfg)).run();
      if (typeof writeAdminLog === 'function') {
        await writeAdminLog(env, user, 'CORE_RAID_SETTINGS_UPDATE', 'RAID', SETTINGS_KEY, before, cfg);
      }
      return json({ ok: true, settings: cfg });
    }
    return json({ error: '지원하지 않는 요청입니다.' }, 405);
  }

  const feature = coreRaidFeatureAccess(user, cfg);
  if (path === 'raid/core/feature' && request.method === 'GET') {
    return json({ ok: true, ...feature, title: cfg.title, subtitle: cfg.subtitle });
  }
  if (cfg.mode === 'OFF') {
    return json({ error: '붕괴 코어 레이드가 현재 중지되어 있습니다.', code: 'CORE_RAID_OFF' }, 503);
  }
  if (!feature.accessible) {
    return json({ error: '붕괴 코어 레이드는 지정된 테스트 계정만 이용할 수 있습니다.', code: 'CORE_RAID_TEST_ACCESS' }, 403);
  }

  const url = new URL(request.url);
  const requestedId = cleanText(url.searchParams.get('roomId') || url.searchParams.get('instanceId') || '', 100);
  if (path === 'raid/core/status' && request.method === 'GET') {
    return json(await statusPayload(env, user, cfg, requestedId, url.searchParams.get('browse') === '1'));
  }
  if (path === 'raid/core/open' && request.method === 'POST') {
    const result = await openRoom(env, user, cfg, await readBody(request));
    return result.response ? json(result.response) : json({ error: result.error }, result.status || 500);
  }
  if (path === 'raid/core/join' && request.method === 'POST') {
    const result = await joinRoom(env, user, cfg, await readBody(request));
    return result.response ? json(result.response) : json({ error: result.error }, result.status || 500);
  }
  if (path === 'raid/core/start' && request.method === 'POST') {
    const result = await startRoom(env, user, cfg, await readBody(request));
    return result.response ? json(result.response) : json({ error: result.error }, result.status || 500);
  }
  if (path === 'raid/core/battle' && (request.method === 'POST' || request.method === 'GET')) {
    const body = request.method === 'POST'
      ? await readBody(request)
      : { roomId: requestedId };
    const result = await battleAttempt(
      env,
      user,
      cfg,
      body,
      { raidDeckPower, createPveBattleV2 },
      request.method === 'GET'
    );
    return result.response ? json(result.response) : json({ error: result.error }, result.status || 500);
  }
  if (path === 'raid/core/resolve' && request.method === 'POST') {
    const result = await resolveAttempt(env, user, cfg, await readBody(request));
    return result.response ? json(result.response) : json({ error: result.error }, result.status || 500);
  }
  if (path === 'raid/core/claim' && request.method === 'POST') {
    const result = await claimCoreReward(env, user, cfg, await readBody(request), profile);
    if (result.response) return json(result.response);
    return json(
      { error: result.error, code: result.code, retryAfterMs: result.retryAfterMs },
      result.status || 500
    );
  }
  return json({ error: '지원하지 않는 붕괴 코어 레이드 요청입니다.' }, 404);
}
