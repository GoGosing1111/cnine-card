const ROLE_META = {
  ATTACK: { key: 'ATTACK', label: '파괴 봉인', shortLabel: '파괴', icon: '⚔', progressColumn: 'attack_progress', targetColumn: 'attack_target', userColumn: 'attack_contribution' },
  GUARD: { key: 'GUARD', label: '수호 봉인', shortLabel: '수호', icon: '◆', progressColumn: 'guard_progress', targetColumn: 'guard_target', userColumn: 'guard_contribution' },
  PURIFY: { key: 'PURIFY', label: '정화 봉인', shortLabel: '정화', icon: '✦', progressColumn: 'purify_progress', targetColumn: 'purify_target', userColumn: 'purify_contribution' }
};

const DEFAULT_SETTINGS = {
  mode: 'OFF',
  title: '봉인전',
  bossName: '심연에 봉인된 군주',
  bossImage: '',
  description: '서버 전체가 파괴·수호·정화 역할을 나누어 세 개의 봉인을 완성하는 공동 보스 콘텐츠입니다.',
  startsAt: null,
  endsAt: null,
  dailyAttempts: 3,
  targets: { attack: 20000000, guard: 16000000, purify: 14000000 },
  multipliers: { attack: 100, guard: 90, purify: 85 },
  lowestRoleBonusPercent: 20,
  attemptReward: { coin: 100, shards: 1 },
  clearReward: { coin: 2000, shards: 50 },
  receiptRetentionDays: 14,
  progressRetentionDays: 90
};

let foundationPromise = null;

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
  return Math.max(min, Math.min(max, resolved));
}

function cleanText(value, fallback, max) {
  const text = String(value ?? fallback ?? '').trim();
  return (text || String(fallback || '')).slice(0, max);
}

function cleanDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function cleanSettings(raw = {}) {
  const base = DEFAULT_SETTINGS;
  const targets = raw.targets || {};
  const multipliers = raw.multipliers || {};
  const attemptReward = raw.attemptReward || {};
  const clearReward = raw.clearReward || {};
  const mode = String(raw.mode || base.mode).toUpperCase();
  return {
    mode: ['OFF', 'ON', 'TEST'].includes(mode) ? mode : base.mode,
    title: cleanText(raw.title, base.title, 60),
    bossName: cleanText(raw.bossName, base.bossName, 80),
    bossImage: cleanText(raw.bossImage, base.bossImage, 1000),
    description: cleanText(raw.description, base.description, 300),
    startsAt: cleanDate(raw.startsAt),
    endsAt: cleanDate(raw.endsAt),
    dailyAttempts: clampInt(raw.dailyAttempts, base.dailyAttempts, 1, 30),
    targets: {
      attack: clampInt(targets.attack, base.targets.attack, 1, 2000000000),
      guard: clampInt(targets.guard, base.targets.guard, 1, 2000000000),
      purify: clampInt(targets.purify, base.targets.purify, 1, 2000000000)
    },
    multipliers: {
      attack: clampInt(multipliers.attack, base.multipliers.attack, 1, 1000),
      guard: clampInt(multipliers.guard, base.multipliers.guard, 1, 1000),
      purify: clampInt(multipliers.purify, base.multipliers.purify, 1, 1000)
    },
    lowestRoleBonusPercent: clampInt(raw.lowestRoleBonusPercent, base.lowestRoleBonusPercent, 0, 500),
    attemptReward: {
      coin: clampInt(attemptReward.coin, base.attemptReward.coin, 0, 100000000),
      shards: clampInt(attemptReward.shards, base.attemptReward.shards, 0, 1000000)
    },
    clearReward: {
      coin: clampInt(clearReward.coin, base.clearReward.coin, 0, 100000000),
      shards: clampInt(clearReward.shards, base.clearReward.shards, 0, 1000000)
    },
    receiptRetentionDays: clampInt(raw.receiptRetentionDays, base.receiptRetentionDays, 1, 90),
    progressRetentionDays: clampInt(raw.progressRetentionDays, base.progressRetentionDays, 7, 365)
  };
}

function kstDayKey(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(now));
}

function eventKey() {
  let random = Math.random().toString(36).slice(2, 10);
  try { random = crypto.randomUUID().replace(/-/g, '').slice(0, 12); } catch {}
  return `seal-${Date.now()}-${random}`;
}

function requestIdValid(value) {
  return /^[a-zA-Z0-9:_-]{12,160}$/.test(String(value || '').trim());
}

