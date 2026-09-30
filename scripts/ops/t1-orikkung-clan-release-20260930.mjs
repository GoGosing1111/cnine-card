// One-time OWNER-authorized clan admission and avatar grant. Never imported by live routes.
import catalog from '../../preview/avatar-t1-orikkung-chaingun-v1/catalog.json' with {type:'json'};
import {clanAdminTransaction} from '../../functions/_clan_inactivity_cleanup.js';
import {handleClanMemberAssignment} from '../../functions/_clan_member_assignment.js';
import {clanRedraftKey,parseClanRedraft,clanMemberCapacity} from '../../functions/_clan_redraft.js';

export const OPERATION_KEY='ops:t1-orikkung-chaingun-three-admissions:20260930:v1';
export const T1_ORIKKUNG_CATALOG=catalog;
export const TARGETS=Object.freeze([
 {userId:4913,nickname:'오리꿍',clanId:3,clanName:'T1'},
 {userId:4718,nickname:'강구열',clanId:4,clanName:'한화'},
 {userId:5393,nickname:'주성',clanId:2,clanName:'삼성'}
]);
export const EXPECTED_EFFECTS=Object.freeze([
 {option_order:0,effect_type:'DROP_RATE_PERCENT',effect_value:30},
 {option_order:1,effect_type:'COIN_GAIN_PERCENT',effect_value:100},
 {option_order:2,effect_type:'RAID_EXTRA_ENTRY',effect_value:10},
 {option_order:3,effect_type:'BATTLE_POWER_PERCENT',effect_value:3}
]);
const pack=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?Number(v):v);
const check=(ok,message)=>{if(!ok)throw Error(message)};
const normalizedEffects=rows=>rows.map(r=>({option_order:Number(r.option_order),effect_type:r.effect_type,effect_value:Number(r.effect_value)}));

function assignmentDatabase(q){
 return {dialect:'postgres',enqueue:fn=>fn(),client:{async query(input){
  const {text,values=[]}=typeof input==='string'?{text:input}:input;
  if(text==='BEGIN')return {rows:await q('SAVEPOINT t1_orikkung_admission')};
  if(text==='COMMIT')return {rows:await q('RELEASE SAVEPOINT t1_orikkung_admission')};
  if(text==='ROLLBACK'){
   await q('ROLLBACK TO SAVEPOINT t1_orikkung_admission');
   return {rows:await q('RELEASE SAVEPOINT t1_orikkung_admission')};
  }
  return {rows:await q(text,values)};
 }}};
}

