import { readRuntimeData, cacheRuntimeData } from './_runtime_data_cache.js';

// Reserved postseason rounds; regular ranking/season points exclude these rounds.
export const CHAMPIONS_SEMIFINAL_ROUND = 1001;
export const CHAMPIONS_FINAL_ROUND = 1002;
export const CHAMPIONS_DEFAULTS = Object.freeze({
  championsEnabled: true, championsOpenTime: '21:00',
  championsSemifinalDelayDays: 1, championsFinalDelayDays: 1,
  championsRewardsEnabled: false, championsCoin: 0, championsMysticEnergy: 0,
  championsMasterStar: 0, championsRerollTicket: 0
});
const REWARDS = Object.freeze([
  ['championsCoin', 'COIN', '코인', Number.MAX_SAFE_INTEGER],
  ['championsMysticEnergy', 'STARLIGHT_ARMOR_CORE', '미스틱 에너지', 100000],
  ['championsMasterStar', 'MASTER_STAR', '마스터의 별', 100000],
  ['championsRerollTicket', 'HIGH_GRADE_REROLL_TICKET', '고등급 재뽑기권', 100000]
]);
// Approved base prizes are separate from optional CMS currency bonuses.
export const CHAMPIONS_BASE_REWARDS = Object.freeze([
  Object.freeze({ type: 'CLAN_CHAMPIONS_TROPHY', label: '챔피언스리그 우승 트로피', amount: 1, unit: '개' }),
  Object.freeze({ type: 'AVATAR_SOLAR_VANGUARD', label: '태양의 선봉대장 아바타', amount: 14, unit: '일' })
]);
const SCHEMA_KEY = 'safe_runtime_upgrade_v2071_clan_champions';
const parse = (value, fallback = {}) => { try { return JSON.parse(value || ''); } catch { return fallback; } };
const num = value => Number(value || 0);
const iso = value => new Date(value).toISOString();
const time = value => Date.parse(String(value || '').includes('T') ? value : `${String(value || '').replace(' ', 'T')}Z`);
const rows = result => result?.results || [];
const invariant = (ok, message) => { if (!ok) throw new Error(message); };
const boolean = value => value === true || value === 1 || value === '1' || value === 'true';

export function cleanChampionsSettings(raw = {}, current = CHAMPIONS_DEFAULTS) {
  const source = { ...CHAMPIONS_DEFAULTS, ...current, ...raw }, result = {};
  for (const key of Object.keys(CHAMPIONS_DEFAULTS)) result[key] = source[key];
  result.championsEnabled = boolean(source.championsEnabled);
  result.championsRewardsEnabled = boolean(source.championsRewardsEnabled);
  const clock = /^(\d{1,2}):(\d{2})$/.exec(String(source.championsOpenTime));
  result.championsOpenTime = clock && num(clock[1]) < 24 && num(clock[2]) < 60
    ? `${clock[1].padStart(2, '0')}:${clock[2]}` : '21:00';
  for (const key of ['championsSemifinalDelayDays', 'championsFinalDelayDays'])
    result[key] = Math.max(1, Math.min(30, Math.round(num(source[key]) || 1)));
  for (const [key, , , max] of REWARDS)
    result[key] = Number.isSafeInteger(Number(source[key])) ? Math.max(0, Math.min(max, Number(source[key]))) : 0;
  return result;
}

export function validateChampionsSettings(candidate, next) {
  for (const [key, , label, max] of REWARDS) if (key in candidate)
    invariant(candidate[key] !== '' && candidate[key] !== null && Number.isSafeInteger(Number(candidate[key]))
      && Number(candidate[key]) >= 0 && Number(candidate[key]) <= max, `챔피언스리그 ${label} 수량을 확인하세요.`);
  for (const key of ['championsSemifinalDelayDays', 'championsFinalDelayDays']) if (key in candidate)
    invariant(Number.isInteger(Number(candidate[key])) && Number(candidate[key]) >= 1 && Number(candidate[key]) <= 30,
      '챔피언스리그 경기 간격은 1~30일 정수로 입력하세요.');
  if ('championsOpenTime' in candidate)
    invariant(/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(candidate.championsOpenTime)), '챔피언스리그 개방 시각을 확인하세요.');
  if (next.championsRewardsEnabled)
    invariant(next.mode === 'ON' && REWARDS.some(([key]) => next[key] > 0), '챔피언스리그 우승 보상은 공개 ON·지급 수량 설정 후 활성화하세요.');
}