async function ensureFoundation(env) {
  if (foundationPromise) return foundationPromise;
  foundationPromise = (async () => {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS seal_battle_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        boss_name TEXT NOT NULL,
        boss_image TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        starts_at TEXT,
        ends_at TEXT,
        daily_attempts INTEGER NOT NULL DEFAULT 3,
        attack_target INTEGER NOT NULL DEFAULT 1,
        guard_target INTEGER NOT NULL DEFAULT 1,
        purify_target INTEGER NOT NULL DEFAULT 1,
        attack_progress INTEGER NOT NULL DEFAULT 0,
        guard_progress INTEGER NOT NULL DEFAULT 0,
        purify_progress INTEGER NOT NULL DEFAULT 0,
        attack_multiplier INTEGER NOT NULL DEFAULT 100,
        guard_multiplier INTEGER NOT NULL DEFAULT 90,
        purify_multiplier INTEGER NOT NULL DEFAULT 85,
        lowest_bonus_percent INTEGER NOT NULL DEFAULT 20,
        attempt_coin INTEGER NOT NULL DEFAULT 0,
        attempt_shards INTEGER NOT NULL DEFAULT 0,
        clear_coin INTEGER NOT NULL DEFAULT 0,
        clear_shards INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        cleared_at TEXT,
        ended_at TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS seal_battle_user_progress(
        event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        day_key TEXT NOT NULL,
        attempts_today INTEGER NOT NULL DEFAULT 0,
        total_attempts INTEGER NOT NULL DEFAULT 0,
        attack_contribution INTEGER NOT NULL DEFAULT 0,
        guard_contribution INTEGER NOT NULL DEFAULT 0,
        purify_contribution INTEGER NOT NULL DEFAULT 0,
        last_role TEXT,
        last_contribution INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(event_id,user_id)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS seal_battle_action_receipts(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL UNIQUE,
        event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        day_key TEXT NOT NULL,
        role TEXT NOT NULL,
        deck_power INTEGER NOT NULL DEFAULT 0,
        contribution INTEGER NOT NULL DEFAULT 0,
        bonus_percent INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING',
        error_text TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS seal_battle_clear_claims(
        event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        reward_coin INTEGER NOT NULL DEFAULT 0,
        reward_shards INTEGER NOT NULL DEFAULT 0,
        claimed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(event_id,user_id)
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_seal_events_status ON seal_battle_events(status,id DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_seal_progress_event_total ON seal_battle_user_progress(event_id,total_attempts DESC,updated_at DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_seal_receipts_cleanup ON seal_battle_action_receipts(status,created_at,id)'),
      env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('seal_battle_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(DEFAULT_SETTINGS)),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1283_seal_battle','1',CURRENT_TIMESTAMP)")
    ]);
    return true;
  })().catch(error => {
    foundationPromise = null;
    throw error;
  });
  return foundationPromise;
}

async function loadSettings(env) {
  const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'").first();
  return cleanSettings(safeJson(row?.value, {}));
}

async function saveSettings(env, value) {
  const clean = cleanSettings(value);
  await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('seal_battle_settings_v1',?,CURRENT_TIMESTAMP)")
    .bind(JSON.stringify(clean)).run();
  return clean;
}

function normalizeEvent(row) {
  if (!row) return null;
  const roles = {};
  for (const role of Object.values(ROLE_META)) {
    const progress = Math.max(0, Number(row[role.progressColumn] || 0));
    const target = Math.max(1, Number(row[role.targetColumn] || 1));
    roles[role.key] = {
      ...role,
      progress,
      target,
      percent: Math.max(0, Math.min(100, progress / target * 100)),
      completed: progress >= target,
      multiplier: Number(row[`${role.key.toLowerCase()}_multiplier`] || 100)
    };
  }
  return {
    id: Number(row.id),
    eventKey: row.event_key,
    title: row.title,
    bossName: row.boss_name,
    bossImage: row.boss_image || '',
    description: row.description || '',
    status: String(row.status || 'ENDED').toUpperCase(),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    dailyAttempts: Number(row.daily_attempts || 3),
    lowestRoleBonusPercent: Number(row.lowest_bonus_percent || 0),
    attemptReward: { coin: Number(row.attempt_coin || 0), shards: Number(row.attempt_shards || 0) },
    clearReward: { coin: Number(row.clear_coin || 0), shards: Number(row.clear_shards || 0) },
    roles,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clearedAt: row.cleared_at || null,
    endedAt: row.ended_at || null
  };
}

async function refreshExpiredEvent(env) {
  await env.DB.prepare(`UPDATE seal_battle_events
    SET status='ENDED',ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
    WHERE status='ACTIVE' AND ends_at IS NOT NULL AND datetime(ends_at)<=datetime('now')`).run();
}

async function currentEventRow(env) {
  await refreshExpiredEvent(env);
  return env.DB.prepare(`SELECT * FROM seal_battle_events
    ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END,id DESC
    LIMIT 1`).first();
}

function eventAvailability(event, settings, user) {
  if (!event) return { open: false, code: 'NO_EVENT', message: '현재 진행 중인 봉인전이 없습니다.' };
  if (settings.mode === 'OFF') return { open: false, code: 'MODE_OFF', message: '현재 봉인전이 중지되어 있습니다.' };
  if (settings.mode === 'TEST' && !['OWNER', 'ADMIN'].includes(String(user?.role || '').toUpperCase())) {
    return { open: false, code: 'TEST_MODE', message: '현재 봉인전 테스트 운영 중입니다.' };
  }
  if (event.status === 'CLEARED') return { open: false, code: 'CLEARED', message: '세 개의 봉인이 모두 완성되었습니다.' };
  if (event.status !== 'ACTIVE') return { open: false, code: 'ENDED', message: '종료된 봉인전입니다.' };
  const now = Date.now();
  if (event.startsAt && Date.parse(event.startsAt) > now) return { open: false, code: 'NOT_STARTED', message: '봉인전 시작 전입니다.' };
  if (event.endsAt && Date.parse(event.endsAt) <= now) return { open: false, code: 'ENDED', message: '봉인전이 종료되었습니다.' };
  return { open: true, code: 'OPEN', message: '봉인 의식에 참여할 수 있습니다.' };
}

function normalizedPercent(role) {
  return Math.max(0, Math.min(1, Number(role.progress || 0) / Math.max(1, Number(role.target || 1))));
}

function lowestRoleKeys(event) {
  const incomplete = Object.values(event.roles).filter(role => !role.completed);
  if (!incomplete.length) return [];
  const minimum = Math.min(...incomplete.map(normalizedPercent));
  return incomplete.filter(role => Math.abs(normalizedPercent(role) - minimum) < 0.000001).map(role => role.key);
}

async function userProgress(env, eventId, userId) {
  return env.DB.prepare('SELECT * FROM seal_battle_user_progress WHERE event_id=? AND user_id=?')
    .bind(eventId, userId).first();
}

function publicProgress(row, dayKey, event) {
  const sameDay = row && String(row.day_key) === dayKey;
  const attemptsToday = sameDay ? Number(row.attempts_today || 0) : 0;
  const totalContribution = Number(row?.attack_contribution || 0) + Number(row?.guard_contribution || 0) + Number(row?.purify_contribution || 0);
  return {
    attemptsToday,
    remainingAttempts: Math.max(0, Number(event?.dailyAttempts || 0) - attemptsToday),
    totalAttempts: Number(row?.total_attempts || 0),
    totalContribution,
    attackContribution: Number(row?.attack_contribution || 0),
    guardContribution: Number(row?.guard_contribution || 0),
    purifyContribution: Number(row?.purify_contribution || 0),
    lastRole: row?.last_role || null,
    lastContribution: Number(row?.last_contribution || 0)
  };
}

async function eventStats(env, eventId) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS participants,COALESCE(SUM(total_attempts),0) AS attempts,
    COALESCE(SUM(attack_contribution+guard_contribution+purify_contribution),0) AS total_contribution
    FROM seal_battle_user_progress WHERE event_id=? AND total_attempts>0`).bind(eventId).first();
  return {
    participants: Number(row?.participants || 0),
    attempts: Number(row?.attempts || 0),
    totalContribution: Number(row?.total_contribution || 0)
  };
}

async function deckState(deps, env, userId) {
  try {
    const deck = await deps.raidDeckPower(env, userId);
    return { ready: true, power: Number(deck.power || 0), cardIds: deck.ids || [] };
  } catch (error) {
    return { ready: false, power: 0, cardIds: [], error: String(error?.message || '저장된 PvE 덱 5장이 필요합니다.') };
  }
}

async function statusPayload(env, deps, user, settings = null, eventRow = null) {
  settings ||= await loadSettings(env);
  eventRow ||= await currentEventRow(env);
  const event = normalizeEvent(eventRow);
  if (!event) return { settings: { mode: settings.mode }, event: null, availability: eventAvailability(null, settings, user), serverNow: new Date().toISOString() };
  const dayKey = kstDayKey();
  const [progressRow, stats, deck, claim, pendingClaim] = await Promise.all([
    userProgress(env, event.id, user.id),
    eventStats(env, event.id),
    deckState(deps, env, user.id),
    env.DB.prepare('SELECT status FROM seal_battle_clear_claims WHERE event_id=? AND user_id=?').bind(event.id, user.id).first(),
    env.DB.prepare(`SELECT e.id,e.event_key,e.title,e.boss_name,e.clear_coin,e.clear_shards,c.status AS claim_status
      FROM seal_battle_events e
      JOIN seal_battle_user_progress p ON p.event_id=e.id AND p.user_id=? AND p.total_attempts>0
      LEFT JOIN seal_battle_clear_claims c ON c.event_id=e.id AND c.user_id=?
      WHERE e.status='CLEARED' AND COALESCE(c.status,'')<>'COMPLETED'
      ORDER BY e.id DESC LIMIT 1`).bind(user.id, user.id).first()
  ]);
  const progress = publicProgress(progressRow, dayKey, event);
  const availability = eventAvailability(event, settings, user);
  return {
    settings: { mode: settings.mode },
    event,
    availability,
    progress,
    stats,
    deck,
    lowestRoleKeys: lowestRoleKeys(event),
    clearReward: {
      eligible: event.status === 'CLEARED' && progress.totalAttempts > 0,
      claimed: String(claim?.status || '') === 'COMPLETED',
      processing: ['PENDING', 'CLAIMING'].includes(String(claim?.status || '')),
      reward: event.clearReward
    },
    pendingClearReward: pendingClaim && Number(pendingClaim.id) !== Number(event.id) ? {
      eventId: Number(pendingClaim.id),
      eventKey: pendingClaim.event_key,
      title: pendingClaim.title,
      bossName: pendingClaim.boss_name,
      reward: { coin: Number(pendingClaim.clear_coin || 0), shards: Number(pendingClaim.clear_shards || 0) },
      processing: ['PENDING', 'CLAIMING'].includes(String(pendingClaim.claim_status || ''))
    } : null,
    serverNow: new Date().toISOString()
  };
}

async function maybeCleanup(env, settings, receiptId) {
  if (!receiptId || receiptId % 20 !== 0) return;
  const receiptDays = clampInt(settings.receiptRetentionDays, 14, 1, 90);
  const progressDays = clampInt(settings.progressRetentionDays, 90, 7, 365);
  try {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM seal_battle_action_receipts WHERE id IN (
        SELECT id FROM seal_battle_action_receipts
        WHERE status IN ('DONE','FAILED') AND created_at<datetime('now',?)
        ORDER BY id ASC LIMIT 200
      )`).bind(`-${receiptDays} days`),
      env.DB.prepare(`DELETE FROM seal_battle_clear_claims WHERE rowid IN (
        SELECT c.rowid FROM seal_battle_clear_claims c
        JOIN seal_battle_events e ON e.id=c.event_id
        WHERE c.status='COMPLETED' AND e.status IN ('ENDED','CLEARED')
          AND COALESCE(e.ended_at,e.cleared_at,e.updated_at)<datetime('now',?)
        ORDER BY c.rowid ASC LIMIT 100
      )`).bind(`-${progressDays} days`),
      env.DB.prepare(`DELETE FROM seal_battle_user_progress WHERE rowid IN (
        SELECT p.rowid FROM seal_battle_user_progress p
        JOIN seal_battle_events e ON e.id=p.event_id
        WHERE e.status IN ('ENDED','CLEARED')
          AND COALESCE(e.ended_at,e.cleared_at,e.updated_at)<datetime('now',?)
        ORDER BY p.rowid ASC LIMIT 100
      )`).bind(`-${progressDays} days`)
    ]);
  } catch (error) {
    console.error('seal battle cleanup failed', error);
  }
}

