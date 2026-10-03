import test from 'node:test';
import assert from 'node:assert/strict';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';

const key='legion_hunt_owner_session_v1:2';
const saved=async f=>JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first()).value);
const write=async(f,run)=>f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify(run),key).run();
async function fixture(postgres){
  const f=await legionFixture({postgres});
  f.clock.now=Date.parse('2026-10-03T12:00:00+09:00');f.outcome={winner:'A',reason:'ALL_KO'};
  f.deps.createSession=options=>Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy:{id:'normal',huntDurationMs:1000,...options.dropPolicy},
    timeLimit:1000,eventTimes:[100,200],timeline:[{seq:1,combatAtMs:100,huntKill:true},{seq:2,combatAtMs:200,type:'RESULT',...f.outcome}],outcome:f.outcome},{now:options.now}),{payload:{}});
  const {body}=await f.call('admin/legion-hunt');body.policy.mode='ON';
  body.policy.items=[{...body.catalog.find(i=>i.type==='INVENTORY_ITEM'),enabled:true,weight:1,minQuantity:3,maxQuantity:3}];
  body.policy.difficulties.forEach(d=>{d.dropPercent=100;d.bossDropPercent=100;d.lifetimeSeconds=9;});
  assert.equal((await f.call('admin/legion-hunt',{policy:body.policy},{method:'PATCH'})).status,200);
  f.setUser(f.player);return f;
}
async function start(f){
  const r=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal((await f.call('legion-hunt/begin',{id:r.body.id})).status,200);return r.body.id;
}
async function pick(f,id){
  f.clock.now+=300;const r=await f.call('legion-hunt/reveal',{id,seq:1});assert.equal(r.status,200);
  const d=r.body.drop,body={id,dropId:d.id,token:d.token,...d.position};assert.equal((await f.call('legion-hunt/claim',body)).status,200);return body;
}
const recover=f=>f.call('legion-hunt/recover',{});
const count=async f=>Number((await f.DB.prepare('SELECT COALESCE(SUM(quantity),0) n FROM cnine_user_inventory WHERE user_id=2').first()).n);

