import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import source from './source.json' with {type:'json'};
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),one=rows=>(assert.equal(rows.length,1),rows[0]),parse=v=>typeof v==='string'?JSON.parse(v):v;
const db=connect();try{
 db.connectionParameters.application_name='cnine-streamer-box-bini-add2-preflight';await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const raw=one(await q('SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.nickname=$1 OR u.id=$2',['비니','4595']));assert.equal(raw.id,'4595');assert.equal(raw.nickname,'비니');assert.equal(raw.status,'ACTIVE');assert(raw.provider&&raw.provider_user_id);
 const {provider,provider_user_id,...u}=raw,identityHash=hash({provider,providerId:provider_user_id});
 const parent=parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[source.parentOperation])).value);assert.equal(parent.status,'COMPLETED');assert.equal(parent.auditId,'54105');assert.equal(parent.totalBoxes,222);const old=one(parent.grants.filter(g=>g.userId==='4595'));assert.equal(old.nickname,'비니');assert.equal(old.amount,5);
 const parentLog=one(await q('SELECT id::text,user_id::text,item_code,change_amount::text,reference_id FROM inventory_logs WHERE id=$1',[old.logId]));assert.equal(parentLog.user_id,'4595');assert.equal(parentLog.item_code,source.itemCode);assert.equal(parentLog.change_amount,'5');assert.equal(parentLog.reference_id,source.parentOperation);
 const item=one(await q('SELECT code,name,description,is_active FROM inventory_items WHERE code=$1',[source.itemCode]));assert.equal(item.name,'씨나인 스트리머 박스');assert.equal(Number(item.is_active),1);
 const inventory=await q('SELECT item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=4595 AND item_code=$1',[source.itemCode]);
 const receipts=await q('SELECT key,value FROM app_meta WHERE key=$1',[source.operationKey]);assert.equal(receipts.length,0,'Already completed; verify only');
 const audits=await q('SELECT id::text FROM admin_logs WHERE target_id=$1',[source.operationKey]);assert.equal(audits.length,0);
 const floors=one(await q('SELECT (SELECT COALESCE(MAX(id),0)::text FROM inventory_logs) inventory,(SELECT COALESCE(MAX(id),0)::text FROM admin_logs) audit'));
 const checkedAt=new Date().toISOString(),plan={operationKey:source.operationKey,dateKst:'2026-11-03',authorization:source.authorization,sourceHash:hash(source),parentOperation:source.parentOperation,parentReceiptHash:hash(parent),priorGranted:5,combinedGranted:7,itemCode:item.code,itemName:item.name,itemDescription:item.description,delivery:'DIRECT_INVENTORY',sendMessages:false,autoOpen:false,recipientCount:1,totalBoxes:2,groupCounts:{'2':1},identityCheckedAt:checkedAt,logFloor:floors,recipients:[{order:1,userId:u.id,nickname:u.nickname,inputNickname:u.nickname,status:u.status,role:u.role,identityHash,amount:2,marker:'ADDITIONAL'}]};
 const report={checkedAt,user:{...u,identityHash},item,inventory,parentReceipt:parent,parentLog,priorReceipts:receipts.length,priorAudits:audits.length,planHash:hash(plan)};
 await fs.writeFile(new URL('./preflight.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await fs.writeFile(new URL('./plan.json',import.meta.url),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});await db.query('ROLLBACK');
 console.log(JSON.stringify({userId:u.id,nickname:u.nickname,priorGranted:5,additionalBoxes:2,currentInventory:inventory,parentAuditId:parent.auditId,parentReceiptPreserved:true,planHash:hash(plan)}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
