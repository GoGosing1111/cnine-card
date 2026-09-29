// Explicitly requested season-3 reset. Never imported by a runtime or migration.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {balancedClanDraftPlan,clanRedraftKey} from '../../functions/_clan_redraft.js';

export const SEASON_ID=6;
export const OPERATION_KEY='ops:clan-balanced-redraft:season6:20260929:v1';
export const PRESERVED_MASTERS=[360,1195,4572,88,45,4570,4235];
export const ADDED_MASTER=290;
export const EMPTY_TABLES=['clan_wars','clan_war_battles','clan_championships','clan_championship_members','clan_championship_rewards','clan_reward_receipts','clan_season_settlements','clan_participation_progress','clan_participation_receipts','clan_participation_round_rules','clan_faction_receipts','clan_faction_sessions_v1','clan_faction_session_owners_v1','clan_prison_camps','clan_prison_captives'];
const q=async(client,sql,values=[])=>(await client.query(sql,values)).rows;

export async function restartBalancedClanDraft(client,{dryRun=false,now=Date.now()}={}){
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='8s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
    const [prior]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
    if(prior){await client.query('ROLLBACK');return{replayed:true,dryRun,receipt:JSON.parse(prior.value)}}
    const at=new Date(now).toISOString(),deadline=new Date(now+3600000).toISOString(),token=randomUUID();
    await client.query('DELETE FROM clan_draft_locks WHERE season_id=$1 AND expires_at<$2',[SEASON_ID,at]);
    const lease=await q(client,'INSERT INTO clan_draft_locks(season_id,token,expires_at) VALUES($1,$2,$3) ON CONFLICT(season_id) DO NOTHING RETURNING token',[SEASON_ID,token,new Date(now+120000).toISOString()]);
    assert.equal(lease.length,1,'DRAFT_BUSY: retry after the in-flight pick finishes');
    const [season]=await q(client,'SELECT * FROM clan_seasons WHERE id=$1 FOR UPDATE',[SEASON_ID]);
    const [latest]=await q(client,"SELECT id FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC LIMIT 1");
    assert.equal(Number(latest?.id),SEASON_ID);assert.equal(season?.phase,'DRAFT');assert.equal(Number(season.season_no),3);
    assert.ok(Date.parse(season.draft_ends_at)>now,'The original draft has already ended');
    const [owner]=await q(client,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Active OWNER missing');
    const [setting]=await q(client,"SELECT value FROM app_meta WHERE key='clan_settings_v1' FOR SHARE");
    const settings=JSON.parse(setting.value);assert.equal(settings.mode,'ON');assert.equal(Number(settings.draftPickSeconds),30);
    assert.deepEqual([...settings.openDays].sort(),[0,2,4,6]);assert.equal(settings.warOpenTime,'21:00');assert.equal(Number(settings.warDurationMinutes),60);
    for(const table of EMPTY_TABLES){const [row]=await q(client,`SELECT COUNT(*) n FROM ${table} WHERE season_id=$1`,[SEASON_ID]);assert.equal(Number(row.n),0,`${table} already has season activity`)}
    const faction=await q(client,'SELECT * FROM clan_faction_state WHERE season_id=$1 FOR UPDATE',[SEASON_ID]);
    // The scheduler can advance revision while marking unopened sessions SKIPPED.
    // Preserve that state verbatim; reject actual ownership, formation or combat.
    assert.ok(faction.every(row=>{
      const s=JSON.parse(row.state_json);
      return ['formations','captains','pools','squadReady','targetReady','strikeReady'].every(key=>!Object.keys(s[key]||{}).length)
        &&['battles','events','sessionQueue'].every(key=>!(s[key]||[]).length)
        &&(s.districts||[]).every(d=>!d.owner&&!d.defense&&!d.protectedUntil&&!d.taxRemainder)
        &&(s.sessionPlan||[]).every(entry=>entry.status==='SKIPPED');
    }),'Faction activity has already started');
    const teams=await q(client,'SELECT * FROM clan_season_teams WHERE season_id=$1 ORDER BY draft_position FOR UPDATE',[SEASON_ID]);
    assert.deepEqual(teams.map(row=>Number(row.master_user_id)),PRESERVED_MASTERS,'Existing masters changed');
    assert.deepEqual(teams.map(row=>Number(row.clan_id)),[1,2,3,4,5,6,7]);
    assert.deepEqual(teams.map(row=>Number(row.draft_position)),[0,1,2,3,4,5,6]);
    const [dc]=await q(client,"SELECT * FROM clan_organizations WHERE id=8 AND name='DC' AND mark_key='DC' AND is_active=1 FOR SHARE");assert.ok(dc);
    const pool=await q(client,'SELECT * FROM clan_draft_pool WHERE season_id=$1 ORDER BY user_id FOR UPDATE',[SEASON_ID]);
    const members=await q(client,'SELECT * FROM clan_members WHERE season_id=$1 ORDER BY user_id FOR UPDATE',[SEASON_ID]);
    assert.equal(pool.length,140);assert.ok(pool.every(p=>['AVAILABLE','DRAFTED','MASTER'].includes(p.status)));
    assert.deepEqual(pool.filter(p=>p.status==='MASTER').map(p=>Number(p.user_id)).sort((a,b)=>a-b),[...PRESERVED_MASTERS].sort((a,b)=>a-b));
    for(const member of members){const p=pool.find(p=>Number(p.user_id)===Number(member.user_id));assert.ok(p&&Number(p.drafted_clan_id)===Number(member.clan_id));assert.equal(member.member_role,PRESERVED_MASTERS.includes(Number(member.user_id))?'MASTER':'MEMBER');assert.equal(Number(member.contribution_score),0);assert.equal(Number(member.battle_wins),0);assert.equal(Number(member.battle_losses),0)}
    assert.equal(members.length,pool.filter(p=>p.status!=='AVAILABLE').length);
    assert.equal(members.filter(m=>m.member_role==='MASTER').length,7);
    const next=[...pool].filter(p=>!PRESERVED_MASTERS.includes(Number(p.user_id))).sort((a,b)=>Number(b.master_score)-Number(a.master_score)||Number(a.user_id)-Number(b.user_id))[0];
    assert.equal(Number(next.user_id),ADDED_MASTER,'The next master no longer matches the reviewed candidate');
    const oldPlan=await q(client,'SELECT value FROM app_meta WHERE key=$1',[clanRedraftKey(SEASON_ID)]);assert.equal(oldPlan.length,0,'An allocation plan already exists');
    const plan=balancedClanDraftPlan({seasonId:SEASON_ID,participantCount:pool.length,clanIds:[1,2,3,4,5,6,7,8],startsAt:at});
    plan.operationId=OPERATION_KEY;
    const archive={season,teams,members,pool,faction,settings:setting.value,oldPlan};
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY+':before',JSON.stringify(archive)]);
    const removed=await client.query("DELETE FROM clan_members WHERE season_id=$1 AND member_role='MEMBER'",[SEASON_ID]);
    assert.equal(removed.rowCount,members.length-7);
    await client.query('INSERT INTO clan_season_teams(season_id,clan_id,master_user_id,draft_position) VALUES($1,8,$2,7)',[SEASON_ID,ADDED_MASTER]);
    await client.query("INSERT INTO clan_members(season_id,clan_id,user_id,member_role,preferred_role,draft_pick_no) VALUES($1,8,$2,'MASTER',$3,0)",[SEASON_ID,ADDED_MASTER,next.preferred_role]);
    const refreshed=await client.query(`UPDATE clan_draft_pool p SET candidate_key=k.candidate_key,
      status=CASE WHEN t.master_user_id IS NULL THEN 'AVAILABLE' ELSE 'MASTER' END,
      drafted_clan_id=t.clan_id,pick_no=CASE WHEN t.master_user_id IS NULL THEN NULL ELSE 0 END,updated_at=$4
      FROM unnest($2::bigint[],$3::text[]) k(user_id,candidate_key)
      LEFT JOIN clan_season_teams t ON t.season_id=$1 AND t.master_user_id=k.user_id
      WHERE p.season_id=$1 AND p.user_id=k.user_id`,[SEASON_ID,pool.map(p=>p.user_id),pool.map(()=>randomUUID()),at]);
    assert.equal(refreshed.rowCount,140);
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[clanRedraftKey(SEASON_ID),JSON.stringify(plan),at]);
    const reset=await client.query("UPDATE clan_seasons SET phase='DRAFT',draft_pick_count=0,registration_ends_at=$2,draft_ends_at=$3,next_pick_deadline=$4,updated_at=$2 WHERE id=$1 AND phase='DRAFT'",[SEASON_ID,at,deadline,new Date(now+30000).toISOString()]);
    assert.equal(reset.rowCount,1);
    const afterTeams=await q(client,'SELECT * FROM clan_season_teams WHERE season_id=$1 ORDER BY draft_position',[SEASON_ID]);
    assert.deepEqual(afterTeams.slice(0,7),teams);
    const afterMembers=await q(client,'SELECT * FROM clan_members WHERE season_id=$1 ORDER BY user_id',[SEASON_ID]);
    assert.equal(afterMembers.length,8);assert.ok(afterMembers.every(m=>m.member_role==='MASTER'));
    assert.deepEqual(afterMembers.filter(m=>Number(m.user_id)!==ADDED_MASTER),members.filter(m=>m.member_role==='MASTER'));
    const afterPool=await q(client,'SELECT * FROM clan_draft_pool WHERE season_id=$1 ORDER BY user_id',[SEASON_ID]);
    assert.equal(afterPool.filter(p=>p.status==='AVAILABLE').length,132);assert.equal(afterPool.filter(p=>p.status==='MASTER').length,8);
    const oldKeys=new Set(pool.map(p=>p.candidate_key));assert.ok(afterPool.every(p=>!oldKeys.has(p.candidate_key)));
    const stable=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['candidate_key','status','drafted_clan_id','pick_no','updated_at'].includes(k)));
    assert.deepEqual(afterPool.map(stable),pool.map(stable));
    assert.deepEqual(await q(client,'SELECT * FROM clan_faction_state WHERE season_id=$1',[SEASON_ID]),faction);
    const receipt={status:'COMPLETED',operation:OPERATION_KEY,seasonId:SEASON_ID,participantCount:140,preservedMasterIds:PRESERVED_MASTERS,addedMaster:{clanId:8,userId:ADDED_MASTER,nickname:'Mild7'},invalidatedPicks:removed.rowCount,quotas:plan.quotas,startsAt:at,endsAt:deadline,turnSeconds:30,archiveKey:OPERATION_KEY+':before'};
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
    await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'CLAN_BALANCED_REDRAFT','CLAN_SEASON',$2,$3,$4)",[owner.id,String(SEASON_ID),JSON.stringify({archiveKey:receipt.archiveKey,oldPickCount:season.draft_pick_count}),JSON.stringify(receipt)]);
    assert.equal((await client.query('DELETE FROM clan_draft_locks WHERE season_id=$1 AND token=$2',[SEASON_ID,token])).rowCount,1);
    await client.query(dryRun?'ROLLBACK':'COMMIT');
    return{replayed:false,dryRun,receipt};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
