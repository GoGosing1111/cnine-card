import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const OP='ops:simsimi-blackcrown-bongsoon-exempt-grant:20261101:v1',ID='4933',CODE='V-951';
const db=connect(),one=rows=>(assert.equal(rows.length,1),rows[0]);
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(sql,args=[])=>{assert.match(sql,/^SELECT\b/);return (await db.query(sql,args)).rows;};
 const r=JSON.parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[OP])).value);
 assert.equal(r.status,'COMPLETED');assert.equal(r.grants.length,1);const g=r.grants[0];
 assert.deepEqual([g.userId,g.nickname,g.code,g.quantity,g.copiesBefore,g.copiesAfter],[ID,'심심이',CODE,1,0,1]);
 assert.deepEqual([g.name,g.rank,g.edition,g.season],['나무늘봉순','SS','LIMITED','BLACKCROWN']);
 assert.equal(r.plan.stockAuthorization,'한도증가없이 1장 지급');
 const user=one(await q('SELECT id::text,nickname,status FROM users WHERE id=$1',[ID]));assert.equal(user.nickname,'심심이');assert.equal(user.status,'ACTIVE');
 const holding=one(await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[ID,CODE]));assert.equal(Number(holding.total_copies),1);assert.equal(Number(holding.duplicate_count),0);
 const acquisitions=await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1',[OP+':%']);assert.equal(acquisitions.length,1);
 const a=acquisitions[0];assert.deepEqual([a.acquisition_id,String(a.user_id),a.mercenary_code,Number(a.total_copies_after),Number(a.is_duplicate)],[`${OP}:${ID}:${CODE}:1`,ID,CODE,1,0]);assert.equal(a.created_at,r.completedAt);
 const stock=one(await q("SELECT COALESCE(jsonb_agg(t),'[]'::jsonb) data FROM (SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1 ORDER BY code) t",[CODE])).data;assert.deepEqual(stock,r.stockBefore);assert.deepEqual(r.stockBefore,r.stockAfter);
 assert.deepEqual(stock.map(s=>[Number(s.stock_limit),Number(s.issued)]),[[40,40]]);
 const issues=one(await q("SELECT COALESCE(jsonb_agg(t),'[]'::jsonb) data FROM (SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY code,serial) t",[CODE])).data;assert.deepEqual(issues,r.issuesBefore);assert.deepEqual(r.issuesBefore,r.issuesAfter);
 const ownIssues=await q('SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE request_id=$1 OR acquisition_id LIKE $2',[OP,OP+':%']);assert.equal(ownIssues.length,0);
 const craft=await q("SELECT output_ref,COUNT(*)::text AS rows,COALESCE(SUM(output_quantity) FILTER(WHERE success=1),0)::text AS crafted FROM workshop_craft_logs_v1668 WHERE output_type='MERCENARY' AND output_ref=$1 GROUP BY output_ref ORDER BY output_ref",[CODE]);assert.deepEqual(craft,r.craftBefore);assert.deepEqual(r.craftBefore,r.craftAfter);
 const audit=one(await q('SELECT id::text,action_type,after_data FROM admin_logs WHERE target_id=$1',[OP]));assert.equal(audit.id,r.auditId);assert.equal(audit.action_type,'OPS_MERCENARY_EXEMPT_GRANT');const {auditId,...auditPayload}=r;assert.deepEqual(JSON.parse(audit.after_data),auditPayload);
 assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 assert(BigInt(r.syncAfter[0].domains.collection)>BigInt(r.syncBefore[0].domains.collection));
 const locks=await q('SELECT user_id FROM user_mutation_locks_v1520 WHERE action_path=$1',[OP]);assert.equal(locks.length,0);
 const result={status:'VERIFIED',checkedAt:new Date().toISOString(),readOnly:one(await q("SELECT current_setting('transaction_read_only') value")).value,operationKey:OP,userId:ID,nickname:user.nickname,code:CODE,name:'나무늘봉순',title:'블랙크라운 SS 리미티드',quantity:1,before:0,after:Number(holding.total_copies),stock:{limit:40,issued:40,remaining:0},stockUnchanged:true,serialsUnchanged:true,limitedIssueRecordsAdded:0,craftUnchanged:true,protectedDataHashMatched:true,collectionSyncUpdated:true,acquisitionRecords:1,auditRecords:1,auditId:r.auditId,completedAt:r.completedAt,remainingOperationLocks:0,productionWrites:0};
 await db.query('ROLLBACK');await fs.writeFile(new URL('./independent.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