async function reserveDailyAttempt(env, event, userId, dayKey) {
  await env.DB.prepare(`INSERT INTO seal_battle_user_progress(event_id,user_id,day_key,attempts_today,total_attempts)
    VALUES(?,?,?,0,0)
    ON CONFLICT(event_id,user_id) DO UPDATE SET
      day_key=CASE WHEN seal_battle_user_progress.day_key<>excluded.day_key THEN excluded.day_key ELSE seal_battle_user_progress.day_key END,
      attempts_today=CASE WHEN seal_battle_user_progress.day_key<>excluded.day_key THEN 0 ELSE seal_battle_user_progress.attempts_today END,
      updated_at=CURRENT_TIMESTAMP`).bind(event.id, userId, dayKey).run();
  return env.DB.prepare(`UPDATE seal_battle_user_progress SET attempts_today=attempts_today+1,updated_at=CURRENT_TIMESTAMP
    WHERE event_id=? AND user_id=? AND day_key=? AND attempts_today<?`)
    .bind(event.id, userId, dayKey, event.dailyAttempts).run();
}

async function releaseDailyAttempt(env, eventId, userId, dayKey) {
  try {
    await env.DB.prepare(`UPDATE seal_battle_user_progress
      SET attempts_today=MAX(0,attempts_today-1),updated_at=CURRENT_TIMESTAMP
      WHERE event_id=? AND user_id=? AND day_key=?`).bind(eventId, userId, dayKey).run();
  } catch {}
}

