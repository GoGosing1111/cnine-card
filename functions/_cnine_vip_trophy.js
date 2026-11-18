// Stable ownership identities survive the Santa Sudaeng -> Dealer Sudaeng rename.
// This is a current collection honor, like LIMITED_EDITION_80; reads never grant
// inventory, equip avatars, or write historical/manual trophy receipts.
export const CNINE_VIP_CODE='CNINE_VIP';
export const CNINE_VIP_AVATAR_CODES=Object.freeze(['SANTA_HIHEEYA','SANTA_BONGSOON','SANTA_JOEUN','SANTA_SUDAENG']);
export const CNINE_VIP_GOAL=CNINE_VIP_AVATAR_CODES.length;
export const emptyCnineVipHonor=()=>({count:0,progress:0,goal:CNINE_VIP_GOAL,acquiredAt:null});
export const CNINE_VIP_SQL=`SELECT COUNT(DISTINCT avatar_code) progress
 FROM avatar_user_ownership_v1 WHERE user_id=? AND avatar_code IN (?,?,?,?)
 AND (expires_at IS NULL OR datetime(expires_at)>datetime('now'))`;
export async function readCnineVipHonor(env,userId){
 const id=Number(userId);if(!Number.isSafeInteger(id)||id<1)throw Error('INVALID_CNINE_VIP_OWNER');
 const row=await env.DB.prepare(CNINE_VIP_SQL).bind(id,...CNINE_VIP_AVATAR_CODES).first();
 const progress=Number(row?.progress||0);
 return {count:progress===CNINE_VIP_GOAL?1:0,progress,goal:CNINE_VIP_GOAL,acquiredAt:null};
}
