const STAT_PROFILES = {
  ATTACK:  { hp: 0.34, attack: 0.38, defense: 0.14, speed: 0.14, label: '공격형' },
  DEFENSE: { hp: 0.43, attack: 0.22, defense: 0.25, speed: 0.10, label: '방어형' },
  HP:      { hp: 0.52, attack: 0.20, defense: 0.18, speed: 0.10, label: '생명형' },
  SPEED:   { hp: 0.34, attack: 0.25, defense: 0.14, speed: 0.27, label: '속도형' },
  NONE:    { hp: 0.40, attack: 0.28, defense: 0.18, speed: 0.14, label: '균형형' }
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
  const dominant = String(uniqueAbility?.dominantType || '').trim().toUpperCase();
  if (STAT_PROFILES[dominant]) return dominant;
  const raw = String(card.power_type ?? card.powerType ?? '').trim().toUpperCase();
  if (raw === 'HEALTH' || raw === 'LIFE') return 'HP';
  return STAT_PROFILES[raw] ? raw : 'NONE';
}

function uniquePercent(effect, key) {
  return clamp(effect?.[key] ?? 0, -90, key === 'speedPercent' ? 300 : 500);
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
  const profile = STAT_PROFILES[type];
  const power = Math.max(1, Number(card.effectivePower || card.power || 1));
  const mode = String(battleMode || 'PVP').toUpperCase();
  const attackRoleMultiplier = type === 'ATTACK' ? (mode === 'PVE' ? 1.15 : 1.05) : 1;
  const defenseRoleMultiplier = type === 'DEFENSE' ? (mode === 'PVE' ? 1.15 : 1.10) : 1;
  const attackPct = uniquePercent(uniqueAbility, 'attackPercent') * attackRoleMultiplier;
  const defensePct = uniquePercent(uniqueAbility, 'defensePercent') * defenseRoleMultiplier;
  const hpPct = uniquePercent(uniqueAbility, 'hpPercent');
  const speedPct = uniquePercent(uniqueAbility, 'speedPercent');

  const maxHp = Math.max(100, Math.round(power * profile.hp * 4.25 * (1 + hpPct / 100)));
  const attack = Math.max(10, Math.round(power * profile.attack * 1.05 * (1 + attackPct / 100)));
  const defense = Math.max(1, Math.round(power * profile.defense * 0.85 * (1 + defensePct / 100)));
  const speed = Math.max(35, Math.round((70 + power * profile.speed * 0.10) * (1 + speedPct / 100)));
  const shieldFloor = mode === 'PVE' ? 0.22 : 0.18;
  const shieldCap = mode === 'PVE' ? 0.38 : 0.32;
  const startingShield = type === 'DEFENSE' ? Math.round(maxHp * clamp(shieldFloor + Math.max(0, defensePct) / 500, shieldFloor, shieldCap)) : 0;

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
    indomitableUsed: false,
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
    emergencyUsed, survivalUsed, indomitableUsed, pvpTakedownUsed, frontlineAnnounced, alive, actions, damageDealt, healingDone,
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
  const dodgeChance = target.type === 'SPEED' && !target.speedUniqueSuppressed
    ? clamp(0.10 + Math.max(0, uniquePercent(target.uniqueAbility, 'speedPercent')) / 1000, 0.10, 0.24)
    : 0.02;
  if (!counter && random() < dodgeChance) return { dodge: true, damage: 0, critical: false, penetration: 0 };

  const criticalChance = clamp(0.10 + (actor.type === 'ATTACK' ? 0.06 : 0) + (actor.type === 'SPEED' && !actor.speedUniqueSuppressed ? 0.03 : 0), 0.10, 0.25);
  const critical = random() < criticalChance;
  const pveAttack = actor.type === 'ATTACK' && actor.battleMode === 'PVE';
  const penetration = actor.type === 'ATTACK'
    ? (pveAttack && target.isBoss ? 0.40 : pveAttack && target.isMonster ? 0.28 : (random() < 0.35 ? 0.30 : 0.15))
    : 0.03;
  const effectiveDefense = Math.max(0, target.defense * (1 - penetration));
  const reduction = clamp(effectiveDefense / (effectiveDefense + 600), 0, 0.65);
  const variance = 0.95 + random() * 0.10;
  const weakTarget = actor.type === 'ATTACK' && target.hp / Math.max(1, target.maxHp) <= 0.50;
  const execute = weakTarget ? (actor.battleMode === 'PVE' ? 1.25 : 1.10) : 1;
  const pvpOpeningPressure = actor.type === 'ATTACK' && actor.battleMode === 'PVP' && actor.actions === 1 ? 1.12 : 1;
  const pvpShieldBreaker = actor.type === 'ATTACK' && actor.battleMode === 'PVP' && target.shield > 0 ? 1.15 : 1;
  const raw = actor.attack * 1.72 * Number(multiplier || 1) * variance * execute * pvpOpeningPressure * pvpShieldBreaker * (critical ? 1.50 : 1);
  const capped = Math.min(raw * (1 - reduction), target.maxHp * (counter ? 0.24 : 0.46));
  const damage = Math.max(1, Math.round(capped));
  return { dodge: false, damage, critical, penetration: Number((penetration * 100).toFixed(1)), execute: execute > 1, openingPressure:pvpOpeningPressure>1, shieldBreaker:pvpShieldBreaker>1 };
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

function healerPenaltyForTeam(team = []) {
  const healerCount = team.filter(card => card.type === 'HP').length;
  const reductionPercent = healerCount >= 5 ? 90 : healerCount === 4 ? 85 : healerCount === 3 ? 75 : healerCount === 2 ? 60 : 0;
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

function maybeEmergencyHeal(target, timeline, clock, healMultiplier = 1) {
  if (!target.alive || target.hp <= 0 || target.type !== 'HP' || target.emergencyUsed) return;
  if (target.hp / target.maxHp > 0.30) return;
  target.emergencyUsed = true;
  const amount = Math.min(target.maxHp - target.hp, Math.max(1, Math.round(target.maxHp * 0.18 * clamp(healMultiplier, 0, 1))));
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

function resolveKnockout(target, timeline, clock, onBeforeKnockout = null) {
  if (target.hp > 0 || !target.alive) return false;
  if (target.type === 'DEFENSE' && !target.indomitableUsed) {
    target.indomitableUsed = true;
    target.hp = 1;
    const indomitableShieldRatio=target.battleMode==='PVE'?0.10:(target.defenseLineBreached?0.03:0.06);
    target.shield = Math.max(target.shield, Math.round(target.maxHp * indomitableShieldRatio));
    target.maxShield = Math.max(target.maxShield, target.shield);
    pushEvent(timeline, clock, 'INDOMITABLE', { targetId: target.id, hpAfter: target.hp, shieldAfter: target.shield, label: '방어형 · 불굴' });
    return false;
  }
  if (target.type === 'HP' && Number(target.teamHealerCount || 0) < 2 && !target.survivalUsed) {
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
  if (typeof onBeforeKnockout === 'function' && onBeforeKnockout(target, clock) === true) return false;
  target.alive = false;
  target.hp = 0;
  target.gauge = 0;
  pushEvent(timeline, clock, 'KO', { targetId: target.id });
  return true;
}

export function simulateBattleV2Preview({ teamA = [], teamB = [], magicA = [], magicB = [], seed = 1, maxActions = 80, maxDuration = 0, openingPlayerUltimateDamage = 0, openingBossUltimatePercent = 0, bossUltimateCapPercent = 100, healerPenalty = false, singleHealerBonus = {} } = {}) {
  const random = seededRandom(seed);
  const a = teamA.map(card => ({ ...card }));
  const b = teamB.map(card => ({ ...card }));
  const timeline = [];
  let clock = 0;
  let actionCount = 0;
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
  const healerRules = healerPenalty ? { A: healerPenaltyForTeam(a), B: healerPenaltyForTeam(b) } : { A: { healerCount: 0, reductionPercent: 0, multiplier: 1 }, B: { healerCount: 0, reductionPercent: 0, multiplier: 1 } };
  for (const fighter of a) fighter.teamHealerCount = healerRules.A.healerCount;
  for (const fighter of b) fighter.teamHealerCount = healerRules.B.healerCount;
  const singleHealer = normalizeSingleHealerBonus(singleHealerBonus);
  if (singleHealer.enabled) {
    for (const team of [a, b]) {
      const healers = team.filter((card) => card.type === 'HP');
      if (healers.length !== 1) continue;
      const healer = healers[0];
      healer.singleHealerActive = true;
      healer.singleHealerUses = 0;
      healer.singleHealerMaxUses = healer.battleMode === 'PVE'
        ? singleHealer.pveMaxActivations
        : singleHealer.pvpMaxActivations;
      const targets = [];
      for (const target of team) {
        const amount = Math.max(0, Math.round(target.maxHp * singleHealer.teamHpPercent / 100));
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
    const guards=team.filter(card=>card.type==='DEFENSE');
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
    if(attackTeam.filter(card=>card.type==='ATTACK').length<2)return;
    const defenseCount=targetTeam.filter(card=>card.type==='DEFENSE').length;
    if(defenseCount<1)return;
    for(const fighter of targetTeam){
      fighter.defenseLineBreached=true;
      fighter.shield=Math.max(0,Math.round(fighter.shield*0.55));
      fighter.maxShield=Math.max(fighter.shield,Math.round(fighter.maxShield*0.55));
    }
    pushEvent(timeline,clock,'DEFENSE_LINE_BREACHED',{actorSide:attackTeam[0]?.side||'',targetSide:targetTeam[0]?.side||'',defenseCount,shieldReductionPercent:45,label:'공격형 연계 · 공성 돌파'});
  };
  breachDefenseLine(a,b);breachDefenseLine(b,a);

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
  if (bossOpeningPercent > 0 && alive(a).length && alive(b).length) {
    const hits = [];
    const damagedTargets = [...alive(a)];
    for (const target of damagedTargets) {
      // PVE character equipment/vehicle/title power is distributed into each
      // fighter. A max-HP percentage hit must not grow by the same amount or
      // that support power provides zero survivability against boss ultimates.
      const basePower = Math.max(1, Number(target.basePower || target.power || 1));
      const effectivePower = Math.max(basePower, Number(target.power || basePower));
      const supportMitigationPercent = clamp((effectivePower - basePower) / effectivePower * 100, 0, 90);
      const effectiveDamagePercent = bossOpeningPercent * (1 - supportMitigationPercent / 100);
      const amount = Math.max(1, Math.round(target.maxHp * effectiveDamagePercent / 100));
      const damageState = applyDamage(target, amount);
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

  const durationLimit = Math.max(0, Number(maxDuration || 0));
  let durationStopped = false;
  while (alive(a).length && alive(b).length && actionCount < maxActions && (!durationLimit || clock < durationLimit)) {
    const actors = [...alive(a), ...alive(b)];
    const dt = Math.min(...actors.map(card => (100 - card.gauge) / Math.max(1, card.speed)));
    if (durationLimit && clock + Math.max(0.001, dt) > durationLimit) { durationStopped = true; break; }
    clock += Math.max(0.001, dt);
    for (const card of actors) card.gauge = clamp(card.gauge + card.speed * dt, 0, 130);
    const ready = actors.filter(card => card.gauge >= 99.999).sort((x, y) => y.gauge - x.gauge || y.speed - x.speed || x.slot - y.slot);
    const actor = ready[0];
    actor.gauge = Math.max(0, actor.gauge - 100);
    actor.actions += 1;
    actionCount += 1;

    if (actor.type === 'HP' && actor.hp < actor.maxHp) {
      const amount = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.round(actor.maxHp * 0.04 * healerRules[actor.side].multiplier)));
      actor.hp += amount;
      actor.healingDone += amount;
      pushEvent(timeline, clock, 'REGEN', { targetId: actor.id, amount, hpAfter: actor.hp, maxHp: actor.maxHp, label: '생명형 · 지속 회복' });
    }

    if (actor.singleHealerActive && actor.singleHealerUses < actor.singleHealerMaxUses) {
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

    const enemyTeam = actor.side === 'A' ? b : a;
    const pool = targetPool(enemyTeam);
    if (!pool.length) break;
    const tauntGuard=actor.isMonster?pool.find(card=>card.type==='DEFENSE'&&random()<0.70):null;
    const target = tauntGuard||lowestRatioTarget(pool, random);
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

    if (actor.type === 'SPEED' && !actor.speedUniqueSuppressed) {
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
      openingPressure: hit.openingPressure === true,
      shieldBreaker: hit.shieldBreaker === true,
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
    if(knockedOut&&actor.type==='ATTACK'&&actor.battleMode==='PVP'&&!actor.pvpTakedownUsed){
      actor.pvpTakedownUsed=true;actor.gauge=Math.min(95,actor.gauge+45);
      pushEvent(timeline,clock+0.0006,'PVP_TAKEDOWN_CHASE',{actorId:actor.id,gaugeAfter:actor.gauge,label:'공격형 · 처치 추격'});
    }
    if (!knockedOut) {
      const crisis=target.hp/Math.max(1,target.maxHp)<=0.30?activateMagic(target,'CRISIS_HEAL'):null;
      if(crisis){const amount=Math.min(target.maxHp-target.hp,Math.max(1,Math.round(target.maxHp*Math.min(100,Number(crisis.effectValue||0))/100)));target.hp+=amount;target.healingDone+=amount;pushEvent(timeline,clock+0.0004,'MAGIC_CARD',{actorId:target.id,targetId:target.id,magicCardId:crisis.id,magicCode:crisis.code,magicName:crisis.name,magicImageUrl:crisis.imageUrl,magicEnhancementLevel:crisis.enhancementLevel,effectType:crisis.effectType,value:crisis.effectValue,amount,hpAfter:target.hp,maxHp:target.maxHp,activation:crisis.activations,maxActivations:crisis.maxActivations,label:crisis.name});}
      maybeEmergencyHeal(target, timeline, clock, healerRules[target.side].multiplier);
    }
    maybeFrontlineBreak(enemyTeam, target.side, timeline, clock);

    if (!target.alive || target.hp <= 0) continue;

    const barrierBroken=target.type==='DEFENSE'&&damageState.shieldBefore>0&&damageState.shieldAfter<=0;
    const defenseCounterChance=target.defenseLineBreached?0.12:0.25;
    if (target.type === 'DEFENSE' && (barrierBroken || random() < defenseCounterChance)) {
      const counter = hitResult(target, actor, random, barrierBroken?(target.defenseLineBreached?0.60:0.72):(target.defenseLineBreached?0.45:0.55), true);
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
          targetHpAfter: actor.hp,
          targetMaxHp: actor.maxHp,
          targetShieldAfter: actor.shield,
          hasteRetaliationGuard: Boolean(haste),
          preventedDamage: counterGuard.prevented,
          label: '방어형 · 반격'
        });
        const actorDown = resolveKnockout(actor, timeline, clock + 0.001, reviveFromMagic);
        if (!actorDown) maybeEmergencyHeal(actor, timeline, clock + 0.001, healerRules[actor.side].multiplier);
        maybeFrontlineBreak(actor.side === 'A' ? a : b, actor.side, timeline, clock + 0.001);
        if(barrierBroken){actor.attack=Math.max(1,Math.round(actor.attack*(target.defenseLineBreached?0.95:0.90)));pushEvent(timeline,clock+0.0015,'GUARD_BREAK_DEBUFF',{actorId:target.id,targetId:actor.id,attackAfter:actor.attack,label:'방어형 · 방벽 파쇄 반격'});}
      }
    }
  }

  const aRatio = teamHpRatio(a);
  const bRatio = teamHpRatio(b);
  const winner = alive(a).length && !alive(b).length ? 'A'
    : alive(b).length && !alive(a).length ? 'B'
      : aRatio === bRatio ? 'DRAW' : (aRatio > bRatio ? 'A' : 'B');
  const timedOut = durationStopped || (durationLimit > 0 && clock >= durationLimit);
  const reason = timedOut && alive(a).length && alive(b).length ? 'TIME_LIMIT' : actionCount >= maxActions && alive(a).length && alive(b).length ? 'ACTION_LIMIT' : 'ELIMINATION';
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

export function buildMonsterFighter(monster = {}) {
  const power = Math.max(1, Number(monster.battle_power ?? monster.battlePower ?? monster.power ?? 1));
  const isBoss = Number(monster.is_boss ?? monster.isBoss ?? 0) === 1 || monster.isBoss === true;
  const difficultyHpPercent = clamp(Number(monster.pve_hp_percent ?? 100), 100, 1000);
  const difficultyAttackPercent = clamp(Number(monster.pve_attack_percent ?? 100), 100, 1000);
  const difficultyDefensePercent = clamp(Number(monster.pve_defense_percent ?? 100), 100, 1000);
  const difficultySpeedPercent = clamp(Number(monster.pve_speed_percent ?? 100), 100, 300);
  // V1319: 몬스터의 위협성은 유지하되 방어 누적으로 전투가 과도하게 길어지지 않도록 재조정한다.
  // DB 전투력은 그대로 두고 V2 환산 단계의 PVE 전용 배수만 변경한다.
  const hpBuffPercent = isBoss ? 10 : 5;
  const attackBuffPercent = isBoss ? 40 : 30;
  const defenseBuffPercent = isBoss ? 18 : 10;
  const baseHp = Math.max(500, Math.round(power * (isBoss ? 4.6 : 4.0)));
  const baseAttack = Math.max(20, Math.round(power * (isBoss ? 0.205 : 0.175)));
  const baseDefense = Math.max(1, Math.round(power * (isBoss ? 0.105 : 0.082)));
  const maxHp = Math.max(500, Math.round(baseHp * (1 + hpBuffPercent / 100) * difficultyHpPercent / 100));
  const attack = Math.max(20, Math.round(baseAttack * (1 + attackBuffPercent / 100) * difficultyAttackPercent / 100));
  const defense = Math.max(1, Math.round(baseDefense * (1 + defenseBuffPercent / 100) * difficultyDefensePercent / 100));
  const speed = Math.max(55, Math.round((isBoss ? 104 : 92) * difficultySpeedPercent / 100));
  return {
    id: `B:0:MONSTER:${String(monster.id || 0)}`,
    cardId: `MONSTER:${String(monster.id || 0)}`,
    side: 'B', slot: 0, row: 'FRONT',
    title: String(monster.name || 'MONSTER'), memberName: '',
    grade: isBoss ? 'BOSS' : 'MONSTER', image: String(monster.image_url || monster.image || ''),
    focusX: 50, focusY: 50, breakthroughLevel: 0,
    basePower: Math.round(power), equipmentShare: 0, power: Math.round(power),
    type: 'NONE', typeLabel: isBoss ? '보스' : '몬스터', uniqueAbility: null,
    maxHp, hp: maxHp, attack, defense, speed, shield: 0, maxShield: 0, gauge: isBoss ? 12 : 4,
    pveBuffs: { hpPercent: hpBuffPercent, attackPercent: attackBuffPercent, defensePercent: defenseBuffPercent, difficultyHpPercent, difficultyAttackPercent, difficultyDefensePercent, difficultySpeedPercent },
    alive: true, emergencyUsed: false, survivalUsed: false, frontlineAnnounced: false,
    actions: 0, damageDealt: 0, healingDone: 0, isMonster: true, isBoss
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

export function createPveBattleV2({ cards = [], magicCards = [], characterBonus = 0, monster = {}, seed = 1, ultimateDamage = 0, bossUltimatePercent = 0, bossUltimateCapPercent = 100, singleHealerBonus = {} } = {}) {
  const withBonus = distributeEquipment(cards, Math.max(0, Number(characterBonus || 0)));
  const teamA = withBonus.map((card, index) => buildFighter(card, index, 'A', card.uniqueAbility || null, 'PVE'));
  const teamB = [buildMonsterFighter(monster)];
  const simulated = simulateBattleV2Preview({
    teamA, teamB, magicA:magicCards, seed, maxActions: 2000, maxDuration: 4.0,
    openingPlayerUltimateDamage: ultimateDamage,
    openingBossUltimatePercent: bossUltimatePercent,
    bossUltimateCapPercent,
    healerPenalty: true,
    singleHealerBonus
  });
  // PVE는 제한 행동까지 몬스터가 살아 있으면 잔여 HP 비율과 무관하게 실패한다.
  const result = forcePveMonsterSurvivalLoss(simulated);
  return {
    schemaVersion: 2,
    engine: 'BATTLE_ENGINE_V2',
    playbackSpeed: 1.3,
    seed: Number(seed) >>> 0,
    rules: { hpMode: 'POWER_DISTRIBUTED', formation: 'FRONT_2_BACK_3', actionMode: 'SPEED_GAUGE', damageCapPercent: 46, bossUltimateCapPercent: clamp(bossUltimateCapPercent, 100, 500), maxActions: 2000, maxDuration: 4.0, timeoutRule: 'MONSTER_SURVIVES_LOSE', monsterBuffMode: 'PVE_SEPARATE_HP_ATK_DEF', healerDuplicatePenalty: { 2: 60, 3: 75, 4: 85, 5: 90 }, healerPenaltyScope: 'PVE_PVP_HP_RECOVERY_AND_2PLUS_SURVIVE_DISABLED', singleHealerBonus: normalizeSingleHealerBonus(singleHealerBonus), dbTimelineWrites: 0 },
    teams: {
      A: { summary: teamSummary(teamA), cards: teamA.map(publicFighter) },
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
  const attackerWithEquipment = distributeEquipment(attackerCards, Math.max(0, Number(attackerEquipmentBonus || 0)));
  const defenderWithEquipment = distributeEquipment(defenderCards, Math.max(0, Number(defenderEquipmentBonus || 0)));
  const teamA = attackerWithEquipment.map((card, index) => buildFighter(card, index, 'A', card.uniqueAbility || null, 'PVP'));
  const teamB = defenderWithEquipment.map((card, index) => buildFighter(card, index, 'B', card.uniqueAbility || null, 'PVP'));
  const simulated = simulateBattleV2Preview({ teamA, teamB, magicA:attackerMagicCards, magicB:defenderMagicCards, seed, maxActions: 100, healerPenalty: true, singleHealerBonus });
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

  const ownUniqueMap = new Map((uniqueStates[0]?.cards || []).map(card => [String(card.id), card.uniqueAbility || null]));
  const enemyUniqueMap = new Map((uniqueStates[1]?.cards || []).map(card => [String(card.id), card.uniqueAbility || null]));
  const ownWithEquipment = distributeEquipment(ownCards, Number(ownBonus?.pvp || 0));
  const enemyWithEquipment = distributeEquipment(enemyCards, Number(enemyBonus?.pvp || 0));
  const teamA = ownWithEquipment.map((card, index) => buildFighter(card, index, 'A', ownUniqueMap.get(String(card.id))));
  const teamB = enemyWithEquipment.map((card, index) => buildFighter(card, index, 'B', enemyUniqueMap.get(String(card.id))));
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
