import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import pg from 'pg';
import plan from '../../../scripts/ops/jokro-craft-three-grant-20261027.plan.json' with {type:'json'};
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
import {mercenaryAccountState} from '../../../functions/_mercenary_account.js';
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'jokro-three-account-state-readonly',connectionTimeoutMillis:15000});
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const adapter=new __postgresCompatTest.PostgresD1Database({query:input=>{assert.match(input.text,/^\s*(SELECT|WITH)\b/i,'Account read must not mutate');return db.query(input);}}),accounts=[];
 for(const target of plan.targets){const state=await mercenaryAccountState({DB:adapter},{id:Number(target.id),role:target.role}),card=state.cards.find(c=>c.code===plan.code);assert(card&&card.totalCopies>=1&&card.canDeploy===true);assert.equal(card.excludedFromLimitedCount,false);accounts.push({userId:target.id,nickname:target.nickname,code:card.code,name:card.name,totalCopies:card.totalCopies,duplicates:card.duplicates,level:card.level,canDeploy:card.canDeploy,excludedFromLimitedCount:card.excludedFromLimitedCount});}
 const report={checkedAt:new Date().toISOString(),readOnly:true,accounts,accountWrites:0};await db.query('ROLLBACK');await fs.writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[REDACTED]'));process.exitCode=1;}finally{await db.end();}
