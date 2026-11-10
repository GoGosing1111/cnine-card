import {jointError} from './_joint_request.js';

// The active LIVE roster and its recorded upgrade decide entry, never client state.
export const HIDEOUT_MEMBERSHIP_SQL=`SELECT m.organization_id AS clan_id,p.stage
 FROM organization_rounds_v1 r JOIN organization_members_v1 m ON m.round_id=r.id
 JOIN organization_progress_v1 p ON p.round_id=m.round_id AND p.organization_id=m.organization_id
 WHERE r.scope='LIVE' AND r.phase='ASSIGNED' AND m.user_id=?`;
export async function clanHideout(env,userId){
 if(env.DB.dialect!=='postgres')return {clanId:null,stage:0};
 let row;
 try{row=await env.DB.prepare(HIDEOUT_MEMBERSHIP_SQL).bind(userId).first();}
 catch(error){if(error.code==='42P01')return {clanId:null,stage:0};throw error;}
 return {clanId:row?Number(row.clan_id):null,stage:Number(row?.stage||0)};
}
export async function requireClanHideout(env,userId,stage){
 const access=await clanHideout(env,userId);
 if(access.stage<stage)throw jointError('CLAN_HIDEOUT_REQUIRED','소속 클랜의 아지트 '+stage+'단계부터 입장할 수 있습니다.',403);
 return access;
}
