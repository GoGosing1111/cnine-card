import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
// Expose existing internal evaluation functions in this read-only process only.
// No source file, live handler, schema, account or live profile cache is changed.
registerHooks({load(url,context,next){const result=next(url,context);const p=decodeURI(new URL(url).pathname);
 if(p.endsWith('/functions/api/[[path]].js'))return {...result,source:result.source+'\nexport const __reshuffleDeps={readBattleSettings,cardBattlePower,battleEngineState,cardUniqueDeckStates,evaluateDeckSynergiesBatch,duoMagicLoadouts};\n'};
 if(p.endsWith('/functions/_ranked_duo_profiles.js'))return {...result,source:result.source+'\nexport {rebuild as __reshuffleRebuild};\n'};
 return result;
}});
const {__reshuffleDeps:deps}=await import('../../../functions/api/[[path]].js');
const {__reshuffleRebuild:rebuild,duoVersions}=await import('../../../functions/_ranked_duo_profiles.js');
const {readForgeAdvancedPolicy}=await import('../../../functions/_equipment_forge_advanced.js');
const {avatarBattlePowerPercents}=await import('../../../functions/_avatar_power.js');
const {avatarScaledPower}=await import('../../../shared/avatar-power-v1.mjs');
const [input,destination]=process.argv.slice(2);assert(input&&destination);const history=JSON.parse(fs.readFileSync(input));
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const client=new pg.Client({connectionString,application_name:'clan-reshuffle-power-readonly',connectionTimeoutMillis:15000});
try{
 await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='40s'");
 const DB=new __postgresCompatTest.PostgresD1Database(client),execute=DB.execute.bind(DB),captured=[];
 DB.execute=statement=>{assert.match(statement.source.trim(),/^(SELECT|WITH)\b/i,'Evaluation attempted a live write: '+statement.source.slice(0,120));assert.doesNotMatch(statement.source,/\b(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i);return execute(statement);};
 DB.batch=async statements=>{
  if(statements.every(s=>/^INSERT INTO ranked_duo_profiles_v1\(/.test(s.source))){captured.push(...statements);return statements.map(()=>({success:true,meta:{changes:0}}));}
  return Promise.all(statements.map(s=>DB.execute(s)));
 };
 DB.execSchema=async statements=>{for(const sql of statements){const table=/CREATE TABLE IF NOT EXISTS\s+(\w+)/i.exec(sql)?.[1];if(table)assert((await client.query('SELECT to_regclass($1) table_name',[table])).rows[0].table_name,'Required existing table missing: '+table);else assert.match(sql,/^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/i);}};
 const now=Date.now(),env={DB},advanced=await readForgeAdvancedPolicy(DB),ids=history.members.map(m=>Number(m.user_id)),ratings=[];
 for(let start=0;start<ids.length;start+=12){
  const batch=ids.slice(start,start+12),versions=await duoVersions(env,batch);
  assert.equal(versions.length,batch.length);assert(versions.every(v=>v.status==='ACTIVE'));
  const profiles=await rebuild(env,versions,{mercenaryWeights:{}},deps,'READONLY_RESHUFFLE',now,advanced);
  assert.equal(profiles.length,batch.length);
  const avatar=await avatarBattlePowerPercents(env,batch);
  for(const p of profiles)ratings.push({userId:p.userId,nickname:p.nickname,power:avatarScaledPower(p.power,avatar.get(p.userId)||0),unscaledPower:p.power,avatarPowerPercent:avatar.get(p.userId)||0,sourceVersion:p.sourceVersion,policyRevision:p.policyRevision,advancedForgeRevision:advanced.revision,expiresAt:p.expiresAt,breakdown:p.breakdown});
  console.log(JSON.stringify({evaluated:ratings.length,total:ids.length,readOnly:true}));
 }
 assert.equal(captured.length,ids.length);ratings.sort((a,b)=>a.userId-b.userId);
 const output={evaluatedAt:new Date(now).toISOString(),completedAt:new Date().toISOString(),basis:'ACCOUNT_POTENTIAL_V1; actual runtime, strongest eligible five cards + gear/vehicle/title + PVP-eligible mercenary skills/growth + avatar',readOnly:true,liveWrites:0,capturedCacheWrites:captured.length,sourceFiles:[],ratings};
 for(const file of ['functions/_ranked_duo_profiles.js','functions/api/[[path]].js','functions/_mercenary_level_policy.js','functions/_avatar_power.js'])output.sourceFiles.push({file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
 await client.query('ROLLBACK');fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});fs.writeFileSync(destination,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({complete:true,count:ratings.length,total:ratings.reduce((n,r)=>n+r.power,0),top:ratings.toSorted((a,b)=>b.power-a.power).slice(0,8).map(r=>({name:r.nickname,power:r.power})),liveWrites:0}));
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(String(error.stack).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await client.end();}
