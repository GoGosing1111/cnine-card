import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const OP='ops:jokgujoa-blackcrown-cardgu:20261102:v1',ID='525',CODE='V-970';
const db=connect(),one=rows=>(assert.equal(rows.length,1),rows[0]);
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(s,a=[])=>(assert.match(s,/^SELECT\b/),(await db.query(s,a)).rows);
 const r=JSON.parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[OP])).value);assert.equal(r.status,'COMPLETED');assert.equal(r.grants.length,1);const g=r.grants[0];
 assert.deepEqual([g.userId,g.nickname,g.code,g.quantity,g.copiesBefore,g.copiesAfter],[ID,'족구조아',CODE,1,0,1]);assert.equal(g.name,'카드구');assert.equal(g.rank,'SSS');
 const holding=one(await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[ID,CODE]));assert.equal(Number(holding.total_copies),1);assert.equal(Number(holding.duplicate_count),0);
 const a=one(await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1',[OP+':%']));assert.equal(a.acquisition_id,`${OP}:${ID}:${CODE}:1`);assert.equal(String(a.user_id),ID);assert.equal(a.mercenary_code,CODE);assert.equal(Number(a.total_copies_after),1);assert.equal(a.created_at,r.completedAt);
 const stock=one(await q('SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[CODE])),pack=JSON.parse(one(await q('SELECT value FROM app_meta WHERE key=$1',['mercenary_blackcrown_ss_pack_v1'])).value);
 assert.equal(Number(stock.stock_limit),7);assert.equal(pack.settings.stockLimits[CODE],7);assert.equal(Number(stock.issued),Number(r.stockAfter[0].issued));assert.equal(Number(r.stockAfter[0].issued),Number(r.stockBefore[0].issued)+1);assert.equal(Number(r.stockAfter[0].revision),Number(r.stockBefore[0].revision)+1);
 const issues=await q('SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[CODE]);assert.equal(issues.length,Number(stock.issued));issues.forEach((i,n)=>assert.equal(Number(i.serial),n+1));
 const issue=one(issues.filter(i=>i.request_id===OP));assert.equal(issue.acquisition_id,a.acquisition_id);assert.equal(String(issue.user_id),ID);assert.equal(Number(issue.serial),r.serial);assert.equal(issue.created_at,r.completedAt);
 const audit=one(await q('SELECT id::text,action_type,after_data FROM admin_logs WHERE target_id=$1',[OP]));assert.equal(audit.id,r.auditId);assert.equal(audit.action_type,'OPS_BLACKCROWN_CARDGU_STOCK_GRANT');const {auditId,...recorded}=r;assert.deepEqual(JSON.parse(audit.after_data),recorded);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 assert(BigInt(r.syncAfter[0].domains.collection)>BigInt(r.syncBefore[0].domains.collection));assert.equal((await q('SELECT user_id FROM user_mutation_locks_v1520 WHERE action_path=$1',[OP])).length,0);
 assert.deepEqual(await q('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0'),[]);
 const result={status:'VERIFIED',operationKey:OP,userId:ID,nickname:'족구조아',code:CODE,name:'카드구',quantity:1,before:0,after:1,serial:r.serial,stock:{limit:7,issuedBefore:Number(r.stockBefore[0].issued),issuedAfter:Number(stock.issued),remainingBefore:7-Number(r.stockBefore[0].issued),remainingAfter:7-Number(stock.issued)},acquisitionRecords:1,limitedIssueRecords:1,auditRecords:1,auditId:r.auditId,completedAt:r.completedAt,collectionSyncUpdated:true,protectedDataHashMatched:true,remainingOperationLocks:0,productionWrites:0,checkedAt:new Date().toISOString()};
 await db.query('ROLLBACK');await fs.writeFile(new URL('independent.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
