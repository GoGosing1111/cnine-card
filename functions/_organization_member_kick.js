import {orgAssert,orgInteger} from '../shared/organization-system-v1.mjs';
import {organizationElderIds} from '../shared/organization-faction-v1.mjs';
import {CLAN_RESUMPTION_STATE_KEY,activeClanResumption} from '../shared/clan-resumption-v1.mjs';

const pack=JSON.stringify;
const hasUser=(ids,id)=>(ids||[]).some(value=>Number(value)===id);
function removeFromFormation(state,clanId,userId,now){
 const involved=(state.battles||[]).some(b=>b.status==='ACTIVE'&&(!Number.isFinite(Number(b.endsAt))||Number(b.endsAt)>now)&&(hasUser(b.attackers,userId)||hasUser(b.defenders,userId)));
 orgAssert(!involved,'BATTLE','교전 중인 클랜원은 전투가 끝난 뒤 방출할 수 있습니다.');
 for(const [squad,ids] of Object.entries(state.formations?.[clanId]||{}))state.formations[clanId][squad]=ids.filter(id=>Number(id)!==userId);
 for(const [squad,id] of Object.entries(state.captains?.[clanId]||{}))if(Number(id)===userId)delete state.captains[clanId][squad];
 for(const district of state.districts||[])if(Number(district.owner)===clanId&&district.defense&&!state.formations?.[clanId]?.[district.defense]?.length)district.defense='';
}

// Run inside the organization's existing transaction, never as a separate removal.
async function removeRegularMembership(q,round,userId,clanId,now,expected){
 if(round.scope!=='LIVE')return null;
 const [meta]=await q('SELECT value FROM app_meta WHERE key=$1',[CLAN_RESUMPTION_STATE_KEY]);
 const release=meta&&activeClanResumption(JSON.parse(meta.value),now);
 if(expected)orgAssert(release&&release.roundId===round.id&&release.seasonId===expected.seasonId,'SEASON','클랜 시즌이 변경되었습니다. 명단을 새로고침하세요.');
 if(!release||release.roundId!==round.id)return null;
 // Same locks as the existing clan kick: exclude battle reservations/settlement.
 await q('LOCK TABLE clan_wars,clan_war_battles,clan_war_reservation_locks,clan_members,clan_season_teams,clan_seasons,clan_draft_pool IN SHARE ROW EXCLUSIVE MODE NOWAIT');
 const [season]=await q('SELECT id,phase FROM clan_seasons WHERE id=$1',[release.seasonId]);
 orgAssert(season,'SEASON','정규 클랜전 시즌을 확인하지 못했습니다. 다시 시도하세요.');
 if(expected)orgAssert(season.phase==='ACTIVE','SEASON','정규 시즌 중에만 클랜원을 방출할 수 있습니다.');
 if(season.phase==='COMPLETE')return null; // Finished season rosters are history.
 orgAssert(season.phase==='ACTIVE','SEASON','정규 시즌의 대회·정산이 끝난 뒤 방출하세요.');
 const [member]=await q('SELECT * FROM clan_members WHERE season_id=$1 AND user_id=$2',[release.seasonId,userId]);
 if(expected)orgAssert(member&&member.joined_at===expected.joinedAt,'STALE','클랜원의 소속 또는 가입 정보가 바뀌었습니다. 명단을 다시 확인하세요.');
 if(!member)return null;
 orgAssert(Number(member.clan_id)===clanId,'MEMBERSHIP','클랜전 소속이 변경되었습니다. 명단을 새로고침하세요.');
 orgAssert(!(await q("SELECT 1 FROM clan_wars WHERE season_id=$1 AND (clan_a_id=$2 OR clan_b_id=$2) AND status IN ('ACTIVE','CLOSING') LIMIT 1",[release.seasonId,clanId])).length,'BATTLE','클랜전 진행·정산 중에는 방출할 수 없습니다. 경기 종료 후 다시 시도하세요.');
 orgAssert(!(await q("SELECT 1 FROM clan_war_battles WHERE season_id=$1 AND status IN ('PENDING','RESOLVING') AND (attacker_user_id=$2 OR defender_user_id=$2) LIMIT 1",[release.seasonId,userId])).length,'BATTLE','대상의 전투가 끝난 뒤 방출하세요.');
 orgAssert(!(await q('SELECT 1 FROM clan_war_reservation_locks l JOIN clan_wars w ON w.id=l.war_id WHERE w.season_id=$1 AND l.user_id=$2 AND l.expires_at::timestamptz>CURRENT_TIMESTAMP LIMIT 1',[release.seasonId,userId])).length,'BATTLE','대상의 전투 예약이 끝난 뒤 방출하세요.');
 const [faction]=await q('SELECT * FROM clan_faction_state WHERE season_id=$1 FOR UPDATE',[release.seasonId]);
 if(faction){const state=JSON.parse(faction.state_json);removeFromFormation(state,clanId,userId,now);await q('UPDATE clan_faction_state SET state_json=$1,revision=revision+1 WHERE season_id=$2',[pack(state),release.seasonId]);}
 const pool=await q('SELECT * FROM clan_draft_pool WHERE season_id=$1 AND user_id=$2',[release.seasonId,userId]);
 orgAssert(pool.every(p=>Number(p.drafted_clan_id)===clanId),'MEMBERSHIP','클랜전 편성 정보가 변경되었습니다. 다시 확인하세요.');
 await q('DELETE FROM clan_members WHERE season_id=$1 AND user_id=$2',[release.seasonId,userId]);
 await q("UPDATE clan_draft_pool SET status='WITHDRAWN',drafted_clan_id=NULL,pick_no=NULL,updated_at=sqlite_now() WHERE season_id=$1 AND user_id=$2",[release.seasonId,userId]);
 await q('DELETE FROM clan_executives WHERE season_id=$1 AND clan_id=$2 AND user_id=$3',[release.seasonId,clanId,userId]);
 return {member,pool,faction};
}

