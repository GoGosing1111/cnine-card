import {buildFighter, buildMonsterFighter, buildBattleSuitFighter, publicFighter, simulateBattleV2Preview, teamSummary} from '../../../functions/_battle_v2_preview.js';

// Preview-only rules. The production simulator is imported, never reimplemented.
// No account API, wallet, claim endpoint or live idle state is used here.
export const VERSION = 2;
export const STORAGE_KEY = 'cnine_preview_idle_v3_v1';
export const ACTION_LIMIT = 36;
export const MAX_TRAINING = 20;
export const BASE_CARD_POWER = 200000;
export const BATTLE_SUIT = Object.freeze({code: 'BATTLE_SUIT_03', weaponCode: 'EQ_1788486929132', basePower: 300000});
export const CARD_IDS = Object.freeze([
  'CN-02D9DC1E8A8A4209', 'CN-CE16D291605A47F0',
  'CN-716F6A71EE5F488E', 'CN-23EB4B19986D4818', 'CN-519C181C18DF4B8E'
]);
export const ROLES = Object.freeze(['ATTACK', 'DEFENSE', 'SPEED', 'ATTACK', 'HP']);
export const ZONES = Object.freeze([
  {name: '안개 숲길', description: '어둠에 잠긴 숲의 경계를 넘어', field: 'HUNT'},
  {name: '잊힌 성역', description: '잠들어 있던 수호자들의 영역', field: 'TOWER'},
  {name: '심연의 성채', description: '돌아온 원정대만이 도달하는 곳', field: 'RAID'}
]);
const rows = [
  [1, 500000, 18], [5, 800000, 24], [68, 1200000, 32], [6, 3200000, 80],
  [1, 1500000, 40], [5, 2000000, 50], [68, 2500000, 62], [10, 6500000, 150],
  [1, 3500000, 76], [5, 4500000, 90], [68, 5500000, 108], [73, 11000000, 250]
];
export const STAGES = Object.freeze(rows.map(([monsterId, power, reward], index) => Object.freeze({
  index, code: `${Math.floor(index / 4) + 1}-${index % 4 + 1}`,
  zone: Math.floor(index / 4), monsterId, power, reward, boss: index % 4 === 3
})));
const bounded = (value, min, max, fallback = min) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Math.floor(Number(value)))) : fallback;
export const trainingCost = level => 120 + bounded(level, 0, MAX_TRAINING) * 80;
export const powerMultiplier = level => 1 + bounded(level, 0, MAX_TRAINING) * .2;
export const previewPower = level => Math.round((BASE_CARD_POWER * 5 + BATTLE_SUIT.basePower) * powerMultiplier(level));
export const farmableStages = cleared => STAGES.filter(s => s.index <= cleared && !s.boss);

export function freshState() {
  return {version: VERSION, cleared: -1, farm: 0, mode: 'ADVANCE', training: 0, data: 0,
    attempts: 0, wins: 0, losses: 0, wall: null, earned: 0, log: []};
}
export function restoreState(raw) {
  if (!raw || raw.version !== VERSION) return freshState();
  const state = freshState();
  for (const key of ['training', 'data', 'attempts', 'wins', 'losses', 'earned']) {
    state[key] = bounded(raw[key], 0, key === 'training' ? MAX_TRAINING : 1000000000);
  }
  state.cleared = Number.isInteger(raw.cleared) ? bounded(raw.cleared, -1, STAGES.length - 1, -1) : -1;
  const farms = farmableStages(state.cleared);
  state.farm = farms.some(s => s.index === raw.farm) ? raw.farm : (farms.at(-1)?.index ?? 0);
  state.mode = raw.mode === 'FARM' && farms.length ? 'FARM' : 'ADVANCE';
  if (state.cleared === STAGES.length - 1) state.mode = 'FARM';
  state.wall = Number.isInteger(raw.wall) && raw.wall === state.cleared + 1 && raw.wall < STAGES.length ? raw.wall : null;
  // Persisted logs are untrusted strings; the UI uses textContent only.
  state.log = Array.isArray(raw.log) ? raw.log.slice(0, 8).filter(x => typeof x?.text === 'string').map(x => ({
    text: x.text.slice(0, 220), kind: ['win', 'loss', 'info'].includes(x.kind) ? x.kind : 'info'
  })) : [];
  return state;
}

