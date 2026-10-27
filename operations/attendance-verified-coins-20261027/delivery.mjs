import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OP = 'ops:attendance-verified-coins:20261027:v1';
export const ACTION = 'OPS_ATTENDANCE_VERIFIED_COIN_MESSAGES';
export const KST_DATE = '2026-10-27';
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const TIERS = [
  {minimumDays: 50, maximumDays: 99, amount: '20000000000000', title: '누적 출석 50일 이상 보상',
    body: '2차 인증을 완료하고 누적 출석 50일 이상을 달성해 주셔서 감사합니다.\n\n보상: 20조 코인\n\n2026년 10월 27일 누적 출석 기준 특별 보상입니다. 메시지함에서 첨부 보상을 수령해 주세요.'},
  {minimumDays: 100, maximumDays: null, amount: '40000000000000', title: '누적 출석 100일 이상 보상',
    body: '2차 인증을 완료하고 누적 출석 100일 이상을 달성해 주셔서 감사합니다.\n\n보상: 40조 코인\n\n2026년 10월 27일 누적 출석 기준 특별 보상입니다. 100일 이상은 상위 구간 보상 40조 코인으로 지급됩니다. 메시지함에서 첨부 보상을 수령해 주세요.'},
];
const q = async (c, sql, args = []) => (await c.query(sql, args)).rows;
const one = rows => (assert.equal(rows.length, 1, 'Expected one row'), rows[0]);
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const PG_MAX = 9223372036854775807n;

