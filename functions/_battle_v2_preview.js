const STAT_PROFILES = {
  ATTACK:  { hp: 0.34, attack: 0.38, defense: 0.14, speed: 0.14, label: '공격형' },
  DEFENSE: { hp: 0.43, attack: 0.22, defense: 0.25, speed: 0.10, label: '방어형' },
  HP:      { hp: 0.52, attack: 0.20, defense: 0.18, speed: 0.10, label: '생명형' },
  SPEED:   { hp: 0.34, attack: 0.25, defense: 0.14, speed: 0.27, label: '속도형' },
  NONE:    { hp: 0.40, attack: 0.28, defense: 0.18, speed: 0.14, label: '균형형' }
};

function clamp(value, min, max) {
  const n = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function int(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function hashSeed(input = '') {
  let hash = 2166136261 >>> 0;
  for (const ch of String(input)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 0x9e3779b9;
}

function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeType(card = {}, uniqueAbility = null) {
  const dominant = String(uniqueAbility?.dominantType || '').trim().toUpperCase();
  if (STAT_PROFILES[dominant]) return dominant;
  const raw = String(card.power_type ?? card.powerType ?? '').trim().toUpperCase();
  if (raw === 'HEALTH' || raw === 'LIFE') return 'HP';
  return STAT_PROFILES[raw] ? raw : 'NONE';
}

function uniquePercent(effect, key) {
  return clamp(effect?.[key] ?? 0, -90, key === 'speedPercent' ? 300 : 500);
}

function distributeEquipment(cards = [], equipmentBonus = 0) {
  const total = cards.reduce((sum, card) => sum + Math.max(0, Number(card.power || 0)), 0);
  let assigned = 0;
  return cards.map((card, index) => {
    const share = index === cards.length - 1
      ? Math.max(0, Math.round(equipmentBonus - assigned))
      : Math.max(0, Math.floor(Number(equipmentBonus || 0) * Math.max(0, Number(card.power || 0)) / Math.max(1, total)));
    assigned += share;
    return { ...card, equipmentShare: share, effectivePower: Math.max(1, Math.round(Number(card.power || 0) + share)) };
  });
}

function buildFighter(card, index, side, uniqueAbility = null) {
  const type = normalizeType(card, uniqueAbility);
  const profile = STAT_PROFILES[type];
  const power = Math.max(1, Number(card.effectivePower || card.power || 1));
  const attackPct = uniquePercent(uniqueAbility, 'attackPercent');
  const defensePct = uniquePercent(uniqueAbility, 'defensePercent');
  const hpPct = uniquePercent(uniqueAbility, 'hpPercent');
  const speedPct = uniquePercent(uniqueAbility, 'speedPercent');

  const maxHp = Math.max(100, Math.round(power * profile.hp * 4.25 * (1 + hpPct / 100)));
  const attack = Math.max(10, Math.round(power * profile.attack * 1.05 * (1 + attackPct / 100)));
  const defense = Math.max(1, Math.round(power * profile.defense * 0.85 * (1 + defensePct / 100)));
  const speed = Math.max(35, Math.round((70 + power * profile.speed * 0.10) * (1 + speedPct / 100)));
  const startingShield = type === 'DEFENSE' ? Math.round(maxHp * clamp(0.18 + Math.max(0, defensePct) / 500, 0.18, 0.35)) : 0;

  return {
    id: `${side}:${index}:${String(card.id)}`,
    cardId: String(card.id),
    side,
    slot: index,
    row: index < 2 ? 'FRONT' : 'BACK',
    title: String(card.title || card.name || 'CARD'),
    memberName: String(card.name || card.member_name || ''),
    grade: String(card.rarity || card.grade || '').toUpperCase(),
    image: String(card.image || card.image_url || ''),
    focusX: clamp(card.focus_x ?? card.focusX ?? 50, 0, 100),
    focusY: clamp(card.focus_y ?? card.focusY ?? 50, 0, 100),
    breakthroughLevel: int(card.breakthrough_level ?? card.breakthroughLevel, 0),
    basePower: int(card.power, 0),
    equipmentShare: int(card.equipmentShare, 0),
    power: int(power, 0),
    type,
    typeLabel: profile.label,
    uniqueAbility: uniqueAbility ? {
      effectName: String(uniqueAbility.effectName || profile.label),
      effectDescription: String(uniqueAbility.effectDescription || ''),
      attackPercent: attackPct,
      defensePercent: defensePct,
      hpPercent: hpPct,
      speedPercent: speedPct,
      dominantType: type
    } : null,
    maxHp,
    hp: maxHp,
    attack,
    defense,
    speed,
    shield: startingShield,
    maxShield: startingShield,
    gauge: type === 'SPEED' ? 30 : 0,
    alive: true,
    emergencyUsed: false,
    survivalUsed: false,
    frontlineAnnounced: false,
    actions: 0,
    damageDealt: 0,
    healingDone: 0
  };
}

function publicFighter(fighter) {
  const {
    emergencyUsed, survivalUsed, frontlineAnnounced, alive, actions, damageDealt, healingDone,
    ...card
  } = fighter;
  return card;
}

function alive(team) {
  return team.filter(card => card.alive && card.hp > 0);
}

function targetPool(team) {
  const front = team.filter(card => card.alive && card.hp > 0 && card.row === 'FRONT');
  return front.length ? front : team.filter(card => card.alive && card.hp > 0);
}

function teamHpRatio(team) {
  const current = team.reduce((sum, card) => sum + Math.max(0, card.hp) + Math.max(0, card.shield), 0);
  const maximum = team.reduce((sum, card) => sum + card.maxHp + card.maxShield, 0);
  return maximum > 0 ? current / maximum : 0;
}

function hitResult(actor, target, random, multiplier = 1, counter = false) {
  const dodgeChance = target.type === 'SPEED'
    ? clamp(0.10 + Math.max(0, uniquePercent(target.uniqueAbility, 'speedPercent')) / 1000, 0.10, 0.24)
    : 0.02;
  if (!counter && random() < dodgeChance) return { dodge: true, damage: 0, critical: false, penetration: 0 };

  const criticalChance = clamp(0.10 + (actor.type === 'ATTACK' ? 0.06 : 0) + (actor.type === 'SPEED' ? 0.03 : 0), 0.10, 0.25);
  const critical = random() < criticalChance;
  const penetration = actor.type === 'ATTACK' ? (random() < 0.35 ? 0.30 : 0.15) : 0.03;
  const effectiveDefense = Math.max(0, target.defense * (1 - penetration));
  const reduction = clamp(effectiveDefense / (effectiveDefense + 600), 0, 0.65);
  const variance = 0.95 + random() * 0.10;
  const execute = actor.type === 'ATTACK' && target.hp / Math.max(1, target.maxHp) <= 0.25 ? 1.20 : 1;
  const raw = actor.attack * 1.72 * Number(multiplier || 1) * variance * execute * (critical ? 1.50 : 1);
  const capped = Math.min(raw * (1 - reduction), target.maxHp * (counter ? 0.24 : 0.46));
  const damage = Math.max(1, Math.round(capped));
  return { dodge: false, damage, critical, penetration: Number((penetration * 100).toFixed(1)), execute: execute > 1 };
}

function applyDamage(target, incoming) {
  let remaining = Math.max(0, Number(incoming || 0));
  const shieldBefore = target.shield;
  const absorbed = Math.min(target.shield, remaining);
  target.shield -= absorbed;
  remaining -= absorbed;
  const hpBefore = target.hp;
  target.hp = Math.max(0, target.hp - remaining);
  return { absorbed, hpDamage: hpBefore - target.hp, shieldBefore, shieldAfter: target.shield, hpBefore, hpAfter: target.hp };
}

function pushEvent(timeline, clock, type, data = {}) {
  timeline.push({ seq: timeline.length + 1, at: Number(clock.toFixed(3)), type, ...data });
}

function lowestRatioTarget(pool, random) {
  const sorted = [...pool].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp) || a.slot - b.slot);
  if (sorted.length > 1 && random() < 0.28) return sorted[1];
  return sorted[0];
}

function maybeEmergencyHeal(target, timeline, clock) {
  if (!target.alive || target.hp <= 0 || target.type !== 'HP' || target.emergencyUsed) return;
  if (target.hp / target.maxHp > 0.30) return;
  target.emergencyUsed = true;
  const amount = Math.min(target.maxHp - target.hp, Math.round(target.maxHp * 0.18));
  if (amount <= 0) return;
  target.hp += amount;
  target.healingDone += amount;
  pushEvent(timeline, clock, 'EMERGENCY_HEAL', {
    targetId: target.id,
    amount,
    hpAfter: target.hp,
    maxHp: target.maxHp,
    label: '생명형 · 긴급 회복'
  });
}

function maybeFrontlineBreak(team, side, timeline, clock) {
  if (team.some(card => card.alive && card.hp > 0 && card.row === 'FRONT')) return;
  if (!team.some(card => card.alive && card.hp > 0 && !card.frontlineAnnounced)) return;
  team.forEach(card => { card.frontlineAnnounced = true; });
  pushEvent(timeline, clock, 'FRONTLINE_BREAK', { side, label: side === 'A' ? '아군 전열 붕괴' : '적군 전열 붕괴' });
}

function resolveKnockout(target, timeline, clock) {
  if (target.hp > 0 || !target.alive) return false;
  if (target.type === 'HP' && !target.survivalUsed) {
    target.survivalUsed = true;
    target.hp = Math.max(1, Math.round(target.maxHp * 0.12));
    pushEvent(timeline, clock, 'SURVIVE', {
      targetId: target.id,
      hpAfter: target.hp,
      maxHp: target.maxHp,
      label: '생명형 · 불굴의 생존'
    });
    return false;
  }
  target.alive = false;
  target.hp = 0;
  target.gauge = 0;
  pushEvent(timeline, clock, 'KO', { targetId: target.id });
  return true;
}

export function simulateBattleV2Preview({ teamA = [], teamB = [], seed = 1, maxActions = 80 } = {}) {
  const random = seededRandom(seed);
  const a = teamA.map(card => ({ ...card }));
  const b = teamB.map(card => ({ ...card }));
  const timeline = [];
  let clock = 0;
  let actionCount = 0;

  for (const fighter of [...a, ...b]) {
    fighter.gauge = clamp(Number(fighter.gauge || 0) + random() * 8, 0, 99);
    if (fighter.shield > 0) {
      pushEvent(timeline, clock, 'START_EFFECT', {
        targetId: fighter.id,
        effect: 'SHIELD',
        amount: fighter.shield,
        shieldAfter: fighter.shield,
        label: '방어형 · 선봉 방벽'
      });
    }
  }

  while (alive(a).length && alive(b).length && actionCount < maxActions) {
    const actors = [...alive(a), ...alive(b)];
    const dt = Math.min(...actors.map(card => (100 - card.gauge) / Math.max(1, card.speed)));
    clock += Math.max(0.001, dt);
    for (const card of actors) card.gauge = clamp(card.gauge + card.speed * dt, 0, 130);
    const ready = actors.filter(card => card.gauge >= 99.999).sort((x, y) => y.gauge - x.gauge || y.speed - x.speed || x.slot - y.slot);
    const actor = ready[0];
    actor.gauge = Math.max(0, actor.gauge - 100);
    actor.actions += 1;
    actionCount += 1;

    if (actor.type === 'HP' && actor.hp < actor.maxHp) {
      const amount = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.round(actor.maxHp * 0.04)));
      actor.hp += amount;
      actor.healingDone += amount;
      pushEvent(timeline, clock, 'REGEN', { targetId: actor.id, amount, hpAfter: actor.hp, maxHp: actor.maxHp, label: '생명형 · 지속 회복' });
    }

    const enemyTeam = actor.side === 'A' ? b : a;
    const pool = targetPool(enemyTeam);
    if (!pool.length) break;
    const target = lowestRatioTarget(pool, random);
    const hit = hitResult(actor, target, random);

    if (hit.dodge) {
      pushEvent(timeline, clock, 'TURN', {
        actorId: actor.id,
        targetId: target.id,
        dodge: true,
        actorGaugeAfter: actor.gauge,
        targetGaugeAfter: target.gauge,
        label: '속도형 · 회피'
      });
      continue;
    }

    const damageState = applyDamage(target, hit.damage);
    actor.damageDealt += damageState.hpDamage + damageState.absorbed;

    if (actor.type === 'SPEED') {
      target.gauge = Math.max(0, target.gauge - 18);
      if (random() < 0.28) actor.gauge = Math.min(95, actor.gauge + 35);
    }

    pushEvent(timeline, clock, 'TURN', {
      actorId: actor.id,
      targetId: target.id,
      damage: damageState.hpDamage,
      absorbed: damageState.absorbed,
      critical: hit.critical,
      penetration: hit.penetration,
      execute: hit.execute === true,
      targetHpAfter: target.hp,
      targetMaxHp: target.maxHp,
      targetShieldAfter: target.shield,
      actorGaugeAfter: actor.gauge,
      targetGaugeAfter: target.gauge
    });

    const knockedOut = resolveKnockout(target, timeline, clock);
    if (!knockedOut) maybeEmergencyHeal(target, timeline, clock);
    maybeFrontlineBreak(enemyTeam, target.side, timeline, clock);

    if (!target.alive || target.hp <= 0) continue;

    if (target.type === 'DEFENSE' && random() < 0.25) {
      const counter = hitResult(target, actor, random, 0.55, true);
      if (!counter.dodge) {
        const counterState = applyDamage(actor, counter.damage);
        target.damageDealt += counterState.hpDamage + counterState.absorbed;
        pushEvent(timeline, clock + 0.001, 'COUNTER', {
          actorId: target.id,
          targetId: actor.id,
          damage: counterState.hpDamage,
          absorbed: counterState.absorbed,
          critical: counter.critical,
          targetHpAfter: actor.hp,
          targetMaxHp: actor.maxHp,
          targetShieldAfter: actor.shield,
          label: '방어형 · 반격'
        });
        const actorDown = resolveKnockout(actor, timeline, clock + 0.001);
        if (!actorDown) maybeEmergencyHeal(actor, timeline, clock + 0.001);
        maybeFrontlineBreak(actor.side === 'A' ? a : b, actor.side, timeline, clock + 0.001);
      }
    }
  }

  const aRatio = teamHpRatio(a);
  const bRatio = teamHpRatio(b);
  const winner = alive(a).length && !alive(b).length ? 'A'
    : alive(b).length && !alive(a).length ? 'B'
      : aRatio === bRatio ? 'DRAW' : (aRatio > bRatio ? 'A' : 'B');
  const reason = actionCount >= maxActions && alive(a).length && alive(b).length ? 'ACTION_LIMIT' : 'ELIMINATION';
  pushEvent(timeline, clock + 0.01, 'RESULT', {
    winner,
    reason,
    actions: actionCount,
    duration: Number(clock.toFixed(3)),
    teamAHpPercent: Math.round(aRatio * 1000) / 10,
    teamBHpPercent: Math.round(bRatio * 1000) / 10
  });

  return {
    winner,
    reason,
    actions: actionCount,
    duration: Number(clock.toFixed(3)),
    timeline,
    final: {
      A: a.map(publicFighter),
      B: b.map(publicFighter)
    }
  };
}

