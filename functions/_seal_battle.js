import {companionBattleOptions,companionSnapshotRows} from '../shared/companion-battle-snapshot-v1.mjs';
import {mercenarySnapshotPower} from './_mercenary_account.js';
import {collectionRewardCoin} from './_collection_bonuses.js';
import {accountRankAward} from './_account_rank.js';
import {buildAvatarMercenaryFighter,publicFighter} from './_battle_v2_preview.js';
import {avatarScaledPower} from '../shared/avatar-power-v1.mjs';
const ROLE_META = {
  ATTACK: { key: 'ATTACK', label: '파괴 봉인', shortLabel: '파괴', icon: '⚔', progressColumn: 'attack_progress', targetColumn: 'attack_target', userColumn: 'attack_contribution' },
  GUARD: { key: 'GUARD', label: '수호 봉인', shortLabel: '수호', icon: '◆', progressColumn: 'guard_progress', targetColumn: 'guard_target', userColumn: 'guard_contribution' },
  PURIFY: { key: 'PURIFY', label: '정화 봉인', shortLabel: '정화', icon: '✦', progressColumn: 'purify_progress', targetColumn: 'purify_target', userColumn: 'purify_contribution' }
};

const DEFAULT_SETTINGS = {
  mode: 'OFF',
  format: 'SEALS_BOSS',
  bossStage: { name: '봉인룡 네르가온', hp: null, battlePower: null },
  title: '봉인전',
  bossName: '심연에 봉인된 군주',
  bossImage: '',
  description: '저장된 PvE 덱으로 역할별 봉인 보스와 전투하고, 서버 전체가 파괴·수호·정화 세 봉인을 완성하는 공동 보스 콘텐츠입니다.',
  startsAt: null,
  endsAt: null,
  dailyAttempts: 5,
  rechargeMinutes: 60,
  minRewardAttempts: 25,
  targets: { attack: 20000000, guard: 16000000, purify: 14000000 },
  multipliers: { attack: 100, guard: 90, purify: 85 },
  battlePowers: { attack: 12000, guard: 11000, purify: 10000 },
  lowestRoleBonusPercent: 20,
  defeatContributionPercent: 10,
  attemptReward: { coin: 100, shards: 1 },
  clearReward: { coin: 2000, shards: 50, masterStar: 0 },
  rankRewards: { enabled: false, rewardOnFailure: false, tiers: [] },
  receiptRetentionDays: 14,
  progressRetentionDays: 90
};

// No gameplay coin-reward cap; retain only JavaScript's exact-integer boundary.
const SEAL_COIN_REWARD_MAX = Number.MAX_SAFE_INTEGER;
// Seal health is the role target; keep only the exact-integer storage boundary.
const SEAL_HEALTH_MAX = Number.MAX_SAFE_INTEGER;
const DRAGON_TABLE = 'seal_battle_dragon_events_v20261022';
const DRAGON_RECEIPTS = 'seal_battle_dragon_receipts_v20261022';
const DRAGON_ART = '/assets/ui/seal-battle/dragon-20261022';

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
  equipmentBox: 'EQUIPMENT_SUPPLY_BOX'
};

function cleanRankRewardTier(raw = {}, index = 0) {
  const startRank = clampInt(raw.startRank, index + 1, 1, 1000000);
  const endRank = clampInt(raw.endRank, startRank, startRank, 1000000);
  return {
    startRank,
    endRank,
    coin: clampInt(raw.coin, 0, 0, SEAL_COIN_REWARD_MAX),
    equipmentBox: clampInt(raw.equipmentBox, 0, 0, 1000000)
  };
}

function cleanRankRewards(raw = {}) {
  // Retired by OWNER on 2026-10-21. Ignore old CMS payloads and round snapshots.
  // Historical settings/receipts stay in storage; they can never reopen payouts.
  return { enabled: false, rewardOnFailure: false, tiers: [] };
}

