import {SOOP_WATCH_PREFIX} from './_soop_watch.js';
import {DAYS, fail, whole, transaction, pool, snapshotPool, linkedIdentity, signature} from './_pingdu_bread_store.js';
import {GRANTS, applyBreadGrants, verifyPendingPosts} from './_pingdu_bread_posts.js';

const RUNS = 'pingdu_bread_batches_v1';
const ENTRIES = 'pingdu_bread_batch_entries_v1';
const DEFAULTS = {postsPerBread:1, minutesPerBread:60, dailyCap:10000};
const CHUNK = 5;

export async function prepareBreadBatches(q) {
  await q(`CREATE TABLE IF NOT EXISTS ${RUNS} (
    seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, id TEXT NOT NULL UNIQUE, day DATE NOT NULL,
    rules TEXT NOT NULL, pool_revision TEXT NOT NULL, created_by BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, paid_by BIGINT, paid_at TIMESTAMPTZ)`);
  await q(`CREATE INDEX IF NOT EXISTS pingdu_bread_batches_by_day ON ${RUNS}(day,seq DESC)`);
  await q(`CREATE TABLE IF NOT EXISTS ${ENTRIES} (
    run_id TEXT NOT NULL REFERENCES ${RUNS}(id), user_id BIGINT NOT NULL, status TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0, revision TEXT, reason TEXT,
    lease TEXT, lease_until TIMESTAMPTZ, PRIMARY KEY(run_id,user_id))`);
  await q(`CREATE INDEX IF NOT EXISTS pingdu_bread_batch_work ON ${ENTRIES}(run_id,status,user_id)`);
  await q(`ALTER TABLE ${ENTRIES} ADD COLUMN IF NOT EXISTS take_posts INTEGER,
    ADD COLUMN IF NOT EXISTS new_posts INTEGER, ADD COLUMN IF NOT EXISTS carry_posts INTEGER`);
  await q(`UPDATE ${ENTRIES} e SET status='held',quantity=0,lease=NULL,lease_until=NULL, reason='공개 글 기준으로 다시 집계하세요.'
    FROM ${RUNS} r WHERE e.run_id=r.id AND r.paid_at IS NULL AND e.take_posts IS NULL`);
}

function readRules(value) {
  return {
    postsPerBread:whole(value?.postsPerBread,10000,'한 마리당 게시글 수'),
    minutesPerBread:whole(value?.minutesPerBread,10080,'한 마리당 시청 분'),
    dailyCap:whole(value?.dailyCap,10000,'계정별 하루 지급 한도')
  };
}

