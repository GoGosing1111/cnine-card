import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sealStarFixture} from './helpers/seal-star-fixture.mjs';
import {publishSealStars,inspectSealStars,SEAL_STAR_EVENT} from '../scripts/ops/seal-master-star-20260925.mjs';

for(const dialect of ['sqlite','postgres']){
 test(`${dialect}: seal success grants 200,000 stars with coins once, requires minimum attempts, and preserves round snapshots`,async()=>{
  const f=await sealStarFixture(dialect);try{
   assert.equal(f.event.clearReward.masterStar,200000);
   const claim=()=>f.request('seal-battle/clear-reward',{eventId:f.event.id},'USER');
   assert.equal((await claim()).status,409);
   await f.run("UPDATE seal_battle_events SET status='FAILED' WHERE id=?",f.event.id);assert.equal((await claim()).status,409);
   await f.run("UPDATE seal_battle_events SET status='CLEARED' WHERE id=?",f.event.id);
   await f.run('UPDATE seal_battle_user_progress SET total_attempts=19');assert.equal((await claim()).status,403);
   await f.run('UPDATE seal_battle_user_progress SET total_attempts=20');
   await f.request('admin/seal-battle/settings',{clearReward:{masterStar:300000}});
   const saved=await f.api.loadSettings(f.env);assert.equal(saved.clearReward.masterStar,300000);assert.equal(saved.clearReward.coin,5000000000);
   const before=await f.api.statusPayload(f.env,f.deps,f.user,saved);assert.equal(before.event.clearReward.masterStar,200000);
   const results=await Promise.all([claim(),claim()]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.find(r=>r.status===200).body.reward.masterStar,200000);
   assert.equal((await claim()).status,409);assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=2')).coin),5000001000);
   const inv=await f.row("SELECT * FROM cnine_user_inventory WHERE user_id=2 AND item_code='MASTER_STAR'");assert.equal(Number(inv.quantity),200000);assert.equal(Number(inv.unseen_quantity),200000);
   const log=await f.row('SELECT * FROM inventory_logs');assert.equal(Number(log.change_amount),200000);assert.equal(log.reference_id,f.event.eventKey);
   assert.equal((await f.row('SELECT status FROM seal_battle_clear_claims')).status,'COMPLETED');
   const next=await f.api.adminStart(f.env,saved,f.owner);assert.equal(next.clearReward.masterStar,300000);
   // Previously opened CMS clients preserve the new value when saving old fields.
   assert.equal((await f.request('admin/seal-battle/settings',{clearReward:{coin:6000000000,shards:0}})).body.settings.clearReward.masterStar,300000);
   assert.equal((await f.request('admin/seal-battle/settings',{clearReward:{masterStar:200000}},'USER')).status,403);
   for(const masterStar of [-1,.5,1000001,'x'])assert.equal((await f.request('admin/seal-battle/settings',{clearReward:{masterStar}})).status,400);
   assert.equal((await f.request('admin/seal-battle/settings',{clearReward:{masterStar:0}})).body.settings.clearReward.masterStar,0);
  }finally{await f.close();}
 });
 test(`${dialect}: item/log failure rolls back all rewards; retry and uncertain commit never duplicate stars`,async()=>{
  const f=await sealStarFixture(dialect);try{
   await f.run("UPDATE seal_battle_events SET status='CLEARED'");const claim=()=>f.request('seal-battle/clear-reward',{eventId:f.event.id},'USER');
   f.fail('INSERT INTO inventory_logs');assert.equal((await claim()).status,500);f.fail('');
   assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=2')).coin),1000);assert.equal(await f.row("SELECT * FROM cnine_user_inventory WHERE item_code='MASTER_STAR'"),null);
   assert.equal((await f.row('SELECT status FROM seal_battle_clear_claims')).status,'PENDING');
   f.loseReply();assert.equal((await claim()).status,500);assert.equal((await claim()).status,409);
   assert.equal(Number((await f.row("SELECT quantity FROM cnine_user_inventory WHERE item_code='MASTER_STAR'")).quantity),200000);
   assert.equal(Number((await f.row('SELECT COUNT(*) n FROM inventory_logs')).n),1);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),1);
  }finally{await f.close();}
 });
}

