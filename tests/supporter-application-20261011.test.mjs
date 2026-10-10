import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationFixture} from './helpers/supporter-application-fixture.mjs';
import {SUPPORT_BANK_MESSAGE_TTL,reconcileSupportMessages,liveSupportMessageSql,supportMessageCutoff} from '../functions/_supporter_message_expiry.js';
import {runDraftSchedule,nextAlarmAt,handleDraftAlarm} from '../workers/clan-draft/src/schedule.js';

for(const postgres of [false,true]){
  const engine=postgres?'PostgreSQL':'SQLite';
  test(`${engine}: OFF default, owner CMS switch, origin/eligibility and idempotent configuration`,async t=>{
    const f=await applicationFixture({postgres});t.after(()=>f.close());
    assert.equal((await f.call('server-support/info',{user:2})).body.application.enabled,false);
    assert.equal((await f.issue()).body.code,'SUPPORT_APPLICATION_DISABLED');
    assert.equal((await f.one('SELECT COUNT(*) n FROM user_messages')).n,0);
    for(const user of [2,3])assert.equal((await f.call('admin/server-support/application',{user,body:{enabled:true,expectedRevision:0,requestId:crypto.randomUUID()}})).status,403);
    const id=crypto.randomUUID(),enabled=await f.setting(true,0,id);assert.equal(enabled.status,200);assert.equal(enabled.body.config.enabled,true);
    assert.equal((await f.setting(true,0,id)).body.replayed,true);
    assert.equal((await f.setting(false,0)).status,409);
    assert.equal((await f.setting(false,0,id)).status,409);
    for(const user of [0,4,5,6])assert.ok([401,404].includes((await f.issue(user)).status));
    await f.run('DELETE FROM user_second_verifications WHERE user_id=1');assert.equal((await f.issue(1)).status,403);
    assert.equal((await f.issue(2,crypto.randomUUID(),{userId:3})).status,400);
    assert.equal((await f.call('server-support/apply',{user:2,origin:'https://evil.test',body:{requestId:crypto.randomUUID()}})).status,403);
    assert.equal((await f.setting(false,1)).status,200);
    assert.equal((await f.issue()).body.code,'SUPPORT_APPLICATION_DISABLED');
    assert.equal((await f.one('SELECT COUNT(*) n FROM user_messages')).n,0);
  });
  test(`${engine}: personal account message, retry, three daily issues and KST midnight`,async t=>{
    const f=await applicationFixture({postgres});t.after(()=>f.close());await f.setting(true);
    const id=crypto.randomUUID(),one=await f.issue(2,id);assert.equal(one.status,200);assert.equal(one.body.application.remaining,2);assert.equal(one.body.expiresAt-one.body.issuedAt,300000);
    const inbox=await f.messages();assert.equal(inbox.body.messages.length,1);assert.match(inbox.headers.get('cache-control'),/private, no-store/);
    assert.match(inbox.body.messages[0].body,/신한은행 110-290-621512\n예금주: 전병은/);assert.equal(inbox.body.messages[0].expiresAt,one.body.expiresAt);
    assert.equal((await f.messages(3)).body.messages.length,0);
    for(let i=0;i<4;i++)assert.equal((await f.issue(2,id)).body.replayed,true);
    assert.equal((await f.one('SELECT COUNT(*) n FROM user_messages')).n,1);
    assert.ok(!(await f.all('SELECT value FROM app_meta')).some(r=>r.value.includes('110-290-621512')));
    await f.issue();await f.issue();assert.equal((await f.issue()).status,429);
    await f.run('DELETE FROM user_messages WHERE user_id=2');assert.equal((await f.issue()).status,429);
    assert.equal((await f.issue(3)).status,200);
    f.clock.now=Date.parse('2026-10-10T23:59:59.999+09:00');assert.equal((await f.issue()).status,429);
    f.clock.now++;const old=await f.issue(2,id);assert.equal(old.body.expired,true);assert.equal(old.body.messageId,null);assert.equal(old.body.application.used,0);
    const next=await f.issue();assert.equal(next.body.application.used,1);
    assert.equal((await f.one('SELECT COUNT(*) n FROM user_messages WHERE user_id=2')).n,1);
    assert.equal((await f.call('server-support/info',{user:2})).body.subscription.active,false);
  });
  test(`${engine}: insert/receipt failure rolls back count and message, including silent insert loss`,async t=>{
    const f=await applicationFixture({postgres});t.after(()=>f.close());await f.setting(true);
    const id=crypto.randomUUID();f.fail('INSERT INTO user_messages');assert.equal((await f.issue(2,id)).status,503);f.fail('');
    assert.equal((await f.call('server-support/info',{user:2})).body.application.used,0);
    // Receipt insertion is after the message; a failure must roll both back.
    await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)','support_application_day_v1:2:2026-10-10',JSON.stringify({used:0}));
    f.fail('INSERT INTO app_meta(key,value) VALUES');assert.equal((await f.issue(2,id)).status,503);f.fail('');
    assert.equal((await f.one('SELECT COUNT(*) n FROM user_messages')).n,0);
    await f.exec(postgres?"CREATE FUNCTION skip_application() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;CREATE TRIGGER skip_application BEFORE INSERT ON user_messages FOR EACH ROW EXECUTE FUNCTION skip_application();":"CREATE TRIGGER skip_application BEFORE INSERT ON user_messages BEGIN SELECT RAISE(IGNORE); END;");
    assert.equal((await f.issue(2,id)).status,503);assert.equal((await f.call('server-support/info',{user:2})).body.application.used,0);
    await f.exec('DROP TRIGGER skip_application'+(postgres?' ON user_messages':'')+';');
    assert.equal((await f.issue(2,id)).body.application.used,1);
    assert.equal((await f.issue(2,id)).body.replayed,true);
    assert.equal((await f.one('SELECT COUNT(*) n FROM joint_atomic_guards_v1')).n,0);
  });
  test(`${engine}: racing issue retries preserve quota; same request creates one message`,async t=>{
    const f=await applicationFixture({postgres});t.after(()=>f.close());await f.setting(true);
    const batch=f.DB.batch.bind(f.DB);let race=true;
    f.DB.batch=async statements=>{if(race){race=false;assert.equal((await f.issue()).status,200);}return batch(statements);};
    assert.equal((await f.issue()).body.application.used,2);
    const id=crypto.randomUUID();race=true;
    f.DB.batch=async statements=>{if(race){race=false;assert.equal((await f.issue(2,id)).status,200);}return batch(statements);};
    assert.equal((await f.issue(2,id)).body.replayed,true);
    assert.equal((await f.one('SELECT COUNT(*) n FROM user_messages')).n,3);
    assert.equal((await f.issue()).status,429);
  });
  test(`${engine}: five-minute boundary, unread counts, offline deletion and scheduler deadlines`,async t=>{
    const f=await applicationFixture({postgres});t.after(()=>f.close());await f.setting(true);
    const first=(await f.issue()).body;await f.run("INSERT INTO user_messages(user_id,title,body,message_type,created_at) VALUES(2,'기존 보상','보존','NOTICE','2020-01-01')");
    f.clock.now+=1000;const second=(await f.issue(3)).body;
    f.clock.now=first.expiresAt-1;assert.equal((await f.messages()).body.messages.length,2);
    f.clock.now++;const count=await f.one(`SELECT COUNT(*) n FROM user_messages WHERE user_id=2 AND ${liveSupportMessageSql()}`,supportMessageCutoff(f.clock.now));assert.equal(count.n,1);
    const expired=await f.messages();assert.equal(expired.body.messages.length,1);assert.equal(expired.body.unread,1);assert.equal(expired.body.messages[0].message_type,'NOTICE');
    assert.equal((await f.messages(3)).body.messages.length,1);
    assert.equal(await reconcileSupportMessages(f.env,f.clock.now),new Date(second.expiresAt).toISOString());
    let closed=0,clan=0;f.clock.now=second.expiresAt;
    const options={openDatabase:async()=>({db:f.DB,close:async()=>closed++}),now:()=>f.clock.now,reconcile:async()=>{clan++;return {nextCheckAt:new Date(f.clock.now+30000).toISOString()};},reconcileSessions:async()=>{}};
    const result=await runDraftSchedule({},options);assert.equal(result.nextSupportMessageExpiryAt,null);assert.equal(closed,1);assert.equal(clan,1);
    assert.equal((await f.all('SELECT * FROM user_messages')).length,1);
    assert.equal(nextAlarmAt({nextCheckAt:new Date(f.clock.now+30000).toISOString(),nextSupportMessageExpiryAt:new Date(f.clock.now+501).toISOString()},f.clock.now),f.clock.now+501);
    let alarm;await handleDraftAlarm({setAlarm:async value=>alarm=value},{},{now:()=>f.clock.now,run:async()=>({...result,nextSupportMessageExpiryAt:new Date(f.clock.now+501).toISOString()})});assert.equal(alarm,f.clock.now+501);
    // A clan error cannot prevent the independent message deletion job.
    await f.issue(3);f.clock.now+=SUPPORT_BANK_MESSAGE_TTL;
    await assert.rejects(runDraftSchedule({},{...options,reconcile:async()=>{throw Error('clan failure');}}),/clan failure/);
    assert.equal((await f.all('SELECT * FROM user_messages')).length,1);assert.equal(closed,2);
    await f.setting(false,1);assert.equal((await f.issue()).status,403);
  });
}
