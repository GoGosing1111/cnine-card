import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {
 HALLOWEEN_PACK_KEY,HALLOWEEN_RERUN_KEY,HALLOWEEN_RERUN_LIMITS,HALLOWEEN_RERUN_OPENS_AT,
 halloweenRerunStockKey,readHalloweenPackSettings
} from '../../shared/mercenary-halloween-pack-v1.mjs';

const codes=Object.keys(HALLOWEEN_RERUN_LIMITS).sort();
const stockKeys=codes.map(halloweenRerunStockKey);
const action='MERCENARY_HALLOWEEN_RERUN_SCHEDULE';
const query=async(db,sql,args=[])=>(await db.query(sql,args)).rows;

export async function verifyHalloweenRerun(db,{dryRun=false}={}){
 const [row]=await query(db,'SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_RERUN_KEY]);
 assert(row,'Halloween rerun has not been scheduled');
 const plan=JSON.parse(row.value);
 assert.equal(plan.version,1);
 assert.equal(plan.opensAt,HALLOWEEN_RERUN_OPENS_AT);
 const rows=await query(db,'SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[stockKeys]);
 assert.equal(rows.length,codes.length);
 const stock=rows.map((row,index)=>{
  const code=codes[index],limit=HALLOWEEN_RERUN_LIMITS[code],issued=Number(row.issued);
  assert.equal(row.code,halloweenRerunStockKey(code));
  assert.equal(Number(row.stock_limit),limit);
  assert(Number.isSafeInteger(issued)&&issued>=0&&issued<=limit);
  return {code,limit,issued,remaining:limit-issued};
 });
 if(!dryRun){
  const [audit]=await query(db,'SELECT admin_id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[plan.auditId]);
  assert(audit,'Missing rerun schedule audit');
  assert.equal(Number(audit.admin_id),1);
  assert.equal(audit.action_type,action);
  assert.equal(audit.target_id,HALLOWEEN_RERUN_KEY);
  const logged=JSON.parse(audit.after_data);
  assert.equal(logged.opensAt,plan.opensAt);
  assert.deepEqual(logged.limits,HALLOWEEN_RERUN_LIMITS);
 }
 return {opensAt:plan.opensAt,auditId:plan.auditId,stock};
}

export async function prepareHalloweenRerun(db,{dryRun=false}={}){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");
  await db.query("SET LOCAL statement_timeout='15s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[HALLOWEEN_RERUN_KEY]);
  const existing=await query(db,'SELECT key FROM app_meta WHERE key=$1',[HALLOWEEN_RERUN_KEY]);
  if(existing.length){
   const result=await verifyHalloweenRerun(db);
   await db.query('ROLLBACK');
   return {...result,replayed:true};
  }
  const [clock]=await query(db,'SELECT clock_timestamp() AS now');
  assert(new Date(clock.now).getTime()<Date.parse(HALLOWEEN_RERUN_OPENS_AT),'The requested opening time has passed');
  const [owner]=await query(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");
  assert(owner,'Active OWNER audit account required');
  const [pack]=await query(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[HALLOWEEN_PACK_KEY]);
  assert(pack,'The original pack configuration is required');
  const {revision,settings}=JSON.parse(pack.value);
  const previous=readHalloweenPackSettings(settings);
  assert.equal(previous.mode,'ON','The original pack is not ready for sale');
  assert(Object.values(previous.prices).every(price=>price>0));
  assert(Object.values(previous.cardRatesPpm).every(rate=>rate>0));

  const stock=await query(db,'SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[codes]);
  const ledger=await query(db,'SELECT code,COUNT(*) AS issues,MAX(serial) AS last_serial FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[]) GROUP BY code ORDER BY code',[codes]);
  assert.deepEqual(stock.map(row=>row.code),codes);
  assert.deepEqual(ledger.map(row=>row.code),codes);
  for(const [index,row] of stock.entries()){
   const issued=Number(row.issued);
   assert(issued>0&&issued===Number(row.stock_limit),row.code+' has pre-existing available stock');
   assert.equal(Number(ledger[index].issues),issued,row.code+' issue count differs from global stock');
   assert.equal(Number(ledger[index].last_serial),issued,row.code+' needs serial reconciliation');
  }
  await db.query('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) SELECT * FROM unnest($1::text[],$2::bigint[])',[stockKeys,codes.map(code=>HALLOWEEN_RERUN_LIMITS[code])]);
  const plan={version:1,opensAt:HALLOWEEN_RERUN_OPENS_AT};
  if(!dryRun){
   const auditData={
    ...plan,limits:HALLOWEEN_RERUN_LIMITS,
    reason:'11월 25일 00:00 한국 시간 할로윈팩 복각. SS 리미티드 각 20장, SSS 리미티드 각 5장.'
   };
   const [audit]=await query(db,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
    [owner.id,action,'SETTING',HALLOWEEN_RERUN_KEY,JSON.stringify({revision,stock}),JSON.stringify(auditData)]);
   plan.auditId=String(audit.id);
  }
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[HALLOWEEN_RERUN_KEY,JSON.stringify(plan)]);
  const result=await verifyHalloweenRerun(db,{dryRun});
  assert(result.stock.every(row=>row.issued===0));
  await db.query(dryRun?'ROLLBACK':'COMMIT');
  return {...result,replayed:false};
 }catch(error){
  await db.query('ROLLBACK').catch(()=>{});
  throw error;
 }
}

async function main(){
 const [mode]=process.argv.slice(2);
 assert(['dry-run','apply','verify'].includes(mode),'Expected dry-run, apply, or verify');
 const cli='C:/Users/user/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js';
 const raw=execFileSync(process.execPath,[cli,'connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
 const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);
 assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine','Unexpected database destination');
 const db=new pg.Client({connectionString,application_name:'halloween-rerun-20261125',connectionTimeoutMillis:15000,query_timeout:20000});
 try{
  await db.connect();
  if(mode==='verify')await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const result=mode==='verify'?await verifyHalloweenRerun(db):await prepareHalloweenRerun(db,{dryRun:mode==='dry-run'});
  console.log(JSON.stringify({mode,...result}));
 }finally{
  if(mode==='verify')await db.query('ROLLBACK').catch(()=>{});
  await db.end();
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{
  console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));
  process.exitCode=1;
 });
}
