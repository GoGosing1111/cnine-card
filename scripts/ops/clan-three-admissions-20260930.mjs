// One-time, explicitly authorized operations tool; never loaded by live routes.
import {clanAdminTransaction} from '../../functions/_clan_inactivity_cleanup.js';
import {handleClanMemberAssignment} from '../../functions/_clan_member_assignment.js';
import {clanRedraftKey,parseClanRedraft,clanMemberCapacity} from '../../functions/_clan_redraft.js';

export const ADMISSION_KEY='ops:clan-three-admissions:20260930:v1';
export const TARGETS=Object.freeze([
 {userId:4754,nickname:'조은',clanId:6,clanName:'롯데',codes:['LOTTE_JOEUN','LOTTE_NAMU_BONGSOON']},
 {userId:5426,nickname:'나무늘봉순',clanId:6,clanName:'롯데',codes:['LOTTE_JOEUN','LOTTE_NAMU_BONGSOON']},
 {userId:4977,nickname:'하이희야♡',clanId:5,clanName:'LG',codes:['LG_HI_HEEYA']}
]);
const BASE_GRANTS={6:'ops:lotte-joeun-bongsoon-season-grant:20260930:v1',5:'ops:avatar-lg-hi-heeya-clan-season:20260930:v1'};
const pack=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?Number(v):v);
const check=(ok,message)=>{if(!ok)throw Error(message);};
const effects=rows=>rows.map(r=>({option_order:Number(r.option_order),effect_type:r.effect_type,effect_value:Number(r.effect_value)}));

// Existing OWNER preview/apply validation runs unchanged inside the outer batch.
// Its transaction boundaries become savepoints, so a later failure also rolls
// back earlier admissions, capacity changes, receipts, grants and audit rows.
function assignmentDatabase(q){
 return {dialect:'postgres',enqueue:fn=>fn(),client:{async query(input){
  const {text,values=[]}=typeof input==='string'?{text:input}:input;
  if(text==='BEGIN')return {rows:await q('SAVEPOINT clan_admission')};
  if(text==='COMMIT')return {rows:await q('RELEASE SAVEPOINT clan_admission')};
  if(text==='ROLLBACK'){
   await q('ROLLBACK TO SAVEPOINT clan_admission');
   return {rows:await q('RELEASE SAVEPOINT clan_admission')};
  }
  return {rows:await q(text,values)};
 }}};
}

