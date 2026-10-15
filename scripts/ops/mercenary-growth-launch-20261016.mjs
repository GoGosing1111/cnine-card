// Explicit one-time joint release operation. Importing never connects or writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MERCENARY_LEVEL_KEY,MERCENARY_LEVEL_RELEASE_ENABLED,mercenaryLevelReadiness} from '../../shared/mercenary-level-v1.mjs';
import {MERCENARY_LEVEL_SCHEMA} from '../../functions/_mercenary_level_policy.js';
import {mercenaryGrowthLaunchPolicy,MERCENARY_GROWTH_LAUNCH_VERSION} from '../../shared/mercenary-growth-launch-20261016.mjs';
import {PVP_POWER_BALANCE,PVP_POWER_BALANCE_RELEASED} from '../../shared/pvp-power-balance-v1.mjs';

export const OPERATION_KEY='ops:mercenary-growth-launch:20261016:v1';
const hash=raw=>createHash('sha256').update(raw??'null').digest('hex');
const parse=raw=>typeof raw==='string'?JSON.parse(raw):raw;
export async function inspectGrowthLaunch(client){
 const row=(await client.query('SELECT value FROM app_meta WHERE key=$1',[MERCENARY_LEVEL_KEY])).rows[0];
 const raw=row?.value??null;
 const schema=(await client.query("SELECT to_regclass('user_mercenary_levels_v1')::text AS name")).rows[0].name;
 const count=schema?Number((await client.query('SELECT COUNT(*) AS n FROM user_mercenary_levels_v1')).rows[0].n):0;
 const receipt=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
 return {raw,policy:raw===null?null:parse(raw),stateHash:hash(raw),schemaInstalled:!!schema,growthRows:count,receipt:receipt?parse(receipt.value):null};
}
export async function verifyGrowthLaunch(client,receipt){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 const current=await inspectGrowthLaunch(client);
 assert.equal(current.schemaInstalled,true);
 assert.deepEqual(current.policy,receipt.policyAfter,'CMS changed since launch; do not overwrite it');
 assert.deepEqual(receipt.policyAfter,mercenaryGrowthLaunchPolicy({revision:receipt.revisionAfter}));
 assert.equal(mercenaryLevelReadiness(current.policy,{requireGrowth:true}).ready,true);
 assert.deepEqual(receipt.powerPolicy,PVP_POWER_BALANCE);
 return {status:'VERIFIED',revision:current.policy.revision,mode:current.policy.mode,growthRows:current.growthRows,powerVersion:receipt.powerPolicy.version};
}
export async function applyGrowthLaunch(client,{expectedStateHash,dryRun=false}={}){
 assert.equal(MERCENARY_LEVEL_RELEASE_ENABLED,true);assert.equal(PVP_POWER_BALANCE_RELEASED,true);
 assert.match(String(expectedStateHash??''),/^[a-f0-9]{64}$/);
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.rows.length){
   const receipt=parse((await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0].value);
   const verification=await verifyGrowthLaunch(client,receipt);await client.query('ROLLBACK');return {receipt,verification,replayed:true,dryRun};
  }
  const before=await inspectGrowthLaunch(client);
  assert.equal(before.stateHash,expectedStateHash,'Growth CMS changed; inspect before retrying');
  assert.ok(before.policy===null||before.policy.mode==='OFF','Do not replace an already active growth policy');
  assert.equal(before.growthRows,0,'First launch must not overwrite existing growth records');
  const owner=(await client.query("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'")).rows[0];
  assert.ok(owner,'Active audit OWNER required');
  const revisionBefore=before.policy?.revision??0,revisionAfter=revisionBefore+1;
  const policyAfter=mercenaryGrowthLaunchPolicy({revision:revisionAfter});
  for(const sql of MERCENARY_LEVEL_SCHEMA)await client.query(sql);
  const saved=before.raw===null
   ?await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[MERCENARY_LEVEL_KEY,JSON.stringify(policyAfter)])
   :await client.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 AND value=$3 RETURNING key',[MERCENARY_LEVEL_KEY,JSON.stringify(policyAfter),before.raw]);
  assert.equal(saved.rows.length,1,'Growth CMS revision conflict');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,launchVersion:MERCENARY_GROWTH_LAUNCH_VERSION,
   authorization:'용병 레벨과 전투력 보너스 함께 적용; 검수 경험치 필요량 3배; 돌파 10%; 레벨마다 필요량 증가',
   stateHashBefore:before.stateHash,revisionBefore,revisionAfter,policyBefore:before.policy,policyAfter,powerPolicy:PVP_POWER_BALANCE,
   schemaCreated:!before.schemaInstalled,growthRowsBefore:before.growthRows,playerRecordsChanged:false,completedAt:new Date().toISOString()};
  await verifyGrowthLaunch(client,receipt);
  const log=await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_MERCENARY_GROWTH_LAUNCH','APP_META',OPERATION_KEY,JSON.stringify({policy:before.policy,schemaInstalled:before.schemaInstalled}),JSON.stringify(receipt)]);
  assert.equal(log.rows.length,1);receipt.adminLogId=String(log.rows[0].id);
  assert.equal((await client.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)])).rows.length,1);
  const verification=await verifyGrowthLaunch(client,receipt);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,verification,replayed:false,dryRun};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
