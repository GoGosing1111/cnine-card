import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BLOODMOON_PACK_KEY,readBloodmoonPackSettings,validateBloodmoonPack} from '../../shared/mercenary-bloodmoon-pack-v1.mjs';
import {LIMITED_RATE_SCALE,LIMITED_RATE_TOTAL,limitedRateUnits} from '../../shared/mercenary-limited-rates-v1.mjs';

export const OP='ops:bloodmoon-expansion:20261025:ss10-leonel2-eunseol3-razak-v1';
export const AUTHORIZATION='SS 리미티드 6종 각 10장 추가; 레오넬 2장 추가; 은설 신규 3장, 최종 지시로 1회 확률 0.0000016%(기존 제너럴 족의 2배); 제너럴 족 기존 3장 유지; 라자크 일반 SSS 한도 없음, 레오넬 확률의 2배';
export const ACTION='MERCENARY_BLOODMOON_EXPANSION';
export const TARGETS=Object.freeze([
 ...['V-960','V-961','V-962','V-963','V-964','V-965'].map(code=>({code,before:30,after:40})),
 {code:'V-978',before:7,after:9},{code:'V-973',before:0,after:3}
].map(Object.freeze));
const codes=TARGETS.map(t=>t.code),q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]);
export const documentHash=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>documentHash(JSON.stringify(value));
const stock=async(db,lock=false)=>(await q(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code'+(lock?' FOR UPDATE':''),[codes])).map(s=>({...s,stock_limit:Number(s.stock_limit),issued:Number(s.issued),revision:Number(s.revision)}));
const issues=db=>q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[]) ORDER BY code,serial',[codes]);
const protectedPolicy=async db=>({
 settings:await q(db,"SELECT key,value FROM app_meta WHERE key IN ('mercenary_halloween_ss_pack_v1','mercenary_prime_craft_v1') ORDER BY key"),
 stockLimits:await q(db,'SELECT code,stock_limit FROM mercenary_limited_stock_v1 WHERE NOT(code=ANY($1::text[])) ORDER BY code',[codes])
});
export function prepareExpansion(settings){
 const next=readBloodmoonPackSettings(settings);
 for(const t of TARGETS){assert.equal(next.stockLimits[t.code],t.before||3,'Reviewed limit changed: '+t.code);next.stockLimits[t.code]=t.after;}
 assert.equal(next.cardRatesPpm['V-978'],200);assert.equal(next.cardRatesPpm['V-974'],10);
 assert.equal(next.cardRatesPpm['V-973'],0);assert.equal(next.cardRatesPpm['V-058'],0);
 next.cardRatesPpm['V-973']=next.cardRatesPpm['V-974']*2;
 next.cardRatesPpm['V-058']=next.cardRatesPpm['V-978']*2;
 const total=Object.values(next.cardRatesPpm).reduce((sum,n)=>sum+limitedRateUnits(n),0);
 assert(total<=LIMITED_RATE_TOTAL);
 next.normalSssRatePpm=(LIMITED_RATE_TOTAL-total)/LIMITED_RATE_SCALE;
 assert.equal(next.normalSssRatePpm,969369);
 assert(!Object.hasOwn(next.stockLimits,'V-058'));
 return validateBloodmoonPack(next);
}
export async function inspect(db){
 const raw=one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[BLOODMOON_PACK_KEY])).value;
 const receipts=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);
 return {raw,documentHash:documentHash(raw),document:JSON.parse(raw),stock:await stock(db),issues:await issues(db),protectedPolicy:await protectedPolicy(db),
  otherPackStock:await q(db,"SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code IN ('V-974','V-975','V-058') ORDER BY code"),receipt:receipts.length?JSON.parse(one(receipts).value):null};
}
export async function verify(db){
 const current=await inspect(db),r=current.receipt;
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.authorization,AUTHORIZATION);
 assert.equal(r.stockAdded,65);assert.equal(r.grants,0);assert.equal(r.issuesBeforeHash,r.issuesAfterHash);
 assert.deepEqual(r.after.settings,prepareExpansion(r.before.settings));assert.equal(r.after.revision,r.before.revision+1);
 assert(current.document.revision>=r.after.revision);
 if(current.document.revision===r.after.revision)assert.deepEqual(current.document,r.after);
 const result=TARGETS.map(t=>{
  const s=current.stock.find(s=>s.code===t.code),before=r.beforeStock.find(s=>s.code===t.code);
  assert.equal(current.document.settings.stockLimits[t.code],t.after);assert.equal(s.stock_limit,t.after);assert(s.issued>=(before?.issued??0)&&s.issued<=t.after);
  return {...t,issued:s.issued,remaining:s.stock_limit-s.issued};
 });
 assert(!current.otherPackStock.some(s=>s.code==='V-058'),'Unlimited Razak has no stock row');
 for(const code of ['V-974','V-975'])assert.equal(Number(current.otherPackStock.find(s=>s.code===code)?.stock_limit),3);
 const a=one(await q(db,'SELECT id,admin_id,action_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1',[r.auditId]));
 assert.equal(Number(a.admin_id),1);assert.equal(a.action_type,ACTION);assert.equal(a.target_id,OP);
 const {auditId,...logged}=r;assert.deepEqual(JSON.parse(a.after_data),logged);assert.deepEqual(JSON.parse(a.before_data),{document:r.before,stock:r.beforeStock});
 return {verified:true,receipt:r,stock:result,currentRevision:current.document.revision};
}
export async function increaseStock(db,{dryRun=true,expectedDocumentHash}={}){
 if((await q(db,'SELECT key FROM app_meta WHERE key=$1',[OP])).length)return {...await verify(db),replayed:true,dryRun};
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='15s'");
  await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
  const stored=one(await q(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[BLOODMOON_PACK_KEY]));
  if((await q(db,'SELECT key FROM app_meta WHERE key=$1',[OP])).length){const r=await verify(db);await db.query('ROLLBACK');return {...r,replayed:true,dryRun};}
  assert.equal(documentHash(stored.value),expectedDocumentHash,'Pack settings changed; inspect again');
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const beforeStock=await stock(db,true),beforeIssues=await issues(db),protectedBefore=await protectedPolicy(db);
  assert.equal(beforeStock.length,TARGETS.length-1);
  for(const t of TARGETS){
   const s=beforeStock.find(s=>s.code===t.code),issued=beforeIssues.filter(i=>i.code===t.code);
   if(!t.before){assert.equal(s,undefined,'New pack counter already exists');assert.equal(issued.length,0);continue;}
   assert.equal(s?.stock_limit,t.before,'Stock limit changed: '+t.code);assert(Number.isSafeInteger(s.issued)&&s.issued>=0&&s.issued<=t.before);
   assert.equal(issued.length,s.issued,'Counter must match genuine issues: '+t.code);
   assert.deepEqual(issued.map(i=>Number(i.serial)),Array.from({length:s.issued},(_,i)=>i+1));
  }
  assert(!protectedBefore.stockLimits.some(s=>s.code==='V-058'));
  const before=JSON.parse(stored.value),settings=prepareExpansion(before.settings),now=new Date().toISOString();
  const after={...before,revision:before.revision+1,settings,updatedAt:now,updatedBy:1,lastRequestId:OP};
  for(const t of TARGETS){
   if(!t.before){one(await q(db,'INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES($1,$2,0) RETURNING code',[t.code,t.after]));continue;}
   const s=beforeStock.find(s=>s.code===t.code);
   one(await q(db,'UPDATE mercenary_limited_stock_v1 SET stock_limit=$1,revision=revision+1 WHERE code=$2 AND stock_limit=$3 AND issued=$4 AND revision=$5 RETURNING code',[t.after,t.code,t.before,s.issued,s.revision]));
  }
  one(await q(db,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(after),now,BLOODMOON_PACK_KEY,stored.value]));
  const afterStock=await stock(db),afterIssues=await issues(db);
  for(const t of TARGETS){const s=afterStock.find(s=>s.code===t.code),old=beforeStock.find(s=>s.code===t.code);if(old)assert.deepEqual(s,{...old,stock_limit:t.after,revision:old.revision+1});else{assert.equal(s.stock_limit,3);assert.equal(s.issued,0);}}
  assert.deepEqual(afterIssues,beforeIssues);assert.deepEqual(await protectedPolicy(db),protectedBefore);
  const r={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,completedAt:now,stockAdded:65,grants:0,
   issuesBeforeHash:digest(beforeIssues),issuesAfterHash:digest(afterIssues),protectedPolicyHash:digest(protectedBefore),before,after,beforeStock,afterStock};
  r.auditId=String(one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'SETTING',$2,$3,$4) RETURNING id",[ACTION,OP,JSON.stringify({document:before,stock:beforeStock}),JSON.stringify(r)])).id);
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
  const result=await verify(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...result,replayed:false,dryRun};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