for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(dialect+': unfinished pickups never pay; lost recovery replies, repeated cancel and old finish cannot double-refund',async()=>{
    const f=await fixture(postgres);try{
      const id=await start(f),claim=await pick(f,id);
      const run=await saved(f);run.daily.used=2;await write(f,run);
      assert.equal(await count(f),0);f.loseReply();assert.equal((await recover(f)).status,503);
      const r=await recover(f);assert.equal(r.status,200);assert.equal(r.body.entries.used,1);
      assert.equal((await saved(f)).interruption.refunded,true);assert.equal((await saved(f)).state.receipt,null);
      assert.equal((await f.call('legion-hunt/cancel',{id})).body.entries.used,1);
      assert.equal((await f.call('legion-hunt/finish',{id,seq:2})).status,409);
      assert.equal((await f.call('legion-hunt/claim',claim)).status,409);assert.equal(await count(f),0);
      const next=await start(f);assert.equal((await saved(f)).daily.used,2);
      const replacement=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(replacement.status,200);assert.equal(replacement.body.entries.used,1);
      assert.equal((await f.call('legion-hunt/cancel',{id:next})).status,409);
      assert.equal((await recover(f)).body.entries.used,1,'unbegun run never refunds a completed entry');
    }finally{await f.close();}
  });
  test(dialect+': clear, defeat, timeout and explicit retreat pay the exact picked bag and consume one entry',async()=>{
    const f=await fixture(postgres);try{
      for(const [winner,reason,seq,expected] of [['A','ALL_KO',2,'CLEAR'],['B','ALL_KO',2,'DEFEAT'],['DRAW','TIME_LIMIT',2,'TIME_LIMIT'],['A','ALL_KO',1,'RETREAT']]){
        f.clock.now+=86400000;f.outcome={winner,reason};const id=await start(f);await pick(f,id);
        const before=await count(f),r=await f.call('legion-hunt/finish',{id,seq});assert.equal(r.status,200,JSON.stringify(r.body));
        assert.equal(r.body.reason,expected);assert.equal(r.body.inventory[0].quantity,3);assert.equal(r.body.liveRewards,true);
        assert.equal(await count(f),before+3);assert.equal((await recover(f)).body.entries.used,1);
        assert.deepEqual((await f.call('legion-hunt/finish',{id,seq})).body,r.body);
        assert.equal((await f.call('legion-hunt/cancel',{id})).body.entries.used,1);
        assert.equal(await count(f),before+3);
      }
    }finally{await f.close();}
  });
  test(dialect+': saved terminal intent survives grant failure, expiry and cancel; reconnect settles instead of refunding',async()=>{
    const f=await fixture(postgres);try{
      const id=await start(f);await pick(f,id);
      f.fail('INSERT INTO inventory_logs');assert.equal((await f.call('legion-hunt/finish',{id,seq:2})).status,503);
      assert.equal((await saved(f)).rewardStatus,'PENDING');assert.equal((await saved(f)).state.receipt.reason,'CLEAR');assert.equal(await count(f),0);
      assert.equal((await f.call('legion-hunt/start',{difficulty:'normal'})).status,503,'new start cannot overwrite pending rewards');
      assert.equal((await saved(f)).state.id,id);f.fail('');f.clock.now+=31*60000;
      const r=await f.call('legion-hunt/cancel',{id});assert.equal(r.status,200,JSON.stringify(r.body));
      assert.equal(r.body.cancelled,false);assert.equal(r.body.recovery.kind,'SETTLED');assert.equal(r.body.entries.used,1);
      assert.equal(await count(f),3);assert.equal((await saved(f)).rewardStatus,'SETTLED');
      assert.equal((await recover(f)).body.entries.used,1);assert.equal((await f.call('legion-hunt/finish',{id,seq:2})).body.liveRewards,true);assert.equal(await count(f),3);
    }finally{await f.close();}
  });
  test(dialect+': interrupted recovery is atomic, works when operation is OFF, and never refunds a different KST day',async()=>{
    const f=await fixture(postgres);try{
      const id=await start(f);f.fail('UPDATE app_meta');assert.equal((await recover(f)).status,503);f.fail('');
      assert.equal((await saved(f)).daily.used,1);assert.equal((await saved(f)).interruption,undefined);
      f.setUser(f.owner);const {body}=await f.call('admin/legion-hunt');body.policy.mode='OFF';await f.call('admin/legion-hunt',{policy:body.policy},{method:'PATCH'});f.setUser(f.player);
      const run=await saved(f);run.daily={day:'2026-10-04',used:1};await write(f,run);f.clock.now=Date.parse('2026-10-04T00:00:01+09:00');
      const r=await recover(f);assert.equal(r.status,200);assert.equal(r.body.entries.used,1);assert.equal(r.body.recovery.refunded,false);
      assert.equal((await saved(f)).state.id,id);assert.equal(await count(f),0);
      f.setUser(null);assert.equal((await recover(f)).status,401);
    }finally{await f.close();}
  });
  test(dialect+': legacy immediate rewards are preserved without a second grant; old cancelled/expired run refunds only once',async()=>{
    const f=await fixture(postgres);try{
      let id=await start(f),run=await saved(f);delete run.rewardTiming;delete run.entry;await write(f,run);
      await pick(f,id);assert.equal(await count(f),3);
      assert.equal((await f.call('legion-hunt/finish',{id,seq:2})).status,200);assert.equal(await count(f),3);assert.equal((await recover(f)).body.entries.used,1);
      id=await start(f);run=await saved(f);delete run.rewardTiming;delete run.entry;run.state.ended=true;await write(f,run);f.clock.now+=31*60000;
      const r=await recover(f);assert.equal(r.body.recovery.refunded,true);assert.equal(r.body.entries.used,1);assert.equal((await recover(f)).body.entries.used,1);assert.equal(await count(f),3);
      assert.equal((await f.call('legion-hunt/start',{difficulty:'normal',version:3})).body.code,'HUNT_CLIENT_UPDATE');
    }finally{await f.close();}
  });
}
