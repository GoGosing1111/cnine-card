// =====================================================================
// V1936: 계열 개편 (S1)
//
// 왜 이렇게 바꾸는가 — 스탯을 계열마다 **완전히 똑같이** 맞춰놓고 재봐도
//   계열별 승률이 55 / 73 / 91 / 94 로 갈렸다(균형형 5장 상대, 1장 섞기).
//   즉 격차는 스탯이 아니라 **능력의 성격**에서 나온다.
//   방어형 무료 부활, 생명형 무한 회복처럼 **총량 제한이 없는 능력**은
//   수치를 아무리 깎아도 다른 계열이 따라올 수 없었다(레버 30개 측정, 전부 3%p 미만).
//
// 그래서 수치가 아니라 **무한 자원을 유한 자원으로** 바꾼다.
//   방어형: 무료 부활 삭제 → 소모되는 팀 방벽. 반격도 방벽이 남아 있을 때만.
//   생명형: 무료 부활 삭제 → 전투당 회복 총량. 대신 1회 회복량은 상향.
//   속도형: 행동 속도 상향 + 방벽에 추가 피해(방벽을 벗기는 역할).
//   공격형: 관통·마무리 상향 + 적 부활 1회 봉인.
//   신규: 계열 종류 수에 따른 편성 보너스(몰빵보다 섞는 쪽이 유리하도록).
//
// 결과(계열 카드 2장 + 균형형 3장 덱끼리): 계열 간 격차 65%p → 20%p
//   공격 40 / 방어 49 / 속도 46 / 생명 60
// 조합 리그(5장 조합 56개): 경쟁밴드 11 → 15, 상위10 평균 계열 수 2.9 → 3.1
//
// 재현·재조정: tools/balance-harness-v1903/  (bfinal.mjs, s1FINAL.mjs, B-FINAL.json)
// =====================================================================
const S1 = {
  // 계열 능력
  guardShieldPercent: 0.40,      // 방어형: 팀 방벽 = 방어형 최대HP x 이 값 (장수 체감)
  guardShieldCurve: [1, 0.6, 0.35, 0.2, 0.12],
  counterNeedsShield: true,      // 반격은 방벽이 남아 있을 때만
  counterChance: 0.20,
  counterChanceBreached: 0.10,
  counterMultiplier: 0.60,
  counterMultiplierBreached: 0.49,
  healPoolPercent: 0.65,         // 생명형: 팀 회복 총량 = 생명형 최대HP x 이 값
  healPoolCurve: [1, 0.6, 0.35, 0.2, 0.12],
  regenPercent: 0.07,            // 지속 회복 (총량에서 차감)
  regenSuddenDeathScale: 0.5,    // 연장전에도 절반은 유지 (기존: 완전 차단)
  emergencyHealPercent: 0.30,
  speedShieldBonus: 1.00,        // 속도형: 방벽에 추가 피해 (실드 상대로만)
  speedChaseGauge: 70,           // 속도형: 처치 시 게이지 회복
  speedChaseUses: 3,
  attackSealRevive: 1,           // 공격형: 상대 팀 부활 1회 봉인
  attackChainGauge: 45,          // 공격형: 처치 시 게이지 회복
  attackChainUses: 2,
  // 편성
  varietyBonus: [0, 0, 0.04, 0.09, 0.15],   // 계열 종류 수 -> 팀 전체 공격력·최대HP 가산
  typeStackCurve: [1, 0.72, 0.45, 0.28, 0.28], // 같은 계열 k번째의 프로필 편차 감쇠
  healerDuplicatePenalty: [0, 0, 35, 55, 68, 78],
  singleHealerCurve: [0.7, 0.4, 0.25, 0.15, 0.1], // 힐러 장수별 오라 배율 (기존: 1장에서만 100%)
  // 피해 모델
  damageCapPercent: 0.60,        // 기존 0.46. 공격력 11만 이상에서만 걸리던 상한을 완화
  defenseDenomK: 0.9,            // 방어 감소 분모 = 공격자 공격력 x 이 값 (기존: 상수 600 = 사실상 고정 65%)
  defenseCapPercent: 0.65,
  speedBaseK: 0.012,             // 행동 빈도 격차 압축용 기저값
  executePvpMultiplier: 1.30,    // 기존 1.10
  attackPenetrationPvp: 0.42,    // 기존 0.30
  // PVE 보정: 부활을 없앤 만큼 PVE 생존력이 떨어진다(보스전 생존 3.0장 -> 1.2장 측정).
  //   PVP 밸런스를 건드리지 않고 PVE 에서만 방벽·회복 총량을 키워 종전 체감을 복원한다.
  pveShieldScale: 2.6,
  pveHealPoolScale: 2.4,
};
const S1_TYPE_KEYS = ['ATTACK', 'DEFENSE', 'SPEED', 'HP'];

// V1937: 전술 전직은 서버가 검증해 카드에 주입한 상태만 소비한다.
// 엔진은 수치를 하드코딩하지 않고 `modifiers` 계약을 적용하므로 서버 설정과
// 밸런스 하네스가 단일 수치 기준이 된다. 계열과 전직 코드가 어긋난 입력은 무시한다.
const UNIQUE_ADVANCEMENT_CLASS_BY_TYPE = Object.freeze({
  ATTACK: 'SHATTER',
  DEFENSE: 'RIPOSTE',
  SPEED: 'AFTERIMAGE',
  HP: 'IMMORTAL',
});

function normalizeUniqueAdvancement(card = {}, type = 'NONE') {
  const raw = card?.uniqueAdvancement || card?.unique_advancement || null;
  if (!raw || raw.active !== true) return null;
  const classCode = String(raw.classCode || raw.class_code || '').trim().toUpperCase();
  const dominantType = String(raw.dominantType || raw.dominant_type || type || '').trim().toUpperCase();
  if (!classCode || classCode !== UNIQUE_ADVANCEMENT_CLASS_BY_TYPE[type] || dominantType !== type) return null;
  const input = raw.modifiers && typeof raw.modifiers === 'object' ? raw.modifiers : {};
  const modifier = (key, min, max) => clamp(input[key] ?? 0, min, max);
  return {
    active: true,
    classCode,
    dominantType,
    configVersion: String(raw.configVersion || raw.config_version || ''),
    modifiers: {
      criticalChancePoints: modifier('criticalChancePoints', 0, 25),
      penetrationPoints: modifier('penetrationPoints', 0, 50),
      openingGaugePoints: modifier('openingGaugePoints', 0, 60),
      dodgeChancePoints: modifier('dodgeChancePoints', 0, 20),
      dodgeCapPoints: modifier('dodgeCapPoints', 0, 20),
      counterChancePoints: modifier('counterChancePoints', 0, 35),
      counterMultiplierPoints: modifier('counterMultiplierPoints', 0, 35),
      unshieldedCounterChancePoints: modifier('unshieldedCounterChancePoints', 0, 35),
      maxHpPercent: modifier('maxHpPercent', -35, 35),
      damageDealtPercent: modifier('damageDealtPercent', -35, 35),
      damageCapPoints: modifier('damageCapPoints', 0, 25),
      lastStandHealPoolPercent: modifier('lastStandHealPoolPercent', 0, 35),
      sealedLastStandHealPoolPercent: modifier('sealedLastStandHealPoolPercent', 0, 25),
      healPoolBonusPercent: modifier('healPoolBonusPercent', 0, 50),
    },
  };
}

// V1936: 계열은 균형형(NONE)에서 한 칸만 특화한다.
//   ⚠ 공격형은 `공격력↑ HP↓` 가 아니라 `공격력↑ 방어↓` 다.
//     이 엔진에서 HP 가 공격력보다 값어치가 크다(딜은 감소율·상한에 막히고 HP 는 안 막힌다).
//     HP 를 깎으면 공격형이 오히려 더 약해진다(측정 확인).
//   ⚠ 생명형 HP 특화는 +0.03 까지만. +0.07 로 주면 혼자 66% 로 튄다.
const STAT_PROFILES = {
  ATTACK:  { hp: 0.400, attack: 0.350, defense: 0.110, speed: 0.140, label: '공격형' },
  DEFENSE: { hp: 0.400, attack: 0.210, defense: 0.250, speed: 0.140, label: '방어형' },
  HP:      { hp: 0.430, attack: 0.280, defense: 0.180, speed: 0.110, label: '생명형' },
  SPEED:   { hp: 0.400, attack: 0.195, defense: 0.180, speed: 0.225, label: '속도형' },
  NONE:    { hp: 0.400, attack: 0.280, defense: 0.180, speed: 0.140, label: '균형형' }
};

const MAGIC_V2_PREVIEW_EXAMPLES = [
  { code:'V2_OPENING_ATTACK', name:'선봉의 마력검', enhancementLevel:3, imageUrl:'assets/ui/magic-cards/opening-attack-768-v1500.webp', effectType:'OPENING_ATTACK', effectValue:18, triggerChance:15, maxActivations:1 },
  { code:'V2_GUARD_BARRIER', name:'성역의 수호결계', enhancementLevel:5, imageUrl:'assets/ui/magic-cards/guard-barrier-768-v1500.webp', effectType:'GUARD_BARRIER', effectValue:20, triggerChance:25, maxActivations:1 },
  { code:'V2_LIFE_AMPLIFY', name:'생명의 근원', enhancementLevel:4, imageUrl:'assets/ui/magic-cards/life-amplify-768-v1500.webp', effectType:'LIFE_AMPLIFY', effectValue:16, triggerChance:20, maxActivations:1 },
  { code:'V2_CRISIS_HEAL', name:'긴급 치유의 빛', enhancementLevel:6, imageUrl:'assets/ui/magic-cards/crisis-heal-768-v1500.webp', effectType:'CRISIS_HEAL', effectValue:28, triggerChance:30, maxActivations:2 },
  { code:'V2_FOLLOWUP_HASTE', name:'질풍의 연계', enhancementLevel:7, imageUrl:'assets/ui/magic-cards/followup-haste-768-v1500.webp', effectType:'FOLLOWUP_HASTE', effectValue:22, triggerChance:35, maxActivations:2 },
  { code:'V2_PUNISH_TRAP', name:'응징의 마법진', enhancementLevel:3, imageUrl:'assets/ui/magic-cards/punish-trap-768-v1500.webp', effectType:'PUNISH_TRAP', effectValue:14, triggerChance:15, maxActivations:2 },
  { code:'V2_ARCANE_COUNTER', name:'비전 반격', enhancementLevel:5, imageUrl:'assets/ui/magic-cards/arcane-counter-768-v1500.webp', effectType:'ARCANE_COUNTER', effectValue:16, triggerChance:25, maxActivations:2 },
  { code:'V2_ARCANE_SEAL', name:'봉인의 칙령', enhancementLevel:6, imageUrl:'assets/ui/magic-cards/arcane-seal-768-v1665.webp', effectType:'ARCANE_SEAL', effectValue:1, triggerChance:30, maxActivations:2 },
  { code:'V2_DOOM_MARK', name:'파멸의 낙인', enhancementLevel:7, imageUrl:'assets/ui/magic-cards/doom-mark-768-v1665.webp', effectType:'DOOM_MARK', effectValue:18, triggerChance:35, maxActivations:3 },
  { code:'V2_SHIELD_SIPHON', name:'강탈의 성배', enhancementLevel:4, imageUrl:'assets/ui/magic-cards/shield-siphon-768-v1665.webp', effectType:'SHIELD_SIPHON', effectValue:60, triggerChance:20, maxActivations:2 },
  { code:'V2_TIME_DISTORTION', name:'시간의 족쇄', enhancementLevel:8, imageUrl:'assets/ui/magic-cards/time-distortion-768-v1665.webp', effectType:'TIME_DISTORTION', effectValue:30, triggerChance:40, maxActivations:2 },
  { code:'V2_PHOENIX_REVIVE', name:'불사조의 계약', enhancementLevel:9, imageUrl:'assets/ui/magic-cards/phoenix-revive-768-v1665.webp', effectType:'PHOENIX_REVIVE', effectValue:22, triggerChance:50, maxActivations:1 },
  { code:'V2_PURIFY_LIGHT', name:'정화의 성광', enhancementLevel:5, imageUrl:'assets/ui/magic-cards/purify-light-768-v1665.webp', effectType:'PURIFY_LIGHT', effectValue:12, triggerChance:25, maxActivations:2 },
  { code:'V2_CHAIN_ECHO', name:'연쇄의 잔영', enhancementLevel:7, imageUrl:'assets/ui/magic-cards/chain-echo-768-v1665.webp', effectType:'CHAIN_ECHO', effectValue:45, triggerChance:35, maxActivations:2 }
];

