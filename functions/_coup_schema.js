import { readRuntimeData, cacheRuntimeData } from './_runtime_data_cache.js';
const KEY = 'safe_runtime_upgrade_coup_v2118';
export function coupSchema(pg = false) {
  const int = pg ? 'BIGINT' : 'INTEGER';
  return [
    `CREATE TABLE IF NOT EXISTS coup_rounds_v2115(id TEXT PRIMARY KEY,status TEXT NOT NULL,chief_user_id ${int} NOT NULL,appointment_id TEXT NOT NULL,chief_name TEXT NOT NULL,settings_json TEXT NOT NULL,created_at ${int} NOT NULL,starts_at ${int},ends_at ${int},finished_at ${int},front_index INTEGER NOT NULL DEFAULT 2,chief_hp ${int} NOT NULL,rebel_hp ${int} NOT NULL,max_hp ${int} NOT NULL,front_seq INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,token TEXT,winner TEXT)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_coup_one_round ON coup_rounds_v2115((1)) WHERE status IN ('RECRUITING','ACTIVE','SETTLING')`,
    `CREATE TABLE IF NOT EXISTS coup_participants_v2115(round_id TEXT NOT NULL,user_id ${int} NOT NULL,side TEXT NOT NULL CHECK(side IN ('CHIEF','REBEL')),deck_snapshot TEXT NOT NULL,loadout_bonus_json TEXT NOT NULL,deck_power ${int} NOT NULL,joined_at ${int} NOT NULL,attacks INTEGER NOT NULL DEFAULT 0,damage ${int} NOT NULL DEFAULT 0,next_attack_at ${int} NOT NULL DEFAULT 0,PRIMARY KEY(round_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS coup_attacks_v2115(request_id TEXT PRIMARY KEY,round_id TEXT NOT NULL,user_id ${int} NOT NULL,side TEXT NOT NULL,front_seq INTEGER NOT NULL,result_json TEXT NOT NULL,created_at ${int} NOT NULL)`,
    'CREATE INDEX IF NOT EXISTS idx_coup_attacks_round ON coup_attacks_v2115(round_id,created_at)',
    `CREATE TABLE IF NOT EXISTS coup_penalties_v2115(round_id TEXT NOT NULL,user_id ${int} NOT NULL,before_coin ${int} NOT NULL,debit ${int} NOT NULL,after_coin ${int} NOT NULL,PRIMARY KEY(round_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS coup_trials_v2115(id TEXT PRIMARY KEY,round_id TEXT NOT NULL UNIQUE,appointment_id TEXT NOT NULL,defendant_id ${int} NOT NULL,defendant_name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'OPEN',starts_at ${int} NOT NULL,ends_at ${int} NOT NULL,closed_at ${int},reinstate_count INTEGER NOT NULL DEFAULT 0,remove_count INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,token TEXT)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_coup_one_trial ON coup_trials_v2115((1)) WHERE status='OPEN'`,
    `CREATE TABLE IF NOT EXISTS coup_electorate_v2115(trial_id TEXT NOT NULL,user_id ${int} NOT NULL,PRIMARY KEY(trial_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS coup_votes_v2115(trial_id TEXT NOT NULL,user_id ${int} NOT NULL,choice TEXT NOT NULL CHECK(choice IN ('REINSTATE','REMOVE')),created_at ${int} NOT NULL,PRIMARY KEY(trial_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS chief_duty_cases_v2115(appointment_id TEXT PRIMARY KEY,trial_id TEXT NOT NULL,status TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS coup_atomic_guard_v2115(id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))`,
    `CREATE TABLE IF NOT EXISTS coup_energy_v2118(round_id TEXT NOT NULL,user_id ${int} NOT NULL,energy INTEGER NOT NULL CHECK(energy BETWEEN 0 AND 100),energy_at ${int} NOT NULL,blocked_until ${int} NOT NULL DEFAULT 0,PRIMARY KEY(round_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS coup_skill_cooldowns_v2118(appointment_id TEXT NOT NULL,skill_code TEXT NOT NULL,next_use_at ${int} NOT NULL,PRIMARY KEY(appointment_id,skill_code))`,
    `CREATE TABLE IF NOT EXISTS coup_skills_v2118(request_id TEXT PRIMARY KEY,round_id TEXT NOT NULL,user_id ${int} NOT NULL,skill_code TEXT NOT NULL,result_json TEXT NOT NULL,created_at ${int} NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_coup_skills_round ON coup_skills_v2118(round_id,created_at)`
  ];
}
export async function ensureCoupSchema(env) {
  if (readRuntimeData(env, KEY)) return;
  if (!(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KEY).first())) {
    const schema = coupSchema(env.DB.dialect === 'postgres');
    if (env.DB.dialect === 'postgres') await env.DB.execSchema(schema);
    else await env.DB.batch(schema.map(s => env.DB.prepare(s)));
    await env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)').bind(KEY, '2118').run();
  }
  cacheRuntimeData(env, KEY, true, 1800000);
}
export const chiefMetaLock = env => env.DB.prepare("UPDATE app_meta SET value=value WHERE key='chief_appointment_v1'");
export async function chiefDuty(env, appointmentId) {
  await ensureCoupSchema(env);
  return await env.DB.prepare('SELECT * FROM chief_duty_cases_v2115 WHERE appointment_id=?').bind(String(appointmentId || '')).first();
}
// Lock the same appointment row as sentencing before checking authority. This
// guard must be inside the transaction that changes burning or tower progress.
export function chiefAuthorityGuard(env, appointmentId, userId, now = Date.now()) {
  const token = crypto.randomUUID(), time = new Date(now).toISOString();
  return { before: [chiefMetaLock(env), env.DB.prepare(`INSERT INTO coup_atomic_guard_v2115(id,ok)
    SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM app_meta WHERE key='chief_appointment_v1'
    AND json_extract(value,'$.id')=? AND CAST(json_extract(value,'$.userId') AS BIGINT)=?
    AND json_extract(value,'$.startsAt')<=? AND json_extract(value,'$.endsAt')>?)
    AND NOT EXISTS(SELECT 1 FROM chief_duty_cases_v2115 WHERE appointment_id=? AND status IN ('OPEN','REMOVED')) THEN 1 ELSE 0 END`)
    .bind(token, appointmentId, userId, time, time, appointmentId)],
    after: env.DB.prepare('DELETE FROM coup_atomic_guard_v2115 WHERE id=?').bind(token) };
}
