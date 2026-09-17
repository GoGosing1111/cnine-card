import test from 'node:test';
import assert from 'node:assert/strict';
import {factionFixture} from './helpers/clan-faction-fixture.mjs';
import {mutateFaction,factionOverview} from '../functions/_clan_faction.js';

const call=(f,kind,body={},user=f.user)=>mutateFaction(f.env,f.season,user,kind,{requestId:crypto.randomUUID(),...body},f.deps);
const view=(f,user=f.user)=>factionOverview(f.env,f.season,user,f.deps);
const account=(f,id)=>f.p('SELECT * FROM users WHERE id=?',id).first();
const appoint=(f,captains={attack1:2,attack2:4})=>call(f,'captains',{captains});
const stored=f=>f.p('SELECT revision,state_json FROM clan_faction_state WHERE season_id=7').first();
function beforeBatch(f,callback){
  const original=f.DB.batch;
  f.DB.batch=async function(statements){f.DB.batch=original;await callback();return original.call(this,statements);};
}

for(const postgres of [false,true]){
  const prefix=postgres?'PostgreSQL':'SQLite';
  test(`${prefix} two distinct current clan captains, master-only appointment and legacy state`,async t=>{
    const f=await factionFixture({postgres,seeded:true});t.after(()=>f.close());
    const row=await stored(f),legacy=JSON.parse(row.state_json);delete legacy.captains;
    await f.p('UPDATE clan_faction_state SET state_json=? WHERE season_id=7',JSON.stringify(legacy)).run();
    const u2=await account(f,2);
    assert.deepEqual((await view(f,u2)).captains,{attack1:0,attack2:0});
    assert.equal((await view(f,u2)).mine.canManageFormation,false);
    await assert.rejects(call(f,'captains',{captains:{attack1:2,attack2:4}},u2),e=>e.status===403);
    for(const captains of [{attack1:2,attack2:2},{attack1:2},{attack1:2,attack2:4,defense1:6},{attack1:'2',attack2:4},{attack1:-1,attack2:4},[]])
      await assert.rejects(appoint(f,captains),e=>e.status===400);
    await assert.rejects(appoint(f,{attack1:102,attack2:4}),e=>e.status===403);
    // Assignment is a delegation role, so a waiting member may hold it.
    await appoint(f,{attack1:12,attack2:4});
    assert.equal((await view(f,await account(f,12))).mine.canManageFormation,true);
    assert.deepEqual((await view(f)).captains,{attack1:12,attack2:4});
    await appoint(f,{attack1:0,attack2:0});
    assert.equal((await view(f,await account(f,12))).mine.canManageFormation,false);
  });

  test(`${prefix} either captain can reorganize both attack and defense lineups without granting roles`,async t=>{
    const f=await factionFixture({postgres,seeded:true});t.after(()=>f.close());
    await appoint(f);const u2=await account(f,2),u4=await account(f,4),u3=await account(f,3);
    const before=await view(f),formation={attack1:[1,2,6],attack2:[4,9],defense1:[3,7,8],defense2:[5,10,11,12]};
    await call(f,'formation',{formation,baseFormation:before.formation},u2);
    assert.deepEqual((await view(f)).formation,formation);
    const next={...formation,attack1:[1,2,6,12],defense2:[5,10,11]};
    await call(f,'formation',{formation:next,baseFormation:formation},u4);
    assert.deepEqual((await view(f)).formation,next);
    assert.deepEqual((await view(f)).captains,{attack1:2,attack2:4});
    await assert.rejects(call(f,'formation',{formation:next},u3),e=>e.status===403);
    await assert.rejects(call(f,'captains',{captains:{attack1:3,attack2:4}},u2),e=>e.status===403);
    await assert.rejects(call(f,'formation',{formation:next,captains:{attack1:3,attack2:4}},u2),e=>e.status===403);
    await assert.rejects(call(f,'formation',{formation:{...next,attack1:[1,2,3,4,5,6]}},u2),/최대 5명/);
    await assert.rejects(call(f,'formation',{formation:{...next,attack1:[2,4]}},u2),/하나의 부대/);
    await assert.rejects(call(f,'formation',{formation:{...next,attack1:[102]}},u2),/현재 클랜원/);
    assert.deepEqual((await view(f)).formation,next);
    await appoint(f,{attack1:3,attack2:4});
    await assert.rejects(call(f,'formation',{formation:next},u2),e=>e.status===403);
    await call(f,'formation',{formation:next},u3);
  });

  test(`${prefix} ordinary attack members still launch and fight, while all lineups lock in battle`,async t=>{
    const f=await factionFixture({postgres,seeded:true});t.after(()=>f.close());
    await appoint(f,{attack1:12,attack2:4});const member=await account(f,3),captain=await account(f,12);
    await assert.rejects(call(f,'launch',{squad:'attack1',districtId:'11680'},captain),/공격대원이나 클랜장/);
    const b=await call(f,'launch',{squad:'attack1',districtId:'11680'},member);
    assert.ok(b.battleId);assert.equal(b.captured,undefined);
    const formation=(await view(f)).formation;
    await assert.rejects(call(f,'formation',{formation},captain),/교전/);
    await assert.rejects(call(f,'formation',{formation}),/교전/);
    await appoint(f,{attack1:2,attack2:4});
    await call(f,'enter',{battleId:b.battleId},member);
    assert.equal((await call(f,'strike',{battleId:b.battleId},member)).side,'ATTACK');
    const d=await view(f);assert.equal(d.battles[0].initiator,3);assert.equal(d.battles[0].entries[3].hits,1);
  });

  test(`${prefix} role revocation, membership and master changes during commit deny stale authority`,async t=>{
    const f=await factionFixture({postgres,seeded:true});t.after(()=>f.close());
    await appoint(f);const u2=await account(f,2),formation=(await view(f)).formation;
    beforeBatch(f,()=>appoint(f,{attack1:3,attack2:4}));
    await assert.rejects(call(f,'formation',{formation:{...formation,attack1:[1,2]}} ,u2),e=>e.status===403);
    assert.deepEqual((await view(f)).formation,formation);
    await appoint(f);beforeBatch(f,()=>f.p('UPDATE clan_members SET clan_id=2 WHERE user_id=2 AND season_id=7').run());
    await assert.rejects(call(f,'formation',{formation},u2),e=>e.status===403);
    assert.equal((await view(f)).captains.attack1,0);
    beforeBatch(f,()=>f.p('UPDATE clan_season_teams SET master_user_id=3 WHERE clan_id=1 AND season_id=7').run());
    await assert.rejects(appoint(f,{attack1:3,attack2:4}),e=>e.status===403);
    assert.equal((await view(f)).captains.attack1,0);
  });

  test(`${prefix} concurrent lineup edits reject stale drafts and receipt failure rolls back both roles and lineup`,async t=>{
    const f=await factionFixture({postgres,seeded:true});t.after(()=>f.close());
    await appoint(f);const u2=await account(f,2),u4=await account(f,4),base=(await view(f)).formation;
    const other={...base,defense2:[9,10,11,12]};
    beforeBatch(f,()=>call(f,'formation',{formation:other,baseFormation:base},u4));
    await assert.rejects(call(f,'formation',{formation:{...base,attack1:[1,2]},baseFormation:base},u2),/다른 편성자/);
    assert.deepEqual((await view(f)).formation,other);
    const before=await stored(f);f.setFailure('INSERT INTO clan_faction_receipts');
    await assert.rejects(call(f,'formation',{formation:base,captains:{attack1:3,attack2:5}}),/INJECTED/);
    await assert.rejects(appoint(f,{attack1:3,attack2:5}),/INJECTED/);f.setFailure('');
    assert.deepEqual(await stored(f),before);
    const requestId='captain-formation-idempotent';
    await call(f,'formation',{formation:base,baseFormation:other,requestId},u2);
    assert.equal((await call(f,'formation',{formation:base,baseFormation:other,requestId},u2)).replayed,true);
  });
}