async function magicV2PreviewExamples(env) {
  const codes = MAGIC_V2_PREVIEW_EXAMPLES.map(card => card.code);
  const placeholders = codes.map(() => '?').join(',');
  let rows = [];
  try {
    rows = (await env.DB.prepare(`SELECT id,code,name,image_url,effect_type,effect_value,max_activations FROM magic_cards WHERE code IN (${placeholders})`).bind(...codes).all()).results || [];
  } catch (error) {
    console.warn('magic V2 preview examples unavailable', error);
  }
  const byCode = new Map(rows.map(row => [String(row.code), row]));
  return MAGIC_V2_PREVIEW_EXAMPLES.map((fallback, index) => {
    const row = byCode.get(fallback.code);
    return {
      ...fallback,
      id: Number(row?.id || -(index + 1)),
      name: String(row?.name || fallback.name),
      enhancementLevel: Number(fallback.enhancementLevel||0),
      imageUrl: String(row?.image_url || fallback.imageUrl),
      effectType: String(row?.effect_type || fallback.effectType).toUpperCase(),
      effectValue: Number(row?.effect_value ?? fallback.effectValue),
      triggerChance: Number(fallback.triggerChance),
      maxActivations: Math.max(1, Number(row?.max_activations ?? fallback.maxActivations)),
      registered: Boolean(row?.id)
    };
  });
}

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
  // 기존 고유효과 공개 스위치와 무관하게, 서버 DB가 주입한 완료 전직은
  // 저장 dominant/class 조합 자체가 타입 권위다. _magic에서 클라이언트
  // uniqueAdvancement를 먼저 제거하므로 라이브 전투에서 임의 입력은 닿지 않는다.
  const advancement = card?.uniqueAdvancement || card?.unique_advancement || null;
  const advancementType = String(advancement?.dominantType || advancement?.dominant_type || '').trim().toUpperCase();
  const advancementClass = String(advancement?.classCode || advancement?.class_code || '').trim().toUpperCase();
  if (advancement?.active === true && UNIQUE_ADVANCEMENT_CLASS_BY_TYPE[advancementType] === advancementClass) return advancementType;
  const dominant = String(uniqueAbility?.dominantType || '').trim().toUpperCase();
  if (STAT_PROFILES[dominant]) return dominant;
  const raw = String(card.power_type ?? card.powerType ?? '').trim().toUpperCase();
  if (raw === 'HEALTH' || raw === 'LIFE') return 'HP';
  return STAT_PROFILES[raw] ? raw : 'NONE';
}

function uniquePercent(effect, key) {
  return clamp(effect?.[key] ?? 0, -90, key === 'speedPercent' ? 300 : 500);
}

// V1936: 같은 계열을 쌓을수록 프로필 편차를 균형형 쪽으로 감쇠시킨다.
//   능력은 별도 총량제로 막고, 스탯은 여기서 체감시킨다.
function applyTypeStacking(cards = []) {
  const curve = S1.typeStackCurve;
  if (!Array.isArray(curve) || !curve.length) return cards;
  const seen = Object.create(null);
  return cards.map(card => {
    const key = normalizeType(card, card?.uniqueAbility || null);
    if (!S1_TYPE_KEYS.includes(key)) return card;
    seen[key] = (seen[key] || 0) + 1;
    return { ...card, typeStackFactor: curve[Math.min(curve.length - 1, seen[key] - 1)] };
  });
}

export function distributeEquipment(cards = [], equipmentBonus = 0) {
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

export function buildFighter(card, index, side, uniqueAbility = null, battleMode = 'PVP') {
  const type = normalizeType(card, uniqueAbility);
  const uniqueAdvancement = normalizeUniqueAdvancement(card, type);
  const advancementModifiers = uniqueAdvancement?.modifiers || {};
  const baseProfile = STAT_PROFILES[type];
  const stackFactor = Number(card.typeStackFactor ?? 1);
  const neutral = STAT_PROFILES.NONE;
  const profile = stackFactor >= 1 ? baseProfile : {
    hp:      neutral.hp      + (baseProfile.hp      - neutral.hp)      * stackFactor,
    attack:  neutral.attack  + (baseProfile.attack  - neutral.attack)  * stackFactor,
    defense: neutral.defense + (baseProfile.defense - neutral.defense) * stackFactor,
    speed:   neutral.speed   + (baseProfile.speed   - neutral.speed)   * stackFactor,
    label:   baseProfile.label
  };
  const power = Math.max(1, Number(card.effectivePower || card.power || 1));
  const mode = String(battleMode || 'PVP').toUpperCase();
  const attackRoleMultiplier = type === 'ATTACK' ? (mode === 'PVE' ? 1.15 : 1.05) : 1;
  const defenseRoleMultiplier = type === 'DEFENSE' ? (mode === 'PVE' ? 1.15 : 1.10) : 1;
  const attackPct = uniquePercent(uniqueAbility, 'attackPercent') * attackRoleMultiplier;
  const defensePct = uniquePercent(uniqueAbility, 'defensePercent') * defenseRoleMultiplier;
  const hpPct = uniquePercent(uniqueAbility, 'hpPercent');
  const speedPct = uniquePercent(uniqueAbility, 'speedPercent');

  // V1812: 전투가 100~270턴까지 늘어져 한 판에 최대 2분 30초가 걸렸다.
  //   HP 를 양쪽 같은 비율로 낮춰 턴 수를 줄인다 (4.25 → 2.34, ×0.55).
  // V1813-fix: HP 축소는 PVE 에서만 적용한다.
  //   PVP 는 100행동에 연장전(회복 봉쇄·피해 증폭)이 걸리는 구조다. 전투가
  //   짧아지면 연장전에 도달하지 못해 상성이 뒤집힌다. 실측: 실전형 미러의
  //   연장전 발생률 98%→1%, 생명형 vs 방어형 승률 93%→56%.
  //   랭크전·영토전은 경쟁 콘텐츠라 예고 없이 상성이 바뀌면 안 된다.
  //   PVE 만 줄이면 PVP 는 승률·턴수·연장전 발생률이 전부 그대로다(편차 0%p).
  // V1902: PVP 도 짧게 한다. 단 연장전(suddenDeathAfter) 임계값을 같은 비율로
  //   옮기지 않으면 v1813 에서 확인된 대로 상성이 통째로 뒤집힌다.
  //   HP 4.25→2.6 (×0.612) 에 맞춰 연장전 100→64, 행동상한 130→83 으로 같이 내렸다.
  //   측정 결과 연장전 발생률과 매치업 승률이 전부 그대로 유지된다.
  const hpScale = mode === 'PVE' ? 2.34 : 2.6;
  const maxHp = Math.max(100, Math.round(power * profile.hp * hpScale * (1 + hpPct / 100) * (1 + Number(advancementModifiers.maxHpPercent || 0) / 100)));
  const attack = Math.max(10, Math.round(power * profile.attack * 1.05 * (1 + attackPct / 100)));
  const defense = Math.max(1, Math.round(power * profile.defense * 0.85 * (1 + defensePct / 100)));
  // V1936: 기저값을 더해 행동 빈도 격차를 압축한다(속도형 1.6배 -> 1.2배).
  const speed = Math.max(35, Math.round((70 + power * S1.speedBaseK + power * profile.speed * 0.10) * (1 + speedPct / 100)));
  const shieldFloor = mode === 'PVE' ? 0.22 : 0.18;
  const shieldCap = mode === 'PVE' ? 0.38 : 0.32;
  // V1830 호송작전은 구간 사이 카드 체력을 계승한다. 값이 없는 기존 PVE/PVP는
  // 100%로 유지되므로 전투 밸런스와 판정에는 영향이 없다.
  const startingHpPercent = clamp(card.startingHpPercent ?? card.hpPercent ?? 100, 0, 100);
  const startingHp = startingHpPercent <= 0 ? 0 : Math.max(1, Math.round(maxHp * startingHpPercent / 100));
  const startingShield = startingHp > 0 && type === 'DEFENSE' ? Math.round(maxHp * clamp(shieldFloor + Math.max(0, defensePct) / 500, shieldFloor, shieldCap)) : 0;

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
    battleMode: mode,
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
    uniqueAdvancement,
    maxHp,
    hp: startingHp,
    attack,
    defense,
    speed,
    shield: startingShield,
    maxShield: startingShield,
    // 시작 게이지 전직 보정은 경쟁전에서만 적용한다. PVE 행동 순서와 보스
    // 타임라인은 기존 게이트를 그대로 유지한다.
    gauge: Math.min(95, (type === 'SPEED' ? 30 : 0) + (mode === 'PVP' ? Number(advancementModifiers.openingGaugePoints || 0) : 0)),
    alive: startingHp > 0,
    emergencyUsed: false,
    survivalUsed: false,
    indomitableUsed: false,
    advancementLastStandUsed: false,
    huntStacks: 0,
    pvpTakedownUsed: false,
    speedUniqueSuppressed: false,
    defenseLineBreached: false,
    frontlineAnnounced: false,
    actions: 0,
    damageDealt: 0,
    healingDone: 0
  };
}

export function publicFighter(fighter) {
  const {
    emergencyUsed, survivalUsed, indomitableUsed, advancementLastStandUsed, pvpTakedownUsed, frontlineAnnounced, alive, actions, damageDealt, healingDone,
    ...card
  } = fighter;
  return card;
}

function alive(team) {
  return team.filter(card => card.alive && card.hp > 0);
}

function isBattleSuitSupport(card) {
  return card?.isBattleSuit === true || String(card?.actorKind || '').toUpperCase() === 'BATTLE_SUIT';
}

function targetableAlive(team) {
  return alive(team).filter(card => card.untargetable !== true && !isBattleSuitSupport(card));
}

function canonicalTeam(team) {
  return team.filter(card => !isBattleSuitSupport(card));
}

function targetPool(team) {
  const candidates = targetableAlive(team);
  const front = candidates.filter(card => card.row === 'FRONT');
  return front.length ? front : candidates;
}

function teamHpRatio(team) {
  const candidates = canonicalTeam(team);
  const current = candidates.reduce((sum, card) => sum + Math.max(0, card.hp) + Math.max(0, card.shield), 0);
  const maximum = candidates.reduce((sum, card) => sum + card.maxHp + card.maxShield, 0);
  return maximum > 0 ? current / maximum : 0;
}

// V1902: 전투 길이의 "천장"을 만드는 상수.
//
//   기존 피해는 전부 공격력 기반 고정값이라, 몬스터 전투력이 팀보다 높을수록
//   몬스터 HP 만 선형으로 커지고 플레이어 1타는 그대로였다. 그래서 전투 길이가
//   전투력 격차에 비례해 무한정 늘어났다(측정: 2배 보스 x 생명형 덱 = 125행동/54초).
//   HP 를 그냥 낮추면 짧은 전투까지 같이 짧아지고 보스도 같이 약해진다.
//
//   그래서 "한 대가 최소한 상대 최대체력의 N% 는 깎는다"는 비례 성분을 섞는다.
//   고정 피해가 이미 이 값보다 크면 아무 일도 일어나지 않으므로
//   빠른 전투(공격형 덱 / 약한 몬스터)는 그대로 두고 긴 전투만 잘린다.
//   1/0.016 = 62.5 → 플레이어 행동 약 63회가 전투 길이의 상한이 된다.
//
//   ⚠ 카드가 맞을 때는 적용하지 않는다(MONSTER 대상 한정).
//     PVP 와 호송작전 차량 판정은 이 하한이 걸리면 밸런스가 통째로 바뀐다.
const MONSTER_MIN_DAMAGE_PERCENT = 0.016;
// V1975: 아포칼립스 전용 — 하한 피해를 "덱 전투력 / 몬스터 기본 전투력" 에 비례시킨다.
//   측정: 하한 1.6% 가 PVE 플레이어 딜의 사실상 전부다(나이트메어 타격의 80~98%, 아포칼립스 100%).
//   그래서 아포칼립스는 덱 85만이든 800만이든 결과가 같았고(전부 0%), 승패는 연타·강제행동
//   칸에 의해서만 정해졌다. 나이트메어는 85만 덱도 전 보스 100% 승리라 "더 어렵다" 가 성립하지 않았다.
//   아포칼립스만 하한을 스케일링한다: floor = 1.6% × clamp(덱전투력/몬스터기본전투력 × gain).
//   gain 2.5 기준 전역 기본값(연타2/강제4)에서 몬스터 기본 200만 ≈ 덱 250만 필요, 잔존 HP 가
//   85만 84% → 120만 66% → 150만 50% → 200만 23% → 250만 0% 로 연속적으로 내려간다(성장 체감).
//   나이트메어·HELL·호송·공성은 isApocalypse 가 아니므로 단 1행동도 바뀌지 않는다(회귀 확인).
const APOCALYPSE_FLOOR_GAIN = 2.5;
const APOCALYPSE_FLOOR_SCALE_MIN = 0.4;
const APOCALYPSE_FLOOR_SCALE_MAX = 6;

