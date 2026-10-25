import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
const connection=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim().replace(/^['"]|['"]$/g,'');
const url=new URL(connection);assert(url.hostname.endsWith('.neon.tech'));assert.equal(url.pathname,'/cnine');
const db=new pg.Client({connectionString:connection,connectionTimeoutMillis:15000});await db.connect();
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 const readOnly=(await db.query("SELECT current_setting('transaction_read_only') AS value")).rows[0].value;assert.equal(readOnly,'on');
 const holders=(await db.query("SELECT u.id,u.nickname,c.total_copies FROM users u JOIN user_mercenary_cards_v1 c ON c.user_id=u.id AND c.mercenary_code='V-973' WHERE u.id IN (1195,22,45,4391) ORDER BY u.id")).rows;
 assert.equal(holders.length,4);assert(holders.every(r=>Number(r.total_copies)>=1));
 const settings=(await db.query("SELECT value FROM app_meta WHERE key='mercenary_bloodmoon_ss_pack_v1'")).rows[0];assert(settings);
 const config=JSON.parse(settings.value),settingsSha256=createHash('sha256').update(settings.value).digest('hex');
 const stock=(await db.query("SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code IN ('V-960','V-961','V-962','V-963','V-964','V-965','V-974','V-975','V-978') ORDER BY code")).rows;
 const report={at:new Date().toISOString(),readOnly,accountWrites:0,holders,settingsSha256,packRevision:config.revision,packMode:config.settings?.mode,stock};
 const output=process.argv[2];assert(output&&/\.json$/.test(output));fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await db.query('ROLLBACK').catch(()=>{});await db.end();}
