// Normalized TEST squads. No account, wallet, live skill assignment or reward writes.
import {defenseDifficulty,defenseEnemy,LEGACY_DEFENSE_DIFFICULTIES} from '../../../shared/monster-defense-v1.mjs';
import {DEFENSE_PROFILES as PROFILES} from '../../../shared/monster-defense-loadout-v1.mjs';
import {defenseMercenaryRuntime} from '../../../shared/monster-defense-mercenary-v1.mjs';
import {defaultDefenseGrowth,validateDefenseGrowth,newPlayerGrowth,settleWaveGrowth,growthTier,growthRandom,hasTrait,DEFENSE_TRAITS,GROWTH_BRANCHES,waveKind} from '../../../shared/monster-defense-growth-v2.mjs';
export const RULES = Object.freeze({ tickMs: 100, waves: 10, prepMs: 8000, coreHp: 1000,
  moveMs: 1800, moveCooldownMs: 5000, maxEnemies: 42, maxEvents: 240, waveCredit: 100,
  reviveStepMs: 15000, reviveMaxMs: 60000, reviveHpRatio: .5 });
export const MERCENARIES = Object.freeze([
  { code: 'V-003', name: '솔바인', role: 'GUARD', label: '방어', sprite: 'mercenary-v003-solvain-sd-v1.png' },
  { code: 'V-002', name: '리시아', role: 'RANGED', label: '원거리', sprite: 'mercenary-v002-licia-sd-v1.png' },
  { code: 'V-001', name: '아우렌', role: 'STRIKER', label: '근접', sprite: 'mercenary-v001-auren-sd-v1.png' },
  { code: 'V-004', name: '베스페라', role: 'HEALER', label: '회복', sprite: 'mercenary-v004-vespera-sd-v1.png' }
]);
export const CARDS = Object.freeze([
  { code: 'FAKER', name: '페이커', role: 'CAPTAIN', sprite: 'deck-faker-sd-v1.png' },
  { code: 'BONGJUN', name: '봉준', role: 'CAPTAIN', sprite: 'deck-bongjun-sd-v1.png' },
  { code: 'TAEK', name: '김택용', role: 'CAPTAIN', sprite: 'deck-kimtaekyong-sd-v1.png' }
]);
export const LANES = ['A', 'B', 'C'];
export const laneY = (lane, capacity) => capacity === 2 ? [380, 860][lane] : [280, 620, 960][lane];
export const WORLD = Object.freeze({ width: 2880, height: 1280, coreX: 220, coreY: 620, mergeX: 600, spawnX: 2780,
  frontX: 1510, pressureX: 1600, breachWarningX: 1030 });
// Captured on new rooms only: saved battles retain their original pacing and damage.
export const DEFENSE_TEMPO = Object.freeze({ revision: 1, spawnMs: 850, firstSpawnMs: 300,
  spawnInset: 400, speed: 2, attack: 1.7, ordinaryPrepMs: 8000, openingPrepMs: 8000 });
