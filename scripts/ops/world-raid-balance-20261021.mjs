// One-time authorized operational change. Never imported by a request route.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import baseline from '../../tests/fixtures/world-raid-cms-20261021.json' with {type:'json'};
import measured from '../../docs/qa/world-raid-balance-20261021/measurement.json' with {type:'json'};
import {normalizeStoredWeeklyRaidConfig,normalizeWeeklyRaidConfig} from '../../functions/_raid_weekly_cms_v2141.js';
import {WORLD_RAID_TUNING_20261021 as tuning,WORLD_RAID_CLEAR_COIN_20261021 as coin,WORLD_RAID_BATTLE_SECONDS_20261021 as seconds} from '../../shared/world-raid-balance-20261021.mjs';
export const OPERATION_KEY='ops:world-raid-balance:20261021:v1';
const COMMON='raid_settings_v1',WEEKLY='raid_weekly_boss_settings_v2141';
const hash=s=>createHash('sha256').update(s).digest('hex');
const canonical=rows=>rows.map(r=>({...r,id:Number(r.id),max_hp:Number(r.max_hp),defense_rate:Number(r.defense_rate),is_active:Number(r.is_active)}));
export function buildWorldRaidPlan20261021(){
 for(const [path,expected] of Object.entries(measured.hashes))assert.equal(hash(fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n')),expected,'Measured source changed: '+path);
 const stored=Object.fromEntries(baseline.meta.map(r=>[r.key,r.value])),common=JSON.parse(stored[COMMON]),before=normalizeStoredWeeklyRaidConfig(stored[WEEKLY]),weekly=structuredClone(before);
 common.battleSeconds=seconds;weekly.revision=randomUUID();
 const bosses=Object.entries(tuning).map(([code,change])=>{
  const proof=measured.bosses.find(b=>b.code===code).after;
  assert.equal(proof.settings.clearCoin,coin);assert.equal(proof.settings.battleSeconds,seconds);assert.equal(proof.settings.defense,change.defense);assert.equal(proof.settings.attack,change.attack);
  assert.ok(proof.groups[10].clearPercent>=40&&proof.groups[10].clearPercent<=60);
  assert.ok(proof.groups[15].clearPercent>=85&&proof.groups[15].medianClearSeconds>=240);
  assert.ok(proof.groups[20].clearPercent>=99);
  assert.equal(proof.strongestSolo.clear,false);assert.equal(proof.allObservedDuoPairs.clears,0);
  const cfg=weekly.bosses[code];cfg.bossAttackPower=change.attack;
  assert.equal(cfg.rewards.clear.filter(r=>r.type==='COIN').length,1);
  cfg.rewards.clear=cfg.rewards.clear.map(r=>r.type==='COIN'?{...r,amount:coin}:r);
  const preserved=structuredClone(cfg);preserved.bossAttackPower=before.bosses[code].bossAttackPower;preserved.rewards.clear=before.bosses[code].rewards.clear;
  assert.deepEqual(preserved,before.bosses[code]);
  const old=baseline.bosses.find(b=>b.name===change.name);assert.equal(Number(old.max_hp),change.hp);
  return {...old,defense_rate:change.defense};
 });
 assert.deepEqual(normalizeWeeklyRaidConfig(weekly),weekly);assert.deepEqual(weekly.rotation,before.rotation);
 return {stored,common,weekly,bosses,measurementHash:hash(JSON.stringify(measured))};
}
export async function applyWorldRaidBalance20261021(db,{dryRun=false,releaseCommit}={}){
 assert.match(releaseCommit||'',/^[a-f0-9]{40}$/,'The deployed reward-cap release commit is required');
 await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY])).rows[0];
  if(prior){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value)};}
  const plan=buildWorldRaidPlan20261021();
  const meta=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[COMMON,WEEKLY]])).rows;
  assert.equal(meta.length,2);for(const row of meta)assert.equal(row.value,plan.stored[row.key],'CMS changed since review: '+row.key);
  const bossSql='SELECT id,name,max_hp,defense_rate,is_active FROM raid_bosses WHERE id=ANY($1::bigint[]) ORDER BY id',ids=plan.bosses.map(b=>b.id);
  const before=(await db.query(bossSql+' FOR UPDATE',[ids])).rows;assert.deepEqual(canonical(before),canonical(baseline.bosses),'Boss rows changed since review');
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner,'OWNER audit actor missing');
  const rooms=async()=>(await db.query("SELECT COUNT(*) AS count,md5(COALESCE(string_agg(instance_id::text||':'||md5(settings_json),',' ORDER BY instance_id),'')) AS digest FROM raid_instance_v1293")).rows[0];
  const roomsBefore=await rooms();
  for(const boss of plan.bosses){const result=await db.query('UPDATE raid_bosses SET defense_rate=$1,updated_at=CURRENT_TIMESTAMP::text WHERE id=$2',[boss.defense_rate,boss.id]);assert.equal(result.rowCount??result.affectedRows,1);}
  for(const [key,value] of [[COMMON,plan.common],[WEEKLY,plan.weekly]]){
   const result=await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP::text WHERE key=$2 AND value=$3',[JSON.stringify(value),key,plan.stored[key]]);assert.equal(result.rowCount??result.affectedRows,1);
  }
  const after=(await db.query(bossSql,[ids])).rows;assert.deepEqual(canonical(after),canonical(plan.bosses));assert.deepEqual(await rooms(),roomsBefore,'Existing room settings must stay unchanged');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',completedAt:new Date().toISOString(),releaseCommit,authorization:'보상 1000억으로 올리고 난이도 확실히 올려 10~15인이 힘들게 깨도록',clearCoin:coin,battleSeconds:seconds,measurementHash:plan.measurementHash,weeklyRevision:plan.weekly.revision,bosses:after,existingRoomsUnchanged:roomsBefore,participationMinionItemsAndEntryPreserved:true,accountGrants:0};
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'WORLD_RAID_BALANCE_20261021','SETTINGS',OPERATION_KEY,JSON.stringify({common:JSON.parse(plan.stored[COMMON]),weekly:JSON.parse(plan.stored[WEEKLY]),bosses:before}),JSON.stringify({...receipt,common:plan.common,weekly:plan.weekly})])).rows[0];assert.ok(audit);receipt.adminLogId=audit.id;
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP::text)',[OPERATION_KEY,JSON.stringify(receipt)]);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
export async function verifyWorldRaidBalance20261021(db){
 const row=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];assert.ok(row,'Operation receipt missing');const receipt=JSON.parse(row.value);
 const meta=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[COMMON,WEEKLY]])).rows,stored=Object.fromEntries(meta.map(r=>[r.key,r.value]));
 const common=JSON.parse(stored[COMMON]),weekly=normalizeStoredWeeklyRaidConfig(stored[WEEKLY]),plan=buildWorldRaidPlan20261021();plan.weekly.revision=receipt.weeklyRevision;
 assert.deepEqual(common,plan.common);assert.deepEqual(weekly,plan.weekly);
 const bosses=(await db.query('SELECT id,name,max_hp,defense_rate,is_active FROM raid_bosses WHERE id=ANY($1::bigint[]) ORDER BY id',[plan.bosses.map(b=>b.id)])).rows;assert.deepEqual(canonical(bosses),canonical(plan.bosses));
 return {receipt,common,weekly,bosses};
}
