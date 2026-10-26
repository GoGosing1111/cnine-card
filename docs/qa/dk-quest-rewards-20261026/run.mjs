import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),out=path.dirname(fileURLToPath(import.meta.url)),mode=process.argv[2];
assert(['config-dry-run','configure','delivery-dry-run','deliver','verify','replay'].includes(mode));
assert(!fs.existsSync(path.join(out,mode+'-private.json')),'Output already exists; inspect the existing receipt instead of repeating');
const op=await import(pathToFileURL(path.join(root,'scripts/ops/dk-quest-rewards-20261026.mjs'))),pg=createRequire(path.join(root,'package.json'))('pg');
const connectionString=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',windowsHide:true,timeout:30000,stdio:['ignore','pipe','pipe']}).trim().replace(/^['"]|['"]$/g,'');
const db=new pg.Client({connectionString,application_name:'dk-quest-rewards-20261026',connectionTimeoutMillis:15000}),sqlLog=[];
const client={query:(sql,args)=>{sqlLog.push(sql);if(['replay','verify'].includes(mode))assert(/^SELECT\b/.test(sql),'Verification adapter is SELECT-only');return db.query(sql,args);}};
const settings=async()=>Object.fromEntries((await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[op.DAILY_KEY,op.WEEKLY_KEY]])).rows.map(r=>[r.key,JSON.parse(r.value)]));
const saved=async()=>JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[op.OPERATION_KEY])).rows[0].value);
try{
 await db.connect();let result;
 if(mode.startsWith('config')){
  const before=JSON.parse(fs.readFileSync(path.join(out,'before-private.json'),'utf8'));
  const reviewed=Object.fromEntries(before.settings.filter(r=>[op.DAILY_KEY,op.WEEKLY_KEY].includes(r.key)).map(r=>[r.key,JSON.parse(r.value)]));
  result=await op.configureQuestIncrease(client,{dryRun:mode==='config-dry-run',expectedSettingsHash:op.hash(reviewed)});
  assert.deepEqual(await settings(),mode==='config-dry-run'?reviewed:result.receipt.after);
  if(mode==='config-dry-run')assert.equal((await db.query('SELECT key FROM app_meta WHERE key=$1',[op.OPERATION_KEY])).rows.length,0);
 }else if(mode.startsWith('deliver')){
  const receipt=await saved(),reviewed=JSON.parse(fs.readFileSync(path.join(out,'configure-private.json'),'utf8')).receipt;assert.equal(receipt.planHash,reviewed.planHash);
  result=await op.deliverQuestDeltas(client,{dryRun:mode==='delivery-dry-run',expectedPlanHash:reviewed.planHash});
  if(mode==='delivery-dry-run'){assert.equal((await saved()).status,'CONFIGURED');assert.equal((await db.query('SELECT id FROM user_messages WHERE campaign_key LIKE $1',[op.CAMPAIGN_PREFIX+'%'])).rows.length,0);}
 }else{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const receipt=await saved();assert.deepEqual(await settings(),receipt.after);
  if(mode==='replay'){
   const config=await op.configureQuestIncrease(client);assert(config.replayed);result=await op.deliverQuestDeltas(client,{expectedPlanHash:receipt.planHash});assert(result.replayed);
  }else result={receipt,verification:await op.verifyQuestIncrease(client,receipt)};
  await db.query('ROLLBACK');
 }
 const forbiddenWrites=sqlLog.filter(sql=>/^(UPDATE|INSERT INTO|DELETE FROM)\s+(users|coin_logs|wago_daily_quest_claims|quest_weekly_claims_v1|user_message_reward_claim_receipts_v1222)\b/i.test(sql));assert.equal(forbiddenWrites.length,0);
 const summary={mode,at:new Date().toISOString(),operationKey:op.OPERATION_KEY,status:result.receipt.status,summary:result.receipt.summary,planHash:result.receipt.planHash,configAuditId:result.receipt.configAuditId,deliveryAuditId:result.receipt.deliveryAuditId,verification:result.verification,dryRun:result.dryRun,replayed:result.replayed,directWalletOrSourceReceiptWrites:0,sqlStatements:sqlLog.length,writeStatements:sqlLog.filter(sql=>/^(UPDATE|INSERT INTO|DELETE FROM)\b/.test(sql)).length};
 fs.writeFileSync(path.join(out,mode+'-private.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.stack||error).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
