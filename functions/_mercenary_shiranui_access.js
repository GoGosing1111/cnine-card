import {SHIRANUI_CODE,SHIRANUI_REQUIREMENT} from '../shared/mercenary-shiranui-v1.mjs';
import {ensureAccountRank,SHIRANUI_MIN_RANK_TICKS} from './_account_rank.js';
import {jointError} from './_joint_request.js';
export async function readShiranuiEligibleUsers(env,userIds){
 const ids=[...new Set(userIds.map(Number))];if(!ids.length)return new Set();
 if(ids.length>200||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw jointError('MERCENARY_USERS','계정 범위를 확인하세요.');
 await ensureAccountRank(env);
 const rows=await env.DB.prepare(`SELECT user_id FROM account_rank_progress_v1 WHERE user_id IN (${ids.map(()=>'?').join(',')}) AND total_ticks>=?`).bind(...ids,SHIRANUI_MIN_RANK_TICKS).all();
 return new Set(rows.results.map(r=>Number(r.user_id)));
}
export async function requireShiranuiRank(env,userId,code){
 if(code===SHIRANUI_CODE&&!(await readShiranuiEligibleUsers(env,[userId])).has(Number(userId)))throw jointError('MERCENARY_ACCOUNT_RANK',`시라누이는 ${SHIRANUI_REQUIREMENT}에서만 편성할 수 있습니다.`,403);
}