function teamSummary(cards = []) {
  return {
    power: cards.reduce((sum, card) => sum + Number(card.power || 0), 0),
    basePower: cards.reduce((sum, card) => sum + Number(card.basePower || 0), 0),
    equipmentBonus: cards.reduce((sum, card) => sum + Number(card.equipmentShare || 0), 0),
    maxHp: cards.reduce((sum, card) => sum + Number(card.maxHp || 0), 0),
    attack: cards.reduce((sum, card) => sum + Number(card.attack || 0), 0),
    defense: cards.reduce((sum, card) => sum + Number(card.defense || 0), 0),
    averageSpeed: cards.length ? Math.round(cards.reduce((sum, card) => sum + Number(card.speed || 0), 0) / cards.length) : 0
  };
}

async function selectOpponent(env, user, requestedId = 0) {
  if (requestedId && requestedId !== Number(user.id)) {
    const row = await env.DB.prepare(`SELECT u.id,u.nickname,u.role,COALESCE(p.season_score,1000) AS seasonScore,d.card_ids AS cardIds
      FROM users u JOIN pvp_decks d ON d.user_id=u.id LEFT JOIN pvp_profiles p ON p.user_id=u.id
      WHERE u.id=? AND u.status='ACTIVE' LIMIT 1`).bind(requestedId).first();
    if (row) {
      let ids = [];
      try { ids = JSON.parse(row.cardIds || '[]'); } catch {}
      if (Array.isArray(ids) && ids.length === 5) return row;
    }
  }

  const myProfile = await env.DB.prepare('SELECT COALESCE(season_score,1000) AS seasonScore FROM pvp_profiles WHERE user_id=? LIMIT 1').bind(user.id).first();
  const score = Number(myProfile?.seasonScore || 1000);
  const rows = (await env.DB.prepare(`SELECT u.id,u.nickname,u.role,COALESCE(p.season_score,1000) AS seasonScore,d.card_ids AS cardIds
    FROM users u JOIN pvp_decks d ON d.user_id=u.id LEFT JOIN pvp_profiles p ON p.user_id=u.id
    WHERE u.id<>? AND u.status='ACTIVE' AND COALESCE(u.role,'USER') NOT IN ('OWNER','ADMIN')
    ORDER BY ABS(COALESCE(p.season_score,1000)-?) ASC,u.id DESC LIMIT 24`).bind(user.id, score).all()).results || [];
  for (const row of rows) {
    let ids = [];
    try { ids = JSON.parse(row.cardIds || '[]'); } catch {}
    if (Array.isArray(ids) && ids.length === 5) return row;
  }
  return null;
}

