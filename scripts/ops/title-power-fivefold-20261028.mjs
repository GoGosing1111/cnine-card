import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './title-power-fivefold-20261028.plan.json' with {type:'json'};

export const PLAN=plan,OP=plan.operationKey,ACTION='OPS_TITLE_POWER_FIVEFOLD';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export const PLAN_HASH=hash(plan);
const numeric=new Set(['id','pve_power','is_active','is_public','sort_order']);
export const normalizeTitle=t=>Object.fromEntries(Object.entries(t).map(([k,v])=>[k,numeric.has(k)&&v!==null?String(v):v]));
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
export const readTitles=async db=>(await q(db,'SELECT * FROM character_titles ORDER BY id')).map(normalizeTitle);
export async function readReceipt(db){const rows=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?JSON.parse(one(rows).value):null;}
function validateReceipt(r){assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,PLAN_HASH);assert.deepEqual(r.changes,PLAN.changes);assert.equal(r.preservedBeforeHash,r.preservedAfterHash);}
const protectedFields=rows=>rows.map(({pve_power,updated_at,...rest})=>rest);
assert.equal(PLAN.multiplier,5);assert.equal(PLAN.scope,'ALL_EXISTING_CHARACTER_TITLES');
assert.equal(new Set(PLAN.changes.map(t=>t.id)).size,PLAN.changes.length);
for(const t of PLAN.changes){assert(Number.isSafeInteger(t.before)&&t.before>=0);assert.equal(t.after,t.before*5);assert(Number.isSafeInteger(t.after)&&t.after<=100000000);}

// Absolute, reviewed values are written once. The caller must explicitly choose
// commit; dryRun defaults true. No account, ownership or loadout writes occur.
export async function applyFivefold(db,{expectedPlanHash,dryRun=true}={}){
 const saved=await readReceipt(db);if(saved){validateReceipt(saved);return {replayed:true,committed:true,receipt:saved};}
 assert.equal(expectedPlanHash,PLAN_HASH,'Reviewed plan hash required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");
  await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
  const repeated=await readReceipt(db);if(repeated){validateReceipt(repeated);await db.query('ROLLBACK');return {replayed:true,committed:true,receipt:repeated};}
  // Only 22 catalog rows. Briefly exclude competing edits/new titles while
  // validating the complete roster, without blocking title readers.
  await db.query('LOCK TABLE character_titles IN SHARE ROW EXCLUSIVE MODE');
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const before=await readTitles(db);
  assert.deepEqual(before,PLAN.titlesBefore.map(normalizeTitle),'Title catalog changed since review');
  const versionBefore=BigInt(one(await q(db,'SELECT revision::text FROM ranked_duo_policy_version_v1 WHERE id=1 FOR UPDATE')).revision);
  const now=new Date().toISOString();
  const rows=await q(db,`UPDATE character_titles t SET pve_power=p.after,updated_at=$2
    FROM jsonb_to_recordset($1::jsonb) AS p(id bigint,code text,before bigint,after bigint)
    WHERE t.id=p.id AND t.code=p.code AND t.pve_power=p.before RETURNING t.id::text`,[JSON.stringify(PLAN.changes),now]);
  assert.equal(rows.length,PLAN.changes.length,'Incomplete title update');
  const after=await readTitles(db);
  for(let i=0;i<after.length;i++)assert.deepEqual(after[i],{...before[i],pve_power:String(PLAN.changes[i].after),updated_at:now});
  const versionAfter=BigInt(one(await q(db,'SELECT revision::text FROM ranked_duo_policy_version_v1 WHERE id=1')).revision);
  assert.equal(versionAfter,versionBefore+1n,'Existing duo invalidation must run once');
  const receipt={status:'COMPLETED',operationKey:OP,planHash:PLAN_HASH,authorization:PLAN.authorization,completedAt:now,multiplier:5,titleCount:rows.length,changes:PLAN.changes,modes:PLAN.modes,accountWrites:0,ownershipWrites:0,loadoutWrites:0,preservedBeforeHash:hash(protectedFields(before)),preservedAfterHash:hash(protectedFields(after)),beforeHash:hash(before),afterHash:hash(after),duoPolicyBefore:String(versionBefore),duoPolicyAfter:String(versionAfter)};
  assert.equal(receipt.preservedBeforeHash,receipt.preservedAfterHash);
  receipt.auditId=one(await q(db,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id::text',[ACTION,'CHARACTER_TITLES',OP,JSON.stringify({titles:before}),JSON.stringify(receipt)])).id;
  await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(receipt),now]);
  assert.deepEqual(await readReceipt(db),receipt);
  await db.query(dryRun?'ROLLBACK':'COMMIT');
  return {replayed:false,committed:!dryRun,receipt};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
