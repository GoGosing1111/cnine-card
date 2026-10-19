import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {installOrganizationFactionSchema} from '../functions/_organization_faction.js';
import {newOrganizationFactionState} from '../functions/_organization_faction_model.js';
import {organizationElderIds,rankedOrganizationElders,validateOrganizationElders} from '../shared/organization-faction-v1.mjs';
import {appointOrganizationElders,ROUND_ID,OPERATION_KEY} from '../scripts/ops/organization-elders-20261019.mjs';
const formation={attack3:[],attack4:[],attack5:[],defense3:[],defense4:[],defense5:[],attack1:[5],attack2:[],defense1:[6],defense2:[]};
const setElders=(f,userIds,baseUserIds=[2],extra={})=>f.post('admin/organization/faction/elders',{organizationId:1,userIds,baseUserIds,...extra},1);
const ok=result=>assert.equal(result.status,200,JSON.stringify(result));

test('top three use evaluated power with stable ties and exclude inactive members; empty lists override legacy roles',()=>{
 const roster=[{userId:2,clanId:1,status:'ACTIVE',slot:1,seedPower:100},{userId:3,clanId:1,status:'ACTIVE',slot:2,seedPower:200},{userId:4,clanId:1,status:'ACTIVE',slot:3,seedPower:200},{userId:5,clanId:1,status:'ACTIVE',slot:4,seedPower:100},{userId:6,clanId:1,status:'BLOCKED',slot:5,seedPower:900},{userId:7,clanId:2,status:'ACTIVE',slot:1,seedPower:900}];
 assert.deepEqual(rankedOrganizationElders(roster)[0].userIds,[3,4,2]);
 assert.deepEqual(organizationElderIds({commanders:{1:2}},roster,1),[2]);
 assert.deepEqual(organizationElderIds({commanders:{1:2},elders:{1:[]}},roster,1),[]);
 assert.deepEqual(organizationElderIds({elders:{1:[2,3,3,6,7,4,5]}},roster,1),[2,3,4]);
 for(const ids of [[2,2],[2,3,4,5],[7],[6],['2']])assert.throws(()=>validateOrganizationElders(ids,roster,1));
});

test('all three elders can manage formation, captains, garrison, launch and upgrade; other members cannot manage',async t=>{
 const f=await organizationFactionFixture(t,{live:true});ok(await setElders(f,[2,3,4]));
 await f.pg.query('INSERT INTO organization_faction_treasury_v1(round_id,organization_id,balance) VALUES($1,1,10000)',[f.roundId]);
 await f.mutateState(s=>{s.districts.find(d=>d.id==='41110').owner=1;});
 for(const user of [2,3,4]){
  const view=(await f.overview(user)).data;assert.equal(view.mine.isElder,true);assert.equal(view.mine.canManageFormation,true);assert.equal(view.treasury.canUpgrade,true);assert.deepEqual(view.treasury.elderIds,[2,3,4]);
  ok(await f.post('organization/faction/formation',{formation},user));ok(await f.post('organization/faction/captains',{captains:{attack3:0,attack4:0,attack5:0,attack1:5,attack2:null}},user));
  ok(await f.post('organization/faction/garrison',{districtId:'41110',squad:'defense1'},user));
  ok(await f.post('organization/faction/launch',{districtId:['41570','41190','41210'][user-2],squad:'attack1'},user));
  ok(await f.post('organization/faction/upgrade',{expectedStage:user-1,policyRevision:1},user));
  f.advance(21*60000);
 }
 assert.equal((await f.overview(6)).data.mine.isElder,false);
 for(const [path,body] of [['formation',{formation}],['captains',{captains:{attack3:0,attack4:0,attack5:0,attack1:6,attack2:null}}],['garrison',{districtId:'41110',squad:'defense1'}],['upgrade',{expectedStage:4,policyRevision:1}]])assert.equal((await f.post('organization/faction/'+path,body,6)).status,403,path);
 assert.equal((await setElders(f,[2,3,7],[2,3,4])).status,409);
 await f.pg.query("UPDATE users SET status='BLOCKED' WHERE id=3");assert.equal((await f.overview(3)).status,403);assert.deepEqual((await f.overview(2)).data.treasury.elderIds,[2,4]);
});

