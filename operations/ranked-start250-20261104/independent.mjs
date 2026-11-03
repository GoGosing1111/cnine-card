import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const plan=JSON.parse(await fs.readFile(new URL('./plan.json',import.meta.url),'utf8'));
const commit=JSON.parse(await fs.readFile(new URL('./evidence/commit-candidate.json',import.meta.url),'utf8'));
const sources=JSON.parse(await fs.readFile(new URL('./runtime-sources.json',import.meta.url),'utf8'));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),db=connect();let selectOnlyQueries=0;
try{
 db.connectionParameters.application_name='ranked-start250-independent';await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='25s'");
 const q=async(sql,args=[])=>{assert.match(sql,/^SELECT\b/);assert(!/FOR UPDATE|FOR SHARE|pg_advisory/i.test(sql));selectOnlyQueries++;return (await db.query(sql,args)).rows;};
 assert.equal((await q("SELECT current_setting('transaction_read_only') mode"))[0].mode,'on');
 const receipt=JSON.parse((await q('SELECT value FROM app_meta WHERE key=$1',[plan.operationKey]))[0].value);assert.deepEqual(receipt,commit.receipt);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.correctedCount,1886);
 const settings=await q("SELECT key,value,updated_at FROM app_meta WHERE key IN ('pvp_settings_v1','tier_settings_v1') ORDER BY key");assert.deepEqual(settings,plan.settings);
 const pvp=JSON.parse(settings[0].value),tier=JSON.parse(settings[1].value);assert.equal(pvp.initialScore,250);assert.equal(tier.pvp.initialScore,250);assert.equal([pvp.seasonName,pvp.startsAt,pvp.endsAt].join('|'),plan.seasonKey);
 const rows=await q('SELECT user_id::text,season_score::text,highest_score::text,wins::text,losses::text,updated_at FROM pvp_profiles ORDER BY pvp_profiles.user_id');
 const unplayed=rows.filter(r=>r.wins==='0'&&r.losses==='0');assert(unplayed.every(r=>r.season_score==='250'&&r.highest_score==='250'),'Unplayed score mismatch remains');
 const changed=new Set(receipt.correctedIds),protectedBefore=commit.before.profiles.filter(r=>!changed.has(r.user_id)),protectedAfter=commit.after.profiles.filter(r=>!changed.has(r.user_id));assert.deepEqual(protectedAfter,protectedBefore);assert.equal(hash(protectedAfter),receipt.protectedAfterHash);
 const archived=await q('SELECT user_id::text,season_score::text,highest_score::text,wins::text,losses::text,updated_at FROM ranked_reform_profile_archive_v1 WHERE operation_key=$1 ORDER BY ranked_reform_profile_archive_v1.user_id',[plan.operationKey]);assert.deepEqual(archived,commit.before.profiles.filter(r=>changed.has(r.user_id)));assert.equal(hash(archived),receipt.archiveHash);
 const audit=await q('SELECT id::text,action_type,after_data FROM admin_logs WHERE target_id=$1',[plan.operationKey]);assert.equal(audit.length,1);assert.equal(audit[0].id,receipt.auditId);assert.equal(audit[0].action_type,'PVP_UNPLAYED_START_SCORE');const {auditId,...body}=receipt;assert.deepEqual(JSON.parse(audit[0].after_data),body);
 const sync=await q("SELECT user_id::text,domains->>'pvp' AS pvp_revision FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY account_sync_versions_v1.user_id",[receipt.correctedIds]);assert.equal(sync.length,1886);
 for(const s of sync){const a=commit.after.sync.find(r=>r.user_id===s.user_id);assert(BigInt(s.pvp_revision)>=BigInt(a.pvp_revision));}
 const sqlTime=receipt.completedAt.replace('T',' ').slice(0,19),playedAfterCorrection=rows.filter(r=>changed.has(r.user_id)&&(Number(r.wins)>0||Number(r.losses)>0));
 for(const p of playedAfterCorrection){const history=await q('SELECT attacker_score_before,attacker_score_after FROM pvp_match_history WHERE attacker_id=$1 AND created_at>=$2 ORDER BY id',[p.user_id,sqlTime]);assert(history.length>0);assert.equal(Number(history[0].attacker_score_before),250);assert.equal(Number(history.at(-1).attacker_score_after),Number(p.season_score));}
 const src=sources['functions/api/[[path]].js'];const names=['defaultPvpSettings','cleanPvpRewardCoin','cleanPvpSettings','readPvpSettings','ensurePvpProfile','pvpSeasonNumber','pvpSqlUtc','nextPvpSeasonSettings'];
 const code=names.map(n=>{const l=src.split('\n').find(l=>l.startsWith('function '+n+'(')||l.startsWith('async function '+n+'('));assert(l,n);return l;}).join('\n');
 const runtime=Function('normalizeRankedRechargeMinutes',code+'\nreturn {read:readPvpSettings,profile:ensurePvpProfile,next:nextPvpSeasonSettings};')((v,d)=>Number(v??d));
 const env={DB:{prepare(sql){const bound=values=>({first:async()=>{let i=0;return (await q(sql.replaceAll('?',()=>'$'+(++i)),values))[0];},run:()=>{throw Error('Read-only verification forbids profile creation');}});return {...bound([]),bind:(...values)=>bound(values)};}}};
 const effective=await runtime.read(env);assert.equal(effective.initialScore,250);assert.equal(runtime.next(effective).initialScore,250);
 const sample=unplayed.find(p=>changed.has(p.user_id));assert(sample);const profile=await runtime.profile(env,{id:sample.user_id},effective);assert.equal(Number(profile.season_score),250);assert.equal(Number(profile.highest_score),250);
 const locks=await q("SELECT pid FROM pg_stat_activity WHERE application_name IN ('ranked-start250-apply','ranked-start250-rehearse','ranked-start250-lock-proof') AND pid<>pg_backend_pid()");assert.equal(locks.length,0);
 const writes=await q('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0');assert.deepEqual(writes,[]);
 await db.query('ROLLBACK');const result={status:'INDEPENDENTLY_VERIFIED',operationKey:plan.operationKey,seasonKey:plan.seasonKey,correctedCount:receipt.correctedCount,auditId,completedAt:receipt.completedAt,currentUnplayedCount:unplayed.length,unplayedScoreMismatch:0,protectedPlayedAtCommit:protectedBefore.filter(p=>Number(p.wins)>0||Number(p.losses)>0).length,playedAfterCorrection:playedAfterCorrection.length,initialScore:250,nextSeasonInitialScore:250,actualSettingsAndExistingProfileRead:true,settingsUnchanged:true,archiveCount:archived.length,accountSyncVerified:sync.length,operationSessionsRemaining:0,independentReadOnly:true,selectOnlyQueries,productionWrites:0,checkedAt:new Date().toISOString()};
 await fs.writeFile(new URL('./evidence/independent.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,4).join('\n'));process.exitCode=1;}finally{await db.end().catch(()=>{});}
