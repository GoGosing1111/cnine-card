// OWNER-only, explicitly invoked maintenance. No scheduler and no account deletion.
// PostgreSQL is required so revalidation, membership removal and recovery records
// share one transaction. Neither request SQL nor table/column names are accepted.
const DAY = 86400000;
const PREFIX = 'clan_inactivity_cleanup_v2049:';
const confirmationForDays = days => `REMOVE_INACTIVE_CLAN_MEMBERS_${days}_DAYS`;
const SOURCES = [
  ['sessions', 'user_id', ['created_at'], true],
  ['attendance_logs', 'user_id', ['claimed_at', 'created_at'], true],
  ['draw_logs', 'user_id', ['created_at'], true],
  ['battle_logs', 'user_id', ['created_at'], true],
  ['pve_auto_runs', 'user_id', ['created_at']],
  ['pvp_match_history', 'attacker_id', ['created_at']],
  ['tower_clear_history', 'user_id', ['cleared_at', 'created_at']],
  ['raid_damage_logs', 'user_id', ['created_at']],
  ['captain_match_history_v2', 'attacker_user_id', ['created_at']],
  ['captain_match_history_v3', 'initiated_by_user_id', ['created_at']],
  ['card_evolution_logs', 'user_id', ['created_at']],
  ['idle_dungeon_active_sessions', 'user_id', ['heartbeat_at']],
  ['idle_dungeon_claim_receipts', 'user_id', ['created_at']],
  ['clan_war_battles', 'attacker_user_id', ['created_at'], true],
  ['pvp_decks', 'user_id', ['updated_at']],
  ['pve_decks', 'user_id', ['updated_at']]
];
// Passive defense, automatic rewards, admin gifts, session expiry and clan draft
// assignment are intentionally NOT access evidence.
const pack = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? Number(v) : v);
const check = (ok, message, status = 409) => { if (!ok) throw Object.assign(new Error(message), {status}); };
function cleanupDays(value = 5) {
  check(value === 3 || value === 5, '미접속 기준은 3일 또는 5일만 사용할 수 있습니다.', 400);
  return value;
}
export function clanAccessMs(value) {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();
  const raw = String(value).trim();
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`);
}

async function transaction(db, operation) {
  check(db?.dialect === 'postgres' && db.client && typeof db.enqueue === 'function', 'PostgreSQL 운영 DB에서만 실행할 수 있습니다.');
  return db.enqueue(async () => {
    const q = async (text, values = []) => (await db.client.query({text, values})).rows;
    await q('BEGIN');
    try {
      await q("SET LOCAL TIME ZONE 'UTC'");
      await q("SET LOCAL lock_timeout='3s'");
      await q("SET LOCAL statement_timeout='15s'");
      const result = await operation(q);
      await q('COMMIT');
      return result;
    } catch (error) {
      try { await q('ROLLBACK'); } catch { /* Keep the original failure. */ }
      throw error;
    }
  });
}

export {transaction as clanAdminTransaction};

async function snapshot(q, cutoffMs, expectedSeasonId = null, days = 5) {
  const [season] = await q("SELECT * FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC LIMIT 1");
  check(season && ['ACTIVE', 'DRAFT', 'REGISTRATION'].includes(season.phase), '정리 가능한 진행 중 클랜 시즌이 없습니다.');
  check(expectedSeasonId === null || Number(season.id) === expectedSeasonId, '클랜 시즌이 변경되었습니다. 명단을 다시 확인하세요.');
  const members = await q(`SELECT m.*,u.nickname,u.last_login_at,t.master_user_id
    FROM clan_members m JOIN users u ON u.id=m.user_id
    JOIN clan_season_teams t ON t.season_id=m.season_id AND t.clan_id=m.clan_id
    WHERE m.season_id=$1 ORDER BY m.clan_id,m.user_id`, [season.id]);
  const [{n}] = await q('SELECT COUNT(*) n FROM clan_members WHERE season_id=$1', [season.id]);
  check(Number(n) === members.length, '사용자 또는 마스터 정보가 누락된 클랜원이 있습니다. 자동 처리를 중단합니다.');
  check(members.length <= 1000, '클랜 인원 확인 한도를 초과했습니다.');
  const clans = await q(`SELECT o.id,o.name,COUNT(m.user_id)::integer AS member_count
    FROM clan_organizations o LEFT JOIN clan_members m ON m.clan_id=o.id AND m.season_id=$1
    WHERE o.is_active=1 OR m.user_id IS NOT NULL GROUP BY o.id,o.name ORDER BY o.id`, [season.id]);
  const columns = await q(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=ANY($1::text[])`, [SOURCES.map(s => s[0])]);
  const catalog = new Map();
  for (const row of columns) {
    if (!catalog.has(row.table_name)) catalog.set(row.table_name, new Set());
    catalog.get(row.table_name).add(row.column_name);
  }
  const checks = [], sources = [], absentSources = [];
  for (const [table, userColumn, times, required] of SOURCES) {
    const cols = catalog.get(table), timeColumn = times.find(name => cols?.has(name));
    if (!cols) { check(!required, `필수 접속 확인 기록이 없습니다: ${table}`); absentSources.push(table); continue; }
    check(cols.has(userColumn) && timeColumn, `활동 기록 스키마를 확인할 수 없습니다: ${table}`);
    sources.push(`${table}.${timeColumn}`);
    // Identifiers only come from SOURCES above, never from the request.
    checks.push(`SELECT ${userColumn} AS user_id,MAX(NULLIF(${timeColumn}::text,'')::timestamptz) AS last_at,
      '${table}.${timeColumn}'::text AS source FROM ${table}
      WHERE ${userColumn}=ANY($1::bigint[]) GROUP BY ${userColumn}`);
  }
  const staleIds = members.filter(m => !(clanAccessMs(m.last_login_at) > cutoffMs)).map(m => Number(m.user_id));
  const activity = staleIds.length ? await q(checks.join(' UNION ALL '), [staleIds]) : [];
  const byUser = new Map();
  for (const row of activity) {
    const at = clanAccessMs(row.last_at), old = byUser.get(Number(row.user_id));
    if (Number.isFinite(at) && (!old || at > old.at)) byUser.set(Number(row.user_id), {at, source: row.source});
  }
  const busyRows = await q(`SELECT attacker_user_id AS user_id FROM clan_war_battles
      WHERE season_id=$1 AND status IN ('PENDING','RESOLVING')
    UNION SELECT defender_user_id FROM clan_war_battles WHERE season_id=$1 AND status IN ('PENDING','RESOLVING')
    UNION SELECT l.user_id FROM clan_war_reservation_locks l JOIN clan_wars w ON w.id=l.war_id
      WHERE w.season_id=$1 AND l.expires_at::timestamptz>CURRENT_TIMESTAMP`, [season.id]);
  const busy = new Set(busyRows.map(r => Number(r.user_id)));
  const roster = members.map(m => {
    const login = clanAccessMs(m.last_login_at), activityRow = byUser.get(Number(m.user_id));
    const last = activityRow && (!Number.isFinite(login) || activityRow.at > login) ? activityRow : {at: login, source: 'users.last_login_at'};
    const inactive = Number.isFinite(last.at) && last.at <= cutoffMs;
    const master = m.member_role === 'MASTER' || Number(m.master_user_id) === Number(m.user_id);
    const state = !Number.isFinite(last.at) ? 'UNKNOWN' : !inactive ? 'ACTIVE' : master ? 'MASTER_REVIEW' : busy.has(Number(m.user_id)) ? 'BATTLE_BUSY' : 'REMOVE';
    return {userId: Number(m.user_id), nickname: m.nickname, clanId: Number(m.clan_id), memberRole: m.member_role,
      joinedAt: m.joined_at, lastLoginAt: m.last_login_at, lastAccessAt: Number.isFinite(last.at) ? new Date(last.at).toISOString() : null,
      evidence: Number.isFinite(last.at) ? last.source : null, state};
  });
  return {seasonId: Number(season.id), seasonNo: Number(season.season_no), cutoff: new Date(cutoffMs).toISOString(),
    days, clans: clans.map(c => ({clanId: Number(c.id), name: c.name, memberCount: Number(c.member_count)})),
    totalMembers: roster.length, candidates: roster.filter(r => r.state === 'REMOVE'),
    exceptions: roster.filter(r => ['UNKNOWN', 'MASTER_REVIEW', 'BATTLE_BUSY'].includes(r.state)), roster, sources, absentSources};
}