export async function admitThreeClanMembers(db,{expectedRedraft,expectedSeasonEndsAt,dryRun=false}){
 check(typeof expectedRedraft==='string'&&Number.isFinite(Date.parse(expectedSeasonEndsAt)),'Reviewed plan and season end required');
 return clanAdminTransaction(db,async q=>{
  await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',sqlite_now()) ON CONFLICT(key) DO NOTHING",[ADMISSION_KEY]);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[ADMISSION_KEY]);
  const receipt=JSON.parse(saved.value);
  if(receipt.status==='COMPLETED')return {...receipt.result,replayed:true};
  check(receipt.status==='PENDING','Unexpected operation receipt');
  await q('LOCK TABLE clan_wars,clan_war_battles,clan_war_reservation_locks,clan_members,clan_season_teams,clan_seasons,clan_draft_pool IN SHARE ROW EXCLUSIVE MODE NOWAIT');
  const [season]=await q("SELECT *,to_char(ends_at::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') expires_at,ends_at::timestamptz>CURRENT_TIMESTAMP unexpired FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC LIMIT 1");
  check(Number(season?.id)===6&&season.phase==='ACTIVE'&&season.unexpired&&Date.parse(season.ends_at)===Date.parse(expectedSeasonEndsAt),'Current season or expiry changed');
  const [owner]=await q("SELECT id,role FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");
  check(owner,'Active audit owner required');
  const ids=TARGETS.map(t=>t.userId).sort((a,b)=>a-b);
  const beforeMembers=await q('SELECT * FROM clan_members WHERE season_id=6 ORDER BY user_id');
  const beforeTeams=await q('SELECT * FROM clan_season_teams WHERE season_id=6 ORDER BY clan_id');
  check(!beforeMembers.some(m=>ids.includes(Number(m.user_id))),'An incoming account already has a clan');
  const accounts=await q('SELECT id,nickname,status,role,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
  const loadouts=await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
  const [meta]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[clanRedraftKey(6)]);
  check(meta?.value===expectedRedraft,'Reviewed capacity plan changed');
  const beforePlan=parseClanRedraft(meta.value,6),afterPlan=structuredClone(beforePlan);
  check(beforePlan,'Missing capacity plan');
  for(const [clanId,beforeCount,afterCount] of [[6,18,20],[5,17,18]]){
   check(beforeMembers.filter(m=>Number(m.clan_id)===clanId).length===beforeCount&&clanMemberCapacity(season,clanId,beforePlan)===beforeCount,'Reviewed clan count changed');
   afterPlan.activeRosterOverrides={...afterPlan.activeRosterOverrides,[clanId]:{maxMembers:afterCount,operationId:ADMISSION_KEY}};
   check(clanMemberCapacity(season,clanId,parseClanRedraft(pack(afterPlan),6))===afterCount,'Capacity validation failed');
  }
  check((await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1 RETURNING key',[clanRedraftKey(6),pack(afterPlan)])).length===1,'Capacity update failed');
  const nestedDb=assignmentDatabase(q),admissions=[];
  const call=async body=>{
   const response=await handleClanMemberAssignment({env:{DB:nestedDb},user:owner,
    request:new Request('https://ops.invalid/clan-member-assignment',{method:'POST',body:pack(body)}),
    deps:{readBody:r=>r.json(),json:(body,status=200)=>({body,status})}});
   check(response.status===200,response.body.error||'Admission failed');
   return response.body;
  };
  for(const {codes,...target} of TARGETS){
   const preview=await call({action:'preview',seasonId:6,...target});
   admissions.push(await call({action:'apply',previewId:preview.previewId,confirmation:preview.confirmation}));
  }

  const grants=[];
  for(const target of TARGETS){
   const [base]=await q('SELECT value FROM app_meta WHERE key=$1 FOR SHARE',[BASE_GRANTS[target.clanId]]);
   const original=JSON.parse(base?.value||'null');
   check(original?.status==='COMPLETED'&&original.result.seasonId===6&&original.result.clan.id===target.clanId&&original.result.expiresAt===season.expires_at,'Original clan season grant changed');
   for(const code of target.codes){
    const [catalog]=await q('SELECT code,is_active,is_public FROM avatar_catalog_v1 WHERE code=$1 FOR SHARE',[code]);
    check(Number(catalog?.is_active)===1&&Number(catalog.is_public)===1,'Clan avatar unavailable');
    const currentEffects=effects(await q('SELECT option_order,effect_type,effect_value FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order FOR SHARE',[code]));
    check(pack(currentEffects)===pack(original.result.effects),'Clan avatar options changed');
    const inserted=await q("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at) SELECT user_id,$3,'EVENT',$4,sqlite_now(),$5 FROM clan_members WHERE season_id=6 AND user_id=$1 AND clan_id=$2 RETURNING user_id,avatar_code,source_type,source_ref,acquired_at,expires_at",[target.userId,target.clanId,code,ADMISSION_KEY,season.expires_at]);
    check(inserted.length===1,'Supplemental grant row count mismatch');
    grants.push(inserted[0]);
   }
  }
  const afterMembers=await q('SELECT * FROM clan_members WHERE season_id=6 ORDER BY user_id');
  check(afterMembers.length===beforeMembers.length+3&&pack(afterMembers.filter(m=>!ids.includes(Number(m.user_id))))===pack(beforeMembers),'Existing roster changed');
  check(pack(beforeTeams)===pack(await q('SELECT * FROM clan_season_teams WHERE season_id=6 ORDER BY clan_id')),'Clan leaders or scores changed');
  check(pack(accounts)===pack(await q('SELECT id,nickname,status,role,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids])),'Accounts or wallets changed');
  check(pack(loadouts)===pack(await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids])),'Avatar loadouts changed');
  const result={ok:true,status:'COMPLETED',seasonId:6,seasonNo:Number(season.season_no),admissions,
   clans:[{id:6,name:'롯데',memberCount:20,maxMembers:20},{id:5,name:'LG',memberCount:18,maxMembers:18}],grants,expiresAt:season.expires_at};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_CLAN_ADMISSIONS_AND_SEASON_GRANTS','CLAN','6,5',$2,$3) RETURNING id",[owner.id,pack({plan:beforePlan,members:beforeMembers}),pack({operationKey:ADMISSION_KEY,actor:'SYSTEM_OPS',authorization:'조은,나무늘봉순 롯데 편입, 하이희야♡ LG 편입 / 기존 클랜 전체 시즌 아바타 지급 명단 보충',plan:afterPlan,result})]);
  check(audit,'Operation audit missing');result.adminLogId=String(audit.id);
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[ADMISSION_KEY,pack({status:'COMPLETED',beforePlan,result})]);
  if(dryRun)throw Object.assign(Error('Dry run rollback'),{dryRunResult:{...result,dryRun:true,rolledBack:true}});
  return result;
 }).catch(error=>{if(error.dryRunResult)return error.dryRunResult;throw error;});
}
