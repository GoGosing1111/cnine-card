// Explicit, user-authorized operations entry point; never run by live requests.
import assert from 'node:assert/strict';
import catalog from '../../preview/avatar-lg-hi-heeya-uniform-v1/catalog.json' with {type:'json'};
import {clanAdminTransaction} from '../../functions/_clan_inactivity_cleanup.js';
export const LG_AVATAR=catalog;
export const LG_GRANT_KEY='ops:avatar-lg-hi-heeya-clan-season:20260930:v1';
export const LG_EXPECTED_EFFECTS=Object.freeze([
 {option_order:0,effect_type:'DROP_RATE_PERCENT',effect_value:30},
 {option_order:1,effect_type:'COIN_GAIN_PERCENT',effect_value:100},
 {option_order:2,effect_type:'RAID_EXTRA_ENTRY',effect_value:10},
 {option_order:3,effect_type:'BATTLE_POWER_PERCENT',effect_value:3}
]);
const effects=rows=>rows.map(r=>({option_order:Number(r.option_order),effect_type:r.effect_type,effect_value:Number(r.effect_value)}));
const pack=JSON.stringify;
export async function releaseLgHiHeeya(db,{expectedSeasonId,expectedClanId,expectedRecipientIds,expectedSeasonEndsAt,expectedSourceVersion,dryRun=false}){
 assert.ok(Number.isSafeInteger(expectedSeasonId)&&expectedSeasonId>0);
 assert.ok(Number.isSafeInteger(expectedClanId)&&expectedClanId>0);
 assert.ok(Number.isSafeInteger(expectedSourceVersion)&&expectedSourceVersion>0);
 assert.ok(Number.isFinite(Date.parse(expectedSeasonEndsAt)));
 assert.ok(Array.isArray(expectedRecipientIds)&&expectedRecipientIds.length>0&&expectedRecipientIds.length<=1000&&expectedRecipientIds.every(id=>Number.isSafeInteger(id)&&id>0));
 const ids=[...expectedRecipientIds].sort((a,b)=>a-b);assert.equal(new Set(ids).size,ids.length);
 return clanAdminTransaction(db,async q=>{
  await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',sqlite_now()) ON CONFLICT(key) DO NOTHING",[LG_GRANT_KEY]);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[LG_GRANT_KEY]),receipt=JSON.parse(saved.value);
  if(receipt.status==='COMPLETED')return {...receipt.result,replayed:true};
  assert.equal(receipt.status,'PENDING');
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE' FOR SHARE");assert.ok(owner,'Active owner required');
  const [source]=await q("SELECT * FROM avatar_catalog_v1 WHERE code='FM_DIMWOOS' FOR SHARE");
  assert.equal(source?.name,'한복 디임2');assert.equal(Number(source.is_active),1);assert.equal(Number(source.is_public),1);
  assert.equal(Number(source.version),expectedSourceVersion,'Reference version changed');
  const sourceEffects=effects(await q("SELECT * FROM avatar_effect_options_v1 WHERE avatar_code='FM_DIMWOOS' ORDER BY option_order FOR SHARE"));
  assert.deepEqual(sourceEffects,LG_EXPECTED_EFFECTS,'Reference options changed');
  assert.equal(source.effect_type,catalog.effect_type);assert.equal(Number(source.effect_value),catalog.effect_value);
  await q('LOCK TABLE clan_members IN SHARE MODE');
  const seasons=await q("SELECT id,season_no,phase,ends_at,to_char(ends_at::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') expires_at,ends_at::timestamptz>CURRENT_TIMESTAMP unexpired FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC FOR SHARE");
  assert.equal(seasons.length,1,'Current season is ambiguous');const season=seasons[0];
  assert.equal(Number(season.id),expectedSeasonId,'Current season changed');assert.equal(season.phase,'ACTIVE');
  assert.equal(season.unexpired,true,'Season expired');assert.equal(Date.parse(season.ends_at),Date.parse(expectedSeasonEndsAt),'Season end changed');
  const [clan]=await q("SELECT id,name,is_active FROM clan_organizations WHERE name='LG' FOR SHARE");
  assert.equal(Number(clan?.id),expectedClanId,'LG clan changed');assert.equal(Number(clan.is_active),1);
  const members=await q('SELECT m.user_id,u.nickname,u.status,m.member_role FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=$1 AND m.clan_id=$2 ORDER BY m.user_id FOR SHARE OF u',[expectedSeasonId,expectedClanId]);
  assert.deepEqual(members.map(m=>Number(m.user_id)),ids,'LG recipients changed');assert.ok(members.every(m=>m.status==='ACTIVE'),'Inactive recipient');
  const collisions=await q('SELECT code,serial FROM avatar_catalog_v1 WHERE code=$1 OR serial=$2 FOR UPDATE',[catalog.code,catalog.serial]);assert.equal(collisions.length,0,'Avatar code or serial already exists');
  const orphaned=await q('SELECT user_id FROM avatar_user_ownership_v1 WHERE avatar_code=$1 FOR UPDATE',[catalog.code]);assert.equal(orphaned.length,0,'Unexpected existing ownership');
  const accounts=await q('SELECT id,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
  const loadouts=await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
  const fields=Object.keys(catalog);
  await q('INSERT INTO avatar_catalog_v1('+fields.join(',')+') VALUES('+fields.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(catalog));
  for(const e of sourceEffects)await q('INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES($1,$2,$3,$4)',[catalog.code,e.option_order,e.effect_type,e.effect_value]);
  const [clock]=await q('SELECT sqlite_now() acquired_at');
  const granted=await q("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at) SELECT user_id,$3,'EVENT',$4,$5,$6 FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id RETURNING user_id",[expectedSeasonId,expectedClanId,catalog.code,LG_GRANT_KEY,clock.acquired_at,season.expires_at]);
  assert.deepEqual(granted.map(r=>Number(r.user_id)).sort((a,b)=>a-b),ids,'Grant row count mismatch');
  const ownership=await q('SELECT user_id,source_ref,acquired_at,expires_at FROM avatar_user_ownership_v1 WHERE avatar_code=$1 ORDER BY user_id',[catalog.code]);
  assert.equal(ownership.length,ids.length);assert.ok(ownership.every((r,i)=>Number(r.user_id)===ids[i]&&r.source_ref===LG_GRANT_KEY&&r.acquired_at===clock.acquired_at&&r.expires_at===season.expires_at),'Ownership verification failed');
  assert.deepEqual(effects(await q('SELECT * FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order',[catalog.code])),sourceEffects);
  assert.deepEqual(await q('SELECT id,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]),accounts);
  assert.deepEqual(await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]),loadouts);
  assert.deepEqual((await q("SELECT * FROM avatar_catalog_v1 WHERE code='FM_DIMWOOS'"))[0],source);
  const result={status:'COMPLETED',operationKey:LG_GRANT_KEY,avatar:{code:catalog.code,serial:catalog.serial,name:catalog.name},clan:{id:expectedClanId,name:'LG'},seasonId:expectedSeasonId,seasonNo:Number(season.season_no),seasonEndsAt:season.ends_at,expiresAt:season.expires_at,acquiredAt:clock.acquired_at,sourceAvatar:{code:source.code,name:source.name,version:Number(source.version)},effects:sourceEffects,granted:ownership.length,recipients:members.map(m=>({userId:Number(m.user_id),nickname:m.nickname,memberRole:m.member_role})),loadoutChanged:false,walletChanged:false};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_AVATAR_CLAN_SEASON_GRANT','AVATAR',$2,$3,$4) RETURNING id",[owner.id,catalog.code,pack({operationKey:LG_GRANT_KEY,catalog:null,ownership:[]}),pack({...result,authorization:'옵션은 한복디임2 기준으로 다 맞추고 LG 클랜 전체 클랜 시즌 종료까지 지급해'})]);
  assert.ok(audit,'Audit missing');result.adminLogId=String(audit.id);
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[LG_GRANT_KEY,pack({status:'COMPLETED',result})]);
  if(dryRun)throw Object.assign(Error('Dry run rollback'),{dryRunResult:{...result,dryRun:true,rolledBack:true}});
  return {...result,replayed:false};
 }).catch(error=>{if(error.dryRunResult)return error.dryRunResult;throw error;});
}

