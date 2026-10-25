import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
const [destination]=process.argv.slice(2);assert(destination);
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'clan-eight-readonly-20261025',connectionTimeoutMillis:15000});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const rounds=(await db.query("SELECT * FROM organization_rounds_v1 WHERE scope='LIVE'")).rows;assert.equal(rounds.length,1);const round=rounds[0];
 const names=['organization_members_v1','organization_surveys_v1','organization_progress_v1','organization_faction_treasury_v1','organization_faction_state_v1','organization_faction_days_v1','organization_faction_settlements_v1'],rows={},tables={};
 for(const table of names){rows[table]=(await db.query('SELECT * FROM '+table+' WHERE round_id=$1 ORDER BY row_to_json('+table+')::text',[round.id])).rows;tables[table]={count:rows[table].length,sha256:hash(rows[table])};}
 const state=JSON.parse(rows.organization_faction_state_v1[0]?.state_json||'{}');
 const clans=Array.from({length:8},(_,i)=>{const id=i+1,m=rows.organization_members_v1.filter(m=>Number(m.organization_id)===id),fund=rows.organization_faction_treasury_v1.find(m=>Number(m.organization_id)===id),progress=rows.organization_progress_v1.find(m=>Number(m.organization_id)===id);return {id,members:m.length,totalSeedPower:m.reduce((n,p)=>n+Number(p.seed_power),0),treasury:fund?{balance:String(fund.balance),totalEarned:String(fund.total_earned)}:null,progress:progress?{stage:Number(progress.stage),points:String(progress.points)}:null,elderCount:(state.elders?.[id]||[]).length,districts:(state.districts||[]).filter(d=>Number(d.owner)===id).length};});
 const applications=(await db.query('SELECT value FROM app_meta WHERE left(key,length($1))=$1',['organization-join:'+round.id+':'])).rows.map(r=>JSON.parse(r.value));
 const policy=(await db.query('SELECT revision,policy_json FROM organization_faction_policy_v1 WHERE id=1')).rows[0];
 const result={checkedAt:new Date().toISOString(),readOnly:true,round,clans,pendingApplications:applications.filter(a=>a.status==='PENDING').length,applicationsHash:hash(applications),tables,factionPolicy:policy?{revision:policy.revision,value:JSON.parse(policy.policy_json)}:null,session:state.session?{status:state.session.status,key:state.session.key}:null};
 await db.query('ROLLBACK');fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({round:round.id,phase:round.phase,clans,pendingApplications:result.pendingApplications,readOnly:true}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
