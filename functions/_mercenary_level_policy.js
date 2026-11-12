import {ADVANCEMENT_PREFIX,storedAdvancement} from './_mercenary_advancement_storage.js';
import {PLAYABLE_LEVELS} from './_comeback_loans.js';
import {MERCENARY_LEVEL_RELEASE_ENABLED as RELEASE,MERCENARY_LEVEL_KEY as KEY,MERCENARY_LEVEL_RULES,mercenaryLevelDraft,validateMercenaryLevelPolicy,mercenaryLevelReadiness,mercenaryLevelStateFromStorage,attachMercenaryLevel,levelError} from '../shared/mercenary-level-v1.mjs';
import {saveJointPolicyDraft} from './_joint_transactions.js';

export const MERCENARY_LEVEL_SCHEMA=[`CREATE TABLE IF NOT EXISTS user_mercenary_levels_v1(user_id BIGINT NOT NULL,mercenary_code TEXT NOT NULL,level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 20),experience BIGINT NOT NULL DEFAULT 0 CHECK(experience BETWEEN 0 AND 1000000000000),breakthrough_mask INTEGER NOT NULL DEFAULT 0 CHECK(breakthrough_mask BETWEEN 0 AND 15),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),updated_at TEXT NOT NULL,PRIMARY KEY(user_id,mercenary_code))`];
// Explicit preparation only. No HTTP request creates or migrates tables.
export async function ensureMercenaryLevelSchema(env){if(env.DB.execSchema)await env.DB.execSchema(MERCENARY_LEVEL_SCHEMA);else for(const sql of MERCENARY_LEVEL_SCHEMA)await env.DB.prepare(sql).run();}
export async function readMercenaryLevelPolicy(env){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KEY).first();let policy=row?JSON.parse(row.value):mercenaryLevelDraft();
 // Upgrade only the unpublished OFF draft in memory; preserve the original bytes
 // for the settings-save guard and never initialize or mutate player growth here.
 if(['mercenary-level-20261005','mercenary-level-20261014'].includes(policy.version)&&policy.mode==='OFF')policy={...policy,version:MERCENARY_LEVEL_RULES.version,sameCardMultiplier:MERCENARY_LEVEL_RULES.sameCardMultiplier,growth:policy.growth??null};
 return {raw:row?.value??null,policy:validateMercenaryLevelPolicy(policy)};
}
export async function saveMercenaryLevelPolicy(env,user,raw){
 if(user.role!=='OWNER')throw levelError('MERCENARY_LEVEL_PERMISSION','OWNER만 성장 초안을 저장할 수 있습니다.',403);
 const current=await readMercenaryLevelPolicy(env),next=validateMercenaryLevelPolicy(raw);
 if(next.mode==='ON'&&(!RELEASE||!mercenaryLevelReadiness(next,{requireGrowth:true}).ready))throw levelError('MERCENARY_LEVEL_PREPARATION','성장 출시 승인과 전체 수치 설정이 필요합니다. 현재 OFF를 유지합니다.',423);
 if(next.revision!==current.policy.revision){
  // An acknowledgement may be lost after a successful settings save.
  if(next.revision+1===current.policy.revision&&JSON.stringify({...next,revision:current.policy.revision})===JSON.stringify(current.policy))return current.policy;
  throw levelError('MERCENARY_LEVEL_CONFLICT','다른 창에서 성장 설정을 변경했습니다. 다시 불러오세요.',409);
 }
 next.revision++;return saveJointPolicyDraft(env,user,KEY,current.raw,next);
}
export async function readMercenaryLevelState(env,userId,code){return mercenaryLevelStateFromStorage(await env.DB.prepare('SELECT * FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=?').bind(userId,code).first());}
export async function releasedMercenaryLevelSummary(env,userId){
 if(!RELEASE)return {enabled:false,rows:[]};
 const {policy}=await readMercenaryLevelPolicy(env);if(policy.mode!=='ON'||!mercenaryLevelReadiness(policy,{requireGrowth:true}).ready)return {enabled:false,rows:[]};
 return {enabled:true,rows:(await env.DB.prepare(`SELECT * FROM ${PLAYABLE_LEVELS} WHERE user_id=?`).bind(userId).all()).results.map(r=>({code:r.mercenary_code,...mercenaryLevelStateFromStorage(r)}))};
}
// Growth can close independently of a paid class. The OFF path needs no growth schema.
// A value may contain multiple owned candidates for one user's duo rating.
export async function attachReleasedMercenaryLevels(env,snapshots){
 if(!RELEASE||!snapshots.size)return snapshots;
 const {policy}=await readMercenaryLevelPolicy(env);
 const growth=policy.mode==='ON'&&mercenaryLevelReadiness(policy,{requireGrowth:true}).ready;
 const ids=[...snapshots.keys()], slots=ids.map(()=>'?').join(',');
 const sql=growth?`SELECT g.*,m.value AS class_choice FROM ${PLAYABLE_LEVELS} g
   LEFT JOIN app_meta m ON m.key=(?||CAST(g.user_id AS TEXT)||':'||g.mercenary_code)
     AND (g.loan_until IS NULL OR EXISTS(SELECT 1 FROM user_mercenary_cards_v1 p WHERE p.user_id=g.user_id AND p.mercenary_code=g.mercenary_code AND p.total_copies>0))
   WHERE g.user_id IN (${slots})`:
   `SELECT p.user_id,p.mercenary_code,m.value AS class_choice FROM user_mercenary_cards_v1 p
    JOIN app_meta m ON m.key=(?||CAST(p.user_id AS TEXT)||':'||p.mercenary_code)
    WHERE p.total_copies>0 AND p.user_id IN (${slots})`;
 const rows=(await env.DB.prepare(sql).bind(ADVANCEMENT_PREFIX,...ids).all()).results;
 const byOwner=new Map(rows.map(row=>[row.user_id+':'+row.mercenary_code,row]));
 return new Map([...snapshots].map(([id,value])=>{
  const attach=snapshot=>{
    if(!snapshot)return snapshot;
    const row=byOwner.get(id+':'+snapshot.code), fighter=growth?attachMercenaryLevel(snapshot,policy,row):snapshot;
    return row?.class_choice ? {...fighter,advancementId:storedAdvancement(row.class_choice).id} : fighter;
  };
  return [id,Array.isArray(value)?value.map(attach):attach(value)];
 }));
}
