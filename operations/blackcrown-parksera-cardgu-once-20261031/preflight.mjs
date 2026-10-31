import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';

export const OP='ops:blackcrown-parksera-cardgu-once:20261031:v1';
export const USER_ID=45, NICKNAME='박세라-ㅂ-', CODE='V-970';
export const KEY='mercenary_blackcrown_card_once_v1:'+USER_ID;
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
let db;
try {
 db=connect();await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 const rows=(await db.query('SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=$1 OR u.nickname=$2 ORDER BY u.id',[USER_ID,NICKNAME])).rows;
 assert.equal(rows.length,1,'Ambiguous account');const user=rows[0];assert.equal(user.id,String(USER_ID));assert.equal(user.nickname,NICKNAME);assert.equal(user.status,'ACTIVE');assert(user.provider&&user.provider_user_id);
 const target={userId:USER_ID,nickname:NICKNAME,status:user.status,role:user.role,provider:user.provider,identityHash:hash({provider:user.provider,providerId:user.provider_user_id})};
 const owner=(await db.query('SELECT id::text,nickname,role,status FROM users WHERE id=1')).rows[0];assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
 const keys=[OP,KEY,'mercenary_blackcrown_ss_pack_v1','mercenary_blackcrown_stock_schedule_v1'];
 const meta=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[keys])).rows.map(r=>({key:r.key,document:JSON.parse(r.value)}));
 const stock=(await db.query('SELECT code,stock_limit::int,issued::int,revision FROM mercenary_limited_stock_v1 WHERE code=$1',[CODE])).rows;
 const owned=(await db.query('SELECT user_id::text,mercenary_code,total_copies FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[USER_ID,CODE])).rows;
 const pending=(await db.query("SELECT request_id,status,created_at FROM joint_operations_v1 WHERE user_id=$1 AND kind='MERCENARY_BLACKCROWN_OPEN' AND status='PENDING'",[USER_ID])).rows;
 const audits=(await db.query("SELECT id::text,action_type,target_id,created_at,after_data FROM admin_logs WHERE target_id=$1 AND action_type IN ('MERCENARY_BLACKCROWN_CARD_ONCE_ARMED','MERCENARY_BLACKCROWN_CARD_ONCE_CONSUMED') ORDER BY id",[String(USER_ID)])).rows;
 const serverNow=(await db.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now;
 const report={checkedAt:new Date().toISOString(),serverNow,authorization:'박세라-ㅂ- 블랙크라운팩 개봉할때 카드구 한번 나오게 처리해',operationKey:OP,target,owner,meta,stock,owned,pending,audits,readOnly:true};
 await db.query('ROLLBACK');fs.writeFileSync(new URL('./preflight.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({target,stock,owned,pending,priorEntitlement:meta.find(r=>r.key===KEY)?.document??null,priorReceipt:meta.some(r=>r.key===OP),priorAudits:audits.length,serverNow}));
}catch(e){await db?.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db?.end();}
