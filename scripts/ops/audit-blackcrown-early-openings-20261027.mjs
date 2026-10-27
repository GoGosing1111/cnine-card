import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
const packKey='mercenary_blackcrown_ss_pack_v1',codes=['V-950','V-951','V-952','V-953','V-954','V-955'],removed=['V-978','V-974','V-975','V-973'];
const out='docs/qa/blackcrown-off-ss10-20261027';fs.mkdirSync(out,{recursive:true});
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,'');const uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'blackcrown-early-opening-audit-20261027',connectionTimeoutMillis:15000});

try{
 await db.connect();await db.query("SET statement_timeout='55s'");await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const rows=(await db.query('SELECT request_id,user_id,status,created_at,completed_at,plan_json FROM joint_operations_v1 WHERE kind=$1 ORDER BY created_at',['MERCENARY_BLACKCROWN_OPEN'])).rows;
 const completed=rows.filter(r=>r.status==='COMPLETED'),users=[...new Set(completed.map(r=>String(r.user_id)))],accounts=(await db.query('SELECT id,nickname FROM users WHERE id=ANY($1::bigint[])',[users])).rows,records=[];
 for(const row of completed){const plan=JSON.parse(row.plan_json),ledger=(await db.query('SELECT id,change_amount,balance_after FROM coin_logs WHERE user_id=$1 AND reason=$2',[row.user_id,'블랙크라운팩 '+row.request_id])).rows;assert.equal(ledger.length,1);assert.equal(String(-BigInt(ledger[0].change_amount)),String(plan.coinCost));records.push({requestId:row.request_id,userId:String(row.user_id),createdAt:row.created_at,completedAt:row.completed_at,count:plan.count,coinCost:String(plan.coinCost),coinLogId:String(ledger[0].id),draws:plan.draws,normalDraws:plan.normalDraws||[],missCount:plan.missCount});}
 await db.query('ROLLBACK');const byAccount=accounts.map(a=>{const r=records.filter(r=>r.userId===String(a.id));return {userId:String(a.id),nickname:a.nickname,requests:r.length,drawCount:r.reduce((sum,r)=>sum+r.count,0),coinSpent:r.reduce((sum,r)=>sum+BigInt(r.coinCost),0n).toString()};});
 const result={checkedAt:new Date().toISOString(),readOnly:true,requests:records.length,totalDraws:records.reduce((sum,r)=>sum+r.count,0),totalCoins:records.reduce((sum,r)=>sum+BigInt(r.coinCost),0n).toString(),byAccount,records,refundsExecuted:0};fs.writeFileSync(out+'/early-openings.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,records:undefined}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
