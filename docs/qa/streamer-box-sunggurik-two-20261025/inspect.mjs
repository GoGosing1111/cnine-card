import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import source from '../../../scripts/ops/streamer-box-sunggurik-two-20261025.source.json' with {type:'json'};
import {REVERSECALL_STREAMER_GIFT as gift} from '../../../shared/reversecall-streamer-gift-v1.mjs';
const [destination]=process.argv.slice(2);assert(destination);
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'streamer-box-extra-two-identity-readonly',connectionTimeoutMillis:15000});
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const users=await q(`SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id,v.provider_name,v.verified_at FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id
 WHERE lower(u.nickname)=ANY($1::text[]) OR lower(v.provider_name)=ANY($1::text[]) OR u.nickname ILIKE ANY($2::text[]) ORDER BY u.id`,[source.inputNicknames.map(n=>n.toLowerCase()),['%숭구릭%','%숭구%']]);
 const candidates=users.map(({provider,provider_user_id,...u})=>({...u,identityHash:provider&&provider_user_id?createHash('sha256').update(JSON.stringify({provider,providerId:provider_user_id})).digest('hex'):null}));
 const matches=source.inputNicknames.map((inputNickname,i)=>({order:i+1,inputNickname,exact:candidates.filter(u=>u.nickname.toLowerCase()===inputNickname.toLowerCase()),verifiedName:candidates.filter(u=>u.provider_name?.toLowerCase()===inputNickname.toLowerCase())}));
 const ids=candidates.map(u=>u.id);
 const inventory=ids.length?await q('SELECT user_id::text,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE item_code=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id',[gift.code,ids]):[];
 const result={checkedAt:new Date().toISOString(),readOnly:true,source,matches,candidates,inventory,item:await q('SELECT code,name,is_active,description FROM inventory_items WHERE code=$1',[gift.code]),prior:await q('SELECT key,value FROM app_meta WHERE key=$1',[source.operationKey])};
 await db.query('ROLLBACK');fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(result));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