function hitResult(actor, target, random, multiplier = 1, counter = false, options = {}) {
  const actorAdvancement = actor.uniqueAdvancement?.modifiers || {};
  const targetAdvancement = target.uniqueAdvancement?.modifiers || {};
  const dodgeCap = 0.24 + Math.max(0, Number(targetAdvancement.dodgeCapPoints || 0)) / 100;
  const dodgeChance = target.type === 'SPEED' && !target.speedUniqueSuppressed
    ? clamp(0.10 + Math.max(0, uniquePercent(target.uniqueAbility, 'speedPercent')) / 1000 + Math.max(0, Number(targetAdvancement.dodgeChancePoints || 0)) / 100, 0.10, dodgeCap)
    : 0.02;
  if (!counter && random() < dodgeChance) return { dodge: true, damage: 0, critical: false, penetration: 0 };

  const criticalChance = clamp(0.10 + (actor.type === 'ATTACK' ? 0.06 : 0) + (actor.type === 'SPEED' && !actor.speedUniqueSuppressed ? 0.03 : 0) + Math.max(0, Number(actorAdvancement.criticalChancePoints || 0)) / 100, 0.10, 0.35);
  const critical = random() < criticalChance;
  const pveAttack = actor.type === 'ATTACK' && actor.battleMode === 'PVE';
  const basePenetration = actor.type === 'ATTACK'
    ? (pveAttack && target.isBoss ? 0.40 : pveAttack && target.isMonster ? 0.28 : (random() < 0.35 ? S1.attackPenetrationPvp : 0.15))
    : 0.03;
  const penetration = clamp(basePenetration + Math.max(0, Number(actorAdvancement.penetrationPoints || 0)) / 100, 0, 0.80);
  const effectiveDefense = Math.max(0, target.defense * (1 - penetration));
  // V1936: 분모 상수 600 은 전투력 스케일에 안 맞아 1만 이상은 전원 65% 상한이었다.
  //   = 방어 스탯도 관통 수치도 실제로는 아무 일을 안 했다. 공격자 공격력 비례로 되살린다.
  // ⚠ PVP 전용이다. PVE 에 넣으면 몬스터 공격이 감소율을 뚫고 들어와
  //   승률은 100% 로 같은데 카드 생존이 보스전 3.0장 -> 1.2장으로 떨어진다(측정).
  //   PVE 는 이미 승률 100% 라 이 공식을 살릴 실익이 없고, 난이도 체감만 올라간다.
  const usePvpDamageModel = actor.battleMode !== 'PVE' && !target.isMonster && !actor.isMonster;
  const reduction = usePvpDamageModel
    ? clamp(effectiveDefense / (effectiveDefense + Math.max(1, actor.attack * S1.defenseDenomK)), 0, S1.defenseCapPercent)
    : clamp(effectiveDefense / (effectiveDefense + 600), 0, 0.65);
  const variance = 0.95 + random() * 0.10;
  const weakTarget = actor.type === 'ATTACK' && target.hp / Math.max(1, target.maxHp) <= 0.50;
  // V1936: PVP 마무리 배율 상향. 공격형의 역할을 '뚫고 마무리' 로 명확히 한다.
  const execute = weakTarget ? (actor.battleMode === 'PVE' ? 1.25 : S1.executePvpMultiplier) : 1;
  const pvpOpeningPressure = actor.type === 'ATTACK' && actor.battleMode === 'PVP' && actor.actions === 1 ? 1.12 : 1;
  const pvpShieldBreaker = actor.type === 'ATTACK' && actor.battleMode === 'PVP' && target.shield > 0 ? 1.15 : 1;
  const advancementDamage = Math.max(0.1, 1 + Number(actorAdvancement.damageDealtPercent || 0) / 100);
  const raw = actor.attack * 1.72 * Number(multiplier || 1) * variance * execute * pvpOpeningPressure * pvpShieldBreaker * (critical ? 1.50 : 1) * advancementDamage;
  // V1936: 상한 0.46 은 공격력 11만 이상에서 걸려 딜 성장을 통째로 흡수했다. PVP 만 0.60 으로 완화.
  const baseCapPct = counter ? 0.24 : (usePvpDamageModel ? S1.damageCapPercent : 0.46);
  const capPct = clamp(baseCapPct + (!counter ? Math.max(0, Number(actorAdvancement.damageCapPoints || 0)) / 100 : 0), baseCapPct, 0.90);
  const capped = Math.min(raw * (1 - reduction), target.maxHp * capPct);
  // V1902: 반격과 호송작전은 제외한다. 반격까지 올리면 카드가 훨씬 빨리 죽고,
  //        호송은 차량 피해가 별도 공식이라 전투가 짧아지면 난이도가 흔들린다.
  // V1975: 아포칼립스 몬스터는 덱 전투력 비례로 하한이 늘고 준다(위 APOCALYPSE_FLOOR_* 참고).
  const floorScale = target.isApocalypse && options.apocalypseFloorScale > 0 ? options.apocalypseFloorScale : 1;
  const minDamage = !counter && target.isMonster && options.minDamagePercent > 0
    ? target.maxHp * options.minDamagePercent * floorScale
    : 0;
  const damage = Math.max(1, Math.round(Math.max(capped, minDamage)));
  return { dodge: false, damage, critical, penetration: Number((penetration * 100).toFixed(1)), execute: execute > 1, openingPressure:pvpOpeningPressure>1, shieldBreaker:pvpShieldBreaker>1, advancementClass: actor.uniqueAdvancement?.classCode || null };
}