function rankRewardValue(tier = {}) {
  return Number(tier.coin || 0) + Number(tier.equipmentBox || 0);
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
    format: raw.format === 'CLASSIC' ? 'CLASSIC' : 'SEALS_BOSS',
    bossStage: {
      name: cleanText(raw.bossStage?.name, base.bossStage.name, 80),
      hp: raw.bossStage?.hp == null || raw.bossStage.hp === '' ? null : clampInt(raw.bossStage.hp, 0, 0, SEAL_HEALTH_MAX),
      battlePower: raw.bossStage?.battlePower == null || raw.bossStage.battlePower === '' ? null : clampInt(raw.bossStage.battlePower, 0, 0, 2000000000)
    },
    title: cleanText(raw.title, base.title, 60),
    bossName: cleanText(raw.bossName, base.bossName, 80),
    bossImage: cleanText(raw.bossImage, base.bossImage, 1000).replace(/\\/g, '/'),
    description: cleanText(raw.description, base.description, 300),
    startsAt: cleanDate(raw.startsAt),
    endsAt: cleanDate(raw.endsAt),
    dailyAttempts: clampInt(raw.dailyAttempts, base.dailyAttempts, 1, 30),
    rechargeMinutes: clampInt(raw.rechargeMinutes, base.rechargeMinutes, 1, 1440),
    minRewardAttempts: clampInt(raw.minRewardAttempts, base.minRewardAttempts, 1, 1000000),
    targets: {
      attack: clampInt(targets.attack, base.targets.attack, 1, SEAL_HEALTH_MAX),
      guard: clampInt(targets.guard, base.targets.guard, 1, SEAL_HEALTH_MAX),
      purify: clampInt(targets.purify, base.targets.purify, 1, SEAL_HEALTH_MAX)
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
      coin: clampInt(attemptReward.coin, base.attemptReward.coin, 0, SEAL_COIN_REWARD_MAX),
      shards: clampInt(attemptReward.shards, base.attemptReward.shards, 0, 1000000)
    },
    clearReward: {
      coin: clampInt(clearReward.coin, base.clearReward.coin, 0, SEAL_COIN_REWARD_MAX),
      shards: clampInt(clearReward.shards, base.clearReward.shards, 0, 1000000),
      masterStar: clampInt(clearReward.masterStar, 0, 0, 1000000)
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

async function ensureRewardAttemptsSchema(env, deps) {
  const marker = 'seal_reward_attempts_schema_20260922_v1';
  const applied = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(marker).first();
  if (applied?.value === '1') return;
  if (env.DB.dialect === 'postgres') {
    // The PostgreSQL adapter intentionally ignores DDL passed through prepare().
    await env.DB.execSchema(['ALTER TABLE seal_battle_events ADD COLUMN IF NOT EXISTS min_reward_attempts BIGINT NOT NULL DEFAULT 1']);
  } else {
    const exists = typeof deps.columnExists === 'function' && await deps.columnExists(env, 'seal_battle_events', 'min_reward_attempts');
    if (!exists) {
      try { await env.DB.prepare('ALTER TABLE seal_battle_events ADD COLUMN min_reward_attempts INTEGER NOT NULL DEFAULT 1').run(); }
      catch (error) { if (!/duplicate column|already exists/i.test(String(error?.message || error))) throw error; }
    }
  }
  // Schema only: never rewrite operator settings or past rounds during initialization.
  await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(marker, '1').run();
}

async function ensureMasterStarSchema(env, deps = {}) {
  const marker = 'seal_master_star_schema_20260925_v1';
  if ((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(marker).first())?.value === '1') return;
  const ddl = 'CREATE TABLE IF NOT EXISTS seal_battle_clear_rewards_v20260925(event_id BIGINT PRIMARY KEY,master_star BIGINT NOT NULL DEFAULT 0 CHECK(master_star>=0 AND master_star<=1000000))';
  if (env.DB.dialect === 'postgres') await env.DB.execSchema([ddl]);
  else await env.DB.prepare(ddl).run();
  // Old rounds keep zero. Activating the current round is an explicit audited operation.
  await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(marker, '1').run();
}

function eventStarColumn(alias = 'seal_battle_events') {
  return `COALESCE((SELECT master_star FROM seal_battle_clear_rewards_v20260925 WHERE event_id=${alias}.id),0) AS clear_master_star,${eventDragonColumns(alias)}`;
}

async function ensureDragonSchema(env) {
  const marker = 'seal_dragon_schema_20261022_v1';
  if ((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(marker).first())?.value === '1') return;
  const ddl = [
    `CREATE TABLE IF NOT EXISTS ${DRAGON_TABLE}(event_id BIGINT PRIMARY KEY,phase TEXT NOT NULL DEFAULT 'SEALS',hp_max BIGINT NOT NULL CHECK(hp_max>0),hp_remaining BIGINT NOT NULL CHECK(hp_remaining>=0 AND hp_remaining<=hp_max),battle_power BIGINT NOT NULL CHECK(battle_power>0),opened_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS ${DRAGON_RECEIPTS}(request_id TEXT PRIMARY KEY,event_id BIGINT NOT NULL,response_json TEXT NOT NULL,hp_before BIGINT NOT NULL DEFAULT 0,hp_after BIGINT NOT NULL DEFAULT 0,opened INTEGER NOT NULL DEFAULT 0,defeated INTEGER NOT NULL DEFAULT 0)`
  ];
  if (env.DB.dialect === 'postgres') await env.DB.execSchema(ddl);
  else await env.DB.batch(ddl.map(sql => env.DB.prepare(sql)));
  await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(marker, '1').run();
}

function eventDragonColumns(alias = 'seal_battle_events') {
  return ['phase', 'hp_max', 'hp_remaining', 'battle_power', 'opened_at']
    .map(column => `(SELECT ${column} FROM ${DRAGON_TABLE} WHERE event_id=${alias}.id) AS dragon_${column}`).join(',');
}

function eventCompleteSql(alias = 'seal_battle_events') {
  return `${alias}.attack_progress>=${alias}.attack_target AND ${alias}.guard_progress>=${alias}.guard_target AND ${alias}.purify_progress>=${alias}.purify_target AND NOT EXISTS(SELECT 1 FROM ${DRAGON_TABLE} WHERE event_id=${alias}.id AND hp_remaining>0)`;
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
        min_reward_attempts INTEGER NOT NULL DEFAULT 1,
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
    await ensureRewardAttemptsSchema(env, deps);
    await ensureMasterStarSchema(env, deps);
    await ensureDragonSchema(env);

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
  for (const [key, max] of [['hp', SEAL_HEALTH_MAX], ['battlePower', 2000000000]]) {
    const number = value.bossStage?.[key];
    if (number != null && number !== '' && (!Number.isSafeInteger(Number(number)) || Number(number) < 1 || Number(number) > max)) {
      throw new Error(`본체 ${key === 'hp' ? '체력' : '전투력'}은 1~${max.toLocaleString('ko-KR')} 정수로 입력하세요.`);
    }
  }
  if (value.clearReward?.masterStar !== undefined && (!Number.isSafeInteger(Number(value.clearReward.masterStar)) || Number(value.clearReward.masterStar) < 0 || Number(value.clearReward.masterStar) > 1000000)) {
    throw new Error('완료 보상 마스터의 별은 0~1,000,000개 정수로 입력하세요.');
  }
  if (Object.values(value.targets || {}).some(target => !Number.isSafeInteger(Number(target)) || Number(target) < 1)) {
    throw new Error('역할별 봉인 체력(목표 공헌도)은 1 이상의 안전한 정수로 입력하세요.');
  }
  if (value.minRewardAttempts !== undefined && (!Number.isSafeInteger(Number(value.minRewardAttempts)) || Number(value.minRewardAttempts) < 1 || Number(value.minRewardAttempts) > 1000000)) {
    throw new Error('보상 최소 공격 횟수는 1~1,000,000회 정수로 입력하세요.');
  }
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
    format: row.dragon_phase ? 'SEALS_BOSS' : 'CLASSIC',
    phase: row.status === 'CLEARED' ? 'COMPLETED' : row.dragon_phase || 'SEALS',
    bossStage: row.dragon_phase ? {
      name: row.boss_name, hp: Number(row.dragon_hp_remaining), maxHp: Number(row.dragon_hp_max),
      battlePower: Number(row.dragon_battle_power), openedAt: row.dragon_opened_at || null,
      image: `${DRAGON_ART}/portrait.webp`, hero: `${DRAGON_ART}/hero.webp`
    } : null,
    description: row.description || '',
    status: String(row.status || 'ENDED').toUpperCase(),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    dailyAttempts: Number(row.daily_attempts || 5),
    maxAttempts: Number(row.daily_attempts || 5),
    rechargeMinutes: Number(row.recharge_minutes || 60),
    minRewardAttempts: clampInt(row.min_reward_attempts, 1, 1, 1000000),
    lowestRoleBonusPercent: Number(row.lowest_bonus_percent || 0),
    defeatContributionPercent: Number(row.defeat_contribution_percent ?? 10),
    attemptReward: { coin: Number(row.attempt_coin || 0), shards: Number(row.attempt_shards || 0) },
    clearReward: { coin: Number(row.clear_coin || 0), shards: Number(row.clear_shards || 0), masterStar: Number(row.clear_master_star || 0) },
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
      WHEN ${eventCompleteSql()} THEN 'CLEARED'
      ELSE 'FAILED'
    END,
    cleared_at=CASE
      WHEN ${eventCompleteSql()} THEN COALESCE(cleared_at,CURRENT_TIMESTAMP)
      ELSE cleared_at
    END,
    ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
    WHERE status='ACTIVE' AND ends_at IS NOT NULL AND datetime(ends_at)<=datetime('now')`).run();
}

async function currentEventRow(env) {
  await refreshExpiredEvent(env);
  return env.DB.prepare(`SELECT *,${eventStarColumn()} FROM seal_battle_events
    ORDER BY CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END,id DESC
    LIMIT 1`).first();
}

function eventAvailability(event, settings, user) {
  if (!event) return { open: false, code: 'NO_EVENT', message: '현재 진행 중인 봉인전이 없습니다.' };
  if (settings.mode === 'OFF') return { open: false, code: 'MODE_OFF', message: '현재 봉인전이 중지되어 있습니다.' };
  if (settings.mode === 'TEST' && String(user?.role || '').toUpperCase() !== 'OWNER') {
    return { open: false, code: 'TEST_MODE', message: '현재 봉인전 테스트 운영 중입니다.' };
  }
  if (event.status === 'CLEARED') return { open: false, code: 'CLEARED', message: event.bossStage ? '용 보스를 처치했습니다. 공동 완료 보상을 확인하세요.' : '세 개의 봉인이 모두 완성되었습니다.' };
  if (event.status === 'FAILED') return { open: false, code: 'FAILED', message: '제한 시간 안에 공동 목표를 완료하지 못했습니다.' };
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
    bossContribution: Math.max(0, totalContribution - Number(row?.attack_contribution || 0) - Number(row?.guard_contribution || 0) - Number(row?.purify_contribution || 0)),
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

async function rankRewardPreview() { return null; }

async function pendingRankReward() { return null; }

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

export function sealMercenaries(deck) {
  return companionSnapshotRows(deck).map((row,index)=>{const fighter=buildAvatarMercenaryFighter(row,'A','PVE',deck.characterBonus?.avatarPowerPercent||0);return publicFighter({...fighter,slot:5+index});});
}
function sealMercenary(deck){return sealMercenaries(deck)[0]||null;}

async function deckState(deps, env, userId) {
  try {
    const deck = await deps.raidDeckPower(env, userId, null, 'PVE');
    return { ready: true, power: Number(deck.power || 0), cardIds: deck.ids || [], cards: publicBattleCards(deck.cards), mercenary: sealMercenary(deck),...(companionBattleOptions(deck).mercenaries?{mercenaries:sealMercenaries(deck)}:{}) };
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
  const mercenaries=sealMercenaries(deck),mercenary=mercenaries[0]||null;
  const mercenaryPower=companionBattleOptions(deck).mercenaries?companionSnapshotRows(deck).reduce((sum,m)=>sum+mercenarySnapshotPower(m),0):mercenary?Math.max(0,Number(deck.mercenaryPower||0)):0;
  const avatarPercent = deck.characterBonus?.avatarPowerPercent || 0;
  const playerPower = avatarScaledPower(Math.max(0, cardPower + Number(deck.characterBonus?.pve || 0) + mercenaryPower), avatarPercent);
  // 봉인전은 유저/보스 궁극기를 모두 사용하지 않는다.
  // 저장된 PvE 덱과 같은 용병·장비·아바타 보너스를 전투력에 반영한다.
  return {
    ...deck,
    cards: publicBattleCards(cards),
    mercenary,
    ...(companionBattleOptions(deck).mercenaries?{mercenaries}:{}),
    mercenaryPower,
    mercenaryBattlePower: avatarScaledPower(mercenaryPower, avatarPercent),
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
      WHERE event_id=? AND user_id=? AND attempt_charges=? AND last_recharged_at=? AND day_key=?`)
      .bind(dayKey, attemptsToday, charges, nextLastSql, event.id, userId, originalCharges, originalLast, row.day_key).run();
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

function rewardEligibility(event, totalAttempts) {
  const minimumAttempts = clampInt(event?.minRewardAttempts, 1, 1, 1000000);
  const completedAttempts = Math.max(0, Math.floor(Number(totalAttempts) || 0));
  return {
    minimumAttempts,
    completedAttempts,
    remainingAttempts: Math.max(0, minimumAttempts - completedAttempts),
    eligible: completedAttempts >= minimumAttempts
  };
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
    env.DB.prepare(`SELECT e.id,e.event_key,e.title,e.boss_name,e.clear_coin,e.clear_shards,${eventStarColumn('e')},c.status AS claim_status
      FROM seal_battle_events e
      JOIN seal_battle_user_progress p ON p.event_id=e.id AND p.user_id=? AND p.total_attempts>=e.min_reward_attempts
      LEFT JOIN seal_battle_clear_claims c ON c.event_id=e.id AND c.user_id=?
      WHERE e.status='CLEARED' AND COALESCE(c.status,'')<>'COMPLETED'
      ORDER BY e.id DESC LIMIT 1`).bind(user.id, user.id).first()
  ]);
  const progress = publicProgress(progressRow, dayKey, event);
  const eligibility = rewardEligibility(event, progress.totalAttempts);
  const availability = eventAvailability(event, settings, user);
  return {
    settings: { mode: settings.mode },
    event,
    availability,
    progress,
    rewardEligibility: eligibility,
    stats,
    deck,
    lowestRoleKeys: lowestRoleKeys(event),
    clearReward: {
      eligible: event.status === 'CLEARED' && eligibility.eligible,
      claimed: String(claim?.status || '') === 'COMPLETED',
      processing: ['PENDING', 'CLAIMING'].includes(String(claim?.status || '')),
      reward: event.clearReward
    },
    pendingClearReward: pendingClaim && Number(pendingClaim.id) !== Number(event.id) ? {
      eventId: Number(pendingClaim.id),
      eventKey: pendingClaim.event_key,
      title: pendingClaim.title,
      bossName: pendingClaim.boss_name,
      reward: { coin: Number(pendingClaim.clear_coin || 0), shards: Number(pendingClaim.clear_shards || 0), masterStar: Number(pendingClaim.clear_master_star || 0) },
      processing: ['PENDING', 'CLAIMING'].includes(String(pendingClaim.claim_status || ''))
    } : null,
    rankReward: null,
    pendingRankReward: null,
    serverNow: new Date().toISOString()
  };
}

