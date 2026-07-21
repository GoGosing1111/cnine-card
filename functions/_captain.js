function weekKey() {
  const date = new Date(Date.now() + 32400000);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
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
    participation: { coin: 0, shards: 0, NORMAL_CUBE: 0, ADVANCED_CUBE: 0, PREMIUM_CUBE: 0 },
    ranks: [
      { from: 1, to: 1, coin: 5000, shards: 100, NORMAL_CUBE: 0, ADVANCED_CUBE: 1, PREMIUM_CUBE: 1 },
      { from: 2, to: 3, coin: 3000, shards: 60, NORMAL_CUBE: 0, ADVANCED_CUBE: 1, PREMIUM_CUBE: 0 },
      { from: 4, to: 10, coin: 1500, shards: 30, NORMAL_CUBE: 1, ADVANCED_CUBE: 0, PREMIUM_CUBE: 0 }
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
    )`
  ];

  for (const sql of tables) await env.DB.prepare(sql).run();

  for (const sql of [
    `ALTER TABLE captain_registrations ADD COLUMN cancelled_at TEXT`,
    `ALTER TABLE captain_registrations ADD COLUMN cooldown_until TEXT`,
    `ALTER TABLE captain_teams ADD COLUMN renamed_at TEXT`
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
    `CREATE INDEX IF NOT EXISTS idx_captain_receipts_v3_user ON captain_match_receipts_v3(week_key,user_id,created_at DESC)`
  ]) await env.DB.prepare(sql).run();

  await env.DB.prepare(
    "INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1080_captain_gauntlet','1',CURRENT_TIMESTAMP)"
  ).run();
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
      participation: {
        ...DEF.rewards.participation,
        ...(parsed.rewards?.participation || {})
      }
    }
  };
}

async function pvpTiers(env) {
  const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key='pvp_settings_v1'").first();
  return safeJson(row?.value, {}).tiers || [];
}

function tierFor(score, tiers) {
  let tier = tiers[0] || { id: 'bronze', name: '브론즈' };
  for (const candidate of tiers) {
    if (Number(score) >= Number(candidate.min || 0)) tier = candidate;
  }
  return {
    id: tier.id || 'bronze',
    name: tier.name || '브론즈',
    color: tier.color || '#b87333'
  };
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

  return {
    ...teamRow,
    score: Number(teamRow.score || 0),
    wins: Number(teamRow.wins || 0),
    losses: Number(teamRow.losses || 0),
    teamPower: members.reduce((sum, member) => sum + Number(member.deck_power || 0), 0),
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
    SELECT * FROM captain_registrations
    WHERE week_key=? AND status='WAITING' AND team_id IS NULL
    ORDER BY registered_at,id
  `).bind(week).all()).results;

  while (queue.length >= 3) {
    const selected = queue.splice(0, 3);
    const created = await env.DB.prepare('INSERT INTO captain_teams(week_key,name) VALUES(?,?)')
      .bind(week, `TEAM ${Math.random().toString(36).slice(2, 6).toUpperCase()}`)
      .run();
    const teamId = created.meta.last_row_id;
    const roles = shuffle([1, 2, 3]);

    try {
      await env.DB.batch([
        ...selected.map((registration, index) => env.DB.prepare(`
          INSERT OR IGNORE INTO captain_team_members(team_id,user_id,position,deck_snapshot,deck_power)
          VALUES(?,?,?,?,?)
        `).bind(teamId, registration.user_id, roles[index], registration.deck_snapshot, registration.deck_power)),
        ...selected.map(registration => env.DB.prepare(`
          UPDATE captain_registrations
          SET status='ASSIGNED',team_id=?,assigned_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='WAITING' AND team_id IS NULL
        `).bind(teamId, registration.id))
      ]);
    } catch (error) {
      await env.DB.prepare("UPDATE captain_teams SET status='CANCELLED' WHERE id=?").bind(teamId).run();
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

async function grantReward(env, userId, reward, reason) {
  const coin = Math.max(0, Number(reward.coin || 0));
  const shards = Math.max(0, Number(reward.shards || 0));
  const statements = [
    env.DB.prepare('UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=?')
      .bind(coin, shards, userId)
  ];

  for (const code of ['NORMAL_CUBE', 'ADVANCED_CUBE', 'PREMIUM_CUBE']) {
    const quantity = Math.max(0, Number(reward[code] || 0));
    if (!quantity) continue;
    statements.push(env.DB.prepare(`
      INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,updated_at)
      VALUES(?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,item_code) DO UPDATE SET
        quantity=quantity+excluded.quantity,
        unseen_quantity=unseen_quantity+excluded.unseen_quantity,
        updated_at=CURRENT_TIMESTAMP
    `).bind(userId, code, quantity, quantity));
  }

  await env.DB.batch(statements);
  return {
    coin,
    shards,
    NORMAL_CUBE: Number(reward.NORMAL_CUBE || 0),
    ADVANCED_CUBE: Number(reward.ADVANCED_CUBE || 0),
    PREMIUM_CUBE: Number(reward.PREMIUM_CUBE || 0),
    reason
  };
}

function fighterFromMember(member) {
  const power = Math.max(1, Number(member.deck_power || 1));
  return {
    userId: Number(member.user_id),
    nickname: member.nickname,
    role: member.role,
    position: Number(member.position),
    pvpTier: member.pvpTier,
    pvpScore: Number(member.pvpScore || 0),
    deckPower: power,
    deckSnapshot: member.deckSnapshot || [],
    maxHp: power,
    hp: power,
    down: false
  };
}

function fighterPayload(fighter, includeDeck = true) {
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
    hpPercent: Math.round(clamp((fighter.hp / fighter.maxHp) * 100, 0, 100)),
    down: Boolean(fighter.down)
  };
  if (includeDeck) payload.deckSnapshot = fighter.deckSnapshot;
  return payload;
}

function simulateDuel(left, right, roundNumber) {
  const leftStart = Math.max(1, left.hp);
  const rightStart = Math.max(1, right.hp);
  const leftEffective = left.deckPower * (leftStart / left.maxHp);
  const rightEffective = right.deckPower * (rightStart / right.maxHp);

  let leftWins;
  if (Math.abs(leftEffective - rightEffective) < 0.0001) leftWins = randomIndex(2) === 0;
  else leftWins = leftEffective > rightEffective;

  const winner = leftWins ? left : right;
  const loser = leftWins ? right : left;
  const winnerEffective = Math.max(1, leftWins ? leftEffective : rightEffective);
  const loserEffective = Math.max(1, leftWins ? rightEffective : leftEffective);
  const burden = clamp(loserEffective / winnerEffective, 0, 1.5);
  const damageRatio = clamp(0.22 + burden * 0.56, 0.28, 0.92);
  winner.hp = Math.max(1, Math.round(winner.hp * (1 - damageRatio)));
  loser.hp = 0;
  loser.down = true;

  return {
    round: roundNumber,
    left: {
      ...fighterPayload(left),
      startHp: Math.round(leftStart),
      startHpPercent: Math.round(clamp((leftStart / left.maxHp) * 100, 0, 100)),
      endHp: Math.round(left.hp),
      endHpPercent: Math.round(clamp((left.hp / left.maxHp) * 100, 0, 100))
    },
    right: {
      ...fighterPayload(right),
      startHp: Math.round(rightStart),
      startHpPercent: Math.round(clamp((rightStart / right.maxHp) * 100, 0, 100)),
      endHp: Math.round(right.hp),
      endHpPercent: Math.round(clamp((right.hp / right.maxHp) * 100, 0, 100))
    },
    winnerUserId: winner.userId,
    loserUserId: loser.userId,
    winnerSide: leftWins ? 'ATTACKER' : 'DEFENDER',
    ultimateDisabled: true
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
    survivor: survivor ? fighterPayload(survivor, false) : null,
    ultimateDisabled: true
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
  const week = weekKey();

  if (path === 'admin/captain/settings') {
    if (!admin) return deps.json({ error: '관리자 권한이 필요합니다.' }, 403);
    if (request.method === 'PATCH') {
      try {
        const body = await deps.readBody(request);
        const rewardInput = body && typeof body.rewards === 'object' && body.rewards ? body.rewards : config.rewards;
        const participation = rewardInput && typeof rewardInput.participation === 'object' ? rewardInput.participation : {};
        const cleanParticipation = {};
        for (const key of ['coin', 'shards', 'NORMAL_CUBE', 'ADVANCED_CUBE', 'PREMIUM_CUBE']) {
          cleanParticipation[key] = Math.max(0, Math.floor(Number(participation[key] || 0)));
        }
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
          rewards: { ...config.rewards, ...rewardInput, participation: cleanParticipation }
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
    const registrations = (await env.DB.prepare(`
      SELECT r.*,u.nickname
      FROM captain_registrations r
      JOIN users u ON u.id=r.user_id
      WHERE r.week_key=?
      ORDER BY r.id DESC
    `).bind(week).all()).results;
    const teamRows = (await env.DB.prepare('SELECT * FROM captain_teams WHERE week_key=? ORDER BY score DESC,wins DESC,id')
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
    return deps.json({ weekKey: week, registrations, teams, logs });
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
    await env.DB.prepare('INSERT OR IGNORE INTO captain_week_resets(week_key,executed_by) VALUES(?,?)')
      .bind(week, user.id).run();
    return deps.json({ ok: true, weekKey: week, note: '주차 키 기반으로 새 주차 데이터가 자동 분리됩니다. 기존 기록은 보존됩니다.' });
  }

  if (config.mode === 'OFF') return deps.json({ error: '현재 대장전이 중지되어 있습니다.' }, 503);
  if (config.mode === 'TEST' && !admin) return deps.json({ error: '대장전 테스트 중입니다.' }, 403);
  if (config.mode === 'TEST' && admin && !config.adminTestParticipation) return deps.json({ error: '운영자 테스트 참여가 비활성화되어 있습니다.' }, 403);

  if (path === 'captain/register' && request.method === 'POST') {
    if (admin && config.mode === 'ON') return deps.json({ error: '운영 계정은 정규 랭킹에서 제외됩니다. CMS에서 TEST 모드로 전환해 테스트하세요.' }, 403);
    const last = await env.DB.prepare(`
      SELECT cooldown_until
      FROM captain_registrations
      WHERE user_id=? AND cooldown_until IS NOT NULL
      ORDER BY id DESC LIMIT 1
    `).bind(user.id).first();
    if (last?.cooldown_until && Date.parse(last.cooldown_until.replace(' ', 'T') + 'Z') > Date.now()) {
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
      if (receipt.response) return deps.json({ ...receipt.response, replayed: true });
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
        ultimateDisabled: true
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
          JSON.stringify({ rounds: match.rounds, survivor: match.survivor, ultimateDisabled: true })
        ),
        env.DB.prepare(`
          UPDATE captain_match_receipts_v3
          SET status='DONE',response_json=?,error_text=NULL,updated_at=CURRENT_TIMESTAMP
          WHERE request_id=?
        `).bind(JSON.stringify(response), requestId)
      ]);

      response.energy = await energy(env, user.id, week, config);
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
    return deps.json({ weekKey: week, ranking });
  }

  if (path === 'captain/reward/claim' && request.method === 'POST') {
    if (!mine) return deps.json({ error: '편성된 팀이 없습니다.' }, 409);
    const body = await deps.readBody(request);
    const type = String(body.type || 'PARTICIPATION').toUpperCase();
    let reward;
    let key;

    if (type === 'PARTICIPATION') {
      reward = config.rewards.participation;
      key = 'participation';
    } else {
      const rows = (await env.DB.prepare('SELECT id FROM captain_teams WHERE week_key=? ORDER BY score DESC,wins DESC,losses ASC,id')
        .bind(week).all()).results;
      const rank = rows.findIndex(row => Number(row.id) === Number(mine.id)) + 1;
      const rankReward = (config.rewards.ranks || []).find(item => rank >= Number(item.from) && rank <= Number(item.to));
      if (!rankReward) return deps.json({ error: '현재 순위에 해당하는 보상이 없습니다.' }, 404);
      reward = rankReward;
      key = `rank-${rankReward.from}-${rankReward.to}`;
    }

    const inserted = await env.DB.prepare(`
      INSERT OR IGNORE INTO captain_reward_claims(week_key,user_id,reward_type,reward_key,reward_json)
      VALUES(?,?,?,?,?)
    `).bind(week, user.id, type, key, JSON.stringify(reward)).run();
    if (!inserted.meta.changes) return deps.json({ error: '이미 수령한 보상입니다.' }, 409);
    return deps.json({ ok: true, reward: await grantReward(env, user.id, reward, 'CAPTAIN_BATTLE') });
  }

  return deps.json({ error: '대장전 API를 찾을 수 없습니다.' }, 404);
}
