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
  description: '저장된 PvE 덱으로 역할별 봉인 보스와 전투하고, 서버 전체가 파괴·수호·정화 세 봉인을 완성하는 공동 보스 콘텐츠입니다.',
  startsAt: null,
  endsAt: null,
  dailyAttempts: 5,
  rechargeMinutes: 60,
  targets: { attack: 20000000, guard: 16000000, purify: 14000000 },
  multipliers: { attack: 100, guard: 90, purify: 85 },
  battlePowers: { attack: 12000, guard: 11000, purify: 10000 },
  lowestRoleBonusPercent: 20,
  defeatContributionPercent: 10,
  attemptReward: { coin: 100, shards: 1 },
  clearReward: { coin: 2000, shards: 50 },
  rankRewards: {
    enabled: false,
    rewardOnFailure: true,
    tiers: [
      { startRank: 1, endRank: 1, coin: 0, premiumCube: 0, equipmentBox: 0 },
      { startRank: 2, endRank: 3, coin: 0, premiumCube: 0, equipmentBox: 0 },
      { startRank: 4, endRank: 10, coin: 0, premiumCube: 0, equipmentBox: 0 }
    ]
  },
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

const RANK_REWARD_CODES = {
  premiumCube: 'PREMIUM_CUBE',
  equipmentBox: 'EQUIPMENT_SUPPLY_BOX'
};

function cleanRankRewardTier(raw = {}, index = 0) {
  const startRank = clampInt(raw.startRank, index + 1, 1, 1000000);
  const endRank = clampInt(raw.endRank, startRank, startRank, 1000000);
  return {
    startRank,
    endRank,
    coin: clampInt(raw.coin, 0, 0, 1000000000),
    premiumCube: clampInt(raw.premiumCube, 0, 0, 1000000),
    equipmentBox: clampInt(raw.equipmentBox, 0, 0, 1000000)
  };
}

function cleanRankRewards(raw = {}) {
  const source = Array.isArray(raw.tiers) ? raw.tiers : DEFAULT_SETTINGS.rankRewards.tiers;
  const tiers = source.slice(0, 50).map(cleanRankRewardTier).sort((a, b) => a.startRank - b.startRank || a.endRank - b.endRank);
  return {
    enabled: raw.enabled === true,
    rewardOnFailure: raw.rewardOnFailure !== false,
    tiers
  };
}

function rankRewardValue(tier = {}) {
  return Number(tier.coin || 0) + Number(tier.premiumCube || 0) + Number(tier.equipmentBox || 0);
}

function validateRankRewards(rankRewards) {
  if (!rankRewards?.enabled) return;
  if (!Array.isArray(rankRewards.tiers) || !rankRewards.tiers.length) throw new Error('공헌도 순위 보상 구간을 하나 이상 추가하세요.');
  let previousEnd = 0;
  let payable = 0;
  for (const tier of rankRewards.tiers) {
    if (tier.startRank <= previousEnd) throw new Error('공헌도 순위 보상 구간이 서로 겹칩니다.');
    if (tier.endRank < tier.startRank) throw new Error('공헌도 순위 보상 종료 순위를 확인하세요.');
    previousEnd = tier.endRank;
    if (rankRewardValue(tier) > 0) payable++;
  }
  if (!payable) throw new Error('공헌도 순위 보상 품목과 수량을 하나 이상 설정하세요.');
}

