import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
import {connect,safe,hash} from '../rap-contest-rewards-20261027/preflight.mjs';
import {readPetCollection,readPetOwnership} from '../../output/helios-heukmu-balance-20261106/source/functions/_pet_account.js';
import {petCatalogFrom} from '../../output/helios-heukmu-balance-20261106/source/functions/_pet_equipment.js';
const applied=JSON.parse(await fs.readFile(new URL('./evidence/apply.json',import.meta.url),'utf8'));
const snapshots=JSON.parse(await fs.readFile(new URL('./evidence/commit-candidate-snapshots.json',import.meta.url),'utf8'));
const drawBytes=await fs.readFile(new URL('../pepegu-roster32-draw10-20261106/result.json',import.meta.url));assert.equal(createHash('sha256').update(drawBytes).digest('hex'),plan.drawResultSha256);
const db=connect(),ids=plan.targets.map(t=>t.userId),one=rows=>(assert.equal(rows.length,1),rows[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
try{
 db.connectionParameters.application_name='pepegu-draw-winners-independent-readonly';await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;assert.equal(one(await q("SELECT current_setting('transaction_read_only') mode")).mode,'on');
 const receipt=parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[plan.operationKey])).value);assert.deepEqual(receipt,applied.receipt);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.ownership,'PERMANENT');assert.equal(receipt.totalPets,10);assert.equal(receipt.planHash,hash(plan));assert.equal(receipt.protectedBefore,receipt.protectedAfter);
 const users=await q('SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',[ids]);assert.equal(users.length,10);
 const settings=await q("SELECT key,value FROM app_meta WHERE key IN ('pet_cms_preparation_v1','pet_opening_settings_v1','pet_potential_settings_v1') ORDER BY key");assert.equal(hash(settings),plan.settingsHash);
 const cms=parse(one(settings.filter(r=>r.key==='pet_cms_preparation_v1')).value),document=cms.document;
 const grants=await q("SELECT key,value FROM app_meta WHERE key LIKE 'pet_grant_receipt_v1:ops-pepegu-draw-20261106-%' ORDER BY key");assert.equal(grants.length,10);
 const audits=await q("SELECT id::text,admin_id::text,action_type,target_id,before_data,after_data FROM admin_logs WHERE target_id=$1 OR (action_type='PET_GRANT' AND after_data LIKE '%ops-pepegu-draw-20261106-%') ORDER BY id",[plan.operationKey]);assert.equal(audits.length,11);
 const summaryAudit=one(audits.filter(a=>a.target_id===plan.operationKey)),{auditId,...summaryBody}=receipt;assert.equal(summaryAudit.id,auditId);assert.equal(summaryAudit.action_type,'OPS_PEPEGU_DRAW_WINNERS_20261106');assert.deepEqual(parse(summaryAudit.after_data),summaryBody);
 const previous=await q('SELECT key,value FROM app_meta WHERE key=$1',[plan.priorBoxOperationKey]);assert.equal(hash(previous),plan.priorBoxReceiptHash);
 const protectedKeys=ids.flatMap(id=>['pet_rental_v1:'+id,'pet_loadout_v1:'+id,'pet_potentials_v1:'+id]);
 assert.deepEqual(snapshots.before.state.protectedPetRecords,snapshots.after.state.protectedPetRecords);
 const currentProtected=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[protectedKeys]);
 const rentals=rows=>rows.filter(r=>r.key.startsWith('pet_rental_v1:'));assert.deepEqual(rentals(currentProtected),rentals(snapshots.before.state.protectedPetRecords));
 const sync=await q('SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);assert.equal(sync.length,10);
 const env={DB:{prepare:sql=>({bind:(...args)=>({first:async()=>{assert.match(sql,/^SELECT\b/i);return(await db.query(sql.replaceAll('?','$1'),args)).rows[0]??null;}})})}},recipients=[];
 for(const t of [...plan.targets].sort((a,b)=>a.order-b.order)){
  const u=one(users.filter(u=>u.id===t.userId));assert.equal(u.nickname,t.nickname);assert.equal(u.status,'ACTIVE');assert.equal(hash({provider:u.provider,providerId:u.provider_user_id}),t.identityHash);
  const g=one(receipt.petGrants.filter(g=>g.userId===t.userId)),saved=parse(one(grants.filter(row=>row.key==='pet_grant_receipt_v1:ops-pepegu-draw-20261106-'+t.userId)).value);assert.deepEqual(saved,{payloadHash:g.payloadHash,result:g.result});assert.equal(g.afterQuantity-g.beforeQuantity,1);assert.equal(g.afterRevision-g.beforeRevision,1);
  const audit=one(audits.filter(a=>a.id===g.auditId));assert.equal(audit.action_type,'PET_GRANT');assert.equal(audit.target_id,t.userId);assert.equal(audit.admin_id,'1');assert.deepEqual(parse(audit.after_data),g.result);assert.deepEqual(parse(audit.before_data),{petCode:plan.petCode,quantity:g.beforeQuantity,revision:g.beforeRevision});
  const collection=await readPetCollection(env,t.userId),owned=await readPetOwnership(env,t.userId);assert.equal(collection.state.pets[plan.petCode],g.afterQuantity);assert(collection.state.revision>=g.afterRevision);assert.equal(owned.pets[plan.petCode],g.afterQuantity);assert.equal(owned.expiries[plan.petCode],undefined);
  const card=one(petCatalogFrom(document,{review:false,includeUnowned:true,collection:owned.pets,expiries:owned.expiries}).filter(p=>p.code===plan.petCode));assert(card.owned);assert.equal(card.quantity,g.afterQuantity);assert.equal(card.rentalExpiresAt,undefined);
  const beforeSync=one(snapshots.before.sync.filter(s=>String(s.user_id)===t.userId)),afterSync=one(snapshots.after.sync.filter(s=>String(s.user_id)===t.userId)),nowSync=one(sync.filter(s=>s.user_id===t.userId));assert.equal(BigInt(afterSync.revision),BigInt(beforeSync.revision)+1n);assert.equal(BigInt(afterSync.domains.collection),BigInt(afterSync.revision));assert(BigInt(nowSync.domains.collection)>=BigInt(afterSync.domains.collection));
  recipients.push({order:t.order,userId:t.userId,nickname:t.nickname,quantityAdded:1,permanentBefore:g.beforeQuantity,permanentAfter:g.afterQuantity,owned:card.owned,ownership:'PERMANENT',petAuditId:g.auditId,existingRentalPreserved:!!owned.rentals.state.pets[plan.petCode]});
 }
 assert.equal((await q('SELECT user_id FROM user_mutation_locks_v1520 WHERE action_path=$1',[plan.operationKey])).length,0);
 assert.deepEqual(await q('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0'),[]);
 const report={checkedAt:new Date().toISOString(),independentReadOnly:true,productionWrites:0,operationKey:plan.operationKey,drawResultSha256:plan.drawResultSha256,auditId:receipt.auditId,recipientCount:10,totalPets:10,petCode:plan.petCode,ownership:'PERMANENT',actualPetReadersChecked:10,inventorySyncVerified:10,petAudits:10,summaryAudits:1,previousBoxReceiptPreserved:true,existingRentalsPreserved:recipients.filter(r=>r.existingRentalPreserved).length,operationLocksRemaining:0,missing:0,duplicates:0,recipients};
 await db.query('ROLLBACK');await fs.writeFile(new URL('./evidence/independent.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,5).join('\n'));process.exitCode=1;}finally{await db.end().catch(()=>{});}
