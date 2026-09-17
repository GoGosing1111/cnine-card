// Explicit one-time operation. Never imported by a live request route.
import catalog from '../../preview/avatar-fm-dimwoos-v1/catalog.json' with {type:'json'};
import {clanAdminTransaction} from '../../functions/_clan_inactivity_cleanup.js';
import {clanRedraftKey,parseClanRedraft,clanMemberCapacity} from '../../functions/_clan_redraft.js';
export const FM_AVATAR=catalog;
export const FM_GRANT_KEY='avatar_fm_dimwoos_clan_grant_20260917_v1';
export const FM_CAPACITY_OPERATION='ops:fm-dimwoos-admission-avatar:20260917:v1';
export const FM_EXPECTED_EFFECTS=Object.freeze([
 {option_order:0,effect_type:'COIN_GAIN_PERCENT',effect_value:75},
 {option_order:1,effect_type:'RAID_EXTRA_ENTRY',effect_value:10}
]);
const pack=x=>JSON.stringify(x);
const check=(ok,message)=>{if(!ok)throw Error(message)};
const effectRows=rows=>rows.map(r=>({option_order:Number(r.option_order),effect_type:r.effect_type,effect_value:Number(r.effect_value)}));
export async function releaseFmDimwoos(db,{expectedSeasonId,expectedClanId,expectedRecipientIds,expectedRedraft,dryRun=false}){
 check(Number.isSafeInteger(expectedSeasonId)&&expectedSeasonId>0&&Number.isSafeInteger(expectedClanId)&&expectedClanId>0,'Verified season and clan required');
 const ids=[...(expectedRecipientIds||[])].sort((a,b)=>a-b),incomingId=4773;
 check(ids.length===22&&ids.every(id=>Number.isSafeInteger(id)&&id>0)&&new Set(ids).size===22&&ids.includes(incomingId),'Exactly 22 reviewed recipients including incoming account required');
 const result=await clanAdminTransaction(db,async q=>{
  await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',sqlite_now()) ON CONFLICT(key) DO NOTHING",[FM_GRANT_KEY]);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[FM_GRANT_KEY]);
  const record=JSON.parse(saved.value);
  if(record.status==='COMPLETED')return {...record.result,replayed:true};
  check(record.status==='PENDING','Unexpected grant receipt');
  await q('LOCK TABLE clan_wars,clan_war_battles,clan_war_reservation_locks,clan_members,clan_season_teams,clan_seasons,clan_draft_pool IN SHARE ROW EXCLUSIVE MODE NOWAIT');
  const [season]=await q("SELECT id,season_no,phase,max_members FROM clan_seasons WHERE phase<>'COMPLETE' ORDER BY season_no DESC,id DESC LIMIT 1");
  check(Number(season?.id)===expectedSeasonId&&season.phase==='ACTIVE','Current clan season changed');
  const [clan]=await q('SELECT o.id,o.name,o.is_active,t.master_user_id FROM clan_organizations o JOIN clan_season_teams t ON t.clan_id=o.id AND t.season_id=$1 WHERE o.id=$2 FOR SHARE OF o',[expectedSeasonId,expectedClanId]);
  check(clan?.name==='FM'&&Number(clan.is_active)===1,'FM identity changed');
  const accounts=await q('SELECT id,nickname,status,role,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
  check(accounts.length===22&&accounts.every(u=>u.status==='ACTIVE'),'Recipient accounts changed');
  const incoming=accounts.find(u=>Number(u.id)===incomingId);
  check(incoming?.nickname==='진짜디임','Incoming account identity changed');
  check(!(await q('SELECT 1 FROM clan_members WHERE season_id=$1 AND user_id=$2',[expectedSeasonId,incomingId])).length,'Incoming account already has a clan');
  check(!(await q('SELECT 1 FROM clan_season_teams WHERE season_id=$1 AND master_user_id=$2',[expectedSeasonId,incomingId])).length,'Incoming account is a clan master');
  check((await q("SELECT user_id FROM user_second_verifications WHERE user_id=$1 AND provider='PLAYDK' FOR SHARE",[incomingId])).length===1,'PLAYDK verification missing');
  check(!(await q('SELECT 1 FROM clan_draft_pool WHERE season_id=$1 AND user_id=$2',[expectedSeasonId,incomingId])).length,'Incoming draft state changed');
  check(!(await q("SELECT 1 FROM clan_war_battles WHERE season_id=$1 AND (attacker_user_id=$2 OR defender_user_id=$2) AND status IN ('PENDING','RESOLVING') LIMIT 1",[expectedSeasonId,incomingId])).length,'Incoming account is battling');
  check(!(await q('SELECT 1 FROM clan_war_reservation_locks l JOIN clan_wars w ON w.id=l.war_id WHERE w.season_id=$1 AND l.user_id=$2 AND l.expires_at::timestamptz>CURRENT_TIMESTAMP LIMIT 1',[expectedSeasonId,incomingId])).length,'Incoming account has a reservation');
  let [deckRow]=await q('SELECT p.card_ids FROM pvp_active_presets a JOIN pvp_deck_presets p ON p.user_id=a.user_id AND p.preset_no=a.preset_no WHERE a.user_id=$1 FOR SHARE OF a,p',[incomingId]);
  if(!deckRow)[deckRow]=await q('SELECT card_ids FROM pvp_decks WHERE user_id=$1 FOR SHARE',[incomingId]);
  const deck=JSON.parse(deckRow?.card_ids||'[]');
  check(Array.isArray(deck)&&deck.length===5&&new Set(deck.map(String)).size===5,'Ranked deck is not ready');
  const beforeMembers=await q('SELECT * FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id',[expectedSeasonId,expectedClanId]);
  check(pack(beforeMembers.map(m=>Number(m.user_id)))===pack(ids.filter(id=>id!==incomingId)),'FM recipients changed');
  const otherBefore=await q('SELECT * FROM clan_members WHERE season_id=$1 AND clan_id<>$2 ORDER BY clan_id,user_id',[expectedSeasonId,expectedClanId]);
  const [meta]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[clanRedraftKey(expectedSeasonId)]);
  const beforeRedraft=parseClanRedraft(meta?.value,expectedSeasonId);
  check(pack(beforeRedraft)===pack(expectedRedraft)&&clanMemberCapacity(season,expectedClanId,beforeRedraft)===21,'FM capacity metadata changed');
  const afterRedraft=structuredClone(beforeRedraft);
  afterRedraft.activeRosterOverrides={...afterRedraft.activeRosterOverrides,[String(expectedClanId)]:{maxMembers:22,operationId:FM_CAPACITY_OPERATION}};
  check(clanMemberCapacity(season,expectedClanId,parseClanRedraft(pack(afterRedraft),expectedSeasonId))===22,'Capacity validation failed');
  const [source]=await q("SELECT * FROM avatar_catalog_v1 WHERE code='T1_JOEUN' FOR SHARE");
  check(source&&Number(source.is_active)===1&&Number(source.is_public)===1,'T1 Joeun must be active/public');
  const sourceEffects=effectRows(await q("SELECT * FROM avatar_effect_options_v1 WHERE avatar_code='T1_JOEUN' ORDER BY option_order FOR SHARE"));
  check(pack(sourceEffects)===pack(FM_EXPECTED_EFFECTS)&&source.effect_type===catalog.effect_type&&Number(source.effect_value)===catalog.effect_value,'T1 Joeun options changed');
  check(!(await q('SELECT code,serial FROM avatar_catalog_v1 WHERE code=$1 OR serial=$2 FOR UPDATE',[catalog.code,catalog.serial])).length,'Avatar code or serial already exists without receipt');
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");
  check(owner,'Audit owner missing');
  const loadoutBefore=await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
  const [times]=await q("SELECT sqlite_now() acquired_at,to_char(timezone('UTC',CURRENT_TIMESTAMP)+interval '11 days','YYYY-MM-DD HH24:MI:SS') expires_at");
  const membership=await q("INSERT INTO clan_members(season_id,clan_id,user_id,member_role,preferred_role,draft_pick_no,joined_at,updated_at) VALUES($1,$2,$3,'MEMBER','BALANCED',0,$4,$4) RETURNING *",[expectedSeasonId,expectedClanId,incomingId,times.acquired_at]);
  const draftPool=await q("INSERT INTO clan_draft_pool(season_id,user_id,candidate_key,preferred_role,activity_window,deck_snapshot,status,drafted_clan_id,pick_no,registered_at,updated_at) VALUES($1,$2,$3,'BALANCED','FLEX',$4,'DRAFTED',$5,0,$6,$6) RETURNING *",[expectedSeasonId,incomingId,crypto.randomUUID(),pack(deck.map(String)),expectedClanId,times.acquired_at]);
  check(membership.length===1&&draftPool.length===1,'Admission row count mismatch');
  check((await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1 RETURNING key',[clanRedraftKey(expectedSeasonId),pack(afterRedraft)])).length===1,'Capacity write failed');
  const fields=Object.keys(catalog);
  await q('INSERT INTO avatar_catalog_v1('+fields.join(',')+') VALUES('+fields.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(catalog));
  for(const e of sourceEffects)await q('INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES($1,$2,$3,$4)',[catalog.code,e.option_order,e.effect_type,e.effect_value]);
  const granted=await q("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at) SELECT user_id,$3,'EVENT',$4,$5,$6 FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id RETURNING user_id",[expectedSeasonId,expectedClanId,catalog.code,FM_GRANT_KEY,times.acquired_at,times.expires_at]);
  check(pack(granted.map(r=>Number(r.user_id)).sort((a,b)=>a-b))===pack(ids),'Grant row count mismatch');
  const ownership=await q('SELECT user_id,source_ref,acquired_at,expires_at FROM avatar_user_ownership_v1 WHERE avatar_code=$1 ORDER BY user_id',[catalog.code]);
  check(ownership.length===22&&ownership.every((r,i)=>Number(r.user_id)===ids[i]&&r.source_ref===FM_GRANT_KEY&&r.acquired_at===times.acquired_at&&r.expires_at===times.expires_at),'Ownership verification failed');
  const afterMembers=await q('SELECT * FROM clan_members WHERE season_id=$1 AND clan_id=$2 ORDER BY user_id',[expectedSeasonId,expectedClanId]);
  check(pack(afterMembers.filter(m=>Number(m.user_id)!==incomingId))===pack(beforeMembers),'Existing FM members changed');
  check(pack(otherBefore)===pack(await q('SELECT * FROM clan_members WHERE season_id=$1 AND clan_id<>$2 ORDER BY clan_id,user_id',[expectedSeasonId,expectedClanId])),'Other clan members changed');
  check(pack(accounts)===pack(await q('SELECT id,nickname,status,role,coin FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids])),'Account or wallet changed');
  check(pack(loadoutBefore)===pack(await q('SELECT * FROM avatar_user_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids])),'Avatar loadout changed');
  const audit=async(action,type,id,before,after)=>{
   const [row]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,action,type,String(id),pack(before),pack({operationKey:FM_GRANT_KEY,actor:'CODEX_OPERATIONS',...after})]);check(row,'Audit missing');return String(row.id);
  };
  const capacityAuditId=await audit('CLAN_CAPACITY_ADJUSTMENT','CLAN',expectedClanId,{plan:beforeRedraft},{plan:afterRedraft,reason:'사용자 요청: 진짜디임 추가 편입에 필요한 FM 시즌 정원 21→22'});
  const assignmentAuditId=await audit('CLAN_MEMBER_ASSIGNMENT','USER',incomingId,{membership:null,draftPool:null},{membership:membership[0],draftPool:draftPool[0],reason:'사용자 요청: 진짜디임 FM 편입'});
  const result={ok:true,status:'COMPLETED',avatar:{code:catalog.code,serial:catalog.serial,name:catalog.name},clan:{id:expectedClanId,name:'FM',memberCount:22,maxMembers:22},seasonId:expectedSeasonId,
   admitted:{userId:incomingId,nickname:incoming.nickname},sourceAvatar:{code:source.code,version:Number(source.version)},effects:sourceEffects,granted:22,durationDays:11,acquiredAt:times.acquired_at,expiresAt:times.expires_at,
   recipients:accounts.map(u=>({userId:Number(u.id),nickname:u.nickname})),loadoutChanged:false,walletChanged:false,capacityAuditId,assignmentAuditId};
  result.grantAuditId=await audit('CLAN_AVATAR_TIMED_GRANT','AVATAR',catalog.code,{catalog:null,ownership:[]},result);
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[FM_GRANT_KEY,pack({status:'COMPLETED',beforeRedraft,result})]);
  if(dryRun)throw Object.assign(new Error('Dry run rollback'),{dryRunResult:{...result,dryRun:true,rolledBack:true}});
  return result;
 }).catch(error=>{if(error.dryRunResult)return error.dryRunResult;throw error});
 return result;
}
