import assert from 'node:assert/strict';
import fs from 'node:fs';
import {connect} from 'file:///C:/Users/User/Downloads/upload/cnine-card/output/territory-finish-rewards-20261022/connect.mjs';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
import {handleClan} from '../../../functions/_clan.js';
const db=await connect(),checks=[];let queries=0;
try{
 await db.query('BEGIN READ ONLY');
 const DB=new __postgresCompatTest.PostgresD1Database({query(input){
  const sql=typeof input==='string'?input:input.text;
  if(!/^\s*SELECT\b/i.test(sql))throw Error('Read-only validation rejected non-SELECT');
  queries++;return db.query(input);
 }});
 const owner=(await db.query("SELECT id,role FROM users WHERE role='OWNER' LIMIT 1")).rows[0];assert.ok(owner);
 const member=(await db.query("SELECT u.id,u.role FROM users u JOIN clan_members m ON m.user_id=u.id WHERE u.role='USER' ORDER BY m.season_id DESC LIMIT 1")).rows[0];assert.ok(member);
 for(const [path,user] of [['clan/overview',member],['clan/overview',owner],['admin/clan-war/settings',owner]]){
  const response=await handleClan({path,request:new Request('https://example.test/api/'+path),env:{DB},deps:{authenticate:async()=>user,isAdminRole:u=>u.role==='OWNER',json:(body,status=200,headers={})=>Response.json(body,{status,headers})}});
  const data=await response.json();assert.equal(response.status,200);assert.equal(data.restoration.scheduleLocked,true);assert.equal(data.season.registrationOpen,false);
  checks.push({path,role:user.role,status:response.status,locked:true,seasonNo:data.season.seasonNo,phase:data.season.phase,champions:data.champions.status,rewardStatus:data.champions.rewardStatus,teams:(data.teams||data.organizations||[]).length});
 }
}finally{await db.query('ROLLBACK');await db.end();}
const report={checks,queries,writes:0};fs.writeFileSync('C:/Users/User/Downloads/upload/cnine-card/output/clan-restore-lock-20261025/live-readonly.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
