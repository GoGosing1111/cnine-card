// User requested a new MATERIAL registration. This operator command never grants balances.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import pg from 'pg';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {ensureLimitedShardCatalog} from '../../functions/_support_package.js';
import {LIMITED_SHARD} from '../../shared/support-package-v1.mjs';
const mode=process.argv[2];if(!['inspect','register'].includes(mode))throw Error('Use inspect or register');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','neondb_owner','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);if(!url.hostname.endsWith('.neon.tech')||url.pathname!=='/cnine')throw Error('Unexpected database destination');
const client=new pg.Client({connectionString,application_name:'support-package-material-registration',connectionTimeoutMillis:10000,statement_timeout:15000});
try{
 await client.connect();
 const read=async()=>{const r=await client.query('SELECT code,name,category,rarity,image_url,is_active FROM inventory_items WHERE code=$1',[LIMITED_SHARD.code]);return r.rows[0]||null;};
 const before=await read();if(before&&(before.name!==LIMITED_SHARD.name||before.category!=='MATERIAL'||before.image_url!==LIMITED_SHARD.image))throw Error('Existing catalog entry differs; stop without overwriting');
 if(mode==='register'){const DB=new __postgresCompatTest.PostgresD1Database(client);DB.batch=statements=>DB.enqueue(()=>DB.batchSequential(statements,false));await ensureLimitedShardCatalog({DB});}
 const after=await read();if(mode==='register'&&(!after||Number(after.is_active)!==1))throw Error('Catalog verification failed');
 const result={mode,checkedAt:new Date().toISOString(),before,after,balanceGrants:0};
 if(process.env.SUPPORT_PACKAGE_CATALOG_REPORT)await fs.writeFile(process.env.SUPPORT_PACKAGE_CATALOG_REPORT,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(result));
}catch(e){console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]'));process.exitCode=1;}finally{await client.end();}
