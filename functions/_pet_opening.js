import {PET_SEAL,PET_ESSENCE,PET_ITEM_ART,PET_OPENING_KEY,defaultPetOpeningSettings,validatePetOpeningSettings,petOpeningLimit} from '../shared/pet-opening-v1.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {readPetCms} from './_pet_companion_cms.js';
import {readJointBody,jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
const fail=(code,message,status=409)=>{throw jointError('PET_OPEN_'+code,message,status);};
const collectionKey=userId=>'pet_collection_v1:'+userId;
const receiptKey=(userId,requestId)=>'pet_open_receipt_v1:'+userId+':'+requestId;
export async function ensurePetOpeningItems(env){
  if(readRuntimeData(env,'pet-opening-items-v1'))return;
  await env.DB.batch([
    [PET_SEAL,'펫 봉인구','SEALED COMPANION','펫 개봉 성소에서 원하는 수량을 선택해 개봉하는 봉인구. 개봉마다 펫 정수가 필요합니다.','PACK',PET_ITEM_ART.seal,128],
    [PET_ESSENCE,'펫 정수','LIFE ESSENCE','펫 봉인구 개봉에 필요한 생명의 정수. 리치왕 정벌 클리어 보상으로 획득합니다.','MATERIAL',PET_ITEM_ART.essence,129]
  ].map(([code,name,subtitle,description,category,image,sort])=>env.DB.prepare('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING').bind(code,name,subtitle,description,category,'SPECIAL',image,sort)));
  cacheRuntimeData(env,'pet-opening-items-v1',true,1800000);
}
async function settingsRow(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(PET_OPENING_KEY).first();
  return {raw:row?.value??null,settings:row?validatePetOpeningSettings(JSON.parse(row.value)):defaultPetOpeningSettings()};
}
async function catalog(env){
  const {state}=await readPetCms(env),map=new Map(PET_ART_CATALOG.map(p=>[p.code,{code:p.code,name:p.name,sourceArt:p.sourceArt,description:p.description}]));
  for(const p of state.document.pets)if(p.sourceArt)map.set(p.code,{code:p.code,name:p.name,sourceArt:p.sourceArt,description:p.notes||''});
  return [...map.values()];
}
async function balances(env,userId){
  const rows=await env.DB.prepare('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? AND item_code IN (?,?)').bind(userId,PET_SEAL,PET_ESSENCE).all();
  const map=new Map(rows.results.map(r=>[r.item_code,Math.max(0,Number(r.quantity))]));
  return {seals:map.get(PET_SEAL)||0,essence:map.get(PET_ESSENCE)||0};
}
async function collectionRow(env,userId){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(collectionKey(userId)).first();
  const state=row?JSON.parse(row.value):{revision:0,pets:{}};
  if(!Number.isSafeInteger(state.revision)||!state.pets||Object.values(state.pets).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Invalid pet collection');
  return {raw:row?.value??null,state};
}
async function priorResult(env,userId,requestId,count){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey(userId,requestId)).first();
  if(!row)return null;const result=JSON.parse(row.value);
  if(result.count!==count)fail('REQUEST_CONFLICT','같은 개봉 요청에 다른 수량을 사용할 수 없습니다.');
  return {...result,replayed:true};
}
function validateOpen(body){
  if(typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId)||!Number.isSafeInteger(body.count)||body.count<1||body.count>1000||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
    fail('INPUT','개봉 수량, 설정 버전과 요청 식별자를 확인하세요.',400);
}
// Rejection sampling avoids modulo bias. Draws and prices only come from the server.
function randomBelow(total){
  const limit=Math.floor(4294967296/total)*total;let value;
  do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=limit);
  return value%total;
}
function draw(pool,items,count,blankWeight=0){
  const petTotal=pool.reduce((n,p)=>n+p.weight,0),total=petTotal+blankWeight,map=new Map(items.map(p=>[p.code,p])),results=[];
  if(!total||pool.some(p=>!map.has(p.code)))fail('POOL','획득 풀의 펫 원화를 확인해 주세요.',423);
  for(let i=0;i<count;i++){
    let roll=randomBelow(total);
    if(roll>=petTotal){results.push({outcome:'EMPTY',code:null,name:'꽝'});continue;}
    for(const row of pool){roll-=row.weight;if(roll<0){results.push({...map.get(row.code),outcome:'PET'});break;}}
  }
  return results;
}
export async function openPetSeal(env,user,body){
  validateOpen(body);
  const prior=await priorResult(env,user.id,body.requestId,body.count);if(prior)return prior;
  const [{settings,raw:settingsRaw},items,owned,balance]=await Promise.all([settingsRow(env),catalog(env),collectionRow(env,user.id),balances(env,user.id)]);
  if(!settings.enabled)fail('CLOSED','펫 봉인구 개봉은 준비 중입니다. 획득 풀 설정 후 열립니다.',423);
  if(settings.revision!==body.expectedRevision)fail('REVISION','개봉 설정이 변경되었습니다. 새로고침 후 비용을 확인하세요.');
  if(body.count>petOpeningLimit(settings,balance))fail('BALANCE','봉인구 또는 펫 정수가 부족하거나 최대 개봉 수량을 초과했습니다.');
  const results=draw(settings.pool,items,body.count,settings.blankWeight),cost=body.count*settings.essencePerOpen;
  const blankCount=results.filter(result=>result.outcome==='EMPTY').length;
  const pets={...owned.state.pets};
  for(const pet of results){if(pet.outcome==='EMPTY')continue;pet.previousQuantity=pets[pet.code]||0;pet.isNew=pet.previousQuantity===0;pets[pet.code]=(pets[pet.code]||0)+1;if(!Number.isSafeInteger(pets[pet.code]))fail('LIMIT','펫 보유 한도를 초과했습니다.');}
  const token=crypto.randomUUID(),next={revision:owned.state.revision+1,pets,commitToken:token},nextRaw=JSON.stringify(next);
  const result={ok:true,requestId:body.requestId,count:body.count,petCount:body.count-blankCount,blankCount,settingsRevision:settings.revision,essencePerOpen:settings.essencePerOpen,cost:{seals:body.count,essence:cost},balances:{seals:balance.seals-body.count,essence:balance.essence-cost},results,collection:next,reviewOnly:false};
  const key=collectionKey(user.id),rk=receiptKey(user.id,body.requestId);
  await ensurePetOpeningItems(env);await ensureJointAtomicSchema(env);
  const write=owned.raw===null?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(key,nextRaw):env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(nextRaw,key,owned.raw);
  try{await env.DB.batch([
    jointGuard(env.DB,token,owned.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',owned.raw===null?[key]:[key,owned.raw]),
    jointGuard(env.DB,token+'s','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[PET_OPENING_KEY,settingsRaw]),
    jointGuard(env.DB,token+'r','NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[rk]),
    ...[[PET_SEAL,body.count],[PET_ESSENCE,cost]].flatMap(([code,amount],index)=>[
      jointGuard(env.DB,token+index,'EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=?)',[user.id,code,amount]),
      env.DB.prepare('UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=CASE WHEN unseen_quantity>quantity-? THEN quantity-? ELSE unseen_quantity END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>=?').bind(amount,amount,amount,user.id,code,amount),
      env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'펫 봉인구 개봉','PET_OPENING',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?").bind(-amount,body.requestId,user.id,code),
      jointGuardEnd(env.DB,token+index)]),
    write,jointGuard(env.DB,token+'c','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,nextRaw]),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(rk,JSON.stringify(result)),
    ...[token,token+'s',token+'r',token+'c'].map(t=>jointGuardEnd(env.DB,t))
  ]);}catch(error){
    const replay=await priorResult(env,user.id,body.requestId,body.count);if(replay)return replay;
    if((await settingsRow(env)).raw!==settingsRaw)fail('REVISION','개봉 설정이 변경되었습니다. 새로고침 후 확인하세요.');
    if(body.count>petOpeningLimit(settings,await balances(env,user.id)))fail('BALANCE','보유 봉인구 또는 펫 정수가 부족합니다.');
    throw error;
  }
  return result;
}
export async function handlePetOpening({path,request,env,deps}){
  if(!['pets/opening/state','pets/opening/open','admin/pets/opening','admin/pets/opening/review'].includes(path))return null;
  const reply=(data,status=200)=>{const r=deps.json(data,status);r.headers.set('Cache-Control','private, no-store');r.headers.set('Vary','Authorization');return r;};
  try{
    const admin=path.startsWith('admin/'),user=await(admin?deps.requirePermission(request,env,'BATTLE_MANAGE'):deps.authenticate(request,env));
    if(!user||admin&&user.role!=='OWNER')return reply({error:admin?'OWNER 전용입니다.':'로그인이 필요합니다.'},admin?403:401);
    if(!['GET','POST'].includes(request.method)||path.endsWith('/state')&&request.method!=='GET'||path.endsWith('/open')&&request.method!=='POST'||path.endsWith('/review')&&request.method!=='POST')return reply({error:'지원하지 않는 요청입니다.'},405);
    await ensurePetOpeningItems(env);
    if(path==='pets/opening/open'){
      const body=await readJointBody(request,{fields:['requestId','count','expectedRevision']});
      return reply(await deps.withUserMutationLock(env,user.id,path,()=>openPetSeal(env,user,body)));
    }
    const [{settings,raw},items]=await Promise.all([settingsRow(env),catalog(env)]);
    const total=settings.pool.reduce((n,p)=>n+p.weight,0)+settings.blankWeight,pool=settings.pool.map(p=>({...items.find(a=>a.code===p.code),...p,probability:total?p.weight/total:0})),blankProbability=total?settings.blankWeight/total:0;
    if(path.endsWith('/review')){
      const body=await readJointBody(request,{fields:['count']});
      if(!Number.isSafeInteger(body.count)||body.count<1||body.count>settings.maxBatch)fail('INPUT','검수 수량을 확인하세요.',400);
      const demo=!settings.pool.length,reviewPool=demo?items.map(p=>({code:p.code,weight:1})):settings.pool;
      const results=draw(reviewPool,items,body.count,settings.blankWeight),blankCount=results.filter(r=>r.outcome==='EMPTY').length;
      return reply({ok:true,count:body.count,petCount:body.count-blankCount,blankCount,results,cost:{seals:body.count,essence:body.count*settings.essencePerOpen},reviewOnly:true,demoPool:demo});
    }
    if(admin&&request.method==='POST'){
      const body=await readJointBody(request,{fields:['settings'],maxBytes:16384});let next;
      try{next=validatePetOpeningSettings(body.settings);}catch(error){fail('SETTINGS',error.message,400);}
      if(!Object.hasOwn(body.settings,'blankWeight')&&settings.blankWeight>0)fail('CLIENT_UPDATE','꽝 확률을 지원하는 새 CMS를 불러온 뒤 저장하세요.',400);
      if(next.revision!==settings.revision)fail('REVISION','다른 창에서 설정이 변경되었습니다. 다시 불러오세요.');
      if(next.pool.some(p=>!items.some(a=>a.code===p.code)))fail('POOL','등록된 원화가 있는 펫만 획득 풀에 넣을 수 있습니다.',400);
      next.revision++;const token=crypto.randomUUID(),serialized=JSON.stringify({...next,saveToken:token});
      await ensureJointAtomicSchema(env);
      const write=raw===null?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(PET_OPENING_KEY,serialized):env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(serialized,PET_OPENING_KEY,raw);
      try{await env.DB.batch([write,jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[PET_OPENING_KEY,serialized]),env.DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'PET_OPENING_SETTINGS','PET',?,?,?)").bind(user.id,PET_OPENING_KEY,raw,serialized),jointGuardEnd(env.DB,token)]);}
      catch{fail('REVISION','저장 충돌이 발생했습니다. 다시 불러오세요.');}
      return reply({ok:true,settings:next,catalog:items});
    }
    if(admin)return reply({ok:true,userId:Number(user.id),settings,catalog:items,pool,blankProbability});
    const [balance,collection]=await Promise.all([balances(env,user.id),collectionRow(env,user.id)]);
    return reply({ok:true,userId:Number(user.id),settings,pool,blankProbability,balances:balance,maxOpen:settings.enabled?petOpeningLimit(settings,balance):0,collection:collection.state,ownedPets:items.filter(p=>collection.state.pets[p.code]>0).map(p=>({...p,quantity:collection.state.pets[p.code]})),battleEnabled:false});
  }catch(error){const known=Number.isInteger(error.status);return reply({ok:false,code:known?error.code:'PET_OPEN_RETRYABLE',error:known?error.message:error.message?.startsWith('개봉')||error.message?.startsWith('중복')?error.message:'처리를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.',retryable:!known||error.status>=500},known?error.status:503);}
}