async function maybeCleanup(env, settings, receiptId) {
  if (!receiptId || receiptId % 20 !== 0) return;
  const receiptDays = clampInt(settings.receiptRetentionDays, 14, 1, 90);
  const progressDays = clampInt(settings.progressRetentionDays, 90, 7, 365);
  try {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM ${DRAGON_RECEIPTS} WHERE request_id IN (
        SELECT request_id FROM seal_battle_action_receipts WHERE status IN ('DONE','FAILED') AND created_at<datetime('now',?) ORDER BY id ASC LIMIT 200
      )`).bind(`-${receiptDays} days`),
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

// V2 charges, progress, stage transition and rewards commit together. The only
// shared lock is the existing round row, held after combat calculation, for this
// bounded transaction; PostgreSQL READ COMMITTED statements then see fresh HP.
async function dragonReceiptResponse(env, deps, user, settings, receipt, replayed = false) {
  const saved = await env.DB.prepare(`SELECT * FROM ${DRAGON_RECEIPTS} WHERE request_id=?`).bind(receipt.request_id).first();
  if (!saved) throw new Error('봉인전 전투 영수증을 찾지 못했습니다.');
  const result = safeJson(saved.response_json, {});
  let state = null, balances = null;
  try {
    state = await statusPayload(env, deps, user, settings);
    const row = await env.DB.prepare('SELECT coin,card_shards FROM users WHERE id=?').bind(user.id).first();
    if (row) balances = {coin:Number(row.coin),cardShards:Number(row.card_shards)};
  } catch (error) { console.warn('seal dragon receipt refresh failed', error); }
  return deps.json({...result,ok:true,replayed,contribution:Number(receipt.contribution),
    bossHpBefore:Number(saved.hp_before),bossHpAfter:Number(saved.hp_after),
    bossOpened:Boolean(Number(saved.opened)),bossDefeated:Boolean(Number(saved.defeated)),state,balances});
}

async function participateDragon(env, deps, user, settings, event, body) {
  const requestId=String(body.requestId||'').trim(),role=String(body.role||'').toUpperCase();
  if (!requestIdValid(requestId)) return deps.json({error:'요청 정보가 올바르지 않습니다.'},400);
  const existing=await env.DB.prepare('SELECT * FROM seal_battle_action_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
  if (existing) {
    if (existing.status==='DONE') return dragonReceiptResponse(env,deps,user,settings,existing,true);
    return deps.json({error:existing.error_text||'동일한 요청을 처리 중입니다.',code:'SEAL_REQUEST_EXISTS'},409);
  }
  const availability=eventAvailability(event,settings,user);
  if (!availability.open) return deps.json({error:availability.message,code:availability.code},409);
  const isBoss=role==='BOSS',phase=isBoss?'BOSS':'SEALS';
  if (Number(body.eventId)!==event.id || body.phase!==event.phase || phase!==event.phase || !event.bossStage || (!isBoss&&!ROLE_META[role])) {
    return deps.json({error:'봉인전 단계가 변경되었습니다. 전황을 갱신해 주세요.',code:'SEAL_PHASE_CHANGED'},409);
  }
  if (!isBoss&&event.roles[role].completed) return deps.json({error:'이미 해제된 봉인입니다.',code:'SEAL_PHASE_CHANGED'},409);
  const bossPower=isBoss?event.bossStage.battlePower:event.roles[role].battlePower;
  let combat;
  try { combat=await combatDeckState(deps,env,user.id,bossPower); }
  catch(error){return deps.json({error:String(error.message||'저장된 PvE 덱 5장이 필요합니다.')},Number(error.status||400));}
  const bonusPercent=!isBoss&&lowestRoleKeys(event).includes(role)?event.lowestRoleBonusPercent:0;
  const multiplier=isBoss?100:event.roles[role].multiplier;
  const result=combat.playerPower>=bossPower?'WIN':'LOSE';
  const defeatPercent=event.defeatContributionPercent;
  const raw=Math.max(1,Math.floor(combat.playerPower*multiplier/100*(1+bonusPercent/100)));
  const contribution=Math.min(2000000000,result==='WIN'?raw:defeatPercent>0?Math.max(1,Math.floor(raw*defeatPercent/100)):0);
  const attemptCoin=await collectionRewardCoin(env,user.id,event.attemptReward.coin,'SEAL',SEAL_COIN_REWARD_MAX);
  const attemptShards=event.attemptReward.shards,dayKey=kstDayKey();
  await refreshAttemptCharges(env,event,user.id,dayKey,{create:true});
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO seal_battle_action_receipts(request_id,event_id,user_id,day_key,role,status) VALUES(?,?,?,?,?,'PENDING')`)
    .bind(requestId,event.id,user.id,dayKey,role).run();
  if (!Number(inserted?.meta?.changes)) return deps.json({error:'동일한 요청을 처리 중입니다.'},409);
  const response={eventId:event.id,battlePhase:phase,role,result,defeatContributionPercent:defeatPercent,
    playerPower:combat.playerPower,deckPower:combat.playerPower,cardPower:combat.cardPower,basePlayerPower:combat.basePower,
    totalBattleDamage:combat.totalBattleDamage,bossPower,cards:combat.cards,bonusPercent,
    mercenary:combat.mercenary,...(combat.mercenaries?{mercenaries:combat.mercenaries}:{}),mercenaryPower:combat.mercenaryPower,mercenaryBattlePower:combat.mercenaryBattlePower,
    activatedUltimate:null,ultimateDamage:0,bonusDamage:0,uniqueAbility:combat.uniqueAbility,deckSynergy:combat.synergy,
    characterBonus:combat.characterBonus,reward:{coin:attemptCoin,shards:attemptShards},bossMaxHp:event.bossStage.maxHp,
    boss:{name:event.bossName,image:event.bossStage.image,role,roleLabel:isBoss?'용 보스 본체':ROLE_META[role].label}};
  const meta=ROLE_META[role];
  const remaining=isBoss?'d.hp_remaining':`e.${meta.targetColumn}-e.${meta.progressColumn}`;
  const gate="EXISTS(SELECT 1 FROM seal_battle_action_receipts WHERE request_id=? AND status='AUTHORIZED')";
  const amount='(SELECT contribution FROM seal_battle_action_receipts WHERE request_id=?)';
  const statements=[];
  if(env.DB.dialect==='postgres') statements.push(env.DB.prepare('SELECT id FROM seal_battle_events WHERE id=? FOR UPDATE').bind(event.id));
  const authIndex=statements.length;
  statements.push(env.DB.prepare(`UPDATE seal_battle_action_receipts SET status='AUTHORIZED',deck_power=?,boss_power=?,
    contribution=MIN(?,(SELECT ${remaining} FROM seal_battle_events e JOIN ${DRAGON_TABLE} d ON d.event_id=e.id WHERE e.id=?)),
    bonus_percent=?,battle_result=?,ultimate_damage=0,updated_at=CURRENT_TIMESTAMP
    WHERE request_id=? AND user_id=? AND status='PENDING' AND EXISTS(
      SELECT 1 FROM seal_battle_events e JOIN ${DRAGON_TABLE} d ON d.event_id=e.id
      JOIN seal_battle_user_progress p ON p.event_id=e.id AND p.user_id=?
      WHERE e.id=? AND e.status='ACTIVE' AND d.phase=? AND ${remaining}>0 AND p.attempt_charges>0
      AND (e.starts_at IS NULL OR datetime(e.starts_at)<=datetime('now'))
      AND (e.ends_at IS NULL OR datetime(e.ends_at)>datetime('now'))
    )`).bind(combat.playerPower,bossPower,contribution,event.id,bonusPercent,result,requestId,user.id,user.id,event.id,phase));
  statements.push(env.DB.prepare(`INSERT INTO ${DRAGON_RECEIPTS}(request_id,event_id,response_json,hp_before,hp_after)
    SELECT ?,?,?,hp_remaining,hp_remaining FROM ${DRAGON_TABLE} WHERE event_id=? AND ${gate}`)
    .bind(requestId,event.id,JSON.stringify(response),event.id,requestId));
  const progressSql=`UPDATE seal_battle_user_progress SET attempt_charges=attempt_charges-1,
    last_recharged_at=CASE WHEN attempt_charges>=? THEN ? ELSE last_recharged_at END,
    attempts_today=CASE WHEN day_key=? THEN attempts_today+1 ELSE 1 END,day_key=?,total_attempts=total_attempts+1,
    ${isBoss?'':`${meta.userColumn}=${meta.userColumn}+${amount},`}total_contribution=total_contribution+${amount},
    last_role=?,last_contribution=${amount},last_contribution_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE event_id=? AND user_id=? AND ${gate}`;
  statements.push(env.DB.prepare(progressSql).bind(event.maxAttempts,sqlTimestamp(Date.now()),dayKey,dayKey,
    ...(!isBoss?[requestId]:[]),requestId,role,requestId,event.id,user.id,requestId));
  if(isBoss){
    statements.push(env.DB.prepare(`UPDATE ${DRAGON_TABLE} SET hp_remaining=MAX(0,hp_remaining-${amount}) WHERE event_id=? AND phase='BOSS' AND ${gate}`).bind(requestId,event.id,requestId));
    statements.push(env.DB.prepare(`UPDATE seal_battle_events SET status=CASE WHEN ${eventCompleteSql()} THEN 'CLEARED' ELSE status END,
      cleared_at=CASE WHEN ${eventCompleteSql()} THEN COALESCE(cleared_at,CURRENT_TIMESTAMP) ELSE cleared_at END,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND ${gate}`).bind(event.id,requestId));
  }else{
    statements.push(env.DB.prepare(`UPDATE seal_battle_events SET ${meta.progressColumn}=MIN(${meta.targetColumn},${meta.progressColumn}+${amount}),updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${gate}`).bind(requestId,event.id,requestId));
    statements.push(env.DB.prepare(`UPDATE ${DRAGON_TABLE} SET phase='BOSS',opened_at=CURRENT_TIMESTAMP WHERE event_id=? AND phase='SEALS' AND ${gate}
      AND EXISTS(SELECT 1 FROM seal_battle_events WHERE id=? AND attack_progress>=attack_target AND guard_progress>=guard_target AND purify_progress>=purify_target)`)
      .bind(event.id,requestId,event.id));
  }
  statements.push(env.DB.prepare(`UPDATE ${DRAGON_RECEIPTS} SET hp_after=(SELECT hp_remaining FROM ${DRAGON_TABLE} WHERE event_id=?),
    opened=CASE WHEN ?='SEALS' AND (SELECT phase FROM ${DRAGON_TABLE} WHERE event_id=?)='BOSS' THEN 1 ELSE 0 END,
    defeated=CASE WHEN ?='BOSS' AND (SELECT status FROM seal_battle_events WHERE id=?)='CLEARED' THEN 1 ELSE 0 END
    WHERE request_id=? AND ${gate}`).bind(event.id,phase,event.id,phase,event.id,requestId,requestId));
  statements.push(env.DB.prepare(`UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=? AND ${gate}`).bind(attemptCoin,attemptShards,user.id,requestId));
  if(attemptCoin>0) statements.push(env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'SEAL_BATTLE_ATTEMPT' FROM users WHERE id=? AND ${gate}`).bind(attemptCoin,user.id,requestId));
  if(attemptShards>0) statements.push(env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) SELECT id,?,card_shards,'SEAL_BATTLE_ATTEMPT' FROM users WHERE id=? AND ${gate}`).bind(attemptShards,user.id,requestId));
  statements.push(...await accountRankAward(env,user.id,'SEAL',requestId,{guard:gate,values:[requestId]}));
  statements.push(env.DB.prepare("UPDATE seal_battle_action_receipts SET status='DONE',error_text=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='AUTHORIZED'").bind(requestId));
  let results;
  try{results=await env.DB.batch(statements);}
  catch(error){
    // A COMMIT can succeed while its response is lost. Never refund or pay again.
    const receipt=await env.DB.prepare('SELECT * FROM seal_battle_action_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
    if(receipt?.status==='DONE')return dragonReceiptResponse(env,deps,user,settings,receipt,true);
    await env.DB.prepare("UPDATE seal_battle_action_receipts SET status='FAILED',error_text='전투 결과 저장에 실패했습니다.',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'").bind(requestId).run();
    console.error('seal dragon transaction failed',error);
    return deps.json({error:'전투 결과 저장에 실패했습니다. 도전 횟수는 사용되지 않았습니다.'},500);
  }
  if(!Number(results?.[authIndex]?.meta?.changes)){
    await env.DB.prepare("UPDATE seal_battle_action_receipts SET status='FAILED',error_text='전황 또는 도전 횟수가 변경되었습니다.',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND status='PENDING'").bind(requestId).run();
    return deps.json({error:'전황 또는 도전 횟수가 변경되었습니다. 갱신 후 다시 시도해 주세요.',code:'SEAL_PHASE_CHANGED'},409);
  }
  const receipt=await env.DB.prepare('SELECT * FROM seal_battle_action_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
  await maybeCleanup(env,settings,Number(inserted?.meta?.last_row_id||0));
  return dragonReceiptResponse(env,deps,user,settings,receipt);
}

async function participate(env, deps, user, settings, event, body) {
  if (event.format === 'SEALS_BOSS') return participateDragon(env, deps, user, settings, event, body);
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
  const attemptCoin = await collectionRewardCoin(env,user.id,Math.max(0,Number(event.attemptReward.coin||0)),'SEAL',SEAL_COIN_REWARD_MAX);
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
  statements.push(...await accountRankAward(env,user.id,'SEAL',requestId,{guard:"EXISTS(SELECT 1 FROM seal_battle_action_receipts WHERE request_id=? AND user_id=? AND status='AUTHORIZED')",values:[requestId,user.id]}));
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
    mercenary: combat.mercenary,
    ...(combat.mercenaries?{mercenaries:combat.mercenaries}:{}),
    mercenaryPower: combat.mercenaryPower,
    mercenaryBattlePower: combat.mercenaryBattlePower,
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
  const eligibility = rewardEligibility(event, progress?.total_attempts);
  if (!eligibility.eligible) return deps.json({ error: `보상을 받으려면 이번 봉인전에서 ${eligibility.minimumAttempts}회 이상 공격해야 합니다. (현재 ${eligibility.completedAttempts}회)`, code: 'SEAL_REWARD_MIN_ATTEMPTS', rewardEligibility: eligibility }, 403);

  const bonusCoin=await collectionRewardCoin(env,user.id,Number(event.clearReward.coin||0),'SEAL',SEAL_COIN_REWARD_MAX);
  await env.DB.prepare(`INSERT OR IGNORE INTO seal_battle_clear_claims(event_id,user_id,status,reward_coin,reward_shards)
    VALUES(?,?,'PENDING',?,?)`).bind(event.id, user.id, bonusCoin, event.clearReward.shards).run();
  const reserved = await env.DB.prepare(`UPDATE seal_battle_clear_claims SET status='CLAIMING',updated_at=CURRENT_TIMESTAMP
    WHERE event_id=? AND user_id=? AND status='PENDING'`).bind(event.id, user.id).run();
  if (!Number(reserved?.meta?.changes || 0)) {
    const row = await env.DB.prepare('SELECT status FROM seal_battle_clear_claims WHERE event_id=? AND user_id=?').bind(event.id, user.id).first();
    if (row?.status === 'COMPLETED') return deps.json({ error: '이미 봉인 완료 보상을 수령했습니다.' }, 409);
    return deps.json({ error: '봉인 완료 보상을 처리 중입니다.' }, 409);
  }

  const savedClaim=await env.DB.prepare('SELECT reward_coin FROM seal_battle_clear_claims WHERE event_id=? AND user_id=?').bind(event.id,user.id).first();
  const coin = Number(savedClaim.reward_coin);
  const shards = Number(event.clearReward.shards || 0);
  const masterStar = Number(event.clearReward.masterStar || 0);
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
  if (masterStar > 0) {
    const gate = "EXISTS(SELECT 1 FROM seal_battle_clear_claims WHERE event_id=? AND user_id=? AND status='CLAIMING')";
    statements.push(env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT ?,'MASTER_STAR',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ${gate}
      ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
        unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`)
      .bind(user.id, masterStar, masterStar, event.id, user.id));
    statements.push(env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT user_id,item_code,?,quantity,'SEAL_BATTLE_CLEAR','SEAL_BATTLE',? FROM cnine_user_inventory
      WHERE user_id=? AND item_code='MASTER_STAR' AND ${gate}`).bind(masterStar, event.eventKey, user.id, event.id, user.id));
  }
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
    reward: { coin, shards, masterStar },
    balances: balance ? { coin: Number(balance.coin || 0), cardShards: Number(balance.card_shards || 0) } : null
  });
}

