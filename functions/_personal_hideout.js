import {HIDEOUT_KEY,HIDEOUT_STAGES,emptyHideout,hideoutState,hideoutBenefits,hideoutAward,publicHideout,changeHideout} from '../shared/personal-hideout-v1.mjs';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {jointHash} from './_joint_transactions.js';
import {readJointBody} from './_joint_request.js';
import {readTrophyHonors} from './_trophy_honors.js';
import {TROPHY_CATALOG} from '../js/player-card-model-v2052.js?v=20261101-renewal1';

const p=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
export const hideoutEnabled=env=>env.PERSONAL_HIDEOUT_ENABLED===true||env.PERSONAL_HIDEOUT_ENABLED==='1';
export async function readHideout(env,uid){
 const row=await p(env,'SELECT value FROM app_meta WHERE key=?',HIDEOUT_KEY(uid)).first();
 return {raw:row?.value??null,state:hideoutState(row?JSON.parse(row.value):null)};
}
export async function readHideoutBenefits(env,uid){return hideoutBenefits(hideoutEnabled(env)?(await readHideout(env,uid)).state:null);}
export async function hideoutTrophies(env,uid){
 const honors=await readTrophyHonors(env,uid);
 return TROPHY_CATALOG.filter(t=>Number(honors[t.code]?.count)>0).map(t=>({code:t.code,name:t.name,image:t.art,count:Number(honors[t.code].count)}));
}

