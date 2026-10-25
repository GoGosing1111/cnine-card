import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {verifyResume,ROUND_ID} from '../../../scripts/ops/clan-resume-20261025.mjs';
import {ORGANIZATIONS} from '../../../shared/organization-system-v1.mjs';
const [destination]=process.argv.slice(2);assert(destination);
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'clan-resume-public-roster-readonly',connectionTimeoutMillis:15000});
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const proof=await verifyResume(db),receipt=proof.receipt;
 const previous=JSON.parse((await db.query("SELECT value FROM app_meta WHERE key='ops:organization-eight-balanced:20261025:v1'")).rows[0].value);
 const state=JSON.parse((await db.query('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[ROUND_ID])).rows[0].state_json);
 const rows=(await db.query('SELECT m.user_id,m.organization_id,m.slot,u.nickname FROM organization_members_v1 m JOIN users u ON u.id=m.user_id WHERE m.round_id=$1 ORDER BY m.organization_id,m.slot',[ROUND_ID])).rows;
 assert.equal(rows.length,128,'Roster changed; review the publication snapshot');assert.equal(new Set(rows.map(r=>String(r.user_id))).size,128);assert(rows.every(r=>typeof r.nickname==='string'&&r.nickname.trim()));
 const clans=ORGANIZATIONS.map(o=>({...o,members:rows.filter(r=>Number(r.organization_id)===o.id).map(r=>{const before=previous.before.members.find(m=>String(m.user_id)===String(r.user_id));assert(before);return {nickname:r.nickname,slot:Number(r.slot),elder:state.elders[o.id].includes(Number(r.user_id)),previousClan:ORGANIZATIONS.find(o=>o.id===Number(before.organization_id)).name,moved:Number(before.organization_id)!==o.id};})}));
 const result={checkedAt:new Date().toISOString(),effectiveAt:receipt.completedAt,memberCount:128,clanCount:8,capacity:200,seasonNumber:4,regularStarts:receipt.wars.filter(w=>Number(w.clan_a_id)===1||Number(w.clan_b_id)===1).map(w=>w.starts_at),regularEndsAt:proof.regularEndAt,factionSchedule:receipt.schedule,moved:clans.flatMap(c=>c.members).filter(m=>m.moved).length,clans};
 await db.query('ROLLBACK');fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({members:128,clans:8,moved:result.moved,displayNamesOnly:true,readOnly:true}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
