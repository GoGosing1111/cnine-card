import test from 'node:test';
import assert from 'node:assert/strict';
import {jointFixture} from './helpers/joint-db.mjs';
import {handlePveV3,handlePveV3Ready} from '../functions/_pve_v3_routes.js';
import {readJointBody,jointResponseError} from '../functions/_joint_request.js';
import {runExpeditionV3,expeditionV3Result,expeditionV3Status} from '../functions/_expedition_v3_runs.js';
import {claimIdleV3} from '../functions/_idle_v3_claim.js';
const origin='https://cnine.example';
function request(path,body,account=7,headers={}){return new Request(`${origin}/api/${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer local-account-${account}`,origin,'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});}
test('public joint hold rejects every new account mutation before authentication and database access',async()=>{
  const deps={json:(b,s=200)=>Response.json(b,{status:s}),authenticate(){throw Error('must not authenticate');}};
  for(const path of ['tower/v3/run','idle-dungeon/v3/run']){
    const r=await handlePveV3({path,request:request(path,{requestId:'held'}),env:new Proxy({},{get(){throw Error('must not read DB');}}),deps});assert.equal(r.status,423);
  }
});
test('bounded same-origin JSON rejects forged fields, origins, arrays and oversized streams',async()=>{
  await assert.rejects(()=>readJointBody(request('x',{requestId:'x',userId:8}),{fields:['requestId']}),{code:'JOINT_BODY'});
  await assert.rejects(()=>readJointBody(request('x',{requestId:'x'},7,{origin:'https://attacker.example'})),{code:'JOINT_ORIGIN'});
  await assert.rejects(()=>readJointBody(request('x',{data:'x'.repeat(9000)})),{code:'JOINT_BODY_SIZE'});
  const r=jointResponseError(new Error('postgres: private database hostname'));assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/postgres|hostname/);
});
for(const postgres of [false,true]){
  const db=postgres?'PostgreSQL':'SQLite';
  test(`${db}: OWNER CMS edits are versioned drafts and cannot turn on gameplay`,async t=>{
    const f=await jointFixture(t,{postgres}),path='admin/pve-v3';
    const call=(body,deps=f.deps)=>handlePveV3({path,request:body?new Request(`${origin}/api/${path}`,{method:'PATCH',headers:{authorization:'Bearer local-account-7',origin,'content-type':'application/json'},body:JSON.stringify(body)}):request(path),env:f.env,deps});
    const denied={...f.deps,authenticate:async()=>({...f.user,role:'USER'})};
    assert.equal((await call(null,denied)).status,403);
    const initial=await (await call()).json();assert.equal(initial.release.enabled,false);
    for(const [content,source] of [['TOWER',initial.tower],['COW_ROOM',initial.cow]]){
      const body={content,revision:source.revision,...(content==='TOWER'?{config:source.config,economy:{...source.economy,approved:true}}:{economy:{...source,approved:true}})};
      assert.equal((await call(body,denied)).status,403);
      const saved=await call(body),value=await saved.json();assert.equal(saved.status,200,JSON.stringify(value));
      assert.equal(content==='TOWER'?value.economy.approved:value.approved,false);
      assert.ok((await call(body)).status>=400,'stale revision must fail');
      const enable={...body,revision:value.revision,...(content==='TOWER'?{config:{...value.config,mode:'ON'},economy:value.economy}:{economy:{...value,ok:undefined,content:undefined,mode:'ON'}})};
      if(content==='COW_ROOM'){delete enable.economy.ok;delete enable.economy.content;}
      const activated=await call(enable);
      if(content==='COW_ROOM'){assert.equal(activated.status,200);assert.equal((await activated.json()).approved,true);}
      else assert.ok(activated.status>=400,'tower re-ascent draft cannot activate');
    }
    assert.equal(await f.coin(),10000000);
  });
  test(`${db}: idle keeps advancing without a view heartbeat; V3 playback cannot settle or mint coins`,async t=>{
    const f=await jointFixture(t,{postgres}),call=(action,body)=>handlePveV3Ready({path:`idle-dungeon/v3/${action}`,request:request(`idle-dungeon/v3/${action}`,body),env:f.env,deps:f.deps});
    const start=await call('start',{difficulty:'NORMAL',sessionId:'idle-view-one'});assert.equal(start.status,200,await start.clone().text());
    await f.p('DELETE FROM idle_dungeon_active_sessions WHERE user_id=7').run();
    await f.p('UPDATE idle_dungeon_progress SET last_settled_at=? WHERE user_id=7',new Date(Date.now()-60000).toISOString()).run();
    const stateResponse=await call('state'),s=await stateResponse.json();assert.equal(stateResponse.status,200,JSON.stringify(s));
    assert.equal(s.progress.running,true);assert.ok(s.progress.pendingCoin>0);assert.ok(s.progress.currentFloor>1);assert.equal(s.battle.idleClock.offlineProgress,true);
    assert.equal(s.battle.battleV2.result.authority,'IDLE_SERVER_CLOCK');assert.equal(s.battle.battleV2.teams.A.cards.length,5);assert.equal(s.battle.idleClock.claimsFromPlayback,false);assert.equal(await f.coin(),10000000);
    const rid='idle-claim-retry',r=await (await call('claim',{requestId:rid})).json(),balance=await f.coin();assert.ok(r.rewardCoin>0);assert.equal(balance,10000000+r.rewardCoin);
    const retry=await (await call('claim',{requestId:rid})).json();assert.equal(retry.replayed,true);assert.equal(await f.coin(),balance);
    const row=await f.p('SELECT run_started_at FROM idle_dungeon_progress WHERE user_id=7').first();assert.ok(row.run_started_at,'claim does not stop the background expedition');
    assert.equal((await call('stop',{sessionId:'idle-view-one'})).status,200);assert.equal((await f.p('SELECT run_started_at FROM idle_dungeon_progress WHERE user_id=7').first()).run_started_at,null);
  });
  test(`${db}: idle claim rolls back the receipt, pending balance and coin together on failure`,async t=>{
    const f=await jointFixture(t,{postgres});await f.p('INSERT INTO idle_dungeon_progress(user_id,pending_coin) VALUES(7,5000)').run();
    f.fail('INSERT INTO coin_logs');await assert.rejects(()=>claimIdleV3(f.env,f.user,{requestId:'failure-claim'}),{code:'IDLE_V3_CLAIM_PENDING'});
    assert.equal(await f.coin(),10000000);assert.equal(Number((await f.p('SELECT pending_coin FROM idle_dungeon_progress WHERE user_id=7').first()).pending_coin),5000);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM idle_dungeon_claim_receipts').first()).n),0);
    f.fail('');await claimIdleV3(f.env,f.user,{requestId:'failure-claim'});assert.equal(await f.coin(),10005000);
    await assert.rejects(()=>claimIdleV3(f.env,{id:8},{requestId:'failure-claim'}),{code:'IDLE_V3_REQUEST_CONFLICT'});
  });
  test(`${db}: actual authenticated tower/scrapyard/cow handlers use owned snapshots, lock and durable result`,async t=>{
    const f=await jointFixture(t,{postgres});
    for(const [content,selection] of [['tower',{tier:1}],['scrapyard',{difficulty:'OUTER'}],['cow-room',{difficulty:'PASTURE'}]]){
      const path=`${content}/v3/run`,body={requestId:`route-${content}`, ...selection};
      const call=(req,deps=f.deps)=>handlePveV3Ready({path,request:req,env:f.env,deps});
      assert.equal((await call(request(path,body,9))).status,401);
      assert.equal((await call(request(path,{...body,coin:1e12}))).status,400);
      assert.equal((await call(request(path,body),{...f.deps,withUserMutationLock:null})).status,503);
      const response=await call(request(path,body)),result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.status,'COMPLETED');
      assert.equal(result.battleV2.teams.A.cards.length,5);assert.equal(result.cards.length,5);
      const balance=await f.coin(),reads=f.reads;const retry=await (await call(request(path,body))).json();assert.equal(retry.replayed,true);assert.equal(await f.coin(),balance);assert.equal(f.reads,reads);
      const ownPath=`${content}/v3/result`,foreign=await handlePveV3Ready({path:ownPath,request:request(`${ownPath}?requestId=${body.requestId}`,null,8),env:f.env,deps:f.deps});assert.equal((await foreign.json()).status,'NOT_FOUND');
      const statePath=`${content}/v3/state`,state=await handlePveV3Ready({path:statePath,request:request(statePath),env:f.env,deps:f.deps});assert.equal(state.status,200,await state.clone().text());assert.equal((await state.json()).accountId,7);
    }
  });
  test(`${db}: cow frozen settlement recovers across midnight, policy and deck changes; never charges twice`,async t=>{
    const f=await jointFixture(t,{postgres}),body={requestId:'cow-recovery',difficulty:'PASTURE'};
    f.fail('INSERT INTO expedition_v3_progress_v1');await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps),{code:'PVE_V3_RESULT_PENDING'});
    assert.equal(await f.coin(),9750000);const saved=await f.p('SELECT checkpoint_json FROM expedition_v3_runs_v1 WHERE user_id=7').first();
    await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',{...body,requestId:'another'},f.deps),{code:'PVE_V3_RUNNING'});
    const policy=JSON.parse(saved.checkpoint_json).policy;await f.setting('expedition_v3_cow_room',{...policy,mode:'OFF',clearCoin:[0]});f.setPower(1);f.setClock(Date.parse('2026-09-14T03:00:00Z'));f.fail('');
    const result=await runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps);assert.equal(result.success,true);assert.equal(result.budget.day,'2026-09-13');assert.equal(await f.coin(),509750000);
    assert.equal((await runExpeditionV3(f.env,f.user,'COW_ROOM',body,f.deps)).replayed,true);assert.equal(await f.coin(),509750000);
    assert.equal((await expeditionV3Result(f.env,{id:8},'COW_ROOM',body.requestId)).status,'NOT_FOUND');
  });
  test(`${db}: cow insufficient funds, capped rewards, daily limit and transaction failures cannot mint rewards`,async t=>{
    const f=await jointFixture(t,{postgres}),body=i=>({requestId:`cow-budget-${i}`,difficulty:'PASTURE'});
    await f.p('UPDATE users SET coin=10 WHERE id=7').run();await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',body(0),f.deps),{code:'PVE_V3_ENTRY_CONFLICT'});assert.equal(await f.coin(),10);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM expedition_v3_runs_v1').first()).n),0);
    await f.p('UPDATE users SET coin=10000000 WHERE id=7').run();const state=await expeditionV3Status(f.env,f.user,'COW_ROOM',f.deps);await f.setting('expedition_v3_cow_room',{...state.policy,dailyRuns:3,dailyCoinCap:2500000});
    for(let i=1;i<=3;i++)await runExpeditionV3(f.env,f.user,'COW_ROOM',body(i),f.deps);
    assert.equal(await f.coin(),11750000);await assert.rejects(()=>runExpeditionV3(f.env,f.user,'COW_ROOM',body(4),f.deps),{code:'PVE_V3_DAILY_LIMIT'});
  });
}
