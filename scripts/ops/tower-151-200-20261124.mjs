import assert from 'node:assert/strict';
import plan from '../../docs/qa/tower-200-20261124/floor-plan.json' with {type:'json'};
import {inspectTowerExpansion} from './tower-121-150-apply-20261102.mjs';
import {towerExpansionHash as hash} from './tower-121-150-policy-20261102.mjs';

export const operationKey = 'ops:tower-floors-151-200:20261124:v1';
const receiptSql = 'SELECT value FROM app_meta WHERE key=$1';
const ordered = state => [...state.before.ranges].sort((a,b)=>Number(a.start_floor)-Number(b.start_floor));
const normalize = row => ({floor:Number(row.start_floor),monsterId:Number(row.monster_id),boss:Number(row.is_boss),
  power:Number(row.power_override),coin:Number(row.reward_coin)});

export function validateBaseline(state) {
  assert.equal(Number(state.before.season.max_floor),plan.previousMaxFloor);
  assert.equal(state.before.floors.length,0);
  const rows=ordered(state);
  assert.equal(rows.length,150);
  const coins=new Map();
  for (const [index,row] of rows.entries()) {
    assert.equal(Number(row.start_floor),index+1);
    assert.equal(Number(row.end_floor),index+1);
    coins.set(index+1,BigInt(row.reward_coin));
  }
  const monsters=new Set(state.monsters.filter(m=>Number(m.is_active)===1&&Number(m.tower_enabled)===1).map(m=>Number(m.id)));
  assert.equal(plan.floors.length,50);
  let lastPower=Number(rows.at(-1).power_override);
  for (const [index,row] of plan.floors.entries()) {
    assert.equal(row.floor,151+index);
    assert.equal(row.boss,Number(row.floor%10===0));
    assert(monsters.has(row.monsterId));
    assert(Number.isSafeInteger(row.power)&&row.power>lastPower);
    assert(Number.isSafeInteger(row.coin)&&row.coin>0);
    assert.equal(BigInt(row.coin)*10n,coins.get(row.floor-10)*13n);
    coins.set(row.floor,BigInt(row.coin));lastPower=row.power;
  }
  assert.equal(plan.floors.reduce((n,r)=>n+r.coin,0),plan.totalNewBaseCoin);
}

export async function verifyTower200(db) {
  const prior=(await db.query(receiptSql,[operationKey])).rows[0];
  assert(prior,'Tower activation receipt missing');
  const receipt=JSON.parse(prior.value);
  const state=await inspectTowerExpansion(db),rows=ordered(state);
  assert.equal(Number(state.before.season.max_floor),200);
  assert.equal(rows.length,200);
  assert.equal(state.before.floors.length,0);
  assert.equal(hash(rows.slice(0,150)),receipt.originalFloorHash);
  assert(rows.every((row,i)=>Number(row.start_floor)===i+1&&Number(row.end_floor)===i+1));
  assert.deepEqual(rows.slice(150).map(normalize),plan.floors);
  assert.equal(receipt.planHash,hash(plan.floors));
  return {receipt,verifiedFloors:rows.length,added:rows.length-150,observedHash:state.sourceHash,
    gateways:rows.slice(149).filter(r=>Number(r.start_floor)%10===0).map(normalize)};
}

export async function activateTower200(db,{expectedHash,releaseCommit,dryRun=true}={}) {
  assert.match(expectedHash??'',/^[a-f0-9]{64}$/);
  assert.match(releaseCommit??'',/^[a-f0-9]{40}$/);
  const completed=(await db.query(receiptSql,[operationKey])).rows[0];
  if(completed)return {replayed:true,receipt:JSON.parse(completed.value)};
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await db.query("SET LOCAL lock_timeout='4s'");
    await db.query("SET LOCAL statement_timeout='20s'");
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[operationKey]);
    const prior=(await db.query(receiptSql,[operationKey])).rows[0];
    if(prior){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value)};}
    await db.query('LOCK TABLE tower_seasons,tower_floor_ranges,tower_floors IN SHARE ROW EXCLUSIVE MODE');
    await db.query('SELECT id FROM battle_monsters WHERE id=ANY($1::bigint[]) FOR SHARE',[[...new Set(plan.floors.map(r=>r.monsterId))]]);
    await db.query("SELECT key FROM app_meta WHERE key='tower_settings_v1' FOR SHARE");
    const state=await inspectTowerExpansion(db);
    assert.equal(state.sourceHash,expectedHash,'Live tower baseline changed');
    validateBaseline(state);
    const {id}=state.before.season,now=new Date().toISOString();
    const insert=await db.query(`INSERT INTO tower_floor_ranges(season_id,monster_id,start_floor,end_floor,power_override,reward_coin,is_boss,is_active,created_at,updated_at)
      SELECT $1,x."monsterId",x.floor,x.floor,x.power,x.coin,x.boss,1,$2,$2 FROM jsonb_to_recordset($3::jsonb)
      AS x(floor bigint,"monsterId" bigint,power bigint,coin bigint,boss bigint)`,[id,now,JSON.stringify(plan.floors)]);
    assert.equal(insert.rowCount,50);
    const season=await db.query('UPDATE tower_seasons SET max_floor=200,updated_at=$1 WHERE id=$2 AND max_floor=150',[now,id]);
    assert.equal(season.rowCount,1);
    const after=await inspectTowerExpansion(db);
    assert.deepEqual(ordered(after).slice(0,150),ordered(state));
    assert.deepEqual(ordered(after).slice(150).map(normalize),plan.floors);
    assert.deepEqual(after.before.floors,state.before.floors);
    assert.deepEqual(after.before.settings,state.before.settings);
    assert.deepEqual(after.monsters,state.monsters);
    const receipt={operationKey,status:'COMPLETED',completedAt:now,releaseCommit,seasonId:Number(id),maxFloor:200,
      addedFloors:50,beforeHash:state.sourceHash,afterHash:after.sourceHash,originalFloorHash:hash(ordered(state)),
      planHash:hash(plan.floors),newBaseCoin:plan.totalNewBaseCoin,accountWrites:0,progressReset:false};
    const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
    assert(owner);
    const log=await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [owner.id,'OPS_TOWER_151_200_20261124','TOWER',String(id),JSON.stringify({beforeHash:state.sourceHash,maxFloor:150}),JSON.stringify({receipt,floors:plan.floors})]);
    receipt.adminLogId=String(log.rows[0].id);
    await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[operationKey,JSON.stringify(receipt),now]);
    await verifyTower200(db);
    await db.query(dryRun?'ROLLBACK':'COMMIT');
    return {dryRun,replayed:false,receipt};
  } catch(error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
