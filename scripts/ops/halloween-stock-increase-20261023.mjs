import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HALLOWEEN_PACK_KEY,readHalloweenPackSettings,validateHalloweenPack} from '../../shared/mercenary-halloween-pack-v1.mjs';

export const OP='ops:halloween-stock-increase:20261023:v1';
export const AUTHORIZATION='할로윈팩 SS리미티드 2장씩 한도 늘리고 바토리는 5장늘려 그리고 SSS리미티드에서 진무랑 족로 1장씩 늘려';
export const ACTION='MERCENARY_HALLOWEEN_STOCK_INCREASE';
export const TARGETS=Object.freeze([
 {code:'V-980',name:'나무늘봉순',before:11,after:13},
 {code:'V-981',name:'조은',before:11,after:13},
 {code:'V-982',name:'하이희야',before:11,after:13},
 {code:'V-983',name:'오리꿍',before:11,after:13},
 {code:'V-984',name:'디임',before:11,after:13},
 {code:'V-985',name:'아윤',before:11,after:13},
 {code:'V-986',name:'남수댕',before:11,after:13},
 {code:'V-977',name:'바토리',before:15,after:20},
 {code:'V-989',name:'진무',before:4,after:5},
 {code:'V-979',name:'족로',before:2,after:3}
].map(Object.freeze));
const codes=TARGETS.map(t=>t.code);
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]);
export const documentHash=raw=>createHash('sha256').update(raw).digest('hex');
const digest=value=>documentHash(JSON.stringify(value));
const stock=async(db,lock=false)=>(await q(db,'SELECT * FROM mercenary_limited_stock_v1 ORDER BY code'+(lock?' FOR UPDATE':''))).map(s=>({...s,stock_limit:s.stock_limit===null?null:Number(s.stock_limit),issued:Number(s.issued),revision:Number(s.revision)}));
const issues=db=>q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[]) ORDER BY code,serial',[codes]);

export function prepareStockIncrease(settings){
 const next=readHalloweenPackSettings(settings);
 for(const t of TARGETS){assert.equal(next.stockLimits[t.code],t.before,'Reviewed limit changed: '+t.code);next.stockLimits[t.code]=t.after;}
 return validateHalloweenPack(next);
}
export async function inspect(db){
 const raw=one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).value;
 const receipts=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);
 return {raw,document:JSON.parse(raw),stock:await stock(db),issues:await issues(db),receipt:receipts.length?JSON.parse(one(receipts).value):null};
}
export async function verify(db){
 const current=await inspect(db),r=current.receipt;
 assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.authorization,AUTHORIZATION);
 assert.equal(r.stockAdded,21);assert.equal(r.grants,0);assert.equal(r.issuesBeforeHash,r.issuesAfterHash);
 assert.deepEqual(r.after.settings,prepareStockIncrease(r.before.settings));assert.equal(r.after.revision,r.before.revision+1);
 assert.deepEqual(r.afterStock,r.beforeStock.map(s=>{const t=TARGETS.find(t=>t.code===s.code);return t?{...s,stock_limit:t.after,revision:s.revision+1}:s;}));
 assert(current.document.revision>=r.after.revision);
 if(current.document.revision===r.after.revision)assert.deepEqual(current.document,r.after);
 const result=TARGETS.map(t=>{
  assert.equal(current.document.settings.stockLimits[t.code],t.after);
  const s=current.stock.find(s=>s.code===t.code),before=r.beforeStock.find(s=>s.code===t.code);
  assert.equal(s.stock_limit,t.after);assert(s.issued>=before.issued&&s.issued<=t.after);
  return {...t,issued:s.issued,remaining:s.stock_limit-s.issued};
 });
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
  const stored=one(await q(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[HALLOWEEN_PACK_KEY]));
  if((await q(db,'SELECT key FROM app_meta WHERE key=$1',[OP])).length){const r=await verify(db);await db.query('ROLLBACK');return {...r,replayed:true,dryRun};}
  assert.equal(documentHash(stored.value),expectedDocumentHash,'Pack settings changed; inspect again');
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const beforeStock=await stock(db,true),beforeIssues=await issues(db);
  for(const t of TARGETS){
   const s=beforeStock.find(s=>s.code===t.code),issued=beforeIssues.filter(i=>i.code===t.code);
   assert.equal(s?.stock_limit,t.before,'Stock limit changed: '+t.code);assert(Number.isSafeInteger(s.issued)&&s.issued>=0&&s.issued<=t.before);
   assert.equal(issued.length,s.issued,'Counter must match genuine issues: '+t.code);
   assert.deepEqual(issued.map(i=>Number(i.serial)),Array.from({length:s.issued},(_,i)=>i+1),'Issuance serials must be continuous');
  }
  const before=JSON.parse(stored.value),settings=prepareStockIncrease(before.settings),now=new Date().toISOString();
  const after={...before,revision:before.revision+1,settings,updatedAt:now,updatedBy:1,lastRequestId:OP};
  for(const t of [...TARGETS].sort((a,b)=>a.code.localeCompare(b.code))){
   const s=beforeStock.find(s=>s.code===t.code);
   one(await q(db,'UPDATE mercenary_limited_stock_v1 SET stock_limit=$1,revision=revision+1 WHERE code=$2 AND stock_limit=$3 AND issued=$4 AND revision=$5 RETURNING code',[t.after,t.code,t.before,s.issued,s.revision]));
  }
  one(await q(db,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(after),now,HALLOWEEN_PACK_KEY,stored.value]));
  const afterStock=await stock(db),afterIssues=await issues(db);
  assert.deepEqual(afterStock,beforeStock.map(s=>{const t=TARGETS.find(t=>t.code===s.code);return t?{...s,stock_limit:t.after,revision:s.revision+1}:s;}));
  assert.deepEqual(afterIssues,beforeIssues);
  const r={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,completedAt:now,stockAdded:21,grants:0,
   issuesBeforeHash:digest(beforeIssues),issuesAfterHash:digest(afterIssues),before,after,beforeStock,afterStock};
  r.auditId=String(one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'SETTING',$2,$3,$4) RETURNING id",[ACTION,OP,JSON.stringify({document:before,stock:beforeStock}),JSON.stringify(r)])).id);
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
  const result=await verify(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...result,replayed:false,dryRun};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
