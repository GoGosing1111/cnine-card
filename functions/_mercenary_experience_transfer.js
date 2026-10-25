import {decodeTransferState,TRANSFER_ITEM,transferGroup,mercenaryTransferState} from '../shared/mercenary-experience-transfer-v1.mjs';
export const experienceTransferKey=userId=>'mercenary_experience_transfer_v1:'+userId;
export async function readExperienceTransfer(env,userId){
 const key=experienceTransferKey(userId),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first(),raw=row?.value??null;
 return {key,raw,state:decodeTransferState(raw)};
}
export async function readMercenaryGrowthHistory(env,userId){
 const rows=(await env.DB.prepare("SELECT request_id,plan_json FROM joint_operations_v1 WHERE user_id=? AND kind='MERCENARY_LEVEL_V1' AND status='COMPLETED'").bind(userId).all()).results;
 return rows.map(r=>({requestId:r.request_id,plan:JSON.parse(r.plan_json)}));
}
export function transferCardView(record,card){return {...mercenaryTransferState(record.state,card.code),group:card.rank?transferGroup(card):null};}
export async function readTransferItemQuantity(env,userId){
 const row=await env.DB.prepare('SELECT i.quantity FROM cnine_user_inventory i JOIN inventory_items c ON c.code=i.item_code AND c.is_active=1 WHERE i.user_id=? AND i.item_code=?').bind(userId,TRANSFER_ITEM.code).first();
 const n=Number(row?.quantity||0);return Number.isSafeInteger(n)&&n>0?n:0;
}
export async function experienceTransferInventory(env,userId){
 // Compatibility only: inventory is now supplied by cnine_user_inventory.
 return [];
}
export function transferRecordGuard(record){return {sql:record.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',values:record.raw===null?[record.key]:[record.key,record.raw]};}
