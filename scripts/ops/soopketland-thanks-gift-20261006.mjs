import assert from 'node:assert/strict';
import {storedLandWeights,validateLandWeights} from '../../functions/_soopket_land.js';
export const OPERATION_KEY='ops:soopketland-stars1m-thanks1:20261006:v1';
export const SETTINGS_KEY='soopketland_settings_v2039';
export const TARGET_WEIGHTS=Object.freeze({COIN:12600,EMPEROR_ENERGY:1500,MASTER_STAR:12600,STARLIGHT_ARMOR_CORE:3000,PINGDU_THANKS_GIFT_BOX:300});
const EXPECTED_WEIGHTS={COIN:12750,EMPEROR_ENERGY:1500,MASTER_STAR:12750,STARLIGHT_ARMOR_CORE:3000,PINGDU_THANKS_GIFT_BOX:0};
export async function applyLandGiftPolicy(client,{commit=false}={}){
 await client.query('BEGIN');
 try{
  const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
  await q("SET LOCAL lock_timeout='3s'");await q("SET LOCAL statement_timeout='15s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){await client.query('ROLLBACK');return {...JSON.parse(prior.value),replayed:true,committed:false};}
  const [row]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[SETTINGS_KEY]);
  assert.ok(row,'Land settings missing');
  const before=JSON.parse(row.value);assert.deepEqual(storedLandWeights(before.weights),EXPECTED_WEIGHTS,'Current live odds changed; do not overwrite OWNER edits');
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Audit OWNER missing');
  const [gift]=await q("SELECT code,name,is_active FROM inventory_items WHERE code='PINGDU_THANKS_GIFT_BOX'");
  assert.equal(gift?.name,'핑두의 감사 선물');assert.equal(Number(gift.is_active),1);
  const after={...before,weights:validateLandWeights(TARGET_WEIGHTS)};
  const changed=await q('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3 RETURNING key',[JSON.stringify(after),SETTINGS_KEY,row.value]);
  assert.equal(changed.length,1,'Settings changed concurrently');
  const report={operationKey:OPERATION_KEY,status:'APPLIED',before,after,starMin:1000,starMax:1000000,starStep:1000,giftAmount:1,giftPercent:1,createdAt:new Date().toISOString(),authorization:'숲켓랜드 마별 100만까지 늘리고 1%확률로 핑두의 감사선물 넣어'};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_SOOPKETLAND_REWARDS','APP_META',$2,$3,$4) RETURNING id",[owner.id,SETTINGS_KEY,JSON.stringify(before),JSON.stringify(report)]);
  report.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(report)]);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...report,committed:commit};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
