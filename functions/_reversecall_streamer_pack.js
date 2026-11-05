import {BLACKCROWN_PACK_KEY} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {BLACKCROWN_LIMITED_CARDS} from '../shared/mercenary-blackcrown-pool-v3.mjs';
import {STREAMER_PACK,STREAMER_PACK_KEY,STREAMER_OPEN_KIND,STREAMER_STOCK_PREFIX,streamerStockCode,streamerPackInitial,validateStreamerPackDocument,streamerPackState,streamerPackCatalogRow} from '../shared/reversecall-streamer-pack-v1.mjs';
import {readBlackcrownPackState} from './_mercenary_blackcrown_pack.js';
import {createBlackcrownPackService} from './_mercenary_blackcrown_opening.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointHash} from './_joint_transactions.js';
import {jointError,jointResponseError,readJointBody} from './_joint_request.js';

export const STREAMER_REGISTRATION_KEY='ops:reversecall-streamer-pack:20261105:v1';
const accessMessage='리버스랜드에 등록된 스트리머만 개봉할 수 있습니다.';
const activeSql=DB=>"u.status='ACTIVE' AND (u.banned_until IS NULL OR "+(DB.dialect==='postgres'?'u.banned_until::timestamptz<=clock_timestamp()':"datetime(u.banned_until)<=datetime('now')")+")";
export async function streamerPackAccess(DB,userId){
 if(!userId)return {allowed:false,reason:accessMessage};
 const row=await DB.prepare('SELECT a.user_id FROM soopketland_accounts a JOIN users u ON u.id=a.user_id WHERE a.user_id=? AND '+activeSql(DB)).bind(userId).first();
 return {allowed:Boolean(row),reason:row?null:accessMessage};
}
export async function readStreamerStockSnapshot(env){
 const DB=env.DB,codes=BLACKCROWN_LIMITED_CARDS.map(c=>streamerStockCode(c.code));
 const rows='SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code IN ('+codes.map(()=>'?').join(',')+') ORDER BY code';
 const aggregate=DB.dialect==='postgres'?"COALESCE(json_agg(s),'[]'::json)::text":"COALESCE(json_group_array(json_object('code',code,'stock_limit',stock_limit,'issued',issued,'revision',revision)),'[]')";
 const result=await DB.prepare('SELECT (SELECT value FROM app_meta WHERE key=?) AS value,(SELECT '+aggregate+' FROM ('+rows+') s) AS stock_json').bind(STREAMER_PACK_KEY,...codes).first();
 return {raw:result.value??null,stock:JSON.parse(result.stock_json).map(s=>({...s,code:s.code.slice(STREAMER_STOCK_PREFIX.length)}))};
}
export async function readStreamerPackState(env,{userId=null}={}){
 const [source,snapshot,access]=await Promise.all([readBlackcrownPackState(env,{userId}),readStreamerStockSnapshot(env),streamerPackAccess(env.DB,userId)]);
 const doc=validateStreamerPackDocument(snapshot.raw?JSON.parse(snapshot.raw):streamerPackInitial());
 const state=streamerPackState(source.settings,doc,snapshot.stock,source.normalCards,{ownedCodes:source.ownedCodes});
 return {...state,revision:doc.revision+source.revision,documentRevision:doc.revision,sourceRevision:source.revision,updatedAt:doc.updatedAt,rawPack:snapshot.raw,rawDocument:doc,policySnapshots:source.rawPack?[{key:BLACKCROWN_PACK_KEY,value:source.rawPack}]:[],normalCmsRevision:source.normalCmsRevision,normalDrawRevision:source.normalDrawRevision,serverNow:source.serverNow,personalOddsKnown:Boolean(userId),access,userOpeningEnabled:Boolean(snapshot.raw&&source.rawPack&&state.userOpeningEnabled&&access.allowed),stockSchedules:[],oneTimeRewardState:null,oneTimeReward:null};
}
const safeState=state=>{const {rawPack,rawDocument,policySnapshots,...safe}=state;return {...safe,id:STREAMER_PACK.id,name:STREAMER_PACK.name,packSettings:state.settings};};
export async function streamerPackShopRow(env){
 const state=await readStreamerPackState(env);
 return {...streamerPackCatalogRow(state.settings,state.rawDocument,state.stock.map(s=>({code:s.code,stock_limit:s.limit,issued:s.issued})).filter(s=>state.stock.find(r=>r.code===s.code).prepared)),drawEnabled:Boolean(state.rawPack&&state.settings.mode==='ON'&&state.readiness.ready),sourceRevision:state.sourceRevision};
}
const validateState=state=>{if(!state.access.allowed)throw Object.assign(jointError('MERCENARY_STREAMER_ACCESS',accessMessage,403),{terminal:true});};
export function streamerPackTransactionStatements(DB,user){
 const p=(sql,...args)=>DB.prepare(sql).bind(...args),token=crypto.randomUUID(),list=[];
 if(DB.dialect==='postgres')list.push(p('SELECT user_id FROM soopketland_accounts WHERE user_id=? FOR SHARE',user.id));
 list.push(jointGuard(DB,token,'EXISTS(SELECT 1 FROM soopketland_accounts a JOIN users u ON u.id=a.user_id WHERE a.user_id=? AND '+activeSql(DB)+')',[user.id]),jointGuardEnd(DB,token));
 return list;
}
export function createStreamerPackService(options={}){
 return createBlackcrownPackService({...options,readState:options.readState||readStreamerPackState,variant:{pack:STREAMER_PACK,packKey:STREAMER_PACK_KEY,openKind:STREAMER_OPEN_KIND,stockPrefix:STREAMER_STOCK_PREFIX,validateState,transactionStatements:streamerPackTransactionStatements}});
}
export async function saveStreamerPack(env,actor,body){
 if(actor?.role!=='OWNER')throw jointError('MERCENARY_STREAMER_ADMIN','OWNER만 관리할 수 있습니다.',403);
 const keys=['requestId','expectedRevision','mode','additions','reason'];
 if(!body||Object.keys(body).sort().join(',')!==keys.sort().join(',')||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId)||!Number.isSafeInteger(body.expectedRevision)||!['ON','OFF'].includes(body.mode)||typeof body.reason!=='string'||body.reason.trim().length<4||body.reason.length>500||/[\u0000-\u001f]/.test(body.reason)||!Array.isArray(body.additions)||body.additions.length>8||new Set(body.additions.map(c=>c?.code)).size!==body.additions.length||body.additions.some(c=>!c||Object.keys(c).sort().join(',')!=='code,quantity'||!BLACKCROWN_LIMITED_CARDS.some(card=>card.code===c.code)||!Number.isSafeInteger(c.quantity)||c.quantity<1||c.quantity>10000))throw jointError('MERCENARY_STREAMER_CONFIG','판매 상태·추가 수량·저장 사유를 확인하세요.');
 const DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args),receiptKey=STREAMER_PACK_KEY+':save:'+body.requestId,hash=await jointHash({actor:Number(actor.id),...body});
 const replay=async()=>{const row=await p('SELECT value FROM app_meta WHERE key=?',receiptKey).first();if(!row)return false;if(JSON.parse(row.value).hash!==hash)throw jointError('MERCENARY_STREAMER_CONFLICT','같은 요청 번호에 다른 내용이 있습니다.',409);return true;};
 if(await replay())return {...await readStreamerPackState(env),replayed:true};
 const before=await readStreamerPackState(env);
 if(!before.rawPack||before.revision!==body.expectedRevision)throw jointError('MERCENARY_STREAMER_CONFLICT','설정이 변경됐습니다. 다시 불러오세요.',409);
 const next=structuredClone(before.rawDocument);next.revision++;next.mode=body.mode;next.updatedAt=new Date().toISOString();next.updatedBy=Number(actor.id);
 for(const change of body.additions)next.stockLimits[change.code]+=change.quantity;
 validateStreamerPackDocument(next);
 if(next.mode==='ON'&&!before.readiness.ready)throw jointError('MERCENARY_STREAMER_CONFIG',before.readiness.blockers.join(' '),409);
 const after=JSON.stringify(next),token=crypto.randomUUID(),list=[];
 if(DB.dialect==='postgres')list.push(p('SELECT key FROM app_meta WHERE key=? FOR UPDATE',STREAMER_PACK_KEY));
 list.push(p('UPDATE app_meta SET value=? WHERE key=? AND value=?',after,STREAMER_PACK_KEY,before.rawPack),jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[STREAMER_PACK_KEY,after]));
 for(const change of body.additions){const code=streamerStockCode(change.code),guard=token+':'+change.code;list.push(p('UPDATE mercenary_limited_stock_v1 SET stock_limit=?,revision=revision+1,last_token=? WHERE code=? AND stock_limit=? AND issued<=stock_limit',next.stockLimits[change.code],guard,code,before.rawDocument.stockLimits[change.code]),jointGuard(DB,guard,'EXISTS(SELECT 1 FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?)',[code,guard]),jointGuardEnd(DB,guard));}
 list.push(p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',actor.id,'REVERSECALL_STREAMER_PACK_SAVE','SETTING',STREAMER_PACK_KEY,before.rawPack,JSON.stringify({...next,additions:body.additions,reason:body.reason,requestId:body.requestId})),p('INSERT INTO app_meta(key,value) VALUES(?,?)',receiptKey,JSON.stringify({hash,revision:next.revision})),jointGuardEnd(DB,token));
 try{await DB.batch(list);}catch(error){if(await replay())return {...await readStreamerPackState(env),replayed:true};if((await readStreamerPackState(env)).rawPack!==before.rawPack)throw jointError('MERCENARY_STREAMER_CONFLICT','설정이 변경됐습니다. 다시 불러오세요.',409);throw error;}
 return {...await readStreamerPackState(env),replayed:false};
}
// Explicit, audited one-time registration; never called by an HTTP read.
export async function registerStreamerPack(env,actor){
 const DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args);
 const prior=await p('SELECT value FROM app_meta WHERE key=?',STREAMER_REGISTRATION_KEY).first();
 if(prior)return {...JSON.parse(prior.value),replayed:true};
 if(actor?.role!=='OWNER')throw Error('OWNER registration required');
 const source=await readBlackcrownPackState(env),doc={...streamerPackInitial(),mode:'ON',updatedAt:new Date().toISOString(),updatedBy:Number(actor.id)};
 const stock=BLACKCROWN_LIMITED_CARDS.map(c=>({code:c.code,stock_limit:doc.stockLimits[c.code],issued:0}));
 if(!source.rawPack||!streamerPackState(source.settings,doc,stock,source.normalCards).readiness.ready)throw Error('Source pack must be configured before registration');
 const token=crypto.randomUUID(),value=JSON.stringify(doc),receipt={key:STREAMER_REGISTRATION_KEY,packId:STREAMER_PACK.id,registeredAt:doc.updatedAt,limits:doc.stockLimits,sourceRevision:source.revision,sourcePolicy:BLACKCROWN_PACK_KEY,mode:'ON'};
 const list=[jointGuard(DB,token,'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[STREAMER_PACK_KEY]),p('INSERT INTO app_meta(key,value) VALUES(?,?)',STREAMER_PACK_KEY,value)];
 for(const row of stock)list.push(p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,?)',streamerStockCode(row.code),row.stock_limit));
 list.push(p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',actor.id,'REVERSECALL_STREAMER_PACK_REGISTER','SETTING',STREAMER_PACK_KEY,null,JSON.stringify(receipt)),p('INSERT INTO app_meta(key,value) VALUES(?,?)',STREAMER_REGISTRATION_KEY,JSON.stringify(receipt)),jointGuardEnd(DB,token));
 await DB.batch(list);return {...receipt,replayed:false};
}
const service=createStreamerPackService();
export async function handleStreamerPack({path,request,env,deps}){
 if(![STREAMER_PACK.featurePath,STREAMER_PACK.openPath,STREAMER_PACK.receiptPath,STREAMER_PACK.adminPath].includes(path))return null;
 try{
  if(path===STREAMER_PACK.adminPath){
   const actor=await deps.requirePermission(request,env,'BATTLE_MANAGE');
   if(!actor||actor.role!=='OWNER')return deps.json({error:'OWNER만 관리할 수 있습니다.'},403);
   if(request.method==='GET')return deps.json(safeState(await readStreamerPackState(env)),200,{'cache-control':'no-store'});
   if(request.method==='PATCH')return deps.json(safeState(await saveStreamerPack(env,actor,await readJointBody(request,{maxBytes:8000}))),200,{'cache-control':'no-store'});
  }else if(path===STREAMER_PACK.featurePath&&request.method==='GET'){
   const viewer=await deps.authenticate(request,env);return deps.json(safeState(await readStreamerPackState(env,{userId:viewer?.id})),200,{'cache-control':'no-store'});
  }else if(path===STREAMER_PACK.openPath&&request.method==='POST'){
   const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
   const body=await readJointBody(request,{maxBytes:2048,fields:['requestId','count','expectedRevision','budget']});
   return deps.json(await deps.withUserMutationLock(env,user.id,path,()=>service.open(env,user,body)),200,{'cache-control':'no-store'});
  }else if(path===STREAMER_PACK.receiptPath&&request.method==='GET'){
   const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
   return deps.json(await service.receipt(env,user,new URL(request.url).searchParams.get('requestId')),200,{'cache-control':'no-store'});
  }
  return deps.json({error:'지원하지 않는 요청입니다.'},405);
 }catch(error){return jointResponseError(error,deps.json);}
}
