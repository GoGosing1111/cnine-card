import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Client} from 'pg';

const own = new Set(['sessions','revoked_player_sessions_v1533','user_cards','pve_decks','account_sync_versions_v1']);
const integerIdentity = /^(?:(?:\w+_)?user_id|actor_id|admin_id|attacker_id|buyer_id|defender_id|host_id|opponent_id|seller_id|winner_id|target_id|created_by|updated_by)$/;
const personalName = /^(?:(?:\w+_)?nickname|player_name|user_name)$/;
const quote = name => '"' + name.replaceAll('"','""') + '"';

// Read-only discovery. No DELETE is constructed from inferred column names.
async function otherRecords(db, id, nickname) {
  const {rows} = await db.query("SELECT c.table_name,c.column_name,c.data_type FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema,table_name) WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY 1,2");
  const checks = new Map();
  for (const {table_name: table, column_name: col, data_type: type} of rows) {
    if (own.has(table) || ['users','account_deletion_requests_v1'].includes(table)) continue;
    const numeric = ['integer','bigint','smallint','numeric'].includes(type) && integerIdentity.test(col);
    const name = ['character varying','text'].includes(type) && personalName.test(col);
    if (!numeric && !name) continue;
    if (!checks.has(table)) checks.set(table, []);
    checks.get(table).push(quote(col) + (numeric ? '=$1::bigint' : '=$2::text'));
  }
  const found = [];
  const entries = [...checks];
  for (let i=0; i<entries.length; i+=12) {
    const batch = entries.slice(i,i+12);
    const parts = batch.map(([table,conditions],k) => 'SELECT '+k+' AS pos WHERE EXISTS (SELECT 1 FROM public.'+quote(table)+' WHERE '+conditions.join(' OR ')+')');
    const hits=await db.query('WITH args AS (SELECT $1::bigint,$2::text) '+parts.join(' UNION ALL '),[id,nickname]);
    found.push(...hits.rows.map(r=>batch[r.pos][0]));
  }
  const meta = await db.query("SELECT EXISTS(SELECT 1 FROM app_meta WHERE $1::text=ANY(string_to_array(key,':')) OR $1::text=ANY(string_to_array(key,'|'))) AS hit",[String(id)]);
  if(meta.rows[0].hit)found.push('app_meta');
  return found;
}

export async function fulfillAccountDeletion(db, {id, receipt, action='preview', reviewed=false}) {
  if (!Number.isSafeInteger(id) || id<1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt) || !['preview','freeze','retire'].includes(action)) throw Error('Invalid account, receipt or action');
  const hash=createHash('sha256').update(receipt.toLowerCase()).digest('hex');
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await db.query("SET LOCAL lock_timeout='3s'");
    await db.query("SET LOCAL statement_timeout='15s'");
    const q=await db.query("SELECT phase, user_id, locked_at IS NOT NULL AS frozen, locked_at < CURRENT_TIMESTAMP-INTERVAL '60 seconds' AS drained FROM account_deletion_requests_v1 WHERE receipt_hash=$1 FOR UPDATE",[hash]);
    const job=q.rows[0];
    if (!job || Number(job.user_id)!==id || job.phase!=='pending') throw Error('An exact pending request is required');
    const u=await db.query("SELECT nickname,role,status FROM users WHERE id=$1 FOR UPDATE",[id]);
    const user=u.rows[0];
    if (!user || user.role!=='USER') throw Error('Operator or missing account requires separate review');
    if (action==='freeze') {
      if (!job.frozen && user.status!=='ACTIVE') throw Error('Review the existing account restriction first');
      await db.query("UPDATE users SET status='DELETION_PENDING' WHERE id=$1",[id]);
      await db.query('DELETE FROM sessions WHERE user_id=$1',[id]);
      await db.query('UPDATE account_deletion_requests_v1 SET locked_at=COALESCE(locked_at,CURRENT_TIMESTAMP) WHERE receipt_hash=$1',[hash]);
      await db.query('COMMIT');
      return {frozen:true};
    }
    const blockers=await otherRecords(db,id,user.nickname);
    if (action==='preview' || blockers.length) {
      await db.query('ROLLBACK');
      return {eligible: !blockers.length, frozen: job.frozen, drained:job.drained===true, blockers};
    }
    if (!reviewed || !job.drained || user.status!=='DELETION_PENDING') throw Error('Review external/shared records and drain the frozen session first');
    // Only these rows are exclusively owned. User/card FK cascades settle in this transaction.
    for (const table of ['revoked_player_sessions_v1533','pve_decks','user_cards','sessions']) {
      await db.query('DELETE FROM '+quote(table)+' WHERE user_id=$1',[id]);
    }
    const removed=await db.query("DELETE FROM users WHERE id=$1 AND status='DELETION_PENDING' AND role='USER'",[id]);
    if(removed.rowCount!==1)throw Error('Account retirement precondition changed');
    await db.query('DELETE FROM account_sync_versions_v1 WHERE user_id=$1',[id]); // DELETE triggers also stamp changes.
    await db.query("UPDATE account_deletion_requests_v1 SET phase='retiring',receipt=NULL,retired_at=CURRENT_TIMESTAMP WHERE receipt_hash=$1 AND user_id=$2",[hash,id]);
    await db.query('COMMIT');
    return {retired:true, externalCleanup:'queued'};
  } catch(error) {await db.query('ROLLBACK'); throw error;}
}

// In production use the authorized staff PostgreSQL role. Receipt input stays out of shell history.
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const action=process.argv[2] || 'list';
  const db=new Client({connectionString:process.env.DATABASE_URL});
  try {
    await db.connect();
    if(action==='list') console.table((await db.query("SELECT user_id,phase,requested_at,locked_at FROM account_deletion_requests_v1 WHERE phase<>'completed' ORDER BY requested_at")).rows);
    else {
      let input='';for await(const part of process.stdin)input+=part;
      const request=JSON.parse(input);
      const result=await fulfillAccountDeletion(db,{...request,action});
      console.log(JSON.stringify(result));
      if(result.eligible===false)process.exitCode=2;
    }
  } catch(error) {console.error('Account deletion operation failed:',error.code || error.name);process.exitCode=1;}
  finally {await db.end().catch(()=>{});}
}
