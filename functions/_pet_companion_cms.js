import {PET_CMS_KEY,PET_CMS_MAX_BYTES,PET_CMS_LOCKS,PET_BUFF_TYPES,PET_BUFF_TARGETS,emptyPetCmsDocument,validatePetCmsDocument,validatePetCmsSave} from '../shared/pet-cms-v1.mjs';
import {COMPANION_FORMATION_RULES,COMPANION_RELEASE,validateCompanionLoadout,preparedFormation} from '../shared/companion-loadout-v2.mjs';
import {readMercenaryDocument,readMercenaryRuntime,battleConfig} from './_mercenary_account.js';
import {createCompanionPreparationBattle,COMPANION_REVIEW_CARDS} from './_companion_preparation.js';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';

const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
async function boundedJson(request){
  if(Number(request.headers.get('content-length'))>PET_CMS_MAX_BYTES)throw Error('설정 요청이 너무 큽니다.');
  const reader=request.body?.getReader();if(!reader)throw Error('요청 내용이 필요합니다.');
  const decoder=new TextDecoder();let size=0,text='';
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>PET_CMS_MAX_BYTES){await reader.cancel();throw Error('설정 요청이 너무 큽니다.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{reader.releaseLock();}
}
export async function readPetCms(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(PET_CMS_KEY).first();
  if(!row)return {raw:null,state:{revision:0,document:emptyPetCmsDocument(),updatedAt:null,updatedBy:null,audit:[]}};
  const stored=JSON.parse(row.value);
  if(!Number.isSafeInteger(stored.revision)||stored.revision<1||!Array.isArray(stored.audit)||stored.audit.length>50)throw Error('Invalid PET CMS record');
  stored.document=validatePetCmsDocument(stored.document,{allowLegacy:true});
  return {raw:row.value,state:stored};
}
export async function readCompanionReviewCatalog(env){
  const [{document,revision},runtime]=await Promise.all([readMercenaryDocument(env),readMercenaryRuntime(env)]);
  return {revision,mercenaries:document.mercenaries.filter(row=>row.rank).map(row=>({...battleConfig(document,row.code,1),combat:runtime.combat}))};
}
export async function handlePetCompanionCms({path,request,env,deps}){
  if(!['admin/pets','admin/companions/preparation','admin/companions/preparation/preview'].includes(path))return null;
  const reply=(body,status=200)=>{const response=deps.json(body,status);response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Authorization');return response;};
  const admin=await deps.requirePermission(request,env,'BATTLE_MANAGE');
  if(!admin||admin.role!=='OWNER')return reply({error:'펫·동료 준비 CMS는 OWNER만 사용할 수 있습니다.'},403);
  const methods=path==='admin/pets'?['GET','PATCH']:path.endsWith('/preview')?['POST']:['GET'];
  if(!methods.includes(request.method))return reply({error:'지원하지 않는 요청입니다.'},405);
  let body;
  if(request.method!=='GET')try{
    body=await boundedJson(request);
    if(path==='admin/pets')body=validatePetCmsSave(body);
    else if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['loadout','mode','seed','petRevision','mercenaryRevision'].includes(key))||!['PVE','PVP'].includes(body.mode)||!Number.isSafeInteger(body.seed)||body.seed<0||body.seed>4294967295||!Number.isSafeInteger(body.petRevision)||!Number.isSafeInteger(body.mercenaryRevision))throw Error('편성·전투 모드·검수 버전을 확인해 주세요.');
  }catch(error){return reply({error:error instanceof SyntaxError?'올바른 JSON 요청이 필요합니다.':error.message},400);}
  const output=state=>({...state,locks:PET_CMS_LOCKS,buffTypes:PET_BUFF_TYPES,buffTargets:PET_BUFF_TARGETS,rules:COMPANION_FORMATION_RULES,release:COMPANION_RELEASE,artCatalog:PET_ART_CATALOG});
  try{
    const current=await readPetCms(env);
    if(path!=='admin/pets'){
      const catalog=await(deps.readCatalog||readCompanionReviewCatalog)(env);
      if(request.method==='GET')return reply({...output(current.state),mercenaryRevision:catalog.revision,mercenaries:catalog.mercenaries,cards:COMPANION_REVIEW_CARDS});
      if(body.petRevision!==current.state.revision||body.mercenaryRevision!==catalog.revision)return reply({error:'CMS 설정이 바뀌었습니다. 다시 불러온 뒤 검수해 주세요.',code:'REVISION_CONFLICT'},409);
      const validation=validateCompanionLoadout(body.loadout,{mercenaries:catalog.mercenaries,pets:current.state.document.pets,review:true});
      if(!validation.ok)return reply({error:validation.errors.join(' '),code:'INVALID_LOADOUT'},400);
      if(validation.loadout.cardIds.some((id,index)=>id!==COMPANION_REVIEW_CARDS[index].id))return reply({error:'검수용 일반 카드 5장만 사용할 수 있습니다.'},400);
      try{return reply({formation:preparedFormation(validation.loadout),petRevision:current.state.revision,mercenaryRevision:catalog.revision,battle:createCompanionPreparationBattle({mode:body.mode,seed:body.seed,attacker:{cards:COMPANION_REVIEW_CARDS,mercenaries:validation.mercenaries,pet:validation.pet}})});}
      catch(error){return reply({error:error.message,code:'PREPARATION_NOT_READY'},400);}
    }
    if(request.method==='GET')return reply(output(current.state));
    const payloadHash=await hash(JSON.stringify([String(admin.id),body.expectedRevision,body.document]));
    const replay=state=>{const receipt=state.audit.find(row=>row.requestId===body.requestId);if(!receipt)return null;return String(receipt.actorId)!==String(admin.id)||receipt.payloadHash!==payloadHash?reply({error:'같은 요청 ID에 다른 내용이 포함되었습니다.',code:'REQUEST_ID_CONFLICT'},409):reply({...output(state),savedRevision:receipt.revision,replayed:true});};
    const prior=replay(current.state);if(prior)return prior;
    const conflict=()=>reply({error:'다른 창에서 먼저 저장했습니다. 편집본을 내려받고 다시 불러와 주세요.',code:'REVISION_CONFLICT'},409);
    if(current.state.revision!==body.expectedRevision)return conflict();
    const now=new Date().toISOString(),revision=body.expectedRevision+1;
    const next={revision,document:body.document,updatedAt:now,updatedBy:admin.id,audit:[{requestId:body.requestId,payloadHash,actorId:admin.id,revision,createdAt:now},...current.state.audit].slice(0,50)};
    const serialized=JSON.stringify(next);
    const saved=current.raw===null?await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(PET_CMS_KEY,serialized).run():await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(serialized,PET_CMS_KEY,current.raw).run();
    if(saved.meta?.changes===1)return reply({...output(next),savedRevision:revision,replayed:false});
    const latest=await readPetCms(env);return replay(latest.state)||conflict();
  }catch(error){console.error('[pet-companion-cms] unavailable',error?.name||'Error');return reply({error:'펫·동료 준비 설정을 확인하지 못했습니다. 편집본을 내려받고 같은 저장 요청으로 재시도해 주세요.',code:'PET_CMS_UNAVAILABLE'},503);}
}
