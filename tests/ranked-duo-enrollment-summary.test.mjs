import test from 'node:test';
import assert from 'node:assert/strict';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';

test('large duplicate equipment inventory can enroll without truncating its strongest gear',async t=>{
 const f=await duoFixture(t);
 await f.call('admin/ranked-duo/create',{method:'POST',body:{config:f.config}});
 await f.call('admin/ranked-duo/recruit',{method:'POST'});
 await f.p("INSERT INTO character_equipment_items VALUES(1,'WEAPON',100000,1000,1),(2,'TOP',400000,100000,1)").run();
 await f.p('WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<70000) INSERT INTO user_equipment_instances SELECT i,2,1 FROM n').run();
 await f.p('INSERT INTO user_equipment_instances VALUES(70001,2,2)').run();
 await f.p('INSERT INTO equipment_forge_states_v1 VALUES(70000,2,10,1)').run();
 await f.p("INSERT INTO user_equipment_loadout VALUES(2,'WEAPON',1),(2,'TOP',70001)").run();
 const result=await f.call('ranked-duo/join',{user:2,method:'POST'});
 assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.joined,true);
 const profile=JSON.parse((await f.p('SELECT payload_json FROM ranked_duo_profiles_v1 WHERE user_id=2').first()).payload_json);
 assert.equal(profile.breakdown.equipmentPower,forgePower(100000,10).pvp+100000);
 assert.equal(profile.attack.equipmentBonus,101000);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_entries_v1 WHERE user_id=2').first()).n),1);
 assert.equal((await f.call('ranked-duo/join',{user:2,method:'POST'})).data.participants,1);
});

test('PostgreSQL enrollment uses ownership counts and sparse enhanced/equipped instances for millions of copies',async t=>{
 const f=await duoFixture(t,{postgres:true});
 await f.pg.exec('CREATE TABLE user_equipment_counts_v1(user_id BIGINT,equipment_id BIGINT,quantity BIGINT,PRIMARY KEY(user_id,equipment_id))');
 await f.p("INSERT INTO app_meta(key,value) VALUES('equipment_counts_v1_ready','1')").run();
 await f.call('admin/ranked-duo/create',{method:'POST',body:{config:f.config}});await f.call('admin/ranked-duo/recruit',{method:'POST'});
 await f.p("INSERT INTO character_equipment_items VALUES(1,'WEAPON',100000,1000,1),(2,'TOP',400000,100000,1),(3,'WEAPON',999999,999999,0),(4,'BATTLE_SUIT',999999,999999,1)").run();
 await f.p('INSERT INTO user_equipment_counts_v1 VALUES(2,1,8700000),(2,2,1),(2,3,9),(2,4,1),(3,1,1)').run();
 await f.p('INSERT INTO user_equipment_instances VALUES(1,2,1),(2,2,1),(3,2,2),(4,2,3),(5,2,4),(6,3,1)').run();
 await f.p('INSERT INTO equipment_forge_states_v1 VALUES(2,2,10,1),(3,2,3,1),(6,3,10,1)').run();
 await f.p("INSERT INTO user_equipment_loadout VALUES(2,'WEAPON',1),(2,'TOP',3),(2,'BATTLE_SUIT',5)").run();
 f.resetQueries();const result=await f.call('ranked-duo/join',{user:2,method:'POST'});
 assert.equal(result.status,200,JSON.stringify(result));
 const queries=f.queries();assert.ok(queries.some(q=>q.includes('FROM user_equipment_counts_v1')));
 assert.ok(!queries.some(q=>/FROM user_equipment_instances x/.test(q)),'count-ready path must not scan the duplicate instance inventory');
 const profile=JSON.parse((await f.p('SELECT payload_json FROM ranked_duo_profiles_v1 WHERE user_id=2').first()).payload_json);
 assert.equal(profile.breakdown.equipmentPower,forgePower(100000,10).pvp+forgePower(400000,3).pvp);
 assert.equal(profile.attack.equipmentBonus,1000+forgePower(400000,3).pvp);
});
