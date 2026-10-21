import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
import {ORGANIZATION_DISTRICTS,HISTORICAL_ORGANIZATION_DISTRICTS,SQUADS} from '../shared/organization-faction-v1.mjs';
import {resetOrganizationSeoul,OPERATION_KEY} from '../scripts/ops/organization-seoul-reset-20261021.mjs';
const formation=()=>Object.fromEntries(SQUADS.map(s=>[s.id,[]]));
const raw=async f=>JSON.parse((await f.pg.query('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[f.roundId])).rows[0].state_json);
async function setup(t){const f=await organizationFactionFixture(t,{live:true});await f.pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)');return f;}

test('Seoul has exactly 25 real boundary regions; stale 46-region states cannot launch or retain battles outside Seoul',async t=>{
 assert.equal(ORGANIZATION_DISTRICTS.length,25);assert.equal(new Set(ORGANIZATION_DISTRICTS.map(d=>d.id)).size,25);assert(ORGANIZATION_DISTRICTS.every(d=>d.area==='SEOUL'));
 const map=JSON.parse(readFileSync(new URL('../organization/faction/districts-v1.json',import.meta.url)));assert.deepEqual(map.features.filter(d=>d.area==='SEOUL').map(d=>d.id).sort(),ORGANIZATION_DISTRICTS.map(d=>d.id).sort());
 const f=await setup(t);await f.mutateState(s=>{
  s.districts=HISTORICAL_ORGANIZATION_DISTRICTS.map(d=>({id:d.id,owner:1,defense:'',protectedUntil:0,taxAt:f.clock(),taxRemainder:0}));delete s.districtScope;
  s.formations[1]={...formation(),attack1:[2]};s.battles.push({id:'removed',districtId:'41110',status:'ACTIVE',attacker:1,defender:2,endsAt:f.clock()+60000});
 });
 const before=await raw(f),view=await f.overview();assert.equal(view.status,200);assert.equal(view.data.districts.length,25);assert.equal(view.data.holdings,25);
 let state=await raw(f);assert.equal(state.retiredDistricts.length,21);assert.equal(state.battles.find(b=>b.id==='removed').status,'CANCELLED');assert.deepEqual(state.formations,before.formations);assert.deepEqual(state.session,before.session);
 assert.equal((await f.post('organization/faction/launch',{districtId:'41110',squad:'attack1'})).status,409);
 assert.equal((await f.post('organization/faction/garrison',{districtId:'41110',squad:''})).status,409);
 await f.overview();state=await raw(f);assert(state.districts.every(d=>d.owner===1),'scope migration never repeats an occupation reset');assert.equal(state.retiredDistricts.length,21);
});

test('reset backs up all ownership, clears battles and cooldowns atomically, preserves organizations and economics, and never resets twice',async t=>{
 const f=await setup(t);await f.mutateState(s=>{
  s.districts=HISTORICAL_ORGANIZATION_DISTRICTS.map((d,i)=>({id:d.id,owner:i%6+1,defense:'defense1',protectedUntil:f.clock()+60000,taxAt:f.clock(),taxRemainder:5}));delete s.districtScope;
  s.formations[1]={...formation(),attack1:[2],defense1:[3]};s.captains[1]={attack1:2};s.squadReady={'1:attack1':999};s.targetReady={'1:11680':999};s.strikeReady={2:999};
  s.battles.push({id:'seoul-active',districtId:'11680',status:'ACTIVE'},{id:'south-active',districtId:'41110',status:'ACTIVE'},{id:'past',districtId:'41110',status:'COMPLETED',winner:1});
  s.session.participants=[2];s.session.participantClans={2:1};s.sessionHistory=[{key:'previous',status:'SETTLED',holdings:{1:12},recipients:[{userId:2,amount:300000000000}]}];
 });
 await f.pg.query('INSERT INTO organization_faction_treasury_v1 VALUES($1,1,123456,456789)',[f.roundId]);
 await f.pg.query("INSERT INTO organization_faction_settlements_v1 VALUES($1,'previous',$2,1)",[f.roundId,JSON.stringify({status:'SETTLED',holdings:{1:12}})]);
 const before=await raw(f),options={roundId:f.roundId,now:f.clock()},client={query:(sql,args)=>f.pg.query(sql,args)};
 const dry=await resetOrganizationSeoul(client,options);assert.equal(dry.applied,false);assert.equal(dry.afterDistricts,25);assert.deepEqual(await raw(f),before);
 let fail=true;const broken={query:(sql,args)=>{if(fail&&sql.startsWith('INSERT INTO admin_logs'))throw Error('audit failure');return f.pg.query(sql,args);}};
 await assert.rejects(resetOrganizationSeoul(broken,{...options,apply:true}),/audit failure/);assert.deepEqual(await raw(f),before);assert.equal((await f.pg.query('SELECT * FROM app_meta')).rows.length,0);fail=false;
 const applied=await resetOrganizationSeoul(client,{...options,apply:true});assert.equal(applied.applied,true);assert.equal(applied.beforeDistricts,46);assert.equal(applied.beforeOccupied,46);assert.deepEqual(applied.cancelledBattles,['seoul-active','south-active']);
 const state=await raw(f);assert.equal(state.districts.length,25);assert(state.districts.every(d=>d.owner===0&&d.defense===''&&d.protectedUntil===0));assert(state.battles.filter(b=>b.id!=='past').every(b=>b.status==='CANCELLED'&&b.reason==='MAP_RESET'));assert.deepEqual(state.battles.find(b=>b.id==='past'),before.battles.find(b=>b.id==='past'));
 for(const k of ['formations','captains','elders','commanders','session','sessionHistory','sessionPlan','sessionQueue','pools'])assert.deepEqual(state[k],before[k],k);
 for(const k of ['squadReady','targetReady','strikeReady'])assert.deepEqual(state[k],{});
 const receipt=JSON.parse((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0].value);assert.deepEqual(receipt.backup.state,before);assert.equal(Number(receipt.backup.treasury[0].balance),123456);
 assert.equal((await f.pg.query('SELECT * FROM user_message_rewards')).rows.length,0);
 await f.mutateState(s=>s.districts[0].owner=2);assert.equal((await resetOrganizationSeoul(client,{...options,apply:true})).replayed,true);assert.equal((await raw(f)).districts[0].owner,2);assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
});

test('a strike computed before reset cannot commit damage or reclaim a reset district afterwards',async t=>{
 const f=await setup(t);
 await f.post('organization/faction/formation',{formation:{...formation(),attack1:[2]}});
 await f.post('organization/faction/formation',{formation:{...formation(),defense1:[7]}},7);
 await f.mutateState(s=>Object.assign(s.districts.find(d=>d.id==='11680'),{owner:2,defense:'defense1'}));
 const launch=await f.post('organization/faction/launch',{districtId:'11680',squad:'attack1'});assert.equal(launch.status,200);assert.equal((await f.post('organization/faction/enter',{battleId:launch.data.battleId})).status,200);
 let started,release;const computing=new Promise(r=>started=r),hold=new Promise(r=>release=r),build=f.deps.buildFactionBattle;
 f.deps.buildFactionBattle=async(...args)=>{started();await hold;return build(...args);};
 const pending=f.post('organization/faction/strike',{battleId:launch.data.battleId});await computing;
 try{await resetOrganizationSeoul({query:(sql,args)=>f.pg.query(sql,args)},{apply:true,roundId:f.roundId,now:f.clock()});}finally{release();}
 const rejected=await pending;assert.equal(rejected.status,403);assert.equal(rejected.data.code,'ORG_BATTLE');const state=await raw(f);assert(state.districts.every(d=>d.owner===0));assert.equal(state.battles.find(b=>b.id===launch.data.battleId).status,'CANCELLED');assert.equal((await f.pg.query('SELECT * FROM user_message_rewards')).rows.length,0);
});
