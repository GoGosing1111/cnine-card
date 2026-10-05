import {MERCENARY_LEVEL_RELEASE_ENABLED as RELEASE,MERCENARY_LEVEL_KEY as KEY,mercenaryLevelDraft,validateMercenaryLevelPolicy,mercenaryLevelReadiness,mercenaryLevelState,attachMercenaryLevel,levelError} from '../shared/mercenary-level-v1.mjs';
import {saveJointPolicyDraft} from './_joint_transactions.js';

export const MERCENARY_LEVEL_SCHEMA=[`CREATE TABLE IF NOT EXISTS user_mercenary_levels_v1(user_id BIGINT NOT NULL,mercenary_code TEXT NOT NULL,level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 20),experience BIGINT NOT NULL DEFAULT 0 CHECK(experience BETWEEN 0 AND 1000000000000),breakthrough_mask INTEGER NOT NULL DEFAULT 0 CHECK(breakthrough_mask BETWEEN 0 AND 15),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),updated_at TEXT NOT NULL,PRIMARY KEY(user_id,mercenary_code))`];
// Explicit preparation only. No HTTP request creates or migrates tables.
export async function ensureMercenaryLevelSchema(env){if(env.DB.execSchema)await env.DB.execSchema(MERCENARY_LEVEL_SCHEMA);else for(const sql of MERCENARY_LEVEL_SCHEMA)await env.DB.prepare(sql).run();}
export async function readMercenaryLevelPolicy(env){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KEY).first();return {raw:row?.value??null,policy:row?validateMercenaryLevelPolicy(JSON.parse(row.value)):mercenaryLevelDraft()};}
export async function saveMercenaryLevelPolicy(env,user,raw){
 if(user.role!=='OWNER')throw levelError('MERCENARY_LEVEL_PERMISSION','OWNER만 성장 초안을 저장할 수 있습니다.',403);
 const current=await readMercenaryLevelPolicy(env),next=validateMercenaryLevelPolicy(raw);
 if(next.mode==='ON'&&(!RELEASE||!mercenaryLevelReadiness(next).ready))throw levelError('MERCENARY_LEVEL_PREPARATION','성장 출시 승인과 전체 수치 설정이 필요합니다. 현재 OFF를 유지합니다.',423);
 if(next.revision!==current.policy.revision){
  // An acknowledgement may be lost after a successful settings save.
  if(next.revision+1===current.policy.revision&&JSON.stringify({...next,revision:current.policy.revision})===JSON.stringify(current.policy))return current.policy;
  throw levelError('MERCENARY_LEVEL_CONFLICT','다른 창에서 성장 설정을 변경했습니다. 다시 불러오세요.',409);
 }
 next.revision++;return saveJointPolicyDraft(env,user,KEY,current.raw,next);
}
export async function readMercenaryLevelState(env,userId,code){return mercenaryLevelState(await env.DB.prepare('SELECT * FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=?').bind(userId,code).first());}
export async function releasedMercenaryLevelSummary(env,userId){
 if(!RELEASE)return {enabled:false,rows:[]};
 const {policy}=await readMercenaryLevelPolicy(env);if(policy.mode!=='ON')return {enabled:false,rows:[]};
 return {enabled:true,rows:(await env.DB.prepare('SELECT * FROM user_mercenary_levels_v1 WHERE user_id=?').bind(userId).all()).results.map(r=>({code:r.mercenary_code,...mercenaryLevelState(r)}))};
}
// Both switches must open. OFF performs no new table reads and preserves all old snapshots.
export async function attachReleasedMercenaryLevels(env,snapshots){
 if(!RELEASE||!snapshots.size)return snapshots;
 const {policy}=await readMercenaryLevelPolicy(env);if(policy.mode!=='ON')return snapshots;
 const ids=[...snapshots.keys()],rows=(await env.DB.prepare(`SELECT * FROM user_mercenary_levels_v1 WHERE user_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results;
 return new Map([...snapshots].map(([id,snapshot])=>[id,attachMercenaryLevel(snapshot,policy,rows.find(r=>Number(r.user_id)===id&&r.mercenary_code===snapshot.code))]));
}
