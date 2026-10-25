import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
const [destination]=process.argv.slice(2);assert(destination);
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'clan-reshuffle-history-readonly',connectionTimeoutMillis:15000});
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='40s'");
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const roundId='e5421b84-8888-4027-8a36-f58d7f033ab1';
 const members=await q('SELECT m.*,u.nickname,u.status FROM organization_members_v1 m JOIN users u ON u.id=m.user_id WHERE m.round_id=$1 ORDER BY m.user_id',[roundId]);
 const ids=members.map(m=>Number(m.user_id));
 const profiles=await q('SELECT p.user_id,p.power,p.source_version,p.policy_revision,p.expires_at,p.payload_json,a.source_version current_source,v.revision current_policy FROM ranked_duo_profiles_v1 p JOIN ranked_duo_accounts_v1 a ON a.user_id=p.user_id CROSS JOIN ranked_duo_policy_version_v1 v WHERE v.id=1 AND p.user_id=ANY($1::bigint[]) ORDER BY p.user_id',[ids]);
 const regularHistory=await q('SELECT m.*,s.season_no,s.phase,s.starts_at,s.ends_at FROM clan_members m JOIN clan_seasons s ON s.id=m.season_id WHERE m.user_id=ANY($1::bigint[]) ORDER BY m.season_id,m.user_id',[ids]);
 const orgHistory=await q('SELECT m.*,r.scope,r.name FROM organization_members_v1 m JOIN organization_rounds_v1 r ON r.id=m.round_id WHERE m.user_id=ANY($1::bigint[]) ORDER BY m.round_id,m.user_id',[ids]);
 const receipts=await q("SELECT key,value FROM app_meta WHERE key LIKE 'ops:organization-%' OR key LIKE 'ops:clan-%' ORDER BY key");
 const state=(await q('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1',[roundId]))[0];
 const schema=await q("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND (table_name LIKE 'clan_%' OR table_name='organization_ratings_v1') ORDER BY table_name,ordinal_position");
 const result={checkedAt:new Date().toISOString(),readOnly:true,roundId,members,profiles,regularHistory,orgHistory,receipts,catalog:await q('SELECT id,name,mark_key FROM clan_organizations ORDER BY id'),state,schema};
 await db.query('ROLLBACK');fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({members:members.length,profiles:profiles.length,currentProfiles:profiles.filter(p=>p.source_version===p.current_source&&p.policy_revision===p.current_policy).length,profileRange:[Math.min(...profiles.map(p=>Number(p.power))),Math.max(...profiles.map(p=>Number(p.power)))],seedRange:[Math.min(...members.map(p=>Number(p.seed_power))),Math.max(...members.map(p=>Number(p.seed_power)))],regularSeasons:[...new Set(regularHistory.map(m=>m.season_id))],receipts:receipts.map(r=>({key:r.key,bytes:r.value.length,fields:Object.keys(JSON.parse(r.value))})),catalog:result.catalog}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
