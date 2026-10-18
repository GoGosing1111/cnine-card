import { createHash } from 'node:crypto';

export const OPERATION_KEY = 'ops:coup-sera-commander:20261018:v1';
export const ROUND_ID = '337d1c95-4d88-4045-a81d-4ab359e5f627';
export const COMMANDER_ID = 45;
export const COMMANDER_NAME = '박세라-ㅂ-';
const APPOINTMENT_ID = 'ed09bfce-ae09-4222-ae97-3049c9fed1e3';
const CHIEF_ID = 5426;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Caller owns the transaction. Dry-run executes this same operation then rolls back.
// This account is already enlisted: preserve its original deck, power and join time.
export async function assignSeraCommander(client, { releaseCommit } = {}) {
 if (!/^[a-f0-9]{40}$/.test(releaseCommit || '')) throw Error('Verified production source commit required');
 const q = async (sql, args = []) => (await client.query(sql, args)).rows;
 const [identity] = await q('SELECT current_database() AS database,pg_is_in_recovery() AS replica');
 if (identity.database !== 'cnine' || identity.replica) throw Error('Wrong database');
 const configSql = "SELECT key,value FROM app_meta WHERE key IN ('chief_appointment_v1','coup_settings_v2115','coup_chief_skill_settings_v2118') ORDER BY key";
 const configBefore = await q(configSql + ' FOR UPDATE');
 const cfg = Object.fromEntries(configBefore.map(row => [row.key, JSON.parse(row.value)]));
 if (cfg.coup_settings_v2115?.enabled !== true) throw Error('Coup is OFF');
 const [owner] = await q('SELECT role,status FROM users WHERE id=1');
 if (owner?.role !== 'OWNER' || owner.status !== 'ACTIVE') throw Error('Operational owner changed');
 const [round] = await q('SELECT * FROM coup_rounds_v2115 WHERE id=$1 FOR UPDATE', [ROUND_ID]);
 if (round?.status !== 'RECRUITING' || round.starts_at != null || Number(round.chief_user_id) !== CHIEF_ID || round.appointment_id !== APPOINTMENT_ID) throw Error('Recruiting round changed');
 const appointment = cfg.chief_appointment_v1;
 const now = Date.now();
 if (appointment?.id !== APPOINTMENT_ID || Number(appointment.userId) !== CHIEF_ID || !(Date.parse(appointment.startsAt) <= now && Date.parse(appointment.endsAt) > now)) throw Error('Current chief appointment changed');
 const users = await q('SELECT id,nickname,role,status FROM users WHERE nickname=$1 ORDER BY id FOR UPDATE', [COMMANDER_NAME]);
 if (users.length !== 1 || Number(users[0].id) !== COMMANDER_ID || users[0].status !== 'ACTIVE' || !['USER','OWNER'].includes(users[0].role)) throw Error('Commander identity changed');
 const participantsSql = 'SELECT * FROM coup_participants_v2115 WHERE round_id=$1 ORDER BY user_id';
 const participants = await q(participantsSql, [ROUND_ID]);
 const member = participants.find(row => Number(row.user_id) === COMMANDER_ID);
 if (member?.side !== 'REBEL') throw Error('Expected existing rebel enrollment changed');
 const [activity] = await q('SELECT (SELECT COUNT(*)::int FROM coup_attacks_v2115 WHERE round_id=$1) AS attacks,(SELECT COUNT(*)::int FROM coup_skills_v2118 WHERE round_id=$1) AS skills', [ROUND_ID]);
 if (activity.attacks || activity.skills) throw Error('Round already has combat activity');
 const [prior] = await q('SELECT value FROM app_meta WHERE key=$1', [OPERATION_KEY]);
 const before = JSON.parse(round.settings_json);
 if (prior) {
  const receipt = JSON.parse(prior.value);
  if (receipt.roundId !== ROUND_ID || receipt.commanderId !== COMMANDER_ID || before.rebelCommand?.roundId !== ROUND_ID || Number(before.rebelCommand?.userId) !== COMMANDER_ID) throw Error('Saved receipt and current command do not match');
  return { ok: true, changed: false, replayed: true, receipt };
 }
 const after = { ...before, rebelCommand: { roundId: ROUND_ID, userId: COMMANDER_ID } };
 const energySql = 'SELECT * FROM coup_energy_v2118 WHERE round_id=$1 ORDER BY user_id';
 const cooldownSql = 'SELECT * FROM coup_skill_cooldowns_v2118 WHERE appointment_id IN ($1,$2) ORDER BY appointment_id,skill_code';
 const energyBefore = await q(energySql, [ROUND_ID]);
 const cooldownBefore = await q(cooldownSql, [APPOINTMENT_ID, 'coup-rebel:' + ROUND_ID]);
 const [updated] = await q("UPDATE coup_rounds_v2115 SET settings_json=$1,revision=revision+1 WHERE id=$2 AND revision=$3 AND status='RECRUITING' AND starts_at IS NULL RETURNING *", [JSON.stringify(after), ROUND_ID, round.revision]);
 if (!updated) throw Error('Concurrent round update');
 const preservedRound = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['settings_json','revision'].includes(key)));
 if (digest(preservedRound(round)) !== digest(preservedRound(updated))) throw Error('Unrelated round state changed');
 if (digest(participants) !== digest(await q(participantsSql, [ROUND_ID]))) throw Error('Participant state changed');
 if (digest(configBefore) !== digest(await q(configSql))) throw Error('Global configuration or chief appointment changed');
 if (digest(energyBefore) !== digest(await q(energySql, [ROUND_ID]))) throw Error('Energy changed');
 if (digest(cooldownBefore) !== digest(await q(cooldownSql, [APPOINTMENT_ID, 'coup-rebel:' + ROUND_ID]))) throw Error('Skill cooldown changed');
 const receipt = {
  operationKey: OPERATION_KEY, roundId: ROUND_ID, commanderId: COMMANDER_ID, commanderName: COMMANDER_NAME,
  side: 'REBEL', enrolled: true, enrollmentAlreadyExisted: true, roundStatus: updated.status,
  before, after, beforeRevision: Number(round.revision), revision: Number(updated.revision),
  participantCount: participants.length, participantSnapshotSha256: digest(participants),
  preserved: { participants: true, formation: true, joinedAt: true, roundState: true, globalSettings: true, chiefAppointment: true, energy: true, skillCooldowns: true },
  releaseCommit, completedAt: new Date(now).toISOString()
 };
 const [audit] = await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,'COUP_REBEL_COMMANDER_ASSIGN','COUP',$1,$2,$3,sqlite_now()) RETURNING id", [ROUND_ID, JSON.stringify({ settings: before, userId: COMMANDER_ID, enrolled: true }), JSON.stringify(receipt)]);
 receipt.auditId = Number(audit.id);
 await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())', [OPERATION_KEY, JSON.stringify(receipt)]);
 return { ok: true, changed: true, replayed: false, receipt };
}
