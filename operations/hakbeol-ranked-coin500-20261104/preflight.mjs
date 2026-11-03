import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import source from './source.json' with {type:'json'};
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),one=rows=>(assert.equal(rows.length,1),rows[0]);
const db=connect();try{
 db.connectionParameters.application_name='hakbeol-ranked-coin500-preflight';await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const raw=one(await q('SELECT u.id::text,u.nickname,u.status,u.role,u.coin::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=$1 OR u.nickname=$2',[source.userId,source.nickname]));assert.equal(raw.id,'4627');assert.equal(raw.nickname,'학벌');assert.equal(raw.status,'ACTIVE');assert(raw.provider&&raw.provider_user_id);
 const {provider,provider_user_id,coin,...user}=raw,identityHash=hash({provider,providerId:provider_user_id});
 const item=one(await q('SELECT code,name,description,is_active FROM inventory_items WHERE code=$1',[source.itemCode]));assert.equal(item.name,'랭크전 코인');assert.equal(Number(item.is_active),1);
 const inventory=await q('SELECT item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[source.userId,source.itemCode]);
 const receipts=await q("SELECT key,value FROM app_meta WHERE key=$1 OR key LIKE 'ops:%hakbeol%rank%20261104%' ORDER BY key",[source.operationKey]);assert.equal(receipts.length,0,'Matching grant receipt exists; verify before any new operation');
 const audits=await q('SELECT id::text FROM admin_logs WHERE target_id=$1',[source.operationKey]);assert.equal(audits.length,0);
 const floors=one(await q('SELECT (SELECT COALESCE(MAX(id),0)::text FROM inventory_logs) inventory,(SELECT COALESCE(MAX(id),0)::text FROM admin_logs) audit'));
 const checkedAt=new Date().toISOString(),plan={operationKey:source.operationKey,dateKst:'2026-11-04',authorization:source.authorization,sourceHash:hash(source),itemCode:item.code,itemName:item.name,itemDescription:item.description,delivery:'DIRECT_INVENTORY',sendMessages:false,changeRankingOrSeason:false,recipientCount:1,totalAmount:500,identityCheckedAt:checkedAt,logFloor:floors,recipients:[{order:1,userId:user.id,nickname:user.nickname,inputNickname:user.nickname,status:user.status,role:user.role,identityHash,amount:500}]};
 const report={checkedAt,user:{...user,identityHash},ordinaryCoin:coin,item,inventory,priorReceipts:0,priorAudits:0,planHash:hash(plan)};
 await fs.writeFile(new URL('./preflight.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await fs.writeFile(new URL('./plan.json',import.meta.url),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});await db.query('ROLLBACK');console.log(JSON.stringify({userId:user.id,nickname:user.nickname,itemCode:item.code,itemName:item.name,amount:500,currentInventory:inventory,priorReceipts:0,planHash:hash(plan)}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
