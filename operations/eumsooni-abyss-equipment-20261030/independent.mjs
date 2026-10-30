import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {OP,PLAN,receipt,verify,grant} from './grant.mjs';
import {mercenaryEquipmentState} from '../../output/revan-live-20261027/release-checkout/functions/_mercenary_equipment.js';
const db=connect();db.connectionParameters.application_name='eumsooni-abyss-equipment-independent';
const read={query(sql,args=[]){assert.match(sql,/^\s*(SELECT|WITH)\b/i);assert(!/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(sql));return db.query(sql,args);}};
const env={DB:{prepare(sql){const build=args=>{let n=0;const text=sql.replace(/\?/g,()=>'$'+(++n));return {bind:(...values)=>build(values),first:async()=>(await read.query(text,args)).rows[0]||null,all:async()=>({results:(await read.query(text,args)).rows})};};return build([]);}}};
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const result=await verify(read),saved=await receipt(read);const account=await mercenaryEquipmentState(env,{id:65,role:'USER'});
 const items=PLAN.grants.map(g=>{const r=saved.grants.find(r=>r.code===g.code),item=account.items.find(x=>x.instanceId===r.instanceId);assert(item,`Actual inventory omitted ${g.code}`);assert.equal(item.code,g.code);assert.equal(item.name,g.name);assert.equal(item.slot,g.slot);assert.equal(item.level,0);assert.equal(account.catalog.find(x=>x.code===g.code)?.available,true);return {code:item.code,name:item.name,slot:item.slot,instanceId:item.instanceId,level:item.level};});
 const replay=await grant(read);assert(replay.replayed);assert.equal((await read.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE action_path=$1',[OP])).rowCount,0);
 const report={status:'VERIFIED',checkedAt:new Date().toISOString(),readOnly:(await read.query("SELECT current_setting('transaction_read_only') AS value")).rows[0].value,...result,items,selectOnlyReplayVerified:true,operationLocksRemaining:0,productionWrites:0};
 await db.query('ROLLBACK');await fs.writeFile(new URL('./independent.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,3).join('\n'));process.exitCode=1;}finally{await db.end().catch(()=>{});}