function applyDamage(target, incoming, options = {}) {
  // V1936: 속도형은 방벽을 벗기는 역할. 실드가 남아 있을 때만 추가로 들어간다.
  if (options.shieldBonus > 0 && target.shield > 0) {
    incoming = incoming + Math.min(target.shield, incoming * options.shieldBonus);
  }
  let remaining = Math.max(0, Number(incoming || 0));
  const shieldBefore = target.shield;
  const absorbed = options.ignoreShield ? 0 : Math.min(target.shield, remaining);
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

function healerPenaltyForTeam(team = []) {
  const healerCount = team.filter(card => card.type === 'HP').length;
  // V1936: 2장부터 60% 는 사실상 '생명형은 1장만' 이라는 강제였다. 완만하게 바꾼다.
  const reductionPercent = S1.healerDuplicatePenalty[Math.min(S1.healerDuplicatePenalty.length - 1, healerCount)] || 0;
  return { healerCount, reductionPercent, multiplier: 1 - reductionPercent / 100 };
}

function normalizeSingleHealerBonus(raw = {}) {
  return {
    enabled: raw?.enabled !== false,
    teamHpPercent: clamp(raw?.teamHpPercent ?? 8, 0, 50),
    healPercent: clamp(raw?.healPercent ?? 10, 0, 50),
    crisisThresholdPercent: clamp(raw?.crisisThresholdPercent ?? 40, 1, 99),
    crisisHealPercent: clamp(raw?.crisisHealPercent ?? 16, 0, 80),
    pvpMaxActivations: Math.round(clamp(raw?.pvpMaxActivations ?? 4, 0, 20)),
    pveMaxActivations: Math.round(clamp(raw?.pveMaxActivations ?? 6, 0, 30)),
  };
}

// V1936: 회복 총량 관리. 생명형의 회복은 무제한이었고, 그게 다른 계열이 따라올 수 없는
//   유일한 이유였다. 팀 단위 회복 풀을 만들고 모든 회복이 여기서 차감되게 한다.
let __healPool = { A: 0, B: 0 };
function spendHealPool(side, amount) {
  if (!(S1.healPoolPercent > 0)) return amount;
  const left = Math.max(0, __healPool[side] || 0);
  const used = Math.min(left, Math.max(0, amount));
  __healPool[side] = left - used;
  return used;
}

function maybeEmergencyHeal(target, timeline, clock, healMultiplier = 1) {
  if (!target.alive || target.hp <= 0 || target.type !== 'HP' || target.emergencyUsed) return;
  if (target.hp / target.maxHp > 0.30) return;
  target.emergencyUsed = true;
  const requested = Math.min(target.maxHp - target.hp, Math.max(1, Math.round(target.maxHp * S1.emergencyHealPercent * clamp(healMultiplier, 0, 1))));
  const amount = spendHealPool(target.side, requested);
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

// V1937: 부활 봉인은 "허용 횟수 99에서 차감"하는 예산이 아니라 다음 부활 시도를
// 실제로 무효화하는 봉인 스택이다. 마법 부활과 불멸자 최후 저항이 같은 스택을 쓴다.
let __reviveSeal = { A: 0, B: 0 };
function consumeReviveSeal(side) {
  const left = Math.max(0, __reviveSeal[side] || 0);
  if (left <= 0) return false;
  __reviveSeal[side] = left - 1;
  return true;
}

function resolveKnockout(target, timeline, clock, onBeforeKnockout = null) {
  if (target.hp > 0 || !target.alive) return false;
  // V1936: 방어형 불굴(무료 부활) 삭제. 방어형의 생존력은 소모되는 팀 방벽으로 옮겼다.
  if (false && target.type === 'DEFENSE' && !target.indomitableUsed) {
    target.indomitableUsed = true;
    target.hp = 1;
    const indomitableShieldRatio=target.battleMode==='PVE'?0.10:(target.defenseLineBreached?0.03:0.06);
    target.shield = Math.max(target.shield, Math.round(target.maxHp * indomitableShieldRatio));
    target.maxShield = Math.max(target.maxShield, target.shield);
    pushEvent(timeline, clock, 'INDOMITABLE', { targetId: target.id, hpAfter: target.hp, shieldAfter: target.shield, label: '방어형 · 불굴' });
    return false;
  }
  // V1936: 생명형 생존(무료 부활) 삭제. 생명형의 생존력은 회복 총량으로 옮겼다.
  if (false && target.type === 'HP' && !target.survivalUsed) {
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
  const lastStandPercent = Number(target.uniqueAdvancement?.modifiers?.lastStandHealPoolPercent || 0);
  if (target.uniqueAdvancement?.classCode === 'IMMORTAL' && !target.advancementLastStandUsed && lastStandPercent > 0) {
    target.advancementLastStandUsed = true;
    if (consumeReviveSeal(target.side)) {
      const sealedPercent = Number(target.uniqueAdvancement?.modifiers?.sealedLastStandHealPoolPercent || 0);
      const requested = Math.max(0, Math.round(target.maxHp * sealedPercent / 100));
      const amount = requested > 0 ? spendHealPool(target.side, requested) : 0;
      if (amount > 0) {
        target.hp = Math.min(target.maxHp, amount);
        target.alive = true;
        target.healingDone += amount;
        pushEvent(timeline, clock, 'ADVANCEMENT_SEALED', {
          targetId: target.id,
          classCode: 'IMMORTAL',
          amount,
          hpAfter: target.hp,
          maxHp: target.maxHp,
          revived: true,
          sealConsumed: true,
          label: '불멸자 · 봉인 저항',
        });
        return false;
      }
      pushEvent(timeline, clock, 'ADVANCEMENT_BLOCKED', {
        targetId: target.id,
        classCode: 'IMMORTAL',
        label: '불멸자 · 부활 봉인',
      });
    } else {
      const requested = Math.max(1, Math.round(target.maxHp * lastStandPercent / 100));
      const amount = spendHealPool(target.side, requested);
      if (amount > 0) {
        target.hp = Math.min(target.maxHp, amount);
        target.alive = true;
        target.healingDone += amount;
        pushEvent(timeline, clock, 'ADVANCEMENT', {
          targetId: target.id,
          classCode: 'IMMORTAL',
          amount,
          hpAfter: target.hp,
          maxHp: target.maxHp,
          revived: true,
          label: '불멸자 · 최후 저항',
        });
        return false;
      }
    }
  }
  if (typeof onBeforeKnockout === 'function' && onBeforeKnockout(target, clock) === true) return false;
  target.alive = false;
  target.hp = 0;
  target.gauge = 0;
  pushEvent(timeline, clock, 'KO', { targetId: target.id });
  return true;
}

export function simulateBattleV2Preview({ teamA = [], teamB = [], magicA = [], magicB = [], seed = 1, maxActions = 80, maxDuration = 0, suddenDeathAfter = 0, forcedMonsterEvery = 0, openingPlayerUltimateDamage = 0, openingBossUltimatePercent = 0, bossUltimateCapPercent = 100, healerPenalty = false, singleHealerBonus = {}, escortObjective = null } = {}) {
  const random = seededRandom(seed);
  const a = teamA.map(card => ({ ...card }));
  const b = teamB.map(card => ({ ...card }));
  const timeline = [];
  let clock = 0;
  let actionCount = 0;
  // V1813: 몬스터 강제 행동까지 남은 플레이어 행동 수를 센다.
  let playerStreak = 0;
  // APOCALYPSE monsters can own a real multi-attack sequence. The repeat is
  // resolved as additional authoritative turns so shields, counters, KO and
  // the V3 timeline all observe the same outcome.
  let repeatMonsterId = '';
  let repeatMonsterActions = 0;
  const escortMode=Boolean(escortObjective&&typeof escortObjective==='object');
  const escortTarget={
    id:String(escortObjective?.id||'ESCORT_OBJECTIVE'),
    name:String(escortObjective?.name||'장갑 수송차')
  };
  let escortStrikeCount=0;
  const pushEscortStrike=(actor,eventClock,forced=false)=>{
    if(!actor)return;
    escortStrikeCount+=1;
    pushEvent(timeline,eventClock,'ESCORT_OBJECTIVE_ATTACK',{
      actorId:actor.id,
      actorSide:actor.side,
      targetId:escortTarget.id,
      targetSide:'OBJECTIVE',
      targetName:escortTarget.name,
      damage:0,
      strikeIndex:escortStrikeCount,
      forced:Boolean(forced),
      ignoreInitiative:Boolean(forced),
      label:forced?'호송차 선제 타격':'호송차 집중 공격'
    });
  };
  const magicByFighter=new Map();
  const registerMagic=(team,cards)=>{
    for(const magic of (Array.isArray(cards)?cards:[])){
      const fighter=team[Math.max(0,Number(magic.slotNo||1)-1)];if(!fighter)continue;
      const state={...magic,activations:0},value=Math.max(0,Number(magic.effectValue||0));magicByFighter.set(fighter.id,state);
      if(['OPENING_ATTACK','LIFE_AMPLIFY','GUARD_BARRIER'].includes(state.effectType)&&state.maxActivations>0&&random()*100<Number(state.triggerChance||0)){
        if(state.effectType==='OPENING_ATTACK')fighter.attack=Math.max(1,Math.round(fighter.attack*(1+value/100)));
        if(state.effectType==='LIFE_AMPLIFY'){const gain=Math.max(1,Math.round(fighter.maxHp*value/100));fighter.maxHp+=gain;fighter.hp+=gain;}
        if(state.effectType==='GUARD_BARRIER'){const gain=Math.max(1,Math.round(fighter.maxHp*value/100));fighter.shield+=gain;fighter.maxShield+=gain;}
        state.activations=1;pushEvent(timeline,clock,'MAGIC_CARD',{actorId:fighter.id,targetId:fighter.id,magicCardId:state.id,magicCode:state.code,magicName:state.name,magicImageUrl:state.imageUrl,magicEnhancementLevel:state.enhancementLevel,effectType:state.effectType,value,activation:1,maxActivations:state.maxActivations,label:state.name});
      }
    }
  };
  registerMagic(a,magicA);registerMagic(b,magicB);
  const activateMagic=(fighter,effectType)=>{
    const state=magicByFighter.get(fighter?.id);
    if(!state||state.effectType!==effectType||state.activations>=state.maxActivations)return null;
    if(Number(fighter.magicSealCharges||0)>0&&effectType!=='PURIFY_LIGHT'){
      fighter.magicSealCharges=Math.max(0,Number(fighter.magicSealCharges||0)-1);
      pushEvent(timeline,clock+0.00001,'MAGIC_SEAL_BLOCK',{actorId:fighter.magicSealSourceId||'',targetId:fighter.id,magicCardId:state.id,magicCode:state.code,magicName:state.name,effectType:state.effectType,label:'봉인의 칙령 · 발동 봉인'});
      if(fighter.magicSealCharges<=0)fighter.magicSealSourceId='';
      return null;
    }
    if(random()*100>=state.triggerChance)return null;
    state.activations+=1;
    return state;
  };
  const magicEvent=(magic,actor,target,extra={})=>({actorId:actor.id,targetId:target.id,magicCardId:magic.id,magicCode:magic.code,magicName:magic.name,magicImageUrl:magic.imageUrl,magicEnhancementLevel:magic.enhancementLevel,effectType:magic.effectType,value:magic.effectValue,activation:magic.activations,maxActivations:magic.maxActivations,label:magic.name,...extra});
  const reviveFromMagic=(target,eventClock)=>{
    const magic=activateMagic(target,'PHOENIX_REVIVE');
    if(!magic)return false;
    if(consumeReviveSeal(target.side)){
      pushEvent(timeline,eventClock+0.000001,'REVIVE_SEALED',magicEvent(magic,target,target,{blocked:true,label:'공격형 · 부활 봉인'}));
      return false;
    }
    const amount=Math.max(1,Math.round(target.maxHp*Math.min(100,Number(magic.effectValue||0))/100));
    target.hp=Math.min(target.maxHp,amount);target.alive=true;
    pushEvent(timeline,eventClock+0.000001,'MAGIC_CARD',magicEvent(magic,target,target,{amount,hpAfter:target.hp,maxHp:target.maxHp,revived:true}));
    return true;
  };
  const suppressSpeedUnique=(guardTeam,targetTeam)=>{
    if(guardTeam.filter(card=>card.type==='DEFENSE').length<2)return;
    for(const fighter of targetTeam.filter(card=>card.type==='SPEED')){
      const speedPercent=Math.max(-90,Number(fighter.uniqueAbility?.speedPercent||0));
      fighter.speed=Math.max(35,Math.round(fighter.speed/Math.max(0.1,1+speedPercent/100)));
      fighter.gauge=0;fighter.speedUniqueSuppressed=true;
      pushEvent(timeline,clock,'SPEED_UNIQUE_SUPPRESSED',{targetId:fighter.id,guardSide:guardTeam[0]?.side||'',label:'방어형 연계 · 속도 봉쇄'});
    }
  };
  suppressSpeedUnique(a,b);suppressSpeedUnique(b,a);
  // V1936: 전투 시작 셋업 — 유한 자원들을 여기서 한 번에 배분한다.
  const isPveBattle = [...a, ...b].some(card => card.isMonster);
  // 전직 기능이 OFF인 기존 전투는 V1936 결과를 그대로 보존한다. 실제 전직 카드가
  // 한 장이라도 있을 때만 새 부활 봉인 소비 규칙을 활성화한다.
  const advancementBattleActive = [...a, ...b].some(card => Boolean(card.uniqueAdvancement));
  __healPool = { A: 0, B: 0 };
  __reviveSeal = { A: 0, B: 0 };
  for (const [team, side] of [[a, 'A'], [b, 'B']]) {
    const members = canonicalTeam(team);
    // 회복 총량 = 생명형 최대HP x healPoolPercent (장수 체감)
    const healers = members.filter(card => card.type === 'HP');
    if (S1.healPoolPercent > 0 && healers.length) {
      let pool = 0;
      healers.forEach((h, i) => {
        pool += h.maxHp * S1.healPoolPercent * (S1.healPoolCurve[Math.min(S1.healPoolCurve.length - 1, i)] || 0);
        pool += h.maxHp * Math.max(0, Number(h.uniqueAdvancement?.modifiers?.healPoolBonusPercent || 0)) / 100;
      });
      __healPool[side] = Math.round(pool * (isPveBattle ? S1.pveHealPoolScale : 1));
    }
    // 공격형은 상대 팀 부활 예산을 미리 깎는다. 불멸자는 이 스택을 소비하면
    // 완전 부활 대신 서버 설정만큼 축소된 `ADVANCEMENT_SEALED` 생존을 시도한다.
    const attackers = members.filter(card => card.type === 'ATTACK').length;
    if (advancementBattleActive && attackers > 0 && S1.attackSealRevive > 0) {
      const foe = side === 'A' ? 'B' : 'A';
      __reviveSeal[foe] = Math.min(9, __reviveSeal[foe] + S1.attackSealRevive * attackers);
    }
  }
  // 방어형: 팀 방벽. 무료 부활 대신 소모되는 자원으로 생존력을 준다.
  if (S1.guardShieldPercent > 0) {
    for (const team of [a, b]) {
      const members = canonicalTeam(team);
      const guards = members.filter(card => card.type === 'DEFENSE');
      if (!guards.length) continue;
      let pool = 0;
      guards.forEach((g, i) => { pool += g.maxHp * S1.guardShieldPercent * (S1.guardShieldCurve[Math.min(S1.guardShieldCurve.length - 1, i)] || 0); });
      const share = Math.round(pool * (isPveBattle ? S1.pveShieldScale : 1) / Math.max(1, members.length));
      for (const card of members) { card.shield += share; card.maxShield += share; }
      pushEvent(timeline, clock, 'GUARD_PROTECT', { side: guards[0].side, amount: share, guards: guards.length, label: '수호형 · 방벽 전개' });
    }
  }
  // 편성 다양성 보너스: 계열 종류 수에 따라 팀 전체 강화. 몰빵보다 섞는 쪽이 유리해진다.
  if (Array.isArray(S1.varietyBonus)) {
    for (const team of [a, b]) {
      const members = canonicalTeam(team);
      const kinds = new Set(members.filter(card => S1_TYPE_KEYS.includes(card.type)).map(card => card.type)).size;
      const bonus = S1.varietyBonus[Math.min(S1.varietyBonus.length - 1, kinds)] || 0;
      if (bonus <= 0) continue;
      for (const card of members) {
        card.attack = Math.round(card.attack * (1 + bonus));
        const add = Math.round(card.maxHp * bonus);
        card.maxHp += add; card.hp += add;
      }
      pushEvent(timeline, clock, 'DEPLOY', { side: team[0]?.side, typeVariety: kinds, bonusPercent: Math.round(bonus * 100), label: `편성 다양성 ${kinds}계열 · +${Math.round(bonus * 100)}%` });
    }
  }
  const healerRules = healerPenalty ? { A: healerPenaltyForTeam(a), B: healerPenaltyForTeam(b) } : { A: { healerCount: 0, reductionPercent: 0, multiplier: 1 }, B: { healerCount: 0, reductionPercent: 0, multiplier: 1 } };
  for (const fighter of a) fighter.teamHealerCount = healerRules.A.healerCount;
  for (const fighter of b) fighter.teamHealerCount = healerRules.B.healerCount;
  const singleHealer = normalizeSingleHealerBonus(singleHealerBonus);
  if (singleHealer.enabled) {
    for (const team of [a, b]) {
      const members = canonicalTeam(team);
      const healers = members.filter((card) => card.type === 'HP');
      // V1936: 1장에서만 켜지던 절벽을 장수 비례 곡선으로 바꾼다.
      //   이 절벽이 '생명형은 정확히 1장' 이라는 편성 강제의 핵심이었다.
      const healerScale = healers.length ? (S1.singleHealerCurve[Math.min(S1.singleHealerCurve.length - 1, healers.length - 1)] || 0) : 0;
      if (!healers.length || healerScale <= 0) continue;
      const healer = healers[0];
      healer.singleHealerActive = true;
      healer.singleHealerUses = 0;
      healer.singleHealerMaxUses = healer.battleMode === 'PVE'
        ? singleHealer.pveMaxActivations
        : singleHealer.pvpMaxActivations;
      const targets = [];
      for (const target of members) {
        const amount = Math.max(0, Math.round(target.maxHp * singleHealer.teamHpPercent * healerScale / 100));
        target.maxHp += amount;
        target.hp += amount;
        targets.push({ targetId: target.id, amount, hpAfter: target.hp, maxHp: target.maxHp });
      }
      pushEvent(timeline, clock, 'SINGLE_HEALER_AURA', {
        actorId: healer.id,
        side: healer.side,
        teamHpPercent: singleHealer.teamHpPercent,
        targets,
        label: '단일 힐러 · 생명 연결',
      });
    }
  }

  for (const team of [a,b]) {
    // V1936: 방어형 아군 보호는 팀 방벽으로 대체했다(공짜 이득 -> 소모 자원).
    const guards=[];
    const protectedIds=new Set();
    for (const guard of guards) {
      const target=[...team].filter(card=>card.id!==guard.id&&!protectedIds.has(card.id)).sort((x,y)=>x.maxHp-y.maxHp||x.slot-y.slot)[0];
      if(!target)continue;
      protectedIds.add(target.id);
      const ratio=guard.battleMode==='PVE'?0.12:0.08;
      const amount=Math.max(1,Math.round(target.maxHp*ratio));
      target.shield+=amount;target.maxShield+=amount;
      pushEvent(timeline,clock,'GUARD_PROTECT',{actorId:guard.id,targetId:target.id,amount,shieldAfter:target.shield,label:'방어형 · 수호 전환'});
    }
  }
  const breachDefenseLine=(attackTeam,targetTeam)=>{
    const attackers=canonicalTeam(attackTeam),targets=canonicalTeam(targetTeam);
    if(attackers.filter(card=>card.type==='ATTACK').length<2)return;
    const defenseCount=targets.filter(card=>card.type==='DEFENSE').length;
    if(defenseCount<1)return;
    for(const fighter of targets){
      fighter.defenseLineBreached=true;
      fighter.shield=Math.max(0,Math.round(fighter.shield*0.55));
      fighter.maxShield=Math.max(fighter.shield,Math.round(fighter.maxShield*0.55));
    }
    pushEvent(timeline,clock,'DEFENSE_LINE_BREACHED',{actorSide:attackers[0]?.side||'',targetSide:targets[0]?.side||'',defenseCount,shieldReductionPercent:45,label:'공격형 연계 · 공성 돌파'});
  };
  breachDefenseLine(a,b);breachDefenseLine(b,a);

  for (const fighter of [...a, ...b]) {
    // Battle Suit cadence is an independent wall-clock lane. It must not roll,
    // fill, drain or consume the canonical card/monster speed gauge.
    fighter.gauge = isBattleSuitSupport(fighter)
      ? 0
      : clamp(Number(fighter.gauge || 0) + random() * 8, 0, 99);
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

  // Escort combat has one guaranteed hostile strike before any speed gauge,
  // action-power or turn-order calculation. Every later monster turn uses the
  // same objective route, so cards are never selected while the carrier lives.
  if(escortMode){
    const openingMonster=alive(b).find(card=>card.isMonster)||alive(b)[0];
    if(openingMonster)pushEscortStrike(openingMonster,clock+0.00005,true);
  }

  const openingUltimate = Math.max(0, Math.round(Number(openingPlayerUltimateDamage || 0)));
  if (openingUltimate > 0 && alive(b).length) {
    const target = alive(b)[0];
    const damageState = applyDamage(target, openingUltimate);
    pushEvent(timeline, clock + 0.0001, 'PVE_ULTIMATE', {
      targetId: target.id,
      damage: damageState.hpDamage,
      absorbed: damageState.absorbed,
      targetHpAfter: target.hp,
      targetMaxHp: target.maxHp,
      targetShieldAfter: target.shield
    });
    resolveKnockout(target, timeline, clock + 0.0002, reviveFromMagic);
  }

  const bossOpeningCap = clamp(bossUltimateCapPercent, 100, 500);
  const bossOpeningPercent = clamp(openingBossUltimatePercent, 0, bossOpeningCap);
  if (!escortMode && bossOpeningPercent > 0 && targetableAlive(a).length && targetableAlive(b).length) {
    const hits = [];
    const damagedTargets = [...targetableAlive(a)];
    for (const target of damagedTargets) {
      // PVE character equipment/vehicle/title power is distributed into each
      // fighter. A max-HP percentage hit must not grow by the same amount or
      // that support power provides zero survivability against boss ultimates.
      const basePower = Math.max(1, Number(target.basePower || target.power || 1));
      const effectivePower = Math.max(basePower, Number(target.power || basePower));
      // V1902: 상한이 90% 라 장비·탈것·칭호를 쌓은 유저에게는 궁극기가 사실상 사라졌다.
      //   (측정: 설정 15% → 장비 없음 덱 체력 10.4% / 지원비중 90% 유저 1.0%)
      //   지원 전투력이 생존력을 주는 설계 의도는 유지하되, 상한을 40% 로 낮춰
      //   아무리 장비를 껴도 설정값의 60% 는 들어가게 한다.
      const supportMitigationPercent = clamp((effectivePower - basePower) / effectivePower * 100, 0, 40);
      const effectiveDamagePercent = bossOpeningPercent * (1 - supportMitigationPercent / 100);
      const amount = Math.max(1, Math.round(target.maxHp * effectiveDamagePercent / 100));
      // V1902: 방어형은 최대체력의 22~38% 짜리 실드를 들고 시작하는데 applyDamage 가
      //   실드부터 깎으므로, 15% 궁극기가 실드에 100% 흡수돼 방어형 덱은 어떤 보스
      //   궁극기도 체력이 1도 안 닳았다(측정: 방어5 덱 피해 0.0%).
      //   궁극기는 실드를 관통한다.
      const damageState = applyDamage(target, amount, { ignoreShield: true });
      hits.push({
        targetId: target.id,
        damage: damageState.hpDamage,
        absorbed: damageState.absorbed,
        configuredDamagePercent: bossOpeningPercent,
        effectiveDamagePercent: Number(effectiveDamagePercent.toFixed(3)),
        supportMitigationPercent: Number(supportMitigationPercent.toFixed(3)),
        targetHpAfter: target.hp,
        targetMaxHp: target.maxHp,
        targetShieldAfter: target.shield
      });
    }
    pushEvent(timeline, clock + 0.0003, 'BOSS_ULTIMATE', { damagePercent: bossOpeningPercent, hits });
    for (const target of damagedTargets) resolveKnockout(target, timeline, clock + 0.0004, reviveFromMagic);
    maybeFrontlineBreak(a, 'A', timeline, clock + 0.0005);
  }

  // V1902: 호송작전은 차량 피해가 별도 공식이라 전투 길이가 바뀌면 난이도가 흔들린다.
  //   호송에서는 하한을 끈다.
  const hitOptions = { minDamagePercent: escortMode ? 0 : MONSTER_MIN_DAMAGE_PERCENT };
  // V1975: 아포칼립스는 덱 전투력(카드+장비 배분분, 배틀슈트 제외) / 몬스터 기본 전투력 로 하한을 스케일링.
  {
    const apocalypseMonster = b.find(card => card.isMonster && card.isApocalypse);
    if (apocalypseMonster) {
      const teamPower = canonicalTeam(a).reduce((sum, card) => sum + Math.max(0, Number(card.power || 0)), 0);
      const monsterPower = Math.max(1, Number(apocalypseMonster.power || 1));
      hitOptions.apocalypseFloorScale = clamp(teamPower / monsterPower * APOCALYPSE_FLOOR_GAIN, APOCALYPSE_FLOOR_SCALE_MIN, APOCALYPSE_FLOOR_SCALE_MAX);
    }
  }

  const durationLimit = Math.max(0, Number(maxDuration || 0));
  let durationStopped = false;
  const independentSupports=[...a,...b].filter(isBattleSuitSupport);
  const independentNextFireAt=new Map(independentSupports.map(support=>[
    support.id,
    Math.max(.02,Number(support.independentOpeningDelaySeconds||support.independentFireIntervalSeconds*.35||.12))
  ]));
  while (targetableAlive(a).length && targetableAlive(b).length && actionCount < maxActions && (!durationLimit || clock < durationLimit)) {
    const actors = [...alive(a), ...alive(b)].filter(card=>!isBattleSuitSupport(card));
    if(!actors.length)break;
    const gaugeDt = Math.min(...actors.map(card => (100 - card.gauge) / Math.max(1, card.speed)));
    const gaugeReadyAt=clock+Math.max(.001,gaugeDt);
    const eligibleSupports=independentSupports
      .filter(support=>support.alive&&support.hp>0&&targetableAlive(support.side==='A'?b:a).length)
      .sort((left,right)=>(independentNextFireAt.get(left.id)??Infinity)-(independentNextFireAt.get(right.id)??Infinity)||left.slot-right.slot);
    const independentActor=eligibleSupports[0]||null;
    const independentReadyAt=independentActor?(independentNextFireAt.get(independentActor.id)??Infinity):Infinity;
    const independentAction=Boolean(independentActor&&independentReadyAt<=gaugeReadyAt);
    const nextActionAt=independentAction?independentReadyAt:gaugeReadyAt;
    if (durationLimit && nextActionAt > durationLimit) { durationStopped = true; break; }
    const dt=Math.max(.001,nextActionAt-clock);
    clock+=dt;
    for (const card of actors) card.gauge = clamp(card.gauge + card.speed * dt, 0, 130);
    const ready = actors.filter(card => card.gauge >= 99.999).sort((x, y) => y.gauge - x.gauge || y.speed - x.speed || x.slot - y.slot);
    // V1813: 플레이어 속도는 전투력 비례로 자라는데(70+전투력×0.10) 몬스터는 92 고정이다.
    //   그래서 고전투력 구간에서 몬스터가 순서를 거의 못 받는다 (실측 231턴 중 0~5회).
    //   보스가 샌드백처럼 맞고만 있는 원인이라, 게이지와 무관하게
    //   "플레이어가 N번 움직이면 몬스터가 한 번" 을 보장한다.
    //   ⚠ 몬스터 행동이 늘어난 만큼 1회 피해는 낮춰 뒀다 (buildMonsterFighter 참고).
    let actor = independentAction?independentActor:ready[0];
    if(!actor)continue;
    if(independentAction){
      independentNextFireAt.set(actor.id,clock+Math.max(.08,Number(actor.independentFireIntervalSeconds||.5)));
    }
    let repeatedMonsterAction = false;
    if (!independentAction && repeatMonsterActions > 0) {
      const repeating = alive(b).find(card => card.isMonster && String(card.id) === repeatMonsterId);
      if (repeating) {
        actor = repeating;
        actor.gauge = 100;
        repeatMonsterActions -= 1;
        repeatedMonsterAction = true;
      } else {
        repeatMonsterId = '';
        repeatMonsterActions = 0;
      }
    }
    if (!independentAction && !repeatedMonsterAction && forcedMonsterEvery > 0) {
      if (actor.side === 'A') {
        playerStreak += 1;
        if (playerStreak >= forcedMonsterEvery) {
          const waiting = alive(b).filter(card => card.isMonster);
          if (waiting.length) {
            actor = waiting.sort((x, y) => y.gauge - x.gauge || x.slot - y.slot)[0];
            actor.gauge = 100;
          }
        }
      }
    }
    if (actor.isMonster) {
      playerStreak = 0;
      if (!repeatedMonsterAction) {
        const attackCount = Math.max(1, Math.min(5, Math.floor(Number(actor.attackCount || 1))));
        repeatMonsterId = String(actor.id);
        repeatMonsterActions = attackCount - 1;
        if (repeatMonsterActions > 0) pushEvent(timeline, clock, 'MONSTER_MULTI_ATTACK_READY', { actorId: actor.id, attackCount, label: `몬스터 ${attackCount}연속 공격` });
      }
    }
    if(!independentAction)actor.gauge = Math.max(0, actor.gauge - 100);
    actor.actions += 1;
    if(!independentAction)actionCount += 1;
    const suddenDeath=Number(suddenDeathAfter||0)>0&&actionCount>Number(suddenDeathAfter||0);
    if(suddenDeath&&actionCount===Number(suddenDeathAfter||0)+1){
      pushEvent(timeline,clock,'SUDDEN_DEATH',{action:actionCount,label:'연장전 · 회복 봉쇄 · 공격 증폭'});
    }

    // V1936: 연장전에서 회복이 완전히 끊겨 생명형은 '연장전 진입 = 패배' 였다. 절반은 남긴다.
    //   대신 회복은 팀 총량에서 차감되므로 무한히 버틸 수는 없다.
    if (actor.type === 'HP' && actor.hp < actor.maxHp) {
      const sdScale = suddenDeath ? S1.regenSuddenDeathScale : 1;
      const requested = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.round(actor.maxHp * S1.regenPercent * sdScale * healerRules[actor.side].multiplier)));
      const amount = spendHealPool(actor.side, requested);
      if (amount > 0) {
      actor.hp += amount;
      actor.healingDone += amount;
      pushEvent(timeline, clock, 'REGEN', { targetId: actor.id, amount, hpAfter: actor.hp, maxHp: actor.maxHp, label: '생명형 · 지속 회복' });
      }
    }

    if (!suddenDeath && actor.singleHealerActive && actor.singleHealerUses < actor.singleHealerMaxUses) {
      const allyTeam = actor.side === 'A' ? a : b;
      const target = alive(allyTeam)
        .filter((card) => card.hp < card.maxHp)
        .sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp || x.slot - y.slot)[0];
      if (target) {
        const crisis = target.hp / Math.max(1, target.maxHp) <= singleHealer.crisisThresholdPercent / 100;
        const percent = crisis ? singleHealer.crisisHealPercent : singleHealer.healPercent;
        const amount = Math.min(target.maxHp - target.hp, Math.max(1, Math.round(target.maxHp * percent / 100)));
        target.hp += amount;
        actor.healingDone += amount;
        actor.singleHealerUses += 1;
        pushEvent(timeline, clock, 'TEAM_HEAL', {
          actorId: actor.id,
          targetId: target.id,
          amount,
          hpAfter: target.hp,
          maxHp: target.maxHp,
          crisis,
          activation: actor.singleHealerUses,
          maxActivations: actor.singleHealerMaxUses,
          label: crisis ? '생명 연결 · 위기 회복' : '생명 연결 · 아군 회복',
        });
      }
    }

    // In escort mode the carrier is the authoritative hostile target. This
    // branch intentionally runs before card target selection and dodge checks.
    // Natural monster turns may add more strikes, but the opening forced strike
    // above guarantees at least one attack even when speed/action gauges never
    // give the monster a normal turn.
    if(escortMode&&actor.isMonster){
      pushEscortStrike(actor,clock,false);
      continue;
    }

    const enemyTeam = actor.side === 'A' ? b : a;
    const pool = targetPool(enemyTeam);
    if (!pool.length) break;
    const tauntGuard=actor.isMonster?pool.find(card=>card.type==='DEFENSE'&&random()<0.70):null;
    const target = tauntGuard||lowestRatioTarget(pool, random);
    const hit = hitResult(actor, target, random, 1, false, hitOptions);
    if(suddenDeath){
      hit.dodge=false;
      const overtimeStep=Math.max(1,actionCount-Number(suddenDeathAfter||0));
      const minimumPercent=Math.min(.9,.55+overtimeStep*.012);
      hit.damage=Math.max(Number(hit.damage||0),Math.round(target.maxHp*minimumPercent+Math.max(0,target.shield)));
      hit.suddenDeath=true;
    }

    if (hit.dodge) {
      pushEvent(timeline, clock, 'TURN', {
        actorId: actor.id,
        actorKind: actor.actorKind || undefined,
        damageSource: actor.damageSource || undefined,
        actionClock: isBattleSuitSupport(actor)?'INDEPENDENT_TIME_CADENCE':'SPEED_GAUGE',
        targetId: target.id,
        dodge: true,
        actorGaugeAfter: actor.gauge,
        targetGaugeAfter: target.gauge,
        advancementClass: target.uniqueAdvancement?.classCode || null,
        label: '속도형 · 회피'
      });
      continue;
    }

    const damageState = applyDamage(target, hit.damage, { shieldBonus: actor.type === 'SPEED' ? S1.speedShieldBonus : 0 });
    actor.damageDealt += damageState.hpDamage + damageState.absorbed;

    if (actor.type === 'SPEED' && !actor.speedUniqueSuppressed) {
      target.gauge = Math.max(0, target.gauge - 18);
      if (random() < 0.28) actor.gauge = Math.min(95, actor.gauge + 35);
    }

    pushEvent(timeline, clock, 'TURN', {
      actorId: actor.id,
      actorKind: actor.actorKind || undefined,
      damageSource: actor.damageSource || undefined,
      actionClock: isBattleSuitSupport(actor)?'INDEPENDENT_TIME_CADENCE':'SPEED_GAUGE',
      targetId: target.id,
      damage: damageState.hpDamage,
      absorbed: damageState.absorbed,
      critical: hit.critical,
      penetration: hit.penetration,
      execute: hit.execute === true,
      openingPressure: hit.openingPressure === true,
      shieldBreaker: hit.shieldBreaker === true,
      advancementClass: hit.advancementClass,
      suddenDeath: hit.suddenDeath === true,
      targetHpAfter: target.hp,
      targetMaxHp: target.maxHp,
      targetShieldAfter: target.shield,
      actorGaugeAfter: actor.gauge,
      targetGaugeAfter: target.gauge
    });

    if(target.hp>0){
      const seal=activateMagic(actor,'ARCANE_SEAL');
      if(seal){target.magicSealCharges=Math.max(1,Math.round(Number(seal.effectValue||1)));target.magicSealSourceId=actor.id;pushEvent(timeline,clock+0.00005,'MAGIC_CARD',magicEvent(seal,actor,target,{sealCharges:target.magicSealCharges,targetHpAfter:target.hp,targetShieldAfter:target.shield}));}

      const mark=activateMagic(actor,'DOOM_MARK');
      if(mark){
        target.doomMarks=Math.min(3,Number(target.doomMarks||0)+1);
        let markDamage=0,markAbsorbed=0,detonated=false;
        if(target.doomMarks>=3){const markState=applyDamage(target,Math.max(1,Math.round(target.maxHp*Math.min(100,Number(mark.effectValue||0))/100)));markDamage=markState.hpDamage;markAbsorbed=markState.absorbed;target.doomMarks=0;detonated=true;actor.damageDealt+=markDamage+markAbsorbed;}
        pushEvent(timeline,clock+0.00006,'MAGIC_CARD',magicEvent(mark,actor,target,{markStacks:target.doomMarks,detonated,damage:markDamage,absorbed:markAbsorbed,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield}));
      }

      if(target.hp>0&&target.shield>0){const siphon=activateMagic(actor,'SHIELD_SIPHON');if(siphon){const amount=Math.max(1,Math.min(target.shield,Math.round(target.shield*Math.min(100,Number(siphon.effectValue||0))/100)));target.shield-=amount;actor.shield+=amount;actor.maxShield=Math.max(actor.maxShield,actor.shield);pushEvent(timeline,clock+0.00007,'MAGIC_CARD',magicEvent(siphon,actor,target,{shieldStolen:amount,targetShieldAfter:target.shield,actorShieldAfter:actor.shield,targetHpAfter:target.hp}));}}

      const distort=target.hp>0?activateMagic(actor,'TIME_DISTORTION'):null;
      if(distort){const amount=Math.min(95,Math.max(0,Number(distort.effectValue||0))),before=target.gauge;target.gauge=Math.max(0,target.gauge-amount);target.timeDistortionStacks=Math.min(3,Number(target.timeDistortionStacks||0)+1);pushEvent(timeline,clock+0.00008,'MAGIC_CARD',magicEvent(distort,actor,target,{gaugeLoss:before-target.gauge,gaugeAfter:target.gauge,targetHpAfter:target.hp}));}

      const echo=target.hp>0?activateMagic(actor,'CHAIN_ECHO'):null;
      if(echo){const baseDamage=damageState.hpDamage+damageState.absorbed,echoState=applyDamage(target,Math.max(1,Math.round(baseDamage*Math.min(200,Number(echo.effectValue||0))/100)));actor.damageDealt+=echoState.hpDamage+echoState.absorbed;pushEvent(timeline,clock+0.00009,'MAGIC_CARD',magicEvent(echo,actor,target,{damage:echoState.hpDamage,absorbed:echoState.absorbed,echoDamage:echoState.hpDamage+echoState.absorbed,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield}));}

      if(target.hp>0&&(Number(target.magicSealCharges||0)>0||Number(target.doomMarks||0)>0||Number(target.timeDistortionStacks||0)>0)){
        const purify=activateMagic(target,'PURIFY_LIGHT');
        if(purify){const cleared={seal:Number(target.magicSealCharges||0),marks:Number(target.doomMarks||0),distortion:Number(target.timeDistortionStacks||0)};target.magicSealCharges=0;target.magicSealSourceId='';target.doomMarks=0;target.timeDistortionStacks=0;const amount=Math.min(target.maxHp-target.hp,Math.max(1,Math.round(target.maxHp*Math.min(100,Number(purify.effectValue||0))/100)));target.hp+=amount;target.healingDone+=amount;pushEvent(timeline,clock+0.000095,'MAGIC_CARD',magicEvent(purify,target,target,{amount,cleared,hpAfter:target.hp,maxHp:target.maxHp}));}
      }
    }

    const haste=activateMagic(actor,'FOLLOWUP_HASTE');
    if(haste){const gain=clamp(Number(haste.effectValue||0),0,95);actor.gauge=Math.min(95,actor.gauge+gain);pushEvent(timeline,clock+0.0001,'MAGIC_CARD',{actorId:actor.id,targetId:actor.id,magicCardId:haste.id,magicCode:haste.code,magicName:haste.name,magicImageUrl:haste.imageUrl,magicEnhancementLevel:haste.enhancementLevel,effectType:haste.effectType,value:gain,gaugeAfter:actor.gauge,activation:haste.activations,maxActivations:haste.maxActivations,label:haste.name});}
    const capHasteRetaliation=(amount)=>{
      const requested=Math.max(0,Number(amount||0));
      if(!haste)return {amount:requested,prevented:0};
      const nonlethalCap=Math.max(0,Number(actor.shield||0)+Math.max(0,Number(actor.hp||0)-1));
      const applied=Math.min(requested,nonlethalCap);
      return {amount:applied,prevented:Math.max(0,requested-applied)};
    };
    const retaliate=(owner,effectType,offset,fromAttack=false)=>{if(!actor.alive||!owner.alive||owner.hp<=0)return;const magic=activateMagic(owner,effectType);if(!magic)return;const requested=Math.max(1,Math.round((fromAttack?owner.attack:owner.maxHp)*Math.min(fromAttack?500:100,Number(magic.effectValue||0))/100)),guard=capHasteRetaliation(requested);const state=applyDamage(actor,guard.amount);pushEvent(timeline,clock+offset,'MAGIC_CARD',magicEvent(magic,owner,actor,{damage:state.hpDamage,absorbed:state.absorbed,targetHpAfter:actor.hp,targetMaxHp:actor.maxHp,targetShieldAfter:actor.shield,hasteRetaliationGuard:Boolean(haste),preventedDamage:guard.prevented}));resolveKnockout(actor,timeline,clock+offset+0.00001,reviveFromMagic);};
    retaliate(target,'PUNISH_TRAP',0.0002,false);retaliate(target,'ARCANE_COUNTER',0.0003,true);

    const knockedOut = resolveKnockout(target, timeline, clock, reviveFromMagic);
    if(actor.type==='ATTACK'&&actor.battleMode==='PVE'&&actor.actions>1&&actor.huntStacks<3){
      actor.huntStacks+=1;actor.attack=Math.max(1,Math.round(actor.attack*1.06));
      pushEvent(timeline,clock+0.0005,'HUNT_ACCELERATION',{actorId:actor.id,stacks:actor.huntStacks,attackAfter:actor.attack,label:'공격형 · 사냥 가속'});
    }
    // V1936: 속도형 추격 / 공격형 연쇄 처치. 둘 다 처치 시 게이지를 회복해 재행동을 앞당긴다.
    if(knockedOut&&actor.type==='SPEED'&&S1.speedChaseGauge>0&&(actor.speedChaseUses||0)<S1.speedChaseUses){
      actor.speedChaseUses=(actor.speedChaseUses||0)+1;
      actor.gauge=Math.min(95,actor.gauge+S1.speedChaseGauge);
      pushEvent(timeline,clock+0.0007,'HUNT_ACCELERATION',{actorId:actor.id,gaugeAfter:actor.gauge,label:'속도형 · 추격'});
    }
    if(knockedOut&&actor.type==='ATTACK'&&S1.attackChainGauge>0&&(actor.attackChainUses||0)<S1.attackChainUses){
      actor.attackChainUses=(actor.attackChainUses||0)+1;
      actor.gauge=Math.min(95,actor.gauge+S1.attackChainGauge);
      pushEvent(timeline,clock+0.0008,'HUNT_ACCELERATION',{actorId:actor.id,gaugeAfter:actor.gauge,chain:actor.attackChainUses,label:'공격형 · 연쇄 처치'});
    }
    if(knockedOut&&actor.type==='ATTACK'&&actor.battleMode==='PVP'&&!actor.pvpTakedownUsed){
      actor.pvpTakedownUsed=true;actor.gauge=Math.min(95,actor.gauge+45);
      pushEvent(timeline,clock+0.0006,'PVP_TAKEDOWN_CHASE',{actorId:actor.id,gaugeAfter:actor.gauge,label:'공격형 · 처치 추격'});
    }
    if (!knockedOut) {
      const crisis=!suddenDeath&&target.hp/Math.max(1,target.maxHp)<=0.30?activateMagic(target,'CRISIS_HEAL'):null;
      if(crisis){const amount=Math.min(target.maxHp-target.hp,Math.max(1,Math.round(target.maxHp*Math.min(100,Number(crisis.effectValue||0))/100)));target.hp+=amount;target.healingDone+=amount;pushEvent(timeline,clock+0.0004,'MAGIC_CARD',{actorId:target.id,targetId:target.id,magicCardId:crisis.id,magicCode:crisis.code,magicName:crisis.name,magicImageUrl:crisis.imageUrl,magicEnhancementLevel:crisis.enhancementLevel,effectType:crisis.effectType,value:crisis.effectValue,amount,hpAfter:target.hp,maxHp:target.maxHp,activation:crisis.activations,maxActivations:crisis.maxActivations,label:crisis.name});}
      if(!suddenDeath)maybeEmergencyHeal(target, timeline, clock, healerRules[target.side].multiplier);
    }
    maybeFrontlineBreak(enemyTeam, target.side, timeline, clock);

    if (!target.alive || target.hp <= 0) continue;

    const barrierBroken=target.type==='DEFENSE'&&damageState.shieldBefore>0&&damageState.shieldAfter<=0;
    const counterAdvancement=target.uniqueAdvancement?.modifiers||{};
    const defenseCounterChance=clamp((target.defenseLineBreached?S1.counterChanceBreached:S1.counterChance)+Math.max(0,Number(counterAdvancement.counterChancePoints||0))/100,0,0.65);
    const unshieldedCounterChance=clamp(Math.max(0,Number(counterAdvancement.unshieldedCounterChancePoints||0))/100,0,0.35);
    // 전직이 없는 방어형은 V1936의 방벽 필요 조건과 RNG 소비 순서를 그대로 둔다.
    // 반격자만 방벽 파괴 순간 및 방벽 소진 뒤의 추가 반격 규칙을 사용한다.
    const hasRiposte=target.uniqueAdvancement?.classCode==='RIPOSTE';
    const counterTriggered=!isBattleSuitSupport(actor)&&target.type==='DEFENSE'&&(hasRiposte
      ?(barrierBroken||!S1.counterNeedsShield||target.shield>0||unshieldedCounterChance>0)
        &&(barrierBroken||random()<(target.shield>0?defenseCounterChance:unshieldedCounterChance))
      :(!S1.counterNeedsShield||target.shield>0)&&(barrierBroken||random()<defenseCounterChance));
    if (target.type === 'DEFENSE' && counterTriggered) {
        const baseCounterMultiplier=barrierBroken?(target.defenseLineBreached?0.60:0.72):(target.defenseLineBreached?S1.counterMultiplierBreached:S1.counterMultiplier);
        const counterMultiplier=clamp(baseCounterMultiplier+Math.max(0,Number(counterAdvancement.counterMultiplierPoints||0))/100,0.10,1.20);
        const counter = hitResult(target, actor, random, counterMultiplier, true);
        if(suddenDeath){counter.dodge=false;counter.damage=Math.max(Number(counter.damage||0),Math.round(actor.maxHp*.34+Math.max(0,actor.shield)));}
      if (!counter.dodge) {
        const counterGuard = capHasteRetaliation(counter.damage);
        const counterState = applyDamage(actor, counterGuard.amount);
        target.damageDealt += counterState.hpDamage + counterState.absorbed;
        pushEvent(timeline, clock + 0.001, 'COUNTER', {
          actorId: target.id,
          targetId: actor.id,
          damage: counterState.hpDamage,
          absorbed: counterState.absorbed,
          critical: counter.critical,
          advancementClass: target.uniqueAdvancement?.classCode || null,
          targetHpAfter: actor.hp,
          targetMaxHp: actor.maxHp,
          targetShieldAfter: actor.shield,
          hasteRetaliationGuard: Boolean(haste),
          preventedDamage: counterGuard.prevented,
          label: '방어형 · 반격'
        });
        const actorDown = resolveKnockout(actor, timeline, clock + 0.001, reviveFromMagic);
        if (!actorDown&&!suddenDeath) maybeEmergencyHeal(actor, timeline, clock + 0.001, healerRules[actor.side].multiplier);
        maybeFrontlineBreak(actor.side === 'A' ? a : b, actor.side, timeline, clock + 0.001);
        if(barrierBroken){actor.attack=Math.max(1,Math.round(actor.attack*(target.defenseLineBreached?0.95:0.90)));pushEvent(timeline,clock+0.0015,'GUARD_BREAK_DEBUFF',{actorId:target.id,targetId:actor.id,attackAfter:actor.attack,label:'방어형 · 방벽 파쇄 반격'});}
      }
    }
  }

  const aRatio = teamHpRatio(a);
  const bRatio = teamHpRatio(b);
  const winner = targetableAlive(a).length && !targetableAlive(b).length ? 'A'
    : targetableAlive(b).length && !targetableAlive(a).length ? 'B'
      : aRatio === bRatio ? 'DRAW' : (aRatio > bRatio ? 'A' : 'B');
  const timedOut = durationStopped || (durationLimit > 0 && clock >= durationLimit);
  const reason = timedOut && targetableAlive(a).length && targetableAlive(b).length ? 'TIME_LIMIT' : actionCount >= maxActions && targetableAlive(a).length && targetableAlive(b).length ? 'ACTION_LIMIT' : 'ELIMINATION';
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
    healerPenalty: healerRules,
    final: {
      A: a.map(publicFighter),
      B: b.map(publicFighter)
    }
  };
}

