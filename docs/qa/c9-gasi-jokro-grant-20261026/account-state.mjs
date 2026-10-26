import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
import {mercenaryAccountState} from '../../../functions/_mercenary_account.js';
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const db=new pg.Client({connectionString:raw.trim().replace(/^['"]|['"]$/g,''),application_name:'c9-gasi-jokro-account-read',connectionTimeoutMillis:15000});
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 const adapter=new __postgresCompatTest.PostgresD1Database({query:input=>{assert.match(input.text,/^\s*(SELECT|WITH)\b/i,'Account check must be read only');return db.query(input);}});
 const state=await mercenaryAccountState({DB:adapter},{id:4866,role:'USER'}),card=state.cards.find(c=>c.code==='V-979');
 assert(card&&card.totalCopies>=1&&card.canDeploy===true);assert.equal(card.excludedFromLimitedCount,true);
 const report={at:new Date().toISOString(),readOnly:true,accountId:4866,nickname:'[C9]가시',card:{code:card.code,name:card.name,totalCopies:card.totalCopies,duplicates:card.duplicates,canDeploy:card.canDeploy,excludedFromLimitedCount:card.excludedFromLimitedCount},loadouts:state.loadouts,accountWrites:0};
 fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));await db.query('ROLLBACK');
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
