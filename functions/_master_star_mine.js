import {MINE_KEY,MINE_DRILLS,MINE_DURATION_MS,emptyMinePolicy,validateMinePolicy,mineReadiness,mineAccess} from '../shared/master-star-mine-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {runJointOperation,jointInventoryChange,jointRequestId} from './_joint_transactions.js';
import {readJointBody} from './_joint_request.js';
export const MINE_SCHEMA=[
 "CREATE TABLE IF NOT EXISTS master_star_mine_runs_v1(id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,drill_code TEXT NOT NULL,reward BIGINT NOT NULL CHECK(reward>0 AND reward<=10000000),policy_revision BIGINT NOT NULL,started_at_ms BIGINT NOT NULL,ready_at_ms BIGINT NOT NULL CHECK(ready_at_ms=started_at_ms+14400000),claimed_at_ms BIGINT,claim_request_id TEXT UNIQUE)",
 "CREATE UNIQUE INDEX IF NOT EXISTS master_star_mine_active_v1 ON master_star_mine_runs_v1(user_id) WHERE claimed_at_ms IS NULL",
 "CREATE INDEX IF NOT EXISTS master_star_mine_history_v1 ON master_star_mine_runs_v1(user_id,started_at_ms DESC)"
];
// Explicit release preparation only; player/CMS reads never run DDL.
export async function ensureMineSchema(env){if(env.DB.execSchema)await env.DB.execSchema(MINE_SCHEMA);else for(const sql of MINE_SCHEMA)await env.DB.prepare(sql).run();}
export async function ensureMineCatalog(env){for(const d of MINE_DRILLS)await env.DB.prepare('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING').bind(d.code,d.name,d.label,d.description+' 마스터의 별 광산에서 사용하는 영구 장비입니다.','MINE_TOOL','SPECIAL',d.image,40+MINE_DRILLS.indexOf(d)).run();}
const fail=(code,message,status=409)=>Object.assign(new Error(message),{code:'MINE_'+code,status});
const rawPolicy=async env=>(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(MINE_KEY).first())?.value??null;
export async function readMinePolicy(env){const raw=await rawPolicy(env);return raw?JSON.parse(raw):{revision:0,policy:emptyMinePolicy(),updatedAt:null};}
const balance=async(env,id,code)=>Number((await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(id,code).first())?.quantity||0);
const activeRun=(env,id)=>env.DB.prepare('SELECT * FROM master_star_mine_runs_v1 WHERE user_id=? AND claimed_at_ms IS NULL').bind(id).first();
const runView=(r,now)=>r?{id:r.id,drillCode:r.drill_code,reward:Number(r.reward),policyRevision:Number(r.policy_revision),startedAt:Number(r.started_at_ms),readyAt:Number(r.ready_at_ms),claimedAt:r.claimed_at_ms===null?null:Number(r.claimed_at_ms),status:r.claimed_at_ms!==null?'CLAIMED':now>=Number(r.ready_at_ms)?'READY':'MINING'}:null;
export async function mineState(env,user,{now=Date.now()}={}){
 const [setting,run,holdings,history]=await Promise.all([readMinePolicy(env),activeRun(env,user.id),env.DB.prepare("SELECT item_code,quantity FROM cnine_user_inventory WHERE user_id=? AND item_code IN ('MASTER_STAR','MINE_ELECTRIC_DRILL','MINE_SOLAR_DRILL','MINE_GOLDEN_DRILL')").bind(user.id).all(),env.DB.prepare('SELECT * FROM master_star_mine_runs_v1 WHERE user_id=? AND claimed_at_ms IS NOT NULL ORDER BY started_at_ms DESC LIMIT 5').bind(user.id).all()]);
 const policy=validateMinePolicy(setting.policy),items=new Map(holdings.results.map(i=>[i.item_code,Number(i.quantity)]));
 return {accountId:Number(user.id),serverNow:now,durationMs:MINE_DURATION_MS,mode:policy.mode,enabled:mineAccess(policy,user.id),acquisitionNotice:policy.acquisitionNotice,balance:items.get('MASTER_STAR')||0,revision:setting.revision,
 drills:MINE_DRILLS.map(d=>({...d,owned:(items.get(d.code)||0)>0,reward:policy.rewards[d.code]})),run:runView(run,now),history:history.results.map(r=>runView(r,now))};
}
export async function startMine(env,user,body,{now=()=>Date.now()}={}){
 const drill=MINE_DRILLS.find(d=>d.code===body.drillCode);if(!drill)throw fail('DRILL','채굴할 드릴을 선택하세요.',400);
 const result=await runJointOperation(env,user,{requestId:body.requestId,kind:'MINE_START',input:{drillCode:drill.code},prepare:async()=>{
  const raw=await rawPolicy(env);if(!raw)throw fail('CLOSED','광산 개장을 준비 중입니다.');
  const setting=JSON.parse(raw),policy=validateMinePolicy(setting.policy);
  if(!mineAccess(policy,user.id))throw fail('CLOSED','현재 채굴을 시작할 수 없습니다.');
  if(await activeRun(env,user.id))throw fail('ACTIVE','진행 중인 채굴을 먼저 완료하고 보상을 수령하세요.');
  if(await balance(env,user.id,drill.code)<1)throw fail('OWNERSHIP','보유한 드릴만 사용할 수 있습니다.');
  return {drillCode:drill.code,reward:policy.rewards[drill.code],policyRaw:raw,policyRevision:setting.revision};
 },statements:async plan=>{
  if(await rawPolicy(env)!==plan.policyRaw)throw Object.assign(fail('POLICY_CHANGED','광산 설정이 변경됐습니다. 새로고침 후 시작하세요.'),{terminal:true});
  if(await activeRun(env,user.id))throw Object.assign(fail('ACTIVE','이미 진행 중인 채굴이 있습니다.'),{terminal:true});
  const DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args),token=crypto.randomUUID(),at=now();
  const list=DB.dialect==='postgres'?[p('SELECT value FROM app_meta WHERE key=? FOR SHARE',MINE_KEY)]:[];
  list.push(jointGuard(DB,token,"EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>0) AND EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1) AND NOT EXISTS(SELECT 1 FROM master_star_mine_runs_v1 WHERE user_id=? AND claimed_at_ms IS NULL)",[MINE_KEY,plan.policyRaw,user.id,plan.drillCode,plan.drillCode,user.id]),
   p('INSERT INTO master_star_mine_runs_v1(id,user_id,drill_code,reward,policy_revision,started_at_ms,ready_at_ms) VALUES(?,?,?,?,?,?,?)',body.requestId,user.id,plan.drillCode,plan.reward,plan.policyRevision,at,at+MINE_DURATION_MS),jointGuardEnd(DB,token));return list;
 }});
 return {requestId:result.requestId,replayed:result.replayed,status:'COMPLETED',...await mineState(env,user,{now:now()})};
}
export async function claimMine(env,user,body,{now=()=>Date.now()}={}){
 jointRequestId(body.runId);
 const result=await runJointOperation(env,user,{requestId:body.requestId,kind:'MINE_CLAIM',input:{runId:body.runId},prepare:async()=>{
  const run=await env.DB.prepare('SELECT * FROM master_star_mine_runs_v1 WHERE id=? AND user_id=?').bind(body.runId,user.id).first();
  if(!run)throw fail('RUN','내 채굴 기록을 찾을 수 없습니다.',404);
  if(run.claimed_at_ms!==null)throw fail('CLAIMED','이미 수령한 채굴 보상입니다.');
  if(now()<Number(run.ready_at_ms))throw fail('NOT_READY','4시간 채굴이 완료된 뒤 수령할 수 있습니다.');
  return {runId:run.id,reward:Number(run.reward),drillCode:run.drill_code,readyAt:Number(run.ready_at_ms)};
 },statements:async plan=>{
  const DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args),at=now(),token=crypto.randomUUID();
  const run=await p('SELECT claimed_at_ms FROM master_star_mine_runs_v1 WHERE id=? AND user_id=?',plan.runId,user.id).first();
  if(!run||run.claimed_at_ms!==null)throw Object.assign(fail('CLAIMED','이미 수령한 채굴 보상입니다.'),{terminal:true});
  if(at<plan.readyAt)throw fail('NOT_READY','채굴이 아직 완료되지 않았습니다.');
  // An earned reward remains claimable when CMS pauses new starts or changes rates.
  return [jointGuard(DB,token,'EXISTS(SELECT 1 FROM master_star_mine_runs_v1 WHERE id=? AND user_id=? AND claimed_at_ms IS NULL AND ready_at_ms<=? AND reward=?)',[plan.runId,user.id,at,plan.reward]),
   p('UPDATE master_star_mine_runs_v1 SET claimed_at_ms=?,claim_request_id=? WHERE id=? AND user_id=? AND claimed_at_ms IS NULL',at,body.requestId,plan.runId,user.id),
   ...jointInventoryChange(DB,user.id,'MASTER_STAR',plan.reward,'마스터의 별 광산 채굴',plan.runId),jointGuardEnd(DB,token)];
 }});
 return {requestId:result.requestId,replayed:result.replayed,status:'COMPLETED',claimed:{runId:result.plan.runId,reward:result.plan.reward},...await mineState(env,user,{now:now()})};
}
export async function saveMinePolicy(env,user,body){
 if(user.role!=='OWNER')throw fail('PERMISSION','OWNER만 광산을 관리할 수 있습니다.',403);
 if(!Number.isSafeInteger(body.revision)||body.revision<0||body.revision>=2147483646)throw fail('REVISION','설정 버전을 확인하세요.',400);
 let policy;try{policy=validateMinePolicy(body.policy);}catch(e){throw fail('POLICY',e.message,400);}
 if(policy.mode!=='OFF'&&!mineReadiness(policy).ready)throw fail('NOT_READY',mineReadiness(policy).blockers.join(' · '));
 const result=await runJointOperation(env,user,{requestId:body.requestId,kind:'MINE_POLICY',input:{revision:body.revision,policy},prepare:async()=>{
  const before=await rawPolicy(env),previous=before?JSON.parse(before):{revision:0};
  if(previous.revision!==body.revision)throw fail('REVISION_CONFLICT','다른 창에서 변경됐습니다. 설정을 다시 불러오세요.');
  return {before,next:{revision:previous.revision+1,policy,updatedBy:Number(user.id),updatedAt:new Date().toISOString()}};
 },statements:async plan=>{
  if(await rawPolicy(env)!==plan.before)throw Object.assign(fail('REVISION_CONFLICT','다른 창에서 변경됐습니다. 설정을 다시 불러오세요.'),{terminal:true});
  const DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args),token=crypto.randomUUID(),encoded=JSON.stringify(plan.next);
  return [jointGuard(DB,token,plan.before===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',plan.before===null?[MINE_KEY]:[MINE_KEY,plan.before]),
   p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',MINE_KEY,encoded),
   p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,'MASTER_STAR_MINE_POLICY','APP_META',MINE_KEY,plan.before,encoded),jointGuardEnd(DB,token)];
 }});
 return {...await readMinePolicy(env),replayed:result.replayed};
}
export async function mineAdminUser(env,id){
 if(!Number.isSafeInteger(id)||id<1)throw fail('USER','숫자 계정 ID를 입력하세요.',400);
 const user=await env.DB.prepare('SELECT id,nickname FROM users WHERE id=?').bind(id).first();if(!user)throw fail('USER','계정을 찾을 수 없습니다.',404);
 const state=await mineState(env,user);return {id:Number(user.id),nickname:user.nickname,drills:state.drills,run:state.run};
}
export async function manageMineDrill(env,admin,body){
 if(admin.role!=='OWNER')throw fail('PERMISSION','OWNER만 드릴을 관리할 수 있습니다.',403);
 if(!Number.isSafeInteger(body.userId)||body.userId<1||!MINE_DRILLS.some(d=>d.code===body.drillCode)||!['GRANT','REVOKE'].includes(body.action)||typeof body.reason!=='string'||body.reason.trim().length<2||body.reason.length>200)throw fail('GRANT','계정·드릴·지급/회수 사유를 확인하세요.',400);
 const result=await runJointOperation(env,admin,{requestId:body.requestId,kind:'MINE_DRILL_ADMIN',input:{userId:body.userId,drillCode:body.drillCode,action:body.action,reason:body.reason.trim()},prepare:async()=>{
  await mineAdminUser(env,body.userId);const quantity=await balance(env,body.userId,body.drillCode);
  if(body.action==='GRANT'&&quantity>0)throw fail('OWNED','이미 보유한 영구 드릴입니다.');
  if(body.action==='REVOKE'&&quantity<1)throw fail('NOT_OWNED','보유하지 않은 드릴입니다.');
  const run=await activeRun(env,body.userId);if(body.action==='REVOKE'&&run?.drill_code===body.drillCode)throw fail('ACTIVE','이 드릴의 채굴 보상을 수령한 뒤 회수하세요.');
  return {quantity,change:body.action==='GRANT'?1:-quantity,userId:body.userId,drillCode:body.drillCode,reason:body.reason.trim()};
 },statements:async plan=>{
  const DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args),token=crypto.randomUUID();
  if(await balance(env,plan.userId,plan.drillCode)!==plan.quantity)throw Object.assign(fail('OWNERSHIP_CHANGED','드릴 보유 상태가 변경됐습니다. 다시 조회하세요.'),{terminal:true});
  const list=DB.dialect==='postgres'&&Number(admin.id)!==plan.userId?[p('SELECT id FROM users WHERE id=? FOR UPDATE',plan.userId)]:[];
  list.push(jointGuard(DB,token,"COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)=? AND (? > 0 OR NOT EXISTS(SELECT 1 FROM master_star_mine_runs_v1 WHERE user_id=? AND drill_code=? AND claimed_at_ms IS NULL))",[plan.userId,plan.drillCode,plan.quantity,plan.change,plan.userId,plan.drillCode]),
   ...jointInventoryChange(DB,plan.userId,plan.drillCode,plan.change,'광산 드릴 관리: '+plan.reason,body.requestId),
   p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',admin.id,'MASTER_STAR_MINE_DRILL','USER',String(plan.userId),JSON.stringify({drillCode:plan.drillCode,quantity:plan.quantity}),JSON.stringify({drillCode:plan.drillCode,quantity:plan.quantity+plan.change,reason:plan.reason,requestId:body.requestId})),jointGuardEnd(DB,token));return list;
 }});
 return {replayed:result.replayed,...await mineAdminUser(env,body.userId)};
}
export async function handleMasterStarMine({path,request,env,deps}){
 const routes=['master-star-mine/state','master-star-mine/start','master-star-mine/claim','admin/master-star-mine','admin/master-star-mine/user','admin/master-star-mine/drill'];if(!routes.includes(path))return null;
 try{
  const user=await deps.authenticate(request,env);if(!user)throw fail('AUTH','로그인이 필요합니다.',401);
  const admin=path.startsWith('admin/');if(admin&&user.role!=='OWNER')throw fail('PERMISSION','OWNER만 광산을 관리할 수 있습니다.',403);
  if(request.method==='GET'){
   if(path==='master-star-mine/state')return deps.json(await mineState(env,user));
   if(path==='admin/master-star-mine')return deps.json({...await readMinePolicy(env),drills:MINE_DRILLS,durationMs:MINE_DURATION_MS});
   if(path==='admin/master-star-mine/user')return deps.json(await mineAdminUser(env,Number(new URL(request.url).searchParams.get('userId'))));
   throw fail('METHOD','지원하지 않는 요청입니다.',405);
  }
  const policy=path==='admin/master-star-mine',grant=path==='admin/master-star-mine/drill',start=path==='master-star-mine/start',claim=path==='master-star-mine/claim';
  if(!(policy||grant||start||claim)||request.method!==(policy?'PATCH':'POST'))throw fail('METHOD','지원하지 않는 요청입니다.',405);
  const fields=policy?['requestId','revision','policy']:grant?['requestId','userId','drillCode','action','reason']:start?['requestId','drillCode']:['requestId','runId'];
  const body=await readJointBody(request,{maxBytes:8192,fields});
  if(typeof deps.withUserMutationLock!=='function')throw fail('LOCK','계정 잠금 서비스를 확인하세요.',503);
  if(grant&&(!Number.isSafeInteger(body.userId)||body.userId<1))throw fail('USER','계정 ID를 확인하세요.',400);
  return deps.json(await deps.withUserMutationLock(env,grant?body.userId:user.id,path,()=>policy?saveMinePolicy(env,user,body):grant?manageMineDrill(env,user,body):start?startMine(env,user,body):claimMine(env,user,body)));
 }catch(e){const known=/^(MINE_|JOINT_)/.test(e.code||'');return deps.json({code:known?e.code:'MINE_FAILED',error:known?e.message:'처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.',retryable:!known||e.status>=500},known?e.status||400:503);}
}
