import {applyGrowthRequest,publicGrowthState,validateRequest,PetGrowthError} from '../shared/pet-growth-v2.mjs';
import {PET_GROWTH_KEY,PET_GROWTH_POLICY,emptyPetGrowth,initialPetGrowth} from '../shared/pet-growth-live-v2.mjs';
import {readPetRecord,readPetOwnership,readPetLoadout,livePetDefinition} from './_pet_account.js';
import {readPetCms} from './_pet_companion_cms.js';
import {petSlotForMode} from '../shared/pet-equipment-v1.mjs';
import {petRecordPredicate,petOwnershipPredicate} from './_pet_rental.js';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {readJointBody,jointResponseError} from './_joint_request.js';
const receiptKey=(uid,id)=>`pet_growth_receipt_v2:${uid}:${id}`;
const fingerprint=request=>JSON.stringify(Object.fromEntries(Object.keys(request).sort().map(k=>[k,request[k]])));
const write=(DB,record,raw)=>record.raw===null?DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(record.key,raw):DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,record.key,record.raw);
export const readPetGrowthRecord=(env,uid)=>readPetRecord(env,PET_GROWTH_KEY(uid),emptyPetGrowth());
async function context(env,uid){
 const keys=[PET_GROWTH_KEY(uid),`pet_collection_v1:${uid}`,`pet_rental_v1:${uid}`,`pet_loadout_v1:${uid}`,'pet_cms_preparation_v1'];
 const [rows,balance]=await Promise.all([
  env.DB.prepare('SELECT key,value FROM app_meta WHERE key IN (?,?,?,?,?)').bind(...keys).all(),
  env.DB.prepare("SELECT CAST(coin AS TEXT) AS coin,COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=users.id AND item_code='MASTER_STAR'),0) AS stars FROM users WHERE id=?").bind(uid).first()]);
 const records=new Map((rows.results||[]).map(row=>[row.key,row]));
 const cached={...env,DB:{prepare(sql){if(sql==='SELECT value FROM app_meta WHERE key=?')return {bind(key){return {first:async()=>records.get(key)||null};}};return env.DB.prepare(sql);}}};
 const [record,owned,loadout,cms]=await Promise.all([readPetGrowthRecord(cached,uid),readPetOwnership(cached,uid),readPetLoadout(cached,uid),readPetCms(cached)]);
 if(record.state.version!==2||!Number.isSafeInteger(record.state.revision)||record.state.revision<0)throw Error('Invalid pet growth record');
 const instances=[];
 for(const definition of cms.state.document.pets){
  const code=definition.code,quantity=owned.pets[code]||0;if(!quantity)continue;
  const allowedModes=['PVE','PVP'].filter(mode=>livePetDefinition(definition,mode));if(!allowedModes.length)continue;
  const rental=!!owned.expiries[code];
  for(let i=1;i<=quantity;i++){
   const initial=initialPetGrowth(code,rental?'R':i);if(!initial)break;
   const instance={...(record.state.pets[initial.id]||initial),allowedModes,label:rental?'기간제 개체':`개체 ${i}`};
   if(rental)instance.expiresAt=Date.parse(owned.expiries[code]);instances.push(instance);
  }
 }
 const loadouts=Object.fromEntries(['PVE','PVP'].map(mode=>{const code=petSlotForMode(loadout.state,mode).petCode;return [mode,instances.find(p=>p.id===record.state.loadouts[mode]&&p.petCode===code)?.id||instances.find(p=>p.petCode===code)?.id||null];}));
 return {record,owned,loadout,cms:{...cms,key:'pet_cms_preparation_v1'},state:{ownerId:uid,revision:record.state.revision,instances,loadouts,pending:record.state.pending,wallet:{coin:String(balance?.coin||0),masterStars:Number(balance?.stars||0)},receipts:{}}};
}
const publicState=ctx=>({...publicGrowthState(ctx.state),policy:PET_GROWTH_POLICY});
export async function petGrowthState(env,uid){return publicState(await context(env,Number(uid)));}
export async function executePetGrowth(env,user,request,{randomInt}={}){
 validateRequest(request);const uid=Number(user.id),rk=receiptKey(uid,request.requestId),payload=fingerprint(request);
 const previous=async()=>{const row=await readPetRecord(env,rk,null);if(!row.state)return null;if(row.state.payload!==payload)throw new PetGrowthError('REQUEST_REUSED','같은 요청 번호에 다른 내용을 사용할 수 없습니다.');return {...await petGrowthState(env,uid),receipt:row.state.receipt,replayed:true};};
 const replay=await previous();if(replay)return replay;
 const ctx=await context(env,uid),result=applyGrowthRequest(ctx.state,request,PET_GROWTH_POLICY,{randomInt});
 const touched=request.instanceId||ctx.state.pending?.instanceId,pet=result.state.instances.find(p=>p.id===touched);
 const next={...ctx.record.state,revision:result.state.revision,loadouts:result.state.loadouts,pending:result.state.pending,pets:{...ctx.record.state.pets}};
 if(pet){const {allowedModes,label,expiresAt,...saved}=pet;next.pets[pet.id]=saved;}
 const raw=JSON.stringify(next),DB=env.DB,token=crypto.randomUUID(),predicates=[petRecordPredicate(ctx.record),petRecordPredicate(ctx.loadout),petRecordPredicate(ctx.cms)];
 if(request.command!=='KEEP')predicates.push(petOwnershipPredicate(DB,ctx.owned,pet.petCode));
 const kind=request.command==='ROLL_STATS'?'stats':request.command==='ROLL_TRAIT'?'trait':null,cost=kind&&PET_GROWTH_POLICY.costs[kind];
 if(cost)predicates.push(['EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=CAST(? AS BIGINT)) AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=\'MASTER_STAR\' AND quantity>=?)',[uid,cost.coin,uid,cost.masterStars]]);
 const statements=[];
 if(DB.dialect==='postgres')statements.push(DB.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(uid));
 if(DB.dialect==='postgres'&&cost)statements.push(DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' FOR UPDATE").bind(uid));
 statements.push(jointGuard(DB,token,predicates.map(p=>'('+p[0]+')').join(' AND ')+' AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[...predicates.flatMap(p=>p[1]),rk]),write(DB,ctx.record,raw),jointGuard(DB,token+'s','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[ctx.record.key,raw]));
 if(cost)statements.push(
  DB.prepare('UPDATE users SET coin=coin-CAST(? AS BIGINT) WHERE id=?').bind(cost.coin,uid),
  DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,-CAST(? AS BIGINT),coin,? FROM users WHERE id=?').bind(cost.coin,kind==='stats'?'펫 능력치 재설정':'펫 고유 특성 재설정',uid),
  DB.prepare("UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=CASE WHEN unseen_quantity>quantity-? THEN quantity-? ELSE unseen_quantity END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR'").bind(cost.masterStars,cost.masterStars,cost.masterStars,uid),
  DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,-?,quantity,?,'PET_GROWTH',? FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(cost.masterStars,kind==='stats'?'펫 능력치 재설정':'펫 고유 특성 재설정',request.requestId,uid));
 if(request.command==='EQUIP'){
  const slots={PVE:petSlotForMode(ctx.loadout.state,'PVE'),PVP:petSlotForMode(ctx.loadout.state,'PVP')},revision=ctx.loadout.state.revision+1;
  slots[request.mode]={petCode:pet.petCode,revision};
  const updated={...ctx.loadout.state,revision,petCode:slots.PVE.petCode,pveRevision:slots.PVE.revision,pvp:slots.PVP,updatedAt:new Date().toISOString()};
  const loadoutRaw=JSON.stringify(updated);statements.push(write(DB,ctx.loadout,loadoutRaw),jointGuard(DB,token+'l','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[ctx.loadout.key,loadoutRaw]),jointGuardEnd(DB,token+'l'));
 }
 statements.push(DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(rk,JSON.stringify({payload,receipt:{...result.receipt,cost:cost||null},pending:result.state.pending})),jointGuardEnd(DB,token),jointGuardEnd(DB,token+'s'));
 await ensureJointAtomicSchema(env);
 try{await DB.batch(statements);}catch{
  const retry=await previous();if(retry)return retry;
  throw Object.assign(new PetGrowthError('RETRY','저장 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.'),{status:503,retryable:true});
 }
 return {...publicState({...ctx,state:result.state}),receipt:{...result.receipt,cost:cost||null},replayed:false};
}
export async function handlePetGrowth({path,request,env,deps}){
 if(path!=='pets/v2/growth')return null;
 const reply=(body,status=200)=>{const r=deps.json(body,status);r.headers.set('Cache-Control','private, no-store');r.headers.set('Vary','Authorization');return r;};
 try{
  const user=await deps.authenticate(request,env);if(!user)return reply({error:'로그인이 필요합니다.'},401);
  if(request.method==='GET')return reply(await petGrowthState(env,user.id));
  if(request.method!=='POST')return reply({error:'지원하지 않는 요청입니다.'},405);
  const body=await readJointBody(request,{fields:['command','expectedRevision','requestId','instanceId','pendingId','mode']});
  return await deps.withUserMutationLock(env,user.id,path,async()=>reply(await executePetGrowth(env,user,body)));
 }catch(error){if(error instanceof PetGrowthError)return reply({ok:false,code:error.code,error:error.message,retryable:error.retryable===true},error.status||(error.code==='INVALID_REQUEST'?400:409));return jointResponseError(error,deps.json);}
}
