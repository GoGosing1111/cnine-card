import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyFixture,day} from './helpers/ranked-duo-weekly.mjs';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {DUO_WEEKLY_POLICY_KEY} from '../shared/ranked-duo-weekly-v3.mjs';
import {rankedDuoPoolCandidates,rankedDuoPoolCount} from '../functions/_ranked_duo_pool.js';
import {readMercenaryModes,mercenaryModeStatements,mercenaryPvpLoadoutKey} from '../functions/_mercenary_loadout_modes.js';

async function equipMercenaries(f){
 const schema='ALTER TABLE user_mercenary_loadout_v1 ADD COLUMN revision INTEGER DEFAULT 0; ALTER TABLE user_mercenary_loadout_v1 ADD COLUMN updated_at TEXT';
 if(f.pg)await f.pg.exec(schema);else f.native.exec(schema);
 const document=JSON.parse((await f.p("SELECT payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first()).payload_json);
 document.mercenaries.find(c=>c.code==='V-001').rank='C';
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(document)).run();
 for(let user=1;user<=7;user++){
  await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(?,'V-001',1)",user).run();
  await f.p("INSERT INTO user_mercenary_loadout_v1(user_id,mercenary_code) VALUES(?,'V-001')",user).run();
 }
}
async function saveMercenary(f,user,code,mode='PVP'){
 const record=(await readMercenaryModes(f.env,[user])).get(user);
 await f.DB.batch(mercenaryModeStatements(f.DB,user,record,mode,{mercenaryCode:code,revision:record.loadouts[mode].revision+1}));
}
async function fixture(t,options={}){
 const f=await weeklyFixture(t,{...options,matchmaking:'RANDOM_ASYNC',entryMode:'RANKED_POOL'});
 if(f.pg)await f.pg.exec(`
  CREATE FUNCTION sqlite_json_valid(text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$BEGIN PERFORM $1::jsonb; RETURN true; EXCEPTION WHEN OTHERS THEN RETURN false; END$$;
  CREATE FUNCTION sqlite_json_array_length(text) RETURNS integer LANGUAGE SQL IMMUTABLE AS $$SELECT jsonb_array_length($1::jsonb)$$;
  CREATE FUNCTION sqlite_json_extract(text,text) RETURNS text LANGUAGE SQL IMMUTABLE AS $$SELECT $1::jsonb->>substring($2 from 3)$$;
 `);
 await equipMercenaries(f);await f.tick();return f;
}
const count=async(f,table,where='',args=[])=>Number((await f.p(`SELECT COUNT(*) n FROM ${table} ${where}`,...args).first()).n);
const match=(f,user=2)=>f.call('ranked-duo/match',{user,method:'POST'});
const fight=(f,ticket,user=2,id='open-duo-fight-0001')=>f.call('ranked-duo/fight',{user,method:'POST',body:{matchToken:ticket.token,requestId:id}});
const roster=ticket=>[...ticket.team.members,...ticket.opponent.members].map(m=>m.userId);

for(const postgres of [false,true,'pipeline'])test(`${postgres||'SQLite'} no enrollment: ranked decks with equipped mercenaries fight and only the initiator gains a record`,async t=>{
 const f=await fixture(t,{postgres}),s=await f.season();
 assert.equal(s.status,'ACTIVE');assert.equal(s.recruit_until,null);assert.equal(s.config.recruitHours,0);
 assert.equal(Date.parse(s.config.startsAt),f.clock());assert.equal(Date.parse(s.config.endsAt)-f.clock(),7*day);
 const status=(await f.call('ranked-duo/status',{user:2})).data;
 assert.equal(status.joined,true,'cached clients must offer match without enrollment');assert.equal(status.hasSeasonRecord,false);assert.equal(status.poolCount,6);assert.equal(status.player.score,1000);assert.equal(status.energy.current,10);
 assert.equal(await count(f,'ranked_duo_entries_v1'),0,'status must not enroll anyone');
 const ticket=await match(f);assert.equal(ticket.status,200,JSON.stringify(ticket));assert.equal(new Set(roster(ticket.data)).size,4);
 assert.deepEqual((await match(f)).data,ticket.data);
 assert.equal(await count(f,'ranked_duo_entries_v1'),1);assert.equal(await count(f,'ranked_duo_players_v4'),1);
 const result=await fight(f,ticket.data);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.status,'COMPLETED');
 assert.equal(result.data.scoreScope,'INITIATOR');assert.equal(result.data.battleV2.teams.A.cards.length,10);assert.equal(result.data.battleV2.teams.B.cards.length,10);
 assert.equal(result.data.battleV2.teams.A.mercenaries.length,2);assert.equal(result.data.battleV2.teams.B.mercenaries.length,2);
 const after=(await f.call('ranked-duo/status',{user:2})).data;
 assert.equal(after.energy.current,9);assert.equal(after.joined,true);assert.equal(after.hasSeasonRecord,true);
 for(const user of roster(ticket.data).filter(id=>id!==2)){
  assert.equal(await count(f,'ranked_duo_entries_v1','WHERE user_id=?',[user]),0);
  assert.equal(await count(f,'ranked_duo_players_v4','WHERE user_id=?',[user]),0);
  assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=?',user).first()).coin),0);
  const other=(await f.call('ranked-duo/status',{user})).data;
  assert.equal(other.player.score,1000);assert.equal(other.energy.current,10);assert.equal(other.joined,true);assert.equal(other.hasSeasonRecord,false);
  assert.equal((await f.call('ranked-duo/history',{user})).data.history[0].scoreApplied,false);
  assert.equal((await f.call('ranked-duo/replay?id='+result.data.matchId,{user})).status,200);
 }
 assert.deepEqual((await fight(f,ticket.data)).data,result.data);
 assert.equal(await count(f,'ranked_duo_matches_v1'),1);
 assert.equal((await f.call('ranked-duo/ranking',{user:2})).data.ranking.length,1);
 assert.equal((await f.call('admin/ranked-duo/recruit',{method:'POST'})).data.code,'DUO_RECRUIT_STATE');
 assert.equal((await f.call('ranked-duo/join',{user:2,method:'DELETE'})).data.code,'DUO_SEASON_STARTED');
});

for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'} expiry opens the next week immediately while old rewards settle independently`,async t=>{
 const f=await fixture(t,{postgres}),old=await f.season(),ticket=(await match(f)).data;
 assert.equal((await fight(f,ticket)).status,200);
 f.advance(7*day);
 const status=await f.call('ranked-duo/status',{user:6});assert.equal(status.status,200,JSON.stringify(status));
 const current=await f.season();assert.notEqual(current.id,old.id);assert.equal(current.status,'ACTIVE');
 assert.equal(current.config.weekly.sequence,2);assert.equal(current.recruit_until,null);assert.equal(Date.parse(current.config.startsAt),f.clock());
 assert.equal((await f.p('SELECT status FROM ranked_duo_seasons_v1 WHERE id=?',old.id).first()).status,'SETTLING');
 assert.equal(await count(f,'ranked_duo_rewards_v3'),0);
 const nextTicket=await match(f,6);assert.equal(nextTicket.status,200,JSON.stringify(nextTicket));
 assert.equal((await fight(f,nextTicket.data,6,'open-next-week-0001')).status,200);
 for(let n=0;n<4;n++)await f.tick();
 assert.equal((await f.p('SELECT status FROM ranked_duo_seasons_v1 WHERE id=?',old.id).first()).status,'CLOSED');
 assert.equal((await f.season()).id,current.id);assert.equal((await f.season()).status,'ACTIVE');
 assert.equal(await count(f,'ranked_duo_rewards_v3','WHERE season_id=?',[old.id]),1);
 assert.equal(await count(f,'ranked_duo_rewards_v3','WHERE season_id=?',[current.id]),0);
});

