// Explicitly authorized one-time operation. Never imported by live routes.
import {clanAdminTransaction} from '../../functions/_clan_inactivity_cleanup.js';
import {handleClanMemberAssignment} from '../../functions/_clan_member_assignment.js';
import {clanRedraftKey,parseClanRedraft,clanMemberCapacity} from '../../functions/_clan_redraft.js';

export const OPERATION_KEY='ops:hanwha-diim-admission:20261001:v1';
export const TARGET=Object.freeze({userId:4773,nickname:'진짜디임',clanId:4,clanName:'한화',seasonId:6});
const pack=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?Number(v):v);
const check=(ok,message)=>{if(!ok)throw Error(message);};

// Keep the existing admission validation, receipts and audit in one outer transaction.
function admissionDatabase(q){
 return {dialect:'postgres',enqueue:fn=>fn(),client:{async query(input){
  const {text,values=[]}=typeof input==='string'?{text:input}:input;
  if(text==='BEGIN')return {rows:await q('SAVEPOINT hanwha_admission')};
  if(text==='COMMIT')return {rows:await q('RELEASE SAVEPOINT hanwha_admission')};
  if(text==='ROLLBACK'){
   await q('ROLLBACK TO SAVEPOINT hanwha_admission');
   return {rows:await q('RELEASE SAVEPOINT hanwha_admission')};
  }
  return {rows:await q(text,values)};
 }}};
}

export async function admitHanwhaDiim(db,{expectedRedraft,expectedSeasonEndsAt,dryRun=false}){
 check(typeof expectedRedraft==='string'&&Number.isFinite(Date.parse(expectedSeasonEndsAt)),'Reviewed plan and season end required');
 return clanAdminTransaction(db,async q=>{
  await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',sqlite_now()) ON CONFLICT(key) DO NOTHING",[OPERATION_KEY]);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
  const receipt=JSON.parse(saved.value);
  if(receipt.status==='COMPLETED')return {...receipt.result,replayed:true};
  check(receipt.status==='PENDING','Unexpected operation receipt');
  await q('LOCK TABLE clan_wars,clan_war_battles,clan_war_reservation_locks,clan_members,clan_season_teams,clan_seasons,clan_draft_pool IN SHARE ROW EXCLUSIVE MODE NOWAIT');
  const [season]=await q("SELECT *,ends_at::timestamptz>CURRENT_TIMESTAMP unexpired FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC LIMIT 1");
  check(Number(season?.id)===TARGET.seasonId&&Number(season.season_no)===3&&season.phase==='ACTIVE'&&season.unexpired&&Date.parse(season.ends_at)===Date.parse(expectedSeasonEndsAt),'Current season or expiry changed');
  const [owner]=await q("SELECT id,role FROM users WHERE id=1 AND nickname='핑크빛유두' AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' FOR SHARE");
  check(owner,'Expected active audit owner required');
  const beforeMembers=await q('SELECT * FROM clan_members WHERE season_id=$1 ORDER BY user_id',[TARGET.seasonId]);
  const beforeTeams=await q('SELECT * FROM clan_season_teams WHERE season_id=$1 ORDER BY clan_id',[TARGET.seasonId]);
  check(!beforeMembers.some(m=>Number(m.user_id)===TARGET.userId),'Incoming account already has a clan');
  const [meta]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[clanRedraftKey(TARGET.seasonId)]);
  check(meta?.value===expectedRedraft,'Reviewed capacity plan changed');
  const beforePlan=parseClanRedraft(meta.value,TARGET.seasonId),afterPlan=structuredClone(beforePlan);
  const beforeCount=beforeMembers.filter(m=>Number(m.clan_id)===TARGET.clanId).length;
  check(beforeCount===18&&clanMemberCapacity(season,TARGET.clanId,beforePlan)===18,'Reviewed Hanwha count or capacity changed');
  afterPlan.activeRosterOverrides={...afterPlan.activeRosterOverrides,[TARGET.clanId]:{maxMembers:19,operationId:OPERATION_KEY}};
  check(clanMemberCapacity(season,TARGET.clanId,parseClanRedraft(pack(afterPlan),TARGET.seasonId))===19,'Capacity validation failed');
  check((await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1 RETURNING key',[clanRedraftKey(TARGET.seasonId),pack(afterPlan)])).length===1,'Capacity update failed');
  const nestedDb=admissionDatabase(q);
  const call=async body=>{
   const response=await handleClanMemberAssignment({env:{DB:nestedDb},user:owner,
    request:new Request('https://ops.invalid/clan-member-assignment',{method:'POST',body:pack(body)}),
    deps:{readBody:r=>r.json(),json:(body,status=200)=>({body,status})}});
   check(response.status===200,response.body.error||'Admission failed');
   return response.body;
  };
  const preview=await call({action:'preview',...TARGET});
  const admission=await call({action:'apply',previewId:preview.previewId,confirmation:preview.confirmation});
  const afterMembers=await q('SELECT * FROM clan_members WHERE season_id=$1 ORDER BY user_id',[TARGET.seasonId]);
  check(afterMembers.length===beforeMembers.length+1&&pack(afterMembers.filter(m=>Number(m.user_id)!==TARGET.userId))===pack(beforeMembers),'Existing roster changed');
  check(pack(beforeTeams)===pack(await q('SELECT * FROM clan_season_teams WHERE season_id=$1 ORDER BY clan_id',[TARGET.seasonId])),'Clan leaders or scores changed');
  check(admission.memberCount===19&&admission.maxMembers===19&&admission.removedCount===0&&!admission.gift,'Unexpected admission result');
  const result={ok:true,status:'COMPLETED',operationKey:OPERATION_KEY,seasonId:TARGET.seasonId,seasonNo:3,capacity:{before:18,after:19},admission};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_CLAN_CAPACITY_AND_ADMISSION','CLAN','4',$2,$3) RETURNING id",[owner.id,pack({plan:beforePlan,memberCount:beforeCount}),pack({actor:'SYSTEM_OPS',authorization:['진짜디임 한화로 편입','정원늘려서 편입시켜'],plan:afterPlan,result})]);
  check(audit,'Operation audit missing');result.adminLogId=String(audit.id);
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[OPERATION_KEY,pack({status:'COMPLETED',beforePlan,result})]);
  if(dryRun)throw Object.assign(Error('Dry run rollback'),{dryRunResult:{...result,dryRun:true,rolledBack:true}});
  return result;
 }).catch(error=>{if(error.dryRunResult)return error.dryRunResult;throw error;});
}
