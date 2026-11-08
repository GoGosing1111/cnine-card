import {HEIR_TITLE} from '../shared/season-s1-title.mjs';
import {S1,ART,emptyAccount,seasonState,applyEvent,craftItem,exchangeMaterial,convertExpired,publicSeason,schedule,kstDay,fail} from '../shared/season-s1.mjs';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {jointHash,jointInventoryChange} from './_joint_transactions.js';
import {socketRune,itemRuneBonus,SOCKET_SLOTS} from '../shared/character-runes.mjs';
export const SEASON_S1_SCHEMA=[
 'CREATE TABLE IF NOT EXISTS season_s1_accounts(user_id INTEGER PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,state_json TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS season_s1_receipts(user_id INTEGER NOT NULL,receipt_key TEXT NOT NULL,input_hash TEXT NOT NULL,token TEXT NOT NULL UNIQUE,response_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,receipt_key))'
];
const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
export const seasonEnabled=env=>env.SEASON_S1_ENABLED===true||env.SEASON_S1_ENABLED==='1';
export const seasonNow=env=>typeof env.SEASON_S1_NOW==='function'?env.SEASON_S1_NOW():Date.now();
export const S1_OPENING_KEY='season_s1_immortal_king_opening_v1';
const liveSchedules=new WeakMap();
export async function seasonSchedule(env){
 let raw=env.SEASON_S1_SCHEDULE;
 if(raw==='live'){
  const scope=env.HYPERDRIVE||env.DB,cached=liveSchedules.get(scope);
  if(cached&&Date.now()<cached.until)return cached.schedule;
  const row=await p(env,'SELECT value FROM app_meta WHERE key=?',S1_OPENING_KEY).first();
  if(!row)return {};
  const schedule=JSON.parse(row.value);
  if(!['PVE','PVP'].every(mode=>Number.isSafeInteger(schedule?.[mode]?.start)&&schedule[mode].start>0))throw Error('Invalid S1 opening schedule');
  liveSchedules.set(scope,{until:Date.now()+60000,schedule});
  return schedule;
 }
 try{return (typeof raw==='string'?JSON.parse(raw):raw)||{};}catch{return {};}
}
// Explicit migration only; never create tables in game HTTP/read paths.
export async function prepareSeasonSchema(env){
 await ensureJointAtomicSchema(env);
 if(env.DB.execSchema)await env.DB.execSchema(SEASON_S1_SCHEMA.map(s=>s.replaceAll('INTEGER','BIGINT')));
 else for(const sql of SEASON_S1_SCHEMA)await p(env,sql).run();
 const titles=[
  ['PVE','불멸의 정복자',ART+'immortal-seal-v3.webp','DEFAULT',950,0],
  ['PVP','불멸의 승리자',ART+'immortal-crest-v3.webp','DEFAULT',951,0],
  ['COMMON',HEIR_TITLE.name,HEIR_TITLE.image,HEIR_TITLE.style,952,HEIR_TITLE.allBattlePower]
 ];
 for(const [mode,name,image,style,order,power] of titles){
  const description='S1 불멸의 왕 '+(mode==='COMMON'?'공용':mode)+' 50레벨 시즌 제작 칭호';
  await p(env,`INSERT INTO character_titles(code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
   VALUES(?,?,?,?,?,?,'MANUAL','{}',?,1,1,?) ON CONFLICT(code) DO NOTHING`,mode+'_S1_TITLE',name,description,name,image,power,style,order).run();
 }
 await p(env,'UPDATE character_titles SET image_url=?,style_preset=? WHERE code=? AND style_preset=? AND image_url=?',HEIR_TITLE.image,HEIR_TITLE.style,HEIR_TITLE.code,'DEFAULT',ART+'immortal-seal-v3.webp').run();
 await p(env,'UPDATE character_titles SET pve_power=? WHERE code=? AND pve_power=0',HEIR_TITLE.allBattlePower,HEIR_TITLE.code).run();
}
export async function seasonTowerFloors(env,highest,uid){
 const now=seasonNow(env);
 if(!seasonEnabled(env)||Number(highest)<1||schedule(await seasonSchedule(env),'PVE',now).phase!=='ACTIVE')return [];
 const {state}=await seasonAccount(env,uid),track=state.tracks.PVE;
 return track.counts.TOWER||track.days[kstDay(now)]?.events>=S1.dailyBattles?[]:[1];
}
async function legacyPlayHours(env,uid){
 const pg=env.DB.dialect==='postgres';
 const field=name=>pg?"(CAST(response_json AS JSONB)->>'"+name+"')":"json_extract(response_json,'$."+name+"')";
 const material=name=>pg?"(CAST(response_json AS JSONB)->'gains'->>'"+name+"')":"json_extract(response_json,'$.gains."+name+"')";
 const prefix='award:'+S1.id+':';
 const rows=await p(env,`SELECT substr(created_at,1,13) AS utc_hour,${field('mode')} AS mode,COUNT(*) AS events,
  COALESCE(SUM(CAST(${field('xp')} AS INTEGER)),0) AS xp,
  SUM(CAST(COALESCE(${material('PVE_DUST')},${material('PVP_DUST')},'0') AS INTEGER)) AS dust
  FROM season_s1_receipts WHERE user_id=? AND substr(receipt_key,1,?)=? GROUP BY 1,2`,uid,prefix.length,prefix).all();
 return rows.results;
}
export async function seasonAccount(env,uid){
 const row=await p(env,'SELECT revision,state_json FROM season_s1_accounts WHERE user_id=?',uid).first();
 if(!row)return {revision:0,state:emptyAccount()};
 const stored=JSON.parse(row.state_json);
 return {revision:Number(row.revision),state:seasonState(stored,stored.schemaVersion>=3?[]:await legacyPlayHours(env,uid))};
}
async function receipt(env,uid,key){return p(env,'SELECT input_hash,response_json FROM season_s1_receipts WHERE user_id=? AND receipt_key=?',uid,key).first();}
function writePlan(env,uid,before,next,key,hash,response,{guard='1=1',values=[]}={},clock=seasonNow(env)){
 const token=crypto.randomUUID();
 const writes=[
  p(env,'INSERT INTO season_s1_accounts(user_id,revision,state_json) SELECT ?,0,? WHERE '+guard+' ON CONFLICT(user_id) DO NOTHING',uid,JSON.stringify(emptyAccount()),...values)
 ];
 if(env.DB.dialect==='postgres')writes.push(p(env,'SELECT user_id FROM season_s1_accounts WHERE user_id=? FOR UPDATE',uid));
 writes.push(
  jointGuard(env.DB,token,'NOT ('+guard+') OR EXISTS(SELECT 1 FROM season_s1_accounts WHERE user_id=? AND revision=?)',[...values,uid,before.revision]),
  p(env,'INSERT INTO season_s1_receipts(user_id,receipt_key,input_hash,token,response_json,created_at) SELECT ?,?,?,?,?,? WHERE '+guard,uid,key,hash,token,JSON.stringify(response),new Date(clock).toISOString(),...values),
  p(env,'UPDATE season_s1_accounts SET state_json=?,revision=revision+1 WHERE user_id=? AND revision=? AND EXISTS(SELECT 1 FROM season_s1_receipts WHERE token=?)',JSON.stringify(next),uid,before.revision,token),
  jointGuardEnd(env.DB,token)
 );
 return writes;
}
// Call only with server-confirmed combat metadata; returned statements join the
// ORIGINAL content settlement transaction. No public award endpoint exists.
export async function seasonAwardStatements(env,event,options={}){
 if(!seasonEnabled(env))return [];
 const uid=Number(event.userId);if(!Number.isSafeInteger(uid)||uid<=0||typeof event.eventId!=='string'||!event.eventId||event.eventId.length>220)throw Error('Invalid server season event');
 const key='award:'+S1.id+':'+event.source+':'+event.eventId;
 if(await receipt(env,uid,key))return [];
 const before=await seasonAccount(env,uid),now=seasonNow(env),result=applyEvent(before.state,event,await seasonSchedule(env),now);
 if(result.dailyLimit){
  // A settled over-limit battle cannot become a new award on a next-day retry.
  const {guard='1=1',values=[]}=options;
  return [p(env,'INSERT INTO season_s1_receipts(user_id,receipt_key,input_hash,token,response_json,created_at) SELECT ?,?,?,?,?,? WHERE '+guard+' ON CONFLICT(user_id,receipt_key) DO NOTHING',
   uid,key,await jointHash(event),crypto.randomUUID(),JSON.stringify({dailyLimit:true}),new Date(now).toISOString(),...values)];
 }
 if(!result.award)return [];
 const writes=writePlan(env,uid,before,result.state,key,await jointHash(event),result.award,options,now);
 writes.award=result.award;return writes;
}
export async function seasonBonus(env,uid,mode){
 if(!seasonEnabled(env))return {attackBp:0,hpBp:0};
 const account=await seasonAccount(env,uid);
 if(!Object.keys(account.state.itemRunes||{}).length)return {attackBp:0,hpBp:0};
 return itemRuneBonus(account.state,mode,await equippedRuneItems(env,uid));
}
const slotSql=SOCKET_SLOTS.map(s=>"'"+s+"'").join(',');
const eligibleGear='i.is_active=1 AND i.slot IN ('+slotSql+')';
async function equippedRuneItems(env,uid){
 const rows=await p(env,`SELECT l.instance_id AS id FROM user_equipment_loadout l
  JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id
  JOIN character_equipment_items i ON i.id=x.equipment_id AND i.slot=l.slot AND ${eligibleGear}
  WHERE l.user_id=? AND l.slot IN (${slotSql})`,uid).all();
 return rows.results.map(row=>Number(row.id));
}
export async function seasonStatus(env,uid){
 if(!seasonEnabled(env))return {enabled:false,season:S1};
 const [account,equipped,settings]=await Promise.all([seasonAccount(env,uid),equippedRuneItems(env,uid),seasonSchedule(env)]);
 // An unequipped item matters here only if it holds a rune. Recheck its ownership by instance ID.
 const stored=Object.keys(account.state.itemRunes).map(Number).filter(id=>Number.isSafeInteger(id)&&id>0&&!equipped.includes(id));
 const owned=[...equipped];
 if(stored.length){
  const placeholders=stored.map(()=>'?').join(',');
  const rows=await p(env,`SELECT x.id FROM user_equipment_instances x
   JOIN character_equipment_items i ON i.id=x.equipment_id AND ${eligibleGear}
   WHERE x.user_id=? AND x.id IN (${placeholders})`,uid,...stored).all();
  owned.push(...rows.results.map(row=>Number(row.id)));
 }
 return publicSeason(account.state,settings,seasonNow(env),{owned,equipped});
}
export async function seasonMutation(env,user,action,body){
 if(!seasonEnabled(env))fail('시즌 개막을 준비하고 있습니다.',503,'SEASON_DISABLED');
 if(!body||typeof body!=='object'||Array.isArray(body))fail('요청 내용을 확인하세요.',400);
 if(!['craft','socket','exchange','settle'].includes(action))fail('지원하지 않는 시즌 요청입니다.',404);
 if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(body.requestId))fail('요청 번호를 확인하세요.',400);
 const clean=action==='craft'?{recipeId:body.recipeId,choice:body.choice||null,...(body.copyId?{copyId:body.copyId}:{})}:action==='socket'?{instanceId:Number(body.instanceId),code:body.code??null}:action==='exchange'?{code:body.code}:{};
 const key='mutation:'+body.requestId,hash=await jointHash({action,...clean}),old=await receipt(env,user.id,key);
 if(old){if(old.input_hash!==hash)fail('같은 요청 번호로 다른 작업을 할 수 없습니다.',409,'SEASON_REQUEST_CONFLICT');return {...JSON.parse(old.response_json),replayed:true};}
 const before=await seasonAccount(env,user.id),settings=await seasonSchedule(env),now=seasonNow(env);
 if(action==='socket'){
  if(!Number.isSafeInteger(clean.instanceId)||clean.instanceId<=0)fail('장비를 선택하세요.',400);
  const owned=await p(env,'SELECT x.id FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id AND '+eligibleGear+' WHERE x.user_id=? AND x.id=?',user.id,clean.instanceId).first();
  if(!owned)fail('보유한 일반 장비 다섯 부위에만 룬을 넣을 수 있습니다. 배틀슈트는 제외됩니다.',403);
 }
 const result=action==='craft'?craftItem(before.state,clean,settings,now):action==='socket'?{state:socketRune(before.state,clean)}:action==='exchange'?exchangeMaterial(before.state,clean,settings,now):convertExpired(before.state,settings,now);
 const response={ok:true,requestId:body.requestId,action,reward:result.reward||null};
 const writes=writePlan(env,user.id,before,result.state,key,hash,response);
 if(action==='socket'){const guard=crypto.randomUUID();writes.push(jointGuard(env.DB,guard,'EXISTS(SELECT 1 FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id AND '+eligibleGear+' WHERE x.user_id=? AND x.id=?)',[user.id,clean.instanceId]),jointGuardEnd(env.DB,guard));}
 if(result.reward?.external)writes.push(...jointInventoryChange(env.DB,user.id,result.reward.code,result.reward.quantity,'S1 불멸의 왕 시즌 제작',body.requestId));
 if(result.reward?.code.endsWith('_S1_TITLE')){
  const token=crypto.randomUUID();
  writes.push(jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM character_titles WHERE code=? AND is_active=1)',[result.reward.code]),p(env,"INSERT INTO user_character_titles(user_id,title_id,source_type,source_id) SELECT ?,id,'SEASON_CRAFT',? FROM character_titles WHERE code=? AND is_active=1 ON CONFLICT(user_id,title_id) DO NOTHING",user.id,body.requestId,result.reward.code),jointGuardEnd(env.DB,token));
 }
 try{await env.DB.batch(writes);}catch(error){
  const committed=await receipt(env,user.id,key);
  if(committed){if(committed.input_hash!==hash)fail('다른 작업에 사용된 요청 번호입니다.');return {...JSON.parse(committed.response_json),replayed:true};}
  if(/joint_atomic_guards|unique|duplicate/i.test(String(error.message)))fail('계정 상태가 변경되었습니다. 같은 요청으로 다시 확인하세요.',409,'SEASON_CONFLICT');
  throw error;
 }
 return response;
}
export async function handleSeasonS1({path,request,env,deps}){
 if(!path.startsWith('season/'))return null;
 const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
 try{
  if(path==='season/status'&&request.method==='GET')return deps.json(await seasonStatus(env,user.id));
  const action=path.slice(7);
  if(request.method!=='POST'||!['craft','socket','exchange','settle'].includes(action))return deps.json({error:'지원하지 않는 시즌 요청입니다.'},404);
  const body=await request.json();
  return await deps.withUserMutationLock(env,user.id,path,async()=>deps.json(await seasonMutation(env,user,action,body)));
 }catch(error){if(error.status)return deps.json({error:error.message,code:error.code},error.status);throw error;}
}

