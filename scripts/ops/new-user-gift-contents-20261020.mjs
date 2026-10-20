import {NEW_USER_GIFT_CODE,NEW_USER_GIFT_DESCRIPTION,NEW_USER_GIFT_VERSION,upgradeNewUserGiftReceipt} from '../../functions/_new_user_gift.js';

export const NEW_USER_GIFT_UPDATE_KEY='ops:new-user-gift-contents:20261020:v1';
// One transaction changes only the unopened manifests, description and audit.
// It never issues/opens a box or credits any user's inventory, cards or money.
export async function refreshNewUserGiftContents(client,{actorId=1,dryRun=true}={}){
 const q=async(text,values=[])=>(await client.query({text,values})).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='30s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[NEW_USER_GIFT_UPDATE_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[NEW_USER_GIFT_UPDATE_KEY]);
  if(prior){await q('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  const [actor]=await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE' FOR SHARE",[actorId]);
  if(!actor)throw Error('Active OWNER required');
  const rows=await q("SELECT * FROM new_user_gift_receipts_v1 WHERE status='ISSUED' AND manifest_json::jsonb->>'version' IN ('1','2') ORDER BY user_id FOR UPDATE");
  // Opening also locks receipt before item; retain that order during conversion.
  const [item]=await q('SELECT description,is_active FROM inventory_items WHERE code=$1 FOR UPDATE',[NEW_USER_GIFT_CODE]);
  if(!item)throw Error('Gift catalog is missing');
  const changes=[];
  for(const row of rows){
   const beforeHash=row.manifest_hash,version=JSON.parse(row.manifest_json).version,rewards=await upgradeNewUserGiftReceipt(q,row);
   if(rewards.version!==NEW_USER_GIFT_VERSION)throw Error('Unexpected gift contents');
   changes.push({userId:Number(row.user_id),fromVersion:version,toVersion:rewards.version,beforeHash,afterHash:row.manifest_hash,coin:rewards.coin,cards:rewards.cards.length,fur15:rewards.cards.filter(c=>c.grade==='FUR'&&c.level===15).map(c=>c.id),magicLevel:rewards.magicLevel});
  }
  await q('UPDATE inventory_items SET description=$2 WHERE code=$1',[NEW_USER_GIFT_CODE,NEW_USER_GIFT_DESCRIPTION]);
  const result={key:NEW_USER_GIFT_UPDATE_KEY,appliedAt:new Date().toISOString(),updated:changes.length,active:Number(item.is_active),changes};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'NEW_USER_GIFT_CONTENTS_UPDATE','INVENTORY_ITEM',$2,$3,$4) RETURNING id",[actorId,NEW_USER_GIFT_CODE,JSON.stringify({description:item.description}),JSON.stringify(result)]);
  result.auditId=Number(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[NEW_USER_GIFT_UPDATE_KEY,JSON.stringify(result)]);
  await q(dryRun?'ROLLBACK':'COMMIT');
  return {...result,dryRun,replayed:false};
 }catch(error){await q('ROLLBACK').catch(()=>{});throw error;}
}