export function championsSchema(postgres = false) {
  const int = postgres ? 'BIGINT' : 'INTEGER', now = postgres ? 'sqlite_now()' : 'CURRENT_TIMESTAMP';
  return [
    `CREATE TABLE IF NOT EXISTS clan_championships (
      season_id ${int} PRIMARY KEY, status TEXT NOT NULL DEFAULT 'SEMIFINAL',
      seeds_json TEXT NOT NULL, settings_json TEXT NOT NULL, creation_token TEXT NOT NULL,
      semifinal_starts_at TEXT NOT NULL, final_starts_at TEXT NOT NULL,
      winner_clan_id ${int}, reward_status TEXT NOT NULL DEFAULT 'AWAITING_CONFIG', reward_json TEXT,
      created_at TEXT NOT NULL DEFAULT ${now}, completed_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS clan_championship_members (
      season_id ${int} NOT NULL, user_id ${int} NOT NULL, clan_id ${int} NOT NULL,
      PRIMARY KEY(season_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS clan_championship_rewards (
      season_id ${int} NOT NULL, user_id ${int} NOT NULL, reward_type TEXT NOT NULL,
      reward_amount ${int} NOT NULL, processing_token TEXT NOT NULL, message_id ${int},
      status TEXT NOT NULL DEFAULT 'PENDING', completed_at TEXT,
      PRIMARY KEY(season_id,user_id,reward_type))`
  ];
}

export async function ensureChampionsSchema(env) {
  if (readRuntimeData(env, SCHEMA_KEY)) return;
  const marker = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SCHEMA_KEY).first();
  if (!marker) {
    const sql = championsSchema(env.DB.dialect === 'postgres');
    if (env.DB.dialect === 'postgres') await env.DB.execSchema(sql);
    else await env.DB.batch(sql.map(statement => env.DB.prepare(statement)));
    await env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)').bind(SCHEMA_KEY, '2071').run();
  }
  cacheRuntimeData(env, SCHEMA_KEY, true, 1800000);
}

// KST calendar days, then the next configured clan opening day. Never create an expired playoff.
export function championsNextWindow(from, days, settings) {
  const kst = new Date(from + 9 * 3600000), [hour, minute] = settings.championsOpenTime.split(':').map(Number);
  const start = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + days, hour - 9, minute);
  const openDays = settings.openDays?.length ? settings.openDays : [0,1,2,3,4,5,6];
  for (let offset = 0; offset < 8; offset++) {
    const candidate = start + offset * 86400000;
    if (candidate > from && openDays.includes(new Date(candidate + 9 * 3600000).getUTCDay())) return candidate;
  }
  throw new Error('챔피언스리그 개방 요일을 확인하세요.');
}

function rewardSpec(settings) {
  return [...CHAMPIONS_BASE_REWARDS, ...REWARDS.filter(([key]) => settings.championsRewardsEnabled && num(settings[key]) > 0)
    .map(([key, type, label]) => ({ type, label, amount: num(settings[key]) }))];
}

