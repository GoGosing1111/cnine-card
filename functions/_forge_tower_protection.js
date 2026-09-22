import {protectionDrop,readActiveForgeProtectionPolicy} from './_forge_protection_drop.js';
import {jointHash,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';

// Existing live tower policy, not the held re-ascent prototype. The caller owns
// the user lock and batches these writes with the first-clear progression.
export async function prepareTowerForgeProtectionClear(env,input){
 const policy=await readActiveForgeProtectionPolicy(env);
 if(!policy)return {statements:[],reward:null};
 return prepareTowerForgeProtectionClearReady(env,policy,input);
}
export async function prepareTowerForgeProtectionClearReady(env,policy,{userId,seasonId,floorNo},{randomInt}={}){
 if([userId,seasonId,floorNo].some(n=>!Number.isSafeInteger(n)||n<1))throw jointError('FORGE_TOWER_SOURCE','탑 최초 클리어 정보를 확인하세요.');
 const requestId=`forge-tower-${userId}-${seasonId}-${floorNo}`,kind='FORGE_TOWER_DROP',DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v);
 const inputHash=await jointHash({kind,userId,seasonId,floorNo});
 let row=await p('SELECT * FROM joint_operations_v1 WHERE request_id=?',requestId).first();
 if(!row){
  const rewards=protectionDrop(policy,'TOWER',{cleared:true,randomInt}),plan={rewards,policyVersion:policy.version,policyRevision:policy.revision};
  await p("INSERT INTO joint_operations_v1(request_id,user_id,kind,input_hash,plan_json,status,created_at) VALUES(?,?,?,?,?,'PENDING',?) ON CONFLICT(request_id) DO NOTHING",requestId,userId,kind,inputHash,JSON.stringify(plan),new Date().toISOString()).run();
  row=await p('SELECT * FROM joint_operations_v1 WHERE request_id=?',requestId).first();
 }
 if(Number(row.user_id)!==userId||row.kind!==kind||row.input_hash!==inputHash)throw jointError('FORGE_TOWER_SOURCE','탑 보호권 기록이 일치하지 않습니다.',409);
 const reward=JSON.parse(row.plan_json).rewards[0]||null;
 if(row.status==='COMPLETED')return {statements:[],reward,replayed:true};
 if(row.status!=='PENDING')throw jointError('FORGE_TOWER_SOURCE','탑 보호권 기록을 확인하세요.',409);
 const token=crypto.randomUUID(),statements=[jointGuard(DB,token,"EXISTS(SELECT 1 FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND status='PENDING')",[requestId,userId])];
 if(reward){
  const item=await p('SELECT code FROM inventory_items WHERE code=? AND is_active=1',reward.rewardRef).first();
  if(!item)throw jointError('FORGE_MATERIAL_CONFIG','장비 보호권 등록을 확인하세요.',409);
  statements.push(...jointInventoryChange(DB,userId,reward.rewardRef,reward.quantity,'무한의탑 최초 클리어 보호권',requestId));
 }
 statements.push(p("UPDATE joint_operations_v1 SET status='COMPLETED',completed_at=? WHERE request_id=? AND user_id=? AND status='PENDING'",new Date().toISOString(),requestId,userId),jointGuardEnd(DB,token));
 return {statements,reward,replayed:false};
}
