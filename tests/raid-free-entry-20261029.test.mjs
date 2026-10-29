import test from 'node:test';
import assert from 'node:assert/strict';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {madaraLiveFixture} from './helpers/madara-live-fixture.mjs';
import {coreLifecycleFixture} from './helpers/core-raid-lifecycle-fixture.mjs';

for(const postgres of [false,true])for(const [kind,fixture,command,ticket]of [['lich',lichLiveFixture,'open','LICH_KING_ENTRY_TICKET'],['madara',madaraLiveFixture,'create','MADARA_RAID_ENTRY_TICKET']]){
 test(`${kind} free entry with zero tickets; atomic failure/retry preserves all inventory ${postgres}`,async t=>{
  const h=await fixture({postgres});t.after(()=>h.close());await h.configure({mode:'ON',...(kind==='madara'?{entryTicketCost:10,testEntryFree:false}:{})});
  const before=await h.all('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code');
  assert.equal(await h.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=3 AND item_code=?',ticket),null);
  const body={requestId:h.uid(),...(kind==='madara'?{role:'WARDEN'}:{})};
  h.inject('INSERT INTO raid_'+kind+'_receipts');assert.equal((await h.call(command,{body,user:3})).status,503);h.inject('');
  assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_'+kind+'_rooms_v1')).n),0);assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_'+kind+'_active_v1')).n),0);
  const [a,b]=await Promise.all([h.call(command,{body,user:3}),h.call(command,{body,user:3})]);assert.equal(a.status,200,JSON.stringify(a));assert.equal(b.body.roomId,a.body.roomId);
  assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_'+kind+'_rooms_v1')).n),1);assert.deepEqual(await h.all('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code'),before);assert.equal(Number((await h.one('SELECT COUNT(*) n FROM inventory_logs')).n),0);
  const status=await h.call(kind==='madara'?'lobby':'status',{user:4});assert.equal(status.status,200);assert.equal(kind==='madara'?status.body.account.cost:status.body.entry.required,0);
  assert.equal((await h.command(command,{},3)).status,409);await h.command('leave',{roomId:a.body.roomId},3);assert.equal((await h.command(command,{},3)).status,200);
  assert.deepEqual(await h.all('SELECT * FROM cnine_user_inventory ORDER BY user_id,item_code'),before);
 });
}
for(const dialect of ['sqlite','postgres'])test(`Core creates without a ticket, preserves balances and rolls back membership ${dialect}`,async t=>{
 const h=await coreLifecycleFixture(dialect);t.after(()=>h.close());assert.equal(Number((await h.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='CORE_RAID_ENTRY_TICKET'")).quantity),5);
 await h.run("INSERT INTO users(id,nickname,role) VALUES(3,'무료입장 검수','OWNER')");
 const body={requestId:'FREE-CORE-ENTRY-20261029'},opts={user:3};h.fail('INSERT INTO raid_core_rooms_v2024');assert.equal((await h.call('raid/core/open',body,opts)).status,500);h.fail('');
 assert.equal(await h.row('SELECT room_id FROM raid_core_active_members_v2024 WHERE user_id=3'),null);
 const opened=await h.call('raid/core/open',body,opts);assert.equal(opened.status,200,JSON.stringify(opened));assert.equal(opened.body.entry.required,0);assert.equal(opened.body.entry.quantity,0);
 const again=await h.call('raid/core/open',body,opts);assert.equal(again.status,200);assert.equal(again.body.current.id,opened.body.current.id);
 assert.equal(Number((await h.row('SELECT COUNT(*) n FROM inventory_logs')).n),0);assert.equal(await h.row('SELECT quantity FROM cnine_user_inventory WHERE user_id=3'),null);
});
test('Free Core entry still requires current clan membership for clan-only rooms',async t=>{
 const h=await coreLifecycleFixture();t.after(()=>h.close());
 await h.run('CREATE TABLE clan_seasons(id INTEGER PRIMARY KEY,season_no INTEGER,phase TEXT)');
 await h.run('CREATE TABLE clan_members(season_id INTEGER,clan_id INTEGER,user_id INTEGER,PRIMARY KEY(season_id,user_id))');
 await h.run("INSERT INTO clan_seasons VALUES(1,1,'COMPLETE'),(2,2,'ACTIVE')");
 for(const id of[3,4,5])await h.run("INSERT INTO users(id,nickname,role) VALUES(?,?,'OWNER')",id,'Clan QA '+id);
 await h.run('INSERT INTO clan_members VALUES(1,10,3),(2,10,4),(2,20,5)');
 assert.equal((await h.call('raid/core/open',{requestId:'NO-CLAN',clanOnly:true},{user:3})).status,403);
 await h.run('INSERT INTO clan_members VALUES(2,10,3)');
 const opened=await h.call('raid/core/open',{requestId:'CLAN-FREE',clanOnly:true},{user:3});assert.equal(opened.status,200);
 const roomId=opened.body.current.id;assert.equal(opened.body.entry.required,0);assert.equal(opened.body.entry.quantity,0);
 assert.equal((await h.call('raid/core/join',{roomId},{user:5})).status,403);
 await h.run('DELETE FROM clan_members WHERE season_id=2 AND user_id=3');
 assert.equal((await h.call('raid/core/join',{roomId},{user:4})).status,403);
 await h.run('INSERT INTO clan_members VALUES(2,10,3)');
 assert.equal((await h.call('raid/core/join',{roomId},{user:4})).status,200);
 assert.equal((await h.call('raid/core/join',{roomId},{user:4})).body.current.participantCount,2);
 assert.equal(Number((await h.row('SELECT COUNT(*) n FROM inventory_logs')).n),0);
});
