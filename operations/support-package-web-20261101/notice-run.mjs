import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {KEY,PLAN,HASH,IDS,send,verify,receipt} from './notice-send.mjs';
const mode=process.argv[2];assert(['dry-run','apply','verify','replay'].includes(mode));const output=new URL('./notice-'+mode+'.json',import.meta.url);assert(!fs.existsSync(output));
const digest=createHash('sha256');for(const name of ['notice-common.mjs','notice-send.mjs','notice-run.mjs','notice-plan.json'])digest.update(fs.readFileSync(new URL('./'+name,import.meta.url),'utf8').replaceAll('\r\n','\n'));const sourceHash=digest.digest('hex');
const db=connect();let committed=false;
try{
 await db.connect();const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const readonly={query(s,a){assert(/^SELECT\b/.test(s)&&!/FOR UPDATE|FOR SHARE|pg_advisory/.test(s));return db.query(s,a);}};
 const writes=new Set(),checked={query(s,a){const m=s.match(/^(?:INSERT INTO|UPDATE|DELETE FROM) ([a-z_0-9]+)/);if(m){assert(['user_messages','admin_logs','app_meta'].includes(m[1]),m[1]);writes.add(m[1]);}else assert(/^SELECT\b/.test(s));return db.query(s,a);}};
 const empty=async()=>{assert.equal(await receipt(db),null);assert.equal((await q('SELECT id FROM user_messages WHERE campaign_key=$1',[KEY])).length,0);assert.equal((await q('SELECT id FROM admin_logs WHERE target_id=$1',[KEY])).length,0);};
 const sync=async()=>q('SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[IDS]);
 const noOtherWrites=async()=>assert.deepEqual(await q("SELECT relname FROM pg_stat_xact_user_tables WHERE (n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0) AND relname<>ALL($1::text[])",[['user_messages','admin_logs','app_meta','account_sync_versions_v1']]),[]);
 let result,checks,syncChanged=0;
 if(['verify','replay'].includes(mode)){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');result=mode==='replay'?await send(readonly):{receipt:await receipt(readonly)};result.verification??=await verify(readonly,result.receipt);await noOtherWrites();await db.query('ROLLBACK');checks={readOnly:true,selectOnly:true,additionalWrites:0};
 }else{
  if(mode==='apply'){const dry=JSON.parse(fs.readFileSync(new URL('./notice-dry-run.json',import.meta.url)));assert.equal(dry.planHash,HASH);assert.equal(dry.sourceHash,sourceHash);assert(Object.values(dry.checks).every(v=>v===true));}
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='30s'");await empty();
  await q('SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id::text FOR UPDATE',[IDS]);const before=await sync();
  if(mode==='dry-run'){
   await assert.rejects(send(checked,'wrong'),/Reviewed plan required/);await db.query('SAVEPOINT failure');
   await assert.rejects(send({query(s,a){return s.startsWith('INSERT INTO app_meta')?checked.query('SELECT 1/0'):checked.query(s,a);}},HASH),/division by zero/);
   await db.query('ROLLBACK TO SAVEPOINT failure');await empty();assert.deepEqual(await sync(),before);
  }
  result=await send(checked,HASH);assert.equal(result.replayed,false);const after=await sync();
  syncChanged=before.filter((r,i)=>BigInt(after[i].domains.messages||0)>BigInt(r.domains.messages||0)).length;assert.equal(syncChanged,IDS.length);
  assert.equal((await send(readonly)).replayed,true);await noOtherWrites();assert.deepEqual([...writes].sort(),['admin_logs','app_meta','user_messages']);
  checks={wrongPlanRejected:true,sqlFailureRolledBack:true,successRolledBack:true,syncRolledBack:true,selectOnlyReplay:true,noWalletInventoryWrites:true};
  if(mode==='dry-run'){await db.query('ROLLBACK TO SAVEPOINT failure');await empty();assert.deepEqual(await sync(),before);await db.query('ROLLBACK');}
  else{await db.query('COMMIT');committed=true;fs.writeFileSync(new URL('./notice-receipt.json',import.meta.url),JSON.stringify(result.receipt,null,2)+'\n',{flag:'wx'});}
 }
 const report={mode,status:mode==='dry-run'?'ROLLED_BACK':'VERIFIED',operationKey:KEY,planHash:HASH,sourceHash,verification:result.verification,auditId:mode==='dry-run'?null:result.receipt.auditId,completedAt:mode==='dry-run'?null:result.receipt.completedAt,syncChanged,checks,checkedAt:new Date().toISOString()};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({error:safe(e),committed}));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,4).join('\n'));process.exitCode=1;}finally{await db.end();}
