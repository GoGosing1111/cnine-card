import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as access from '../functions/_burning_event_access.js';
import * as miracle from '../functions/_miracle_burning.js';
import {normalizeApocalypseSettings} from '../functions/_pve_nightmare.js';
import {reserveApocalypseBattle,registerApocalypseChallenge,apocalypseChallengeAction} from '../functions/_apocalypse_challenge.js';
import {__avatarDropPoolTest} from '../functions/_drop_pool.js';
import {apocalypseFixture} from './helpers/apocalypse-fixture.mjs';

const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const burning=vm.runInNewContext(api.slice(api.indexOf('const BURNING_EVENT_META_KEY='),api.indexOf('function defaultPvpSettings()'))+
  ';({cleanBurningEventSettings,applyBurningPveSettings,burningRewardAmount})',{...access,...miracle,console});
const source=fs.readFileSync(new URL('../functions/_apocalypse_rewards.js',import.meta.url),'utf8');
// Exercise the shipping planner while disabling unrelated random drop systems.
// Completion below uses the real server handler, grant builder and both DBs.
const planRewards=vm.runInNewContext(source.slice(source.indexOf('const p='),source.indexOf('function inventoryWrites(')).replace('export async function','async function')+';planApocalypseRewards',{
  supplyBoxSettings:async()=>({enabled:false,sources:{}}),
  blackMiracleSettings:async()=>({sources:{}}),
  resolveAvatarDropRate:async()=>{throw Error('Unexpected unrelated drop roll')},
  planUnifiedDropRoll:async()=>({pools:[],rewards:[]})
});
const modes=[['OFF',1],['BURNING',1.5],['BURNING',10],['HYPER',2.5],['HYPER',30],['MIRACLE',1],['MIRACLE',100]];
const bonuses={75:{coinPercent:25,masterStars:300,mysticEnergy:4},76:{coinPercent:10,masterStars:1200,mysticEnergy:9}};

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: every Burning mode preserves boss-specific star and mystic quantities through completion and replay`,async t=>{
  const f=await apocalypseFixture({postgres});t.after(()=>f.close());
  const quantity=async code=>Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',f.user.id,code).first())?.quantity||0);
  for(const [mode,multiplier] of modes){
    const event=burning.cleanBurningEventSettings({enabled:mode!=='OFF',endsAt:new Date(Date.now()+3600000).toISOString(),battleRewardMultiplier:multiplier},mode==='OFF'?'BURNING':mode);
    const base={apocalypse:normalizeApocalypseSettings({monsterProfiles:Object.fromEntries(Object.entries(bonuses).map(([id,bonus])=>[id,{clearBonus:bonus}]))})};
    const settings=burning.applyBurningPveSettings(base,event);
    for(const [id,expected] of Object.entries(bonuses)){
      const requestId=crypto.randomUUID(),runToken=crypto.randomUUID(),monsterId=Number(id),now=Date.now(),reward=burning.burningRewardAmount(400,event);
      const bonus=settings.apocalypse.monsterProfiles[id].clearBonus;
      const plan=await planRewards(f.env,{user:f.user,requestId,monster:{id:monsterId,is_boss:1},reward,won:true,card:null,duplicateShards:0,pveMagic:{enabled:false},bonus});
      assert.equal(plan.bonuses.masterStars,expected.masterStars,`${mode} ${multiplier}x boss ${id} stars`);
      assert.equal(plan.bonuses.mysticEnergy,expected.mysticEnergy,`${mode} ${multiplier}x boss ${id} mystic`);
      assert.equal(plan.reward,400*multiplier);
      assert.equal(plan.bonuses.coin,Math.floor(400*multiplier*expected.coinPercent/100));
      assert.deepEqual(bonus,expected,'Burning settings cannot rewrite CMS item amounts');
      const beforeStars=await quantity('MASTER_STAR'),beforeMystic=await quantity('STARLIGHT_ARMOR_CORE');
      await reserveApocalypseBattle(f.env,{userId:f.user.id,requestId,monsterId,runToken},now);
      await registerApocalypseChallenge(f.env,{userId:f.user.id,requestId,monsterId,runToken,won:true,battleV2:f.battle,plan,log:{ids:['A'],playerPower:1000,monsterPower:100}},now);
      const act=(action,extra={},at=now)=>apocalypseChallengeAction(f.env,f.user,action,{requestId,runToken,...extra},at);
      const opened=await act('open');await act('answer',{zone:opened.safeZone},now+500);
      const result=await act('claim',{played:true},now+8000);
      assert.equal(result.status,'CLAIMED');
      assert.equal(await quantity('MASTER_STAR')-beforeStars,expected.masterStars);
      assert.equal(await quantity('STARLIGHT_ARMOR_CORE')-beforeMystic,expected.mysticEnergy);
      assert.equal(result.settlement.apocalypseBonus.rewards.masterStars,expected.masterStars);
      assert.equal(result.settlement.apocalypseBonus.rewards.mysticEnergy,expected.mysticEnergy);
      await act('claim',{played:true},now+9000);
      assert.equal(await quantity('MASTER_STAR')-beforeStars,expected.masterStars,'retry cannot multiply stars');
      assert.equal(await quantity('STARLIGHT_ARMOR_CORE')-beforeMystic,expected.mysticEnergy,'retry cannot multiply mystic');
    }
    const unset=await planRewards(f.env,{user:f.user,requestId:crypto.randomUUID(),monster:{id:77},reward:400*multiplier,won:true,pveMagic:{enabled:false},bonus:{}});
    assert.equal(unset.bonuses.masterStars,0);assert.equal(unset.bonuses.mysticEnergy,0);
  }
});

test('Miracle unified drops change probability only, never the configured star or mystic quantity',()=>{
  const entries=[
    {id:1,is_enabled:1,reward_type:'MASTER_STAR',reward_ref:'MASTER_STAR',min_quantity:321,max_quantity:321,weight:1,chance_percent:30},
    {id:2,is_enabled:1,reward_type:'INVENTORY_ITEM',reward_ref:'STARLIGHT_ARMOR_CORE',min_quantity:7,max_quantity:7,weight:1,chance_percent:30}
  ];
  for(const mode of ['INDEPENDENT','WEIGHTED_ONE'])for(const percent of [0,30]){
    const result=__avatarDropPoolTest.rollPool({id:1,rolls:1,roll_mode:mode,no_drop_weight:0},entries,{difficulty:'APOCALYPSE',miracleDropPercent:percent},()=>.2);
    assert.ok(result.length>0);
    for(const reward of result)assert.equal(reward.quantity,reward.rewardRef==='MASTER_STAR'?321:7);
  }
});
