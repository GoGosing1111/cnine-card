import test from 'node:test';
import assert from 'node:assert/strict';
import {jointFixture} from './helpers/joint-db.mjs';
import {handlePveV3} from '../functions/_pve_v3_routes.js';
import {runExpeditionV3,expeditionV3Status} from '../functions/_expedition_v3_runs.js';
import {readExpeditionPolicy,validateExpeditionPolicy} from '../functions/_expedition_v3_settings.js';
import {discoverCowPortalReady} from '../functions/_cow_room_portal.js';
import {COW_ROOM_REWARD_COIN_LIMIT} from '../shared/cow-room-economy-v1.mjs';

for(const postgres of [false,true]){
  const backend=postgres?'PostgreSQL':'SQLite';
  test(`${backend}: OWNER CMS saves rewards through 10 billion and rejects out-of-range or fractional amounts`,async t=>{
    const f=await jointFixture(t,{postgres}),original=await readExpeditionPolicy(f.env,'COW_ROOM');
    assert.equal(COW_ROOM_REWARD_COIN_LIMIT,10000000000);
    const next={...original,clearCoin:[10000000000],dailyCoinCap:10000000000};
    for(const value of [-1,0.5,10000000001]){
      assert.throws(()=>validateExpeditionPolicy('COW_ROOM',{...next,clearCoin:[value]}),{code:'PVE_V3_POLICY'});
      assert.throws(()=>validateExpeditionPolicy('COW_ROOM',{...next,dailyCoinCap:value}),{code:'PVE_V3_POLICY'});
    }
    const request=new Request('https://game.example/api/admin/pve-v3',{method:'PATCH',headers:{authorization:'Bearer local-account-7',origin:'https://game.example','content-type':'application/json'},body:JSON.stringify({content:'COW_ROOM',revision:original.revision,economy:next})});
    const response=await handlePveV3({path:'admin/pve-v3',request,env:f.env,deps:f.deps});
    assert.equal(response.status,200,await response.clone().text());
    const saved=await readExpeditionPolicy(f.env,'COW_ROOM');
    assert.equal(saved.clearCoin[0],10000000000);assert.equal(saved.dailyCoinCap,10000000000);
    assert.equal(saved.approved,false);assert.equal(saved.mode,'TEST');assert.equal(saved.revision,original.revision+1);
    assert.equal(await f.coin(),10000000,'saving a draft does not pay rewards');
  });
  test(`${backend}: six clears pay 500 million each, persist a 3 billion daily total, and support the 10 billion ceiling`,async t=>{
    const f=await jointFixture(t,{postgres}),initial=await expeditionV3Status(f.env,f.user,'COW_ROOM',f.deps);
    assert.equal(initial.policy.dailyRuns,6);assert.equal(initial.policy.clearCoin[0],500000000);assert.equal(initial.policy.dailyCoinCap,3000000000);
    const body=i=>({requestId:`cow-approved-economy-${i}`,difficulty:'PASTURE'});
    for(let i=1;i<=6;i++){
      const result=await runExpeditionV3(f.env,f.user,'COW_ROOM',body(i),f.deps);
      assert.equal(result.success,true);assert.equal(result.rewards.filter(r=>r.rewardType==='COIN').reduce((n,r)=>n+r.quantity,0),500000000);
      assert.equal(result.budget.coin,i*500000000);assert.equal(result.budget.remaining,6-i);
    }
    const state=await expeditionV3Status(f.env,f.user,'COW_ROOM',f.deps);
    assert.equal(state.budget.coin,3000000000);assert.equal(state.budget.coinRemaining,0);assert.equal(state.budget.remaining,0);
    assert.equal(await f.coin(),3008500000);
    assert.equal((await runExpeditionV3(f.env,f.user,'COW_ROOM',body(6),f.deps)).replayed,true);assert.equal(await f.coin(),3008500000);
    await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',body(7),f.deps),{code:'PVE_V3_DAILY_LIMIT'});
    f.setClock(Date.parse('2026-09-14T03:00:00Z'));
    await f.setting('expedition_v3_cow_room',{...state.policy,clearCoin:[10000000000],dailyCoinCap:10000000000});
    await discoverCowPortalReady(f.env,f.user,{sourceType:'HUNT',sourceRef:'next-day-portal',result:'WIN'},{randomInt:()=>0});
    const maximum=await runExpeditionV3(f.env,f.user,'COW_ROOM',body(8),f.deps);
    assert.equal(maximum.rewards.filter(r=>r.rewardType==='COIN').reduce((n,r)=>n+r.quantity,0),10000000000);
    assert.equal(maximum.budget.coin,10000000000);assert.equal(maximum.budget.coinRemaining,0);assert.equal(maximum.budget.attempts,1);
    assert.equal(await f.coin(),13008250000);
  });
}
