// Explicit user-authorized seasonal clan grant. Never imported by live routes.
import catalog from '../../preview/avatar-hanwha-diim-v1/catalog.json' with {type:'json'};
import {clanAdminTransaction} from '../../functions/_clan_inactivity_cleanup.js';
export const OPERATION_KEY='ops:hanwha-diim-avatar-release:20261003:v1';
export const CATALOG=catalog;
export const TARGET=Object.freeze({seasonId:6,seasonNo:3,clanId:4,clanName:'한화',userId:4773,nickname:'진짜디임'});
export const EFFECTS=Object.freeze([
 {option_order:0,effect_type:'DROP_RATE_PERCENT',effect_value:30},
 {option_order:1,effect_type:'COIN_GAIN_PERCENT',effect_value:100},
 {option_order:2,effect_type:'RAID_EXTRA_ENTRY',effect_value:10},
 {option_order:3,effect_type:'BATTLE_POWER_PERCENT',effect_value:3}
]);
const pack=v=>JSON.stringify(v,(_,n)=>typeof n==='bigint'?Number(n):n);
const check=(ok,message)=>{if(!ok)throw Error(message)};
const normalized=rows=>rows.map(r=>({option_order:Number(r.option_order),effect_type:r.effect_type,effect_value:Number(r.effect_value)}));
export async function releaseHanwhaDiimAvatar(db,{expectedSeasonEndsAt,expectedRecipients,expectedSourceVersion,dryRun=false}){
 check(Number.isFinite(Date.parse(expectedSeasonEndsAt))&&Number.isSafeInteger(expectedSourceVersion),'Reviewed expiry/source required');
 check(Array.isArray(expectedRecipients)&&expectedRecipients.length===19&&new Set(expectedRecipients).size===19&&expectedRecipients.every(id=>Number.isSafeInteger(id)&&id>0)&&expectedRecipients.includes(TARGET.userId),'Reviewed Hanwha roster required');
 return clanAdminTransaction(db,async q=>{
  await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',sqlite_now()) ON CONFLICT(key) DO NOTHING",[OPERATION_KEY]);
  const [receipt]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]),saved=JSON.parse(receipt.value);
  if(saved.status==='COMPLETED')return {...saved.result,replayed:true};
  check(saved.status==='PENDING','Unexpected receipt');
  await q('LOCK TABLE clan_members,clan_seasons IN SHARE ROW EXCLUSIVE MODE NOWAIT');
  const [season]=await q("SELECT id,season_no,phase,ends_at,to_char(ends_at::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') expires_at,ends_at::timestamptz>CURRENT_TIMESTAMP unexpired FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC LIMIT 1");
  check(Number(season?.id)===TARGET.seasonId&&Number(season.season_no)===TARGET.seasonNo&&season.phase==='ACTIVE'&&season.unexpired&&Date.parse(season.ends_at)===Date.parse(expectedSeasonEndsAt),'Season or expiry changed');
  const [owner]=await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");check(owner,'Active audit owner required');
  const [clan]=await q('SELECT id,name,is_active FROM clan_organizations WHERE id=$1 FOR SHARE',[TARGET.clanId]);
  check(clan?.name===TARGET.clanName&&Number(clan.is_active)===1,'Clan identity changed');
  const members=await q('SELECT m.*,u.nickname,u.status FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=$1 AND m.clan_id=$2 ORDER BY m.user_id',[TARGET.seasonId,TARGET.clanId]);
  const ids=members.map(r=>Number(r.user_id)),expected=[...expectedRecipients].sort((a,b)=>a-b);
  check(pack(ids)===pack(expected)&&members.every(m=>m.status==='ACTIVE')&&members.some(m=>Number(m.user_id)===TARGET.userId&&m.nickname===TARGET.nickname),'Recipient roster or Diim membership changed');
  const [source]=await q("SELECT * FROM avatar_catalog_v1 WHERE code='HANWHA_KANGGUYEOL' FOR SHARE");
  check(source&&Number(source.version)===expectedSourceVersion&&Number(source.is_active)===1&&Number(source.is_public)===1&&source.effect_type===CATALOG.effect_type&&Number(source.effect_value)===CATALOG.effect_value,'Source avatar changed');
  const effects=normalized(await q('SELECT option_order,effect_type,effect_value FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order FOR SHARE',[source.code]));
  check(pack(effects)===pack(EFFECTS),'Source effects changed');
  const wallets=await q('SELECT id,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[ids]);
  const loadout=await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
  check(!(await q('SELECT code FROM avatar_catalog_v1 WHERE code=$1 OR serial=$2 FOR UPDATE',[CATALOG.code,CATALOG.serial])).length,'Code or serial already registered');
  check(!(await q('SELECT user_id FROM avatar_user_ownership_v1 WHERE avatar_code=$1 FOR UPDATE',[CATALOG.code])).length,'Unexpected existing ownership');
  const fields=Object.keys(CATALOG);
  await q('INSERT INTO avatar_catalog_v1('+fields.join(',')+') VALUES('+fields.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(CATALOG));
  for(const e of effects)await q('INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES($1,$2,$3,$4)',[CATALOG.code,e.option_order,e.effect_type,e.effect_value]);
  const [clock]=await q('SELECT sqlite_now() acquired_at');
  const inserted=await q("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at) SELECT user_id,$3,'EVENT',$4,$5,$6 FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id RETURNING user_id",[TARGET.seasonId,TARGET.clanId,CATALOG.code,OPERATION_KEY,clock.acquired_at,season.expires_at]);
  check(pack(inserted.map(r=>Number(r.user_id)).sort((a,b)=>a-b))===pack(ids),'Grant row count mismatch');
  const ownership=await q('SELECT user_id,source_type,source_ref,acquired_at,expires_at FROM avatar_user_ownership_v1 WHERE avatar_code=$1 ORDER BY user_id',[CATALOG.code]);
  check(ownership.length===ids.length&&ownership.every((r,i)=>Number(r.user_id)===ids[i]&&r.source_type==='EVENT'&&r.source_ref===OPERATION_KEY&&r.acquired_at===clock.acquired_at&&r.expires_at===season.expires_at),'Ownership verification failed');
  check(pack(normalized(await q('SELECT option_order,effect_type,effect_value FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order',[CATALOG.code])))===pack(effects),'Copied effects mismatch');
  check(pack(await q('SELECT id,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]))===pack(wallets),'Wallet changed');
  check(pack(await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]))===pack(loadout),'Loadout changed');
  check(pack(await q('SELECT m.*,u.nickname,u.status FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=$1 AND m.clan_id=$2 ORDER BY m.user_id',[TARGET.seasonId,TARGET.clanId]))===pack(members),'Existing clan membership changed');
  const result={status:'COMPLETED',operationKey:OPERATION_KEY,seasonId:TARGET.seasonId,seasonNo:TARGET.seasonNo,clanId:TARGET.clanId,clanName:TARGET.clanName,code:CATALOG.code,serial:CATALOG.serial,name:CATALOG.name,sourceAvatar:{code:source.code,version:Number(source.version)},effects,granted:ids.length,recipientIds:ids,acquiredAt:clock.acquired_at,expiresAt:season.expires_at,diimMembership:'ALREADY_HANWHA'};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_HANWHA_DIIM_AVATAR_RELEASE','CLAN','4',$2,$3) RETURNING id",[owner.id,pack({operationKey:OPERATION_KEY,source:result.sourceAvatar,recipientIds:ids}),pack({operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',authorization:'디임 간호사 얼굴·여성 밀착 유니폼·짧은 밀착 치마; 현재 한화 클랜원 전원에게 시즌 종료까지 동일 옵션 아바타 지급',result})]);
  check(audit,'Audit missing');result.adminLogId=String(audit.id);
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[OPERATION_KEY,pack({status:'COMPLETED',result})]);
  if(dryRun)throw Object.assign(Error('Dry run rollback'),{dryRunResult:{...result,dryRun:true,rolledBack:true}});
  return result;
 }).catch(e=>{if(e.dryRunResult)return e.dryRunResult;throw e});
}
