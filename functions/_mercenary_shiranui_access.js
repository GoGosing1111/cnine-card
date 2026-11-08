import {SHIRANUI_CODE,SHIRANUI_REQUIREMENT} from '../shared/mercenary-shiranui-v1.mjs';
import {ensureAccountRank,SHIRANUI_MIN_RANK_TICKS} from './_account_rank.js';
import {jointError} from './_joint_request.js';
import {RAID_BUS_DRIVER_TITLE} from './_raid_bus_driver_title.js';

function eligibleAccountPredicate(DB) {
 const unexpired=DB.dialect==='postgres'
  ? 'CAST(h.expires_at AS TIMESTAMPTZ)>statement_timestamp()'
  : "julianday(h.expires_at)>julianday('now')";
 return `(EXISTS (SELECT 1 FROM account_rank_progress_v1 r WHERE r.user_id=u.id AND r.total_ticks>=?)
  OR EXISTS (SELECT 1 FROM user_character_titles h JOIN character_titles t ON t.id=h.title_id
   WHERE h.user_id=u.id AND t.code=? AND t.is_active=1 AND (h.expires_at IS NULL OR ${unexpired})))`;
}
const eligibilityValues=[SHIRANUI_MIN_RANK_TICKS,RAID_BUS_DRIVER_TITLE.code];

export function shiranuiDeploymentGuard(DB,userId) {
 return {
  predicate:`EXISTS (SELECT 1 FROM users u WHERE u.id=? AND ${eligibleAccountPredicate(DB)})`,
  values:[userId,...eligibilityValues],
  locks:DB.dialect==='postgres'?[
   DB.prepare('SELECT user_id FROM account_rank_progress_v1 WHERE user_id=? FOR SHARE').bind(userId),
   DB.prepare(`SELECT h.user_id FROM user_character_titles h JOIN character_titles t ON t.id=h.title_id
    WHERE h.user_id=? AND t.code=? FOR SHARE OF h,t`).bind(userId,RAID_BUS_DRIVER_TITLE.code)
  ]:[]
 };
}

export async function readShiranuiEligibleUsers(env,userIds){
 const ids=[...new Set(userIds.map(Number))];if(!ids.length)return new Set();
 if(ids.length>200||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw jointError('MERCENARY_USERS','계정 범위를 확인하세요.');
 await ensureAccountRank(env);
 const rows=await env.DB.prepare(`SELECT u.id AS user_id FROM users u
  WHERE u.id IN (${ids.map(()=>'?').join(',')}) AND ${eligibleAccountPredicate(env.DB)}`).bind(...ids,...eligibilityValues).all();
 return new Set(rows.results.map(r=>Number(r.user_id)));
}
export async function requireShiranuiDeployment(env,userId,code){
 if(code===SHIRANUI_CODE&&!(await readShiranuiEligibleUsers(env,[userId])).has(Number(userId)))throw jointError('MERCENARY_ACCOUNT_RANK',`${SHIRANUI_REQUIREMENT} 시 시라누이를 편성할 수 있습니다.`,403);
}
