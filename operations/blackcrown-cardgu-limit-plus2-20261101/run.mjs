import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect,safe,inspect,OP} from './preflight.mjs';
import {increase,verify} from './increase.mjs';
const mode=process.argv[2];assert(['rehearse','apply','verify','replay'].includes(mode));
const before=JSON.parse(fs.readFileSync(new URL('./before.json',import.meta.url),'utf8'));
let db;
try{
 db=connect();await db.connect();const identity=(await db.query('SELECT current_database() AS name,current_user AS actor,pg_is_in_recovery() AS replica')).rows[0];
 assert.equal(identity.name,'cnine');assert.equal(identity.actor,'cnine_migrator');assert.equal(identity.replica,false);
 let result;
 if(mode==='rehearse'){
  const original=await inspect(db);assert.equal(original.receipt,null);
  await assert.rejects(()=>increase(db,{expectedDocumentHash:before.documentHash,injectFailure:true}),/INJECTED_AFTER_STOCK_UPDATE/);
  let restored=await inspect(db);assert.equal(restored.raw,original.raw);assert.deepEqual(restored.stock,original.stock);assert.equal(restored.receipt,null);
  result=await increase(db,{expectedDocumentHash:before.documentHash,dryRun:true});
  restored=await inspect(db);assert.equal(restored.raw,original.raw);assert.deepEqual(restored.stock,original.stock);assert.equal(restored.receipt,null);
  assert.equal((await db.query('SELECT id FROM admin_logs WHERE target_id=$1',[OP])).rows.length,0);
  result={...result,injectedFailureRollback:true,normalRollback:true};
 }else if(mode==='apply'){
  const rehearsal=JSON.parse(fs.readFileSync(new URL('./rehearse.json',import.meta.url),'utf8'));assert(rehearsal.injectedFailureRollback&&rehearsal.normalRollback);
  result=await increase(db,{expectedDocumentHash:before.documentHash,dryRun:false});
 }else{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const readOnly={query(sql,args){assert(/^SELECT\b/.test(sql),'Replay must remain SELECT-only');return db.query(sql,args)}};
  result=mode==='verify'?await verify(readOnly):await increase(readOnly,{expectedDocumentHash:before.documentHash,dryRun:false});
  if(mode==='replay')assert(result.replayed);await db.query('ROLLBACK');result={...result,independentReadOnly:true,writeStatements:0};
 }
 fs.writeFileSync(new URL('./'+mode+'.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({mode,operationKey:OP,limit:result.limit,issued:result.issued,remaining:result.remaining,auditId:result.receipt.auditId,revision:result.currentRevision,replayed:result.replayed,dryRun:result.dryRun,rollback:result.normalRollback,readOnly:result.independentReadOnly,writeStatements:result.writeStatements}));
}catch(e){await db?.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1}finally{await db?.end()}
