import test from 'node:test';
import assert from 'node:assert/strict';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';

for(const postgres of [false,'pipeline']){
 test(`${postgres||'SQLite'} one changing account cannot discard the other completed duo ratings`,async t=>{
  const f=await duoFixture(t,{postgres});await f.ready();await f.p('DELETE FROM ranked_duo_profiles_v1').run();
  const original=f.deps.cardUniqueDeckStates,batches=[];
  const deps={...f.deps,async cardUniqueDeckStates(env,entries,...args){
   const ids=[...new Set(entries.map(e=>e.user.id))];batches.push(ids);
   // A busy player changes during every multi-user scan. Once only that account
   // remains, the shorter retry can obtain a current, verified snapshot.
   if(ids.includes(2)&&ids.length>1)await f.p("UPDATE user_cards SET quantity=quantity+1 WHERE user_id=2 AND card_id='C-0'").run();
   return original(env,entries,...args);
  }};
  const profiles=await loadDuoProfiles(f.env,[2,3,4,5],f.config,deps,{now:f.clock(),wait:async()=>{}});
  assert.deepEqual(batches,[[2,3,4,5],[2]]);
  assert.deepEqual(profiles.map(p=>p.userId),[2,3,4,5]);
  for(const profile of profiles){
   const current=await f.p('SELECT source_version FROM ranked_duo_accounts_v1 WHERE user_id=?',profile.userId).first();
   assert.equal(profile.sourceVersion,Number(current.source_version));assert.ok(profile.attackReady&&profile.defenseReady);
  }
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_profile_leases_v1').first()).n),0);
 });
 test(`${postgres||'SQLite'} an account that never stabilizes remains blocked and its stale rating is never cached`,async t=>{
  const f=await duoFixture(t,{postgres});await f.ready();await f.p('DELETE FROM ranked_duo_profiles_v1').run();
  const original=f.deps.cardUniqueDeckStates;
  const deps={...f.deps,async cardUniqueDeckStates(env,entries,...args){
   await f.p("UPDATE user_cards SET quantity=quantity+1 WHERE user_id=2 AND card_id='C-0'").run();
   return original(env,entries,...args);
  }};
  await assert.rejects(loadDuoProfiles(f.env,[2,3],f.config,deps,{now:f.clock(),wait:async()=>{}}),{code:'DUO_PROFILE_BUILDING'});
  assert.equal(await f.p('SELECT user_id FROM ranked_duo_profiles_v1 WHERE user_id=2').first(),null);
  assert.ok(await f.p('SELECT user_id FROM ranked_duo_profiles_v1 WHERE user_id=3').first());
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_profile_leases_v1').first()).n),0);
 });
}
