import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const PARENT_OP='ops:streamer-box-starball:20261031:v1';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export async function readParent(db){
 const q=async(s,a)=>(await db.query(s,a)).rows;
 const rows=await q('SELECT value FROM app_meta WHERE key=$1',[PARENT_OP]);assert.equal(rows.length,1,'Original completed receipt required');
 const receipt=parse(rows[0].value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,PARENT_OP);assert.equal(receipt.auditId,'53377');
 assert.equal(receipt.planHash,'c4e1b02a4326fed970550a4d966875a1677ae6a26499bdac9933ce78c6a11550');assert.equal(receipt.totalBoxes,390);assert.equal(receipt.recipientCount,42);
 const logs=await q('SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id,admin_id::text FROM inventory_logs WHERE item_code=$1 AND reference_id=$2 ORDER BY inventory_logs.user_id,inventory_logs.id',['REVERSECALL_STREAMER_GIFT_BOX',PARENT_OP]);
 const audits=(await q('SELECT id::text,admin_id::text,action_type,target_id,after_data FROM admin_logs WHERE target_id=$1 ORDER BY id',[PARENT_OP])).map(a=>({...a,after_data:parse(a.after_data)}));
 assert.equal(logs.length,42,'Original grant ledger incomplete');assert.equal(audits.length,1,'Original grant audit incomplete');
 assert.equal(audits[0].id,receipt.auditId);assert.equal(audits[0].admin_id,'1');assert.equal(audits[0].action_type,'OPS_STREAMER_BOX_STARBALL_20261031');
 const {auditId,...details}=receipt;assert.deepEqual(audits[0].after_data,details);
 assert.deepEqual(logs.map(l=>l.user_id),receipt.allocations.map(a=>a.userId));
 for(let i=0;i<42;i++){
  const a=receipt.allocations[i],l=logs[i];assert.equal(l.id,a.logId);assert.equal(l.change_amount,String(a.amount));assert.equal(l.balance_after,a.after.quantity);
  assert.equal(l.admin_id,'1');assert.equal(l.reference_type,'OPS_STREAMER_BOX_STARBALL_20261031');assert.equal(l.reference_id,PARENT_OP);
  assert.equal(a.amount,a.marker===2?6:12);
  for(const key of ['quantity','unseen'])assert.equal(BigInt(a.after[key])-BigInt(a.before[key]),BigInt(a.amount));
 }
 return {receipt,logs,audits};
}
