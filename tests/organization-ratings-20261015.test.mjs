import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {loadOrganizationRatings,validateOrganizationRatingsLocked} from '../functions/_organization_ratings.js';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';
import {jointHash} from '../functions/_joint_transactions.js';
import {FORGE_ADVANCED_KEY,forgeAdvancedDraft} from '../shared/equipment-forge-advanced-v1.mjs';

test('organization account rating consumes real profile cache, permits OWNER only explicitly, and locks source policies',async t=>{
 const f=await organizationFixture(t,{people:2}),now=f.clock();
 await f.pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL AS 'SELECT CURRENT_TIMESTAMP::text'");
 await f.pg.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE ranked_duo_accounts_v1(user_id BIGINT PRIMARY KEY,source_version BIGINT NOT NULL DEFAULT 1);CREATE TABLE ranked_duo_policy_version_v1(id BIGINT PRIMARY KEY,revision BIGINT);INSERT INTO ranked_duo_policy_version_v1 VALUES(1,4);CREATE TABLE ranked_duo_profiles_v1(user_id BIGINT PRIMARY KEY,source_version BIGINT,policy_revision BIGINT,config_hash TEXT,payload_json TEXT,expires_at TEXT);");
 const hash=await jointHash({weights:{},mercenaryLoadoutMode:'PVP-v1',mercenaryEquipment:'20261011',mercenaryGrowth:'20261020-v1',equipmentSetVisualVersion:1,advancedForgeRevision:0});
 for(const userId of [1,2]){
  const profile={userId,power:userId===1?9000:3000,sourceVersion:1,policyRevision:4,expiresAt:new Date(now+300000).toISOString(),breakdown:{cardPower:100,equipmentPower:50},attack:{cards:[]},defense:{cards:[]}};
  await f.pg.query('INSERT INTO ranked_duo_accounts_v1 VALUES($1,1)',[userId]);
  await f.pg.query('INSERT INTO ranked_duo_profiles_v1 VALUES($1,1,4,$2,$3,$4)',[userId,hash,JSON.stringify(profile),profile.expiresAt]);
 }
 await assert.rejects(loadDuoProfiles(f.env,[1],{mercenaryWeights:{}},{},{now}),error=>error.code==='DUO_ACCOUNT');
 const ratings=await loadOrganizationRatings(f.env,[1,2],{},{now});
 assert.deepEqual(ratings.map(r=>r.power),[9000,3000]);assert.ok(ratings.every(r=>r.advancedForgeRevision===0));
 const q=async(text,values=[])=>{f.queries.push(text);return (await f.pg.query(text,values)).rows;};
 assert.equal(await validateOrganizationRatingsLocked(q,ratings,{now}),true);
 assert.ok(f.queries.some(sql=>sql.includes('app_meta WHERE key=$1 FOR SHARE')));
 assert.ok(f.queries.some(sql=>sql.includes('FOR SHARE OF a,u,v')));
 assert.equal(await validateOrganizationRatingsLocked(q,ratings,{now:now+300000}),false);
 await f.pg.query('UPDATE ranked_duo_accounts_v1 SET source_version=2 WHERE user_id=2');
 assert.equal(await validateOrganizationRatingsLocked(q,ratings,{now}),false);
 assert.equal(await validateOrganizationRatingsLocked(q,ratings,{now,requireCurrentSource:false}),true);
 assert.equal(await validateOrganizationRatingsLocked(q,ratings,{now:now+300000,requireCurrentSource:false}),false);
 await f.pg.query('UPDATE ranked_duo_accounts_v1 SET source_version=1 WHERE user_id=2');
 await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[FORGE_ADVANCED_KEY,JSON.stringify({...forgeAdvancedDraft(),revision:1})]);
 assert.equal(await validateOrganizationRatingsLocked(q,ratings,{now}),false);
 assert.equal(await validateOrganizationRatingsLocked(q,ratings,{now,requireCurrentSource:false}),false);
});
