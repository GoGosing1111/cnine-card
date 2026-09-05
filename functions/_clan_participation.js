// Clan participation: round-frozen rules and exactly-once attacker-only settlement.
export const CLAN_PARTICIPATION_DEFAULTS = Object.freeze({
  participationEnabled: false,
  participationEffectiveAt: '',
  battleParticipationRewardsEnabled: false,
  battleParticipationCoin: 0,
  battleWinBonusPercent: 20,
  participationMilestoneCoin: 0
});
const SCHEMA_KEY = 'safe_runtime_upgrade_v2040_clan_participation';
const schemaReady = new WeakSet();
const parse = (value, fallback = {}) => { try { return JSON.parse(value || ''); } catch { return fallback; } };
const time = value => Date.parse(String(value || '').includes('T') ? value : `${String(value || '').replace(' ', 'T')}Z`);
const num = value => Number(value || 0);
const invariant = (condition, message) => { if (!condition) throw new Error(message); };

export function validateClanParticipationSettings(candidate, next) {
  for (const [key, max] of [['battleParticipationCoin', 100000000], ['participationMilestoneCoin', 100000000], ['battleWinBonusPercent', 100]]) {
    if (!(key in candidate)) continue;
    invariant(candidate[key] !== null && candidate[key] !== '' && Number.isSafeInteger(Number(candidate[key]))
      && Number(candidate[key]) >= 0 && Number(candidate[key]) <= max, `${key}: 0~${max} 범위의 정수가 필요합니다.`);
  }
  if (next.battleParticipationRewardsEnabled) {
    invariant(next.mode === 'ON' && next.participationEnabled, '전투 참여 보상은 공개 ON · 참여형 규칙 ON에서만 활성화할 수 있습니다.');
    invariant(next.battleParticipationCoin > 0, '전투 참여 보상을 켜려면 1회 기본 코인을 1 이상 설정하세요.');
  }
}

export async function prepareClanParticipationSettings(env, previous, next, now = Date.now()) {
  const at = new Date(now).toISOString();
  // Freeze the old rules even if nobody opened the current round before this CMS edit.
  const current = await env.DB.prepare("SELECT * FROM clan_wars WHERE status IN ('ACTIVE','SCHEDULED') AND starts_at<=? AND ends_at>?").bind(at, at).all();
  for (const war of current.results || []) await clanWarParticipationSettings(env, war, previous, now);
  next.participationEffectiveAt = previous.participationEffectiveAt || '';
  if (next.participationEnabled && (!previous.participationEnabled || !next.participationEffectiveAt)) {
    const upcoming = await env.DB.prepare("SELECT starts_at FROM clan_wars WHERE status IN ('ACTIVE','SCHEDULED') AND starts_at>? ORDER BY starts_at LIMIT 1").bind(at).first();
    next.participationEffectiveAt = upcoming?.starts_at || new Date(now + 1000).toISOString();
  }
  return next;
}

export function clanParticipationSchema(postgres = false) {
  const integer = postgres ? 'BIGINT' : 'INTEGER', now = postgres ? 'sqlite_now()' : 'CURRENT_TIMESTAMP';
  return [
    `CREATE TABLE IF NOT EXISTS clan_participation_round_rules (
      season_id ${integer} NOT NULL, round_no ${integer} NOT NULL, rules_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${now}, PRIMARY KEY(season_id,round_no))`,
    `CREATE TABLE IF NOT EXISTS clan_participation_progress (
      season_id ${integer} NOT NULL, war_id ${integer} NOT NULL, user_id ${integer} NOT NULL,
      completed_attacks ${integer} NOT NULL DEFAULT 0, earned_points ${integer} NOT NULL DEFAULT 0,
      earned_coin ${integer} NOT NULL DEFAULT 0, milestone_awarded ${integer} NOT NULL DEFAULT 0,
      PRIMARY KEY(war_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS clan_participation_receipts (
      battle_id ${integer} PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, season_id ${integer} NOT NULL,
      war_id ${integer} NOT NULL, user_id ${integer} NOT NULL, clan_id ${integer} NOT NULL,
      winner_clan_id ${integer} NOT NULL, result TEXT NOT NULL, points ${integer} NOT NULL,
      base_coin ${integer} NOT NULL, win_bonus_coin ${integer} NOT NULL, milestone_coin ${integer} NOT NULL DEFAULT 0,
      completed_attacks ${integer} NOT NULL DEFAULT 0, processing_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL DEFAULT ${now}, completed_at TEXT)`,
    'CREATE INDEX IF NOT EXISTS idx_clan_participation_receipts_member ON clan_participation_receipts(season_id,user_id,status)'
  ];
}

