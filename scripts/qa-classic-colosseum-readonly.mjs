import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {CLASSIC_GRADES,CLASSIC_KEYS,classicSettings} from '../shared/classic-colosseum-v1.mjs';
const output=process.env.CLASSIC_READONLY_OUTPUT;
if(!output)throw Error('CLASSIC_READONLY_OUTPUT is required');
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);
if(!uri.hostname.endsWith('.neon.tech')||uri.pathname!=='/cnine')throw Error('Unexpected database');
const client=new pg.Client({connectionString,application_name:'classic-colosseum-readonly-20261027',connectionTimeoutMillis:15000});
try{
 await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='20s'");
 const cards=(await client.query("SELECT c.rarity,COUNT(*)::integer AS count FROM cards_effective_v1210 c LEFT JOIN members m ON m.id=c.member_id WHERE c.is_active=1 AND c.rarity=ANY($1) AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' GROUP BY c.rarity ORDER BY c.rarity",[CLASSIC_GRADES])).rows;
 const magic=(await client.query('SELECT COUNT(*)::integer AS count FROM magic_cards WHERE is_active=1 AND scope_pvp=1')).rows[0].count;
 const rows=(await client.query("SELECT key,value FROM app_meta WHERE key LIKE 'classic_colosseum_%' ORDER BY key")).rows;
 const cfg=rows.find(r=>r.key===CLASSIC_KEYS.settings),settings=classicSettings(cfg?JSON.parse(cfg.value):null);
 const policy=(await client.query("SELECT key,value FROM app_meta WHERE key IN ('mercenary_blackcrown_ss_pack_v1','mercenary_bloodmoon_ss_pack_v1','magic_settings','card_unique_settings') ORDER BY key")).rows;
 const result={checkedAt:new Date().toISOString(),readOnly:(await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,settings,classicRows:rows.length,cards,magic,policyHashes:Object.fromEntries(policy.map(r=>[r.key,createHash('sha256').update(r.value).digest('hex')]))};
 await client.query('COMMIT');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Read-only verification failed:',error.message);process.exitCode=1;}finally{await client.end();}
