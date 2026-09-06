import {clanAdminTransaction} from './_clan_inactivity_cleanup.js';

// Explicit OWNER admission for an unaffiliated account only. This is not a
// transfer, capacity override, season reset or automatic registration job.
const PREFIX = 'clan_member_assignment_v2049:';
const CONFIRMATION = 'ASSIGN_UNAFFILIATED_CLAN_MEMBER';
const check = (ok, message, status = 409) => { if (!ok) throw Object.assign(new Error(message), {status}); };
const pack = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? Number(v) : v);
const parse = value => { try { return JSON.parse(value || '[]'); } catch { return []; } };

async function assignmentState(q, target) {
  const [season] = await q("SELECT id,season_no,phase,max_members FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC LIMIT 1");
  check(season && Number(season.id) === target.seasonId && season.phase === 'ACTIVE', '진행 중인 클랜 시즌이 변경되었거나 편입할 수 없는 단계입니다.');
  const [clan] = await q(`SELECT o.id,o.name,t.master_user_id FROM clan_organizations o
    JOIN clan_season_teams t ON t.clan_id=o.id AND t.season_id=$1 WHERE o.id=$2 AND o.is_active=1`, [season.id,target.clanId]);
  check(clan && clan.name === target.clanName, '대상 클랜 ID와 이름이 일치하지 않습니다.');
  const [account] = await q('SELECT id,nickname,status,role FROM users WHERE id=$1', [target.userId]);
  check(account && account.nickname === target.nickname, '계정 ID와 닉네임이 일치하지 않습니다.');
  check(String(account.status).toUpperCase() === 'ACTIVE', '활성 계정만 클랜에 편입할 수 있습니다.');
  const [verified] = await q("SELECT user_id FROM user_second_verifications WHERE user_id=$1 AND provider='PLAYDK'", [target.userId]);
  check(verified || String(account.role).toUpperCase() === 'OWNER', 'PLAY DK 2차 인증이 필요한 계정입니다.');
  const [membership] = await q('SELECT * FROM clan_members WHERE season_id=$1 AND user_id=$2', [season.id,target.userId]);
  check(!membership, '이미 클랜에 소속된 계정입니다. 이 편입 기능은 기존 소속을 변경하지 않습니다.');
  const [master] = await q('SELECT clan_id FROM clan_season_teams WHERE season_id=$1 AND master_user_id=$2', [season.id,target.userId]);
  check(!master, '클랜 마스터 계정은 일반 편입으로 변경할 수 없습니다.');
  const [count] = await q('SELECT COUNT(*) n FROM clan_members WHERE season_id=$1 AND clan_id=$2', [season.id,target.clanId]);
  const memberCount = Number(count.n), maxMembers = Math.min(22, Number(season.max_members) || 22);
  check(memberCount < maxMembers, `클랜 정원 ${maxMembers}명이 가득 찼습니다.`);
  const [pending] = await q(`SELECT 1 AS found FROM clan_war_battles WHERE season_id=$1
    AND (attacker_user_id=$2 OR defender_user_id=$2) AND status IN ('PENDING','RESOLVING') LIMIT 1`, [season.id,target.userId]);
  check(!pending, '계정의 진행 중인 클랜전이 끝난 뒤 다시 확인하세요.');
  let [deck] = await q(`SELECT p.card_ids FROM pvp_active_presets a JOIN pvp_deck_presets p
    ON p.user_id=a.user_id AND p.preset_no=a.preset_no WHERE a.user_id=$1`, [target.userId]);
  if (!deck) [deck] = await q('SELECT card_ids FROM pvp_decks WHERE user_id=$1', [target.userId]);
  const cards = parse(deck?.card_ids);
  check(Array.isArray(cards) && cards.length === 5 && new Set(cards.map(String)).size === 5, '클랜전에 사용할 랭크전 덱 5장을 먼저 저장해야 합니다.');
  const [draftPool] = await q('SELECT * FROM clan_draft_pool WHERE season_id=$1 AND user_id=$2', [season.id,target.userId]);
  check(!draftPool || draftPool.status !== 'MASTER', '마스터 드래프트 기록을 먼저 확인해야 합니다.');
  return {target,seasonNo:Number(season.season_no),memberCount,maxMembers,deck:cards.map(String),draftPool:draftPool || null};
}