export async function startChampions(env, season, settings, rankedTeams, now = Date.now()) {
  if (!settings.championsEnabled || rankedTeams.length < 3) {
    await env.DB.prepare("UPDATE clan_seasons SET phase='COMPLETE',updated_at=CURRENT_TIMESTAMP WHERE id=? AND phase='SETTLEMENT'").bind(season.id).run();
    return;
  }
  const seeds = rankedTeams.slice(0, 3).map((team, index) => ({ seed: index + 1, clanId: num(team.clan_id),
    name: team.name, markKey: team.mark_key, primaryColor: team.primary_color, accentColor: team.accent_color,
    score: num(team.score), combatPoints: num(team.combat_points) }));
  invariant(new Set(seeds.map(seed => seed.clanId)).size === 3, '챔피언스리그 시드가 중복되었습니다.');
  const semi = championsNextWindow(now, settings.championsSemifinalDelayDays, settings);
  const final = championsNextWindow(semi, settings.championsFinalDelayDays, settings);
  const token = crypto.randomUUID(), db = env.DB, writes = [];
  const p = (sql, ...values) => db.prepare(sql).bind(...values);
  if (db.dialect === 'postgres') writes.push(p('SELECT id FROM clan_seasons WHERE id=? FOR UPDATE', season.id));
  const rewards = settings.mode === 'ON' ? rewardSpec(settings) : null;
  writes.push(p(`INSERT OR IGNORE INTO clan_championships(season_id,seeds_json,settings_json,creation_token,
    semifinal_starts_at,final_starts_at,reward_status,reward_json)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM clan_seasons WHERE id=? AND phase='SETTLEMENT')`,
    season.id, JSON.stringify(seeds), JSON.stringify(settings), token, iso(semi), iso(final),
    settings.mode !== 'ON' ? 'DISABLED_TEST' : rewards?.length ? 'PENDING' : 'AWAITING_CONFIG', rewards ? JSON.stringify(rewards) : null, season.id));
  writes.push(p(`INSERT OR IGNORE INTO clan_championship_members(season_id,user_id,clan_id)
    SELECT m.season_id,m.user_id,m.clan_id FROM clan_members m WHERE m.season_id=? AND m.clan_id IN (?,?,?)
    AND EXISTS(SELECT 1 FROM clan_championships WHERE season_id=? AND creation_token=?)`,
    season.id, ...seeds.map(seed => seed.clanId), season.id, token));
  writes.push(p(`INSERT OR IGNORE INTO clan_wars(season_id,round_no,clan_a_id,clan_b_id,status,starts_at,ends_at)
    SELECT ?,?,?,?,'SCHEDULED',?,? WHERE EXISTS(SELECT 1 FROM clan_championships WHERE season_id=? AND creation_token=?)`,
    season.id, CHAMPIONS_SEMIFINAL_ROUND, seeds[1].clanId, seeds[2].clanId, iso(semi), iso(semi + settings.warDurationMinutes * 60000), season.id, token));
  writes.push(p(`UPDATE clan_seasons SET phase='CHAMPIONS',ends_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND phase='SETTLEMENT'
    AND EXISTS(SELECT 1 FROM clan_championships WHERE season_id=?)`, iso(final + settings.warDurationMinutes * 60000), season.id, season.id));
  await db.batch(writes);
}

export async function championsBattleSettings(env, season, settings) {
  if (season?.phase !== 'CHAMPIONS') return settings;
  const championship = await env.DB.prepare('SELECT settings_json FROM clan_championships WHERE season_id=?').bind(season.id).first();
  invariant(championship, '챔피언스리그 설정을 찾지 못했습니다.');
  // Current OFF/TEST still disables payment, and TEST-created cups cannot gain live rewards later.
  const frozen = parse(championship.settings_json);
  return { ...settings, ...frozen, mode: settings.mode === 'ON' && frozen.mode !== 'ON' ? frozen.mode : settings.mode };
}

export async function championsMemberEligible(env, seasonId, userId, clanId) {
  return Boolean(await env.DB.prepare('SELECT 1 ok FROM clan_championship_members WHERE season_id=? AND user_id=? AND clan_id=?')
    .bind(seasonId, userId, clanId).first());
}