export function tierFor(days) {
  assert.ok(Number.isSafeInteger(days) && days >= 0);
  return days >= 100 ? TIERS[1] : days >= 50 ? TIERS[0] : null;
}
export function selectRecipients(accounts) {
  const eligible = accounts.filter(r => r.status === 'ACTIVE' && r.provider && r.attendanceDays >= 50);
  assert.equal(new Set(eligible.map(r => r.userId)).size, eligible.length, 'Duplicate recipients');
  return eligible.map(r => {
    assert.equal(r.attendanceDays, r.distinctDays, 'Duplicate attendance dates');
    assert.ok(['PLAYDK', 'WAGO'].includes(r.provider) && r.provider_user_id);
    const tier = tierFor(r.attendanceDays);
    assert.ok(BigInt(r.coin) >= 0n && BigInt(r.coin) + BigInt(tier.amount) <= PG_MAX, 'Invalid BIGINT balance');
    return {userId: r.userId, status: r.status, role: r.role, provider: r.provider,
      identityHash: hash({provider: r.provider, providerUserId: r.provider_user_id}),
      attendanceDays: r.attendanceDays, tier: tier.minimumDays, amount: tier.amount};
  }).sort((a, b) => Number(a.userId) - Number(b.userId));
}
export function totalsFor(recipients) {
  return {recipients: recipients.length, messages: recipients.length,
    tier50: recipients.filter(r => r.tier === 50).length,
    tier100: recipients.filter(r => r.tier === 100).length,
    totalCoin: recipients.reduce((sum, r) => sum + BigInt(r.amount), 0n).toString()};
}
export function makePlan(inspection) {
  const recipients = selectRecipients(inspection.accounts);
  return {operationKey: OP, authorization: '출석체크 2차인증 유저 기준 / 50일차이상 = 20조 / 100일차이상 = 40조 / 메세지로 보상 지급',
    kstDate: KST_DATE, cutoff: inspection.summary.clock.cutoff,
    delivery: 'MESSAGE_ATTACHMENT', oneTime: true, highestTierOnly: true,
    eligibility: 'ACTIVE secondary-verified accounts; distinct cumulative attendance at cutoff; all roles and providers',
    tiers: TIERS, recipients, recipientHash: hash(recipients), totals: totalsFor(recipients)};
}
export function validatePlan(plan, expectedHash) {
  assert.equal(hash(plan), expectedHash, 'Reviewed plan hash changed');
  assert.equal(plan.operationKey, OP); assert.equal(plan.kstDate, KST_DATE);
  assert.equal(plan.delivery, 'MESSAGE_ATTACHMENT'); assert.equal(plan.oneTime, true); assert.equal(plan.highestTierOnly, true);
  assert.deepEqual(plan.tiers, TIERS); assert.ok(Number.isFinite(Date.parse(plan.cutoff)));
  assert.ok(plan.recipients.length > 0 && plan.recipients.length <= 5000);
  assert.equal(new Set(plan.recipients.map(r => r.userId)).size, plan.recipients.length);
  assert.equal(hash(plan.recipients), plan.recipientHash);
  for (const r of plan.recipients) {
    assert.match(r.userId, /^[1-9][0-9]*$/); assert.equal(r.status, 'ACTIVE');
    assert.ok(['PLAYDK', 'WAGO'].includes(r.provider)); assert.match(r.identityHash, /^[0-9a-f]{64}$/);
    const tier = tierFor(r.attendanceDays); assert.ok(tier);
    assert.equal(r.tier, tier.minimumDays); assert.equal(r.amount, tier.amount);
    assert.ok(Number.isSafeInteger(Number(r.amount)));
  }
  assert.deepEqual(plan.totals, totalsFor(plan.recipients));
}
export async function receipt(c) {
  const rows = await q(c, 'SELECT value FROM app_meta WHERE key=$1', [OP]);
  return rows.length ? parse(one(rows).value) : null;
}
export async function artifacts(c) {
  return one(await q(c, `SELECT
    (SELECT COUNT(*)::int FROM user_messages WHERE campaign_key=$1) AS messages,
    (SELECT COUNT(*)::int FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id WHERE m.campaign_key=$1) AS rewards,
    (SELECT COUNT(*)::int FROM admin_logs WHERE action_type=$2 AND target_id=$1) AS audits,
    (SELECT COUNT(*)::int FROM app_meta WHERE key=$1) AS receipts,
    (SELECT COUNT(*)::int FROM user_messages WHERE title=ANY($3::text[]) OR body=ANY($4::text[])) AS "matchingMessages",
    (SELECT COUNT(*)::int FROM coin_logs WHERE created_at>='2026-10-26 15:00:00' AND (reason LIKE $5 OR reason=ANY($3::text[]))) AS "matchingDirectCoinLogs"`,
  [OP, ACTION, TIERS.map(t => t.title), TIERS.map(t => t.body), '%' + OP + '%']));
}
export async function currentRecipients(c, plan) {
  const rows = await q(c, `SELECT u.id::text AS "userId",UPPER(TRIM(COALESCE(u.status,'ACTIVE'))) AS status,
    UPPER(TRIM(COALESCE(u.role,'USER'))) AS role,u.coin::text AS coin,s.provider,s.provider_user_id,
    COUNT(*)::int AS "attendanceDays",COUNT(DISTINCT a.attendance_date)::int AS "distinctDays"
    FROM users u JOIN user_second_verifications s ON s.user_id=u.id JOIN attendance_logs a ON a.user_id=u.id
    WHERE (a.claimed_at::timestamp AT TIME ZONE 'UTC')<=$1::timestamptz AND a.attendance_date<=$2
    GROUP BY u.id,s.user_id HAVING COUNT(*)>=50 ORDER BY u.id`, [plan.cutoff, plan.kstDate]);
  return selectRecipients(rows);
}
export async function verify(c, saved, plan, {unclaimed = false} = {}) {
  validatePlan(plan, saved.planHash); assert.equal(saved.operationKey, OP); assert.equal(saved.status, 'COMPLETED');
  assert.deepEqual(saved.plan, plan); assert.equal(saved.directWalletStatements, 0);
  const rows = await q(c, `SELECT m.id::text AS "messageId",m.user_id::text AS "userId",m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,
    r.id::text AS "rewardId",r.user_id::text AS "rewardUserId",r.reward_type,r.reward_amount::text AS amount,r.claimed_at,
    cr.reward_id::text AS "claimRewardId",cr.message_id::text AS "claimMessageId",cr.user_id::text AS "claimUserId",
    cr.reward_type AS "claimType",cr.reward_amount::text AS "claimAmount",cr.balance_after::text AS "claimBalanceAfter"
    FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
    LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id WHERE m.campaign_key=$1 ORDER BY m.user_id`, [OP]);
  assert.deepEqual(rows.map(r => r.userId), plan.recipients.map(r => r.userId), 'Recipient set mismatch');
  assert.equal(new Set(rows.map(r => r.messageId)).size, plan.recipients.length);
  assert.equal(new Set(rows.map(r => r.rewardId)).size, plan.recipients.length);
  assert.equal(saved.messages.length, rows.length);
  const savedByUser = new Map(saved.messages.map(r => [r.userId, r]));
  assert.equal(savedByUser.size, rows.length);
  let total = 0n, claimed = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], target = plan.recipients[i], expected = savedByUser.get(r.userId), tier = tierFor(target.attendanceDays);
    assert.ok(r.rewardId); assert.equal(r.rewardUserId, r.userId);
    assert.equal(r.messageId, expected.messageId); assert.equal(r.rewardId, expected.rewardId);
    assert.equal(r.sender_type, 'ADMIN'); assert.equal(r.message_type, 'COIN_REWARD'); assert.equal(r.reward_type, 'COIN');
    assert.equal(r.amount, target.amount); assert.equal(r.title, tier.title); assert.equal(r.body, tier.body); total += BigInt(r.amount);
    if (unclaimed) { assert.equal(r.claimed_at, null); assert.equal(r.hidden_at, null); assert.equal(Number(r.is_read), 0); }
    if (r.claimed_at) {
      assert.equal(r.claimRewardId, r.rewardId); assert.equal(r.claimMessageId, r.messageId); assert.equal(r.claimUserId, r.userId);
      assert.equal(r.claimType, 'COIN'); assert.equal(r.claimAmount, r.amount); assert.ok(BigInt(r.claimBalanceAfter) >= BigInt(r.amount)); claimed++;
    } else assert.equal(r.claimRewardId, null);
  }
  assert.equal(String(total), plan.totals.totalCoin);
  const audit = one(await q(c, 'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2', [ACTION, OP]));
  assert.equal(audit.id, saved.auditId); assert.equal(audit.admin_id, saved.adminId);
  const {auditId, ...logged} = saved; assert.deepEqual(parse(audit.after_data), logged);
  return {status: 'VERIFIED', ...plan.totals, rewards: rows.length, claimed, pending: rows.length - claimed,
    missing: 0, duplicates: 0, auditId: saved.auditId, noImmediateWalletCredit: true};
}

