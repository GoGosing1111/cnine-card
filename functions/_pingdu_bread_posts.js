import {DAYS, fail} from './_pingdu_bread_store.js';

const POSTS = 'pingdu_bread_posts_v1';
export const GRANTS = 'pingdu_bread_grants_v1';

export async function preparePostLedger(q) {
  await q(`ALTER TABLE ${DAYS} ADD COLUMN IF NOT EXISTS post_ids TEXT[],
    ADD COLUMN IF NOT EXISTS new_posts INTEGER, ADD COLUMN IF NOT EXISTS legacy_post_cutoff TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS legacy_review JSONB`);
  await q(`CREATE TABLE IF NOT EXISTS ${POSTS} (
    post_id TEXT PRIMARY KEY, user_id BIGINT NOT NULL, day DATE NOT NULL, first_review TEXT NOT NULL,
    paid_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS ${GRANTS} (
    user_id BIGINT NOT NULL, day DATE NOT NULL, evidence TEXT NOT NULL, quantity INTEGER NOT NULL,
    remaining INTEGER NOT NULL CHECK(remaining>=0 AND remaining<=quantity), pool TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(user_id,day,evidence))`);
  await q(`CREATE INDEX IF NOT EXISTS pingdu_bread_fifo ON ${GRANTS}(user_id,day,granted_at) WHERE remaining>0`);
  // Old paid days only have a numeric count. Only later-created posts can be proven additional.
  await q(`UPDATE ${DAYS} SET legacy_review=jsonb_build_object('revision',revision,'checkedAt',checked_at,'posts',posts,
    'seconds',seconds,'boardStatus',board_status,'watchStatus',watch_status,'identityHash',identity_hash,
    'settledAt',settled_at,'settledBy',settled_by) WHERE post_ids IS NULL AND legacy_review IS NULL`);
  await q(`INSERT INTO ${GRANTS}(user_id,day,evidence,quantity,remaining,pool,granted_at)
    SELECT user_id,day,revision,granted,remaining,pool,settled_at FROM ${DAYS}
    WHERE settled_at IS NOT NULL AND post_ids IS NULL AND legacy_post_cutoff IS NULL ON CONFLICT DO NOTHING`);
  await q(`UPDATE ${DAYS} SET legacy_post_cutoff=checked_at,post_ids='{}',new_posts=0,posts=0
    WHERE settled_at IS NOT NULL AND post_ids IS NULL AND legacy_post_cutoff IS NULL`);
  await q(`UPDATE ${DAYS} SET revision=revision||'/verify',posts=NULL,board_status='UNAVAILABLE'
    WHERE settled_at IS NULL AND post_ids IS NULL AND posts IS NOT NULL`);
}

// Only an operator collection registers IDs. Player lookups can display evidence without using it.
export async function outstandingPosts(q,userId,day,posts,review,cutoff) {
  const eligible=posts.filter(post=>!cutoff || Date.parse(post.createdAt)>Date.parse(cutoff));
  const ids=eligible.map(post=>post.id);
  if (!ids.length) return {ids:[],fresh:0};
  if (review) await q(`INSERT INTO ${POSTS}(post_id,user_id,day,first_review)
    SELECT split_part(id,'/',2),$2,$3,$4 FROM unnest($1::text[]) id ORDER BY 1 ON CONFLICT(post_id) DO NOTHING`,[ids,userId,day,review]);
  const rows=await q(`SELECT list.id, (p.post_id IS NULL OR p.first_review=$4) AS fresh
    FROM unnest($1::text[]) WITH ORDINALITY AS list(id,position) LEFT JOIN ${POSTS} p ON p.post_id=split_part(list.id,'/',2)
    WHERE p.post_id IS NULL OR (p.user_id=$2 AND p.day=$3 AND p.paid_at IS NULL) ORDER BY list.position`,[ids,userId,day,review]);
  return {ids:rows.map(row=>row.id),fresh:rows.filter(row=>row.fresh).length};
}

// Callers have locked the affected users and checked the evidence revisions and reward policy.
// Spending the exact posts, crediting the lot, and writing its audit share one database transaction.
export async function applyBreadGrants(q,day,actorId,pool,plans,batchId=null) {
  if (!plans.length) return;
  await q(`INSERT INTO ${POSTS}(post_id,user_id,day,first_review)
    SELECT split_part(ids.id,'/',2),d.user_id,d.day,p.revision FROM jsonb_to_recordset($1::jsonb) AS p(id bigint,revision text,take integer)
    JOIN ${DAYS} d ON d.user_id=p.id AND d.day=$2 AND d.revision=p.revision
    CROSS JOIN LATERAL unnest(d.post_ids[1:p.take]) ids(id) ORDER BY 1 ON CONFLICT(post_id) DO NOTHING`,[JSON.stringify(plans),day]);
  const result=await q(`WITH plans AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS p(id bigint,revision text,quantity integer,take integer)
  ), checked AS (
    SELECT p.*,d.post_ids[1:p.take] AS used FROM plans p JOIN ${DAYS} d ON d.user_id=p.id AND d.day=$2
    WHERE d.revision=p.revision AND p.take BETWEEN 0 AND COALESCE(cardinality(d.post_ids),0)
    AND p.quantity>0 AND d.granted+p.quantity<=10000
  ), used AS (
    SELECT c.id,split_part(k,'/',2) AS post_id FROM checked c CROSS JOIN LATERAL unnest(c.used) k
  ), spent AS (
    UPDATE ${POSTS} s SET paid_at=CURRENT_TIMESTAMP FROM used u
    WHERE s.post_id=u.post_id AND s.user_id=u.id AND s.day=$2 AND s.paid_at IS NULL RETURNING s.user_id
  ), credited AS (
    UPDATE ${DAYS} d SET granted=d.granted+c.quantity,remaining=d.remaining+c.quantity,
      post_ids=d.post_ids[c.take+1:cardinality(d.post_ids)],posts=d.posts-c.take,new_posts=0,
      revision=c.revision||'/paid',settled_by=$3,settled_at=CURRENT_TIMESTAMP,pool=$4
    FROM checked c WHERE d.user_id=c.id AND d.day=$2 AND c.take=(SELECT COUNT(*) FROM spent s WHERE s.user_id=c.id)
    RETURNING c.id,c.revision,c.quantity,c.take,d.settled_at
  ), lots AS (
    INSERT INTO ${GRANTS}(user_id,day,evidence,quantity,remaining,pool,granted_at)
    SELECT id,$2,revision,quantity,quantity,$4,settled_at FROM credited RETURNING user_id
  ) INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
    SELECT $3,'PINGDU_BREAD_SETTLE','USER',id::text,NULL,jsonb_build_object('day',$2::date,'granted',quantity,
      'revision',revision,'settledAt',settled_at,'posts',take,'batchId',$5::text)::text FROM credited RETURNING target_id`,
    [JSON.stringify(plans),day,actorId,pool,batchId]);
  if (result.length!==plans.length) fail('활동 기록 또는 하루 지급 한도가 변경됐습니다. 다시 집계하세요.');
}

export async function verifyPendingPosts(services,env,day,rows) {
  const targets=rows.flatMap(row=>(row.ids||[]).map(id=>({id,author:row.provider_user_id})));
  if (!targets.length) return new Set();
  try {
    return await services.playdkIdentityClient(env).verifyBreadPosts(day,targets);
  } catch {
    fail('PLAY DK에서 글 공개 상태를 다시 확인하지 못했습니다. 잠시 후 지급을 다시 시도하세요.',503);
  }
}
