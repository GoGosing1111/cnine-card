// Explicit user-authorized one-time event grant; never imported by live routes.
import catalogs from '../../preview/avatar-hanwha-samsung-v1/catalog.json' with {type:'json'};
import {clanAdminTransaction} from '../../functions/_clan_inactivity_cleanup.js';
export const OPERATION_KEY='ops:hanwha-kangguyeol-samsung-juseong-avatars:20261001:v1';
export const CATALOGS=catalogs;
export const TARGETS=[{clanId:4,clanName:'한화',userId:4718,nickname:'강구열',catalog:catalogs[0]},{clanId:2,clanName:'삼성',userId:5393,nickname:'주성',catalog:catalogs[1]}];
export const EFFECTS=[{option_order:0,effect_type:'DROP_RATE_PERCENT',effect_value:30},{option_order:1,effect_type:'COIN_GAIN_PERCENT',effect_value:100},{option_order:2,effect_type:'RAID_EXTRA_ENTRY',effect_value:10},{option_order:3,effect_type:'BATTLE_POWER_PERCENT',effect_value:3}];
const pack=v=>JSON.stringify(v,(_,n)=>typeof n==='bigint'?Number(n):n);
const check=(ok,message)=>{if(!ok)throw Error(message)};
const normalized=rows=>rows.map(r=>({option_order:Number(r.option_order),effect_type:r.effect_type,effect_value:Number(r.effect_value)}));
export async function releaseClanAvatars(db,{expectedSeasonEndsAt,expectedRecipients,expectedSourceVersion,dryRun=false}){
 check(Number.isFinite(Date.parse(expectedSeasonEndsAt))&&Number.isSafeInteger(expectedSourceVersion),'Reviewed expiry/source required');
 for(const t of TARGETS){const ids=expectedRecipients?.[t.clanId];check(Array.isArray(ids)&&ids.length===18&&new Set(ids).size===18&&ids.every(id=>Number.isSafeInteger(id)&&id>0)&&ids.includes(t.userId),'Reviewed clan roster required')}
 return clanAdminTransaction(db,async q=>{
  await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',sqlite_now()) ON CONFLICT(key) DO NOTHING",[OPERATION_KEY]);
  const [receipt]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]),saved=JSON.parse(receipt.value);
  if(saved.status==='COMPLETED')return {...saved.result,replayed:true};
  check(saved.status==='PENDING','Unexpected receipt');
  await q('LOCK TABLE clan_members,clan_seasons IN SHARE ROW EXCLUSIVE MODE NOWAIT');
  const [season]=await q("SELECT id,season_no,phase,ends_at,to_char(ends_at::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') expires_at,ends_at::timestamptz>CURRENT_TIMESTAMP unexpired FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC LIMIT 1");
  check(Number(season?.id)===6&&season.phase==='ACTIVE'&&season.unexpired&&Date.parse(season.ends_at)===Date.parse(expectedSeasonEndsAt),'Season or expiry changed');
  const [owner]=await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");check(owner,'Active audit owner required');
  const [source]=await q("SELECT * FROM avatar_catalog_v1 WHERE code='T1_ORIKKUNG_CHAINGUN' FOR SHARE");
  check(source&&Number(source.version)===expectedSourceVersion&&Number(source.is_active)===1&&Number(source.is_public)===1&&source.effect_type==='DROP_RATE_PERCENT'&&Number(source.effect_value)===30,'Source avatar changed');
  const effects=normalized(await q('SELECT option_order,effect_type,effect_value FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order FOR SHARE',[source.code]));
  check(pack(effects)===pack(EFFECTS),'Source effects changed');
  const [clock]=await q('SELECT sqlite_now() acquired_at'),grants=[];
  for(const t of TARGETS){
   const [clan]=await q('SELECT id,name,is_active FROM clan_organizations WHERE id=$1 FOR SHARE',[t.clanId]);
   check(clan?.name===t.clanName&&Number(clan.is_active)===1,'Clan identity changed');
   const members=await q('SELECT m.user_id,u.nickname,u.status FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=6 AND m.clan_id=$1 ORDER BY m.user_id',[t.clanId]);
   const ids=members.map(r=>Number(r.user_id)),expected=[...expectedRecipients[t.clanId]].sort((a,b)=>a-b);
   check(pack(ids)===pack(expected)&&members.every(m=>m.status==='ACTIVE')&&members.some(m=>Number(m.user_id)===t.userId&&m.nickname===t.nickname),'Recipient roster or identity changed');
   const wallets=await q('SELECT id,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[ids]);
   const loadout=await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
   const c=t.catalog;
   check(!(await q('SELECT code FROM avatar_catalog_v1 WHERE code=$1 OR serial=$2 FOR UPDATE',[c.code,c.serial])).length,'Code or serial already registered');
   check(!(await q('SELECT user_id FROM avatar_user_ownership_v1 WHERE avatar_code=$1 FOR UPDATE',[c.code])).length,'Unexpected existing ownership');
   const fields=Object.keys(c);await q('INSERT INTO avatar_catalog_v1('+fields.join(',')+') VALUES('+fields.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(c));
   for(const e of effects)await q('INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES($1,$2,$3,$4)',[c.code,e.option_order,e.effect_type,e.effect_value]);
   const inserted=await q("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at) SELECT user_id,$3,'EVENT',$4,$5,$6 FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id RETURNING user_id",[6,t.clanId,c.code,OPERATION_KEY,clock.acquired_at,season.expires_at]);
   check(pack(inserted.map(r=>Number(r.user_id)).sort((a,b)=>a-b))===pack(ids),'Grant row count mismatch');
   const ownership=await q('SELECT user_id,source_type,source_ref,acquired_at,expires_at FROM avatar_user_ownership_v1 WHERE avatar_code=$1 ORDER BY user_id',[c.code]);
   check(ownership.length===ids.length&&ownership.every((r,i)=>Number(r.user_id)===ids[i]&&r.source_type==='EVENT'&&r.source_ref===OPERATION_KEY&&r.acquired_at===clock.acquired_at&&r.expires_at===season.expires_at),'Ownership verification failed');
   check(pack(normalized(await q('SELECT option_order,effect_type,effect_value FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order',[c.code])))===pack(effects),'Copied effects mismatch');
   check(pack(await q('SELECT id,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]))===pack(wallets),'Wallet changed');
   check(pack(await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]))===pack(loadout),'Loadout changed');
   grants.push({clanId:t.clanId,clanName:t.clanName,code:c.code,serial:c.serial,name:c.name,granted:ids.length,recipientIds:ids});
  }
  const result={status:'COMPLETED',seasonId:6,seasonNo:Number(season.season_no),sourceAvatar:{code:source.code,version:Number(source.version)},effects,grants,granted:grants.reduce((n,g)=>n+g.granted,0),acquiredAt:clock.acquired_at,expiresAt:season.expires_at};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_HANWHA_SAMSUNG_AVATAR_RELEASE','CLAN','2,4',$2,$3) RETURNING id",[owner.id,pack({operationKey:OPERATION_KEY,source:result.sourceAvatar}),pack({operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',authorization:'강구열 주성 클랜아바타 최근 클랜 옵션 동일·각 클랜 전원 시즌 종료까지 지급',result})]);
  check(audit,'Audit missing');result.adminLogId=String(audit.id);
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[OPERATION_KEY,pack({status:'COMPLETED',result})]);
  if(dryRun)throw Object.assign(Error('Dry run rollback'),{dryRunResult:{...result,dryRun:true,rolledBack:true}});
  return result;
 }).catch(e=>{if(e.dryRunResult)return e.dryRunResult;throw e});
}