function eventProgressSql(role) {
  const meta = ROLE_META[role];
  const selectedProgress = meta.progressColumn;
  const selectedTarget = meta.targetColumn;
  const roleProgress = {
    ATTACK: role === 'ATTACK' ? `MIN(attack_target,attack_progress+?)` : 'attack_progress',
    GUARD: role === 'GUARD' ? `MIN(guard_target,guard_progress+?)` : 'guard_progress',
    PURIFY: role === 'PURIFY' ? `MIN(purify_target,purify_progress+?)` : 'purify_progress'
  };
  const completion = `${roleProgress.ATTACK}>=attack_target AND ${roleProgress.GUARD}>=guard_target AND ${roleProgress.PURIFY}>=purify_target`;
  return `UPDATE seal_battle_events SET
    ${selectedProgress}=MIN(${selectedTarget},${selectedProgress}+?),
    status=CASE WHEN ${completion} THEN 'CLEARED' ELSE status END,
    cleared_at=CASE WHEN ${completion} THEN COALESCE(cleared_at,CURRENT_TIMESTAMP) ELSE cleared_at END,
    updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='ACTIVE' AND EXISTS(
      SELECT 1 FROM seal_battle_action_receipts WHERE request_id=? AND status='AUTHORIZED'
    )`;
}

