import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyFixture} from './helpers/ranked-duo-weekly.mjs';
import {DUO_WEEKLY_POLICY_KEY} from '../shared/ranked-duo-weekly-v3.mjs';
import {openRankedDuoPool,OPERATION_KEY} from '../scripts/ops/ranked-duo-open-pool-20261020.mjs';

test('opening the unplayed current season preserves existing entries, economics and normal ranked settings; dry run and replay are safe',async t=>{
 const f=await weeklyFixture(t,{postgres:true,matchmaking:'RANDOM_ASYNC'});
 await f.pg.exec('ALTER TABLE admin_logs ADD COLUMN id BIGSERIAL PRIMARY KEY');
 await f.p("INSERT INTO app_meta(key,value) VALUES('pvp_settings_v1',?)",JSON.stringify(f.settings)).run();
 await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...f.policy,revision:3}),DUO_WEEKLY_POLICY_KEY).run();
 await f.tick();const s=await f.season(),config={...s.config,weekly:{...s.config.weekly,sequence:5}};
 await f.p('UPDATE ranked_duo_seasons_v1 SET config_json=? WHERE id=?',JSON.stringify(config),s.id).run();
 for(const user of [2,3])assert.equal((await f.call('ranked-duo/join',{user,method:'POST'})).status,200);
 const client={query:(sql,args)=>sql.startsWith('SELECT current_user')?Promise.resolve({rows:[{role:'cnine_migrator',db:'cnine'}]}):f.pg.query(sql,args)};
 const options={expectedSeasonId:s.id,now:f.clock()},dry=await openRankedDuoPool(client,options);
 assert.equal(dry.dryRun,true);assert.equal(dry.preservedEntries,2);assert.equal((await f.season()).status,'RECRUITING');
 assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',OPERATION_KEY).first(),null);
 const applied=await openRankedDuoPool(client,{...options,commit:true});
 assert.equal(applied.dryRun,false);assert.equal((await f.season()).status,'ACTIVE');assert.equal((await f.season()).recruit_until,null);
 assert.equal((await f.season()).config.entryMode,'RANKED_POOL');assert.equal(applied.entriesHash,dry.entriesHash);
 const replay=await openRankedDuoPool({...client,query(sql,args){if(/^\s*(INSERT|UPDATE|DELETE)/i.test(sql))throw Error('REPLAY_WRITE');return client.query(sql,args);}},{...options,commit:true});
 assert.equal(replay.alreadyApplied,true);assert.equal(replay.auditId,applied.auditId);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_matches_v1').first()).n),0);
 assert.equal(Number((await f.p('SELECT SUM(coin) n FROM users').first()).n),0);
});
