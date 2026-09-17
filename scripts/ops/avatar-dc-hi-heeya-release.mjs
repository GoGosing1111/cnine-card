// Explicit one-time operations entry point. Never imported by live request routes.
import catalog from '../../preview/avatar-dc-hi-heeya-v1/catalog.json' with {type:'json'};
import {clanAdminTransaction} from '../../functions/_clan_inactivity_cleanup.js';

export const DC_AVATAR=catalog;
export const DC_GRANT_KEY='avatar_dc_hi_heeya_clan_grant_20260917_v1';
export const DC_EXPECTED_EFFECTS=Object.freeze([
  {option_order:0,effect_type:'COIN_GAIN_PERCENT',effect_value:75},
  {option_order:1,effect_type:'RAID_EXTRA_ENTRY',effect_value:10}
]);
const pack=value=>JSON.stringify(value);
const check=(ok,message)=>{if(!ok)throw Error(message);};
const effectsFrom=rows=>rows.map(r=>({option_order:Number(r.option_order),effect_type:r.effect_type,effect_value:Number(r.effect_value)}));

export async function releaseDcHiHeeya(db,{expectedSeasonId,expectedClanId,expectedRecipientIds,dryRun=false}){
  check(Number.isSafeInteger(expectedSeasonId)&&expectedSeasonId>0,'A verified season is required');
  check(Number.isSafeInteger(expectedClanId)&&expectedClanId>0,'A verified DC clan is required');
  check(Array.isArray(expectedRecipientIds)&&expectedRecipientIds.length>0&&expectedRecipientIds.length<=1000&&expectedRecipientIds.every(id=>Number.isSafeInteger(id)&&id>0),'Verified recipient IDs are required');
  const ids=[...expectedRecipientIds].sort((a,b)=>a-b);
  check(new Set(ids).size===ids.length,'Duplicate recipients');
  return clanAdminTransaction(db,async q=>{
    // The unique receipt serializes retries; any failed validation rolls it back.
    await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',sqlite_now()) ON CONFLICT(key) DO NOTHING",[DC_GRANT_KEY]);
    const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[DC_GRANT_KEY]);
    const record=JSON.parse(saved.value);
    if(record.status==='COMPLETED')return {...record.result,replayed:true};
    check(record.status==='PENDING','Unexpected grant receipt state');

    const [source]=await q("SELECT * FROM avatar_catalog_v1 WHERE code='T1_JOEUN' FOR SHARE");
    check(source&&Number(source.is_active)===1&&Number(source.is_public)===1,'T1 Joeun must be active and public');
    const sourceEffects=effectsFrom(await q("SELECT * FROM avatar_effect_options_v1 WHERE avatar_code='T1_JOEUN' ORDER BY option_order FOR SHARE"));
    check(pack(sourceEffects)===pack(DC_EXPECTED_EFFECTS),'T1 Joeun options changed; refresh the reviewed release');
    check(source.effect_type===catalog.effect_type&&Number(source.effect_value)===catalog.effect_value,'T1 Joeun primary option changed');

    // Briefly prevent roster additions/removals while the exact current roster is granted.
    await q('LOCK TABLE clan_members IN SHARE MODE');
    const [season]=await q("SELECT id,season_no,phase FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC LIMIT 1 FOR SHARE");
    check(Number(season?.id)===expectedSeasonId&&season.phase==='ACTIVE','Current clan season changed');
    const [clan]=await q("SELECT id,name,is_active FROM clan_organizations WHERE name='DC' FOR SHARE");
    check(Number(clan?.id)===expectedClanId&&Number(clan.is_active)===1,'DC clan changed');
    const members=await q('SELECT m.user_id,u.nickname,u.status,m.member_role FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=$1 AND m.clan_id=$2 ORDER BY m.user_id FOR SHARE OF u',[expectedSeasonId,expectedClanId]);
    check(pack(members.map(m=>Number(m.user_id)))===pack(ids)&&members.every(m=>m.status==='ACTIVE'),'DC recipients changed; refresh the roster');
    const collisions=await q('SELECT code,serial FROM avatar_catalog_v1 WHERE code=$1 OR serial=$2 FOR UPDATE',[catalog.code,catalog.serial]);
    check(collisions.length===0,'Avatar code or serial already exists without this grant receipt');

    const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");
    check(owner,'Audit owner missing');
    const accountsBefore=await q('SELECT id,nickname,status,role,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
    const loadoutBefore=await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
    const fields=Object.keys(catalog);
    await q(`INSERT INTO avatar_catalog_v1(${fields.join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(catalog));
    for(const effect of sourceEffects)await q('INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES($1,$2,$3,$4)',[catalog.code,effect.option_order,effect.effect_type,effect.effect_value]);
    const [times]=await q("SELECT sqlite_now() acquired_at,to_char(timezone('UTC',CURRENT_TIMESTAMP)+interval '11 days','YYYY-MM-DD HH24:MI:SS') expires_at");
    const granted=await q(`INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at)
      SELECT user_id,$3,'EVENT',$4,$5,$6 FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id RETURNING user_id`,
      [expectedSeasonId,expectedClanId,catalog.code,DC_GRANT_KEY,times.acquired_at,times.expires_at]);
    check(pack(granted.map(r=>Number(r.user_id)).sort((a,b)=>a-b))===pack(ids),'Grant row count mismatch');
    const ownership=await q('SELECT user_id,source_type,source_ref,acquired_at,expires_at FROM avatar_user_ownership_v1 WHERE avatar_code=$1 ORDER BY user_id',[catalog.code]);
    check(ownership.length===ids.length&&ownership.every((r,i)=>Number(r.user_id)===ids[i]&&r.source_ref===DC_GRANT_KEY&&r.acquired_at===times.acquired_at&&r.expires_at===times.expires_at),'Ownership verification failed');
    const effects=effectsFrom(await q('SELECT * FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order',[catalog.code]));
    check(pack(effects)===pack(sourceEffects),'Copied effects mismatch');
    const result={ok:true,status:'COMPLETED',avatar:{code:catalog.code,serial:catalog.serial,name:catalog.name},clan:{id:expectedClanId,name:'DC'},seasonId:expectedSeasonId,
      sourceAvatar:{code:source.code,version:Number(source.version)},effects,granted:ownership.length,durationDays:11,acquiredAt:times.acquired_at,expiresAt:times.expires_at,
      recipients:members.map(m=>({userId:Number(m.user_id),nickname:m.nickname,memberRole:m.member_role})),loadoutChanged:false,walletChanged:false};
    check(pack(accountsBefore)===pack(await q('SELECT id,nickname,status,role,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids])),'Recipient wallet changed');
    check(pack(loadoutBefore)===pack(await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids])),'Equipped avatars changed');
    const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'CLAN_AVATAR_TIMED_GRANT','AVATAR',catalog.code,pack({catalog:null,ownership:[]}),pack({operationKey:DC_GRANT_KEY,actor:'CODEX_OPERATIONS',...result})]);
    check(audit,'Grant audit missing');result.grantAuditId=String(audit.id);
    await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[DC_GRANT_KEY,pack({status:'COMPLETED',result})]);
    if(dryRun)throw Object.assign(new Error('Dry run rollback'),{dryRunResult:{...result,dryRun:true,rolledBack:true}});
    return result;
  }).catch(error=>{if(error.dryRunResult)return error.dryRunResult;throw error;});
}