function eventProgressBindings(role, contribution, eventId, requestId) {
  // selected progress update 1개 + completion CASE 2회에 선택 역할 값이 각각 포함된다.
  // ATTACK/GUARD/PURIFY 어느 역할이든 총 3개의 contribution 바인딩이 필요하다.
  return [contribution, contribution, contribution, eventId, requestId];
}

function roleContributionUpdateSql(role) {
  const column = ROLE_META[role].userColumn;
  return `UPDATE seal_battle_user_progress SET
    total_attempts=total_attempts+1,
    ${column}=${column}+?,
    last_role=?,last_contribution=?,updated_at=CURRENT_TIMESTAMP
    WHERE event_id=? AND user_id=? AND EXISTS(
      SELECT 1 FROM seal_battle_action_receipts WHERE request_id=? AND status='AUTHORIZED'
    )`;
}

async function participate(env, deps, user, settings, event, body) {
  const requestId = String(body.requestId || '').trim();
  const role = String(body.role || '').toUpperCase();
  if (!requestIdValid(requestId)) return deps.json({ error: '요청 정보가 올바르지 않습니다.' }, 400);
  if (!ROLE_META[role]) return deps.json({ error: '참여 역할을 선택해주세요.' }, 400);

  const existing = await env.DB.prepare('SELECT * FROM seal_battle_action_receipts WHERE request_id=? AND user_id=?')
    .bind(requestId, user.id).first();
  if (existing) {
    if (existing.status === 'DONE') {
      return deps.json({
        ok: true,
        replayed: true,
        role: existing.role,
        contribution: Number(existing.contribution || 0),
        bonusPercent: Number(existing.bonus_percent || 0),
        state: await statusPayload(env, deps, user, settings)
      });
    }
    return deps.json({ error: existing.status === 'FAILED' ? (existing.error_text || '실패한 요청입니다.') : '동일한 요청을 처리 중입니다.' }, 409);
  }

  const availability = eventAvailability(event, settings, user);
  if (!availability.open) return deps.json({ error: availability.message, code: availability.code }, 409);

  const deck = await deckState(deps, env, user.id);
  if (!deck.ready) return deps.json({ error: deck.error || '저장된 PvE 덱 5장이 필요합니다.' }, 400);

  const dayKey = kstDayKey();
  const receiptInsert = await env.DB.prepare(`INSERT OR IGNORE INTO seal_battle_action_receipts(
    request_id,event_id,user_id,day_key,role,status
  ) VALUES(?,?,?,?,?,'PENDING')`).bind(requestId, event.id, user.id, dayKey, role).run();
  if (!Number(receiptInsert?.meta?.changes || 0)) return deps.json({ error: '동일한 요청을 처리 중입니다.' }, 409);
  const receiptId = Number(receiptInsert?.meta?.last_row_id || 0);

  const reserved = await reserveDailyAttempt(env, event, user.id, dayKey);
  if (!Number(reserved?.meta?.changes || 0)) {
    await env.DB.prepare("UPDATE seal_battle_action_receipts SET status='FAILED',error_text='오늘의 참여 횟수를 모두 사용했습니다.',updated_at=CURRENT_TIMESTAMP WHERE request_id=?")
      .bind(requestId).run();
    return deps.json({ error: '오늘의 봉인전 참여 횟수를 모두 사용했습니다.' }, 429);
  }

  const lowest = lowestRoleKeys(event);
  const bonusPercent = lowest.includes(role) ? Number(event.lowestRoleBonusPercent || 0) : 0;
  const multiplier = Number(event.roles[role]?.multiplier || 100);
  const contribution = Math.max(1, Math.min(2000000000, Math.floor(deck.power * multiplier / 100 * (1 + bonusPercent / 100))));
  const attemptCoin = Math.max(0, Number(event.attemptReward.coin || 0));
  const attemptShards = Math.max(0, Number(event.attemptReward.shards || 0));

  const statements = [
    env.DB.prepare(`UPDATE seal_battle_action_receipts SET status='AUTHORIZED',deck_power=?,contribution=?,bonus_percent=?,updated_at=CURRENT_TIMESTAMP
      WHERE request_id=? AND user_id=? AND status='PENDING' AND EXISTS(
        SELECT 1 FROM seal_battle_events WHERE id=? AND status='ACTIVE'
          AND (starts_at IS NULL OR datetime(starts_at)<=datetime('now'))
          AND (ends_at IS NULL OR datetime(ends_at)>datetime('now'))
      )`).bind(deck.power, contribution, bonusPercent, requestId, user.id, event.id),
    env.DB.prepare(eventProgressSql(role)).bind(...eventProgressBindings(role, contribution, event.id, requestId)),
    env.DB.prepare(roleContributionUpdateSql(role)).bind(contribution, role, contribution, event.id, user.id, requestId),
    env.DB.prepare(`UPDATE users SET coin=coin+?,card_shards=card_shards+?
      WHERE id=? AND EXISTS(SELECT 1 FROM seal_battle_action_receipts WHERE request_id=? AND status='AUTHORIZED')`)
      .bind(attemptCoin, attemptShards, user.id, requestId)
  ];
  if (attemptCoin > 0) statements.push(env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
    SELECT id,?,coin,'SEAL_BATTLE_ATTEMPT' FROM users
    WHERE id=? AND EXISTS(SELECT 1 FROM seal_battle_action_receipts WHERE request_id=? AND status='AUTHORIZED')`)
    .bind(attemptCoin, user.id, requestId));
  if (attemptShards > 0) statements.push(env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason)
    SELECT id,?,card_shards,'SEAL_BATTLE_ATTEMPT' FROM users
    WHERE id=? AND EXISTS(SELECT 1 FROM seal_battle_action_receipts WHERE request_id=? AND status='AUTHORIZED')`)
    .bind(attemptShards, user.id, requestId));
  statements.push(env.DB.prepare(`UPDATE seal_battle_action_receipts SET status='DONE',error_text=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE request_id=? AND status='AUTHORIZED'`).bind(requestId));

  let results;
  try {
    results = await env.DB.batch(statements);
  } catch (error) {
    await releaseDailyAttempt(env, event.id, user.id, dayKey);
    try {
      await env.DB.prepare("UPDATE seal_battle_action_receipts SET status='FAILED',error_text=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'")
        .bind(String(error?.message || error).slice(0, 300), requestId).run();
    } catch {}
    console.error('seal battle participation commit failed', error);
    return deps.json({ error: '봉인전 참여 처리에 실패했습니다.' }, 500);
  }

  if (!Number(results?.[0]?.meta?.changes || 0)) {
    await releaseDailyAttempt(env, event.id, user.id, dayKey);
    await env.DB.prepare("UPDATE seal_battle_action_receipts SET status='FAILED',error_text='봉인전이 이미 종료되었습니다.',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'")
      .bind(requestId).run();
    return deps.json({ error: '봉인전이 이미 종료되었습니다.' }, 409);
  }

  let balance = null;
  try {
    balance = await env.DB.prepare('SELECT coin,card_shards FROM users WHERE id=?').bind(user.id).first();
  } catch (error) {
    console.warn('seal battle balance refresh failed after commit', error);
  }
  await maybeCleanup(env, settings, receiptId);

  let state = null;
  try {
    state = await statusPayload(env, deps, user, settings);
  } catch (error) {
    console.warn('seal battle status refresh failed after commit', error);
  }

  return deps.json({
    ok: true,
    role,
    contribution,
    deckPower: deck.power,
    bonusPercent,
    reward: { coin: attemptCoin, shards: attemptShards },
    balances: balance ? { coin: Number(balance.coin || 0), cardShards: Number(balance.card_shards || 0) } : null,
    state
  });
}

