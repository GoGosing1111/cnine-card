// Operator-only release. Private drop targets are supplied out of band.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ASCENDANT_EQUIPMENT} from '../../shared/mercenary-ascendant-equipment-v1.mjs';
import {REGION_EQUIPMENT,LEGION_REGIONS_KEY} from '../../shared/legion-regions-v1.mjs';
import {LEGION_HUNT_SETTINGS_KEY} from '../../functions/_legion_hunt_settings.js';
import {validateRegionPolicy} from '../../functions/_legion_regions.js';
export const OPERATION_KEY='ops:legion-equipment-release:20261029:v1';
export const SETTINGS_KEYS=[LEGION_REGIONS_KEY,LEGION_HUNT_SETTINGS_KEY,'equipment_polish_settings_v1'];
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export async function readReleaseState(db){
 const settings=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[SETTINGS_KEYS])).rows;
 const gear=(await db.query('SELECT * FROM character_equipment_items ORDER BY code')).rows;
 return {settings,gear};
}
export function releasePolicy(original,{baseExpectedRuns,tierExpectedRuns}){
 assert.ok(Number.isSafeInteger(baseExpectedRuns)&&baseExpectedRuns>1);
 assert.equal(tierExpectedRuns?.length,10);
 assert.ok(tierExpectedRuns.every((n,i)=>Number.isSafeInteger(n)&&n>baseExpectedRuns&&(!i||n>tierExpectedRuns[i-1])));
 const next=validateRegionPolicy(original);assert.equal(next.mode,'ON');
 assert.ok(!next.ascendantDrops,'Already configured: inspect before changing');
 for(const d of next.difficulties){
  const before=d.loot,ratio=before.bossSetPercent/before.bossUniquePercent;
  assert.ok(Number.isFinite(ratio)&&ratio>0,'Both existing boss equipment rolls must be positive');
  // Preserve set:unique weighting, solve the independent-roll union, round only
  // to the established CMS precision. Existing elite rolls (including zero) stay.
  const target=1/baseExpectedRuns;
  const unique=2*target/(ratio+1+Math.sqrt((ratio+1)**2-4*ratio*target));
  const setPercent=Number((unique*ratio*100).toFixed(4)),uniquePercent=Number((unique*100).toFixed(4));
  assert.ok(setPercent>=before.bossSetPercent&&uniquePercent>=before.bossUniquePercent,'Do not lower a newer operator setting');
  Object.assign(before,{bossSetPercent:setPercent,bossUniquePercent:uniquePercent});
  const interval=1/(1-(1-setPercent/100)*(1-uniquePercent/100));
  assert.ok(Math.abs(interval-baseExpectedRuns)/baseExpectedRuns<.002);
 }
 next.ascendantDrops={enabled:true,tiers:tierExpectedRuns.map((expectedRuns,i)=>({tier:i+1,expectedRuns}))};
 next.revision++;return validateRegionPolicy(next);
}
function receiptValid(r){assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.status,'COMPLETED');assert.equal(r.created.length,50);assert.ok(r.auditId);}
export async function applyEquipmentRelease(db,{config,expectedSettings,releaseCommit,dryRun=true,failAfterCatalog=false}={}){
 const replay=async()=>{const r=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];if(!r)return null;const receipt=JSON.parse(r.value);receiptValid(receipt);return {replayed:true,receipt};};
 const saved=await replay();if(saved)return saved;
 assert.match(releaseCommit||'',/^[a-f0-9]{40}$/);
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='20s'");
  const identity=(await db.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];assert.equal(identity.db,'cnine');assert.equal(identity.recovery,false);
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const again=await replay();if(again){await db.query('ROLLBACK');return again;}
  await db.query('LOCK TABLE character_equipment_items IN SHARE ROW EXCLUSIVE MODE');
  await db.query('SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[SETTINGS_KEYS]);
  const before=await readReleaseState(db);assert.deepEqual(before.settings,expectedSettings,'Operator settings changed after preflight');
  const oldRaw=before.settings.find(s=>s.key===LEGION_REGIONS_KEY)?.value;assert.ok(oldRaw);
  const oldPolicy=JSON.parse(oldRaw),next=releasePolicy(oldPolicy,config),raw=JSON.stringify(next);
  const oldGear=before.gear.filter(g=>REGION_EQUIPMENT.some(i=>i.code===g.code));assert.equal(oldGear.length,30);
  assert.ok(oldGear.every(g=>Number(g.is_active)===1&&Number(g.is_public)===1));
  assert.ok(!before.gear.some(g=>ASCENDANT_EQUIPMENT.some(i=>i.code===g.code)),'New gear already registered');
  const refs=new Set(oldGear.map(g=>String(g.id)));
  const base=JSON.parse(before.settings.find(s=>s.key===LEGION_HUNT_SETTINGS_KEY).value);
  for(const pool of [base,...oldPolicy.regions.map(r=>r.fieldDrops).filter(Boolean)])assert.ok(!pool.items.some(i=>i.enabled&&i.type==='EQUIPMENT'&&refs.has(String(i.ref))),'Unexpected independent equipment pool');
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner);
  let id=BigInt((await db.query('SELECT COALESCE(MAX(id),0)::text id FROM character_equipment_items')).rows[0].id);
  const created=[];
  for(const [i,item]of ASCENDANT_EQUIPMENT.entries()){
   const row=(await db.query(`INSERT INTO character_equipment_items(id,code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,1,$12,0,0) RETURNING *`,
    [String(++id),item.code,item.name,item.slot,item.slot==='WEAPON'?'RIFLE':'',item.rarity,item.image,item.description,item.totalPower,item.pvePower,item.pvpPower,3000+i])).rows;
   assert.equal(row.length,1);created.push(row[0]);
  }
  if(failAfterCatalog)throw Error('INJECTED_CATALOG_FAILURE');
  assert.equal((await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3 RETURNING key',[raw,LEGION_REGIONS_KEY,oldRaw])).rows.length,1);
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',at:new Date().toISOString(),releaseCommit,created,config,beforePolicy:oldPolicy,afterPolicy:next,beforeSha256:digest(oldRaw),afterSha256:digest(raw),existingGearSha256:digest(before.gear),accountGrants:0,messagesSent:0};
  const audit=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'LEGION_EQUIPMENT_RELEASE','APP_META',$2,$3,$4) RETURNING id",[owner.id,OPERATION_KEY,JSON.stringify({policy:oldPolicy}),JSON.stringify({authorization:'군단토벌 기존 용병장비 드랍 상향 및 준비된 1~10단계 라이브 반영; 단계별 기대값 사용자 확인',policy:next,created,releaseCommit,operationKey:OPERATION_KEY})])).rows;
  assert.equal(audit.length,1);receipt.auditId=String(audit[0].id);receiptValid(receipt);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  const after=await readReleaseState(db);
  assert.deepEqual(after.gear.filter(g=>!ASCENDANT_EQUIPMENT.some(i=>i.code===g.code)),before.gear);
  assert.deepEqual(after.settings.filter(s=>s.key!==LEGION_REGIONS_KEY),before.settings.filter(s=>s.key!==LEGION_REGIONS_KEY));
  assert.equal(after.settings.find(s=>s.key===LEGION_REGIONS_KEY).value,raw);
  assert.equal(after.gear.length,before.gear.length+50);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {replayed:false,dryRun,receipt};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