// A single row update derives the winner from current scores, never a stale API snapshot.
export async function closeChampionsWar(env, seasonId, roundNo, seeds, now = Date.now()) {
  const higherSeed = seeds.map(seed => seed.clanId);
  await env.DB.prepare(`UPDATE clan_wars SET status='COMPLETED',
    winner_clan_id=CASE WHEN score_a>score_b THEN clan_a_id WHEN score_b>score_a THEN clan_b_id
      WHEN clan_a_id=? OR clan_b_id=? THEN ? WHEN clan_a_id=? OR clan_b_id=? THEN ? ELSE ? END,
    updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND round_no=? AND status='ACTIVE' AND ends_at<=?
    AND NOT EXISTS(SELECT 1 FROM clan_war_battles b WHERE b.war_id=clan_wars.id AND b.status IN ('PENDING','RESOLVING'))`)
    .bind(higherSeed[0], higherSeed[0], higherSeed[0], higherSeed[1], higherSeed[1], higherSeed[1], higherSeed[2], seasonId, roundNo, iso(now)).run();
}

export async function advanceChampions(env, season, settings, now = Date.now()) {
  const db = env.DB, p = (sql, ...values) => db.prepare(sql).bind(...values);
  let cup = await p('SELECT * FROM clan_championships WHERE season_id=?', season.id).first();
  if (!cup || season.phase !== 'CHAMPIONS') return;
  const seeds = parse(cup.seeds_json, []), frozen = parse(cup.settings_json);
  await p(`UPDATE clan_war_battles SET status='FAILED',error_message='CHAMPIONS_STALE_RESERVATION',updated_at=CURRENT_TIMESTAMP
    WHERE season_id=? AND war_id IN (SELECT id FROM clan_wars WHERE season_id=? AND round_no>=1000)
    AND status IN ('PENDING','RESOLVING') AND updated_at<datetime('now','-120 seconds')`, season.id, season.id).run();
  await p("UPDATE clan_wars SET status='ACTIVE',updated_at=CURRENT_TIMESTAMP WHERE season_id=? AND round_no>=1000 AND status='SCHEDULED' AND starts_at<=?", season.id, iso(now)).run();
  for (const round of [CHAMPIONS_SEMIFINAL_ROUND, CHAMPIONS_FINAL_ROUND]) await closeChampionsWar(env, season.id, round, seeds, now);
  const semi = await p('SELECT * FROM clan_wars WHERE season_id=? AND round_no=?', season.id, CHAMPIONS_SEMIFINAL_ROUND).first();
  if (semi?.status === 'COMPLETED' && cup.status === 'SEMIFINAL') {
    // If settlement is delayed past the planned final, give the finalists a future window.
    const finalStart = time(cup.final_starts_at) > now ? time(cup.final_starts_at) : championsNextWindow(now, 1, frozen);
    const writes = [];
    if (db.dialect === 'postgres') writes.push(p('SELECT season_id FROM clan_championships WHERE season_id=? FOR UPDATE', season.id));
    writes.push(p(`INSERT OR IGNORE INTO clan_wars(season_id,round_no,clan_a_id,clan_b_id,status,starts_at,ends_at)
      SELECT ?,?,?,?,'SCHEDULED',?,? WHERE EXISTS(SELECT 1 FROM clan_championships WHERE season_id=? AND status='SEMIFINAL')`,
      season.id, CHAMPIONS_FINAL_ROUND, seeds[0].clanId, semi.winner_clan_id, iso(finalStart), iso(finalStart + frozen.warDurationMinutes * 60000), season.id));
    writes.push(p("UPDATE clan_championships SET status='FINAL',final_starts_at=? WHERE season_id=? AND status='SEMIFINAL'", iso(finalStart), season.id));
    writes.push(p("UPDATE clan_seasons SET ends_at=(SELECT ends_at FROM clan_wars WHERE season_id=? AND round_no=? LIMIT 1),updated_at=CURRENT_TIMESTAMP WHERE id=? AND phase='CHAMPIONS'", season.id, CHAMPIONS_FINAL_ROUND, season.id));
    await db.batch(writes);
  }
  const final = await p('SELECT * FROM clan_wars WHERE season_id=? AND round_no=?', season.id, CHAMPIONS_FINAL_ROUND).first();
  if (final?.status === 'COMPLETED') {
    await db.batch([
      p("UPDATE clan_championships SET status='COMPLETED',winner_clan_id=?,completed_at=CURRENT_TIMESTAMP WHERE season_id=? AND status='FINAL'", final.winner_clan_id, season.id),
      p("UPDATE clan_seasons SET phase='COMPLETE',updated_at=CURRENT_TIMESTAMP WHERE id=? AND phase='CHAMPIONS' AND EXISTS(SELECT 1 FROM clan_championships WHERE season_id=? AND status='COMPLETED')", season.id, season.id)
    ]);
    await deliverChampionsRewards(env, season.id, settings);
  }
}

