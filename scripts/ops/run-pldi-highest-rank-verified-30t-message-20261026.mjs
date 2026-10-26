import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {OP,TITLE,AMOUNT,hash,inspect,receipt,artifacts,send,verify,validatePlan} from './pldi-highest-rank-verified-30t-message-20261026.mjs';
const [mode,directory]=process.argv.slice(2);assert.ok(['read','dry-run','apply','verify','replay'].includes(mode));assert.ok(directory);
const out=path.resolve(directory);fs.mkdirSync(out,{recursive:true});const save=(name,data)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const sourceSha256=createHash('sha256').update(fs.readFileSync(new URL('./pldi-highest-rank-verified-30t-message-20261026.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert.ok(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'pldi-highest-rank-message-20261026',connectionTimeoutMillis:15000});
const allowed=new Set(['user_messages','user_message_rewards','admin_logs','app_meta']);
const query=db.query.bind(db);db.query=(sql,args)=>{const mutation=String(sql).match(/^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_0-9]+)/i);if(mutation)assert.ok(allowed.has(mutation[1].toLowerCase()),'Unexpected mutation');return query(sql,args);};
const readonly={query(sql,args){assert.match(sql,/^SELECT\b/,'Replay must use SELECT only');return db.query(sql,args);}};
async function transaction(fn,{readOnly=false,rollback=false}={}){
 await db.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
 try{await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='30s'");const result=await fn();await db.query(readOnly||rollback?'ROLLBACK':'COMMIT');return result;}
 catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
try{
 await db.connect();let result;
 if(mode==='read'){
  result=await transaction(async()=>({plan:await inspect(db),artifacts:await artifacts(db),priorReceipt:await receipt(db),
   triggers:(await db.query("SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition,pg_get_functiondef(t.tgfoid) AS function FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname IN ('user_messages','user_message_rewards') AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows}),{readOnly:true});
  save('read',result);assert.equal(result.priorReceipt,null,'Already completed; use verify with original plan');for(const n of Object.values(result.artifacts))assert.equal(n,0,'Prior campaign artifacts');
  assert.equal(result.plan.unsafeBalances,0);save('plan',result.plan);fs.writeFileSync(path.join(out,'reviewed-plan.sha256'),hash(result.plan)+'\n',{flag:'wx'});
  console.log(JSON.stringify({mode,recipients:result.plan.recipientCount,totalCoin:result.plan.totalCoin,roles:result.plan.roles,providers:result.plan.providers,statusCounts:result.plan.statusCounts,unsafeBalances:result.plan.unsafeBalances,artifacts:result.artifacts,planHash:hash(result.plan),triggers:result.triggers.map(t=>({table:t.relname,name:t.tgname}))}));
 }else{
  const plan=JSON.parse(fs.readFileSync(path.join(out,'plan.json'),'utf8')),expected=fs.readFileSync(path.join(out,'reviewed-plan.sha256'),'utf8').trim();validatePlan(plan,expected);
  if(mode==='dry-run'){
   result=await transaction(async()=>{
    const before=await artifacts(db);await db.query('SAVEPOINT failure_test');let caught;
    try{await send({query(sql,args){if(sql.startsWith('INSERT INTO app_meta(')&&args[0]===OP)throw Error('INJECTED_RECEIPT_FAILURE');return db.query(sql,args);}},plan,expected);}catch(e){caught=e;}
    assert.match(caught?.message||'',/INJECTED_RECEIPT_FAILURE/);await db.query('ROLLBACK TO SAVEPOINT failure_test');assert.deepEqual(await artifacts(db),before);
    const sent=await send(db,plan,expected),again=await send(readonly,plan,expected);assert.equal(again.replayed,true);assert.deepEqual(again.receipt,sent.receipt);
    return {verification:sent.verification,rollbackVerified:true,injectedFailureRolledBack:true,replayWrites:0};
   },{rollback:true});
   const after=await transaction(()=>artifacts(db),{readOnly:true});for(const n of Object.values(after))assert.equal(n,0);result.artifactsAfterRollback=after;
  }else if(mode==='apply'){
   const dry=JSON.parse(fs.readFileSync(path.join(out,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha256,sourceSha256);assert.equal(dry.planHash,expected);assert.ok(dry.rollbackVerified&&dry.injectedFailureRolledBack);
   result=await transaction(()=>send(db,plan,expected));
  }else if(mode==='verify'){
   result=await transaction(async()=>{const r=await receipt(db);assert.ok(r);return {verification:await verify(readonly,r,plan),artifacts:await artifacts(db),completedAt:r.completedAt,independentReadOnlyConnection:true};},{readOnly:true});
   assert.equal(result.artifacts.messages,plan.recipientCount);assert.equal(result.artifacts.rewards,plan.recipientCount);assert.equal(result.artifacts.audits,1);assert.equal(result.artifacts.receipts,1);assert.equal(result.artifacts.matchingCoinLogs,0);
  }else{
   result=await transaction(async()=>{const before=await artifacts(db),r=await send(readonly,plan,expected);assert.equal(r.replayed,true);assert.deepEqual(await artifacts(db),before);return {verification:r.verification,replayed:true,additionalWrites:0};},{readOnly:true});
  }
  save(mode,{...result,sourceSha256,planHash:expected,checkedAt:new Date().toISOString()});console.log(JSON.stringify({mode,...result.verification,rollbackVerified:result.rollbackVerified,injectedFailureRolledBack:result.injectedFailureRolledBack,additionalWrites:result.additionalWrites,completedAt:result.receipt?.completedAt??result.completedAt}));
 }
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({mode,error:String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'),code:e.code}));process.exitCode=1;}finally{await db.end();}
