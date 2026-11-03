import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {OP,artifacts} from './grant.mjs';
const db=connect();try{
 await db.connect();await db.query('BEGIN READ ONLY');const a=await artifacts(db);assert.deepEqual(a,{receipt:null,logs:[],audits:[]});
 const locks=(await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE action_path=$1',[OP])).rows;assert.equal(locks.length,0);
 const report={checkedAt:new Date().toISOString(),confirmedWrites:0,receiptPresent:false,inventoryLogs:0,audits:0,operationLocksRemaining:0,reason:'Dry-run write-scope gate counted 37 acquisition lease inserts; grant rolled back, lease records released.'};
 await db.query('ROLLBACK');await fs.writeFile(new URL('./evidence/aborted-dry-run-readonly.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
