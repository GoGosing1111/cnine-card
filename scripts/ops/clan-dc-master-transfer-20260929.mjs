import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// One user-authorized handover, never a deployment hook.
export const OPERATION_KEY='ops:dc-master-290-to-3011:season6:20260929:v1';
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
const unchanged=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));

export async function transferDcMaster(client,{dryRun=false,now=Date.now()}={}){
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
    const [prior]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
    if(prior){await client.query('ROLLBACK');return{replayed:true,receipt:JSON.parse(prior.value)}}
    const at=new Date(now).toISOString(),token=randomUUID();
    await client.query('DELETE FROM clan_draft_locks WHERE season_id=6 AND expires_at<$1',[at]);
    assert.equal((await q(client,'INSERT INTO clan_draft_locks(season_id,token,expires_at) VALUES(6,$1,$2) ON CONFLICT(season_id) DO NOTHING RETURNING token',[token,new Date(now+60000).toISOString()])).length,1,'DRAFT_BUSY');
    const [season]=await q(client,'SELECT * FROM clan_seasons WHERE id=6 FOR UPDATE');
    const [latest]=await q(client,"SELECT id FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC LIMIT 1");
    assert.equal(Number(latest?.id),6);assert.equal(Number(season.season_no),3);assert.ok(['DRAFT','ACTIVE'].includes(season.phase));
    const teams=await q(client,'SELECT * FROM clan_season_teams WHERE season_id=6 ORDER BY clan_id FOR UPDATE'),dc=teams.find(t=>Number(t.clan_id)===8);
    assert.equal(Number(dc?.master_user_id),290,'DC master changed since inspection');
    assert.ok(!teams.some(t=>Number(t.master_user_id)===3011),'Target already leads another clan');
    const members=await q(client,'SELECT * FROM clan_members WHERE season_id=6 AND clan_id=8 ORDER BY user_id FOR UPDATE');
    const old=members.find(m=>Number(m.user_id)===290),next=members.find(m=>Number(m.user_id)===3011);
    assert.equal(old?.member_role,'MASTER');assert.equal(next?.member_role,'MEMBER','Target must already belong to DC');
    assert.equal(members.filter(m=>m.member_role==='MASTER').length,1);
    const [target]=await q(client,'SELECT id,nickname,status FROM users WHERE id=3011 FOR SHARE');
    assert.equal(target?.nickname,'오일바른가지');assert.equal(target.status,'ACTIVE');
    const [owner]=await q(client,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
    const pool=await q(client,'SELECT * FROM clan_draft_pool WHERE season_id=6 AND drafted_clan_id=8 ORDER BY user_id FOR UPDATE');
    assert.equal(pool.find(p=>Number(p.user_id)===290)?.status,'MASTER');assert.equal(pool.find(p=>Number(p.user_id)===3011)?.status,'DRAFTED');
    const plan=await q(client,"SELECT value FROM app_meta WHERE key='clan_redraft_v20260916:6'");assert.equal(plan.length,1);
    assert.ok(members.length<=JSON.parse(plan[0].value).quotas[8]);
    const archive={season,teams,members,pool,plan};
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY+':before',JSON.stringify(archive)]);
    assert.equal((await client.query('UPDATE clan_season_teams SET master_user_id=3011,updated_at=$1 WHERE season_id=6 AND clan_id=8 AND master_user_id=290',[at])).rowCount,1);
    assert.equal((await client.query("UPDATE clan_members SET member_role=CASE WHEN user_id=3011 THEN 'MASTER' ELSE 'MEMBER' END,updated_at=$1 WHERE season_id=6 AND clan_id=8 AND user_id IN (290,3011)",[at])).rowCount,2);
    // Preserve original pick numbers and joining times as historical facts.
    assert.equal((await client.query("UPDATE clan_draft_pool SET status=CASE WHEN user_id=3011 THEN 'MASTER' ELSE 'DRAFTED' END,updated_at=$1 WHERE season_id=6 AND drafted_clan_id=8 AND user_id IN (290,3011)",[at])).rowCount,2);
    const afterTeams=await q(client,'SELECT * FROM clan_season_teams WHERE season_id=6 ORDER BY clan_id');
    const afterMembers=await q(client,'SELECT * FROM clan_members WHERE season_id=6 AND clan_id=8 ORDER BY user_id');
    const afterPool=await q(client,'SELECT * FROM clan_draft_pool WHERE season_id=6 AND drafted_clan_id=8 ORDER BY user_id');
    assert.deepEqual(afterTeams.filter(t=>Number(t.clan_id)!==8),teams.filter(t=>Number(t.clan_id)!==8));
    assert.deepEqual(unchanged(afterTeams.find(t=>Number(t.clan_id)===8),['master_user_id','updated_at']),unchanged(dc,['master_user_id','updated_at']));
    assert.deepEqual(afterMembers.map(m=>unchanged(m,['member_role','updated_at'])),members.map(m=>unchanged(m,['member_role','updated_at'])));
    assert.deepEqual(afterPool.map(p=>unchanged(p,['status','updated_at'])),pool.map(p=>unchanged(p,['status','updated_at'])));
    assert.equal(afterMembers.filter(m=>m.member_role==='MASTER').length,1);assert.equal(afterMembers.find(m=>m.member_role==='MASTER').user_id,next.user_id);
    assert.equal(afterPool.filter(p=>p.status==='MASTER').length,1);assert.equal(afterPool.find(p=>p.status==='MASTER').user_id,next.user_id);
    assert.deepEqual((await q(client,'SELECT * FROM clan_seasons WHERE id=6'))[0],season);
    assert.deepEqual(await q(client,"SELECT value FROM app_meta WHERE key='clan_redraft_v20260916:6'"),plan);
    const receipt={status:'COMPLETED',operation:OPERATION_KEY,seasonId:6,clanId:8,from:{userId:290,nickname:'Mild7',role:'MEMBER'},to:{userId:3011,nickname:target.nickname,role:'MASTER'},memberCount:members.length,quota:JSON.parse(plan[0].value).quotas[8],completedAt:at,archiveKey:OPERATION_KEY+':before'};
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
    await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'CLAN_MASTER_TRANSFER','CLAN_SEASON_TEAM','6:8',$2,$3)",[owner.id,JSON.stringify({archiveKey:receipt.archiveKey,masterUserId:290}),JSON.stringify(receipt)]);
    assert.equal((await client.query('DELETE FROM clan_draft_locks WHERE season_id=6 AND token=$1',[token])).rowCount,1);
    await client.query(dryRun?'ROLLBACK':'COMMIT');return{replayed:false,dryRun,receipt};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
