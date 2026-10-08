import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LEGACY_MAX_RANK_TICKS,MAX_RANK_TICKS,publicAccountRank} from '../../functions/_account_rank.js';
import {RANK_REFORM_NOTICE_TITLE as TITLE,RANK_REFORM_NOTICE_BODY as BODY} from '../../shared/account-rank-reform-notice-20261008.mjs';
export const MIGRATION_KEY='ops:account-rank-reform:20261008:cap-v1';
export const NOTICE_KEY='ops:account-rank-reform:20261008:notice-v1';
export const CAMPAIGN='account-rank-reform-20261008';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const saved=async(c,key)=>{const row=(await c.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0];return row?JSON.parse(row.value):null;};
const progress=async c=>(await c.query(`SELECT COUNT(*)::int accounts,COALESCE(SUM(total_ticks),0)::text ticks_sum,COALESCE(MAX(total_ticks),0)::text max_ticks,
 COUNT(*) FILTER(WHERE total_ticks=$1)::int legacy_marshals,
 md5(COALESCE(string_agg(user_id::text||':'||total_ticks::text,',' ORDER BY user_id),'')) fingerprint FROM account_rank_progress_v1`,[LEGACY_MAX_RANK_TICKS])).rows[0];
const constraints=async c=>(await c.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='account_rank_progress_v1'::regclass AND contype='c' ORDER BY conname")).rows;
export async function inspectRankReform(c){
 const p=await progress(c),cs=await constraints(c);
 const notices=(await c.query('SELECT COUNT(*)::int count FROM user_messages WHERE campaign_key=$1',[CAMPAIGN])).rows[0].count;
 const distribution=(await c.query('SELECT total_ticks,COUNT(*)::int count FROM account_rank_progress_v1 GROUP BY total_ticks')).rows;
 const ranks={};for(const r of distribution){const name=publicAccountRank(r.total_ticks).name;ranks[name]=(ranks[name]||0)+r.count;}
 return {progress:p,constraints:cs,newRankDistribution:ranks,legacyMarshal:publicAccountRank(LEGACY_MAX_RANK_TICKS),migration:await saved(c,MIGRATION_KEY),notice:await saved(c,NOTICE_KEY),noticeCount:notices};
}
export async function migrateRankCap(c){
 await c.query('BEGIN');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='30s'");
  await c.query('LOCK TABLE account_rank_progress_v1 IN ACCESS EXCLUSIVE MODE');
  const existing=await saved(c,MIGRATION_KEY),before=await progress(c),cs=(await constraints(c)).filter(r=>r.definition.includes('total_ticks'));
  assert.equal(cs.length,1,'Expected one progress range constraint');
  if(existing){assert.ok(cs[0].definition.includes(String(MAX_RANK_TICKS)));await c.query('COMMIT');return {...existing,replayed:true};}
  assert.ok(cs[0].definition.includes(String(LEGACY_MAX_RANK_TICKS))||cs[0].definition.includes(String(MAX_RANK_TICKS)),'Unexpected existing XP cap');
  assert.ok(Number(before.max_ticks)<=MAX_RANK_TICKS);
  if(!cs[0].definition.includes(String(MAX_RANK_TICKS))){
   const name=cs[0].conname.replaceAll('"','""');
   await c.query(`ALTER TABLE account_rank_progress_v1 DROP CONSTRAINT "${name}"`);
   await c.query(`ALTER TABLE account_rank_progress_v1 ADD CONSTRAINT account_rank_progress_v1_total_ticks_check CHECK(total_ticks>=0 AND total_ticks<=${MAX_RANK_TICKS})`);
  }
  const after=await progress(c);assert.deepEqual(after,before,'Migration changed existing experience');
  const result={status:'COMPLETED',operationKey:MIGRATION_KEY,previousCap:LEGACY_MAX_RANK_TICKS,newCap:MAX_RANK_TICKS,before,after,experiencePreserved:true,extraHistoryRebuilt:false,completedAt:new Date().toISOString()};
  await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[MIGRATION_KEY,JSON.stringify(result)]);
  await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
}
export async function publishRankNotice(c){
 await c.query('BEGIN');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='30s'");
  const reservation=await c.query("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key",[NOTICE_KEY]);
  if(!reservation.rows.length){const result=await saved(c,NOTICE_KEY);assert.equal(result.status,'COMPLETED');await c.query('COMMIT');return {...result,replayed:true};}
  assert.ok(await saved(c,MIGRATION_KEY),'XP cap migration must complete first');
  const before=Number((await c.query('SELECT COUNT(*) n FROM user_messages WHERE campaign_key=$1',[CAMPAIGN])).rows[0].n);assert.equal(before,0);
  const users=(await c.query("SELECT id FROM users WHERE UPPER(COALESCE(status,''))='ACTIVE' ORDER BY id")).rows.map(r=>String(r.id));assert.ok(users.length);
  const owner=(await c.query("SELECT id FROM users WHERE UPPER(COALESCE(role,''))='OWNER' AND UPPER(COALESCE(status,''))='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert.ok(owner);
  const inserted=await c.query("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) SELECT id,'ADMIN',$2,$3,'NOTICE',$4 FROM unnest($1::bigint[]) AS id ORDER BY id RETURNING id",[users,TITLE,BODY,CAMPAIGN]);assert.equal(inserted.rows.length,users.length);
  const result={status:'COMPLETED',campaign:CAMPAIGN,title:TITLE,bodySha256:digest(BODY),recipients:users.length,recipientSha256:digest(users),rewardMessages:0,completedAt:new Date().toISOString()};
  await c.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'ACCOUNT_RANK_REFORM_NOTICE','USER_MESSAGE',$2,$3,$4)",[owner.id,CAMPAIGN,JSON.stringify({messages:0}),JSON.stringify(result)]);
  await c.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1',[NOTICE_KEY,JSON.stringify(result)]);
  await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
}
