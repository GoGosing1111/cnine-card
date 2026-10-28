import {MERCENARY_EQUIPMENT_SLOTS as SLOTS,MERCENARY_EQUIPMENT_CODES as CODES,MERCENARY_EQUIPMENT_SQL_CODES as SQL_CODES,MERCENARY_EQUIPMENT_CATALOG,mercenaryEquipmentImage,mercenaryEquipmentDefinition,ASCENDANT_EQUIPMENT_SETS,ascendantEquipmentEffects} from '../shared/mercenary-equipment-v1.mjs';
import {LEGION_REGIONS} from '../shared/legion-regions-v1.mjs';
import {equipmentEffectText} from '../shared/equipment-growth-text-v1.mjs';
import {normalizedEquipmentEffects} from '../shared/equipment-combat-growth-v1.mjs';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {readForgeAdvancedForLevels} from './_equipment_forge_advanced.js';
import {FORGE_RUNTIME_RELEASE_ENABLED} from '../shared/equipment-forge-release-v1.mjs';
import {equipmentGrowthFromRows,decodePolishState} from './_equipment_growth.js';
import {equipmentEnhancementRows} from './_equipment_inventory.js';
import {mercenaryMode} from './_mercenary_loadout_modes.js';
import {jointError,readJointBody,jointResponseError} from './_joint_request.js';
import {runJointOperation} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {MERCENARY_DEPLOYMENT_RELEASE_ENABLED} from '../shared/mercenary-public-release-v2097.mjs';

