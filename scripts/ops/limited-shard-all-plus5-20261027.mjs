import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import plan from './limited-shard-all-plus5-20261027.plan.json' with {type:'json'};
import {LIMITED_SHARD_CRAFTS,LIMITED_CRAFT_STOCK_STEP,LIMITED_CRAFT_STOCK_MAX} from '../../shared/mercenary-limited-shard-craft-v1.mjs';
import {MERCENARY_CRAFTS,mercenaryCraftDraft,validateMercenaryCraft,mercenaryCraftStock} from '../../shared/mercenary-craft-v1.mjs';
export const OP=plan.operationKey,ACTION='OPS_LIMITED_SHARD_ALL_PLUS5',TARGETS=plan.targets;
export const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex'),PLAN_HASH=hash(plan);
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows,one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
const request=t=>'limited-shard-all-20261027-v1-'+t.code;
const receiptKey=t=>'mercenary_limited_shard_stock_receipt_v1:'+request(t);
const extraSettings=['mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_halloween_ss_pack_v1','mercenary_bloodmoon_ss_pack_v1','mercenary_blackcrown_ss_pack_v1'];
assert.equal(plan.scope,'SSS_LIMITED_SHARD');assert.equal(plan.exhaustedOnly,false);assert.equal(plan.amountEach,LIMITED_CRAFT_STOCK_STEP);assert.equal(plan.totalAdded,TARGETS.length*5);
assert.equal(plan.allRegistered,true);assert.deepEqual(TARGETS.map(t=>t.code).sort(),LIMITED_SHARD_CRAFTS.map(d=>d.code).sort());
for(const t of TARGETS){assert(LIMITED_SHARD_CRAFTS.some(d=>d.code===t.code&&d.key===t.key&&d.recipeCode===t.recipeCode));assert(t.crafted>=0&&t.crafted<=t.before);assert.equal(t.after,t.before+5);assert(t.after<=LIMITED_CRAFT_STOCK_MAX);}
export async function inspect(db){
 const policies=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[...MERCENARY_CRAFTS.map(d=>d.key),...extraSettings]]);
 const recipes=await q(db,'SELECT * FROM workshop_recipes_v1668 WHERE code=ANY($1::text[]) ORDER BY code',[MERCENARY_CRAFTS.map(d=>d.recipeCode)]);
 const materials=await q(db,'SELECT m.* FROM workshop_recipe_materials_v1668 m JOIN workshop_recipes_v1668 r ON r.id=m.recipe_id WHERE r.code=ANY($1::text[]) ORDER BY m.recipe_id,m.item_code',[MERCENARY_CRAFTS.map(d=>d.recipeCode)]);
 const issues=await q(db,"SELECT r.code AS recipe_code,l.* FROM workshop_craft_logs_v1668 l JOIN workshop_recipes_v1668 r ON r.id=l.recipe_id WHERE r.code=ANY($1::text[]) AND l.output_type='MERCENARY' AND l.output_ref=r.output_ref AND l.success=1 ORDER BY r.code,l.id",[LIMITED_SHARD_CRAFTS.map(d=>d.recipeCode)]);
 const stock=LIMITED_SHARD_CRAFTS.map(d=>{const raw=policies.find(p=>p.key===d.key)?.value??null,policy=validateMercenaryCraft(raw?JSON.parse(raw):mercenaryCraftDraft(d),d),crafted=issues.filter(i=>i.recipe_code===d.recipeCode).reduce((n,i)=>n+Number(i.output_quantity),0);return {code:d.code,name:d.art.name,key:d.key,recipeCode:d.recipeCode,raw,policy,...mercenaryCraftStock({...d,limit:policy.stockLimit},crafted)};});
 const saved=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[OP,...TARGETS.map(receiptKey)]]);
 return {policies,stock,recipesHash:hash(recipes),materialsHash:hash(materials),issuesHash:hash(issues),issueRecords:issues.length,receipt:saved.find(r=>r.key===OP)?parse(saved.find(r=>r.key===OP).value):null,stockReceipts:saved.filter(r=>r.key!==OP)};
}
const originalPolicy=s=>s.raw===null?mercenaryCraftDraft(LIMITED_SHARD_CRAFTS.find(d=>d.code===s.code)):parse(s.raw);
const protectedHash=s=>hash({
 otherPolicies:s.policies.filter(r=>!TARGETS.some(t=>t.key===r.key)),
 targetPolicies:s.stock.map(row=>{const {revision,stockLimit,...unchanged}=originalPolicy(row);return {key:row.key,unchanged};}),
 recipesHash:s.recipesHash,materialsHash:s.materialsHash,issuesHash:s.issuesHash
});
export function prepareIncrease(state){
 assert.deepEqual(state.stock.map(s=>s.code).sort(),TARGETS.map(t=>t.code).sort(),'Registered SSS limited recipe list changed; review again');
 return TARGETS.map(t=>{
  const s=one(state.stock.filter(s=>s.code===t.code));assert.equal(hash(s.raw),t.rawHash,'Craft settings changed: '+t.code);assert.equal(s.policy.revision,t.expectedRevision);assert.equal(s.limit,t.before);assert(s.crafted>=t.crafted&&s.crafted<=s.limit,'Craft issue count moved outside the reviewed limit');
  const before=originalPolicy(s),after={...before,revision:before.revision+1,stockLimit:before.stockLimit+5};
  const definition=LIMITED_SHARD_CRAFTS.find(d=>d.code===t.code);assert.deepEqual(validateMercenaryCraft(after,definition),{...s.policy,revision:s.policy.revision+1,stockLimit:t.after});
  assert.deepEqual({...after,revision:before.revision,stockLimit:before.stockLimit},before);
  return {target:t,before,after,raw:s.raw,requestId:request(t),receiptKey:receiptKey(t),payload:JSON.stringify({actor:1,code:t.recipeCode,expectedRevision:t.expectedRevision,requestId:request(t)}),result:{code:t.recipeCode,added:5,limit:t.after,revision:after.revision}};
 });
}
export async function verify(db,receipt,{exact=false}={}){
 const current=await inspect(db);receipt??=current.receipt;assert(receipt);assert.deepEqual(current.receipt,receipt);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OP);assert.equal(receipt.planHash,PLAN_HASH);assert.equal(receipt.totalAdded,plan.totalAdded);assert.equal(receipt.accountGrants,0);assert.equal(receipt.protectedBefore,receipt.protectedAfter);
 assert.equal(receipt.rows.length,TARGETS.length);assert.equal(current.stockReceipts.length,TARGETS.length);
 const stocks=[];for(const t of TARGETS){
  const row=one(receipt.rows.filter(r=>r.code===t.code)),s=one(current.stock.filter(s=>s.code===t.code));assert.equal(row.after.stockLimit,t.after);assert.equal(row.after.revision,row.before.revision+1);assert.deepEqual({...row.after,stockLimit:row.before.stockLimit,revision:row.before.revision},row.before);
  assert(s.policy.revision>=row.after.revision);if(s.policy.revision===row.after.revision)assert.deepEqual(parse(s.raw),row.after);
  assert(s.crafted>=t.crafted&&s.crafted<=s.limit);assert(s.limit>=t.after);
  const stockReceipt=parse(one(current.stockReceipts.filter(r=>r.key===receiptKey(t))).value);assert.deepEqual(stockReceipt,{payload:row.payload,result:row.result});
  const audit=one(await q(db,'SELECT admin_id,action_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1',[row.auditId]));assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'MERCENARY_LIMITED_SHARD_STOCK_ADD');assert.equal(audit.target_id,t.code);assert.deepEqual(parse(audit.before_data),row.before);assert.deepEqual(parse(audit.after_data),{...row.after,added:5,requestId:request(t)});
  stocks.push({code:t.code,name:t.name,beforeLimit:t.before,limit:s.limit,crafted:s.crafted,remaining:s.remaining,added:5,revision:s.policy.revision,active:s.policy.isActive,public:s.policy.isPublic});
 }
 if(exact)assert.equal(protectedHash(current),receipt.protectedBefore);
 const audit=one(await q(db,'SELECT id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));assert.equal(audit.id,receipt.auditId);const {auditId,...recorded}=receipt;assert.deepEqual(parse(audit.after_data),recorded);
 return {verified:true,operationKey:OP,targets:stocks,totalAdded:plan.totalAdded,accountGrants:0,auditId:receipt.auditId};
}
export async function increaseStock(db,{expectedPlanHash,dryRun=true}={}){
 assert.equal(expectedPlanHash,PLAN_HASH,'Reviewed plan required');
 const prior=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);if(prior.length){const receipt=parse(one(prior).value);return {replayed:true,committed:true,receipt,verification:await verify(db,receipt)};}
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='15s'");await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
  const replay=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);if(replay.length){const receipt=parse(one(replay).value),verification=await verify(db,receipt);await db.query('ROLLBACK');return {replayed:true,committed:true,receipt,verification};}
  // Same policy rows that crafting and OWNER +5 operations lock; deterministic order.
  await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[LIMITED_SHARD_CRAFTS.map(d=>d.key)]);
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const before=await inspect(db);assert.equal(before.stockReceipts.length,0,'Existing per-recipe receipt requires reconciliation');const changes=prepareIncrease(before),now=new Date().toISOString(),rows=[];
  for(const change of changes){const {target:t,after,raw,receiptKey:key,payload,result,requestId}=change;
   if(raw===null){
    // Unconfigured registered recipes keep their draft costs and OFF states.
    // A concurrent initialization must win without being overwritten.
    one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING RETURNING key',[t.key,JSON.stringify(after),now]));
   }else one(await q(db,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(after),now,t.key,raw]));
   const audit=one(await q(db,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id::text',['MERCENARY_LIMITED_SHARD_STOCK_ADD','MERCENARY',t.code,JSON.stringify(change.before),JSON.stringify({...after,added:5,requestId})]));
   await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[key,JSON.stringify({payload,result}),now]);
   rows.push({code:t.code,name:t.name,before:change.before,after,payload,result,auditId:audit.id});
  }
  const after=await inspect(db),protectedBefore=protectedHash(before),protectedAfter=protectedHash(after);assert.equal(protectedAfter,protectedBefore);
  const receipt={status:'COMPLETED',operationKey:OP,planHash:PLAN_HASH,authorization:plan.authorization,selectedAt:plan.selectedAt,completedAt:now,rows,totalAdded:plan.totalAdded,accountGrants:0,protectedBefore,protectedAfter,issuesBeforeHash:before.issuesHash,issuesAfterHash:after.issuesHash,issueRecords:before.issueRecords};
  const audit=one(await q(db,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id::text',[ACTION,'MERCENARY_CRAFT',OP,JSON.stringify({targets:rows.map(r=>({code:r.code,policy:r.before})),issuesHash:before.issuesHash}),JSON.stringify(receipt)]));receipt.auditId=audit.id;
  await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(receipt),now]);
  const verification=await verify(db,receipt,{exact:true});await db.query(dryRun?'ROLLBACK':'COMMIT');
  if(dryRun){const restored=await inspect(db);assert.deepEqual(restored,before,'Dry run failed to restore original state');}
  return {replayed:false,committed:!dryRun,rollbackVerified:dryRun,receipt,verification};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