export async function handleClanMemberAssignment({request,env,user,deps,now=Date.now()}) {
  if (String(user?.role || '').toUpperCase() !== 'OWNER') return deps.json({error:'OWNER만 클랜 편입을 실행할 수 있습니다.'},403);
  if (request.method !== 'POST') return deps.json({error:'POST 요청이 필요합니다.'},405);
  try {
    const body = await deps.readBody(request);
    check(['preview','apply'].includes(body.action), '확인 또는 적용 작업을 지정하세요.',400);
    if (body.action === 'preview') {
      const target = {userId:body.userId,nickname:body.nickname,clanId:body.clanId,clanName:body.clanName,seasonId:body.seasonId};
      check(['userId','clanId','seasonId'].every(k => Number.isSafeInteger(target[k]) && target[k] > 0)
        && ['nickname','clanName'].every(k => typeof target[k] === 'string' && target[k].length > 0 && target[k].length <= 80), '정확한 계정·클랜·시즌 식별자가 필요합니다.',400);
      return deps.json(await clanAdminTransaction(env.DB, async q => {
        const state = await assignmentState(q,target), previewId = crypto.randomUUID();
        const record = {status:'PREVIEW',ownerId:Number(user.id),createdAt:now,target};
        await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)', [PREFIX+previewId,pack(record),new Date(now).toISOString()]);
        return {ok:true,previewId,...target,seasonNo:state.seasonNo,memberCount:state.memberCount,maxMembers:state.maxMembers,
          currentMembership:null,verified:true,rankedDeckReady:true};
      }));
    }
    check(body.confirmation === CONFIRMATION && /^[0-9a-f-]{36}$/.test(String(body.previewId || '')), '편입 확인값과 확인 ID가 필요합니다.',400);
    return deps.json(await clanAdminTransaction(env.DB, async q => {
      const key = PREFIX+body.previewId, [saved] = await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key]);
      check(saved,'확인된 편입 요청을 찾을 수 없습니다.');
      const record = JSON.parse(saved.value);
      check(record.ownerId === Number(user.id),'다른 관리자가 확인한 요청입니다.',403);
      if (record.status === 'COMPLETED') return {...record.result,replayed:true};
      check(record.status === 'PREVIEW' && now >= record.createdAt && now-record.createdAt <= 15*60000,'편입 확인 요청이 만료되었습니다.');
      // Lock the authoritative roster/lifecycle against concurrent admissions,
      // cleanup and battle reservations; never overbook the last available slot.
      await q('LOCK TABLE clan_wars,clan_war_battles,clan_war_reservation_locks,clan_members,clan_season_teams,clan_seasons,clan_draft_pool IN SHARE ROW EXCLUSIVE MODE NOWAIT');
      await q('SELECT id FROM users WHERE id=$1 FOR UPDATE',[record.target.userId]);
      await q('SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[record.target.userId]);
      const state = await assignmentState(q,record.target), target = state.target, at = new Date(now).toISOString();
      const preferredRole = ['ATTACK','DEFENSE','SPEED','HP','BALANCED'].includes(state.draftPool?.preferred_role) ? state.draftPool.preferred_role : 'BALANCED';
      const inserted = await q(`INSERT INTO clan_members(season_id,clan_id,user_id,member_role,preferred_role,draft_pick_no,joined_at,updated_at)
        VALUES($1,$2,$3,'MEMBER',$4,0,$5,$5) RETURNING *`, [target.seasonId,target.clanId,target.userId,preferredRole,at]);
      check(inserted.length === 1,'클랜 편입 인원 검증에 실패했습니다.');
      const pool = await q(`INSERT INTO clan_draft_pool(season_id,user_id,candidate_key,preferred_role,activity_window,deck_snapshot,status,drafted_clan_id,pick_no,registered_at,updated_at)
        VALUES($1,$2,$3,$4,'FLEX',$5,'DRAFTED',$6,0,$7,$7)
        ON CONFLICT(season_id,user_id) DO UPDATE SET status='DRAFTED',drafted_clan_id=EXCLUDED.drafted_clan_id,
          pick_no=0,deck_snapshot=EXCLUDED.deck_snapshot,updated_at=EXCLUDED.updated_at RETURNING *`,
        [target.seasonId,target.userId,crypto.randomUUID(),preferredRole,pack(state.deck),target.clanId,at]);
      check(pool.length === 1 && Number(pool[0].drafted_clan_id) === target.clanId,'드래프트 소속 검증에 실패했습니다.');
      const [after] = await q('SELECT COUNT(*) n FROM clan_members WHERE season_id=$1 AND clan_id=$2',[target.seasonId,target.clanId]);
      check(Number(after.n) === state.memberCount+1 && Number(after.n) <= state.maxMembers,'클랜 정원 재검증에 실패했습니다.');
      const result = {ok:true,previewId:body.previewId,...target,memberRole:'MEMBER',beforeCount:state.memberCount,
        memberCount:Number(after.n),maxMembers:state.maxMembers,completedAt:at,recoveryKey:key};
      const before = {membership:null,draftPool:state.draftPool}, afterState = {membership:inserted[0],draftPool:pool[0]};
      await q('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1',[key,pack({...record,status:'COMPLETED',before,after:afterState,result}),at]);
      await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
        VALUES($1,'CLAN_MEMBER_ASSIGNMENT','USER',$2,$3,$4)`,[user.id,String(target.userId),pack(before),pack({...afterState,result})]);
      return result;
    }));
  } catch (error) {
    console.warn('[CLAN_MEMBER_ASSIGNMENT]',pack({code:error.code || 'VALIDATION',status:error.status || 409}));
    return deps.json({error:error.status ? error.message : '클랜 편입 검증에 실패했습니다. 변경은 취소되었습니다.',code:error.code || 'CLAN_MEMBER_ASSIGNMENT_FAILED'},error.status || 409);
  }
}