async function claimClearReward(env, deps, user, event) {
  if (!event || event.status !== 'CLEARED') return deps.json({ error: '아직 봉인 완료 보상을 받을 수 없습니다.' }, 409);
  const progress = await userProgress(env, event.id, user.id);
  if (!progress || Number(progress.total_attempts || 0) < 1) return deps.json({ error: '이번 봉인전 참여 기록이 없습니다.' }, 403);

  await env.DB.prepare(`INSERT OR IGNORE INTO seal_battle_clear_claims(event_id,user_id,status,reward_coin,reward_shards)
    VALUES(?,?,'PENDING',?,?)`).bind(event.id, user.id, event.clearReward.coin, event.clearReward.shards).run();
  const reserved = await env.DB.prepare(`UPDATE seal_battle_clear_claims SET status='CLAIMING',updated_at=CURRENT_TIMESTAMP
    WHERE event_id=? AND user_id=? AND status='PENDING'`).bind(event.id, user.id).run();
  if (!Number(reserved?.meta?.changes || 0)) {
    const row = await env.DB.prepare('SELECT status FROM seal_battle_clear_claims WHERE event_id=? AND user_id=?').bind(event.id, user.id).first();
    if (row?.status === 'COMPLETED') return deps.json({ error: '이미 봉인 완료 보상을 수령했습니다.' }, 409);
    return deps.json({ error: '봉인 완료 보상을 처리 중입니다.' }, 409);
  }

  const coin = Number(event.clearReward.coin || 0);
  const shards = Number(event.clearReward.shards || 0);
  const statements = [env.DB.prepare(`UPDATE users SET coin=coin+?,card_shards=card_shards+?
    WHERE id=? AND EXISTS(
      SELECT 1 FROM seal_battle_clear_claims WHERE event_id=? AND user_id=? AND status='CLAIMING'
    )`).bind(coin, shards, user.id, event.id, user.id)];
  if (coin > 0) statements.push(env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
    SELECT id,?,coin,'SEAL_BATTLE_CLEAR' FROM users
    WHERE id=? AND EXISTS(
      SELECT 1 FROM seal_battle_clear_claims WHERE event_id=? AND user_id=? AND status='CLAIMING'
    )`).bind(coin, user.id, event.id, user.id));
  if (shards > 0) statements.push(env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason)
    SELECT id,?,card_shards,'SEAL_BATTLE_CLEAR' FROM users
    WHERE id=? AND EXISTS(
      SELECT 1 FROM seal_battle_clear_claims WHERE event_id=? AND user_id=? AND status='CLAIMING'
    )`).bind(shards, user.id, event.id, user.id));
  statements.push(env.DB.prepare("UPDATE seal_battle_clear_claims SET status='COMPLETED',claimed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=? AND status='CLAIMING'").bind(event.id, user.id));

  let rewardResults;
  try {
    rewardResults = await env.DB.batch(statements);
  } catch (error) {
    try {
      await env.DB.prepare("UPDATE seal_battle_clear_claims SET status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=? AND status='CLAIMING'").bind(event.id, user.id).run();
    } catch {}
    console.error('seal battle clear reward commit failed', error);
    return deps.json({ error: '봉인 완료 보상 지급에 실패했습니다.' }, 500);
  }

  if (!Number(rewardResults?.[0]?.meta?.changes || 0)) {
    try {
      await env.DB.prepare("UPDATE seal_battle_clear_claims SET status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=? AND status='CLAIMING'").bind(event.id, user.id).run();
    } catch {}
    return deps.json({ error: '봉인 완료 보상 상태가 변경되어 지급되지 않았습니다.' }, 409);
  }

  let balance = null;
  try {
    balance = await env.DB.prepare('SELECT coin,card_shards FROM users WHERE id=?').bind(user.id).first();
  } catch (error) {
    console.warn('seal battle clear reward balance refresh failed after commit', error);
  }
  return deps.json({
    ok: true,
    reward: { coin, shards },
    balances: balance ? { coin: Number(balance.coin || 0), cardShards: Number(balance.card_shards || 0) } : null
  });
}

