import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const OP='ops:auction-bgm-register:20261106:v1';
export const REVISION='auction_user_bgm_revision_v1';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const shared=rows=>rows.filter(r=>String(r.auction_id)==='0');
const others=rows=>rows.filter(r=>String(r.auction_id)!=='0');
const readRows=async db=>(await db.query('SELECT * FROM auction_bgm_rules_v1554 ORDER BY auction_id,sort_order,min_bid,id')).rows;

export async function registerAuctionBgm(db,{authorization,plan,preflight,sourceCommit,proof,dryRun=true,failAt=''}={}){
 assert.equal(authorization,OP);assert.equal(plan.operationKey,OP);assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const existing=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];
 if(existing)return {replayed:true,receipt:JSON.parse(existing.value)};
 assert.equal(plan.included.length,18);assert.equal(plan.skipped.length,3);assert.equal(plan.expectedSharedCount,60);
 assert.equal(new Set(plan.included.map(t=>t.amount)).size,18);
 for(const t of plan.included){assert.equal(t.amount,Number(String(t.fileNumber)+'0'));assert(Number.isSafeInteger(t.amount)&&t.amount>0);assert(t.url.endsWith('#av=25'));assert(Number.isInteger(t.duration)&&t.duration>=1&&t.duration<=60);}
 if(!dryRun){assert.equal(proof?.commit,sourceCommit);assert.equal(proof.publicFiles.length,18);for(const t of plan.included)assert(proof.publicFiles.some(p=>p.file===t.path&&p.sha256===t.sha256));}
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='8s'; SET LOCAL statement_timeout='20s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  const clock=await db.query('SELECT id FROM auction_user_clock_v1 WHERE id=1 FOR UPDATE');assert.equal(clock.rowCount,1);
  await db.query('LOCK TABLE auction_bgm_rules_v1554 IN SHARE ROW EXCLUSIVE MODE');
  const duplicate=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];
  if(duplicate){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(duplicate.value)};}
  const rows=await readRows(db);assert.deepEqual(rows,preflight.rows,'Catalog changed after preflight');assert.equal(hash(shared(rows)),plan.previousSharedHash);
  const revision=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[REVISION])).rows[0]?.value;
  assert.equal(revision,preflight.meta.find(r=>r.key===REVISION)?.value,'CMS revision changed');
  const oldRevision=Number(revision||0);assert(Number.isSafeInteger(oldRevision));
  const policy=(await db.query("SELECT value FROM app_meta WHERE key='auction_user_policy_v1'")).rows[0]?.value;
  assert.equal(policy,preflight.meta.find(r=>r.key==='auction_user_policy_v1')?.value,'Auction policy changed');
  const owner=(await db.query("SELECT id,nickname,role,status FROM users WHERE id=$1",[preflight.owner.id])).rows[0];assert.deepEqual(owner,preflight.owner);
  const added=[];
  for(const t of plan.included){
   assert(!shared(rows).some(r=>t.amount>=Number(r.min_bid)&&(!Number(r.max_bid)||t.amount<=Number(r.max_bid))));
   const inserted=(await db.query('INSERT INTO auction_bgm_rules_v1554(auction_id,min_bid,max_bid,bgm_url,bgm_duration,sort_order) VALUES(0,$1,$1,$2,$3,$4) RETURNING *',[t.amount,t.url,t.duration,t.sortOrder])).rows[0];assert(inserted);added.push(inserted);
  }
  if(failAt==='rules')throw Error('INJECTED_AFTER_RULES');
  const after=await readRows(db),newIds=new Set(added.map(r=>r.id));
  assert.deepEqual(after.filter(r=>!newIds.has(r.id)),rows,'An existing rule changed');assert.equal(shared(after).length,60);assert.equal(hash(others(after)),preflight.otherHash);
  for(const t of plan.included){const winner=(await db.query('SELECT * FROM auction_bgm_rules_v1554 WHERE auction_id=0 AND $1>=min_bid AND (max_bid=0 OR $1<=max_bid) ORDER BY sort_order,min_bid DESC LIMIT 1',[t.amount])).rows[0];assert.equal(winner.bgm_url,t.url);assert.equal(Number(winner.bgm_duration),t.duration);}
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',[REVISION,String(oldRevision+1)]);
  const receipt={operationKey:OP,status:'COMPLETED',sourceCommit,existingShared:42,addedCount:18,sharedCount:60,skipped:plan.skipped.map(t=>({fileName:t.fileName,amount:t.amount,existingRuleId:t.existingRuleId})),added,previousSharedHash:preflight.sharedHash,afterSharedHash:hash(shared(after)),otherHash:preflight.otherHash,revision:oldRevision+1,accountWrites:0,messagesSent:0,noticePublished:false,originalBytesPreserved:true};
  const audit=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'AUCTION_BGM_REGISTER','AUCTION',$2,$3,$4) RETURNING id,created_at",[owner.id,OP,JSON.stringify({rows,revision:oldRevision}),JSON.stringify(receipt)])).rows[0];
  receipt.auditId=String(audit.id);receipt.appliedAt=String(audit.created_at);
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OP,JSON.stringify(receipt)]);
  await db.query('UPDATE auction_user_clock_v1 SET version=version+1 WHERE id=1');
  if(failAt==='receipt')throw Error('INJECTED_AFTER_RECEIPT');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt};
 }catch(e){await db.query('ROLLBACK');throw e;}
}

export async function verifyAuctionBgm(db,{plan,preflight,receipt}){
 const rows=await readRows(db),newIds=new Set(receipt.added.map(r=>r.id));
 assert.deepEqual(rows.filter(r=>!newIds.has(r.id)),preflight.rows);assert.equal(hash(shared(rows)),receipt.afterSharedHash);assert.equal(hash(others(rows)),preflight.otherHash);
 assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',[REVISION])).rows[0].value,String(receipt.revision));
 for(const t of plan.included){const matches=shared(rows).filter(r=>Number(r.min_bid)===t.amount&&Number(r.max_bid)===t.amount);assert.equal(matches.length,1);assert.equal(matches[0].bgm_url,t.url);}
 for(const t of plan.skipped){assert.deepEqual(rows.find(r=>r.id===t.existingRuleId),preflight.rows.find(r=>r.id===t.existingRuleId));}
 const audit=(await db.query("SELECT id,after_data FROM admin_logs WHERE action_type='AUCTION_BGM_REGISTER' AND target_id=$1",[OP])).rows;assert.equal(audit.length,1);assert.equal(String(audit[0].id),receipt.auditId);
 assert.equal(JSON.parse(audit[0].after_data).afterSharedHash,receipt.afterSharedHash);
 return {at:new Date().toISOString(),sharedCount:shared(rows).length,newTracks:plan.included.length,existingRowsPreserved:preflight.rows.length,skippedUnchanged:plan.skipped.length,auditId:receipt.auditId};
}
