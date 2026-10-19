import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import pg from 'pg';import {createHash} from 'node:crypto';
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','neondb_owner','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);if(!url.hostname.endsWith('.neon.tech')||url.pathname!='/cnine')throw Error('Wrong destination');
const db=new pg.Client({connectionString,application_name:'bathory-readonly-release-preparation',connectionTimeoutMillis:10000});
try{await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const code='V-977';
const stock=(await db.query('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code=$1',[code])).rows;
const owned=(await db.query('SELECT count(*)::int AS count FROM user_mercenary_cards_v1 WHERE mercenary_code=$1',[code])).rows[0].count;
const issued=(await db.query('SELECT count(*)::int AS count FROM mercenary_limited_issues_v1 WHERE code=$1',[code])).rows[0].count;
const cms=(await db.query('SELECT doc_key FROM mercenary_cms_documents_v1 WHERE payload_json LIKE $1',['%'+code+'%'])).rows;
const value=(await db.query('SELECT value FROM app_meta WHERE key=$1',['mercenary_halloween_ss_pack_v1'])).rows[0].value;
const doc=JSON.parse(value);const report={checkedAt:new Date().toISOString(),transaction:'READ ONLY',code,stock,owned,issued,cms,codeAvailable:!stock.length&&!owned&&!issued&&!cms.length,pack:{revision:doc.revision,mode:doc.settings.mode,documentHash:createHash('sha256').update(value).digest('hex'),existingCodes:Object.keys(doc.settings.cardRatesPpm),bathoryRate:doc.settings.cardRatesPpm[code]??null}};
await db.query('ROLLBACK');await fs.writeFile(new URL('qa/live-readonly-preflight.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]'));process.exitCode=1;}finally{await db.end();}
