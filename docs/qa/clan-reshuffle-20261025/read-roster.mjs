import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {verifyReshuffle,ROUND_ID} from '../../../scripts/ops/clan-reshuffle-20261025.mjs';
import {ORGANIZATIONS} from '../../../shared/organization-system-v1.mjs';
const [destination]=process.argv.slice(2);assert(destination);
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'clan-reshuffle-public-roster-readonly',connectionTimeoutMillis:15000});
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const proof=await verifyReshuffle(db),receipt=proof.receipt;
 const resumed=JSON.parse((await db.query("SELECT value FROM app_meta WHERE key='ops:clan-resume:20261025:v1'")).rows[0].value);
 const rows=(await db.query('SELECT m.user_id,m.organization_id,m.slot,u.nickname FROM organization_members_v1 m JOIN users u ON u.id=m.user_id WHERE m.round_id=$1 ORDER BY m.organization_id,m.slot',[ROUND_ID])).rows;
 assert.equal(rows.length,128);assert.equal(new Set(rows.map(r=>Number(r.user_id))).size,128);assert(rows.every(r=>r.nickname?.trim()));
 const clans=ORGANIZATIONS.map(o=>({...o,power:receipt.plan.stats.after.find(t=>t.id===o.id).power,members:rows.filter(r=>Number(r.organization_id)===o.id).map(r=>{const p=receipt.plan.assignments.find(p=>p.userId===Number(r.user_id));assert(p);return {nickname:r.nickname,slot:Number(r.slot),elder:receipt.elders[o.id].includes(p.userId),previousClan:ORGANIZATIONS.find(o=>o.id===p.currentClan).name,moved:p.currentClan!==p.clanId,fixed:p.fixed,unvisited:p.unvisited};})}));
 const result={checkedAt:new Date().toISOString(),effectiveAt:receipt.completedAt,memberCount:128,clanCount:8,capacity:200,seasonNumber:4,regularStarts:resumed.wars.filter(w=>Number(w.clan_a_id)===1||Number(w.clan_b_id)===1).map(w=>w.starts_at),regularEndsAt:resumed.wars.at(-1).ends_at,factionSchedule:resumed.schedule,moved:127,unvisitedMoves:127,evaluatedAt:receipt.plan.evaluatedAt,powerRangePercent:receipt.plan.stats.afterRangePercent,clans};
 assert.equal(clans.flatMap(c=>c.members).filter(m=>m.elder).length,24);assert.equal(clans.flatMap(c=>c.members).filter(m=>m.moved).length,127);
 await db.query('ROLLBACK');fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({members:128,clans:8,moved:127,unvisitedMoves:127,elders:24,displayNamesOnly:true,readOnly:true}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
