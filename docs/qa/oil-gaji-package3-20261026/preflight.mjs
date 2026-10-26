import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import pg from 'pg';
const out=path.resolve(process.argv[2]);
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const c=new pg.Client({connectionString,application_name:'oil-gaji-package3-preflight',connectionTimeoutMillis:15000});
const q=async(sql,args=[])=>{const start=Date.now();try{const rows=(await c.query(sql,args)).rows;console.log(JSON.stringify({query:sql.slice(0,110),elapsedMs:Date.now()-start,rows:rows.length}));return rows;}catch(e){throw Error(sql.slice(0,110)+': '+e.message);}};
try{
 await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='20s'");
 const users=await q('SELECT id::text,nickname,status,role,coin::text FROM users WHERE nickname=$1 OR id=3011 ORDER BY id',['오일바른가지']);
 assert.equal(users.length,1);assert.equal(users[0].id,'3011');assert.equal(users[0].nickname,'오일바른가지');assert.equal(users[0].status,'ACTIVE');assert.equal(users[0].role,'USER');
 const identity=(await q('SELECT provider,provider_user_id FROM user_second_verifications WHERE user_id=3011')).map(r=>({provider:r.provider,identityHash:createHash('sha256').update(JSON.stringify({provider:r.provider,providerId:r.provider_user_id})).digest('hex')}));
 assert.equal(identity.length,1);assert.equal(identity[0].identityHash,'aa721411230ad727d6a73f772fb71364af222351e684218b202c127c0916d0cd');
 const support=await q("SELECT key,value FROM app_meta WHERE key IN ('server_support_v1:3011','support_package_pending_v1:3011','support_package_coin_v1:3011') OR key LIKE 'support_package_order_v1:3011!_%' ESCAPE '!' OR key LIKE 'ops:oil-gaji%' ORDER BY key");
 const items=await q("SELECT item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=3011 AND item_code IN ('EMPEROR_ENERGY','MERCENARY_SSS_LIMITED_SHARD') ORDER BY item_code");
 const floors=(await q('SELECT (SELECT COALESCE(MAX(id),0)::text FROM coin_logs) AS coins,(SELECT COALESCE(MAX(id),0)::text FROM inventory_logs) AS items,(SELECT COALESCE(MAX(id),0)::text FROM admin_logs) AS audit'))[0];
 const packageLogs=await q("SELECT id::text,change_amount::text,balance_after::text,reason FROM coin_logs WHERE user_id=3011 AND id>$1::bigint AND reason LIKE '시즌패스 패키지 구매 %' ORDER BY id LIMIT 100",[String(BigInt(floors.coins)-100000n)]);
 const data={checkedAt:new Date().toISOString(),users,identity,items,support,floors,packageLogs};
 await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'preflight.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({...data,support:support.map(r=>{let v;try{v=JSON.parse(r.value);}catch{v=r.value;}return {key:r.key,status:v.status,revision:v.revision,orderId:v.id,createdAt:v.createdAt,processedAt:v.processedAt,packageQuantity:v.product?.packageQuantity,quantity:v.fulfillment?.packageQuantity,value:typeof v==='string'?v:undefined};})},null,2));
 await c.query('ROLLBACK');
}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error(String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]'));process.exitCode=1;}
finally{await c.end();}