async function current(q, day, lock = false) {
  if (lock) await q('SELECT pg_advisory_xact_lock(hashtext($1))',['pingdu-bread-batch:'+day]);
  const [run] = await q(`SELECT *,day::text AS day_key FROM ${RUNS} WHERE day=$1 ORDER BY seq DESC LIMIT 1`,[day]);
  return run;
}
function match(run, id) {
  if (!run || run.id !== id) fail('이 날짜의 집계가 바뀌었습니다. 최신 집계를 확인하세요.');
}
async function summary(q, run) {
  const counts = {pending:0,checking:0,ready:0,held:0,zero:0,previous:0,paid:0};
  const totals = await q(`SELECT status,COUNT(*) AS n,SUM(quantity) AS quantity,SUM(new_posts) AS fresh,SUM(carry_posts) AS carry FROM ${ENTRIES}
    WHERE run_id=$1 GROUP BY status`,[run.id]);
  let amount = 0, paidAmount = 0, newPosts=0, carryPosts=0;
  for (const row of totals) {
    counts[row.status] = Number(row.n);
    newPosts+=Number(row.fresh); carryPosts+=Number(row.carry);
    if (row.status === 'ready') amount = Number(row.quantity);
    if (row.status === 'paid') paidAmount = Number(row.quantity);
  }
  const held = counts.held ? await q(`SELECT e.user_id,u.nickname,e.reason FROM ${ENTRIES} e
    LEFT JOIN users u ON u.id=e.user_id WHERE e.run_id=$1 AND e.status='held' ORDER BY e.user_id LIMIT 25`,[run.id]) : [];
  return {id:run.id,day:run.day_key,rules:JSON.parse(run.rules),paidAt:run.paid_at,
    counts,total:Object.values(counts).reduce((a,b)=>a+b,0),amount,paidAmount,newPosts,carryPosts,
    held:held.map(row=>({userId:Number(row.user_id),nickname:row.nickname,reason:row.reason}))};
}
async function start(env, actorId, day, body) {
  const rules = readRules(body.rules), id = body.id;
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) fail('집계 요청 번호를 확인하세요.',400);
  return transaction(env, async q => {
    const prior = await current(q,day,true);
    if (prior?.id === id) return summary(q, prior);
    if ((prior?.id ?? null) !== body.previousId) fail('새 집계가 이미 있습니다. 최신 집계를 확인하세요.');
    const config = await pool(q,true);
    if (!config.revision || !config.items.length) fail('개봉 보상을 먼저 설정하세요.');
    const [run] = await q(`INSERT INTO ${RUNS}(id,day,rules,pool_revision,created_by) VALUES($1,$2,$3,$4,$5)
      RETURNING *,day::text AS day_key`,[id,day,JSON.stringify(rules),config.revision,actorId]);
    // Snapshot the entire eligible population independently of the CMS search and pagination.
    await q(`INSERT INTO ${ENTRIES}(run_id,user_id,status)
      SELECT $1,u.id,'pending' FROM users u
      LEFT JOIN ${DAYS} d ON d.user_id=u.id AND d.day=$2 WHERE u.status='ACTIVE' AND
      (d.user_id IS NOT NULL OR EXISTS (SELECT 1 FROM user_second_verifications v
        WHERE v.user_id=u.id AND v.provider='PLAYDK' AND v.provider_user_id IS NOT NULL))`,[id,day]);
    return summary(q,run);
  });
}
function classify(activity,rules) {
  const newPosts=activity.newPosts??0, carryPosts=(activity.posts??0)-newPosts;
  if (activity.boardStatus==='UNAVAILABLE' || (!activity.settledAt && activity.watchStatus==='UNAVAILABLE'))
    return {status:'held',reason:'활동 조회 실패',newPosts,carryPosts};
  const posts=Math.floor((activity.posts??0)/rules.postsPerBread);
  const watch=activity.settledAt ? 0 : Math.floor((activity.seconds??0)/(60*rules.minutesPerBread));
  const quantity=Math.min(Math.max(0,rules.dailyCap-activity.granted),posts+watch);
  const take=Math.min(quantity,posts)*rules.postsPerBread;
  return {status:quantity ? 'ready' : activity.settledAt ? 'previous' : 'zero',quantity,take,newPosts,carryPosts,revision:activity.revision};
}
async function collect(env,day,id,services,review) {
  const lease = crypto.randomUUID();
  const {run,ids} = await transaction(env, async q => {
    const run = await current(q,day,true);
    match(run,id);
    if (run.paid_at) return {run,ids:[]};
    const rows = await q(`UPDATE ${ENTRIES} e SET status='checking',lease=$2,lease_until=CURRENT_TIMESTAMP+INTERVAL '45 seconds'
      FROM (SELECT user_id FROM ${ENTRIES} WHERE run_id=$1 AND
      (status='pending' OR (status='checking' AND lease_until<=CURRENT_TIMESTAMP)) ORDER BY user_id LIMIT $3) candidates
      WHERE e.run_id=$1 AND e.user_id=candidates.user_id RETURNING e.user_id`,[id,lease,CHUNK]);
    return {run,ids:rows.map(row=>Number(row.user_id))};
  });
  if (ids.length) {
    const {boardSlugs} = await services.playdkDailyQuestSettings(env);
    const rules = JSON.parse(run.rules);
    const entries = await Promise.all(ids.map(async userId => {
      try { return {userId,...classify(await review(env,userId,day,services,boardSlugs,run.id),rules)}; }
      catch (error) {
        return {userId,status:'held',reason:error.breadError ? error.message : '활동 조회 실패'};
      }
    }));
    await transaction(env, q => q(`UPDATE ${ENTRIES} e SET status=r.status,quantity=r.quantity,
      revision=r.revision,reason=r.reason,take_posts=r.take,new_posts=r."newPosts",carry_posts=r."carryPosts",lease=NULL,lease_until=NULL
      FROM jsonb_to_recordset($3::jsonb) AS r("userId" bigint,status text,quantity integer,revision text,reason text,take integer,"newPosts" integer,"carryPosts" integer)
      WHERE e.run_id=$1 AND e.lease=$2 AND e.user_id=r."userId"`,
      [id,lease,JSON.stringify(entries.map(entry=>({quantity:0,take:0,newPosts:0,carryPosts:0,...entry})))]));
  }
  return transaction(env, async q => {
    const latest=await current(q,day);
    match(latest,id);
    return summary(q,latest);
  });
}

