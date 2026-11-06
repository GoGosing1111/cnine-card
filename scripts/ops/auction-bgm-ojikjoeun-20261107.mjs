import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const OP='ops:auction-bgm-ojikjoeun-golta69:20261107:v1',REVISION='auction_user_bgm_revision_v1';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const readRows=async db=>(await db.query('SELECT * FROM auction_bgm_rules_v1554 ORDER BY auction_id,sort_order,min_bid,id')).rows;
export async function register(db,{authorization,plan,preflight,sourceCommit,proof,dryRun=true,failAt=''}={}){
 assert.equal(authorization,OP);assert.equal(plan.operationKey,OP);assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];if(prior)return {replayed:true,receipt:JSON.parse(prior.value)};
 assert.deepEqual(plan.included.map(t=>[t.fileName,t.amount]),[['오직조은_5759.mp3',57590],['골타69_16969.mp3',169690]]);
 for(const t of plan.included){assert.equal(t.amount,Number(String(t.fileNumber)+'0'));assert(Number.isInteger(t.duration)&&t.duration>=1&&t.duration<=60);assert(t.url.endsWith('#av=25'));}
 if(!dryRun){assert.equal(proof?.commit,sourceCommit);assert.equal(proof.publicFiles.length,2);for(const t of plan.included)assert(proof.publicFiles.some(p=>p.file===t.path&&p.sha256===t.sha256));}
 await db.query('BEGIN');try{
  await db.query("SET LOCAL lock_timeout='8s'; SET LOCAL statement_timeout='20s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);assert.equal((await db.query('SELECT id FROM auction_user_clock_v1 WHERE id=1 FOR UPDATE')).rowCount,1);await db.query('LOCK TABLE auction_bgm_rules_v1554 IN SHARE ROW EXCLUSIVE MODE');
  const duplicate=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];if(duplicate){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(duplicate.value)};}
  const rows=await readRows(db);assert.deepEqual(rows,preflight.rows,'BGM catalog changed after preflight');
  const meta=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[preflight.meta.map(r=>r.key)])).rows;assert.deepEqual(meta,preflight.meta,'CMS state or prior receipt changed');
  const owner=(await db.query('SELECT id,nickname,role,status FROM users WHERE id=$1',[preflight.owner.id])).rows[0];assert.deepEqual(owner,preflight.owner);
  const added=[];for(const t of plan.included){
   assert(!rows.filter(r=>String(r.auction_id)==='0').some(r=>t.amount>=Number(r.min_bid)&&(!Number(r.max_bid)||t.amount<=Number(r.max_bid))),'Duplicate/overlap');
   const inserted=(await db.query('INSERT INTO auction_bgm_rules_v1554(auction_id,min_bid,max_bid,bgm_url,bgm_duration,sort_order) VALUES(0,$1,$1,$2,$3,$4) RETURNING *',[t.amount,t.url,t.duration,t.sortOrder])).rows[0];assert(inserted);added.push(inserted);
   if(failAt==='rule'&&added.length===1)throw Error('INJECTED_AFTER_RULE');
  }
  const newIds=new Set(added.map(r=>r.id)),after=await readRows(db);assert.deepEqual(after.filter(r=>!newIds.has(r.id)),rows);const shared=after.filter(r=>String(r.auction_id)==='0');assert.equal(shared.length,plan.expectedSharedCount);
  for(const t of plan.included){const winner=(await db.query('SELECT bgm_url,bgm_duration FROM auction_bgm_rules_v1554 WHERE auction_id=0 AND $1>=min_bid AND (max_bid=0 OR $1<=max_bid) ORDER BY sort_order,min_bid DESC LIMIT 1',[t.amount])).rows[0];assert.equal(winner.bgm_url,t.url);assert.equal(Number(winner.bgm_duration),t.duration);}
  const revision=Number(meta.find(r=>r.key===REVISION)?.value||0)+1;assert(Number.isSafeInteger(revision));await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',[REVISION,String(revision)]);
  const receipt={operationKey:OP,status:'COMPLETED',sourceCommit,added,sharedCount:shared.length,existingRowsPreserved:rows.length,afterHash:hash(after),beforeHash:hash(rows),revision,accountWrites:0,messagesSent:0,noticePublished:false};
  const audit=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'AUCTION_BGM_REGISTER','AUCTION',$2,$3,$4) RETURNING id,created_at",[owner.id,OP,JSON.stringify({rows,revision:revision-1}),JSON.stringify(receipt)])).rows[0];receipt.auditId=String(audit.id);receipt.appliedAt=String(audit.created_at);
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OP,JSON.stringify(receipt)]);await db.query('UPDATE auction_user_clock_v1 SET version=version+1 WHERE id=1');
  if(failAt==='receipt')throw Error('INJECTED_AFTER_RECEIPT');await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
export async function verify(db,{preflight,receipt}){
 const rows=await readRows(db),newIds=new Set(receipt.added.map(r=>r.id));assert.equal(hash(rows),receipt.afterHash);assert.deepEqual(rows.filter(r=>!newIds.has(r.id)),preflight.rows);
 assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',[REVISION])).rows[0].value,String(receipt.revision));
 for(const row of preflight.meta.filter(r=>r.key!==REVISION))assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',[row.key])).rows[0].value,row.value);
 const audit=(await db.query("SELECT id,after_data FROM admin_logs WHERE action_type='AUCTION_BGM_REGISTER' AND target_id=$1",[OP])).rows;assert.equal(audit.length,1);assert.equal(String(audit[0].id),receipt.auditId);assert.equal(JSON.parse(audit[0].after_data).afterHash,receipt.afterHash);
 for(const row of receipt.added){const winners=(await db.query('SELECT * FROM auction_bgm_rules_v1554 WHERE auction_id=0 AND min_bid=$1 AND max_bid=$1',[row.min_bid])).rows;assert.equal(winners.length,1);assert.deepEqual(winners[0],row);}
 return {at:new Date().toISOString(),sharedCount:receipt.sharedCount,existingRowsPreserved:preflight.rows.length,amounts:[57590,169690],auditId:receipt.auditId};
}
