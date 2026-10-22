import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectTowerAbyss} from './tower-abyss-balance-20261022.mjs';

export const OPERATION_KEY='ops:tower-rewards:20261022:low10-high5-through100-v1';
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function buildRewardPlan(before){
 assert.equal(before.season.status,'ACTIVE');
 assert.equal(Number(before.season.max_floor),120);
 assert.equal(before.floors.length,0,'Unexpected fallback floor overrides');
 const ranges=[...before.ranges].sort((a,b)=>Number(a.start_floor)-Number(b.start_floor));
 assert.equal(ranges.length,120,'Expected exactly 120 active floors');
 return ranges.map((row,index)=>{
  const floor=index+1;
  assert.equal(Number(row.start_floor),floor,'Missing or overlapping tower floors');
  assert.equal(Number(row.end_floor),floor,'Expected individual floor rows');
  assert.equal(Number(row.is_active),1);
  const beforeCoin=Number(row.reward_coin);
  // The user's follow-up excludes floors 101-120. Floor 60 was not specified.
  const multiplier=floor<=59?10:floor>=61&&floor<=100?5:1;
  const coin=beforeCoin*multiplier;
  assert.ok(Number.isSafeInteger(beforeCoin)&&beforeCoin>0,'Invalid baseline coin');
  assert.ok(Number.isSafeInteger(coin)&&coin>0,'Unsafe reward coin');
  return {floor,rangeId:String(row.id),beforeCoin,coin,multiplier};
 });
}

export async function applyRewardBoost(db,{expectedHash,sourceCommit,liveProtocol,dryRun=false}={}){
 assert.match(expectedHash||'',/^[a-f0-9]{64}$/);
 assert.match(sourceCommit||'',/^[a-f0-9]{40}$/);
 assert.equal(liveProtocol,'TOWER_ABYSS_20261022');
 await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");
  await db.query("SET LOCAL statement_timeout='15s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(prior){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value)};}
  await db.query('LOCK TABLE tower_seasons,tower_floor_ranges,tower_floors IN SHARE ROW EXCLUSIVE MODE');
  const inspected=await inspectTowerAbyss(db);
  assert.equal(inspected.beforeHash,expectedHash,'Tower CMS changed after review');
  const before=inspected.before,plan=buildRewardPlan(before),changes=plan.filter(r=>r.multiplier!==1),now=new Date().toISOString();
  assert.equal(changes.length,99);
  const updated=await db.query(`UPDATE tower_floor_ranges AS r SET reward_coin=x.coin,updated_at=$2
   FROM jsonb_to_recordset($3::jsonb) AS x("rangeId" bigint,"beforeCoin" bigint,coin bigint)
   WHERE r.id=x."rangeId" AND r.season_id=$1 AND r.is_active=1 AND r.reward_coin=x."beforeCoin"`,[before.season.id,now,JSON.stringify(changes)]);
  assert.equal(updated.rowCount,99,'Not all reviewed reward rows were updated');
  const after=await inspectTowerAbyss(db);
  assert.deepEqual({...after.before,ranges:[]},{...before,ranges:[]},'Unrelated tower settings changed');
  assert.equal(after.before.ranges.length,before.ranges.length);
  for(let i=0;i<before.ranges.length;i++){
   const old=before.ranges[i],installed=after.before.ranges[i];
   assert.deepEqual({...installed,reward_coin:null},{...old,reward_coin:null},'Floor mechanics changed');
   assert.equal(Number(installed.reward_coin),plan.find(r=>r.rangeId===String(old.id)).coin);
  }
  const receipt={actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,status:'COMPLETED',completedAt:now,sourceCommit,seasonId:Number(before.season.id),beforeHash:expectedHash,afterHash:after.beforeHash,planHash:digest(plan),changedFloors:99,unchangedFloors:[60,...Array.from({length:20},(_,i)=>i+101)],previousTotalCoin:plan.reduce((n,r)=>n+r.beforeCoin,0),totalCoin:plan.reduce((n,r)=>n+r.coin,0),accountWrites:0,progressReset:false,retroactiveGrant:false,pendingBattleChanges:0};
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
  assert.ok(owner,'Missing operation audit owner');
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_TOWER_REWARDS_20261022','TOWER',String(before.season.id),JSON.stringify(before),JSON.stringify({...receipt,plan})])).rows[0];
  receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);
  await db.query(dryRun?'ROLLBACK':'COMMIT');
  return {dryRun,replayed:false,receipt,plan};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
