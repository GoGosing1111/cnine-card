import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import pg from 'pg';
const mode=process.argv[2]||'preflight';assert(['preflight','postdeploy'].includes(mode));
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);assert(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'city-disguise-read-only-check',connectionTimeoutMillis:15000});
try{await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='10s'");
const row=(await db.query("SELECT value FROM app_meta WHERE key='jokgak_city_settings_v1'")).rows[0];assert(row);
const policy=JSON.parse(row.value),hash=createHash('sha256').update(row.value).digest('hex');
const report={checkedAt:new Date().toISOString(),mode,cityMode:policy.mode,policyRevision:policy.revision,policySha256:hash,readOnly:true,accountWrites:0};
await db.query('ROLLBACK');
if(mode==='postdeploy'){const before=JSON.parse(await readFile(new URL('preflight.json',import.meta.url),'utf8'));assert.equal(hash,before.policySha256,'City policy changed since preflight; review before claiming unchanged');report.policyUnchanged=true;}
await writeFile(new URL(mode+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
