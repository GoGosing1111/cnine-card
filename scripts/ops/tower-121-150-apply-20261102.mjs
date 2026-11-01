import assert from 'node:assert/strict';
import {inspectTowerAbyss} from './tower-abyss-balance-20261022.mjs';
import {buildTowerExpansionPlan,towerExpansionHash,TOWER_EXPANSION_OPERATION as OP} from './tower-121-150-policy-20261102.mjs';

// Importing this module never connects or writes. The current task authorizes
// local rehearsal only. A later live activation needs explicit authorization.
export async function inspectTowerExpansion(db){
 const {before}=await inspectTowerAbyss(db);
 const ids=[...new Set([...before.ranges.map(r=>Number(r.monster_id)),64,67,68,69,17,18])];
 const monsters=(await db.query('SELECT id,name,image_url,battle_power,is_active,tower_enabled,is_boss,ultimate_enabled,ultimate_tower_damage_percent,ultimate_trigger,ultimate_chance FROM battle_monsters WHERE id=ANY($1::bigint[]) ORDER BY id',[ids])).rows;
 const state={before,monsters};return {...state,sourceHash:towerExpansionHash(state)};
}

export async function applyTowerExpansion(db,{expectedHash,expectedPlanHash,sourceCommit,dualMercenariesReleased=false,authorization=null,dryRun=true}={}){
 assert.match(expectedHash||'',/^[a-f0-9]{64}$/);assert.match(expectedPlanHash||'',/^[a-f0-9]{64}$/);assert.match(sourceCommit||'',/^[a-f0-9]{40}$/);
 // Completed operations are read-only even if later CMS edits or flags differ.
 const previous=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];
 if(previous)return {replayed:true,receipt:JSON.parse(previous.value)};
 if(!dryRun){assert.equal(authorization,OP,'Explicit live activation authorization required');assert.equal(dualMercenariesReleased,true,'Deploy and verify two-mercenary support before activation');}
 await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='15s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];
  if(prior){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value)};}
  await db.query('LOCK TABLE tower_seasons,tower_floor_ranges,tower_floors IN SHARE ROW EXCLUSIVE MODE');
  // Protect the captured monster skills and tower configuration during activation.
  await db.query('SELECT id FROM battle_monsters WHERE id=ANY($1::bigint[]) FOR SHARE',[[64,67,68,69,17,18]]);
  await db.query("SELECT key FROM app_meta WHERE key='tower_settings_v1' FOR SHARE");
  const inspected=await inspectTowerExpansion(db);assert.equal(inspected.sourceHash,expectedHash,'Tower CMS or monsters changed after review');
  const plan=buildTowerExpansionPlan(inspected);assert.equal(towerExpansionHash(plan),expectedPlanHash,'The reviewed expansion plan changed');
  const {before}=inspected,now=new Date().toISOString();
  // Never replace or deactivate floors 1-120. Do not touch accounts or receipts.
  await db.query(`INSERT INTO tower_floor_ranges(season_id,monster_id,start_floor,end_floor,power_override,reward_coin,is_boss,is_active,created_at,updated_at)
   SELECT $1,x."monsterId",x.floor,x.floor,x.power,x.coin,x.boss,1,$2,$2 FROM jsonb_to_recordset($3::jsonb) AS x(floor bigint,"monsterId" bigint,power bigint,coin bigint,boss bigint)`,[plan.seasonId,now,JSON.stringify(plan.floors)]);
  await db.query('UPDATE tower_seasons SET max_floor=150,updated_at=$1 WHERE id=$2 AND max_floor=120',[now,plan.seasonId]);
  const after=await inspectTowerExpansion(db);
  assert.equal(Number(after.before.season.max_floor),150);assert.equal(after.before.ranges.length,150);
  assert.deepEqual(after.before.ranges.filter(r=>Number(r.end_floor)<=120),before.ranges,'Old floors changed');
  assert.deepEqual(after.before.floors,before.floors);assert.deepEqual(after.before.settings,before.settings);assert.deepEqual(after.monsters,inspected.monsters);
  const installed=after.before.ranges.filter(r=>Number(r.start_floor)>120).sort((a,b)=>Number(a.start_floor)-Number(b.start_floor)).map(r=>({floor:Number(r.start_floor),monsterId:Number(r.monster_id),boss:Number(r.is_boss),power:Number(r.power_override),coin:Number(r.reward_coin)}));
  assert.deepEqual(installed,plan.floors);
  const receipt={operationKey:OP,version:plan.version,status:'COMPLETED',completedAt:now,sourceCommit,seasonId:plan.seasonId,maxFloor:150,beforeHash:expectedHash,planHash:expectedPlanHash,afterHash:after.sourceHash,totalNewCoin:plan.totalCoin,addedFloors:30,preservedFloors:120,progressReset:false,retroactiveGrant:false,accountWrites:0,pendingBattleChanges:0};
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(owner);
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_TOWER_121_150_20261102','TOWER',String(plan.seasonId),JSON.stringify(inspected),JSON.stringify({receipt,plan})])).rows[0];
  receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(receipt),now]);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt,plan};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
