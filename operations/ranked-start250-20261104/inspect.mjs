import fs from 'node:fs/promises';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const db=connect();
try {
 db.connectionParameters.application_name='ranked-start250-readonly';await db.connect();
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='25s'");
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const settings=await q("SELECT key,value,updated_at FROM app_meta WHERE key IN ('pvp_settings_v1','tier_settings_v1','ranked_reopen_schedule_v1','ops:ranked-start250:20261104:v1') ORDER BY key");
 const schema=await q("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('pvp_profiles','pvp_match_history','ranked_fight_receipts_v1','ranked_reform_fight_receipts_v1','admin_logs','account_sync_versions_v1','ranked_reform_profile_archive_v1') ORDER BY table_name,ordinal_position");
 const tables=await q("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE '%ranked%' OR tablename LIKE '%pvp%') ORDER BY tablename");
 const profileCounts=await q("SELECT p.wins=0 AND p.losses=0 unplayed,p.season_score,p.highest_score,u.status,u.role,COUNT(*)::int count FROM pvp_profiles p JOIN users u ON u.id=p.user_id GROUP BY 1,2,3,4,5 ORDER BY 1 DESC,6 DESC LIMIT 50");
 const settlements=await q('SELECT id::text,season_key,status,started_at,completed_at FROM pvp_season_settlements ORDER BY id DESC LIMIT 4');
 const receipts=await q("SELECT key FROM app_meta WHERE key LIKE 'ops:%rank%250%' OR key LIKE 'ops:%rank%initial%' OR key LIKE 'ops:%pvp%250%' ORDER BY key");
 const triggers=await q("SELECT event_object_table,trigger_name,action_statement FROM information_schema.triggers WHERE event_object_table IN ('pvp_profiles','app_meta') ORDER BY event_object_table,trigger_name");
 const result={checkedAt:new Date().toISOString(),settings,schema,tables,profileCounts,settlements,receipts,triggers};
 await fs.writeFile(new URL('./inspect.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 await db.query('ROLLBACK'); console.log(JSON.stringify(result));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
