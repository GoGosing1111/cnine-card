// One-time, explicitly requested CMS operation. Never import from request routes.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {normalizeWeeklyRaidConfig} from '../../functions/_raid_weekly_cms_v2141.js';
import {cleanRaidSettingsV1293} from '../../functions/_raid_overhaul.js';
import {WEEKLY_RAID_BOSSES_V1,weeklyRaidBossSettings} from '../../functions/_raid_weekly_bosses_v1.js';

export const OPERATION_KEY='ops:raid-population-balance:20260922:v1';
const WEEKLY='raid_weekly_boss_settings_v2141',COMMON='raid_settings_v1';
const PROFILES=[
  {code:'NAGATO',name:'나가토',hp:700_000_000,attack:2_496_244},
  {code:'YORIICHI',name:'요리이치',hp:750_000_000,attack:2_555_679},
  {code:'ICHIGO',name:'이치고',hp:800_000_000,attack:2_615_113}
];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function buildRaidPopulationPlan(input,simulation){
  assert.equal(input.players.length,197,'Refresh the population review if the sample changes');
  assert.equal(input.hashirama[0].fighter.attack,2_377_375,'Hashirama reference changed');
  assert.equal(input.common.maxParticipants,20);
  assert.equal(input.common.battleSeconds,1000);
  assert.equal(simulation.checkedAt,input.checkedAt,'Simulation must use the reviewed snapshot');
  const stored=Object.fromEntries(input.storedMeta.map(row=>[row.key,row.value]));
  const oldCommon=JSON.parse(stored[COMMON]),common={...oldCommon,enrageMultiplier:2,phase3EnrageMultiplier:2};
  const before=normalizeWeeklyRaidConfig(JSON.parse(stored[WEEKLY]));
  const weekly=structuredClone(before);weekly.revision=randomUUID();
  const bosses=PROFILES.map(target=>{
    const old=input.rows.find(row=>row.name===target.name);assert(old,'Raid row missing');
    const verified=simulation.candidates.find(row=>row.code===target.code);assert(verified,'Simulation missing');
    assert.equal(verified.hp,target.hp);assert.equal(verified.attack,target.attack);
    assert.equal(verified.random20.total,1000);assert(verified.random20.cleared>=990,'Mixed full-party clear rate below 99%');
    assert.equal(verified.real15To20.total,112);assert.equal(verified.real15To20.cleared,112);
    for(const name of ['strongest_solo','strongest_duo'])assert.equal(verified.results.find(row=>row.cohort===name)?.cleared,false);
    assert.equal(verified.results.find(row=>row.cohort==='mixed_15_median_5_weakest')?.cleared,true);
    const tuning=weekly.bosses[target.code];
    tuning.bossAttackPower=target.attack;tuning.bossAttackIntervalMs=60_000;
    tuning.ultimate.everyAttacks=3;
    tuning.minions=tuning.minions.map((row,i)=>({...row,maxHp:Math.round(target.hp*(i?.08:.07))}));
    assert.deepEqual(tuning.rewards,before.bosses[target.code].rewards,'Rewards must not change');
    const base=WEEKLY_RAID_BOSSES_V1.find(row=>row.code===target.code);
    const profile={...base,...tuning,maxHp:target.hp,defenseRate:Number(old.defense_rate),ultimate:{...base.ultimate,...tuning.ultimate},minions:base.minions.map((row,i)=>({...row,...tuning.minions[i]}))};
    const cfg=cleanRaidSettingsV1293(weeklyRaidBossSettings(cleanRaidSettingsV1293(common),profile));
    assert.deepEqual(cfg,verified.settings,'Exact live snapshot path must match the simulation');
    return {...old,max_hp:target.hp};
  });
  assert.deepEqual(normalizeWeeklyRaidConfig(weekly),weekly);
  assert.deepEqual(weekly.rotation,before.rotation);
  return {stored,common,weekly,bosses,inputDigest:digest(input),simulationDigest:digest(simulation),summary:{population:197,source:'Latest real raid entry power per non-admin user in the past 7 days; not a fresh equipment recalculation',snapshotAt:input.checkedAt,hashiramaAttack:2_377_375,bosses:simulation.candidates.map(({settings,...row})=>row)}};
}

export async function applyRaidPopulationBalance(client,{input,simulation,commit=false}){
  const plan=buildRaidPopulationPlan(input,simulation);
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
    const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY])).rows[0];
    if(prior){await client.query('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
    const meta=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[COMMON,WEEKLY,'battle_settings_v1','battle_apocalypse_settings_v1']])).rows;
    for(const row of meta)assert.equal(row.value,plan.stored[row.key],'CMS changed since simulation: '+row.key);
    assert.equal(meta.length,4,'Required settings missing');
    const before=(await client.query("SELECT id,name,max_hp,defense_rate,is_active FROM raid_bosses WHERE name IN ('나가토','요리이치','이치고') ORDER BY id FOR UPDATE")).rows;
    assert.deepEqual(before,input.rows,'Boss rows changed since simulation');
    assert(before.every(row=>Number(row.is_active)===1));
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];
    assert(owner,'An existing active OWNER is required for the operational audit');
    const roomDigest=async()=> (await client.query("SELECT COUNT(*) AS count,md5(COALESCE(string_agg(instance_id::text||':'||md5(settings_json),',' ORDER BY instance_id),'')) AS digest FROM raid_instance_v1293")).rows[0];
    const roomsBefore=await roomDigest();
    for(const row of plan.bosses){
      const original=before.find(x=>x.id===row.id);
      const update=await client.query('UPDATE raid_bosses SET max_hp=$1,updated_at=sqlite_now() WHERE id=$2 AND name=$3 AND max_hp=$4',[row.max_hp,row.id,row.name,original.max_hp]);
      assert.equal(update.rowCount,1,'Boss update row count mismatch');
    }
    for(const [key,value] of [[COMMON,plan.common],[WEEKLY,plan.weekly]]){
      const update=await client.query('UPDATE app_meta SET value=$1,updated_at=sqlite_now() WHERE key=$2 AND value=$3',[JSON.stringify(value),key,plan.stored[key]]);
      assert.equal(update.rowCount,1,'Settings revision conflict');
    }
    const after=(await client.query("SELECT id,name,max_hp,defense_rate,is_active FROM raid_bosses WHERE name IN ('나가토','요리이치','이치고') ORDER BY id")).rows;
    for(const row of after)assert.equal(Number(row.max_hp),plan.bosses.find(x=>x.id===row.id).max_hp);
    assert.deepEqual(await roomDigest(),roomsBefore,'Existing room snapshots must stay unchanged');
    const record={status:'COMPLETED',actor:'CODEX_OPERATIONS',authorization:'다 도전해서 깰수있게 한두명이 치고 쓰러지는거 말고',operationKey:OPERATION_KEY,completedAt:new Date().toISOString(),inputDigest:plan.inputDigest,simulationDigest:plan.simulationDigest,summary:plan.summary,bosses:after,existingRoomsUnchanged:roomsBefore,weeklyRevision:plan.weekly.revision};
    const audit=(await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'RAID_POPULATION_BALANCE','SETTINGS',OPERATION_KEY,JSON.stringify({common:JSON.parse(plan.stored[COMMON]),weekly:JSON.parse(plan.stored[WEEKLY]),bosses:before}),JSON.stringify({...record,common:plan.common,weekly:plan.weekly})])).rows[0];
    assert(audit,'Audit missing');record.adminLogId=audit.id;
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(record)]);
    await client.query(commit?'COMMIT':'ROLLBACK');
    return {...record,committed:commit,replayed:false};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
