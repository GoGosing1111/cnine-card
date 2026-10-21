// Catalog registration only. No recipient or grant operation is accepted here.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {REVERSECALL_STREAMER_GIFT as gift,ensureReversecallStreamerGiftCatalog} from '../../functions/_reversecall_streamer_gift.js';
const mode=process.argv[2];if(!['inspect','register'].includes(mode))throw Error('Use inspect or register');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','neondb_owner','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);
if(!url.hostname.endsWith('.neon.tech')||url.pathname!='/cnine')throw Error('Unexpected database destination');
const client=new pg.Client({connectionString,application_name:'reversecall-streamer-gift-catalog',connectionTimeoutMillis:10000,statement_timeout:15000});
try{
 await client.connect();
 const read=async()=>({item:(await client.query('SELECT code,name,description,category,rarity,image_url,is_active FROM inventory_items WHERE code=$1',[gift.code])).rows[0]||null,
  holdings:(await client.query('SELECT COUNT(*)::int accounts,COALESCE(SUM(quantity),0)::text quantity FROM cnine_user_inventory WHERE item_code=$1 AND quantity>0',[gift.code])).rows[0]});
 const before=await read();
 if(before.item)for(const [key,value]of Object.entries({name:gift.name,description:gift.description,category:'GIFT_BOX',image_url:gift.image}))assert.equal(before.item[key],value,'Existing gift differs; no overwrite');
 const materials=(await client.query("SELECT code,name,is_active FROM inventory_items WHERE code IN ('SUIT_CORE_6','PINGDU_REPAIR_COUPON') ORDER BY code")).rows;
 assert.equal(materials.length,2);assert.ok(materials.every(item=>Number(item.is_active)===1),'Gift contents must be active');
 if(mode==='register'){const DB=new __postgresCompatTest.PostgresD1Database(client);DB.batch=statements=>DB.enqueue(()=>DB.batchSequential(statements,false));await ensureReversecallStreamerGiftCatalog({DB});}
 const after=await read();if(mode==='register'){assert.equal(after.item?.name,gift.name);assert.equal(Number(after.item?.is_active),1);assert.equal(after.item?.description,gift.description);}
 const report={mode,checkedAt:new Date().toISOString(),before,after,materials,accountGrantsExecuted:0};
 if(process.env.REVERSECALL_CATALOG_REPORT)await fs.writeFile(process.env.REVERSECALL_CATALOG_REPORT,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report,null,2));
}catch(e){console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]'));process.exitCode=1;}finally{await client.end();}

