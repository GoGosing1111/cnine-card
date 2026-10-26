import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import pg from 'pg';
const out=path.resolve(process.argv[2]);
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const c=new pg.Client({connectionString,application_name:'tmoney-prime-pig-preflight',connectionTimeoutMillis:15000});
const q=async(sql,args=[])=>{const start=Date.now();try{const rows=(await c.query(sql,args)).rows;console.log(JSON.stringify({query:sql.slice(0,110),elapsedMs:Date.now()-start,rows:rows.length}));return rows;}catch(e){throw Error(sql.slice(0,110)+': '+e.message);}};
try{
 await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='20s'");
 const user=await q("SELECT id::text,nickname,status,role FROM users WHERE id=5147");
 const stock=await q("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-975'");
 const issues=await q("SELECT * FROM mercenary_limited_issues_v1 WHERE code='V-975' ORDER BY serial");
 const item=await q("SELECT code,name,is_active FROM inventory_items WHERE code='MERCENARY_PRIME_DEPLETED_CARD'");
 const inventory=await q("SELECT item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=5147 AND item_code='MERCENARY_PRIME_DEPLETED_CARD'");
 const pig=await q("SELECT user_id::text,balance::text FROM pig_coin_wallets_v1 WHERE user_id=5147");
 const settings=await q("SELECT key,value FROM app_meta WHERE key IN ('mercenary_bloodmoon_ss_pack_v1','mercenary_prime_craft_v1','mercenary_bloodmoon_ss_once_v1:5147','ops:tmoney-prime-pig:20261026:v1') ORDER BY key");
 const pending=await q("SELECT request_id,status,plan_json FROM joint_operations_v1 WHERE user_id=5147 AND kind='MERCENARY_BLOODMOON_OPEN' AND status='PENDING'");
 const schema=await q("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('pig_coin_wallets_v1','pig_coin_ledger_v1','mercenary_limited_stock_v1','mercenary_limited_issues_v1') ORDER BY table_name,ordinal_position");
 const triggers=await q("SELECT c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('pig_coin_wallets_v1','cnine_user_inventory','mercenary_limited_stock_v1') ORDER BY c.relname,t.tgname");
 const floors=(await q("SELECT (SELECT COALESCE(MAX(id),0)::text FROM inventory_logs) AS items,(SELECT COALESCE(MAX(id),0)::text FROM admin_logs) AS audit"))[0];
 const data={checkedAt:new Date().toISOString(),user,stock,issues,item,inventory,pig,settings,pending,schema,triggers,floors};await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'preflight.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({...data,settings:settings.map(r=>{const v=JSON.parse(r.value);return {key:r.key,revision:v.revision,mode:v.settings?.mode,primeLimit:v.settings?.stockLimits?.['V-975'],status:v.status,remaining:v.remaining};}),schema:undefined,pending:pending.map(r=>({request_id:r.request_id,status:r.status})),issues:issues.map(r=>({serial:r.serial,userId:r.user_id}))},null,2));
 await c.query('ROLLBACK');
}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]'));process.exitCode=1;}
finally{await c.end();}