export function buildPreviewDeck(catalog, training = 0) {
  return CARD_IDS.map((id, index) => {
    const card = catalog.find(row => row.cardId === id);
    if (!card?.sourceArt) throw new Error(`승인 카드 원화를 찾지 못했습니다: ${id}`);
    return {...card, id, name: card.member, rarity: card.grade, power_type: ROLES[index],
      power: Math.round(BASE_CARD_POWER * powerMultiplier(training)), image: card.sourceArt, originalCardArt: card.sourceArt};
  });
}

export function simulateStage({catalog, monsters, equipment, stageIndex = 0, training = 0, seed = 1}) {
  const stage = STAGES[stageIndex];
  if (!stage) throw new Error('존재하지 않는 원정 구간입니다.');
  const entry = monsters.find(row => row.mode === 'HUNT' && row.monsterId === stage.monsterId);
  if (!entry?.sourceArt || !entry?.battleSprite) throw new Error(`승인 몬스터 자산이 없습니다: ${stage.monsterId}`);
  const cards = buildPreviewDeck(catalog, training);
  const suit = equipment?.suits?.find(s => s.code === BATTLE_SUIT.code);
  const weapon = equipment?.weapons?.find(w => w.equipmentCode === BATTLE_SUIT.weaponCode);
  if (!suit || !weapon) throw new Error('승인 배틀슈트와 무기 조합을 찾지 못했습니다.');
  const suitPower = Math.round(BATTLE_SUIT.basePower * powerMultiplier(training));
  const equippedBattleSuit = {code: suit.code, pvePower: suitPower, appearance: {battleSprite: suit.image, battleHeight: 278}};
  const equippedWeapon = {code: weapon.equipmentCode, appearance: {battleSprite: weapon.battleSprite}};
  const support = buildBattleSuitFighter({...equippedBattleSuit, weapon: equippedWeapon, accountNickname: '원정대 지원'});
  // Monster stats are fixed by the stage, independent of the player's power.
  const monster = {...entry, id: entry.monsterId, name: entry.name, image: entry.sourceArt,
    image_url: entry.sourceArt, battle_power: stage.power, is_boss: stage.boss ? 1 : 0,
    // Reuse the existing stat-gated PVE damage floor. The generic HUNT floor
    // guarantees %HP damage per suit shot even for an arbitrarily weak suit,
    // which would erase the requested progression wall.
    pve_difficulty: 'APOCALYPSE'};
  const teamA = cards.map((card, index) => buildFighter(card, index, 'A', null, 'PVE'));
  const teamB = [buildMonsterFighter(monster)];
  const simulation = simulateBattleV2Preview({teamA: [...teamA, support], teamB, seed, maxActions: ACTION_LIMIT,
    maxDuration: 4, forcedMonsterEvery: stage.boss ? 6 : 12, healerPenalty: true});
  // A surviving enemy is a failed clear, including time/action limit draws.
  const win = simulation.winner === 'A' && simulation.final.B.every(card => card.hp <= 0);
  const reason = win ? 'ELIMINATION' : simulation.reason === 'ELIMINATION' ? 'ELIMINATION' : 'MONSTER_SURVIVED';
  const damage = e => Math.max(0, Number(e.damage || 0)) + Math.max(0, Number(e.absorbed || 0));
  const suitDamage = simulation.timeline.filter(e => e.actorId === support.id).reduce((sum, e) => sum + damage(e), 0);
  const cardDamage = simulation.timeline.filter(e => String(e.actorId || '').startsWith('A:') && e.actorId !== support.id).reduce((sum, e) => sum + damage(e), 0);
  const supportRow = {...publicFighter(support), authoritative: true, damageAuthority: 'SERVER_TIMELINE', damageDealt: suitDamage};
  const result = {...simulation, winner: win ? 'A' : 'B', reason,
    final: {...simulation.final, A: simulation.final.A.filter(c => c.id !== support.id)},
    supports: {A: [supportRow], B: []},
    damageBreakdown: {cards: cardDamage, battleSuit: suitDamage, total: cardDamage + suitDamage, authority: 'SERVER_TIMELINE'},
    timeline: simulation.timeline.map(e => e.type === 'RESULT' ? {...e, winner: win ? 'A' : 'B', reason} : e)};
  const battleV2 = {schemaVersion: 2, engine: 'BATTLE_ENGINE_V2', seed,
    rules: {maxActions: ACTION_LIMIT, timeoutRule: 'MONSTER_SURVIVES_LOSE', fixedStageStats: true,
      battleSuitDamageAuthority: 'SERVER_TIMELINE', battleSuitActionClock: 'INDEPENDENT_TIME_CADENCE',
      battleSuitConsumesAction: false, battleSuitTargetable: false, battleSuitOccupiesCardSlot: false},
    teams: {A: {cards: teamA.map(publicFighter), summary: teamSummary(teamA), supports: [supportRow]},
      B: {cards: teamB.map(publicFighter), summary: teamSummary(teamB)}}, result};
  return {previewOnly: true, idlePreview: {stageIndex, training, seed}, mode: 'HUNT', battlefieldMode: 'HUNT', previewBattlefield: ZONES[stage.zone].field,
    accountNickname: '원정대 · 검수 덱', equippedBattleSuit, equippedWeapon,
    characterBonus: {battleSuitPve: suitPower, equippedBattleSuit, equippedWeapon}, cards, monster, battleV2};
}