async function rankings(env, eventId) {
  const overall = (await env.DB.prepare(`SELECT p.user_id,u.nickname,p.total_attempts,
    p.attack_contribution,p.guard_contribution,p.purify_contribution,
    (p.attack_contribution+p.guard_contribution+p.purify_contribution) AS total_contribution
    FROM seal_battle_user_progress p JOIN users u ON u.id=p.user_id
    WHERE p.event_id=? AND p.total_attempts>0
    ORDER BY total_contribution DESC,p.total_attempts DESC,p.updated_at ASC LIMIT 50`).bind(eventId).all()).results;
  const roleRanks = {};
  for (const role of Object.values(ROLE_META)) {
    roleRanks[role.key] = (await env.DB.prepare(`SELECT p.user_id,u.nickname,p.${role.userColumn} AS contribution,p.total_attempts
      FROM seal_battle_user_progress p JOIN users u ON u.id=p.user_id
      WHERE p.event_id=? AND p.${role.userColumn}>0
      ORDER BY p.${role.userColumn} DESC,p.updated_at ASC LIMIT 20`).bind(eventId).all()).results;
  }
  return { overall, roles: roleRanks };
}

async function adminOverview(env, settings) {
  const row = await currentEventRow(env);
  const event = normalizeEvent(row);
  const stats = event ? await eventStats(env, event.id) : { participants: 0, attempts: 0, totalContribution: 0 };
  const claims = event ? await env.DB.prepare("SELECT COUNT(*) AS total FROM seal_battle_clear_claims WHERE event_id=? AND status='COMPLETED'").bind(event.id).first() : null;
  const history = (await env.DB.prepare(`SELECT id,event_key,title,boss_name,status,attack_target,guard_target,purify_target,
    attack_progress,guard_progress,purify_progress,created_at,cleared_at,ended_at
    FROM seal_battle_events ORDER BY id DESC LIMIT 10`).all()).results;
  return { settings, event, stats: { ...stats, clearClaims: Number(claims?.total || 0) }, history };
}

