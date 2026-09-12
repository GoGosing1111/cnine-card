import {readJointReleaseComponent} from './_joint_release_document.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {validateMercenaryCms} from '../shared/mercenary-cms-model-v1.mjs';
import {validateMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {MERCENARY_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
import {MERCENARY_COMBAT_DRAFT,validateMercenaryCombat} from '../shared/mercenary-combat-policy-v1.mjs';
import {V3_JOINT_RELEASE_ENABLED} from '../shared/v3-joint-release-v1.mjs';
import {pickMercenaryDraw,mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {ensureJointTransactionSchema,saveJointPolicyDraft,runJointOperation,readJointOperation,jointCoinDebit,jointInventoryChange} from './_joint_transactions.js';

export const MERCENARY_RUNTIME_KEY='mercenary_runtime_policy_v1';
export const releasedMercenarySnapshot=(env,user)=>V3_JOINT_RELEASE_ENABLED?loadMercenaryBattleSnapshot(env,user):Promise.resolve(null);
export async function releasedMercenarySnapshots(env,userIds){
  if(!V3_JOINT_RELEASE_ENABLED||!userIds.length)return new Map();
  const ids=[...new Set(userIds.map(Number))];if(ids.some(id=>!Number.isSafeInteger(id)||id<=0)||ids.length>200)throw jointError('MERCENARY_USERS','계정 범위를 확인하세요.');
  const rows=(await env.DB.prepare(`SELECT l.user_id,l.mercenary_code,COALESCE(g.level,1) AS level FROM user_mercenary_loadout_v1 l JOIN user_mercenary_cards_v1 c ON c.user_id=l.user_id AND c.mercenary_code=l.mercenary_code LEFT JOIN user_mercenary_growth_v1 g ON g.user_id=l.user_id AND g.mercenary_code=l.mercenary_code WHERE l.user_id IN (${ids.map(()=>'?').join(',')}) AND l.mercenary_code IS NOT NULL`).bind(...ids).all()).results;
  if(!rows.length)return new Map();const [{document,revision},runtime]=await Promise.all([readMercenaryDocument(env),readMercenaryRuntime(env)]);
  return new Map(rows.map(r=>[Number(r.user_id),{...battleConfig(document,r.mercenary_code,Number(r.level)),combat:runtime.combat,cmsRevision:revision,policyVersion:runtime.version}]));
}
export const mercenarySnapshotPower=m=>m?Math.round(m.basePower*(1+(m.combat?.powerGrowthPercentPerLevel||0)*(m.level-1)/100)):0;
const mercenaryBasePower=rank=>MERCENARY_POWER_STANDARD.basePowerByRank[rank];
export const MERCENARY_RUNTIME_DRAFT=Object.freeze({revision:0,version:'mercenary-runtime-draft-20260913',mode:'OFF',approved:false,
  opening:{paymentKind:'UNSET',coinPerOpen:null,itemCode:null,itemsPerOpen:null,maxBatch:10},training:{itemCode:null,experiencePerItem:null},combat:MERCENARY_COMBAT_DRAFT});
export const MERCENARY_RUNTIME_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS user_mercenary_growth_v1(user_id BIGINT NOT NULL,mercenary_code TEXT NOT NULL,level INTEGER NOT NULL DEFAULT 1 CHECK(level>=1),experience BIGINT NOT NULL DEFAULT 0 CHECK(experience>=0),revision INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,mercenary_code))`
];
export async function ensureMercenaryRuntimeSchema(env){await ensureJointTransactionSchema(env);if(env.DB.execSchema)await env.DB.execSchema(MERCENARY_RUNTIME_SCHEMA);else for(const s of MERCENARY_RUNTIME_SCHEMA)await env.DB.prepare(s).run();}
function integer(n,min,max,label){if(!Number.isSafeInteger(n)||n<min||n>max)throw jointError('MERCENARY_CONFIG',`${label} 설정을 확인하세요.`);return n;}
function itemCode(value,nullable=true){if(nullable&&value===null)return value;if(typeof value!=='string'||!/^[A-Z0-9_]{1,80}$/.test(value))throw jointError('MERCENARY_CONFIG','재료 코드를 확인하세요.');return value;}
export function validateMercenaryRuntime(raw){
  if(!raw||!['OFF','TEST'].includes(raw.mode)||typeof raw.version!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(raw.version))throw jointError('MERCENARY_CONFIG','정책 버전과 OFF/TEST 모드를 확인하세요.');
  const o=raw.opening,t=raw.training;if(!o||!t||!['UNSET','COIN','ITEM'].includes(o.paymentKind))throw jointError('MERCENARY_CONFIG','개봉 비용을 설정하세요.');
  const opening={paymentKind:o.paymentKind,coinPerOpen:o.coinPerOpen===null?null:integer(o.coinPerOpen,1,1e12,'개봉 코인'),itemCode:itemCode(o.itemCode),itemsPerOpen:o.itemsPerOpen===null?null:integer(o.itemsPerOpen,1,10000,'개봉 재료'),maxBatch:integer(o.maxBatch,1,10,'최대 개봉 횟수')};
  if(o.paymentKind==='COIN'&&opening.coinPerOpen===null||o.paymentKind==='ITEM'&&(!opening.itemCode||!opening.itemsPerOpen))throw jointError('MERCENARY_CONFIG','개봉 비용 항목을 모두 설정하세요.');
  return {revision:integer(raw.revision??0,0,2147483646,'정책 수정 버전'),version:raw.version,mode:raw.mode,approved:false,opening,training:{itemCode:itemCode(t.itemCode),experiencePerItem:t.experiencePerItem===null?null:integer(t.experiencePerItem,1,1e9,'재료 경험치')},combat:validateMercenaryCombat(raw.combat)};
}
export async function readMercenaryRuntime(env,{draft=false}={}){const release=draft?null:await readJointReleaseComponent(env,'MERCENARY');if(release)return {...validateMercenaryRuntime({...release.runtime,mode:'TEST'}),mode:'ON',approved:true};const r=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(MERCENARY_RUNTIME_KEY).first();return r?validateMercenaryRuntime(JSON.parse(r.value)):structuredClone(MERCENARY_RUNTIME_DRAFT);}
export async function saveMercenaryRuntime(env,user,raw){
  if(user.role!=='OWNER')throw jointError('MERCENARY_PERMISSION','OWNER만 정책을 저장할 수 있습니다.',403);
  const before=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(MERCENARY_RUNTIME_KEY).first(),current=before?JSON.parse(before.value):MERCENARY_RUNTIME_DRAFT,next=validateMercenaryRuntime(raw);
  if(next.revision!==current.revision)throw jointError('MERCENARY_CONFIG_CONFLICT','다른 창에서 변경했습니다. 최신 설정을 불러오세요.',409);next.revision++;
  return saveJointPolicyDraft(env,user,MERCENARY_RUNTIME_KEY,before?.value??null,next);
}
export async function readMercenaryDocument(env){
  const release=await readJointReleaseComponent(env,'MERCENARY');if(release)return {revision:release.cmsRevision,document:validateMercenaryCms(release.document,MERCENARY_CMS_SEED.catalog)};
  const row=await env.DB.prepare("SELECT payload_json,revision FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first();
  if(!row)throw jointError('MERCENARY_CONFIG','용병 CMS를 먼저 등록하세요.',409);
  return {revision:Number(row.revision),document:validateMercenaryCms(JSON.parse(row.payload_json),MERCENARY_CMS_SEED.catalog)};
}
function allowRuntime(policy,user){if(policy.mode==='OFF'||policy.mode==='TEST'&&user.role!=='OWNER')throw jointError('MERCENARY_CLOSED','용병 시스템을 준비 중입니다.',423);}
const knownCode=code=>{if(!MERCENARY_CMS_SEED.catalog.cards.some(c=>c.code===code))throw jointError('MERCENARY_CODE','용병 코드를 확인하세요.');return code;};
async function growthRow(env,user,code){return await env.DB.prepare('SELECT * FROM user_mercenary_growth_v1 WHERE user_id=? AND mercenary_code=?').bind(user.id,code).first()||{level:1,experience:0,revision:0};}
async function requireOwned(env,user,code){knownCode(code);const row=await env.DB.prepare('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?').bind(user.id,code).first();if(!row)throw jointError('MERCENARY_NOT_OWNED','보유한 용병만 사용할 수 있습니다.',403);return row;}
function battleConfig(document,code,level){
  const c=document.mercenaries.find(c=>c.code===code),art=MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===code);
  if(!c?.rank||c.review!=='REVIEWED'||Object.values(c.stats).some(n=>!Number.isSafeInteger(n)||n<=0))throw jointError('MERCENARY_STATS_PENDING','용병 등급·능력치 검수가 필요합니다.',409);
  const skills=(document.assignments.find(a=>a.code===code)?.skillIds||[]).map(id=>document.skills.find(s=>s.id===id));
  if(skills.some(s=>!s||s.review!=='REVIEWED'||Object.values(s.balance).some(n=>n===null)))throw jointError('MERCENARY_SKILLS_PENDING','배정한 스킬의 계수·재사용·비용 검수가 필요합니다.',409);
  const stats={...c.stats};if(level>1)for(const [key,field]of[['hp','hpPerLevel'],['attack','attackPerLevel'],['defense','defensePerLevel']])stats[key]+=integer(c.growth[field],0,1e9,'성장 능력치')*(level-1);
  return {code,name:c.name,title:c.title,rank:c.rank,position:c.position,role:c.role,basicTarget:c.basicTarget,skillTarget:c.skillTarget,level,stats,skills,basePower:mercenaryBasePower(c.rank),sourceArt:art.sourceArt,battleSprite:art.battleSprite,actorKind:'MERCENARY'};
}
export async function loadMercenaryBattleSnapshot(env,user){
  const row=await env.DB.prepare('SELECT mercenary_code FROM user_mercenary_loadout_v1 WHERE user_id=?').bind(user.id).first();if(!row?.mercenary_code)return null;
  await requireOwned(env,user,row.mercenary_code);const {document,revision}=await readMercenaryDocument(env),growth=await growthRow(env,user,row.mercenary_code);
  const runtime=await readMercenaryRuntime(env);return {...battleConfig(document,row.mercenary_code,Number(growth.level)),combat:runtime.combat,cmsRevision:revision,policyVersion:runtime.version};
}
export async function mercenaryAccountState(env,user){
  const [config,policy,owned,loadout,wallet]=await Promise.all([readMercenaryDocument(env),readMercenaryRuntime(env),env.DB.prepare('SELECT c.*,COALESCE(g.level,1) AS level,COALESCE(g.experience,0) AS experience,COALESCE(g.revision,0) AS growth_revision FROM user_mercenary_cards_v1 c LEFT JOIN user_mercenary_growth_v1 g ON g.user_id=c.user_id AND g.mercenary_code=c.mercenary_code WHERE c.user_id=? ORDER BY c.mercenary_code').bind(user.id).all(),env.DB.prepare('SELECT mercenary_code,revision FROM user_mercenary_loadout_v1 WHERE user_id=?').bind(user.id).first(),env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first()]);
  return {accountId:Number(user.id),available:policy.mode==='ON'||policy.mode==='TEST'&&user.role==='OWNER',coin:String(wallet.coin),policy,cmsRevision:config.revision,loadout:{mercenaryCode:loadout?.mercenary_code||null,revision:Number(loadout?.revision||0)},cards:owned.results.map(row=>{const meta=config.document.mercenaries.find(c=>c.code===row.mercenary_code),art=MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===row.mercenary_code);return {code:row.mercenary_code,name:meta.name,rank:meta.rank,sourceArt:art.sourceArt,battleSprite:art.battleSprite,totalCopies:Number(row.total_copies),duplicates:Number(row.duplicate_count),level:Number(row.level),experience:Number(row.experience),revision:Number(row.growth_revision),basePower:meta.rank?mercenaryBasePower(meta.rank):null,growth:config.document.settings.rankGrowth.find(r=>r.rank===meta.rank)||null,maxLevel:meta.growth.maxLevel};})};
}

export async function openMercenaryCards(env,user,body,{randomInt}={}){
  const count=integer(body.count??1,1,10,'개봉 횟수'),requestId=body.requestId;
  const result=await runJointOperation(env,user,{requestId,kind:'MERCENARY_OPEN',input:{count},prepare:async()=>{
    const policy=await readMercenaryRuntime(env);allowRuntime(policy,user);if(policy.opening.paymentKind==='UNSET')throw jointError('MERCENARY_PRICE_PENDING','개봉 비용이 확정되지 않았습니다.',409);if(count>policy.opening.maxBatch)throw jointError('MERCENARY_COUNT','개봉 횟수를 줄이세요.');
    const config=await readMercenaryDocument(env),released=await readJointReleaseComponent(env,'MERCENARY'),row=released?{payload_json:JSON.stringify(released.draw),revision:released.drawRevision}:await env.DB.prepare('SELECT payload_json,revision FROM mercenary_draw_config_v1 WHERE id=1').first();if(!row)throw jointError('MERCENARY_DRAW_PENDING','개봉 확률 설정이 없습니다.',409);
    const draw=validateMercenaryDraw(JSON.parse(row.payload_json)),draws=Array.from({length:count},()=>{const result=pickMercenaryDraw({policy:draw,mercenaries:config.document.mercenaries,randomInt});return {...result,...(result.mercenaryCode?{name:config.document.mercenaries.find(c=>c.code===result.mercenaryCode).name}:{})};});
    const coinCost=policy.opening.paymentKind==='COIN'?policy.opening.coinPerOpen*count:0;
    if(coinCost>Number((await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first()).coin))throw jointError('MERCENARY_FUNDS','코인이 부족합니다.',409);
    return {count,draws,coinCost,payment:policy.opening,cmsRevision:config.revision,drawRevision:Number(row.revision),policyVersion:policy.version};
  },statements:async plan=>{
    allowRuntime(await readMercenaryRuntime(env),user);
    const list=jointCoinDebit(env.DB,user.id,plan.coinCost,`용병 개봉 ${requestId}`);
    if(plan.payment.paymentKind==='ITEM')list.push(...jointInventoryChange(env.DB,user.id,plan.payment.itemCode,-plan.payment.itemsPerOpen*plan.count,'용병 개봉',requestId));
    plan.draws.forEach((draw,i)=>{if(draw.mercenaryCode)list.push(...mercenaryCardAcquisitionStatements(env.DB,{userId:Number(user.id),mercenaryCode:draw.mercenaryCode,acquisitionId:`${requestId}:${i}`}));else if(draw.quantity)list.push(...jointInventoryChange(env.DB,user.id,draw.outcomeId==='MASTER_STAR'?'MASTER_STAR':'STARLIGHT_ARMOR_CORE',draw.quantity,'용병 개봉 보상',`${requestId}:${i}`));});return list;
  }});return mercenaryOpeningReceipt(env,user,result.requestId,result.replayed);
}
export async function mercenaryOpeningReceipt(env,user,requestId,replayed=true){
  const row=await readJointOperation(env,user.id,requestId,'MERCENARY_OPEN');
  if(row.status!=='COMPLETED')return {requestId,status:'PENDING',retryable:true};
  const draws=[];for(let i=0;i<row.plan.draws.length;i++){const draw=row.plan.draws[i];const acquired=draw.mercenaryCode?await env.DB.prepare('SELECT is_duplicate,total_copies_after,duplicate_count_after FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=? AND user_id=?').bind(`${requestId}:${i}`,user.id).first():null;draws.push({...draw,...(acquired?{duplicate:Boolean(Number(acquired.is_duplicate)),totalCopies:Number(acquired.total_copies_after),duplicateCount:Number(acquired.duplicate_count_after)}:{})});}
  return {requestId,status:'COMPLETED',replayed,draws,coinCost:row.plan.coinCost,policyVersion:row.plan.policyVersion,drawRevision:row.plan.drawRevision};
}

export async function saveMercenaryLoadout(env,user,body){
  const code=body.mercenaryCode===null?null:knownCode(body.mercenaryCode),revision=integer(body.revision,0,2147483646,'편성 버전');
  const r=await runJointOperation(env,user,{requestId:body.requestId,kind:'MERCENARY_LOADOUT',input:{code,revision},prepare:async()=>{
    allowRuntime(await readMercenaryRuntime(env),user);if(code){await requireOwned(env,user,code);const {document}=await readMercenaryDocument(env);battleConfig(document,code,Number((await growthRow(env,user,code)).level));}
    return {code,revision};
  },statements:async plan=>{allowRuntime(await readMercenaryRuntime(env),user);const current=await env.DB.prepare('SELECT revision FROM user_mercenary_loadout_v1 WHERE user_id=?').bind(user.id).first();if(Number(current?.revision||0)!==plan.revision)throw Object.assign(jointError('MERCENARY_LOADOUT_CONFLICT','편성이 변경됐습니다. 최신 상태에서 다시 선택하세요.',409),{terminal:true});const DB=env.DB,token=crypto.randomUUID(),p=(sql,...v)=>DB.prepare(sql).bind(...v);return [
    jointGuard(DB,token,'COALESCE((SELECT revision FROM user_mercenary_loadout_v1 WHERE user_id=?),0)=?',[user.id,plan.revision]),
    ...(plan.code?[p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?) THEN 1 ELSE 0 END WHERE token=?',user.id,plan.code,token)]:[]),
    p('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mercenary_code=excluded.mercenary_code,revision=excluded.revision,updated_at=excluded.updated_at',user.id,plan.code,plan.revision+1,new Date().toISOString()),jointGuardEnd(DB,token)];}});
  return {requestId:r.requestId,replayed:r.replayed,mercenaryCode:r.plan.code,revision:r.plan.revision+1};
}

export async function growMercenary(env,user,body,action){
  const code=knownCode(body.mercenaryCode),revision=integer(body.revision,0,2147483646,'성장 버전'),quantity=integer(body.quantity,1,action==='TRAIN'?10000:10,'성장 수량');
  const r=await runJointOperation(env,user,{requestId:body.requestId,kind:`MERCENARY_${action}`,input:{code,revision,quantity},prepare:async()=>{
    const policy=await readMercenaryRuntime(env);allowRuntime(policy,user);await requireOwned(env,user,code);const growth=await growthRow(env,user,code);
    if(Number(growth.revision)!==revision)throw jointError('MERCENARY_GROWTH_CONFLICT','성장 정보가 바뀌었습니다.',409);
    const {document}=await readMercenaryDocument(env),c=document.mercenaries.find(c=>c.code===code),rank=document.settings.rankGrowth.find(r=>r.rank===c.rank);
    const next={code,revision,level:Number(growth.level),experience:Number(growth.experience),coinCost:0,itemCode:null,itemQuantity:0,policyVersion:policy.version};
    if(action==='TRAIN'){if(!policy.training.itemCode||!policy.training.experiencePerItem)throw jointError('MERCENARY_GROWTH_PENDING','경험치 재료 설정이 필요합니다.',409);next.itemCode=policy.training.itemCode;next.itemQuantity=quantity;next.experience+=policy.training.experiencePerItem*quantity;integer(next.experience,0,1e14,'보유 경험치');}
    else{if(!rank||rank.maxLevel===null||rank.coinPerLevel===null||rank.expPerLevel===null)throw jointError('MERCENARY_GROWTH_PENDING','등급별 성장 비용과 상한을 설정하세요.',409);const max=c.growth.maxLevel===null?rank.maxLevel:Math.min(rank.maxLevel,c.growth.maxLevel);if(next.level+quantity>max)throw jointError('MERCENARY_LEVEL_CAP','최대 레벨을 넘을 수 없습니다.',409);next.level+=quantity;next.experience-=rank.expPerLevel*quantity;next.coinCost=rank.coinPerLevel*quantity;if(next.experience<0)throw jointError('MERCENARY_EXPERIENCE','경험치가 부족합니다.',409);battleConfig(document,code,next.level);}
    return next;
  },statements:async plan=>{allowRuntime(await readMercenaryRuntime(env),user);if(Number((await growthRow(env,user,code)).revision)!==revision)throw Object.assign(jointError('MERCENARY_GROWTH_CONFLICT','성장 정보가 변경됐습니다. 최신 상태에서 다시 시도하세요.',409),{terminal:true});const DB=env.DB,token=crypto.randomUUID(),p=(sql,...v)=>DB.prepare(sql).bind(...v);return [
    jointGuard(DB,token,'EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?) AND COALESCE((SELECT revision FROM user_mercenary_growth_v1 WHERE user_id=? AND mercenary_code=?),0)=?',[user.id,code,user.id,code,revision]),
    ...jointCoinDebit(DB,user.id,plan.coinCost,'용병 성장'),...(plan.itemCode?jointInventoryChange(DB,user.id,plan.itemCode,-plan.itemQuantity,'용병 훈련',body.requestId):[]),
    p('INSERT INTO user_mercenary_growth_v1(user_id,mercenary_code,level,experience,revision) VALUES(?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET level=excluded.level,experience=excluded.experience,revision=excluded.revision',user.id,code,plan.level,plan.experience,revision+1),jointGuardEnd(DB,token)];}});
  return {requestId:r.requestId,replayed:r.replayed,mercenaryCode:code,level:r.plan.level,experience:r.plan.experience,revision:revision+1};
}
