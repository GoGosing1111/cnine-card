import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {verify as verifyStars,receipt as starReceipt,OP as STAR_OP} from '../tmoney-master-star-10b-20261103/grant.mjs';
import {verify,receipt,OP,PLAN} from './grant.mjs';
import {readAccountRank,publicAccountRank} from '../../output/revan-live-20261027/release-checkout/functions/_account_rank.js';
const db=connect();db.connectionParameters.application_name='tmoney-major1-20261103-independent';
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const [stars,rank]=[await verifyStars(db),await verify(db)];const sr=await starReceipt(db),rr=await receipt(db);
 const current=(await db.query("SELECT u.id::text,u.nickname,u.card_shards::text,COALESCE((SELECT quantity::text FROM cnine_user_inventory WHERE user_id=u.id AND item_code='MASTER_STAR'),'0') AS master_stars,(SELECT total_ticks::text FROM account_rank_progress_v1 WHERE user_id=u.id) AS total_ticks FROM users u WHERE u.id=5147")).rows[0];assert.equal(current.nickname,'T-Money™');
 let reads=0;
 const env={RUNTIME_DB_CACHE_SCOPE:OP,DB:{
  execSchema:async()=>{},
  prepare(sql){
   assert.match(sql,/^SELECT\b/);
   return {bind(...args){return {async first(){
    let n=0;reads++;
    return (await db.query(sql.replace(/\?/g,()=>'$'+(++n)),args)).rows[0]??null;
   }};}};
  }
 }};
 const status=await readAccountRank(env,5147);assert.equal(reads,1);assert.deepEqual(status,publicAccountRank(current.total_ticks));assert.equal(status.code,PLAN.targetCode);assert.equal(status.level,PLAN.targetLevel);assert(BigInt(current.total_ticks)>=BigInt(PLAN.targetTicks));
 assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=5147 AND action_path=ANY($1::text[])',[[OP,STAR_OP]])).rowCount,0);
 assert.deepEqual((await db.query('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0')).rows,[]);
 await db.query('ROLLBACK');const report={checkedAt:new Date().toISOString(),readOnly:true,independentConnection:true,stars,rank,starsGranted:sr.grants[0],rankAtChange:rr.afterRank,current,accountRankServerRead:status,existingSchemaSetupSkipped:true,databaseLeasesReleased:true,writes:0,messagesSent:0};await fs.writeFile(new URL('./verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({verified:true,userId:'5147',nickname:current.nickname,starsGranted:sr.grants[0].amount,currentStars:current.master_stars,rank:status.name,level:status.level,rankStep:status.level-169,audits:[stars.auditId,rank.auditId],readOnly:true,writes:0}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end();}
