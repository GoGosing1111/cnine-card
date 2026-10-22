import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HALLOWEEN_PACK_KEY,readHalloweenPackSettings,validateHalloweenPack} from '../../shared/mercenary-halloween-pack-v1.mjs';
export const OP='ops:jokro-halloween-limit-minus-one:20261022:v1';
export const AUTHORIZATION='족로 할로윈상점 한도 한장 차감해';
export const ACTION='MERCENARY_HALLOWEEN_JOKRO_LIMIT_REDUCTION';
const CODE='V-979';
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]);
export const documentHash=raw=>createHash('sha256').update(raw).digest('hex');
const digest=value=>documentHash(JSON.stringify(value));
const stock=async(db,lock=false)=>(await q(db,'SELECT * FROM mercenary_limited_stock_v1 ORDER BY code'+(lock?' FOR UPDATE':''))).map(s=>({...s,stock_limit:s.stock_limit===null?null:Number(s.stock_limit),issued:Number(s.issued),revision:Number(s.revision)}));
const issues=db=>q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[CODE]);
export function prepareJokroLimit(settings){
 const next=readHalloweenPackSettings(settings);
 assert.equal(next.stockLimits[CODE],3,'Reviewed Jokro limit changed');
 next.stockLimits[CODE]=2;
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
 assert.equal(r.stockRemoved,1);assert.equal(r.grants,0);assert.equal(r.issuedBefore,r.issuedAfter);assert.equal(r.issuesBeforeHash,r.issuesAfterHash);
 assert.deepEqual(r.after.settings,prepareJokroLimit(r.before.settings));assert.equal(r.after.revision,r.before.revision+1);
 assert.equal(current.document.settings.stockLimits[CODE],2);assert(current.document.revision>=r.after.revision);
 if(current.document.revision===r.after.revision)assert.deepEqual(current.document,r.after);
 const target=current.stock.find(s=>s.code===CODE);assert.equal(target.stock_limit,2);assert(target.issued>=r.issuedAfter&&target.issued<=2);
 const a=one(await q(db,'SELECT id,admin_id,action_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1',[r.auditId]));
 assert.equal(Number(a.admin_id),1);assert.equal(a.action_type,ACTION);assert.equal(a.target_id,OP);
 const {auditId,...logged}=r;assert.deepEqual(JSON.parse(a.after_data),logged);assert.deepEqual(JSON.parse(a.before_data),{document:r.before,stock:r.beforeStock});
 return {verified:true,receipt:r,limit:target.stock_limit,issued:target.issued,remaining:target.stock_limit-target.issued,currentRevision:current.document.revision};
}
export async function reduceJokroLimit(db,{dryRun=true,expectedDocumentHash}={}){
 if((await q(db,'SELECT key FROM app_meta WHERE key=$1',[OP])).length)return {...await verify(db),replayed:true,dryRun};
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='15s'");
  await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
  const stored=one(await q(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[HALLOWEEN_PACK_KEY]));
  if((await q(db,'SELECT key FROM app_meta WHERE key=$1',[OP])).length){const r=await verify(db);await db.query('ROLLBACK');return {...r,replayed:true,dryRun};}
  assert.equal(documentHash(stored.value),expectedDocumentHash,'Pack settings changed; inspect again');
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const beforeStock=await stock(db,true),target=beforeStock.find(s=>s.code===CODE),beforeIssues=await issues(db);
  assert.equal(target?.stock_limit,3);assert(target.issued>=0&&target.issued<=2,'Cannot retire an already issued slot');
  assert.equal(beforeIssues.length,target.issued,'Issuance counter must match genuine issues');
  assert(beforeIssues.every(i=>Number(i.serial)>=1&&Number(i.serial)<=target.issued));
  const before=JSON.parse(stored.value),settings=prepareJokroLimit(before.settings),now=new Date().toISOString();
  const after={...before,revision:before.revision+1,settings,updatedAt:now,updatedBy:1,lastRequestId:OP};
  one(await q(db,'UPDATE mercenary_limited_stock_v1 SET stock_limit=2,revision=revision+1 WHERE code=$1 AND stock_limit=3 AND issued=$2 RETURNING code',[CODE,target.issued]));
  one(await q(db,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(after),now,HALLOWEEN_PACK_KEY,stored.value]));
  const afterStock=await stock(db),afterIssues=await issues(db);
  assert.deepEqual(afterStock,beforeStock.map(s=>s.code===CODE?{...s,stock_limit:2,revision:s.revision+1}:s));
  assert.deepEqual(afterIssues,beforeIssues);
  const r={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,completedAt:now,stockRemoved:1,grants:0,
   issuedBefore:target.issued,issuedAfter:target.issued,remainingBefore:3-target.issued,remainingAfter:2-target.issued,
   issuesBeforeHash:digest(beforeIssues),issuesAfterHash:digest(afterIssues),before,after,beforeStock,afterStock};
  r.auditId=String(one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'SETTING',$2,$3,$4) RETURNING id",[ACTION,OP,JSON.stringify({document:before,stock:beforeStock}),JSON.stringify(r)])).id);
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
  const result=await verify(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...result,replayed:false,dryRun};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
