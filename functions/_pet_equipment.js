import {COMPANION_RELEASE} from '../shared/companion-loadout-v2.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {PET_EQUIPMENT_RULES,petReviewKey,validatePetEquipmentSave,validateOwnedPetSelection} from '../shared/pet-equipment-v1.mjs';
import {PET_BUFF_TYPES,PET_BUFF_TARGETS,petReadiness} from '../shared/pet-cms-v1.mjs';
import {readPetCms} from './_pet_companion_cms.js';
import {readPetCollection,readPetLoadout,livePetDefinition} from './_pet_account.js';
import {petPotentialState,ensurePetPotentialItem} from './_pet_potential.js';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {readJointBody} from './_joint_request.js';
const jointHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');

export function petCatalogFrom(document,{review=true,includeUnowned=false,collection={},potentials={}}={}){
  const codes=[...new Set([...PET_ART_CATALOG.map(row=>row.code),...document.pets.map(row=>row.code)])];
  return codes.map(code=>{
    const art=PET_ART_CATALOG.find(row=>row.code===code),pet=document.pets.find(row=>row.code===code);
    return {code,name:pet?.name||art.name,sourceArt:pet?.sourceArt||art?.sourceArt||pet?.battleSprite||'',battleSprite:pet?.battleSprite||'',
      animal:art?.animal||'동료',description:art?.description||'',artStatus:art?.artStatus||'CMS_DRAFT',configured:Boolean(pet),
      target:pet?.target||null,modes:pet?.modes||[],buffs:pet?.buffs||[],ready:pet?['PVE','PVP'].filter(mode=>review?petReadiness(pet,mode).ok:!!livePetDefinition(pet,mode)):[],owned:review||Number(collection[code]||0)>0,reviewOwned:review,quantity:Number(collection[code]||0),potential:potentials[code]?.potential||null,attempts:potentials[code]?.attempts||0};
  }).filter(row=>review||includeUnowned||row.owned);
}
async function readReview(env,owner){
  const key=petReviewKey(owner.id),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(!row)return {key,raw:null,state:{revision:0,petCode:null,audit:[]}};
  const state=JSON.parse(row.value);
  if(!Number.isSafeInteger(state.revision)||state.revision<1||!Array.isArray(state.audit)||state.audit.length>50||state.petCode!==null&&!/^PET-[A-Z0-9-]{1,28}$/.test(state.petCode))throw Error('Invalid pet equipment review');
  return {key,raw:row.value,state};
}
const closedState=()=>({version:1,available:false,reviewOnly:false,canEquip:false,release:COMPANION_RELEASE,rules:PET_EQUIPMENT_RULES,cards:[],ownedCount:0,loadout:{petCode:null,revision:0},message:'펫 시스템을 준비하고 있습니다. 획득·장착·실전 버프는 추후 공개됩니다.'});
function output(cms,record,catalog,{review=true,potential=null,userId=null}={}){
  const present=catalog.some(row=>row.code===record.state.petCode);
  return {version:1,userId,available:true,reviewOnly:review,canEquip:true,release:COMPANION_RELEASE,rules:PET_EQUIPMENT_RULES,potential,
    petCmsRevision:cms.state.revision,buffTypes:PET_BUFF_TYPES,buffTargets:PET_BUFF_TARGETS,cards:catalog,ownedCount:catalog.filter(p=>p.owned).length,catalogCount:catalog.length,
    loadout:{petCode:present?record.state.petCode:null,revision:record.state.revision},orphaned:Boolean(record.state.petCode&&!present),
    message:review?'OWNER 장착 검수입니다. 검수용 선택만 저장하며 실제 보유권·계정 편성·전투에는 반영되지 않습니다.':'보유한 펫 1마리를 장착하면 다음 전투부터 시작 버프가 적용됩니다.'};
}
export async function handlePetEquipment({path,request,env,deps,locked=false}){
  const review=['admin/pets/equipment/state','admin/pets/equipment/loadout'].includes(path);
  const codex=path==='pets/v1/codex';
  if(!review&&!['pets/v1/state','pets/v1/loadout','pets/v1/codex'].includes(path))return null;
  const reply=(body,status=200)=>{const response=deps.json(body,status);response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Authorization');return response;};
  try{
    const user=review?await deps.requirePermission(request,env,'BATTLE_MANAGE'):await deps.authenticate(request,env);
    if(!user)return reply({error:review?'OWNER 로그인이 필요합니다.':'로그인 후 펫 장착창을 사용할 수 있습니다.'},401);
    if(review&&user.role!=='OWNER')return reply({error:'펫 장착 검수는 OWNER 전용입니다.'},403);
    if(request.method!==((codex||path.endsWith('/state'))?'GET':'POST'))return reply({error:'지원하지 않는 요청입니다.'},405);
    if(!review&&!COMPANION_RELEASE.pets)return request.method==='GET'?reply(closedState()):reply({error:'펫 장착을 준비 중입니다.',code:'PET_EQUIPMENT_CLOSED',...closedState()},423);
    if(!review&&request.method==='POST'&&!locked&&deps.withUserMutationLock)return deps.withUserMutationLock(env,user.id,path,()=>handlePetEquipment({path,request,env,deps,locked:true}));
    let body;
    if(request.method==='POST')try{body=validatePetEquipmentSave(await readJointBody(request,{fields:['petCode','expectedRevision','petCmsRevision','requestId']}));}
      catch(error){return reply({error:error.message,code:'PET_EQUIPMENT_BODY'},error.status||400);}
    if(!review)await ensurePetPotentialItem(env);
    const [cms,record,collection,potential]=await Promise.all([readPetCms(env),review?readReview(env,user):readPetLoadout(env,user.id),review?null:readPetCollection(env,user.id),review?null:petPotentialState(env,user.id)]);
    const catalog=petCatalogFrom(cms.state.document,{review,includeUnowned:codex,collection:collection?.state.pets,potentials:potential?.pets}),options={review,potential,userId:Number(user.id)};
    if(request.method==='GET')return reply(output(cms,record,catalog,options));
    const payloadHash=await jointHash([String(user.id),body]);
    const replay=state=>{const receipt=state.audit.find(row=>row.requestId===body.requestId);if(!receipt)return null;return receipt.payloadHash!==payloadHash||String(receipt.actorId)!==String(user.id)
      ?reply({error:'같은 요청 번호에 다른 장착 내용이 포함되었습니다.',code:'PET_REQUEST_ID_CONFLICT'},409)
      :reply({...output(cms,{...record,state},catalog,options),savedRevision:receipt.revision,replayed:true});};
    const prior=replay(record.state);if(prior)return prior;
    if(body.expectedRevision!==record.state.revision||body.petCmsRevision!==cms.state.revision)return reply({error:'다른 창에서 설정이 바뀌었습니다. 다시 불러와 주세요.',code:'PET_REVISION_CONFLICT'},409);
    try{validateOwnedPetSelection(body.petCode,{catalog,ownedCodes:catalog.filter(row=>row.owned).map(row=>row.code)});}catch(error){return reply({error:error.message,code:'PET_NOT_OWNED'},403);}
    const revision=record.state.revision+1,now=new Date().toISOString(),next={revision,petCode:body.petCode,updatedAt:now,
      audit:[{actorId:user.id,requestId:body.requestId,payloadHash,revision,createdAt:now},...record.state.audit].slice(0,50)};
    const raw=JSON.stringify(next),write=record.raw===null
      ?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(record.key,raw)
      :env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,record.key,record.raw);
    let changed=false;
    if(review)changed=(await write.run()).meta?.changes===1;
    else{
      await ensureJointAtomicSchema(env);const token=crypto.randomUUID();
      const cmsGuard=cms.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
      try{await env.DB.batch([write,jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND '+cmsGuard+(body.petCode?' AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)':''),[record.key,raw,'pet_cms_preparation_v1',...(cms.raw===null?[]:[cms.raw]),...(body.petCode?[collection.key,collection.raw]:[])]),jointGuardEnd(env.DB,token)]);changed=true;}catch{}
    }
    if(changed)return reply({...output(cms,{...record,state:next},catalog,options),savedRevision:revision,replayed:false});
    const latest=review?await readReview(env,user):await readPetLoadout(env,user.id);return replay(latest.state)||reply({error:'다른 창에서 먼저 장착을 변경했습니다. 다시 불러와 주세요.',code:'PET_REVISION_CONFLICT'},409);
  }catch(error){console.error('[pet-equipment] unavailable',error?.name||'Error');return reply({error:'펫 장착 정보를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.',code:'PET_EQUIPMENT_UNAVAILABLE'},503);}
}