export class IdleSession {
  constructor(raw) { this.state = restoreState(raw); this.active = null; }
  get target() { return this.state.mode === 'FARM' ? this.state.farm : Math.min(this.state.cleared + 1, STAGES.length - 1); }
  note(text, kind = 'info') { this.state.log.unshift({text, kind}); this.state.log.length = Math.min(8, this.state.log.length); }
  begin() {
    if (this.active) throw new Error('이미 진행 중인 원정 전투가 있습니다.');
    this.active = Object.freeze({id: ++this.state.attempts, stageIndex: this.target,
      training: this.state.training, seed: this.state.attempts * 7919 + this.target * 104729});
    return this.active;
  }
  cancel(round) { if (this.active === round) this.active = null; }
  finish(round, payload) {
    if (this.active !== round) return null; // duplicate/stale playback cannot award twice
    if (!payload?.previewOnly || payload.idlePreview?.stageIndex !== round.stageIndex ||
        payload.idlePreview?.training !== round.training || payload.idlePreview?.seed !== round.seed) {
      throw new Error('진행 중인 원정과 전투 결과가 일치하지 않습니다.');
    }
    const result = payload?.battleV2?.result;
    if (!result || !Array.isArray(result.final?.B)) throw new Error('전투 최종 상태가 없습니다.');
    this.active = null;
    const stage = STAGES[round.stageIndex];
    const won = result.winner === 'A' && result.final.B.length > 0 && result.final.B.every(c => c.hp <= 0);
    const first = won && stage.index === this.state.cleared + 1;
    const reward = won ? stage.reward * (first ? 3 : 1) : 0;
    if (won) {
      this.state.wins++;
      if (first) {
        this.state.cleared = stage.index;
        this.state.wall = null;
        if (!stage.boss && this.state.mode !== 'FARM') this.state.farm = stage.index;
      }
      this.state.data = Math.min(1000000000, this.state.data + reward);
      this.state.earned = Math.min(1000000000, this.state.earned + reward);
      if (this.state.cleared === STAGES.length - 1) this.state.mode = 'FARM';
      this.note(`${stage.code} ${first ? '첫 돌파' : '사냥 완료'} · 연구 데이터 +${reward}`, 'win');
    } else {
      this.state.losses++;
      if (stage.index === this.state.cleared + 1) this.state.wall = stage.index;
      const farms = farmableStages(Math.min(this.state.cleared, stage.index - 1));
      if (farms.length) { this.state.mode = 'FARM'; this.state.farm = farms.at(-1).index; }
      this.note(`${stage.code} 돌파 실패 · ${farms.length ? `${STAGES[this.state.farm].code} 안전 사냥으로 복귀` : '훈련 후 재도전 필요'}`, 'loss');
    }
    const enemy = result.final.B[0];
    return {won, first, reward, stage: stage.index, remainingHp: Math.round(100 * enemy.hp / enemy.maxHp),
      reason: result.reason, battleSuitDamage: result.damageBreakdown?.battleSuit || 0, shouldStop: !won && this.state.cleared < 0};
  }
  setFarm(index) {
    if (!farmableStages(this.state.cleared).some(s => s.index === index)) return false;
    this.state.farm = index; this.state.mode = 'FARM'; return true;
  }
  advance() {
    if (this.state.cleared >= STAGES.length - 1) return false;
    this.state.mode = 'ADVANCE'; return true;
  }
  train() {
    const cost = trainingCost(this.state.training);
    if (this.state.training >= MAX_TRAINING || this.state.data < cost) return false;
    this.state.data -= cost; this.state.training++;
    this.note(`원정 훈련 Lv.${this.state.training} · 기본 전투력 +${this.state.training * 20}%`);
    return true;
  }
  serialize() { return structuredClone(this.state); }
}
