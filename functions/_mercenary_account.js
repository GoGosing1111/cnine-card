import {KAMISHIRO_CODE,KAMISHIRO_ART} from '../shared/mercenary-kamishiro-v1.mjs';
import {COMPANION_RELEASE,validatePreparedMercenaries} from '../shared/companion-loadout-v2.mjs';
import {dualMercenaryGuard,dualMercenaryStatements} from './_mercenary_dual_loadout.js';
import {RANKED_SERIES_RULES,rankedSeriesCodes,rankedSeriesRoster} from '../shared/ranked-series-v1.mjs';
import {CARDGU_CODE,CARDGU_ART} from '../shared/mercenary-cardgu-v1.mjs';
import {REVAN_CODE,REVAN_ART} from '../shared/mercenary-revan-v1.mjs';
import {AWAKENED_OMEGA_CODE,AWAKENED_OMEGA_ART} from '../shared/mercenary-awakened-omega-v1.mjs';
import {RAZAK_CODE,RAZAK_ART} from '../shared/mercenary-razak-v1.mjs';
import {mercenaryModeAllowed,MERCENARY_PVE_ONLY_REASON} from '../shared/mercenary-eunseol-v1.mjs';
import {EUNSEOL_CODE,EUNSEOL_ART} from '../shared/mercenary-eunseol-v1.mjs';
import {GENERAL_JOK_CODE,GENERAL_JOK_ART} from '../shared/mercenary-general-jok-v1.mjs';
import {PRIME_CODE,PRIME_ART} from '../shared/mercenary-prime-requiem-v1.mjs';
import {ZERO_CODE,ZERO_ART} from '../shared/mercenary-zero-v1.mjs';
import {LEONEL_CODE,LEONEL_ART} from '../shared/mercenary-leonel-v1.mjs';
import {KANGYUN_CODE,IMPERIAL_ARCHER_COMBAT} from '../shared/mercenary-kangyun-v1.mjs';
import {JOKRO_CODE,JOKRO_ART,jokroAccountAllowed} from '../shared/mercenary-jokro-v1.mjs';
import {SHIRANUI_CODE,SHIRANUI_ART,SHIRANUI_REQUIREMENT} from '../shared/mercenary-shiranui-v1.mjs';
import {readShiranuiEligibleUsers,requireShiranuiRank} from './_mercenary_shiranui_access.js';
import {SHIRANUI_MIN_RANK_TICKS} from './_account_rank.js';
import {readJinmuPackOwners} from './_mercenary_jinmu_access.js';
import {readJokroPackOwners} from './_mercenary_jokro_access.js';
const exclusiveAccountAllowed=(userId,code,packOwners=new Set(),jokroPackOwners=new Set())=>jinmuAccountAllowed(userId,code,packOwners.has(Number(userId)))&&jokroAccountAllowed(userId,code,Date.now(),jokroPackOwners.has(Number(userId)));
import {mercenaryMode,readMercenaryModes,mercenaryModeGuard,mercenaryModeStatements} from './_mercenary_loadout_modes.js';
import {attachMercenaryEquipment,mercenaryEquipmentRuntimes,readMercenaryEquipmentRecords} from './_mercenary_equipment.js';
import {mercenaryEquipmentPower} from '../shared/mercenary-equipment-v1.mjs';
import {KAIRON_CODE,KAIRON_ART} from '../shared/mercenary-kairon-v1.mjs';
import {JINMU_CODE,JINMU_ART,jinmuAccountAllowed} from '../shared/mercenary-jinmu-v1.mjs';
import {ALL_LIMITED_MERCENARIES as LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {readJointReleaseComponent} from './_joint_release_document.js';
import {attachReleasedMercenaryLevels,releasedMercenaryLevelSummary} from './_mercenary_level_policy.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog,validateMercenaryCms} from '../shared/mercenary-cms-model-v1.mjs';
import {validateMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {MERCENARY_POWER_STANDARD,MERCENARY_UPGRADE_PLAN} from '../shared/equipment-mercenary-power-v1.mjs';
import {MERCENARY_COMBAT_DRAFT,validateMercenaryCombat} from '../shared/mercenary-combat-policy-v1.mjs';
import {mercenaryAttackStyle} from '../shared/mercenary-attack-style-v1.mjs';
import {rangedMercenarySkillText} from '../shared/mercenary-ranged-balance-v1.mjs';
import {mercenaryGuardSkillText} from '../shared/mercenary-guard-balance-v1.mjs';
import {mercenaryMoonDrawSkillText} from '../shared/mercenary-moon-draw-v1.mjs';
import {nurseRuntimeSkill} from '../shared/mercenary-nurse-healers-v1.mjs';
import {ssRearPveSnapshot,ssRearPveSkillText} from '../shared/mercenary-ss-rear-pve-v1.mjs';
import {V3_JOINT_RELEASE_ENABLED} from '../shared/v3-joint-release-v1.mjs';
import {MERCENARY_DEPLOYMENT_RELEASE_ENABLED,mercenaryDeploymentState} from '../shared/mercenary-public-release-v2097.mjs';
import {pickMercenaryDraw,mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {prepareMercenarySsOnce,pickMercenarySsOnce,consumeMercenarySsOnce} from './_mercenary_ss_once.js';
import {jointError} from './_joint_request.js';
import {jointGuardEnd} from './_joint_atomic.js';
import {ensureJointTransactionSchema,saveJointPolicyDraft,runJointOperation,readJointOperation,jointCoinDebit,jointInventoryChange} from './_joint_transactions.js';

export const MERCENARY_RUNTIME_KEY='mercenary_runtime_policy_v1';
export const releasedMercenarySnapshot=(env,user,mode='PVE')=>V3_JOINT_RELEASE_ENABLED||MERCENARY_DEPLOYMENT_RELEASE_ENABLED?loadMercenaryBattleSnapshot(env,user,mode):Promise.resolve(null);
export async function releasedMercenarySnapshots(env,userIds,mode='PVE'){
  mode=mercenaryMode(mode);
  if((!V3_JOINT_RELEASE_ENABLED&&!MERCENARY_DEPLOYMENT_RELEASE_ENABLED)||!userIds.length)return new Map();
  const ids=[...new Set(userIds.map(Number))];if(ids.some(id=>!Number.isSafeInteger(id)||id<=0)||ids.length>200)throw jointError('MERCENARY_USERS','계정 범위를 확인하세요.');
  const loadouts=await readMercenaryModes(env,ids),selected=ids.map(id=>[id,loadouts.get(id).loadouts[mode].mercenaryCode]).filter(([,code])=>code&&mercenaryModeAllowed(code,mode));
  if(!selected.length)return new Map();
  const rows=(await env.DB.prepare(`WITH selected(user_id,mercenary_code) AS (VALUES ${selected.map(()=>'(CAST(? AS BIGINT),CAST(? AS TEXT))').join(',')}) SELECT s.user_id,s.mercenary_code,COALESCE(g.level,1) AS level FROM selected s JOIN user_mercenary_cards_v1 c ON c.user_id=s.user_id AND c.mercenary_code=s.mercenary_code LEFT JOIN user_mercenary_growth_v1 g ON g.user_id=s.user_id AND g.mercenary_code=s.mercenary_code`).bind(...selected.flat()).all()).results;
  if(!rows.length)return new Map();const [packOwners,jokroPackOwners]=await Promise.all([readJinmuPackOwners(env,rows.filter(r=>r.mercenary_code===JINMU_CODE).map(r=>r.user_id)),readJokroPackOwners(env,rows.filter(r=>r.mercenary_code===JOKRO_CODE).map(r=>r.user_id))]);const [{document,revision},runtime]=await Promise.all([readMercenaryDocument(env),readMercenaryRuntime(env)]);
  const rankEligible=await readShiranuiEligibleUsers(env,rows.filter(r=>r.mercenary_code===SHIRANUI_CODE).map(r=>r.user_id));
  return attachMercenaryEquipment(env,await attachReleasedMercenaryLevels(env,new Map(rows.filter(r=>exclusiveAccountAllowed(r.user_id,r.mercenary_code,packOwners,jokroPackOwners)&&(r.mercenary_code!==SHIRANUI_CODE||rankEligible.has(Number(r.user_id)))).map(r=>[Number(r.user_id),{...battleConfig(document,r.mercenary_code,Number(r.level)),combat:runtime.combat,cmsRevision:revision,policyVersion:runtime.version}]))),mode);
}
export const mercenarySnapshotPower=m=>m?(m.statMode==='RANK_FIXED'?(limitedDeploymentSnapshot(m.code)?.basePower??mercenaryBasePower(m.rank,m.code)):Math.round(m.basePower*(1+(m.combat?.powerGrowthPercentPerLevel||0)*(m.level-1)/100)))+mercenaryEquipmentPower(m):0;
export const mercenaryFormationPower=f=>(f?.mercenaries||[f?.mercenary]).filter(Boolean).reduce((sum,m)=>sum+mercenarySnapshotPower(m),0);
export const releasedMercenaryFormation=async(env,user,mode='PVE')=>(await releasedMercenaryFormations(env,[Number(user.id)],mode)).get(Number(user.id))||{mercenary:null};
export async function releasedMercenaryFormations(env,userIds,mode='PVE',{dual=COMPANION_RELEASE.dualMercenaries}={}){
 mode=mercenaryMode(mode);
 if(!dual)return new Map([...(await releasedMercenarySnapshots(env,userIds,mode))].map(([id,m])=>[id,{mercenary:m}]));
 if(!V3_JOINT_RELEASE_ENABLED&&!MERCENARY_DEPLOYMENT_RELEASE_ENABLED)return new Map();
 const ids=[...new Set(userIds.map(Number))],records=await readMercenaryModes(env,ids,{dual:true});
 const selected=ids.flatMap(id=>records.get(id).loadouts[mode].mercenaryCodes.map(code=>[id,code]));
 if(!selected.length)return new Map(ids.map(id=>[id,{mercenaries:[]}]));
 const rows=(await env.DB.prepare(`WITH selected(user_id,mercenary_code) AS (VALUES ${selected.map(()=>'(CAST(? AS BIGINT),CAST(? AS TEXT))').join(',')}) SELECT s.user_id,s.mercenary_code FROM selected s JOIN user_mercenary_cards_v1 c ON c.user_id=s.user_id AND c.mercenary_code=s.mercenary_code WHERE c.total_copies>0`).bind(...selected.flat()).all()).results;
 const [{document,revision},runtime,equipment,packOwners,jokroPackOwners,rankEligible]=await Promise.all([readMercenaryDocument(env),readMercenaryRuntime(env),mercenaryEquipmentRuntimes(env,ids,mode),readJinmuPackOwners(env,rows.filter(r=>r.mercenary_code===JINMU_CODE).map(r=>r.user_id)),readJokroPackOwners(env,rows.filter(r=>r.mercenary_code===JOKRO_CODE).map(r=>r.user_id)),readShiranuiEligibleUsers(env,rows.filter(r=>r.mercenary_code===SHIRANUI_CODE).map(r=>r.user_id))]);
 const snapshots=new Map(ids.map(id=>[id,records.get(id).loadouts[mode].mercenaryCodes.filter(code=>rows.some(r=>Number(r.user_id)===id&&r.mercenary_code===code)&&exclusiveAccountAllowed(id,code,packOwners,jokroPackOwners)&&(code!==SHIRANUI_CODE||rankEligible.has(id))).map(code=>({...battleConfig(document,code,1),combat:runtime.combat,cmsRevision:revision,policyVersion:runtime.version}))]));
 for(const list of snapshots.values())try{validatePreparedMercenaries(list);}catch(error){throw jointError('MERCENARY_FORMATION',error.message,409);}
 const leveled=await attachReleasedMercenaryLevels(env,snapshots);
 return new Map(ids.map(id=>{const mercenaries=leveled.get(id).map(m=>equipment.get(id)?.items.length?{...m,equipment:equipment.get(id)}:m);return [id,{mercenaries}];}));
}
// Ranked-only selection. Does not read or write the ordinary PVE/PVP single slot.
export async function rankedOwnedMercenaries(env,userIds){
  const ids=[...new Set(userIds.map(Number))];
  if(ids.some(id=>!Number.isSafeInteger(id)||id<1)||ids.length>200)throw jointError('MERCENARY_USERS','계정 범위를 확인하세요.');
  const result=new Map(ids.map(id=>[id,[]]));if(!ids.length||!MERCENARY_DEPLOYMENT_RELEASE_ENABLED)return result;
  const [{document},owned]=await Promise.all([readMercenaryDocument(env),env.DB.prepare(`SELECT user_id,mercenary_code FROM user_mercenary_cards_v1 WHERE user_id IN (${ids.map(()=>'?').join(',')}) AND total_copies>0`).bind(...ids).all()]);
  const [packOwners,jokroPackOwners]=await Promise.all([readJinmuPackOwners(env,owned.results.filter(r=>r.mercenary_code===JINMU_CODE).map(r=>Number(r.user_id))),readJokroPackOwners(env,owned.results.filter(r=>r.mercenary_code===JOKRO_CODE).map(r=>Number(r.user_id)))]);
  const rankEligible=await readShiranuiEligibleUsers(env,owned.results.filter(r=>r.mercenary_code===SHIRANUI_CODE).map(r=>r.user_id));
  for(const row of owned.results){
    if(!mercenaryModeAllowed(row.mercenary_code,'PVP'))continue;
    if(row.mercenary_code===SHIRANUI_CODE&&!rankEligible.has(Number(row.user_id)))continue;
    if(!exclusiveAccountAllowed(row.user_id,row.mercenary_code,packOwners,jokroPackOwners))continue;
    try{result.get(Number(row.user_id)).push(battleConfig(document,row.mercenary_code,1));}catch(error){if(error.code!=='MERCENARY_STATS_PENDING')throw error;}
  }
  return result;
}
export async function rankedSelectedMercenaries(env,selections,rules=RANKED_SERIES_RULES){
  for(const codes of selections.values())rankedSeriesCodes(codes,rules);
  const ids=[...selections.keys()],[owned,runtime,equipment]=await Promise.all([rankedOwnedMercenaries(env,ids),readMercenaryRuntime(env),mercenaryEquipmentRuntimes(env,ids,'PVP')]);
  const snapshots=new Map(ids.map(id=>[id,rankedSeriesRoster(selections.get(id).map(code=>{
    const snapshot=owned.get(id).find(m=>m.code===code);
    if(!snapshot)throw jointError('PVP_SERIES_ROSTER',`보유한 서로 다른 용병 ${rules.rosterSize}종이 필요합니다.`,409);
    return {...snapshot,combat:runtime.combat,policyVersion:runtime.version};
  }),rules)]));
  // One policy read and one growth query for all selected companions and users.
  const leveled=await attachReleasedMercenaryLevels(env,snapshots);
  return new Map(ids.map(id=>[id,leveled.get(id).map(snapshot=>equipment.get(id)?.items.length?{...snapshot,equipment:equipment.get(id)}:snapshot)]));
}

const mercenaryBasePower=(rank,code)=>code===KANGYUN_CODE?IMPERIAL_ARCHER_COMBAT.basePower:MERCENARY_POWER_STANDARD.basePowerByRank[rank];
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
  if(raw.upgrade&&(Object.keys(raw.upgrade).length!==3||Object.entries(MERCENARY_UPGRADE_PLAN).some(([k,v])=>raw.upgrade[k]!==v)))throw jointError('MERCENARY_CONFIG','용병 레벨·돌파 활성화를 준비 중입니다. 현재 성장 재료는 소모되지 않습니다.');
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
  const release=await readJointReleaseComponent(env,'MERCENARY');if(release)return {revision:release.cmsRevision,document:expandMercenarySkillCatalog(release.document,MERCENARY_CMS_SEED.document,MERCENARY_CMS_SEED.catalog)};
  const row=await env.DB.prepare("SELECT payload_json,revision FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first();
  if(!row)throw jointError('MERCENARY_CONFIG','용병 CMS를 먼저 등록하세요.',409);
  return {revision:Number(row.revision),document:expandMercenarySkillCatalog(JSON.parse(row.payload_json),MERCENARY_CMS_SEED.document,MERCENARY_CMS_SEED.catalog)};
}
function allowRuntime(policy,user){if(policy.mode==='OFF'||policy.mode==='TEST'&&user.role!=='OWNER')throw jointError('MERCENARY_CLOSED','용병 시스템을 준비 중입니다.',423);}
function allowDeployment(policy,user){if(!MERCENARY_DEPLOYMENT_RELEASE_ENABLED)allowRuntime(policy,user);}
const knownCode=code=>{if(!MERCENARY_CMS_SEED.catalog.cards.some(c=>c.code===code)&&!limitedDeploymentSnapshot(code))throw jointError('MERCENARY_CODE','용병 코드를 확인하세요.');return code;};
async function growthRow(env,user,code){return await env.DB.prepare('SELECT * FROM user_mercenary_growth_v1 WHERE user_id=? AND mercenary_code=?').bind(user.id,code).first()||{level:1,experience:0,revision:0};}
async function requireOwned(env,user,code){knownCode(code);const row=await env.DB.prepare('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?').bind(user.id,code).first();const [packOwners,jokroPackOwners]=await Promise.all([readJinmuPackOwners(env,row&&code===JINMU_CODE?[user.id]:[]),readJokroPackOwners(env,row&&code===JOKRO_CODE?[user.id]:[])]);if(!row||Number(row.total_copies)<1||!exclusiveAccountAllowed(user.id,code,packOwners,jokroPackOwners))throw jointError('MERCENARY_NOT_OWNED','보유한 용병만 사용할 수 있습니다.',403);return row;}
function assignedSkills(document,code){return (document.assignments.find(a=>a.code===code)?.skillIds||[]).map(id=>document.skills.find(s=>s.id===id));}
function skillsReady(skills){return skills.every(s=>s&&s.review==='REVIEWED'&&Object.values(s.balance||{}).length===3&&Object.values(s.balance).every(n=>Number.isFinite(n)));}
export function battleConfig(document,code,level){
  const limited=limitedDeploymentSnapshot(code);if(limited)return limited;
  const c=document.mercenaries.find(c=>c.code===code),art=MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===code);
  if(!mercenaryBasePower(c?.rank))throw jointError('MERCENARY_STATS_PENDING','용병 등급을 확정하세요.',409);
  const assigned=assignedSkills(document,code),skills=assigned.filter(s=>skillsReady([s])).map(nurseRuntimeSkill);
  // Unconfigured skill assignments remain visible in the CMS and collection.
  // They cannot disable the approved rank-based basic fighter, nor acquire
  // invented balance values merely because deployment was released.
  // Rank power is approved; reuse the battle engine's neutral power conversion per mode.
  // Individual stat/growth drafts and old QA levels cannot override this launch contract.
  return {code,name:c.name,title:c.title,rank:c.rank,position:c.position,role:c.role,basicTarget:c.basicTarget,skillTarget:c.skillTarget,level:1,statMode:'RANK_FIXED',...ssRearPveSnapshot(c),skills,pendingSkillIds:assigned.filter(s=>!skillsReady([s])).map(s=>s?.id).filter(Boolean),basePower:mercenaryBasePower(c.rank,c.code),sourceArt:art.sourceArt,battleSprite:art.battleSprite,actorKind:'MERCENARY'};
}
export async function loadMercenaryBattleSnapshot(env,user,mode='PVE'){
  mode=mercenaryMode(mode);
  const record=(await readMercenaryModes(env,[user.id])).get(Number(user.id)),row={mercenary_code:record.loadouts[mode].mercenaryCode};if(!row.mercenary_code||!mercenaryModeAllowed(row.mercenary_code,mode))return null;
  if(row.mercenary_code===SHIRANUI_CODE&&!(await readShiranuiEligibleUsers(env,[user.id])).has(Number(user.id)))return null;
  await requireOwned(env,user,row.mercenary_code);const {document,revision}=await readMercenaryDocument(env),growth=await growthRow(env,user,row.mercenary_code);
  const runtime=await readMercenaryRuntime(env),snapshot={...battleConfig(document,row.mercenary_code,Number(growth.level)),combat:runtime.combat,cmsRevision:revision,policyVersion:runtime.version};return (await attachMercenaryEquipment(env,await attachReleasedMercenaryLevels(env,new Map([[Number(user.id),snapshot]])),mode)).get(Number(user.id));
}
// Explicit owned selections for prepared cooperative slots. No loadout write.
export async function selectedMercenaryBattleSnapshots(env,user,codes,mode='PVE'){
 mode=mercenaryMode(mode);
 if(!Array.isArray(codes)||codes.length>2||new Set(codes).size!==codes.length||codes.some(c=>!/^V-\d{3}$/.test(c)||!mercenaryModeAllowed(c,mode)))throw jointError('MERCENARY_FORMATION','용병 편성을 확인하세요.');
 for(const code of codes){await requireOwned(env,user,code);await requireShiranuiRank(env,user.id,code);}
 const [{document,revision},runtime,equipment]=await Promise.all([readMercenaryDocument(env),readMercenaryRuntime(env),mercenaryEquipmentRuntimes(env,[Number(user.id)],mode)]);
 const rows=codes.map(code=>({...battleConfig(document,code,1),combat:runtime.combat,cmsRevision:revision,policyVersion:runtime.version}));try{validatePreparedMercenaries(rows);}catch(error){throw jointError('MERCENARY_FORMATION',error.message);}
 const leveled=(await attachReleasedMercenaryLevels(env,new Map([[Number(user.id),rows]]))).get(Number(user.id)),gear=equipment.get(Number(user.id));
 return leveled.map(m=>gear?.items.length?{...m,equipment:gear}:m);
}
export async function mercenaryAccountState(env,user){
  const leveling=await releasedMercenaryLevelSummary(env,user.id);
  const records=await readMercenaryEquipmentRecords(env,[user.id]);
  const [pveGear,pvpGear]=await Promise.all([mercenaryEquipmentRuntimes(env,[user.id],'PVE',{records}),mercenaryEquipmentRuntimes(env,[user.id],'PVP',{records})]);
  const equipmentPower={PVE:pveGear.get(Number(user.id)).power,PVP:pvpGear.get(Number(user.id)).power};
  const [config,policy,owned,loadout,wallet]=await Promise.all([readMercenaryDocument(env),readMercenaryRuntime(env),env.DB.prepare('SELECT c.*,COALESCE(g.level,1) AS level,COALESCE(g.experience,0) AS experience,COALESCE(g.revision,0) AS growth_revision FROM user_mercenary_cards_v1 c LEFT JOIN user_mercenary_growth_v1 g ON g.user_id=c.user_id AND g.mercenary_code=c.mercenary_code WHERE c.user_id=? ORDER BY c.mercenary_code').bind(user.id).all(),readMercenaryModes(env,[user.id]).then(rows=>rows.get(Number(user.id))),env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first()]);
  const [packOwners,jokroPackOwners]=await Promise.all([readJinmuPackOwners(env,owned.results.some(r=>r.mercenary_code===JINMU_CODE)?[user.id]:[]),readJokroPackOwners(env,owned.results.some(r=>r.mercenary_code===JOKRO_CODE)?[user.id]:[])]);
  const rankEligible=await readShiranuiEligibleUsers(env,owned.results.some(r=>r.mercenary_code===SHIRANUI_CODE)?[user.id]:[]);
  const visibleLoadouts=Object.fromEntries(Object.entries(loadout.loadouts).map(([mode,slot])=>{if(slot.mercenaryCodes){const mercenaryCodes=slot.mercenaryCodes.filter(c=>c!==SHIRANUI_CODE||rankEligible.has(Number(user.id)));return [mode,{...slot,mercenaryCodes,mercenaryCode:mercenaryCodes[0]||null}];}return [mode,slot.mercenaryCode===SHIRANUI_CODE&&!rankEligible.has(Number(user.id))?{...slot,mercenaryCode:null,blockedMercenaryCode:SHIRANUI_CODE,blockedReason:SHIRANUI_REQUIREMENT}:slot];}));
  return {accountId:Number(user.id),equipmentPower,leveling:{enabled:leveling.enabled},deployment:mercenaryDeploymentState(),available:MERCENARY_DEPLOYMENT_RELEASE_ENABLED||policy.mode==='ON'||policy.mode==='TEST'&&user.role==='OWNER',coin:String(wallet.coin),policy,cmsRevision:config.revision,loadout:visibleLoadouts.PVE,loadouts:visibleLoadouts,cards:owned.results.filter(row=>Number(row.total_copies)>0&&exclusiveAccountAllowed(user.id,row.mercenary_code,packOwners,jokroPackOwners)).map(row=>{const limited=row.mercenary_code===KAMISHIRO_CODE?KAMISHIRO_ART:row.mercenary_code===CARDGU_CODE?CARDGU_ART:row.mercenary_code===AWAKENED_OMEGA_CODE?AWAKENED_OMEGA_ART:row.mercenary_code===RAZAK_CODE?RAZAK_ART:row.mercenary_code===REVAN_CODE?REVAN_ART:row.mercenary_code===EUNSEOL_CODE?EUNSEOL_ART:row.mercenary_code===GENERAL_JOK_CODE?GENERAL_JOK_ART:row.mercenary_code===PRIME_CODE?PRIME_ART:row.mercenary_code===ZERO_CODE?ZERO_ART:row.mercenary_code===LEONEL_CODE?LEONEL_ART:row.mercenary_code===JOKRO_CODE?JOKRO_ART:row.mercenary_code===SHIRANUI_CODE?SHIRANUI_ART:row.mercenary_code===KAIRON_CODE?KAIRON_ART:row.mercenary_code===JINMU_CODE?JINMU_ART:LIMITED_MERCENARIES.find(c=>c.code===row.mercenary_code);if(limited){const snapshot=limitedDeploymentSnapshot(limited.code);return {...limited,...snapshot,...((limited.code===JINMU_CODE&&packOwners.has(Number(user.id))||limited.code===JOKRO_CODE&&jokroPackOwners.has(Number(user.id)))?{exclusiveGrant:false,excludedFromLimitedCount:false}:{}),totalCopies:Number(row.total_copies),duplicates:Number(row.duplicate_count),level:1,experience:0,revision:Number(row.growth_revision),growth:null,maxLevel:1,...(leveling.enabled?{level:1,experience:0,revision:0,...leveling.rows.find(r=>r.code===row.mercenary_code),maxLevel:20}:{}),skills:(snapshot?.skills||[]).map(skill=>({...config.document.skills.find(s=>s.mechanic===skill.mechanic),...skill,review:'REVIEWED'})),pendingSkillCount:0,canDeploy:Boolean(snapshot)&&(limited.code!==SHIRANUI_CODE||rankEligible.has(Number(user.id))),...(limited.code===SHIRANUI_CODE&&!rankEligible.has(Number(user.id))?{deploymentBlockedReason:SHIRANUI_REQUIREMENT+'에서 편성 가능'}:{})};}const meta=config.document.mercenaries.find(c=>c.code===row.mercenary_code),art=MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===row.mercenary_code);return {code:row.mercenary_code,name:meta.name,rank:meta.rank,sourceArt:art.sourceArt,battleSprite:art.battleSprite,totalCopies:Number(row.total_copies),duplicates:Number(row.duplicate_count),level:1,experience:0,revision:Number(row.growth_revision),basePower:meta.rank?mercenaryBasePower(meta.rank,meta.code):null,growth:config.document.settings.rankGrowth.find(r=>r.rank===meta.rank)||null,maxLevel:meta.growth.maxLevel,...(leveling.enabled?{level:1,experience:0,revision:0,...leveling.rows.find(r=>r.code===row.mercenary_code),maxLevel:20}:{}),skills:assignedSkills(config.document,row.mercenary_code).map(s=>ssRearPveSkillText(mercenaryMoonDrawSkillText(mercenaryGuardSkillText(rangedMercenarySkillText(s,{...meta,attackStyle:mercenaryAttackStyle(meta)}))),meta)),pendingSkillCount:assignedSkills(config.document,row.mercenary_code).filter(s=>!skillsReady([s])).length,canDeploy:Boolean(mercenaryBasePower(meta.rank,meta.code))};})};
}

export async function openMercenaryCards(env,user,body,{randomInt,readOpeningPolicy=readMercenaryRuntime,openingGuards}={}){
  const count=integer(body.count??1,1,10,'개봉 횟수'),requestId=body.requestId;
  const result=await runJointOperation(env,user,{requestId,kind:'MERCENARY_OPEN',input:{count},prepare:async()=>{
    const policy=await readOpeningPolicy(env);allowRuntime(policy,user);if(policy.opening.paymentKind==='UNSET')throw jointError('MERCENARY_PRICE_PENDING','개봉 비용이 확정되지 않았습니다.',409);if(count>policy.opening.maxBatch)throw jointError('MERCENARY_COUNT','개봉 횟수를 줄이세요.');
    const config=await readMercenaryDocument(env),released=await readJointReleaseComponent(env,'MERCENARY'),row=released?{payload_json:JSON.stringify(released.draw),revision:released.drawRevision}:await env.DB.prepare('SELECT payload_json,revision FROM mercenary_draw_config_v1 WHERE id=1').first();if(!row)throw jointError('MERCENARY_DRAW_PENDING','개봉 확률 설정이 없습니다.',409);
    const draw=validateMercenaryDraw(JSON.parse(row.payload_json)),ssOnce=await prepareMercenarySsOnce(env,user,count);
    const draws=Array.from({length:count},(_,index)=>{const pick=ssOnce?.index===index?pickMercenarySsOnce:pickMercenaryDraw;const result=pick({policy:draw,mercenaries:config.document.mercenaries,randomInt,mercenaryCode:ssOnce?.mercenaryCode,rank:ssOnce?.rank});return {...result,...(result.mercenaryCode?{name:config.document.mercenaries.find(c=>c.code===result.mercenaryCode).name}:{})};});
    const coinCost=policy.opening.paymentKind==='COIN'?policy.opening.coinPerOpen*count:0;
    if(coinCost>Number((await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first()).coin))throw jointError('MERCENARY_FUNDS','코인이 부족합니다.',409);
    return {count,draws,coinCost,payment:policy.opening,cmsRevision:config.revision,drawRevision:Number(row.revision),policyVersion:policy.version,...(ssOnce?{ssOnce}:{})};
  },statements:async plan=>{
    // 커밋 직전 재확인. 준비도는 prepare 에서 끝났고 ON/OFF 전환은 openingGuards 가
    // 같은 배치 안에서 원자적으로 막는다. recheck 는 모드만 다시 읽는다.
    allowRuntime(await readOpeningPolicy(env,{recheck:true}),user);
    const list=[...(openingGuards?await openingGuards(env):[]),...await consumeMercenarySsOnce(env,user,requestId,plan.ssOnce,plan.draws[plan.ssOnce?.index]),...jointCoinDebit(env.DB,user.id,plan.coinCost,`용병 개봉 ${requestId}`)];
    if(plan.payment.paymentKind==='ITEM')list.push(...jointInventoryChange(env.DB,user.id,plan.payment.itemCode,-plan.payment.itemsPerOpen*plan.count,'용병 개봉',requestId));
    plan.draws.forEach((draw,i)=>{if(draw.mercenaryCode)list.push(...mercenaryCardAcquisitionStatements(env.DB,{userId:Number(user.id),mercenaryCode:draw.mercenaryCode,acquisitionId:`${requestId}:${i}`}));else if(draw.quantity)list.push(...jointInventoryChange(env.DB,user.id,draw.outcomeId==='MASTER_STAR'?'MASTER_STAR':'STARLIGHT_ARMOR_CORE',draw.quantity,'용병 개봉 보상',`${requestId}:${i}`));});return list;
  }});return mercenaryOpeningReceipt(env,user,result.requestId,result.replayed);
}
export async function mercenaryOpeningReceipt(env,user,requestId,replayed=true){
  const row=await readJointOperation(env,user.id,requestId,'MERCENARY_OPEN');
  if(row.status!=='COMPLETED')return {requestId,status:'PENDING',retryable:true};
  // 뽑기 수만큼 순차 조회하면 10연에 왕복이 10회 늘어난다(원격 DB 기준 수백 ms).
  // 최대 10건이므로 한 번에 읽는다. 없는 행은 이전과 똑같이 그냥 비어 있는 채로 둔다.
  const plan=row.plan.draws,acquired=new Map();
  const ids=plan.map((draw,i)=>draw.mercenaryCode?`${requestId}:${i}`:null).filter(Boolean);
  if(ids.length){
    const rows=(await env.DB.prepare(`SELECT acquisition_id,is_duplicate,total_copies_after,duplicate_count_after FROM mercenary_card_acquisitions_v1 WHERE user_id=? AND acquisition_id IN (${ids.map(()=>'?').join(',')})`).bind(user.id,...ids).all()).results;
    for(const found of rows)acquired.set(String(found.acquisition_id),found);
  }
  const draws=plan.map((draw,i)=>{const found=draw.mercenaryCode?acquired.get(`${requestId}:${i}`)||null:null;const art=draw.mercenaryCode?MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code===draw.mercenaryCode):null;return {...draw,...(art?{sourceArt:art.sourceArt}:{}),...(found?{duplicate:Boolean(Number(found.is_duplicate)),totalCopies:Number(found.total_copies_after),duplicateCount:Number(found.duplicate_count_after)}:{})};});
  return {requestId,accountId:Number(user.id),count:row.plan.count,status:'COMPLETED',replayed,draws,payment:row.plan.payment,coinCost:row.plan.coinCost,policyVersion:row.plan.policyVersion,drawRevision:row.plan.drawRevision};
}

