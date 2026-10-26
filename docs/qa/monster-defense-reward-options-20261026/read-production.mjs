import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{Client}=require('pg'),out=path.resolve(process.argv[2]);
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);assert(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine');
const db=new Client({connectionString,application_name:'defense-reward-options-readonly',connectionTimeoutMillis:15000}),hash=b=>createHash('sha256').update(b).digest('hex');
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 const rows=(await db.query("SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key",[['monster_defense_settings_v1','cooperative_battleground_settings_v1']])).rows;
 const catalog=(await db.query('SELECT code,name,rarity,image_url FROM inventory_items WHERE is_active=1 ORDER BY code LIMIT 1001')).rows;assert(catalog.length<=1000);
 await db.query('ROLLBACK');const settings=JSON.parse(rows.find(r=>r.key==='monster_defense_settings_v1')?.value||'null');
 const report={checkedAt:new Date().toISOString(),readOnly:true,settingsHash:hash(JSON.stringify(rows)),settings:settings?{revision:settings.revision,mode:settings.mode,rewardsEnabled:settings.rewardsEnabled,testerCount:settings.testUserIds.length,difficulties:settings.difficulties.map(d=>({id:d.id,enabled:d.enabled,clearReward:d.clearReward}))}:null,catalog,operationalWrites:0};
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({mode:settings?.mode,revision:settings?.revision,rewardsEnabled:settings?.rewardsEnabled,difficulties:report.settings?.difficulties,catalog:catalog.length,settingsHash:report.settingsHash,readOnly:true}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.stack||error).replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]'));process.exitCode=1;}finally{await db.end();}
