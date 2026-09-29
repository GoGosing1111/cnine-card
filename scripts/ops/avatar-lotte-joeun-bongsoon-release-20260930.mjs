// Explicit one-time registration and season grant; never imported by live routes.
import catalogs from '../../preview/avatar-lotte-joeun-bongsoon-v1/catalogs.json' with {type:'json'};
import {clanAdminTransaction} from '../../functions/_clan_inactivity_cleanup.js';

export const LOTTE_UNIFORM_CATALOGS=catalogs;
export const LOTTE_UNIFORM_GRANT_KEY='ops:lotte-joeun-bongsoon-season-grant:20260930:v1';
export const SOURCE_CODE='FM_DIMWOOS';
export const EXPECTED_EFFECTS=Object.freeze([
 {option_order:0,effect_type:'DROP_RATE_PERCENT',effect_value:30},
 {option_order:1,effect_type:'COIN_GAIN_PERCENT',effect_value:100},
 {option_order:2,effect_type:'RAID_EXTRA_ENTRY',effect_value:10},
 {option_order:3,effect_type:'BATTLE_POWER_PERCENT',effect_value:3}
]);
const pack=value=>JSON.stringify(value);
const check=(ok,message)=>{if(!ok)throw Error(message);};
const normalizedEffects=rows=>rows.map(r=>({option_order:Number(r.option_order),effect_type:r.effect_type,effect_value:Number(r.effect_value)}));

