// Explicit one-time operator action, never imported by a runtime migration.
import {LOOT_SHOP_DEFAULTS,PIG_COIN_SOURCE_DEFAULTS,validateLootShopPolicy,upgradeLootShopPolicy} from '../../shared/loot-shop-policy-v1.mjs';
import {LOOT_SHOP_SCHEMA,LOOT_SHOP_KEY} from '../../functions/_loot_shop.js';
import {JOINT_ATOMIC_SCHEMA} from '../../functions/_joint_atomic.js';
export const PIG_REWARD_OPERATION='ops_pig_coin_rewards_20260915_v2';
export async function policyHash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value??'null'));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export async function applyApprovedPigCoinRewards(client,{expectedHash,dryRun=false}){
 await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[PIG_REWARD_OPERATION])).rows[0];
  if(prior){await client.query('ROLLBACK');return {ok:true,replayed:true,receipt:JSON.parse(prior.value)};}
  // A unique marker also serializes concurrent operator retries from an empty policy.
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[PIG_REWARD_OPERATION,'{"status":"PENDING"}']);
  const row=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[LOOT_SHOP_KEY])).rows[0],raw=row?.value??null;
  if(await policyHash(raw)!==expectedHash)throw Error('CMS settings changed since inspection');
  const before=validateLootShopPolicy(raw===null?structuredClone(LOOT_SHOP_DEFAULTS):upgradeLootShopPolicy(JSON.parse(raw)));
  const next=validateLootShopPolicy({...before,revision:before.revision+1,rewardsEnabled:true,sources:PIG_COIN_SOURCE_DEFAULTS.map(s=>({...s,enabled:true}))});
  if(JSON.stringify(next.products)!==JSON.stringify(before.products)||next.salesEnabled!==before.salesEnabled)throw Error('Unrelated shop configuration changed');
  for(const sql of [...LOOT_SHOP_SCHEMA,...JOINT_ATOMIC_SCHEMA])await client.query(sql);
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];if(!owner)throw Error('Audit owner missing');
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[LOOT_SHOP_KEY,JSON.stringify(next)]);
  const receipt={status:'COMPLETED',operationKey:PIG_REWARD_OPERATION,actor:'CODEX_OPERATIONS',reason:'사용자 확정: 영토전 승리 100 + CMS 최소 공격 충족 50, 클랜 시즌 승리 30 + 완료 공격 30회 이상 30 합산, 붕괴 코어 격파 30·KST 주간 90. 미정 상품 판매 유지.',completedAt:new Date().toISOString(),beforeHash:expectedHash,policy:next};
  const audit=await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'PIG_COIN_REWARD_POLICY_APPROVED','APP_META',LOOT_SHOP_KEY,raw,JSON.stringify(receipt)]);if(audit.rows.length!==1)throw Error('Audit missing');receipt.auditId=String(audit.rows[0].id);
  await client.query('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[PIG_REWARD_OPERATION,JSON.stringify(receipt)]);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {ok:true,dryRun,receipt};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
