import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import pg from 'pg';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {packageNoticeRecipients,sendPackageNotice} from './support-package-notice-core.mjs';
import {PACKAGE_NOTICE_CAMPAIGN,PACKAGE_NOTICE_RECEIPT} from '../../shared/support-package-notice-v1.mjs';
const mode=process.argv[2];if(!['inspect','send','verify'].includes(mode))throw Error('Use inspect, send or verify');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','neondb_owner','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);if(!url.hostname.endsWith('.neon.tech')||url.pathname!=='/cnine')throw Error('Unexpected database destination');
const client=new pg.Client({connectionString,application_name:'support-package-notice-20261020',connectionTimeoutMillis:10000,statement_timeout:20000});
try{
  await client.connect();const DB=new __postgresCompatTest.PostgresD1Database(client);DB.batch=statements=>DB.enqueue(()=>DB.batchSequential(statements,false));const env={DB};
  let delivery=null;if(mode==='send')delivery=await sendPackageNotice(env);
  if(mode!=='send')await client.query('BEGIN READ ONLY');
  const recipients=await packageNoticeRecipients(env),receipt=await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(PACKAGE_NOTICE_RECEIPT).first();
  const messages=await client.query('SELECT COUNT(*) AS remaining,COUNT(*) FILTER(WHERE is_read=0) AS unread FROM user_messages WHERE campaign_key=$1',[PACKAGE_NOTICE_CAMPAIGN]);
  const orders=await client.query("SELECT value FROM app_meta WHERE key LIKE 'support_package_order_v1:%'");
  const grants=await client.query("SELECT COUNT(*) AS count,COALESCE(SUM(change_amount),0) AS coins FROM coin_logs WHERE reason LIKE '시즌패스 패키지 구매 %'");
  const result={mode,checkedAt:new Date().toISOString(),currentPurchasers:recipients.length,delivery:delivery|| (receipt?JSON.parse(receipt.value):null),messages:messages.rows[0],orders:orders.rows.map(r=>{const o=JSON.parse(r.value);return {id:o.id,status:o.status,coins:o.product.coins};}),grants:grants.rows[0]};
  if(mode!=='send')await client.query('COMMIT');
  if(process.env.SUPPORT_PACKAGE_NOTICE_REPORT)await fs.writeFile(process.env.SUPPORT_PACKAGE_NOTICE_REPORT,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result));
}catch(e){console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]'));process.exitCode=1;}finally{await client.end();}
