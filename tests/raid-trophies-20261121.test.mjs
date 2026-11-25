import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {readCommittedAssetSync} from './helpers/sparse-media-fixture.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
import {noxFixture} from './helpers/nox-live-fixture.mjs';
import {NOX_CREATE_COINS} from '../functions/_raid_nox_live.js';
import {lichMilestoneValue,noxClearKey,readPlayerMilestoneHonors} from '../functions/_milestone_trophies.js';
import {emptyTrophyBonuses,validateTrophyBonuses} from '../shared/trophy-bonuses-v1.mjs';
import {TROPHY_CATALOG} from '../js/player-card-model-v2052.js';

async function start(h,size=3,difficulty='NORMAL'){
  const {roomId}=await h.party(size,difficulty);
  assert.equal((await h.command('start',{roomId})).status,200);
  return roomId;
}
async function finalHit(h,roomId){
  return h.changeRoom(roomId,room=>{
    const now=Date.now();
    room.clock=now-4000;
    room.startedAt=now-15000;
    room.endsAt=now+60000;
    room.round=3;
    room.stage='EXPOSED';
    room.challenge={id:roomId+':3:EXPOSED',stage:'EXPOSED',startsAt:now-4000,deadline:now+10000};
    room.lastAttackAt=now-4000;
    room.boss.hp=1;
  });
}
const honor=async(h,id)=>(await readPlayerMilestoneHonors(h.env,id)).noxClear;
const poll=(h,roomId,user=1)=>h.call('state?roomId='+roomId,{user});

test('official 30th Nox clear commits with the room, survives a competing poll and late departures, and retains its date on the next clear',async t=>{
  const h=await noxFixture(t);
  await h.configure({mode:'ON'});
  await h.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[noxClearKey(1),JSON.stringify({count:29,acquiredAt:null})]);
  const roomId=await start(h);
  assert.equal((await h.command('leave',{roomId},3)).status,200);
  await finalHit(h,roomId);
  // The defeated player stayed in the party and still shares the clear.
  await h.changeRoom(roomId,r=>{const m=r.members.find(m=>m.id==='2');m.hp=0;for(const f of m.fighters)f.hp=0;});
  const failed=await h.one('SELECT version FROM raid_nox_rooms_v1 WHERE room_id=$1',[roomId]);
  await h.pg.exec(`CREATE FUNCTION fail_credit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected credit failure'; END$$;
    CREATE TRIGGER fail_credit BEFORE INSERT OR UPDATE ON app_meta FOR EACH ROW WHEN(NEW.key='trophy_nox_clear_v1:2') EXECUTE FUNCTION fail_credit();`);
  assert.equal((await poll(h,roomId)).status,503);
  assert.deepEqual(await h.one('SELECT status,version FROM raid_nox_rooms_v1 WHERE room_id=$1',[roomId]),{status:'ACTIVE',version:failed.version});
  assert.deepEqual(await honor(h,1),{count:0,progress:29,goal:30,acquiredAt:null});
  assert.equal((await h.one('SELECT count(*)::int n FROM coin_logs WHERE change_amount>0')).n,0);
  assert.equal((await h.one('SELECT count(*)::int n FROM cnine_user_inventory')).n,0);
  assert.equal((await h.call('feature?weekly=1')).body.weeklyReward.used,0);
  await h.pg.exec('DROP TRIGGER fail_credit ON app_meta');
  const responses=await Promise.all([poll(h,roomId),poll(h,roomId,2)]);
  for(const r of responses){assert.equal(r.status,200);assert.equal(r.body.state.status,'CLEAR');assert.equal(r.body.state.reward.status,'PAID');}
  assert.deepEqual(await h.all('SELECT user_id::int FROM inventory_logs ORDER BY user_id'),[{user_id:1},{user_id:2}]);
  const stored=JSON.parse((await h.one('SELECT state_json FROM raid_nox_rooms_v1 WHERE room_id=$1',[roomId])).state_json);
  const at=new Date(stored.finishedAt).toISOString();
  assert.deepEqual(stored.clearParticipantIds,['1','2']);
  assert.deepEqual(await honor(h,1),{count:1,progress:30,goal:30,acquiredAt:at});
  assert.equal((await honor(h,2)).progress,1);assert.equal((await honor(h,3)).progress,0);
  for(const id of [1,2])assert.equal((await h.command('leave',{roomId},id)).status,200);
  assert.equal((await h.one('SELECT status FROM raid_nox_rooms_v1 WHERE room_id=$1',[roomId])).status,'CLEAR');
  const next=await start(h);const room=await finalHit(h,next);
  const input={roomId:next,seq:1,challengeId:room.challenge.id,inputs:[]};
  const completed=await h.call('action',{body:input});
  assert.equal(completed.status,200);assert.equal(completed.body.state.status,'CLEAR');
  assert.equal((await h.call('action',{body:input})).body.state.status,'CLEAR');
  assert.equal((await poll(h,next)).body.state.status,'CLEAR');
  assert.deepEqual(await honor(h,1),{count:1,progress:31,goal:30,acquiredAt:at});
});

