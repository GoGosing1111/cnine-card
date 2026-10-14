import {HALLOWEEN_MERCENARIES} from '../shared/mercenary-halloween-catalog-v1.mjs';
import {HALLOWEEN_PACK,HALLOWEEN_PACK_KEY,halloweenPackDraft,validateHalloweenPack,halloweenPackState} from '../shared/mercenary-halloween-pack-v1.mjs';
import {jointHash} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError,readJointBody,jointResponseError} from './_joint_request.js';

const initial=()=>({revision:1,settings:halloweenPackDraft(),updatedAt:null});
export async function readHalloweenPackState(env){
 const [row,stock]=await Promise.all([
  env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(HALLOWEEN_PACK_KEY).first(),
  env.DB.prepare('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code IN ('+HALLOWEEN_MERCENARIES.map(()=>'?').join(',')+') ORDER BY code').bind(...HALLOWEEN_MERCENARIES.map(c=>c.code)).all()
 ]);
 const saved=row?JSON.parse(row.value):initial();
 return {revision:saved.revision,updatedAt:saved.updatedAt,...halloweenPackState(saved.settings,stock.results)};
}
export async function saveHalloweenPack(env,actor,body){
 if(!body||Object.keys(body).sort().join(',')!=='expectedRevision,reason,requestId,settings'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>=2147483646||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId)||typeof body.reason!=='string'||body.reason.trim().length<4||body.reason.length>500||/[\u0000-\u001f]/.test(body.reason))throw jointError('MERCENARY_HALLOWEEN_CONFIG','현재 버전·요청 번호·저장 사유를 확인하세요.');
 let settings;try{settings=validateHalloweenPack(body.settings);}catch(e){throw jointError('MERCENARY_HALLOWEEN_CONFIG',e.message);}
 const receiptKey=HALLOWEEN_PACK_KEY+':save:'+body.requestId,hash=await jointHash({actor:Number(actor.id),...body,requestId:undefined});
 const prior=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first();
 if(prior){if(JSON.parse(prior.value).hash!==hash)throw jointError('MERCENARY_HALLOWEEN_CONFLICT','같은 요청 번호에 다른 내용이 있습니다.',409);return {...await readHalloweenPackState(env),replayed:true};}
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(HALLOWEEN_PACK_KEY).first(),beforeText=row?.value??JSON.stringify(initial()),before=JSON.parse(beforeText);
 if(before.revision!==body.expectedRevision)throw jointError('MERCENARY_HALLOWEEN_CONFLICT','다른 창에서 설정을 변경했습니다. 새로 불러오세요.',409);
 const next={revision:before.revision+1,settings,updatedAt:new Date().toISOString(),updatedBy:Number(actor.id),lastRequestId:body.requestId},afterText=JSON.stringify(next),DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID();
 try{await DB.batch([
  p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',HALLOWEEN_PACK_KEY,beforeText),
  p('UPDATE app_meta SET value=? WHERE key=? AND value=?',afterText,HALLOWEEN_PACK_KEY,beforeText),
  jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[HALLOWEEN_PACK_KEY,afterText]),
  p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',actor.id,'MERCENARY_HALLOWEEN_PACK_SAVE','SETTING',HALLOWEEN_PACK_KEY,beforeText,JSON.stringify({...next,reason:body.reason.trim(),requestId:body.requestId})),
  p('INSERT INTO app_meta(key,value) VALUES(?,?)',receiptKey,JSON.stringify({hash,revision:next.revision})),jointGuardEnd(DB,token)
 ]);}catch(e){
  const saved=await p('SELECT value FROM app_meta WHERE key=?',receiptKey).first();
  if(saved&&JSON.parse(saved.value).hash===hash)return {...await readHalloweenPackState(env),replayed:true};
  const current=await p('SELECT value FROM app_meta WHERE key=?',HALLOWEEN_PACK_KEY).first();
  if(current&&JSON.parse(current.value).revision!==before.revision)throw jointError('MERCENARY_HALLOWEEN_CONFLICT','다른 창에서 설정을 변경했습니다. 새로 불러오세요.',409);
  throw e;
 }
 return {...await readHalloweenPackState(env),replayed:false};
}
export async function handleHalloweenPack({path,request,env,deps}){
 if(![HALLOWEEN_PACK.featurePath,HALLOWEEN_PACK.openPath,HALLOWEEN_PACK.adminPath].includes(path))return null;
 try{
  if(path===HALLOWEEN_PACK.openPath){
   if(request.method!=='POST')return deps.json({error:'지원하지 않는 요청입니다.'},405);
   // No payment, stock claim, ownership grant or prepared opening is possible.
   return deps.json({code:'MERCENARY_HALLOWEEN_CLOSED',error:'SS 할로윈 리미티드 팩은 추후 개방 예정입니다. 코인은 차감되지 않았습니다.'},423,{'cache-control':'no-store'});
  }
  if(path===HALLOWEEN_PACK.adminPath){
   const actor=await deps.requirePermission(request,env,'BATTLE_MANAGE');
   if(!actor||actor.role!=='OWNER')return deps.json({error:'할로윈 팩 설정은 OWNER만 관리할 수 있습니다.'},403);
   if(request.method==='PATCH')return deps.json(await saveHalloweenPack(env,actor,await readJointBody(request,{maxBytes:12000})),200,{'cache-control':'no-store'});
  }
  if(request.method!=='GET')return deps.json({error:'지원하지 않는 요청입니다.'},405);
  return deps.json(await readHalloweenPackState(env),200,{'cache-control':'no-store'});
 }catch(e){return jointResponseError(e,deps.json);}
}
