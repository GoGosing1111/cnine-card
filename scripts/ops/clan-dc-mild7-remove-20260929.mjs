import assert from 'node:assert/strict';

// Explicit OWNER maintenance, without impersonating the DC master or changing API permissions.
export const OPERATION_KEY='ops:dc-remove-mild7-290:season6:20260929:v1';
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
export async function removeMild7FromDc(client,{dryRun=false,now=Date.now()}={}){
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='2s'");await client.query("SET LOCAL statement_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
    const [prior]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
    if(prior){await client.query('ROLLBACK');return{replayed:true,receipt:JSON.parse(prior.value)}}
    await client.query('LOCK TABLE clan_wars,clan_war_battles,clan_war_reservation_locks,clan_members,clan_season_teams,clan_seasons,clan_draft_pool IN SHARE ROW EXCLUSIVE MODE NOWAIT');
    const [season]=await q(client,'SELECT * FROM clan_seasons ORDER BY season_no DESC,id DESC LIMIT 1');assert.equal(Number(season?.id),6);assert.equal(season.phase,'ACTIVE');
    const [team]=await q(client,'SELECT * FROM clan_season_teams WHERE season_id=6 AND clan_id=8');assert.equal(Number(team?.master_user_id),3011,'DC master must remain 오일바른가지');
    const members=await q(client,'SELECT * FROM clan_members WHERE season_id=6 AND clan_id=8 ORDER BY user_id'),member=members.find(m=>Number(m.user_id)===290);
    assert.equal(member?.member_role,'MEMBER');assert.equal(member.joined_at,'2026-09-29 12:26:48');
    assert.equal((await q(client,'SELECT 1 FROM clan_season_teams WHERE season_id=6 AND master_user_id=290')).length,0);
    const [target]=await q(client,'SELECT id,nickname FROM users WHERE id=290');assert.equal(target?.nickname,'Mild7');
    const [owner]=await q(client,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
    assert.equal((await q(client,"SELECT 1 FROM clan_wars WHERE season_id=6 AND (clan_a_id=8 OR clan_b_id=8) AND status IN ('ACTIVE','CLOSING') LIMIT 1")).length,0,'Clan war is active');
    assert.equal((await q(client,"SELECT 1 FROM clan_war_battles WHERE season_id=6 AND status IN ('PENDING','RESOLVING') AND (attacker_user_id=290 OR defender_user_id=290) LIMIT 1")).length,0,'Target has an in-flight battle');
    assert.equal((await q(client,"SELECT 1 FROM clan_war_reservation_locks l JOIN clan_wars w ON w.id=l.war_id WHERE w.season_id=6 AND l.user_id=290 AND l.expires_at::timestamptz>CURRENT_TIMESTAMP LIMIT 1")).length,0,'Target has a battle reservation');
    const [pool]=await q(client,'SELECT * FROM clan_draft_pool WHERE season_id=6 AND user_id=290');assert.equal(pool?.status,'DRAFTED');assert.equal(Number(pool.drafted_clan_id),8);
    const [faction]=await q(client,'SELECT * FROM clan_faction_state WHERE season_id=6 FOR UPDATE');let nextFaction;
    if(faction){
      nextFaction=JSON.parse(faction.state_json);
      assert.ok(!(nextFaction.battles||[]).some(b=>b.status==='ACTIVE'&&(!Number.isFinite(Number(b.endsAt))||Number(b.endsAt)>now)&&[...(b.attackers||[]),...(b.defenders||[])].some(id=>Number(id)===290)),'Target is in faction combat');
      for(const [squad,ids] of Object.entries(nextFaction.formations?.[8]||{}))nextFaction.formations[8][squad]=ids.filter(id=>Number(id)!==290);
      for(const [squad,id] of Object.entries(nextFaction.captains?.[8]||{}))if(Number(id)===290)delete nextFaction.captains[8][squad];
    }
    const plan=await q(client,"SELECT value FROM app_meta WHERE key='clan_redraft_v20260916:6'"),at=new Date(now).toISOString();
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY+':before',JSON.stringify({season,team,member,pool,faction,plan})]);
    assert.equal((await client.query("DELETE FROM clan_members WHERE season_id=6 AND clan_id=8 AND user_id=290 AND member_role='MEMBER' AND joined_at=$1",[member.joined_at])).rowCount,1);
    assert.equal((await client.query("UPDATE clan_draft_pool SET status='WITHDRAWN',drafted_clan_id=NULL,pick_no=NULL,updated_at=$1 WHERE season_id=6 AND user_id=290 AND status='DRAFTED' AND drafted_clan_id=8",[at])).rowCount,1);
    if(faction)assert.equal((await client.query('UPDATE clan_faction_state SET state_json=$1,revision=revision+1,last_action=$2 WHERE season_id=6 AND revision=$3',[JSON.stringify(nextFaction),OPERATION_KEY,faction.revision])).rowCount,1);
    const after=await q(client,'SELECT * FROM clan_members WHERE season_id=6 AND clan_id=8 ORDER BY user_id');
    assert.deepEqual(after,members.filter(m=>Number(m.user_id)!==290));
    assert.deepEqual((await q(client,'SELECT * FROM clan_season_teams WHERE season_id=6 AND clan_id=8'))[0],team);
    assert.deepEqual((await q(client,'SELECT * FROM clan_seasons WHERE id=6'))[0],season);
    assert.deepEqual(await q(client,"SELECT value FROM app_meta WHERE key='clan_redraft_v20260916:6'"),plan);
    assert.equal((await q(client,'SELECT 1 FROM clan_members WHERE season_id=6 AND user_id=290')).length,0);
    const [withdrawn]=await q(client,'SELECT status,drafted_clan_id,pick_no FROM clan_draft_pool WHERE season_id=6 AND user_id=290');assert.deepEqual(withdrawn,{status:'WITHDRAWN',drafted_clan_id:null,pick_no:null});
    const receipt={status:'COMPLETED',operation:OPERATION_KEY,seasonId:6,clanId:8,removedUserId:290,nickname:'Mild7',masterUserId:3011,beforeCount:members.length,afterCount:after.length,completedAt:at,archiveKey:OPERATION_KEY+':before'};
    await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
    await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OWNER_CLAN_MEMBER_REMOVE','USER','290',$2,$3)",[owner.id,JSON.stringify({archiveKey:receipt.archiveKey}),JSON.stringify(receipt)]);
    await client.query(dryRun?'ROLLBACK':'COMMIT');return{replayed:false,dryRun,receipt};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
