import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {factionFixture} from './helpers/clan-faction-fixture.mjs';
import {mutateFaction,factionOverview} from '../functions/_clan_faction.js';
import {normalizeApocalypseBonus} from '../functions/_apocalypse_challenge.js';
import {normalizeApocalypseSettings,preserveApocalypseUltimateSettings} from '../functions/_pve_nightmare.js';

test('deck edits preserve front/back positions and refill the selected empty slot',()=>{
  const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  const start=source.indexOf('function deckCardCount('),end=source.indexOf('function renderPveDeckCardList',start);
  const {clearDeckSlot,fillDeckSlot,selectEmptyDeckSlot,deckCardCount}=vm.runInNewContext(source.slice(start,end)+';({clearDeckSlot,fillDeckSlot,selectEmptyDeckSlot,deckCardCount})');
  const state={deck:['A','B','C','D','E']};
  clearDeckSlot(state,'A');assert.deepEqual([...state.deck],['','B','C','D','E']);assert.equal(deckCardCount(state.deck),4);
  assert.equal(fillDeckSlot(state,'F'),true);assert.deepEqual([...state.deck],['F','B','C','D','E']);
  clearDeckSlot(state,'B');clearDeckSlot(state,'E');selectEmptyDeckSlot(state,1);
  assert.equal(fillDeckSlot(state,'G'),true);assert.deepEqual([...state.deck],['F','G','C','D','']);
  assert.equal(fillDeckSlot(state,'G'),false);assert.equal(deckCardCount(state.deck),4);
  assert.equal(fillDeckSlot(state,'H'),true);assert.deepEqual([...state.deck],['F','G','C','D','H']);
  assert.equal(fillDeckSlot(state,'I'),false);
});

test('boss bonus values remain unspecified by default, differ by boss and survive older CMS saves',()=>{
  assert.deepEqual(normalizeApocalypseBonus(),{coinPercent:null,masterStars:null,mysticEnergy:null});
  assert.deepEqual(normalizeApocalypseBonus(null),normalizeApocalypseBonus());
  const previous=normalizeApocalypseSettings({monsterProfiles:{75:{clearBonus:{coinPercent:15,masterStars:300,mysticEnergy:2}},76:{clearBonus:{coinPercent:25,masterStars:600,mysticEnergy:4}}}});
  const saved=normalizeApocalypseSettings(preserveApocalypseUltimateSettings({monsterProfiles:{75:{},76:{}}},previous));
  assert.deepEqual(saved.monsterProfiles['75'].clearBonus,previous.monsterProfiles['75'].clearBonus);
  assert.equal(saved.monsterProfiles['76'].clearBonus.masterStars,600);
  const cleared=normalizeApocalypseSettings(preserveApocalypseUltimateSettings({monsterProfiles:{75:{clearBonus:{coinPercent:null,masterStars:null,mysticEnergy:null}}}},previous));
  assert.equal(cleared.monsterProfiles['75'].clearBonus.masterStars,null);
});

for(const postgres of [false,true]){
  const label=postgres?'PostgreSQL':'SQLite';
  test(`${label}: both captains can assign own garrisons; membership, battle locks and revocation are enforced`,async t=>{
    const f=await factionFixture({postgres,seeded:true});t.after(()=>f.close());
    const call=(kind,body={},user=f.user)=>mutateFaction(f.env,f.season,user,kind,{requestId:crypto.randomUUID(),...body},f.deps);
    const view=()=>factionOverview(f.env,f.season,f.user,f.deps);
    const user=id=>f.p('SELECT * FROM users WHERE id=?',id).first();
    const appoint=()=>call('captains',{captains:{attack1:2,attack2:4}});
    await appoint();const u2=await user(2),u4=await user(4),u3=await user(3);
    const districtId=(await view()).districts.find(d=>d.owner===1&&!d.protectedUntil).id;
    for(const captain of [u2,u4]){
      assert.equal((await factionOverview(f.env,f.season,captain,f.deps)).mine.canManageGarrison,true);
      await call('garrison',{districtId,squad:'defense2'},captain);
      assert.equal((await view()).districts.find(d=>d.id===districtId).defense,'defense2');
    }
    await assert.rejects(call('garrison',{districtId,squad:'defense1'},u3),e=>e.status===403);
    await assert.rejects(call('garrison',{districtId:'11680',squad:'defense1'},u2),/우리 클랜/);
    await assert.rejects(call('captains',{captains:{attack1:3,attack2:4}},u2),e=>e.status===403);
    const batch=f.DB.batch;
    f.DB.batch=async function(statements){f.DB.batch=batch;await call('captains',{captains:{attack1:3,attack2:4}});return batch.call(this,statements)};
    await assert.rejects(call('garrison',{districtId,squad:'defense1'},u2),e=>e.status===403);
    assert.equal((await view()).districts.find(d=>d.id===districtId).defense,'defense2');
    await appoint();
    f.DB.batch=async function(statements){f.DB.batch=batch;await f.p('UPDATE clan_members SET clan_id=2 WHERE user_id=2').run();return batch.call(this,statements)};
    await assert.rejects(call('garrison',{districtId,squad:'defense1'},u2),e=>e.status===403);
    await call('launch',{districtId,squad:'attack1'},await user(101));
    await assert.rejects(call('garrison',{districtId,squad:'defense1'},u4),/교전/);
  });

}