export function teamSummary(cards = []) {
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

const BATTLE_SUIT_WEAPON_CADENCE = Object.freeze({
  EQ_1785427638137: { classCode: 'AR', fireIntervalSeconds: .34, attackMultiplier: 0.92 },
  EQ_1785961232958: { classCode: 'AR', fireIntervalSeconds: .42, attackMultiplier: 1.00 },
  EQ_1785961300455: { classCode: 'SNIPER', fireIntervalSeconds: 1.10, attackMultiplier: 1.58 },
  EQ_1786966923833: { classCode: 'DMR', fireIntervalSeconds: .68, attackMultiplier: 1.28 },
  DEFAULT: { classCode: 'RIFLE', fireIntervalSeconds: .50, attackMultiplier: 1.00 }
});

export function battleSuitLiveRuntime(characterBonus = {}) {
  const equippedBattleSuit = characterBonus?.equippedBattleSuit && typeof characterBonus.equippedBattleSuit === 'object'
    ? characterBonus.equippedBattleSuit
    : null;
  const equippedWeapon = characterBonus?.equippedWeapon && typeof characterBonus.equippedWeapon === 'object'
    ? characterBonus.equippedWeapon
    : null;
  const pvePower = Math.max(0, Math.round(Number(characterBonus?.battleSuitPve || 0)));
  const enabled = Boolean(equippedBattleSuit && pvePower > 0);
  return {
    enabled,
    scope: 'PVE_ONLY',
    activation: 'EQUIPPED_BATTLE_SUIT',
    renderer: 'PROJECT_V_V3',
    engineRequired: true,
    damageAuthority: enabled ? 'SERVER_TIMELINE' : 'NONE',
    pvePower,
    suitCode: enabled ? String(equippedBattleSuit.code || equippedBattleSuit.itemCode || '').trim().toUpperCase() : '',
    weaponCode: enabled ? String(equippedWeapon?.code || equippedWeapon?.itemCode || '').trim().toUpperCase() : '',
    targetable: false,
    occupiesCardSlot: false
  };
}

export function buildBattleSuitFighter(battleSuit = {}, index = 5) {
  const power = Math.max(0, Math.round(Number(battleSuit.pvePower ?? battleSuit.power ?? 0)));
  if (!power) return null;
  const code = String(battleSuit.code || battleSuit.itemCode || 'BATTLE_SUIT').trim().toUpperCase();
  const weapon = battleSuit.weapon && typeof battleSuit.weapon === 'object' ? battleSuit.weapon : {};
  const weaponCode = String(battleSuit.weaponCode || weapon.code || weapon.itemCode || '').trim().toUpperCase();
  const cadence = BATTLE_SUIT_WEAPON_CADENCE[weaponCode] || BATTLE_SUIT_WEAPON_CADENCE.DEFAULT;
  const fighter = buildFighter({
    id: `BATTLE_SUIT:${code}`,
    title: String(battleSuit.name || '배틀슈트'),
    name: String(battleSuit.accountNickname || battleSuit.ownerName || '계정 배틀슈트'),
    rarity: String(battleSuit.rarity || 'BATTLE_SUIT'),
    image: String(battleSuit.battleSprite || battleSuit.image || ''),
    power,
    effectivePower: power,
    power_type: 'NONE'
  }, index, 'A', null, 'PVE');
  fighter.id = `A:SUPPORT:BATTLE_SUIT:${code}`;
  fighter.cardId = `BATTLE_SUIT:${code}`;
  fighter.row = 'SUPPORT';
  fighter.actorKind = 'BATTLE_SUIT';
  fighter.damageSource = 'BATTLE_SUIT_INDEPENDENT';
  fighter.isBattleSuit = true;
  fighter.untargetable = true;
  fighter.weaponCode = weaponCode;
  fighter.weaponClass = cadence.classCode;
  fighter.actionClock = 'INDEPENDENT_TIME_CADENCE';
  fighter.usesSpeedGauge = false;
  fighter.consumesBattleAction = false;
  fighter.independentFireIntervalSeconds = cadence.fireIntervalSeconds;
  fighter.independentOpeningDelaySeconds = Math.max(.02, cadence.fireIntervalSeconds * .35);
  fighter.attack = Math.max(10, Math.round(fighter.attack * cadence.attackMultiplier));
  fighter.speed = 0;
  fighter.maxHp = 1;
  fighter.hp = 1;
  fighter.defense = 0;
  fighter.shield = 0;
  fighter.maxShield = 0;
  fighter.gauge = 0;
  return fighter;
}

export function buildMonsterFighter(monster = {}) {
  const power = Math.max(1, Number(monster.battle_power ?? monster.battlePower ?? monster.power ?? 1));
  const isBoss = Number(monster.is_boss ?? monster.isBoss ?? 0) === 1 || monster.isBoss === true;
  const difficultyHpPercent = clamp(Number(monster.pve_hp_percent ?? 100), 100, 1200);
  const difficultyAttackPercent = clamp(Number(monster.pve_attack_percent ?? 100), 100, 1200);
  const difficultyDefensePercent = clamp(Number(monster.pve_defense_percent ?? 100), 100, 1200);
  const difficultySpeedPercent = clamp(Number(monster.pve_speed_percent ?? 100), 100, 500);
  const difficultyShieldPercent = clamp(Number(monster.pve_shield_percent ?? 0), 0, 300);
  const attackCount = Math.max(1, Math.min(5, Math.floor(Number(monster.pve_attack_count ?? 1))));
  const forcedActionEvery = Math.max(0, Math.min(20, Math.floor(Number(monster.pve_forced_action_every ?? 0))));
  // V1975: pveDifficultyRuntime 이 engineMonster.pve_difficulty 로 넘긴다. 아포칼립스만 하한 스케일링 대상.
  const isApocalypse = String(monster.pve_difficulty || '').toUpperCase() === 'APOCALYPSE';
  // V1319: 몬스터의 위협성은 유지하되 방어 누적으로 전투가 과도하게 길어지지 않도록 재조정한다.
  // DB 전투력은 그대로 두고 V2 환산 단계의 PVE 전용 배수만 변경한다.
  const hpBuffPercent = isBoss ? 10 : 5;
  const attackBuffPercent = isBoss ? 40 : 30;
  const defenseBuffPercent = isBoss ? 18 : 10;
  // V1812: 플레이어와 같은 비율로 낮춘다 (4.6/4.0 → 2.53/2.20, ×0.55).
  //   한쪽만 건드리면 승패가 바뀐다.
  const baseHp = Math.max(500, Math.round(power * (isBoss ? 2.53 : 2.20)));
  // V1813: 강제 행동으로 몬스터 공격 횟수가 0~5회 → 10~15회로 늘었다.
  //   기존 계수(0.205/0.175)를 그대로 두면 4개 덱 구성 전부 승률 0%·전원 사망이었다.
  //   1회 피해를 낮춰 총 피해량을 맞춘다. 지금은 1대에 카드 최대HP의 약 36%,
  //   즉 세 대면 카드 하나가 죽는다. 맞는 게 보이되 전멸하지는 않는 지점.
  // V1902: 보스와 일반 몬스터의 차이가 거의 없었다(공격 0.0513 vs 0.0438, 약 17%).
  //   보스만 올려 "보스는 확실히 세다"를 만든다. 일반 몬스터는 그대로 둔다.
  const baseAttack = Math.max(20, Math.round(power * (isBoss ? 0.065 : 0.0438)));
  const baseDefense = Math.max(1, Math.round(power * (isBoss ? 0.105 : 0.082)));
  const maxHp = Math.max(500, Math.round(baseHp * (1 + hpBuffPercent / 100) * difficultyHpPercent / 100));
  const attack = Math.max(20, Math.round(baseAttack * (1 + attackBuffPercent / 100) * difficultyAttackPercent / 100));
  const defense = Math.max(1, Math.round(baseDefense * (1 + defenseBuffPercent / 100) * difficultyDefensePercent / 100));
  const speed = Math.max(55, Math.round((isBoss ? 104 : 92) * difficultySpeedPercent / 100));
  const startingShield = Math.max(0, Math.round(maxHp * difficultyShieldPercent / 100));
  return {
    id: `B:0:MONSTER:${String(monster.id || 0)}`,
    cardId: `MONSTER:${String(monster.id || 0)}`,
    side: 'B', slot: 0, row: 'FRONT',
    title: String(monster.name || 'MONSTER'), memberName: '',
    grade: isBoss ? 'BOSS' : 'MONSTER', image: String(monster.image_url || monster.image || ''),
    focusX: 50, focusY: 50, breakthroughLevel: 0,
    basePower: Math.round(power), equipmentShare: 0, power: Math.round(power),
    type: 'NONE', typeLabel: isBoss ? '보스' : '몬스터', uniqueAbility: null,
    maxHp, hp: maxHp, attack, defense, speed, shield: startingShield, maxShield: startingShield, gauge: isBoss ? 12 : 4,
    pveBuffs: { hpPercent: hpBuffPercent, attackPercent: attackBuffPercent, defensePercent: defenseBuffPercent, difficultyHpPercent, difficultyAttackPercent, difficultyDefensePercent, difficultySpeedPercent, difficultyShieldPercent, attackCount, forcedActionEvery },
    alive: true, emergencyUsed: false, survivalUsed: false, frontlineAnnounced: false,
    actions: 0, damageDealt: 0, healingDone: 0, isMonster: true, isBoss, attackCount, forcedActionEvery, isApocalypse
  };
}

function forcePveMonsterSurvivalLoss(result = {}) {
  if (!['ACTION_LIMIT','TIME_LIMIT'].includes(result.reason)) return result;
  const monsterAlive = (result.final?.B || []).some(card => Number(card.hp || 0) > 0);
  if (!monsterAlive) return result;
  const timeline = (result.timeline || []).map(event => event.type === 'RESULT'
    ? { ...event, winner: 'B', reason: 'MONSTER_SURVIVED', originalWinner: result.winner, originalReason: result.reason }
    : event);
  return { ...result, winner: 'B', reason: 'MONSTER_SURVIVED', originalWinner: result.winner, originalReason: result.reason, timeline };
}

export function createPveBattleV2({ cards = [], magicCards = [], characterBonus = 0, battleSuit = null, monster = {}, seed = 1, ultimateDamage = 0, bossUltimatePercent = 0, bossUltimateCapPercent = 100, singleHealerBonus = {}, escortObjective = null } = {}) {
  const withBonus = distributeEquipment(applyTypeStacking(cards), Math.max(0, Number(characterBonus || 0)));
  const teamA = withBonus.map((card, index) => buildFighter(card, index, 'A', card.uniqueAbility || null, 'PVE'));
  const battleSuitFighter = battleSuit ? buildBattleSuitFighter(battleSuit, teamA.length) : null;
  const simulationTeamA = battleSuitFighter ? [...teamA, battleSuitFighter] : teamA;
  const teamB = [buildMonsterFighter(monster)];
  const forcedMonsterEvery = escortObjective ? 4 : (teamB[0]?.forcedActionEvery > 0 ? teamB[0].forcedActionEvery : (teamB[0]?.isBoss ? 8 : 12));
  const simulated = simulateBattleV2Preview({
    teamA:simulationTeamA, teamB, magicA:magicCards, seed, maxActions: 2000, maxDuration: 4.0,
    // V1813: 플레이어 15회마다 몬스터 1회를 보장한다. PVP 는 끈 채로 둔다.
    // V1837: 호송작전만 주기를 15 → 4 로 줄인다. 차량이 자주 맞아야
    //   호송이라는 긴장감이 생긴다. 이 값은 "몇 번 때리나" 만 정하고
    //   실제 차량 피해량은 서버의 구간 공식이 따로 정하므로
    //   난이도는 흔들리지 않는다. 다른 PVE 는 15 그대로다.
    // V1902: 보스는 8행동마다(기존 15) 한 번 끼어든다. 한 판에서 보스가 움직이는
    //   횟수가 약 두 배가 되므로 "보스가 샌드백" 느낌이 사라진다.
    //   일반 몬스터는 12 로만 살짝 올린다.
    forcedMonsterEvery,
    openingPlayerUltimateDamage: ultimateDamage,
    openingBossUltimatePercent: bossUltimatePercent,
    bossUltimateCapPercent,
    healerPenalty: true,
    singleHealerBonus,
    escortObjective
  });
  // PVE는 제한 행동까지 몬스터가 살아 있으면 잔여 HP 비율과 무관하게 실패한다.
  const battleSuitActorId = battleSuitFighter?.id || '';
  const appliedDamage = event => Math.max(0, Number(event?.damage || 0)) + Math.max(0, Number(event?.absorbed || 0));
  const battleSuitEvents = battleSuitActorId
    ? simulated.timeline.filter(event => String(event?.actorId || '') === battleSuitActorId && event.type === 'TURN')
    : [];
  const battleSuitDamage = battleSuitEvents.reduce((sum, event) => sum + appliedDamage(event), 0);
  const cardDamage = simulated.timeline.reduce((sum, event) => {
    const actorId = String(event?.actorId || '');
    return actorId.startsWith('A:') && actorId !== battleSuitActorId ? sum + appliedDamage(event) : sum;
  }, 0);
  const ultimateAppliedDamage = simulated.timeline.filter(event => event.type === 'PVE_ULTIMATE').reduce((sum, event) => sum + appliedDamage(event), 0);
  const canonicalResult = {
    ...simulated,
    final: {
      ...simulated.final,
      A: (simulated.final?.A || []).filter(card => String(card?.id || '') !== battleSuitActorId)
    },
    supports: {
      A: battleSuitFighter ? [{
        ...publicFighter(battleSuitFighter),
        damageDealt: battleSuitDamage,
        actions: battleSuitEvents.length,
        authoritative: true,
        damageAuthority: 'SERVER_TIMELINE'
      }] : [],
      B: []
    },
    damageBreakdown: {
      cards: cardDamage,
      battleSuit: battleSuitDamage,
      ultimate: ultimateAppliedDamage,
      total: cardDamage + battleSuitDamage + ultimateAppliedDamage,
      authority: 'SERVER_TIMELINE'
    }
  };
  const result = forcePveMonsterSurvivalLoss(canonicalResult);
  return {
    schemaVersion: 2,
    engine: 'BATTLE_ENGINE_V2',
    playbackSpeed: 1.3,
    seed: Number(seed) >>> 0,
    rules: { hpMode: 'POWER_DISTRIBUTED', formation: 'FRONT_2_BACK_3_PLUS_BATTLE_SUIT_SUPPORT', actionMode: escortObjective?'ESCORT_OBJECTIVE_PRIORITY':'SPEED_GAUGE_WITH_INDEPENDENT_BATTLE_SUIT', damageCapPercent: 46, bossUltimateCapPercent: clamp(bossUltimateCapPercent, 100, 500), maxActions: 2000, maxDuration: 4.0, timeoutRule: 'MONSTER_SURVIVES_LOSE', monsterBuffMode: 'PVE_SEPARATE_HP_ATK_DEF_SHIELD_REPEAT', forcedMonsterEvery, monsterAttackCount:teamB[0]?.attackCount||1, monsterShieldPercent:teamB[0]?.pveBuffs?.difficultyShieldPercent||0, monsterMinDamagePercent: escortObjective ? 0 : MONSTER_MIN_DAMAGE_PERCENT * 100, apocalypseFloorScaling: teamB[0]?.isApocalypse ? { gain: APOCALYPSE_FLOOR_GAIN, min: APOCALYPSE_FLOOR_SCALE_MIN, max: APOCALYPSE_FLOOR_SCALE_MAX } : null, escortObjectivePriority:Boolean(escortObjective), escortForcedOpeningStrike:Boolean(escortObjective), battleSuitDamageAuthority:battleSuitFighter?'SERVER_TIMELINE':'NONE', battleSuitActionClock:battleSuitFighter?'INDEPENDENT_TIME_CADENCE':'NONE', battleSuitConsumesAction:false, battleSuitUsesSpeedGauge:false, battleSuitTargetable:false, battleSuitOccupiesCardSlot:false, healerDuplicatePenalty: { 2: 60, 3: 75, 4: 85, 5: 90 }, healerPenaltyScope: 'PVE_PVP_HP_RECOVERY_AND_2PLUS_SURVIVE_DISABLED', singleHealerBonus: normalizeSingleHealerBonus(singleHealerBonus), dbTimelineWrites: 0 },
    teams: {
      A: { summary: teamSummary(teamA), cards: teamA.map(publicFighter), supports: battleSuitFighter ? [{ ...publicFighter(battleSuitFighter), authoritative: true, damageAuthority: 'SERVER_TIMELINE' }] : [] },
      B: { summary: teamSummary(teamB), cards: teamB.map(publicFighter) }
    },
    result
  };
}


export function resolvePvpOutcome(result, teamA, teamB) {
  if (!result) return result;
  const finalA = Array.isArray(result.final?.A) ? result.final.A : [];
  const finalB = Array.isArray(result.final?.B) ? result.final.B : [];
  if (!finalA.length && !finalB.length) return result;
  const aliveA = finalA.filter(card => Number(card.hp || 0) > 0).length;
  const aliveB = finalB.filter(card => Number(card.hp || 0) > 0).length;
  const hpRatio = cards => {
    const current = cards.reduce((sum, card) => sum + Math.max(0, Number(card.hp || 0)) + Math.max(0, Number(card.shield || 0)), 0);
    const maximum = cards.reduce((sum, card) => sum + Math.max(0, Number(card.maxHp || 0)) + Math.max(0, Number(card.maxShield || 0)), 0);
    return maximum > 0 ? current / maximum : 0;
  };
  const ratioA = hpRatio(finalA);
  const ratioB = hpRatio(finalB);
  const sumA = teamSummary(teamA);
  const sumB = teamSummary(teamB);
  const originalReason = String(result.reason || '').toUpperCase();
  let winner = result.winner;
  let reason = originalReason;
  if (aliveA > 0 && aliveB === 0) {
    winner = 'A';
    reason = 'ELIMINATION';
  } else if (aliveB > 0 && aliveA === 0) {
    winner = 'B';
    reason = 'ELIMINATION';
  } else if (!['ACTION_LIMIT', 'TIME_LIMIT'].includes(originalReason)) {
    return { ...result, survivorCount: { A: aliveA, B: aliveB } };
  } else if (aliveA !== aliveB) {
    winner = aliveA > aliveB ? 'A' : 'B';
    reason = 'SURVIVOR_COUNT';
  } else if (ratioA !== ratioB) {
    winner = ratioA > ratioB ? 'A' : 'B';
    reason = 'HP_RATIO_TIEBREAK';
  } else {
    // 생존 수와 잔여 체력까지 같을 때만 편성 전투력, 완전 동률은 기존 공격자 우선 규칙을 사용한다.
    winner = sumA.power >= sumB.power ? 'A' : 'B';
    reason = 'POWER_TIEBREAK';
  }
  const patchedTimeline = (result.timeline || []).map(event => event.type === 'RESULT'
    ? { ...event, winner, reason, originalReason, survivorCountA: aliveA, survivorCountB: aliveB, teamAHpPercent: Math.round(ratioA * 1000) / 10, teamBHpPercent: Math.round(ratioB * 1000) / 10 }
    : event);
  return { ...result, winner, reason, originalReason, survivorCount: { A: aliveA, B: aliveB }, timeline: patchedTimeline };
}

export function createPvpBattleV2({ attackerCards = [], defenderCards = [], attackerMagicCards = [], defenderMagicCards = [], attackerEquipmentBonus = 0, defenderEquipmentBonus = 0, seed = 1, singleHealerBonus = {} } = {}) {
  const attackerWithEquipment = distributeEquipment(applyTypeStacking(attackerCards), Math.max(0, Number(attackerEquipmentBonus || 0)));
  const defenderWithEquipment = distributeEquipment(applyTypeStacking(defenderCards), Math.max(0, Number(defenderEquipmentBonus || 0)));
  const teamA = attackerWithEquipment.map((card, index) => buildFighter(card, index, 'A', card.uniqueAbility || null, 'PVP'));
  const teamB = defenderWithEquipment.map((card, index) => buildFighter(card, index, 'B', card.uniqueAbility || null, 'PVP'));
  // Normal combat keeps the established 100-action balance. If both teams
  // still have survivors, a short no-heal, escalating-damage overtime runs
  // instead of ending on a visually ambiguous 2:2 HP-ratio judgment.
  const simulated = simulateBattleV2Preview({ teamA, teamB, magicA:attackerMagicCards, magicB:defenderMagicCards, seed, maxActions: 83, suddenDeathAfter: 64, healerPenalty: true, singleHealerBonus });
  const result = resolvePvpOutcome(simulated, teamA, teamB);
  return {
    schemaVersion: 2,
    engine: 'BATTLE_ENGINE_V2_PVP',
    playbackSpeed: 1.3,
    seed: Number(seed) >>> 0,
    rules: {
      hpMode: 'POWER_DISTRIBUTED',
      formation: 'FRONT_2_BACK_3',
      actionMode: 'SPEED_GAUGE',
      damageCapPercent: 46,
      maxActions: 83,
      suddenDeathAfter: 64,
      suddenDeathRule: 'NO_HEAL_ESCALATING_DAMAGE_UNTIL_ELIMINATION',
      timeoutRule: 'SURVIVOR_COUNT_THEN_HP_RATIO_THEN_POWER',
      drawRule: 'POWER_THEN_ATTACKER',
      healerDuplicatePenalty: { 2: 60, 3: 75, 4: 85, 5: 90 },
      healerPenaltyScope: 'PVE_PVP_HP_RECOVERY_AND_2PLUS_SURVIVE_DISABLED',
      singleHealerBonus: normalizeSingleHealerBonus(singleHealerBonus),
      dbTimelineWrites: 0
    },
    teams: {
      A: { summary: teamSummary(teamA), cards: teamA.map(publicFighter) },
      B: { summary: teamSummary(teamB), cards: teamB.map(publicFighter) }
    },
    result
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
  const magicMode = String(url.searchParams.get('magicMode') || 'EXAMPLES').trim().toUpperCase() === 'LOADOUT' ? 'LOADOUT' : 'EXAMPLES';
  const [settings, ownDeck, opponent] = await Promise.all([
    deps.battleSettings(env),
    deps.pvpDeckSnapshot(env, user.id),
    selectOpponent(env, user, requestedOpponentId)
  ]);

  if (ownDeck.length !== 5) return deps.json({ error: '전투엔진 V2 프리뷰를 시작하려면 PvP 덱 5장을 먼저 편성하세요.' }, 400);

  let opponentUser = opponent;
  let opponentDeck = opponent ? await deps.pvpDeckSnapshot(env, opponent.id, true) : [];
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

  const ownUniqueMap = new Map((uniqueStates[0]?.cards || []).map(card => [String(card.id), card]));
  const enemyUniqueMap = new Map((uniqueStates[1]?.cards || []).map(card => [String(card.id), card]));
  const ownWithEquipment = distributeEquipment(ownCards, Number(ownBonus?.pvp || 0));
  const enemyWithEquipment = distributeEquipment(enemyCards, Number(enemyBonus?.pvp || 0));
  const teamA = ownWithEquipment.map((card, index) => { const uniqueCard = ownUniqueMap.get(String(card.id)); return buildFighter({ ...card, uniqueAdvancement: uniqueCard?.uniqueAdvancement || null }, index, 'A', uniqueCard?.uniqueAbility || null); });
  const teamB = enemyWithEquipment.map((card, index) => { const uniqueCard = enemyUniqueMap.get(String(card.id)); return buildFighter({ ...card, uniqueAdvancement: uniqueCard?.uniqueAdvancement || null }, index, 'B', uniqueCard?.uniqueAbility || null); });
  let magicA = [];
  let magicB = [];
  let registeredExamples = [];
  if (magicMode === 'LOADOUT') {
    const previewOpponent = { ...opponentUser, role: 'OWNER' };
    const [ownMagic, enemyMagic] = await Promise.all([
      deps.magicBattleLoadout(env, { ...user, role: 'OWNER' }, 'PVP'),
      mirror
        ? deps.magicBattleLoadout(env, { ...user, role: 'OWNER' }, 'PVP')
        : deps.magicBattleLoadout(env, previewOpponent, 'PVP')
    ]);
    magicA = Array.isArray(ownMagic?.cards) ? ownMagic.cards : [];
    magicB = Array.isArray(enemyMagic?.cards) ? enemyMagic.cards : [];
  } else {
    registeredExamples = await magicV2PreviewExamples(env);
    // Keep the full CMS example catalogue available to the preview controls,
    // but only inject one card per side into the automatic sample battle.
    // Playing every 100%-trigger example serially made the initial preview look
    // like an endless loading screen.
    magicA = registeredExamples.slice(0, 1).map((card, index) => ({ ...card, slotNo: index + 1 }));
    magicB = registeredExamples.slice(1, 2).map((card, index) => ({ ...card, slotNo: index + 1 }));
  }
  const seed = hashSeed(`${user.id}:${opponentUser.id}:${nonce}`);
  const simulation = simulateBattleV2Preview({
    teamA,
    teamB,
    magicA,
    magicB,
    seed,
    healerPenalty: true,
    maxActions: magicMode === 'EXAMPLES' ? 12 : 80
  });

  return deps.json({
    preview: true,
    schemaVersion: 2,
    playbackSpeed: 1.3,
    engine: 'BATTLE_ENGINE_V2_PREVIEW',
    persistence: 'NONE',
    seed,
    generatedAt: new Date().toISOString(),
    rules: {
      hpMode: 'POWER_DISTRIBUTED',
      formation: 'FRONT_2_BACK_3',
      actionMode: 'SPEED_GAUGE',
      damageCapPercent: 46,
      healerDuplicatePenalty: { 2: 60, 3: 75, 4: 85, 5: 90 },
      dbWrites: 0
    },
    player: { id: Number(user.id), nickname: String(user.nickname || 'PLAYER') },
    opponent: { id: Number(opponentUser.id), nickname: String(opponentUser.nickname || 'OPPONENT'), mirror },
    magicPreview: {
      mode: magicMode,
      teamA: magicA,
      teamB: magicB,
      registeredExamples,
      effectTypes: [...new Set((magicMode === 'EXAMPLES' ? registeredExamples : [...magicA, ...magicB]).map(card => String(card.effectType || '')).filter(Boolean))]
    },
    teams: {
      A: { summary: teamSummary(teamA), cards: teamA.map(publicFighter) },
      B: { summary: teamSummary(teamB), cards: teamB.map(publicFighter) }
    },
    result: simulation
  }, 200, { 'cache-control': 'no-store' });
}
