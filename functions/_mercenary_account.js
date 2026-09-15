import {readJointReleaseComponent} from './_joint_release_document.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog,validateMercenaryCms} from '../shared/mercenary-cms-model-v1.mjs';
import {validateMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {MERCENARY_POWER_STANDARD,MERCENARY_UPGRADE_PLAN} from '../shared/equipment-mercenary-power-v1.mjs';
import {MERCENARY_COMBAT_DRAFT,validateMercenaryCombat} from '../shared/mercenary-combat-policy-v1.mjs';
import {V3_JOINT_RELEASE_ENABLED} from '../shared/v3-joint-release-v1.mjs';
import {MERCENARY_DEPLOYMENT_RELEASE_ENABLED,mercenaryDeploymentState} from '../shared/mercenary-public-release-v2097.mjs';
import {pickMercenaryDraw,mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {prepareMercenarySsOnce,pickMercenarySsOnce,consumeMercenarySsOnce} from './_mercenary_ss_once.js';
import {jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {ensureJointTransactionSchema,saveJointPolicyDraft,runJointOperation,readJointOperation,jointCoinDebit,jointInventoryChange} from './_joint_transactions.js';

export const MERCENARY_RUNTIME_KEY='mercenary_runtime_policy_v1';
export const releasedMercenarySnapshot=(env,user)=>V3_JOINT_RELEASE_ENABLED||MERCENARY_DEPLOYMENT_RELEASE_ENABLED?loadMercenaryBattleSnapshot(env,user):Promise.resolve(null);
export async function releasedMercenarySnapshots(env,userIds){
  if((!V3_JOINT_RELEASE_ENABLED&&!MERCENARY_DEPLOYMENT_RELEASE_ENABLED)||!userIds.length)return new Map();
  const ids=[...new Set(userIds.map(Number))];if(ids.some(id=>!Number.isSafeInteger(id)||id<=0)||ids.length>200)throw jointError('MERCENARY_USERS','계정 범위를 확인하세요.');
  const rows=(await env.DB.prepare(`SELECT l.user_id,l.mercenary_code,COALESCE(g.level,1) AS level FROM user_mercenary_loadout_v1 l JOIN user_mercenary_cards_v1 c ON c.user_id=l.user_id AND c.mercenary_code=l.mercenary_code LEFT JOIN user_mercenary_growth_v1 g ON g.user_id=l.user_id AND g.mercenary_code=l.mercenary_code WHERE l.user_id IN (${ids.map(()=>'?').join(',')}) AND l.mercenary_code IS NOT NULL`).bind(...ids).all()).results;
  if(!rows.length)return new Map();const [{document,revision},runtime]=await Promise.all([readMercenaryDocument(env),readMercenaryRuntime(env)]);
  return new Map(rows.map(r=>[Number(r.user_id),{...battleConfig(document,r.mercenary_code,Number(r.level)),combat:runtime.combat,cmsRevision:revision,policyVersion:runtime.version}]));
}
export const mercenarySnapshotPower=m=>m?m.statMode==='RANK_FIXED'?mercenaryBasePower(m.rank):Math.round(m.basePower*(1+(m.combat?.powerGrowthPercentPerLevel||0)*(m.level-1)/100)):0;
const mercenaryBasePower=rank=>MERCENARY_POWER_STANDARD.basePowerByRank[rank];
export const MERCENARY_RUNTIME_DRAFT=Object.freeze({revision:0,version:'mercenary-runtime-draft-20260913',mode:'OFF',approved:false,
  opening:{paymentKind:'UNSET',coinPerOpen:null,itemCode:null,itemsPerOpen:null,maxBatch:10},training:{itemCode:null,experiencePerItem:null},statMode:'RANK_FIXED',upgrade:MERCENARY_UPGRADE_PLAN,combat:MERCENARY_COMBAT_DRAFT});
export const MERCENARY_RUNTIME_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS user_mercenary_growth_v1(user_id BIGINT NOT NULL,mercenary_code TEXT NOT NULL,level INTEGER NOT NULL DEFAULT 1 CHECK(level>=1),experience BIGINT NOT NULL DEFAULT 0 CHECK(experience>=0),revision INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,mercenary_code))`
];
export async function ensureMercenaryRuntimeSchema(env){await ensureJointTransactionSchema(env);if(env.DB.execSchema)await env.DB.execSchema(MERCENARY_RUNTIME_SCHEMA);else for(const s of MERCENARY_RUNTIME_SCHEMA)await env.DB.prepare(s).run();}
function integer(n,min,max,label){if(!Number.isSafeInteger(n)||n<min||n>max)throw jointError('MERCENARY_CONFIG',`${label} 설정을 확인하세요.`);return n;}
function itemCode(value,nullable=true){if(nullable&&value===null)return value;if(typeof value!=='string'||!/^[A-Z0-9_]{1,80}$/.test(value))throw jointError('MERCENARY_CONFIG','재료 코드를 확인하세요.');return value;}
export function validateMercenaryRuntime(raw){
  if(!raw||!['OFF','TEST'].includes(raw.mode)||typeof raw.version!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(raw.version))throw jointError('MERCENARY_CONFIG','정책 버전과 OFF/TEST 모드를 확인하세요.');
  const o=raw.opening;if(!o||!['UNSET','COIN','ITEM'].includes(o.paymentKind))throw jointError('MERCENARY_CONFIG','개봉 비용을 설정하세요.');
  if(raw.upgrade&&(Object.keys(raw.upgrade).length!==3||Object.entries(MERCENARY_UPGRADE_PLAN).some(([k,v])=>raw.upgrade[k]!==v)))throw jointError('MERCENARY_CONFIG','중복 카드 + 마스터의 별 업그레이드는 차후 공개합니다.');
  const opening={paymentKind:o.paymentKind,coinPerOpen:o.coinPerOpen===null?null:integer(o.coinPerOpen,1,1e12,'개봉 코인'),itemCode:itemCode(o.itemCode),itemsPerOpen:o.itemsPerOpen===null?null:integer(o.itemsPerOpen,1,10000,'개봉 재료'),maxBatch:integer(o.maxBatch,1,10,'최대 개봉 횟수')};
  if(o.paymentKind==='COIN'&&opening.coinPerOpen===null||o.paymentKind==='ITEM'&&(!opening.itemCode||!opening.itemsPerOpen))throw jointError('MERCENARY_CONFIG','개봉 비용 항목을 모두 설정하세요.');
  return {revision:integer(raw.revision??0,0,2147483646,'정책 수정 버전'),version:raw.version,mode:raw.mode,approved:false,opening,training:{itemCode:null,experiencePerItem:null},statMode:'RANK_FIXED',upgrade:{...MERCENARY_UPGRADE_PLAN},combat:{...validateMercenaryCombat(raw.combat),powerGrowthPercentPerLevel:0}};
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
  return {revision:Number(row.revision),document:expandMercenarySkillCatalog(JSON.parse(row.payload_json),MERCENARY_CMS_SEED.document,MERCENARY_CMS_SEED.catalog)};
}
function allowRuntime(policy,user){if(policy.mode==='OFF'||policy.mode==='TEST'&&user.role!=='OWNER')throw jointError('MERCENARY_CLOSED','용병 시스템을 준비 중입니다.',423);}
function allowDeployment(policy,user){if(!MERCENARY_DEPLOYMENT_RELEASE_ENABLED)allowRuntime(policy,user);}
const knownCode=code=>{if(!MERCENARY_CMS_SEED.catalog.cards.some(c=>c.code===code))throw jointError('MERCENARY_CODE','용병 코드를 확인하세요.');return code;};
async function growthRow(env,user,code){return await env.DB.prepare('SELECT * FROM user_mercenary_growth_v1 WHERE user_id=? AND mercenary_code=?').bind(user.id,code).first()||{level:1,experience:0,revision:0};}
async function requireOwned(env,user,code){knownCode(code);const row=await env.DB.prepare('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?').bind(user.id,code).first();if(!row)throw jointError('MERCENARY_NOT_OWNED','보유한 용병만 사용할 수 있습니다.',403);return row;}
function assignedSkills(document,code){return (document.assignments.find(a=>a.code===code)?.skillIds||[]).map(id=>document.skills.find(s=>s.id===id));}
function skillsReady(skills){return skills.every(s=>s&&s.review==='REVIEWED'&&Object.values(s.balance||{}).length===3&&Object.values(s.balance).every(n=>Number.isFinite(n)));}
function battleConfig(document,code,level){
  const c=document.mercenaries.find(c=>c.code===code),art=MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===code);
  if(!mercenaryBasePower(c?.rank))throw jointError('MERCENARY_STATS_PENDING','용병 등급을 확정하세요.',409);
  const assigned=assignedSkills(document,code),skills=assigned.filter(s=>skillsReady([s]));
  // Unconfigured skill assignments remain visible in the CMS and collection.
  // They cannot disable the approved rank-based basic fighter, nor acquire
  // invented balance values merely because deployment was released.
  // Rank power is approved; reuse the battle engine's neutral power conversion per mode.
  // Individual stat/growth drafts and old QA levels cannot override this launch contract.
  return {code,name:c.name,title:c.title,rank:c.rank,position:c.position,role:c.role,basicTarget:c.basicTarget,skillTarget:c.skillTarget,level:1,statMode:'RANK_FIXED',skills,pendingSkillIds:assigned.filter(s=>!skillsReady([s])).map(s=>s?.id).filter(Boolean),basePower:mercenaryBasePower(c.rank),sourceArt:art.sourceArt,battleSprite:art.battleSprite,actorKind:'MERCENARY'};
}
export async function loadMercenaryBattleSnapshot(env,user){
  const row=await env.DB.prepare('SELECT mercenary_code FROM user_mercenary_loadout_v1 WHERE user_id=?').bind(user.id).first();if(!row?.mercenary_code)return null;
  await requireOwned(env,user,row.mercenary_code);const {document,revision}=await readMercenaryDocument(env),growth=await growthRow(env,user,row.mercenary_code);
  const runtime=await readMercenaryRuntime(env);return {...battleConfig(document,row.mercenary_code,Number(growth.level)),combat:runtime.combat,cmsRevision:revision,policyVersion:runtime.version};
}
export async function mercenaryAccountState(env,user){
  const [config,policy,owned,loadout,wallet]=await Promise.all([readMercenaryDocument(env),readMercenaryRuntime(env),env.DB.prepare('SELECT c.*,COALESCE(g.level,1) AS level,COALESCE(g.experience,0) AS experience,COALESCE(g.revision,0) AS growth_revision FROM user_mercenary_cards_v1 c LEFT JOIN user_mercenary_growth_v1 g ON g.user_id=c.user_id AND g.mercenary_code=c.mercenary_code WHERE c.user_id=? ORDER BY c.mercenary_code').bind(user.id).all(),env.DB.prepare('SELECT mercenary_code,revision FROM user_mercenary_loadout_v1 WHERE user_id=?').bind(user.id).first(),env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first()]);
  return {accountId:Number(user.id),deployment:mercenaryDeploymentState(),available:MERCENARY_DEPLOYMENT_RELEASE_ENABLED||policy.mode==='ON'||policy.mode==='TEST'&&user.role==='OWNER',coin:String(wallet.coin),policy,cmsRevision:config.revision,loadout:{mercenaryCode:loadout?.mercenary_code||null,revision:Number(loadout?.revision||0)},cards:owned.results.map(row=>{const meta=config.document.mercenaries.find(c=>c.code===row.mercenary_code),art=MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===row.mercenary_code);return {code:row.mercenary_code,name:meta.name,rank:meta.rank,sourceArt:art.sourceArt,battleSprite:art.battleSprite,totalCopies:Number(row.total_copies),duplicates:Number(row.duplicate_count),level:1,experience:0,revision:Number(row.growth_revision),basePower:meta.rank?mercenaryBasePower(meta.rank):null,growth:config.document.settings.rankGrowth.find(r=>r.rank===meta.rank)||null,maxLevel:meta.growth.maxLevel,skills:assignedSkills(config.document,row.mercenary_code),pendingSkillCount:assignedSkills(config.document,row.mercenary_code).filter(s=>!skillsReady([s])).length,canDeploy:Boolean(mercenaryBasePower(meta.rank))};})};
}

export async function openMercenaryCards(env,user,body,{randomInt,readOpeningPolicy=readMercenaryRuntime,openingGuards}={}){
  const count=integer(body.count??1,1,10,'개봉 횟수'),requestId=body.requestId;
  const result=await runJointOperation(env,user,{requestId,kind:'MERCENARY_OPEN',input:{count},prepare:async()=>{
    const policy=await readOpeningPolicy(env);allowRuntime(policy,user);if(policy.opening.paymentKind==='UNSET')throw jointError('MERCENARY_PRICE_PENDING','개봉 비용이 확정되지 않았습니다.',409);if(count>policy.opening.maxBatch)throw jointError('MERCENARY_COUNT','개봉 횟수를 줄이세요.');
    const config=await readMercenaryDocument(env),released=await readJointReleaseComponent(env,'MERCENARY'),row=released?{payload_json:JSON.stringify(released.draw),revision:released.drawRevision}:await env.DB.prepare('SELECT payload_json,revision FROM mercenary_draw_config_v1 WHERE id=1').first();if(!row)throw jointError('MERCENARY_DRAW_PENDING','개봉 확률 설정이 없습니다.',409);
    const draw=validateMercenaryDraw(JSON.parse(row.payload_json)),ssOnce=await prepareMercenarySsOnce(env,user,count);
    const draws=Array.from({length:count},(_,index)=>{const pick=ssOnce?.index===index?pickMercenarySsOnce:pickMercenaryDraw;const result=pick({policy:draw,mercenaries:config.document.mercenaries,randomInt,mercenaryCode:ssOnce?.mercenaryCode});return {...result,...(result.mercenaryCode?{name:config.document.mercenaries.find(c=>c.code===result.mercenaryCode).name}:{})};});
    const coinCost=policy.opening.paymentKind==='COIN'?policy.opening.coinPerOpen*count:0;
    if(coinCost>Number((await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first()).coin))throw jointError('MERCENARY_FUNDS','코인이 부족합니다.',409);
    return {count,draws,coinCost,payment:policy.opening,cmsRevision:config.revision,drawRevision:Number(row.revision),policyVersion:policy.version,...(ssOnce?{ssOnce}:{})};
  },statements:async plan=>{
    allowRuntime(await readOpeningPolicy(env),user);
    const list=[...(openingGuards?await openingGuards(env):[]),...await consumeMercenarySsOnce(env,user,requestId,plan.ssOnce,plan.draws[plan.ssOnce?.index]),...jointCoinDebit(env.DB,user.id,plan.coinCost,`용병 개봉 ${requestId}`)];
    if(plan.payment.paymentKind==='ITEM')list.push(...jointInventoryChange(env.DB,user.id,plan.payment.itemCode,-plan.payment.itemsPerOpen*plan.count,'용병 개봉',requestId));
    plan.draws.forEach((draw,i)=>{if(draw.mercenaryCode)list.push(...mercenaryCardAcquisitionStatements(env.DB,{userId:Number(user.id),mercenaryCode:draw.mercenaryCode,acquisitionId:`${requestId}:${i}`}));else if(draw.quantity)list.push(...jointInventoryChange(env.DB,user.id,draw.outcomeId==='MASTER_STAR'?'MASTER_STAR':'STARLIGHT_ARMOR_CORE',draw.quantity,'용병 개봉 보상',`${requestId}:${i}`));});return list;
  }});return mercenaryOpeningReceipt(env,user,result.requestId,result.replayed);
}
export async function mercenaryOpeningReceipt(env,user,requestId,replayed=true){
  const row=await readJointOperation(env,user.id,requestId,'MERCENARY_OPEN');
  if(row.status!=='COMPLETED')return {requestId,status:'PENDING',retryable:true};
  const draws=[];for(let i=0;i<row.plan.draws.length;i++){const draw=row.plan.draws[i];const acquired=draw.mercenaryCode?await env.DB.prepare('SELECT is_duplicate,total_copies_after,duplicate_count_after FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=? AND user_id=?').bind(`${requestId}:${i}`,user.id).first():null;const art=draw.mercenaryCode?MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===draw.mercenaryCode):null;draws.push({...draw,...(art?{sourceArt:art.sourceArt}:{}),...(acquired?{duplicate:Boolean(Number(acquired.is_duplicate)),totalCopies:Number(acquired.total_copies_after),duplicateCount:Number(acquired.duplicate_count_after)}:{})});}
  return {requestId,accountId:Number(user.id),count:row.plan.count,status:'COMPLETED',replayed,draws,payment:row.plan.payment,coinCost:row.plan.coinCost,policyVersion:row.plan.policyVersion,drawRevision:row.plan.drawRevision};
}

export async function saveMercenaryLoadout(env,user,body){
  const code=body.mercenaryCode===null?null:knownCode(body.mercenaryCode),revision=integer(body.revision,0,2147483646,'편성 버전');
  const r=await runJointOperation(env,user,{requestId:body.requestId,kind:'MERCENARY_LOADOUT',input:{code,revision},prepare:async()=>{
    allowDeployment(await readMercenaryRuntime(env),user);if(code){await requireOwned(env,user,code);const {document}=await readMercenaryDocument(env);battleConfig(document,code,Number((await growthRow(env,user,code)).level));}
    return {code,revision};
  },statements:async plan=>{allowDeployment(await readMercenaryRuntime(env),user);const current=await env.DB.prepare('SELECT revision FROM user_mercenary_loadout_v1 WHERE user_id=?').bind(user.id).first();if(Number(current?.revision||0)!==plan.revision)throw Object.assign(jointError('MERCENARY_LOADOUT_CONFLICT','편성이 변경됐습니다. 최신 상태에서 다시 선택하세요.',409),{terminal:true});const DB=env.DB,token=crypto.randomUUID(),p=(sql,...v)=>DB.prepare(sql).bind(...v);return [
    jointGuard(DB,token,'COALESCE((SELECT revision FROM user_mercenary_loadout_v1 WHERE user_id=?),0)=?',[user.id,plan.revision]),
    ...(plan.code?[p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?) THEN 1 ELSE 0 END WHERE token=?',user.id,plan.code,token)]:[]),
    p('INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mercenary_code=excluded.mercenary_code,revision=excluded.revision,updated_at=excluded.updated_at',user.id,plan.code,plan.revision+1,new Date().toISOString()),jointGuardEnd(DB,token)];}});
  return {requestId:r.requestId,replayed:r.replayed,mercenaryCode:r.plan.code,revision:r.plan.revision+1};
}

export async function growMercenary(){
  throw jointError('MERCENARY_UPGRADE_PENDING','중복 카드 + 마스터의 별 업그레이드는 차후 공개합니다.',423);
}
