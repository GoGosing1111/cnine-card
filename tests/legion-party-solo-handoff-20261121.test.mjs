import test from 'node:test';
import assert from 'node:assert/strict';
import {citadelFixture} from './helpers/legion-citadel-fixture.mjs';
import {createLegionCoins} from '../shared/legion-hunt-coins-v1.mjs';

const soloKey=uid=>'legion_hunt_owner_session_v1:'+uid;
const deadline=uid=>'legion_citadel_v1:next-entry:'+uid;
const get=async(f,k)=>(await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind(k).first())?.value??null;
const put=(f,k,value)=>f.exec('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',k,JSON.stringify(value));
async function action(f,u,cmd,body){
  const r=await f.action(u,cmd,body);
  assert.equal(r.status,200,JSON.stringify(r.body));
  return r.body.state;
}
async function prepare(f,options={}){
  const {id}=await action(f,1,'create',{requestId:crypto.randomUUID(),...options});
  await action(f,2,'join',{id});
  for(const u of [1,2])await action(f,u,'ready',{id,...f.selection(u-1)});
  await action(f,1,'start',{id});
  return id;
}
function personal(f,{paid=0,items=0,started=true}={}){
  const at=f.clock.now,item={type:'INVENTORY_ITEM',code:'INVENTORY_ITEM:VEHICLE_PART_FRAME',ref:'VEHICLE_PART_FRAME',name:'강화 차체 프레임',quantity:items};
  return {expiresAt:at+1600000,energy:{version:1,current:started?9:10,maximum:10,updatedAt:at},entry:{charged:started,energyCharged:started,status:started?'RESERVED':'READY'},
    coins:{paid},liveRewards:true,rewardTiming:'FINISH',state:{id:crypto.randomUUID(),policy:{id:'normal',huntDurationMs:420000},timeLimit:420000,timeline:[{seq:1,combatAtMs:100,huntKill:true},{seq:2,combatAtMs:90000,huntKill:true,boss:true}],
      magnet:true,lastAck:started?1:0,startedAt:started?at-1000:null,ended:false,receipt:null,inventory:items?[[item.code,item]]:[]}};
}
const readSolo=async(f,u)=>JSON.parse(await get(f,soloKey(u)));
const inventory=async f=>Number((await f.db.prepare('SELECT SUM(quantity) AS n FROM cnine_user_inventory WHERE user_id=2').first()).n||0);
for(const postgres of [false,true]){
  const db=postgres?'Postgres':'SQLite';
  test(db+' confirms both members atomically, refunds an empty run once, and settles only the saved bag after a lost reply',async()=>{
    const f=await citadelFixture({postgres});
    try{
      const host=personal(f),guest=personal(f,{items:3,paid:250}),other=personal(f,{started:false});
      for(const [i,r] of [[1,host],[2,guest],[3,other]])await put(f,soloKey(i),r);
      await f.exec('UPDATE users SET coin=250 WHERE id=2');
      const id=await prepare(f);
      assert.equal((await action(f,1,'loaded',{id})).status,'LOADING');
      assert.deepEqual(await readSolo(f,1),host);assert.deepEqual(await readSolo(f,2),guest);
      assert.equal((await f.action(3,'loaded',{id})).status,403);
      // This DELETE comes after both personal saves and both party entry debits in the same batch.
      f.fail('DELETE FROM app_meta');assert.equal((await f.action(2,'loaded',{id})).status,503);f.fail('');
      for(const [i,r] of [[1,host],[2,guest]]){assert.deepEqual(await readSolo(f,i),r);assert.equal(await get(f,deadline(i)),null);}
      f.loseReply();assert.equal((await f.action(2,'loaded',{id})).status,503);
      const battle=await action(f,2,'loaded',{id});assert.equal(battle.status,'ACTIVE');
      assert.equal((await action(f,1,'loaded',{id})).startsAt,battle.startsAt);
      const a=await readSolo(f,1),b=await readSolo(f,2);
      assert.equal(a.interruption.refunded,true);assert.equal(a.energy.current,10);
      assert.equal(b.rewardStatus,'PENDING');assert.equal(b.entry.status,'CONSUMED');assert.equal(b.energy.current,9);
      assert.equal(b.state.receipt.reason,'RETREAT');assert.equal(b.state.receipt.earnedCoins,250);assert.equal(b.state.receipt.kills,1);
      assert.deepEqual(b.state.receipt.inventory,guest.state.inventory.map(x=>x[1]));assert.equal(await inventory(f),0);
      assert.deepEqual(await readSolo(f,3),other);
      for(const u of [1,2])assert.equal(Number(await get(f,deadline(u))),battle.startsAt+6*3600000);
      f.setUser(f.player);assert.equal((await f.call('legion-hunt/reveal',{id:guest.state.id,seq:2})).status,409);
      f.fail('INSERT INTO inventory_logs');assert.equal((await f.call('legion-hunt/recover',{})).status,503);f.fail('');
      assert.equal((await readSolo(f,2)).rewardStatus,'PENDING');assert.equal((await action(f,2,'loaded',{id})).status,'ACTIVE');
      assert.equal((await f.call('legion-hunt/recover',{})).body.recovery.kind,'SETTLED');
      assert.equal((await f.call('legion-hunt/finish',{id:guest.state.id,seq:1})).status,200);assert.equal(await inventory(f),3);
      assert.equal((await f.call('legion-hunt/recover',{})).body.entries.current,9);
      assert.equal(Number((await f.db.prepare('SELECT coin FROM users WHERE id=2').first()).coin),250);
      assert.equal(Number((await f.db.prepare('SELECT COUNT(*) n FROM inventory_logs WHERE user_id=2').first()).n),1);
    }finally{await f.close();}
  });
  test(db+' final loading retries a racing pickup and the original party preserves the newer bag with no paid coins',async()=>{
    const f=await citadelFixture({postgres});
    try{
      const id=await prepare(f);await action(f,2,'loaded',{id});
      const prior=personal(f);await put(f,soloKey(2),prior);
      const newer=personal(f,{items:5});newer.state.id=prior.state.id;
      const batch=f.db.batch.bind(f.db);
      f.db.batch=async statements=>{f.db.batch=batch;await put(f,soloKey(2),newer);return batch(statements);};
      assert.equal((await action(f,1,'loaded',{id})).status,'ACTIVE');
      const saved=await readSolo(f,2);assert.equal(saved.state.receipt.inventory[0].quantity,5);assert.equal(saved.energy.current,9);
      f.setUser(f.player);assert.equal((await f.call('legion-hunt/recover',{})).status,200);assert.equal(await inventory(f),5);
    }finally{await f.close();}
  });
}
test('cooldown, leaving during preparation, expired rooms and existing terminal personal records never interrupt a personal expedition',async()=>{
  const f=await citadelFixture();try{
    const guest=personal(f,{items:2});await put(f,soloKey(2),guest);
    let id=await prepare(f);await action(f,1,'loaded',{id});await put(f,deadline(1),f.clock.now+6*3600000);
    assert.equal((await f.action(2,'loaded',{id})).body.code,'CITADEL_COOLDOWN');assert.deepEqual(await readSolo(f,2),guest);
    await f.exec('DELETE FROM app_meta WHERE key=?',deadline(1));await action(f,1,'leave',{id});
    assert.equal((await f.action(2,'loaded',{id})).body.code,'CITADEL_LOADING');assert.deepEqual(await readSolo(f,2),guest);
    id=await prepare(f);f.clock.now+=120001;assert.equal((await f.action(2,'loaded',{id})).body.code,'CITADEL_LOADING');assert.deepEqual(await readSolo(f,2),guest);
    id=await prepare(f);const expired={...guest,expiresAt:f.clock.now};const done=personal(f);done.state.ended=true;done.state.receipt={id:done.state.id};done.rewardStatus='PENDING';
    await put(f,soloKey(1),expired);await put(f,soloKey(2),done);await action(f,1,'loaded',{id});await action(f,2,'loaded',{id});
    assert.deepEqual(await readSolo(f,1),expired);assert.deepEqual(await readSolo(f,2),done);
  }finally{await f.close();}
});
test('cow ticket availability and party-only spending survive handoff; an unstarted personal run consumes no energy',async()=>{
  const f=await citadelFixture();try{
    const ticket='LEGION_COW_PARTY_TICKET';
    await f.exec('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,1,1)',1,ticket);
    const id=await prepare(f,{area:'cow-room',tier:'throne'});await action(f,1,'loaded',{id});
    const host=personal(f,{started:false}),guest=personal(f);guest.entry={cowTicket:true,energyCharged:false,charged:false,status:'RESERVED'};
    await put(f,soloKey(1),host);await put(f,soloKey(2),guest);
    await f.exec('UPDATE cnine_user_inventory SET quantity=0 WHERE user_id=1 AND item_code=?',ticket);
    assert.equal((await f.action(2,'loaded',{id})).status,409);assert.deepEqual(await readSolo(f,1),host);assert.deepEqual(await readSolo(f,2),guest);
    await f.exec('UPDATE cnine_user_inventory SET quantity=1 WHERE user_id=1 AND item_code=?',ticket);
    assert.equal((await action(f,2,'loaded',{id})).status,'ACTIVE');await action(f,2,'loaded',{id});
    assert.equal((await readSolo(f,1)).energy.current,10);assert.equal((await readSolo(f,2)).entry.status,'CONSUMED');assert.equal((await readSolo(f,2)).energy.current,9);
    assert.equal(await get(f,deadline(1)),null);assert.equal(Number((await f.db.prepare('SELECT COUNT(*) n FROM inventory_logs WHERE user_id=1 AND item_code=?').bind(ticket).first()).n),1);
  }finally{await f.close();}
});
test('owner coin entry debits the restored balance once; an acknowledged result without coins or loot keeps its finish',async()=>{
  const f=await citadelFixture({ownerIds:[1]});try{
    const id=await prepare(f),key='legion_citadel_v1:room:'+id,room=JSON.parse(await get(f,key));
    room.members[0].coins={...createLegionCoins(null,'normal',{live:true}),partyMultiplier:1,huntDurationMs:420000};
    await put(f,key,room);
    const host=personal(f);host.entry.charged=false;host.energy.current=0;
    const guest=personal(f);guest.state.timeline[0]={seq:1,type:'RESULT',combatAtMs:100,winner:'A'};
    await put(f,soloKey(1),host);await put(f,soloKey(2),guest);
    await action(f,1,'loaded',{id});await action(f,2,'loaded',{id});await action(f,1,'loaded',{id});
    assert.equal((await readSolo(f,1)).energy.current,0);assert.ok(JSON.parse(await get(f,key)).members[0].coins);
    assert.equal(await get(f,deadline(1)),null);assert.equal((await readSolo(f,2)).state.receipt.reason,'CLEAR');
    assert.equal((await readSolo(f,2)).energy.current,9);
  }finally{await f.close();}
});
test('legacy instant-grant inventory survives party departure with no second grant or entry refund',async()=>{
  const f=await citadelFixture();try{
    const id=await prepare(f),legacy=personal(f,{items:2});delete legacy.rewardTiming;
    await put(f,soloKey(2),legacy);await f.exec('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,2,2)',2,'VEHICLE_PART_FRAME');
    await action(f,2,'loaded',{id});await action(f,1,'loaded',{id});const saved=await readSolo(f,2);
    assert.equal(saved.entry.status,'CONSUMED');assert.equal(saved.energy.current,9);assert.equal(saved.interruption.refunded,false);
    f.setUser(f.player);assert.equal((await f.call('legion-hunt/recover',{})).body.entries.current,9);assert.equal(await inventory(f),2);
  }finally{await f.close();}
});