// Caller owns a single transaction; only messages, attachments, audit and operation receipt are inserted.
export async function send(c, plan, expectedHash) {
  validatePlan(plan, expectedHash);
  const prior = await receipt(c);
  if (prior) return {replayed: true, receipt: prior, verification: await verify(c, prior, plan)};
  await q(c, 'SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [OP]);
  const saved = await receipt(c);
  if (saved) return {replayed: true, receipt: saved, verification: await verify(c, saved, plan)};
  assert.equal(one(await q(c, "SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS day")).day, KST_DATE);
  for (const n of Object.values(await artifacts(c))) assert.equal(n, 0, 'Prior campaign records require reconciliation');
  const columns = await q(c, `SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND
    ((table_name='users' AND column_name='coin') OR (table_name='user_message_rewards' AND column_name='reward_amount') OR
    (table_name='user_message_reward_claim_receipts_v1222' AND column_name IN ('reward_amount','balance_after')) OR
    (table_name='coin_logs' AND column_name IN ('change_amount','balance_after')))`);
  assert.equal(columns.length, 6); assert.ok(columns.every(c => c.data_type === 'bigint'));
  const ids = plan.recipients.map(r => r.userId);
  const before = await q(c, 'SELECT id::text,coin::text,status,role FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE', [ids]);
  assert.equal(before.length, ids.length);
  const identities = await q(c, 'SELECT user_id::text,provider,provider_user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE', [ids]);
  assert.equal(identities.length, ids.length);
  assert.deepEqual(await currentRecipients(c, plan), plan.recipients, 'Eligibility changed since the reviewed cutoff');
  const owner = one(await q(c, "SELECT id::text FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1"));
  const now = one(await q(c, 'SELECT clock_timestamp()::text AS at')).at;
  const payload = plan.recipients.map(r => ({uid: r.userId, amount: r.amount, title: tierFor(r.attendanceDays).title, body: tierFor(r.attendanceDays).body}));
  const messages = await q(c, `INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,created_at)
    SELECT x.uid,'ADMIN',x.title,x.body,'COIN_REWARD',$2,$3
    FROM jsonb_to_recordset($1::jsonb) AS x(uid bigint,title text,body text) ORDER BY x.uid
    RETURNING id::text AS "messageId",user_id::text AS "userId"`, [JSON.stringify(payload), OP, now]);
  assert.equal(messages.length, ids.length);
  const rewards = await q(c, `INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
    SELECT m.id,m.user_id,'COIN',x.amount FROM user_messages m
    JOIN jsonb_to_recordset($1::jsonb) AS x(uid bigint,amount bigint) ON x.uid=m.user_id
    WHERE m.campaign_key=$2 ORDER BY m.user_id
    RETURNING id::text AS "rewardId",message_id::text AS "messageId",user_id::text AS "userId"`, [JSON.stringify(payload), OP]);
  assert.equal(rewards.length, ids.length);
  const rewardByMessage = new Map(rewards.map(r => [r.messageId, r]));
  for (const m of messages) { const r = rewardByMessage.get(m.messageId); assert.equal(r.userId, m.userId); m.rewardId = r.rewardId; }
  messages.sort((a, b) => Number(a.userId) - Number(b.userId));
  assert.deepEqual(await q(c, 'SELECT id::text,coin::text,status,role FROM users WHERE id=ANY($1::bigint[]) ORDER BY id', [ids]), before, 'Account state changed during delivery');
  const result = {status: 'COMPLETED', actor: 'CODEX_OPERATIONS', operationKey: OP, planHash: expectedHash, plan,
    completedAt: now, adminId: owner.id, messages, directWalletStatements: 0, noImmediateWalletCredit: true};
  result.auditId = one(await q(c, `INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
    VALUES($1,$2,'USER_MESSAGE',$3,$4,$5) RETURNING id::text`,
  [owner.id, ACTION, OP, JSON.stringify({messages: 0, rewards: 0, oneTime: true}), JSON.stringify(result)])).id;
  one(await q(c, 'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key', [OP, JSON.stringify(result), now]));
  return {replayed: false, receipt: result, verification: await verify(c, result, plan, {unclaimed: true})};
}