export async function kickOrganizationMember(q,user,body,round,now,regularMembership){
 const userId=orgInteger(body.targetUserId,1,Number.MAX_SAFE_INTEGER,'방출 대상'),joinedAt=orgInteger(body.joinedAt,0,Number.MAX_SAFE_INTEGER,'가입 시각');
 orgAssert(body.confirmation==='KICK_CLAN_MEMBER','CONFIRMATION','클랜원 방출을 확인하세요.',400);
 orgAssert(userId!==Number(user.id),'SELF','자신은 방출할 수 없습니다.',403);
 orgAssert(round.phase==='ASSIGNED','PHASE','클랜 배정이 완료된 뒤 방출할 수 있습니다.');
 orgAssert(body.revision===Number(round.revision),'STALE','클랜 명단이 변경되었습니다. 새로고침한 뒤 다시 선택하세요.');
 const [actor]=await q('SELECT status,banned_until FROM users WHERE id=$1 FOR SHARE',[user.id]);
 orgAssert(actor?.status==='ACTIVE'&&(!actor.banned_until||Date.parse(actor.banned_until)<=now),'ACCOUNT','활성 계정인 원로만 방출할 수 있습니다.',403);
 const [faction]=await q('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1 FOR UPDATE',[round.id]);
 const state=JSON.parse(faction?.state_json||'{}');
 const roster=(await q('SELECT m.*,u.nickname,u.status FROM organization_members_v1 m JOIN users u ON u.id=m.user_id WHERE m.round_id=$1',[round.id])).map(m=>({...m,userId:Number(m.user_id),clanId:Number(m.organization_id)}));
 const mine=roster.find(m=>m.userId===Number(user.id)),member=roster.find(m=>m.userId===userId),clanId=mine?.clanId;
 orgAssert(mine&&organizationElderIds(state,roster,clanId).includes(Number(user.id)),'ELDER','우리 클랜의 원로만 클랜원을 방출할 수 있습니다.',403);
 orgAssert(member&&member.clanId===clanId,'MEMBERSHIP','현재 같은 클랜에 소속된 클랜원만 방출할 수 있습니다.',403);
 const elderIds=state.elders?.[clanId]??[state.commanders?.[clanId]];
 orgAssert(!hasUser(elderIds,userId),'ELDER_TARGET','다른 원로는 방출할 수 없습니다.',403);
 orgAssert(Number(member.joined_at)===joinedAt,'STALE','클랜원의 가입 정보가 바뀌었습니다. 명단을 다시 확인하세요.');
 const next=structuredClone(state);removeFromFormation(next,clanId,userId,now);
 const regular=await removeRegularMembership(q,round,userId,clanId,now,regularMembership);
 const survey=await q('SELECT * FROM organization_surveys_v1 WHERE round_id=$1 AND user_id=$2',[round.id,userId]);
 const applicationKey='organization-join:'+round.id+':'+userId;
 const [application]=await q('SELECT value FROM app_meta WHERE key=$1',[applicationKey]);
 const removed=await q('DELETE FROM organization_members_v1 WHERE round_id=$1 AND user_id=$2 AND organization_id=$3 AND joined_at=$4 RETURNING user_id',[round.id,userId,clanId,joinedAt]);
 orgAssert(removed.length===1,'STALE','클랜원 상태가 변경되었습니다. 다시 확인하세요.');
 // Preserve the original answers while preventing unattended reassignment.
 await q('UPDATE organization_surveys_v1 SET active=0,revision=revision+1,updated_at=$3 WHERE round_id=$1 AND user_id=$2 AND active=1',[round.id,userId,now]);
 if(application){const a=JSON.parse(application.value);await q('UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3',[pack({...a,status:'REMOVED',revision:a.revision+1,updatedAt:now,removedBy:Number(user.id),removedAt:now}),new Date(now).toISOString(),applicationKey]);}
 await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2',[pack(next),round.id]);
 await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1',[round.id]);
 const result={ok:true,roundId:round.id,organizationId:clanId,removedUserId:userId,nickname:member.nickname,memberCount:roster.filter(m=>m.clanId===clanId).length-1};
 await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'ORGANIZATION_ELDER_MEMBER_KICK','USER',$2,$3,$4)",[user.id,String(userId),pack({member,survey,application:application?JSON.parse(application.value):null,faction,regular}),pack({...result,actorUserId:Number(user.id),requestId:body.requestId,removedAt:now})]);
 return result;
}
