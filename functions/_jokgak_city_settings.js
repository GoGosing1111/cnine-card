import {CITY_SETTINGS_KEY,defaultCitySettings,validateCitySettings,cityCanAccess,cityRoleDescription} from '../shared/jokgak-city-settings-v1.mjs';
import {CITY_ROLES,cityShift} from '../shared/jokgak-city-v1.mjs';
import {EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE} from '../shared/equipment-forge-release-v1.mjs';
import {readJointBody} from './_joint_request.js';

const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
const fail=(message,status=400,code='CITY_POLICY')=>{throw Object.assign(Error(message),{status,code});};
export async function readCitySettings(env){
  const raw=(await p(env,'SELECT value FROM app_meta WHERE key=?',CITY_SETTINGS_KEY).first())?.value??null;
  try{
    const defaults=defaultCitySettings(),stored=raw===null?{}:JSON.parse(raw);
    if(!stored||typeof stored!=='object'||Array.isArray(stored))throw Error('Invalid policy');
    const {writeToken,...publicStored}=stored;
    const policy=validateCitySettings({...defaults,...publicStored,mode:stored.mode??(stored.enabled===false?'OFF':'TEST'),rules:{...defaults.rules,...stored.rules},rewards:{...defaults.rewards,...stored.rewards}});
    return {raw,policy};
  }catch{fail('족각도시 설정을 읽을 수 없습니다. 관리자에게 문의하세요.',503,'CITY_POLICY_UNAVAILABLE');}
}
export async function cityRoleWeights(env,epoch,policy){
  const key='jokgak_city_role_weights_v1:'+epoch;
  let row=await p(env,'SELECT value FROM app_meta WHERE key=?',key).first();
  if(!row){await p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',key,JSON.stringify(policy.roles.map(r=>({code:r.code,weight:r.weight})))).run();row=await p(env,'SELECT value FROM app_meta WHERE key=?',key).first();}
  const weights=JSON.parse(row.value);
  if(!Array.isArray(weights)||weights.length!==7||weights.some((r,i)=>r.code!==CITY_ROLES[i].code||!Number.isSafeInteger(r.weight)||r.weight<0)||!weights.some(r=>r.weight>0))fail('역할 교대 정보를 확인하지 못했습니다.',503,'CITY_ROLE_WEIGHTS');
  return weights;
}
export const cityPublicPolicy=policy=>({mode:policy.mode,revision:policy.revision,liveRewards:policy.mode==='ON'&&policy.rewards.enabled,rewardRules:{...policy.rewards},rules:{...policy.rules},life:policy.life,roles:CITY_ROLES.map(role=>({...role,...policy.roles.find(r=>r.code===role.code),detail:cityRoleDescription(policy.roles.find(r=>r.code===role.code))}))});
export async function cityRewardCatalog(env){
  const rows=(await p(env,'SELECT code,name,rarity,image_url FROM inventory_items WHERE is_active=1 AND code<>? ORDER BY name,code LIMIT 1001',EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE).all()).results||[];
  if(rows.length>1000)fail('보상 아이템 목록의 조회 범위를 확인해 주세요.',503,'CITY_CATALOG_LIMIT');
  return rows.map(r=>({code:r.code,name:r.name,rarity:r.rarity,image:String(r.image_url||'').replaceAll('\\','/')}));
}
export async function cityTestUsers(env,ids){
  if(!ids.length)return [];
  const rows=(await p(env,`SELECT id,nickname FROM users WHERE id IN (${ids.map(()=>'?').join(',')}) AND status='ACTIVE' ORDER BY id`,...ids).all()).results||[];
  return rows.map(r=>({id:Number(r.id),nickname:String(r.nickname||'')}));
}
export async function searchCityTestUsers(env,query){
  const q=String(query||'').trim();if(!q||q.length>80)fail('정확한 닉네임 또는 계정번호를 입력하세요.');
  const numeric=/^[1-9]\d*$/.test(q)&&Number.isSafeInteger(Number(q));
  const rows=(await p(env,`SELECT id,nickname FROM users WHERE status='ACTIVE' AND ${numeric?'(id=? OR nickname=?)':'nickname=?'} ORDER BY id LIMIT 20`,...(numeric?[Number(q),q]:[q])).all()).results||[];
  return rows.map(r=>({id:Number(r.id),nickname:String(r.nickname||'')}));
}
export async function saveCitySettings(env,user,value,now=Date.now()){
  if(user?.role!=='OWNER')fail('족각도시 설정은 OWNER만 변경할 수 있습니다.',403,'CITY_PERMISSION');
  const before=await readCitySettings(env);
  if(value?.revision!==before.policy.revision)fail('다른 창에서 설정이 변경됐습니다. 다시 불러오세요.',409,'CITY_POLICY_CONFLICT');
  const next=validateCitySettings(value),catalog=await cityRewardCatalog(env),codes=new Set(catalog.map(r=>r.code));
  if(next.roles.some(r=>r.rewards.some(row=>row.items.some(item=>!codes.has(item.code)))))fail('현재 지급 가능한 보상 아이템을 선택하세요.');
  if((await cityTestUsers(env,next.testUserIds)).length!==next.testUserIds.length)fail('활성 계정을 검색하여 테스트 참여자를 지정하세요.');
  await cityRoleWeights(env,cityShift(now).id,before.policy);
  const saved={...next,revision:next.revision+1,enabled:next.mode==='ON',updatedBy:Number(user.id),updatedAt:new Date(now).toISOString(),writeToken:crypto.randomUUID()};
  const raw=JSON.stringify(saved),key=CITY_SETTINGS_KEY;
  const write=before.raw===null?p(env,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',key,raw):p(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',raw,key,before.raw);
  const audit=p(env,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT ?,'JOKGAK_CITY_SETTINGS_SAVE','JOKGAK_CITY',?,?,? WHERE EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)",user.id,key,before.raw,raw,key,raw);
  const result=await env.DB.batch([write,audit]);
  if(Number(result[0].meta?.changes)!==1)fail('다른 창에서 먼저 저장했습니다. 다시 불러오세요.',409,'CITY_POLICY_CONFLICT');
  return {...next,revision:saved.revision};
}
export async function handleCityCms({path,request,env,deps,user}){
  if(!['admin/jokgak-city','admin/jokgak-city/test-users'].includes(path))return null;
  if(user.role!=='OWNER')fail('족각도시 설정은 OWNER 전용입니다.',403,'CITY_PERMISSION');
  if(path.endsWith('/test-users')){
    if(request.method!=='GET')fail('지원하지 않는 요청입니다.',405);
    return deps.json({ok:true,users:await searchCityTestUsers(env,new URL(request.url).searchParams.get('q'))});
  }
  if(request.method==='GET'){
    const [{policy},catalog]=await Promise.all([readCitySettings(env),cityRewardCatalog(env)]);
    return deps.json({ok:true,policy,catalog,testUsers:await cityTestUsers(env,policy.testUserIds),roleWeightsApplyAt:cityShift((deps.now||Date.now)()).endsAt});
  }
  if(request.method!=='PATCH')fail('지원하지 않는 요청입니다.',405);
  const body=await readJointBody(request,{fields:['policy'],maxBytes:64000});
  return deps.json({ok:true,policy:await deps.withUserMutationLock(env,user.id,path,()=>saveCitySettings(env,user,body.policy,(deps.now||Date.now)()))});
}
export function requireCityAccess(policy,user){
  if(!cityCanAccess(policy,user))fail(policy.mode==='TEST'?'족각도시는 TEST 운영 중입니다. OWNER와 지정된 테스트 참여자만 이용할 수 있습니다.':'족각도시 운영이 중지되었습니다.',403,policy.mode==='TEST'?'CITY_TEST_ONLY':'CITY_CLOSED');
}
