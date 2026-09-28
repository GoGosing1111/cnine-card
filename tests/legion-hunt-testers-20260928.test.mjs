import test from 'node:test';
import assert from 'node:assert/strict';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';

for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(dialect+': OWNER searches and persists exact tester IDs; public responses never disclose the tester list',async()=>{
    const f=await legionFixture({postgres});try{
      const search=q=>f.call('admin/legion-hunt/test-users',undefined,{query:'?q='+encodeURIComponent(q)});
      f.resetQueries();assert.deepEqual((await search('테스트 참여자')).body.users,[{id:2,nickname:'테스트 참여자'}]);assert.equal(f.queries.length,1);
      assert.deepEqual((await search('2')).body.users,[{id:2,nickname:'테스트 참여자'}]);
      assert.deepEqual((await search("%' OR 1=1 --")).body.users,[]);assert.equal((await search('')).status,400);
      let {policy}=(await f.call('admin/legion-hunt')).body;
      const save=next=>f.call('admin/legion-hunt',{policy:next},{method:'PATCH'});
      for(const ids of [[2,2],['2'],[-1],[2.5],Array.from({length:101},(_,i)=>i+1),[99999]])assert.equal((await save({...policy,testUserIds:ids})).status,400);
      const next={...policy,testUserIds:[2]};
      f.fail('INSERT INTO admin_logs');assert.equal((await save(next)).status,503);f.fail('');
      assert.deepEqual((await f.call('admin/legion-hunt')).body.policy.testUserIds,[]);
      assert.equal((await save(next)).status,200);assert.equal((await save(policy)).status,409);
      let data=(await f.call('admin/legion-hunt')).body;assert.deepEqual(data.policy.testUserIds,[2]);assert.deepEqual(data.testUsers,[{id:2,nickname:'테스트 참여자'}]);
      // Older clients omitting the optional field cannot silently clear the list.
      delete data.policy.testUserIds;assert.equal((await save(data.policy)).status,200);
      assert.deepEqual((await f.call('admin/legion-hunt')).body.policy.testUserIds,[2]);
      f.setUser(f.player);f.resetQueries();
      assert.equal((await search('1')).status,403);assert.equal((await f.call('admin/legion-hunt')).status,403);assert.equal(f.queries.length,0);
      const status=await f.call('legion-hunt/status');assert.equal(status.body.canEnter,true);assert.equal(status.body.access.liveRewards,false);assert.equal(f.queries.length,1);
      assert.equal(JSON.stringify(status.body).includes('testUser'),false);
      const lobby=await f.call('legion-hunt/bootstrap');assert.equal(lobby.status,200);assert.equal(lobby.body.entries.remaining,2);assert.equal(JSON.stringify(lobby.body).includes('testUserIds'),false);
    }finally{await f.close();}
  });

  test(dialect+': designated TEST player can play without payout; nickname changes preserve access and removal revokes every action',async()=>{
    const f=await legionFixture({postgres});try{
      f.deps.createSession=options=>Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy:{id:'normal',huntDurationMs:1000,...options.dropPolicy},
        timeLimit:1000,eventTimes:[100],timeline:[{seq:1,combatAtMs:100,huntKill:true}],outcome:{}},{now:options.now}),{payload:{}});
      let policy=await f.configure(3);policy.testUserIds=[2];
      assert.equal((await f.call('admin/legion-hunt',{policy},{method:'PATCH'})).status,200);
      f.setUser({id:3,role:'ADMIN'});assert.equal((await f.call('legion-hunt/bootstrap')).status,403);
      f.setUser(f.player);const run=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(run.status,200);const id=run.body.id;
      assert.equal((await f.call('legion-hunt/begin',{id})).body.entries.used,1);
      f.clock.now+=101;const d=(await f.call('legion-hunt/reveal',{id,seq:1})).body.drop;assert.ok(d);
      const claim={id,dropId:d.id,token:d.token,...d.position};
      const picked=await f.call('legion-hunt/claim',claim);assert.equal(picked.status,200);assert.equal(picked.body.liveRewards,false);
      assert.deepEqual((await f.call('legion-hunt/claim',claim)).body,picked.body);
      assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM cnine_user_inventory').first()).n,0);
      await f.DB.prepare('UPDATE users SET nickname=? WHERE id=2').bind('변경된 테스트 이름').run();
      assert.equal((await f.call('legion-hunt/status')).body.canEnter,true);
      f.setUser(f.owner);policy=(await f.call('admin/legion-hunt')).body.policy;
      assert.equal((await f.call('admin/legion-hunt',{policy:{...policy,testUserIds:[]}},{method:'PATCH'})).status,200);
      f.setUser(f.player);assert.equal((await f.call('legion-hunt/status')).body.canEnter,false);
      for(const [action,body] of [['bootstrap',undefined],['start',{difficulty:'normal'}],['begin',{id}],['reveal',{id,seq:1}],['claim',claim],['finish',{id,seq:1}],['cancel',{id}]])assert.equal((await f.call('legion-hunt/'+action,body)).status,403,action);
      f.setUser(f.owner);assert.equal((await f.call('legion-hunt/status')).body.canEnter,true);
      policy=(await f.call('admin/legion-hunt')).body.policy;
      assert.equal((await f.call('admin/legion-hunt',{policy:{...policy,mode:'OFF',testUserIds:[2]}},{method:'PATCH'})).status,200);
      f.setUser(f.player);assert.equal((await f.call('legion-hunt/bootstrap')).status,423);
    }finally{await f.close();}
  });
}
