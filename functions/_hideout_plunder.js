import {hideoutPlunderEnabled, readHideout} from './_personal_hideout.js';
import {HIDEOUT_KEY, HIDEOUT_STAGES, HIDEOUT_STOCK_LIMITS, raidResidenceSnapshot} from '../shared/personal-hideout-v1.mjs';
import {HIDEOUT_DEFENSES, RAID_VICTORY_ITEMS, RAID_VICTORY_PIG_COINS} from '../shared/hideout-defense-v1.mjs';
import {TROPHY_CATALOG} from '../js/player-card-model-v2052.js?v=20261101-renewal1';
import {ensurePigCoinWallet} from './_loot_shop.js';
import {ensureGarageTuning} from './_garage_tuning.js';
import {jointInventoryChange} from './_joint_transactions.js';
import {raidPigCoinRewardStatements} from './_raid_pig_rewards.js';
import {PLUNDER, plunderWindow, assignPlunderTeams, plunderTransfer} from '../shared/hideout-plunder-v1.mjs';
import {ensureJointAtomicSchema, jointGuard, jointGuardEnd} from './_joint_atomic.js';
import {readJointBody, jointError} from './_joint_request.js';
import {pvpDeckGradeAllowed} from './_pvp_deck_policy.js';
import {territoryFormationSnapshot, simulateTerritoryDuel} from './_territory_war.js';
import {pvpReplayInput} from '../shared/pvp-power-balance-v1.mjs';

const dayKey = day => 'hideout_plunder_day_v1:' + day;
const deckKey = (day, uid) => 'hideout_plunder_deck_v1:' + day + ':' + uid;
const receiptKey = (uid, requestId) => 'hideout_plunder_receipt_v1:' + uid + ':' + requestId;
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
const fail = (code, message, status = 409) => { throw jointError('HIDEOUT_' + code, message, status); };
const record = async (db, key) => (await stmt(db, 'SELECT value FROM app_meta WHERE key=?', key).first())?.value ?? null;
const insert = (db, key, value) => stmt(db, 'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)', key, JSON.stringify(value));
const clock = deps => deps.now ? deps.now() : Date.now();
const boardAttempts = 10;
const parseBoard = raw => raw ? JSON.parse(raw) : {members: [], score: {A: 0, B: 0}, history: []};

// Verify our own token after every conditional write, even on an empty day.
// All checks, both balances, and the receipt are in one DB.batch transaction.
function compareAndSet(db, key, before, state) {
  const token = crypto.randomUUID();
  const next = JSON.stringify({...state, mutationToken: token});
  const write = before === null
    ? stmt(db, 'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING', key, next)
    : stmt(db, 'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?', next, key, before);
  return [write, jointGuard(db, token, 'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)', [key, next]), jointGuardEnd(db, token)];
}

function checkWindow(deps, day, mustBeOpen) {
  const window = plunderWindow(clock(deps));
  if (window.day !== day || window.open !== mustBeOpen)
    fail('RAID_TIME', mustBeOpen ? '은신처 약탈전은 한국시간 20:30부터 22:00까지입니다.' : '은신처 수리는 약탈전 종료 후에 가능합니다.');
  return window;
}

function timeGuard(db, deps, window, open) {
  const now = clock(deps);
  const ms = deps.now ? 'CAST(? AS BIGINT)' : db.dialect === 'postgres'
    ? 'CAST(FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000) AS BIGINT)'
    : "CAST(strftime('%s','now') AS INTEGER) * 1000";
  const token = crypto.randomUUID();
  const midnight = Date.parse(window.day + 'T00:00:00+09:00');
  const period = open ? [window.startsAt, window.endsAt] : now < window.startsAt
    ? [midnight, window.startsAt] : [window.endsAt, midnight + 86400000];
  const args = [...(deps.now ? [now] : []), period[0], period[1]-1];
  return [jointGuard(db, token, ms + ' BETWEEN ? AND ?', args), jointGuardEnd(db, token)];
}

async function enlistment(env, deps, user) {
  const [deck, settings] = await Promise.all([deps.pvpDeckSnapshot(env, user.id), deps.battleSettings(env)]);
  if (!pvpDeckGradeAllowed(deck) || new Set(deck.map(c => String(c.id))).size !== 5)
    fail('RAID_DECK', 'PvP 덱에 출전 가능한 서로 다른 일반 카드 5장을 편성하세요.');
  const formation = await territoryFormationSnapshot(env, deps, user, deck, settings);
  return {
    user_id: Number(user.id), nickname: user.nickname, role: user.role, deck_power: formation.formationPower,
    loadout_bonus_json: JSON.stringify(formation.loadoutBonus),
    currentCards: deck.map(c => ({...c, power: deps.cardBattlePower(c, c.breakthrough_level, settings)}))
  };
}