export async function handleClanInactivityCleanup({request, env, user, deps, now = Date.now()}) {
  if (String(user?.role || '').toUpperCase() !== 'OWNER') return deps.json({error: 'OWNER만 클랜 미접속 정리를 실행할 수 있습니다.'}, 403);
  if (!['GET', 'POST'].includes(request.method)) return deps.json({error: '지원하지 않는 요청 방식입니다.'}, 405);
  try {
    const body = request.method === 'POST' ? await deps.readBody(request) : {};
    const action = request.method === 'GET' ? 'report' : body.action;
    check(['report', 'preview', 'apply'].includes(action), '명단 확인 또는 적용 작업을 지정하세요.', 400);
    if (action !== 'apply') {
      const days = cleanupDays(body.days);
      const result = await transaction(env.DB, async q => {
        const report = await snapshot(q, now - days * DAY, null, days);
        if (action === 'report') return {ok: true, ...report, serverNow: new Date(now).toISOString()};
        const previewId = crypto.randomUUID(), record = {status: 'PREVIEW', ownerId: Number(user.id), createdAt: now, report};
        await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)', [PREFIX + previewId, pack(record), new Date(now).toISOString()]);
        return {ok: true, previewId, ...report, serverNow: new Date(now).toISOString()};
      });
      return deps.json(result);
    }
    check(typeof body.confirmation === 'string' && /^[0-9a-f-]{36}$/.test(String(body.previewId || '')), '탈퇴 확인값과 명단 확인 ID가 필요합니다.', 400);
    const result = await transaction(env.DB, async q => {
      const key = PREFIX + body.previewId;
      const [saved] = await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE', [key]);
      check(saved, '확인된 정리 명단을 찾을 수 없습니다.');
      const record = JSON.parse(saved.value);
      check(record.ownerId === Number(user.id), '다른 관리자가 확인한 명단입니다.', 403);
      // The saved preview owns the cutoff. An apply request cannot shorten it
      // or confirm a different threshold, including an idempotent replay.
      const days = cleanupDays(record.report.days);
      check(body.confirmation === confirmationForDays(days) && (body.days === undefined || body.days === days), '확인한 명단과 미접속 기준이 다릅니다.', 400);
      if (record.status === 'COMPLETED') return {...record.result, replayed: true};
      check(record.status === 'PREVIEW' && now >= record.createdAt && now - record.createdAt <= 15 * 60000, '정리 명단이 만료되었습니다. 다시 확인하세요.');
      // Short, fail-fast clan-only lock also excludes new battle reservations and
      // lifecycle/roster edits while we revalidate. Busy battles are left alone.
      await q('LOCK TABLE clan_wars,clan_war_battles,clan_war_reservation_locks,clan_members,clan_season_teams,clan_seasons,clan_draft_pool IN SHARE ROW EXCLUSIVE MODE NOWAIT');
      const ids = record.report.candidates.map(m => m.userId);
      if (ids.length) await q('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE', [ids]);
      const fresh = await snapshot(q, clanAccessMs(record.report.cutoff), record.report.seasonId, days);
      const freshById = new Map(fresh.roster.map(m => [m.userId, m]));
      const removed = [], skipped = [];
      for (const old of record.report.candidates) {
        const member = freshById.get(old.userId);
        if (member?.state === 'REMOVE' && member.clanId === old.clanId && member.memberRole === old.memberRole && member.joinedAt === old.joinedAt) removed.push(member);
        else skipped.push({userId: old.userId, nickname: old.nickname, reason: member?.state === 'REMOVE' ? 'MEMBERSHIP_CHANGED' : member?.state || 'ALREADY_LEFT'});
      }
      const removeIds = removed.map(m => m.userId), seasonId = fresh.seasonId;
      const membersBefore = removeIds.length ? await q('SELECT * FROM clan_members WHERE season_id=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id', [seasonId, removeIds]) : [];
      const draftBefore = removeIds.length ? await q('SELECT * FROM clan_draft_pool WHERE season_id=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id', [seasonId, removeIds]) : [];
      if (removeIds.length) {
        const deleted = await q('DELETE FROM clan_members WHERE season_id=$1 AND user_id=ANY($2::bigint[]) RETURNING user_id', [seasonId, removeIds]);
        check(deleted.length === removeIds.length, '탈퇴 처리 인원 불일치: 전체 변경을 취소합니다.');
        await q("UPDATE clan_draft_pool SET status='WITHDRAWN',drafted_clan_id=NULL,pick_no=NULL,updated_at=$3 WHERE season_id=$1 AND user_id=ANY($2::bigint[])", [seasonId, removeIds, new Date(now).toISOString()]);
      }
      const after = await q(`SELECT o.id,o.name,COUNT(m.user_id)::integer AS member_count FROM clan_organizations o
        LEFT JOIN clan_members m ON m.clan_id=o.id AND m.season_id=$1
        WHERE o.is_active=1 OR o.id=ANY($2::bigint[]) GROUP BY o.id,o.name ORDER BY o.id`, [seasonId, fresh.clans.map(c => c.clanId)]);
      const result = {ok: true, previewId: body.previewId, seasonId, cutoff: fresh.cutoff, days, removed, removedCount: removed.length, skipped,
        exceptions: fresh.exceptions, beforeCount: fresh.totalMembers,
        clans: after.map(c => ({clanId: Number(c.id), name: c.name, beforeCount: fresh.clans.find(b => b.clanId === Number(c.id))?.memberCount || 0,
          removedCount: removed.filter(m => m.clanId === Number(c.id)).length, memberCount: Number(c.member_count)})),
        totalMembers: after.reduce((n, c) => n + Number(c.member_count), 0), completedAt: new Date(now).toISOString(),
        recoveryKey: key, recurring: false};
      check(result.beforeCount - result.removedCount === result.totalMembers, '클랜 인원 합계 검증에 실패했습니다.');
      const completed = {...record, status: 'COMPLETED', membersBefore, draftBefore, result};
      await q('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1', [key, pack(completed), result.completedAt]);
      await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
        VALUES($1,'CLAN_INACTIVITY_CLEANUP','CLAN_SEASON',$2,$3,$4)`, [user.id, String(seasonId), pack({membersBefore, draftBefore}), pack(result)]);
      return result;
    });
    return deps.json(result);
  } catch (error) {
    console.warn('[CLAN_INACTIVITY_CLEANUP]', pack({code: error.code || 'VALIDATION', status: error.status || 409}));
    return deps.json({error: error.status ? error.message : '접속 기록 검증 또는 정리 중 오류가 발생했습니다. 변경은 취소되었습니다.', code: error.code || 'CLAN_CLEANUP_FAILED'}, error.status || 409);
  }
}
