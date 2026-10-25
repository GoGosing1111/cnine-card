import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const root='C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site',require=createRequire(path.join(root,'package.json')),pg=require('pg'),imp=f=>import(pathToFileURL(path.join(root,f)));
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);assert(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'razak-balance-post-release-readonly',connectionTimeoutMillis:15000}),hash=b=>createHash('sha256').update(b).digest('hex');
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 const {__postgresCompatTest}=await imp('functions/_postgres_d1_compat.js'),env={DB:new __postgresCompatTest.PostgresD1Database({query:arg=>db.query(arg)})};
 const {readMercenaryDocument,readMercenaryRuntime,battleConfig}=await imp('functions/_mercenary_account.js'),{readMercenaryLevelPolicy}=await imp('functions/_mercenary_level_policy.js');
 const {ALL_LIMITED_MERCENARIES}=await imp('shared/mercenary-limited-catalog-v1.mjs'),{LIMITED_SHARD_CRAFTS}=await imp('shared/mercenary-limited-shard-craft-v1.mjs');
 const {document,revision}=await readMercenaryDocument(env),runtime=await readMercenaryRuntime(env),level=await readMercenaryLevelPolicy(env);
 const codes=[...new Set([...document.mercenaries.filter(c=>['SS','SSS'].includes(c.rank)).map(c=>c.code),...ALL_LIMITED_MERCENARIES.map(c=>c.code),...LIMITED_SHARD_CRAFTS.map(c=>c.code),'V-058'])];
 const roster=codes.map(code=>({...battleConfig(document,code,1),combat:runtime.combat}));
 const settings=(await db.query("SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key",[['mercenary_level_policy_v1','mercenary_bloodmoon_ss_pack_v1','mercenary_runtime_policy_v1']])).rows;
 await db.query('ROLLBACK');
 const publicResponse=await fetch('https://cnine-card.pages.dev/api/mercenary-codex?verify=razak-balance-20261026',{signal:AbortSignal.timeout(30000)});assert(publicResponse.ok);const publicCard=(await publicResponse.json()).cards.find(c=>c.code==='V-058');assert(publicCard);assert.equal(publicCard.basePower,1000000);
 const result={checkedAt:new Date().toISOString(),readOnly:true,accountWrites:0,cmsRevision:revision,policyRevision:level.policy.revision,growth:level.policy.growth,combat:runtime.combat,settingsHash:hash(JSON.stringify(settings)),publicCard:{code:publicCard.code,name:publicCard.name,rank:publicCard.rank,edition:publicCard.edition,basePower:publicCard.basePower},roster};
 const out=process.argv[2];fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'live-after.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({cmsRevision:revision,growthRevision:level.policy.revision,publicCard:result.publicCard,roster:roster.map(c=>({code:c.code,name:c.name,rank:c.rank,edition:c.edition}))}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.stack||e).replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]'));process.exitCode=1;}finally{await db.end();}