async function claimRankReward(env, deps) {
  return deps.json({ error: '봉인전 공헌도 순위 보상은 종료되었습니다.', code: 'SEAL_RANK_REWARDS_RETIRED' }, 410);
}

async function rankings(env, eventId, userId = 0) {
  const event = normalizeEvent(await env.DB.prepare(`SELECT *,${eventStarColumn()} FROM seal_battle_events WHERE id=?`).bind(eventId).first());
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
  const dragon = settings.format === 'SEALS_BOSS';
  if (dragon && (!settings.bossStage?.hp || !settings.bossStage?.battlePower)) {
    throw Object.assign(new Error('본체 체력과 전투력을 저장한 뒤 새 회차를 시작하세요.'), {status:400,code:'SEAL_BOSS_UNCONFIGURED'});
  }
  if(dragon && settings.endsAt && (Date.parse(settings.endsAt)<=Date.now() || (settings.startsAt && Date.parse(settings.endsAt)<=Date.parse(settings.startsAt)))) {
    throw Object.assign(new Error('새 회차의 종료 시각을 현재와 시작 시각 이후로 설정하세요.'),{status:400,code:'SEAL_EVENT_TIME_INVALID'});
  }
  const key = eventKey();
  await env.DB.batch([
    env.DB.prepare(`UPDATE seal_battle_events SET
      status=CASE WHEN ${eventCompleteSql()} THEN 'CLEARED' ELSE 'FAILED' END,
      cleared_at=CASE WHEN ${eventCompleteSql()} THEN COALESCE(cleared_at,CURRENT_TIMESTAMP) ELSE cleared_at END,
      ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
      WHERE status='ACTIVE'`),
    env.DB.prepare(`INSERT INTO seal_battle_events(
      event_key,title,boss_name,boss_image,description,status,starts_at,ends_at,daily_attempts,recharge_minutes,min_reward_attempts,
      attack_target,guard_target,purify_target,attack_multiplier,guard_multiplier,purify_multiplier,
      attack_battle_power,guard_battle_power,purify_battle_power,defeat_contribution_percent,
      lowest_bonus_percent,attempt_coin,attempt_shards,clear_coin,clear_shards,rank_rewards_json,created_by
    ) VALUES(?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      key, settings.title, dragon ? settings.bossStage.name : settings.bossName, dragon ? `${DRAGON_ART}/hero.webp` : settings.bossImage, settings.description,
      settings.startsAt, settings.endsAt, settings.dailyAttempts, settings.rechargeMinutes,
      settings.minRewardAttempts ?? 1,
      settings.targets.attack, settings.targets.guard, settings.targets.purify,
      settings.multipliers.attack, settings.multipliers.guard, settings.multipliers.purify,
      settings.battlePowers.attack, settings.battlePowers.guard, settings.battlePowers.purify,
      settings.defeatContributionPercent,
      settings.lowestRoleBonusPercent, settings.attemptReward.coin, settings.attemptReward.shards,
      settings.clearReward.coin, settings.clearReward.shards, JSON.stringify(settings.rankRewards), admin.id
    ),
    env.DB.prepare('INSERT INTO seal_battle_clear_rewards_v20260925(event_id,master_star) SELECT id,? FROM seal_battle_events WHERE event_key=?')
      .bind(settings.clearReward.masterStar || 0, key),
    ...(dragon ? [env.DB.prepare(`INSERT INTO ${DRAGON_TABLE}(event_id,hp_max,hp_remaining,battle_power) SELECT id,?,?,? FROM seal_battle_events WHERE event_key=?`)
      .bind(settings.bossStage.hp, settings.bossStage.hp, settings.bossStage.battlePower, key)] : [])
  ]);
  return normalizeEvent(await env.DB.prepare(`SELECT *,${eventStarColumn()} FROM seal_battle_events WHERE event_key=?`).bind(key).first());
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
      ? await env.DB.prepare(`SELECT *,${eventStarColumn()} FROM seal_battle_events WHERE id=?`).bind(requestedEventId).first()
      : await currentEventRow(env);
    if (!requestedEventId && eventRow && String(eventRow.status || '').toUpperCase() !== 'CLEARED') {
      eventRow = await env.DB.prepare(`SELECT e.*,${eventStarColumn("e")} FROM seal_battle_events e
        JOIN seal_battle_user_progress p ON p.event_id=e.id AND p.user_id=? AND p.total_attempts>=e.min_reward_attempts
        LEFT JOIN seal_battle_clear_claims c ON c.event_id=e.id AND c.user_id=?
        WHERE e.status='CLEARED' AND COALESCE(c.status,'')<>'COMPLETED'
        ORDER BY e.id DESC LIMIT 1`).bind(user.id, user.id).first();
    }
    return claimClearReward(env, deps, user, normalizeEvent(eventRow));
  }

  if (path === 'seal-battle/rank-reward' && request.method === 'POST') {
    return claimRankReward(env, deps);
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
    let next;
    try {
      const incoming = body.settings || body;
      // A previously opened CMS may omit the newly added field.
      next = await saveSettings(env, { ...settings, ...incoming, bossStage: { ...settings.bossStage, ...incoming.bossStage }, clearReward: { ...settings.clearReward, ...incoming.clearReward } });
    } catch (error) {
      if (/보상 최소 공격 횟수|봉인 체력|완료 보상 마스터의 별|본체 체력|본체 전투력/.test(String(error?.message))) return deps.json({ error: error.message }, 400);
      throw error;
    }
    await env.DB.prepare(`UPDATE seal_battle_events SET boss_image=?,updated_at=CURRENT_TIMESTAMP WHERE status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM ${DRAGON_TABLE} WHERE event_id=seal_battle_events.id)`)
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
      let event;
      try { event = await adminStart(env, settings, admin); }
      catch (error) { if (error.status === 400) return deps.json({error:error.message,code:error.code},400); throw error; }
      if (typeof deps.writeAdminLog === 'function') await deps.writeAdminLog(env, admin, 'SEAL_BATTLE_START', 'SEAL_BATTLE', event.eventKey, null, event);
      return deps.json({ ok: true, event, overview: await adminOverview(env, settings) });
    }
    if (action === 'END') {
      const active = await env.DB.prepare(`SELECT *,${eventStarColumn()} FROM seal_battle_events WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1`).first();
      if (!active) return deps.json({ error: '종료할 활성 봉인전이 없습니다.' }, 409);
      await env.DB.prepare(`UPDATE seal_battle_events SET status=CASE WHEN ${eventCompleteSql()} THEN 'CLEARED' ELSE 'FAILED' END,cleared_at=CASE WHEN ${eventCompleteSql()} THEN COALESCE(cleared_at,CURRENT_TIMESTAMP) ELSE cleared_at END,ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(active.id).run();
      if (typeof deps.writeAdminLog === 'function') await deps.writeAdminLog(env, admin, 'SEAL_BATTLE_END', 'SEAL_BATTLE', active.event_key, normalizeEvent(active), null);
      return deps.json({ ok: true, overview: await adminOverview(env, settings) });
    }
    return deps.json({ error: '지원하지 않는 봉인전 관리 작업입니다.' }, 400);
  }

  return deps.json({ error: '봉인전 API를 찾을 수 없습니다.' }, 404);
}
