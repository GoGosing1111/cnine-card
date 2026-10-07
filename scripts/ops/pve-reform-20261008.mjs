import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PVE_REFORM_VERSION,SCRAPYARD_REFORM_DIFFICULTIES,COW_REFORM_REWARDS,reformTowerPower,reformTowerReward} from '../../shared/pve-reform-20261008.mjs';
export const OPERATION_KEY='ops:pve-reform:20261008:v1';
export const MIGRATION_KEY=OPERATION_KEY+':portal-rate';
const META_KEYS=['expedition_v3_cow_room','scrapyard_settings_v1676'];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const receipt=async(c,key)=>{const row=(await c.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0];return row?JSON.parse(row.value):null;};
const saveReceipt=(c,key,value)=>c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[key,JSON.stringify(value),value.completedAt]);
export async function migratePortalRate(c){
  await c.query('BEGIN');
  try{
    await c.query("SET LOCAL lock_timeout='3s'");await c.query("SET LOCAL statement_timeout='90s'");
    await c.query('SELECT pg_advisory_xact_lock(20261008,1)');
    const previous=await receipt(c,MIGRATION_KEY);
    const type=(await c.query("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='cow_room_portal_rolls_v1' AND column_name='rate_percent'")).rows[0]?.data_type;
    if(previous){assert.ok(['real','double precision'].includes(type));await c.query('COMMIT');return previous;}
    assert.ok(['bigint','integer','real','double precision'].includes(type),'Unexpected portal rate column');
    if(!['real','double precision'].includes(type))await c.query('ALTER TABLE cow_room_portal_rolls_v1 ALTER COLUMN rate_percent TYPE DOUBLE PRECISION USING rate_percent::double precision');
    const result={operationKey:MIGRATION_KEY,status:'COMPLETED',beforeType:type,afterType:'double precision',reason:'User-approved 0.5 percent portal discovery',completedAt:new Date().toISOString()};
    await saveReceipt(c,MIGRATION_KEY,result);await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK');throw e;}
}
export async function inspectReform(c){
  const meta=(await c.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[META_KEYS])).rows;
  const season=(await c.query("SELECT * FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.ok(season,'Active tower season missing');
  const ranges=(await c.query('SELECT * FROM tower_floor_ranges WHERE season_id=$1 AND is_active=1 ORDER BY start_floor,id',[season.id])).rows;
  const floors=(await c.query('SELECT * FROM tower_floors WHERE season_id=$1 AND is_active=1 ORDER BY floor_no,id',[season.id])).rows;
  const bindings=(await c.query("SELECT * FROM unified_drop_bindings_v1667 WHERE source_type='SCRAPYARD' ORDER BY id")).rows;
  const before={meta,season,ranges,floors,bindings};
  return {before,beforeSha256:digest(before),receipt:await receipt(c,OPERATION_KEY)};
}
export function buildReformPlan(before){
  const meta=Object.fromEntries(before.meta.map(row=>[row.key,JSON.parse(row.value)])),cow=meta[META_KEYS[0]],scrap=meta[META_KEYS[1]];
  assert.equal(cow.mode,'ON');assert.equal(cow.approved,true);assert.equal(cow.dailyRuns,6);assert.equal(cow.entryCoin,250000);assert.deepEqual(cow.clearCoin,[500000000]);
  assert.equal(scrap.mode,'ON');assert.equal(scrap.dailyRuns,30);assert.deepEqual(scrap.difficulties.map(d=>[d.id,d.clearCoin]),[['OUTER',10000000],['CORE',20000000],['FURNACE',40000000]]);
  assert.equal(Math.max(...before.ranges.map(r=>Number(r.end_floor)),...before.floors.map(r=>Number(r.floor_no))),70,'Reform expects the existing 70-floor tower');
  const current=floor=>before.ranges.filter(r=>Number(r.start_floor)<=floor&&Number(r.end_floor)>=floor).sort((a,b)=>(Number(a.end_floor)-Number(a.start_floor))-(Number(b.end_floor)-Number(b.start_floor))||Number(b.id)-Number(a.id))[0];
  const rows=Array.from({length:100},(_,i)=>{
    const floor=i+1,old=current(Math.min(floor,70));assert.ok(old,'Existing tower floor missing');
    return {floor,monsterId:Number(floor<=70?old.monster_id:floor%10===0?current(70).monster_id:current(69).monster_id),power:reformTowerPower(floor,Number(old.power_override)),coin:reformTowerReward(floor,Number(old.reward_coin)),boss:floor<=70?Number(old.is_boss):Number(floor%10===0)};
  });
  assert.equal(rows.reduce((n,r)=>n+r.coin,0),99950000000,'Unexpected tower baseline rewards');
  assert.ok(rows.every(r=>Number.isSafeInteger(r.power)&&r.power>0));
  return {cow:{...cow,revision:cow.revision+1,version:PVE_REFORM_VERSION,clearCoin:[...COW_REFORM_REWARDS],dailyCoinCap:18000000000},scrap:{...scrap,difficulties:SCRAPYARD_REFORM_DIFFICULTIES.map(d=>({...d}))},tower:rows};
}
function assertProof(proof){
  assert.equal(proof?.origin,'https://cnine-card.pages.dev');assert.equal(proof?.version,PVE_REFORM_VERSION);
  assert.equal(proof?.runtimeMatchesCommittedBuild,true);assert.equal(proof?.portalRatePercent,0.5);
  assert.match(proof?.commit||'',/^[a-f0-9]{40}$/);assert.match(proof?.beforeSha256||'',/^[a-f0-9]{64}$/);
  const age=Date.now()-Date.parse(proof.checkedAt);assert.ok(age>=0&&age<600000,'Fresh runtime and database proof required');
}
export async function activateReform(c,proof){
  assertProof(proof);await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
    await c.query("SET LOCAL statement_timeout='30s'");await c.query("SET LOCAL lock_timeout='3s'");
    await c.query('SELECT pg_advisory_xact_lock(20261008,2)');
    const previous=await receipt(c,OPERATION_KEY);if(previous){assert.equal(previous.status,'COMPLETED');await c.query('COMMIT');return {replayed:true,receipt:previous};}
    assert.equal((await receipt(c,MIGRATION_KEY))?.status,'COMPLETED','Portal precision migration must precede runtime deployment');
    await c.query('LOCK TABLE tower_floor_ranges,tower_floors,tower_seasons,unified_drop_bindings_v1667,cow_room_portal_rolls_v1 IN SHARE ROW EXCLUSIVE MODE');
    await c.query('SELECT key FROM app_meta WHERE key=ANY($1::text[]) FOR UPDATE',[META_KEYS]);
    const {before,beforeSha256}=await inspectReform(c);assert.equal(beforeSha256,proof.beforeSha256,'CMS changed after preview');
    const plan=buildReformPlan(before),owner=(await c.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert.ok(owner);
    const monsters=(await c.query('SELECT id FROM battle_monsters WHERE id=ANY($1::bigint[]) AND is_active=1 AND tower_enabled=1',[[...new Set(plan.tower.map(r=>r.monsterId))]])).rows;
    assert.equal(monsters.length,new Set(plan.tower.map(r=>r.monsterId)).size,'Tower art/monster unavailable');
    const now=new Date().toISOString();Object.assign(plan.cow,{updatedBy:Number(owner.id),updatedAt:now});
    for(const [key,value] of [[META_KEYS[0],plan.cow],[META_KEYS[1],plan.scrap]])assert.equal((await c.query('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 RETURNING key',[key,JSON.stringify(value),now])).rows.length,1);
    await c.query('UPDATE tower_floor_ranges SET is_active=0,updated_at=$2 WHERE season_id=$1 AND is_active=1',[before.season.id,now]);
    // Keep legacy floor records as history, preventing a fallback to old rewards.
    await c.query('UPDATE tower_floors SET is_active=0,updated_at=$2 WHERE season_id=$1 AND is_active=1',[before.season.id,now]);
    const installed=[];for(const row of plan.tower)installed.push((await c.query('INSERT INTO tower_floor_ranges(season_id,monster_id,start_floor,end_floor,power_override,reward_coin,is_boss,is_active,created_at,updated_at) VALUES($1,$2,$3,$3,$4,$5,$6,1,$7,$7) RETURNING id',[before.season.id,row.monsterId,row.floor,row.power,row.coin,row.boss,now])).rows[0].id);
    await c.query('UPDATE tower_seasons SET max_floor=100,updated_at=$2 WHERE id=$1',[before.season.id,now]);
    const furnace=before.bindings.filter(b=>b.source_id==='FURNACE'&&b.trigger_type==='CLEAR');assert.equal(furnace.length,1);assert.equal(Number(furnace[0].is_enabled),1);
    for(const id of ['FURNACE_ELITE','FURNACE_ABYSS'])await c.query("INSERT INTO unified_drop_bindings_v1667(source_type,source_id,trigger_type,pool_id,priority,is_enabled,created_at,updated_at) VALUES('SCRAPYARD',$1,'CLEAR',$2,$3,1,$4,$4)",[id,furnace[0].pool_id,furnace[0].priority,now]);
    // The table lock provides one atomic cutover. Old OPEN portals expire; used
    // portals and their in-flight/completed receipts are untouched. New inserts
    // wait until commit and remain usable. Replay cannot clear new portals.
    const expired=(await c.query("UPDATE cow_room_portal_rolls_v1 SET state='MISSED' WHERE state='OPEN' RETURNING id,user_id")).rows;
    const result={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:['그래 니 제안대로 수정해','입장권 드랍률 0.5로 낮춰'],before,plan,proof,towerRangeIds:installed,portalReset:{count:expired.length,users:new Set(expired.map(r=>String(r.user_id))).size,ids:expired.map(r=>r.id),preservedStates:['CONSUMED'],cutover:now},towerProgressReset:false,retroactiveRewards:false,completedAt:now};
    const audit=(await c.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'PVE_REFORM','SETTINGS',$2,$3,$4,$5) RETURNING id",[owner.id,OPERATION_KEY,JSON.stringify(before),JSON.stringify(result),now])).rows[0];assert.ok(audit);result.adminLogId=String(audit.id);
    await saveReceipt(c,OPERATION_KEY,result);await c.query('COMMIT');return {replayed:false,receipt:result};
  }catch(e){await c.query('ROLLBACK');throw e;}
}
