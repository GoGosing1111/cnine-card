import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {HALLOWEEN_PACK,HALLOWEEN_PACK_KEY,HALLOWEEN_PACK_RELEASE_ENABLED,HALLOWEEN_PACK_SHOP_ENABLED,halloweenPackDraft,validateHalloweenPack,halloweenPackState,halloweenPackCatalogRow,halloweenPackReadiness} from '../shared/mercenary-halloween-pack-v1.mjs';
import {readMercenaryDocument} from './_mercenary_account.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {validateMercenaryCardRules} from '../shared/mercenary-draw-policy-v1.mjs';
import {createHalloweenPackService} from './_mercenary_halloween_opening.js';
import {jointHash} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError,readJointBody,jointResponseError} from './_joint_request.js';

const initial=()=>({revision:1,settings:halloweenPackDraft(),updatedAt:null});
export async function readHalloweenPackState(env,{releaseEnabled=HALLOWEEN_PACK_RELEASE_ENABLED,shopEnabled=HALLOWEEN_PACK_SHOP_ENABLED}={}){
 const [row,stock,cms,normalDraw]=await Promise.all([
  env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(HALLOWEEN_PACK_KEY).first(),
  env.DB.prepare('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code IN ('+HALLOWEEN_PACK_CARDS.map(()=>'?').join(',')+') ORDER BY code').bind(...HALLOWEEN_PACK_CARDS.map(c=>c.code)).all(),
  readMercenaryDocument(env),env.DB.prepare('SELECT payload_json,revision FROM mercenary_draw_config_v1 WHERE id=1').first()
 ]);
 const saved=row?JSON.parse(row.value):initial();
 const rules=normalDraw?validateMercenaryCardRules(JSON.parse(normalDraw.payload_json).cardRules,MERCENARY_CMS_SEED.catalog.cards.map(c=>c.code)):null;
 const normalCards=rules?limitedNormalCards(cms.document.mercenaries,MERCENARY_CMS_SEED.catalog.cards,rules):[];
 return {revision:saved.revision,updatedAt:saved.updatedAt,rawPack:row?.value??null,normalCmsRevision:cms.revision,normalDrawRevision:Number(normalDraw?.revision||0),...halloweenPackState(saved.settings,stock.results,normalCards,{releaseEnabled,shopEnabled})};
}
const publicState=state=>{const {rawPack,...safe}=state;return safe;};
export async function halloweenPackShopRow(env){
 if(!HALLOWEEN_PACK_SHOP_ENABLED)return null;
 const [row,stock]=await Promise.all([env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(HALLOWEEN_PACK_KEY).first(),env.DB.prepare('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code IN ('+HALLOWEEN_PACK_CARDS.map(()=>'?').join(',')+')').bind(...HALLOWEEN_PACK_CARDS.map(c=>c.code)).all()]);
 return halloweenPackCatalogRow(row?JSON.parse(row.value).settings:halloweenPackDraft(),stock.results);
}
export async function saveHalloweenPack(env,actor,body){
 if(!body||Object.keys(body).sort().join(',')!=='expectedRevision,reason,requestId,settings'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>=2147483646||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId)||typeof body.reason!=='string'||body.reason.trim().length<4||body.reason.length>500||/[\u0000-\u001f]/.test(body.reason))throw jointError('MERCENARY_HALLOWEEN_CONFIG','현재 버전·요청 번호·저장 사유를 확인하세요.');
 let settings;try{settings=validateHalloweenPack(body.settings);}catch(e){throw jointError('MERCENARY_HALLOWEEN_CONFIG',e.message);}
 const receiptKey=HALLOWEEN_PACK_KEY+':save:'+body.requestId,hash=await jointHash({actor:Number(actor.id),...body,requestId:undefined});
 const prior=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first();
 if(prior){if(JSON.parse(prior.value).hash!==hash)throw jointError('MERCENARY_HALLOWEEN_CONFLICT','같은 요청 번호에 다른 내용이 있습니다.',409);return {...await readHalloweenPackState(env),replayed:true};}
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(HALLOWEEN_PACK_KEY).first(),beforeText=row?.value??JSON.stringify(initial()),before=JSON.parse(beforeText);
 if(before.revision!==body.expectedRevision)throw jointError('MERCENARY_HALLOWEEN_CONFLICT','다른 창에서 설정을 변경했습니다. 새로 불러오세요.',409);
 if(settings.mode==='ON'){const state=await readHalloweenPackState(env),ready=halloweenPackReadiness(settings,state.stock,state.normalCards);if(!ready.ready)throw jointError('MERCENARY_HALLOWEEN_CONFIG',ready.blockers.join(' '));}
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
const service=createHalloweenPackService({readState:readHalloweenPackState});
export async function handleHalloweenPack({path,request,env,deps}){
 if(![HALLOWEEN_PACK.featurePath,HALLOWEEN_PACK.openPath,HALLOWEEN_PACK.receiptPath,HALLOWEEN_PACK.adminPath].includes(path))return null;
 try{
  if(path===HALLOWEEN_PACK.openPath){
   if(request.method!=='POST')return deps.json({error:'지원하지 않는 요청입니다.'},405);
   if(!HALLOWEEN_PACK_SHOP_ENABLED)return deps.json({code:'MERCENARY_HALLOWEEN_SHOP_REMOVED',error:'할로윈팩 판매가 종료되었습니다. 기존 구매 결과는 다시 확인할 수 있습니다.'},423,{'cache-control':'no-store'});
   if(!HALLOWEEN_PACK_RELEASE_ENABLED)return deps.json({code:'MERCENARY_HALLOWEEN_CLOSED',error:'할로윈 리미티드 용병팩은 출시 준비 중입니다. 코인은 차감되지 않았습니다.'},423,{'cache-control':'no-store'});
   const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
   const body=await readJointBody(request,{maxBytes:2048,fields:['requestId','count','expectedRevision']});
   return deps.json(await deps.withUserMutationLock(env,user.id,path,()=>service.open(env,user,body)),200,{'cache-control':'no-store'});
  }
  if(path===HALLOWEEN_PACK.receiptPath){
   if(request.method!=='GET')return deps.json({error:'지원하지 않는 요청입니다.'},405);
   const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
   return deps.json(await service.receipt(env,user,new URL(request.url).searchParams.get('requestId')),200,{'cache-control':'no-store'});
  }
  if(path===HALLOWEEN_PACK.adminPath){
   const actor=await deps.requirePermission(request,env,'BATTLE_MANAGE');
   if(!actor||actor.role!=='OWNER')return deps.json({error:'할로윈 팩 설정은 OWNER만 관리할 수 있습니다.'},403);
   if(request.method==='PATCH')return deps.json(publicState(await saveHalloweenPack(env,actor,await readJointBody(request,{maxBytes:12000}))),200,{'cache-control':'no-store'});
  }
  if(request.method!=='GET')return deps.json({error:'지원하지 않는 요청입니다.'},405);
  return deps.json(publicState(await readHalloweenPackState(env)),200,{'cache-control':'no-store'});
 }catch(e){return jointResponseError(e,deps.json);}
}