test('simultaneous first matches create one personal row and one ticket',async t=>{
 const f=await fixture(t,{postgres:true});
 const matches=await Promise.all([match(f),match(f),match(f)]);
 for(const r of matches){assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(r.data,matches[0].data);}
 assert.equal(await count(f,'ranked_duo_entries_v1'),1);assert.equal(await count(f,'ranked_duo_players_v4'),1);
 assert.equal(Number((await f.season()).participant_count),1);assert.equal(await count(f,'ranked_duo_tickets_v4'),1);
});

test('concurrent rollover creates one active season and retains the old receipt',async t=>{
 const f=await fixture(t,{postgres:true});f.advance(7*day);
 const responses=await Promise.all([2,3,4].map(user=>f.call('ranked-duo/status',{user})));
 for(const r of responses)assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(new Set(responses.map(r=>r.data.season.id)).size,1);
 assert.equal(await count(f,'ranked_duo_seasons_v1'),2);assert.equal(await count(f,'ranked_duo_seasons_v1',"WHERE status='ACTIVE'"),1);
});

test('invalid saved decks, restricted accounts and owner never enter the global pool',async t=>{
 const f=await fixture(t);
 await f.p("UPDATE users SET banned_until='2099-01-01T00:00:00Z' WHERE id=3").run();
 await f.p("UPDATE users SET role='OWNER' WHERE id=4").run();
 await f.p("UPDATE pvp_decks SET card_ids='broken json' WHERE user_id=5").run();
 await f.p('UPDATE pvp_active_presets SET preset_no=2 WHERE user_id=6').run();
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.poolCount,2);
 assert.equal((await match(f)).data.code,'DUO_NO_OPPONENT');
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
 assert.equal(await count(f,'ranked_duo_matches_v1'),0);
 assert.equal((await match(f,1)).status,403);
});

