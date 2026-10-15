import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {installOrganizationOpeningSchema,openOrganizationLive,RECEIPT_KEY} from '../scripts/operations/open-organization-live-20261015.mjs';
import {ORGANIZATION_RECRUITMENT_MS} from '../shared/organization-system-v1.mjs';

async function fixture(t){
 const f=await organizationFixture(t,{people:2});
 await f.pg.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT NOT NULL REFERENCES users(id),action_type TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,before_data TEXT,after_data TEXT);CREATE TABLE clans(id BIGINT PRIMARY KEY,name TEXT,treasury BIGINT);INSERT INTO clans VALUES(8,'보존할 기존 클랜',987654321);");
 return f;
}
const rows=async(f,table)=>(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1')).rows;
async function snapshot(f){
 const names=['organization_rounds_v1','organization_surveys_v1','organization_members_v1','organization_progress_v1','organization_policy_v1','organization_faction_policy_v1','organization_faction_treasury_v1','organization_faction_ledger_v1','admin_logs','app_meta','clans','clan_members','users'];
 return Object.fromEntries(await Promise.all(names.map(async name=>[name,await rows(f,name)])));
}
const open=(f,options={})=>openOrganizationLive(f.env.DB,{ownerId:1,now:f.clock(),...options});

test('explicit schema preparation is additive, idempotent and never starts recruitment or overwrites policy',async t=>{
 const f=await fixture(t),legacy={clans:await rows(f,'clans'),members:await rows(f,'clan_members')};
 const originalPolicy=await rows(f,'organization_policy_v1');
 assert.deepEqual(await installOrganizationOpeningSchema(f.env.DB),{installed:true,opened:false});
 const before=await snapshot(f);
 assert.equal(before.organization_rounds_v1.length,0);assert.equal(before.app_meta.length,0);
 const custom={...JSON.parse(before.organization_faction_policy_v1[0].policy_json),revision:3,mode:'TEST',fundsPerRegion:25};
 await f.pg.query('UPDATE organization_faction_policy_v1 SET revision=3,policy_json=$1',[JSON.stringify(custom)]);
 await installOrganizationOpeningSchema(f.env.DB);
 assert.deepEqual(JSON.parse((await rows(f,'organization_faction_policy_v1'))[0].policy_json),custom);
 assert.deepEqual(await rows(f,'organization_policy_v1'),originalPolicy);
 assert.deepEqual(await rows(f,'clans'),legacy.clans);assert.deepEqual(await rows(f,'clan_members'),legacy.members);
});

test('default dry run exercises opening, audit and receipt but rolls the entire transaction back',async t=>{
 const f=await fixture(t);await installOrganizationOpeningSchema(f.env.DB);
 const before=await snapshot(f),result=await open(f);
 assert.equal(result.dryRun,true);assert.equal(result.replayed,false);
 assert.equal(result.round.phase,'SURVEY');assert.equal(result.round.scope,'LIVE');assert.equal(Number(result.round.auto_assign),1);
 assert.equal(result.receipt.openedAt,f.clock());assert.equal(result.receipt.closesAt,f.clock()+ORGANIZATION_RECRUITMENT_MS);
 assert.equal(result.factionPolicy.mode,'ON');assert.equal(result.factionPolicy.fundsPerRegion,null);assert.deepEqual(result.factionPolicy.upgradeCosts,[0,null,null,null,null]);
 assert.deepEqual(await snapshot(f),before);
 assert.ok(f.queries.some(q=>q.startsWith('INSERT INTO admin_logs')));assert.ok(f.queries.some(q=>q.startsWith('INSERT INTO app_meta')));
});

test('opening is committed once; concurrent retries and later retries return the original deadline without extending it',async t=>{
 const f=await fixture(t);await installOrganizationOpeningSchema(f.env.DB);
 const legacy={clans:await rows(f,'clans'),members:await rows(f,'clan_members'),users:await rows(f,'users')};
 const [first,retry]=await Promise.all([open(f,{dryRun:false}),open(f,{dryRun:false,now:f.clock()+7200000})]);
 assert.equal(first.replayed,false);assert.equal(retry.replayed,true);assert.deepEqual(retry.receipt,first.receipt);
 assert.equal((await rows(f,'organization_rounds_v1')).length,1);assert.equal((await rows(f,'admin_logs')).length,1);
 assert.equal((await rows(f,'app_meta')).length,1);assert.equal((await rows(f,'app_meta'))[0].key,RECEIPT_KEY);
 assert.deepEqual(JSON.parse((await rows(f,'app_meta'))[0].value),first.receipt);
 const policy=JSON.parse((await rows(f,'organization_faction_policy_v1'))[0].policy_json);assert.equal(policy.mode,'ON');assert.equal(policy.revision,1);assert.equal(policy.fundsPerRegion,null);assert.deepEqual(policy.upgradeCosts,[0,null,null,null,null]);
 await f.pg.query("UPDATE organization_rounds_v1 SET phase='ASSIGNED',assigned_at=$1 WHERE id=$2",[f.clock()+ORGANIZATION_RECRUITMENT_MS,first.receipt.roundId]);
 const configured={...policy,revision:2,fundsPerRegion:75,upgradeCosts:[0,100,200,300,400]};
 await f.pg.query('UPDATE organization_faction_policy_v1 SET revision=2,policy_json=$1',[JSON.stringify(configured)]);
 f.advance(ORGANIZATION_RECRUITMENT_MS*2);
 const later=await open(f,{dryRun:false});assert.equal(later.replayed,true);assert.equal(later.round.phase,'ASSIGNED');assert.deepEqual(later.receipt,first.receipt);assert.deepEqual(later.factionPolicy,configured);
 assert.equal(Number(later.round.closes_at),first.receipt.closesAt);assert.equal((await rows(f,'admin_logs')).length,1);
 assert.deepEqual(await rows(f,'clans'),legacy.clans);assert.deepEqual(await rows(f,'clan_members'),legacy.members);assert.deepEqual(await rows(f,'users'),legacy.users);
 for(const table of ['organization_surveys_v1','organization_members_v1','organization_progress_v1','organization_faction_treasury_v1','organization_faction_ledger_v1'])assert.deepEqual(await rows(f,table),[]);
});

test('an existing LIVE round without this receipt is never reused, reset or extended',async t=>{
 const f=await fixture(t);await installOrganizationOpeningSchema(f.env.DB);
 assert.equal((await f.post('admin/organization/create',{scope:'LIVE',name:'이미 존재하는 모집'})).status,200);
 const before=await snapshot(f);
 await assert.rejects(open(f,{dryRun:false}),{code:'ORG_OPENING_EXISTING_ROUND'});
 assert.deepEqual(await snapshot(f),before);
});

test('first opening refuses preset income/costs and requires an active, unbanned OWNER',async t=>{
 const f=await fixture(t);await installOrganizationOpeningSchema(f.env.DB);
 const base=JSON.parse((await rows(f,'organization_faction_policy_v1'))[0].policy_json);
 for(const change of [{fundsPerRegion:10},{upgradeCosts:[0,100,null,null,null]}]){
  await f.pg.query('UPDATE organization_faction_policy_v1 SET policy_json=$1',[JSON.stringify({...base,...change})]);
  const before=await snapshot(f);await assert.rejects(open(f,{dryRun:false}),{code:'ORG_OPENING_ECONOMY_CONFIGURED'});assert.deepEqual(await snapshot(f),before);
 }
 await f.pg.query('UPDATE organization_faction_policy_v1 SET policy_json=$1',[JSON.stringify(base)]);
 await assert.rejects(open(f,{ownerId:2,dryRun:false}),{code:'ORG_OPENING_OWNER'});
 await f.pg.query("UPDATE users SET status='INACTIVE' WHERE id=1");await assert.rejects(open(f,{dryRun:false}),{code:'ORG_OPENING_OWNER'});
 await f.pg.query("UPDATE users SET status='ACTIVE',banned_until=$1 WHERE id=1",[new Date(f.clock()+86400000).toISOString()]);await assert.rejects(open(f,{dryRun:false}),{code:'ORG_OPENING_OWNER'});
 assert.deepEqual(await rows(f,'organization_rounds_v1'),[]);assert.deepEqual(await rows(f,'app_meta'),[]);assert.deepEqual(await rows(f,'admin_logs'),[]);
});

test('a receipt-write failure rolls back deadline, mode and audit together and a subsequent retry can open once',async t=>{
 const f=await fixture(t);await installOrganizationOpeningSchema(f.env.DB);
 const before=await snapshot(f);f.fail('INSERT INTO app_meta');
 await assert.rejects(open(f,{dryRun:false}),/INJECTED_ORGANIZATION_FAILURE/);f.fail('');
 assert.deepEqual(await snapshot(f),before);
 const completed=await open(f,{dryRun:false});assert.equal(completed.replayed,false);assert.equal((await rows(f,'admin_logs')).length,1);assert.equal((await rows(f,'organization_rounds_v1')).length,1);
});

test('a mismatched receipted deadline is rejected instead of recreating or repairing the LIVE round',async t=>{
 const f=await fixture(t);await installOrganizationOpeningSchema(f.env.DB);
 const completed=await open(f,{dryRun:false});
 await f.pg.query('UPDATE organization_rounds_v1 SET closes_at=closes_at+1 WHERE id=$1',[completed.receipt.roundId]);
 const before=await snapshot(f);await assert.rejects(open(f,{dryRun:false}),{code:'ORG_OPENING_RECEIPT'});assert.deepEqual(await snapshot(f),before);
});
