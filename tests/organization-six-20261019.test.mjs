import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateOrganizations,ORGANIZATIONS} from '../shared/organization-system-v1.mjs';
import {reviewOrganizationAnswers,ORGANIZATION_INTERVIEW} from '../shared/organization-interview-v1.mjs';
import {SQUADS,ORGANIZATION_SESSION_RULES} from '../shared/organization-faction-v1.mjs';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
import {installOrganizationFactionSchema} from '../functions/_organization_faction.js';
import {newOrganizationFactionState} from '../functions/_organization_faction_model.js';
import {consolidateOrganizations,OPERATION_KEY} from '../scripts/ops/organization-six-20261019.mjs';
const empty=()=>Object.fromEntries(SQUADS.map(s=>[s.id,[]]));
const captains=()=>Object.fromEntries(SQUADS.filter(s=>s.role==='ATTACK').map(s=>[s.id,0]));
test('six active organizations balance 129 and 150 members and return six interview recommendations',()=>{
 assert.deepEqual(ORGANIZATIONS.map(o=>o.name),['도끼파','쌍칼파','독사파','불곰파','백상어파','까마귀파']);
 for(const count of [129,150]){const people=Array.from({length:count},(_,i)=>({userId:i+2,power:1000+(i*173)%8500,preferredOrganizationId:i%15+1}));const plan=allocateOrganizations(people);assert.deepEqual(plan.organizations.map(o=>o.memberCount).sort((a,b)=>a-b),count===129?[21,21,21,22,22,22]:[25,25,25,25,25,25]);assert.equal(new Set(plan.organizations.flatMap(o=>o.members.map(m=>m.userId))).size,count);assert.deepEqual(allocateOrganizations(people.reverse()),plan);assert(plan.stats.powerSpreadPercent<1);}
 const interview=reviewOrganizationAnswers(Object.fromEntries(ORGANIZATION_INTERVIEW.map(q=>[q.id,q.options[0].id])));assert.equal(interview.recommendations.length,6);assert.equal(interview.organizationFit.length,6);
 assert.equal(ORGANIZATION_SESSION_RULES.requiredTerritories,8);
});
test('all ten squads validate, fifth captains manage, and garrisons stay one-to-one through moves and combat',async t=>{
 const f=await organizationFactionFixture(t),formation={...empty(),attack5:[2,3],defense1:[4],defense5:[5]};
 assert.equal((await f.post('organization/faction/formation',{formation,captains:{...captains(),attack5:6}})).status,200);
 assert.equal((await f.overview(6)).data.mine.canManageFormation,true);
 assert.equal((await f.post('organization/faction/formation',{formation:{...formation,attack4:[5]}})).status,400);
 assert.equal((await f.post('organization/faction/formation',{formation:{...empty(),attack5:[2,3,4,5]}})).status,400);
 assert.equal((await f.post('organization/faction/formation',{formation:{attack1:[],attack2:[],defense1:[],defense2:[]}})).status,400,'old clients cannot erase new squads');
 await f.mutateState(s=>s.districts.slice(0,3).forEach(d=>d.owner=1));const [a,b,c]=(await f.overview()).data.districts;
 const station=(districtId,squad,user=6)=>f.post('organization/faction/garrison',{districtId,squad},user);
 assert.equal((await station(a.id,'defense5')).status,200);assert.equal((await station(b.id,'defense5')).status,200);
 let view=(await f.overview()).data;assert.equal(view.districts.find(d=>d.id===a.id).defense,'');assert.equal(view.districts.find(d=>d.id===b.id).defense,'defense5');
 assert.equal((await station(b.id,'defense1')).status,200);assert.equal((await station(c.id,'defense3')).status,409);assert.equal((await station(c.id,'defense5',3)).status,403);
 await f.mutateState(s=>s.battles.push({id:'garrison-lock',status:'ACTIVE',districtId:b.id,attacker:2,defender:1,attackers:[7],defenders:[4],endsAt:f.clock()+60000}));
 assert.equal((await station(c.id,'defense1')).status,409);assert.equal((await station(b.id,'')).status,409);
 await f.mutateState(s=>s.battles=[]);assert.equal((await station(b.id,'')).status,200);
 assert.equal((await f.post('organization/faction/formation',{formation:{...empty(),defense5:[7,8]}},7)).status,200);await f.mutateState(s=>{const d=s.districts[3];d.owner=2;d.defense='defense5';});
 const launch=await f.post('organization/faction/launch',{districtId:view.districts[3].id,squad:'attack5'});assert.equal(launch.status,200);assert.equal(launch.data.captured,undefined);assert.equal((await f.post('organization/faction/enter',{battleId:launch.data.battleId},3)).status,200);
 view=(await f.overview()).data;assert.equal(view.battles.find(b=>b.id===launch.data.battleId).defenseSquad,'defense5');
});
test('seven regions pay nothing; eight pay only the participant, never a merely assigned squad member',async t=>{
 for(const territories of [7,8]){const f=await organizationFactionFixture(t,{live:true,funds:1000});assert.equal((await f.post('organization/faction/formation',{formation:{...empty(),attack5:[2,3]}})).status,200);await f.mutateState(s=>s.districts.slice(0,territories-1).forEach(d=>d.owner=1));const district=(await f.overview()).data.districts[20];assert.equal((await f.post('organization/faction/launch',{districtId:district.id,squad:'attack5'})).data.captured,true);f.advance(3*60*60*1000+1000);await f.overview();const rewards=(await f.pg.query('SELECT user_id,reward_type,reward_amount FROM user_message_rewards')).rows;assert.equal(rewards.length,territories===8?3:0);assert(rewards.every(r=>Number(r.user_id)===2));assert.equal((await f.overview(3)).data.sessions.history[0].myReward,0);}
});
test('consolidation is atomic, balanced, keeps retained territory and paid history, and never resets funds twice',async t=>{
 const f=await organizationFixture(t,{people:129}),roundId=await f.prepare({survey:false});await installOrganizationFactionSchema(f.env.DB);
 await f.pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)');
 await f.pg.query("UPDATE organization_rounds_v1 SET phase='ASSIGNED',assigned_at=$1 WHERE id=$2",[f.clock(),roundId]);await f.pg.query('UPDATE organization_faction_policy_v1 SET policy_json=$1 WHERE id=1',[JSON.stringify({mode:'TEST'})]);
 for(let i=0;i<129;i++)await f.pg.query('INSERT INTO organization_members_v1 VALUES($1,$2,$3,$4,$5,$6)',[roundId,i+2,i%15+1,Math.floor(i/15)+1,1000+(i*173)%8500,f.clock()-10000]);
 for(let id=1;id<=15;id++){await f.pg.query('INSERT INTO organization_progress_v1 VALUES($1,$2,0,$3)',[roundId,id,id===3?2:1]);await f.pg.query('INSERT INTO organization_faction_treasury_v1 VALUES($1,$2,$3,$4)',[roundId,id,id*1000,id*2000]);}
 const original=newOrganizationFactionState(f.clock());original.districts.forEach((d,i)=>{d.owner=i%15+1;d.defense='defense1';d.protectedUntil=f.clock()+1000;});original.session={key:'paid',status:'SETTLED',rewardRules:{requiredTerritories:6},recipients:[{userId:2,amount:300000000000}]};original.sessionHistory=[original.session];original.elders={1:[2,17,32]};
 await f.pg.query('INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES($1,$2)',[roundId,JSON.stringify(original)]);await f.pg.exec('ALTER TABLE organization_members_v1 DROP CONSTRAINT organization_members_v1_slot_check;ALTER TABLE organization_members_v1 ADD CONSTRAINT organization_members_v1_slot_check CHECK(slot BETWEEN 1 AND 10)');
 const snapshot=async()=>({members:(await f.pg.query('SELECT * FROM organization_members_v1 ORDER BY user_id')).rows,state:(await f.pg.query('SELECT * FROM organization_faction_state_v1')).rows,funds:(await f.pg.query('SELECT * FROM organization_faction_treasury_v1 ORDER BY organization_id')).rows,constraint:(await f.pg.query("SELECT pg_get_constraintdef(oid) AS rule FROM pg_constraint WHERE conname='organization_members_v1_slot_check'")).rows});
 const before=await snapshot(),options={roundId,allowTest:true,now:f.clock()};const dry=await consolidateOrganizations(f.pg,options);assert.equal(dry.committed,false);assert.deepEqual(await snapshot(),before);
 const failing={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('INJECTED_AUDIT_FAILURE')):f.pg.query(sql,args)};
 await assert.rejects(()=>consolidateOrganizations(failing,{...options,commit:true,expectedRosterHash:dry.rosterHash}),/INJECTED/);assert.deepEqual(await snapshot(),before);
 await assert.rejects(()=>consolidateOrganizations(f.pg,{...options,commit:true,expectedRosterHash:'changed'}),/Roster changed/);assert.deepEqual(await snapshot(),before);
 const result=await consolidateOrganizations(f.pg,{...options,commit:true,expectedRosterHash:dry.rosterHash});assert(result.committed);assert.equal(result.elders.flatMap(o=>o.userIds).length,18);assert.deepEqual(result.plan.organizations.map(o=>o.memberCount).sort(),[21,21,21,22,22,22]);
 const after=await snapshot();assert.equal(after.members.length,129);assert(after.members.every(m=>m.organization_id<=6));for(const m of after.members){const old=before.members.find(x=>x.user_id===m.user_id);assert.equal(m.seed_power,old.seed_power);assert.equal(m.joined_at,old.joined_at);}assert(after.funds.every(f=>Number(f.balance)===0&&Number(f.total_earned)===0));
 const state=JSON.parse(after.state[0].state_json);assert.deepEqual(state.session,original.session);assert.deepEqual(state.sessionHistory,original.sessionHistory);assert(state.districts.every(d=>!d.defense));for(let i=0;i<state.districts.length;i++)assert.equal(state.districts[i].owner,original.districts[i].owner<=6?original.districts[i].owner:0);
 assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM organization_faction_ledger_v1')).rows[0].n,15);
 const overview=(await f.call('organization/overview?roundId='+roundId,{user:2})).data;assert.equal(overview.organizations.length,6);assert(overview.roster.length>=21);assert.equal(overview.proposal,null);assert.equal((await f.call('admin/organization?roundId='+roundId)).data.proposal.organizations.length,6);
 await f.pg.query('UPDATE organization_faction_treasury_v1 SET balance=123 WHERE organization_id=1');const replay=await consolidateOrganizations(f.pg,{...options,commit:true});assert(replay.replayed);assert.equal(Number((await f.pg.query('SELECT balance FROM organization_faction_treasury_v1 WHERE organization_id=1')).rows[0].balance),123);assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0].n,1);
});
