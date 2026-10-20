import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MAX_RANK_TICKS,PRE_GROWTH_MAX_RANK_TICKS,preGrowthLevelFromTicks,levelFromTicks,preserveRankProgress} from '../../functions/_account_rank_curve.js';

export const CAP_KEY='ops:account-rank-raid-growth:20261021:cap-v1';
export const MIGRATION_KEY='ops:account-rank-raid-growth:20261021:v1';
const saved=async(c,key)=>{const row=(await c.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0];return row?JSON.parse(row.value):null;};
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
async function lock(c){
  await c.query("SET LOCAL lock_timeout='5s'");
  await c.query("SET LOCAL statement_timeout='30s'");
  await c.query('LOCK TABLE account_rank_progress_v1 IN ACCESS EXCLUSIVE MODE');
}
async function expandCap(c){
  const constraints=(await c.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='account_rank_progress_v1'::regclass AND contype='c'")).rows.filter(r=>r.definition.includes('total_ticks'));
  assert.equal(constraints.length,1,'Expected one rank range constraint');
  const constraint=constraints[0];
  if(constraint.definition.includes(String(MAX_RANK_TICKS)))return;
  assert.ok(constraint.definition.includes(String(PRE_GROWTH_MAX_RANK_TICKS)),'Unexpected previous rank cap');
  await c.query(`ALTER TABLE account_rank_progress_v1 DROP CONSTRAINT "${constraint.conname.replaceAll('"','""')}"`);
  await c.query(`ALTER TABLE account_rank_progress_v1 ADD CONSTRAINT account_rank_progress_v1_total_ticks_check CHECK(total_ticks>=0 AND total_ticks<=${MAX_RANK_TICKS})`);
}
// Safe before runtime deployment: expands the cap without changing any rank.
export async function prepareRankGrowthCap(c,{dryRun=false}={}){
  await c.query('BEGIN');
  try{
    await lock(c);await expandCap(c);
    const prior=await saved(c,CAP_KEY);
    const result=prior||{status:'COMPLETED',operationKey:CAP_KEY,previousCap:PRE_GROWTH_MAX_RANK_TICKS,newCap:MAX_RANK_TICKS,completedAt:new Date().toISOString()};
    if(!prior)await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[CAP_KEY,JSON.stringify(result)]);
    await c.query(dryRun?'ROLLBACK':'COMMIT');
    return {...result,replayed:!!prior,dryRun};
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
}
// Run once after the new runtime is verified and old requests have drained.
// Locks the progress table so concurrent XP cannot be lost between read/write.
export async function migrateRankGrowth(c,{deployedSource,dryRun=false}={}){
  assert.match(deployedSource||'',/^[a-f0-9]{40}$/,'Verified deployed source is required');
  await c.query('BEGIN');
  try{
    await lock(c);await expandCap(c);
    const prior=await saved(c,MIGRATION_KEY);
    if(prior){await c.query('COMMIT');return {...prior,replayed:true};}
    const before=(await c.query('SELECT user_id::text user_id,total_ticks::text total_ticks FROM account_rank_progress_v1 ORDER BY user_id')).rows;
    const changes=before.map(row=>({userId:row.user_id,before:Number(row.total_ticks),after:preserveRankProgress(Number(row.total_ticks))})).filter(r=>r.before!==r.after);
    for(const row of changes)assert.equal(levelFromTicks(row.after),preGrowthLevelFromTicks(row.before));
    if(changes.length){
      const result=await c.query(`UPDATE account_rank_progress_v1 p SET total_ticks=v.ticks
        FROM unnest($1::bigint[],$2::bigint[]) v(id,ticks) WHERE p.user_id=v.id RETURNING p.user_id`,
        [changes.map(r=>r.userId),changes.map(r=>r.after)]);
      assert.equal(result.rows.length,changes.length);
    }
    const after=(await c.query('SELECT user_id::text user_id,total_ticks::text total_ticks FROM account_rank_progress_v1 ORDER BY user_id')).rows;
    assert.equal(after.length,before.length);
    for(let i=0;i<before.length;i++){
      assert.equal(after[i].user_id,before[i].user_id);
      assert.equal(Number(after[i].total_ticks),preserveRankProgress(Number(before[i].total_ticks)));
    }
    const result={status:'COMPLETED',operationKey:MIGRATION_KEY,deployedSource,accounts:before.length,changed:changes.length,
      beforeSha256:digest(before),afterSha256:digest(after),changes,levelsPreserved:true,progressPreservedWithinOneTick:true,
      awardReceiptsRewritten:0,completedAt:new Date().toISOString()};
    const owner=(await c.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
    assert.ok(owner,'An active OWNER is required for the audit');
    await c.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'ACCOUNT_RANK_RAID_GROWTH','ACCOUNT_RANK',$2,$3,$4)",
      [owner.id,MIGRATION_KEY,JSON.stringify({cap:PRE_GROWTH_MAX_RANK_TICKS,sha256:result.beforeSha256}),JSON.stringify(result)]);
    await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[MIGRATION_KEY,JSON.stringify(result)]);
    await c.query(dryRun?'ROLLBACK':'COMMIT');
    return {...result,dryRun};
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
}
