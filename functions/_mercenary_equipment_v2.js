import {LOAN_CODES, PLAYABLE_MERCENARIES} from './_comeback_loans.js';
import {MERCENARY_EQUIPMENT_SLOTS as SLOTS,MERCENARY_EQUIPMENT_SQL_CODES as SQL_CODES,MERCENARY_EQUIPMENT_CATALOG,mercenaryEquipmentImage,mercenaryEquipmentDefinition,ASCENDANT_EQUIPMENT_SETS,ascendantEquipmentEffects} from '../shared/mercenary-equipment-v1.mjs';
import {LEGION_REGIONS} from '../shared/legion-regions-v1.mjs';
import {equipmentEffectText} from '../shared/equipment-growth-text-v1.mjs';
import {normalizedEquipmentEffects,addIndividualEquipmentEffects} from '../shared/equipment-combat-growth-v1.mjs';
import {individualMercenaryBonuses} from '../shared/mercenary-unique-equipment-v1.mjs';
import {mercenaryEquipmentPolishEffects} from '../shared/mercenary-equipment-v1.mjs';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {readForgeAdvancedForLevels} from './_equipment_forge_advanced.js';
import {FORGE_RUNTIME_RELEASE_ENABLED} from '../shared/equipment-forge-release-v1.mjs';
import {equipmentGrowthFromRows,decodePolishState} from './_equipment_growth.js';
import {mercenaryMode,readMercenaryModes,mercenaryModeGuard} from './_mercenary_loadout_modes.js';
import {jointError,readJointBody,jointResponseError} from './_joint_request.js';
import {runJointOperation} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {MERCENARY_DEPLOYMENT_RELEASE_ENABLED} from '../shared/mercenary-public-release-v2097.mjs';
import {equipmentSlots,equipmentInstanceId,equipmentMercenaryCode,validateEquipmentState,legacyEquipmentToV2,changeEquipment} from './_mercenary_equipment_model.js';
import {mercenaryModeAllowed,MERCENARY_PVE_ONLY_REASON} from '../shared/mercenary-eunseol-v1.mjs';

