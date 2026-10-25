import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {inspectLandingGift,grantLandingGift,verifyLandingGift,OPERATION_KEY,TITLE,ACTION,COIN_PER_USER} from './cnine-safe-landing-verified-30t-20261025.mjs';
const [mode,directory]=process.argv.slice(2);assert(['read','dry-run','apply','verify'].includes(mode));assert(directory);const out=path.resolve(directory);fs.mkdirSync(out,{recursive:true});
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'cnine-safe-landing-verified-30t-20261025',connectionTimeoutMillis:15000});
const artifacts=async()=> (await db.query(`SELECT (SELECT COUNT(*)::int FROM coin_logs WHERE reason=$1) coins,(SELECT COUNT(*)::int FROM user_messages WHERE title=$1) messages,(SELECT COUNT(*)::int FROM admin_logs WHERE action_type=$2 AND target_id=$3) audits,(SELECT COUNT(*)::int FROM app_meta WHERE key=$3) receipts`,[TITLE,ACTION,OPERATION_KEY])).rows[0];
try{
 await db.connect();let result;
 if(mode==='read'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='120s'");result=await inspectLandingGift(db);
  result.statusCounts=(await db.query("SELECT UPPER(TRIM(COALESCE(u.status,'ACTIVE'))) status,COUNT(*)::int n FROM users u WHERE EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) GROUP BY 1 ORDER BY 1")).rows;
  result.providers=(await db.query("SELECT s.provider,COUNT(*)::int n FROM user_second_verifications s JOIN users u ON u.id=s.user_id WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE' GROUP BY 1 ORDER BY 1")).rows;
  result.unsafeBalances=Number((await db.query("SELECT COUNT(*)::int n FROM users u WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE' AND EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) AND (u.coin<0 OR u.coin>$1::bigint)",[String(BigInt(Number.MAX_SAFE_INTEGER)-BigInt(COIN_PER_USER))])).rows[0].n);
  await db.query('ROLLBACK');
 }else if(mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='120s'");result=await verifyLandingGift(db);result.artifacts=await artifacts();assert.equal(result.artifacts.coins,result.recipientCount);assert.equal(result.artifacts.messages,0);assert.equal(result.artifacts.audits,1);assert.equal(result.artifacts.receipts,1);await db.query('ROLLBACK');
 }else{
  const plan=JSON.parse(fs.readFileSync(path.join(out,'read.json'),'utf8'));assert.equal(plan.unsafeBalances,0);assert.equal(plan.matchingCoinLogs,0);assert.equal(plan.matchingMessages,0);
  result=await grantLandingGift(db,{expectedRecipientHash:plan.recipientHash,commit:mode==='apply'});
  if(mode==='dry-run'){const after=await artifacts();assert.deepEqual(after,{coins:0,messages:0,audits:0,receipts:0});result.rollbackVerified=true;}
  else{const replay=await grantLandingGift({query:(sql,args)=>{assert.match(sql,/^SELECT\b/,'Replay must be read-only');return db.query(sql,args);}},{expectedRecipientHash:plan.recipientHash,commit:true});assert(replay.replayed);result.noWriteReplayVerified=true;}
 }
 fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
 const compact=result.verification??result;console.log(JSON.stringify({mode,status:compact.status,recipientCount:compact.recipientCount,coinPerUser:COIN_PER_USER,totalCoin:compact.totalCoin,roles:result.roles??result.receipt?.roles,statusCounts:result.statusCounts,providers:result.providers,unsafeBalances:result.unsafeBalances,matchingCoinLogs:result.matchingCoinLogs,matchingMessages:result.matchingMessages,priorReceipt:mode==='read'?Boolean(result.receipt):undefined,auditId:compact.auditId,rollbackVerified:result.rollbackVerified,noWriteReplayVerified:result.noWriteReplayVerified,artifacts:result.artifacts}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
