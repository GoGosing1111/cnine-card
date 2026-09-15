import { coupSettings, advanceFront, deadlineWinner, trialVerdict, PALACE_NODES, coupRebelDefeatPolicy, coupMatchedOpponent } from '../shared/coup-palace-v2115.mjs';
import { currentCoupFormation, currentCoupOpponents } from './_coup_matchmaking.js';
import { ensureCoupSchema, chiefMetaLock, chiefDuty, chiefAuthorityGuard } from './_coup_schema.js';
import { coupEnergy, chooseNuclearTargets, COUP_CHIEF_SKILLS, COUP_REBEL_SKILLS, coupRebelCommanderId, coupSkillCooldown, COUP_NUCLEAR_BLOCK_MS, COUP_ENERGY_MAX, COUP_ENERGY_RECOVERY_MS } from '../shared/coup-chief-skills-v2118.mjs';
import { ensureClanCampSchema, CLAN_CAMP_HOURS } from './_clan_prison_camp.js';
import { simulateTerritoryDuel, territoryFormationSnapshot, territorySiegeDamage } from './_territory_war.js';
import { readRuntimeData, cacheRuntimeData } from './_runtime_data_cache.js';

const SETTINGS = 'coup_settings_v2115';
export const COUP_SKILL_SETTINGS = 'coup_chief_skill_settings_v2118';
async function readCoupSkillSettings(env) {
 const raw = parse((await p(env, 'SELECT value FROM app_meta WHERE key=?', COUP_SKILL_SETTINGS).first())?.value);
 return { nuclearEnabled: raw.nuclearEnabled === true };
}
const parse = (s, fallback = {}) => { try { return JSON.parse(s) ?? fallback; } catch { return fallback; } };
const all = r => r?.results || [];
const p = (env, sql, ...values) => env.DB.prepare(sql).bind(...values);
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const sqlTime = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const getRound = (env, id) => p(env, 'SELECT * FROM coup_rounds_v2115 WHERE id=?', id).first();
const clearGuard = (env, token) => p(env, 'DELETE FROM coup_atomic_guard_v2115 WHERE id=?', token);
function guard(env, token, query, ...args) {
  return p(env, `INSERT INTO coup_atomic_guard_v2115(id,ok) SELECT ?,CASE WHEN EXISTS(${query}) THEN 1 ELSE 0 END`, token, ...args);
}
function roundClaim(env, round, token, condition = '', args = [], compareRevision = true) {
  return [p(env, `UPDATE coup_rounds_v2115 SET revision=revision+1,token=? WHERE id=? ${compareRevision ? 'AND revision=?' : ''} ${condition}`, token, round.id, ...(compareRevision ? [round.revision] : []), ...args),
    guard(env, token, 'SELECT 1 FROM coup_rounds_v2115 WHERE id=? AND token=?', round.id, token)];
}
async function atomic(env, statements) {
  try { return await env.DB.batch(statements); }
  catch (e) {
    if (/coup_atomic_guard|check constraint|UNIQUE constraint|duplicate key/i.test(String(e.message))) fail('전황이 변경되었거나 이미 처리된 요청입니다. 현황을 새로 확인하세요.');
    throw e;
  }
}
export async function readCoupSettings(env) {
  return coupSettings(parse((await p(env, 'SELECT value FROM app_meta WHERE key=?', SETTINGS).first())?.value));
}
async function currentChief(env, now) {
  const a = parse((await p(env, "SELECT value FROM app_meta WHERE key='chief_appointment_v1'").first())?.value);
  const user = a.userId && await p(env, "SELECT id,nickname FROM users WHERE id=? AND status='ACTIVE'", a.userId).first();
  const duty = await chiefDuty(env, a.id);
  if (!user || !a.id || !(Date.parse(a.startsAt) <= now && Date.parse(a.endsAt) > now) || ['OPEN', 'REMOVED'].includes(duty?.status)) fail('재직 중인 족장이 있어야 쿠데타를 개설할 수 있습니다.');
  return { ...a, nickname: user.nickname };
}
export async function openCoupRound(env, now = Date.now()) {
  await ensureCoupSchema(env);
  const [a, cfg] = await Promise.all([currentChief(env, now), readCoupSettings(env)]);
  if (await p(env, "SELECT 1 FROM coup_trials_v2115 WHERE status='OPEN'").first()) fail('진행 중인 재판이 끝난 뒤 다음 쿠데타를 개설하세요.');
  const id = crypto.randomUUID(), token = crypto.randomUUID();
  await atomic(env, [chiefMetaLock(env),
    guard(env, token, `SELECT 1 FROM app_meta WHERE key='chief_appointment_v1' AND json_extract(value,'$.id')=?
      AND NOT EXISTS(SELECT 1 FROM coup_trials_v2115 WHERE status='OPEN')
      AND NOT EXISTS(SELECT 1 FROM chief_duty_cases_v2115 WHERE appointment_id=? AND status IN ('OPEN','REMOVED'))`, a.id, a.id),
    p(env, `INSERT INTO coup_rounds_v2115(id,status,chief_user_id,appointment_id,chief_name,settings_json,created_at,chief_hp,rebel_hp,max_hp)
      VALUES(?,'RECRUITING',?,?,?,?,?,?,?,?)`, id, a.userId, a.id, a.nickname, JSON.stringify(cfg), now, cfg.siegeHp, cfg.siegeHp, cfg.siegeHp), clearGuard(env, token)]);
  return getRound(env, id);
}
export async function startCoupRound(env, id, now = Date.now()) {
  const round = await getRound(env, id); if (!round || round.status !== 'RECRUITING') fail('모집 중인 쿠데타를 선택하세요.');
  const chief = await currentChief(env, now); if (chief.id !== round.appointment_id) fail('족장이 변경되었습니다. 모집을 취소하고 새 쿠데타를 개설하세요.');
  const cfg = coupSettings(parse(round.settings_json)), token = crypto.randomUUID();
  await atomic(env, [chiefMetaLock(env), ...roundClaim(env, round, token, "AND status='RECRUITING'", [], false),
    guard(env, token + ':teams', `SELECT 1 FROM app_meta WHERE key='chief_appointment_v1' AND json_extract(value,'$.id')=?
      AND (SELECT COUNT(DISTINCT side) FROM coup_participants_v2115 WHERE round_id=?)=2
      AND NOT EXISTS(SELECT 1 FROM chief_duty_cases_v2115 WHERE appointment_id=? AND status IN ('OPEN','REMOVED'))`, round.appointment_id, id, round.appointment_id),
    p(env, "UPDATE coup_rounds_v2115 SET status='ACTIVE',starts_at=?,ends_at=? WHERE id=?", now, now + cfg.battleMinutes * 60000, id),
    clearGuard(env, token + ':teams'), clearGuard(env, token)]);
  return getRound(env, id);
}
export async function joinCoupRound(env, deps, user, body, now = Date.now()) {
  const round = await getRound(env, String(body.roundId || ''));
  if (!round || round.status !== 'RECRUITING') fail('현재 참가 신청을 받고 있지 않습니다.');
  const side = String(body.side || '');
  if (!['CHIEF', 'REBEL'].includes(side) || body.acceptPenalty !== true) fail('진영과 패배 시 불이익을 확인한 뒤 참가하세요.', 400);
  if (Number(user.id) === Number(round.chief_user_id) && side !== 'CHIEF') fail('현 족장은 족장팀으로만 참가할 수 있습니다.', 400);
  const existing = await p(env, 'SELECT side FROM coup_participants_v2115 WHERE round_id=? AND user_id=?', round.id, user.id).first();
  if (existing) { if (existing.side !== side) fail('참가 확정 후에는 진영을 바꿀 수 없습니다.'); return { ok: true }; }
  const [deck, battle] = await Promise.all([deps.pvpDeckSnapshot(env, user.id), deps.battleSettings(env)]);
  if (deck.length !== 5 || new Set(deck.map(c => String(c.id))).size !== 5) fail('PVP 덱에 일반 카드 5장을 편성한 뒤 참가하세요.', 400);
  const formation = await territoryFormationSnapshot(env, deps, user, deck, battle), token = crypto.randomUUID();
  await atomic(env, [...roundClaim(env, round, token, "AND status='RECRUITING'", [], false),
    p(env, `INSERT INTO coup_participants_v2115(round_id,user_id,side,deck_snapshot,loadout_bonus_json,deck_power,joined_at) VALUES(?,?,?,?,?,?,?)`,
      round.id, user.id, side, JSON.stringify(deck.map(c => String(c.id))), JSON.stringify(formation.loadoutBonus), Math.round(formation.formationPower), now), clearGuard(env, token)]);
  return { ok: true };
}

