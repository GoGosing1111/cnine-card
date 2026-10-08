import {regionEquipmentEffects,regionalEquipment,regionById} from '../shared/legion-regions-v1.mjs';
import {equipmentEffectText} from '../shared/equipment-growth-text-v1.mjs';
import {normalizedEquipmentEffects} from '../shared/equipment-combat-growth-v1.mjs';
import {POLISH_OPTIONS} from '../shared/equipment-polish-v1.mjs';
import {jointError} from './_joint_request.js';
export const polishUserPrefix=userId=>'equipment_polish_instance_v1:'+userId+':';
export const polishStateKey=(id,userId)=>polishUserPrefix(userId)+id;
export function decodePolishState(raw,instanceId,userId){
  if(raw==null)return {schemaVersion:1,instanceId:String(instanceId),userId:Number(userId),attempts:0,levels:[0,0,0,0,0],values:[0,0,0,0,0]};
  try{const s=JSON.parse(raw);if(s.schemaVersion!==1||String(s.instanceId)!==String(instanceId)||Number(s.userId)!==Number(userId)||!Number.isInteger(s.attempts)||s.attempts<0||s.attempts>100||!Array.isArray(s.levels)||s.levels.length!==5||s.levels.some(n=>!Number.isInteger(n)||n<0||n>100)||s.levels.reduce((a,b)=>a+b,0)!==s.attempts||!Array.isArray(s.values)||s.values.length!==5||s.values.some(n=>!Number.isFinite(n)||n<0||n>10000))throw Error('invalid');return s;}
  catch{throw jointError('POLISH_STATE_UNAVAILABLE','장비 연마 기록을 확인할 수 없습니다.',503);}
}
export async function equipmentGrowthRuntime(env,userId){
  // Exactly the equipped five ordinary slots, never the full instance inventory.
  const {results=[]}=await env.DB.prepare(`SELECT x.id,i.code,p.value FROM user_equipment_loadout l
    JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id
    JOIN character_equipment_items i ON i.id=x.equipment_id AND i.is_active=1
    LEFT JOIN app_meta p ON p.key=('equipment_polish_instance_v1:' || CAST(x.user_id AS TEXT) || ':' || CAST(x.id AS TEXT))
    WHERE l.user_id=? AND l.slot=i.slot AND i.slot<>'BATTLE_SUIT' ORDER BY i.slot LIMIT 5`).bind(userId).all();
  const runtime=regionEquipmentEffects(results.map(row=>row.code));
  const names=['attackPercent','criticalChancePoints','criticalDamagePoints','bossDamagePercent','penetrationPoints'];
  runtime.polished=[];
  for(const row of results){if(!row.value)continue;const state=decodePolishState(row.value,row.id,userId);if(!state.attempts)continue;runtime.polished.push({instanceId:String(row.id),attempts:state.attempts,levels:state.levels,values:state.values});for(let i=0;i<5;i++)runtime.effects[names[i]]=(runtime.effects[names[i]]||0)+state.values[i];}
  runtime.summary=equipmentEffectText(normalizedEquipmentEffects(runtime.effects));
  return runtime;
}
export async function attachPolishInventory(env,userId,items){
  if(!items.length)return items;
  const keys=items.map(item=>polishStateKey(item.instanceId,userId));
  const {results=[]}=await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all();
  const states=new Map(results.map(r=>[r.key,r.value]));
  return items.map(item=>{
    const gear=regionalEquipment(item.code||item.item?.code),region=gear?regionById(gear.regionId):null,polish=decodePolishState(states.get(polishStateKey(item.instanceId,userId)),item.instanceId,userId);
    return {...item,regionEquipment:gear?{...gear,two:equipmentEffectText(region.two),four:equipmentEffectText(region.four)}:null,polish,polishSummary:POLISH_OPTIONS.filter((o,i)=>polish.values[i]>0).map(o=>{const i=POLISH_OPTIONS.indexOf(o);return o.name+' +'+polish.values[i]+o.unit;}).join(' · ')};
  });
}
export async function restoredPolishStatements(db,userId,recordId){
  const row=await db.prepare(`SELECT d.original_instance_id,p.value FROM equipment_forge_destroyed_v1 d
    JOIN app_meta p ON p.key=('equipment_polish_instance_v1:' || CAST(d.user_id AS TEXT) || ':' || d.original_instance_id)
    WHERE d.record_id=? AND d.user_id=?`).bind(recordId,userId).first();
  if(!row)return [];
  const state=decodePolishState(row.value,row.original_instance_id,userId);
  const base=JSON.stringify({...state,instanceId:undefined}).slice(0,-1);
  // The existing restore transaction has already persisted its inserted ID.
  // Copy growth through that exact receipt, with no inventory scan or new roll.
  return [db.prepare(`INSERT INTO app_meta(key,value,updated_at)
    SELECT ? || restored_instance_id,? || ',"instanceId":"' || restored_instance_id || '"}',CURRENT_TIMESTAMP
    FROM equipment_forge_destroyed_v1 WHERE record_id=? AND user_id=? AND restored_instance_id IS NOT NULL
    ON CONFLICT(key) DO NOTHING`).bind(polishUserPrefix(userId),base,recordId,userId)];
}