function defenseSnapshot(home, onlyDefenseRoom = false) {
  const layout = raidResidenceSnapshot(home);
  if (onlyDefenseRoom) {
    layout.rooms = layout.rooms.filter(r => r.code === layout.defenseRoom);
    layout.pieces = layout.pieces.filter(p => p.room === layout.defenseRoom);
  }
  const displayed = new Set(layout.pieces.flatMap(p => p.trophyCodes || []).filter(Boolean));
  if (displayed.size) layout.trophyArt = Object.fromEntries(TROPHY_CATALOG.filter(t => displayed.has(t.code)).map(t => [t.code, t.art]));
  return layout;
}

async function readStatus(env, deps, user, selectedId) {
  const now = clock(deps), window = plunderWindow(now);
  const [raw, home] = await Promise.all([record(env.DB, dayKey(window.day)), readHideout(env, user.id)]);
  const board = parseBoard(raw), mine = board.members.find(p => p.id === Number(user.id));
  const counts = {A: 0, B: 0, waiting: 0};
  for (const p of board.members) counts[p.team || 'waiting']++;
  const enemies = mine?.team && window.open ? board.members.filter(p => p.team && p.team !== mine.team) : [];
  const target = enemies.find(p => p.id === selectedId) || enemies.find(p => p.durability > 0 && p.protectedUntil <= now) || enemies[0];
  const targetHome = target ? (await readHideout(env, target.id)).state : null;
  const scout = targetHome?.level ? {targetId: target.id, layout: defenseSnapshot(targetHome, true)} : null;
  return {ok: true, now, window, rules: PLUNDER, counts, score: board.score, mine: mine ?? null,
    durability: home.state.durability, level: home.state.level,
    repairAvailable: home.state.parts.STEEL >= PLUNDER.repairSteel && home.state.parts.WIRE >= PLUNDER.repairWire,
    enemies, scout,
    history: mine ? board.history : []};
}

function checkAttack(board, uid, target, now) {
  const attacker = board.members.find(p => p.id === uid), defender = board.members.find(p => p.id === target);
  if (!attacker?.team) fail('RAID_MEMBER', '두 진영 배정이 완료된 참가자만 출격할 수 있습니다.', 403);
  if (!defender?.team || defender.team === attacker.team) fail('RAID_TARGET', '참가 중인 상대 진영의 은신처를 선택하세요.');
  if (!attacker.durability || !defender.durability) fail('RAID_BREACHED', '함락된 은신처에서는 출격하거나 교전할 수 없습니다.');
  if (attacker.readyAt > now || defender.protectedUntil > now) fail('RAID_COOLDOWN', '재출격 또는 상대 은신처의 보호 시간이 남았습니다.', 429);
  return {attacker, defender};
}

async function simulate(env, deps, user, day, target, seed, layout) {
  const decks = await Promise.all([user.id, target].map(id => record(env.DB, deckKey(day, id))));
  if (decks.some(raw => !raw)) fail('RAID_DECK', '참가 편성을 불러오지 못했습니다.', 503);
  const [a, b] = decks.map(raw => JSON.parse(raw));
  const defenses=HIDEOUT_DEFENSES.filter(f=>layout.pieces.some(p=>p.room===layout.defenseRoom&&p.code===f.code)).map(f=>f.code);
  return simulateTerritoryDuel(env, deps, user, a, b, day, seed, defenses);
}

async function savedResult(db, deps, key, input) {
  const raw = await record(db, key);
  if (!raw) return null;
  const saved = JSON.parse(raw);
  if (saved.input !== input) fail('RAID_REQUEST', '이미 다른 작업에 사용한 요청 번호입니다.');
  const response = {...saved.response, replayed: true};
  if (saved.replayInput) {
    try {
      const battle = deps.createPvpBattleV2({...pvpReplayInput(saved.replayInput),hideoutDefenseVersion:saved.replayInput.hideoutDefenseVersion??1});
      if (battle.result.winner === response.winner) response.battleV2 = battle;
    } catch {
      // A later engine release can retire an old replay. The receipt is final.
    }
  }
  return response;
}