test('elder edits are OWNER only, stale-safe, replay-safe and atomic; lineup can be prepared outside combat hours',async t=>{
 const f=await organizationFactionFixture(t),requestId=crypto.randomUUID();ok(await setElders(f,[2,3,4],[2],{requestId}));
 assert.equal((await setElders(f,[2,3,4],[2],{requestId})).data.replayed,true);
 assert.equal((await setElders(f,[2,3],[2])).status,409);
 assert.equal((await f.commander(1,2)).status,409,'old cached CMS must not erase three elders');
 assert.equal((await f.post('admin/organization/faction/elders',{organizationId:1,userIds:[2],baseUserIds:[2,3,4]},2)).status,403);
 f.fail('INSERT INTO organization_faction_receipts_v1');assert.equal((await setElders(f,[4],[2,3,4])).status,503);f.fail('');assert.deepEqual((await f.overview()).data.treasury.elderIds,[2,3,4]);
 f.advance(7*3600000);assert.equal((await f.overview()).data.sessions.active,false);
 for(const user of [2,3,4]){ok(await f.post('organization/faction/formation',{formation},user));assert.equal((await f.post('organization/faction/launch',{districtId:'41110',squad:'attack1'},user)).data.code,'ORG_WINDOW');}
 ok(await setElders(f,[],[2,3,4]));assert.deepEqual((await f.overview()).data.treasury.elderIds,[]);assert.equal((await f.overview()).data.mine.isElder,false);
});

test('one-time 15-organization appointment rolls back dry run/failure, preserves gameplay, requires reviewed roster and never reapplies',async t=>{
 const f=await organizationFixture(t,{people:60});await installOrganizationFactionSchema(f.env.DB);const original=await f.prepare({survey:false});
 await f.pg.query("UPDATE organization_rounds_v1 SET id=$1,scope='LIVE',phase='ASSIGNED' WHERE id=$2",[ROUND_ID,original]);
 await f.pg.query('UPDATE organization_faction_policy_v1 SET policy_json=$1 WHERE id=1',[JSON.stringify({mode:'ON'})]);
 await f.pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)');
 for(let i=0;i<60;i++)await f.pg.query('INSERT INTO organization_members_v1(round_id,user_id,organization_id,slot,seed_power,joined_at) VALUES($1,$2,$3,$4,$5,1)',[ROUND_ID,i+2,Math.floor(i/4)+1,i%4+1,1000+(i%4)*100]);
 const before=newOrganizationFactionState(f.clock());before.formations[1]=formation;before.captains[1]={attack1:5};before.squadReady['1:attack1']=123;before.events=[{kind:'KEEP',id:'keep'}];
 await f.pg.query('INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES($1,$2)',[ROUND_ID,JSON.stringify(before)]);
 const snapshot=async()=>({state:(await f.pg.query('SELECT * FROM organization_faction_state_v1')).rows,meta:(await f.pg.query('SELECT * FROM app_meta')).rows,audit:(await f.pg.query('SELECT * FROM admin_logs')).rows});
 const initial=await snapshot(),dry=await appointOrganizationElders(f.pg,{now:f.clock()});assert.equal(dry.elderCount,45);assert.deepEqual(dry.selection[0].userIds,[5,4,3]);assert.deepEqual(await snapshot(),initial);
 await assert.rejects(appointOrganizationElders(f.pg,{commit:true,expectedRosterHash:'changed'}),/changed after review/);assert.deepEqual(await snapshot(),initial);
 const faulty={query:(sql,args)=>{if(sql.startsWith('INSERT INTO app_meta'))throw Error('INJECTED_RECEIPT_FAILURE');return f.pg.query(sql,args);}};
 await assert.rejects(appointOrganizationElders(faulty,{commit:true,expectedRosterHash:dry.rosterHash}),/INJECTED/);assert.deepEqual(await snapshot(),initial);
 const applied=await appointOrganizationElders(f.pg,{commit:true,expectedRosterHash:dry.rosterHash});assert.equal(applied.committed,true);const saved=await snapshot(),state=JSON.parse(saved.state[0].state_json);
 assert.equal(Object.values(state.elders).flat().length,45);assert.deepEqual(state.formations,before.formations);assert.deepEqual(state.captains,before.captains);assert.deepEqual(state.squadReady,before.squadReady);assert.equal(saved.audit.length,1);assert.equal(saved.meta[0].key,OPERATION_KEY);
 state.elders[1]=[2];await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1',[JSON.stringify(state)]);const later=await snapshot();assert.equal((await appointOrganizationElders(f.pg,{commit:true,expectedRosterHash:dry.rosterHash})).replayed,true);assert.deepEqual(await snapshot(),later,'retry preserves later CMS edits');
});