const fastRoom = room => room.tempoRevision === DEFENSE_TEMPO.revision;
export function defenseWaveBrief(room, wave = room.phase === 'PREP' ? room.wave + 1 : room.wave) {
  if (!fastRoom(room) || wave > room.encounter.waves) return null;
  const kind = wave % 10 === 0 || wave === room.encounter.waves ? 'BOSS' : wave % 5 === 0 ? 'SIEGE' : wave % 3 === 0 ? 'RUSH' : 'NORMAL';
  const cycle=kind==='BOSS'?Math.floor(wave/10)-1:kind==='SIEGE'?Math.floor(wave/5)-1:kind==='RUSH'?Math.floor(wave/3)-1:wave-1;
  const focus=Math.max(0,cycle)%room.capacity;
  const descriptions = {
    BOSS: ['보스 공세', '위험 전선 표시를 보고 방어 태세 또는 지원 이동으로 포격에 대응하세요.'],
    SIEGE: ['공성 병단', '장갑병과 공성포가 함께 진격합니다. 화력 지원과 정예 처형 특성이 유리합니다.'],
    RUSH: ['집중 돌파', '빠른 추격병이 몰려옵니다. 광역 참격·방어 태세와 다른 분대의 지원을 준비하세요.'],
    NORMAL: ['분산 공세', '각 방어선을 지키며 다음 집중 공세에 쓸 전술을 준비하세요.']
  };
  return { wave, kind, focus, name: descriptions[kind][0], hint: descriptions[kind][1] };
}
function prepDuration(room) {
  const configured = room.growthPolicy?.prepSeconds * 1000 || RULES.prepMs;
  if (!fastRoom(room)) return configured;
  return room.wave === 0 ? Math.min(configured, DEFENSE_TEMPO.openingPrepMs) : room.wave % 5 === 0 ? configured : Math.min(configured, DEFENSE_TEMPO.ordinaryPrepMs);
}
export function unitPosition(slot, lane, capacity, ownerLane = lane) {
  const supportRow = (ownerLane - lane + capacity) % capacity;
  return { x: [WORLD.frontX, 1220, 930][slot] - supportRow * 65,
    y: laneY(lane, capacity) + [-4, -58, 30][slot] + supportRow * 60 };
}
const fail = (message, code = 'INVALID_ACTION') => { const e = new Error(message); e.code = code; throw e; };
const active = room => ['PREP', 'WAVE'].includes(room.phase);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const random = room => { room.rng = (Math.imul(room.rng, 1664525) + 1013904223) >>> 0; return room.rng / 4294967296; };
function event(room, type, data = {}) {
  room.events.push({ seq: ++room.seq, at: room.time, type, ...data });
  if (room.events.length > RULES.maxEvents) room.events.splice(0, room.events.length - RULES.maxEvents);
}
export function validateLoadout(value, roster = null) {
  const mercenaries=roster?roster.filter(c=>c.kind==='MERCENARY'):MERCENARIES;
  const cards=roster?roster.filter(c=>c.kind==='CARD'):CARDS;
  if (!value || !Array.isArray(value.mercenaries) || value.mercenaries.length !== 2 || new Set(value.mercenaries).size !== 2 ||
    value.mercenaries.some(code => !mercenaries.some(m => m.code === code&&PROFILES[m.role])) || !cards.some(c => c.code === value.card&&PROFILES[c.role])) {
    fail('서로 다른 용병 2명과 카드 1장을 선택하세요.', 'INVALID_LOADOUT');
  }
  return { mercenaries: [...value.mercenaries], card: value.card };
}
export const defaultLoadout = () => ({ mercenaries: ['V-003', 'V-002'], card: 'FAKER' });
export function createRoom({ id, capacity = 3, seed = 123, now = Date.now(), practice = false, difficulty='NORMAL', combat=null, growth=null, ruleset=3, accountRoster=false } = {}) {
  if (![2, 3].includes(capacity)) fail('2인 또는 3인 방을 선택하세요.');
  const preset=ruleset===2?LEGACY_DEFENSE_DIFFICULTIES.find(d=>d.id===difficulty):defenseDifficulty(difficulty);if(!preset)fail('난이도를 확인하세요.');
  const growthPolicy=ruleset===3?validateDefenseGrowth(growth||defaultDefenseGrowth()):null;
  const encounter={...preset,...combat,id:preset.id,waves:growthPolicy?.waves||preset.waves,pool:preset.pool,elite:preset.elite,midBoss:preset.midBoss,boss:preset.boss};
  return { version: ruleset, mercenarySkillRevision:accountRoster?1:0, tempoRevision: ruleset >= 3 ? DEFENSE_TEMPO.revision : 0, accountRoster, growthPolicy, growthRng:(seed^0x9e3779b9)>>>0, id, capacity, practice, difficulty, encounter, createdAt: now, hostId: null, phase: 'LOBBY', players: [], units: [], enemies: [],
    time: 0, wave: 0, phaseUntil: 0, coreHp: encounter.coreHp, coreMaxHp: encounter.coreHp, rng: seed >>> 0 || 1,
    seq: 0, events: [], nextEnemyId: 0, spawnQueue: [], spawnAt: 0, nextBotThink: 0, completedAt: null, rewardsEnabled: false };
}
export function joinRoom(room, { id, name, loadout = defaultLoadout(), bot = false, roster=null }) {
  if (room.players.some(p => p.id === id)) return room.players.find(p => p.id === id);
  if (room.phase !== 'LOBBY') fail('이미 시작한 방입니다.', 'ROOM_STARTED');
  if (room.players.length >= room.capacity) fail('방이 가득 찼습니다.', 'ROOM_FULL');
  const cleanName = String(name || '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 16);
  if (!cleanName) fail('이름을 입력하세요.');
  const used = new Set(room.players.map(p => p.lane));
  if(room.accountRoster&&!bot&&!roster)fail('보유 편성을 먼저 확인하세요.','INVALID_LOADOUT');
  const player = { id, name: cleanName, lane: LANES.findIndex((_, i) => !used.has(i)), loadout: validateLoadout(loadout,roster),
    roster:roster?structuredClone(roster):null,loadoutRevision:0,
    growth:room.version>=3?newPlayerGrowth():null, ready: bot, bot, connected: true, credits: 0, upgrades: 0, wipeCount: 0, reviveAt: 0, reviveDelayMs: 0,
    stats: { damage: 0, heal: 0, blocked: 0, supportMoves: 0 } };
  room.players.push(player);
  room.hostId ??= id;
  event(room, 'JOIN', { playerId: id });
  return player;
}
export function selectDefenseLoadout(room,playerId,loadout,roster){
  const player=room.players.find(p=>p.id===playerId);
  if(!player||player.bot)fail('내 분대만 편성할 수 있습니다.','NOT_MEMBER');
  if(room.phase!=='LOBBY')fail('전투 중에는 편성을 바꿀 수 없습니다.','ROOM_STARTED');
  player.loadout=validateLoadout(loadout,roster);player.roster=structuredClone(roster);
  player.ready=false;event(room,'LOADOUT',{playerId});
}
export function leaveRoom(room, id) {
  const player = room.players.find(p => p.id === id);
  if (!player) return;
  if (room.phase !== 'LOBBY') { player.connected = false; return; }
  room.players = room.players.filter(p => p.id !== id);
  if (room.hostId === id) room.hostId = room.players.find(p => !p.bot)?.id ?? room.players[0]?.id ?? null;
  event(room, 'LEAVE', { playerId: id });
}
function createUnits(room) {
  return room.players.flatMap(player => [
    ...player.loadout.mercenaries.map(code => (player.roster||MERCENARIES).find(m => m.code === code)),
    (player.roster||CARDS).find(c => c.code === player.loadout.card)
  ].map((entry, slot) => {
    const profile = PROFILES[entry.role];
    return { id: `${player.id}:${slot}`, ownerId: player.id, ownerLane: player.lane, slot, code: entry.code, name: entry.name,
      role: entry.role, kind:entry.kind||(slot<2?'MERCENARY':'CARD'),mercenary:room.mercenarySkillRevision===1&&entry.mercenary?structuredClone(entry.mercenary):null,
      ...unitPosition(slot, player.lane, room.capacity), lane: player.lane, maxHp: profile.hp, hp: profile.hp,
      attack: profile.attack, range: profile.range, interval: profile.interval, skillName: profile.skill, skillCooldown: profile.cooldown,
      nextAttack: slot * 180, skillReadyAt: 0, moveReadyAt: 0, move: null, shieldUntil: 0, buffUntil: 0, kills: 0 };
  }));
}
export function startRoom(room, playerId) {
  if (playerId !== room.hostId) fail('방장만 출발할 수 있습니다.', 'NOT_HOST');
  if (room.phase !== 'LOBBY') fail('이미 시작한 전투입니다.', 'ROOM_STARTED');
  if (room.players.length !== room.capacity || room.players.some(p => !p.ready || (!p.bot && !p.connected)))
    fail('모든 대원이 입장하고 준비를 마쳐야 합니다.', 'NOT_READY');
  if(room.accountRoster&&room.players.some(p=>!p.bot&&!p.roster))fail('모든 대원이 보유 편성을 선택해야 합니다.','INVALID_LOADOUT');
  room.units = createUnits(room);
  room.phase = 'PREP'; room.prepStartedAt=room.time; room.phaseUntil = room.time + prepDuration(room);
  event(room, 'START');
}
function finish(room, won) {
  room.phase = won ? 'VICTORY' : 'DEFEAT'; room.completedAt = room.time;
  room.spawnQueue = [];
  room.players.forEach(p => { p.reviveAt = 0; });
  event(room, 'RESULT', { won });
}
function scheduleSquadRevives(room) {
  for (const player of room.players) {
    if (player.reviveAt) continue;
    const squad = room.units.filter(u => u.ownerId === player.id);
    if (squad.length !== 3 || squad.some(u => u.hp > 0)) continue;
    player.wipeCount++;
    player.reviveDelayMs = Math.min(RULES.reviveMaxMs, player.wipeCount * RULES.reviveStepMs);
    player.reviveAt = room.time + player.reviveDelayMs;
    squad.forEach(u => { u.move = null; });
    event(room, 'SQUAD_WIPE', { playerId: player.id, lane: player.lane, wipeCount: player.wipeCount,
      reviveAt: player.reviveAt, delayMs: player.reviveDelayMs });
  }
}
function recoverDueSquads(room) {
  for (const player of room.players) {
    if (!player.reviveAt || room.time < player.reviveAt) continue;
    player.reviveAt = 0;
    for (const unit of room.units.filter(u => u.ownerId === player.id)) {
      unit.hp = Math.max(1, Math.round(unit.maxHp * RULES.reviveHpRatio));
      Object.assign(unit, unitPosition(unit.slot, player.lane, room.capacity));
      unit.lane = player.lane; unit.move = null;
      unit.shieldUntil = 0; unit.buffUntil = 0;
      unit.nextAttack = room.time + 300 + unit.slot * 180;
      // Skill and support cooldowns retain their server deadlines across resurrection.
    }
    event(room, 'SQUAD_REVIVE', { playerId: player.id, lane: player.lane, wipeCount: player.wipeCount,
      hpRatio: RULES.reviveHpRatio });
  }
}
function hurtEnemy(room, enemy, amount, unit, mercenary = null) {
  if (enemy.hp <= 0) return;
  const scaled=amount*(hasTrait(room.players.find(p=>p.id===unit.ownerId),'EXECUTE')&&['ELITE','BOSS'].includes(enemy.type)?1.2:1);
  const actual=mercenary?mercenary.basic(unit,enemy,scaled).hpDamage:Math.min(enemy.hp,Math.round(scaled*(1-(enemy.armor||0)/100)));
  if(!mercenary){enemy.hp-=actual;room.players.find(p => p.id === unit.ownerId).stats.damage += actual;}
  event(room, 'HIT', { actorId: unit.id, targetId: enemy.id, amount: actual, x: enemy.x, y: enemy.y, hp: enemy.hp });
  if (enemy.hp <= 0 && !mercenary) { unit.kills++; event(room, 'KO', { targetId: enemy.id, x: enemy.x, y: enemy.y }); }
}
function healUnit(room, target, amount, source) {
  if (target.hp <= 0) return;
  const actual = Math.min(target.maxHp - target.hp, Math.round(amount));
  if (!actual) return;
  target.hp += actual;
  room.players.find(p => p.id === source.ownerId).stats.heal += actual;
  event(room, 'HEAL', { actorId: source.id, targetId: target.id, amount: actual });
}
function useSkill(room, unit) {
  if (room.phase !== 'WAVE') fail('교전 중에 전술을 사용할 수 있습니다.');
  if (unit.hp <= 0 || unit.move) fail('전투불능이거나 이동 중입니다.');
  if (room.time < unit.skillReadyAt) fail('전술이 충전 중입니다.', 'COOLDOWN');
  const skillRange = unit.role === 'RANGED' ? unit.range + 300 : unit.range + 240;
  const foes = room.enemies.filter(e => e.hp > 0 && e.lane === unit.lane &&
    (!fastRoom(room) || !['RANGED', 'STRIKER'].includes(unit.role) || distance(e, unit) <= skillRange));
  const friends = room.units.filter(u => u.hp > 0 && !u.move && u.lane === unit.lane);
  const warnedLane=fastRoom(room)&&unit.role==='GUARD'&&room.enemies.some(e=>e.hp>0&&e.cast?.lane===unit.lane&&e.cast.endsAt>room.time);
  if (!foes.length && !warnedLane && !['HEALER', 'CAPTAIN'].includes(unit.role)) fail('전술 사거리 안에 적이 없습니다.', 'NO_TARGET');
  if (unit.role === 'HEALER' && !friends.some(u => u.hp < u.maxHp)) fail('회복이 필요한 아군이 없습니다.');
  unit.skillReadyAt = room.time + unit.skillCooldown;
  if (unit.role === 'GUARD') {
    friends.forEach(u => { u.shieldUntil = room.time + (hasTrait(room.players.find(p=>p.id===unit.ownerId),'BULWARK')?9000:6000); });
    foes.filter(e => distance(e, unit) <= 450).forEach(e => { e.slowUntil = room.time + 5000; });
  } else if (unit.role === 'HEALER') {
    friends.forEach(u => healUnit(room, u, u.maxHp * .32, unit));
    if(hasTrait(room.players.find(p=>p.id===unit.ownerId),'MEDIC_CORE'))room.coreHp=Math.min(room.coreMaxHp,room.coreHp+Math.round(room.coreMaxHp*.03));
  } else if (unit.role === 'CAPTAIN') {
    friends.forEach(u => { u.buffUntil = room.time + 7000; healUnit(room, u, u.maxHp * .12, unit); });
  } else {
    const targets = foes.sort((a, b) => a.x - b.x).slice(0, unit.role === 'RANGED' ? 3 : 6);
    targets.forEach(e => hurtEnemy(room, e, unit.attack * (unit.role === 'RANGED' ? 4.5 : 3.2), unit));
  }
  event(room, 'SKILL', { actorId: unit.id, role: unit.role, lane: unit.lane, x: unit.x + 190, y: unit.y });
}
export function commandRoom(room, playerId, command) {
  const player = room.players.find(p => p.id === playerId);
  if (!player) fail('이 방의 대원이 아닙니다.', 'NOT_MEMBER');
  if (!command || typeof command.type !== 'string') fail('잘못된 명령입니다.');
  if (command.type === 'READY') {
    if (room.phase !== 'LOBBY') fail('전투 중에는 편성을 바꿀 수 없습니다.');
    if (typeof command.ready !== 'boolean') fail('준비 상태를 확인하세요.');
    if (command.loadout) {player.loadout = validateLoadout(command.loadout);player.roster=null;}
    player.ready = command.ready; event(room, 'READY', { playerId }); return;
  }
  if (command.type === 'START') return startRoom(room, playerId);
  if (!active(room)) fail('진행 중인 전투가 아닙니다.', 'NOT_ACTIVE');
  if(room.version>=3&&['FORGE','TRAIT','READY_WAVE'].includes(command.type))return growthCommand(room,player,command);
  if(room.version>=3&&command.type==='UPGRADE')fail('정비실에서 강화 계열을 선택하세요.');
  if (player.reviveAt) fail('분대가 부활 대기 중입니다.', 'SQUAD_RECOVERING');
  if (command.type === 'UPGRADE') {
    if (room.phase !== 'PREP') fail('정비 시간에 강화할 수 있습니다.');
    const cost = 100 + player.upgrades * 50;
    if (player.credits < cost) fail('정비 자원이 부족합니다.');
    if (player.upgrades >= 5) fail('이번 전투의 강화 한도에 도달했습니다.');
    player.credits -= cost; player.upgrades++;
    room.units.filter(u => u.ownerId === playerId).forEach(u => {
      u.attack = Math.round(PROFILES[u.role].attack * (1 + player.upgrades * .14));
      const max = Math.round(PROFILES[u.role].hp * (1 + player.upgrades * .12));
      if (u.hp > 0) u.hp += max - u.maxHp;
      u.maxHp = max;
    });
    event(room, 'UPGRADE', { playerId }); return;
  }
  const unit = room.units.find(u => u.id === command.unitId);
  if (!unit || unit.ownerId !== playerId) fail('내 유닛만 조작할 수 있습니다.', 'NOT_OWNER');
  if (command.type === 'SKILL') return useSkill(room, unit);
  if (command.type === 'MOVE') {
    if (!Number.isInteger(command.lane) || command.lane < 0 || command.lane >= room.capacity) fail('존재하지 않는 방어선입니다.');
    if (unit.hp <= 0 || unit.move) fail('전투불능이거나 이미 이동 중입니다.');
    if (unit.lane === command.lane) fail('이미 해당 방어선에 있습니다.');
    if (room.time < unit.moveReadyAt) fail('지원 이동이 충전 중입니다.', 'COOLDOWN');
    // The resident squad and every supporting owner have separate stations.
    const destination = unitPosition(unit.slot, command.lane, room.capacity, unit.ownerLane);
    unit.move = { fromX: unit.x, fromY: unit.y, ...destination, lane: command.lane,
      startedAt: room.time, endsAt: room.time + RULES.moveMs };
    unit.moveReadyAt = room.time + RULES.moveCooldownMs;
    player.stats.supportMoves++;
    event(room, 'MOVE', { actorId: unit.id, lane: command.lane, fromLane: unit.lane,
      fromX: unit.x, fromY: unit.y, x: destination.x, y: destination.y, endsAt: unit.move.endsAt }); return;
  }
  fail('지원하지 않는 명령입니다.');
}
function rebuildGrowthUnits(room,player){
 const levels=player.growth.levels,effects=room.growthPolicy.effects;
 for(const u of room.units.filter(u=>u.ownerId===player.id)){
  const base=PROFILES[u.role],ratio=u.hp/u.maxHp;
  u.attack=Math.round(base.attack*(1+levels.ATTACK*effects.attackPercent/100));
  u.maxHp=Math.round(base.hp*(1+levels.VITAL*effects.hpPercent/100));
  u.hp=ratio>0?Math.max(1,Math.round(u.maxHp*ratio)):0;
  u.skillCooldown=Math.round(base.cooldown*(1-Math.min(.4,levels.TACTIC*effects.cooldownPercent/100+(hasTrait(player,'QUICK')?.1:0))));
 }
}
function growthCommand(room,player,command){
 if(room.phase!=='PREP')fail('웨이브 사이 정비 시간에 선택할 수 있습니다.','NOT_PREP');
 if(command.wave!==room.wave)fail('웨이브가 변경됐습니다. 현재 정비 화면을 확인하세요.','STALE_WAVE');
 const g=player.growth;
 if(command.type==='READY_WAVE'){
  if(typeof command.ready!=='boolean')fail('준비 상태를 확인하세요.');g.readyWave=command.ready?room.wave:-1;return;
 }
 if(command.type==='TRAIT'){
  const offer=g.offers.find(o=>o.id===command.offerId);
  if(!offer||offer.selected||!offer.choices.includes(command.traitId)||g.traits.includes(command.traitId))fail('선택할 수 없는 특성입니다.','TRAIT_OFFER');
  offer.selected=command.traitId;g.traits.push(command.traitId);rebuildGrowthUnits(room,player);g.readyWave=-1;
  // An older saved choice must not leave newer offers with an already owned trait.
  for(const pending of g.offers.filter(o=>!o.selected)){
   pending.choices=pending.choices.filter(id=>!g.traits.includes(id));
   const remaining=DEFENSE_TRAITS.map(t=>t.id).filter(id=>!g.traits.includes(id)&&!pending.choices.includes(id));
   while(pending.choices.length<3&&remaining.length)pending.choices.push(remaining.splice(Math.floor(growthRandom(room)*remaining.length),1)[0]);
  }
  event(room,'TRAIT_SELECTED',{playerId:player.id,traitId:command.traitId});return;
 }
 const branch=GROWTH_BRANCHES.find(b=>b.id===command.branch);
 if(!branch||command.expectedAttempt!==g.attemptSeq)fail('강화 상태가 변경됐습니다. 다시 확인하세요.','STALE_FORGE');
 const before=g.levels[branch.id],tier=growthTier(room.growthPolicy,before+1);
 if(!tier)fail('최대 +10 강화입니다.','MAX_LEVEL');
 if(player.credits<tier.cost)fail('강화 포인트가 부족합니다.','NOT_ENOUGH_POINTS');
 const success=growthRandom(room)*100<tier.chance;
 player.credits-=tier.cost;g.spent+=tier.cost;g.attemptSeq++;g.readyWave=-1;
 if(success){g.levels[branch.id]++;player.upgrades++;rebuildGrowthUnits(room,player);}
 const receipt={id:room.id+':forge:'+player.id+':'+g.attemptSeq,seq:g.attemptSeq,wave:room.wave,branch:branch.id,before,after:g.levels[branch.id],chance:tier.chance,cost:tier.cost,success,balance:player.credits};
 g.attempts.push(receipt);if(g.attempts.length>24)g.attempts.shift();
 event(room,'FORGE_RESULT',{playerId:player.id,receipt});
}
function beginWave(room) {
  room.wave++; room.phase = 'WAVE'; room.spawnQueue = []; room.spawnAt = room.time + (fastRoom(room) ? DEFENSE_TEMPO.firstSpawnMs : 800);
  const plan=room.encounter;
  const count = Math.max(3,Math.ceil((room.version>=3?3+Math.floor((room.wave-1)/8):4+Math.ceil(room.wave*.55))*plan.spawnPercent/100));
  const brief = defenseWaveBrief(room);
  const focus = brief?.focus ?? (room.wave - 1) % room.capacity;
  for (let round = 0; round < count; round++) for (let lane = 0; lane < room.capacity; lane++) {
    const available=plan.pool.slice(0,Math.min(plan.pool.length,2+Math.floor(room.wave/2)));
    const archetype=available[Math.floor(random(room)*available.length)];
    room.spawnQueue.push({ lane, archetype, type:defenseEnemy(archetype).kind });
    if (room.wave > (room.version>=3?6:2) && lane === focus && round === 2) room.spawnQueue.push({ lane, archetype:plan.elite,type:'ELITE' });
  }
  if(room.version>=3&&waveKind(room.wave)==='ELITE')room.spawnQueue.push({lane:focus,archetype:'CRAWLER',type:'ELITE'});
  if (brief?.kind === 'RUSH') {
    // Consecutive spawns produce a real pressure window rather than extending the tail of the wave.
    const extra = room.difficulty === 'GUIDE' ? 2 : room.difficulty === 'NORMAL' ? 3 : 4;
    room.spawnQueue.splice(room.capacity, 0, ...Array.from({length:extra}, () => ({lane:focus,archetype:'HOUND',type:'RUNNER'})));
  }
  if (brief?.kind === 'SIEGE') room.spawnQueue.splice(room.capacity, 0, {lane:focus,archetype:'BASTION',type:'ELITE'});
  const bossId=room.version>=3?(room.wave%10===0||room.wave===plan.waves?'NOX':null):room.wave===plan.waves?plan.boss:room.wave===Math.floor(plan.waves/2)?plan.midBoss:null;
  if(bossId)room.spawnQueue.push({lane:focus,archetype:bossId,type:'BOSS'});
  event(room, 'WAVE', { wave: room.wave, focus, bossId, brief });
}
function spawn(room, spec) {
  const art=defenseEnemy(spec.archetype),plan=room.encounter;
  const hp = Math.round((room.version>=3?68+room.wave*3.6:80+room.wave*16) * art.hp * plan.hpPercent/100 * (spec.type === 'BOSS' ? room.capacity / 2 : 1));
  const enemy = { id: `enemy-${++room.nextEnemyId}`, type: spec.type, archetype:art.id,name:art.name,lane: spec.lane, hp, maxHp: hp,
    x: WORLD.spawnX - (fastRoom(room) ? DEFENSE_TEMPO.spawnInset : 0) + random(room) * 70, y: laneY(spec.lane, room.capacity) + (random(room) - .5) * 60,
    speed: (33 + room.wave * (room.version>=3?.6:1.8)) * art.speed * plan.speedPercent/100 * (fastRoom(room) ? DEFENSE_TEMPO.speed : 1), attack: Math.round((room.version>=3?9+room.wave*.7:12+room.wave*2.5) * art.attack * plan.attackPercent/100 * (fastRoom(room) ? DEFENSE_TEMPO.attack : 1)),
    range:art.range||145,armor:art.armor||0,pattern:room.version>=3?(spec.type==='BOSS'?(room.wave===plan.waves?'TRIAD':room.wave%30===10?'BARRAGE':'RALLY'):art.id==='CRAWLER'?'BARRAGE':null):spec.type==='BOSS'?(art.pattern||'RUPTURE'):null,healAt:room.time+7000,patternAt:room.time+14000,cast:null,enraged:false,
    nextAttack: 0, slowUntil: 0, coreDamage: spec.type === 'BOSS' ? 240 : spec.type === 'ELITE' ? 55 : 18 };
  room.enemies.push(enemy); event(room, 'SPAWN', { targetId: enemy.id, lane: enemy.lane });
  if(spec.type==='BOSS')event(room,'BOSS_ENTER',{actorId:enemy.id,name:art.name,lane:enemy.lane,hint:art.hint||'방어선을 지키며 전술을 연계하세요.'});
}
function bossPattern(room,enemy,mercenary=null){
 if(!enemy.pattern)return;
 if(!enemy.enraged&&enemy.hp<enemy.maxHp*.4){enemy.enraged=true;enemy.attack=Math.round(enemy.attack*1.2);enemy.speed*=1.15;event(room,'BOSS_ENRAGE',{actorId:enemy.id,name:enemy.name,lane:enemy.lane});}
 if(enemy.cast&&room.time>=enemy.cast.endsAt){
  const lane=enemy.cast.lane;enemy.cast=null;
  if(enemy.pattern==='RALLY'){
   for(let i=0;i<3&&room.enemies.length<RULES.maxEnemies;i++)spawn(room,{archetype:room.version>=3?(i===2?'WEAVER':'HOUND'):'FROG',type:i===2&&room.version>=3?'SUPPORT':'RUNNER',lane});
  }else{
   let drained=0;for(const unit of room.units.filter(u=>u.hp>0&&!u.move&&u.lane===lane)){
    const threat = {GUIDE:.28,NORMAL:.4,HARD:.5,NIGHTMARE:.6,CATACLYSM:.7}[room.difficulty] || .4;
    const raw = fastRoom(room) ? Math.max(enemy.attack * 1.5, unit.maxHp * threat) : enemy.attack * 1.5;
    const requested=Math.round(raw*(unit.shieldUntil>room.time?.4:1));
    const damage=mercenary?mercenary.areaDamage(enemy,unit,requested).hpDamage:Math.min(unit.hp,requested);
    if(!mercenary)unit.hp-=damage;drained+=damage;
    event(room,'ENEMY_HIT',{actorId:enemy.id,targetId:unit.id,amount:damage});if(unit.hp<=0&&!mercenary)event(room,'UNIT_DOWN',{targetId:unit.id});
   }
   if(enemy.pattern==='DRAIN')enemy.hp=Math.min(enemy.maxHp,enemy.hp+drained);
  }
  event(room,'BOSS_CAST',{actorId:enemy.id,lane,pattern:enemy.pattern,x:WORLD.frontX,y:laneY(lane,room.capacity)});
 }
 if(!enemy.cast&&room.time>=enemy.patternAt&&enemy.x<WORLD.spawnX-300){
  const lane=enemy.pattern==='TRIAD'?(enemy.patternRound||0)%room.capacity:enemy.lane;
  enemy.patternRound=(enemy.patternRound||0)+1;enemy.cast={lane,endsAt:room.time+2500};enemy.patternAt=room.time+(enemy.enraged?9000:13000);
  event(room,'BOSS_WARNING',{actorId:enemy.id,name:enemy.name,lane,pattern:enemy.pattern,endsAt:enemy.cast.endsAt});
 }
}
function botThink(room) {
  for (const player of room.players.filter(p => p.bot)) {
    if(room.version>=3&&room.phase==='PREP'){
      const g=player.growth,offer=g.offers.find(o=>!o.selected);
      if(offer){const desired=['EXECUTE','PIERCE','QUICK','RECOVERY','MEDIC_CORE','BULWARK','ALLIANCE','BARRICADE'].find(id=>offer.choices.includes(id)&&!g.traits.includes(id));if(desired)growthCommand(room,player,{type:'TRAIT',wave:room.wave,offerId:offer.id,traitId:desired});}
      const branch=['ATTACK','VITAL','TACTIC'].filter(id=>g.levels[id]<10).sort((a,b)=>(g.levels[a]+(a==='ATTACK'?0:a==='VITAL'?2:3))-(g.levels[b]+(b==='ATTACK'?0:b==='VITAL'?2:3)))[0];
      const tier=branch&&growthTier(room.growthPolicy,g.levels[branch]+1);
      if(tier&&player.credits>=tier.cost)growthCommand(room,player,{type:'FORGE',wave:room.wave,branch,expectedAttempt:g.attemptSeq});
      else g.readyWave=room.wave;
      continue;
    }
    if (player.reviveAt) continue;
    if (room.phase === 'PREP' && player.credits >= 100 + player.upgrades * 50 && player.upgrades < 5) {
      commandRoom(room, player.id, { type: 'UPGRADE' });
    }
    if (room.phase !== 'WAVE') continue;
    for (const unit of room.units.filter(u => u.ownerId === player.id && u.hp > 0 && !u.move)) {
      const near = room.enemies.some(e => e.hp > 0 && e.lane === unit.lane && distance(e,unit) < 720);
      const incoming = room.enemies.some(e => e.cast?.lane === unit.lane && e.cast.endsAt > room.time);
      const useful = !fastRoom(room) || !['GUARD','CAPTAIN'].includes(unit.role) || near || incoming;
      if (useful && unit.skillReadyAt <= room.time) try { useSkill(room, unit); } catch { /* No eligible target. */ }
      const pressure = LANES.slice(0, room.capacity).map((_, lane) => room.enemies.filter(e => e.hp > 0 && e.lane === lane && e.x < WORLD.pressureX).length);
      const urgent = pressure.indexOf(Math.max(...pressure));
      if (unit.slot === 1 && unit.moveReadyAt <= room.time && urgent !== unit.lane && pressure[urgent] >= pressure[unit.lane] + 3)
        commandRoom(room, player.id, { type: 'MOVE', unitId: unit.id, lane: urgent });
    }
  }
}
function tick(room,mercenary=null) {
  if (!active(room)) return;
  room.time += RULES.tickMs;
  if (room.coreHp <= 0) return finish(room, false);
  recoverDueSquads(room);
  for (const unit of room.units) if (unit.move) {
    const progress = Math.min(1, (room.time - unit.move.startedAt) / RULES.moveMs);
    unit.x = unit.move.fromX + (unit.move.x - unit.move.fromX) * progress;
    unit.y = unit.move.fromY + (unit.move.y - unit.move.fromY) * progress;
    if (progress >= 1) { unit.lane = unit.move.lane; unit.move = null; if(unit.lane!==unit.ownerLane&&hasTrait(room.players.find(p=>p.id===unit.ownerId),'ALLIANCE')){unit.supportUntil=room.time+8000;unit.shieldUntil=Math.max(unit.shieldUntil,room.time+4000);} }
  }
  if (room.time >= room.nextBotThink) { room.nextBotThink = room.time + 1000; botThink(room); }
  if (room.phase === 'PREP') { if(room.version>=3&&room.time-room.prepStartedAt>=3000&&room.players.every(p=>p.growth.readyWave===room.wave))room.phaseUntil=room.time; if (room.time >= room.phaseUntil) beginWave(room); return; }
  if (room.spawnQueue.length && room.time >= room.spawnAt && room.enemies.length < RULES.maxEnemies) {
    spawn(room, room.spawnQueue.shift()); room.spawnAt = room.time + Math.round((fastRoom(room) ? DEFENSE_TEMPO.spawnMs : 1450) / room.capacity);
  }
  for (const unit of room.units) {
    if (unit.hp <= 0 || unit.move || room.time < unit.nextAttack) continue;
    const enemies = room.enemies.filter(e => e.hp > 0 && e.lane === unit.lane && distance(unit, e) <= unit.range).sort((a, b) => a.x - b.x);
    const skillReach=room.enemies.some(e=>e.hp>0&&e.lane===unit.lane&&distance(unit,e)<=unit.range+300);
    const needsHeal=unit.role==='HEALER'&&room.units.some(u=>u.hp>0&&u.hp<u.maxHp&&u.lane===unit.lane&&!u.move);
    if(mercenary&&(skillReach||needsHeal)){
      unit.nextAttack=room.time+unit.interval/(unit.supportUntil>room.time?1.2:1);
      const used=mercenary.action(unit);
      if(used||unit.hp<=0){unit.nextAttack=room.time+unit.interval;continue;}
    }
    if (unit.role === 'HEALER') {
      const friend = room.units.filter(u => u.hp > 0 && u.hp < u.maxHp && !u.move && u.lane === unit.lane).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (friend) { healUnit(room, friend, 28, unit);mercenary?.afterHeal(unit,friend); unit.nextAttack = room.time + unit.interval/(unit.supportUntil>room.time?1.2:1); continue; }
    }
    if (!enemies.length) continue;
    unit.nextAttack = room.time + unit.interval/(unit.supportUntil>room.time?1.2:1);
    hurtEnemy(room, enemies[0], unit.attack * (unit.buffUntil > room.time ? 1.35 : 1), unit,mercenary);
    if(unit.role==='RANGED'&&enemies[1]&&hasTrait(room.players.find(p=>p.id===unit.ownerId),'PIERCE'))hurtEnemy(room,enemies[1],unit.attack*.6,unit);
  }
  for (const enemy of room.enemies) {
    if (enemy.hp <= 0 || enemy.suppressedUntil > room.time) continue;
    bossPattern(room,enemy,mercenary);
    if(room.version>=3&&enemy.archetype==='WEAVER'&&room.time>=enemy.healAt){enemy.healAt=room.time+7000;for(const ally of room.enemies.filter(e=>e.hp>0&&e.lane===enemy.lane&&Math.abs(e.x-enemy.x)<600).slice(0,4)){const amount=Math.min(ally.maxHp-ally.hp,Math.round(ally.maxHp*.07));ally.hp+=amount;if(amount)event(room,'ENEMY_HEAL',{actorId:enemy.id,targetId:ally.id,amount});}}
    const blocker = room.units.filter(u => u.hp > 0 && !u.move && u.lane === enemy.lane && distance(u, enemy) < (enemy.range||145))
      .sort((a, b) => distance(a, enemy) - distance(b, enemy))[0];
    if (blocker) {
      if (room.time >= enemy.nextAttack) {
        enemy.nextAttack = room.time + 1400;
        const requested = Math.round(enemy.attack * (blocker.shieldUntil > room.time ? .28 : 1));
        const damage=mercenary?mercenary.enemyBasic(enemy,blocker,requested).hpDamage:requested;
        if(!mercenary)blocker.hp = Math.max(0, blocker.hp - damage);
        room.players.find(p => p.id === blocker.ownerId).stats.blocked += enemy.attack - damage;
        event(room, 'ENEMY_HIT', { actorId: enemy.id, targetId: blocker.id, amount: damage });
        if (blocker.hp <= 0 && !mercenary) event(room, 'UNIT_DOWN', { targetId: blocker.id });
      }
      // Keep firing while closing a range gap. A healer can sustain this target
      // indefinitely, so only a living damage dealer able to retaliate holds us.
      const canRetaliate = room.units.some(u => u.hp > 0 && !u.move && u.role !== 'HEALER' &&
        u.lane === enemy.lane && distance(u, enemy) <= u.range);
      if (canRetaliate) continue;
    }
    const speed = enemy.speed * (room.version>=3&&enemy.x<WORLD.mergeX&&room.players.some(p=>hasTrait(p,'BARRICADE'))?.8:1) * (enemy.slowUntil > room.time ? .45 : 1) * RULES.tickMs / 1000;
    enemy.x -= speed;
    if (enemy.x < WORLD.mergeX) enemy.y += Math.sign(WORLD.coreY - enemy.y) * Math.min(Math.abs(WORLD.coreY - enemy.y), speed * 1.1);
    // The common fallback area lets every lane's ranged unit intercept a leak.
    if (enemy.x < WORLD.mergeX && Math.abs(enemy.y - WORLD.coreY) < 90) {
      for (const unit of room.units.filter(u => u.hp > 0 && !u.move && u.range >= 400 && room.time >= u.nextAttack)) {
        unit.nextAttack = room.time + unit.interval/(unit.supportUntil>room.time?1.2:1); hurtEnemy(room, enemy, unit.attack, unit);
        if (enemy.hp <= 0) break;
      }
    }
    if (enemy.hp > 0 && enemy.x <= WORLD.coreX + 65) {
      room.coreHp = Math.max(0, room.coreHp - enemy.coreDamage); enemy.hp = 0;
      event(room, 'BREACH', { amount: enemy.coreDamage, lane: enemy.lane });
    }
  }
  room.enemies = room.enemies.filter(e => e.hp > 0);
  if (room.coreHp <= 0) return finish(room, false);
  scheduleSquadRevives(room);
  if (!room.spawnQueue.length && !room.enemies.length) {
    // Every participant receives the same temporary resource, irrespective of last hits.
    if(room.version>=3)settleWaveGrowth(room);else room.players.forEach(p => { p.credits += RULES.waveCredit; });
    event(room, 'WAVE_CLEAR', { wave: room.wave, credits: room.version>=3?null:RULES.waveCredit });
    if (room.wave >= room.encounter.waves) return finish(room, true);
    room.phase = 'PREP'; room.prepStartedAt=room.time; room.phaseUntil = room.time + prepDuration(room);
    room.units.forEach(u => {
      if (room.players.find(p => p.id === u.ownerId).reviveAt) return;
      u.hp = u.hp <= 0 ? Math.round(u.maxHp * .7) : Math.min(u.maxHp, u.hp + Math.round(u.maxHp * (hasTrait(room.players.find(p=>p.id===u.ownerId),'RECOVERY')?.4:.25)));
    });
  }
}
export function advanceRoom(room, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 60000) fail('잘못된 서버 시간입니다.');
  const mercenary=active(room)?defenseMercenaryRuntime(room,(type,data)=>event(room,type,data)):null;
  for (let i = 0; i < Math.floor(elapsedMs / RULES.tickMs) && active(room); i++) tick(room,mercenary);
  mercenary?.save();
  return room;
}
export function publicSnapshot(room, after = 0) {
  return { version:room.version,mercenarySkillRevision:room.mercenarySkillRevision||0,tempoRevision:room.tempoRevision||0,waveBrief:defenseWaveBrief(room),accountRoster:room.accountRoster===true,growthPolicy:structuredClone(room.growthPolicy||null),id: room.id, capacity: room.capacity, practice: room.practice, hostId: room.hostId, phase: room.phase,
    difficulty:room.difficulty,difficultyName:room.encounter.name,time: room.time, wave: room.wave, totalWaves: room.encounter.waves, phaseUntil: room.phaseUntil, prepStartedAt:room.prepStartedAt,
    coreHp: room.coreHp, coreMaxHp: room.coreMaxHp, units: structuredClone(room.units), enemies: structuredClone(room.enemies),
    players: room.players.map(player=>{const p=structuredClone(player);if(p.growth){p.growth.draws=p.growth.draws.slice(-6);p.growth.attempts=p.growth.attempts.slice(-4);}return p;}), seq: room.seq, events: structuredClone(room.events.filter(e => e.seq > after)),
    waitingEnemies: room.spawnQueue.length, rewardsEnabled: false, completedAt: room.completedAt };
}
