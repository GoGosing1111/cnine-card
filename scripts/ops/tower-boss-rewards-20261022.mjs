import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectTowerAbyss} from './tower-abyss-balance-20261022.mjs';

export const OPERATION_KEY='ops:tower-boss-rewards:20261022:110-3t-120-4t-v1';
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function buildBossRewardPlan(before){
 assert.equal(before.season.status,'ACTIVE');assert.equal(Number(before.season.max_floor),120);
 assert.equal(before.floors.length,0,'Unexpected fallback floor overrides');
 const ranges=[...before.ranges].sort((a,b)=>Number(a.start_floor)-Number(b.start_floor));
 assert.equal(ranges.length,120,'Expected exactly 120 active floors');
 const plan=ranges.map((r,index)=>{
  const floor=index+1,beforeCoin=Number(r.reward_coin);
  assert.equal(Number(r.start_floor),floor,'Missing or overlapping floor');assert.equal(Number(r.end_floor),floor);assert.equal(Number(r.is_active),1);
  assert.ok(Number.isSafeInteger(beforeCoin)&&beforeCoin>0,'Invalid baseline reward');
  const coin=floor===110?3000000000000:floor===120?4000000000000:beforeCoin;
  return {floor,rangeId:String(r.id),beforeCoin,coin};
 });
 assert.ok(plan[99].coin<plan[109].coin&&plan[109].coin<plan[119].coin,'Rewards must increase from floor 100 to 110 to 120');
 assert.ok([109,119].every(i=>plan[i].coin>plan[i].beforeCoin),'Boss rewards must increase');
 return plan;
}

export async function applyBossRewards(db,{expectedHash,sourceCommit,liveProtocol,dryRun=false}={}){
 assert.match(expectedHash||'',/^[a-f0-9]{64}$/);assert.match(sourceCommit||'',/^[a-f0-9]{40}$/);assert.equal(liveProtocol,'TOWER_ABYSS_20261022');
 await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='15s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(prior){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value)};}
  await db.query('LOCK TABLE tower_seasons,tower_floor_ranges,tower_floors IN SHARE ROW EXCLUSIVE MODE');
  const inspected=await inspectTowerAbyss(db);assert.equal(inspected.beforeHash,expectedHash,'Tower CMS changed after review');
  const before=inspected.before,plan=buildBossRewardPlan(before),changes=plan.filter(r=>r.coin!==r.beforeCoin),now=new Date().toISOString();
  assert.deepEqual(changes.map(r=>r.floor),[110,120]);
  const updated=await db.query(`UPDATE tower_floor_ranges AS r SET reward_coin=x.coin,updated_at=$2
   FROM jsonb_to_recordset($3::jsonb) AS x("rangeId" bigint,"beforeCoin" bigint,coin bigint)
   WHERE r.id=x."rangeId" AND r.season_id=$1 AND r.is_active=1 AND r.reward_coin=x."beforeCoin"`,[before.season.id,now,JSON.stringify(changes)]);
  assert.equal(updated.rowCount,2);
  const after=await inspectTowerAbyss(db);assert.deepEqual({...after.before,ranges:[]},{...before,ranges:[]});assert.equal(after.before.ranges.length,120);
  for(let i=0;i<before.ranges.length;i++){
   const old=before.ranges[i],installed=after.before.ranges[i];
   assert.deepEqual({...installed,reward_coin:null},{...old,reward_coin:null},'Floor mechanics changed');
   assert.equal(Number(installed.reward_coin),plan.find(r=>r.rangeId===String(old.id)).coin);
  }
  const receipt={actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,status:'COMPLETED',completedAt:now,sourceCommit,seasonId:Number(before.season.id),beforeHash:expectedHash,afterHash:after.beforeHash,planHash:digest(plan),changedFloors:[110,120],unchangedFloorCount:118,previousTotalCoin:plan.reduce((n,r)=>n+r.beforeCoin,0),totalCoin:plan.reduce((n,r)=>n+r.coin,0),accountWrites:0,progressReset:false,retroactiveGrant:false,pendingBattleChanges:0};
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert.ok(owner);
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_TOWER_BOSS_REWARDS_20261022','TOWER',String(before.season.id),JSON.stringify(before),JSON.stringify({...receipt,plan})])).rows[0];
  receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt,plan};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