test('legacy initialization adds an independent star snapshot table and leaves past rounds and CMS untouched',async()=>{
 const f=await sealStarFixture('postgres');try{
  await f.pg.exec("DROP TABLE seal_battle_clear_rewards_v20260925; DELETE FROM app_meta WHERE key='seal_master_star_schema_20260925_v1';");
  const before=(await f.row("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'")).value;
  await f.api.ensureMasterStarSchema(f.env,f.deps);await f.api.ensureMasterStarSchema(f.env,f.deps);
  assert.equal(await f.row('SELECT * FROM seal_battle_clear_rewards_v20260925'),null);
  assert.equal((await f.row("SELECT value FROM app_meta WHERE key='seal_battle_settings_v1'")).value,before);
  await f.run("UPDATE seal_battle_events SET status='CLEARED'");
  const next=await f.api.adminStart(f.env,f.settings,f.owner);const payload=await f.api.statusPayload(f.env,f.deps,f.user,f.settings);
  assert.equal(payload.pendingClearReward.eventId,f.event.id);assert.equal(payload.pendingClearReward.reward.masterStar,0);assert.equal(next.clearReward.masterStar,200000);
 }finally{await f.close();}
});

test('seal player/CMS star quantities and refreshed loaders remain connected',()=>{
 const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
 assert.match(read('admin/seal-battle-admin.js'),/id="sealClearMasterStar"/);
 assert.match(read('js/seal-battle.js'),/pendingClearReward\.reward\.masterStar/);
 for(const file of ['index.html','admin/index.html'])assert.match(read(file),/seal-battle(?:-admin)?\.js\?[^"\n]*masterStar=20260925/);
});

test('current round publication: only 49 plus CMS change, dry run and failure roll back, retry preserves later operator edits',async()=>{
 const f=await sealStarFixture('postgres');try{
  await f.run('UPDATE seal_battle_events SET id=49,event_key=?',SEAL_STAR_EVENT);
  const before=(await inspectSealStars(f.client)).settings;delete before.clearReward.masterStar;
  await f.run("UPDATE app_meta SET value=? WHERE key='seal_battle_settings_v1'",JSON.stringify(before));
  const coin=Number((await f.row('SELECT coin FROM users WHERE id=2')).coin);
  assert.equal((await publishSealStars(f.client)).committed,false);assert.equal((await inspectSealStars(f.client)).receipt,null);assert.equal(Number((await inspectSealStars(f.client)).event.clear_master_star),0);
  const failing={query:(sql,args)=>{if(sql.startsWith('INSERT INTO admin_logs'))throw Error('AUDIT_FAILURE');return f.client.query(sql,args);}};
  await assert.rejects(publishSealStars(failing,{commit:true}),/AUDIT_FAILURE/);assert.equal(Number((await inspectSealStars(f.client)).event.clear_master_star),0);
  const applied=await publishSealStars(f.client,{commit:true});assert.equal(applied.masterStar,200000);assert.equal(applied.accountGrants,0);
  const result=await inspectSealStars(f.client);assert.equal(result.settings.clearReward.masterStar,200000);delete result.settings.clearReward.masterStar;assert.deepEqual(result.settings,before);
  assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=2')).coin),coin);assert.equal(await f.row('SELECT * FROM inventory_logs'),null);
  await f.request('admin/seal-battle/settings',{clearReward:{masterStar:300000}});
  assert.equal((await publishSealStars(f.client,{commit:true})).replayed,true);assert.equal((await inspectSealStars(f.client)).settings.clearReward.masterStar,300000);
 }finally{await f.close();}
});