function cleanSettings(raw = {}) {
  const base = DEFAULT_SETTINGS;
  const targets = raw.targets || {};
  const multipliers = raw.multipliers || {};
  const battlePowers = raw.battlePowers || {};
  const attemptReward = raw.attemptReward || {};
  const clearReward = raw.clearReward || {};
  const mode = String(raw.mode || base.mode).toUpperCase();
  return {
    mode: ['OFF', 'ON', 'TEST'].includes(mode) ? mode : base.mode,
    title: cleanText(raw.title, base.title, 60),
    bossName: cleanText(raw.bossName, base.bossName, 80),
    bossImage: cleanText(raw.bossImage, base.bossImage, 1000).replace(/\\/g, '/'),
    description: cleanText(raw.description, base.description, 300),
    startsAt: cleanDate(raw.startsAt),
    endsAt: cleanDate(raw.endsAt),
    dailyAttempts: clampInt(raw.dailyAttempts, base.dailyAttempts, 1, 30),
    rechargeMinutes: clampInt(raw.rechargeMinutes, base.rechargeMinutes, 1, 1440),
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
    battlePowers: {
      attack: clampInt(battlePowers.attack, base.battlePowers.attack, 1, 2000000000),
      guard: clampInt(battlePowers.guard, base.battlePowers.guard, 1, 2000000000),
      purify: clampInt(battlePowers.purify, base.battlePowers.purify, 1, 2000000000)
    },
    lowestRoleBonusPercent: clampInt(raw.lowestRoleBonusPercent, base.lowestRoleBonusPercent, 0, 500),
    defeatContributionPercent: clampInt(raw.defeatContributionPercent, base.defeatContributionPercent, 0, 100),
    attemptReward: {
      coin: clampInt(attemptReward.coin, base.attemptReward.coin, 0, 100000000),
      shards: clampInt(attemptReward.shards, base.attemptReward.shards, 0, 1000000)
    },
    clearReward: {
      coin: clampInt(clearReward.coin, base.clearReward.coin, 0, 100000000),
      shards: clampInt(clearReward.shards, base.clearReward.shards, 0, 1000000)
    },
    rankRewards: cleanRankRewards(raw.rankRewards || base.rankRewards),
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

async function ensureFoundation(env, deps = {}) {
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
        daily_attempts INTEGER NOT NULL DEFAULT 5,
        recharge_minutes INTEGER NOT NULL DEFAULT 60,
        attack_target INTEGER NOT NULL DEFAULT 1,
        guard_target INTEGER NOT NULL DEFAULT 1,
        purify_target INTEGER NOT NULL DEFAULT 1,
        attack_progress INTEGER NOT NULL DEFAULT 0,
        guard_progress INTEGER NOT NULL DEFAULT 0,
        purify_progress INTEGER NOT NULL DEFAULT 0,
        attack_multiplier INTEGER NOT NULL DEFAULT 100,
        guard_multiplier INTEGER NOT NULL DEFAULT 90,
        purify_multiplier INTEGER NOT NULL DEFAULT 85,
        attack_battle_power INTEGER NOT NULL DEFAULT 12000,
        guard_battle_power INTEGER NOT NULL DEFAULT 11000,
        purify_battle_power INTEGER NOT NULL DEFAULT 10000,
        defeat_contribution_percent INTEGER NOT NULL DEFAULT 10,
        lowest_bonus_percent INTEGER NOT NULL DEFAULT 20,
        attempt_coin INTEGER NOT NULL DEFAULT 0,
        attempt_shards INTEGER NOT NULL DEFAULT 0,
        clear_coin INTEGER NOT NULL DEFAULT 0,
        clear_shards INTEGER NOT NULL DEFAULT 0,
        rank_rewards_json TEXT NOT NULL DEFAULT '{}',
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
        attempt_charges INTEGER NOT NULL DEFAULT -1,
        last_recharged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        total_attempts INTEGER NOT NULL DEFAULT 0,
        attack_contribution INTEGER NOT NULL DEFAULT 0,
        guard_contribution INTEGER NOT NULL DEFAULT 0,
        purify_contribution INTEGER NOT NULL DEFAULT 0,
        total_contribution INTEGER NOT NULL DEFAULT 0,
        last_contribution_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
        boss_power INTEGER NOT NULL DEFAULT 0,
        contribution INTEGER NOT NULL DEFAULT 0,
        bonus_percent INTEGER NOT NULL DEFAULT 0,
        battle_result TEXT NOT NULL DEFAULT '',
        ultimate_damage INTEGER NOT NULL DEFAULT 0,
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
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS seal_battle_rank_claims(
        event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        final_rank INTEGER NOT NULL,
        total_contribution INTEGER NOT NULL DEFAULT 0,
        reward_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'PENDING',
        claimed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(event_id,user_id)
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_seal_events_status ON seal_battle_events(status,id DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_seal_progress_event_total ON seal_battle_user_progress(event_id,total_attempts DESC,updated_at DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_seal_rank_claim_status_v1288 ON seal_battle_rank_claims(user_id,status,event_id DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_seal_receipts_cleanup ON seal_battle_action_receipts(status,created_at,id)'),
      env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('seal_battle_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(DEFAULT_SETTINGS)),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1283_seal_battle','1',CURRENT_TIMESTAMP)")
    ]);

    const additions = [
      ['seal_battle_events','attack_battle_power','INTEGER NOT NULL DEFAULT 12000'],
      ['seal_battle_events','guard_battle_power','INTEGER NOT NULL DEFAULT 11000'],
      ['seal_battle_events','purify_battle_power','INTEGER NOT NULL DEFAULT 10000'],
      ['seal_battle_events','recharge_minutes','INTEGER NOT NULL DEFAULT 60'],
      ['seal_battle_events','defeat_contribution_percent','INTEGER NOT NULL DEFAULT 10'],
      ['seal_battle_events','rank_rewards_json',"TEXT NOT NULL DEFAULT '{}'"],
      ['seal_battle_user_progress','attempt_charges','INTEGER NOT NULL DEFAULT -1'],
      ['seal_battle_user_progress','total_contribution','INTEGER NOT NULL DEFAULT 0'],
      ['seal_battle_user_progress','last_contribution_at',"TEXT NOT NULL DEFAULT ''"],
      ['seal_battle_user_progress','last_recharged_at',"TEXT NOT NULL DEFAULT ''"],
      ['seal_battle_action_receipts','boss_power','INTEGER NOT NULL DEFAULT 0'],
      ['seal_battle_action_receipts','battle_result',"TEXT NOT NULL DEFAULT ''"],
      ['seal_battle_action_receipts','ultimate_damage','INTEGER NOT NULL DEFAULT 0']
    ];
    for (const [table, column, definition] of additions) {
      const exists = typeof deps.columnExists === 'function' ? await deps.columnExists(env, table, column) : false;
      if (!exists) {
        try { await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run(); }
        catch (error) {
          if (!/duplicate column|already exists/i.test(String(error?.message || error))) throw error;
        }
      }
    }
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1285_seal_battle_combat','1',CURRENT_TIMESTAMP)").run();

    const v1287 = await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1287_seal_attempt_recharge'").first();
    if (String(v1287?.value || '') !== '1') {
      const stored = await env.DB.prepare("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'").first();
      const migrated = cleanSettings({
        ...safeJson(stored?.value, {}),
        dailyAttempts: 5,
        rechargeMinutes: 60,
        defeatContributionPercent: 10
      });
      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('seal_battle_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(migrated)),
        env.DB.prepare(`UPDATE seal_battle_events SET daily_attempts=5,recharge_minutes=60,defeat_contribution_percent=10,updated_at=CURRENT_TIMESTAMP WHERE status='ACTIVE'`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1287_seal_attempt_recharge','1',CURRENT_TIMESTAMP)")
      ]);
    }
    try {
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_seal_progress_rank_v1288 ON seal_battle_user_progress(event_id,total_contribution DESC,total_attempts DESC,last_contribution_at ASC,user_id ASC)').run();
    } catch (error) {
      if (!/no such column/i.test(String(error?.message || error))) throw error;
    }
    const v1288 = await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1288_seal_rank_rewards'").first();
    if (String(v1288?.value || '') !== '1') {
      const stored = await env.DB.prepare("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'").first();
      const migrated = cleanSettings(safeJson(stored?.value, {}));
      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('seal_battle_settings_v1',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(migrated)),
        env.DB.prepare(`UPDATE seal_battle_user_progress SET total_contribution=attack_contribution+guard_contribution+purify_contribution,last_contribution_at=CASE WHEN COALESCE(last_contribution_at,'')='' THEN updated_at ELSE last_contribution_at END WHERE total_contribution<>(attack_contribution+guard_contribution+purify_contribution) OR COALESCE(last_contribution_at,'')=''`),
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('PREMIUM_CUBE','프리미엄 큐브','PREMIUM REWARD CUBE','MA·FUR·LIMITED 등급 카드가 등장하는 최고급 보상 큐브입니다.','CUBE','PREMIUM','assets/ui/packs/premium-cube.png',30,1)"),
        env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('EQUIPMENT_SUPPLY_BOX','장비 보급상자','EQUIPMENT SUPPLY BOX','장비·카드 조각·코인 중 하나를 획득합니다.','SUPPLY_BOX','HIGH','assets/ui/packs/supply-high.jpeg',35,1)"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1288_seal_rank_rewards','1',CURRENT_TIMESTAMP)")
      ]);
    }
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
  validateRankRewards(clean.rankRewards);
  const serialized = JSON.stringify(clean);
  await env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at)
    VALUES('seal_battle_settings_v1',?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`)
    .bind(serialized).run();

  // 저장 직후 DB에서 다시 읽어 실제 반영값을 검증한다. 불일치 시 성공 응답을 보내지 않는다.
  const storedRow = await env.DB.prepare("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'").first();
  const stored = cleanSettings(safeJson(storedRow?.value, {}));
  if (JSON.stringify(stored) !== serialized) {
    throw new Error('봉인전 설정 저장 검증에 실패했습니다. 잠시 후 다시 시도하세요.');
  }
  return stored;
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
      multiplier: Number(row[`${role.key.toLowerCase()}_multiplier`] || 100),
      battlePower: Number(row[`${role.key.toLowerCase()}_battle_power`] || DEFAULT_SETTINGS.battlePowers[role.key.toLowerCase()] || 1)
    };
  }
  return {
    id: Number(row.id),
    eventKey: row.event_key,
    title: row.title,
    bossName: row.boss_name,
    bossImage: String(row.boss_image || '').replace(/\\/g, '/'),
    description: row.description || '',
    status: String(row.status || 'ENDED').toUpperCase(),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    dailyAttempts: Number(row.daily_attempts || 5),
    maxAttempts: Number(row.daily_attempts || 5),
    rechargeMinutes: Number(row.recharge_minutes || 60),
    lowestRoleBonusPercent: Number(row.lowest_bonus_percent || 0),
    defeatContributionPercent: Number(row.defeat_contribution_percent ?? 10),
    attemptReward: { coin: Number(row.attempt_coin || 0), shards: Number(row.attempt_shards || 0) },
    clearReward: { coin: Number(row.clear_coin || 0), shards: Number(row.clear_shards || 0) },
    rankRewards: cleanRankRewards(safeJson(row.rank_rewards_json, {})),
    roles,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clearedAt: row.cleared_at || null,
    endedAt: row.ended_at || null,
    failureRoleKeys: Object.values(roles).filter(role => !role.completed).map(role => role.key)
  };
}

async function refreshExpiredEvent(env) {
  await env.DB.prepare(`UPDATE seal_battle_events
    SET status=CASE
      WHEN attack_progress>=attack_target AND guard_progress>=guard_target AND purify_progress>=purify_target THEN 'CLEARED'
      ELSE 'FAILED'
    END,
    cleared_at=CASE
      WHEN attack_progress>=attack_target AND guard_progress>=guard_target AND purify_progress>=purify_target THEN COALESCE(cleared_at,CURRENT_TIMESTAMP)
      ELSE cleared_at
    END,
    ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
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
  if (settings.mode === 'TEST' && String(user?.role || '').toUpperCase() !== 'OWNER') {
    return { open: false, code: 'TEST_MODE', message: '현재 봉인전 테스트 운영 중입니다.' };
  }
  if (event.status === 'CLEARED') return { open: false, code: 'CLEARED', message: '세 개의 봉인이 모두 완성되었습니다.' };
  if (event.status === 'FAILED') return { open: false, code: 'FAILED', message: '제한 시간 안에 모든 봉인을 완성하지 못해 보스 봉인에 실패했습니다.' };
  if (event.status !== 'ACTIVE') return { open: false, code: 'ENDED', message: '종료된 봉인전입니다.' };
  const now = Date.now();
  if (event.startsAt && Date.parse(event.startsAt) > now) return { open: false, code: 'NOT_STARTED', message: '봉인전 시작 전입니다.' };
  if (event.endsAt && Date.parse(event.endsAt) <= now) return { open: false, code: 'FAILED', message: '봉인 제한 시간이 종료되었습니다.' };
  return { open: true, code: 'OPEN', message: '역할을 선택해 봉인 보스와 전투할 수 있습니다.' };
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

function sqlTimestamp(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function publicProgress(row, dayKey, event) {
  const maxAttempts = Math.max(1, Number(event?.maxAttempts || event?.dailyAttempts || 5));
  const rechargeMinutes = Math.max(1, Number(event?.rechargeMinutes || 60));
  const sameDay = row && String(row.day_key) === dayKey;
  const attemptsToday = sameDay ? Number(row.attempts_today || 0) : 0;
  const storedCharges = Number(row?.attempt_charges);
  const availableAttempts = row
    ? Math.max(0, Math.min(maxAttempts, Number.isFinite(storedCharges) && storedCharges >= 0 ? storedCharges : maxAttempts))
    : maxAttempts;
  const lastRechargeMs = row?.last_recharged_at ? Date.parse(String(row.last_recharged_at).replace(' ', 'T') + (String(row.last_recharged_at).includes('Z') ? '' : 'Z')) : NaN;
  const nextRechargeAt = availableAttempts >= maxAttempts || !Number.isFinite(lastRechargeMs)
    ? null
    : new Date(lastRechargeMs + rechargeMinutes * 60000).toISOString();
  const totalContribution = Number(row?.total_contribution ?? (Number(row?.attack_contribution || 0) + Number(row?.guard_contribution || 0) + Number(row?.purify_contribution || 0)));
  return {
    attemptsToday,
    availableAttempts,
    remainingAttempts: availableAttempts,
    maxAttempts,
    rechargeMinutes,
    nextRechargeAt,
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
    COALESCE(SUM(total_contribution),0) AS total_contribution
    FROM seal_battle_user_progress WHERE event_id=? AND total_attempts>0`).bind(eventId).first();
  return {
    participants: Number(row?.participants || 0),
    attempts: Number(row?.attempts || 0),
    totalContribution: Number(row?.total_contribution || 0)
  };
}

function publicRankReward(reward = {}) {
  return {
    coin: Math.max(0, Number(reward.coin || 0)),
    premiumCube: Math.max(0, Number(reward.premiumCube || 0)),
    equipmentBox: Math.max(0, Number(reward.equipmentBox || 0))
  };
}

function rankRewardTierForRank(event, rank) {
  if (!event?.rankRewards?.enabled || rank < 1) return null;
  return event.rankRewards.tiers.find(tier => rank >= tier.startRank && rank <= tier.endRank && rankRewardValue(tier) > 0) || null;
}

function rankRewardEventEligible(event) {
  if (!event?.rankRewards?.enabled) return false;
  if (!['CLEARED', 'FAILED', 'ENDED'].includes(String(event.status || '').toUpperCase())) return false;
  if (event.status === 'FAILED' && !event.rankRewards.rewardOnFailure) return false;
  return true;
}

async function finalRankForProgress(env, eventId, progress) {
  if (!progress || Number(progress.total_attempts || 0) < 1) return 0;
  const total = Number(progress.total_contribution ?? (Number(progress.attack_contribution || 0) + Number(progress.guard_contribution || 0) + Number(progress.purify_contribution || 0)));
  const attempts = Number(progress.total_attempts || 0);
  const updatedAt = String(progress.last_contribution_at || progress.updated_at || '9999-12-31 23:59:59');
  const userId = Number(progress.user_id || 0);
  const row = await env.DB.prepare(`SELECT 1+COUNT(*) AS final_rank
    FROM seal_battle_user_progress p
    WHERE p.event_id=? AND p.total_attempts>0 AND (
      p.total_contribution>? OR
      (p.total_contribution=? AND p.total_attempts>?) OR
      (p.total_contribution=? AND p.total_attempts=? AND p.last_contribution_at<?) OR
      (p.total_contribution=? AND p.total_attempts=? AND p.last_contribution_at=? AND p.user_id<?)
    )`).bind(eventId, total, total, attempts, total, attempts, updatedAt, total, attempts, updatedAt, userId).first();
  return Math.max(1, Number(row?.final_rank || 1));
}

async function rankRewardPreview(env, event, userId) {
  if (!rankRewardEventEligible(event)) return null;
  const progress = await userProgress(env, event.id, userId);
  if (!progress || Number(progress.total_attempts || 0) < 1) return null;
  const finalRank = await finalRankForProgress(env, event.id, progress);
  const tier = rankRewardTierForRank(event, finalRank);
  if (!tier) return null;
  const claim = await env.DB.prepare('SELECT status,reward_json,final_rank,total_contribution FROM seal_battle_rank_claims WHERE event_id=? AND user_id=?')
    .bind(event.id, userId).first();
  const reward = claim?.reward_json ? publicRankReward(safeJson(claim.reward_json, tier)) : publicRankReward(tier);
  return {
    eventId: event.id,
    eventKey: event.eventKey,
    title: event.title,
    bossName: event.bossName,
    eventStatus: event.status,
    finalRank: Number(claim?.final_rank || finalRank),
    totalContribution: Number(claim?.total_contribution ?? progress.total_contribution ?? 0),
    tier: { startRank: tier.startRank, endRank: tier.endRank },
    reward,
    eligible: true,
    claimed: String(claim?.status || '') === 'COMPLETED',
    processing: String(claim?.status || '') === 'CLAIMING'
  };
}

async function pendingRankReward(env, userId, excludeEventId = 0) {
  const rows = (await env.DB.prepare(`SELECT e.* FROM seal_battle_events e
    JOIN seal_battle_user_progress p ON p.event_id=e.id AND p.user_id=? AND p.total_attempts>0
    LEFT JOIN seal_battle_rank_claims c ON c.event_id=e.id AND c.user_id=?
    WHERE e.id<>? AND e.status IN ('CLEARED','FAILED','ENDED') AND COALESCE(c.status,'')<>'COMPLETED'
    ORDER BY e.id DESC LIMIT 12`).bind(userId, userId, Number(excludeEventId || 0)).all()).results;
  for (const row of rows) {
    const preview = await rankRewardPreview(env, normalizeEvent(row), userId);
    if (preview && !preview.claimed) return preview;
  }
  return null;
}

function publicBattleCards(cards = []) {
  return (Array.isArray(cards) ? cards : []).map(card => ({
    id: String(card.id || ''),
    title: String(card.title || card.card_title || '카드'),
    rarity: String(card.rarity || card.grade || 'C').toUpperCase(),
    grade: String(card.grade || card.rarity || 'C').toUpperCase(),
    image: String(card.image || card.image_url || ''),
    powerType: String(card.powerType || card.power_type || ''),
    breakthroughLevel: Number(card.breakthroughLevel ?? card.breakthrough_level ?? 0),
    power: Math.max(0, Number(card.power || 0)),
    uniqueAbility: card.uniqueAbility || null,
    uniqueEffects: card.uniqueEffects || card.unique_effects || null
  }));
}

async function deckState(deps, env, userId) {
  try {
    const deck = await deps.raidDeckPower(env, userId, null, 'PVE');
    return { ready: true, power: Number(deck.power || 0), cardIds: deck.ids || [], cards: publicBattleCards(deck.cards) };
  } catch (error) {
    return { ready: false, power: 0, cardIds: [], cards: [], error: String(error?.message || '저장된 PvE 덱 5장이 필요합니다.') };
  }
}

async function combatDeckState(deps, env, userId, bossPower) {
  const deck = await deps.raidDeckPower(env, userId, null, 'PVE');
  const cards = Array.isArray(deck.cards) ? deck.cards : [];
  const runtime = deck.unique?.enabled && typeof deps.resolveUniqueBattleRuntime === 'function'
    ? deps.resolveUniqueBattleRuntime(deck.unique, { mode: 'PVE', opponentPower: bossPower })
    : null;
  const basePower = Math.max(0, Number(runtime?.effectivePower ?? deck.basePower ?? deck.power ?? 0));
  const synergyMultiplier = 1 + Number(deck.synergy?.totals?.attackPercent || 0) / 100 + Number(deck.synergy?.totals?.bossDamagePercent || 0) / 100;
  const cardPower = Math.max(0, Math.floor(basePower * synergyMultiplier));
  const playerPower = Math.max(0, cardPower + Number(deck.characterBonus?.pve || 0));
  // 봉인전은 유저/보스 궁극기를 모두 사용하지 않는다.
  // 기존 PvE 덱의 카드 전투력·장비·시너지·고유 능력만 승패 계산에 반영한다.
  return {
    ...deck,
    cards: publicBattleCards(cards),
    basePower,
    cardPower,
    playerPower,
    totalBattleDamage: playerPower,
    ultimateDamage: 0,
    activatedUltimate: null,
    ultimateSourceCard: null,
    uniqueAbility: typeof deps.uniqueBattleResponsePayload === 'function'
      ? deps.uniqueBattleResponsePayload(deck.unique, runtime)
      : null
  };
}

async function refreshAttemptCharges(env, event, userId, dayKey, { create = false } = {}) {
  const maxAttempts = Math.max(1, Number(event?.maxAttempts || event?.dailyAttempts || 5));
  const rechargeMinutes = Math.max(1, Number(event?.rechargeMinutes || 60));
  const now = Date.now();
  const nowSql = sqlTimestamp(now);
  if (create) {
    await env.DB.prepare(`INSERT OR IGNORE INTO seal_battle_user_progress(
      event_id,user_id,day_key,attempts_today,attempt_charges,last_recharged_at,total_attempts
    ) VALUES(?,?,?,0,?,?,0)`).bind(event.id, userId, dayKey, maxAttempts, nowSql).run();
  }
  const row = await userProgress(env, event.id, userId);
  if (!row) return null;

  const sameDay = String(row.day_key || '') === dayKey;
  const attemptsToday = sameDay ? Math.max(0, Number(row.attempts_today || 0)) : 0;
  const originalCharges = Number(row.attempt_charges);
  const originalLast = String(row.last_recharged_at || '');
  let charges = originalCharges;
  let last = Date.parse(originalLast.replace(' ', 'T') + (originalLast.includes('Z') ? '' : 'Z'));
  if (!Number.isFinite(last)) last = now;
  if (!Number.isFinite(charges) || charges < 0) charges = Math.max(0, maxAttempts - attemptsToday);
  charges = Math.max(0, Math.min(maxAttempts, Math.floor(charges)));

  if (charges < maxAttempts) {
    const interval = rechargeMinutes * 60000;
    const gained = Math.max(0, Math.floor((now - last) / interval));
    if (gained > 0) {
      charges = Math.min(maxAttempts, charges + gained);
      last = charges >= maxAttempts ? now : last + gained * interval;
    }
  }

  const nextLastSql = sqlTimestamp(last);
  const normalizedOriginalLast = Number.isFinite(Date.parse(originalLast.replace(' ', 'T') + (originalLast.includes('Z') ? '' : 'Z')))
    ? sqlTimestamp(Date.parse(originalLast.replace(' ', 'T') + (originalLast.includes('Z') ? '' : 'Z')))
    : '';
  const needsUpdate = !sameDay
    || attemptsToday !== Number(row.attempts_today || 0)
    || charges !== originalCharges
    || nextLastSql !== normalizedOriginalLast;
  if (needsUpdate) {
    await env.DB.prepare(`UPDATE seal_battle_user_progress SET
      day_key=?,attempts_today=?,attempt_charges=?,last_recharged_at=?,updated_at=CURRENT_TIMESTAMP
      WHERE event_id=? AND user_id=?`).bind(dayKey, attemptsToday, charges, nextLastSql, event.id, userId).run();
  }
  return { charges, maxAttempts, rechargeMinutes, lastRechargedAt: last };
}

async function reserveAttempt(env, event, userId, dayKey) {
  const state = await refreshAttemptCharges(env, event, userId, dayKey, { create: true });
  if (!state || state.charges < 1) return { reserved: false, state };
  const nowSql = sqlTimestamp(Date.now());
  const result = await env.DB.prepare(`UPDATE seal_battle_user_progress SET
    attempt_charges=attempt_charges-1,
    attempts_today=attempts_today+1,
    last_recharged_at=CASE WHEN attempt_charges>=? THEN ? ELSE last_recharged_at END,
    updated_at=CURRENT_TIMESTAMP
    WHERE event_id=? AND user_id=? AND attempt_charges>=1`)
    .bind(state.maxAttempts, nowSql, event.id, userId).run();
  return { reserved: Number(result?.meta?.changes || 0) > 0, state };
}

async function releaseAttempt(env, event, userId, dayKey) {
  try {
    const maxAttempts = Math.max(1, Number(event?.maxAttempts || event?.dailyAttempts || 5));
    const nowSql = sqlTimestamp(Date.now());
    await env.DB.prepare(`UPDATE seal_battle_user_progress SET
      attempts_today=MAX(0,attempts_today-1),
      attempt_charges=MIN(?,attempt_charges+1),
      last_recharged_at=CASE WHEN attempt_charges+1>=? THEN ? ELSE last_recharged_at END,
      updated_at=CURRENT_TIMESTAMP
      WHERE event_id=? AND user_id=? AND day_key=?`)
      .bind(maxAttempts, maxAttempts, nowSql, event.id, userId, dayKey).run();
  } catch {}
}

async function statusPayload(env, deps, user, settings = null, eventRow = null) {
  settings ||= await loadSettings(env);
  eventRow ||= await currentEventRow(env);
  const event = normalizeEvent(eventRow);
  if (!event) return { settings: { mode: settings.mode }, event: null, availability: eventAvailability(null, settings, user), serverNow: new Date().toISOString() };
  const dayKey = kstDayKey();
  await refreshAttemptCharges(env, event, user.id, dayKey);
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
  const [rankReward, previousRankReward] = await Promise.all([
    rankRewardPreview(env, event, user.id),
    pendingRankReward(env, user.id, event.id)
  ]);
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
    rankReward,
    pendingRankReward: previousRankReward,
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
        WHERE c.status='COMPLETED' AND e.status IN ('ENDED','CLEARED','FAILED')
          AND COALESCE(e.ended_at,e.cleared_at,e.updated_at)<datetime('now',?)
        ORDER BY c.rowid ASC LIMIT 100
      )`).bind(`-${progressDays} days`),
      env.DB.prepare(`DELETE FROM seal_battle_rank_claims WHERE rowid IN (
        SELECT c.rowid FROM seal_battle_rank_claims c
        JOIN seal_battle_events e ON e.id=c.event_id
        WHERE c.status='COMPLETED' AND e.status IN ('ENDED','CLEARED','FAILED')
          AND COALESCE(e.ended_at,e.cleared_at,e.updated_at)<datetime('now',?)
        ORDER BY c.rowid ASC LIMIT 100
      )`).bind(`-${progressDays} days`),
      env.DB.prepare(`DELETE FROM seal_battle_user_progress WHERE rowid IN (
        SELECT p.rowid FROM seal_battle_user_progress p
        JOIN seal_battle_events e ON e.id=p.event_id
        WHERE e.status IN ('ENDED','CLEARED','FAILED')
          AND COALESCE(e.ended_at,e.cleared_at,e.updated_at)<datetime('now',?)
        ORDER BY p.rowid ASC LIMIT 100
      )`).bind(`-${progressDays} days`)
    ]);
  } catch (error) {
    console.error('seal battle cleanup failed', error);
  }
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
    total_contribution=total_contribution+?,
    last_role=?,last_contribution=?,last_contribution_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
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
        result: existing.battle_result || 'DONE',
        playerPower: Number(existing.deck_power || 0),
        deckPower: Number(existing.deck_power || 0),
        bossPower: Number(existing.boss_power || 0),
        contribution: Number(existing.contribution || 0),
        bonusPercent: Number(existing.bonus_percent || 0),
        ultimateDamage: Number(existing.ultimate_damage || 0),
        state: await statusPayload(env, deps, user, settings)
      });
    }
    return deps.json({ error: existing.status === 'FAILED' ? (existing.error_text || '실패한 요청입니다.') : '동일한 요청을 처리 중입니다.' }, 409);
  }

  const availability = eventAvailability(event, settings, user);
  if (!availability.open) return deps.json({ error: availability.message, code: availability.code }, 409);

  const bossPower = Math.max(1, Number(event.roles[role]?.battlePower || 1));
  let combat;
  try {
    combat = await combatDeckState(deps, env, user.id, bossPower);
  } catch (error) {
    return deps.json({ error: String(error?.message || '저장된 PvE 덱 5장이 필요합니다.') }, Number(error?.status || 400));
  }

  const dayKey = kstDayKey();
  const receiptInsert = await env.DB.prepare(`INSERT OR IGNORE INTO seal_battle_action_receipts(
    request_id,event_id,user_id,day_key,role,status
  ) VALUES(?,?,?,?,?,'PENDING')`).bind(requestId, event.id, user.id, dayKey, role).run();
  if (!Number(receiptInsert?.meta?.changes || 0)) return deps.json({ error: '동일한 요청을 처리 중입니다.' }, 409);
  const receiptId = Number(receiptInsert?.meta?.last_row_id || 0);

  const reservation = await reserveAttempt(env, event, user.id, dayKey);
  if (!reservation.reserved) {
    const waitText = `${Number(event.rechargeMinutes || 60)}분마다 1회 충전됩니다.`;
    await env.DB.prepare("UPDATE seal_battle_action_receipts SET status='FAILED',error_text=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=?")
      .bind(`봉인전 도전 횟수가 부족합니다. ${waitText}`, requestId).run();
    return deps.json({ error: `봉인전 도전 횟수가 부족합니다. ${waitText}`, code: 'NO_SEAL_ATTEMPT' }, 429);
  }

  const lowest = lowestRoleKeys(event);
  const bonusPercent = lowest.includes(role) ? Number(event.lowestRoleBonusPercent || 0) : 0;
  const multiplier = Number(event.roles[role]?.multiplier || 100);
  const result = Number(combat.playerPower || 0) >= bossPower ? 'WIN' : 'LOSE';
  const defeatPercent = Math.max(0, Math.min(100, Number(event.defeatContributionPercent ?? 10)));
  const rawContribution = Math.max(1, Math.floor(Number(combat.playerPower || 0) * multiplier / 100 * (1 + bonusPercent / 100)));
  const contribution = result === 'WIN'
    ? Math.min(2000000000, rawContribution)
    : defeatPercent > 0 ? Math.max(1, Math.min(2000000000, Math.floor(rawContribution * defeatPercent / 100))) : 0;
  const attemptCoin = Math.max(0, Number(event.attemptReward.coin || 0));
  const attemptShards = Math.max(0, Number(event.attemptReward.shards || 0));

  const statements = [
    env.DB.prepare(`UPDATE seal_battle_action_receipts SET status='AUTHORIZED',deck_power=?,boss_power=?,contribution=?,bonus_percent=?,battle_result=?,ultimate_damage=?,updated_at=CURRENT_TIMESTAMP
      WHERE request_id=? AND user_id=? AND status='PENDING' AND EXISTS(
        SELECT 1 FROM seal_battle_events WHERE id=? AND status='ACTIVE'
          AND (starts_at IS NULL OR datetime(starts_at)<=datetime('now'))
          AND (ends_at IS NULL OR datetime(ends_at)>datetime('now'))
      )`).bind(combat.playerPower, bossPower, contribution, bonusPercent, result, 0, requestId, user.id, event.id),
    env.DB.prepare(eventProgressSql(role)).bind(...eventProgressBindings(role, contribution, event.id, requestId)),
    env.DB.prepare(roleContributionUpdateSql(role)).bind(contribution, contribution, role, contribution, event.id, user.id, requestId),
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
    await releaseAttempt(env, event, user.id, dayKey);
    try {
      await env.DB.prepare("UPDATE seal_battle_action_receipts SET status='FAILED',error_text=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'")
        .bind(String(error?.message || error).slice(0, 300), requestId).run();
    } catch {}
    console.error('seal battle participation commit failed', error);
    return deps.json({ error: '봉인전 전투 결과 처리에 실패했습니다.' }, 500);
  }

  if (!Number(results?.[0]?.meta?.changes || 0)) {
    await releaseAttempt(env, event, user.id, dayKey);
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
    result,
    contribution,
    defeatContributionPercent: defeatPercent,
    playerPower: combat.playerPower,
    deckPower: combat.playerPower,
    cardPower: combat.cardPower,
    basePlayerPower: combat.basePower,
    totalBattleDamage: combat.totalBattleDamage,
    bossPower,
    cards: combat.cards,
    activatedUltimate: combat.activatedUltimate,
    ultimateDamage: combat.ultimateDamage,
    bonusDamage: combat.ultimateDamage,
    ultimateSourceCard: combat.ultimateSourceCard,
    uniqueAbility: combat.uniqueAbility,
    deckSynergy: combat.synergy,
    characterBonus: combat.characterBonus,
    bonusPercent,
    reward: { coin: attemptCoin, shards: attemptShards },
    boss: { name: event.bossName, image: event.bossImage, role, roleLabel: ROLE_META[role].label },
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

async function claimRankReward(env, deps, user, event) {
  if (!rankRewardEventEligible(event)) return deps.json({ error: '아직 공헌도 순위 보상을 받을 수 없습니다.' }, 409);
  const progress = await userProgress(env, event.id, user.id);
  if (!progress || Number(progress.total_attempts || 0) < 1) return deps.json({ error: '이번 봉인전 참여 기록이 없습니다.' }, 403);
  const finalRank = await finalRankForProgress(env, event.id, progress);
  const tier = rankRewardTierForRank(event, finalRank);
  if (!tier) return deps.json({ error: '해당 순위에 설정된 공헌도 보상이 없습니다.' }, 403);
  const reward = publicRankReward(tier);
  const totalContribution = Number(progress.total_contribution ?? 0);
  await env.DB.prepare(`INSERT OR IGNORE INTO seal_battle_rank_claims(
    event_id,user_id,final_rank,total_contribution,reward_json,status
  ) VALUES(?,?,?,?,?,'PENDING')`).bind(event.id, user.id, finalRank, totalContribution, JSON.stringify(reward)).run();

  const reserved = await env.DB.prepare(`UPDATE seal_battle_rank_claims SET status='CLAIMING',updated_at=CURRENT_TIMESTAMP
    WHERE event_id=? AND user_id=? AND (status='PENDING' OR (status='CLAIMING' AND updated_at<datetime('now','-5 minutes')))`)
    .bind(event.id, user.id).run();
  if (!Number(reserved?.meta?.changes || 0)) {
    const row = await env.DB.prepare('SELECT status FROM seal_battle_rank_claims WHERE event_id=? AND user_id=?').bind(event.id, user.id).first();
    if (row?.status === 'COMPLETED') return deps.json({ error: '이미 공헌도 순위 보상을 수령했습니다.' }, 409);
    return deps.json({ error: '공헌도 순위 보상을 처리 중입니다.' }, 409);
  }

  const claimGate = `EXISTS(SELECT 1 FROM seal_battle_rank_claims WHERE event_id=? AND user_id=? AND status='CLAIMING')`;
  const statements = [env.DB.prepare(`UPDATE seal_battle_rank_claims SET updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=? AND status='CLAIMING'`).bind(event.id, user.id)];
  if (reward.coin > 0) {
    statements.push(env.DB.prepare(`UPDATE users SET coin=coin+? WHERE id=? AND ${claimGate}`).bind(reward.coin, user.id, event.id, user.id));
    statements.push(env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
      SELECT id,?,coin,'SEAL_BATTLE_RANK' FROM users WHERE id=? AND ${claimGate}`).bind(reward.coin, user.id, event.id, user.id));
  }
  for (const [field, itemCode] of Object.entries(RANK_REWARD_CODES)) {
    const quantity = Math.max(0, Number(reward[field] || 0));
    if (!quantity) continue;
    statements.push(env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ${claimGate}
      ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
        unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`)
      .bind(user.id, itemCode, quantity, quantity, event.id, user.id));
    statements.push(env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT ?,?,?,i.quantity,'SEAL_BATTLE_RANK','SEAL_BATTLE',? FROM cnine_user_inventory i
      WHERE i.user_id=? AND i.item_code=? AND ${claimGate}`)
      .bind(user.id, itemCode, quantity, event.eventKey, user.id, itemCode, event.id, user.id));
  }
  statements.push(env.DB.prepare(`UPDATE seal_battle_rank_claims SET status='COMPLETED',claimed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE event_id=? AND user_id=? AND status='CLAIMING'`).bind(event.id, user.id));

  let results;
  try {
    results = await env.DB.batch(statements);
  } catch (error) {
    try { await env.DB.prepare("UPDATE seal_battle_rank_claims SET status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=? AND status='CLAIMING'").bind(event.id, user.id).run(); } catch {}
    console.error('seal battle rank reward commit failed', error);
    return deps.json({ error: '공헌도 순위 보상 지급에 실패했습니다.' }, 500);
  }
  if (!Number(results?.[0]?.meta?.changes || 0)) {
    try { await env.DB.prepare("UPDATE seal_battle_rank_claims SET status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND user_id=? AND status='CLAIMING'").bind(event.id, user.id).run(); } catch {}
    return deps.json({ error: '공헌도 순위 보상 상태가 변경되어 지급되지 않았습니다.' }, 409);
  }

  let balance = null;
  const itemBalances = {};
  try {
    balance = await env.DB.prepare('SELECT coin,card_shards FROM users WHERE id=?').bind(user.id).first();
    const codes = Object.values(RANK_REWARD_CODES).filter((code, index, array) => array.indexOf(code) === index);
    const placeholders = codes.map(() => '?').join(',');
    const rows = (await env.DB.prepare(`SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? AND item_code IN (${placeholders})`).bind(user.id, ...codes).all()).results;
    for (const row of rows) itemBalances[row.item_code] = Number(row.quantity || 0);
  } catch (error) {
    console.warn('seal battle rank reward balance refresh failed after commit', error);
  }
  return deps.json({
    ok: true,
    finalRank,
    totalContribution,
    reward,
    itemBalances,
    balances: balance ? { coin: Number(balance.coin || 0), cardShards: Number(balance.card_shards || 0) } : null
  });
}

async function rankings(env, eventId, userId = 0) {
  const event = normalizeEvent(await env.DB.prepare('SELECT * FROM seal_battle_events WHERE id=?').bind(eventId).first());
  const overall = (await env.DB.prepare(`SELECT p.user_id,u.nickname,p.total_attempts,
    p.attack_contribution,p.guard_contribution,p.purify_contribution,p.total_contribution,p.last_contribution_at
    FROM seal_battle_user_progress p JOIN users u ON u.id=p.user_id
    WHERE p.event_id=? AND p.total_attempts>0
    ORDER BY p.total_contribution DESC,p.total_attempts DESC,p.last_contribution_at ASC,p.user_id ASC LIMIT 50`).bind(eventId).all()).results
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const roleRanks = {};
  for (const role of Object.values(ROLE_META)) {
    roleRanks[role.key] = (await env.DB.prepare(`SELECT p.user_id,u.nickname,p.${role.userColumn} AS contribution,p.total_attempts
      FROM seal_battle_user_progress p JOIN users u ON u.id=p.user_id
      WHERE p.event_id=? AND p.${role.userColumn}>0
      ORDER BY p.${role.userColumn} DESC,p.updated_at ASC,p.user_id ASC LIMIT 20`).bind(eventId).all()).results
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }
  let myRank = null;
  if (userId) {
    const progress = await userProgress(env, eventId, userId);
    if (progress && Number(progress.total_attempts || 0) > 0) {
      myRank = {
        rank: await finalRankForProgress(env, eventId, progress),
        totalContribution: Number(progress.total_contribution || 0),
        totalAttempts: Number(progress.total_attempts || 0)
      };
    }
  }
  return {
    overall,
    roles: roleRanks,
    myRank,
    rankRewards: event?.rankRewards || cleanRankRewards({})
  };
}

async function adminOverview(env, settings) {
  const row = await currentEventRow(env);
  const event = normalizeEvent(row);
  const stats = event ? await eventStats(env, event.id) : { participants: 0, attempts: 0, totalContribution: 0 };
  const claims = event ? await env.DB.prepare("SELECT COUNT(*) AS total FROM seal_battle_clear_claims WHERE event_id=? AND status='COMPLETED'").bind(event.id).first() : null;
  const rankClaims = event ? await env.DB.prepare("SELECT COUNT(*) AS total FROM seal_battle_rank_claims WHERE event_id=? AND status='COMPLETED'").bind(event.id).first() : null;
  const history = (await env.DB.prepare(`SELECT id,event_key,title,boss_name,status,attack_target,guard_target,purify_target,
    attack_progress,guard_progress,purify_progress,created_at,cleared_at,ended_at
    FROM seal_battle_events ORDER BY id DESC LIMIT 10`).all()).results;
  return { settings, event, stats: { ...stats, clearClaims: Number(claims?.total || 0), rankClaims: Number(rankClaims?.total || 0) }, history };
}

async function adminStart(env, settings, admin) {
  const key = eventKey();
  await env.DB.batch([
    env.DB.prepare(`UPDATE seal_battle_events SET
      status=CASE WHEN attack_progress>=attack_target AND guard_progress>=guard_target AND purify_progress>=purify_target THEN 'CLEARED' ELSE 'FAILED' END,
      cleared_at=CASE WHEN attack_progress>=attack_target AND guard_progress>=guard_target AND purify_progress>=purify_target THEN COALESCE(cleared_at,CURRENT_TIMESTAMP) ELSE cleared_at END,
      ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
      WHERE status='ACTIVE'`),
    env.DB.prepare(`INSERT INTO seal_battle_events(
      event_key,title,boss_name,boss_image,description,status,starts_at,ends_at,daily_attempts,recharge_minutes,
      attack_target,guard_target,purify_target,attack_multiplier,guard_multiplier,purify_multiplier,
      attack_battle_power,guard_battle_power,purify_battle_power,defeat_contribution_percent,
      lowest_bonus_percent,attempt_coin,attempt_shards,clear_coin,clear_shards,rank_rewards_json,created_by
    ) VALUES(?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      key, settings.title, settings.bossName, settings.bossImage, settings.description,
      settings.startsAt, settings.endsAt, settings.dailyAttempts, settings.rechargeMinutes,
      settings.targets.attack, settings.targets.guard, settings.targets.purify,
      settings.multipliers.attack, settings.multipliers.guard, settings.multipliers.purify,
      settings.battlePowers.attack, settings.battlePowers.guard, settings.battlePowers.purify,
      settings.defeatContributionPercent,
      settings.lowestRoleBonusPercent, settings.attemptReward.coin, settings.attemptReward.shards,
      settings.clearReward.coin, settings.clearReward.shards, JSON.stringify(settings.rankRewards), admin.id
    )
  ]);
  return normalizeEvent(await env.DB.prepare('SELECT * FROM seal_battle_events WHERE event_key=?').bind(key).first());
}

