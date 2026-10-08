import {jointError} from './_joint_request.js';
import {jointGuard} from './_joint_atomic.js';

export const mercenaryPvpLoadoutKey=userId=>'mercenary_pvp_loadout_v1:'+Number(userId);
export function mercenaryMode(value='PVE'){
  if(value!=='PVE'&&value!=='PVP')throw jointError('MERCENARY_MODE','PVE 또는 PVP 편성을 선택하세요.');
  return value;
}
const slot=row=>({mercenaryCode:row?.mercenary_code||null,revision:Number(row?.revision||0)});
function pvpSlot(raw,fallback){
  if(raw===null)return {...fallback};
  let value;try{value=JSON.parse(raw);}catch{throw jointError('MERCENARY_LOADOUT_STATE','편성 정보를 읽지 못했습니다.',503);}
  if(!value||!Number.isSafeInteger(value.revision)||value.revision<0||value.revision>2147483647||
    value.mercenaryCode!==null&&!/^V-\d{3}$/.test(value.mercenaryCode||''))
    throw jointError('MERCENARY_LOADOUT_STATE','편성 정보를 확인할 수 없습니다.',503);
  return {mercenaryCode:value.mercenaryCode,revision:value.revision};
}
// Keep PVE in its established table. Existing accounts inherit that slot for PVP
// until their first edit freezes the two selections in the same transaction.
export async function readMercenaryModes(env,userIds){
  const ids=[...new Set(userIds.map(Number))];if(!ids.length)return new Map();
  if(ids.length>200||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw jointError('MERCENARY_USERS','계정 범위를 확인하세요.');
  const marks=ids.map(()=>'?').join(','),keys=ids.map(mercenaryPvpLoadoutKey);
  const [legacy,overrides]=await Promise.all([
    env.DB.prepare(`SELECT * FROM user_mercenary_loadout_v1 WHERE user_id IN (${marks})`).bind(...ids).all(),
    env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${marks})`).bind(...keys).all()
  ]);
  const old=new Map(legacy.results.map(r=>[Number(r.user_id),r])),saved=new Map(overrides.results.map(r=>[r.key,r.value]));
  return new Map(ids.map(id=>{const key=mercenaryPvpLoadoutKey(id),raw=saved.has(key)?saved.get(key):null,PVE=slot(old.get(id));
    return [id,{key,raw,loadouts:{PVE,PVP:pvpSlot(raw,PVE)}}];}));
}
export function mercenaryModeGuard(DB,token,userId,record){
  const predicate='COALESCE((SELECT revision FROM user_mercenary_loadout_v1 WHERE user_id=?),0)=?';
  return record.raw===null
    ?jointGuard(DB,token,predicate+' AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[userId,record.loadouts.PVE.revision,record.key])
    :jointGuard(DB,token,predicate+' AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[userId,record.loadouts.PVE.revision,record.key,record.raw]);
}
export function mercenaryModeStatements(DB,userId,record,mode,next){
  const stamp=new Date().toISOString(),p=(sql,...values)=>DB.prepare(sql).bind(...values),statements=[];
  const PVE=mode==='PVE'?next:record.loadouts.PVE;
  // Touch the existing loadout row on PVP edits so established ranked-duo
  // version triggers invalidate cached combat profiles without a new schema.
  statements.push(p('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mercenary_code=excluded.mercenary_code,revision=excluded.revision,updated_at=excluded.updated_at',userId,PVE.mercenaryCode,PVE.revision,stamp));
  if(mode==='PVP'||record.raw===null){
    const PVP=mode==='PVP'?next:record.loadouts.PVP;
    statements.push(p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',record.key,JSON.stringify(PVP),stamp));
  }
  return statements;
}
