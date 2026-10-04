import {POLISH_KEY,POLISH_ITEM_CODE,POLISH_EXECUTION_READY,POLISH_ART,polishDefaults,validatePolishSettings,polishPreviewResult} from '../shared/equipment-polish-v1.mjs';
import {readJointBody,jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {readForgePreparationInventory} from './_equipment_forge_preparation.js';

const catalogStatement=(db,m,update=false)=>db.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,'EQUIPMENT POLISH',?,'MATERIAL','SPECIAL',?,14,?) ON CONFLICT(code) ${update?'DO UPDATE SET name=excluded.name,description=excluded.description,is_active=excluded.is_active,updated_at=CURRENT_TIMESTAMP':'DO NOTHING'}`).bind(POLISH_ITEM_CODE,m.name,m.description,(POLISH_ART+'polishing-stone-v1.png').slice(1),Number(m.active));
export async function readPolishSettings(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(POLISH_KEY).first();
  if(!row)return {settings:polishDefaults(),raw:null};
  try{return {settings:validatePolishSettings(JSON.parse(row.value)),raw:row.value};}
  catch{return {settings:polishDefaults(),raw:row.value,invalid:true};}
}
export async function ensurePolishCatalog(env){
  const current=await readPolishSettings(env);
  if(current.invalid)throw jointError('POLISH_CORRUPT','연마 설정을 복구한 뒤 다시 확인하세요.',409);
  await env.DB.batch([catalogStatement(env.DB,current.settings.material),env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(POLISH_KEY,JSON.stringify(current.settings))]);
}
const release=settings=>({publicVisible:settings.publicVisible,executionMode:'OFF',canPolish:false,executionReady:POLISH_EXECUTION_READY,notice:settings.notice});
async function adminState(env){
  const current=await readPolishSettings(env);
  const material=await env.DB.prepare('SELECT code,name,description,image_url,is_active FROM inventory_items WHERE code=?').bind(POLISH_ITEM_CODE).first();
  return {settings:current.settings,invalid:!!current.invalid,material,executionReady:POLISH_EXECUTION_READY,saveScope:'POLICY_AND_MATERIAL',pending:['운영 수치 최종 확정','연마 차감·인스턴스 성장·전투 적용 출시 검수']};
}
export async function savePolishSettings(env,admin,body){
  const before=await readPolishSettings(env),next=validatePolishSettings(body.settings);
  if(before.invalid)throw jointError('POLISH_CORRUPT','손상된 설정은 운영 복구가 필요합니다.',409);
  if(body.expectedRevision!==before.settings.revision||next.revision!==body.expectedRevision)throw jointError('POLISH_CONFLICT','다른 창에서 설정을 바꿨습니다. 최신 값을 불러오세요.',409);
  next.revision++;const raw=JSON.stringify(next),token=crypto.randomUUID(),db=env.DB;
  try{await db.batch([
    jointGuard(db,token,before.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',before.raw===null?[POLISH_KEY]:[POLISH_KEY,before.raw]),
    db.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(POLISH_KEY,raw),
    catalogStatement(db,next.material,true),
    db.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)').bind(admin.id,'EQUIPMENT_POLISH_SETTINGS','APP_META',POLISH_KEY,before.raw,raw),jointGuardEnd(db,token)
  ]);}catch(error){if((await readPolishSettings(env)).raw!==before.raw)throw jointError('POLISH_CONFLICT','설정이 변경됐습니다. 최신 값을 불러오세요.',409);throw error;}
  return adminState(env);
}
export async function handleEquipmentPolish({path,request,env,deps}){
  const admin=path==='admin/equipment-polish',prefix='character/equipment/polish/';
  if(!admin&&!path.startsWith(prefix))return null;
  const {json,authenticate,requirePermission}=deps;
  try{
    const action=admin?'admin':path.slice(prefix.length);
    if(!['admin','status','state','preview','quote','execute','receipt'].includes(action))throw jointError('POLISH_PATH','연마 경로를 찾을 수 없습니다.',404);
    if(action==='status'&&request.method==='GET'){
      const [user,current]=await Promise.all([authenticate(request,env),readPolishSettings(env)]);
      // Bootstrap only missing fixed catalog/policy rows. Never creates balances or grants.
      // ON CONFLICT DO NOTHING preserves any concurrent CMS save.
      if(current.raw===null)await ensurePolishCatalog(env);
      return json({...release(current.settings),ownerReview:user?.role==='OWNER',canEnter:!current.invalid&&(current.settings.publicVisible||user?.role==='OWNER')});
    }
    const user=admin?await requirePermission(request,env,'SETTINGS'):await authenticate(request,env);
    if(!user)throw jointError('POLISH_AUTH','로그인이 필요합니다.',401);
    if(admin&&user.role!=='OWNER')throw jointError('POLISH_PERMISSION','OWNER만 연마 정책을 관리할 수 있습니다.',403);
    if(admin){
      if(request.method==='GET'){await ensurePolishCatalog(env);return json(await adminState(env));}
      if(request.method==='PATCH')return json(await savePolishSettings(env,user,await readJointBody(request,{fields:['expectedRevision','settings'],maxBytes:32000})));
      throw jointError('POLISH_METHOD','지원하지 않는 요청입니다.',405);
    }
    const current=await readPolishSettings(env),settings=current.settings;
    if(current.invalid||(!settings.publicVisible&&user.role!=='OWNER'))throw jointError('POLISH_NOT_PUBLIC','장비 연마를 준비하고 있습니다.',403);
    if(['quote','execute','receipt'].includes(action))throw jointError('POLISH_OFF','실제 연마는 OFF 상태입니다. 장비와 재화는 소모되지 않습니다.',423);
    if(action==='state'&&request.method==='GET'){
      const url=new URL(request.url);let inventory;
      try{inventory=await readForgePreparationInventory(env.DB,user.id,{beforeId:url.searchParams.get('beforeId'),group:url.searchParams.get('group')||'all',limit:40,includeEnhancement:true});}catch(error){throw jointError('POLISH_INPUT',error.message);}
      const [wallet,balances]=await Promise.all([env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first(),env.DB.prepare('SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? AND item_code IN (?,?)').bind(user.id,POLISH_ITEM_CODE,'MASTER_STAR').all()]);
      const amounts=Object.fromEntries((balances.results||[]).map(r=>[r.item_code,String(r.quantity)]));
      return json({...inventory,...release(settings),ownerReview:user.role==='OWNER',settings,items:inventory.items.map(i=>({...i,polishEligible:settings.slots.includes(i.slot)})),wallet:{coins:String(wallet?.coin??0),masterStars:amounts.MASTER_STAR||'0',stones:amounts[POLISH_ITEM_CODE]||'0'}});
    }
    if(action==='preview'&&request.method==='POST'){
      if(user.role!=='OWNER')throw jointError('POLISH_PERMISSION','OWNER만 연출을 검수할 수 있습니다.',403);
      const body=await readJointBody(request,{fields:['instanceId','levels','revision'],maxBytes:3000});
      if(body.revision!==settings.revision)throw jointError('POLISH_CONFLICT','설정이 바뀌었습니다. 새로고침 후 확인하세요.',409);
      if(typeof body.instanceId!=='string'||!/^[1-9][0-9]{0,18}$/.test(body.instanceId)||BigInt(body.instanceId)>9223372036854775807n)throw jointError('POLISH_INPUT','장비를 선택하세요.');
      const owned=await env.DB.prepare('SELECT i.slot FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.id=? AND x.user_id=? AND i.is_active=1 AND i.is_public=1').bind(body.instanceId,user.id).first();
      if(!owned||!settings.slots.includes(owned.slot))throw jointError('POLISH_NOT_OWNED','선택한 장비를 확인하세요.',404);
      const n=new Uint32Array(1);crypto.getRandomValues(n);
      return json({...polishPreviewResult(settings,body.levels,n[0]/4294967296),requestId:crypto.randomUUID(),instanceId:body.instanceId});
    }
    throw jointError('POLISH_METHOD','지원하지 않는 요청입니다.',405);
  }catch(error){const known=/^(POLISH_|JOINT_)/.test(error.code||'');return json({error:known?error.message:'연마 정보를 불러오지 못했습니다.',code:known?error.code:'POLISH_UNAVAILABLE'},known?(error.status||400):503);}
}