// Honors are direct ownership grants with notification messages; optional currency uses
// claimable attachments. Both share unique receipts and one atomic transaction.
export async function deliverChampionsRewards(env, seasonId, settings, { configurePending = false } = {}) {
  const db = env.DB, p = (sql, ...values) => db.prepare(sql).bind(...values);
  let cup = await p('SELECT * FROM clan_championships WHERE season_id=?', seasonId).first();
  if (!cup || cup.status !== 'COMPLETED' || settings.mode !== 'ON' || cup.reward_status === 'DISABLED_TEST') return;
  if (configurePending && cup.reward_status === 'AWAITING_CONFIG') {
    validateChampionsSettings(settings, settings);
    await p("UPDATE clan_championships SET reward_json=?,reward_status='PENDING' WHERE season_id=? AND reward_status='AWAITING_CONFIG'",
      JSON.stringify(rewardSpec(settings)), seasonId).run();
    cup = await p('SELECT * FROM clan_championships WHERE season_id=?', seasonId).first();
  }
  if (cup.reward_status !== 'PENDING') return;
  const rewards = parse(cup.reward_json, []);
  invariant(rewards.length > 0, '챔피언스리그 우승 보상 설정이 비어 있습니다.');
  const avatarReward = rewards.find(reward => reward.type === 'AVATAR_SOLAR_VANGUARD');
  const avatarExpiry = new Date(Date.now() + 14 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  if (avatarReward) {
    invariant(avatarReward.amount === 14, '챔피언스리그 아바타 기간은 14일입니다.');
    const avatar = await p("SELECT code FROM avatar_catalog_v1 WHERE code='SOLAR_VANGUARD' AND is_active=1 AND is_public=1").first();
    invariant(avatar, '태양의 선봉대장 아바타의 CMS 공개·활성 상태를 확인하세요. 보상은 미지급 상태로 보존됩니다.');
  }
  const members = rows(await p('SELECT user_id FROM clan_championship_members WHERE season_id=? AND clan_id=? ORDER BY user_id', seasonId, cup.winner_clan_id).all());
  invariant(members.length > 0, '챔피언스리그 우승 명단이 비어 있습니다. 보상을 확인하세요.');
  const writes = [];
  if (db.dialect === 'postgres') writes.push(p('SELECT season_id FROM clan_championships WHERE season_id=? FOR UPDATE', seasonId));
  if (avatarReward && db.dialect === 'postgres') writes.push(p("SELECT code FROM avatar_catalog_v1 WHERE code='SOLAR_VANGUARD' FOR UPDATE"));
  for (const reward of rewards) {
    const token = crypto.randomUUID(), prefix = `clan-champions:${seasonId}:`, suffix = `:${reward.type}`;
    const direct = reward.type === 'CLAN_CHAMPIONS_TROPHY' || reward.type === 'AVATAR_SOLAR_VANGUARD';
    if (reward.type === 'CLAN_CHAMPIONS_TROPHY') invariant(reward.amount === 1, '대회별 트로피는 1개만 지급합니다.');
    // One bulk transaction per cup, not one network transaction per member/item.
    writes.push(p(`INSERT OR IGNORE INTO clan_championship_rewards(season_id,user_id,reward_type,reward_amount,processing_token)
      SELECT m.season_id,m.user_id,?,?,? FROM clan_championship_members m JOIN users u ON u.id=m.user_id
      WHERE m.season_id=? AND m.clan_id=? AND EXISTS(SELECT 1 FROM clan_championships
        WHERE season_id=? AND status='COMPLETED' AND reward_status='PENDING')
        AND (?=0 OR EXISTS(SELECT 1 FROM avatar_catalog_v1 WHERE code='SOLAR_VANGUARD' AND is_active=1 AND is_public=1))`,
      reward.type, reward.amount, token, seasonId, cup.winner_clan_id, seasonId, avatarReward ? 1 : 0));
    if (reward.type === 'AVATAR_SOLAR_VANGUARD') {
      // Only the newly inserted receipt owns this grant. Retrying never restarts 14 days.
      // Permanent ownership and an existing later expiry are never shortened.
      writes.push(p(`INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,expires_at)
        SELECT user_id,'SOLAR_VANGUARD','CLAN_CHAMPIONS',? || CAST(user_id AS TEXT),?
        FROM clan_championship_rewards WHERE season_id=? AND reward_type=? AND processing_token=? AND status='PENDING'
        ON CONFLICT(user_id,avatar_code) DO UPDATE SET
          source_type=excluded.source_type,source_ref=excluded.source_ref,acquired_at=CURRENT_TIMESTAMP,expires_at=excluded.expires_at
        WHERE avatar_user_ownership_v1.expires_at IS NOT NULL AND avatar_user_ownership_v1.expires_at<excluded.expires_at`,
        prefix, avatarExpiry, seasonId, reward.type, token));
    }
    writes.push(p(`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
      SELECT user_id,'SYSTEM',?,?,'CLAN_CHAMPIONS_REWARD',? || CAST(user_id AS TEXT) || ?
      FROM clan_championship_rewards WHERE season_id=? AND reward_type=? AND processing_token=? AND status='PENDING'`,
      '챔피언스리그 최종 우승 보상',
      `챔피언스리그 최종 우승을 축하합니다.\n${reward.label} ${reward.amount.toLocaleString('ko-KR')}${reward.unit || '개'}\n정규시즌 보상과 별도로 지급됩니다. ${direct ? reward.type === 'CLAN_CHAMPIONS_TROPHY' ? '명함에 우승 트로피 1개가 기록되었습니다. 대회당 1회만 지급됩니다.' : '아바타 보유 목록에 14일간 사용할 수 있도록 지급했습니다. 기존 영구 소유권·더 긴 이용기간은 유지됩니다.' : '아래 버튼으로 수령하세요.'}`,
      prefix, suffix, seasonId, reward.type, token));
    if (direct) {
      writes.push(p(`UPDATE clan_championship_rewards SET status='SENT',completed_at=CURRENT_TIMESTAMP,
        message_id=(SELECT id FROM user_messages m WHERE m.user_id=clan_championship_rewards.user_id
          AND m.campaign_key=? || CAST(clan_championship_rewards.user_id AS TEXT) || ? LIMIT 1)
        WHERE season_id=? AND reward_type=? AND processing_token=? AND status='PENDING'
        AND EXISTS(SELECT 1 FROM user_messages m WHERE m.user_id=clan_championship_rewards.user_id
          AND m.campaign_key=? || CAST(clan_championship_rewards.user_id AS TEXT) || ?)
        AND (?='CLAN_CHAMPIONS_TROPHY' OR EXISTS(SELECT 1 FROM avatar_user_ownership_v1 o
          WHERE o.user_id=clan_championship_rewards.user_id AND o.avatar_code='SOLAR_VANGUARD'
          AND (o.expires_at IS NULL OR o.expires_at>=?)))`,
        prefix, suffix, seasonId, reward.type, token, prefix, suffix, reward.type, avatarExpiry));
      continue;
    }
    writes.push(p(`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
      SELECT m.id,r.user_id,r.reward_type,r.reward_amount FROM clan_championship_rewards r JOIN user_messages m
        ON m.user_id=r.user_id AND m.campaign_key=? || CAST(r.user_id AS TEXT) || ?
      WHERE r.season_id=? AND r.reward_type=? AND r.processing_token=? AND r.status='PENDING'`,
      prefix, suffix, seasonId, reward.type, token));
    writes.push(p(`UPDATE clan_championship_rewards SET status='SENT',completed_at=CURRENT_TIMESTAMP,
      message_id=(SELECT m.id FROM user_messages m WHERE m.campaign_key=? || CAST(clan_championship_rewards.user_id AS TEXT) || ?
        AND m.user_id=clan_championship_rewards.user_id LIMIT 1)
      WHERE season_id=? AND reward_type=? AND processing_token=? AND status='PENDING'
      AND EXISTS(SELECT 1 FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id
        WHERE m.campaign_key=? || CAST(clan_championship_rewards.user_id AS TEXT) || ?
          AND r.user_id=clan_championship_rewards.user_id AND r.reward_type=? AND r.reward_amount=?)`,
      prefix, suffix, seasonId, reward.type, token, prefix, suffix, reward.type, reward.amount));
  }
  await db.batch(writes);
  const sent = await p("SELECT COUNT(*) count FROM clan_championship_rewards WHERE season_id=? AND status='SENT'", seasonId).first();
  if (num(sent?.count) === members.length * rewards.length)
    await p("UPDATE clan_championships SET reward_status='SENT' WHERE season_id=? AND reward_status='PENDING'", seasonId).run();
}

export async function championsPublicState(env, seasonId, settings) {
  let cup = await env.DB.prepare('SELECT * FROM clan_championships WHERE season_id=?').bind(seasonId).first();
  // Keep the latest champion visible after next season registration opens.
  if (!cup) cup = await env.DB.prepare("SELECT * FROM clan_championships WHERE status='COMPLETED' ORDER BY season_id DESC LIMIT 1").first();
  if (!cup) return { enabled: settings.championsEnabled, status: 'UPCOMING', seeds: [], matches: [], rewards: rewardSpec(settings), rewardStatus: settings.mode === 'ON' ? 'CONFIGURED' : 'DISABLED_TEST' };
  if(cup.status==='COMPLETED'&&cup.reward_status==='PENDING'&&settings.mode==='ON'){
    await deliverChampionsRewards(env,cup.season_id,settings);
    cup=await env.DB.prepare('SELECT * FROM clan_championships WHERE season_id=?').bind(cup.season_id).first();
  }
  const season = await env.DB.prepare('SELECT season_no FROM clan_seasons WHERE id=?').bind(cup.season_id).first();
  const matches = rows(await env.DB.prepare('SELECT * FROM clan_wars WHERE season_id=? AND round_no>=1000 ORDER BY round_no').bind(cup.season_id).all());
  return { enabled: true, seasonId: num(cup.season_id), seasonNo: num(season?.season_no), historical: num(cup.season_id) !== num(seasonId),
    status: cup.status, seeds: parse(cup.seeds_json, []), winnerClanId: num(cup.winner_clan_id),
    semifinalStartsAt: cup.semifinal_starts_at, finalStartsAt: cup.final_starts_at,
    rewardStatus: cup.reward_status, rewards: parse(cup.reward_json, []), completedAt: cup.completed_at,
    matches: matches.map(war => ({ id: num(war.id), stage: num(war.round_no) === CHAMPIONS_SEMIFINAL_ROUND ? 'SEMIFINAL' : 'FINAL',
      status: war.status, clanAId: num(war.clan_a_id), clanBId: num(war.clan_b_id), scoreA: num(war.score_a), scoreB: num(war.score_b),
      startsAt: war.starts_at, endsAt: war.ends_at, winnerClanId: num(war.winner_clan_id) })) };
}