async function mutate(env, deps, user, action, body) {
  if (typeof body.requestId !== 'string' || !/^[\w-]{16,100}$/.test(body.requestId) ||
      typeof body.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.day))
    fail('RAID_INPUT', '요청 번호와 행사일을 확인하세요.', 400);
  const uid = Number(user.id), target = body.targetId, db = env.DB;
  if (action === 'attack' && (!Number.isSafeInteger(target) || target < 1 || target === uid))
    fail('RAID_TARGET', '상대 은신처를 선택하세요.', 400);
  const key = receiptKey(uid, body.requestId), input = JSON.stringify([action, body.day, target ?? null]);
  const previous = await savedResult(db, deps, key, input);
  if (previous) return previous;
  try {
    return await applyMutation(env, deps, user, action, body, key, input);
  } catch (error) {
    // Another delivery of this request may already have advanced the cooldown
    // between our receipt lookup and validation of the latest board.
    const committed = await savedResult(db, deps, key, input);
    if (committed) return committed;
    throw error;
  }
}

async function applyMutation(env, deps, user, action, body, key, input) {
  const uid = Number(user.id), target = body.targetId, db = env.DB;
  await ensureJointAtomicSchema(env);
  let formation, simulation, simulatedHome, layout;
  const seed=action==='attack'?crypto.getRandomValues(new Uint32Array(1))[0]:null;
  for (let attempt = 0; attempt < boardAttempts; attempt++) {
    const window = checkWindow(deps, body.day, action !== 'repair');
    const raw = action === 'repair' ? null : await record(db, dayKey(body.day));
    const board = parseBoard(raw), writes = [];
    let response = {ok: true, action}, replayInput;
    if (action === 'join') {
      if (board.members.some(p => p.id === uid)) fail('RAID_JOINED', '이미 오늘 약탈전에 참가했습니다.');
      const home = await readHideout(env, uid);
      if (!home.state.level || !home.state.durability) fail('RAID_HOME', '개방하고 내구도가 남은 은신처가 필요합니다.');
      formation ??= await enlistment(env, deps, user);
      board.members.push({id: uid, name: user.nickname, team: null, power: formation.deck_power,
        level: home.state.level, durability: home.state.durability, readyAt: 0, protectedUntil: 0});
      assignPlunderTeams(board.members);
      writes.push(insert(db, deckKey(body.day, uid), formation));
    } else if (action === 'repair') {
      const home = await readHideout(env, uid), state = home.state;
      if (!state.level || state.durability >= PLUNDER.maxDurability) fail('RAID_REPAIR', '수리할 은신처 피해가 없습니다.');
      if (state.parts.STEEL < PLUNDER.repairSteel || state.parts.WIRE < PLUNDER.repairWire)
        fail('RAID_PARTS', '수리에 필요한 회수 철판과 구리 배선이 부족합니다.');
      state.parts.STEEL -= PLUNDER.repairSteel;
      state.parts.WIRE -= PLUNDER.repairWire;
      state.durability = Math.min(PLUNDER.maxDurability, state.durability + PLUNDER.repairPoints);
      state.revision++;
      writes.push(...compareAndSet(db, HIDEOUT_KEY(uid), home.raw, state));
      response.durability = state.durability;
    } else {
      const {attacker, defender} = checkAttack(board, uid, target, clock(deps));
      const [a, d] = await Promise.all([readHideout(env, uid), readHideout(env, target)]);
      if (!a.state.level || !d.state.level || !a.state.durability || !d.state.durability)
        fail('RAID_BREACHED', '은신처 상태가 변경되었습니다. 전황을 갱신하세요.');
      if(simulatedHome!==d.raw){
        layout=defenseSnapshot(d.state);
        simulation=await simulate(env,deps,user,body.day,target,seed,layout);
        simulatedHome=d.raw;
      }
      const now = clock(deps), winner = simulation.battleV2.result.winner;
      const before = d.state.durability, won = winner === 'A';
      attacker.readyAt = now + PLUNDER.cooldownMs;
      let loot = {};
      if (won) {
        loot = plunderTransfer(a.state, d.state, HIDEOUT_STOCK_LIMITS);
        d.state.durability = Math.max(0, before - PLUNDER.damage);
        defender.durability = d.state.durability;
        defender.protectedUntil = now + PLUNDER.protectionMs;
        d.state.revision++;
        writes.push(...compareAndSet(db, HIDEOUT_KEY(target), d.raw, d.state));
        if (Object.keys(loot).length) {
          a.state.revision++;
          writes.push(...compareAndSet(db, HIDEOUT_KEY(uid), a.raw, a.state));
        }
      } else {
        const token=crypto.randomUUID();
        writes.push(jointGuard(db,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[HIDEOUT_KEY(target),d.raw]),jointGuardEnd(db,token));
      }
      if (winner === 'A' || winner === 'B') board.score[won ? attacker.team : defender.team]++;
      let victoryReward=null;
      if(winner==='A'||winner==='B'){
        await ensureGarageTuning(env);
        await ensurePigCoinWallet(env);
        const winnerId=won?uid:target;
        const ref=body.day+':'+uid+':'+body.requestId;
        const balance=Number((await stmt(db,'SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=?',winnerId).first())?.balance||0);
        const coins=Math.min(RAID_VICTORY_PIG_COINS,Math.max(0,1000000000000-balance));
        const token=crypto.randomUUID();
        writes.push(jointGuard(db,token,'COALESCE((SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=?),0)=?',[winnerId,balance]),jointGuardEnd(db,token));
        for(const item of RAID_VICTORY_ITEMS)writes.push(...jointInventoryChange(db,winnerId,item.code,item.quantity,'은신처 약탈전 승리',ref));
        writes.push(...raidPigCoinRewardStatements(env,{userId:winnerId,source:'HIDEOUT_PLUNDER',roomId:ref,amount:coins,
          guardSql:'EXISTS(SELECT 1 FROM app_meta WHERE key=?)',guardBindings:[deckKey(body.day,winnerId)],at:now}));
        victoryReward={userId:winnerId,name:won?attacker.name:defender.name,pigCoins:coins,items:RAID_VICTORY_ITEMS};
      }
      const event = {at: now, attacker: attacker.name, defender: defender.name, winner, loot,
        before, after: d.state.durability, stage: HIDEOUT_STAGES[d.state.level - 1].code,victoryReward,
        ...(simulation.battleV2.result.hideoutTurret?{turretHp:simulation.battleV2.result.hideoutTurret}:{})};
      board.history = [event, ...board.history].slice(0, 24);
      response = {...response, ...event, residenceLayout:layout, attackerWon: won, opponent: {id: target, nickname: defender.name},
        attackerPower: simulation.attackerPower, defenderPower: simulation.defenderPower};
      replayInput = simulation.replayInput;
    }
    checkWindow(deps, body.day, action !== 'repair');
    if (action !== 'repair') writes.unshift(...compareAndSet(db, dayKey(body.day), raw, board));
    writes.push(insert(db, key, {input, response, replayInput}), ...timeGuard(db, deps, window, action !== 'repair'));
    try {
      await db.batch(writes);
      return simulation ? {...response, battleV2: simulation.battleV2} : response;
    } catch (error) {
      const saved = await savedResult(db, deps, key, input);
      if (saved) return saved;
      if (!/joint_atomic_guards|CHECK constraint failed: verified\s*=\s*1|unique|duplicate|serialization|deadlock/i.test(error.message)) throw error;
      if (attempt + 1 < boardAttempts) {
        // Spread bursts of simultaneous enlistments across different retries.
        // No account or reward is visible until the guarded batch succeeds.
        const backoff = Math.min(450, 16 * 2 ** attempt);
        await new Promise(resolve => setTimeout(resolve, backoff/2 + Math.random()*backoff));
      }
    }
  }
  fail('RAID_BUSY', '다른 참가자의 신청을 처리 중입니다. 같은 요청으로 다시 확인하세요.', 503);
}