export async function releaseT1OrikkungAndAdmitThree(db,{expectedRedraft,expectedSeasonEndsAt,expectedT1RecipientIds,expectedSourceVersion,dryRun=false}){
 check(typeof expectedRedraft==='string'&&Number.isFinite(Date.parse(expectedSeasonEndsAt)),'Reviewed season and capacity plan required');
 check(Number.isSafeInteger(expectedSourceVersion)&&expectedSourceVersion>0,'Reviewed source version required');
 check(Array.isArray(expectedT1RecipientIds)&&expectedT1RecipientIds.length===17&&expectedT1RecipientIds.every(id=>Number.isSafeInteger(id)&&id>0),'Reviewed original T1 roster required');
 const originalT1Ids=[...expectedT1RecipientIds].sort((a,b)=>a-b);
 check(new Set(originalT1Ids).size===originalT1Ids.length&&!originalT1Ids.includes(4913),'Invalid original T1 roster');
 return clanAdminTransaction(db,async q=>{
  await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',sqlite_now()) ON CONFLICT(key) DO NOTHING",[OPERATION_KEY]);
  const [receiptRow]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
  const receipt=JSON.parse(receiptRow.value);
  if(receipt.status==='COMPLETED')return {...receipt.result,replayed:true};
  check(receipt.status==='PENDING','Unexpected operation receipt');
  await q('LOCK TABLE clan_wars,clan_war_battles,clan_war_reservation_locks,clan_members,clan_season_teams,clan_seasons,clan_draft_pool IN SHARE ROW EXCLUSIVE MODE NOWAIT');
  const [season]=await q("SELECT id,season_no,phase,ends_at,to_char(ends_at::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') expires_at,ends_at::timestamptz>CURRENT_TIMESTAMP unexpired FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC LIMIT 1");
  check(Number(season?.id)===6&&season.phase==='ACTIVE'&&season.unexpired&&Date.parse(season.ends_at)===Date.parse(expectedSeasonEndsAt),'Current season or expiry changed');
  const [owner]=await q("SELECT id,role FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");
  check(owner,'Active audit owner required');
  const ids=TARGETS.map(t=>t.userId).sort((a,b)=>a-b);
  const beforeMembers=await q('SELECT * FROM clan_members WHERE season_id=6 ORDER BY user_id');
  const beforeTeams=await q('SELECT * FROM clan_season_teams WHERE season_id=6 ORDER BY clan_id');
  check(!beforeMembers.some(m=>ids.includes(Number(m.user_id))),'An incoming account already has a clan');
  check(pack(beforeMembers.filter(m=>Number(m.clan_id)===3).map(m=>Number(m.user_id)).sort((a,b)=>a-b))===pack(originalT1Ids),'Original T1 roster changed');
  const accounts=await q('SELECT id,nickname,status,role,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
  check(accounts.length===3&&TARGETS.every(t=>accounts.some(a=>Number(a.id)===t.userId&&a.nickname===t.nickname&&a.status==='ACTIVE')),'Incoming account identity changed');
  const loadouts=await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
  const [meta]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[clanRedraftKey(6)]);
  check(meta?.value===expectedRedraft,'Reviewed capacity plan changed');
  const beforePlan=parseClanRedraft(meta.value,6),afterPlan=structuredClone(beforePlan);
  check(beforePlan,'Missing capacity plan');
  for(const t of TARGETS){
   const [clan]=await q('SELECT id,name,is_active FROM clan_organizations WHERE id=$1',[t.clanId]);
   check(clan?.name===t.clanName&&Number(clan.is_active)===1,'Target clan changed');
   check(beforeMembers.filter(m=>Number(m.clan_id)===t.clanId).length===17&&clanMemberCapacity(season,t.clanId,beforePlan)===17,'Reviewed clan count or capacity changed');
   afterPlan.activeRosterOverrides={...afterPlan.activeRosterOverrides,[t.clanId]:{maxMembers:18,operationId:OPERATION_KEY}};
  }
  check((await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1 RETURNING key',[clanRedraftKey(6),pack(afterPlan)])).length===1,'Capacity update failed');
  const [source]=await q("SELECT * FROM avatar_catalog_v1 WHERE code='FM_DIMWOOS' FOR SHARE");
  check(source?.name?.replace(/\s/g,'')==='한복디임2'&&Number(source.version)===expectedSourceVersion&&Number(source.is_active)===1&&Number(source.is_public)===1,'Reference avatar changed');
  const sourceEffects=normalizedEffects(await q('SELECT option_order,effect_type,effect_value FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order FOR SHARE',[source.code]));
  check(pack(sourceEffects)===pack(EXPECTED_EFFECTS)&&source.effect_type===catalog.effect_type&&Number(source.effect_value)===catalog.effect_value,'Reference effects changed');
  check(!(await q('SELECT code,serial FROM avatar_catalog_v1 WHERE code=$1 OR serial=$2 FOR UPDATE',[catalog.code,catalog.serial])).length,'Avatar code or serial already registered');
  check(!(await q('SELECT user_id FROM avatar_user_ownership_v1 WHERE avatar_code=$1 FOR UPDATE',[catalog.code])).length,'Unexpected avatar ownership');
  const nestedDb=assignmentDatabase(q),admissions=[];
  const call=async body=>{
   const response=await handleClanMemberAssignment({env:{DB:nestedDb},user:owner,
    request:new Request('https://ops.invalid/clan-member-assignment',{method:'POST',body:pack(body)}),
    deps:{readBody:r=>r.json(),json:(body,status=200)=>({body,status})}});
   check(response.status===200,response.body.error||'Clan admission failed');
   return response.body;
  };
  for(const target of TARGETS){
   const preview=await call({action:'preview',seasonId:6,...target});
   admissions.push(await call({action:'apply',previewId:preview.previewId,confirmation:preview.confirmation}));
  }
  const expectedT1Ids=[...originalT1Ids,4913].sort((a,b)=>a-b);
  const t1Members=await q('SELECT m.user_id,u.nickname,u.status FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=6 AND m.clan_id=3 ORDER BY m.user_id');
  check(pack(t1Members.map(m=>Number(m.user_id)))===pack(expectedT1Ids)&&t1Members.every(m=>m.status==='ACTIVE'),'T1 recipient roster changed');
  const fields=Object.keys(catalog);
  await q('INSERT INTO avatar_catalog_v1('+fields.join(',')+') VALUES('+fields.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(catalog));
  for(const effect of sourceEffects)await q('INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES($1,$2,$3,$4)',[catalog.code,effect.option_order,effect.effect_type,effect.effect_value]);
  const [clock]=await q('SELECT sqlite_now() acquired_at');
  const granted=await q("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at) SELECT user_id,$3,'EVENT',$4,$5,$6 FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id RETURNING user_id",[6,3,catalog.code,OPERATION_KEY,clock.acquired_at,season.expires_at]);
  check(pack(granted.map(r=>Number(r.user_id)).sort((a,b)=>a-b))===pack(expectedT1Ids),'Avatar grant row count mismatch');
  const ownership=await q('SELECT user_id,source_type,source_ref,acquired_at,expires_at FROM avatar_user_ownership_v1 WHERE avatar_code=$1 ORDER BY user_id',[catalog.code]);
  check(ownership.length===expectedT1Ids.length&&ownership.every((r,i)=>Number(r.user_id)===expectedT1Ids[i]&&r.source_type==='EVENT'&&r.source_ref===OPERATION_KEY&&r.acquired_at===clock.acquired_at&&r.expires_at===season.expires_at),'Avatar ownership verification failed');
  check(pack(normalizedEffects(await q('SELECT option_order,effect_type,effect_value FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order',[catalog.code])))===pack(sourceEffects),'Copied avatar effects mismatch');
  const afterMembers=await q('SELECT * FROM clan_members WHERE season_id=6 ORDER BY user_id');
  check(afterMembers.length===beforeMembers.length+3&&pack(afterMembers.filter(m=>!ids.includes(Number(m.user_id))))===pack(beforeMembers),'Existing clan roster changed');
  check(pack(await q('SELECT * FROM clan_season_teams WHERE season_id=6 ORDER BY clan_id'))===pack(beforeTeams),'Clan leaders or scores changed');
  check(pack(await q('SELECT id,nickname,status,role,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]))===pack(accounts),'Accounts or wallets changed');
  check(pack(await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]))===pack(loadouts),'Avatar loadouts changed');
  const result={ok:true,status:'COMPLETED',seasonId:6,seasonNo:Number(season.season_no),admissions,
   avatar:{code:catalog.code,serial:catalog.serial,name:catalog.name},effects:sourceEffects,sourceAvatar:{code:source.code,version:Number(source.version)},
   granted:ownership.length,recipientIds:expectedT1Ids,acquiredAt:clock.acquired_at,expiresAt:season.expires_at,
   clans:TARGETS.map(t=>({id:t.clanId,name:t.clanName,memberCount:18,maxMembers:18})),loadoutChanged:false,walletChanged:false};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_T1_ORIKKUNG_CLAN_RELEASE','CLAN','2,3,4',$2,$3) RETURNING id",[owner.id,pack({operationKey:OPERATION_KEY,plan:beforePlan,members:beforeMembers}),pack({operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',authorization:'T1 오리꿍 아바타 최근 클랜 옵션 동률·T1 시즌 종료까지 지급 / 오리꿍 T1·강구열 한화·주성 삼성 편입',plan:afterPlan,result})]);
  check(audit,'Operation audit missing');result.adminLogId=String(audit.id);
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[OPERATION_KEY,pack({status:'COMPLETED',result})]);
  if(dryRun)throw Object.assign(Error('Dry run rollback'),{dryRunResult:{...result,dryRun:true,rolledBack:true}});
  return result;
 }).catch(error=>{if(error.dryRunResult)return error.dryRunResult;throw error});
}
