import {jointError} from './_joint_request.js';
import {jointGuard} from './_joint_atomic.js';
import {mercenaryModeAllowed} from '../shared/mercenary-eunseol-v1.mjs';

export const dualMercenaryLoadoutKey=id=>'mercenary_dual_loadout_v2:'+Number(id);
// A separate document preserves both established single slots while release is OFF.
export function dualMercenaryRecord(record,raw,userId){
 let saved=null;
 try{if(raw!==null)saved=JSON.parse(raw);}catch{throw jointError('MERCENARY_LOADOUT_STATE','편성 정보를 읽지 못했습니다.',503);}
 if(raw!==null&&(!saved||saved.version!==2))throw jointError('MERCENARY_LOADOUT_STATE','편성 버전을 확인해 주세요.',503);
 const loadouts={};
 for(const mode of ['PVE','PVP']){
  const old=record.loadouts[mode],value=saved?.[mode]||{mercenaryCodes:old.mercenaryCode?[old.mercenaryCode]:[],revision:old.revision};
  if(!Array.isArray(value.mercenaryCodes)||value.mercenaryCodes.length>2||new Set(value.mercenaryCodes).size!==value.mercenaryCodes.length||value.mercenaryCodes.some(c=>!/^V-\d{3}$/.test(c))||!Number.isSafeInteger(value.revision)||value.revision<0||value.revision>2147483647)throw jointError('MERCENARY_LOADOUT_STATE','편성 정보를 확인할 수 없습니다.',503);
  const codes=value.mercenaryCodes.filter(c=>mercenaryModeAllowed(c,mode));
  loadouts[mode]={mercenaryCodes:codes,mercenaryCode:codes[0]||null,revision:value.revision};
 }
 return {...record,legacy:record,dualKey:dualMercenaryLoadoutKey(userId),dualRaw:raw,loadouts};
}
export function dualMercenaryGuard(DB,token,record){
 return record.dualRaw===null?jointGuard(DB,token,'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[record.dualKey]):jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[record.dualKey,record.dualRaw]);
}
export function dualMercenaryStatements(DB,userId,record,mode,next){
 const value={version:2,...Object.fromEntries(['PVE','PVP'].map(m=>[m,m===mode?next:{mercenaryCodes:record.loadouts[m].mercenaryCodes,revision:record.loadouts[m].revision}]))};
 return [DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(record.dualKey,JSON.stringify(value)),
  // Existing version triggers invalidate duo/collection caches; single choices remain intact.
  DB.prepare('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(?,NULL,0,?) ON CONFLICT(user_id) DO UPDATE SET updated_at=excluded.updated_at').bind(userId,new Date().toISOString())];
}
