// User-authorized single operation. Never imported by live request routes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import catalog from '../../preview/avatar-lg-ayoon-v1/catalog.json' with {type:'json'};
import {clanAdminTransaction} from '../../functions/_clan_inactivity_cleanup.js';
import {handleClanMemberAssignment} from '../../functions/_clan_member_assignment.js';
import {clanRedraftKey,parseClanRedraft,clanMemberCapacity} from '../../functions/_clan_redraft.js';

export const LG_AVATAR=catalog;
export const OPERATION_KEY='ops:avatar-lg-ayoon-clan-season:20261003:v1';
export const TARGET=Object.freeze({userId:5209,nickname:'김아윤',clanId:5,clanName:'LG',seasonId:6});
export const EXPECTED_EFFECTS=Object.freeze([
 {option_order:0,effect_type:'DROP_RATE_PERCENT',effect_value:30},
 {option_order:1,effect_type:'COIN_GAIN_PERCENT',effect_value:100},
 {option_order:2,effect_type:'RAID_EXTRA_ENTRY',effect_value:10},
 {option_order:3,effect_type:'BATTLE_POWER_PERCENT',effect_value:3}
]);
const pack=JSON.stringify;
const effects=rows=>rows.map(r=>({option_order:Number(r.option_order),effect_type:r.effect_type,effect_value:Number(r.effect_value)}));
const normalizedIds=ids=>ids.map(Number).sort((a,b)=>a-b);

function nestedAdmissionDatabase(q){
 return {dialect:'postgres',enqueue:fn=>fn(),client:{async query(input){
  const {text,values=[]}=typeof input==='string'?{text:input}:input;
  if(text==='BEGIN')return {rows:await q('SAVEPOINT lg_ayoon_admission')};
  if(text==='COMMIT')return {rows:await q('RELEASE SAVEPOINT lg_ayoon_admission')};
  if(text==='ROLLBACK'){await q('ROLLBACK TO SAVEPOINT lg_ayoon_admission');return {rows:await q('RELEASE SAVEPOINT lg_ayoon_admission')};}
  return {rows:await q(text,values)};
 }}};
}

