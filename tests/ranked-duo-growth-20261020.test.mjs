import test from 'node:test';
import assert from 'node:assert/strict';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryGrowthLaunchPolicy} from '../shared/mercenary-growth-launch-20261016.mjs';
import {MERCENARY_LEVEL_KEY} from '../shared/mercenary-level-v1.mjs';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';
import {duoConfigVersionStatements} from '../functions/_ranked_duo_schema.js';
import {installDuoGrowthTracking,inspectDuoGrowthTracking,OPERATION_KEY} from '../scripts/ops/ranked-duo-growth-20261020.mjs';

async function setup(t,postgres){
 const f=await duoFixture(t,{postgres});await ensureMercenaryLevelSchema(f.env);
 const policy=mercenaryGrowthLaunchPolicy({revision:1});
 await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',MERCENARY_LEVEL_KEY,JSON.stringify(policy)).run();
 for(const id of [2,3,4,5]){
  await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(?,'V-984',1)",id).run();
  await f.p("INSERT INTO user_mercenary_loadout_v1 VALUES(?,'V-984')",id).run();
  await f.p("INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,experience,breakthrough_mask,revision,updated_at) VALUES(?,'V-984',4,0,0,1,?)",id,new Date(f.clock()).toISOString()).run();
 }
 await f.ready();
 const load=()=>loadDuoProfiles(f.env,[2,3,4,5],f.config,f.deps,{now:f.clock(),wait:async()=>{}});
 return {...f,policy,load};
}
for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'} levels reach both duo lineups and invalidate cached power immediately`,async t=>{
 const f=await setup(t,postgres),before=await f.load(),old=before[0];
 assert.equal(old.attack.mercenary.level,4);assert.equal(old.defense.mercenary.mercenaryLevel.level,4);
 await f.p("UPDATE user_mercenary_levels_v1 SET level=11,breakthrough_mask=3,revision=revision+1 WHERE user_id=2 AND mercenary_code='V-984'").run();
 const after=await f.load(),grown=after[0];
 assert.ok(grown.sourceVersion>old.sourceVersion);assert.ok(grown.power>old.power);
 assert.equal(grown.attack.mercenary.level,11);assert.equal(grown.defense.mercenary.mercenaryLevel.level,11);
 assert.equal(after[1].attack.mercenary.level,4);assert.equal(after[1].sourceVersion,before[1].sourceVersion);
 assert.equal((await f.load())[0].sourceVersion,grown.sourceVersion,'unchanged cache is reusable');
 await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...f.policy,mode:'OFF',revision:2}),MERCENARY_LEVEL_KEY).run();
 const off=(await f.load())[0];assert.ok(off.policyRevision>grown.policyRevision);
 assert.equal(off.attack.mercenary.level,1);assert.equal(off.attack.mercenary.mercenaryLevel,undefined);
 assert.equal(Number((await f.p("SELECT level FROM user_mercenary_levels_v1 WHERE user_id=2 AND mercenary_code='V-984'").first()).level),11);
});
test('a level change during projection cannot cache the stale snapshot',async t=>{
 const f=await setup(t,'pipeline'),original=f.deps.cardUniqueDeckStates;let changed=false;
 await f.p('DELETE FROM ranked_duo_profiles_v1 WHERE user_id=2').run();
 const deps={...f.deps,async cardUniqueDeckStates(...args){
  if(!changed){changed=true;await f.p("UPDATE user_mercenary_levels_v1 SET level=11,breakthrough_mask=3,revision=revision+1 WHERE user_id=2 AND mercenary_code='V-984'").run();}
  return original(...args);
 }};
 const [profile]=await loadDuoProfiles(f.env,[2],f.config,deps,{now:f.clock(),wait:async()=>{}});
 assert.equal(profile.attack.mercenary.level,11);
 const saved=JSON.parse((await f.p('SELECT payload_json FROM ranked_duo_profiles_v1 WHERE user_id=2').first()).payload_json);
 assert.equal(saved.attack.mercenary.level,11);
});
test('the battle receipt freezes all four real growth snapshots and retries do not consume energy again',async t=>{
 const f=await setup(t,'pipeline');
 const ticket=await f.call('ranked-duo/match',{user:2,method:'POST'});
 assert.equal(ticket.status,200,JSON.stringify(ticket));
 await f.p("UPDATE user_mercenary_levels_v1 SET level=11,breakthrough_mask=3,revision=revision+1 WHERE user_id=2 AND mercenary_code='V-984'").run();
 const body={matchToken:ticket.data.token,requestId:'duo-growth-receipt-20261020'};
 const fight=await f.call('ranked-duo/fight',{user:2,method:'POST',body});
 assert.equal(fight.status,200,JSON.stringify(fight));assert.equal(fight.data.status,'COMPLETED');
 const row=await f.p('SELECT input_json FROM ranked_duo_matches_v1').first(),input=JSON.parse(row.input_json);
 const squads=[...input.battle.attackerSquads,...input.battle.defenderSquads];
 assert.equal(squads.length,4);
 for(const squad of squads)assert.equal(squad.mercenary.mercenaryLevel.level,squad.ownerId===2?11:4);
 const energy=(await f.call('ranked-duo/status',{user:2})).data.energy.current;
 const replay=await f.call('ranked-duo/fight',{user:2,method:'POST',body});
 assert.deepEqual(replay.data,fight.data);
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,energy);
 assert.equal((await f.p('SELECT input_json FROM ranked_duo_matches_v1').first()).input_json,row.input_json);
});

