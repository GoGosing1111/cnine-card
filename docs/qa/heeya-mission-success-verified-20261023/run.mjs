import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect,safeError} from '../jokgeida-halloween-jokro-slot3-20261022/connect.mjs';
import {PLAN,OP,HASH,receipt,artifacts,balances,recipients,send,verify} from './send.mjs';
const out=new URL('./',import.meta.url),save=(name,value)=>fs.writeFileSync(new URL(name+'.json',out),JSON.stringify(value,null,2)+'\n');
const sourceSha256=createHash('sha256').update(fs.readFileSync(new URL('send.mjs',out))).digest('hex');
assert.equal(fs.readFileSync(new URL('reviewed-plan.sha256',out),'utf8').trim(),HASH);
let db,phase='connect';
const read=async fn=>{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{return await fn(db);}finally{await db.query('ROLLBACK');}};
async function transaction(fn,{rollback=false}={}){
 for(let attempt=0;attempt<3;attempt++){
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='25s'");
  try{const r=await fn();await db.query(rollback?'ROLLBACK':'COMMIT');return r;}catch(e){await db.query('ROLLBACK');if(['40001','40P01'].includes(e.code)&&attempt<2)continue;throw e;}
 }
}
try{
 db=await connect();
 const query=db.query.bind(db);db.query=(sql,args)=>{const mutation=String(sql).match(/^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_0-9]+)/i);if(mutation)assert(['user_messages','user_message_rewards','admin_logs','app_meta'].includes(mutation[2].toLowerCase()),'Message campaign attempted to mutate another table');return query(sql,args);};
 const prior=await read(receipt);
 if(prior){const result=await read(c=>verify(c,prior));save('verify',{receipt:prior,verification:result,sourceSha256,independentConnection:true,verifiedAt:new Date().toISOString()});console.log(JSON.stringify({phase:'already-completed',...result}));}
 else{
  const readonly={query(sql,args){assert(!/\b(INSERT|UPDATE|DELETE|BEGIN)\b/i.test(sql),'Replay attempted write');return db.query(sql,args);}};
  phase='rollback-check';
  const dry=await transaction(async()=>{
   const beforeArtifacts=await artifacts(db);await db.query('SAVEPOINT failure_test');
   let caught;try{await send({query(sql,args){if(sql.startsWith('INSERT INTO app_meta(')&&args[0]===OP)throw Error('INJECTED_RECEIPT_FAILURE');return db.query(sql,args);}},HASH);}catch(e){caught=e;}
   if(caught?.code)throw caught;assert.match(caught?.message||'',/INJECTED_RECEIPT_FAILURE/);
   await db.query('ROLLBACK TO SAVEPOINT failure_test');assert.deepEqual(await artifacts(db),beforeArtifacts);
   await db.query('SAVEPOINT dry_test');const r=await send(db,HASH);const replay=await send(readonly,HASH);assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,r.receipt);
   await db.query('ROLLBACK TO SAVEPOINT dry_test');assert.deepEqual(await artifacts(db),beforeArtifacts);return r;
  },{rollback:true});
  save('dry-run',{verification:dry.verification,rollbackVerified:true,injectedFailureRolledBack:true,replayWrites:0,sourceSha256,planHash:HASH});console.log(JSON.stringify({phase:'dry-run',...dry.verification}));
  phase='apply';const applied=await transaction(()=>send(db,HASH));save('apply',{...applied,sourceSha256});console.log(JSON.stringify({phase:'applied',auditId:applied.receipt.auditId,completedAt:applied.receipt.completedAt,...applied.verification}));
  phase='replay';const replay=await read(c=>send(c,HASH));assert.equal(replay.replayed,true);save('replay',{verified:true,operationKey:OP,additionalWrites:0});
  await db.end();db=await connect();const r=await read(receipt),verification=await read(c=>verify(c,r));save('verify',{receipt:r,verification,sourceSha256,independentConnection:true,verifiedAt:new Date().toISOString()});console.log(JSON.stringify({phase:'independent-verification',...verification}));
 }
}catch(e){await db?.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({phase,error:safeError(e),code:e.code,stack:e.stack?.split('\n').slice(0,5)}));process.exitCode=1;}finally{await db?.end();}
