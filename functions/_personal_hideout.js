import {HIDEOUT_KEY,emptyHideout,hideoutState,hideoutBenefits,hideoutAward,hideoutDailyAward,HIDEOUT_SKINS,HIDEOUT_STOCK_LIMITS,publicHideout,changeHideout,hideoutUpgradeCoinCost} from '../shared/personal-hideout-v1.mjs';
import {coinInteger} from '../shared/coin-integer-v1.mjs';
import {coinChangeStatements} from './_coin_settlement.js';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {jointHash,jointInventoryChange} from './_joint_transactions.js';
import {readJointBody} from './_joint_request.js';
import {readTrophyHonors} from './_trophy_honors.js';
import {TROPHY_CATALOG} from '../js/player-card-model-v2052.js?v=20261101-renewal1';

const p=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const walletBalance=(env,uid)=>p(env,'SELECT CAST(coin AS TEXT) AS coin_balance FROM users WHERE id=?',uid);
export const hideoutEnabled=env=>env.PERSONAL_HIDEOUT_ENABLED===true||env.PERSONAL_HIDEOUT_ENABLED==='1';
export const hideoutPlunderEnabled=env=>hideoutEnabled(env)&&(env.HIDEOUT_PLUNDER_ENABLED===true||env.HIDEOUT_PLUNDER_ENABLED==='1');
export async function readHideout(env,uid,{withCoin=false}={}){
 const key=HIDEOUT_KEY(uid);
 const row=await (withCoin
  ?p(env,'SELECT m.value,CAST(u.coin AS TEXT) AS coin_balance FROM users u LEFT JOIN app_meta m ON m.key=? WHERE u.id=?',key,uid)
  :p(env,'SELECT value FROM app_meta WHERE key=?',key)).first();
 const raw=row?.value??null,state=hideoutState(raw===null?null:JSON.parse(raw));
 return {raw,state,...(withCoin?{coinBalance:row?.coin_balance??'0'}:{})};
}
export async function readHideoutBenefits(env,uid){return hideoutBenefits(hideoutEnabled(env)?(await readHideout(env,uid)).state:null);}
export async function hideoutTrophies(env,uid){
 const honors=await readTrophyHonors(env,uid);
 return TROPHY_CATALOG.filter(t=>Number(honors[t.code]?.count)>0).map(t=>({code:t.code,name:t.name,image:t.art,count:Number(honors[t.code].count)}));
}

