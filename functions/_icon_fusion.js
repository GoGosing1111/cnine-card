import {ICON_FUSION_RELEASE_ENABLED,ICON_FUSION_POLICY as POLICY,ICON_LIVE_CARDS,ICON_FUSION_SETTINGS_KEY,ICON_FUSION_DEFAULT_SETTINGS,validateIconVideoUrl} from '../shared/icon-fusion-policy-v1.mjs';
import {runJointOperation,readJointOperation,jointCoinDebit,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';
import {mercenaryRandomInt} from './_mercenary_draw_accounting.js';

const KIND='ICON_FUSION';
const fail=(code,message,status=409)=>jointError(`ICON_FUSION_${code}`,message,status);
const plainCard=row=>({id:String(row.id),name:row.name,title:row.title,grade:row.grade,image:row.image,focusX:Number(row.focusX??50),focusY:Number(row.focusY??50),quantity:Number(row.quantity),breakthroughLevel:Number(row.breakthrough_level)});
const sourceSelect=`SELECT uc.card_id AS id,uc.quantity,uc.breakthrough_level,c.rarity AS grade,c.title,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.name FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id JOIN members m ON m.id=c.member_id WHERE uc.user_id=? AND uc.quantity>0 AND c.is_active=1 AND m.is_active=1 AND c.card_status='PUBLIC'`;
const deckTables=['pve_decks','pvp_decks','pvp_deck_presets'];
const deckIds=rows=>new Set(rows.flatMap(row=>{const ids=JSON.parse(row.card_ids||'[]');if(!Array.isArray(ids))throw fail('DECK','편성 정보를 확인해 주세요.');return ids.map(String);}));
async function readDecks(DB,userId){return (await DB.batch(deckTables.map(table=>DB.prepare(`SELECT card_ids FROM ${table} WHERE user_id=?`).bind(userId)))).flatMap(r=>r.results||[]);}
export async function readIconFusionSettings(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(ICON_FUSION_SETTINGS_KEY).first();
  return parseSettings(row);
}
function parseSettings(row){
  const value=row?JSON.parse(row.value):{...ICON_FUSION_DEFAULT_SETTINGS};
  if(!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.enabled!=='boolean'||!Number.isInteger(value.successVideoDurationMs)||value.successVideoDurationMs<1000||value.successVideoDurationMs>60000)throw fail('SETTINGS','합성 운영 설정을 확인해 주세요.');
  return {...value,successVideoUrl:validateIconVideoUrl(value.successVideoUrl)};
}
async function registeredCards(DB){
  const rows=(await DB.prepare(`SELECT c.id FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id IN (${ICON_LIVE_CARDS.map(()=>'?').join(',')}) AND c.rarity='ICON' AND c.base_power=180000 AND c.is_active=1 AND m.is_active=1 AND c.card_status='PUBLIC'`).bind(...ICON_LIVE_CARDS.map(c=>c.cardId)).all()).results||[];
  const ids=new Set(rows.map(r=>String(r.id)));return ICON_LIVE_CARDS.filter(c=>ids.has(c.cardId));
}
async function resources(DB,userId){const rows=await DB.batch([DB.prepare('SELECT coin FROM users WHERE id=?').bind(userId),DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(userId)]);return {coin:String(rows[0].results[0]?.coin??0),masterStars:Number(rows[1].results[0]?.quantity||0)};}
export async function iconFusionOverview(env,user){
  const DB=env.DB;
  const [settings,catalog,owned,decks,wallet,icons,pending]=await Promise.all([
    readIconFusionSettings(env),registeredCards(DB),
    DB.prepare(sourceSelect+" AND c.rarity IN ('SUPERSTAR','FUR') AND uc.breakthrough_level=13 ORDER BY c.rarity,c.id LIMIT 240").bind(user.id).all(),
    readDecks(DB,user.id),resources(DB,user.id),
    DB.prepare(`SELECT card_id,quantity FROM user_cards WHERE user_id=? AND card_id IN (${ICON_LIVE_CARDS.map(()=>'?').join(',')})`).bind(user.id,...ICON_LIVE_CARDS.map(c=>c.cardId)).all(),
    DB.prepare("SELECT request_id FROM joint_operations_v1 WHERE user_id=? AND kind=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1").bind(user.id,KIND).first()
  ]);
  const used=deckIds(decks),counts=new Map((icons.results||[]).map(c=>[String(c.card_id),Number(c.quantity)]));
  return {policy:POLICY,settings,enabled:ICON_FUSION_RELEASE_ENABLED&&settings.enabled&&catalog.length===7,
    catalog:catalog.map(c=>({...c,quantity:counts.get(c.cardId)||0})),resources:wallet,
    materials:(owned.results||[]).map(row=>({...plainCard(row),eligible:!used.has(String(row.id)),blockedReason:used.has(String(row.id))?'전투 덱 또는 저장 덱에서 먼저 해제해 주세요.':''})),
    pendingRequestId:pending?.request_id||null};
}
function inputFor(body){
  const {superstarId,furId,targetCode,policyVersion}=body;
  if(policyVersion!==POLICY.version)throw fail('POLICY','합성 조건이 변경되었습니다. 화면을 다시 불러오세요.');
  if(![superstarId,furId].every(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id))||superstarId===furId||!ICON_LIVE_CARDS.some(c=>c.code===targetCode))throw fail('INPUT','SUPERSTAR +13, FUR +13과 결과 아이콘을 선택해 주세요.',400);
  return {superstarId,furId,targetCode,policyVersion};
}
function completed(operation){
  const p=operation.plan;return {requestId:operation.requestId||operation.request_id,status:'COMPLETED',replayed:operation.replayed===true,success:p.success,policy:p.policy,
    target:p.target,result:p.success?{...p.target,quantity:p.targetQuantityBefore+1}:null,consumed:p.materials.map(m=>({...m,quantity:1,quantityAfter:m.quantityBefore-1,breakthroughAfter:0})),successVideo:p.success?p.successVideo:null};
}
export async function iconFusionReceipt(env,user,requestId){
  const row=await readJointOperation(env,user.id,requestId,KIND);
  if(row.status!=='COMPLETED')return {requestId,status:row.status,input:row.plan.input};
  return completed({...row,replayed:true});
}
export async function runIconFusion(env,user,body,{randomInt=mercenaryRandomInt}={}){
  const input=inputFor(body),requestId=body.requestId,DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args);
  const operation=await runJointOperation(env,user,{requestId,kind:KIND,input,
    prepare:async()=>{
      const [settings,catalog,sources,decks,wallet,pending]=await Promise.all([readIconFusionSettings(env),registeredCards(DB),p(sourceSelect+' AND uc.card_id IN (?,?)',user.id,input.superstarId,input.furId).all(),readDecks(DB,user.id),resources(DB,user.id),p("SELECT request_id FROM joint_operations_v1 WHERE user_id=? AND kind=? AND status='PENDING' LIMIT 1",user.id,KIND).first()]);
      if(!ICON_FUSION_RELEASE_ENABLED||!settings.enabled||catalog.length!==7)throw fail('CLOSED','현재 아이콘 합성을 이용할 수 없습니다.');
      if(pending)throw fail('PENDING','이전 합성 결과를 먼저 확인해 주세요.');
      const target=catalog.find(c=>c.code===input.targetCode),used=deckIds(decks);
      const materials=[['SUPERSTAR',input.superstarId],['FUR',input.furId]].map(([grade,id])=>{
        const row=sources.results.find(c=>String(c.id)===id);
        if(!row||row.grade!==grade||Number(row.breakthrough_level)!==13||Number(row.quantity)<1)throw fail('MATERIAL',`${grade} +13 카드 1장이 필요합니다.`);
        if(used.has(id))throw fail('DECK','재료 카드를 전투 덱과 저장 덱에서 먼저 해제해 주세요.');
        return {...plainCard(row),quantityBefore:Number(row.quantity)};
      });
      if(BigInt(wallet.coin)<BigInt(POLICY.coinCost)||wallet.masterStars<POLICY.masterStarCost)throw fail('BALANCE','마스터의 별 500만 개와 코인 1천억이 필요합니다.');
      const targetOwned=await p('SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?',user.id,target.cardId).first();
      const roll=randomInt(POLICY.chanceTotal);if(!Number.isInteger(roll)||roll<0||roll>=POLICY.chanceTotal)throw Error('Invalid fusion roll');
      return {version:1,input,policy:{...POLICY},materials,target,targetQuantityBefore:Number(targetOwned?.quantity||0),targetRowExists:Boolean(targetOwned),success:roll<POLICY.successChancePpm,roll,successVideo:{url:settings.successVideoUrl,durationMs:settings.successVideoDurationMs},createdAt:new Date().toISOString()};
    },
    statements:async plan=>{
      // OFF also blocks payment for a previously prepared, unpaid request.
      const settingsRow=await p('SELECT value FROM app_meta WHERE key=?',ICON_FUSION_SETTINGS_KEY).first();
      if(!ICON_FUSION_RELEASE_ENABLED||!parseSettings(settingsRow).enabled)throw fail('CLOSED','현재 아이콘 합성은 잠겨 있습니다. 최종 검토 후 오픈합니다.');
      const current=(await p('SELECT card_id,quantity,breakthrough_level FROM user_cards WHERE user_id=? AND card_id IN (?,?)',user.id,input.superstarId,input.furId).all()).results;
      const used=deckIds(await readDecks(DB,user.id));
      if(plan.materials.some(m=>{const c=current.find(row=>String(row.card_id)===m.id);return !c||Number(c.quantity)!==m.quantityBefore||Number(c.breakthrough_level)!==13||used.has(m.id);}))throw Object.assign(fail('STALE','재료 또는 편성이 변경되어 합성을 취소했습니다. 재료는 소모되지 않았습니다.'),{terminal:true});
      const targetNow=await p('SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?',user.id,plan.target.cardId).first();
      if(plan.success&&(Boolean(targetNow)!==plan.targetRowExists||Number(targetNow?.quantity||0)!==plan.targetQuantityBefore))throw Object.assign(fail('STALE','아이콘 보유 상태가 변경되어 합성을 취소했습니다. 재료는 소모되지 않았습니다.'),{terminal:true});
      const token=crypto.randomUUID(),conditions=['EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)'],values=[ICON_FUSION_SETTINGS_KEY,settingsRow.value];
      for(const m of plan.materials){conditions.push('EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=? AND breakthrough_level=13)');values.push(user.id,m.id,m.quantityBefore);}
      for(const table of deckTables){conditions.push(`NOT EXISTS(SELECT 1 FROM ${table} d,json_each(d.card_ids) j WHERE d.user_id=? AND CAST(j.value AS TEXT) IN (?,?))`);values.push(user.id,input.superstarId,input.furId);}
      conditions.push("EXISTS(SELECT 1 FROM cards_effective_v1210 WHERE id=? AND rarity='ICON' AND is_active=1 AND card_status='PUBLIC')");values.push(plan.target.cardId);
      if(plan.success){conditions.push(plan.targetRowExists?'EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=?)':'NOT EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=?)');values.push(user.id,plan.target.cardId,...(plan.targetRowExists?[plan.targetQuantityBefore]:[]));}
      const list=[jointGuard(DB,token,conditions.join(' AND '),values),...jointCoinDebit(DB,user.id,plan.policy.coinCost,`ICON_FUSION:${requestId}`),...jointInventoryChange(DB,user.id,'MASTER_STAR',-plan.policy.masterStarCost,'ICON_FUSION',requestId)];
      for(const m of plan.materials){
        list.push(p('UPDATE user_cards SET quantity=quantity-1,breakthrough_level=0,breakthrough_fail_count=0,last_obtained_at=CURRENT_TIMESTAMP WHERE user_id=? AND card_id=? AND quantity=? AND breakthrough_level=13',user.id,m.id,m.quantityBefore));
        list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=? AND breakthrough_level=0) THEN 1 ELSE 0 END WHERE token=?',user.id,m.id,m.quantityBefore-1,token));
      }
      if(plan.success){
        list.push(p("INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,first_obtained_at,last_obtained_at) SELECT ?,id,1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM cards_effective_v1210 WHERE id=? AND rarity='ICON' AND is_active=1 AND card_status='PUBLIC' ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,last_obtained_at=CURRENT_TIMESTAMP",user.id,plan.target.cardId));
        list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=?) THEN 1 ELSE 0 END WHERE token=?',user.id,plan.target.cardId,plan.targetQuantityBefore+1,token));
      }
      list.push(jointGuardEnd(DB,token));return list;
    }
  });
  return completed(operation);
}
export async function handleIconFusion({path,request,env,deps}){
  if(!['icons/fusion','icons/fusion/overview','icons/fusion/receipt','admin/icons/fusion'].includes(path))return null;
  const reply=(body,status=200)=>deps.json(body,status,{'cache-control':'private, no-store'});
  try{
    if(path==='admin/icons/fusion'){
      const admin=await deps.requirePermission(request,env,'BATTLE_MANAGE');if(!admin||admin.role!=='OWNER')throw fail('PERMISSION','OWNER만 관리할 수 있습니다.',403);
      if(request.method==='GET')return reply({policy:POLICY,settings:await readIconFusionSettings(env)});
      if(request.method!=='PATCH')throw fail('METHOD','PATCH 요청이 필요합니다.',405);
      const body=await readJointBody(request,{fields:['expectedRevision','requestId','enabled','successVideoUrl','successVideoDurationMs']});
      if(typeof body.enabled!=='boolean'||!Number.isInteger(body.successVideoDurationMs)||body.successVideoDurationMs<1000||body.successVideoDurationMs>60000||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId))throw fail('SETTINGS','운영 설정 형식을 확인해 주세요.',400);
      let url;try{url=validateIconVideoUrl(body.successVideoUrl);}catch(error){throw fail('SETTINGS',error.message,400);}
      const result=await deps.withUserMutationLock(env,admin.id,path,async()=>{
        const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(ICON_FUSION_SETTINGS_KEY).first(),current=parseSettings(row);
        const next={revision:current.revision+1,enabled:body.enabled,successVideoUrl:url,successVideoDurationMs:body.successVideoDurationMs,requestId:body.requestId,updatedAt:new Date().toISOString(),updatedBy:Number(admin.id)};
        if(current.requestId===body.requestId){if(current.enabled!==next.enabled||current.successVideoUrl!==url||current.successVideoDurationMs!==next.successVideoDurationMs)throw fail('CONFLICT','같은 요청 번호의 설정이 다릅니다.');return current;}
        if(body.expectedRevision!==current.revision)throw fail('CONFLICT','다른 창에서 변경했습니다. 최신 설정을 불러오세요.');
        const token=crypto.randomUUID(),p=(sql,...v)=>env.DB.prepare(sql).bind(...v);
        await env.DB.batch([jointGuard(env.DB,token,row?'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)':'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',row?[ICON_FUSION_SETTINGS_KEY,row.value]:[ICON_FUSION_SETTINGS_KEY]),p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',ICON_FUSION_SETTINGS_KEY,JSON.stringify(next)),p("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,'ICON_FUSION_SETTINGS','APP_META',?,?,?)",admin.id,ICON_FUSION_SETTINGS_KEY,row?.value??null,JSON.stringify(next)),jointGuardEnd(env.DB,token)]);
        return next;
      });return reply({policy:POLICY,settings:result});
    }
    const user=await deps.authenticate(request,env);if(!user)throw fail('AUTH','로그인이 필요합니다.',401);
    if(path.endsWith('/overview')){if(request.method!=='GET')throw fail('METHOD','GET 요청이 필요합니다.',405);return reply(await iconFusionOverview(env,user));}
    if(path.endsWith('/receipt')){if(request.method!=='GET')throw fail('METHOD','GET 요청이 필요합니다.',405);return reply(await iconFusionReceipt(env,user,new URL(request.url).searchParams.get('requestId')));}
    if(request.method!=='POST')throw fail('METHOD','POST 요청이 필요합니다.',405);
    const body=await readJointBody(request,{fields:['requestId','superstarId','furId','targetCode','policyVersion']});
    return reply(await deps.withUserMutationLock(env,user.id,path,()=>runIconFusion(env,user,body)));
  }catch(error){if(String(error.code||'').startsWith('ICON_FUSION_'))return reply({ok:false,error:error.message,code:error.code,retryable:/PENDING/.test(error.code)},error.status);return jointResponseError(error,reply);}
}