export async function handleSealBattle({ path, request, env, deps }) {
  if (!path.startsWith('seal-battle') && !path.startsWith('admin/seal-battle')) return null;
  await ensureFoundation(env, deps);

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

  if (path === 'seal-battle/rank-reward' && request.method === 'POST') {
    const body = await deps.readBody(request);
    const requestedEventId = Math.max(0, Math.floor(Number(body.eventId || 0)));
    const eventRow = requestedEventId
      ? await env.DB.prepare('SELECT * FROM seal_battle_events WHERE id=?').bind(requestedEventId).first()
      : await currentEventRow(env);
    return claimRankReward(env, deps, user, normalizeEvent(eventRow));
  }

  if (path === 'seal-battle/rankings' && request.method === 'GET') {
    const event = normalizeEvent(await currentEventRow(env));
    if (!event) return deps.json({ event: null, overall: [], roles: {}, myRank: null, rankRewards: cleanRankRewards({}) });
    return deps.json({ event, ...(await rankings(env, event.id, user.id)) });
  }

  if (path === 'admin/seal-battle/overview' && request.method === 'GET') {
    return deps.json(await adminOverview(env, settings));
  }

  if (path === 'admin/seal-battle/settings' && request.method === 'PATCH') {
    const body = await deps.readBody(request);
    const next = await saveSettings(env, body.settings || body);
    await env.DB.prepare("UPDATE seal_battle_events SET boss_image=?,updated_at=CURRENT_TIMESTAMP WHERE status='ACTIVE'")
      .bind(next.bossImage).run();
    if (typeof deps.writeAdminLog === 'function') {
      await deps.writeAdminLog(env, admin, 'SEAL_BATTLE_SETTINGS_UPDATE', 'SEAL_BATTLE', 'settings', settings, next);
    }
    return deps.json({ ok: true, settings: next, overview: await adminOverview(env, next) });
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
      await env.DB.prepare(`UPDATE seal_battle_events SET status=CASE WHEN attack_progress>=attack_target AND guard_progress>=guard_target AND purify_progress>=purify_target THEN 'CLEARED' ELSE 'FAILED' END,cleared_at=CASE WHEN attack_progress>=attack_target AND guard_progress>=guard_target AND purify_progress>=purify_target THEN COALESCE(cleared_at,CURRENT_TIMESTAMP) ELSE cleared_at END,ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(active.id).run();
      if (typeof deps.writeAdminLog === 'function') await deps.writeAdminLog(env, admin, 'SEAL_BATTLE_END', 'SEAL_BATTLE', active.event_key, normalizeEvent(active), null);
      return deps.json({ ok: true, overview: await adminOverview(env, settings) });
    }
    return deps.json({ error: '지원하지 않는 봉인전 관리 작업입니다.' }, 400);
  }

  return deps.json({ error: '봉인전 API를 찾을 수 없습니다.' }, 404);
}