test('a leave request that resolves the killing blow credits the frozen six-person roster only once; a failed receipt rolls the clear back',async t=>{
  const h=await noxFixture(t);await h.configure({mode:'ON'});
  const roomId=await start(h,6);await finalHit(h,roomId);
  const body={roomId,requestId:h.uid()};
  h.failAt('INSERT INTO raid_nox_receipts_v1');assert.equal((await h.call('leave',{user:2,body})).status,503);
  h.failAt('');assert.equal((await honor(h,2)).progress,0);
  assert.equal((await h.one('SELECT count(*)::int n FROM inventory_logs')).n,0);
  assert.equal((await h.call('leave',{user:2,body})).status,200);
  assert.equal((await h.call('leave',{user:2,body})).status,200);
  for(const id of [1,2,3,6,7,8])assert.equal((await honor(h,id)).progress,1);
  assert.equal((await h.one('SELECT count(*)::int n FROM inventory_logs')).n,6);
  assert.equal((await honor(h,4)).progress,0);
});

test('TEST clear, failed official raid and a disbanded lobby do not advance the Nox trophy',async t=>{
  const h=await noxFixture(t);
  const trial=await start(h);await finalHit(h,trial);
  await h.configure({mode:'ON'}); // The room keeps the mode under which it started.
  const testClear=(await poll(h,trial)).body.state;
  assert.equal(testClear.status,'CLEAR');
  assert.equal(testClear.reward,null);
  const failed=await start(h);await h.changeRoom(failed,r=>{r.endsAt=Date.now()-1;});
  assert.equal((await poll(h,failed)).body.state.status,'FAILED');
  for(const id of [1,2,3])assert.equal((await h.command('leave',{roomId:failed},id)).status,200);
  assert.equal((await h.one('SELECT status FROM raid_nox_rooms_v1 WHERE room_id=$1',[failed])).status,'FAILED');
  const lobby=(await h.command('create',{size:3,acceptedCreateCoins:NOX_CREATE_COINS})).body.roomId;
  assert.equal((await h.command('leave',{roomId:lobby})).status,200);
  assert.equal((await h.one('SELECT status FROM raid_nox_rooms_v1 WHERE room_id=$1',[lobby])).status,'CANCELLED');
  for(const id of [1,2,3])assert.equal((await honor(h,id)).progress,0);
  assert.equal((await h.one('SELECT count(*)::int n FROM inventory_logs')).n,0);
});

test('official Normal and Hell share three payouts per account and reset at Monday midnight KST',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-22T14:59:59Z')});
  const h=await noxFixture(t);
  await h.configure({mode:'ON'});
  await h.pg.exec("INSERT INTO inventory_items VALUES('RYUJIN_NECKLACE',1)");
  t.mock.method(crypto,'getRandomValues',buffer=>buffer.fill(0));

  const difficulties=['NORMAL','HELL','NORMAL','HELL'];
  for(let index=0;index<difficulties.length;index++){
    const difficulty=difficulties[index],roomId=await start(h,3,difficulty);
    await finalHit(h,roomId);
    const response=await poll(h,roomId);
    assert.equal(response.status,200,JSON.stringify(response));
    assert.equal(response.body.state.difficulty,difficulty);
    assert.equal(response.body.state.status,'CLEAR');
    const reward=response.body.state.reward;
    assert.equal(reward.weekly.used,Math.min(3,index+1));
    if(index===3){
      assert.equal(reward.status,'LIMIT');
      assert.equal(reward.coins,undefined);
      assert.equal(reward.ryujinMaterialDrop,undefined);
    }else{
      assert.equal(reward.status,'PAID');
      assert.equal(reward.ryujinMaterialDrop.code,'RYUJIN_NECKLACE');
      assert.equal(reward.coins,difficulty==='HELL'?'300000000000000':'100000000000000');
      assert.equal(reward.masterStars,difficulty==='HELL'?'2500000000':'1000000000');
    }
    assert.deepEqual((await poll(h,roomId)).body.state.reward,reward);
  }
  const coinLedger=await h.one('SELECT count(*)::int n,sum(change_amount)::text total FROM coin_logs WHERE user_id=1 AND change_amount>0');
  assert.deepEqual(coinLedger,{n:3,total:'500000000000000'});
  assert.deepEqual(await h.one("SELECT quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'"),{quantity:'4500000000',unseen_quantity:'4500000000'});
  assert.deepEqual(await h.one("SELECT count(*)::int n,sum(change_amount)::text total FROM inventory_logs WHERE user_id=1 AND item_code='MASTER_STAR'"),{n:3,total:'4500000000'});
  assert.deepEqual(await h.one("SELECT quantity::int,unseen_quantity::int FROM cnine_user_inventory WHERE user_id=1 AND item_code='RYUJIN_NECKLACE'"),{quantity:3,unseen_quantity:3});
  assert.equal((await honor(h,1)).progress,4);
  assert.equal((await h.call('feature?weekly=1',{user:4})).body.weeklyReward.used,0);
  const {weeklyReward}= (await h.call('feature?weekly=1')).body;
  assert.equal(weeklyReward.weekKey,'2026-11-16');
  assert.equal(weeklyReward.remaining,0);

  t.mock.timers.setTime(Date.parse('2026-11-22T15:00:00Z'));
  const nextWeek=(await h.call('feature?weekly=1')).body.weeklyReward;
  assert.equal(nextWeek.weekKey,'2026-11-23');
  assert.equal(nextWeek.remaining,3);
  const roomId=await start(h,3,'HELL');
  await finalHit(h,roomId);
  const nextReward=(await poll(h,roomId)).body.state.reward;
  assert.equal(nextReward.status,'PAID');
  assert.equal(nextReward.weekly.used,1);
  assert.equal(nextReward.ryujinMaterialDrop.quantity,1);
  assert.equal((await h.one("SELECT quantity::text FROM cnine_user_inventory WHERE user_id=1 AND item_code='MASTER_STAR'")).quantity,'7000000000');
});

