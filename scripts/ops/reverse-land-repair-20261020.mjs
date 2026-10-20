import assert from 'node:assert/strict';
import {storedLandWeights,validateLandWeights,LAND_REPAIR_COUPON} from '../../functions/_soopket_land.js';
import {FORGE_REPAIR_ITEM} from '../../functions/_forge_repair_catalog.js';

export const OPERATION_KEY='ops:reverse-land-repair:20261020:v1';
export const SETTINGS_KEY='soopketland_settings_v2039';
export const EXPECTED_WEIGHTS=Object.freeze({COIN:12600,EMPEROR_ENERGY:1500,MASTER_STAR:12600,STARLIGHT_ARMOR_CORE:3000,PINGDU_THANKS_GIFT_BOX:300,[LAND_REPAIR_COUPON]:0});
export const TARGET_WEIGHTS=Object.freeze({COIN:18000,EMPEROR_ENERGY:1500,MASTER_STAR:4200,STARLIGHT_ARMOR_CORE:3000,PINGDU_THANKS_GIFT_BOX:300,[LAND_REPAIR_COUPON]:3000});

// Only this audited operation changes live odds. Catalog reads and future
// deployments preserve saved OWNER settings and all previously issued coupons.
export async function applyLandRepairPolicy(client,{commit=false}={}){
 await client.query('BEGIN');
 try{
  const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
  await q("SET LOCAL lock_timeout='3s'");await q("SET LOCAL statement_timeout='15s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){await client.query('ROLLBACK');return {...JSON.parse(prior.value),replayed:true,committed:false};}
  const [row]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[SETTINGS_KEY]);
  assert.ok(row,'Land settings missing');
  const before=JSON.parse(row.value);
  assert.deepEqual(storedLandWeights(before.weights),EXPECTED_WEIGHTS,'Current live odds changed; do not overwrite OWNER edits');
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");
  assert.ok(owner,'Audit OWNER missing');
  const [repair]=await q('SELECT code,name,is_active,image_url FROM inventory_items WHERE code=$1 FOR SHARE',[LAND_REPAIR_COUPON]);
  assert.equal(repair?.name,FORGE_REPAIR_ITEM.name);assert.equal(Number(repair.is_active),1);
  assert.equal(repair.image_url,FORGE_REPAIR_ITEM.image);
  const after={...before,weights:validateLandWeights(TARGET_WEIGHTS)};
  const changed=await q('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3 RETURNING key',[JSON.stringify(after),SETTINGS_KEY,row.value]);
  assert.equal(changed.length,1,'Settings changed concurrently');
  const report={operationKey:OPERATION_KEY,status:'APPLIED',before,after,repairAmount:1,repairPercent:10,coinPercent:60,starPercent:14,createdAt:new Date().toISOString(),authorization:'리버스랜드 코인을 60프로로 맞추고 마별 낮춰 그리고 핑두의 리페어 쿠폰 1개도 추가해 10%정도로 해서'};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_REVERSE_LAND_REPAIR','APP_META',$2,$3,$4) RETURNING id",[owner.id,SETTINGS_KEY,JSON.stringify(before),JSON.stringify(report)]);
  report.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(report)]);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...report,committed:commit};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