// Round ownership, account row locks, penalty ledger, imprisonment and trial are
// committed together. A retry cannot debit again, extend a sentence, or reopen a vote.
export async function settleCoupRound(env, id, now = Date.now()) {
  await ensureCoupSchema(env);
  const round = await getRound(env, id);
  if (!round || !['ACTIVE', 'SETTLING'].includes(round.status)) return;
  if (round.status === 'ACTIVE' && Number(round.ends_at) > now) return;
  await ensureClanCampSchema(env);
  const winner = round.winner || deadlineWinner(round), cfg = coupSettings(parse(round.settings_json)), token = crypto.randomUUID();
  const statements = [chiefMetaLock(env), ...roundClaim(env, round, token, "AND status IN ('ACTIVE','SETTLING')"),
    p(env, "UPDATE coup_rounds_v2115 SET status='FINISHED',winner=?,finished_at=? WHERE id=?", winner, now, id)];
  const rebelPolicy = coupRebelDefeatPolicy(id, parse(round.settings_json));
  if (winner === 'CHIEF' && rebelPolicy.type === 'PRISON') {
    const eventId = `coup:${id}`;
    statements.push(
      p(env, `INSERT INTO event_prison_camps(event_id,source_type,title,reason,jailed_at,jailed_until) VALUES(?,'COUP','황궁 쿠데타 · 반란군','반란군 패배 · 이번 회차 시범 운영 · 3시간 수감',?,?)`, eventId, sqlTime(now), sqlTime(now + rebelPolicy.hours * 3600000)),
      p(env, `INSERT INTO event_prison_captives(event_id,user_id,member_role) SELECT ?,user_id,'REBEL' FROM coup_participants_v2115 WHERE round_id=? AND side='REBEL'`, eventId, id));
  } else if (winner === 'CHIEF') {
    statements.push(
      p(env, "UPDATE users SET coin=coin WHERE id IN (SELECT user_id FROM coup_participants_v2115 WHERE round_id=? AND side='REBEL')", id),
      p(env, `INSERT INTO coup_penalties_v2115(round_id,user_id,before_coin,debit,after_coin)
        SELECT ?,u.id,u.coin,CASE WHEN u.coin>0 THEN CAST(u.coin/5 AS BIGINT) ELSE 3000000000 END,
        u.coin-CASE WHEN u.coin>0 THEN CAST(u.coin/5 AS BIGINT) ELSE 3000000000 END
        FROM users u JOIN coup_participants_v2115 c ON c.user_id=u.id WHERE c.round_id=? AND c.side='REBEL'`, id, id),
      p(env, `UPDATE users SET coin=(SELECT after_coin FROM coup_penalties_v2115 p WHERE p.round_id=? AND p.user_id=users.id)
        WHERE id IN (SELECT user_id FROM coup_penalties_v2115 WHERE round_id=?)`, id, id));
  } else if (winner === 'REBEL') {
    const eventId = `coup:${id}`, trialId = id;
    statements.push(
      p(env, `INSERT INTO event_prison_camps(event_id,source_type,title,reason,jailed_at,jailed_until) VALUES(?,'COUP','황궁 쿠데타','족장팀 패배 · 황궁 함락',?,?)`, eventId, sqlTime(now), sqlTime(now + CLAN_CAMP_HOURS * 3600000)),
      p(env, `INSERT INTO event_prison_captives(event_id,user_id,member_role)
        SELECT ?,user_id,CASE WHEN user_id=? THEN 'CHIEF' ELSE 'LOYALIST' END FROM coup_participants_v2115 WHERE round_id=? AND side='CHIEF'`, eventId, round.chief_user_id, id),
      p(env, "INSERT OR IGNORE INTO event_prison_captives(event_id,user_id,member_role) VALUES(?,?,'CHIEF')", eventId, round.chief_user_id),
      p(env, `INSERT INTO coup_trials_v2115(id,round_id,appointment_id,defendant_id,defendant_name,starts_at,ends_at) VALUES(?,?,?,?,?,?,?)`, trialId, id, round.appointment_id, round.chief_user_id, round.chief_name, now, now + cfg.trialMinutes * 60000),
      p(env, `INSERT INTO coup_electorate_v2115(trial_id,user_id) SELECT ?,id FROM users WHERE status='ACTIVE' AND COALESCE(role,'USER') IN ('USER','OWNER')`, trialId),
      p(env, `INSERT INTO chief_duty_cases_v2115(appointment_id,trial_id,status) VALUES(?,?,'OPEN')
        ON CONFLICT(appointment_id) DO UPDATE SET trial_id=excluded.trial_id,status='OPEN'`, round.appointment_id, trialId));
  }
  statements.push(clearGuard(env, token));
  try { await atomic(env, statements); }
  catch (e) { if (e.status === 409 && (await getRound(env, id))?.status === 'FINISHED') return; throw e; }
}
export async function closeCoupTrial(env, id, now = Date.now()) {
  const trial = await p(env, 'SELECT * FROM coup_trials_v2115 WHERE id=?', id).first();
  if (!trial || trial.status !== 'OPEN' || Number(trial.ends_at) > now) return;
  const token = crypto.randomUUID(), verdict = trialVerdict(trial.reinstate_count, trial.remove_count);
  // Ballots also CAS this revision. A vote that committed before the deadline
  // invalidates a stale tally instead of being silently lost from the verdict.
  await atomic(env, [chiefMetaLock(env),
    p(env, "UPDATE coup_trials_v2115 SET status=?,closed_at=?,revision=revision+1,token=? WHERE id=? AND revision=? AND status='OPEN' AND ends_at<=?", verdict, now, token, id, trial.revision, now),
    guard(env, token, 'SELECT 1 FROM coup_trials_v2115 WHERE id=? AND token=?', id, token),
    p(env, 'UPDATE chief_duty_cases_v2115 SET status=? WHERE appointment_id=? AND trial_id=?', verdict, trial.appointment_id, id), clearGuard(env, token)]);
}
export async function pulseCoup(env, now = Date.now(), cached = false) {
  if (cached && readRuntimeData(env, 'coup_pulse_v2115')) return;
  await ensureCoupSchema(env);
  const rounds = all(await p(env, "SELECT id FROM coup_rounds_v2115 WHERE status='SETTLING' OR (status='ACTIVE' AND ends_at<=?)", now).all());
  for (const r of rounds) { try { await settleCoupRound(env, r.id, now); } catch (e) { if (e.status !== 409) throw e; } }
  const trials = all(await p(env, "SELECT id FROM coup_trials_v2115 WHERE status='OPEN' AND ends_at<=?", now).all());
  for (const t of trials) { try { await closeCoupTrial(env, t.id, now); } catch (e) { if (e.status !== 409) throw e; } }
  cacheRuntimeData(env, 'coup_pulse_v2115', true, 1000);
}
export async function voteCoupTrial(env, user, body, now = Date.now()) {
  const id = String(body.trialId || ''), choice = String(body.choice || '');
  if (!['REINSTATE', 'REMOVE'].includes(choice)) fail('복직 또는 파면을 선택하세요.', 400);
  const old = await p(env, 'SELECT choice FROM coup_votes_v2115 WHERE trial_id=? AND user_id=?', id, user.id).first();
  if (old) { if (old.choice !== choice) fail('이미 투표했습니다. 제출한 표는 변경할 수 없습니다.'); return { ok: true, choice }; }
  const trial = await p(env, 'SELECT * FROM coup_trials_v2115 WHERE id=?', id).first();
  if (!trial || trial.status !== 'OPEN' || Number(trial.ends_at) <= now) fail('재판 투표가 종료되었습니다.');
  const token = crypto.randomUUID(), column = choice === 'REINSTATE' ? 'reinstate_count' : 'remove_count';
  await atomic(env, [
    p(env, `UPDATE coup_trials_v2115 SET ${column}=${column}+1,revision=revision+1,token=? WHERE id=? AND status='OPEN' AND ends_at>?
      AND EXISTS(SELECT 1 FROM coup_electorate_v2115 e JOIN users u ON u.id=e.user_id WHERE e.trial_id=? AND e.user_id=? AND u.status='ACTIVE')`, token, id, now, id, user.id),
    guard(env, token, 'SELECT 1 FROM coup_trials_v2115 WHERE id=? AND token=?', id, token),
    p(env, 'INSERT INTO coup_votes_v2115(trial_id,user_id,choice,created_at) VALUES(?,?,?,?)', id, user.id, choice, now), clearGuard(env, token)]);
  return { ok: true, choice };
}
export async function attackCoup(env, deps, user, body, now = Date.now()) {
  const id = String(body.roundId || ''), requestId = String(body.requestId || '');
  if (!/^[A-Za-z0-9:_-]{8,80}$/.test(requestId)) fail('유효한 전투 요청 번호가 필요합니다.', 400);
  const old = await p(env, 'SELECT * FROM coup_attacks_v2115 WHERE request_id=?', requestId).first();
  if (old) { if (Number(old.user_id) !== Number(user.id) || old.round_id !== id) fail('다른 전투의 요청 번호입니다.', 403); return parse(old.result_json); }
  let round = await getRound(env, id);
  if (!round || round.status !== 'ACTIVE' || Number(round.ends_at) <= now) fail('지금은 전투 시간이 아닙니다.');
  let mine = await p(env, 'SELECT * FROM coup_participants_v2115 WHERE round_id=? AND user_id=?', id, user.id).first();
  if (!mine) fail('이 쿠데타에 참가하지 않았습니다.', 403);
  const energyRow = await p(env, 'SELECT * FROM coup_energy_v2118 WHERE round_id=? AND user_id=?', id, user.id).first();
  let energy = coupEnergy(energyRow, now);
  if (energy.energy < 1) fail(energy.blockedUntil > now ? '원자폭탄 피격으로 행동력을 회복할 수 없습니다.' : '행동력이 부족합니다. 2분마다 1씩 회복됩니다.', 429);
  if (Number(mine.next_attack_at) > now) fail('다음 출격까지 잠시 기다려 주세요.', 429);
  const battle = await deps.battleSettings(env), startedAt = Number(round.starts_at);
  const formation = await currentCoupFormation(env, deps, { ...mine, nickname: user.nickname, role: user.role }, battle);
  if (!formation) fail('현재 PVP 덱에 일반 카드 5장을 편성하세요.', 400);
  const valid = [...await currentCoupOpponents(env, deps, round, mine.side, battle, formation.deck_power)];
  const recent = all(await p(env, `SELECT json_extract(result_json,'$.opponent') opponent_json FROM coup_attacks_v2115 WHERE round_id=? AND user_id=? ORDER BY created_at DESC,request_id DESC LIMIT 12`, id, user.id).all()).map(row => Number(parse(row.opponent_json).id));
  let opponent = null;
  while (valid.length) {
    const chosen = coupMatchedOpponent(valid, formation.deck_power, recent);
    opponent = await currentCoupFormation(env, deps, chosen, battle);
    if (opponent) break;
    valid.splice(valid.findIndex(row => row.user_id === chosen.user_id), 1);
  }
  if (!opponent) fail('교전 가능한 상대 덱이 없습니다. 다음 출격 때 다시 확인하세요.');
  mine = { ...mine, ...formation };
  const snapshots = new Map([[Number(user.id), formation.cards], [Number(opponent.user_id), opponent.cards]]);
  const combatDeps = { ...deps, battleSettings: async () => battle, pvpDeckSnapshotByIds: async (_env, userId) => snapshots.get(Number(userId)) || [] };
  const simulation = await simulateTerritoryDuel(env, combatDeps, user, { ...mine, round_id: `COUP:${id}:${requestId}` }, { ...opponent, round_id: `COUP:${id}:${requestId}` }, requestId);
  // Match preparation may take time. Recheck live energy, cooldown and the round
  // revision immediately before the atomic commit, including a restart in flight.
  const committedAt = Date.now();
  round = await getRound(env, id);
  if (!round || round.status !== 'ACTIVE' || Number(round.ends_at) <= committedAt || Number(round.starts_at) !== startedAt) fail('전황이 변경되었습니다. 다시 출격하세요.');
  const current = await p(env, 'SELECT attacks,next_attack_at FROM coup_participants_v2115 WHERE round_id=? AND user_id=?', id, user.id).first();
  energy = coupEnergy(await p(env, 'SELECT * FROM coup_energy_v2118 WHERE round_id=? AND user_id=?', id, user.id).first(), committedAt);
  if (energy.energy < 1 || Number(current.next_attack_at) > committedAt) fail('행동력 또는 출격 대기시간을 다시 확인하세요.', 429);
  mine.attacks = current.attacks;
  const result = simulation.battleV2?.result?.winner;
  const winningSide = result === 'A' ? mine.side : result === 'B' ? opponent.side : 'DRAW';
  const target = winningSide === 'DRAW' ? null : winningSide === 'CHIEF' ? 'REBEL' : 'CHIEF';
  const cfg = coupSettings(parse(round.settings_json));
  const planned = target ? territorySiegeDamage(result === 'A' ? mine.deck_power : opponent.deck_power, requestId, { damageScale: 6, minDamage: 100, maxDamage: 5000, damageVariancePercent: 10 }) : 0;
  const damage = Math.min(planned, Number(target === 'CHIEF' ? round.chief_hp : round.rebel_hp));
  const next = advanceFront(round, target, damage), token = crypto.randomUUID();
  const response = { ok: true, requestId, roundId: id, ...simulation, attackerWon: result === 'A', winningSide, targetSide: target,
    coinReward: result === 'B' ? 10000000 : 20000000,
    damage, nodeName: PALACE_NODES[Number(round.front_index)].name, frontMoved: next.moved, winner: next.winner,
    nextAttackAt: committedAt + cfg.attackCooldownSeconds * 1000, matchPowerGapPercent: Math.round(Math.abs(opponent.deck_power - mine.deck_power) / Math.max(1, mine.deck_power) * 10000) / 100, matchPoolSize: opponent.match_pool_size,
    mode: 'SIEGE', battlefieldMode: 'SIEGE', sceneAssetKey: 'COUP_PALACE' };
  await atomic(env, [...roundClaim(env, round, token, "AND status='ACTIVE' AND ends_at>?", [committedAt]),
    p(env, 'UPDATE users SET coin=coin+? WHERE id=?', response.coinReward, user.id),
    ...[mine, opponent].map(row => p(env, 'UPDATE coup_participants_v2115 SET deck_snapshot=?,deck_power=?,loadout_bonus_json=? WHERE round_id=? AND user_id=?', row.deck_snapshot, row.deck_power, row.loadout_bonus_json, id, row.user_id)),
    p(env, 'UPDATE coup_participants_v2115 SET attacks=attacks+1,damage=damage+?,next_attack_at=? WHERE round_id=? AND user_id=? AND next_attack_at<=?', result === 'A' ? damage : 0, response.nextAttackAt, id, user.id, committedAt),
    guard(env, token + ':player', 'SELECT 1 FROM coup_participants_v2115 WHERE round_id=? AND user_id=? AND attacks=?', id, user.id, Number(mine.attacks) + 1),
    p(env, `INSERT INTO coup_energy_v2118(round_id,user_id,energy,energy_at,blocked_until) VALUES(?,?,?,?,?)
      ON CONFLICT(round_id,user_id) DO UPDATE SET energy=excluded.energy,energy_at=excluded.energy_at,blocked_until=excluded.blocked_until`, id, user.id, energy.energy - 1, energy.energyAt, energy.blockedUntil),
    p(env, 'UPDATE coup_rounds_v2115 SET front_index=?,chief_hp=?,rebel_hp=?,front_seq=front_seq+?,status=?,winner=? WHERE id=?', next.front, next.chief, next.rebel, next.moved ? 1 : 0, next.winner ? 'SETTLING' : 'ACTIVE', next.winner, id),
    p(env, 'INSERT INTO coup_attacks_v2115(request_id,round_id,user_id,side,front_seq,result_json,created_at) VALUES(?,?,?,?,?,?,?)', requestId, id, user.id, mine.side, round.front_seq, JSON.stringify(response), committedAt),
    clearGuard(env, token + ':player'), clearGuard(env, token)]);
  if (next.winner) await settleCoupRound(env, id, committedAt);
  return response;
}
async function rebelCommander(env, round) {
  const id = coupRebelCommanderId(round?.id, parse(round?.settings_json));
  if (!id) return null;
  const row = await p(env, `SELECT u.id,u.nickname FROM users u JOIN coup_participants_v2115 c ON c.user_id=u.id WHERE u.id=? AND u.status='ACTIVE' AND c.round_id=? AND c.side='REBEL'`, id, round.id).first();
  return row ? { userId: Number(row.id), nickname: row.nickname, temporary: true } : null;
}
export async function useCoupChiefSkill(env, user, body, now = Date.now()) {
  await ensureCoupSchema(env);
  const id = String(body.roundId || ''), requestId = String(body.requestId || ''), code = String(body.skillCode || '');
  const skill = COUP_CHIEF_SKILLS.find(s => s.code === code);
  if (!skill || !/^[A-Za-z0-9:_-]{8,80}$/.test(requestId)) fail('스킬과 요청 번호를 확인하세요.', 400);
  const old = await p(env, 'SELECT * FROM coup_skills_v2118 WHERE request_id=?', requestId).first();
  if (old) {
    if (Number(old.user_id) !== Number(user.id) || old.round_id !== id || old.skill_code !== code) fail('다른 스킬의 요청 번호입니다.', 403);
    return { ...parse(old.result_json), replayed: true };
  }
  const round = await getRound(env, id);
  if (!round || round.status !== 'ACTIVE' || Number(round.ends_at) <= now) fail('전투 중에만 지휘 스킬을 사용할 수 있습니다.');
  const side = Number(round.chief_user_id) === Number(user.id) ? 'CHIEF' : 'REBEL';
  let commander, authority = { before: [], after: [] };
  if (side === 'CHIEF') {
    commander = await currentChief(env, now);
    if (commander.id !== round.appointment_id || Number(commander.userId) !== Number(user.id)) fail('현재 회차의 재직 중인 족장만 사용할 수 있습니다.', 403);
    const chiefGuard = chiefAuthorityGuard(env, round.appointment_id, user.id, now);
    authority = { before: chiefGuard.before, after: [chiefGuard.after] };
  } else {
    commander = await rebelCommander(env, round);
    if (!commander || commander.userId !== Number(user.id)) fail('현재 회차의 반란군 지휘관만 사용할 수 있습니다.', 403);
    if (!COUP_REBEL_SKILLS.some(s => s.code === code)) fail('반란군은 야포단 포격과 결사대 결집만 사용할 수 있습니다.', 403);
  }
  if (code === 'NUCLEAR' && !(await readCoupSkillSettings(env)).nuclearEnabled) fail('원자폭탄은 운영자가 ON으로 전환하기 전까지 잠겨 있습니다.', 403);
  const cooldownKey = side === 'REBEL' ? 'coup-rebel:' + round.id : round.appointment_id;
  const cooldown = await p(env, 'SELECT next_use_at FROM coup_skill_cooldowns_v2118 WHERE appointment_id=? AND skill_code=?', cooldownKey, code).first();
  if (Number(cooldown?.next_use_at || 0) > now) fail('이 스킬은 재사용 대기 중입니다. 화면의 남은 시간을 확인하세요.', 429);
  const targetSide = code === 'RALLY' ? side : side === 'CHIEF' ? 'REBEL' : 'CHIEF';
  const candidates = code === 'ARTILLERY' ? [] : all(await p(env, `SELECT c.user_id FROM coup_participants_v2115 c JOIN users u ON u.id=c.user_id WHERE c.round_id=? AND c.side=? AND u.status='ACTIVE' ORDER BY c.user_id`, id, targetSide).all());
  const targets = code === 'NUCLEAR' ? chooseNuclearTargets(candidates) : candidates;
  if (code !== 'ARTILLERY' && !targets.length) fail('스킬을 적용할 참가자가 없습니다.');
  const damage = code === 'ARTILLERY' ? Math.min(Number(targetSide === 'CHIEF' ? round.chief_hp : round.rebel_hp), Math.floor(Number(round.max_hp) * 0.3)) : 0;
  const next = advanceFront(round, damage ? targetSide : null, damage);
  const token = crypto.randomUUID();
  const result = { ok: true, requestId, roundId: id, skillCode: code, skillName: skill.name, chiefName: commander.nickname,
    commandSide: side, targetSide, commanderId: Number(user.id), commanderName: commander.nickname,
    createdAt: now, nextUseAt: now + coupSkillCooldown(code, side), affectedCount: targets.length, affectedUserIds: targets.map(t => Number(t.user_id)),
    damage, nodeName: PALACE_NODES[Number(round.front_index)].name, frontMoved: next.moved, winner: next.winner,
    blockedUntil: code === 'NUCLEAR' ? now + COUP_NUCLEAR_BLOCK_MS : null, energyGranted: code === 'RALLY' ? 50 : null };
  const statements = [...authority.before, ...roundClaim(env, round, token, "AND status='ACTIVE' AND ends_at>?", [now]),
    guard(env, token + ':chief', "SELECT 1 FROM users WHERE id=? AND status='ACTIVE'", user.id),
    ...(side === 'REBEL' ? [guard(env, token + ':commander', `SELECT 1 FROM coup_rounds_v2115 r JOIN coup_participants_v2115 c ON c.round_id=r.id WHERE r.id=? AND r.settings_json=? AND c.user_id=? AND c.side='REBEL'`, id, round.settings_json, user.id)] : []),
    guard(env, token + ':cooldown', `SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM coup_skill_cooldowns_v2118 WHERE appointment_id=? AND skill_code=? AND next_use_at>?)`, cooldownKey, code, now),
    p(env, `INSERT INTO coup_skill_cooldowns_v2118(appointment_id,skill_code,next_use_at) VALUES(?,?,?) ON CONFLICT(appointment_id,skill_code) DO UPDATE SET next_use_at=excluded.next_use_at`, cooldownKey, code, result.nextUseAt)];
  if (code === 'NUCLEAR') statements.push(p(env, 'UPDATE app_meta SET value=value WHERE key=?', COUP_SKILL_SETTINGS), guard(env, token + ':enabled', "SELECT 1 FROM app_meta WHERE key=? AND CAST(json_extract(value,'$.nuclearEnabled') AS TEXT) IN ('true','1')", COUP_SKILL_SETTINGS));
  for (const t of targets) statements.push(p(env, `INSERT INTO coup_energy_v2118(round_id,user_id,energy,energy_at,blocked_until) VALUES(?,?,?,?,?) ON CONFLICT(round_id,user_id) DO UPDATE SET energy=excluded.energy,energy_at=excluded.energy_at,blocked_until=excluded.blocked_until`, id, t.user_id, code === 'NUCLEAR' ? 0 : 50, code === 'NUCLEAR' ? result.blockedUntil : now, code === 'NUCLEAR' ? result.blockedUntil : 0));
  if (damage) statements.push(p(env, 'UPDATE coup_rounds_v2115 SET front_index=?,chief_hp=?,rebel_hp=?,front_seq=front_seq+?,status=?,winner=? WHERE id=?', next.front, next.chief, next.rebel, next.moved ? 1 : 0, next.winner ? 'SETTLING' : 'ACTIVE', next.winner, id));
  statements.push(p(env, 'INSERT INTO coup_skills_v2118(request_id,round_id,user_id,skill_code,result_json,created_at) VALUES(?,?,?,?,?,?)', requestId, id, user.id, code, JSON.stringify(result), now),
    clearGuard(env, token + ':chief'), clearGuard(env, token + ':commander'), clearGuard(env, token + ':cooldown'), clearGuard(env, token + ':enabled'), clearGuard(env, token), ...authority.after);
  try { await atomic(env, statements); }
  catch (e) {
    const saved = await p(env, 'SELECT result_json FROM coup_skills_v2118 WHERE request_id=? AND round_id=? AND user_id=? AND skill_code=?', requestId, id, user.id, code).first();
    if (saved) return { ...parse(saved.result_json), replayed: true };
    throw e;
  }
  if (next.winner) await settleCoupRound(env, id, now);
  return result;
}
export async function coupStatus(env, user, now = Date.now()) {
  await pulseCoup(env, now);
  const round = await p(env, 'SELECT * FROM coup_rounds_v2115 ORDER BY created_at DESC,id DESC LIMIT 1').first();
  const trial = await p(env, 'SELECT * FROM coup_trials_v2115 ORDER BY starts_at DESC,id DESC LIMIT 1').first();
  const members = round ? all(await p(env, `SELECT c.user_id,c.side,c.attacks,c.damage,c.deck_power,c.next_attack_at,u.nickname,e.energy,e.energy_at,e.blocked_until FROM coup_participants_v2115 c JOIN users u ON u.id=c.user_id LEFT JOIN coup_energy_v2118 e ON e.round_id=c.round_id AND e.user_id=c.user_id WHERE c.round_id=? ORDER BY c.damage DESC,c.joined_at`, round.id).all()).map(m => ({ ...m, energyState: coupEnergy(m, now) })) : [];
  const mine = members.find(m => Number(m.user_id) === Number(user.id));
  const penalty = round ? await p(env, 'SELECT before_coin,debit,after_coin FROM coup_penalties_v2115 WHERE round_id=? AND user_id=?', round.id, user.id).first() : null;
  const votes = trial ? await p(env, `SELECT e.user_id,v.choice FROM coup_electorate_v2115 e LEFT JOIN coup_votes_v2115 v ON v.trial_id=e.trial_id AND v.user_id=e.user_id WHERE e.trial_id=? AND e.user_id=?`, trial.id, user.id).first() : null;
  const electorate = trial ? Number((await p(env, 'SELECT COUNT(*) n FROM coup_electorate_v2115 WHERE trial_id=?', trial.id).first())?.n || 0) : 0;
  const events = round ? all(await p(env, `SELECT a.side,a.created_at,u.nickname,json_extract(a.result_json,'$.winningSide') AS winner,json_extract(a.result_json,'$.damage') AS damage,json_extract(a.result_json,'$.nodeName') AS node_name FROM coup_attacks_v2115 a JOIN users u ON u.id=a.user_id WHERE a.round_id=? ORDER BY a.created_at DESC LIMIT 12`, round.id).all()) : [];
  const cooldowns = round ? all(await p(env, 'SELECT appointment_id,skill_code,next_use_at FROM coup_skill_cooldowns_v2118 WHERE appointment_id IN (?,?)', round.appointment_id, 'coup-rebel:' + round.id).all()) : [];
  let canUseChiefSkills = false;
  if (round?.status === 'ACTIVE' && Number(round.chief_user_id) === Number(user.id)) {
    try { const a = await currentChief(env, now); canUseChiefSkills = a.id === round.appointment_id && Number(a.userId) === Number(user.id); } catch (e) { if (!e.status) throw e; }
  }
  const skillEvents = round ? all(await p(env, 'SELECT result_json FROM coup_skills_v2118 WHERE round_id=? ORDER BY created_at DESC,request_id DESC LIMIT 12', round.id).all()).map(r => parse(r.result_json)) : [];
  const skillSettings = await readCoupSkillSettings(env);
  const rebel = await rebelCommander(env, round);
  const commandSide = mine?.side === 'REBEL' && Number(round?.chief_user_id) !== Number(user.id) ? 'REBEL' : 'CHIEF';
  const skillsFor = side => (side === 'REBEL' ? COUP_REBEL_SKILLS : COUP_CHIEF_SKILLS).map(s => ({ ...s,
    enabled: s.code !== 'NUCLEAR' || skillSettings.nuclearEnabled, cooldownMs: coupSkillCooldown(s.code, side),
    nextUseAt: Number(cooldowns.find(c => c.appointment_id === (side === 'REBEL' ? 'coup-rebel:' + round?.id : round?.appointment_id) && c.skill_code === s.code)?.next_use_at || 0) }));
  const chiefSkills = skillsFor('CHIEF'), rebelSkills = skillsFor('REBEL');
  const canUseCommandSkills = commandSide === 'REBEL' ? round?.status === 'ACTIVE' && Number(round.ends_at) > now && rebel?.userId === Number(user.id) : canUseChiefSkills;
  return { serverNow: now, viewerId: Number(user.id), settings: await readCoupSettings(env), nodes: PALACE_NODES,
    energyPolicy: { maxEnergy: COUP_ENERGY_MAX, recoveryMs: COUP_ENERGY_RECOVERY_MS, attackCost: 1 },
    sortieRewards: { win: 20000000, loss: 10000000, draw: 20000000 },
    canUseChiefSkills, skillSettings, chiefSkills, rebelSkills, rebelCommander: rebel, commandSide,
    commander: commandSide === 'REBEL' ? rebel : round ? { userId: Number(round.chief_user_id), nickname: round.chief_name, temporary: false } : null,
    canUseCommandSkills: !!canUseCommandSkills, commandSkills: commandSide === 'REBEL' ? rebelSkills : chiefSkills, skillEvents,
    round: round ? { id: round.id, status: round.status, chiefId: Number(round.chief_user_id), chiefName: round.chief_name,
      createdAt: Number(round.created_at), startsAt: Number(round.starts_at), endsAt: Number(round.ends_at), finishedAt: Number(round.finished_at), front: Number(round.front_index), chiefHp: Number(round.chief_hp), rebelHp: Number(round.rebel_hp), maxHp: Number(round.max_hp), winner: round.winner, settings: parse(round.settings_json), rebelDefeat: coupRebelDefeatPolicy(round.id, parse(round.settings_json)) } : null,
    members, mine: mine || null, penalty, events,
    trial: trial ? { id: trial.id, defendantId: Number(trial.defendant_id), defendantName: trial.defendant_name, status: trial.status,
      endsAt: Number(trial.ends_at), reinstate: Number(trial.reinstate_count), remove: Number(trial.remove_count), electorate,
      eligible: !!votes, myVote: votes?.choice || null } : null };
}
export async function handleCoup({ path, request, env, deps }) {
  const adminPath = path === 'admin/coup' || path.startsWith('admin/coup/');
  if (!path.startsWith('coup/') && !adminPath) return null;
  const user = await deps.authenticate(request, env); if (!user) return deps.json({ error: '로그인이 필요합니다.' }, 401);
  try {
    await pulseCoup(env);
    if (path === 'coup/status' && request.method === 'GET') return deps.json(await coupStatus(env, user));
    if (path === 'coup/skill' && request.method === 'POST') {
      const result = await useCoupChiefSkill(env, user, await deps.readBody(request));
      return deps.json({ ...result, state: await coupStatus(env, user) });
    }
    if (path === 'coup/attack-result' && request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('requestId') || '';
      const receipt = await p(env, 'SELECT result_json FROM coup_attacks_v2115 WHERE request_id=? AND user_id=?', id, user.id).first();
      return receipt ? deps.json(parse(receipt.result_json)) : deps.json({ error: '아직 확정된 전투 기록이 없습니다.' }, 404);
    }
    if (path === 'coup/vote' && request.method === 'POST') {
      const result = await voteCoupTrial(env, user, await deps.readBody(request));
      return deps.json({ ...result, state: await coupStatus(env, user) });
    }
    if (path === 'coup/join' && request.method === 'POST') { await joinCoupRound(env, deps, user, await deps.readBody(request)); return deps.json(await coupStatus(env, user)); }
    if (path === 'coup/attack' && request.method === 'POST') return deps.json(await attackCoup(env, deps, user, await deps.readBody(request)));
    if (adminPath) {
      const admin = await deps.requirePermission(request, env, 'SETTINGS'); if (!admin) return deps.json({ error: '운영 설정 권한이 필요합니다.' }, 403);
      if (path === 'admin/coup' && request.method === 'GET') return deps.json(await coupStatus(env, user));
      if (request.method !== 'POST') return deps.json({ error: '지원하지 않는 요청입니다.' }, 405);
      const body = await deps.readBody(request);
      let result;
      if (path === 'admin/coup/skills') {
        if (admin.role !== 'OWNER') fail('원자폭탄 ON/OFF는 OWNER만 변경할 수 있습니다.', 403);
        if (typeof body.nuclearEnabled !== 'boolean') fail('ON/OFF 값을 확인하세요.', 400);
        result = { nuclearEnabled: body.nuclearEnabled };
        await p(env, 'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP', COUP_SKILL_SETTINGS, JSON.stringify(result)).run();
      } else if (path === 'admin/coup/settings') {
        let cfg; try { cfg = coupSettings(body); } catch (e) { fail(e.message, 400); }
        await p(env, 'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP', SETTINGS, JSON.stringify(cfg)).run(); result = cfg;
      } else if (path === 'admin/coup/open') result = await openCoupRound(env);
      else if (path === 'admin/coup/start') result = await startCoupRound(env, String(body.roundId || ''));
      else if (path === 'admin/coup/cancel') {
        const r = await p(env, "UPDATE coup_rounds_v2115 SET status='CANCELLED',revision=revision+1 WHERE id=? AND status='RECRUITING'", String(body.roundId || '')).run();
        if (!Number(r.meta?.changes)) fail('모집 중인 쿠데타만 취소할 수 있습니다.'); result = { cancelled: true };
      } else return deps.json({ error: '지원하지 않는 요청입니다.' }, 404);
      await deps.writeAdminLog(env, admin, 'COUP_' + path.split('/').at(-1).toUpperCase(), 'COUP', String(body.roundId || result?.id || SETTINGS), null, result);
      return deps.json(await coupStatus(env, user));
    }
    return deps.json({ error: '지원하지 않는 요청입니다.' }, 405);
  } catch (e) { if (!e.status) throw e; return deps.json({ error: e.message, code: 'COUP_CONFLICT' }, e.status); }
}