test('offline deck changes invalidate a ticket without debiting the requester',async t=>{
 const f=await fixture(t),ticket=(await match(f)).data,partner=ticket.team.members[1].userId;
 await f.p("UPDATE pvp_deck_presets SET card_ids='[]' WHERE user_id=?",partner).run();
 assert.equal((await fight(f,ticket)).data.code,'DUO_TICKET');
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
 assert.equal(await count(f,'ranked_duo_matches_v1'),0);
});

test('automatic operation OFF does not reopen a season',async t=>{
 const f=await fixture(t),old=await f.season();
 await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...f.policy,enabled:false}),DUO_WEEKLY_POLICY_KEY).run();
 f.advance(7*day);assert.equal((await match(f)).data.code,'DUO_NOT_ACTIVE');
 for(let n=0;n<4;n++)await f.tick();
 assert.equal((await f.season()).id,old.id);assert.equal((await f.season()).status,'CLOSED');
 assert.equal(await count(f,'ranked_duo_seasons_v1'),1);
});

test('the former recruitment capacity cannot prevent a new player from matching',async t=>{
 const f=await fixture(t),s=await f.season();
 await f.p('UPDATE ranked_duo_seasons_v1 SET participant_count=10000 WHERE id=?',s.id).run();
 const result=await match(f);assert.equal(result.status,200,JSON.stringify(result));
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
});

test('a manually configured open season starts without a recruitment or pairing step',async t=>{
 const f=await duoFixture(t),config={...f.config,matchmaking:'RANDOM_ASYNC',entryMode:'RANKED_POOL',startsAt:new Date(f.clock()).toISOString()};
 await equipMercenaries(f);
 assert.equal((await f.call('admin/ranked-duo/create',{method:'POST',body:{config}})).status,200);
 const started=await f.call('admin/ranked-duo/start',{method:'POST'});assert.equal(started.status,200,JSON.stringify(started));
 assert.equal(started.data.season.status,'ACTIVE');assert.equal(started.data.season.visible,true);
 assert.equal((await match(f)).status,200);
});