// Server-confirmed events only. These statements join the original reward
// transaction; an event receipt and the material delta can never commit apart.
// SQL applies deltas to the latest JSON row, without a read per swept battle.
export function hideoutAwardStatements(env,event,{guard='1=1',values=[],randomInt}={}){
 if(!hideoutEnabled(env))return [];
 const gains=hideoutAward(event,randomInt),daily=hideoutDailyAward(event,randomInt);
 if(!gains&&!daily)return [];
 const uid=Number(event.userId);
 if(!Number.isSafeInteger(uid)||uid<1||typeof event.eventId!=='string'||!event.eventId||event.eventId.length>220)throw Error('Invalid hideout combat event');
 const standard=gains?rewardStatements(env,uid,event,'personal_hideout_reward_v1:'+uid+':'+event.source+':'+event.eventId,gains,guard,values):[];
 const bonus=daily?[
  ...rewardStatements(env,uid,event,'personal_hideout_daily_v1:'+uid+':'+event.source+':'+daily.day,daily.gains,guard,values),
  ...rewardStatements(env,uid,event,'personal_hideout_daily_v1:'+uid+':STRUCTURE:'+daily.day,{STRUCTURE:1},guard,values)
 ]:[];
 const writes=[...bonus,...standard];
 writes.hideoutAward=standard.hideoutAward;writes.hideoutReceipt=standard.hideoutReceipt;
 return writes;
}
function rewardBalance(code,amount,balance,min,max){
 const limit=HIDEOUT_STOCK_LIMITS[code];
 // A cap limits the award even if a player already holds more than the cap.
 return limit===undefined?`${min}(1000000000,${balance}+${amount})`:`${balance}+${min}(${amount},${max}(0,${limit}-${balance}))`;
}
function rewardStatements(env,uid,event,receipt,gains,guard,values){
 const key=HIDEOUT_KEY(uid),token=crypto.randomUUID();
 const entries=Object.entries(gains),pg=env.DB.dialect==='postgres';
 const capped=entries.some(([code])=>HIDEOUT_STOCK_LIMITS[code]!==undefined);
 const record={version:1,source:event.source,eventId:event.eventId,...(capped?{offered:gains}:{gains})};
 const raw=JSON.stringify({...record,token});
 let expression;
 if(pg){
  const json='CAST(value AS JSONB)';
  const parts=entries.map(([code,amount])=>{
   const balance=`COALESCE(CAST(${json} #>> '{parts,${code}}' AS BIGINT),0)`;
   return `'${code}',${rewardBalance(code,amount,balance,'LEAST','GREATEST')}`;
  }).join(',');
  expression="jsonb_set(jsonb_set("+json+",'{parts}',("+json+"->'parts') || jsonb_build_object("+parts+")),'{revision}',to_jsonb(CAST("+json+"->>'revision' AS BIGINT)+1))";
  expression='CAST('+expression+' AS TEXT)';
 }else{
  const parts=entries.map(([code,amount])=>{
   const path=`'$.parts.${code}'`,balance=`COALESCE(json_extract(value,${path}),0)`;
   return `${path},${rewardBalance(code,amount,balance,'MIN','MAX')}`;
  }).join(',');
  expression="json_set(value,'$.revision',json_extract(value,'$.revision')+1,"+parts+')';
 }
 const writes=[
  p(env,'INSERT INTO app_meta(key,value,updated_at) SELECT ?,?,CURRENT_TIMESTAMP WHERE '+guard+' ON CONFLICT(key) DO NOTHING',key,JSON.stringify(emptyHideout()),...values),
  p(env,'INSERT INTO app_meta(key,value,updated_at) SELECT ?,?,CURRENT_TIMESTAMP WHERE '+guard+' ON CONFLICT(key) DO NOTHING',receipt,raw,...values),
  p(env,'UPDATE app_meta SET value='+expression+',updated_at=CURRENT_TIMESTAMP WHERE key=? AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',key,receipt,raw),
  p(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',JSON.stringify({...record,applied:true}),receipt,raw)
 ];
 writes.hideoutAward=gains;writes.hideoutReceipt=receipt;return writes;
}
function requireUpgradeCoins(balance,cost){
 if(coinInteger(balance)<cost)throw Object.assign(Error('업그레이드에 필요한 코인이 부족합니다.'),{code:'HIDEOUT_COINS',status:409});
}
export async function mutateHideout(env,uid,action,body){
 if(!hideoutEnabled(env))throw Object.assign(Error('은신처를 준비하고 있습니다.'),{code:'HIDEOUT_CLOSED',status:423});
 if(typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId))throw Object.assign(Error('요청 번호를 확인하세요.'),{code:'HIDEOUT_INPUT',status:400});
 const key='personal_hideout_mutation_v1:'+uid+':'+body.requestId;
 const {requestId,...payload}=body,input={action,...payload},hash=await jointHash(input);
 const upgrade=action==='upgrade',withCoin=upgrade||action==='unlockSkin';
 const replay=async()=>{
  const row=await p(env,'SELECT value FROM app_meta WHERE key=?',key).first();if(!row)return null;
  const saved=JSON.parse(row.value);
  if(saved.hash!==hash)throw Object.assign(Error('같은 요청 번호로 다른 작업을 할 수 없습니다.'),{code:'HIDEOUT_REQUEST_CONFLICT',status:409});
  const response={...saved.response,...publicHideout(saved.response.state),replayed:true};
  if(withCoin)response.coinBalance=(await walletBalance(env,uid).first())?.coin_balance??'0';
  return response;
 };
 const old=await replay();if(old)return old;
 const before=await readHideout(env,uid,{withCoin:upgrade}),token=crypto.randomUUID(),ownedTrophies=action==='trophy'?await hideoutTrophies(env,uid):[];
 const state={...changeHideout(before.state,action,body,{newId:token,ownedTrophies}),mutationToken:token};
 const skin=action==='unlockSkin'?HIDEOUT_SKINS.find(x=>x.code===body.skin):null;
 const target=body.target,nextLevel=target==='room'?state.level:state.facilities[target];
 const upgradeCoin=upgrade?hideoutUpgradeCoinCost(target,nextLevel):'0';
 const charge=coinInteger(skin?.coin??upgradeCoin);
 if(upgrade)requireUpgradeCoins(before.coinBalance,charge);
 if(skin){
  const wallet=await p(env,"SELECT CAST(u.coin AS TEXT) AS coin,COALESCE(i.quantity,0) AS stars FROM users u LEFT JOIN cnine_user_inventory i ON i.user_id=u.id AND i.item_code='MASTER_STAR' WHERE u.id=?",uid).first();
  if(!wallet||coinInteger(wallet.coin)<charge||Number(wallet.stars)<skin.stars)throw Object.assign(Error('코인 또는 마스터의 별이 부족합니다.'),{code:'HIDEOUT_SKIN_FUNDS',status:409});
 }
 const response={ok:true,action,requestId:body.requestId,...publicHideout(state),
  ...(upgrade?{upgradePayment:{coin:upgradeCoin}}:{}),...(skin?{skinPayment:{coin:skin.coin,stars:skin.stars,parts:skin.parts}}:{})};
 await ensureJointAtomicSchema(env);
 const raw=JSON.stringify(state),stateKey=HIDEOUT_KEY(uid);
 const cas=before.raw===null?p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',stateKey,raw):p(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',raw,stateKey,before.raw);
 const writes=[];
 if(charge>0n){
  const reason=skin?'은신처 스킨 해금 · '+skin.name:target==='room'?'은신처 승급 · '+response.stage.name:
   '은신처 시설 성장 · '+response.facilities.find(f=>f.code===target).name+' Lv.'+nextLevel;
  writes.push(...coinChangeStatements(env.DB,uid,-charge,reason));
  if(skin)writes.push(...jointInventoryChange(env.DB,uid,'MASTER_STAR',-skin.stars,reason,key));
 }else if(env.DB.dialect==='postgres')writes.push(p(env,'SELECT id FROM users WHERE id=? FOR UPDATE',uid));
 writes.push(cas,jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[stateKey,raw]),
  p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,JSON.stringify({hash,response})),
  jointGuardEnd(env.DB,token));
 if(charge>0n)writes.push(walletBalance(env,uid));
 try{
  const results=await env.DB.batch(writes);
  if(withCoin)response.coinBalance=charge>0n?results.at(-1).results[0].coin_balance:before.coinBalance;
 }catch(error){
  const saved=await replay();if(saved)return saved;
  if(/joint_atomic_guards|unique|duplicate|constraint/i.test(error.message)){
   if(upgrade&&charge>0n)requireUpgradeCoins((await walletBalance(env,uid).first())?.coin_balance??'0',charge);
   throw Object.assign(Error('은신처 상태가 변경됐습니다. 새로 확인한 뒤 다시 시도하세요.'),{code:'HIDEOUT_CONFLICT',status:409});
  }
  throw error;
 }
 return response;
}
export async function handlePersonalHideout({path,request,env,deps}){
 if(path!=='hideout'&&!path.startsWith('hideout/'))return null;
 const reply=(data,status=200)=>deps.json(data,status,{'cache-control':'private, no-store'});
 try{
  const user=await deps.authenticate(request,env);if(!user)return reply({error:'로그인이 필요합니다.'},401);
  if(path==='hideout'&&request.method==='GET'){
   const {state,coinBalance}=await readHideout(env,user.id,{withCoin:true});
   return reply({ok:true,enabled:hideoutEnabled(env),raidEnabled:hideoutPlunderEnabled(env),...publicHideout(state),coinBalance,trophyCatalog:TROPHY_CATALOG.map(t=>({code:t.code,name:t.name,image:t.art}))});
  }
  if(path==='hideout/trophies'&&request.method==='GET')return reply({ok:true,trophies:await hideoutTrophies(env,user.id)});
  const action=path.slice(8);
  const fields={upgrade:['target','room'],arrange:['placements'],expand:['room'],decorate:['item','room'],trophy:['id','trophyCode','slot'],unlockSkin:['skin'],equipSkin:['id','skin']};
  if(request.method!=='POST'||!Object.hasOwn(fields,action))return reply({error:'지원하지 않는 은신처 요청입니다.'},405);
  const body=await readJointBody(request,{fields:['requestId','revision',...fields[action]],maxBytes:32768});
  return reply(await deps.withUserMutationLock(env,user.id,path,()=>mutateHideout(env,user.id,action,body)));
 }catch(error){
  const known=/^(HIDEOUT|JOINT)_/.test(error.code||'');
  if(!known)console.error('[personal hideout]',error.name);
  return reply({error:known?error.message:'은신처를 불러오지 못했습니다. 다시 시도하세요.',code:known?error.code:'HIDEOUT_RETRY'},known?(error.status||400):503);
 }
}
