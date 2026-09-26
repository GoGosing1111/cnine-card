import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateDuoPolicy,DUO_WEEKLY_POLICY_KEY} from '../../shared/ranked-duo-weekly-v3.mjs';
import {validateDuoConfig} from '../../shared/ranked-duo-v1.mjs';
export const OPERATION_KEY='ops:ranked-duo:win-50000000:20260926:v1';
export const WIN_COIN=50_000_000;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function inspectDuoWinReward(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const [policyRow]=await q('SELECT value FROM app_meta WHERE key=$1',[DUO_WEEKLY_POLICY_KEY]);
 const [season]=await q("SELECT s.id,s.status,s.revision,s.config_json,s.recruit_until FROM ranked_duo_seasons_v1 s JOIN app_meta m ON m.key='ranked_duo_current_v1' AND m.value=s.id");
 assert.ok(policyRow&&season,'Current independent duo season and policy are required');
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const policy=JSON.parse(policyRow.value),config=JSON.parse(season.config_json);
 return {seasonId:season.id,status:season.status,revision:Number(season.revision),policy,config,recruitUntil:season.recruit_until,
  snapshotHash:digest({id:season.id,status:season.status,config:season.config_json,policy:policyRow.value}),receipt:prior?JSON.parse(prior.value):null};
}
// Explicit one-time current-season authorization. Future CMS behavior is unchanged.
export async function applyDuoWinReward(client,{expectedSnapshotHash,expectedSeasonId,dryRun=false}={}){
 assert.match(String(expectedSnapshotHash||''),/^[a-f0-9]{64}$/);assert.ok(expectedSeasonId);
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");
  const reserved=await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key",[OPERATION_KEY]);
  if(!reserved.length){const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.seasonId,expectedSeasonId);await q('ROLLBACK');return {...receipt,replayed:true};}
  await q('SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[DUO_WEEKLY_POLICY_KEY]);
  await q('SELECT id FROM ranked_duo_seasons_v1 WHERE id=$1 FOR UPDATE',[expectedSeasonId]);
  const before=await inspectDuoWinReward(client);
  assert.equal(before.seasonId,expectedSeasonId);assert.equal(before.snapshotHash,expectedSnapshotHash,'Season or policy changed; inspect again');
  assert.ok(['RECRUITING','PAIRING','PUBLISHING','READY','ACTIVE'].includes(before.status)&&before.config.weekly,'Season already settled or unsupported');
  assert.ok(Date.parse(before.config.endsAt)>Date.now(),'Current season has ended');
  const policy={...before.policy,revision:before.policy.revision+1,rewards:{...before.policy.rewards,winCoin:WIN_COIN}};
  const config={...before.config,revision:before.config.revision+1,rewards:{...before.config.rewards,winCoin:WIN_COIN},weekly:{...before.config.weekly,policyRevision:policy.revision}};
  validateDuoPolicy(policy);validateDuoConfig(config);
  assert.equal((await q('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[DUO_WEEKLY_POLICY_KEY,JSON.stringify(policy)])).length,1);
  assert.equal((await q('UPDATE ranked_duo_seasons_v1 SET config_json=$2,revision=revision+1 WHERE id=$1 RETURNING id',[expectedSeasonId,JSON.stringify(config)])).length,1);
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,seasonId:expectedSeasonId,winCoin:WIN_COIN,actor:'SYSTEM_OPS',
   authorization:'랭크듀오 승리보상 1회당 5천만으로 해라 제한도 풀고 지금 시즌부터 바로 적용',
   before:{policy:before.policy,config:before.config},after:{policy,config},completedAt:new Date().toISOString()};
  const audit=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'DUO_WIN_REWARD_POLICY','RANKED_DUO',$2,$3,$4) RETURNING id",[owner.id,expectedSeasonId,JSON.stringify(receipt.before),JSON.stringify(receipt)]);
  assert.equal(audit.length,1);receipt.auditId=String(audit[0].id);
  assert.equal((await q('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)])).length,1);
  const after=await inspectDuoWinReward(client);assert.deepEqual(after.policy,policy);assert.deepEqual(after.config,config);
  await q(dryRun?'ROLLBACK':'COMMIT');return {...receipt,dryRun,replayed:false};
 }catch(error){await q('ROLLBACK').catch(()=>{});throw error;}
}
