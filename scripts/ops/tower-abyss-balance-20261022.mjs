import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildTowerAbyssFloorPlan,towerAbyssRewardMultiplier,TOWER_ABYSS_BALANCE_VERSION} from './tower-abyss-policy-20261022.mjs';
export const OPERATION_KEY='ops:tower-abyss-growth:20261022:v1';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function inspectTowerAbyss(db){
 const season=(await db.query("SELECT id,name,status,max_floor,starts_at,ends_at FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1")).rows[0];assert.ok(season);
 const ranges=(await db.query('SELECT id,season_id,monster_id,start_floor,end_floor,power_override,reward_coin,is_boss,is_active FROM tower_floor_ranges WHERE season_id=$1 AND is_active=1 ORDER BY id',[season.id])).rows;
 const floors=(await db.query('SELECT * FROM tower_floors WHERE season_id=$1 AND is_active=1 ORDER BY floor_no',[season.id])).rows;
 const settings=(await db.query("SELECT value FROM app_meta WHERE key='tower_settings_v1'")).rows[0];
 const before={season,ranges,floors,settings};return {before,beforeHash:hash(before)};
}
export async function applyTowerAbyss(db,{expectedHash,releaseCommit,liveProtocol,dryRun=false}={}){
 assert.match(releaseCommit||'',/^[a-f0-9]{40}$/);assert.equal(liveProtocol,TOWER_ABYSS_BALANCE_VERSION);assert.match(expectedHash||'',/^[a-f0-9]{64}$/);
 await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='15s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(prior){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value)};}
  await db.query('LOCK TABLE tower_seasons,tower_floor_ranges,tower_floors IN SHARE ROW EXCLUSIVE MODE');
  const inspected=await inspectTowerAbyss(db);assert.equal(inspected.beforeHash,expectedHash,'Tower CMS changed after review');
  const {before}=inspected;assert.equal(before.floors.length,0,'Unexpected individual-floor overrides');
  const plan=buildTowerAbyssFloorPlan(before.ranges),seasonId=Number(before.season.id),now=new Date().toISOString();
  const monsters=[...new Set(plan.map(r=>r.monsterId))];
  const active=(await db.query('SELECT id FROM battle_monsters WHERE id=ANY($1::bigint[]) AND is_active=1 AND tower_enabled=1',[monsters])).rows;assert.equal(active.length,monsters.length);
  await db.query('UPDATE tower_floor_ranges SET is_active=0,updated_at=$1 WHERE season_id=$2 AND is_active=1',[now,seasonId]);
  await db.query(`INSERT INTO tower_floor_ranges(season_id,monster_id,start_floor,end_floor,power_override,reward_coin,is_boss,is_active,created_at,updated_at)
   SELECT $1,x."monsterId",x.floor,x.floor,x.power,x.coin,x.boss,1,$2,$2 FROM jsonb_to_recordset($3::jsonb) AS x(floor bigint,"monsterId" bigint,power bigint,coin bigint,boss bigint)`,[seasonId,now,JSON.stringify(plan)]);
  await db.query('UPDATE tower_seasons SET max_floor=120,updated_at=$1 WHERE id=$2',[now,seasonId]);
  const installed=(await db.query('SELECT start_floor AS floor,power_override AS power,reward_coin AS coin FROM tower_floor_ranges WHERE season_id=$1 AND is_active=1 ORDER BY start_floor',[seasonId])).rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Number(v)])));
  assert.deepEqual(installed,plan.map(({floor,power,coin})=>({floor,power,coin})));
  const receipt={actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,status:'COMPLETED',completedAt:now,releaseCommit,version:TOWER_ABYSS_BALANCE_VERSION,seasonId,maxFloor:120,beforeHash:expectedHash,planHash:hash(plan),previous100Coin:plan.filter(r=>r.floor<=100).reduce((n,r)=>n+r.coin,0),new20Coin:plan.filter(r=>r.floor>100).reduce((n,r)=>n+r.coin,0),totalCoin:plan.reduce((n,r)=>n+r.coin,0),accountWrites:0,progressReset:false,retroactiveGrant:false};
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert.ok(owner);
  const log=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_TOWER_ABYSS_20261022','TOWER',String(seasonId),JSON.stringify(before),JSON.stringify({...receipt,plan})])).rows[0];receipt.adminLogId=log.id;
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt,plan};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
export async function verifyTowerAbyss(db){
 const row=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];assert.ok(row);const receipt=JSON.parse(row.value);
 const state=await inspectTowerAbyss(db);assert.equal(Number(state.before.season.max_floor),120);assert.equal(state.before.ranges.length,120);
 const total=state.before.ranges.reduce((n,r)=>n+Number(r.reward_coin),0);assert.equal(total,receipt.totalCoin);
 assert.ok(state.before.ranges.every((r,i)=>Number(r.start_floor)===i+1&&Number(r.end_floor)===i+1));
 const installed=state.before.ranges.map(r=>({floor:Number(r.start_floor),monsterId:Number(r.monster_id),boss:Number(r.is_boss),power:Number(r.power_override),coin:Number(r.reward_coin),multiplier:Number(r.start_floor)<=100?towerAbyssRewardMultiplier(Number(r.start_floor)):null}));
 assert.equal(hash(installed),receipt.planHash,'Installed tower floors differ from the operation receipt');
 assert.equal(state.before.floors.length,0);
 return {checkedAt:new Date().toISOString(),receipt,maxFloor:120,totalCoin:total,gateways:state.before.ranges.filter(r=>Number(r.start_floor)%10===0).map(r=>({floor:Number(r.start_floor),power:Number(r.power_override),coin:Number(r.reward_coin)}))};
}
