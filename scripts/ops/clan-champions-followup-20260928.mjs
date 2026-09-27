import assert from 'node:assert/strict';

export const PLAN_KEY='clan_champions_followup_20260928:5';
export const OPERATION_KEY='ops:clan-champions-followup:season5:20260928:v1';
export const PLAN=Object.freeze({version:1,seasonId:5,enabled:true,draftRule:'NEXT_DAY_21_KST',registrationRule:'AFTER_CHAMPIONS_COMPLETE'});
export async function inspect(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const seasons=await q('SELECT id,season_no,phase,registration_ends_at,draft_ends_at,starts_at,ends_at FROM clan_seasons ORDER BY season_no DESC LIMIT 2');
 const cup=await q('SELECT season_id,status,semifinal_starts_at,final_starts_at,reward_status,completed_at FROM clan_championships WHERE season_id=$1',[5]);
 const wars=await q('SELECT id,round_no,status,starts_at,ends_at FROM clan_wars WHERE season_id=$1 AND round_no>=1000 ORDER BY round_no LIMIT 2',[5]);
 const meta=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[['clan_settings_v1','clan_draft_scheduler_v1',PLAN_KEY,`${PLAN_KEY}:opened`,OPERATION_KEY]]);
 return {seasons,cup,wars,meta};
}
export async function verify(client){
 const state=await inspect(client),meta=new Map(state.meta.map(row=>[row.key,row.value]));
 assert.deepEqual(JSON.parse(meta.get(PLAN_KEY)),PLAN,'Follow-up plan missing');
 const settings=JSON.parse(meta.get('clan_settings_v1'));
 assert.deepEqual([...settings.openDays].sort(),[0,2,4,6]);assert.equal(settings.warOpenTime,'21:00');assert.equal(settings.warDurationMinutes,60);
 const receipt=JSON.parse(meta.get(OPERATION_KEY));assert.equal(receipt.status,'COMPLETED');
 return{...state,receipt,verified:true};
}
export async function apply(client,reviewed,{dryRun=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query('SELECT id FROM clan_seasons WHERE id=5 FOR UPDATE');
  await client.query('SELECT season_id FROM clan_championships WHERE season_id=5 FOR UPDATE');
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.deepEqual(receipt.plan,PLAN);await verify(client);await client.query(dryRun?'ROLLBACK':'COMMIT');return{...receipt,replayed:true,dryRun}}
  await client.query("SELECT key FROM app_meta WHERE key='clan_settings_v1' FOR SHARE");
  const before=await inspect(client);
  assert.deepEqual(before.seasons,reviewed.seasons,'Season changed since review');assert.deepEqual(before.cup,reviewed.cup,'Championship changed since review');assert.deepEqual(before.wars,reviewed.wars,'Championship matches changed since review');
  assert.equal(Number(before.seasons[0]?.id),5);assert.equal(Number(before.seasons[0]?.season_no),2);assert.equal(before.seasons[0]?.phase,'CHAMPIONS');
  const settingsRow=before.meta.find(row=>row.key==='clan_settings_v1'),settings=JSON.parse(settingsRow.value);
  assert.equal(settingsRow.value,reviewed.meta.find(row=>row.key==='clan_settings_v1').value,'CMS settings changed');
  assert.deepEqual([...settings.openDays].sort(),[0,2,4,6]);assert.equal(settings.warOpenTime,'21:00');assert.equal(settings.warDurationMinutes,60);assert.equal(settings.mode,'ON');
  assert.ok(!before.meta.some(row=>row.key===PLAN_KEY||row.key===`${PLAN_KEY}:opened`),'Plan already exists');
  const [owner]=await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
  const now=new Date().toISOString();
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[PLAN_KEY,JSON.stringify(PLAN),now])).length,1);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,plan:PLAN,seasonNo:3,regularOpenDays:[0,2,4,6],regularOpenTime:'21:00',regularDurationMinutes:60,completedAt:now};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'CLAN_CHAMPIONS_FOLLOWUP','CLAN_SEASON','5',$2,$3,$4) RETURNING id",[owner.id,JSON.stringify(before),JSON.stringify(receipt),now]);assert.ok(audit);receipt.adminLogId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
  const after=await verify(client);assert.deepEqual(after.seasons,before.seasons);assert.deepEqual(after.cup,before.cup);assert.deepEqual(after.wars,before.wars);
  assert.equal(after.meta.find(row=>row.key==='clan_settings_v1').value,settingsRow.value);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return{...receipt,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
