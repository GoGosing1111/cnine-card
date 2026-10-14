import {TROPHY_CATALOG} from '../js/player-card-model-v2052.js';

// Server-owned grants supplement ownership without fabricating competition or
// milestone history. There is deliberately no public write endpoint.
export const trophyManualGrantsKey=id=>'trophy_manual_grants_v1:'+Number(id);
export function parseTrophyManualGrants(raw,userId){
  if(raw==null)return {version:1,userId:Number(userId),grants:[]};
  const value=JSON.parse(raw),codes=new Set();
  if(value?.version!==1||value.userId!==Number(userId)||!Array.isArray(value.grants)||value.grants.length>TROPHY_CATALOG.length)throw Error('INVALID_TROPHY_GRANTS');
  for(const grant of value.grants){
    if(!grant||!TROPHY_CATALOG.some(t=>t.code===grant.code)||codes.has(grant.code)||
      typeof grant.grantedAt!=='string'||!Number.isFinite(Date.parse(grant.grantedAt))||
      typeof grant.operationKey!=='string'||!grant.operationKey.trim())throw Error('INVALID_TROPHY_GRANTS');
    codes.add(grant.code);
  }
  return value;
}
export async function readTrophyManualGrants(env,userId){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(trophyManualGrantsKey(userId)).first();
  return parseTrophyManualGrants(row?.value,userId);
}
export function applyTrophyManualGrants(honors,document){
  const result={...honors};
  for(const grant of document.grants){
    const earned=honors[grant.code];
    if(!earned)throw Error('UNKNOWN_TROPHY_HONOR');
    const acquiredAt=earned.acquiredAt&&Date.parse(earned.acquiredAt)<=Date.parse(grant.grantedAt)?earned.acquiredAt:grant.grantedAt;
    result[grant.code]={...earned,count:Math.max(1,earned.count),acquiredAt,adminGranted:true,officialCount:earned.count};
  }
  return result;
}
