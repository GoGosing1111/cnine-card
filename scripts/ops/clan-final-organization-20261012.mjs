import assert from 'node:assert/strict';
import {CLAN_RETIREMENT_KEY,ORGANIZATION_REFORM_KEY} from '../../functions/_clan_retirement.js';
import {ORGANIZATION_PREPARATION} from '../../shared/organization-preparation-v1.mjs';

export const OPERATION_KEY='ops:clan-final-organization:season6:20261012:v1';
export const PLAN=Object.freeze({version:1,enabled:true,seasonId:6,transition:'FRESH_ORGANIZATIONS_PREPARATION'});
export const SCHEDULE=Object.freeze({semifinalStartsAt:'2026-10-12T12:00:00.000Z',semifinalEndsAt:'2026-10-12T14:00:00.000Z',finalStartsAt:'2026-10-12T14:00:00.000Z',finalEndsAt:'2026-10-12T16:00:00.000Z'});
const strip=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));
export async function inspect(client){
  const q=async(s,a=[])=>(await client.query(s,a)).rows;
  const [season]=await q('SELECT * FROM clan_seasons ORDER BY season_no DESC,id DESC LIMIT 1');
  const [cup]=await q('SELECT * FROM clan_championships WHERE season_id=$1',[6]);
  const wars=await q('SELECT * FROM clan_wars WHERE season_id=$1 ORDER BY round_no,id',[6]);
  const members=await q('SELECT * FROM clan_championship_members WHERE season_id=$1 ORDER BY clan_id,user_id',[6]);
  const teams=await q('SELECT * FROM clan_season_teams WHERE season_id=$1 ORDER BY clan_id',[6]);
  const rewards=await q('SELECT * FROM clan_championship_rewards WHERE season_id=$1 ORDER BY user_id,reward_type',[6]);
  const battles=await q('SELECT war_id,status,COUNT(*)::int count FROM clan_war_battles WHERE season_id=$1 GROUP BY war_id,status ORDER BY war_id,status',[6]);
  const meta=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[OPERATION_KEY,CLAN_RETIREMENT_KEY,ORGANIZATION_REFORM_KEY,'clan_settings_v1','clan_champions_followup_20260928:6']]);
  return {season,cup,wars,members,teams,rewards,battles,meta};
}
export function verify(state){
  const meta=new Map(state.meta.map(r=>[r.key,r.value]));
  assert.deepEqual(JSON.parse(meta.get(CLAN_RETIREMENT_KEY)),PLAN);
  assert.deepEqual(JSON.parse(meta.get(ORGANIZATION_REFORM_KEY)),ORGANIZATION_PREPARATION);
  assert.equal(state.cup.semifinal_starts_at,SCHEDULE.semifinalStartsAt);
  assert.equal(state.cup.final_starts_at,SCHEDULE.finalStartsAt);
  assert.equal(state.season.ends_at,SCHEDULE.finalEndsAt);
  const semi=state.wars.find(w=>Number(w.id)===318);assert.equal(semi.starts_at,SCHEDULE.semifinalStartsAt);assert.equal(semi.ends_at,SCHEDULE.semifinalEndsAt);
  assert.equal(JSON.parse(state.cup.settings_json).warDurationMinutes,120);
  return true;
}
export async function apply(client,reviewed,{dryRun=false}={}){
  const q=async(s,a=[])=>(await client.query(s,a)).rows;
  await client.query('BEGIN');
  try{
    await q('SELECT id FROM clan_seasons WHERE id=6 FOR UPDATE');
    await q('SELECT season_id FROM clan_championships WHERE season_id=6 FOR UPDATE');
    await q('SELECT id FROM clan_wars WHERE season_id=6 AND round_no>=1000 ORDER BY id FOR UPDATE');
    await q("SELECT key FROM app_meta WHERE key='clan_settings_v1' FOR SHARE");
    const before=await inspect(client),saved=before.meta.find(r=>r.key===OPERATION_KEY);
    if(saved){verify(before);await client.query(dryRun?'ROLLBACK':'COMMIT');return {...JSON.parse(saved.value),replayed:true,dryRun};}
    assert.deepEqual(before,reviewed,'Reviewed season data changed');
    assert.equal(Number(before.season.id),6);assert.equal(Number(before.season.season_no),3);assert.equal(before.season.phase,'CHAMPIONS');assert.equal(before.cup.status,'SEMIFINAL');
    const semi=before.wars.find(w=>Number(w.id)===318);assert.ok(semi);assert.equal(semi.status,'SCHEDULED');assert.equal(Number(semi.round_no),1001);
    assert.equal(before.wars.filter(w=>Number(w.round_no)>=1000).length,1);
    assert.equal(Number(semi.score_a)+Number(semi.score_b)+Number(semi.battle_count),0);assert.ok(!before.battles.some(b=>Number(b.war_id)===318));
    assert.deepEqual(JSON.parse(before.cup.seeds_json).map(s=>s.clanId),[3,2,5]);assert.equal(before.members.length,50);assert.equal(before.rewards.length,0);
    assert.equal(JSON.parse(before.cup.settings_json).warDurationMinutes,120);
    assert.equal(JSON.parse(before.meta.find(r=>r.key==='clan_settings_v1').value).mode,'ON');
    assert.ok(!before.meta.some(r=>r.key!== 'clan_settings_v1'),'Unexpected existing transition plan');
    assert.ok(Date.now()<Date.parse(SCHEDULE.semifinalStartsAt),'Kickoff must still be in the future');
    const [owner]=await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
    const at=new Date().toISOString();
    assert.equal((await q('UPDATE clan_championships SET semifinal_starts_at=$1,final_starts_at=$2 WHERE season_id=6 RETURNING season_id',[SCHEDULE.semifinalStartsAt,SCHEDULE.finalStartsAt])).length,1);
    assert.equal((await q('UPDATE clan_wars SET starts_at=$1,ends_at=$2,updated_at=$3 WHERE id=318 RETURNING id',[SCHEDULE.semifinalStartsAt,SCHEDULE.semifinalEndsAt,at])).length,1);
    assert.equal((await q('UPDATE clan_seasons SET ends_at=$1,updated_at=$2 WHERE id=6 RETURNING id',[SCHEDULE.finalEndsAt,at])).length,1);
    for(const [key,value] of [[CLAN_RETIREMENT_KEY,PLAN],[ORGANIZATION_REFORM_KEY,ORGANIZATION_PREPARATION]])await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[key,JSON.stringify(value),at]);
    const after=await inspect(client);verify(after);
    assert.deepEqual(strip(after.season,['ends_at','updated_at']),strip(before.season,['ends_at','updated_at']));
    assert.deepEqual(strip(after.cup,['semifinal_starts_at','final_starts_at']),strip(before.cup,['semifinal_starts_at','final_starts_at']));
    assert.deepEqual(after.wars.map(w=>Number(w.id)===318?strip(w,['starts_at','ends_at','updated_at']):w),before.wars.map(w=>Number(w.id)===318?strip(w,['starts_at','ends_at','updated_at']):w));
    for(const key of ['members','teams','rewards','battles'])assert.deepEqual(after[key],before[key]);
    assert.equal(after.meta.find(r=>r.key==='clan_settings_v1').value,before.meta.find(r=>r.key==='clan_settings_v1').value);
    const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,seasonId:6,seasonNo:3,semifinalWarId:318,...SCHEDULE,warDurationMinutes:120,plan:PLAN,registrationOpen:false,memberCount:50,completedAt:at};
    const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'CLAN_FINAL_ORGANIZATION','CLAN_SEASON','6',$2,$3) RETURNING id",[owner.id,JSON.stringify(before),JSON.stringify(receipt)]);receipt.adminLogId=String(audit.id);
    await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY+':before',JSON.stringify(before),at]);
    await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),at]);
    await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,dryRun,replayed:false};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