export async function ensureClanParticipationSchema(env) {
  if (schemaReady.has(env.DB)) return;
  const found = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SCHEMA_KEY).first();
  if (!found) {
    const sql = clanParticipationSchema(env.DB.dialect === 'postgres');
    if (env.DB.dialect === 'postgres') await env.DB.execSchema(sql);
    else await env.DB.batch(sql.map(statement => env.DB.prepare(statement)));
    await env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)').bind(SCHEMA_KEY, '2040').run();
  }
  schemaReady.add(env.DB);
}

export function participationRuleCandidate(war, settings) {
  const enabled = settings.participationEnabled === true && Number.isFinite(time(settings.participationEffectiveAt))
    && time(war.starts_at) >= time(settings.participationEffectiveAt);
  return {
    scorePolicy: enabled ? 'ATTACKER_PARTICIPATION_V1' : 'LEGACY_WINNER',
    warWinScore: enabled ? 3 : settings.warWinScore,
    warLossScore: enabled ? 1 : 0,
    sharedDefenseLimit: !enabled,
    initialEnergy: settings.initialEnergy, energyCap: settings.energyCap,
    energyRecoverySeconds: settings.energyRecoverySeconds, attackEnergyCost: settings.attackEnergyCost,
    totalUseLimit: settings.totalUseLimit, defensesPerTarget: settings.defensesPerTarget,
    repeatTargetLimit: settings.repeatTargetLimit,
    battleParticipationRewardsEnabled: enabled && settings.mode === 'ON' && settings.battleParticipationRewardsEnabled === true,
    battleParticipationCoin: num(settings.battleParticipationCoin),
    battleWinBonusPercent: num(settings.battleWinBonusPercent),
    participationMilestoneCoin: num(settings.participationMilestoneCoin),
    participationMilestoneCount: 5
  };
}

export async function clanWarParticipationSettings(env, war, settings, now = Date.now()) {
  const existing = await env.DB.prepare('SELECT rules_json FROM clan_participation_round_rules WHERE season_id=? AND round_no=?')
    .bind(war.season_id, war.round_no).first();
  if (existing) return { ...settings, ...parse(existing.rules_json) };
  const candidate = participationRuleCandidate(war, settings);
  // Future-round previews remain editable. The first open-round request freezes all four matches together.
  if (time(war.starts_at) <= now && ['ACTIVE', 'SCHEDULED'].includes(war.status)) {
    await env.DB.prepare('INSERT OR IGNORE INTO clan_participation_round_rules(season_id,round_no,rules_json) VALUES(?,?,?)')
      .bind(war.season_id, war.round_no, JSON.stringify(candidate)).run();
    const saved = await env.DB.prepare('SELECT rules_json FROM clan_participation_round_rules WHERE season_id=? AND round_no=?')
      .bind(war.season_id, war.round_no).first();
    invariant(saved, '클랜전 라운드 규칙을 고정하지 못했습니다.');
    return { ...settings, ...parse(saved.rules_json) };
  }
  return { ...settings, ...candidate };
}

export function participationAmounts(settings, won) {
  const enabled = settings.mode === 'ON' && settings.battleParticipationRewardsEnabled === true;
  const baseCoin = enabled ? num(settings.battleParticipationCoin) : 0;
  const winBonusCoin = won ? Math.floor(baseCoin * num(settings.battleWinBonusPercent) / 100) : 0;
  return { points: won ? 3 : 1, baseCoin, winBonusCoin,
    milestoneCoin: enabled ? num(settings.participationMilestoneCoin) : 0 };
}

