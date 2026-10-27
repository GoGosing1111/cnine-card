import {BLACKCROWN_CODES} from '../shared/mercenary-blackcrown-catalog-v1.mjs';
import {blackcrownOwnedCodes} from '../shared/mercenary-blackcrown-ownership-v1.mjs';
import {BLACKCROWN_LIMITED_CARDS} from '../shared/mercenary-blackcrown-pool-v3.mjs';
import {BLACKCROWN_PACK,BLACKCROWN_PACK_KEY,BLACKCROWN_PACK_RELEASE_ENABLED,blackcrownPackDraft,validateBlackcrownPack,blackcrownPackState,blackcrownPackCatalogRow,blackcrownPackReadiness} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {readMercenaryDocument} from './_mercenary_account.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {validateMercenaryCardRules} from '../shared/mercenary-draw-policy-v1.mjs';
import {createBlackcrownPackService} from './_mercenary_blackcrown_opening.js';
import {jointHash} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError,readJointBody,jointResponseError} from './_joint_request.js';
import {processMercenaryStockSchedules,changeMercenaryStockSchedule,readBlackcrownStockSnapshot} from './_mercenary_blackcrown_stock_schedule.js';

const initial=()=>({revision:1,settings:blackcrownPackDraft(),updatedAt:null});
export async function readBlackcrownPackState(env,{releaseEnabled=BLACKCROWN_PACK_RELEASE_ENABLED,userId=null}={}){
 const scheduling=await processMercenaryStockSchedules(env);
 const [{row,stock},cms,normalDraw,owned]=await Promise.all([
  readBlackcrownStockSnapshot(env),
  readMercenaryDocument(env),env.DB.prepare('SELECT payload_json,revision FROM mercenary_draw_config_v1 WHERE id=1').first(),
  userId?env.DB.prepare('SELECT mercenary_code,total_copies FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code IN ('+BLACKCROWN_CODES.map(()=>'?').join(',')+') AND total_copies>0').bind(userId,...BLACKCROWN_CODES).all():{results:[]}
 ]);
 const saved=row?JSON.parse(row.value):initial();
 const rules=normalDraw?validateMercenaryCardRules(JSON.parse(normalDraw.payload_json).cardRules,MERCENARY_CMS_SEED.catalog.cards.map(c=>c.code)):null;
 const normalCards=rules?limitedNormalCards(cms.document.mercenaries,MERCENARY_CMS_SEED.catalog.cards,rules):[];
 return {revision:saved.revision,updatedAt:saved.updatedAt,rawPack:row?.value??null,normalCmsRevision:cms.revision,normalDrawRevision:Number(normalDraw?.revision||0),serverNow:scheduling.serverNow,stockScheduleHistory:scheduling.document.schedules,stockSchedules:scheduling.document.schedules.filter(s=>s.status==='SCHEDULED').map(({id,executeAt,changes})=>({id,executeAt,changes})),personalOddsKnown:Boolean(userId),...blackcrownPackState(saved.settings,stock,normalCards,{releaseEnabled,ownedCodes:blackcrownOwnedCodes(owned.results)})};
}
const publicState=(state,{admin=false}={})=>{const {rawPack,stockScheduleHistory,...safe}=state;return {...safe,...(admin?{stockScheduleHistory}:{}),id:state.pack.id,name:state.pack.name,packSettings:state.settings};};
export async function blackcrownPackShopRow(env){
 await processMercenaryStockSchedules(env);
 const {row,stock}=await readBlackcrownStockSnapshot(env);
 return blackcrownPackCatalogRow(row?JSON.parse(row.value).settings:blackcrownPackDraft(),stock);
}
export async function saveBlackcrownPack(env,actor,body){
 if(!body||Object.keys(body).sort().join(',')!=='expectedRevision,reason,requestId,settings'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>=2147483646||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId)||typeof body.reason!=='string'||body.reason.trim().length<4||body.reason.length>500||/[\u0000-\u001f]/.test(body.reason))throw jointError('MERCENARY_BLACKCROWN_CONFIG','현재 버전·요청 번호·저장 사유를 확인하세요.');
 let settings;try{settings=validateBlackcrownPack(body.settings);}catch(e){throw jointError('MERCENARY_BLACKCROWN_CONFIG',e.message);}
 const receiptKey=BLACKCROWN_PACK_KEY+':save:'+body.requestId,hash=await jointHash({actor:Number(actor.id),...body,requestId:undefined});
 const prior=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first();
 if(prior){if(JSON.parse(prior.value).hash!==hash)throw jointError('MERCENARY_BLACKCROWN_CONFLICT','같은 요청 번호에 다른 내용이 있습니다.',409);return {...await readBlackcrownPackState(env),replayed:true};}
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(BLACKCROWN_PACK_KEY).first(),beforeText=row?.value??JSON.stringify(initial()),before=JSON.parse(beforeText);
 if(before.revision!==body.expectedRevision)throw jointError('MERCENARY_BLACKCROWN_CONFLICT','다른 창에서 설정을 변경했습니다. 새로 불러오세요.',409);
 if(BLACKCROWN_CODES.some(code=>settings.stockLimits[code]!==before.settings.stockLimits[code]))throw jointError('MERCENARY_BLACKCROWN_CONFIG','발행 한도는 한정 수량 예약에서 변경하세요.');
 if(settings.mode==='ON'){const state=await readBlackcrownPackState(env),ready=blackcrownPackReadiness(settings,state.stock,state.normalCards);if(!ready.ready)throw jointError('MERCENARY_BLACKCROWN_CONFIG',ready.blockers.join(' '));}
 const next={revision:before.revision+1,settings,updatedAt:new Date().toISOString(),updatedBy:Number(actor.id),lastRequestId:body.requestId},afterText=JSON.stringify(next),DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID();
 try{await DB.batch([
  p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',BLACKCROWN_PACK_KEY,beforeText),
  p('UPDATE app_meta SET value=? WHERE key=? AND value=?',afterText,BLACKCROWN_PACK_KEY,beforeText),
  jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[BLACKCROWN_PACK_KEY,afterText]),
  p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',actor.id,'MERCENARY_BLACKCROWN_PACK_SAVE','SETTING',BLACKCROWN_PACK_KEY,beforeText,JSON.stringify({...next,reason:body.reason.trim(),requestId:body.requestId})),
  p('INSERT INTO app_meta(key,value) VALUES(?,?)',receiptKey,JSON.stringify({hash,revision:next.revision})),jointGuardEnd(DB,token)
 ]);}catch(e){
  const saved=await p('SELECT value FROM app_meta WHERE key=?',receiptKey).first();
  if(saved&&JSON.parse(saved.value).hash===hash)return {...await readBlackcrownPackState(env),replayed:true};
  const current=await p('SELECT value FROM app_meta WHERE key=?',BLACKCROWN_PACK_KEY).first();
  if(current&&JSON.parse(current.value).revision!==before.revision)throw jointError('MERCENARY_BLACKCROWN_CONFLICT','다른 창에서 설정을 변경했습니다. 새로 불러오세요.',409);
  throw e;
 }
 return {...await readBlackcrownPackState(env),replayed:false};
}
const service=createBlackcrownPackService({readState:readBlackcrownPackState});
export async function handleBlackcrownPack({path,request,env,deps}){
 if(![BLACKCROWN_PACK.featurePath,BLACKCROWN_PACK.openPath,BLACKCROWN_PACK.receiptPath,BLACKCROWN_PACK.adminPath].includes(path))return null;
 try{
  if(path===BLACKCROWN_PACK.openPath){
   if(request.method!=='POST')return deps.json({error:'지원하지 않는 요청입니다.'},405);
   if(!BLACKCROWN_PACK_RELEASE_ENABLED)return deps.json({code:'MERCENARY_BLACKCROWN_CLOSED',error:'블랙크라운팩은 출시 준비 중입니다. 코인은 차감되지 않았습니다.'},423,{'cache-control':'no-store'});
   const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
   const body=await readJointBody(request,{maxBytes:2048,fields:['requestId','count','expectedRevision','budget']});
   return deps.json(await deps.withUserMutationLock(env,user.id,path,()=>service.open(env,user,body)),200,{'cache-control':'no-store'});
  }
  if(path===BLACKCROWN_PACK.receiptPath){
   if(request.method!=='GET')return deps.json({error:'지원하지 않는 요청입니다.'},405);
   const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
   return deps.json(await service.receipt(env,user,new URL(request.url).searchParams.get('requestId')),200,{'cache-control':'no-store'});
  }
  if(path===BLACKCROWN_PACK.adminPath){
   const actor=await deps.requirePermission(request,env,'BATTLE_MANAGE');
   if(!actor||actor.role!=='OWNER')return deps.json({error:'블랙크라운팩 설정은 OWNER만 관리할 수 있습니다.'},403);
   if(request.method==='POST'){
    await changeMercenaryStockSchedule(env,actor,await readJointBody(request,{maxBytes:12000}));
    return deps.json(publicState(await readBlackcrownPackState(env),{admin:true}),200,{'cache-control':'no-store'});
   }
   if(request.method==='PATCH')return deps.json(publicState(await saveBlackcrownPack(env,actor,await readJointBody(request,{maxBytes:12000})),{admin:true}),200,{'cache-control':'no-store'});
   if(request.method==='GET')return deps.json(publicState(await readBlackcrownPackState(env),{admin:true}),200,{'cache-control':'no-store'});
  }
  if(request.method!=='GET')return deps.json({error:'지원하지 않는 요청입니다.'},405);
  const viewer=await deps.authenticate(request,env);
  return deps.json(publicState(await readBlackcrownPackState(env,{userId:viewer?.id})),200,{'cache-control':'no-store'});
 }catch(e){return jointResponseError(e,deps.json);}
}