// Server-confirmed events only. These statements join the original reward
// transaction; an event receipt and the material delta can never commit apart.
// SQL applies deltas to the latest JSON row, without a read per swept battle.
export function hideoutAwardStatements(env,event,{guard='1=1',values=[],now=Date.now()}={}){
 const gains=hideoutEnabled(env)?hideoutAward(event):null;if(!gains)return [];
 const uid=Number(event.userId);
 if(!Number.isSafeInteger(uid)||uid<1||typeof event.eventId!=='string'||!event.eventId||event.eventId.length>220)throw Error('Invalid hideout combat event');
 const key=HIDEOUT_KEY(uid),receipt='personal_hideout_reward_v1:'+uid+':'+event.source+':'+event.eventId;
 const token=crypto.randomUUID(),raw=JSON.stringify({version:1,token,source:event.source,eventId:event.eventId,gains});
 const entries=Object.entries(gains),pg=env.DB.dialect==='postgres';
 // A day counts at the original server settlement, in the same conditional
 // update as its salvage. A replay cannot add a new day even after midnight.
 const day=Math.floor((now+9*3600000)/86400000);
 if(!Number.isSafeInteger(day)||day<0)throw Error('Invalid settlement date');
 const dayLimit=HIDEOUT_STAGES.at(-1).activeDays;
 let expression;
 if(pg){
  const json='CAST(value AS JSONB)';
  const parts=entries.map(([code,amount])=>"'"+code+"',LEAST(1000000000,COALESCE(CAST("+json+" #>> '{parts,"+code+"}' AS BIGINT),0)+"+amount+')').join(',');
  expression="jsonb_set(jsonb_set("+json+",'{parts}',("+json+"->'parts') || jsonb_build_object("+parts+")),'{revision}',to_jsonb(CAST("+json+"->>'revision' AS BIGINT)+1))";
  const dates="COALESCE("+json+"->'activityDates','[]'::jsonb)";
  const updated="CASE WHEN jsonb_array_length("+dates+")<"+dayLimit+" AND NOT ("+dates+" @> jsonb_build_array("+day+")) THEN "+dates+" || jsonb_build_array("+day+") ELSE "+dates+" END";
  expression="CAST(jsonb_set("+expression+",'{activityDates}',"+updated+") AS TEXT)";
 }else{
  expression="json_set(value,'$.revision',json_extract(value,'$.revision')+1,"+entries.map(([code,amount])=>"'$.parts."+code+"',MIN(1000000000,COALESCE(json_extract(value,'$.parts."+code+"'),0)+"+amount+')').join(',')+')';

  const dates="COALESCE(json_extract(app_meta.value,'$.activityDates'),'[]')";
  const updated="CASE WHEN json_array_length("+dates+")<"+dayLimit+" AND NOT EXISTS(SELECT 1 FROM json_each("+dates+") AS days WHERE days.value="+day+") THEN json_insert("+dates+",'$[#]',"+day+") ELSE "+dates+" END";
  expression="json_set("+expression+",'$.activityDates',json("+updated+"))";
 }
 const writes=[
  p(env,'INSERT INTO app_meta(key,value,updated_at) SELECT ?,?,CURRENT_TIMESTAMP WHERE '+guard+' ON CONFLICT(key) DO NOTHING',key,JSON.stringify(emptyHideout()),...values),
  p(env,'INSERT INTO app_meta(key,value,updated_at) SELECT ?,?,CURRENT_TIMESTAMP WHERE '+guard+' ON CONFLICT(key) DO NOTHING',receipt,raw,...values),
  p(env,'UPDATE app_meta SET value='+expression+',updated_at=CURRENT_TIMESTAMP WHERE key=? AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',key,receipt,raw),
  p(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',JSON.stringify({version:1,source:event.source,eventId:event.eventId,gains,applied:true}),receipt,raw)
 ];
 writes.hideoutAward=gains;writes.hideoutReceipt=receipt;return writes;
}
export async function mutateHideout(env,uid,action,body){
 if(!hideoutEnabled(env))throw Object.assign(Error('은신처를 준비하고 있습니다.'),{code:'HIDEOUT_CLOSED',status:423});
 if(typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId))throw Object.assign(Error('요청 번호를 확인하세요.'),{code:'HIDEOUT_INPUT',status:400});
 const key='personal_hideout_mutation_v1:'+uid+':'+body.requestId;
 const {requestId,...payload}=body,input={action,...payload},hash=await jointHash(input);
 const replay=async()=>{
  const row=await p(env,'SELECT value FROM app_meta WHERE key=?',key).first();if(!row)return null;
  const saved=JSON.parse(row.value);
  if(saved.hash!==hash)throw Object.assign(Error('같은 요청 번호로 다른 작업을 할 수 없습니다.'),{code:'HIDEOUT_REQUEST_CONFLICT',status:409});
  return {...saved.response,...publicHideout(saved.response.state),replayed:true};
 };
 const old=await replay();if(old)return old;
 const before=await readHideout(env,uid),token=crypto.randomUUID(),ownedTrophies=action==='trophy'?await hideoutTrophies(env,uid):[];
 const state={...changeHideout(before.state,action,body,{newId:token,ownedTrophies}),mutationToken:token};
 const response={ok:true,action,requestId:body.requestId,...publicHideout(state)};
 await ensureJointAtomicSchema(env);
 const raw=JSON.stringify(state),stateKey=HIDEOUT_KEY(uid);
 const cas=before.raw===null?p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',stateKey,raw):p(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',raw,stateKey,before.raw);
 const writes=[cas,jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[stateKey,raw]),
  p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,JSON.stringify({hash,response})),
  jointGuardEnd(env.DB,token)];
 if(env.DB.dialect==='postgres')writes.unshift(p(env,'SELECT id FROM users WHERE id=? FOR UPDATE',uid));
 try{await env.DB.batch(writes);}catch(error){
  const saved=await replay();if(saved)return saved;
  if(/joint_atomic_guards|unique|duplicate|constraint/i.test(error.message))throw Object.assign(Error('은신처 상태가 변경됐습니다. 새로 확인한 뒤 다시 시도하세요.'),{code:'HIDEOUT_CONFLICT',status:409});
  throw error;
 }
 return response;
}
export async function handlePersonalHideout({path,request,env,deps}){
 if(path!=='hideout'&&!path.startsWith('hideout/'))return null;
 const reply=(data,status=200)=>deps.json(data,status,{'cache-control':'private, no-store'});
 try{
  const user=await deps.authenticate(request,env);if(!user)return reply({error:'로그인이 필요합니다.'},401);
  if(path==='hideout'&&request.method==='GET')return reply({ok:true,enabled:hideoutEnabled(env),...publicHideout((await readHideout(env,user.id)).state),trophyCatalog:TROPHY_CATALOG.map(t=>({code:t.code,name:t.name,image:t.art}))});
  if(path==='hideout/trophies'&&request.method==='GET')return reply({ok:true,trophies:await hideoutTrophies(env,user.id)});
  const action=path.slice(8);
  const fields={upgrade:['target','room'],arrange:['placements'],expand:['room'],decorate:['item','room'],trophy:['id','trophyCode','slot']};
  if(request.method!=='POST'||!Object.hasOwn(fields,action))return reply({error:'지원하지 않는 은신처 요청입니다.'},405);
  const body=await readJointBody(request,{fields:['requestId','revision',...fields[action]],maxBytes:32768});
  return reply(await deps.withUserMutationLock(env,user.id,path,()=>mutateHideout(env,user.id,action,body)));
 }catch(error){
  const known=/^(HIDEOUT|JOINT)_/.test(error.code||'');
  if(!known)console.error('[personal hideout]',error.name);
  return reply({error:known?error.message:'은신처를 불러오지 못했습니다. 다시 시도하세요.',code:known?error.code:'HIDEOUT_RETRY'},known?(error.status||400):503);
 }
}