test('old Frostmourne dates and CMS bonuses survive the goal reduction; existing settings gain only a zero-rate Nox trophy',()=>{
  const at='2026-10-30T08:00:00.000Z';
  assert.equal(lichMilestoneValue(JSON.stringify({count:200,lastAt:at,acquiredAt:null})).acquiredAt,at);
  assert.equal(lichMilestoneValue(JSON.stringify({count:350,lastAt:at,acquiredAt:null})).acquiredAt,null);
  assert.equal(lichMilestoneValue(JSON.stringify({count:1001,lastAt:'2026-11-01',acquiredAt:at})).acquiredAt,at);
  assert.throws(()=>lichMilestoneValue('{"count":-1}'));
  const all=emptyTrophyBonuses(),old={...all,trophies:all.trophies.filter(t=>t.code!=='NOX_CLEAR_30')};
  old.trophies.find(t=>t.code==='LICH_KING_CLEAR_1000').rewardBonuses.coinPercent=2;
  const normalized=validateTrophyBonuses(old,{allowLegacy:true});
  assert.deepEqual(normalized.trophies.filter(t=>t.code!=='NOX_CLEAR_30'),old.trophies);
  assert.deepEqual(normalized.trophies.find(t=>t.code==='NOX_CLEAR_30').rewardBonuses,{coinPercent:0,accountXpPercent:0,dropPercent:0});
  assert.throws(()=>validateTrophyBonuses(old));
  assert.match(TROPHY_CATALOG.find(t=>t.code==='LICH_KING_CLEAR_1000').subtitle,/200회/);
  assert.match(TROPHY_CATALOG.find(t=>t.code==='NOX_CLEAR_30').subtitle,/종언의 주파수 클리어 30회/);
});

test('the Nox shelf references the transparent runtime art and keeps the generated source out of the delivery bundle',async()=>{
  const definition=TROPHY_CATALOG.find(t=>t.code==='NOX_CLEAR_30');
  const dir=definition.art.slice(1,definition.art.lastIndexOf('/')+1);
  const bytes=name=>readCommittedAssetSync(new URL('../'+dir+name,import.meta.url));
  const manifest=JSON.parse(bytes('manifest.json')),hash=data=>createHash('sha256').update(data).digest('hex');
  assert.equal('/'+dir+manifest.runtime,definition.art);
  const runtime=bytes(manifest.runtime),meta=await sharp(runtime).metadata();
  assert.equal(hash(runtime),manifest.runtimeSha256);assert.equal(hash(bytes(manifest.original)),manifest.originalSha256);
  assert.deepEqual([meta.width,meta.height,meta.hasAlpha],[512,512,true]);assert(!(await sharp(runtime).stats()).isOpaque);
  assert(runtime.length<100000);assert(isProductionFile(dir+manifest.runtime));
  for(const file of [manifest.original,'manifest.json','prompts.json'])assert(!isProductionFile(dir+file));
});