export async function clanParticipationProgress(env, warId, userId) {
  const row = await env.DB.prepare('SELECT * FROM clan_participation_progress WHERE war_id=? AND user_id=?').bind(warId, userId).first();
  return { completedAttacks: num(row?.completed_attacks), earnedPoints: num(row?.earned_points),
    earnedCoin: num(row?.earned_coin), milestoneAwarded: num(row?.milestone_awarded) === 1, milestoneGoal: 5 };
}

function publicReceipt(row) {
  return { baseCoin: num(row.base_coin), winBonusCoin: num(row.win_bonus_coin), milestoneCoin: num(row.milestone_coin),
    coin: num(row.base_coin) + num(row.win_bonus_coin) + num(row.milestone_coin),
    completedAttacks: num(row.completed_attacks), milestoneGoal: 5 };
}

export async function clanParticipationReplay(env, requestId, userId) {
  const row = await env.DB.prepare("SELECT * FROM clan_participation_receipts WHERE request_id=? AND status='COMPLETED'").bind(requestId).first();
  if (!row) return null;
  invariant(num(row.user_id) === num(userId), '다른 계정의 전투 요청 키입니다.');
  return { ok: true, replayed: true, result: row.result,
    clanWar: { id: num(row.war_id), winnerClanId: num(row.winner_clan_id), scoringClanId: num(row.clan_id),
      scorePolicy: 'ATTACKER_PARTICIPATION_V1', pointsAwarded: num(row.points), opponentPointsAwarded: 0,
      participationReward: publicReceipt(row) } };
}

