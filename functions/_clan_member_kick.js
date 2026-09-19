import {clanAdminTransaction} from './_clan_inactivity_cleanup.js';

const check=(ok,message,status=409)=>{if(!ok)throw Object.assign(new Error(message),{status});};
const pack=value=>JSON.stringify(value);

export async function kickClanMember(env,user,body){
  const {seasonId,targetUserId,joinedAt,requestId}=body||{};
  check(Number.isSafeInteger(seasonId)&&seasonId>0&&Number.isSafeInteger(targetUserId)&&targetUserId>0, '추방할 클랜원을 다시 선택하세요.',400);
  check(typeof joinedAt==='string'&&joinedAt.length>0&&joinedAt.length<60&&typeof requestId==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(requestId), '명단을 새로고침한 뒤 다시 시도하세요.',400);
  check(body.confirmation==='KICK_CLAN_MEMBER','추방 확인이 필요합니다.',400);
  check(Number(user.id)!==targetUserId,'클랜장 자신은 추방할 수 없습니다.',403);
  const key=`clan_member_kick_v1:${seasonId}:${user.id}:${requestId}`;
  return clanAdminTransaction(env.DB,async q=>{
    // The same lock scope as admin roster changes also excludes fight reservations
    // and settlement while the roster and its faction revision are updated.
    await q('LOCK TABLE clan_wars,clan_war_battles,clan_war_reservation_locks,clan_members,clan_season_teams,clan_seasons,clan_draft_pool IN SHARE ROW EXCLUSIVE MODE NOWAIT');
    const [season]=await q('SELECT id,phase FROM clan_seasons ORDER BY season_no DESC,id DESC LIMIT 1');
    check(Number(season?.id)===seasonId,'클랜 시즌이 변경되었습니다.');
    const [team]=await q(`SELECT t.clan_id FROM clan_season_teams t JOIN clan_members m ON m.season_id=t.season_id AND m.clan_id=t.clan_id
      WHERE t.season_id=$1 AND t.master_user_id=$2 AND m.user_id=$2 AND m.member_role='MASTER'`,[seasonId,user.id]);
    check(team,'자기 클랜의 클랜장만 추방할 수 있습니다.',403);
    const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[key]);
    if(prior){const saved=JSON.parse(prior.value);check(saved.targetUserId===targetUserId&&saved.joinedAt===joinedAt,'같은 요청 번호로 다른 클랜원을 추방할 수 없습니다.');return {...saved.result,replayed:true};}
    check(season.phase==='ACTIVE','정규 시즌 중에만 클랜원을 추방할 수 있습니다.');
    const [member]=await q(`SELECT m.*,u.nickname FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=$1 AND m.user_id=$2`,[seasonId,targetUserId]);
    check(member&&Number(member.clan_id)===Number(team.clan_id),'현재 같은 클랜에 소속된 클랜원만 추방할 수 있습니다.',403);
    check(member.member_role==='MEMBER'&&member.joined_at===joinedAt,'클랜원의 소속 또는 가입 정보가 바뀌었습니다. 명단을 다시 확인하세요.');
    check(!(await q('SELECT 1 FROM clan_season_teams WHERE season_id=$1 AND master_user_id=$2',[seasonId,targetUserId])).length,'클랜장은 추방할 수 없습니다.',403);
    check(!(await q("SELECT 1 FROM clan_wars WHERE season_id=$1 AND (clan_a_id=$2 OR clan_b_id=$2) AND status IN ('ACTIVE','CLOSING') LIMIT 1",[seasonId,team.clan_id])).length,'클랜전 진행·정산 중에는 추방할 수 없습니다. 경기 종료 후 다시 시도하세요.');
    check(!(await q("SELECT 1 FROM clan_war_battles WHERE season_id=$1 AND status IN ('PENDING','RESOLVING') AND (attacker_user_id=$2 OR defender_user_id=$2) LIMIT 1",[seasonId,targetUserId])).length,'대상의 전투가 끝난 뒤 다시 시도하세요.');
    check(!(await q("SELECT 1 FROM clan_war_reservation_locks l JOIN clan_wars w ON w.id=l.war_id WHERE w.season_id=$1 AND l.user_id=$2 AND l.expires_at::timestamptz>CURRENT_TIMESTAMP LIMIT 1",[seasonId,targetUserId])).length,'대상의 전투 예약이 끝난 뒤 다시 시도하세요.');
    const [faction]=await q('SELECT revision,state_json FROM clan_faction_state WHERE season_id=$1 FOR UPDATE',[seasonId]);
    let nextFaction=null;
    if(faction){
      const state=JSON.parse(faction.state_json);
      check(!(state.battles||[]).some(b=>b.status==='ACTIVE'&&[...(b.attackers||[]),...(b.defenders||[])].some(id=>Number(id)===targetUserId)),'세력전 교전 중인 클랜원은 교전 종료 후 추방할 수 있습니다.');
      nextFaction=structuredClone(state);
      for(const [squad,ids] of Object.entries(nextFaction.formations?.[team.clan_id]||{}))nextFaction.formations[team.clan_id][squad]=ids.filter(id=>Number(id)!==targetUserId);
      for(const [squad,id] of Object.entries(nextFaction.captains?.[team.clan_id]||{}))if(Number(id)===targetUserId)delete nextFaction.captains[team.clan_id][squad];
    }
    const pool=await q('SELECT * FROM clan_draft_pool WHERE season_id=$1 AND user_id=$2',[seasonId,targetUserId]);
    check(pool.every(p=>p.status==='DRAFTED'&&Number(p.drafted_clan_id)===Number(team.clan_id)),'드래프트 소속을 확인할 수 없습니다. 운영자에게 문의하세요.');
    const removed=await q("DELETE FROM clan_members WHERE season_id=$1 AND clan_id=$2 AND user_id=$3 AND member_role='MEMBER' AND joined_at=$4 RETURNING user_id",[seasonId,team.clan_id,targetUserId,joinedAt]);
    check(removed.length===1,'클랜원 상태가 변경되었습니다.');
    await q("UPDATE clan_draft_pool SET status='WITHDRAWN',drafted_clan_id=NULL,pick_no=NULL,updated_at=sqlite_now() WHERE season_id=$1 AND user_id=$2",[seasonId,targetUserId]);
    if(faction)await q('UPDATE clan_faction_state SET state_json=$1,revision=revision+1,last_action=$2 WHERE season_id=$3',[pack(nextFaction),key,seasonId]);
    const [{n}]=await q('SELECT COUNT(*) n FROM clan_members WHERE season_id=$1 AND clan_id=$2',[seasonId,team.clan_id]);
    const result={ok:true,seasonId,clanId:Number(team.clan_id),removedUserId:targetUserId,nickname:member.nickname,memberCount:Number(n)};
    await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'CLAN_MASTER_MEMBER_KICK','USER',$2,$3,$4)`,
      [user.id,String(targetUserId),pack({member,pool,faction}),pack({actorUserId:Number(user.id),...result,requestId})]);
    await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[key,pack({targetUserId,joinedAt,result})]);
    return {...result,replayed:false};
  });
}
