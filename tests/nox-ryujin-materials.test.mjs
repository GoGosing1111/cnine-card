import test from 'node:test';
import assert from 'node:assert/strict';
import {noxFixture} from './helpers/nox-live-fixture.mjs';
import {noxAccess} from '../functions/_raid_nox_live.js';
import {NOX_RYUJIN_MATERIALS, drawNoxRyujinMaterial} from '../functions/_nox_ryujin_materials.js';
import {pigCoinRewardWeek} from '../shared/loot-shop-policy-v1.mjs';

test('one roll across the three materials gives 1 or 15 wins in 10,000 eligible clears',()=>{
  const {rewards}=noxAccess({id:1},{mode:'ON'});
  for(const [difficulty,target] of [['NORMAL',1],['HELL',15]]){
    const rate=rewards[difficulty].ryujinChanceBps;
    let wins=0,choices=0;
    for(let sample=0;sample<10000;sample++){
      const item=drawNoxRyujinMaterial(rate,bound=>{
        if(bound===10000)return sample;
        assert.equal(bound,3);choices++;return 0;
      });
      if(item)wins++;
    }
    assert.equal(wins,target);assert.equal(choices,target);
    assert.deepEqual([0,1,2].map(i=>drawNoxRyujinMaterial(rate,bound=>bound===10000?target-1:i).name),
      ['류진의 목걸이','류진의 신발','류진의 가면']);
  }
});

test('a single official clear pays eligible members only, atomically with weekly count, blueprint and receipt',async t=>{
  const f=await noxFixture(t);
  await f.configure({mode:'ON'});
  const {roomId}=await f.party(3,'HELL');
  assert.equal((await f.command('start',{roomId})).status,200);
  await f.pg.exec("INSERT INTO inventory_items VALUES('SCAR_BLUEPRINT_CHAPTER_1',1),('RYUJIN_NECKLACE',1)");
  const prefix='raid_nox_weekly_reward_v1:'+pigCoinRewardWeek(Date.now()).weekKey+':';
  await f.pg.query("INSERT INTO app_meta(key,value) VALUES($1,'2'),($2,'3')",[prefix+'1',prefix+'2']);
  await f.changeRoom(roomId,room=>{
    const now=Date.now();
    room.round=3;room.stage='EXPOSED';room.boss.hp=1;room.lastAttackAt=now-1500;
    room.challenge={id:roomId+':3:EXPOSED',stage:'EXPOSED',startsAt:now-1500,deadline:now+20000};
  });
  const random=t.mock.method(crypto,'getRandomValues',buffer=>buffer.fill(0));
  const poll=user=>f.call('state?roomId='+roomId,{user});
  f.failAt('NOX_RAID_RYUJIN_MATERIAL');
  assert.equal((await poll(1)).status,503);
  assert.equal((await f.one('SELECT count(*)::int AS n FROM inventory_logs')).n,0);
  assert.equal((await f.one('SELECT value FROM app_meta WHERE key=$1',[prefix+'1'])).value,'2');
  f.failAt('');
  const [first,second]=await Promise.all([poll(1),poll(1)]);
  assert.deepEqual(first.body.state.reward,second.body.state.reward);
  const calls=random.mock.callCount();
  for(const [user,used,eligible] of [[1,3,true],[2,3,false],[3,1,true]]){
    const {reward}= (await poll(user)).body.state;
    assert.equal(reward.weekly.used,used);
    assert.equal(reward.blueprintDrop.code,'SCAR_BLUEPRINT_CHAPTER_1');
    if(eligible){
      assert.deepEqual(reward.ryujinMaterialDrop,{...NOX_RYUJIN_MATERIALS[0],type:'INVENTORY_ITEM',
        ref:'RYUJIN_NECKLACE',quantity:1,eventId:roomId+':'+user});
    }else assert.equal(reward.ryujinMaterialDrop,undefined);
  }
  assert.equal(random.mock.callCount(),calls);
  const ledger=await f.all("SELECT user_id::int AS id,balance_after::int AS qty FROM inventory_logs WHERE reason='NOX_RAID_RYUJIN_MATERIAL' AND reference_id=$1 ORDER BY user_id",[roomId]);
  assert.deepEqual(ledger,[{id:1,qty:1},{id:3,qty:1}]);
  const stock=await f.all("SELECT user_id::int AS id,quantity::int,unseen_quantity::int FROM cnine_user_inventory WHERE item_code='RYUJIN_NECKLACE' ORDER BY user_id");
  assert.deepEqual(stock,[{id:1,quantity:1,unseen_quantity:1},{id:3,quantity:1,unseen_quantity:1}]);
});