export async function handleHideoutPlunder({path, request, env, deps}) {
  if (path !== 'hideout/raid' && !path.startsWith('hideout/raid/')) return null;
  const reply = (data, status = 200) => deps.json(data, status, {'cache-control': 'private, no-store'});
  try {
    if (!hideoutPlunderEnabled(env))
      return reply({enabled:false, code:'HIDEOUT_RAID_OFF', error:'은신처 약탈전은 현재 비공개입니다.'}, 423);
    const user = await deps.authenticate(request, env);
    if (!user) return reply({error: '로그인이 필요합니다.'}, 401);
    if (request.method === 'GET' && path === 'hideout/raid') return reply(await readStatus(env, deps, user, Number(new URL(request.url).searchParams.get('target'))));
    const action = path.slice('hideout/raid/'.length);
    if (request.method !== 'POST' || !['join', 'attack', 'repair'].includes(action))
      return reply({error: '지원하지 않는 은신처 약탈전 요청입니다.'}, 405);
    const fields = action === 'attack' ? ['requestId', 'day', 'targetId'] : ['requestId', 'day'];
    const body = await readJointBody(request, {fields});
    return reply(await deps.withUserMutationLock(env, user.id, path, () => mutate(env, deps, user, action, body)));
  } catch (error) {
    if (/^(HIDEOUT|JOINT)_/.test(error.code || '')) return reply({error: error.message, code: error.code},
      error.code === 'JOINT_LOCK_BUSY' ? 503 : error.status || 400);
    console.error('[hideout plunder]', error.name);
    return reply({error: '약탈전 연결을 확인하고 같은 요청으로 다시 시도하세요.'}, 503);
  }
}
