import {TROPHY_BONUSES_KEY,validateTrophyBonuses} from '../shared/trophy-bonuses-v1.mjs';
import {REWARD_BONUS_LABELS,REWARD_BONUS_HELP} from '../shared/collection-bonuses-v1.mjs';
import {TROPHY_CATALOG} from '../js/player-card-model-v2052.js';
import {readTrophyBonusSettings,readCollectionBonuses} from './_collection_bonuses.js';
import {readJointBody} from './_joint_request.js';

export async function handleTrophyBonusCms({path,request,env,deps}){
  if(!['admin/trophy-bonuses','collection-bonuses'].includes(path))return null;
  const reply=(body,status=200)=>{const r=deps.json(body,status);r.headers.set('Cache-Control','private, no-store');r.headers.set('Vary','Authorization');return r;};
  const admin=path==='admin/trophy-bonuses';
  const user=admin?await deps.requirePermission(request,env,'BATTLE_MANAGE'):await deps.authenticate(request,env);
  if(!user||admin&&user.role!=='OWNER')return reply({error:admin?'OWNER만 보유 효과를 설정할 수 있습니다.':'로그인이 필요합니다.'},admin?403:401);
  if(!(admin?['GET','PATCH']:['GET']).includes(request.method))return reply({error:'지원하지 않는 요청입니다.'},405);
  try{
    if(!admin)return reply({...await readCollectionBonuses(env,user.id),labels:REWARD_BONUS_LABELS,help:REWARD_BONUS_HELP});
    const output=state=>({revision:state.revision,document:state.document,catalog:TROPHY_CATALOG,labels:REWARD_BONUS_LABELS,help:REWARD_BONUS_HELP,updatedAt:state.updatedAt||null});
    const current=await readTrophyBonusSettings(env);
    if(request.method==='GET')return reply(output(current));
    let body;
    try{
      body=await readJointBody(request,{fields:['document','expectedRevision','requestId']});
      if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||body.expectedRevision>=2147483646||typeof body.requestId!=='string'||!/^[A-Za-z0-9-]{16,100}$/.test(body.requestId))throw Error('요청 번호와 저장 버전을 확인해 주세요.');
      body.document=validateTrophyBonuses(body.document);
    }catch(error){return reply({error:error.message},error.status||400);}
    const payloadHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([String(user.id),body.expectedRevision,body.document])))),b=>b.toString(16).padStart(2,'0')).join('');
    const replay=state=>{const row=state.audit.find(a=>a.requestId===body.requestId);return !row?null:row.payloadHash!==payloadHash||String(row.actorId)!==String(user.id)?reply({error:'같은 요청 번호의 내용이 다릅니다.',code:'REQUEST_ID_CONFLICT'},409):reply({...output(state),savedRevision:row.revision,replayed:true});};
    const prior=replay(current);if(prior)return prior;
    const conflict=()=>reply({error:'다른 창에서 먼저 저장했습니다. 새로고침 후 다시 설정해 주세요.',code:'REVISION_CONFLICT'},409);
    if(current.revision!==body.expectedRevision)return conflict();
    const revision=current.revision+1,updatedAt=new Date().toISOString(),next={revision,document:body.document,updatedAt,updatedBy:user.id,audit:[{requestId:body.requestId,payloadHash,actorId:user.id,revision,createdAt:updatedAt},...current.audit].slice(0,50)};
    const saved=current.raw===null?await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(TROPHY_BONUSES_KEY,JSON.stringify(next)).run():await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(JSON.stringify(next),TROPHY_BONUSES_KEY,current.raw).run();
    if(saved.meta?.changes===1)return reply({...output(next),savedRevision:revision,replayed:false});
    return replay(await readTrophyBonusSettings(env))||conflict();
  }catch(error){console.error('[collection-bonuses]',error?.name||'Error');return reply({error:'보너스 설정을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.'},503);}
}
