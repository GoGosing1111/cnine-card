import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {coreRewardFixture} from './helpers/core-reward-fixture.mjs';
import {CORE_REWARD_DEFAULT,validateCoreRewardPolicy,drawCoreRewards} from '../shared/core-raid-reward-policy-v1.mjs';
import {CORE_REWARD_KEY,prepareCoreChoiceGrant} from '../functions/_core_raid_rewards.js';
import {coreRaidWeeklyReward} from '../functions/_raid_core_protocol.js';
const reward=(rewardType,rewardRef='',quantity=3)=>({rewardType,rewardRef,quantity});
test('no economic default; positive minimum and nonempty weighted outcomes are mandatory before ON',()=>{
  assert.equal(CORE_REWARD_DEFAULT.enabled,false);assert.equal(CORE_REWARD_DEFAULT.minimum.quantity,null);
  assert.throws(()=>validateCoreRewardPolicy({...CORE_REWARD_DEFAULT,enabled:true}));
  const policy={...CORE_REWARD_DEFAULT,enabled:true,minimum:{rewardType:'COIN',quantity:100,weight:1},entries:[{...reward('MERCENARY','V-021',1),weight:2,enabled:true}]};
  assert.deepEqual(drawCoreRewards(policy,()=>0),Array(3).fill(reward('COIN','',100)));
  assert.deepEqual(drawCoreRewards(policy,()=>2),Array(3).fill(reward('MERCENARY','V-021',1)));
  for(const patch of [{quantity:0},{quantity:1.5},{quantity:-1},{quantity:Infinity},{rewardType:'NONE'},{weight:0},{weight:NaN}])assert.throws(()=>validateCoreRewardPolicy({...policy,entries:[{...policy.entries[0],...patch}]}));
  assert.throws(()=>validateCoreRewardPolicy({...policy,entries:[{...reward('COIN','',99),weight:1,enabled:true}]}));
});
for(const dialect of ['sqlite','postgres']){
  test(`${dialect}: CMS OWNER-only validation, CAS, audit and idempotent retry`,async()=>{
    const f=await coreRewardFixture(dialect);try{
      assert.equal((await f.admin(undefined,'USER')).status,403);
      const initial=await f.admin();assert.equal(initial.status,200,JSON.stringify(initial));
      assert.ok(initial.body.catalog.MERCENARY.some(row=>row.ref==='V-021'));
      assert.ok(!initial.body.catalog.INVENTORY_ITEM.some(row=>row.ref==='EQUIPMENT_PROTECTION_TICKET'));
      const body={requestId:crypto.randomUUID(),policy:{...f.policy,entries:[{...reward('MERCENARY','V-021',1),weight:2,enabled:true}]}};
      assert.equal((await f.admin(body)).body.policy.revision,2);
      assert.equal((await f.admin(body)).body.replayed,true);
      assert.equal((await f.admin({...body,requestId:crypto.randomUUID()})).status,409);
      assert.equal((await f.admin({...body,policy:{...body.policy,enabled:false}})).status,409);
      const invalid=await f.admin({requestId:crypto.randomUUID(),policy:{...f.policy,revision:2,entries:[{...reward('INVENTORY_ITEM','EQUIPMENT_PROTECTION_TICKET'),enabled:true,weight:1}]}});assert.equal(invalid.status,400);
      assert.equal((await f.row("SELECT COUNT(*) n FROM raid_core_receipts_v2024 WHERE action_type='REWARD_CONFIG_V1'")).n,1);
    }finally{await f.close();}
  });
  test(`${dialect}: three sealed slots never leak, refresh/CMS changes preserve offers, base and minimum pay once`,async()=>{
    const f=await coreRewardFixture(dialect);try{
      const offer=(await f.open()).body;assert.deepEqual(offer.slots,[0,1,2]);assert.ok(!('choices' in offer));assert.ok(!('minimum' in offer));
      await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...f.policy,enabled:false,minimum:{...f.policy.minimum,quantity:999}}),CORE_REWARD_KEY);
      assert.deepEqual((await f.open()).body,offer);
      assert.equal((await f.call('raid/core/claim',{roomId:f.roomId,requestId:crypto.randomUUID()})).body.code,'CORE_REWARD_SELECTION_REQUIRED');
      await f.run('DELETE FROM raid_core_active_members_v2024 WHERE user_id=1');
      const guessed=await f.call('raid/core/open',{requestId:offer.offerId});
      assert.ok(!JSON.stringify(guessed.body).includes('choices'));assert.equal(guessed.status,409);
      const paid=await f.claim(offer,2);assert.equal(paid.status,200,JSON.stringify(paid));assert.equal(paid.body.reward.coin,10000000000);assert.equal(paid.body.choiceReward.quantity,2);
      const replay=await f.claim(offer,0,{requestId:crypto.randomUUID()});assert.equal(replay.body.selectedIndex,2);assert.equal(replay.body.replayed,true);
      assert.equal((await f.row('SELECT coin FROM users WHERE id=1')).coin,10000000000);
      assert.equal((await f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'")).quantity,2);
      assert.equal((await coreRaidWeeklyReward(f.env,1)).used,1);
      assert.equal((await f.open()).body.result.selectedIndex,2);
    }finally{await f.close();}
  });
  test(`${dialect}: all seven rewards grant, ledger balances include base, mercenary duplicates retained`,async()=>{
    const f=await coreRewardFixture(dialect);try{
      for(const row of [reward('COIN'),reward('CARD_SHARDS'),reward('MAGIC_CRYSTAL'),reward('MASTER_STAR','MASTER_STAR'),reward('INVENTORY_ITEM','MAT'),reward('EQUIPMENT','1',2),reward('MERCENARY','V-021',2)]){
        const offer={offerId:'CORE-CHOICE-QA-'+row.rewardType,choices:[row],selectedIndex:0,minimum:reward('MASTER_STAR','MASTER_STAR',2)};
        const grant=await prepareCoreChoiceGrant(f.env,{id:1},offer);await f.DB.batch(grant.statements);
      }
      assert.deepEqual({...await f.row('SELECT coin,card_shards,magic_crystals FROM users WHERE id=1')},{coin:3,card_shards:3,magic_crystals:3});
      assert.equal((await f.row('SELECT COUNT(*) n FROM user_equipment_instances')).n,2);
      assert.equal((await f.row('SELECT duplicate_count FROM user_mercenary_cards_v1')).duplicate_count,1);
      const offer=await f.setChoices([reward('COIN','',5)]);assert.equal((await f.claim(offer)).status,200);
      assert.equal((await f.row("SELECT balance_after FROM coin_logs WHERE change_amount=5 AND reason='CORE_RAID_CHOICE'")).balance_after,10000000008);
    }finally{await f.close();}
  });
  test(`${dialect}: failed bonus rolls base/weekly back; selection and dropped commit response recover once`,async()=>{
    const f=await coreRewardFixture(dialect);try{
      const offer=await f.setChoices([reward('MERCENARY','V-021',2)]);f.fail('INSERT INTO user_mercenary_cards_v1');
      const failed=await f.claim(offer,1);assert.equal(failed.status,503,JSON.stringify(failed));
      assert.equal((await f.row('SELECT coin FROM users WHERE id=1')).coin,0);assert.equal((await coreRaidWeeklyReward(f.env,1)).used,0);
      assert.equal((await f.open()).body.selectedIndex,1);
      assert.equal((await f.claim(offer,2)).body.code,'CORE_REWARD_SELECTION_CONFLICT');
      f.fail('');f.loseCommit();const paid=await f.claim(offer,1);assert.equal(paid.status,200,JSON.stringify(paid));
      await f.claim(offer,1);assert.equal((await f.row('SELECT total_copies FROM user_mercenary_cards_v1')).total_copies,2);
      assert.equal((await f.row('SELECT coin FROM users WHERE id=1')).coin,10000000000);
    }finally{await f.close();}
  });
  test(`${dialect}: zero equipment inserts roll back; unavailable reward converts to minimum`,async()=>{
    const f=await coreRewardFixture(dialect);try{
      const offer=await f.setChoices([reward('EQUIPMENT','1')]),batch=f.DB.batch.bind(f.DB);
      f.DB.batch=statements=>batch([f.DB.prepare('UPDATE character_equipment_items SET is_active=0 WHERE id=1'),...statements]);
      assert.equal((await f.claim(offer)).status,503);assert.equal((await f.row('SELECT coin FROM users WHERE id=1')).coin,0);assert.equal((await coreRaidWeeklyReward(f.env,1)).used,0);
      f.DB.batch=batch;await f.run('UPDATE character_equipment_items SET is_active=0 WHERE id=1');
      const paid=await f.claim(offer);assert.equal(paid.status,200,JSON.stringify(paid));assert.equal(paid.body.choiceReward.converted,true);assert.equal(paid.body.choiceReward.rewardType,'MASTER_STAR');
    }finally{await f.close();}
  });
  test(`${dialect}: no member/clear/weekly eligibility bypass; disabled additional rewards preserve legacy claim`,async()=>{
    const f=await coreRewardFixture(dialect);try{
      assert.equal((await f.open(f.roomId,999)).status,409);
      await f.run("UPDATE raid_core_rooms_v2024 SET status='CORE' WHERE room_id=?",f.roomId);assert.equal((await f.open()).status,409);
      await f.run("UPDATE raid_core_rooms_v2024 SET status='CLEAR' WHERE room_id=?",f.roomId);
      await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...f.policy,enabled:false}),CORE_REWARD_KEY);
      assert.equal((await f.open()).body.enabled,false);
      const paid=await f.call('raid/core/claim',{roomId:f.roomId,requestId:crypto.randomUUID()});assert.equal(paid.status,200);assert.ok(!paid.body.choiceReward);
      const week=await coreRaidWeeklyReward(f.env,1);await f.run('UPDATE raid_core_weekly_rewards_v2112 SET reward_count=3 WHERE user_id=1');
      assert.equal((await f.open()).body.completed,true);assert.equal(week.used,1);
    }finally{await f.close();}
  });
  test(`${dialect}: simultaneous rooms compete for final weekly slot without bonus leakage`,async()=>{
    const f=await coreRewardFixture(dialect);try{
      const second='QA-CHOICE-ROOM-2';
      await f.run('INSERT INTO raid_core_rooms_v2024(room_id,room_code,host_user_id,status,party_hp,party_max_hp,core_target,boss_hp,boss_max_hp,lobby_ends_at,ends_at) SELECT ?,?,host_user_id,status,party_hp,party_max_hp,core_target,boss_hp,boss_max_hp,lobby_ends_at,ends_at FROM raid_core_rooms_v2024 WHERE room_id=?',second,second,f.roomId);
      await f.run('INSERT INTO raid_core_members_v2024(room_id,user_id) VALUES(?,1)',second);
      const offerA=await f.setChoices([reward('MERCENARY','V-021',1)]),offerB=await f.setChoices([reward('MERCENARY','V-021',1)],second);
      const week=await coreRaidWeeklyReward(f.env,1);
      await f.run('INSERT INTO raid_core_weekly_rewards_v2112(user_id,week_key,reward_count,last_request_id) VALUES(1,?,2,?)',week.weekKey,'QA-PRIOR-REWARDS');
      const results=await Promise.all([f.claim(offerA),f.claim(offerB)]);
      assert.equal(results.filter(row=>row.status===200).length,1,JSON.stringify(results));
      assert.equal((await f.row('SELECT total_copies FROM user_mercenary_cards_v1')).total_copies,1);
      assert.equal((await f.row('SELECT coin FROM users WHERE id=1')).coin,10000000000);
      assert.equal((await coreRaidWeeklyReward(f.env,1)).used,3);
    }finally{await f.close();}
  });
}
test('live loaders include reward UI/CMS and current cache versions without replacing V3 battle UI',()=>{
  const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(read('index.html'),/core-protocol-raid-v1924.js[^"\n]*rewards=20260925/);
  assert.match(read('admin/index.html'),/raid-overhaul-v1293.js[^"\n]*rewards=20260925/);
  assert.match(read('admin/core-protocol-raid-admin-v2021.js'),/mountCoreRewardAdmin/);
  assert.match(read('js/core-protocol-raid-v1924.js'),/showCoreRewardPicker/);
  assert.doesNotMatch(read('css/core-raid-reward-picker-v1.css'),/rosterCard|battle-v3-live/);
});
