import test from 'node:test';
import assert from 'node:assert/strict';
import {rewardFixture,readyBlackwingClear,rewardSettings,choicePolicy,members} from './helpers/blackwing-rewards-fixture.mjs';
import {blackwingWeeklyReward,prepareBlackwingRewards} from '../functions/_raid_blackwing_rewards.js';
import {claimRewardReveal,readRewardRevealPolicy} from '../functions/_reward_reveal.js';
import {validateBlackwingSettings,defaultBlackwingSettings} from '../functions/_raid_blackwing_live.js';
import {buildBlackwingRelease,KEYS} from '../scripts/ops/blackwing-live-rewards-20261029.mjs';

test('ON validates; historical TEST defaults remain locked; copying keeps source rewards and difficulty',()=>{
 const old={revision:5,mode:'TEST',testUserIds:[1,2],bossCombatPower:45000000,lobbyMinutes:5,enrageSeconds:300,mechanicTimePercent:100};
 assert.equal(validateBlackwingSettings(old).rewardsEnabled,false);
 assert.equal(validateBlackwingSettings({...old,...rewardSettings}).mode,'ON');
 for(const patch of [{weeklyRewardLimit:0},{pigCoinReward:-1},{rewardsEnabled:'true'},{coinReward:1000000000001}])assert.throws(()=>validateBlackwingSettings({...old,...rewardSettings,...patch}));
 const source={...rewardSettings,revision:8},raw={[KEYS.blackwing]:JSON.stringify(old),[KEYS.choice]:null,[KEYS.varsen]:JSON.stringify(source),[KEYS.varsenChoice]:JSON.stringify({...choicePolicy(),revision:2})},snapshot=structuredClone(raw),next=buildBlackwingRelease(raw);
 assert.deepEqual(raw,snapshot);assert.deepEqual(next[KEYS.choice],choicePolicy());
 assert.equal(next[KEYS.blackwing].bossCombatPower,45000000);assert.equal(next[KEYS.blackwing].lobbyMinutes,5);assert.equal(next[KEYS.blackwing].revision,6);
 assert.deepEqual(next[KEYS.blackwing].testUserIds,[1,2]);for(const key of Object.keys(rewardSettings))assert.equal(next[KEYS.blackwing][key],rewardSettings[key]);
 assert.equal(next[KEYS.varsen].entryTicketCost,0);assert.equal(next[KEYS.varsen].testEntryFree,true);
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: final attack awards six players atomically, retries once, grants one independent choice and limits three weekly`,async t=>{
 const h=await rewardFixture({postgres});t.after(()=>h.close());
 assert.equal((await h.call('feature',{user:4})).body.visible,true);assert.equal((await h.call('admin/raid/blackwing/settings',{user:4})).status,403);
 await h.run('INSERT INTO app_meta(key,value) VALUES(?,?)','raid_madara_weekly_v1:unchanged:1','{"count":3}');
 let firstOffer;
 for(let i=1;i<=4;i++){
  const {roomId,actor,body}=await readyBlackwingClear(h);
  if(i===1){
   const before=await h.one('SELECT state_json,version FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId);
   h.inject('UPDATE pig_coin_wallets_v1');assert.equal((await h.call('action',{user:actor,body})).status,503);h.inject('');
   assert.deepEqual(await h.one('SELECT state_json,version FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId),before);
   assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),0);assert.equal((await blackwingWeeklyReward(h.env,1,3)).used,0);
   assert.equal(Number((await h.one("SELECT COUNT(*) n FROM app_meta WHERE key LIKE 'reward_reveal_offer_v1:%'")).n),0);
  }
  const paid=await h.call('action',{user:actor,body});assert.equal(paid.status,200,JSON.stringify(paid));assert.equal(paid.body.state.status,'CLEAR');assert.equal(paid.body.state.clearReward.granted,i<=3);
  const again=await h.call('action',{user:actor,body});assert.equal(again.status,200);assert.deepEqual(again.body.state.clearReward,paid.body.state.clearReward);
  for(const[id]of members){const view=(await h.call('state?roomId='+roomId,{user:Number(id)})).body.state;assert.equal(view.clearReward.granted,i<=3);if(i<=3){assert.equal(view.clearReward.coin,200000000000);assert.equal(view.clearReward.pigCoins,100);assert.equal(view.clearReward.masterStars,2000000);assert.equal(view.clearReward.petEssence,5);assert.equal(view.clearReward.choiceOffer.content,'BLACKWING');assert.deepEqual(view.clearReward.choiceOffer.slots,[0,1,2]);assert.equal('choices' in view.clearReward.choiceOffer,false);if(i===1&&id==='1')firstOffer=view.clearReward.choiceOffer;}}
 }
 for(const[id]of members){assert.equal((await blackwingWeeklyReward(h.env,id,3)).used,3);assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=?',id)).coin),600000000000);assert.equal(Number((await h.one('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=?',id)).balance),300);assert.equal(Number((await h.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'",id)).quantity),6000000);assert.equal(Number((await h.one("SELECT total_ticks AS ticks FROM account_rank_progress_v1 WHERE user_id=?",id)).ticks),300000);}
 assert.equal(Number((await h.one("SELECT COUNT(*) n FROM pig_coin_ledger_v1 WHERE source='BLACKWING_RAID'")).n),18);
 assert.equal(Number((await h.one("SELECT COUNT(*) n FROM app_meta WHERE key LIKE 'reward_reveal_offer_v1:%'")).n),18);
 await assert.rejects(claimRewardReveal(h.env,{id:2},{offerId:firstOffer.offerId,selectedIndex:0}));
 const result=await claimRewardReveal(h.env,{id:1},{offerId:firstOffer.offerId,selectedIndex:0});assert.ok(result.choiceReward.quantity>0);assert.equal(result.content,'BLACKWING');assert.deepEqual(await claimRewardReveal(h.env,{id:1},{offerId:firstOffer.offerId,selectedIndex:2}),result);
 assert.equal((await blackwingWeeklyReward(h.env,1,3)).used,3);assert.equal((await h.one('SELECT value FROM app_meta WHERE key=?','raid_madara_weekly_v1:unchanged:1')).value,'{"count":3}');
 assert.equal((await blackwingWeeklyReward(h.env,1,3,Date.parse((await blackwingWeeklyReward(h.env,1,3)).resetsAt))).used,0);
});

test('TEST-created room remains unpaid after switching to ON; failed/left rooms never offer rewards',async t=>{
 const h=await rewardFixture();t.after(()=>h.close());const {actor,body}=await readyBlackwingClear(h,{createdMode:'TEST',startedMode:'ON'});
 const result=await h.call('action',{user:actor,body});assert.equal(result.status,200);assert.equal(result.body.state.clearReward.granted,false);assert.equal(result.body.state.release.rewardLocked,true);
 assert.equal(Number((await h.one('SELECT COUNT(*) n FROM coin_logs')).n),0);assert.equal((await blackwingWeeklyReward(h.env,actor,3)).used,0);
 for(const status of ['FAILED','CANCELLED','LOBBY'])assert.deepEqual((await prepareBlackwingRewards(h.env,{status:'ACTIVE'},{status})).statements,[]);
 const failed=await h.command('create');await h.command('leave',{roomId:failed.body.roomId});assert.equal((await blackwingWeeklyReward(h.env,1,3)).used,0);
 const cfg=JSON.parse((await h.one('SELECT value FROM app_meta WHERE key=?','raid_blackwing_settings_v1')).value);delete cfg.weeklyRewardLimit;
 await h.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(cfg),'raid_blackwing_settings_v1');
 const legacy={id:'LEGACY-TEST',status:'CLEAR',releaseMode:'TEST',finishedAt:Date.now(),members:[{id:'1'}],rewardPolicy:{enabled:false}};
 assert.deepEqual((await prepareBlackwingRewards(h.env,{status:'ACTIVE'},legacy)).statements,[]);assert.equal(legacy.clearRewards['1'].granted,false);
});

for(const postgres of [false,true])test(`quota/settings contention rolls back all reward writes ${postgres}`,async t=>{
 const h=await rewardFixture({postgres});t.after(()=>h.close());
 const make=id=>({id,status:'CLEAR',releaseMode:'ON',finishedAt:Date.now(),members:[{id:'1'},{id:'2',left:true}],rewardPolicy:{enabled:true,coin:200000000000,pigCoins:100,masterStars:2000000,petEssence:5,weeklyLimit:3},revealPolicy:choicePolicy()});
 const a=make('a'),b=make('b'),pa=await prepareBlackwingRewards(h.env,{status:'ACTIVE'},a),pb=await prepareBlackwingRewards(h.env,{status:'ACTIVE'},b);
 await h.env.DB.batch(pa.statements);await assert.rejects(h.env.DB.batch(pb.statements));assert.equal((await blackwingWeeklyReward(h.env,1,3)).used,1);assert.equal((await blackwingWeeklyReward(h.env,2,3)).used,0);
 const c=make('c'),pc=await prepareBlackwingRewards(h.env,{status:'ACTIVE'},c);await h.configure({weeklyRewardLimit:1});await assert.rejects(h.env.DB.batch(pc.statements));
 assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),200000000000);
 await h.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...choicePolicy(),enabled:false}),'reward_reveal_policy_v1:BLACKWING');
 const d=make('d'),pd=await prepareBlackwingRewards(h.env,{status:'ACTIVE'},d);assert.equal(d.clearRewards['1'].status,'WEEKLY_LIMIT');assert.equal(d.clearRewards['1'].choiceOffer,undefined);
});