export const mercenaryEquipmentKey=(id,mode)=>`mercenary_equipment_v1:${Number(id)}:${mercenaryMode(mode)}`;
const empty=()=>({schemaVersion:1,revision:0,slots:Object.fromEntries(SLOTS.map(slot=>[slot,null]))});
const validId=id=>typeof id==='string'&&/^[1-9][0-9]{0,17}$/.test(id);
function decode(raw){
  if(raw==null)return empty();
  try{
    const value=JSON.parse(raw);
    if(value.schemaVersion!==1||!Number.isSafeInteger(value.revision)||value.revision<0||value.revision>=2147483647||!value.slots||Object.keys(value.slots).length!==SLOTS.length||SLOTS.some(slot=>value.slots[slot]!==null&&!validId(value.slots[slot])))throw Error('invalid');
    return value;
  }catch{throw jointError('MERCENARY_EQUIPMENT_STATE','용병 장비 저장 정보를 확인할 수 없습니다.',503);}
}
export async function readMercenaryEquipmentRecords(env,userIds){
  const ids=[...new Set(userIds.map(Number))];
  if(ids.some(id=>!Number.isSafeInteger(id)||id<1)||ids.length>200)throw jointError('MERCENARY_EQUIPMENT_USERS','계정 범위를 확인하세요.');
  if(!ids.length)return new Map();
  const keys=ids.flatMap(id=>['PVE','PVP'].map(mode=>mercenaryEquipmentKey(id,mode)));
  const rows=(await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all()).results;
  const saved=new Map(rows.map(row=>[row.key,row.value]));
  return new Map(ids.map(id=>[id,Object.fromEntries(['PVE','PVP'].map(mode=>{const key=mercenaryEquipmentKey(id,mode),raw=saved.get(key)??null;return [mode,{key,raw,...decode(raw)}];}))]));
}
function gearItem(row,userId,advanced=null){
  const gear=mercenaryEquipmentDefinition(row.code),level=Number(row.enhancement?.level??row.level??0);
  const power=row.enhancement?{total:Number(row.total_power),pve:Number(row.pve_power),pvp:Number(row.pvp_power)}:level&&FORGE_RUNTIME_RELEASE_ENABLED?forgePower(Number(row.total_power),level,advanced):{total:Number(row.total_power),pve:Number(row.pve_power),pvp:Number(row.pvp_power)};
  return {instanceId:String(row.instance_id??row.id),equipmentId:Number(row.equipment_id),code:row.code,name:row.name,slot:row.slot,rarity:row.rarity,image:mercenaryEquipmentImage(row.code),regionId:gear.regionId,setId:gear.setId,kind:gear.kind,level,totalPower:power.total,pvePower:power.pve,pvpPower:power.pvp,polish:decodePolishState(row.value,row.instance_id??row.id,userId)};
}
export async function mercenaryEquipmentRuntimes(env,userIds,mode='PVE',{records}={}){
  mode=mercenaryMode(mode);records??=await readMercenaryEquipmentRecords(env,userIds);
  const selected=[...records].flatMap(([userId,modes])=>SLOTS.filter(slot=>modes[mode].slots[slot]).map(slot=>[userId,slot,modes[mode].slots[slot]]));
  const rows=selected.length?(await env.DB.prepare(`WITH selected(user_id,slot,instance_id) AS (VALUES ${selected.map(()=>'(CAST(? AS BIGINT),CAST(? AS TEXT),CAST(? AS BIGINT))').join(',')})
    SELECT x.user_id,x.id AS instance_id,x.equipment_id,i.code,i.name,i.slot,i.rarity,i.total_power,i.pve_power,i.pvp_power,COALESCE(s.level,0) AS level,p.value
    FROM selected l JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id
    JOIN character_equipment_items i ON i.id=x.equipment_id AND i.slot=l.slot AND i.is_active=1 AND i.is_public=1
    LEFT JOIN equipment_forge_states_v1 s ON s.instance_id=x.id AND s.user_id=x.user_id
    LEFT JOIN app_meta p ON p.key=('equipment_polish_instance_v1:' || CAST(x.user_id AS TEXT) || ':' || CAST(x.id AS TEXT))
    WHERE i.code IN (${SQL_CODES})`).bind(...selected.flat()).all()).results:[];
  const advanced=await readForgeAdvancedForLevels(env.DB,rows);
  return new Map([...records].map(([id,modes])=>{
    const owned=rows.filter(row=>Number(row.user_id)===id),items=owned.map(row=>gearItem(row,id,advanced));
    const growth=equipmentGrowthFromRows(owned.map(row=>({...row,id:row.instance_id})),id);
    const pvp=ascendantEquipmentEffects(owned.map(row=>row.code),'PVP');
    return [id,{schemaVersion:1,mode,revision:modes[mode].revision,power:items.reduce((sum,item)=>sum+item[mode==='PVE'?'pvePower':'pvpPower'],0),items,
      effects:mode==='PVE'?growth.effects:pvp.effects,sets:mode==='PVE'?growth.sets:pvp.sets,uniques:mode==='PVE'?growth.uniques:[],summary:mode==='PVE'?growth.summary:equipmentEffectText(normalizedEquipmentEffects(pvp.effects)),effectsMode:mode}];
  }));
}
export async function attachMercenaryEquipment(env,snapshots,mode){
  if(!snapshots.size)return snapshots;
  const equipment=await mercenaryEquipmentRuntimes(env,[...snapshots.keys()],mode);
  return new Map([...snapshots].map(([id,snapshot])=>[id,equipment.get(id)?.items.length?{...snapshot,equipment:equipment.get(id)}:snapshot]));
}
export async function mercenaryEquipmentState(env,user){
  const records=await readMercenaryEquipmentRecords(env,[user.id]);
  const [pve,pvp,inventory,catalog]=await Promise.all([
    mercenaryEquipmentRuntimes(env,[user.id],'PVE',{records}),mercenaryEquipmentRuntimes(env,[user.id],'PVP',{records}),
    env.DB.prepare(`SELECT x.id AS instance_id,x.equipment_id,x.source_type,x.source_id,x.acquired_at,NULL AS quantity,i.*
      FROM character_equipment_items i JOIN user_equipment_instances x ON x.id=(SELECT b.id FROM user_equipment_instances b WHERE b.user_id=? AND b.equipment_id=i.id ORDER BY b.id DESC LIMIT 1)
      WHERE i.code IN (${SQL_CODES}) AND i.is_active=1 AND i.is_public=1`).bind(user.id).all(),
    env.DB.prepare(`SELECT code,is_active,is_public FROM character_equipment_items WHERE code IN (${SQL_CODES})`).all()
  ]);
  const rows=await equipmentEnhancementRows(env,user.id,inventory.results,{allowedCodes:CODES});
  const keys=rows.map(row=>`equipment_polish_instance_v1:${user.id}:${row.instance_id}`);
  const polish=keys.length?(await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all()).results:[];
  const saved=new Map(polish.map(row=>[row.key,row.value]));
  const items=new Map(rows.filter(row=>mercenaryEquipmentDefinition(row.code)).map(row=>{const item=gearItem({...row,equipment_id:row.equipment_id??row.id,value:saved.get(`equipment_polish_instance_v1:${user.id}:${row.instance_id}`)},user.id);return [item.instanceId,item];}));
  const loadouts={PVE:pve.get(Number(user.id)),PVP:pvp.get(Number(user.id))};
  for(const mode of ['PVE','PVP'])for(const item of loadouts[mode].items)items.set(item.instanceId,item);
  const visible=new Map(catalog.results.filter(item=>user.role==='OWNER'||Number(item.is_public)===1&&Number(item.is_active)===1).map(item=>[item.code,item]));
  const regions=[...LEGION_REGIONS.map(({id,name,accent,setName,two,four})=>({id,name,accent,setName,two,four,modes:['PVE']})),...ASCENDANT_EQUIPMENT_SETS.filter(set=>MERCENARY_EQUIPMENT_CATALOG.some(item=>item.setId===set.setId&&visible.has(item.code))).map(({id,name,accent,setName,tier,two,four,five,modes})=>({id,name,accent,setName,tier,two,four,five,modes}))];
  return {accountId:Number(user.id),loadouts,items:[...items.values()],catalog:MERCENARY_EQUIPMENT_CATALOG.filter(item=>visible.has(item.code)).map(item=>({...item,available:Number(visible.get(item.code).is_public)===1&&Number(visible.get(item.code).is_active)===1,image:mercenaryEquipmentImage(item.code)})),regions,slots:SLOTS};
}
export async function saveMercenaryEquipment(env,user,body){
  const mode=mercenaryMode(body.mode),slot=body.slot,instanceId=body.instanceId;
  if(!SLOTS.includes(slot)||instanceId!==null&&!validId(instanceId)||!Number.isSafeInteger(body.revision)||body.revision<0)throw jointError('MERCENARY_EQUIPMENT_INPUT','장비 부위와 보유 장비를 확인하세요.');
  const result=await runJointOperation(env,user,{requestId:body.requestId,kind:'MERCENARY_EQUIPMENT',input:{mode,slot,instanceId,revision:body.revision},prepare:async()=>{
    const record=(await readMercenaryEquipmentRecords(env,[user.id])).get(Number(user.id))[mode];
    if(record.revision!==body.revision)throw jointError('MERCENARY_EQUIPMENT_CONFLICT','다른 창에서 장비를 변경했습니다. 새로고침 후 다시 선택하세요.',409);
    if(instanceId){const owned=await env.DB.prepare(`SELECT x.id FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.id=? AND x.user_id=? AND i.slot=? AND i.code IN (${SQL_CODES}) AND i.is_active=1 AND i.is_public=1`).bind(instanceId,user.id,slot).first();if(!owned)throw jointError('MERCENARY_EQUIPMENT_OWNERSHIP','사용 가능한 보유 용병 장비만 장착할 수 있습니다.',403);}
    return {key:record.key,before:record.raw,next:{schemaVersion:1,revision:record.revision+1,slots:{...record.slots,[slot]:instanceId}},mode,slot,instanceId};
  },statements:async plan=>{
    const DB=env.DB,token=crypto.randomUUID(),same=plan.before===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
    const current=await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(plan.key).first();
    if((current?.value??null)!==plan.before){const error=jointError('MERCENARY_EQUIPMENT_CONFLICT','장비 구성이 변경됐습니다. 새로고침해 주세요.',409);error.terminal=true;throw error;}
    const list=[jointGuard(DB,token,same,plan.before===null?[plan.key]:[plan.key,plan.before])];
    if(plan.instanceId)list.push(DB.prepare(`UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.id=? AND x.user_id=? AND i.slot=? AND i.code IN (${SQL_CODES}) AND i.is_active=1 AND i.is_public=1) THEN 1 ELSE 0 END WHERE token=?`).bind(plan.instanceId,user.id,plan.slot,token));
    list.push(DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(plan.key,JSON.stringify(plan.next)));
    // Invalidate existing ranked-duo profile versions without changing either mercenary selection.
    list.push(DB.prepare('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(?,NULL,0,?) ON CONFLICT(user_id) DO UPDATE SET updated_at=excluded.updated_at').bind(user.id,new Date().toISOString()),jointGuardEnd(DB,token));
    return list;
  }});
  return {requestId:result.requestId,replayed:result.replayed,mode,revision:result.plan.next.revision};
}
export async function handleMercenaryEquipment({path,request,env,deps}){
  if(path!=='mercenaries/v3/equipment')return null;
  try{
    const user=await deps.authenticate(request,env);if(!user)throw jointError('MERCENARY_AUTH','로그인이 필요합니다.',401);
    if(!MERCENARY_DEPLOYMENT_RELEASE_ENABLED)throw jointError('MERCENARY_EQUIPMENT_DISABLED','용병 장비를 준비 중입니다.',423);
    if(request.method==='GET')return deps.json(await mercenaryEquipmentState(env,user));
    if(request.method!=='POST')throw jointError('MERCENARY_METHOD','지원하지 않는 요청입니다.',405);
    const body=await readJointBody(request,{fields:['requestId','mode','slot','instanceId','revision']});
    if(typeof deps.withUserMutationLock!=='function')throw jointError('MERCENARY_LOCK','계정 잠금 서비스를 확인하세요.',503);
    return deps.json(await deps.withUserMutationLock(env,user.id,path,()=>saveMercenaryEquipment(env,user,body)));
  }catch(error){return jointResponseError(error,deps.json);}
}