test('the production hook repair rolls back dry runs, installs once and preserves growth and receipts',async t=>{
 const f=await setup(t,'pipeline');
 const policyClient={query:(...args)=>f.pg.query(...args)};
 await f.pg.exec('DROP TRIGGER ranked_duo_touch_v1 ON user_mercenary_levels_v1');
 for(const sql of duoConfigVersionStatements('postgres'))await f.pg.query(sql.replace(",'mercenary_level_policy_v1'",''));
 const before=(await f.pg.query('SELECT * FROM user_mercenary_levels_v1 ORDER BY user_id')).rows;
 const version=Number((await f.pg.query('SELECT revision FROM ranked_duo_policy_version_v1 WHERE id=1')).rows[0].revision);
 assert.equal((await inspectDuoGrowthTracking(f.pg)).ready,false);
 const dry=await installDuoGrowthTracking(f.pg,{policyClient});assert.equal(dry.verification.ready,true);
 assert.equal((await inspectDuoGrowthTracking(f.pg)).ready,false);assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,0);
 assert.ok((await inspectDuoGrowthTracking(f.pg)).triggers.every(r=>!r.definition.includes('mercenary_level_policy_v1')));
 const live=await installDuoGrowthTracking(f.pg,{commit:true,policyClient});assert.equal(live.receipt.policyRevision,version+1);
 const replay=await installDuoGrowthTracking(f.pg,{commit:true,policyClient});assert.equal(replay.replayed,true);
 assert.deepEqual(replay.receipt,live.receipt);assert.deepEqual((await f.pg.query('SELECT * FROM user_mercenary_levels_v1 ORDER BY user_id')).rows,before);
 assert.equal(Number((await f.pg.query("SELECT COUNT(*) AS n FROM admin_logs WHERE action_type='DUO_GROWTH_TRACKING'")).rows[0].n),1);
 const old=Number((await f.pg.query('SELECT source_version FROM ranked_duo_accounts_v1 WHERE user_id=2')).rows[0].source_version);
 await f.pg.query("UPDATE user_mercenary_levels_v1 SET experience=experience+1 WHERE user_id=2 AND mercenary_code='V-984'");
 assert.equal(Number((await f.pg.query('SELECT source_version FROM ranked_duo_accounts_v1 WHERE user_id=2')).rows[0].source_version),old+1);
});
