import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect,safe,OP,AUTHORIZATION,CMS_HASH,hash,policy,targets,cms,query} from './cms.mjs';
const mode=process.argv[2];assert(['dry-run','apply','verify','replay'].includes(mode));
const before=JSON.parse(fs.readFileSync(new URL('./before.json',import.meta.url),'utf8'));
assert.equal(before.cmsHash,CMS_HASH,'CMS source changed');
const ids=before.cards.map(c=>c.id),file=name=>new URL('./'+name+'.json',import.meta.url);
const save=(name,data)=>fs.writeFileSync(file(name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const sourceHash=hash(['cms.mjs','run.mjs'].map(name=>fs.readFileSync(new URL('./'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n')).join('\n'));
const db=connect();let committedActions=0,logFloor;
const q=(sql,args)=>query(db,sql,args);
const getReceipt=async()=>{const [row]=await q('SELECT value FROM app_meta WHERE key=$1',[OP]);return row?JSON.parse(row.value):null};
async function begin(){await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='20s'");await db.query("SET LOCAL TIME ZONE 'UTC'")}
async function catalog(){const cards=await targets(db);assert.deepEqual(cards.map(c=>c.id),ids,'Retirement target set changed');for(let i=0;i<cards.length;i++){for(const key of ['title','rarity','member_id','name'])assert.equal(cards[i][key],before.cards[i][key])}return cards}
async function settlements(){return q(`SELECT b.card_id,b.status,COUNT(*)::integer owners,COUNT(*) FILTER(WHERE r.refund_shards>0)::integer refund_users,COALESCE(SUM(r.refund_shards),0)::text refund_shards,
 COUNT(*) FILTER(WHERE r.message_id IS NOT NULL)::integer legacy_messages
 FROM card_retirement_batches b JOIN card_retirement_refunds r ON r.batch_id=b.id WHERE b.card_id=ANY($1::text[]) GROUP BY b.card_id,b.status ORDER BY b.card_id`,[ids])}
async function verifyCards(cardIds){
 const rows=await q('SELECT id,is_active,card_status FROM cards WHERE id=ANY($1::text[]) ORDER BY id',[cardIds]);assert.equal(rows.length,cardIds.length);for(const c of rows){assert.equal(c.card_status,'RETIRED');assert.equal(c.is_active,0)}
 const batches=await q('SELECT * FROM card_retirement_batches WHERE card_id=ANY($1::text[]) ORDER BY card_id',[cardIds]);assert.equal(batches.length,cardIds.length);for(const b of batches){assert.equal(b.status,'FINALIZED');assert.equal(b.refund_rate,100)}
 const refunds=await q(`SELECT r.user_id,b.card_id,r.refund_shards,COUNT(l.id)::integer n,COALESCE(SUM(l.change_amount),0)::text granted
 FROM card_retirement_batches b JOIN card_retirement_refunds r ON r.batch_id=b.id LEFT JOIN shard_logs l
 ON l.user_id=r.user_id AND l.card_id=b.card_id AND l.reason='CARD_RETIREMENT_REFUND' AND l.id>$2
 WHERE b.card_id=ANY($1::text[]) AND r.refund_shards>0 AND r.message_id IS NULL GROUP BY r.user_id,b.card_id,r.refund_shards`,[cardIds,logFloor.shards]);
 for(const r of refunds){assert.equal(r.n,1);assert.equal(Number(r.granted),r.refund_shards)}
 const expectedTickets=await q(`SELECT b.card_id,r.user_id FROM card_retirement_batches b JOIN card_retirement_refunds r ON r.batch_id=b.id WHERE b.card_id=ANY($1::text[]) ORDER BY b.card_id,r.user_id`,[cardIds.filter(id=>before.summaries.find(s=>s.cardId===id).rerollTicketCode)]);
 const tickets=await q(`SELECT user_id,reference_id,item_code,change_amount FROM inventory_logs WHERE id>$2 AND reference_type='CARD_RETIREMENT' AND reason='CARD_RETIREMENT_REROLL' AND reference_id=ANY($1::text[]) ORDER BY reference_id,user_id`,[cardIds,logFloor.inventory]);
 assert.equal(tickets.length,expectedTickets.length);for(let i=0;i<tickets.length;i++){const t=tickets[i],e=expectedTickets[i];assert.equal(t.user_id,e.user_id);assert.equal(t.reference_id,e.card_id);assert.equal(t.change_amount,1);assert.equal(t.item_code,before.summaries.find(s=>s.cardId===e.card_id).rerollTicketCode)}
 const missing=await q(`SELECT uc.user_id,uc.card_id FROM user_cards uc JOIN card_retirement_batches b ON b.card_id=uc.card_id LEFT JOIN card_retirement_refunds r ON r.batch_id=b.id AND r.user_id=uc.user_id WHERE uc.card_id=ANY($1::text[]) AND uc.quantity>0 AND r.user_id IS NULL`,[cardIds]);assert.deepEqual(missing,[],'Owner missing retirement settlement');
 const audits=await q("SELECT id,action_type,target_id FROM admin_logs WHERE id>$2 AND target_id=ANY($1::text[]) AND action_type IN ('CARD_RETIREMENT_QUEUE','CARD_RETIREMENT_FINALIZE') ORDER BY id",[cardIds,logFloor.audit]);
 for(const id of cardIds)assert.deepEqual(audits.filter(x=>x.target_id===id).map(x=>x.action_type),['CARD_RETIREMENT_QUEUE','CARD_RETIREMENT_FINALIZE']);
 return {cards:rows.length,refundRows:refunds.length,refundShards:refunds.reduce((s,r)=>s+r.refund_shards,0),rerollTickets:tickets.length,audits:audits.length,missingOwners:0,duplicatePayments:0};
}
async function verify(receipt){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OP);assert.equal(receipt.cmsHash,CMS_HASH);assert.equal(receipt.authorization,AUTHORIZATION);
 await catalog();assert.deepEqual(await settlements(),receipt.settlements);const result=await verifyCards(ids);
 const audits=await q("SELECT id,after_data FROM admin_logs WHERE target_id=$1 AND action_type='OPS_CARD_RETIREMENT_COMPLETE'",[OP]);assert.equal(audits.length,1);assert.equal(audits[0].id,receipt.auditId);const {auditId,...without}=receipt;assert.deepEqual(JSON.parse(audits[0].after_data),without);
 return {...result,previouslyPending:0,pending:(await q("SELECT id FROM card_retirement_batches WHERE status='PENDING'")).length,uniqueOwners:receipt.uniqueOwners};
}
async function assertWrites(){
 const writes=await q('SELECT relname,n_tup_del FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0 ORDER BY relname');
 const allowed=['cards','card_retirement_batches','card_retirement_refunds','users','shard_logs','cnine_user_inventory','inventory_logs','admin_logs','app_meta','account_sync_versions_v1','ranked_duo_policy_version_v1'];
 for(const w of writes){assert(allowed.includes(w.relname),'Unexpected writes: '+w.relname);assert.equal(w.n_tup_del,0)}
}
try{
 db.connectionParameters.application_name='hyerujjing-card-retirement-'+mode;await db.connect();
 if(!fs.existsSync(file('log-floor'))){assert.equal(mode,'dry-run');save('log-floor',(await q('SELECT (SELECT COALESCE(MAX(id),0) FROM shard_logs) shards,(SELECT COALESCE(MAX(id),0) FROM inventory_logs) inventory,(SELECT COALESCE(MAX(id),0) FROM admin_logs) audit'))[0])}
 logFloor=JSON.parse(fs.readFileSync(file('log-floor'),'utf8'));
 assert(!fs.existsSync(file(mode)),'Inspect existing result before re-execution');
 let report;
 if(mode==='verify'||mode==='replay'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const receipt=await getReceipt();assert(receipt);const verification=await verify(receipt);await db.query('ROLLBACK');report={operationKey:OP,mode,readOnly:true,additionalWrites:0,verification,auditId:receipt.auditId,completedAt:receipt.completedAt};
 }else if(mode==='dry-run'){
  await begin();assert.equal(await getReceipt(),null);assert.equal(hash(await policy(db)),before.policyHash);assert.deepEqual(await catalog(),before.cards);
  assert.equal((await q('SELECT id FROM card_retirement_batches WHERE card_id=ANY($1::text[])',[ids])).length,0);
  const first=ids[0],handle=cms(db),fault=cms(db,{failAfterRefund:true});
  await handle(first,'QUEUE');await db.query('SAVEPOINT failure');await assert.rejects(fault(first,'FINALIZE'),/INJECTED_AFTER_REFUND/);await db.query('ROLLBACK TO SAVEPOINT failure');
  assert.equal((await q("SELECT id FROM shard_logs WHERE id>$2 AND card_id=$1 AND reason='CARD_RETIREMENT_REFUND'",[first,logFloor.shards])).length,0);
  assert.equal((await q('SELECT card_status FROM cards WHERE id=$1',[first]))[0].card_status,'RETIRE_PENDING');
  const result=await handle(first,'FINALIZE');const verification=await verifyCards([first]);
  await assert.rejects(handle(first,'FINALIZE'),/이미 퇴사 확정/);await verifyCards([first]);await assertWrites();
  await db.query('ROLLBACK');assert.equal((await q('SELECT id FROM card_retirement_batches WHERE card_id=$1',[first])).length,0);
  assert.equal((await q('SELECT card_status FROM cards WHERE id=$1',[first]))[0].card_status,'PUBLIC');
  report={operationKey:OP,mode,status:'ROLLED_BACK_VERIFIED',sourceHash,verification,result,checks:{unchangedCmsHandler:true,failureAfterRefundRolledBack:true,successRolledBack:true,duplicateFinalizeRejected:true,perRecipientRefundAndTicketLogs:true,onlyExpectedWrites:true,noPhysicalDeletion:true}};
 }else{
  const dry=JSON.parse(fs.readFileSync(file('dry-run'),'utf8'));assert.equal(dry.sourceHash,sourceHash);assert.equal(dry.status,'ROLLED_BACK_VERIFIED');
  assert.equal(await getReceipt(),null);await catalog();assert.equal(hash(await policy(db)),before.policyHash);
  const actions=[];
  // Commit each native QUEUE before FINALIZE, so acquisition is disabled while settlement is captured.
  for(const action of ['QUEUE','FINALIZE'])for(const card of before.cards){
   await begin();await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);assert.equal(hash(await policy(db)),before.policyHash);
   const batch=(await q('SELECT * FROM card_retirement_batches WHERE card_id=$1 FOR UPDATE',[card.id]))[0];
   if(batch){assert.equal(batch.created_by,1);assert.equal(batch.member_name,'혜루찡');assert(new Date(batch.created_at+'Z').getTime()>=new Date(before.identity.now).getTime(),'Preexisting batch outside this request')}
   const existing=(await q('SELECT card_status FROM cards WHERE id=$1',[card.id]))[0];
   if(action==='QUEUE'&&batch){assert(['PENDING','FINALIZED'].includes(batch.status));await db.query('ROLLBACK');continue}
   if(action==='FINALIZE'&&batch?.status==='FINALIZED'){await verifyCards([card.id]);await db.query('ROLLBACK');continue}
   if(action==='QUEUE')assert.equal(existing.card_status,card.card_status);else assert.equal(existing.card_status,'RETIRE_PENDING');
   const result=await cms(db)(card.id,action);if(action==='FINALIZE')await verifyCards([card.id]);await assertWrites();await db.query('COMMIT');committedActions++;
   actions.push({cardId:card.id,action,result});save(`action-${action.toLowerCase()}-${card.id}`,actions.at(-1));console.log(JSON.stringify({committed:true,action,cardId:card.id}));
  }
  await begin();await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);assert.equal(await getReceipt(),null);const verification=await verifyCards(ids);const final=await settlements();await catalog();
  const [{count:uniqueOwners}]=await q('SELECT COUNT(DISTINCT r.user_id)::integer count FROM card_retirement_refunds r JOIN card_retirement_batches b ON b.id=r.batch_id WHERE b.card_id=ANY($1::text[])',[ids]);
  const [now]=await q('SELECT CURRENT_TIMESTAMP now');
  const receipt={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,cmsHash:CMS_HASH,sourceHash,logFloor,completedAt:now.now.toISOString(),cards:before.cards,previousPending:0,uniqueOwners,policyHash:before.policyHash,settlements:final,verification,delivery:'CMS_DIRECT_SHARDS_AND_REROLL_INVENTORY',ownershipHistoryPreserved:true,physicalDeletion:false,noticePublished:false};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_CARD_RETIREMENT_COMPLETE','CARD_BATCH',$1,$2,$3) RETURNING id",[OP,JSON.stringify({cards:before.cards,policyHash:before.policyHash}),JSON.stringify(receipt)]);receipt.auditId=audit.id;
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OP,JSON.stringify(receipt)]);await verify(receipt);await assertWrites();await db.query('COMMIT');save('receipt',receipt);
  report={operationKey:OP,mode,status:'COMPLETED',sourceHash,auditId:receipt.auditId,completedAt:receipt.completedAt,verification,uniqueOwners,committedActions};
 }
 save(mode,report);console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({error:safe(e),committedActions,mode}));console.error(String(e.stack).split('\n').filter(x=>/at /.test(x)).slice(0,4).join('\n'));process.exitCode=1}finally{await db.end().catch(()=>{})}
