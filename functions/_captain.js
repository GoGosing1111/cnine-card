import { magicSettings,ensureMagicRewardFoundation,magicRewardForRank } from './_magic.js';

function weekKey() {
  const date = new Date(Date.now() + 32400000);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function previousWeekKey() {
  const date = new Date(`${weekKey()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function roundLabel(round) {
  const number = Math.max(1, Number(round?.roundNumber || 1));
  return number === 1 ? `${round?.calendarWeekKey || weekKey()} 주차` : `${round?.calendarWeekKey || weekKey()} 주차 · ${number}회차`;
}

const DEF = {
  mode: 'OFF',
  energyMax: 5,
  energyMinutes: 15,
  winScore: 24,
  loseScore: 16,
  renameCooldownMinutes: 60,
  adminTestParticipation: true,
  bgm: { enabled: false, source: '', volume: 35, loop: true, stopOnExit: true },
  rewards: {
    victory: { coin: 0, shards: 0 },
    settlement: [
      { from: 1, to: 1, coin: 5000, shards: 100 },
      { from: 2, to: 3, coin: 3000, shards: 60 },
      { from: 4, to: 10, coin: 1500, shards: 30 }
    ]
  }
};

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function randomIndex(max) {
  if (max <= 1) return 0;
  try {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % max;
  } catch {
    return Math.floor(Math.random() * max);
  }
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function runUpgrade(env) {
  await ensureMagicRewardFoundation(env);
  const tables = [
    `CREATE TABLE IF NOT EXISTS captain_registrations(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      deck_snapshot TEXT NOT NULL,
      deck_power INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'WAITING',
      team_id INTEGER,
      registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      assigned_at TEXT,
      cancelled_at TEXT,
      cooldown_until TEXT,
      UNIQUE(week_key,user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS captain_teams(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 1000,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      renamed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS captain_team_members(
      team_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      deck_snapshot TEXT NOT NULL,
      deck_power INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(team_id,user_id),
      UNIQUE(team_id,position)
    )`,
    `CREATE TABLE IF NOT EXISTS captain_match_history_v2(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      week_key TEXT NOT NULL,
      attacker_team_id INTEGER NOT NULL,
      defender_team_id INTEGER NOT NULL,
      attacker_user_id INTEGER NOT NULL,
      defender_user_id INTEGER NOT NULL,
      winner_user_id INTEGER NOT NULL,
      battle_log TEXT NOT NULL,
      attacker_score_before INTEGER NOT NULL,
      attacker_score_after INTEGER NOT NULL,
      defender_score_before INTEGER NOT NULL,
      defender_score_after INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS captain_match_history_v3(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      week_key TEXT NOT NULL,
      attacker_team_id INTEGER NOT NULL,
      defender_team_id INTEGER NOT NULL,
      initiated_by_user_id INTEGER NOT NULL,
      winner_team_id INTEGER NOT NULL,
      loser_team_id INTEGER NOT NULL,
      attacker_score_before INTEGER NOT NULL,
      attacker_score_after INTEGER NOT NULL,
      defender_score_before INTEGER NOT NULL,
      defender_score_after INTEGER NOT NULL,
      attacker_lineup_json TEXT NOT NULL,
      defender_lineup_json TEXT NOT NULL,
      battle_log_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS captain_match_receipts_v3(
      request_id TEXT PRIMARY KEY,
      week_key TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      response_json TEXT,
      error_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS captain_energy(
      user_id INTEGER NOT NULL,
      week_key TEXT NOT NULL,
      energy INTEGER NOT NULL DEFAULT 5,
      last_recharged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id,week_key)
    )`,
    `CREATE TABLE IF NOT EXISTS captain_team_name_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      team_id INTEGER NOT NULL,
      changed_by INTEGER NOT NULL,
      old_name TEXT NOT NULL,
      new_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS captain_reward_claims(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      reward_type TEXT NOT NULL,
      reward_key TEXT NOT NULL,
      reward_json TEXT NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(week_key,user_id,reward_type,reward_key)
    )`,
    `CREATE TABLE IF NOT EXISTS captain_week_resets(
      week_key TEXT PRIMARY KEY,
      executed_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS captain_rounds(
      round_key TEXT PRIMARY KEY,
      calendar_week_key TEXT NOT NULL,
      round_number INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      previous_round_key TEXT,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT,
      ended_by INTEGER,
      end_reason TEXT,
      UNIQUE(calendar_week_key,round_number)
    )`,
    `CREATE TABLE IF NOT EXISTS captain_round_reset_events(
      request_id TEXT PRIMARY KEY,
      old_round_key TEXT NOT NULL UNIQUE,
      new_round_key TEXT NOT NULL UNIQUE,
      executed_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS captain_cooldown_reset_events(
      request_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      target_user_id INTEGER,
      executed_by INTEGER,
      affected_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of tables) await env.DB.prepare(sql).run();

  for (const sql of [
    `ALTER TABLE captain_registrations ADD COLUMN cancelled_at TEXT`,
    `ALTER TABLE captain_registrations ADD COLUMN cooldown_until TEXT`,
    `ALTER TABLE captain_teams ADD COLUMN renamed_at TEXT`,
    `ALTER TABLE captain_reward_claims ADD COLUMN status TEXT NOT NULL DEFAULT 'COMPLETED'`,
    `ALTER TABLE captain_reward_claims ADD COLUMN error_message TEXT`,
    `ALTER TABLE captain_reward_claims ADD COLUMN updated_at TEXT`
  ]) {
    try { await env.DB.prepare(sql).run(); }
    catch (error) {
      if (!/duplicate column|already exists/i.test(String(error))) throw error;
    }
  }

  for (const sql of [
    `CREATE INDEX IF NOT EXISTS idx_captain_reg_week_status ON captain_registrations(week_key,status)`,
    `CREATE INDEX IF NOT EXISTS idx_captain_team_week_score ON captain_teams(week_key,score DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_captain_member_user ON captain_team_members(user_id,team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_captain_match_v2_users ON captain_match_history_v2(week_key,attacker_user_id,defender_user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_captain_match_v2_teams ON captain_match_history_v2(week_key,attacker_team_id,defender_team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_captain_match_v3_teams ON captain_match_history_v3(week_key,attacker_team_id,defender_team_id,id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_captain_match_v3_initiator ON captain_match_history_v3(week_key,initiated_by_user_id,id DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_captain_receipts_v3_user ON captain_match_receipts_v3(week_key,user_id,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_captain_rounds_calendar_status ON captain_rounds(calendar_week_key,status,round_number DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_captain_rounds_previous ON captain_rounds(previous_round_key)`,
    `CREATE INDEX IF NOT EXISTS idx_captain_cooldown_reset_user ON captain_cooldown_reset_events(target_user_id,created_at DESC)`
  ]) await env.DB.prepare(sql).run();

  await env.DB.prepare("UPDATE captain_reward_claims SET updated_at=COALESCE(updated_at,claimed_at),status=COALESCE(NULLIF(status,''),'COMPLETED')").run();
  const rewardRecoveryUpgrade=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1108_captain_reward_recovery'").first();
  const upgradeStatements=[
    env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1088_captain_round_reset','1',CURRENT_TIMESTAMP)"),
    env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1089_captain_cooldown_reset','1',CURRENT_TIMESTAMP)")
  ];
  if(rewardRecoveryUpgrade?.value!=='1'){
    upgradeStatements.push(env.DB.prepare("UPDATE captain_reward_claims SET status='FAILED',error_message='LEGACY_VICTORY_REWARD_FAILED',updated_at=CURRENT_TIMESTAMP WHERE reward_type='VICTORY' AND EXISTS (SELECT 1 FROM captain_match_receipts_v3 r WHERE r.request_id=captain_reward_claims.reward_key AND r.response_json LIKE '%victoryRewardError%')"));
    upgradeStatements.push(env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1108_captain_reward_recovery','1',CURRENT_TIMESTAMP)"));
  }
  await env.DB.batch(upgradeStatements);
}

let upgradePromise;
async function upgrade(env) {
  if (!upgradePromise) {
    upgradePromise = runUpgrade(env).catch(error => {
      upgradePromise = null;
      throw error;
    });
  }
  return upgradePromise;
}

async function saveRoundState(env, state) {
  const value = JSON.stringify(state);
  const updated = await env.DB.prepare("UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='captain_round_state_v1'")
    .bind(value).run();
  if (!Number(updated?.meta?.changes || 0)) {
    await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('captain_round_state_v1',?,CURRENT_TIMESTAMP)")
      .bind(value).run();
  }
}

async function resolveCaptainRound(env) {
  const calendarWeekKey = weekKey();
  const stateRow = await env.DB.prepare("SELECT value FROM app_meta WHERE key='captain_round_state_v1'").first();
  const state = safeJson(stateRow?.value, null);

  if (state?.calendarWeekKey === calendarWeekKey && state?.roundKey) {
    const row = await env.DB.prepare('SELECT * FROM captain_rounds WHERE round_key=?')
      .bind(String(state.roundKey)).first();
    if (row && row.status === 'ACTIVE') {
      return {
        roundKey: row.round_key,
        calendarWeekKey: row.calendar_week_key,
        roundNumber: Number(row.round_number || 1),
        previousRoundKey: row.previous_round_key || null,
        startedAt: row.started_at,
        status: row.status,
        label: roundLabel({ calendarWeekKey: row.calendar_week_key, roundNumber: row.round_number })
      };
    }
  }

  const active = await env.DB.prepare(`
    SELECT * FROM captain_rounds
    WHERE calendar_week_key=? AND status='ACTIVE'
    ORDER BY round_number DESC LIMIT 1
  `).bind(calendarWeekKey).first();
  if (active) {
    const nextState = {
      calendarWeekKey,
      roundKey: active.round_key,
      roundNumber: Number(active.round_number || 1),
      previousRoundKey: active.previous_round_key || null,
      startedAt: active.started_at
    };
    await saveRoundState(env, nextState);
    return { ...nextState, status: active.status, label: roundLabel(nextState) };
  }

  const previous = await env.DB.prepare(`
    SELECT * FROM captain_rounds
    WHERE round_key<>?
    ORDER BY COALESCE(ended_at,started_at) DESC,round_number DESC
    LIMIT 1
  `).bind(calendarWeekKey).first();

  if (state?.roundKey && state?.calendarWeekKey && state.calendarWeekKey !== calendarWeekKey) {
    await env.DB.prepare(`
      UPDATE captain_rounds
      SET status='COMPLETED',ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),end_reason=COALESCE(end_reason,'WEEK_ROLLOVER')
      WHERE round_key=? AND status='ACTIVE'
    `).bind(String(state.roundKey)).run();
  }

  await env.DB.prepare(`
    INSERT OR IGNORE INTO captain_rounds(round_key,calendar_week_key,round_number,status,previous_round_key)
    VALUES(?,?,1,'ACTIVE',?)
  `).bind(calendarWeekKey, calendarWeekKey, previous?.round_key || state?.roundKey || null).run();

  const created = await env.DB.prepare('SELECT * FROM captain_rounds WHERE round_key=?')
    .bind(calendarWeekKey).first();
  const nextState = {
    calendarWeekKey,
    roundKey: created?.round_key || calendarWeekKey,
    roundNumber: Number(created?.round_number || 1),
    previousRoundKey: created?.previous_round_key || previous?.round_key || state?.roundKey || null,
    startedAt: created?.started_at || null
  };
  await saveRoundState(env, nextState);
  return { ...nextState, status: created?.status || 'ACTIVE', label: roundLabel(nextState) };
}

async function settlementRoundKey(env, currentRound, userId) {
  if (userId) {
    const unclaimed = await env.DB.prepare(`
      SELECT r.round_key
      FROM captain_rounds r
      JOIN captain_teams t ON t.week_key=r.round_key
      JOIN captain_team_members m ON m.team_id=t.id AND m.user_id=?
      LEFT JOIN captain_reward_claims c
        ON c.week_key=r.round_key AND c.user_id=? AND c.reward_type='SETTLEMENT'
      WHERE r.round_key<>? AND r.status='COMPLETED' AND c.id IS NULL
      ORDER BY COALESCE(r.ended_at,r.started_at) DESC,r.round_number DESC
      LIMIT 1
    `).bind(userId, userId, String(currentRound?.roundKey || '')).first();
    if (unclaimed?.round_key) return String(unclaimed.round_key);

    const latestParticipated = await env.DB.prepare(`
      SELECT r.round_key
      FROM captain_rounds r
      JOIN captain_teams t ON t.week_key=r.round_key
      JOIN captain_team_members m ON m.team_id=t.id AND m.user_id=?
      WHERE r.round_key<>? AND r.status='COMPLETED'
      ORDER BY COALESCE(r.ended_at,r.started_at) DESC,r.round_number DESC
      LIMIT 1
    `).bind(userId, String(currentRound?.roundKey || '')).first();
    if (latestParticipated?.round_key) return String(latestParticipated.round_key);
  }
  if (currentRound?.previousRoundKey) return String(currentRound.previousRoundKey);
  const previous = await env.DB.prepare(`
    SELECT round_key FROM captain_rounds
    WHERE round_key<>? AND status='COMPLETED'
    ORDER BY COALESCE(ended_at,started_at) DESC,round_number DESC
    LIMIT 1
  `).bind(String(currentRound?.roundKey || '')).first();
  return previous?.round_key || previousWeekKey();
}

async function startNewCaptainRound(env, currentRound, userId, requestId) {
  const existingByRequest = await env.DB.prepare('SELECT * FROM captain_round_reset_events WHERE request_id=?')
    .bind(requestId).first();
  if (existingByRequest) {
    const existingRound = await env.DB.prepare('SELECT * FROM captain_rounds WHERE round_key=?')
      .bind(existingByRequest.new_round_key).first();
    return {
      oldRoundKey: existingByRequest.old_round_key,
      newRoundKey: existingByRequest.new_round_key,
      roundNumber: Number(existingRound?.round_number || 1),
      replayed: true
    };
  }

  const latestState = await resolveCaptainRound(env);
  if (String(latestState.roundKey) !== String(currentRound.roundKey)) {
    return {
      oldRoundKey: currentRound.roundKey,
      newRoundKey: latestState.roundKey,
      roundNumber: latestState.roundNumber,
      replayed: true
    };
  }

  const maxRow = await env.DB.prepare('SELECT COALESCE(MAX(round_number),0) max_number FROM captain_rounds WHERE calendar_week_key=?')
    .bind(currentRound.calendarWeekKey).first();
  const nextNumber = Math.max(2, Number(maxRow?.max_number || 0) + 1);
  const newRoundKey = `${currentRound.calendarWeekKey}-R${nextNumber}`;

  const statements = [
    env.DB.prepare(`
      INSERT OR IGNORE INTO captain_rounds(round_key,calendar_week_key,round_number,status,previous_round_key)
      VALUES(?,?,?,'ACTIVE',?)
    `).bind(newRoundKey, currentRound.calendarWeekKey, nextNumber, currentRound.roundKey),
    env.DB.prepare(`
      UPDATE captain_rounds
      SET status='COMPLETED',ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),ended_by=?,end_reason='MANUAL_RESET'
      WHERE round_key=? AND status='ACTIVE'
    `).bind(userId, currentRound.roundKey),
    env.DB.prepare(`
      INSERT OR IGNORE INTO captain_round_reset_events(request_id,old_round_key,new_round_key,executed_by)
      VALUES(?,?,?,?)
    `).bind(requestId, currentRound.roundKey, newRoundKey, userId),
    env.DB.prepare('INSERT OR IGNORE INTO captain_week_resets(week_key,executed_by) VALUES(?,?)')
      .bind(currentRound.roundKey, userId)
  ];
  if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
  else for (const statement of statements) await statement.run();

  const event = await env.DB.prepare('SELECT * FROM captain_round_reset_events WHERE old_round_key=?')
    .bind(currentRound.roundKey).first();
  const effectiveNewRoundKey = event?.new_round_key || newRoundKey;
  const effectiveRound = await env.DB.prepare('SELECT * FROM captain_rounds WHERE round_key=?')
    .bind(effectiveNewRoundKey).first();
  const nextState = {
    calendarWeekKey: effectiveRound?.calendar_week_key || currentRound.calendarWeekKey,
    roundKey: effectiveNewRoundKey,
    roundNumber: Number(effectiveRound?.round_number || nextNumber),
    previousRoundKey: currentRound.roundKey,
    startedAt: effectiveRound?.started_at || null
  };
  await saveRoundState(env, nextState);
  return {
    oldRoundKey: currentRound.roundKey,
    newRoundKey: effectiveNewRoundKey,
    roundNumber: nextState.roundNumber,
    replayed: Boolean(event && event.request_id !== requestId)
  };
}

async function settings(env) {
  const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key='captain_settings_v2'").first();
  const parsed = safeJson(row?.value, {});
  return {
    ...DEF,
    ...parsed,
    bgm: { ...DEF.bgm, ...(parsed.bgm || {}) },
    rewards: {
      ...DEF.rewards,
      ...(parsed.rewards || {}),
      victory: {
        ...DEF.rewards.victory,
        ...(parsed.rewards?.victory || {})
      },
      settlement: Array.isArray(parsed.rewards?.settlement)
        ? parsed.rewards.settlement
        : (Array.isArray(parsed.rewards?.ranks) ? parsed.rewards.ranks : DEF.rewards.settlement)
    }
  };
}

const CAPTAIN_PVP_TIER_FALLBACK = [
  { id: 'bronze', name: '브론즈', min: 0, color: '#b87333' },
  { id: 'silver', name: '실버', min: 1100, color: '#c9d4e3' },
  { id: 'gold', name: '골드', min: 1250, color: '#ffd15c' },
  { id: 'platinum', name: '플래티넘', min: 1450, color: '#5ff0df' },
  { id: 'diamond', name: '다이아', min: 1700, color: '#69cfff' },
  { id: 'master', name: '마스터', min: 2050, color: '#bd7cff' },
  { id: 'grandmaster', name: '그랜드마스터', min: 2500, color: '#ff6f91' }
];

async function pvpTiers(env) {
  const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key='pvp_settings_v1'").first();
  const tiers = safeJson(row?.value, {}).tiers;
  const source = Array.isArray(tiers) && tiers.length ? tiers : CAPTAIN_PVP_TIER_FALLBACK;
  return [...source].sort((a, b) => Number(a.min || 0) - Number(b.min || 0));
}

function tierFor(score, tiers) {
  let tier = tiers[0] || { id: 'bronze', name: '브론즈' };
  for (const candidate of tiers) {
    if (Number(score) >= Number(candidate.min || 0)) tier = candidate;
  }
  return {
    id: tier.id || 'bronze',
    name: tier.name || '브론즈',
    color: tier.color || '#b87333',
    min: Number(tier.min || 0)
  };
}

function isGrandmasterTier(tier) {
  const id = String(tier?.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const name = String(tier?.name || '').replace(/\s/g, '');
  return id === 'grandmaster' || name.includes('그랜드마스터');
}

function registrationOrder(a, b) {
  const timeA = Date.parse(String(a.registered_at || '').replace(' ', 'T') + 'Z') || 0;
  const timeB = Date.parse(String(b.registered_at || '').replace(' ', 'T') + 'Z') || 0;
  return timeA - timeB || Number(a.id || 0) - Number(b.id || 0);
}

function buildDeckPowerBalancedTeamGroups(queue, tiers) {
  const annotated = [...queue].sort(registrationOrder).map(row => {
    const seasonScore = Number(row.season_score || 1000);
    const pvpTier = tierFor(seasonScore, tiers);
    return {
      ...row,
      season_score: seasonScore,
      deck_power: Math.max(0, Number(row.deck_power || 0)),
      pvpTier,
      balanceJitter: randomIndex(1000000)
    };
  });
  const teamCount = Math.floor(annotated.length / 3);
  if (teamCount <= 0) return [];

  // 오래 기다린 유저를 우선 포함하되, 선택된 인원은 덱 전투력 합계가
  // 가능한 한 비슷해지도록 가장 약한 팀부터 한 명씩 배치한다.
  const selected = annotated.slice(0, teamCount * 3)
    .sort((a, b) => Number(b.deck_power || 0) - Number(a.deck_power || 0)
      || Number(b.season_score || 0) - Number(a.season_score || 0)
      || a.balanceJitter - b.balanceJitter);
  const groups = Array.from({ length: teamCount }, () => []);

  for (const row of selected) {
    const available = groups.map((members, index) => ({
      index,
      slots: members.length,
      power: members.reduce((sum, member) => sum + Number(member.deck_power || 0), 0),
      seasonScore: members.reduce((sum, member) => sum + Number(member.season_score || 0), 0),
      random: randomIndex(1000000)
    })).filter(item => item.slots < 3)
      .sort((a, b) => a.power - b.power
        || a.slots - b.slots
        || a.seasonScore - b.seasonScore
        || a.random - b.random);
    groups[available[0].index].push(row);
  }

  return shuffle(groups.filter(group => group.length === 3));
}

function assignPvpPositions(group) {
  return [...group]
    .map(row => ({ ...row, roleJitter: randomIndex(1000000) }))
    .sort((a, b) => Number(a.deck_power || 0) - Number(b.deck_power || 0)
      || Number(a.season_score || 0) - Number(b.season_score || 0)
      || a.roleJitter - b.roleJitter)
    .map((row, index) => ({ ...row, position: index + 1 }));
}

function publicMember(member, includeDeck = false) {
  const result = {
    user_id: Number(member.user_id),
    nickname: member.nickname,
    position: Number(member.position),
    role: member.role,
    deck_power: Number(member.deck_power || 0),
    pvpTier: member.pvpTier,
    pvpScore: Number(member.pvpScore || 0)
  };
  if (includeDeck) result.deckSnapshot = member.deckSnapshot || [];
  return result;
}

async function team(env, id, includeDeck = false) {
  if (!id) return null;
  const teamRow = await env.DB.prepare('SELECT * FROM captain_teams WHERE id=?').bind(id).first();
  if (!teamRow) return null;

  const rows = (await env.DB.prepare(`
    SELECT m.*,u.nickname,COALESCE(p.season_score,1000) season_score
    FROM captain_team_members m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN pvp_profiles p ON p.user_id=m.user_id
    WHERE m.team_id=?
    ORDER BY m.position
  `).bind(id).all()).results;
  const tiers = await pvpTiers(env);

  const members = rows.map(row => {
    const deckSnapshot = includeDeck ? safeJson(row.deck_snapshot, []) : undefined;
    return {
      ...row,
      role: ['', '선봉', '중견', '대장'][Number(row.position)] || '팀원',
      pvpTier: tierFor(Number(row.season_score), tiers),
      pvpScore: Number(row.season_score),
      ...(includeDeck ? { deckSnapshot } : {})
    };
  });

  const deckPowers = members.map(member => Number(member.deck_power || 0));
  const orderedPowers = [...members]
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
    .map(member => Number(member.deck_power || 0));
  const roleOrderOk = orderedPowers.every((power, index) => index === 0 || power >= orderedPowers[index - 1]);
  const teamPower = deckPowers.reduce((sum, power) => sum + power, 0);
  const powerMin = deckPowers.length ? Math.min(...deckPowers) : 0;
  const powerMax = deckPowers.length ? Math.max(...deckPowers) : 0;

  return {
    ...teamRow,
    score: Number(teamRow.score || 0),
    wins: Number(teamRow.wins || 0),
    losses: Number(teamRow.losses || 0),
    teamPower,
    averageDeckPower: members.length ? Math.round(teamPower / members.length) : 0,
    powerMin,
    powerMax,
    powerSpread: Math.max(0, powerMax - powerMin),
    seasonScoreTotal: members.reduce((sum, member) => sum + Number(member.pvpScore || 0), 0),
    grandmasterCount: members.filter(member => isGrandmasterTier(member.pvpTier)).length,
    roleOrderOk,
    balanceOk: roleOrderOk,
    balanceMode: 'DECK_POWER',
    members
  };
}

async function userTeam(env, userId, week) {
  return env.DB.prepare(`
    SELECT t.*
    FROM captain_teams t
    JOIN captain_team_members m ON m.team_id=t.id
    WHERE t.week_key=? AND m.user_id=? AND t.status='ACTIVE'
  `).bind(week, userId).first();
}

async function formTeams(env, week) {
  const queue = (await env.DB.prepare(`
    SELECT r.*,u.nickname,COALESCE(p.season_score,1000) season_score
    FROM captain_registrations r
    JOIN users u ON u.id=r.user_id
    LEFT JOIN pvp_profiles p ON p.user_id=r.user_id
    WHERE r.week_key=? AND r.status='WAITING' AND r.team_id IS NULL
    ORDER BY r.registered_at,r.id
  `).bind(week).all()).results;
  if (queue.length < 3) return;

  const tiers = await pvpTiers(env);
  const groups = buildDeckPowerBalancedTeamGroups(queue, tiers);

  for (const rawGroup of groups) {
    const selected = assignPvpPositions(rawGroup);
    const created = await env.DB.prepare('INSERT INTO captain_teams(week_key,name) VALUES(?,?)')
      .bind(week, '대장전 신규팀')
      .run();
    const teamId = Number(created.meta.last_row_id);
    await env.DB.prepare('UPDATE captain_teams SET name=? WHERE id=?')
      .bind(`대장전 ${teamId}팀`, teamId).run();

    try {
      const results = await env.DB.batch([
        ...selected.map(registration => env.DB.prepare(`
          UPDATE captain_registrations
          SET status='ASSIGNED',team_id=?,assigned_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='WAITING' AND team_id IS NULL
        `).bind(teamId, registration.id)),
        ...selected.map(registration => env.DB.prepare(`
          INSERT OR IGNORE INTO captain_team_members(team_id,user_id,position,deck_snapshot,deck_power)
          SELECT ?,?,?,?,?
          WHERE EXISTS(
            SELECT 1 FROM captain_registrations
            WHERE id=? AND status='ASSIGNED' AND team_id=?
          )
        `).bind(teamId, registration.user_id, registration.position, registration.deck_snapshot, registration.deck_power, registration.id, teamId))
      ]);
      const memberCount = await env.DB.prepare('SELECT COUNT(*) n FROM captain_team_members WHERE team_id=?').bind(teamId).first();
      if (Number(memberCount?.n || 0) !== 3) {
        await env.DB.batch([
          env.DB.prepare("UPDATE captain_teams SET status='CANCELLED' WHERE id=?").bind(teamId),
          env.DB.prepare("UPDATE captain_registrations SET status='WAITING',team_id=NULL,assigned_at=NULL WHERE team_id=?").bind(teamId)
        ]);
        console.warn('captain balanced team formation rolled back', { teamId, results });
      }
    } catch (error) {
      await env.DB.batch([
        env.DB.prepare("UPDATE captain_teams SET status='CANCELLED' WHERE id=?").bind(teamId),
        env.DB.prepare("UPDATE captain_registrations SET status='WAITING',team_id=NULL,assigned_at=NULL WHERE team_id=?").bind(teamId)
      ]);
      throw error;
    }
  }
}

async function energy(env, userId, week, config) {
  let row = await env.DB.prepare('SELECT * FROM captain_energy WHERE user_id=? AND week_key=?')
    .bind(userId, week).first();

  if (!row) {
    await env.DB.prepare('INSERT OR IGNORE INTO captain_energy(user_id,week_key,energy) VALUES(?,?,?)')
      .bind(userId, week, config.energyMax).run();
    row = await env.DB.prepare('SELECT * FROM captain_energy WHERE user_id=? AND week_key=?')
      .bind(userId, week).first();
  }

  const last = Date.parse(String(row.last_recharged_at || '').replace(' ', 'T') + 'Z') || Date.now();
  const rechargeMs = Math.max(1, Number(config.energyMinutes)) * 60000;
  const steps = Math.max(0, Math.floor((Date.now() - last) / rechargeMs));
  const current = Number(row.energy || 0);
  const next = Math.min(Number(config.energyMax), current + steps);

  if (next !== current) {
    await env.DB.prepare(`
      UPDATE captain_energy
      SET energy=?,last_recharged_at=datetime(last_recharged_at,?)
      WHERE user_id=? AND week_key=?
    `).bind(next, `+${steps * Number(config.energyMinutes)} minutes`, userId, week).run();
  }

  const nextAt = next >= Number(config.energyMax)
    ? null
    : new Date(last + (steps + 1) * rechargeMs).toISOString();

  return {
    current: next,
    max: Number(config.energyMax),
    minutes: Number(config.energyMinutes),
    nextAt
  };
}

function cleanName(value) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, 20);
}

async function rewardBalances(env, userId) {
  const row = await env.DB.prepare('SELECT coin,card_shards,magic_crystals FROM users WHERE id=?').bind(userId).first();
  if (!row) throw new Error('유저 정보를 찾을 수 없습니다.');
  return {
    coinBalance: Number(row.coin || 0),
    shardBalance: Number(row.card_shards || 0),
    magicBalance: Number(row.magic_crystals || 0)
  };
}

async function reserveRewardClaim(env, { weekKey, userId, rewardType, rewardKey, reward }) {
  const type = String(rewardType || '').toUpperCase();
  const key = String(rewardKey || '').slice(0, 160);
  let row = await env.DB.prepare('SELECT * FROM captain_reward_claims WHERE week_key=? AND user_id=? AND reward_type=? AND reward_key=?')
    .bind(weekKey, userId, type, key).first();
  if (row?.status === 'COMPLETED') return { acquired: false, completed: true, claim: row };
  if (row?.status === 'PENDING') {
    const age = Date.now() - Date.parse(String(row.updated_at || row.claimed_at || '').replace(' ', 'T') + 'Z');
    if (Number.isFinite(age) && age < 45000) return { acquired: false, pending: true, claim: row };
    await env.DB.prepare("UPDATE captain_reward_claims SET status='FAILED',error_message='STALE_PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(row.id).run();
    row.status = 'FAILED';
  }
  if (row) {
    const retried = await env.DB.prepare("UPDATE captain_reward_claims SET status='PENDING',reward_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='FAILED'")
      .bind(JSON.stringify(reward || {}), row.id).run();
    if (Number(retried?.meta?.changes || 0)) return { acquired: true, claim: { ...row, status: 'PENDING', reward_json: JSON.stringify(reward || {}) } };
  }
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO captain_reward_claims(week_key,user_id,reward_type,reward_key,reward_json,status,updated_at)
    VALUES(?,?,?,?,?,'PENDING',CURRENT_TIMESTAMP)
  `).bind(weekKey, userId, type, key, JSON.stringify(reward || {})).run();
  row = await env.DB.prepare('SELECT * FROM captain_reward_claims WHERE week_key=? AND user_id=? AND reward_type=? AND reward_key=?')
    .bind(weekKey, userId, type, key).first();
  if (Number(inserted?.meta?.changes || 0)) return { acquired: true, claim: row };
  return { acquired: false, completed: row?.status === 'COMPLETED', pending: row?.status === 'PENDING', claim: row };
}

async function failRewardClaim(env, claimId, error) {
  if (!claimId) return;
  await env.DB.prepare("UPDATE captain_reward_claims SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'")
    .bind(String(error?.message || error).slice(0, 500), claimId).run();
}

async function grantReward(env, userId, reward, reason, claimId, referenceId) {
  const coin = Math.max(0, Math.floor(Number(reward?.coin || 0)));
  const shards = Math.max(0, Math.floor(Number(reward?.shards || 0)));
  const magicCrystals = Math.max(0, Math.floor(Number(reward?.magicCrystals || 0)));
  const before = await rewardBalances(env, userId);
  const coinBalance = before.coinBalance + coin;
  const shardBalance = before.shardBalance + shards;
  const magicBalance = before.magicBalance + magicCrystals;
  const label = reason === 'CAPTAIN_SETTLEMENT' ? '대장전 주간 정산 보상' : '대장전 승리 보상';
  const ref = String(referenceId || claimId || Date.now());
  const statements = [
    env.DB.prepare('UPDATE users SET coin=coin+?,card_shards=card_shards+?,magic_crystals=magic_crystals+? WHERE id=?').bind(coin, shards, magicCrystals, userId)
  ];
  if (coin > 0) statements.push(env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,?)').bind(userId, coin, coinBalance, reason));
  if (shards > 0) statements.push(env.DB.prepare('INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,?,NULL)').bind(userId, shards, shardBalance, reason));
  if (magicCrystals > 0) statements.push(env.DB.prepare('INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,?,?,?)').bind(userId, magicCrystals, magicBalance, label, reason, ref));
  if (claimId) statements.push(env.DB.prepare("UPDATE captain_reward_claims SET status='COMPLETED',error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'").bind(claimId));
  await env.DB.batch(statements);
  return { coin, shards, magicCrystals, coinBalance, shardBalance, magicBalance, reason };
}

async function claimCaptainReward(env, params) {
  const reserved = await reserveRewardClaim(env, params);
  if (reserved.completed) return { ...(params.reward || {}), ...(await rewardBalances(env, params.userId)), alreadyGranted: true };
  if (!reserved.acquired) throw new Error('같은 대장전 보상을 처리 중입니다. 잠시 후 다시 확인하세요.');
  try {
    return await grantReward(env, params.userId, params.reward, params.reason, reserved.claim.id, params.rewardKey);
  } catch (error) {
    await failRewardClaim(env, reserved.claim?.id, error);
    throw error;
  }
}

async function recoverFailedVictoryRewards(env, userId) {
  const rows = (await env.DB.prepare("SELECT * FROM captain_reward_claims WHERE user_id=? AND reward_type='VICTORY' AND status='FAILED' ORDER BY id LIMIT 10").bind(userId).all()).results || [];
  for (const row of rows) {
    let reward = {};
    try { reward = JSON.parse(row.reward_json || '{}'); } catch {}
    try {
      await claimCaptainReward(env, { weekKey: row.week_key, userId, rewardType: 'VICTORY', rewardKey: row.reward_key, reward, reason: 'CAPTAIN_VICTORY' });
    } catch (error) {
      console.error('captain victory reward recovery failed', row.id, error);
    }
  }
}

function normalizeBattleCard(card, index) {
  const power = Math.max(100, Math.floor(Number(
    card?.power ?? card?.battlePower ?? card?.battle_power ?? card?.basePower ?? card?.base_power ?? 100
  ) || 100));
  return {
    ...card,
    id: String(card?.id ?? card?.card_id ?? `slot-${index}`),
    title: String(card?.title ?? card?.card_title ?? card?.name ?? '카드'),
    grade: String(card?.grade ?? card?.rarity ?? 'C').toUpperCase(),
    rarity: String(card?.rarity ?? card?.grade ?? 'C').toUpperCase(),
    image: card?.image ?? card?.image_url ?? '',
    image_url: card?.image_url ?? card?.image ?? '',
    power,
    maxHp: power,
    hp: power,
    down: false,
    slot: index
  };
}

function refreshFighter(fighter) {
  fighter.maxHp = fighter.deckState.reduce((sum, card) => sum + Number(card.maxHp || 0), 0);
  fighter.hp = fighter.deckState.reduce((sum, card) => sum + Math.max(0, Number(card.hp || 0)), 0);
  fighter.down = fighter.deckState.every(card => Number(card.hp || 0) <= 0);
  return fighter;
}

function fighterFromMember(member) {
  const deckState = (member.deckSnapshot || []).slice(0, 5).map(normalizeBattleCard);
  const fighter = {
    userId: Number(member.user_id),
    nickname: member.nickname,
    role: member.role,
    position: Number(member.position),
    pvpTier: member.pvpTier,
    pvpScore: Number(member.pvpScore || 0),
    deckPower: Math.max(1, Number(member.deck_power || deckState.reduce((sum, card) => sum + card.power, 0) || 1)),
    deckSnapshot: member.deckSnapshot || [],
    deckState,
    maxHp: 1,
    hp: 1,
    down: false
  };
  return refreshFighter(fighter);
}

function cardStatePayload(card) {
  const maxHp = Math.max(1, Number(card.maxHp || card.power || 1));
  const hp = Math.max(0, Math.round(Number(card.hp || 0)));
  return {
    id: card.id,
    title: card.title,
    name: card.name || '',
    grade: card.grade,
    rarity: card.rarity,
    image: card.image,
    image_url: card.image_url,
    focusX: Number(card.focusX ?? card.focus_x ?? 50),
    focusY: Number(card.focusY ?? card.focus_y ?? 50),
    breakthroughLevel: Number(card.breakthroughLevel ?? card.breakthrough_level ?? 0),
    powerType: card.powerType ?? card.power_type ?? '',
    power: Number(card.power || maxHp),
    maxHp,
    hp,
    hpPercent: Math.round(clamp((hp / maxHp) * 100, 0, 100)),
    down: hp <= 0,
    slot: Number(card.slot || 0)
  };
}

function fighterPayload(fighter, includeDeck = true) {
  refreshFighter(fighter);
  const payload = {
    userId: fighter.userId,
    nickname: fighter.nickname,
    role: fighter.role,
    position: fighter.position,
    pvpTier: fighter.pvpTier,
    pvpScore: fighter.pvpScore,
    deckPower: fighter.deckPower,
    maxHp: fighter.maxHp,
    hp: Math.max(0, Math.round(fighter.hp)),
    hpPercent: Math.round(clamp((fighter.hp / Math.max(1, fighter.maxHp)) * 100, 0, 100)),
    down: Boolean(fighter.down)
  };
  if (includeDeck) {
    payload.deckSnapshot = fighter.deckState.map(cardStatePayload);
    payload.deckState = payload.deckSnapshot;
  }
  return payload;
}

function randomFactor(min = 0.92, max = 1.08) {
  const unit = randomIndex(10001) / 10000;
  return min + (max - min) * unit;
}

function cardDamage(attacker, defender) {
  const attackPower = Math.max(1, Number(attacker.power || 1));
  const defensePower = Math.max(1, Number(defender.power || 1));
  const ratio = clamp(attackPower / defensePower, 0.45, 2.2);
  const critical = randomIndex(100) < 10;
  const basePercent = clamp(0.27 + (Math.sqrt(ratio) - 1) * 0.12, 0.20, 0.43);
  const damage = Math.max(1, Math.round(Number(defender.maxHp || defensePower) * basePercent * randomFactor() * (critical ? 1.32 : 1)));
  return { damage, critical };
}

function firstAliveCardIndex(fighter) {
  return fighter.deckState.findIndex(card => Number(card.hp || 0) > 0);
}

function forceFighterDown(fighter) {
  for (const card of fighter.deckState) {
    card.hp = 0;
    card.down = true;
  }
  refreshFighter(fighter);
}

function simulateDuel(left, right, roundNumber) {
  refreshFighter(left);
  refreshFighter(right);
  const leftStart = fighterPayload(left, true);
  const rightStart = fighterPayload(right, true);
  const exchanges = [];
  let exchangeNo = 0;

  while (!left.down && !right.down && exchangeNo < 80) {
    const leftIndex = firstAliveCardIndex(left);
    const rightIndex = firstAliveCardIndex(right);
    if (leftIndex < 0 || rightIndex < 0) break;
    const leftCard = left.deckState[leftIndex];
    const rightCard = right.deckState[rightIndex];
    const leftBefore = Number(leftCard.hp || 0);
    const rightBefore = Number(rightCard.hp || 0);

    const leftHit = cardDamage(leftCard, rightCard);
    rightCard.hp = Math.max(0, rightBefore - leftHit.damage);
    rightCard.down = rightCard.hp <= 0;

    let rightHit = { damage: 0, critical: false };
    if (!rightCard.down) {
      rightHit = cardDamage(rightCard, leftCard);
      leftCard.hp = Math.max(0, leftBefore - rightHit.damage);
      leftCard.down = leftCard.hp <= 0;
    }

    exchangeNo += 1;
    refreshFighter(left);
    refreshFighter(right);
    exchanges.push({
      exchange: exchangeNo,
      leftCardIndex: leftIndex,
      rightCardIndex: rightIndex,
      leftDamage: Number(rightHit.damage || 0),
      rightDamage: Number(leftHit.damage || 0),
      leftCritical: Boolean(rightHit.critical),
      rightCritical: Boolean(leftHit.critical),
      leftCardHp: Math.round(leftCard.hp),
      rightCardHp: Math.round(rightCard.hp),
      leftCardHpPercent: Math.round(clamp((leftCard.hp / Math.max(1, leftCard.maxHp)) * 100, 0, 100)),
      rightCardHpPercent: Math.round(clamp((rightCard.hp / Math.max(1, rightCard.maxHp)) * 100, 0, 100)),
      leftCardDown: Boolean(leftCard.down),
      rightCardDown: Boolean(rightCard.down),
      leftDeckHpPercent: Math.round(clamp((left.hp / Math.max(1, left.maxHp)) * 100, 0, 100)),
      rightDeckHpPercent: Math.round(clamp((right.hp / Math.max(1, right.maxHp)) * 100, 0, 100))
    });
  }

  if (!left.down && !right.down) {
    const leftRatio = left.hp / Math.max(1, left.maxHp);
    const rightRatio = right.hp / Math.max(1, right.maxHp);
    if (leftRatio === rightRatio ? randomIndex(2) === 0 : leftRatio > rightRatio) forceFighterDown(right);
    else forceFighterDown(left);
  }

  refreshFighter(left);
  refreshFighter(right);
  const leftWins = !left.down && right.down;
  const winner = leftWins ? left : right;
  const loser = leftWins ? right : left;
  if (!loser.down) forceFighterDown(loser);

  return {
    round: roundNumber,
    left: {
      ...fighterPayload(left, true),
      startHp: leftStart.hp,
      startHpPercent: leftStart.hpPercent,
      startDeck: leftStart.deckSnapshot,
      endHp: Math.round(left.hp),
      endHpPercent: Math.round(clamp((left.hp / Math.max(1, left.maxHp)) * 100, 0, 100)),
      endDeck: left.deckState.map(cardStatePayload)
    },
    right: {
      ...fighterPayload(right, true),
      startHp: rightStart.hp,
      startHpPercent: rightStart.hpPercent,
      startDeck: rightStart.deckSnapshot,
      endHp: Math.round(right.hp),
      endHpPercent: Math.round(clamp((right.hp / Math.max(1, right.maxHp)) * 100, 0, 100)),
      endDeck: right.deckState.map(cardStatePayload)
    },
    exchanges,
    winnerUserId: winner.userId,
    loserUserId: loser.userId,
    winnerSide: leftWins ? 'ATTACKER' : 'DEFENDER',
    ultimateDisabled: true,
    engine: 'PVP_CARD_GAUNTLET_V1'
  };
}

function simulateGauntlet(attackerTeam, defenderTeam) {
  const attackerLineup = shuffle(attackerTeam.members.map(fighterFromMember));
  const defenderLineup = shuffle(defenderTeam.members.map(fighterFromMember));
  const attackerQueue = [...attackerLineup];
  const defenderQueue = [...defenderLineup];
  let activeAttacker = attackerQueue.shift();
  let activeDefender = defenderQueue.shift();
  const rounds = [];

  while (activeAttacker && activeDefender && rounds.length < 5) {
    const round = simulateDuel(activeAttacker, activeDefender, rounds.length + 1);
    rounds.push(round);
    if (round.winnerSide === 'ATTACKER') activeDefender = defenderQueue.shift() || null;
    else activeAttacker = attackerQueue.shift() || null;
  }

  const attackerWon = Boolean(activeAttacker && !activeDefender);
  const survivor = attackerWon ? activeAttacker : activeDefender;
  return {
    winnerTeamId: Number(attackerWon ? attackerTeam.id : defenderTeam.id),
    loserTeamId: Number(attackerWon ? defenderTeam.id : attackerTeam.id),
    result: attackerWon ? 'WIN' : 'LOSE',
    attackerLineup: attackerLineup.map(fighter => fighterPayload(fighter, false)),
    defenderLineup: defenderLineup.map(fighter => fighterPayload(fighter, false)),
    rounds,
    survivor: survivor ? fighterPayload(survivor, true) : null,
    ultimateDisabled: true,
    engine: 'PVP_CARD_GAUNTLET_V1'
  };
}


async function receiptStart(env, requestId, week, userId) {
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO captain_match_receipts_v3(request_id,week_key,user_id,status)
    VALUES(?,?,?,'PENDING')
  `).bind(requestId, week, userId).run();

  if (Number(inserted.meta?.changes || 0) > 0) return { acquired: true };

  const existing = await env.DB.prepare('SELECT * FROM captain_match_receipts_v3 WHERE request_id=?')
    .bind(requestId).first();
  if (existing?.status === 'DONE' && existing.response_json) {
    return { acquired: false, response: safeJson(existing.response_json, null) };
  }
  return { acquired: false, pending: true };
}

async function receiptFail(env, requestId, error) {
  try {
    await env.DB.prepare(`
      UPDATE captain_match_receipts_v3
      SET status='FAILED',error_text=?,updated_at=CURRENT_TIMESTAMP
      WHERE request_id=?
    `).bind(String(error?.message || error).slice(0, 500), requestId).run();
  } catch {}
}

export async function handleCaptain({ path, request, env, deps }) {
  if (!path.startsWith('captain/') && !path.startsWith('admin/captain')) return null;
  await upgrade(env);

  const user = await deps.authenticate(request, env);
  if (!user) return deps.json({ error: '로그인이 필요합니다.' }, 401);

  const admin = deps.isAdminRole(user);
  const config = await settings(env);
  const magicConfig = await magicSettings(env);
  const captainMagic = magicConfig.acquisition?.captain || {};
  const currentRound = await resolveCaptainRound(env);
  const week = currentRound.roundKey;
  if (!path.startsWith('admin/')) await recoverFailedVictoryRewards(env, user.id);

  if (path === 'admin/captain/settings') {
    if (!admin) return deps.json({ error: '관리자 권한이 필요합니다.' }, 403);
    if (request.method === 'PATCH') {
      try {
        const body = await deps.readBody(request);
        const rewardInput = body && typeof body.rewards === 'object' && body.rewards ? body.rewards : config.rewards;
        const victoryInput = rewardInput && typeof rewardInput.victory === 'object' ? rewardInput.victory : config.rewards.victory;
        const cleanVictory = {
          coin: Math.max(0, Math.floor(Number(victoryInput?.coin || 0))),
          shards: Math.max(0, Math.floor(Number(victoryInput?.shards || 0)))
        };
        const settlementInput = Array.isArray(rewardInput?.settlement) ? rewardInput.settlement : config.rewards.settlement;
        const cleanSettlement = settlementInput.slice(0, 20).map(item => ({
          from: Math.max(1, Math.floor(Number(item?.from || 1))),
          to: Math.max(1, Math.floor(Number(item?.to || item?.from || 1))),
          coin: Math.max(0, Math.floor(Number(item?.coin || 0))),
          shards: Math.max(0, Math.floor(Number(item?.shards || 0)))
        })).filter(item => item.to >= item.from);
        const next = {
          ...config,
          mode: ['ON', 'OFF', 'TEST'].includes(String(body.mode || '').toUpperCase()) ? String(body.mode).toUpperCase() : config.mode,
          energyMax: Math.max(1, Math.min(20, Math.floor(Number(body.energyMax ?? config.energyMax) || config.energyMax))),
          energyMinutes: Math.max(1, Math.min(1440, Math.floor(Number(body.energyMinutes ?? config.energyMinutes) || config.energyMinutes))),
          winScore: Math.max(0, Math.floor(Number(body.winScore ?? config.winScore) || 0)),
          loseScore: Math.max(0, Math.floor(Number(body.loseScore ?? config.loseScore) || 0)),
          renameCooldownMinutes: Math.max(0, Math.min(10080, Math.floor(Number(body.renameCooldownMinutes ?? config.renameCooldownMinutes) || 0))),
          adminTestParticipation: body.adminTestParticipation === undefined ? Boolean(config.adminTestParticipation) : Boolean(body.adminTestParticipation),
          bgm: {
            enabled: body.bgm?.enabled === undefined ? Boolean(config.bgm?.enabled) : Boolean(body.bgm.enabled),
            source: String(body.bgm?.source ?? config.bgm?.source ?? '').trim().slice(0, 1000),
            volume: Math.max(0, Math.min(100, Math.round(Number(body.bgm?.volume ?? config.bgm?.volume ?? 35) || 0))),
            loop: body.bgm?.loop === undefined ? Boolean(config.bgm?.loop) : Boolean(body.bgm.loop),
            stopOnExit: body.bgm?.stopOnExit === undefined ? Boolean(config.bgm?.stopOnExit) : Boolean(body.bgm.stopOnExit)
          },
          rewards: { victory: cleanVictory, settlement: cleanSettlement }
        };
        const value = JSON.stringify(next);
        const updated = await env.DB.prepare("UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='captain_settings_v2'")
          .bind(value).run();
        if (!Number(updated?.meta?.changes || 0)) {
          await env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('captain_settings_v2',?,CURRENT_TIMESTAMP)")
            .bind(value).run();
        }
        const verify = await env.DB.prepare("SELECT value FROM app_meta WHERE key='captain_settings_v2'").first();
        if (!verify?.value) throw new Error('설정 저장 결과를 확인하지 못했습니다.');
        return deps.json({ ok: true, settings: next });
      } catch (error) {
        console.error('captain settings save failed', error);
        return deps.json({ error: '대장전 설정 저장에 실패했습니다.', detail: String(error?.message || error) }, 500);
      }
    }
    return deps.json({ settings: config });
  }

  if (path === 'admin/captain/overview') {
    if (!admin) return deps.json({ error: '관리자 권한이 필요합니다.' }, 403);
    const tiers = await pvpTiers(env);
    const registrationRows = (await env.DB.prepare(`
      SELECT r.*,u.nickname,COALESCE(p.season_score,1000) season_score
      FROM captain_registrations r
      JOIN users u ON u.id=r.user_id
      LEFT JOIN pvp_profiles p ON p.user_id=r.user_id
      WHERE r.week_key=?
      ORDER BY CASE r.status WHEN 'WAITING' THEN 0 WHEN 'ASSIGNED' THEN 1 ELSE 2 END,r.registered_at,r.id
    `).bind(week).all()).results;
    const registrations = registrationRows.map(row => {
      const pvpTier = tierFor(Number(row.season_score || 1000), tiers);
      return { ...row, season_score: Number(row.season_score || 1000), pvpTier, isGrandmaster: isGrandmasterTier(pvpTier) };
    });
    const teamRows = (await env.DB.prepare("SELECT * FROM captain_teams WHERE week_key=? ORDER BY status='ACTIVE' DESC,score DESC,wins DESC,id")
      .bind(week).all()).results;
    const teams = [];
    for (const row of teamRows) teams.push(await team(env, row.id));
    const logs = (await env.DB.prepare(`
      SELECT h.*,u.nickname initiated_by_name,ta.name attacker_team_name,td.name defender_team_name
      FROM captain_match_history_v3 h
      JOIN users u ON u.id=h.initiated_by_user_id
      JOIN captain_teams ta ON ta.id=h.attacker_team_id
      JOIN captain_teams td ON td.id=h.defender_team_id
      WHERE h.week_key=?
      ORDER BY h.id DESC
      LIMIT 100
    `).bind(week).all()).results.map(row => ({
      ...row,
      battle: safeJson(row.battle_log_json, {})
    }));
    const waitingRows = registrations.filter(row => row.status === 'WAITING');
    const waitingPowers = waitingRows.map(row => Math.max(0, Number(row.deck_power || 0)));
    const activeTeams = teams.filter(row => row.status === 'ACTIVE');
    const waitingPowerTotal = waitingPowers.reduce((sum, power) => sum + power, 0);
    return deps.json({
      weekKey: week,
      round: currentRound,
      registrations,
      teams,
      logs,
      balance: {
        roleRule: 'DECK_POWER_ASC',
        roleDescription: '등록 PVP 덱 전투력 낮은 순서대로 선봉 · 중견 · 대장 배정',
        formationRule: 'DECK_POWER_TOTAL_BALANCE',
        formationDescription: '대기 인원을 등록 순으로 우선 선발한 뒤 팀별 덱 전투력 합계 차이를 최소화해 배분',
        grandmasterLimitRemoved: true,
        waitingCount: waitingRows.length,
        waitingPowerMin: waitingPowers.length ? Math.min(...waitingPowers) : 0,
        waitingPowerMax: waitingPowers.length ? Math.max(...waitingPowers) : 0,
        waitingPowerAverage: waitingPowers.length ? Math.round(waitingPowerTotal / waitingPowers.length) : 0,
        legacyRoleTeams: activeTeams.filter(row => !row.roleOrderOk).length
      }
    });
  }

  if (path === 'admin/captain/cooldowns') {
    if (!admin) return deps.json({ error: '관리자 권한이 필요합니다.' }, 403);

    if (request.method === 'POST') {
      const body = await deps.readBody(request);
      const requestId = String(body?.requestId || crypto.randomUUID()).trim().slice(0, 120);
      const previous = await env.DB.prepare('SELECT * FROM captain_cooldown_reset_events WHERE request_id=?')
        .bind(requestId).first();
      if (previous) {
        return deps.json({
          ok: true,
          replayed: true,
          scope: previous.scope,
          targetUserId: previous.target_user_id ? Number(previous.target_user_id) : null,
          affectedCount: Number(previous.affected_count || 0),
          note: '이미 처리된 7일 입장 제한 초기화 요청입니다.'
        });
      }

      const scope = String(body?.scope || '').toUpperCase() === 'ALL' ? 'ALL' : 'USER';
      const targetUserId = Math.floor(Number(body?.userId || 0));
      let affectedCount = 0;
      let targetNickname = '';

      if (scope === 'USER') {
        if (!targetUserId) return deps.json({ error: '초기화할 유저를 선택하세요.' }, 400);
        const target = await env.DB.prepare('SELECT id,nickname FROM users WHERE id=?').bind(targetUserId).first();
        if (!target) return deps.json({ error: '대상 유저를 찾을 수 없습니다.' }, 404);
        targetNickname = String(target.nickname || `유저 ${targetUserId}`);
        const result = await env.DB.prepare(`
          UPDATE captain_registrations
          SET cooldown_until=NULL
          WHERE user_id=?
            AND cooldown_until IS NOT NULL
            AND datetime(cooldown_until)>CURRENT_TIMESTAMP
        `).bind(targetUserId).run();
        affectedCount = Number(result?.meta?.changes || 0);
      } else {
        const result = await env.DB.prepare(`
          UPDATE captain_registrations
          SET cooldown_until=NULL
          WHERE cooldown_until IS NOT NULL
            AND datetime(cooldown_until)>CURRENT_TIMESTAMP
        `).run();
        affectedCount = Number(result?.meta?.changes || 0);
      }

      await env.DB.prepare(`
        INSERT INTO captain_cooldown_reset_events(
          request_id,scope,target_user_id,executed_by,affected_count
        ) VALUES(?,?,?,?,?)
      `).bind(requestId, scope, scope === 'USER' ? targetUserId : null, user.id, affectedCount).run();

      return deps.json({
        ok: true,
        scope,
        targetUserId: scope === 'USER' ? targetUserId : null,
        affectedCount,
        note: scope === 'ALL'
          ? `현재 적용 중인 7일 입장 제한 ${affectedCount}건을 전체 초기화했습니다.`
          : affectedCount
            ? `${targetNickname}님의 7일 입장 제한을 초기화했습니다.`
            : `${targetNickname}님에게 적용 중인 7일 입장 제한이 없습니다.`
      });
    }

    const rows = (await env.DB.prepare(`
      SELECT r.id,r.user_id,r.week_key,r.cancelled_at,r.cooldown_until,u.nickname
      FROM captain_registrations r
      JOIN users u ON u.id=r.user_id
      WHERE r.cooldown_until IS NOT NULL
        AND datetime(r.cooldown_until)>CURRENT_TIMESTAMP
        AND r.id=(
          SELECT r2.id
          FROM captain_registrations r2
          WHERE r2.user_id=r.user_id
            AND r2.cooldown_until IS NOT NULL
            AND datetime(r2.cooldown_until)>CURRENT_TIMESTAMP
          ORDER BY datetime(r2.cooldown_until) DESC,r2.id DESC
          LIMIT 1
        )
      ORDER BY datetime(r.cooldown_until),u.nickname
      LIMIT 1000
    `).all()).results.map(row => ({
      ...row,
      user_id: Number(row.user_id),
      remainingSeconds: Math.max(0, Math.floor((Date.parse(String(row.cooldown_until).replace(' ', 'T') + 'Z') - Date.now()) / 1000))
    }));

    const recentResets = (await env.DB.prepare(`
      SELECT e.*,u.nickname target_nickname,a.nickname executed_by_name
      FROM captain_cooldown_reset_events e
      LEFT JOIN users u ON u.id=e.target_user_id
      LEFT JOIN users a ON a.id=e.executed_by
      ORDER BY e.created_at DESC
      LIMIT 30
    `).all()).results;

    return deps.json({
      activeCount: rows.length,
      cooldowns: rows,
      recentResets
    });
  }

  if (path === 'admin/captain/team' && request.method === 'PATCH') {
    if (!admin) return deps.json({ error: '관리자 권한이 필요합니다.' }, 403);
    const body = await deps.readBody(request);
    const teamId = Number(body.teamId);
    const name = cleanName(body.name);
    if (!teamId || name.length < 2) return deps.json({ error: '팀명은 2~20자로 입력하세요.' }, 400);
    await env.DB.prepare('UPDATE captain_teams SET name=?,renamed_at=CURRENT_TIMESTAMP WHERE id=? AND week_key=?')
      .bind(name, teamId, week).run();
    return deps.json({ ok: true });
  }

  if (path === 'admin/captain/reset' && request.method === 'POST') {
    if (!admin) return deps.json({ error: '관리자 권한이 필요합니다.' }, 403);
    const body = await deps.readBody(request);
    const expectedRoundKey = String(body?.expectedRoundKey || '').trim();
    const requestId = String(body?.requestId || crypto.randomUUID()).trim().slice(0, 120);
    const previousRequest = await env.DB.prepare('SELECT * FROM captain_round_reset_events WHERE request_id=?')
      .bind(requestId).first();
    if (previousRequest) {
      const replayRound = await resolveCaptainRound(env);
      return deps.json({
        ok: true,
        oldRoundKey: previousRequest.old_round_key,
        newRoundKey: previousRequest.new_round_key,
        replayed: true,
        round: replayRound,
        note: `이미 처리된 요청입니다. 현재 ${replayRound.label}가 운영 중입니다.`
      });
    }
    if (expectedRoundKey && expectedRoundKey !== currentRound.roundKey) {
      return deps.json({
        error: '이미 다른 운영자가 새 회차를 시작했습니다.',
        currentRoundKey: currentRound.roundKey,
        currentRoundLabel: currentRound.label
      }, 409);
    }
    const result = await startNewCaptainRound(env, currentRound, user.id, requestId);
    const newRound = await resolveCaptainRound(env);
    return deps.json({
      ok: true,
      oldRoundKey: result.oldRoundKey,
      newRoundKey: result.newRoundKey,
      roundNumber: result.roundNumber,
      replayed: result.replayed,
      round: newRound,
      note: `${roundLabel(currentRound)} 운영을 종료하고 ${newRound.label}를 시작했습니다. 기존 참가·팀·랭킹·경기·보상 기록은 삭제하지 않고 보존되며, 모든 유저가 새 회차에 다시 등록할 수 있습니다.`
    });
  }

  if (config.mode === 'OFF') return deps.json({ error: '현재 대장전이 중지되어 있습니다.' }, 503);
  if (config.mode === 'TEST' && !admin) return deps.json({ error: '대장전 테스트 중입니다.' }, 403);
  if (config.mode === 'TEST' && admin && !config.adminTestParticipation) return deps.json({ error: '운영자 테스트 참여가 비활성화되어 있습니다.' }, 403);

  if (path === 'captain/register' && request.method === 'POST') {
    if (admin && config.mode === 'ON') return deps.json({ error: '운영 계정은 정규 랭킹에서 제외됩니다. CMS에서 TEST 모드로 전환해 테스트하세요.' }, 403);
    const last = await env.DB.prepare(`
      SELECT week_key,cooldown_until
      FROM captain_registrations
      WHERE user_id=? AND cooldown_until IS NOT NULL
      ORDER BY id DESC LIMIT 1
    `).bind(user.id).first();
    const cooldownActive = last?.cooldown_until && Date.parse(last.cooldown_until.replace(' ', 'T') + 'Z') > Date.now();
    const manualResetOverride = currentRound.roundNumber > 1 && last?.week_key && String(last.week_key) !== String(week);
    if (cooldownActive && !manualResetOverride) {
      return deps.json({ error: '참가 취소 후 7일 동안 재등록할 수 없습니다.', cooldownUntil: last.cooldown_until }, 409);
    }
    const current = await env.DB.prepare('SELECT status FROM captain_registrations WHERE week_key=? AND user_id=?')
      .bind(week, user.id).first();
    if (current && current.status !== 'CANCELLED') return deps.json({ error: '이번 주에 이미 등록했습니다.' }, 409);

    const [deck, battle] = await Promise.all([
      deps.pvpDeckSnapshot(env, user.id),
      deps.battleSettings(env)
    ]);
    if (deck.length !== 5) return deps.json({ error: 'PVP 덱 5장을 먼저 저장하세요.' }, 400);

    const snapshot = deck.map(card => ({
      ...card,
      power: deps.cardBattlePower(card, card.breakthrough_level, battle)
    }));
    const power = snapshot.reduce((sum, card) => sum + Number(card.power || 0), 0);

    if (current) {
      await env.DB.prepare(`
        UPDATE captain_registrations
        SET deck_snapshot=?,deck_power=?,status='WAITING',team_id=NULL,registered_at=CURRENT_TIMESTAMP,
            assigned_at=NULL,cancelled_at=NULL,cooldown_until=NULL
        WHERE week_key=? AND user_id=?
      `).bind(JSON.stringify(snapshot), power, week, user.id).run();
    } else {
      await env.DB.prepare('INSERT INTO captain_registrations(week_key,user_id,deck_snapshot,deck_power) VALUES(?,?,?,?)')
        .bind(week, user.id, JSON.stringify(snapshot), power).run();
    }

    await formTeams(env, week);
    return deps.json({ ok: true });
  }

  if (path === 'captain/register' && request.method === 'DELETE') {
    if (await userTeam(env, user.id, week)) return deps.json({ error: '팀 결성 후에는 탈퇴할 수 없습니다.' }, 409);
    const result = await env.DB.prepare(`
      UPDATE captain_registrations
      SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP,cooldown_until=datetime('now','+7 days')
      WHERE week_key=? AND user_id=? AND status='WAITING'
    `).bind(week, user.id).run();
    if (!result.meta.changes) return deps.json({ error: '취소할 참가 신청이 없습니다.' }, 409);
    return deps.json({ ok: true, cooldownDays: 7 });
  }

  const mine = await userTeam(env, user.id, week);

  if (path === 'captain/team-name' && request.method === 'PATCH') {
    if (!mine) return deps.json({ error: '편성된 팀이 없습니다.' }, 409);
    const member = await env.DB.prepare('SELECT position FROM captain_team_members WHERE team_id=? AND user_id=?')
      .bind(mine.id, user.id).first();
    if (Number(member?.position) !== 3) return deps.json({ error: '팀의 대장만 팀명을 변경할 수 있습니다.' }, 403);
    const body = await deps.readBody(request);
    const name = cleanName(body.name);
    if (name.length < 2) return deps.json({ error: '팀명은 2~20자로 입력하세요.' }, 400);
    if (await env.DB.prepare('SELECT 1 FROM captain_teams WHERE week_key=? AND name=? AND id<>?')
      .bind(week, name, mine.id).first()) return deps.json({ error: '이미 사용 중인 팀명입니다.' }, 409);
    if (mine.renamed_at && Date.now() - Date.parse(mine.renamed_at.replace(' ', 'T') + 'Z') < config.renameCooldownMinutes * 60000) {
      return deps.json({ error: `팀명은 ${config.renameCooldownMinutes}분마다 변경할 수 있습니다.` }, 409);
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE captain_teams SET name=?,renamed_at=CURRENT_TIMESTAMP WHERE id=?').bind(name, mine.id),
      env.DB.prepare('INSERT INTO captain_team_name_logs(week_key,team_id,changed_by,old_name,new_name) VALUES(?,?,?,?,?)')
        .bind(week, mine.id, user.id, mine.name, name)
    ]);
    return deps.json({ ok: true, name });
  }

  if (path === 'captain/status') {
    await formTeams(env, week);
    const registration = await env.DB.prepare('SELECT * FROM captain_registrations WHERE week_key=? AND user_id=?')
      .bind(week, user.id).first();
    const myTeamRow = await userTeam(env, user.id, week);
    const waiting = await env.DB.prepare("SELECT COUNT(*) n FROM captain_registrations WHERE week_key=? AND status='WAITING'")
      .bind(week).first();
    const opponents = [];

    if (myTeamRow) {
      const rows = (await env.DB.prepare(`
        SELECT t.*,SUM(m.deck_power) team_power
        FROM captain_teams t
        JOIN captain_team_members m ON m.team_id=t.id
        WHERE t.week_key=? AND t.id<>? AND t.status='ACTIVE'
        GROUP BY t.id
        ORDER BY ABS(SUM(m.deck_power)-(SELECT SUM(deck_power) FROM captain_team_members WHERE team_id=?)),t.score DESC
        LIMIT 8
      `).bind(week, myTeamRow.id, myTeamRow.id).all()).results;
      for (const row of rows) {
        const opponent = await team(env, row.id);
        opponents.push({ ...opponent, teamPower: Number(row.team_power || opponent.teamPower || 0) });
      }
    }

    const energyState = await energy(env, user.id, week, config);
    const myTeam = await team(env, myTeamRow?.id);
    const isCaptain = Boolean(myTeam?.members?.some(member => Number(member.user_id) === Number(user.id) && Number(member.position) === 3));

    return deps.json({
      weekKey: week,
      round: currentRound,
      registered: Boolean(registration && registration.status !== 'CANCELLED'),
      registrationStatus: registration?.status || null,
      cooldownUntil: registration?.cooldown_until || null,
      team: myTeam,
      opponents,
      waitingCount: Number(waiting?.n || 0),
      canCancel: registration?.status === 'WAITING',
      isCaptain,
      energy: energyState,
      battleRule: 'RANDOM_GAUNTLET_3V3',
      ultimateDisabled: true,
      operatorTestParticipant: Boolean(admin && config.mode === 'TEST' && config.adminTestParticipation),
      bgm: {
        enabled: Boolean(config.bgm?.enabled && config.bgm?.source),
        source: String(config.bgm?.source || ''),
        volume: Math.max(0, Math.min(100, Number(config.bgm?.volume || 0))),
        loop: config.bgm?.loop !== false,
        stopOnExit: config.bgm?.stopOnExit !== false
      }
    });
  }

  if (path === 'captain/fight' && request.method === 'POST') {
    if (!mine) return deps.json({ error: '편성된 팀이 없습니다.' }, 409);
    const body = await deps.readBody(request);
    const requestId = String(body.requestId || crypto.randomUUID());
    const opponentTeamId = Number(body.opponentTeamId);
    if (!opponentTeamId || opponentTeamId === Number(mine.id)) {
      return deps.json({ error: '올바른 상대 팀을 선택하세요.' }, 400);
    }

    const receipt = await receiptStart(env, requestId, week, user.id);
    if (!receipt.acquired) {
      if (receipt.response) {
        const replay = { ...receipt.response, replayed: true };
        if (replay.result === 'WIN' && !replay.victoryReward) {
          const victoryReward = { ...(config.rewards?.victory || { coin: 0, shards: 0 }), magicCrystals: captainMagic.enabled === true ? Math.max(0, Number(captainMagic.victory || 0)) : 0 };
          try { replay.victoryReward = await claimCaptainReward(env, { weekKey: week, userId: user.id, rewardType: 'VICTORY', rewardKey: requestId, reward: victoryReward, reason: 'CAPTAIN_VICTORY' }); }
          catch (rewardError) { replay.victoryRewardError = '승리 보상 지급에 실패했습니다. 다시 대장전 화면에 접속하면 자동 복구됩니다.'; }
        }
        return deps.json(replay);
      }
      return deps.json({ error: '같은 공격 요청이 이미 처리 중입니다.' }, 409);
    }

    let energySpent = false;
    try {
      const defenderRow = await env.DB.prepare(`
        SELECT * FROM captain_teams
        WHERE id=? AND week_key=? AND status='ACTIVE' AND id<>?
      `).bind(opponentTeamId, week, mine.id).first();
      if (!defenderRow) throw Object.assign(new Error('공격 가능한 상대 팀이 아닙니다.'), { status: 400 });

      const energyState = await energy(env, user.id, week, config);
      if (energyState.current <= 0) {
        const error = Object.assign(new Error('공격 횟수가 부족합니다.'), { status: 429, energy: energyState });
        throw error;
      }

      const attackerTeam = await team(env, mine.id, true);
      const defenderTeam = await team(env, opponentTeamId, true);
      if (!attackerTeam || attackerTeam.members.length !== 3 || attackerTeam.members.some(member => member.deckSnapshot.length !== 5)) {
        throw Object.assign(new Error('우리 팀의 PVP 덱 정보가 완성되지 않았습니다.'), { status: 409 });
      }
      if (!defenderTeam || defenderTeam.members.length !== 3 || defenderTeam.members.some(member => member.deckSnapshot.length !== 5)) {
        throw Object.assign(new Error('상대 팀의 PVP 덱 정보가 완성되지 않았습니다.'), { status: 409 });
      }

      const spent = await env.DB.prepare(`
        UPDATE captain_energy
        SET energy=energy-1
        WHERE user_id=? AND week_key=? AND energy>0
      `).bind(user.id, week).run();
      if (!spent.meta.changes) {
        const error = Object.assign(new Error('공격 횟수가 부족합니다.'), { status: 429 });
        throw error;
      }
      energySpent = true;

      const match = simulateGauntlet(attackerTeam, defenderTeam);
      const attackerWon = match.result === 'WIN';
      const attackerBefore = Number(mine.score || 0);
      const defenderBefore = Number(defenderRow.score || 0);
      const attackerAfter = Math.max(0, attackerBefore + (attackerWon ? config.winScore : -config.loseScore));
      const defenderAfter = Math.max(0, defenderBefore + (attackerWon ? -config.loseScore : config.winScore));

      const response = {
        requestId,
        result: match.result,
        scoreChange: attackerWon ? config.winScore : -config.loseScore,
        attackerScoreBefore: attackerBefore,
        attackerScoreAfter: attackerAfter,
        defenderScoreBefore: defenderBefore,
        defenderScoreAfter: defenderAfter,
        attackerTeam: {
          id: Number(attackerTeam.id),
          name: attackerTeam.name,
          score: attackerBefore,
          members: attackerTeam.members.map(member => publicMember(member, false))
        },
        defenderTeam: {
          id: Number(defenderTeam.id),
          name: defenderTeam.name,
          score: defenderBefore,
          members: defenderTeam.members.map(member => publicMember(member, false))
        },
        attackerLineup: match.attackerLineup,
        defenderLineup: match.defenderLineup,
        rounds: match.rounds,
        survivor: match.survivor,
        winnerTeamId: match.winnerTeamId,
        loserTeamId: match.loserTeamId,
        ultimateDisabled: true,
        battleEngine: match.engine
      };

      await env.DB.batch([
        env.DB.prepare('UPDATE captain_teams SET score=?,wins=wins+?,losses=losses+? WHERE id=?')
          .bind(attackerAfter, attackerWon ? 1 : 0, attackerWon ? 0 : 1, attackerTeam.id),
        env.DB.prepare('UPDATE captain_teams SET score=?,wins=wins+?,losses=losses+? WHERE id=?')
          .bind(defenderAfter, attackerWon ? 0 : 1, attackerWon ? 1 : 0, defenderTeam.id),
        env.DB.prepare(`
          INSERT INTO captain_match_history_v3(
            request_id,week_key,attacker_team_id,defender_team_id,initiated_by_user_id,
            winner_team_id,loser_team_id,attacker_score_before,attacker_score_after,
            defender_score_before,defender_score_after,attacker_lineup_json,defender_lineup_json,battle_log_json
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          requestId,
          week,
          attackerTeam.id,
          defenderTeam.id,
          user.id,
          match.winnerTeamId,
          match.loserTeamId,
          attackerBefore,
          attackerAfter,
          defenderBefore,
          defenderAfter,
          JSON.stringify(match.attackerLineup),
          JSON.stringify(match.defenderLineup),
          JSON.stringify({ rounds: match.rounds, survivor: match.survivor, ultimateDisabled: true, battleEngine: match.engine })
        ),
        env.DB.prepare(`
          UPDATE captain_match_receipts_v3
          SET status='DONE',response_json=?,error_text=NULL,updated_at=CURRENT_TIMESTAMP
          WHERE request_id=?
        `).bind(JSON.stringify(response), requestId)
      ]);

      if (attackerWon) {
        try {
          const victoryReward = { ...(config.rewards?.victory || { coin: 0, shards: 0 }), magicCrystals: captainMagic.enabled === true ? Math.max(0, Number(captainMagic.victory || 0)) : 0 };
          response.victoryReward = await claimCaptainReward(env, { weekKey: week, userId: user.id, rewardType: 'VICTORY', rewardKey: requestId, reward: victoryReward, reason: 'CAPTAIN_VICTORY' });
        } catch (rewardError) {
          console.error('captain victory reward failed', rewardError);
          response.victoryRewardError = '승리 보상 지급에 실패했습니다. 대장전 화면에 다시 접속하면 자동 복구됩니다.';
        }
      }
      response.energy = await energy(env, user.id, week, config);
      await env.DB.prepare(`
        UPDATE captain_match_receipts_v3
        SET response_json=?,updated_at=CURRENT_TIMESTAMP
        WHERE request_id=?
      `).bind(JSON.stringify(response), requestId).run();
      return deps.json(response);
    } catch (error) {
      if (energySpent) {
        try {
          await env.DB.prepare(`
            UPDATE captain_energy
            SET energy=MIN(energy+1,?)
            WHERE user_id=? AND week_key=?
          `).bind(config.energyMax, user.id, week).run();
        } catch {}
      }
      await receiptFail(env, requestId, error);
      return deps.json({ error: error.message || '대장전 처리에 실패했습니다.', ...(error.energy ? { energy: error.energy } : {}) }, error.status || 500);
    }
  }

  if (path === 'captain/history') {
    if (!mine) return deps.json({ attack: [], defense: [] });
    const rows = (await env.DB.prepare(`
      SELECT h.*,u.nickname initiated_by_name,ta.name attacker_team_name,td.name defender_team_name
      FROM captain_match_history_v3 h
      JOIN users u ON u.id=h.initiated_by_user_id
      JOIN captain_teams ta ON ta.id=h.attacker_team_id
      JOIN captain_teams td ON td.id=h.defender_team_id
      WHERE h.week_key=? AND (h.attacker_team_id=? OR h.defender_team_id=?)
      ORDER BY h.id DESC
      LIMIT 100
    `).bind(week, mine.id, mine.id).all()).results.map(row => {
      const battle = safeJson(row.battle_log_json, {});
      return {
        ...row,
        rounds: battle.rounds || [],
        survivor: battle.survivor || null,
        myResult: Number(row.winner_team_id) === Number(mine.id) ? 'WIN' : 'LOSE'
      };
    });
    return deps.json({
      attack: rows.filter(row => Number(row.attacker_team_id) === Number(mine.id)),
      defense: rows.filter(row => Number(row.defender_team_id) === Number(mine.id))
    });
  }

  if (path === 'captain/ranking') {
    const rows = (await env.DB.prepare(`
      SELECT * FROM captain_teams
      WHERE week_key=? AND status='ACTIVE'
      ORDER BY score DESC,wins DESC,losses ASC,id ASC
      LIMIT 100
    `).bind(week).all()).results;
    const ranking = [];
    for (const [index, row] of rows.entries()) {
      ranking.push({ ...row, rank: index + 1, members: (await team(env, row.id)).members });
    }
    return deps.json({ weekKey: week, round: currentRound, ranking });
  }

  if (path === 'captain/reward/status') {
    const settlementWeek = await settlementRoundKey(env, currentRound, user.id);
    const previousTeam = await env.DB.prepare(`
      SELECT t.* FROM captain_teams t
      JOIN captain_team_members m ON m.team_id=t.id
      WHERE t.week_key=? AND m.user_id=?
      LIMIT 1
    `).bind(settlementWeek, user.id).first();
    if (!previousTeam) return deps.json({ settlementWeek, eligible: false, claimed: false });
    const rows = (await env.DB.prepare(`
      SELECT id FROM captain_teams WHERE week_key=? AND status='ACTIVE'
      ORDER BY score DESC,wins DESC,losses ASC,id ASC
    `).bind(settlementWeek).all()).results;
    const rank = rows.findIndex(row => Number(row.id) === Number(previousTeam.id)) + 1;
    const baseReward = (config.rewards.settlement || []).find(item => rank >= Number(item.from) && rank <= Number(item.to)) || null;
    const reward = baseReward ? { ...baseReward, magicCrystals: captainMagic.enabled === true ? Math.max(0, Number(magicRewardForRank(captainMagic.settlement, rank) || 0)) : 0 } : null;
    const claim = await env.DB.prepare(`
      SELECT id,status FROM captain_reward_claims
      WHERE week_key=? AND user_id=? AND reward_type='SETTLEMENT' LIMIT 1
    `).bind(settlementWeek, user.id).first();
    return deps.json({ settlementWeek, eligible: Boolean(reward), claimed: claim?.status==='COMPLETED', processing: claim?.status==='PENDING', rank, reward });
  }

  if (path === 'captain/reward/claim' && request.method === 'POST') {
    const settlementWeek = await settlementRoundKey(env, currentRound, user.id);
    const previousTeam = await env.DB.prepare(`
      SELECT t.* FROM captain_teams t
      JOIN captain_team_members m ON m.team_id=t.id
      WHERE t.week_key=? AND m.user_id=?
      LIMIT 1
    `).bind(settlementWeek, user.id).first();
    if (!previousTeam) return deps.json({ error: '지난 주 대장전 참가 기록이 없습니다.' }, 404);
    const rows = (await env.DB.prepare(`
      SELECT id FROM captain_teams WHERE week_key=? AND status='ACTIVE'
      ORDER BY score DESC,wins DESC,losses ASC,id ASC
    `).bind(settlementWeek).all()).results;
    const rank = rows.findIndex(row => Number(row.id) === Number(previousTeam.id)) + 1;
    const baseReward = (config.rewards.settlement || []).find(item => rank >= Number(item.from) && rank <= Number(item.to));
    if (!baseReward) return deps.json({ error: '지난 주 순위에 해당하는 정산 보상이 없습니다.' }, 404);
    const reward = { ...baseReward, magicCrystals: captainMagic.enabled === true ? Math.max(0, Number(magicRewardForRank(captainMagic.settlement, rank) || 0)) : 0 };
    const key = `rank-${rank}`;
    const granted = await claimCaptainReward(env, { weekKey: settlementWeek, userId: user.id, rewardType: 'SETTLEMENT', rewardKey: key, reward, reason: 'CAPTAIN_SETTLEMENT' });
    return deps.json({ ok: true, settlementWeek, rank, reward: granted, replayed: Boolean(granted.alreadyGranted) });
  }

  return deps.json({ error: '대장전 API를 찾을 수 없습니다.' }, 404);
}