test('the global pool includes late saved decks and excludes deleted decks without enrollment',async t=>{
 const f=await fixture(t),saved=await f.p('SELECT card_ids FROM pvp_decks WHERE user_id=7').first();
 await f.p('DELETE FROM pvp_decks WHERE user_id=7').run();
 assert.ok(!(await rankedDuoPoolCandidates(f.env,2,f.clock())).includes(7));
 await f.p('INSERT INTO pvp_decks(user_id,card_ids) VALUES(7,?)',saved.card_ids).run();
 const seen=new Set();
 for(let n=0;n<12;n++)for(const id of await rankedDuoPoolCandidates(f.env,2,f.clock()))seen.add(id);
 assert.deepEqual([...seen].sort(),[3,4,5,6,7]);
 assert.equal(await count(f,'ranked_duo_entries_v1'),0);
 assert.ok(!f.queries().some(sql=>/ORDER BY RANDOM|ORDER BY RAND\(/i.test(sql)));
});

for(const postgres of [false,true,'pipeline']){
 test(`${postgres||'SQLite'} pool requires ownership and the effective PVP slot, including legacy inheritance`,async t=>{
  const f=await fixture(t);
  await f.p('DELETE FROM user_mercenary_loadout_v1 WHERE user_id=3').run(); // Owned, never equipped.
  await saveMercenary(f,5,null); // PVE remains equipped; explicit empty PVP must win.
  await saveMercenary(f,6,'V-001');await saveMercenary(f,6,null,'PVE'); // PVP-only is eligible.
  await f.p('UPDATE user_mercenary_cards_v1 SET total_copies=0 WHERE user_id=7').run();
  assert.deepEqual((await rankedDuoPoolCandidates(f.env,2,f.clock())).sort(),[4,6]);
  assert.equal(await rankedDuoPoolCount(f.env,f.clock()),3);
  assert.equal((await match(f)).data.code,'DUO_NO_OPPONENT');
  assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
  await saveMercenary(f,5,'V-001');
  assert.deepEqual((await rankedDuoPoolCandidates(f.env,2,f.clock())).sort(),[4,5,6]);
  const ticket=await match(f);assert.equal(ticket.status,200,JSON.stringify(ticket));assert.deepEqual(roster(ticket.data).sort(),[2,4,5,6]);
  await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',mercenaryPvpLoadoutKey(4),'broken json').run();
  assert.deepEqual((await rankedDuoPoolCandidates(f.env,2,f.clock())).sort(),[5,6]);
  assert.equal(await count(f,'ranked_duo_matches_v1'),0);
 });

 test(`${postgres||'SQLite'} cached tickets are replaced when a selected account unequips its PVP mercenary`,async t=>{
  const f=await fixture(t),ticket=(await match(f)).data,partner=ticket.team.members[1].userId;
  await saveMercenary(f,partner,null);
  const replacement=await match(f);assert.equal(replacement.status,200,JSON.stringify(replacement));
  assert.notEqual(replacement.data.token,ticket.token);assert.ok(!roster(replacement.data).includes(partner));
  assert.equal((await fight(f,ticket)).data.code,'DUO_TICKET');
  assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
  const result=await fight(f,replacement.data);assert.equal(result.data.status,'COMPLETED',JSON.stringify(result));
  assert.deepEqual((await fight(f,replacement.data)).data,result.data);
  assert.equal(await count(f,'ranked_duo_matches_v1'),1);
 });

 test(`${postgres||'SQLite'} unequipping any of the four PVP mercenaries blocks admission without spending energy`,async t=>{
  const f=await fixture(t);
  for(let index=0;index<4;index++){
   const response=await match(f);assert.equal(response.status,200,JSON.stringify(response));
   const ticket=response.data,user=roster(ticket)[index];await saveMercenary(f,user,null);
   assert.equal((await fight(f,ticket)).data.code,'DUO_TICKET');
   assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
   assert.equal(await count(f,'ranked_duo_matches_v1'),0);assert.equal(await count(f,'ranked_duo_match_members_v4'),0);
   if(index===0)assert.equal((await match(f)).data.code,'DUO_MERCENARY');
   await saveMercenary(f,user,'V-001');
  }
 });

 test(`${postgres||'SQLite'} mercenary removal at admission rolls back ticket, energy and match together`,async t=>{
  const f=await fixture(t),ticket=(await match(f)).data,batch=f.DB.batch.bind(f.DB);let injected=false;
  f.DB.batch=async statements=>{
   if(!injected&&statements.some(s=>s.source.includes('INSERT INTO ranked_duo_matches_v1'))){
    injected=true;
    // No profile-version change: the admission query must independently reject
    // the now-empty PVP override, even with an otherwise current cached profile.
    await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',mercenaryPvpLoadoutKey(ticket.opponent.members[0].userId),JSON.stringify({mercenaryCode:null,revision:1})).run();
   }
   return batch(statements);
  };
  assert.equal((await fight(f,ticket)).data.code,'DUO_CONFLICT');assert.equal(injected,true);
  assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
  assert.equal((await f.p('SELECT used_at FROM ranked_duo_tickets_v4 WHERE token=?',ticket.token).first()).used_at,null);
  assert.equal(await count(f,'ranked_duo_matches_v1'),0);assert.equal(await count(f,'ranked_duo_match_members_v4'),0);
 });
}
