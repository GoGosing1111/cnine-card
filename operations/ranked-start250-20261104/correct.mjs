import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const OP='ops:ranked-start250:20261104:v1';
export const EXPECTED_PLAN_HASH='bec4cbe84f15f3382e8afd474ea135bf67c614ffb814f989e907ca71b52a6db3';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
export const profileSql='SELECT user_id::text,season_score::text,highest_score::text,wins::text,losses::text,updated_at FROM pvp_profiles ORDER BY pvp_profiles.user_id';
export const archiveSql='SELECT user_id::text,season_score::text,highest_score::text,wins::text,losses::text,updated_at FROM ranked_reform_profile_archive_v1 WHERE operation_key=$1 ORDER BY ranked_reform_profile_archive_v1.user_id';
export const readReceipt=async db=>{const row=(await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]))[0];return row?JSON.parse(row.value):null;};
export function validate(plan,expectedHash=EXPECTED_PLAN_HASH){
 assert.equal(hash(plan),expectedHash,'Reviewed plan changed');assert.equal(plan.operationKey,OP);assert.equal(plan.newScore,250);assert.equal(plan.initialScoreAlready250,true);
 assert.equal(plan.seasonKey,[plan.seasonName,plan.startsAt,plan.endsAt].join('|'));assert.equal(plan.targetCount,plan.targets.length);assert.equal(new Set(plan.targets.map(p=>String(p.user_id))).size,plan.targets.length);
}
export async function fence(db,plan){
 one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 // The application takes this settings row FOR SHARE before the profile row.
 // Taking it FOR UPDATE first serializes score commits. The table lock also
 // fences newly created profiles and every alternative profile writer.
 await db.query('LOCK TABLE pvp_season_lifecycle_lock_v1671 IN SHARE MODE');
 assert.equal((await q(db,"SELECT lock_key FROM pvp_season_lifecycle_lock_v1671 WHERE lease_until_ms>EXTRACT(EPOCH FROM clock_timestamp())*1000")).length,0,'Season lifecycle busy');
 const settings=await q(db,"SELECT key,value,updated_at FROM app_meta WHERE key IN ('pvp_settings_v1','tier_settings_v1') ORDER BY key FOR UPDATE");
 assert.deepEqual(settings,plan.settings,'Ranked settings changed after preflight');
 for(const row of settings){const value=JSON.parse(row.value),p=row.key==='pvp_settings_v1'?value:value.pvp;assert.equal(p.initialScore,250);assert.equal([p.seasonName,p.startsAt,p.endsAt].join('|'),plan.seasonKey);assert(p.enabled);}
 const clock=one(await q(db,'SELECT CURRENT_TIMESTAMP >= $1::timestamp AND CURRENT_TIMESTAMP < $2::timestamp AS active',[plan.startsAt,plan.endsAt]));assert(clock.active,'Season outside approved range');
 assert.equal((await q(db,'SELECT 1 FROM pvp_season_settlements WHERE season_key=$1',[plan.seasonKey])).length,0,'Current season settlement exists');
 await db.query('LOCK TABLE pvp_profiles IN SHARE ROW EXCLUSIVE MODE');
}
export async function state(db,plan){
 return {profiles:await q(db,profileSql),settings:await q(db,"SELECT key,value,updated_at FROM app_meta WHERE key IN ('pvp_settings_v1','tier_settings_v1') ORDER BY key"),
  sync:await q(db,"SELECT user_id::text,domains->>'pvp' AS pvp_revision FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY account_sync_versions_v1.user_id",[plan.targets.map(p=>p.user_id)]),
  archive:await q(db,archiveSql,[OP]),audits:await q(db,'SELECT id::text,admin_id::text,action_type,target_type,target_id,before_data,after_data,created_at FROM admin_logs WHERE target_id=$1 ORDER BY id',[OP]),receipt:await readReceipt(db)};
}
export async function eligibility(db,plan){
 return q(db,`SELECT p.user_id::text,p.season_score::text,p.highest_score::text,p.wins::text,p.losses::text,p.updated_at,
  EXISTS(SELECT 1 FROM pvp_match_history h WHERE h.attacker_id=p.user_id AND h.created_at>=$1 AND h.created_at<$2) AS history,
  EXISTS(SELECT 1 FROM ranked_fight_receipts_v1 r WHERE r.user_id=p.user_id AND r.created_at>=$1 AND r.created_at<$2) AS receipt,
  EXISTS(SELECT 1 FROM pvp_battle_audits_v1781 a WHERE a.attacker_id=p.user_id AND a.created_at>=$1 AND a.created_at<$2) AS audit
  FROM pvp_profiles p WHERE p.wins=0 AND p.losses=0 ORDER BY p.user_id`,[plan.startsAt,plan.endsAt]);
}
export async function verify(db,plan){
 const saved=await readReceipt(db);assert(saved);assert.equal(saved.operationKey,OP);assert.equal(saved.status,'COMPLETED');assert.equal(saved.planHash,hash(plan));assert.equal(saved.seasonKey,plan.seasonKey);
 const archive=await q(db,archiveSql,[OP]);assert.equal(archive.length,saved.correctedCount);assert.equal(hash(archive),saved.archiveHash);assert.deepEqual(archive.map(p=>p.user_id),saved.correctedIds);
 const audits=await q(db,'SELECT id::text,action_type,after_data FROM admin_logs WHERE target_id=$1 ORDER BY id',[OP]);assert.equal(audits.length,1);assert.equal(audits[0].id,saved.auditId);assert.equal(audits[0].action_type,'PVP_UNPLAYED_START_SCORE');
 const {auditId,...body}=saved;assert.deepEqual(JSON.parse(audits[0].after_data),body);
 assert.equal(saved.protectedBeforeHash,saved.protectedAfterHash);return {receipt:saved,archiveCount:archive.length,auditCount:audits.length};
}
export async function correct(db,plan,{expectedHash=EXPECTED_PLAN_HASH}={}){
 validate(plan,expectedHash);const old=await readReceipt(db);if(old)return {replayed:true,...await verify(db,plan)};
 const before=await state(db,plan);assert.equal(before.archive.length,0,'Orphan recovery archive');assert.equal(before.audits.length,0,'Orphan operation audit');assert.deepEqual(before.settings,plan.settings);
 const checked=await eligibility(db,plan);assert.deepEqual(checked.filter(p=>p.history||p.receipt||p.audit),[],'Zero-play counts contradict current-season attack records');
 const planned=new Map(plan.targets.map(p=>[String(p.user_id),p])),selected=checked.filter(p=>p.season_score!=='250'||p.highest_score!=='250'),ids=selected.map(p=>p.user_id),idSet=new Set(ids);
 assert(selected.length>0,'No score correction remains');
 for(const row of selected){const approved=planned.get(row.user_id);assert(approved,'Unreviewed target: '+row.user_id);for(const key of ['season_score','highest_score','wins','losses','updated_at'])assert.equal(row[key],String(approved[key]),'Target changed: '+row.user_id+' '+key);}
 const skipped=plan.targets.filter(p=>!idSet.has(String(p.user_id))).map(p=>String(p.user_id));
 for(const id of skipped){const row=before.profiles.find(p=>p.user_id===id);assert(row&&(Number(row.wins)>0||Number(row.losses)>0||(row.season_score==='250'&&row.highest_score==='250')),'Unexpected missing target');}
 const stamp=one(await q(db,"SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') AS sql,clock_timestamp() AS iso"));
 const archive=await q(db,`INSERT INTO ranked_reform_profile_archive_v1(operation_key,user_id,season_score,highest_score,wins,losses,updated_at)
  SELECT $1,user_id,season_score,highest_score,wins,losses,updated_at FROM pvp_profiles WHERE user_id=ANY($2::bigint[]) ORDER BY user_id RETURNING user_id::text`,[OP,ids]);assert.equal(archive.length,ids.length);
 const updated=await q(db,`UPDATE pvp_profiles SET season_score=250,highest_score=250,updated_at=$2
  WHERE user_id=ANY($1::bigint[]) AND wins=0 AND losses=0 AND season_score=1000 AND highest_score=1000 RETURNING user_id::text`,[ids,stamp.sql]);assert.equal(updated.length,ids.length,'Score compare-and-set failed');
 const after=await state(db,plan),protect=s=>s.profiles.filter(p=>!idSet.has(p.user_id));
 assert.deepEqual(protect(after),protect(before),'Existing participants changed');assert.deepEqual(after.settings,before.settings);
 assert.deepEqual(after.archive,before.profiles.filter(p=>idSet.has(p.user_id)),'Recovery archive mismatch');
 for(const id of ids){const row=one(after.profiles.filter(p=>p.user_id===id));assert.equal(row.season_score,'250');assert.equal(row.highest_score,'250');assert.equal(row.wins,'0');assert.equal(row.losses,'0');
  const a=one(after.sync.filter(p=>p.user_id===id)),b=before.sync.find(p=>p.user_id===id);assert(BigInt(a.pvp_revision)>BigInt(b?.pvp_revision||0));}
 const receipt={status:'COMPLETED',operationKey:OP,planHash:hash(plan),seasonKey:plan.seasonKey,newScore:250,completedAt:new Date(stamp.iso).toISOString(),correctedCount:ids.length,correctedIds:ids,skippedAfterPlayOrAlreadyCorrect:skipped,archiveHash:hash(after.archive),protectedBeforeHash:hash(protect(before)),protectedAfterHash:hash(protect(after)),settingsHash:hash(after.settings),initialScoreAlready250:true,settingsWrites:0,accountSyncCount:ids.length,messagesSent:0};
 receipt.auditId=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,'PVP_UNPLAYED_START_SCORE','PVP_CURRENT_SEASON',$1,$2,$3,$4) RETURNING id::text",[OP,JSON.stringify({seasonKey:plan.seasonKey,score:1000,highestScore:1000,count:ids.length,archiveHash:receipt.archiveHash,protectedHash:receipt.protectedBeforeHash}),JSON.stringify(receipt),stamp.sql])).id;
 one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(receipt),stamp.sql]));
 return {replayed:false,...await verify(db,plan)};
}
