import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {KEY,TITLE,BODY} from './notice-common.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./before.json',import.meta.url))),receipt=JSON.parse(fs.readFileSync(new URL('./notice-receipt.json',import.meta.url))),db=connect();
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const orders=await q("SELECT key,value FROM app_meta WHERE key LIKE 'support_package_order_v1:%' ORDER BY key"),old=orders.filter(r=>JSON.parse(r.value).createdAt<=Date.parse(before.checkedAt));
 assert.equal(old.length,before.orderCount);const hash=createHash('sha256').update(JSON.stringify(old)).digest('hex');assert.equal(hash,before.ordersHash);
 const messages=await q('SELECT m.user_id::text,m.title,m.body,u.status,v.user_id::text verified,m.created_at::text,s.value FROM user_messages m JOIN users u ON u.id=m.user_id LEFT JOIN user_second_verifications v ON v.user_id=u.id LEFT JOIN app_meta s ON s.key=\'server_support_v1:\'||u.id WHERE m.campaign_key=$1 ORDER BY m.user_id',[KEY]);
 assert.deepEqual(messages.map(m=>m.user_id),receipt.recipientIds);assert.equal(new Set(messages.map(m=>m.user_id)).size,messages.length);
 for(const m of messages){assert.equal(m.title,TITLE);assert.equal(m.body,BODY);assert.equal(m.status,'ACTIVE');assert.equal(m.verified,m.user_id);const pass=JSON.parse(m.value),at=Date.parse(m.created_at);assert(!pass.revokedAt&&pass.startsAt<=at&&pass.endsAt>at);}
 const other=await q('SELECT id FROM user_messages WHERE (title=$1 OR body=$2) AND campaign_key IS DISTINCT FROM $3',[TITLE,BODY,KEY]);assert.equal(other.length,0);
 assert.equal((await q("SELECT key FROM app_meta WHERE key='ops:support-package-web-notice:20261101:v1'")).length,0);
 assert.deepEqual(await q('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0'),[]);
 await db.query('ROLLBACK');const report={checkedAt:new Date().toISOString(),readOnly:true,productionWrites:0,historicalOrders:old.length,historicalOrderHash:hash,historicalOrdersUnchanged:true,newOrders:orders.length-old.length,onlyActiveSeasonPassPurchasers:true,messages:messages.length,missing:0,duplicates:0,otherCampaignMessages:0,allVerifiedBroadcastSent:false};
 fs.writeFileSync(new URL('./after.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end();}
