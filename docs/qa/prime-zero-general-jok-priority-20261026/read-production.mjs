import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const root=process.cwd(),require=createRequire(path.join(root,'package.json')),pg=require('pg'),imp=f=>import(pathToFileURL(path.join(root,f)));
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);assert(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'prime-zero-priority-readonly',connectionTimeoutMillis:15000}),hash=b=>createHash('sha256').update(b).digest('hex');
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 const {__postgresCompatTest}=await imp('functions/_postgres_d1_compat.js'),env={DB:new __postgresCompatTest.PostgresD1Database({query:arg=>db.query(arg)})};
 const {readMercenaryDocument}=await imp('functions/_mercenary_account.js');const cms=await readMercenaryDocument(env);
 const settings=(await db.query("SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key",[['mercenary_level_policy_v1','mercenary_bloodmoon_ss_pack_v1','mercenary_runtime_policy_v1','mercenary_prime_craft_v1']])).rows;
 await db.query('ROLLBACK');const prime=JSON.parse(settings.find(r=>r.key==='mercenary_prime_craft_v1').value);assert(prime.isActive);
 const report={at:new Date().toISOString(),readOnly:true,cmsRevision:cms.revision,cmsHash:hash(JSON.stringify(cms.document)),settingsHash:hash(JSON.stringify(settings)),primeCraftActive:prime.isActive,primeCraftRevision:prime.revision,operationalWrites:0};
 fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.stack||e).replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]'));process.exitCode=1;}finally{await db.end();}
