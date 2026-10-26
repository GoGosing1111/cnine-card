import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {canIssueMiracleCubeCoupon} from '../../../functions/_miracle_cube_coupon.js';
const target=path.resolve(process.argv[2]),{Client}=createRequire(import.meta.url)('pg'),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');assert(!fs.existsSync(target));
const connectionString=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',windowsHide:true,timeout:30000,stdio:['ignore','pipe','pipe']}).trim().replace(/^['"]|['"]$/g,'');
const url=new URL(connectionString);assert(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine');const db=new Client({connectionString,application_name:'miracle-coupon-owner-readonly',connectionTimeoutMillis:15000});
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 const owners=(await db.query("SELECT id,nickname,role,status FROM users WHERE role='OWNER' ORDER BY id")).rows;assert(owners.length>0&&owners.every(canIssueMiracleCubeCoupon));
 const coupons=(await db.query("SELECT id,code,reward_type,reward_amount,reward_coin,max_uses,starts_at,ends_at,is_active,created_by,deleted_at FROM coupons WHERE reward_type='MIRACLE_CUBE' ORDER BY id")).rows;
 const policies=(await db.query("SELECT key,value FROM app_meta WHERE key IN ('miracle_cube_policy_20261003_v1','sss_miracle_cube_policy_20261021_v1') ORDER BY key")).rows;
 await db.query('ROLLBACK');const report={at:new Date().toISOString(),readOnly:true,ownerCount:owners.length,activeOwnerCount:owners.filter(u=>u.status==='ACTIVE').length,allOwnerRolesAllowed:owners.every(canIssueMiracleCubeCoupon),ownerHash:hash(owners),couponCount:coupons.length,couponDefinitionHash:hash(coupons),policyHash:hash(policies),operationalWrites:0};
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.stack||e).replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]'));process.exitCode=1;}finally{await db.end();}