export async function releaseLotteUniforms(db,{expectedSeasonId,expectedClanId,expectedRecipientIds,expectedSeasonEndsAt,expectedSourceVersion}){
 check(Number.isSafeInteger(expectedSeasonId)&&expectedSeasonId>0&&Number.isSafeInteger(expectedClanId)&&expectedClanId>0,'Verified season and clan required');
 check(Number.isSafeInteger(expectedSourceVersion)&&expectedSourceVersion>0,'Verified source version required');
 check(Array.isArray(expectedRecipientIds)&&expectedRecipientIds.length>0&&expectedRecipientIds.length<=22&&expectedRecipientIds.every(id=>Number.isSafeInteger(id)&&id>0),'Verified Lotte recipients required');
 check(Number.isFinite(Date.parse(expectedSeasonEndsAt)),'Verified season end required');
 const ids=[...expectedRecipientIds].sort((a,b)=>a-b),codes=catalogs.map(a=>a.code);
 check(new Set(ids).size===ids.length,'Duplicate recipients');
 return clanAdminTransaction(db,async q=>{
  await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',sqlite_now()) ON CONFLICT(key) DO NOTHING",[LOTTE_UNIFORM_GRANT_KEY]);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[LOTTE_UNIFORM_GRANT_KEY]),receipt=JSON.parse(saved.value);
  if(receipt.status==='COMPLETED')return {...receipt.result,replayed:true};
  check(receipt.status==='PENDING','Unexpected receipt state');

  const [source]=await q('SELECT * FROM avatar_catalog_v1 WHERE code=$1 FOR SHARE',[SOURCE_CODE]);
  check(source?.name.replace(/\s/g,'')==='한복디임2'&&Number(source.version)===expectedSourceVersion&&Number(source.is_active)===1&&Number(source.is_public)===1,'Hanbok Diim2 source changed');
  const effects=normalizedEffects(await q('SELECT option_order,effect_type,effect_value FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order FOR SHARE',[SOURCE_CODE]));
  check(pack(effects)===pack(EXPECTED_EFFECTS),'Hanbok Diim2 options changed; refresh the reviewed grant');
  check(source.effect_type===effects[0].effect_type&&Number(source.effect_value)===effects[0].effect_value,'Source primary option mismatch');

  // Block membership writes only during this short verified roster grant.
  await q('LOCK TABLE clan_members IN SHARE MODE');
  const [season]=await q("SELECT id,season_no,phase,ends_at,to_char(ends_at::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') expires_at,ends_at::timestamptz>CURRENT_TIMESTAMP unexpired FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC LIMIT 1 FOR SHARE");
  check(Number(season?.id)===expectedSeasonId&&season.phase==='ACTIVE','Current clan season changed');
  check(season.unexpired&&Date.parse(season.ends_at)===Date.parse(expectedSeasonEndsAt),'Clan season end changed or expired');
  const [clan]=await q("SELECT id,name,is_active FROM clan_organizations WHERE name='롯데' FOR SHARE");
  check(Number(clan?.id)===expectedClanId&&Number(clan.is_active)===1,'Lotte clan changed');
  const members=await q('SELECT m.user_id,u.nickname,u.status,m.member_role FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=$1 AND m.clan_id=$2 ORDER BY m.user_id FOR SHARE OF u',[expectedSeasonId,expectedClanId]);
  check(pack(members.map(m=>Number(m.user_id)))===pack(ids)&&members.every(m=>m.status==='ACTIVE'),'Lotte recipients changed; refresh the roster');
  check(!(await q('SELECT code,serial FROM avatar_catalog_v1 WHERE code=ANY($1::text[]) OR serial=ANY($2::text[]) FOR UPDATE',[codes,catalogs.map(a=>a.serial)])).length,'Avatar code or serial already exists without this receipt');
  check(!(await q('SELECT avatar_code FROM avatar_user_ownership_v1 WHERE avatar_code=ANY($1::text[]) LIMIT 1',[codes])).length,'Unexpected existing ownership');
  const [clock]=await q('SELECT sqlite_now() acquired_at');
  const grants=[];
  for(const catalog of catalogs){
   check(catalog.effect_type===effects[0].effect_type&&catalog.effect_value===effects[0].effect_value,'Catalog option mismatch');
   const fields=Object.keys(catalog);
   await q('INSERT INTO avatar_catalog_v1('+fields.join(',')+') VALUES('+fields.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(catalog));
   for(const effect of effects)await q('INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES($1,$2,$3,$4)',[catalog.code,effect.option_order,effect.effect_type,effect.effect_value]);
   const inserted=await q("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at) SELECT user_id,$3,'EVENT',$4,$5,$6 FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id RETURNING user_id",[expectedSeasonId,expectedClanId,catalog.code,LOTTE_UNIFORM_GRANT_KEY,clock.acquired_at,season.expires_at]);
   check(pack(inserted.map(r=>Number(r.user_id)).sort((a,b)=>a-b))===pack(ids),'Grant row count mismatch');
   const ownership=await q('SELECT user_id,source_type,source_ref,acquired_at,expires_at FROM avatar_user_ownership_v1 WHERE avatar_code=$1 ORDER BY user_id',[catalog.code]);
   check(ownership.length===ids.length&&ownership.every((r,i)=>Number(r.user_id)===ids[i]&&r.source_type==='EVENT'&&r.source_ref===LOTTE_UNIFORM_GRANT_KEY&&r.acquired_at===clock.acquired_at&&r.expires_at===season.expires_at),'Ownership verification failed');
   check(pack(normalizedEffects(await q('SELECT * FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order',[catalog.code])))===pack(effects),'Copied effects mismatch');
   grants.push({code:catalog.code,serial:catalog.serial,name:catalog.name,count:ownership.length});
  }
  const result={ok:true,status:'COMPLETED',avatars:grants,clan:{id:expectedClanId,name:'롯데'},seasonId:expectedSeasonId,seasonNo:Number(season.season_no),sourceAvatar:{code:SOURCE_CODE,name:source.name,version:Number(source.version)},effects,recipientCount:ids.length,totalGranted:ids.length*catalogs.length,recipientIds:ids,acquiredAt:clock.acquired_at,expiresAt:season.expires_at,loadoutChanged:false,walletChanged:false};
  const [owner]=await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1");
  check(owner,'Active owner required for audit attribution');
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_AVATAR_CLAN_SEASON_GRANT','AVATAR',$2,$3,$4) RETURNING id",[owner.id,codes.join(','),pack({operationKey:LOTTE_UNIFORM_GRANT_KEY,registered:false,ownership:[]}),pack({...result,operationKey:LOTTE_UNIFORM_GRANT_KEY,actor:'SYSTEM_OPS',authorization:'장비창 ui 만들고 등록해 / 옵션은 한복디임2 기준으로 다 맞추고 롯데 클랜 전체 클랜 시즌 종료까지 지급해'})]);
  check(audit,'Avatar grant audit missing');result.adminLogId=String(audit.id);
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[LOTTE_UNIFORM_GRANT_KEY,pack({status:'COMPLETED',result})]);
  return result;
 });
}