export async function handleBattleV2Preview({ path, request, env, deps }) {
  if (path !== 'battle-v2/preview') return null;
  if (request.method !== 'GET') return deps.json({ error: '지원하지 않는 요청입니다.' }, 405);
  const user = await deps.authenticate(request, env);
  if (!user) return deps.json({ error: '로그인이 필요합니다.' }, 401);
  if (String(user.role || '').trim().toUpperCase() !== 'OWNER') return deps.json({ error: '전투엔진 V2 구현 프리뷰는 OWNER 테스트 전용입니다.' }, 403);

  const url = new URL(request.url);
  const requestedOpponentId = Math.max(0, Math.floor(Number(url.searchParams.get('opponentId') || 0)));
  const nonce = String(url.searchParams.get('seed') || Date.now()).slice(0, 80);
  const [settings, ownDeck, opponent] = await Promise.all([
    deps.battleSettings(env),
    deps.pvpDeckSnapshot(env, user.id),
    selectOpponent(env, user, requestedOpponentId)
  ]);

  if (ownDeck.length !== 5) return deps.json({ error: '전투엔진 V2 프리뷰를 시작하려면 PvP 덱 5장을 먼저 편성하세요.' }, 400);

  let opponentUser = opponent;
  let opponentDeck = opponent ? await deps.pvpDeckSnapshot(env, opponent.id) : [];
  let mirror = false;
  if (opponentDeck.length !== 5) {
    mirror = true;
    opponentUser = { id: -Number(user.id), nickname: '훈련용 미러 덱', role: 'SYSTEM', seasonScore: 0 };
    opponentDeck = ownDeck.map(card => ({ ...card }));
  }

  const ownCards = ownDeck.map(card => ({ ...card, power: deps.cardBattlePower(card, card.breakthrough_level, settings) }));
  const enemyCards = opponentDeck.map(card => ({ ...card, power: deps.cardBattlePower(card, card.breakthrough_level, settings) }));
  const ownBonusPromise = deps.userEquipmentBonuses(env, user.id);
  const enemyBonusPromise = mirror
    ? ownBonusPromise.then(value => ({ ...value, pvp: Number(value?.pvp || 0) }))
    : deps.userEquipmentBonuses(env, opponentUser.id);
  const uniquePreviewUser = { ...user, role: 'OWNER' };
  const uniquePreviewOpponent = { ...opponentUser, role: 'OWNER' };
  const [uniqueStates, ownBonus, enemyBonus] = await Promise.all([
    deps.cardUniqueDeckStates(env, [{ user: uniquePreviewUser, cards: ownCards }, { user: uniquePreviewOpponent, cards: enemyCards }], 'PVP'),
    ownBonusPromise,
    enemyBonusPromise
  ]);

  const ownUniqueMap = new Map((uniqueStates[0]?.cards || []).map(card => [String(card.id), card.uniqueAbility || null]));
  const enemyUniqueMap = new Map((uniqueStates[1]?.cards || []).map(card => [String(card.id), card.uniqueAbility || null]));
  const ownWithEquipment = distributeEquipment(ownCards, Number(ownBonus?.pvp || 0));
  const enemyWithEquipment = distributeEquipment(enemyCards, Number(enemyBonus?.pvp || 0));
  const teamA = ownWithEquipment.map((card, index) => buildFighter(card, index, 'A', ownUniqueMap.get(String(card.id))));
  const teamB = enemyWithEquipment.map((card, index) => buildFighter(card, index, 'B', enemyUniqueMap.get(String(card.id))));
  const seed = hashSeed(`${user.id}:${opponentUser.id}:${nonce}`);
  const simulation = simulateBattleV2Preview({ teamA, teamB, seed });

  return deps.json({
    preview: true,
    schemaVersion: 2,
    engine: 'BATTLE_ENGINE_V2_PREVIEW',
    persistence: 'NONE',
    seed,
    generatedAt: new Date().toISOString(),
    rules: {
      hpMode: 'POWER_DISTRIBUTED',
      formation: 'FRONT_2_BACK_3',
      actionMode: 'SPEED_GAUGE',
      damageCapPercent: 46,
      dbWrites: 0
    },
    player: { id: Number(user.id), nickname: String(user.nickname || 'PLAYER') },
    opponent: { id: Number(opponentUser.id), nickname: String(opponentUser.nickname || 'OPPONENT'), mirror },
    teams: {
      A: { summary: teamSummary(teamA), cards: teamA.map(publicFighter) },
      B: { summary: teamSummary(teamB), cards: teamB.map(publicFighter) }
    },
    result: simulation
  }, 200, { 'cache-control': 'no-store' });
}
