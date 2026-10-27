import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
const packKey='mercenary_blackcrown_ss_pack_v1',codes=['V-950','V-951','V-952','V-953','V-954','V-955'],removed=['V-978','V-974','V-975','V-973'];
const out='docs/qa/blackcrown-off-ss10-20261027';fs.mkdirSync(out,{recursive:true});
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,'');const uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'blackcrown-off-ss10-20261027',connectionTimeoutMillis:15000});
async function apply(kind,change){
 const key='ops:blackcrown-'+kind+':20261027:v1',done=(await db.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0];if(done)return {replayed:true,...JSON.parse(done.value)};
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='5s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
  const existing=(await db.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0];if(existing){await db.query('ROLLBACK');return {replayed:true,...JSON.parse(existing.value)};}
  const row=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[packKey])).rows[0];assert(row);const before=JSON.parse(row.value),next=structuredClone(before);
  const detail=await change(next);next.revision++;next.updatedAt=new Date().toISOString();next.updatedBy=1;
  await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(next),packKey]);
  const receipt={key,createdAt:next.updatedAt,before,after:next,...detail};
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['MERCENARY_BLACKCROWN_CORRECTION','SETTING',packKey,JSON.stringify(before),JSON.stringify(receipt)])).rows[0];receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(receipt)]);await db.query('COMMIT');return receipt;
 }catch(e){await db.query('ROLLBACK');throw e;}
}
try{
 await db.connect();
 const closed=await apply('close',async next=>{next.settings.mode='OFF';return {reason:'사용자 명시 지시: 블랙크라운팩 OFF 유지'};});fs.writeFileSync(out+'/closed.json',JSON.stringify(closed,null,2));console.log(JSON.stringify({mode:closed.after.settings.mode,revision:closed.after.revision,adminLogId:closed.adminLogId}));
 const adjusted=await apply('ss10-only',async next=>{
  assert.equal(next.settings.mode,'OFF');const stock=(await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[codes])).rows;
  assert.equal(stock.length,6);assert(stock.every(r=>Number(r.issued)<=10),'Issued copies exceed requested total cap; pack remains OFF');
  const sharedBefore=(await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[removed])).rows;
  for(const code of codes){next.settings.stockLimits[code]=10;await db.query('UPDATE mercenary_limited_stock_v1 SET stock_limit=10,revision=revision+1 WHERE code=$1',[code]);}
  for(const code of removed){next.settings.normalSssRatePpm+=next.settings.cardRatesPpm[code]??0;next.settings.cardRatesPpm[code]=0;}
  const schedule=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',['mercenary_blackcrown_stock_schedule_v1'])).rows[0];
  const cancelled=[];if(schedule){const doc=JSON.parse(schedule.value);for(const s of doc.schedules||[])if(s.status==='SCHEDULED'){s.status='CANCELLED';s.completedAt=new Date().toISOString();s.cancelledBy=1;s.cancelReason='사용자 신규 SS 총 한도 10장 정정';cancelled.push(s.id);}if(cancelled.length){doc.revision++;await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(doc),'mercenary_blackcrown_stock_schedule_v1']);}}
  assert.deepEqual((await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[removed])).rows,sharedBefore);
  return {reason:'블랙크라운 SSS 리미티드/프라임 재료 제외, 신규 SS 6종 총 한도 각 10장',stockBefore:stock,stockAfter:(await db.query('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[codes])).rows,sharedBefore,cancelledSchedules:cancelled};
 });fs.writeFileSync(out+'/adjusted.json',JSON.stringify(adjusted,null,2));console.log(JSON.stringify({mode:adjusted.after.settings.mode,revision:adjusted.after.revision,adminLogId:adjusted.adminLogId,stock:adjusted.stockAfter,removedRates:Object.fromEntries(removed.map(code=>[code,adjusted.after.settings.cardRatesPpm[code]]))}));
 if(process.argv.includes('--finalize')){
  const normalized=await apply('remove-rewards',async next=>{assert.equal(next.settings.mode,'OFF');for(const code of removed){assert.equal(next.settings.cardRatesPpm[code],0);delete next.settings.cardRatesPpm[code];delete next.settings.stockLimits[code];}return {reason:'SSS 리미티드·프라임 재료를 블랙크라운 정책에서 제거. 기존 전역 한도/보유는 유지.'};});
  fs.writeFileSync(out+'/normalized.json',JSON.stringify(normalized,null,2));console.log(JSON.stringify({normalized:true,mode:normalized.after.settings.mode,revision:normalized.after.revision,adminLogId:normalized.adminLogId}));
 }
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const current=JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[packKey])).rows[0].value),stock=(await db.query('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[codes])).rows;
 assert.equal(current.settings.mode,'OFF');assert(stock.every(r=>Number(r.stock_limit)===10));await db.query('ROLLBACK');fs.writeFileSync(out+'/current.json',JSON.stringify({checkedAt:new Date().toISOString(),current,stock},null,2));console.log(JSON.stringify({verifiedOff:true}));

}catch(error){console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
