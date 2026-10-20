import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationFixture} from './helpers/supporter-application-fixture.mjs';

async function seed(f){
  const now=new Date(f.clock.now).toISOString();
  for(const [id,user,isRead,type,coupon] of [
    [1,2,1,'NOTICE',null],[2,2,0,'NOTICE',null],
    [3,2,1,'ITEM_REWARD',null],[4,2,1,'ITEM_REWARD',null],
    [5,2,1,'ITEM_REWARD',null],[6,2,1,'NOTICE','KEEP-COUPON'],
    [7,2,1,'SUPPORT_BANK_ACCOUNT',null],[8,3,1,'NOTICE',null],
    [9,2,1,'ITEM_REWARD',null],[10,2,1,'ITEM_REWARD',null],
    [11,2,1,'ITEM_REWARD',null],[12,2,0,'ITEM_REWARD',null]
  ])await f.run('INSERT INTO user_messages(id,user_id,title,body,message_type,is_read,coupon_code,created_at) VALUES(?,?,?,?,?,?,?,?)',id,user,'메시지 '+id,'검수',type,isRead,coupon,now);
  for(const [id,type,claimed] of [[3,'COIN',null],[4,'COIN',now],[5,'COIN',now],[9,'FUTURE_REWARD',null],[10,'COIN',now],[11,'COIN',now],[12,'COIN',now]]){
    await f.run('INSERT INTO user_message_rewards(id,message_id,user_id,reward_type,reward_amount,claimed_at) VALUES(?,?,2,?,50,?)',id,id,type,claimed);
  }
  for(const [id,user,amount] of [[4,2,50],[10,3,50],[11,2,100],[12,2,50]])
    await f.run('INSERT INTO user_message_reward_claim_receipts_v1222 VALUES(?,?,?,?,?,?)',id,id,user,'COIN',amount,now);
}
async function patch(f,body,user=2){
  const response=await f.handle(new Request('https://support.test/api/messages',{
    method:'PATCH',headers:{authorization:'Bearer qa-'+user,'content-type':'application/json'},body:JSON.stringify(body)
  }));
  return {status:response.status,body:await response.json()};
}

for(const postgres of [false,true]){
  const name=postgres?'PostgreSQL':'SQLite';
  test(name+': authenticated cleanup archives only owned read notices and receipted rewards',async t=>{
    const f=await applicationFixture({postgres});t.after(()=>f.close());await seed(f);
    const inbox=(await f.messages()).body;
    assert.equal(inbox.cleanupCount,3);
    assert.equal(Number(inbox.messages.find(m=>Number(m.id)===1).cleanupEligible),1);
    assert.equal(Number(inbox.messages.find(m=>Number(m.id)===2).cleanupEligibleOnRead),1);
    assert.equal(Number(inbox.messages.find(m=>Number(m.id)===5).cleanupEligible),0);
    const rewards=await f.all('SELECT * FROM user_message_rewards ORDER BY id');
    const receipts=await f.all('SELECT * FROM user_message_reward_claim_receipts_v1222 ORDER BY reward_id');
    const users=await f.all('SELECT * FROM users ORDER BY id');
    assert.equal((await patch(f,{action:'HIDE_COMPLETED'},0)).status,401);
    const result=await patch(f,{action:'HIDE_COMPLETED',userId:3,messageIds:[3,6,7,8]});
    assert.deepEqual(result,{status:200,body:{ok:true,deletedCount:3}});
    assert.deepEqual((await f.all('SELECT id FROM user_messages WHERE hidden_at IS NOT NULL ORDER BY id')).map(r=>Number(r.id)),[1,4,12]);
    assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_messages')).n),12);
    assert.deepEqual(await f.all('SELECT * FROM user_message_rewards ORDER BY id'),rewards);
    assert.deepEqual(await f.all('SELECT * FROM user_message_reward_claim_receipts_v1222 ORDER BY reward_id'),receipts);
    assert.deepEqual(await f.all('SELECT * FROM users ORDER BY id'),users);
    assert.equal((await patch(f,{action:'HIDE_COMPLETED'})).body.deletedCount,0);
    assert.equal((await f.messages()).body.cleanupCount,0);
  });
  test(name+': reads enable cleanup; pagination and repeated requests cannot leave eligible mail or remove pending rewards',async t=>{
    const f=await applicationFixture({postgres});t.after(()=>f.close());await seed(f);
    await patch(f,{id:2});
    assert.equal((await f.messages()).body.cleanupCount,4);
    for(let id=100;id<205;id++)
      await f.run("INSERT INTO user_messages(id,user_id,title,body,message_type,is_read,created_at) VALUES(?,2,'이전 안내','검수','NOTICE',1,?)",id,new Date(f.clock.now).toISOString());
    const inbox=(await f.messages()).body;assert.equal(inbox.messages.length,100);assert.equal(inbox.cleanupCount,109);
    // A new attachment after the list was loaded must protect that message.
    await f.run("INSERT INTO user_message_rewards(id,message_id,user_id,reward_type,reward_amount) VALUES(100,100,2,'COIN',10)");
    assert.equal((await patch(f,{action:'HIDE_COMPLETED'})).body.deletedCount,108);
    assert.equal((await f.one('SELECT hidden_at FROM user_messages WHERE id=100')).hidden_at,null);
    assert.equal((await patch(f,{action:'HIDE_COMPLETED'})).body.deletedCount,0);
  });
  test(name+': failed archive rolls back every affected message and a retry succeeds',async t=>{
    const f=await applicationFixture({postgres});t.after(()=>f.close());await seed(f);
    await f.exec(postgres?
      "CREATE FUNCTION reject_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=4 THEN RAISE EXCEPTION 'INJECTED_FAILURE'; END IF; RETURN NEW; END $$;CREATE TRIGGER reject_cleanup BEFORE UPDATE ON user_messages FOR EACH ROW EXECUTE FUNCTION reject_cleanup();":
      "CREATE TRIGGER reject_cleanup BEFORE UPDATE ON user_messages WHEN NEW.id=4 BEGIN SELECT RAISE(ABORT,'INJECTED_FAILURE'); END;");
    await assert.rejects(patch(f,{action:'HIDE_COMPLETED'}),/INJECTED_FAILURE/);
    assert.equal(Number((await f.one('SELECT COUNT(*) n FROM user_messages WHERE hidden_at IS NOT NULL')).n),0);
    await f.exec('DROP TRIGGER reject_cleanup'+(postgres?' ON user_messages':''));
    assert.equal((await patch(f,{action:'HIDE_COMPLETED'})).body.deletedCount,3);
  });
}
