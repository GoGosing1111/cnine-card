import test from 'node:test';import assert from 'node:assert/strict';
import {drawBlackwingScroll,BLACKWING_SCROLLS} from '../shared/blackwing-clear-reward-v1.mjs';
import {validateBlackwingSettings,defaultBlackwingSettings} from '../functions/_raid_blackwing_live.js';
import {blackwingWeeklyReward} from '../functions/_raid_blackwing_rewards.js';
import {rewardFixture,readyBlackwingClear,members} from './helpers/blackwing-rewards-fixture.mjs';
const changed={coinReward:20000000000000,enhancementScrollChance:30};
test('30% total drop chance yields exactly 15% weapon, 15% armor, 70% no scroll',()=>{
 const counts={WEAPON_ENHANCEMENT_SCROLL:0,ARMOR_ENHANCEMENT_SCROLL:0,NONE:0};
 for(let ticket=0;ticket<200;ticket++){const drop=drawBlackwingScroll(30,limit=>{assert.equal(limit,200);return ticket;});counts[drop?.code||'NONE']++;if(drop)assert.equal(drop.quantity,1);}
 assert.deepEqual(counts,{WEAPON_ENHANCEMENT_SCROLL:30,ARMOR_ENHANCEMENT_SCROLL:30,NONE:140});
 assert.equal(drawBlackwingScroll(0,()=>{throw Error('No draw expected');}),null);
 for(const value of [-1,101,30.5,NaN])assert.throws(()=>drawBlackwingScroll(value));
 for(const value of [-1,200,0.5,NaN])assert.throws(()=>drawBlackwingScroll(30,()=>value));
});
test('settings accept 20 trillion and total chance, and legacy configurations keep scrolls disabled',()=>{
 const base=defaultBlackwingSettings();delete base.enhancementScrollChance;assert.equal(validateBlackwingSettings(base).enhancementScrollChance,0);
 const next=validateBlackwingSettings({...base,...changed});assert.equal(next.coinReward,20000000000000);assert.equal(next.enhancementScrollChance,30);
 for(const patch of [{coinReward:20000000000001},{enhancementScrollChance:101},{enhancementScrollChance:-1},{enhancementScrollChance:30.5}])assert.throws(()=>validateBlackwingSettings({...base,...patch}));
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: full final attack settles 20T and one random scroll atomically and never rerolls committed rewards`,async t=>{
 const h=await rewardFixture({postgres});t.after(()=>h.close());for(const item of BLACKWING_SCROLLS)await h.run('INSERT INTO inventory_items(code,name,is_active) VALUES(?,?,1)',item.code,item.name);
 let ticket=0;
 for(const [index,roll]of [0,30,60,0].entries()){
  const final=await readyBlackwingClear(h,{rewardOverrides:changed});
  const saved=JSON.parse((await h.one('SELECT state_json FROM raid_blackwing_rooms_v1 WHERE room_id=?',final.roomId)).state_json);assert.equal(saved.rewardPolicy.enhancementScrollChance,30);assert.equal(saved.rewardPolicy.coin,changed.coinReward);
  // Starting policy remains frozen even if the CMS changes before the final strike.
  await h.configure({coinReward:1,enhancementScrollChance:0});
  ticket=roll;const controlled=t.mock.method(crypto,'getRandomValues',a=>{a.fill(ticket);return a;});
  if(index===0){
   const before=await h.one('SELECT state_json,version FROM raid_blackwing_rooms_v1 WHERE room_id=?',final.roomId);
   await h.run("UPDATE inventory_items SET is_active=0 WHERE code='WEAPON_ENHANCEMENT_SCROLL'");
   assert.equal((await h.call('action',{user:final.actor,body:final.body})).status,503);
   assert.deepEqual(await h.one('SELECT state_json,version FROM raid_blackwing_rooms_v1 WHERE room_id=?',final.roomId),before);
   assert.equal(Number((await h.one('SELECT COUNT(*) n FROM coin_logs')).n),0);assert.equal((await blackwingWeeklyReward(h.env,1,3)).used,0);
   assert.equal(Number((await h.one('SELECT COUNT(*) n FROM inventory_logs')).n),0);
   await h.run("UPDATE inventory_items SET is_active=1 WHERE code='WEAPON_ENHANCEMENT_SCROLL'");
   h.inject('UPDATE pig_coin_wallets_v1');assert.equal((await h.call('action',{user:final.actor,body:final.body})).status,503);h.inject('');
   assert.deepEqual(await h.one('SELECT state_json,version FROM raid_blackwing_rooms_v1 WHERE room_id=?',final.roomId),before);assert.equal(Number((await h.one('SELECT COUNT(*) n FROM inventory_logs')).n),0);
  }
  const paid=await h.call('action',{user:final.actor,body:final.body});assert.equal(paid.status,200,JSON.stringify(paid));
  ticket=199;const repeated=await h.call('action',{user:final.actor,body:final.body});assert.deepEqual(repeated.body.state.clearReward,paid.body.state.clearReward);
  const fresh=await h.call('action',{user:final.actor,body:{...final.body,requestId:h.uid()}});assert.equal(fresh.status,409);assert.deepEqual((await h.call('state?roomId='+final.roomId,{user:final.actor})).body.state.clearReward,paid.body.state.clearReward);
  for(const[id]of members){const view=(await h.call('state?roomId='+final.roomId,{user:Number(id)})).body.state.clearReward;
   assert.equal(view.granted,index<3);assert.equal(view.coin,index<3?changed.coinReward:0);
   if(index<2){assert.deepEqual(view.enhancementScroll,BLACKWING_SCROLLS[index]);assert.deepEqual(view.choiceOffer.baseReward.enhancementScroll,BLACKWING_SCROLLS[index]);}else assert.equal(view.enhancementScroll,undefined);
   if(index<3){assert.equal(view.pigCoins,100);assert.equal(view.masterStars,2000000);assert.equal(view.petEssence,5);}else assert.equal(view.status,'WEEKLY_LIMIT');
  }
  controlled.mock.restore();
 }
 for(const[id]of members){assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=?',id)).coin),60000000000000);assert.equal((await blackwingWeeklyReward(h.env,id,3)).used,3);for(const item of BLACKWING_SCROLLS)assert.equal(Number((await h.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',id,item.code)).quantity),1);}
 assert.equal(Number((await h.one("SELECT COUNT(*) n FROM inventory_logs WHERE item_code IN ('WEAPON_ENHANCEMENT_SCROLL','ARMOR_ENHANCEMENT_SCROLL')")).n),12);
 const testRoom=await readyBlackwingClear(h,{createdMode:'TEST',startedMode:'ON',rewardOverrides:changed});const noReward=await h.call('action',{user:testRoom.actor,body:testRoom.body});assert.equal(noReward.body.state.clearReward.granted,false);assert.equal(noReward.body.state.clearReward.enhancementScroll,undefined);
});
