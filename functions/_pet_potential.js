import {PET_POTENTIAL_POTION,PET_POTENTIAL_ART,PET_POTENTIAL_SETTINGS_KEY,PET_MAGNET,defaultPetPotentialSettings,validatePetPotentialSettings} from '../shared/pet-potential-v1.mjs';
import {readPetRecord,readPetCollection,readPetPotentials} from './_pet_account.js';
import {readPetCms} from './_pet_companion_cms.js';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
const fail=(code,message,status=409)=>{throw jointError('PET_POTENTIAL_'+code,message,status);};
const receiptKey=(userId,id)=>`pet_potential_receipt_v1:${userId}:${id}`;
const serializedWrite=(DB,record,value)=>record.raw===null
  ?DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(record.key,value)
  :DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(value,record.key,record.raw);
async function settingsRecord(env){
  const r=await readPetRecord(env,PET_POTENTIAL_SETTINGS_KEY,defaultPetPotentialSettings());
  const {saveToken,...settings}=r.state;r.state=validatePetPotentialSettings(settings);return r;
}
export async function ensurePetPotentialItem(env){
  if(readRuntimeData(env,'pet-potential-item-v1'))return;
  await env.DB.prepare('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING')
    .bind(PET_POTENTIAL_POTION,'잠재력 물약','PET POTENTIAL','보유한 펫의 자석 잠재력에 도전하는 물약. 도전 1회당 1개를 소모합니다.','MATERIAL','SPECIAL',PET_POTENTIAL_ART,130).run();
  cacheRuntimeData(env,'pet-potential-item-v1',true,1800000);
}
async function potionBalance(env,userId){return Math.max(0,Number((await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(userId,PET_POTENTIAL_POTION).first())?.quantity||0));}
export async function petPotentialState(env,userId){
  const [settings,potentials,balance]=await Promise.all([settingsRecord(env),readPetPotentials(env,userId),potionBalance(env,userId)]);
  return {settings:settings.state,revision:potentials.state.revision,pets:potentials.state.pets,potion:{code:PET_POTENTIAL_POTION,name:'잠재력 물약',image:PET_POTENTIAL_ART,quantity:balance,cost:1}};
}
function randomPpm(){const limit=Math.floor(4294967296/1000000)*1000000;let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);return n%1000000;}
export async function attemptPetPotential(env,user,body,{random=randomPpm}={}){
  if(!body||Object.keys(body).sort().join(',')!=='expectedRevision,petCode,requestId,settingsRevision'||typeof body.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(body.requestId)||!/^PET-[A-Z0-9-]{1,28}$/.test(body.petCode)||
    !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||!Number.isSafeInteger(body.settingsRevision)||body.settingsRevision<0)fail('INPUT','대상 펫·설정 버전·요청 번호를 확인하세요.',400);
  const rk=receiptKey(user.id,body.requestId),payload=JSON.stringify([body.petCode,body.expectedRevision,body.settingsRevision]);
  const prior=async()=>{const r=await readPetRecord(env,rk,null);if(!r.state)return null;if(r.state.payload!==payload)fail('REQUEST_CONFLICT','같은 요청 번호로 다른 펫이나 설정에 도전할 수 없습니다.');return {...r.state.result,replayed:true};};
  const existing=await prior();if(existing)return existing;
  const [settings,owned,potentials,cms]=await Promise.all([settingsRecord(env),readPetCollection(env,user.id),readPetPotentials(env,user.id),readPetCms(env)]);
  if(!settings.state.enabled||settings.state.successPpm===null)fail('CLOSED','잠재력 도전을 준비 중입니다.',423);
  if(settings.state.revision!==body.settingsRevision||potentials.state.revision!==body.expectedRevision)fail('REVISION','설정 또는 펫 잠재력이 변경됐습니다. 다시 불러와 주세요.');
  if(!(owned.state.pets[body.petCode]>0))fail('NOT_OWNED','보유한 펫만 잠재력에 도전할 수 있습니다.',403);
  if(!cms.state.document.pets.some(p=>p.code===body.petCode))fail('PET','등록된 펫을 선택하세요.',400);
  const previous=potentials.state.pets[body.petCode];if(previous?.potential===PET_MAGNET)fail('COMPLETE','이미 자석 잠재력을 보유한 펫입니다.');
  if(potentials.state.revision>=Number.MAX_SAFE_INTEGER||(previous?.attempts||0)>=Number.MAX_SAFE_INTEGER)fail('LIMIT','잠재력 기록 한도에 도달했습니다.');
  const balance=await potionBalance(env,user.id);if(balance<1)fail('BALANCE','잠재력 물약이 부족합니다.');
  const roll=random();if(!Number.isSafeInteger(roll)||roll<0||roll>=1000000)throw Error('Invalid potential RNG');
  const success=roll<settings.state.successPpm,now=new Date().toISOString(),revision=potentials.state.revision+1;
  const pet={potential:success?PET_MAGNET:null,attempts:(previous?.attempts||0)+1,lastAttemptAt:now,...(success?{obtainedAt:now}:{})};
  const token=crypto.randomUUID(),next={revision,pets:{...potentials.state.pets,[body.petCode]:pet},commitToken:token},raw=JSON.stringify(next);
  const result={ok:true,requestId:body.requestId,petCode:body.petCode,success,outcome:success?'SUCCESS':'FAILURE',potential:pet.potential,attempts:pet.attempts,revision,settingsRevision:settings.state.revision,successPpm:settings.state.successPpm,potionSpent:1,potionBalance:balance-1,replayed:false};
  await ensurePetPotentialItem(env);await ensureJointAtomicSchema(env);
  const DB=env.DB;
  try{await DB.batch([
    jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?) AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=1)',[settings.key,settings.raw,owned.key,owned.raw,'pet_cms_preparation_v1',cms.raw,rk,user.id,PET_POTENTIAL_POTION]),
    serializedWrite(DB,potentials,raw),
    jointGuard(DB,token+'p','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[potentials.key,raw]),
    DB.prepare('UPDATE cnine_user_inventory SET quantity=quantity-1,unseen_quantity=CASE WHEN unseen_quantity>quantity-1 THEN quantity-1 ELSE unseen_quantity END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>=1').bind(user.id,PET_POTENTIAL_POTION),
    DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,-1,quantity,'펫 잠재력 도전','PET_POTENTIAL',? FROM cnine_user_inventory WHERE user_id=? AND item_code=?").bind(body.requestId,user.id,PET_POTENTIAL_POTION),
    DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(rk,JSON.stringify({payload,result})),
    jointGuardEnd(DB,token),jointGuardEnd(DB,token+'p')
  ]);}catch(error){const replay=await prior();if(replay)return replay;fail('RETRY','잠재력 도전을 저장하지 못했습니다. 같은 요청으로 다시 확인해 주세요.',503);}
  return result;
}
export async function handlePetPotential({path,request,env,deps}){
  const admin=path==='admin/pets/potential';if(!admin&&path!=='pets/v1/potential')return null;
  const reply=(body,status=200)=>{const r=deps.json(body,status);r.headers.set('Cache-Control','private, no-store');r.headers.set('Vary','Authorization');return r;};
  try{
    const user=await(admin?deps.requirePermission(request,env,'BATTLE_MANAGE'):deps.authenticate(request,env));
    if(!user||admin&&user.role!=='OWNER')return reply({error:admin?'OWNER 전용입니다.':'로그인이 필요합니다.'},admin?403:401);
    await ensurePetPotentialItem(env);
    if(admin&&request.method==='GET')return reply({settings:(await settingsRecord(env)).state,potion:{code:PET_POTENTIAL_POTION,name:'잠재력 물약',image:PET_POTENTIAL_ART,cost:1}});
    if(request.method!==(admin?'PATCH':'POST'))return reply({error:'지원하지 않는 요청입니다.'},405);
    const body=await readJointBody(request,{fields:admin?['settings']:['petCode','requestId','expectedRevision','settingsRevision']});
    return await deps.withUserMutationLock(env,user.id,path,async()=>{
      if(!admin)return reply(await attemptPetPotential(env,user,body));
      let next;try{next=validatePetPotentialSettings(body.settings);}catch(error){fail('SETTINGS',error.message,400);}
      const current=await settingsRecord(env);if(next.revision!==current.state.revision)fail('REVISION','다른 창에서 설정을 변경했습니다. 다시 불러와 주세요.');
      next.revision++;const token=crypto.randomUUID(),raw=JSON.stringify({...next,saveToken:token});await ensureJointAtomicSchema(env);
      try{await env.DB.batch([serializedWrite(env.DB,current,raw),jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[current.key,raw]),
        env.DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'PET_POTENTIAL_SETTINGS','PET',?,?,?)").bind(user.id,current.key,current.raw,raw),jointGuardEnd(env.DB,token)]);}
      catch{fail('REVISION','설정 저장이 충돌했습니다. 다시 불러와 주세요.');}
      return reply({ok:true,settings:next});
    });
  }catch(error){return String(error.code||'').startsWith('PET_POTENTIAL_')?reply({ok:false,code:error.code,error:error.message,retryable:error.status>=500},error.status):jointResponseError(error,deps.json);}
}
