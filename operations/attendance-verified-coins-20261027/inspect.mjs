import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {connect, safeError} from './connect.mjs';

const directory = path.resolve(process.argv[2]);
mkdirSync(directory, {recursive: true});
let db;
try {
  db = await connect();
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout='30s'");
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const [clock] = await q("SELECT CURRENT_TIMESTAMP::text cutoff, to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS \"kstDate\"");
  assert.equal(clock.kstDate, '2026-10-27');
  const accounts = await q(`SELECT u.id::text AS "userId", u.nickname, UPPER(TRIM(COALESCE(u.status,'ACTIVE'))) AS status,
    UPPER(TRIM(COALESCE(u.role,'USER'))) AS role, u.coin::text AS coin,
    s.provider, s.provider_user_id, s.verified_at, COUNT(a.user_id)::int AS "attendanceDays",
    COUNT(DISTINCT a.attendance_date)::int AS "distinctDays", MIN(a.attendance_date) AS "firstAttendance", MAX(a.attendance_date) AS "lastAttendance"
    FROM users u LEFT JOIN user_second_verifications s ON s.user_id=u.id
    LEFT JOIN attendance_logs a ON a.user_id=u.id AND a.claimed_at::timestamptz<=$1::timestamptz AND a.attendance_date<=$2
    GROUP BY u.id,s.user_id HAVING COUNT(a.user_id)>=50 OR s.user_id IS NOT NULL ORDER BY u.id`, [clock.cutoff, clock.kstDate]);
  const anomalies = await q(`SELECT COUNT(*) FILTER(WHERE attendance_date>$1)::int AS "futureDates",
    COUNT(*) FILTER(WHERE claimed_at IS NULL)::int AS "nullClaims" FROM attendance_logs`, [clock.kstDate]);
  const existing = await q(`SELECT m.campaign_key, m.title, r.reward_type, r.reward_amount::text AS amount,
    COUNT(*)::int AS count, MIN(m.created_at) AS first, MAX(m.created_at) AS last
    FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
    WHERE m.title LIKE '%출석%' OR m.body LIKE '%누적출석%' OR m.body LIKE '%누적 출석%' OR m.campaign_key ILIKE '%attendance%'
    GROUP BY m.campaign_key,m.title,r.reward_type,r.reward_amount ORDER BY MIN(m.id)`);
  const completedKeys = await q("SELECT key FROM app_meta WHERE key ILIKE '%attendance%' OR key ILIKE '%50day%' ORDER BY key");
  const columns = await q(`SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('attendance_logs','user_second_verifications','user_messages','user_message_rewards','user_message_reward_claim_receipts_v1222') ORDER BY table_name,ordinal_position`);
  const triggers = await q(`SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition,pg_get_functiondef(t.tgfoid) AS function
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname IN ('user_messages','user_message_rewards','admin_logs','app_meta')
    AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`);
  const indexes = await q("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('attendance_logs','user_messages','user_message_rewards') ORDER BY tablename,indexname");
  await db.query('ROLLBACK');
  const recipients = accounts.filter(r => r.status === 'ACTIVE' && r.provider && r.attendanceDays >= 50);
  const tier50 = recipients.filter(r => r.attendanceDays < 100), tier100 = recipients.filter(r => r.attendanceDays >= 100);
  const summary = {clock, eligible: recipients.length, tier50: tier50.length, tier100: tier100.length,
    totalCoin: String(BigInt(tier50.length)*20000000000000n+BigInt(tier100.length)*40000000000000n),
    excludedUnverifiedOver50: accounts.filter(r=>r.attendanceDays>=50&&!r.provider).length,
    excludedInactiveOver50: accounts.filter(r=>r.attendanceDays>=50&&r.provider&&r.status!=='ACTIVE').length,
    roles: recipients.reduce((a,r)=>(a[r.role]=(a[r.role]||0)+1,a),{}),
    providers: recipients.reduce((a,r)=>(a[r.provider]=(a[r.provider]||0)+1,a),{}),
    duplicateAttendance: accounts.filter(r=>r.attendanceDays!==r.distinctDays).length,
    unsafeBalances: recipients.filter(r=>BigInt(r.coin)<0n||BigInt(r.coin)+(r.attendanceDays>=100?40000000000000n:20000000000000n)>BigInt(Number.MAX_SAFE_INTEGER)).length,
    anomalies,existing,completedKeys,triggers:triggers.map(t=>({table:t.relname,name:t.tgname}))};
  writeFileSync(path.join(directory,'inspection.json'),JSON.stringify({summary,accounts,columns,triggers,indexes},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(summary,null,2));
} catch(error) {
  await db?.query('ROLLBACK').catch(()=>{});
  console.error(JSON.stringify(safeError(error))); process.exitCode=1;
} finally { await db?.end(); }