async function adminStart(env, settings, admin) {
  const key = eventKey();
  await env.DB.batch([
    env.DB.prepare("UPDATE seal_battle_events SET status='ENDED',ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE status='ACTIVE'"),
    env.DB.prepare(`INSERT INTO seal_battle_events(
      event_key,title,boss_name,boss_image,description,status,starts_at,ends_at,daily_attempts,
      attack_target,guard_target,purify_target,attack_multiplier,guard_multiplier,purify_multiplier,
      lowest_bonus_percent,attempt_coin,attempt_shards,clear_coin,clear_shards,created_by
    ) VALUES(?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      key, settings.title, settings.bossName, settings.bossImage, settings.description,
      settings.startsAt, settings.endsAt, settings.dailyAttempts,
      settings.targets.attack, settings.targets.guard, settings.targets.purify,
      settings.multipliers.attack, settings.multipliers.guard, settings.multipliers.purify,
      settings.lowestRoleBonusPercent, settings.attemptReward.coin, settings.attemptReward.shards,
      settings.clearReward.coin, settings.clearReward.shards, admin.id
    )
  ]);
  return normalizeEvent(await env.DB.prepare('SELECT * FROM seal_battle_events WHERE event_key=?').bind(key).first());
}

export async function handleSealBattle({ path, request, env, deps }) {
  if (!path.startsWith('seal-battle') && !path.startsWith('admin/seal-battle')) return null;
  await ensureFoundation(env);

  const user = await deps.authenticate(request, env);
  if (!user) return deps.json({ error: '로그인이 필요합니다.' }, 401);

  const isAdminPath = path.startsWith('admin/');
  let admin = null;
  if (isAdminPath) {
    admin = await deps.requirePermission(request, env, 'SETTINGS');
    if (!admin || String(admin.role || '').toUpperCase() !== 'OWNER') return deps.json({ error: '봉인전 관리는 OWNER 전용입니다.' }, 403);
  }

  const settings = await loadSettings(env);

  if (path === 'seal-battle/status' && request.method === 'GET') {
    return deps.json(await statusPayload(env, deps, user, settings));
  }

  if (path === 'seal-battle/participate' && request.method === 'POST') {
    const event = normalizeEvent(await currentEventRow(env));
    if (!event) return deps.json({ error: '현재 진행 중인 봉인전이 없습니다.' }, 404);
    return participate(env, deps, user, settings, event, await deps.readBody(request));
  }

  if (path === 'seal-battle/clear-reward' && request.method === 'POST') {
    const body = await deps.readBody(request);
    const requestedEventId = Math.max(0, Math.floor(Number(body.eventId || 0)));
    let eventRow = requestedEventId
      ? await env.DB.prepare('SELECT * FROM seal_battle_events WHERE id=?').bind(requestedEventId).first()
      : await currentEventRow(env);
    if (!requestedEventId && eventRow && String(eventRow.status || '').toUpperCase() !== 'CLEARED') {
      eventRow = await env.DB.prepare(`SELECT e.* FROM seal_battle_events e
        JOIN seal_battle_user_progress p ON p.event_id=e.id AND p.user_id=? AND p.total_attempts>0
        LEFT JOIN seal_battle_clear_claims c ON c.event_id=e.id AND c.user_id=?
        WHERE e.status='CLEARED' AND COALESCE(c.status,'')<>'COMPLETED'
        ORDER BY e.id DESC LIMIT 1`).bind(user.id, user.id).first();
    }
    return claimClearReward(env, deps, user, normalizeEvent(eventRow));
  }

  if (path === 'seal-battle/rankings' && request.method === 'GET') {
    const event = normalizeEvent(await currentEventRow(env));
    if (!event) return deps.json({ event: null, overall: [], roles: {} });
    return deps.json({ event, ...(await rankings(env, event.id)) });
  }

  if (path === 'admin/seal-battle/overview' && request.method === 'GET') {
    return deps.json(await adminOverview(env, settings));
  }

  if (path === 'admin/seal-battle/settings' && request.method === 'PATCH') {
    const body = await deps.readBody(request);
    const next = await saveSettings(env, body.settings || body);
    if (typeof deps.writeAdminLog === 'function') {
      await deps.writeAdminLog(env, admin, 'SEAL_BATTLE_SETTINGS_UPDATE', 'SEAL_BATTLE', 'settings', settings, next);
    }
    return deps.json({ ok: true, settings: next });
  }

  if (path === 'admin/seal-battle/event' && request.method === 'POST') {
    const body = await deps.readBody(request);
    const action = String(body.action || 'START').toUpperCase();
    if (action === 'START') {
      const event = await adminStart(env, settings, admin);
      if (typeof deps.writeAdminLog === 'function') await deps.writeAdminLog(env, admin, 'SEAL_BATTLE_START', 'SEAL_BATTLE', event.eventKey, null, event);
      return deps.json({ ok: true, event, overview: await adminOverview(env, settings) });
    }
    if (action === 'END') {
      const active = await env.DB.prepare("SELECT * FROM seal_battle_events WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1").first();
      if (!active) return deps.json({ error: '종료할 활성 봉인전이 없습니다.' }, 409);
      await env.DB.prepare("UPDATE seal_battle_events SET status='ENDED',ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'").bind(active.id).run();
      if (typeof deps.writeAdminLog === 'function') await deps.writeAdminLog(env, admin, 'SEAL_BATTLE_END', 'SEAL_BATTLE', active.event_key, normalizeEvent(active), null);
      return deps.json({ ok: true, overview: await adminOverview(env, settings) });
    }
    return deps.json({ error: '지원하지 않는 봉인전 관리 작업입니다.' }, 400);
  }

  return deps.json({ error: '봉인전 API를 찾을 수 없습니다.' }, 404);
}