export const mercenaryEquipmentKey=(id,mode)=>`mercenary_equipment_v1:${Number(id)}:${mercenaryMode(mode)}`;
export const mercenaryEquipmentV2Key=id=>`mercenary_equipment_v2:${Number(id)}`;
function decodeLegacy(raw){
 if(raw==null)return {schemaVersion:1,revision:0,slots:equipmentSlots()};
 const v=JSON.parse(raw);if(v.schemaVersion!==1||!Number.isSafeInteger(v.revision)||v.revision<0||!v.slots||Object.keys(v.slots).length!==SLOTS.length||SLOTS.some(s=>v.slots[s]!==null&&!equipmentInstanceId(v.slots[s])))throw Error('legacy');return v;
}
export async function readMercenaryEquipmentRecords(env,userIds){
 const ids=[...new Set(userIds.map(Number))];if(ids.some(id=>!Number.isSafeInteger(id)||id<1)||ids.length>200)throw jointError('MERCENARY_EQUIPMENT_USERS','계정 범위를 확인하세요.');if(!ids.length)return new Map();
 const keys=ids.flatMap(id=>[mercenaryEquipmentV2Key(id),...['PVE','PVP'].map(m=>mercenaryEquipmentKey(id,m))]);
 const [rows,selections]=await Promise.all([env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all(),readMercenaryModes(env,ids)]),saved=new Map(rows.results.map(r=>[r.key,r.value]));
 try{return new Map(ids.map(id=>{
  const key=mercenaryEquipmentV2Key(id),raw=saved.get(key)??null,selection=selections.get(id),legacy=Object.fromEntries(['PVE','PVP'].map(mode=>{const key=mercenaryEquipmentKey(id,mode),raw=saved.get(key)??null;return [mode,{key,raw,...decodeLegacy(raw)}];}));
  const state=raw===null?legacyEquipmentToV2(legacy,selection.loadouts):validateEquipmentState(JSON.parse(raw));
  return [id,{key,raw,state,legacy,selection,...Object.fromEntries(['PVE','PVP'].map(mode=>[mode,{revision:state.revision,slots:state.loadouts[selection.loadouts[mode].mercenaryCode]?.[mode]??equipmentSlots()}]))}];
 }));}catch{throw jointError('MERCENARY_EQUIPMENT_STATE','용병 장비 저장 정보를 확인할 수 없습니다.',503);}
}
export function mercenaryEquipmentRecordGuards(DB,id,record){
 const list=[],check=(key,raw)=>{const token=crypto.randomUUID();list.push(jointGuard(DB,token,raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',raw===null?[key]:[key,raw]),jointGuardEnd(DB,token));};check(record.key,record.raw);
 if(record.raw===null){for(const v of Object.values(record.legacy))check(v.key,v.raw);const t=crypto.randomUUID();list.push(mercenaryModeGuard(DB,t,id,record.selection.legacy??record.selection),jointGuardEnd(DB,t));if(record.selection.legacy)check(record.selection.dualKey,record.selection.dualRaw);}return list;
}
export async function freezeMercenaryEquipmentStatements(env,id){
 const r=(await readMercenaryEquipmentRecords(env,[id])).get(Number(id));if(r.raw!==null||!Object.values(r.legacy).some(v=>v.raw!==null))return [];
 return [...mercenaryEquipmentRecordGuards(env.DB,id,r),env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(r.key,JSON.stringify(r.state))];
}
function gearItem(row,userId,advanced=null){
 const gear=mercenaryEquipmentDefinition(row.code),level=Number(row.level??0),power=level&&FORGE_RUNTIME_RELEASE_ENABLED?forgePower(Number(row.total_power),level,advanced):{total:Number(row.total_power),pve:Number(row.pve_power),pvp:Number(row.pvp_power)};
 return {instanceId:String(row.instance_id),equipmentId:Number(row.equipment_id),code:row.code,name:row.name,slot:row.slot,rarity:row.rarity,image:mercenaryEquipmentImage(row.code),regionId:gear.regionId,setId:gear.setId,kind:gear.kind,level,totalPower:power.total,pvePower:power.pve,pvpPower:power.pvp,available:true,polish:decodePolishState(row.value,row.instance_id,userId)};
}
const gearColumns='x.user_id,x.id AS instance_id,x.equipment_id,i.code,i.name,i.slot,i.rarity,i.total_power,i.pve_power,i.pvp_power,COALESCE(s.level,0) AS level,p.value';
const gearJoins="LEFT JOIN equipment_forge_states_v1 s ON s.instance_id=x.id AND s.user_id=x.user_id LEFT JOIN app_meta p ON p.key=('equipment_polish_instance_v1:' || CAST(x.user_id AS TEXT) || ':' || CAST(x.id AS TEXT))";
function runtime(rows,id,mode,revision,advanced){
 const items=rows.map(r=>gearItem(r,id,advanced));
 const standard=mode==='PVE'?equipmentGrowthFromRows(rows.map(r=>({...r,id:r.instance_id})),id):ascendantEquipmentEffects(rows.map(r=>r.code),'PVP');
 if(mode==='PVP'){
  standard.polishEffects=mercenaryEquipmentPolishEffects({schemaVersion:1,mode,items});
  for(const [key,value] of Object.entries(standard.polishEffects))standard.effects[key]=(standard.effects[key]||0)+value;
 }
 const individual=individualMercenaryBonuses(items);
 const summary=individual?equipmentEffectText(addIndividualEquipmentEffects(normalizedEquipmentEffects(standard.effects,standard.polishEffects),individual.effects)):
   standard.summary??equipmentEffectText(normalizedEquipmentEffects(standard.effects,standard.polishEffects));
 return {schemaVersion:1,mode,revision,power:items.reduce((sum,i)=>sum+i[mode==='PVE'?'pvePower':'pvpPower'],0),items,
  effects:standard.effects,...(standard.polishEffects?{polishEffects:standard.polishEffects}:{}),sets:standard.sets,uniques:individual?[...standard.uniques,...individual.codes]:standard.uniques,
  ...(individual?{individualEffects:individual.effects}:{}),summary,effectsMode:mode};
}
export async function mercenaryEquipmentRuntimes(env,userIds,mode='PVE',{records,selections}={}){
 mode=mercenaryMode(mode);records??=await readMercenaryEquipmentRecords(env,userIds);
 const selected=[...records].flatMap(([id,r])=>Object.entries(r.state.loadouts).filter(([code])=>!selections||selections.get(id)?.includes(code)).flatMap(([code,modes])=>SLOTS.filter(s=>modes[mode][s]).map(s=>[id,code,s,modes[mode][s]])));
 const rows=[];for(let offset=0;offset<selected.length;offset+=200){const chunk=selected.slice(offset,offset+200);rows.push(...(await env.DB.prepare(`WITH selected(user_id,mercenary_code,slot,instance_id) AS (VALUES ${chunk.map(()=>'(CAST(? AS BIGINT),CAST(? AS TEXT),CAST(? AS TEXT),CAST(? AS BIGINT))').join(',')}) SELECT l.mercenary_code,${gearColumns} FROM selected l JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id JOIN character_equipment_items i ON i.id=x.equipment_id AND i.slot=l.slot AND i.is_active=1 AND i.is_public=1 ${gearJoins} WHERE i.code IN (${SQL_CODES})`).bind(...chunk.flat()).all()).results);}const advanced=await readForgeAdvancedForLevels(env.DB,rows);
 return new Map([...records].map(([id,r])=>{const byMercenary=Object.fromEntries(Object.keys(r.state.loadouts).map(code=>[code,runtime(rows.filter(x=>Number(x.user_id)===id&&x.mercenary_code===code),id,mode,r.state.revision,advanced)]));return [id,{...(byMercenary[r.selection.loadouts[mode].mercenaryCode]??runtime([],id,mode,r.state.revision,advanced)),byMercenary}];}));
}
export const equipmentForMercenary=(map,id,code)=>map.get(Number(id))?.byMercenary?.[code];
export async function attachMercenaryEquipment(env,snapshots,mode){
 if(!snapshots.size)return snapshots;const selections=new Map([...snapshots].map(([id,v])=>[id,(Array.isArray(v)?v:[v]).map(m=>m.code)])),equipment=await mercenaryEquipmentRuntimes(env,[...snapshots.keys()],mode,{selections}),attach=(id,m)=>{const gear=equipmentForMercenary(equipment,id,m.code);return gear?.items.length?{...m,equipment:gear}:m;};
 return new Map([...snapshots].map(([id,v])=>[id,Array.isArray(v)?v.map(m=>attach(id,m)):attach(id,v)]));
}
async function inventoryPage(env,id,catalog,record,options){
 if(options.owner&&!['free','self','other'].includes(options.owner)||options.slot&&!SLOTS.includes(options.slot))throw jointError('MERCENARY_EQUIPMENT_FILTER','장비 필터를 확인하세요.');
 const cursor=options.cursor||'',match=cursor.match(/^([1-9][0-9]{0,8}):([1-9][0-9]{0,17})$/);if(cursor&&!match)throw jointError('MERCENARY_EQUIPMENT_CURSOR','장비 목록을 다시 불러오세요.');
 const boundary=match?Number(match[1]):Number.MAX_SAFE_INTEGER,limit=120,args=[];
 let defs=catalog.filter(i=>Number(i.is_active)===1&&Number(i.is_public)===1&&Number(i.id)<=boundary);if(options.slot)defs=defs.filter(i=>i.slot===options.slot);if(options.query){const query=String(options.query).slice(0,80).toLowerCase();defs=defs.filter(i=>{const gear=mercenaryEquipmentDefinition(i.code);return (gear?.individualEffects?[i.name,gear.family,gear.passiveName,gear.tierLabel].join(' '):i.name).toLowerCase().includes(query);});}
 const wearerIds=[];for(const [code,modes]of Object.entries(record.state.loadouts))for(const v of Object.values(modes))for(const instanceId of Object.values(v))if(instanceId)wearerIds.push([instanceId,code]);
 const ids=[...new Set(wearerIds.filter(([,code])=>options.owner==='self'?code===options.mercenaryCode:options.owner==='other'?code!==options.mercenaryCode:true).map(([i])=>i))];
 if((options.owner==='self'||options.owner==='other')&&!ids.length)return {rows:[],nextCursor:null};
 if(options.owner)args.push(...ids);
 const parts=defs.map(i=>{args.push(id,i.id);let where='';if(match&&Number(i.id)===boundary){where+=' AND x.id<?';args.push(match[2]);}if(options.owner&&ids.length){where+=` AND CAST(x.id AS TEXT) ${options.owner==='free'?'NOT IN':'IN'} (SELECT id FROM worn)`;}return `SELECT * FROM (SELECT x.id,x.equipment_id FROM user_equipment_instances x WHERE x.user_id=? AND x.equipment_id=?${where} ORDER BY x.id DESC LIMIT ${limit+1}) part`;});
 if(!parts.length)return {rows:[],nextCursor:null};
 // Every branch is a bounded covering-index seek; never scan millions of account copies.
 const page=(await env.DB.prepare(`WITH worn(id) AS (${options.owner&&ids.length?'VALUES '+ids.map(()=>'(CAST(? AS TEXT))').join(','):'SELECT CAST(NULL AS TEXT) WHERE 1=0'}), candidates AS (${parts.join(' UNION ALL ')}), page AS (SELECT id,equipment_id FROM candidates ORDER BY equipment_id DESC,id DESC LIMIT ${limit+1}) SELECT ${gearColumns} FROM page l JOIN user_equipment_instances x ON x.id=l.id JOIN character_equipment_items i ON i.id=x.equipment_id ${gearJoins} ORDER BY x.equipment_id DESC,x.id DESC`).bind(...args).all()).results;
 const rows=page.slice(0,limit),last=rows.at(-1);return {rows,nextCursor:page.length>limit?`${last.equipment_id}:${last.instance_id}`:null};
}
export async function mercenaryEquipmentState(env,user,options={}){
 const records=await readMercenaryEquipmentRecords(env,[user.id]),record=records.get(Number(user.id));
 const [pve,pvp,catalog]=await Promise.all([mercenaryEquipmentRuntimes(env,[user.id],'PVE',{records}),mercenaryEquipmentRuntimes(env,[user.id],'PVP',{records}),env.DB.prepare(`SELECT id,code,name,slot,is_active,is_public FROM character_equipment_items WHERE code IN (${SQL_CODES})`).all()]);
 const page=await inventoryPage(env,user.id,catalog.results,record,options),advanced=await readForgeAdvancedForLevels(env.DB,page.rows),items=page.rows.map(row=>gearItem(row,user.id,advanced));
 const loadouts={PVE:pve.get(Number(user.id)),PVP:pvp.get(Number(user.id))},equippedItems=new Map();for(const mode of ['PVE','PVP'])for(const r of Object.values(loadouts[mode].byMercenary))for(const item of r.items)equippedItems.set(item.instanceId,item);
 const visible=new Map(catalog.results.filter(i=>user.role==='OWNER'||Number(i.is_public)===1&&Number(i.is_active)===1).map(i=>[i.code,i]));
 const regions=[...LEGION_REGIONS.map(({id,name,accent,setName,two,four})=>({id,name,accent,setName,two,four,modes:['PVE']})),...ASCENDANT_EQUIPMENT_SETS.filter(set=>MERCENARY_EQUIPMENT_CATALOG.some(i=>i.setId===set.setId&&visible.has(i.code)))];
 return {schemaVersion:2,accountId:Number(user.id),revision:record.state.revision,mercenaryLoadouts:record.state.loadouts,migration:record.state.migration??null,loadouts,items,equippedItems:[...equippedItems.values()],nextCursor:page.nextCursor,catalog:MERCENARY_EQUIPMENT_CATALOG.filter(i=>visible.has(i.code)).map(i=>({...i,available:Number(visible.get(i.code).is_public)===1&&Number(visible.get(i.code).is_active)===1,image:mercenaryEquipmentImage(i.code)})),regions,slots:SLOTS};
}
export async function saveMercenaryEquipment(env,user,body){
 const mode=mercenaryMode(body.mode),{slot,instanceId,mercenaryCode}=body;
 if(!equipmentMercenaryCode(mercenaryCode)||!SLOTS.includes(slot)||instanceId!==null&&!equipmentInstanceId(instanceId)||!Number.isSafeInteger(body.revision)||body.revision<0||body.transferConfirmed!==undefined&&typeof body.transferConfirmed!=='boolean')throw jointError('MERCENARY_EQUIPMENT_INPUT','새 장비창에서 용병과 보유 장비를 선택하세요.',409);
 if(instanceId&&!mercenaryModeAllowed(mercenaryCode,mode))throw jointError('MERCENARY_PVE_ONLY',MERCENARY_PVE_ONLY_REASON,409);
 const input={mercenaryCode,mode,slot,instanceId,revision:body.revision,transferConfirmed:body.transferConfirmed===true};
 const result=await runJointOperation(env,user,{requestId:body.requestId,kind:'MERCENARY_EQUIPMENT_V2',input,prepare:async()=>{
  const record=(await readMercenaryEquipmentRecords(env,[user.id])).get(Number(user.id));if(record.state.revision!==body.revision)throw jointError('MERCENARY_EQUIPMENT_CONFLICT','다른 창에서 장비를 변경했습니다. 다시 불러와 비교하세요.',409);
  const releaseExpired=!instanceId&&LOAN_CODES.includes(mercenaryCode);
  if(!releaseExpired&&!await env.DB.prepare(`SELECT mercenary_code FROM ${PLAYABLE_MERCENARIES} WHERE user_id=? AND mercenary_code=? AND total_copies>0`).bind(user.id,mercenaryCode).first())throw jointError('MERCENARY_EQUIPMENT_MERCENARY','보유한 용병만 선택할 수 있습니다.',403);
  if(instanceId&&!await env.DB.prepare(`SELECT x.id FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.id=? AND x.user_id=? AND i.slot=? AND i.code IN (${SQL_CODES}) AND i.is_active=1 AND i.is_public=1`).bind(instanceId,user.id,slot).first())throw jointError('MERCENARY_EQUIPMENT_OWNERSHIP','사용 가능한 보유 용병 장비만 장착할 수 있습니다.',403);
  const {next,transfer}=changeEquipment(record.state,input);return {record,next,transfer,input,releaseExpired};
 },statements:async plan=>{
  const DB=env.DB,token=crypto.randomUUID(),record=(await readMercenaryEquipmentRecords(env,[user.id])).get(Number(user.id));
  if(record.raw!==plan.record.raw||JSON.stringify(record.state)!==JSON.stringify(plan.record.state))throw Object.assign(jointError('MERCENARY_EQUIPMENT_CONFLICT','장비 구성이 변경됐습니다. 다시 비교해 주세요.',409),{terminal:true});
  const list=[...mercenaryEquipmentRecordGuards(DB,user.id,plan.record),jointGuard(DB,token,plan.releaseExpired?'1=1':`EXISTS(SELECT 1 FROM ${PLAYABLE_MERCENARIES} WHERE user_id=? AND mercenary_code=? AND total_copies>0)`,plan.releaseExpired?[]:[user.id,plan.input.mercenaryCode])];
  if(plan.input.instanceId)list.push(DB.prepare(`UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.id=? AND x.user_id=? AND i.slot=? AND i.code IN (${SQL_CODES}) AND i.is_active=1 AND i.is_public=1) THEN 1 ELSE 0 END WHERE token=?`).bind(plan.input.instanceId,user.id,plan.input.slot,token));
  list.push(DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(plan.record.key,JSON.stringify(plan.next)),DB.prepare('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(?,NULL,0,?) ON CONFLICT(user_id) DO UPDATE SET updated_at=excluded.updated_at').bind(user.id,new Date().toISOString()),DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)').bind(user.id,'MERCENARY_EQUIPMENT_V2','USER',String(user.id),JSON.stringify(plan.record.state),JSON.stringify(plan.next)),jointGuardEnd(DB,token));return list;
 }});
 return {requestId:result.requestId,replayed:result.replayed,mercenaryCode,mode,revision:result.plan.next.revision};
}
export async function handleMercenaryEquipment({path,request,env,deps}){
 if(path!=='mercenaries/v3/equipment')return null;
 try{
  const user=await deps.authenticate(request,env);if(!user)throw jointError('MERCENARY_AUTH','로그인이 필요합니다.',401);if(!MERCENARY_DEPLOYMENT_RELEASE_ENABLED)throw jointError('MERCENARY_EQUIPMENT_DISABLED','용병 장비를 준비 중입니다.',423);
  if(request.method==='GET'){const q=new URL(request.url).searchParams;return deps.json(await mercenaryEquipmentState(env,user,Object.fromEntries(['cursor','slot','query','owner','mercenaryCode'].map(k=>[k,q.get(k)||'']))));}
  if(request.method!=='POST')throw jointError('MERCENARY_METHOD','지원하지 않는 요청입니다.',405);
  const body=await readJointBody(request,{fields:['requestId','mercenaryCode','mode','slot','instanceId','revision','transferConfirmed']});if(typeof deps.withUserMutationLock!=='function')throw jointError('MERCENARY_LOCK','계정 잠금 서비스를 확인하세요.',503);
  return deps.json(await deps.withUserMutationLock(env,user.id,path,()=>saveMercenaryEquipment(env,user,body)));
 }catch(error){return jointResponseError(error,deps.json);}
}
