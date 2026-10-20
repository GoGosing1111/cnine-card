import test from 'node:test';
import assert from 'node:assert/strict';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
import {passFixture} from './helpers/supporter-pass-fixture.mjs';
import {SUPPORT_DURATION_MS} from '../shared/server-support-v1.mjs';

test('only the active ID 1 OWNER enters at zero energy and teammates still pay once',async()=>{
 const h=await cooperativeMiniflare();
 try{
  const cfg=(await h.request(1,'settings')).settings;cfg.mode='ON';assert.equal((await h.request(1,'settings',{settings:cfg})).status,200);
  await h.db.batch([{sql:"UPDATE users SET role='OWNER' WHERE id IN (1,2)"},{sql:'INSERT INTO app_meta(key,value) VALUES(?,?)',args:['coop_energy_v1:1',JSON.stringify({version:1,current:0,maximum:3,updatedAt:Date.now()})]}]);
  const zero=await h.request(1,'feature');assert.equal(zero.energy.current,0);assert.equal(zero.energy.unlimited,true);
  assert.equal((await h.request(2,'feature')).energy.unlimited,false,'another OWNER is not exempt');
  const before=await h.db.batch([{sql:"SELECT value FROM app_meta WHERE key='coop_energy_v1:1'"}]);
  let roomId;const command=(id,kind,extra={})=>h.request(id,kind,{roomId,clientId:'owner-energy-client-'+id,requestId:crypto.randomUUID(),...extra});
  // Exercise both hosting and joining with a zero balance.
  const hosted=await command(1,'create',{difficulty:'NORMAL'});assert.equal(hosted.status,200);roomId=hosted.roomId;await command(1,'leave');
  roomId=(await command(2,'create',{difficulty:'NORMAL'})).roomId;
  for(const id of [1,3])assert.equal((await command(id,'join')).status,200);
  const squads=coopSquads();
  for(const id of [2,3,1])assert.equal((await command(id,'ready',{cardIds:squads[id-1].cards.map(c=>c.id),mercenaryCode:squads[id-1].mercenary.code})).status,200);
  const current=await h.request(1,'current');assert.equal(current.state.status,'LOADING');assert.equal(current.state.energy.unlimited,true);assert.equal(current.state.energy.current,0);
  assert.equal((await command(1,'ticket')).status,200);
  for(const id of [2,3])assert.equal((await h.request(id,'feature')).energy.current,2);
  const after=await h.db.batch([{sql:"SELECT value FROM app_meta WHERE key='coop_energy_v1:1'"}]);assert.deepEqual(after[0].results,before[0].results,'OWNER balance is neither replenished nor debited');
  for(const id of [1,2,3])await command(id,'leave');
  await h.db.batch([{sql:"UPDATE users SET role='USER' WHERE id=1"}]);
  assert.equal((await command(1,'create',{difficulty:'NORMAL'})).code,'COOP_ENERGY_EMPTY','losing OWNER revokes the exception');
 }finally{await h.dispose();}
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: registered OWNER pass is usable without second verification; rewards stay once per date`,async()=>{
 const f=await passFixture({postgres});
 try{
  await f.run('DELETE FROM user_second_verifications WHERE user_id IN (1,3)');
  await f.save();
  await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)','server_support_v1:1',JSON.stringify({version:1,revision:1,startsAt:f.clock.now,endsAt:f.clock.now+SUPPORT_DURATION_MS,magnetPetCode:null,revokedAt:null}));
  assert.deepEqual((await f.call('server-support/status')).body,{visible:true,seasonPassVisible:true});
  const info=(await f.call('server-support/info')).body;assert.equal(info.previewOnly,false);assert.equal(info.subscription.active,true);assert.equal(info.seasonPass.days[0].status,'AVAILABLE');
  assert.equal(info.packageVisible,false,'pass exception does not advertise a paid package requiring verification');assert.equal(info.application.enabled,false);
  const body={cycle:info.seasonPass.cycle,day:1,expectedRevision:info.seasonPass.revision};
  assert.equal((await f.claim(body,1)).status,200);assert.equal((await f.claim(body,1)).body.replayed,true);
  assert.equal(Number((await f.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code=?','VEHICLE_PART_FRAME')).quantity),3);
  assert.equal(await f.one('SELECT * FROM user_second_verifications WHERE user_id=1'),null);
  assert.equal((await f.call('server-support/status',{user:3})).body.seasonPassVisible,false);
  assert.equal((await f.call('server-support/status',{user:5})).body.seasonPassVisible,false);
  await f.run("UPDATE users SET role='USER' WHERE id=1");assert.equal((await f.call('server-support/status')).body.visible,false);
  await f.run("UPDATE users SET role='OWNER',status='SUSPENDED' WHERE id=1");assert.equal((await f.call('server-support/status')).body.visible,false);
 }finally{await f.close();}
});
