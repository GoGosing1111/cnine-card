import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import pg from 'pg';
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const db=new pg.Client({connectionString:raw.trim().replace(/^['"]|['"]$/g,''),application_name:'xp-transfer-incident-read',connectionTimeoutMillis:15000});
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(s,v=[])=>(await db.query(s,v)).rows;
 const transfers=await q("SELECT * FROM joint_operations_v1 WHERE kind='MERCENARY_LEVEL_V1' AND plan_json::jsonb->>'action' IN ('EXTRACT','INFUSE') ORDER BY created_at,request_id"),ids=[...new Set(transfers.map(r=>String(r.user_id)))];
 const data={at:new Date().toISOString(),ids,transfers,users:await q('SELECT id::text,nickname,status,role FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]),
  operations:await q("SELECT * FROM joint_operations_v1 WHERE user_id=ANY($1::bigint[]) AND kind='MERCENARY_LEVEL_V1' ORDER BY created_at,request_id",[ids]),
  levels:await q('SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]),
  memory:await q("SELECT key,value,updated_at FROM app_meta WHERE key LIKE 'mercenary_experience_transfer_v1:%' ORDER BY key"),
  item:await q("SELECT * FROM inventory_items WHERE code='MERCENARY_XP_TRANSFER_POTION'"),
  inventory:await q("SELECT * FROM cnine_user_inventory WHERE item_code='MERCENARY_XP_TRANSFER_POTION' ORDER BY user_id"),
  itemLogs:await q("SELECT * FROM inventory_logs WHERE item_code='MERCENARY_XP_TRANSFER_POTION' ORDER BY id")};
 await db.query('ROLLBACK');fs.writeFileSync(path.join(out,'snapshot.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({users:data.users,transferCounts:data.users.map(u=>({id:u.id,actions:transfers.filter(r=>String(r.user_id)===u.id).map(r=>({requestId:r.request_id,status:r.status,action:JSON.parse(r.plan_json).action,code:JSON.parse(r.plan_json).mercenaryCode,at:r.created_at}))})),itemExists:data.item.length>0,itemHolders:data.inventory.length,itemLogs:data.itemLogs.length}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]'));process.exitCode=1;}finally{await db.end();}
