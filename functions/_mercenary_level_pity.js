import {MERCENARY_LEVEL_RULES,mercenaryLevelState,levelError} from '../shared/mercenary-level-v1.mjs';
import {mercenaryBreakthroughPity} from '../shared/mercenary-breakthrough-pity-v1.mjs';

// The immutable completed receipt ledger is the counter, including pre-release
// failures. No one-time copy, cutoff date or mutable duplicate counter can lose a
// failure during deployment. The existing user/kind index bounds every read.
export async function readMercenaryBreakthroughHistory(env,userId){
 const rows=(await env.DB.prepare("SELECT request_id,plan_json FROM joint_operations_v1 WHERE user_id=? AND kind='MERCENARY_LEVEL_V1' AND status='COMPLETED'").bind(userId).all()).results;
 return rows.map(row=>({requestId:row.request_id,plan:JSON.parse(row.plan_json)})).filter(row=>row.plan.action==='BREAKTHROUGH');
}
export function mercenaryPityFromHistory(history,code,row){
 const state=mercenaryLevelState(row),level=MERCENARY_LEVEL_RULES.milestones.find((_,i)=>!(state.breakthroughMask&(1<<i)));
 if(!level)return null;
 const seen=new Set(),revisions=new Set(),attempts=[];
 for(const {requestId,plan} of history){
  if(plan.action!=='BREAKTHROUGH'||plan.mercenaryCode!==code||plan.result?.before?.level!==level||seen.has(requestId))continue;
  // Only real ON operations may contribute; local previews have no receipts.
  if(JSON.parse(plan.policyRaw).mode!=='ON')continue;
  const {before,after,success}=plan.result;
  mercenaryLevelState(before);mercenaryLevelState(after);
  if(after.revision>state.revision)continue; // GET may race a newer completed attempt.
  const index=MERCENARY_LEVEL_RULES.milestones.indexOf(level);
  if(typeof success!=='boolean'||after.revision!==before.revision+1||after.experience!==0||!(success?(level===20?[20,MERCENARY_LEVEL_RULES.maxLevel]:[level+1]):[level]).includes(after.level)||after.breakthroughMask!==(success?before.breakthroughMask|(1<<index):before.breakthroughMask)||revisions.has(after.revision))throw levelError('MERCENARY_LEVEL_HISTORY','돌파 기록의 순서를 확인하지 못했습니다. 다시 불러오세요.',409);
  seen.add(requestId);revisions.add(after.revision);attempts.push({revision:after.revision,success});
 }
 attempts.sort((a,b)=>a.revision-b.revision);
 let failures=0;for(const attempt of attempts)failures=attempt.success?0:failures+1;
 return mercenaryBreakthroughPity(level,failures);
}
