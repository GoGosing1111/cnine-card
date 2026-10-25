import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const root='C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site',require=createRequire(path.join(root,'package.json')),pg=require('pg');
const {giftEligibility}=await import(pathToFileURL(path.join(root,'functions/_new_user_gift.js')));
const out=path.join(root,'docs/qa/kim-pokgun-new-gift-20261025');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);assert(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'kim-pokgun-new-gift-readonly',connectionTimeoutMillis:15000}),hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
try{
 await db.connect();await db.query('BEGIN READ ONLY');const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const users=await q('SELECT id::text,nickname,status,role,created_at,coin::text,card_shards::text,magic_crystals::text FROM users WHERE nickname=$1 OR id=$2 ORDER BY id',['김폭군',4644]);
 assert.equal(users.length,1);const user=users[0];assert.equal(user.id,'4644');assert.equal(user.nickname,'김폭군');
 const verifications=await q('SELECT provider,provider_user_id,provider_name,verified_at FROM user_second_verifications WHERE user_id=$1',[user.id]);assert.equal(verifications.length,1);
 const v=verifications[0],identityHash=hash(v.provider+':'+String(v.provider_user_id).trim());
 const gifts=await q('SELECT * FROM new_user_gift_receipts_v1 WHERE user_id=$1 OR (provider=$2 AND identity_hash=$3) ORDER BY user_id',[user.id,v.provider,identityHash]);
 const inventory=await q('SELECT item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code',[user.id]);
 const logs=await q('SELECT id::text,change_amount::text,balance_after::text,reason,reference_type,reference_id,created_at FROM inventory_logs WHERE user_id=$1 AND item_code=$2 ORDER BY id DESC LIMIT 12',[user.id,'NEW_USER_GIFT_BOX']);
 const item=await q('SELECT code,name,is_active FROM inventory_items WHERE code=$1',['NEW_USER_GIFT_BOX']);
 const current=await q('SELECT CURRENT_TIMESTAMP AS now');
 const existing=await q('SELECT key,value FROM app_meta WHERE key=$1',['ops:kim-pokgun-new-user-gift:20261025:v1']);
 const eligibility=giftEligibility(user,v,current[0].now,gifts.find(g=>String(g.user_id)===user.id));
 const result={checkedAt:new Date().toISOString(),readOnly:true,user,verification:{provider:v.provider,providerName:v.provider_name,verifiedAt:v.verified_at,identityHash},eligibility,gifts,inventory,logs,item,existingOperation:existing};
 await db.query('ROLLBACK');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'read.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({userId:user.id,nickname:user.nickname,createdAt:user.created_at,verification:result.verification,eligibility,gifts:gifts.map(g=>({userId:String(g.user_id),status:g.status,issuedAt:g.issued_at,openedAt:g.opened_at,manifestVersion:JSON.parse(g.manifest_json).version,delivery:JSON.parse(g.manifest_json).delivery,messageId:JSON.parse(g.manifest_json).messageId})),inventory:inventory.filter(r=>r.item_code==='NEW_USER_GIFT_BOX'),logs,item,existingOperation:existing.map(r=>r.key)}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.stack||e).replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]'));process.exitCode=1;}finally{await db.end();}
