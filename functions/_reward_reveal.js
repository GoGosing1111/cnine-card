import {CORE_REWARD_DEFAULT,validateCoreRewardPolicy,drawCoreRewards,minimumCoreReward} from '../shared/core-raid-reward-policy-v1.mjs';
import {REWARD_REVEAL_CONTENTS,rewardRevealContent} from '../shared/reward-reveal-contents-v1.mjs';
import {CORE_REWARD_KEY,coreRewardCatalog,saveCoreRewardPolicy,prepareCoreChoiceGrant} from './_core_raid_rewards.js';
import {mercenaryRandomInt} from './_mercenary_draw_accounting.js';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {readJointBody,jointError} from './_joint_request.js';

const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const raw=async(env,key)=>(await stmt(env,'SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;
const fail=(message,status=400)=>{throw jointError('REWARD_REVEAL',message,status);};
const policyKey=content=>content==='CORE'?CORE_REWARD_KEY:'reward_reveal_policy_v1:'+content;
const offerKey=(uid,id)=>`reward_reveal_offer_v1:${Number(uid)}:${id}`;
const pendingPrefix=uid=>`reward_reveal_pending_v1:${Number(uid)}:`;
const pendingKey=offer=>pendingPrefix(offer.userId)+offer.offerId;
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
export async function readRewardRevealPolicy(env,content){
 if(!rewardRevealContent(content))fail('연결할 콘텐츠를 선택하세요.');
 const value=await raw(env,policyKey(content));
 return value===null?structuredClone(CORE_REWARD_DEFAULT):validateCoreRewardPolicy(JSON.parse(value));
}

// A clear snapshots the pool before combat. Only this private settlement path
// creates an entitlement, in the same transaction as the existing clear quota.
export async function prepareRewardRevealContext(env,content,snapshot,live){
 if(!live||!snapshot?.enabled)return {enabled:false,statements:[]};
 const policy=validateCoreRewardPolicy(snapshot),key=policyKey(content),current=await raw(env,key);
 if(current===null||!validateCoreRewardPolicy(JSON.parse(current)).enabled)return {enabled:false,statements:[]};
 const guard=crypto.randomUUID();
 return {enabled:true,content,policy,statements:[jointGuard(env.DB,guard,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,current]),jointGuardEnd(env.DB,guard)]};
}
export function prepareRewardRevealOffer(env,context,{userId,roomId,baseReward,quota,finishedAt}){
 if(!context.enabled)return {statements:[],offer:null};
 const offer={version:1,offerId:crypto.randomUUID(),userId:Number(userId),roomId,content:context.content,revision:context.policy.revision,
  choices:drawCoreRewards(context.policy,mercenaryRandomInt),minimum:minimumCoreReward(context.policy),selectedIndex:null,result:null,
  baseReward,quota,createdAt:finishedAt};
 const pending={offerId:offer.offerId,content:offer.content,roomId,createdAt:finishedAt};
 return {offer:publicOffer(offer),statements:[
  stmt(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',offerKey(userId,offer.offerId),JSON.stringify(offer)),
  stmt(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',pendingKey(offer),JSON.stringify(pending))
 ]};
}
function publicOffer(offer){
 return {enabled:true,offerId:offer.offerId,content:offer.content,roomId:offer.roomId,revision:offer.revision,slots:[0,1,2],selectedIndex:offer.selectedIndex,
  baseReward:offer.baseReward,quota:offer.quota,result:offer.result};
}
async function loadOffer(env,userId,id){
 if(!validId(id))fail('보상 봉인을 확인하세요.');
 const value=await raw(env,offerKey(userId,id));if(value===null)fail('이 계정의 보상 봉인을 찾을 수 없습니다.',404);
 const offer=JSON.parse(value);if(offer.userId!==Number(userId))fail('내 보상만 수령할 수 있습니다.',403);
 return {value,offer};
}
export async function claimRewardReveal(env,user,{offerId,selectedIndex}){
 if(!Number.isInteger(selectedIndex)||selectedIndex<0||selectedIndex>2)fail('봉인 3개 중 하나를 선택하세요.');
 let stored=await loadOffer(env,user.id,offerId);if(stored.offer.result)return stored.offer.result;
 // Commit the first choice independently: even a failed grant keeps that slot.
 if(stored.offer.selectedIndex===null){
  const next={...stored.offer,selectedIndex};
  await stmt(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',JSON.stringify(next),offerKey(user.id,offerId),stored.value).run();
  stored=await loadOffer(env,user.id,offerId);
 }
 if(stored.offer.result)return stored.offer.result;
 if(stored.offer.selectedIndex!==selectedIndex)fail('이미 고른 봉인은 바꿀 수 없습니다. 선택한 봉인을 다시 확인하세요.',409);
 for(let attempt=0;attempt<2;attempt++){
  const plan=await prepareCoreChoiceGrant(env,user,stored.offer,{sourceType:'CONTENT_REVEAL',referenceType:stored.offer.content,reason:rewardRevealContent(stored.offer.content).name+' 선택 보상'});
  const result={ok:true,selectedIndex,choiceReward:plan.reward,reward:stored.offer.baseReward,quota:stored.offer.quota,content:stored.offer.content,offerId};
  const token=crypto.randomUUID(),next=JSON.stringify({...stored.offer,result,settlementToken:token}),key=offerKey(user.id,offerId);
  try{
   await env.DB.batch([
    stmt(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',next,key,stored.value),
    jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,next]),
    ...plan.statements,stmt(env,'DELETE FROM app_meta WHERE key=?',pendingKey(stored.offer)),jointGuardEnd(env.DB,token)
   ]);return result;
  }catch(error){
   stored=await loadOffer(env,user.id,offerId);if(stored.offer.result)return stored.offer.result;
   // One bounded retry also handles a vehicle acquired concurrently elsewhere.
   if(attempt)throw error;
  }
 }
}
async function savePolicy(env,user,body){
 if(!rewardRevealContent(body.content))fail('연결할 콘텐츠를 선택하세요.');
 if(!validId(body.requestId))fail('저장 요청을 다시 확인하세요.');
 let policy;try{policy=validateCoreRewardPolicy(body.policy);}catch(error){fail(error.message);}
 if(body.content==='CORE')return saveCoreRewardPolicy(env,user,{...body,policy});
 const key=policyKey(body.content),auditKey='reward_reveal_config_receipt_v1:'+body.requestId,payload=JSON.stringify({content:body.content,policy});
 const prior=await raw(env,auditKey);
 if(prior){const audit=JSON.parse(prior);if(audit.userId!==Number(user.id)||audit.payload!==payload)fail('같은 저장 요청에 다른 설정이 포함되었습니다.',409);return {ok:true,policy:await readRewardRevealPolicy(env,body.content),replayed:true};}
 const catalog=await coreRewardCatalog(env);
 for(const row of policy.entries)if(policy.enabled&&row.enabled&&catalog[row.rewardType]&&!catalog[row.rewardType].some(item=>item.ref===row.rewardRef))fail('현재 지급할 수 없는 보상입니다: '+row.rewardRef);
 if(policy.enabled&&policy.minimum.rewardType==='MASTER_STAR'&&!catalog.INVENTORY_ITEM.some(item=>item.ref==='MASTER_STAR'))fail('활성 마스터의 별 아이템이 필요합니다.');
 const before=await raw(env,key),current=before===null?CORE_REWARD_DEFAULT:JSON.parse(before);
 if(current.revision!==policy.revision)fail('다른 화면에서 설정이 변경됐습니다. 새로 불러온 뒤 저장하세요.',409);
 const next={...policy,revision:policy.revision+1},token=crypto.randomUUID();await ensureJointAtomicSchema(env);
 try{await env.DB.batch([
  jointGuard(env.DB,token,before===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',before===null?[key]:[key,before]),
  stmt(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',key,JSON.stringify(next)),
  stmt(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',auditKey,JSON.stringify({userId:Number(user.id),payload,before:current,after:next})),jointGuardEnd(env.DB,token)
 ]);}catch(error){const saved=await raw(env,auditKey);if(saved&&JSON.parse(saved).userId===Number(user.id)&&JSON.parse(saved).payload===payload)return {ok:true,policy:await readRewardRevealPolicy(env,body.content),replayed:true};if(await raw(env,key)!==before)fail('설정 저장이 충돌했습니다. 새로 불러온 뒤 저장하세요.',409);throw error;}
 return {ok:true,policy:next};
}
export async function handleRewardReveal({path,request,env,deps}){
 if(path!=='admin/reward-reveal'&&!path.startsWith('rewards/reveal/'))return null;
 const respond=(value,status=200)=>deps.json(value,status,{'cache-control':'no-store'});
 try{
  const user=await deps.authenticate(request,env);if(!user)fail('로그인 후 보상을 확인하세요.',401);
  const url=new URL(request.url);
  if(path==='admin/reward-reveal'){
   if(user.role!=='OWNER')fail('OWNER만 연출 보상을 설정할 수 있습니다.',403);
   if(request.method==='GET'){
    const [catalog,...policies]=await Promise.all([coreRewardCatalog(env),...REWARD_REVEAL_CONTENTS.map(c=>readRewardRevealPolicy(env,c.id))]);
    return respond({ok:true,contents:REWARD_REVEAL_CONTENTS,catalog,policies:Object.fromEntries(REWARD_REVEAL_CONTENTS.map((c,i)=>[c.id,policies[i]]))});
   }
   if(request.method!=='POST')fail('지원하지 않는 요청입니다.',405);
   const body=await readJointBody(request,{maxBytes:65536,fields:['content','policy','requestId']});
   return respond(await deps.withUserMutationLock(env,user.id,path,()=>savePolicy(env,user,body)));
  }
  if(path==='rewards/reveal/pending'&&request.method==='GET'){
   const prefix=pendingPrefix(user.id),after=url.searchParams.get('after');if(after&&!validId(after))fail('보상 목록 위치를 확인하세요.');
   const rows=(await stmt(env,'SELECT value FROM app_meta WHERE key>? AND key<? ORDER BY key LIMIT 51',prefix+(after||''),prefix+'~').all()).results;
   const offers=rows.slice(0,50).map(row=>JSON.parse(row.value));return respond({ok:true,offers,nextCursor:rows.length>50?offers.at(-1).offerId:null});
  }
  if(path==='rewards/reveal/open'&&request.method==='GET')return respond({ok:true,offer:publicOffer((await loadOffer(env,user.id,url.searchParams.get('offerId'))).offer)});
  if(path==='rewards/reveal/claim'&&request.method==='POST'){
   const body=await readJointBody(request,{fields:['offerId','selectedIndex','requestId']});
   return respond(await deps.withUserMutationLock(env,user.id,path,()=>claimRewardReveal(env,user,body)));
  }
  fail('지원하지 않는 보상 요청입니다.',405);
 }catch(error){return respond({ok:false,code:error.code||'REWARD_REVEAL_UNAVAILABLE',error:error.code?error.message:'보상을 확인하지 못했습니다. 선택은 보관되며 다시 수령할 수 있습니다.'},error.status||503);}
}