export async function releaseLgAyoon(db,{expectedSeasonId,expectedClanId,expectedBeforeRecipientIds,expectedSeasonEndsAt,expectedSourceVersion,expectedCapacity,dryRun=false}){
 assert.equal(expectedSeasonId,TARGET.seasonId);assert.equal(expectedClanId,TARGET.clanId);
 assert.ok(Number.isFinite(Date.parse(expectedSeasonEndsAt)));assert.ok(Number.isSafeInteger(expectedSourceVersion)&&expectedSourceVersion>0);
 assert.ok(Number.isSafeInteger(expectedCapacity)&&expectedCapacity>0&&expectedCapacity<=22);
 assert.ok(Array.isArray(expectedBeforeRecipientIds)&&expectedBeforeRecipientIds.length>0&&expectedBeforeRecipientIds.every(id=>Number.isSafeInteger(id)&&id>0));
 const beforeIds=normalizedIds(expectedBeforeRecipientIds),ids=normalizedIds([...beforeIds,TARGET.userId]);
 assert.equal(new Set(ids).size,ids.length,'Duplicate recipient or incoming account already included');assert.ok(ids.length<=expectedCapacity);
 const planHash=createHash('sha256').update(pack({expectedSeasonId,expectedClanId,beforeIds,expectedSeasonEndsAt,expectedSourceVersion,expectedCapacity,avatarCatalog:catalog})).digest('hex');
 return clanAdminTransaction(db,async q=>{
  await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',sqlite_now()) ON CONFLICT(key) DO NOTHING",[OPERATION_KEY]);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]),record=JSON.parse(saved.value);
  if(record.status==='COMPLETED'){assert.equal(record.result.planHash,planHash,'Completed operation plan differs');return {...record.result,replayed:true};}
  assert.equal(record.status,'PENDING');
  await q('LOCK TABLE clan_wars,clan_war_battles,clan_war_reservation_locks,clan_members,clan_season_teams,clan_seasons,clan_draft_pool IN SHARE ROW EXCLUSIVE MODE NOWAIT');
  const seasons=await q("SELECT *,ends_at::timestamptz>CURRENT_TIMESTAMP unexpired,to_char(ends_at::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') expires_at FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC");
  assert.equal(seasons.length,1,'Current season is ambiguous');const season=seasons[0];assert.equal(Number(season.id),expectedSeasonId);assert.equal(season.phase,'ACTIVE');assert.equal(season.unexpired,true,'Season expired');
  assert.equal(Date.parse(season.ends_at),Date.parse(expectedSeasonEndsAt),'Season end changed');
  const [owner]=await q("SELECT id,role FROM users WHERE id=1 AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' FOR SHARE");assert.ok(owner,'Active owner missing');
  const [clan]=await q("SELECT o.id,o.name,t.master_user_id FROM clan_organizations o JOIN clan_season_teams t ON t.clan_id=o.id AND t.season_id=$1 WHERE o.id=$2 AND o.is_active=1",[expectedSeasonId,expectedClanId]);assert.equal(clan?.name,'LG');
  const [redraft]=await q('SELECT value FROM app_meta WHERE key=$1 FOR SHARE',[clanRedraftKey(expectedSeasonId)]);
  assert.equal(clanMemberCapacity(season,expectedClanId,redraft?parseClanRedraft(redraft.value,expectedSeasonId):null),expectedCapacity,'LG capacity changed');
  const beforeMembers=await q('SELECT * FROM clan_members WHERE season_id=$1 ORDER BY user_id',[expectedSeasonId]);
  const beforeTeams=await q('SELECT * FROM clan_season_teams WHERE season_id=$1 ORDER BY clan_id',[expectedSeasonId]);
  assert.deepEqual(normalizedIds(beforeMembers.filter(m=>Number(m.clan_id)===expectedClanId).map(m=>m.user_id)),beforeIds,'LG roster changed');
  assert.ok(!beforeMembers.some(m=>Number(m.user_id)===TARGET.userId),'Ayoon already belongs to a clan');
  const [source]=await q("SELECT * FROM avatar_catalog_v1 WHERE code='LG_HI_HEEYA' FOR SHARE");
  assert.equal(source?.name,'LG 하이희야');assert.equal(Number(source.version),expectedSourceVersion,'Reference version changed');assert.equal(Number(source.is_active),1);assert.equal(Number(source.is_public),1);
  const sourceEffects=effects(await q("SELECT * FROM avatar_effect_options_v1 WHERE avatar_code='LG_HI_HEEYA' ORDER BY option_order FOR SHARE"));
  assert.deepEqual(sourceEffects,EXPECTED_EFFECTS,'Reference options changed');assert.equal(source.effect_type,catalog.effect_type);assert.equal(Number(source.effect_value),catalog.effect_value);
  assert.equal((await q('SELECT code,serial FROM avatar_catalog_v1 WHERE code=$1 OR serial=$2 FOR UPDATE',[catalog.code,catalog.serial])).length,0,'Avatar code or serial already exists');
  assert.equal((await q('SELECT user_id FROM avatar_user_ownership_v1 WHERE avatar_code=$1 FOR UPDATE',[catalog.code])).length,0,'Unexpected existing ownership');

  const call=async body=>{
   const response=await handleClanMemberAssignment({env:{DB:nestedAdmissionDatabase(q)},user:owner,
    request:new Request('https://ops.invalid/clan-member-assignment',{method:'POST',body:pack(body)}),deps:{readBody:r=>r.json(),json:(body,status=200)=>({body,status})}});
   assert.equal(response.status,200,response.body.error||'Admission failed');return response.body;
  };
  const preview=await call({action:'preview',...TARGET}),admission=await call({action:'apply',previewId:preview.previewId,confirmation:preview.confirmation});
  assert.equal(admission.memberCount,ids.length);assert.equal(admission.maxMembers,expectedCapacity);assert.equal(admission.removedCount,0);assert.equal(admission.gift,null);
  const afterMembers=await q('SELECT * FROM clan_members WHERE season_id=$1 ORDER BY user_id',[expectedSeasonId]);
  assert.deepEqual(afterMembers.filter(m=>Number(m.user_id)!==TARGET.userId),beforeMembers,'Existing clan membership changed');assert.deepEqual(await q('SELECT * FROM clan_season_teams WHERE season_id=$1 ORDER BY clan_id',[expectedSeasonId]),beforeTeams,'Clan leaders or scores changed');
  const members=await q('SELECT m.user_id,u.nickname,u.status,m.member_role FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=$1 AND m.clan_id=$2 ORDER BY m.user_id FOR SHARE OF u',[expectedSeasonId,expectedClanId]);
  assert.deepEqual(normalizedIds(members.map(m=>m.user_id)),ids);assert.ok(members.every(m=>m.status==='ACTIVE'),'Inactive LG recipient');

  const fields=Object.keys(catalog),registered=await q('INSERT INTO avatar_catalog_v1('+fields.join(',')+') VALUES('+fields.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING code',Object.values(catalog));assert.equal(registered.length,1,'Catalog insert failed');
  for(const e of sourceEffects)assert.equal((await q('INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES($1,$2,$3,$4) RETURNING avatar_code',[catalog.code,e.option_order,e.effect_type,e.effect_value])).length,1,'Option insert failed');
  const [clock]=await q('SELECT sqlite_now() acquired_at');
  const granted=await q("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at) SELECT user_id,$3,'EVENT',$4,$5,$6 FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id RETURNING user_id",[expectedSeasonId,expectedClanId,catalog.code,OPERATION_KEY,clock.acquired_at,season.expires_at]);
  assert.deepEqual(normalizedIds(granted.map(r=>r.user_id)),ids,'Partial ownership grant');
  const ownership=await q('SELECT user_id,source_type,source_ref,acquired_at,expires_at FROM avatar_user_ownership_v1 WHERE avatar_code=$1 ORDER BY user_id',[catalog.code]);
  assert.equal(ownership.length,ids.length);assert.ok(ownership.every((r,i)=>Number(r.user_id)===ids[i]&&r.source_type==='EVENT'&&r.source_ref===OPERATION_KEY&&r.acquired_at===clock.acquired_at&&r.expires_at===season.expires_at),'Ownership verification failed');
  assert.deepEqual(effects(await q('SELECT * FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order',[catalog.code])),sourceEffects);
  const result={ok:true,status:'COMPLETED',operationKey:OPERATION_KEY,planHash,avatar:{code:catalog.code,serial:catalog.serial,name:catalog.name},clan:{id:expectedClanId,name:'LG'},seasonId:expectedSeasonId,seasonNo:Number(season.season_no),seasonEndsAt:season.ends_at,expiresAt:season.expires_at,acquiredAt:clock.acquired_at,
   sourceAvatar:{code:source.code,name:source.name,version:Number(source.version)},effects:sourceEffects,admission,granted:ownership.length,recipients:members.map(m=>({userId:Number(m.user_id),nickname:m.nickname,memberRole:m.member_role})),loadoutChanged:false,walletChanged:false,capacityChanged:false};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_LG_AYOON_ADMISSION_AVATAR','AVATAR',$2,$3,$4) RETURNING id",[owner.id,catalog.code,pack({operationKey:OPERATION_KEY,catalog:null,ownership:[],beforeRecipientIds:beforeIds}),pack({...result,authorization:['아윤 아이콘 카드 참고해서 아바타 만들어봐 LG 클랜 유니폼으로 만들어 옵션 클랜 아바타랑 동일하게 하고 아윤 LG로 편입 후 아바타 클랜 시즌 종료까지 지급','LG 클랜 전체 지급']})]);assert.ok(audit,'Audit missing');result.adminLogId=String(audit.id);
  assert.equal((await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1 RETURNING key',[OPERATION_KEY,pack({status:'COMPLETED',result})])).length,1,'Completed receipt missing');
  if(dryRun)throw Object.assign(Error('Dry run rollback'),{dryRunResult:{...result,dryRun:true,rolledBack:true}});
  return {...result,replayed:false};
 }).catch(error=>{if(error.dryRunResult)return error.dryRunResult;throw error;});
}
