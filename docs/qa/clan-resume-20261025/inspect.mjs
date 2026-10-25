import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
const out=process.argv[2];
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),u=new URL(connectionString);
if(!u.hostname.endsWith('.neon.tech')||u.pathname!=='/cnine')throw Error('Unexpected DB');
const db=new pg.Client({connectionString,application_name:'clan-resume-readonly',connectionTimeoutMillis:15000});
try {
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const q=async(s,p=[])=>(await db.query(s,p)).rows;
 const result={checkedAt:new Date().toISOString(),
  departure:await q("SELECT u.id,u.nickname,u.status,m.round_id,m.organization_id,m.slot FROM users u LEFT JOIN organization_members_v1 m ON m.user_id=u.id WHERE lower(u.nickname)=lower($1) OR u.nickname LIKE $2",['란x2','%란%2%']),
  meta:await q("SELECT key,value FROM app_meta WHERE key IN ('clan_settings_v1','clan_retirement_20261012_v1','clan_retirement_20261012_v1:completed','organization_faction_policy_v1','organization_policy_v1','clan_reform_v1')"),
  seasons:await q('SELECT * FROM clan_seasons ORDER BY season_no DESC LIMIT 3'),
  catalog:await q('SELECT * FROM clan_organizations ORDER BY id'),
  wars:await q("SELECT season_id,status,min(starts_at),max(ends_at),count(*) FROM clan_wars GROUP BY season_id,status ORDER BY season_id DESC"),
  rounds:await q("SELECT * FROM organization_rounds_v1 WHERE scope='LIVE' ORDER BY created_at DESC LIMIT 1"),
  tables:await q("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE 'organization%policy%' OR table_name LIKE 'clan%') ORDER BY table_name")};
 const rid=result.rounds[0].id;
 result.faction=await q('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1',[rid]);
 result.members=await q('SELECT * FROM organization_members_v1 WHERE round_id=$1 ORDER BY organization_id,slot',[rid]);
 result.days=await q('SELECT * FROM organization_faction_days_v1 WHERE round_id=$1 ORDER BY day_key DESC LIMIT 3',[rid]);
 result.policy=await q('SELECT * FROM organization_faction_policy_v1');
 await db.query('ROLLBACK');
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'inspect.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({departure:result.departure,seasons:result.seasons.map(s=>({id:s.id,season_no:s.season_no,phase:s.phase})),memberCount:result.members.length,policy:result.policy},null,2));
}catch(e){console.error(e.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[withheld]'));process.exitCode=1;}finally{await db.end();}
