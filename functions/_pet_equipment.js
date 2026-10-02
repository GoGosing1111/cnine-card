import {COMPANION_RELEASE} from '../shared/companion-loadout-v2.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {PET_EQUIPMENT_RULES,petReviewKey,validatePetEquipmentSave,validateOwnedPetSelection} from '../shared/pet-equipment-v1.mjs';
import {PET_BUFF_TYPES,PET_BUFF_TARGETS,petReadiness} from '../shared/pet-cms-v1.mjs';
import {readPetCms} from './_pet_companion_cms.js';
import {readJointBody} from './_joint_request.js';
const jointHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');

function catalogFrom(document){
  const codes=[...new Set([...PET_ART_CATALOG.map(row=>row.code),...document.pets.map(row=>row.code)])];
  return codes.map(code=>{
    const art=PET_ART_CATALOG.find(row=>row.code===code),pet=document.pets.find(row=>row.code===code);
    return {code,name:pet?.name||art.name,sourceArt:pet?.sourceArt||art?.sourceArt||pet?.battleSprite||'',battleSprite:pet?.battleSprite||'',
      animal:art?.animal||'동료',description:art?.description||'',artStatus:art?.artStatus||'CMS_DRAFT',configured:Boolean(pet),
      target:pet?.target||null,modes:pet?.modes||[],buffs:pet?.buffs||[],ready:pet?['PVE','PVP'].filter(mode=>petReadiness(pet,mode).ok):[],owned:true,reviewOwned:true};
  });
}
async function readReview(env,owner){
  const key=petReviewKey(owner.id),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(!row)return {key,raw:null,state:{revision:0,petCode:null,audit:[]}};
  const state=JSON.parse(row.value);
  if(!Number.isSafeInteger(state.revision)||state.revision<1||!Array.isArray(state.audit)||state.audit.length>50||state.petCode!==null&&!/^PET-[A-Z0-9-]{1,28}$/.test(state.petCode))throw Error('Invalid pet equipment review');
  return {key,raw:row.value,state};
}
const closedState=()=>({version:1,available:false,reviewOnly:false,canEquip:false,release:COMPANION_RELEASE,rules:PET_EQUIPMENT_RULES,cards:[],ownedCount:0,loadout:{petCode:null,revision:0},message:'펫 시스템을 준비하고 있습니다. 획득·장착·실전 버프는 추후 공개됩니다.'});
function output(cms,record,catalog){
  const present=catalog.some(row=>row.code===record.state.petCode);
  return {version:1,available:true,reviewOnly:true,canEquip:true,release:COMPANION_RELEASE,rules:PET_EQUIPMENT_RULES,
    petCmsRevision:cms.state.revision,buffTypes:PET_BUFF_TYPES,buffTargets:PET_BUFF_TARGETS,cards:catalog,ownedCount:catalog.length,
    loadout:{petCode:present?record.state.petCode:null,revision:record.state.revision},orphaned:Boolean(record.state.petCode&&!present),
    message:'OWNER 장착 검수입니다. 검수용 선택만 저장하며 실제 보유권·계정 편성·전투에는 반영되지 않습니다.'};
}
export async function handlePetEquipment({path,request,env,deps}){
  const review=['admin/pets/equipment/state','admin/pets/equipment/loadout'].includes(path);
  if(!review&&!['pets/v1/state','pets/v1/loadout'].includes(path))return null;
  const reply=(body,status=200)=>{const response=deps.json(body,status);response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Authorization');return response;};
  try{
    const user=review?await deps.requirePermission(request,env,'BATTLE_MANAGE'):await deps.authenticate(request,env);
    if(!user)return reply({error:review?'OWNER 로그인이 필요합니다.':'로그인 후 펫 장착창을 사용할 수 있습니다.'},401);
    if(review&&user.role!=='OWNER')return reply({error:'펫 장착 검수는 OWNER 전용입니다.'},403);
    if(request.method!==(path.endsWith('/state')?'GET':'POST'))return reply({error:'지원하지 않는 요청입니다.'},405);
    // Live paths remain explicitly closed; do not query inventories, seed
    // collections, migrate accounts or reuse the OWNER review as a live loadout.
    if(!review)return path.endsWith('/state')?reply(closedState()):reply({error:'펫 장착을 준비 중입니다.',code:'PET_EQUIPMENT_CLOSED',...closedState()},423);
    let body;
    if(request.method==='POST')try{body=validatePetEquipmentSave(await readJointBody(request,{fields:['petCode','expectedRevision','petCmsRevision','requestId']}));}
      catch(error){return reply({error:error.message,code:'PET_EQUIPMENT_BODY'},error.status||400);}
    const [cms,record]=await Promise.all([readPetCms(env),readReview(env,user)]),catalog=catalogFrom(cms.state.document);
    if(request.method==='GET')return reply(output(cms,record,catalog));
    const payloadHash=await jointHash([String(user.id),body]);
    const replay=state=>{const receipt=state.audit.find(row=>row.requestId===body.requestId);if(!receipt)return null;return receipt.payloadHash!==payloadHash||String(receipt.actorId)!==String(user.id)
      ?reply({error:'같은 요청 번호에 다른 장착 내용이 포함되었습니다.',code:'PET_REQUEST_ID_CONFLICT'},409)
      :reply({...output(cms,{...record,state},catalog),savedRevision:receipt.revision,replayed:true});};
    const prior=replay(record.state);if(prior)return prior;
    if(body.expectedRevision!==record.state.revision||body.petCmsRevision!==cms.state.revision)return reply({error:'다른 창에서 설정이 바뀌었습니다. 다시 불러와 주세요.',code:'PET_REVISION_CONFLICT'},409);
    try{validateOwnedPetSelection(body.petCode,{catalog,ownedCodes:catalog.filter(row=>row.owned).map(row=>row.code)});}catch(error){return reply({error:error.message,code:'PET_NOT_OWNED'},403);}
    const revision=record.state.revision+1,now=new Date().toISOString(),next={revision,petCode:body.petCode,updatedAt:now,
      audit:[{actorId:user.id,requestId:body.requestId,payloadHash,revision,createdAt:now},...record.state.audit].slice(0,50)};
    const result=record.raw===null
      ?await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(record.key,JSON.stringify(next)).run()
      :await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(JSON.stringify(next),record.key,record.raw).run();
    if(result.meta?.changes===1)return reply({...output(cms,{...record,state:next},catalog),savedRevision:revision,replayed:false});
    const latest=await readReview(env,user);return replay(latest.state)||reply({error:'다른 창에서 먼저 장착을 변경했습니다. 다시 불러와 주세요.',code:'PET_REVISION_CONFLICT'},409);
  }catch(error){console.error('[pet-equipment] unavailable',error?.name||'Error');return reply({error:'펫 장착 정보를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.',code:'PET_EQUIPMENT_UNAVAILABLE'},503);}
}
