// One-time authorized CMS operation. Request routes never import this file.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs';
import baseline from '../../tests/fixtures/world-raid-cms-20261008.json' with {type:'json'};
import measured from '../../docs/world-raid-balance-20261008.json' with {type:'json'};
import {WORLD_RAID_TUNING} from '../../shared/world-raid-balance-20261008.mjs';
import {normalizeWeeklyRaidConfig} from '../../functions/_raid_weekly_cms_v2141.js';
export const OPERATION_KEY='ops:world-raid-renewal:20261008:v1';
const COMMON='raid_settings_v1',WEEKLY='raid_weekly_boss_settings_v2141';
const names={NAGATO:'나가토',YORIICHI:'요리이치',ICHIGO:'이치고'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonicalRows=rows=>rows.map(r=>({...r,id:Number(r.id),max_hp:Number(r.max_hp),defense_rate:Number(r.defense_rate),is_active:Number(r.is_active)}));
export function buildWorldRaidRenewalPlan(){
 for(const [file,expected] of Object.entries(measured.hashes))assert.equal(hash(fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n')),expected,'Measured input changed: '+file);
 assert.equal(measured.capturedAt,baseline.capturedAt);
 const stored=Object.fromEntries(baseline.meta.map(row=>[row.key,row.value])),before=normalizeWeeklyRaidConfig(JSON.parse(stored[WEEKLY])),weekly=structuredClone(before);
 weekly.revision=randomUUID();
 const bosses=Object.entries(WORLD_RAID_TUNING).map(([code,tuning])=>{
  const proof=measured.bosses.find(b=>b.code===code),old=baseline.bosses.find(b=>b.name===names[code]);
  assert.deepEqual(proof.after.settings,{hp:tuning.hp,attack:tuning.attack,interval:tuning.interval,minions:tuning.minions});
  assert(proof.after.groups[20].clearPercent>=99);assert(proof.after.groups[20].medianClearSeconds>proof.before.groups[20].medianClearSeconds*1.8);
  assert.equal(proof.after.strongestSolo.cleared,false);assert.equal(proof.after.strongestDuo.cleared,false);
  const cfg=weekly.bosses[code];cfg.bossAttackPower=tuning.attack;cfg.bossAttackIntervalMs=tuning.interval;
  cfg.minions=cfg.minions.map((row,i)=>({...row,maxHp:tuning.minions[i]}));
  const unchanged=structuredClone(cfg);unchanged.bossAttackPower=before.bosses[code].bossAttackPower;unchanged.bossAttackIntervalMs=before.bosses[code].bossAttackIntervalMs;
  unchanged.minions.forEach((row,i)=>row.maxHp=before.bosses[code].minions[i].maxHp);
  assert.deepEqual(unchanged,before.bosses[code],'Only difficulty may change');
  return {...old,max_hp:tuning.hp};
 });
 assert.deepEqual(normalizeWeeklyRaidConfig(weekly),weekly);assert.deepEqual(weekly.rotation,before.rotation);
 return{stored,weekly,bosses,baselineSha256:hash(JSON.stringify(baseline)),measurementSha256:hash(JSON.stringify(measured))};
}
export async function applyWorldRaidRenewal(client,{commit=false,releaseCommit}={}){
 if(commit)assert.match(releaseCommit||'',/^[a-f0-9]{40}$/,'Deployed release commit is required');
 const plan=buildWorldRaidRenewalPlan();
 await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY])).rows[0];
  if(prior){await client.query('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  const meta=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[COMMON,WEEKLY]])).rows;
  assert.equal(meta.length,2);for(const row of meta)assert.equal(row.value,plan.stored[row.key],'CMS changed since review: '+row.key);
  const bossSql="SELECT id,name,max_hp,defense_rate,is_active FROM raid_bosses WHERE name IN ('나가토','요리이치','이치고') ORDER BY id";
  const before=(await client.query(bossSql+' FOR UPDATE')).rows;
  assert.deepEqual(canonicalRows(before),canonicalRows(baseline.bosses),'Boss rows changed since review');
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert(owner,'Audit OWNER missing');
  const roomDigest=async()=>(await client.query("SELECT COUNT(*) AS count,md5(COALESCE(string_agg(instance_id::text||':'||md5(settings_json),',' ORDER BY instance_id),'')) AS digest FROM raid_instance_v1293")).rows[0];
  const roomsBefore=await roomDigest();
  for(const row of plan.bosses){const result=await client.query('UPDATE raid_bosses SET max_hp=$1,updated_at=CURRENT_TIMESTAMP::text WHERE id=$2 AND max_hp=$3',[row.max_hp,row.id,before.find(b=>Number(b.id)===Number(row.id)).max_hp]);assert.equal(result.rowCount??result.affectedRows,1);}
  const updated=await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP::text WHERE key=$2 AND value=$3',[JSON.stringify(plan.weekly),WEEKLY,plan.stored[WEEKLY]]);assert.equal(updated.rowCount??updated.affectedRows,1);
  assert.equal((await client.query('SELECT value FROM app_meta WHERE key=$1',[COMMON])).rows[0].value,plan.stored[COMMON]);
  assert.deepEqual(await roomDigest(),roomsBefore,'Existing room snapshots must not change');
  const bosses=(await client.query(bossSql)).rows;assert.deepEqual(canonicalRows(bosses),canonicalRows(plan.bosses));
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',committed:commit,completedAt:new Date().toISOString(),releaseCommit:releaseCommit||null,authorization:'월드레이드 UI·스킬 이펙트 개선·난이도 증가',baselineSha256:plan.baselineSha256,measurementSha256:plan.measurementSha256,weeklyRevision:plan.weekly.revision,bosses,existingRoomsUnchanged:roomsBefore,rewardsAndEntryPolicyUnchanged:true};
  const audit=(await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'WORLD_RAID_RENEWAL','SETTINGS',OPERATION_KEY,JSON.stringify({weekly:JSON.parse(plan.stored[WEEKLY]),bosses:before}),JSON.stringify({...receipt,weekly:plan.weekly})])).rows[0];assert(audit);receipt.adminLogId=audit.id;
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP::text)',[OPERATION_KEY,JSON.stringify(receipt)]);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,replayed:false};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