export async function saveMercenaryLoadout(env,user,body){
  if(COMPANION_RELEASE.dualMercenaries)return savePreparedMercenaryLoadout(env,user,body);
  if(body.mercenaryCodes!==undefined)throw jointError('MERCENARY_DUAL_PENDING','용병 2명 편성을 준비 중입니다.',423);
  const mode=mercenaryMode(body.mode),code=body.mercenaryCode===null?null:knownCode(body.mercenaryCode),revision=integer(body.revision,0,2147483646,'편성 버전');
  if(!mercenaryModeAllowed(code,mode))throw jointError('MERCENARY_PVE_ONLY',MERCENARY_PVE_ONLY_REASON,409);
  const r=await runJointOperation(env,user,{requestId:body.requestId,kind:'MERCENARY_LOADOUT',input:body.mode===undefined?{code,revision}:{code,revision,mode},prepare:async()=>{
    allowDeployment(await readMercenaryRuntime(env),user);if(code){await requireOwned(env,user,code);await requireShiranuiRank(env,user.id,code);const {document}=await readMercenaryDocument(env);battleConfig(document,code,Number((await growthRow(env,user,code)).level));}
    return {code,revision,mode};
  },statements:async plan=>{
    allowDeployment(await readMercenaryRuntime(env),user);
    if(plan.code){await requireOwned(env,user,plan.code);await requireShiranuiRank(env,user.id,plan.code);}
    const mode=mercenaryMode(plan.mode);if(!mercenaryModeAllowed(plan.code,mode))throw jointError('MERCENARY_PVE_ONLY',MERCENARY_PVE_ONLY_REASON,409);
    const record=(await readMercenaryModes(env,[user.id])).get(Number(user.id));
    if(record.loadouts[mode].revision!==plan.revision)throw Object.assign(jointError('MERCENARY_LOADOUT_CONFLICT','편성이 변경됐습니다. 최신 상태에서 다시 선택하세요.',409),{terminal:true});
    const DB=env.DB,token=crypto.randomUUID(),p=(sql,...v)=>DB.prepare(sql).bind(...v);
    return [...(plan.code===SHIRANUI_CODE&&DB.dialect==='postgres'?[p('SELECT user_id FROM account_rank_progress_v1 WHERE user_id=? FOR SHARE',user.id)]:[]),mercenaryModeGuard(DB,token,user.id,record),
      ...(plan.code===SHIRANUI_CODE?[p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM account_rank_progress_v1 WHERE user_id=? AND total_ticks>=?) THEN 1 ELSE 0 END WHERE token=?',user.id,SHIRANUI_MIN_RANK_TICKS,token)]:[]),
      ...(plan.code?[p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?) THEN 1 ELSE 0 END WHERE token=?',user.id,plan.code,token)]:[]),
      ...mercenaryModeStatements(DB,user.id,record,mode,{mercenaryCode:plan.code,revision:plan.revision+1}),jointGuardEnd(DB,token)];
  }});
  return {requestId:r.requestId,replayed:r.replayed,mode:mercenaryMode(r.plan.mode),mercenaryCode:r.plan.code,revision:r.plan.revision+1};
}

// Called by the account route only through the release flag, never a client review field.
export async function savePreparedMercenaryLoadout(env,user,body){
 const mode=mercenaryMode(body.mode),codes=body.mercenaryCodes,revision=integer(body.revision,0,2147483646,'편성 버전');
 if(!Array.isArray(codes)||codes.length>2||new Set(codes).size!==codes.length)throw jointError('MERCENARY_FORMATION','서로 다른 용병을 최대 2명 선택하세요.');
 if(body.mercenaryCode!==undefined)throw jointError('MERCENARY_FORMATION','새 편성 화면에서 두 슬롯을 함께 저장해 주세요.',409);
 const check=async()=>{allowDeployment(await readMercenaryRuntime(env),user);await selectedMercenaryBattleSnapshots(env,user,codes,mode);};
 const r=await runJointOperation(env,user,{requestId:body.requestId,kind:'MERCENARY_DUAL_LOADOUT',input:{codes,revision,mode},prepare:async()=>{await check();return {codes,revision,mode};},statements:async plan=>{
  await check();const record=(await readMercenaryModes(env,[user.id],{dual:true})).get(Number(user.id));
  if(record.loadouts[plan.mode].revision!==plan.revision)throw Object.assign(jointError('MERCENARY_LOADOUT_CONFLICT','편성이 변경됐습니다. 최신 상태에서 다시 선택하세요.',409),{terminal:true});
  const DB=env.DB,token=crypto.randomUUID(),legacyToken=crypto.randomUUID(),p=(sql,...v)=>DB.prepare(sql).bind(...v);
  return [...(plan.codes.includes(SHIRANUI_CODE)&&DB.dialect==='postgres'?[p('SELECT user_id FROM account_rank_progress_v1 WHERE user_id=? FOR SHARE',user.id)]:[]),mercenaryModeGuard(DB,legacyToken,user.id,record.legacy),dualMercenaryGuard(DB,token,record),
   ...plan.codes.map(code=>p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies>0) THEN 1 ELSE 0 END WHERE token=?',user.id,code,token)),
   ...(plan.codes.includes(SHIRANUI_CODE)?[p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM account_rank_progress_v1 WHERE user_id=? AND total_ticks>=?) THEN 1 ELSE 0 END WHERE token=?',user.id,SHIRANUI_MIN_RANK_TICKS,token)]:[]),
   ...dualMercenaryStatements(DB,user.id,record,plan.mode,{mercenaryCodes:plan.codes,revision:plan.revision+1}),jointGuardEnd(DB,token),jointGuardEnd(DB,legacyToken)];
 }});
 return {requestId:r.requestId,replayed:r.replayed,mode:r.plan.mode,mercenaryCodes:r.plan.codes,mercenaryCode:r.plan.codes[0]||null,revision:r.plan.revision+1};
}

export async function growMercenary(){
  throw jointError('MERCENARY_UPGRADE_PENDING','용병 레벨·돌파 활성화를 준비 중입니다. 현재 성장 재료는 소모되지 않습니다.',423);
}
