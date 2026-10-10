import {readPetCollection} from './_pet_account.js';
import {readPetCms} from './_pet_companion_cms.js';
import {PET_CMS_KEY} from '../shared/pet-cms-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';

export const SUPPORTER_PET_CODE='PET-HEADSET-SHIBA';

// The caller holds the account mutation lock and commits these statements with
// the entitlement/receipt. Never issue the pet as a second, independent write.
export async function prepareSupporterPetReward(env,{admin,target,requestId,now=Date.now()}){
  const owned=await readPetCollection(env,target.id),before=owned.state.pets[SUPPORTER_PET_CODE]||0;
  if(before>0)return {result:{petCode:SUPPORTER_PET_CODE,quantity:0,alreadyOwned:true},statements:[]};
  const cms=await readPetCms(env),definition=cms.state.document.pets.find(p=>p.code===SUPPORTER_PET_CODE);
  if(!definition)throw jointError('SUPPORT_PET_UNAVAILABLE','헤드셋 시바견 설정을 확인하지 못했습니다. 잠시 후 다시 시도하세요.',503);
  const revision=owned.state.revision+1;
  if(!Number.isSafeInteger(revision))throw jointError('SUPPORT_PET_LIMIT','펫 보유 기록 한도를 초과했습니다.',409);
  const pet={code:definition.code,name:definition.name,sourceArt:definition.sourceArt};
  const result={ok:true,requestId,adminId:Number(admin.id),target,pet,quantity:1,
    reason:'시즌패스 활성화 사은품',source:'SUPPORTER_SEASON_PASS',before,after:1,
    collectionRevision:revision,grantedAt:new Date(now).toISOString(),replayed:false};
  const raw=JSON.stringify({...owned.state,revision,pets:{...owned.state.pets,[SUPPORTER_PET_CODE]:1}});
  const DB=env.DB,token=crypto.randomUUID(),p=(sql,...args)=>DB.prepare(sql).bind(...args);
  return {result,statements:[
    ...(DB.dialect==='postgres'?[p('SELECT key FROM app_meta WHERE key=? FOR UPDATE',owned.key)]:[]),
    jointGuard(DB,token,owned.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',owned.raw===null?[owned.key]:[owned.key,owned.raw]),
    jointGuard(DB,token+'c','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[PET_CMS_KEY,cms.raw]),
    owned.raw===null?p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',owned.key,raw):p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',raw,owned.key,owned.raw),
    jointGuard(DB,token+'w','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[owned.key,raw]),
    p("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'PET_GRANT','USER',?,?,?)",admin.id,String(target.id),JSON.stringify({petCode:SUPPORTER_PET_CODE,quantity:before,revision:owned.state.revision}),JSON.stringify(result)),
    ...[token,token+'c',token+'w'].map(t=>jointGuardEnd(DB,t))
  ]};
}
