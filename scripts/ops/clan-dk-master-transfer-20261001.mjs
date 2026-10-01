import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Exact user-requested handover; never invoked by live routes or deployment.
export const OPERATION_KEY='ops:dk-master-360-to-521:season6:20261001:v1';
const SEASON=6,CLAN=1,FROM=360,TO=521;
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
const unchanged=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));

export async function transferDkMaster(client,{dryRun=false,now=Date.now()}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  await client.query("SET LOCAL lock_timeout='2s'");await client.query("SET LOCAL statement_timeout='8s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [prior]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){await client.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value)};}
  const at=new Date(now).toISOString(),token=randomUUID();
  await client.query('DELETE FROM clan_draft_locks WHERE season_id=$1 AND expires_at<$2',[SEASON,at]);
  assert.equal((await q(client,'INSERT INTO clan_draft_locks(season_id,token,expires_at) VALUES($1,$2,$3) ON CONFLICT(season_id) DO NOTHING RETURNING token',[SEASON,token,new Date(now+60000).toISOString()])).length,1,'DRAFT_BUSY');
  const [season]=await q(client,'SELECT * FROM clan_seasons WHERE id=$1 FOR UPDATE',[SEASON]);
  const [latest]=await q(client,"SELECT id FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC LIMIT 1");
  assert.equal(Number(latest?.id),SEASON);assert.equal(Number(season?.season_no),3);assert.equal(season.phase,'ACTIVE');
  const [organization]=await q(client,'SELECT id,name,is_active FROM clan_organizations WHERE id=$1 FOR SHARE',[CLAN]);
  assert.equal(organization?.name,'DK');assert.equal(Number(organization.is_active),1);
  const teams=await q(client,'SELECT * FROM clan_season_teams WHERE season_id=$1 ORDER BY clan_id FOR UPDATE',[SEASON]);
  const team=teams.find(t=>Number(t.clan_id)===CLAN);assert.equal(Number(team?.master_user_id),FROM,'DK master changed since inspection');
  assert.ok(!teams.some(t=>Number(t.master_user_id)===TO),'Target already leads another clan');
  const members=await q(client,'SELECT * FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id FOR UPDATE',[SEASON,CLAN]);
  const old=members.find(m=>Number(m.user_id)===FROM),next=members.find(m=>Number(m.user_id)===TO);
  assert.equal(old?.member_role,'MASTER');assert.equal(next?.member_role,'MEMBER','Target must already belong to DK');
  assert.equal(members.filter(m=>m.member_role==='MASTER').length,1);
  const identities=await q(client,'SELECT id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[[FROM,TO]]);
  assert.equal(identities.find(u=>Number(u.id)===FROM)?.nickname,'라피e');
  const target=identities.find(u=>Number(u.id)===TO);assert.equal(target?.nickname,'대저동토마토');assert.equal(target.status,'ACTIVE');
  const [owner]=await q(client,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
  const pool=await q(client,'SELECT * FROM clan_draft_pool WHERE season_id=$1 AND drafted_clan_id=$2 ORDER BY user_id FOR UPDATE',[SEASON,CLAN]);
  assert.equal(pool.find(p=>Number(p.user_id)===FROM)?.status,'MASTER');assert.equal(pool.find(p=>Number(p.user_id)===TO)?.status,'DRAFTED');
  const plan=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR SHARE',['clan_redraft_v20260916:'+SEASON]);assert.equal(plan.length,1);
  const quota=Number(JSON.parse(plan[0].value).quotas[CLAN]);assert.ok(members.length<=quota);
  const archiveKey=OPERATION_KEY+':before';
  await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[archiveKey,JSON.stringify({season,teams,members,pool,plan,identities})]);
  assert.equal((await client.query('UPDATE clan_season_teams SET master_user_id=$1,updated_at=$2 WHERE season_id=$3 AND clan_id=$4 AND master_user_id=$5',[TO,at,SEASON,CLAN,FROM])).rowCount,1);
  assert.equal((await client.query("UPDATE clan_members SET member_role=CASE WHEN user_id=$1 THEN 'MASTER' ELSE 'MEMBER' END,updated_at=$2 WHERE season_id=$3 AND clan_id=$4 AND user_id=ANY($5::bigint[])",[TO,at,SEASON,CLAN,[FROM,TO]])).rowCount,2);
  // Original picks, joining times, scores and account roles are historical data.
  assert.equal((await client.query("UPDATE clan_draft_pool SET status=CASE WHEN user_id=$1 THEN 'MASTER' ELSE 'DRAFTED' END,updated_at=$2 WHERE season_id=$3 AND drafted_clan_id=$4 AND user_id=ANY($5::bigint[])",[TO,at,SEASON,CLAN,[FROM,TO]])).rowCount,2);
  const afterTeams=await q(client,'SELECT * FROM clan_season_teams WHERE season_id=$1 ORDER BY clan_id',[SEASON]);
  const afterMembers=await q(client,'SELECT * FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id',[SEASON,CLAN]);
  const afterPool=await q(client,'SELECT * FROM clan_draft_pool WHERE season_id=$1 AND drafted_clan_id=$2 ORDER BY user_id',[SEASON,CLAN]);
  assert.deepEqual(afterTeams.filter(t=>Number(t.clan_id)!==CLAN),teams.filter(t=>Number(t.clan_id)!==CLAN));
  assert.deepEqual(unchanged(afterTeams.find(t=>Number(t.clan_id)===CLAN),['master_user_id','updated_at']),unchanged(team,['master_user_id','updated_at']));
  assert.deepEqual(afterMembers.map(m=>unchanged(m,['member_role','updated_at'])),members.map(m=>unchanged(m,['member_role','updated_at'])));
  assert.deepEqual(afterPool.map(p=>unchanged(p,['status','updated_at'])),pool.map(p=>unchanged(p,['status','updated_at'])));
  assert.deepEqual(afterMembers.filter(m=>m.member_role==='MASTER').map(m=>Number(m.user_id)),[TO]);
  assert.deepEqual(afterPool.filter(p=>p.status==='MASTER').map(p=>Number(p.user_id)),[TO]);
  assert.deepEqual(afterMembers.filter(m=>![FROM,TO].includes(Number(m.user_id))),members.filter(m=>![FROM,TO].includes(Number(m.user_id))));
  assert.deepEqual(afterPool.filter(p=>![FROM,TO].includes(Number(p.user_id))),pool.filter(p=>![FROM,TO].includes(Number(p.user_id))));
  assert.deepEqual((await q(client,'SELECT * FROM clan_seasons WHERE id=$1',[SEASON]))[0],season);
  assert.deepEqual(await q(client,'SELECT value FROM app_meta WHERE key=$1',['clan_redraft_v20260916:'+SEASON]),plan);
  const receipt={status:'COMPLETED',operation:OPERATION_KEY,seasonId:SEASON,clanId:CLAN,clanName:'DK',from:{userId:FROM,nickname:'라피e',role:'MEMBER'},to:{userId:TO,nickname:target.nickname,role:'MASTER'},memberCount:members.length,quota,completedAt:at,archiveKey};
  await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
  await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'CLAN_MASTER_TRANSFER','CLAN_SEASON_TEAM',$2,$3,$4)",[owner.id,SEASON+':'+CLAN,JSON.stringify({archiveKey,masterUserId:FROM}),JSON.stringify(receipt)]);
  assert.equal((await client.query('DELETE FROM clan_draft_locks WHERE season_id=$1 AND token=$2',[SEASON,token])).rowCount,1);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {replayed:false,dryRun,receipt};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