async function pay(env,actorId,day,body,services) {
  const {boardSlugs} = await services.playdkDailyQuestSettings(env);
  const inspected=await transaction(env,async q=>{
    const run=await current(q,day);
    match(run,body.id);
    const preview=await summary(q,run);
    if (run.paid_at) return {receipt:preview};
    if (preview.counts.pending || preview.counts.checking) fail('전체 활동 집계가 끝난 다음 지급하세요.');
    if (!preview.counts.ready || preview.counts.ready!==body.accounts || preview.amount!==body.amount) fail('최신 지급 인원과 합계를 확인하세요.');
    const rows=await q(`SELECT d.post_ids[1:e.take_posts] AS ids,v.provider_user_id FROM ${ENTRIES} e
      JOIN ${DAYS} d ON d.user_id=e.user_id AND d.day=$2 AND d.revision=e.revision
      LEFT JOIN user_second_verifications v ON v.user_id=e.user_id AND v.provider='PLAYDK'
      WHERE e.run_id=$1 AND e.status='ready' AND e.take_posts>0`,[run.id,day]);
    return {rows};
  });
  if (inspected.receipt) return inspected.receipt;
  const live=await verifyPendingPosts(services,env,day,inspected.rows);
  return transaction(env, async q => {
    const run = await current(q,day,true);
    match(run,body.id);
    const preview = await summary(q,run);
    if (run.paid_at) return preview;
    if (preview.counts.pending || preview.counts.checking) fail('전체 활동 집계가 끝난 다음 지급하세요.');
    if (!preview.counts.ready || preview.counts.ready !== body.accounts || preview.amount !== body.amount) fail('최신 지급 인원과 합계를 확인하세요.');
    const config = await pool(q,true);
    await snapshotPool(q,config,run.pool_revision);
    // Individual settlement and activity refresh take the same user lock before changing a day.
    await q(`SELECT u.id FROM users u JOIN ${ENTRIES} e ON e.user_id=u.id AND e.run_id=$1
      WHERE e.status='ready' ORDER BY u.id FOR UPDATE OF u`,[run.id]);
    const entries = await q(`SELECT e.user_id AS id,e.revision,e.quantity,e.take_posts,d.post_ids[1:e.take_posts] AS ids,
      d.revision AS day_revision,d.identity_hash,g.evidence,u.status,v.provider_user_id,m.value FROM ${ENTRIES} e LEFT JOIN users u ON u.id=e.user_id
      LEFT JOIN ${DAYS} d ON d.user_id=e.user_id AND d.day=$2
      LEFT JOIN ${GRANTS} g ON g.user_id=e.user_id AND g.day=$2 AND e.revision=g.evidence
      LEFT JOIN user_second_verifications v ON v.user_id=u.id AND v.provider='PLAYDK'
      LEFT JOIN app_meta m ON m.key=$3||u.id::text WHERE e.run_id=$1 AND e.status='ready'`,[run.id,day,SOOP_WATCH_PREFIX]);
    const previous=[], changed=[], hidden=[], plans=[];
    await Promise.all(entries.map(async row => {
      if (row.evidence) previous.push(row.id);
      else if (row.status !== 'ACTIVE' || row.revision !== row.day_revision ||
        await signature(linkedIdentity(row),boardSlugs) !== row.identity_hash) changed.push(row.id);
      else if (row.ids?.some(id=>!live.has(id))) hidden.push(row.id);
      else plans.push({id:row.id,revision:row.revision,quantity:row.quantity,take:row.take_posts});
    }));
    if (previous.length) await q(`UPDATE ${ENTRIES} SET status='previous' WHERE run_id=$1 AND user_id=ANY($2::bigint[])`,[run.id,previous]);
    if (changed.length) await q(`UPDATE ${ENTRIES} SET status='held',reason='계정 연결 또는 활동 변경' WHERE run_id=$1 AND user_id=ANY($2::bigint[])`,[run.id,changed]);
    if (hidden.length) await q(`UPDATE ${ENTRIES} SET status='held',reason='글 공개 상태 변경 · 다시 집계하세요.' WHERE run_id=$1 AND user_id=ANY($2::bigint[])`,[run.id,hidden]);
    await applyBreadGrants(q,day,actorId,config.revision,plans,run.id);
    await q(`UPDATE ${ENTRIES} SET status='paid' WHERE run_id=$1 AND status='ready'`,[run.id]);
    const [done] = await q(`UPDATE ${RUNS} SET paid_by=$2,paid_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *,day::text AS day_key`,[run.id,actorId]);
    const receipt = await summary(q,done);
    await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'PINGDU_BREAD_BATCH','EVENT',$2,NULL,$3)",
      [actorId,run.id,JSON.stringify({day,rules:receipt.rules,counts:receipt.counts,paidAmount:receipt.paidAmount})]);
    return receipt;
  });
}

export function breadBatch(action,env,actorId,day,body,services,review) {
  if (action === 'batch-start') return start(env,actorId,day,body);
  if (action === 'batch-step') return collect(env,day,body.id,services,review);
  if (action === 'batch-pay') return pay(env,actorId,day,body,services);
  return transaction(env, async q => {
    const run=await current(q,day);
    const [latest]=await q(`SELECT rules FROM ${RUNS} ORDER BY seq DESC LIMIT 1`);
    return {batch:run ? await summary(q,run) : null, defaults:latest ? JSON.parse(latest.rules) : DEFAULTS};
  });
}
