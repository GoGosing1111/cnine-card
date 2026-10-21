import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
import {ADMIN_LOG_HIDDEN_ACCOUNT_ID,ADMIN_LOG_HIDDEN_NICKNAME,ADMIN_LOG_VISIBLE_QUERY,ADMIN_LOG_VISIBLE_PARAMS,ADMIN_LOG_VISIBLE_WHERE} from '../../../functions/_admin_log_visibility.js';

const mode=process.argv[2]||'preflight';
assert(['preflight','postdeploy'].includes(mode));
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);
assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'admin-log-visibility-check',connectionTimeoutMillis:15000});
const query=async(sql,params=[])=>db.query(__postgresCompatTest.translateDialect(__postgresCompatTest.bindQuestionMarks(sql).text),params);
const classified=row=>{
 if(Number(row.admin_id)===ADMIN_LOG_HIDDEN_ACCOUNT_ID)return true;
 if(String(row.admin_nickname||'').trim()===ADMIN_LOG_HIDDEN_NICKNAME)return true;
 if(/^(OPS_|CODEX_)/.test(String(row.action_type||'').trim().toUpperCase()))return true;
 for(const col of ['before_data','after_data']){
  let data;try{data=JSON.parse(row[col]||'null');}catch{continue;}
  if(!data||typeof data!=='object')continue;
  if(['actor','source'].some(k=>['CODEX','CODEX_OPERATIONS','SYSTEM_OPS'].includes(String(data[k]||'').trim().toUpperCase())))return true;
  if(/^ops:/i.test(String(data.operationKey||'').trim()))return true;
 }
 return false;
};
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 const account=(await query('SELECT id,nickname FROM users WHERE id=?',[ADMIN_LOG_HIDDEN_ACCOUNT_ID])).rows;
 assert.equal(account.length,1);assert.equal(account[0].nickname.trim(),ADMIN_LOG_HIDDEN_NICKNAME);
 const totals=(await query(`SELECT COUNT(*) AS total,
  SUM(CASE WHEN l.admin_id=? THEN 1 ELSE 0 END) AS excluded_account,
  SUM(CASE WHEN ${ADMIN_LOG_VISIBLE_WHERE} THEN 1 ELSE 0 END) AS visible
  FROM admin_logs l LEFT JOIN users u ON u.id=l.admin_id`,[ADMIN_LOG_HIDDEN_ACCOUNT_ID,...ADMIN_LOG_VISIBLE_PARAMS])).rows[0];
 const latest=(await query(ADMIN_LOG_VISIBLE_QUERY,ADMIN_LOG_VISIBLE_PARAMS)).rows;
 assert.equal(latest.filter(classified).length,0);
 const markedWithoutExcludedActor=(await query(`SELECT COUNT(*) AS count
 FROM admin_logs l LEFT JOIN users u ON u.id=l.admin_id
 WHERE COALESCE(l.admin_id,0)<>? AND NOT (${ADMIN_LOG_VISIBLE_WHERE})`,[ADMIN_LOG_HIDDEN_ACCOUNT_ID,...ADMIN_LOG_VISIBLE_PARAMS])).rows[0];
 await db.query('ROLLBACK');
 const report={checkedAt:new Date().toISOString(),mode,readOnly:true,accountIdentityVerified:true,queryUsesStableAccountId:true,
  storedRows:Number(totals.total),excludedAccountRows:Number(totals.excluded_account),additionalOperationsExcluded:Number(markedWithoutExcludedActor.count),
  visibleRows:Number(totals.visible),returnedRows:latest.length,excludedRowsReturned:0,gameDataWrites:0,
  scope:'CMS admin/logs response only; internal receipts and ledgers retained'};
 await writeFile(new URL(mode+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}
finally{await db.end();}