export async function settleClanParticipationBattle(env, { war, receipt, userId, clanId, defenderId, winnerClanId, won, settings, result }) {
  invariant(settings.scorePolicy === 'ATTACKER_PARTICIPATION_V1', '참여형 점수 규칙이 아닙니다.');
  const token = crypto.randomUUID(), amount = participationAmounts(settings, won), db = env.DB;
  const prepare = (sql, ...values) => db.prepare(sql).bind(...values);
  const guard = "EXISTS(SELECT 1 FROM clan_participation_receipts WHERE battle_id=? AND processing_token=? AND status='PENDING')";
  const writes = [];
  // PostgreSQL batch() is READ COMMITTED: lock authoritative rows before checking eligibility.
  // D1 serializes its transactional write batch. No request-scoped state is stored globally.
  if (db.dialect === 'postgres') {
    writes.push(prepare('SELECT id FROM clan_wars WHERE id=? FOR UPDATE', war.id));
    writes.push(prepare('SELECT id FROM clan_war_battles WHERE id=? FOR UPDATE', receipt.id));
    writes.push(prepare('SELECT user_id FROM clan_members WHERE season_id=? AND user_id IN (?,?) ORDER BY user_id FOR UPDATE', war.season_id, userId, defenderId));
    writes.push(prepare('SELECT id FROM users WHERE id=? FOR UPDATE', userId));
  }
  writes.push(prepare(`INSERT OR IGNORE INTO clan_participation_receipts
    (battle_id,request_id,season_id,war_id,user_id,clan_id,winner_clan_id,result,points,base_coin,win_bonus_coin,processing_token)
    SELECT b.id,b.request_id,b.season_id,b.war_id,b.attacker_user_id,b.attacker_clan_id,?,?,?,?,?,?
    FROM clan_war_battles b JOIN clan_wars w ON w.id=b.war_id
    JOIN users u ON u.id=b.attacker_user_id
    JOIN clan_members a ON a.season_id=b.season_id AND a.user_id=b.attacker_user_id AND a.clan_id=b.attacker_clan_id
    JOIN clan_members d ON d.season_id=b.season_id AND d.user_id=b.defender_user_id AND d.clan_id=b.defender_clan_id
    WHERE b.id=? AND b.request_id=? AND b.status='RESOLVING' AND w.status='ACTIVE'
      AND b.war_id=? AND b.season_id=? AND w.season_id=b.season_id
      AND b.attacker_user_id=? AND b.attacker_clan_id=? AND b.defender_user_id=?
      AND u.coin>=0 AND u.coin<=?
      AND ((w.clan_a_id=b.attacker_clan_id AND w.clan_b_id=b.defender_clan_id) OR (w.clan_b_id=b.attacker_clan_id AND w.clan_a_id=b.defender_clan_id))`,
    winnerClanId, won ? 'WIN' : 'LOSE', amount.points, amount.baseCoin, amount.winBonusCoin, token,
    receipt.id, receipt.request_id, war.id, war.season_id, userId, clanId, defenderId,
    Number.MAX_SAFE_INTEGER - amount.baseCoin - amount.winBonusCoin - amount.milestoneCoin));
  writes.push(prepare(`INSERT OR IGNORE INTO clan_participation_progress(season_id,war_id,user_id) SELECT ?,?,? WHERE ${guard}`,
    war.season_id, war.id, userId, receipt.id, token));
  writes.push(prepare(`UPDATE clan_participation_receipts SET
    completed_attacks=(SELECT completed_attacks+1 FROM clan_participation_progress WHERE war_id=? AND user_id=?),
    milestone_coin=CASE WHEN EXISTS(SELECT 1 FROM clan_participation_progress WHERE war_id=? AND user_id=? AND completed_attacks=4 AND milestone_awarded=0) THEN ? ELSE 0 END
    WHERE battle_id=? AND processing_token=? AND status='PENDING'`, war.id, userId, war.id, userId, amount.milestoneCoin, receipt.id, token));
  const coinSql = '(SELECT base_coin+win_bonus_coin+milestone_coin FROM clan_participation_receipts WHERE battle_id=?)';
  const scoreColumn = num(war.clan_a_id) === num(clanId) ? 'score_a' : 'score_b';
  writes.push(prepare(`UPDATE clan_wars SET ${scoreColumn}=${scoreColumn}+?,battle_count=battle_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${guard}`,
    amount.points, war.id, receipt.id, token));
  writes.push(prepare(`UPDATE users SET coin=coin+${coinSql} WHERE id=? AND ${guard}`, receipt.id, userId, receipt.id, token));
  writes.push(prepare(`UPDATE clan_members SET ${won ? 'battle_wins' : 'battle_losses'}=${won ? 'battle_wins' : 'battle_losses'}+1,
    contribution_score=contribution_score+?,updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=? AND ${guard}`,
    amount.points, war.season_id, userId, receipt.id, token));
  writes.push(prepare(`UPDATE clan_members SET ${won ? 'battle_losses' : 'battle_wins'}=${won ? 'battle_losses' : 'battle_wins'}+1,
    updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND user_id=? AND ${guard}`, war.season_id, defenderId, receipt.id, token));
  writes.push(prepare(`UPDATE clan_participation_progress SET completed_attacks=completed_attacks+1,earned_points=earned_points+?,
    earned_coin=earned_coin+${coinSql},milestone_awarded=CASE WHEN completed_attacks+1>=5 THEN 1 ELSE 0 END
    WHERE war_id=? AND user_id=? AND ${guard}`, amount.points, receipt.id, war.id, userId, receipt.id, token));
  writes.push(prepare(`UPDATE clan_war_battles SET status='COMPLETED',winner_clan_id=?,result_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND ${guard}`, winnerClanId, JSON.stringify(result), receipt.id, receipt.id, token));
  writes.push(prepare("UPDATE clan_participation_receipts SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP WHERE battle_id=? AND processing_token=? AND status='PENDING'", receipt.id, token));
  await db.batch(writes);
  const saved = await clanParticipationReplay(env, receipt.request_id, userId);
  invariant(saved, '클랜전 정산 대상이 변경되었습니다. 같은 요청으로 다시 확인하세요.');
  return saved;
}
