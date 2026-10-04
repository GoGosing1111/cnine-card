import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {factionFixture} from './helpers/clan-faction-fixture.mjs';
import {mutateFaction,factionOverview} from '../functions/_clan_faction.js';
import {registerApocalypseChallenge,apocalypseChallengeAction,normalizeApocalypseBonus} from '../functions/_apocalypse_challenge.js';
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

  test(`${label}: Apocalypse victory bonuses settle once with timing, atomic rollback and account isolation`,async t=>{
    const f=await factionFixture({postgres});t.after(()=>f.close());
    const schema=[
      'ALTER TABLE app_meta ADD COLUMN updated_at TEXT',
      'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,is_active INTEGER)',
      'CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code))',
      'CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT)',
      'CREATE TABLE coin_logs(user_id INTEGER,change_amount BIGINT,balance_after BIGINT,reason TEXT)'
    ];
    if(postgres)await f.DB.execSchema(["CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$",...schema]);else for(const sql of schema)await f.p(sql).run();
    for(const code of ['MASTER_STAR','STARLIGHT_ARMOR_CORE'])await f.p('INSERT INTO inventory_items VALUES(?,1)',code).run();
    const now=1700000000000,bonus={coinPercent:25,masterStars:300,mysticEnergy:4};
    const register=(requestId,won=true,values=bonus)=>registerApocalypseChallenge(f.env,{userId:1,requestId,monsterId:75,won,rewardCoin:400,bonus:values},now);
    const act=(action,requestId,extra={},at=now)=>apocalypseChallengeAction(f.env,f.user,action,{requestId,...extra},at);
    const totals=async()=>({coin:(await f.p('SELECT coin FROM users WHERE id=1').first()).coin,items:(await f.p('SELECT item_code,quantity FROM cnine_user_inventory ORDER BY item_code').all()).results,logs:(await f.p('SELECT COUNT(*) AS n FROM inventory_logs').first()).n});
    const id='apocalypse-receipt-1',ready=await register(id);
    assert.equal(ready.status,'READY');await assert.rejects(act('claim',id),/먼저/);
    await assert.rejects(apocalypseChallengeAction(f.env,{id:2},'open',{requestId:id},now),e=>e.status===404);
    const opened=await act('open',id);assert.equal((await act('open',id,{},now+2000)).openedAt,now);
    await assert.rejects(act('answer',id,{zone:9}),e=>e.status===400);
    const wrong=await act('answer',id,{zone:(opened.safeZone+1)%3},now+1000);assert.equal(wrong.success,false);
    assert.equal((await act('answer',id,{zone:opened.safeZone},now+2000)).success,false,'input cannot be changed after the first answer');
    await assert.rejects(act('claim',id,{},now+5999),/충격파/);
    await f.p("UPDATE inventory_items SET is_active=0 WHERE code='STARLIGHT_ARMOR_CORE'").run();
    await assert.rejects(act('claim',id,{},now+6000));
    assert.equal((await act('status',id)).status,'ANSWERED');assert.equal((await totals()).coin,100);assert.equal((await totals()).logs,0);
    await f.p("UPDATE inventory_items SET is_active=1 WHERE code='STARLIGHT_ARMOR_CORE'").run();
    f.setFailure('INSERT INTO coin_logs');await assert.rejects(act('claim',id,{},now+6000),/INJECTED/);f.setFailure('');
    assert.equal((await totals()).logs,0);assert.equal((await totals()).coin,100);
    const claimed=await act('claim',id,{},now+6000);
    assert.deepEqual(claimed.rewards,{coin:100,masterStars:300,mysticEnergy:4},'victory reward does not depend on practice result');
    const before=await totals();assert.equal(before.coin,200);assert.equal(before.logs,2);
    assert.equal((await act('claim',id,{},now+7000)).replayed,true);assert.deepEqual(await totals(),before);
    assert.equal((await register(id)).status,'CLAIMED');
    for(const [key,won,values] of [['apocalypse-loss',false,bonus],['apocalypse-unset',true,{}]]){
      await register(key,won,values);const row=await act('open',key);await act('answer',key,{zone:row.safeZone},now+1000);
      assert.deepEqual((await act('claim',key,{},now+6000)).rewards,{coin:0,masterStars:0,mysticEnergy:0});
    }
    assert.deepEqual(await totals(),before);
    const race='apocalypse-claim-race';await register(race);const r=await act('open',race);await act('answer',race,{zone:r.safeZone},now+1000);
    const original=f.DB.batch;
    f.DB.batch=async function(statements){f.DB.batch=original;await act('claim',race,{},now+6000);return original.call(this,statements)};
    assert.equal((await act('claim',race,{},now+6000)).replayed,true);assert.equal((await totals()).coin,300);assert.equal((await totals()).logs,4);
    await register('apocalypse-expired');await assert.rejects(act('open','apocalypse-expired',{},now+86400001),/기한/);
  });
}
