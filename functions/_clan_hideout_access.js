import {jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const FIRST_CLAN_FIELD_SEASON=5;
const seasonStarted="s.starts_at IS NOT NULL AND CAST(s.starts_at AS timestamptz)<=statement_timestamp() AND s.phase IN ('ACTIVE','SETTLEMENT','CHAMPIONS','COMPLETE')";
export const HIDEOUT_MEMBERSHIP_SQL=`SELECT r.id AS round_id,s.season_no,m.organization_id AS clan_id,p.stage,
 (s.season_no>=5 AND ${seasonStarted}) AS season_open
 FROM app_meta live JOIN organization_rounds_v1 r ON r.id=CAST(live.value AS jsonb)->>'roundId'
 JOIN clan_seasons s ON CAST(s.id AS text)=CAST(live.value AS jsonb)->>'seasonId'
 LEFT JOIN organization_members_v1 m ON m.round_id=r.id AND m.user_id=?
 LEFT JOIN organization_progress_v1 p ON p.round_id=m.round_id AND p.organization_id=m.organization_id
 WHERE live.key='clan_resumption_v1' AND r.scope='LIVE' AND r.phase='ASSIGNED'`;
export async function clanHideout(env,userId){
 const locked={clanId:null,roundId:null,stage:0,seasonNo:null,seasonOpen:false};
 if(env.DB.dialect!=='postgres')return locked;
 let row;
 try{row=await env.DB.prepare(HIDEOUT_MEMBERSHIP_SQL).bind(userId).first();}
 catch(error){if(error.code==='42P01')return locked;throw error;}
 return row?{clanId:row.clan_id==null?null:Number(row.clan_id),roundId:row.round_id,stage:Number(row.stage||0),seasonNo:Number(row.season_no),seasonOpen:row.season_open===true||row.season_open===1}:locked;
}
export async function requireClanHideout(env,userId,stage,room=null){
 const access=await clanHideout(env,userId);
 if(!access.seasonOpen)throw jointError('CLAN_SEASON_REQUIRED','클랜 전용 전장은 시즌 5가 시작된 후 입장할 수 있습니다.',403);
 if(access.stage<stage||!access.clanId)throw jointError('CLAN_HIDEOUT_REQUIRED','소속 클랜의 아지트 '+stage+'단계부터 입장할 수 있습니다.',403);
 if(room&&(room.clanId!==access.clanId||room.roundId!==access.roundId))throw jointError('CLAN_ROOM_REQUIRED','같은 시즌의 소속 클랜 파티만 이용할 수 있습니다.',403);
 return access;
}
export function clanEntryGuards(db,userIds,stage,room){
 return userIds.flatMap(id=>{
  const key=crypto.randomUUID();
  return [jointGuard(db,key,'EXISTS('+HIDEOUT_MEMBERSHIP_SQL+' AND r.id=? AND m.organization_id=? AND p.stage>=? AND s.season_no>=? AND '+seasonStarted+')',[id,room.roundId,room.clanId,stage,FIRST_CLAN_FIELD_SEASON]),jointGuardEnd(db,key)];
 });
}
