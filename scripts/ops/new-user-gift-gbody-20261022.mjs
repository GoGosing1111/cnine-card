import assert from 'node:assert/strict';
import {NEW_USER_GIFT_CODE,NEW_USER_GIFT_DESCRIPTION,NEW_USER_GIFT_VERSION,upgradeNewUserGiftReceipt} from '../../functions/_new_user_gift.js';
export const OP='ops:new-user-gift-gbody:20261022:v1';
export const AUTHORIZATION='신규 기프트박스에 G슈트 포함시켜 → G바디';
// Only unopened manifests and the item description change. Actual equipment is
// delivered by the existing atomic open transaction when the user opens a box.
export async function refreshGBodyGiftContents(client,{actorId=1,dryRun=true}={}){
 const q=async(text,values=[])=>(await client.query({text,values})).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='30s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OP]);
  if(prior){await q('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  const [actor]=await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE' FOR SHARE",[actorId]);assert(actor);
  const rows=await q("SELECT * FROM new_user_gift_receipts_v1 WHERE status='ISSUED' AND manifest_json::jsonb->>'version' IN ('1','2','3') ORDER BY user_id FOR UPDATE");
  const beforeReceipts=structuredClone(rows);
  const [item]=await q('SELECT description,is_active FROM inventory_items WHERE code=$1 FOR UPDATE',[NEW_USER_GIFT_CODE]);assert(item);
  const changes=[];
  for(const row of rows){
   const previous=JSON.parse(row.manifest_json),beforeHash=row.manifest_hash,rewards=await upgradeNewUserGiftReceipt(q,row);
   assert.equal(rewards.version,NEW_USER_GIFT_VERSION);assert.equal(rewards.version,4);
   const body=rewards.equipment.filter(e=>e.code==='BATTLE_SUIT_03');assert.equal(body.length,1);assert.equal(body[0].name,'G-BODY');
   if(previous.version===3){
    for(const key of ['coin','cardLevels','magicLevel','cards','magic','delivery','messageId','rewardId'])assert.deepEqual(rewards[key],previous[key]);
    assert.deepEqual(rewards.equipment.filter(e=>e.code!=='BATTLE_SUIT_03'),previous.equipment);
   }
   changes.push({userId:Number(row.user_id),fromVersion:previous.version,toVersion:4,beforeHash,afterHash:row.manifest_hash,bodyEquipmentId:body[0].id,bodyCode:body[0].code,bodyQuantity:1});
  }
  const [{remaining}]=await q("SELECT COUNT(*)::int AS remaining FROM new_user_gift_receipts_v1 WHERE status='ISSUED' AND manifest_json::jsonb->>'version' IN ('1','2','3')");assert.equal(remaining,0);
  await q('UPDATE inventory_items SET description=$2 WHERE code=$1',[NEW_USER_GIFT_CODE,NEW_USER_GIFT_DESCRIPTION]);
  const result={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,completedAt:new Date().toISOString(),updated:changes.length,active:Number(item.is_active),descriptionBefore:item.description,descriptionAfter:NEW_USER_GIFT_DESCRIPTION,beforeReceipts,changes,boxesIssued:0,boxesOpened:0,equipmentGranted:0};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'NEW_USER_GIFT_GBODY_UPDATE','INVENTORY_ITEM',$2,$3,$4) RETURNING id",[actorId,NEW_USER_GIFT_CODE,JSON.stringify({description:item.description,updated:changes.length}),JSON.stringify(result)]);
  result.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OP,JSON.stringify(result)]);
  await q(dryRun?'ROLLBACK':'COMMIT');return {...result,dryRun,replayed:false};
 }catch(error){await q('ROLLBACK').catch(()=>{});throw error;}
}
