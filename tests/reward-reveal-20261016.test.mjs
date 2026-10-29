import test from 'node:test';
import assert from 'node:assert/strict';
import {coreRewardFixture} from './helpers/core-reward-fixture.mjs';
import {CORE_REWARD_DEFAULT,validateCoreRewardPolicy,drawCoreRewards} from '../shared/core-raid-reward-policy-v1.mjs';
import {REWARD_REVEAL_CONTENTS} from '../shared/reward-reveal-contents-v1.mjs';
import {handleRewardReveal,readRewardRevealPolicy,prepareRewardRevealContext,prepareRewardRevealOffer,claimRewardReveal} from '../functions/_reward_reveal.js';
import {settleCoopRewards} from '../functions/_cooperative_rewards.js';
import {coopEnergy,spendCoopEnergy} from '../functions/_cooperative_energy.js';
import {defaultCoopRewards,freezeCoopReward,COOP_SETTINGS_KEY} from '../shared/cooperative-rewards-v1.mjs';
import {prepareMadaraRewards} from '../functions/_raid_madara_rewards.js';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {readyLichClear} from './helpers/lich-clear-fixture.mjs';

const policy=()=>({...structuredClone(CORE_REWARD_DEFAULT),enabled:true,minimum:{rewardType:'COIN',quantity:5,weight:1}});
const setPolicy=(f,content,p=policy())=>f.run('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','reward_reveal_policy_v1:'+content,JSON.stringify(p));
async function request(f,path,body,{id=1,role='OWNER',origin='https://qa.invalid'}={}){
 const response=await handleRewardReveal({path:path.split('?')[0],env:f.env,request:new Request('https://qa.invalid/api/'+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),deps:{authenticate:async()=>id?{id,role}:null,json:(body,status=200,headers={})=>Response.json(body,{status,headers}),withUserMutationLock:async(_e,_u,_p,work)=>work()}});
 return {status:response.status,...await response.json()};
}
async function offer(f,type='COIN',ref='',quantity=5,content='COOP_NORMAL'){
 await setPolicy(f,content);const context=await prepareRewardRevealContext(f.env,content,policy(),true);
 const prepared=prepareRewardRevealOffer(f.env,context,{userId:1,roomId:crypto.randomUUID(),baseReward:{coin:100},quota:{period:'day',used:1,remaining:2,limit:3},finishedAt:Date.now()});
 await f.env.DB.batch([...context.statements,...prepared.statements]);
 const key='reward_reveal_offer_v1:1:'+prepared.offer.offerId,row=await f.row('SELECT value FROM app_meta WHERE key=?',key),privateOffer=JSON.parse(row.value);
 privateOffer.choices=Array.from({length:3},()=>({rewardType:type,rewardRef:ref,quantity}));await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(privateOffer),key);
 return prepared.offer;
}
test('seven independent destinations; vehicle bounds and explicit probabilities',()=>{
 assert.deepEqual(REWARD_REVEAL_CONTENTS.map(c=>c.id),['CORE','LICH','MADARA','BLACKWING','COOP_NORMAL','COOP_HARD','COOP_EXTREME']);
 const p=policy();p.entries=[{rewardType:'VEHICLE',rewardRef:'1',quantity:1,weight:3,enabled:true}];
 assert.equal(drawCoreRewards(p,()=>3)[0].rewardType,'VEHICLE');assert.equal(drawCoreRewards(p,()=>0)[0].rewardType,'COIN');
 for(const patch of [{quantity:2},{rewardRef:'NaN'},{rewardRef:'-1'},{weight:0}])assert.throws(()=>validateCoreRewardPolicy({...p,entries:[{...p.entries[0],...patch}]}));
});
for(const dialect of ['sqlite','postgres']){
 test(`${dialect}: independent OWNER CMS, catalog, CAS and idempotent saves`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());
  assert.equal((await request(f,'admin/reward-reveal',null,{role:'USER'})).status,403);
  assert.equal((await request(f,'admin/reward-reveal',null,{id:0})).status,401);
  await f.run("INSERT INTO character_garage_items VALUES(1,'검수 차량','MYTHIC','',0,1,1),(2,'비공개 차량','MYTHIC','',1,1,0)");
  const initial=await request(f,'admin/reward-reveal');assert.equal(initial.status,200);assert.equal(initial.catalog.VEHICLE.length,1);assert.equal(initial.policies.LICH.enabled,false);assert.equal(initial.policies.LICH.minimum.quantity,null);
  const body={content:'LICH',requestId:crypto.randomUUID(),policy:policy()};assert.equal((await request(f,'admin/reward-reveal',body)).policy.revision,1);
  assert.equal((await request(f,'admin/reward-reveal',body)).replayed,true);
  assert.equal((await request(f,'admin/reward-reveal',{...body,requestId:crypto.randomUUID()})).status,409);
  assert.equal((await readRewardRevealPolicy(f.env,'MADARA')).enabled,false);
  assert.equal((await readRewardRevealPolicy(f.env,'CORE')).minimum.quantity,2,'existing core values are preserved');
  assert.equal((await request(f,'admin/reward-reveal',{...body,content:'UNKNOWN'})).status,400);
  assert.equal((await request(f,'admin/reward-reveal',body,{origin:'https://outside.invalid'})).status,403);
  const vehiclePolicy={...policy(),entries:[{rewardType:'VEHICLE',rewardRef:'1',quantity:1,weight:1,enabled:true}]};
  const vehicleSaved=await request(f,'admin/reward-reveal',{content:'MADARA',requestId:crypto.randomUUID(),policy:vehiclePolicy});assert.equal(vehicleSaved.status,200);
  await f.run('UPDATE character_garage_items SET is_active=0 WHERE id=1');
  const disabled=await request(f,'admin/reward-reveal',{content:'MADARA',requestId:crypto.randomUUID(),policy:{...vehicleSaved.policy,enabled:false}});
  assert.equal(disabled.status,200,'an unavailable candidate must not prevent turning OFF');assert.equal(disabled.policy.enabled,false);
 });
 test(`${dialect}: sealed choices, all eight grant destinations, replay and duplicate vehicles`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());await f.run("INSERT INTO character_garage_items VALUES(1,'검수 차량','MYTHIC','',0,1,1)");
  for(const [type,ref,qty]of [['COIN','',5],['MASTER_STAR','MASTER_STAR',3],['CARD_SHARDS','',4],['MAGIC_CRYSTAL','',6],['INVENTORY_ITEM','MAT',7],['MERCENARY','V-021',1],['EQUIPMENT','1',2],['VEHICLE','1',1]]){
   const o=await offer(f,type,ref,qty),opened=await request(f,'rewards/reveal/open?offerId='+o.offerId);
   assert.equal(opened.status,200);assert.deepEqual(opened.offer.slots,[0,1,2]);assert.equal('choices' in opened.offer,false);assert.equal('minimum' in opened.offer,false);
   assert.equal((await request(f,'rewards/reveal/open?offerId='+o.offerId,null,{id:2})).status,404);
   const paid=await claimRewardReveal(f.env,{id:1},{offerId:o.offerId,selectedIndex:1});assert.equal(paid.choiceReward.rewardType,type);assert.equal(paid.choiceReward.quantity,qty);
   assert.deepEqual(await claimRewardReveal(f.env,{id:1},{offerId:o.offerId,selectedIndex:0}),paid);
  }
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_equipment_instances')).n),2);
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_garage_vehicles')).n),1);
  assert.equal((await request(f,'rewards/reveal/pending')).offers.length,0);
  const o=await offer(f,'VEHICLE','1',1),duplicate=await claimRewardReveal(f.env,{id:1},{offerId:o.offerId,selectedIndex:0});assert.equal(duplicate.choiceReward.rewardType,'COIN');assert.equal(duplicate.choiceReward.converted,true);
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_garage_vehicles')).n),1);
 });
 test(`${dialect}: failed grants preserve slot, atomic ledgers, pending inbox and lost acknowledgement`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());const o=await offer(f,'INVENTORY_ITEM','MAT',7);
  f.fail('INSERT INTO inventory_logs');await assert.rejects(claimRewardReveal(f.env,{id:1},{offerId:o.offerId,selectedIndex:2}));f.fail('');
  assert.equal(await f.row("SELECT quantity FROM cnine_user_inventory WHERE item_code='MAT'"),null);
  assert.equal((await request(f,'rewards/reveal/pending')).offers.length,1);
  assert.equal((await request(f,'rewards/reveal/open?offerId='+o.offerId)).offer.selectedIndex,2);
  await assert.rejects(claimRewardReveal(f.env,{id:1},{offerId:o.offerId,selectedIndex:1}));
  f.loseCommit();const result=await claimRewardReveal(f.env,{id:1},{offerId:o.offerId,selectedIndex:2});assert.equal(result.choiceReward.quantity,7);
  assert.equal(Number((await f.row("SELECT quantity FROM cnine_user_inventory WHERE item_code='MAT'")).quantity),7);
  assert.equal((await request(f,'rewards/reveal/pending')).offers.length,0);
 });
 test(`${dialect}: cooperative clear snapshots offers with its energy entry and OFF/TEST prevents new offers`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());const rewards=defaultCoopRewards(),cfg={mode:'ON',revision:1,rewards};
  if(dialect==='postgres')await f.db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
  else await f.run("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
  await f.run("UPDATE users SET role='USER' WHERE id=1"); // This case exercises ordinary paid energy, not the ID 1 OWNER exception.
  await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)',COOP_SETTINGS_KEY,JSON.stringify(cfg));await setPolicy(f,'COOP_NORMAL');
  await f.run("INSERT INTO users(id,nickname,role) VALUES(3,'세 번째 분대','USER')");
  const at=Date.now();
  const make=(n,mode='ON')=>({id:String(n).padStart(10,'0'),createdAt:at-10000,finishedAt:at+1000,creationRequest:'choice-test-'+n,status:'VICTORY',difficulty:'NORMAL',members:[1,2,3].map(id=>({id,result:'VICTORY'})),rewardPolicy:{...freezeCoopReward({...cfg,mode},'NORMAL'),revealPolicy:policy()}});
  const room=make(1);await spendCoopEnergy(f.env,room,at);
  const first=await settleCoopRewards(f.env,room);assert.ok(first[1].choiceOffer);assert.equal(first[1].coin,0);assert.equal((await coopEnergy(f.env,1,at)).current,2);
  assert.deepEqual(await settleCoopRewards(f.env,room),first);assert.equal((await request(f,'rewards/reveal/pending')).offers.length,1);
  await claimRewardReveal(f.env,{id:1},{offerId:first[1].choiceOffer.offerId,selectedIndex:0});assert.equal((await coopEnergy(f.env,1,at)).current,2,'selection must not consume a second charge');
  for(const n of [2,3]){const r=make(n);await spendCoopEnergy(f.env,r,at);await settleCoopRewards(f.env,r);}
  await assert.rejects(spendCoopEnergy(f.env,make(4),at),{code:'COOP_ENERGY_EMPTY'});
  assert.equal((await settleCoopRewards(f.env,make(5,'TEST')))[1].granted,false);
  const next=make(6);next.finishedAt=at+10800001;await spendCoopEnergy(f.env,next,at+10800000);
  await setPolicy(f,'COOP_NORMAL',{...policy(),enabled:false});assert.equal((await settleCoopRewards(f.env,next))[1].granted,false);
 });
 test(`${dialect}: zero-row vehicle delivery cannot complete a receipt; simultaneous choices keep one slot`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());await f.run("INSERT INTO character_garage_items VALUES(1,'검수 차량','MYTHIC','',0,1,1)");
  const o=await offer(f,'VEHICLE','1',1),prepare=f.env.DB.prepare.bind(f.env.DB);
  f.env.DB.prepare=sql=>prepare(sql.startsWith('INSERT INTO user_garage_vehicles')?sql.replace('WHERE id=?','WHERE 1=0 AND id=?'):sql);
  await assert.rejects(claimRewardReveal(f.env,{id:1},{offerId:o.offerId,selectedIndex:0}));f.env.DB.prepare=prepare;
  assert.equal((await request(f,'rewards/reveal/open?offerId='+o.offerId)).offer.result,null);assert.equal((await request(f,'rewards/reveal/pending')).offers.length,1);
  await claimRewardReveal(f.env,{id:1},{offerId:o.offerId,selectedIndex:0});assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_garage_vehicles')).n),1);
  const next=await offer(f,'COIN','',5),before=Number((await f.row('SELECT coin FROM users WHERE id=1')).coin);
  await Promise.allSettled([0,1].map(selectedIndex=>claimRewardReveal(f.env,{id:1},{offerId:next.offerId,selectedIndex})));
  const saved=(await request(f,'rewards/reveal/open?offerId='+next.offerId)).offer;assert.ok(saved.result);assert.equal(saved.result.selectedIndex,saved.selectedIndex);assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),before+5);
 });
 test(`${dialect}: Barsen offers share the existing weekly quota and roll back together`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());await setPolicy(f,'MADARA');
  const make=n=>({id:'barsen-choice-'+n,status:'CLEAR',releaseMode:'ON',finishedAt:Date.now(),members:[{id:'1'},{id:'2'}],rewardPolicy:{enabled:false,coin:999,masterStars:0,petEssence:0,weeklyLimit:1},revealPolicy:policy()});
  const room=make(1),plan=await prepareMadaraRewards(f.env,{status:'ACTIVE'},room);f.fail('reward_reveal_pending_v1');
  // Fault at a late entitlement insert must roll back quota and all offers.
  f.fail('INSERT INTO app_meta');await assert.rejects(async()=>f.env.DB.batch(plan.statements));f.fail('');
  assert.equal((await request(f,'rewards/reveal/pending')).offers.length,0);await f.env.DB.batch(plan.statements);
  assert.ok(room.clearRewards['1'].choiceOffer);assert.equal(room.clearRewards['1'].coin,0);assert.equal(room.clearRewards['1'].weeklyReward.used,1);
  const next=make(2);await f.env.DB.batch((await prepareMadaraRewards(f.env,{status:'ACTIVE'},next)).statements);assert.equal(next.clearRewards['1'].status,'WEEKLY_LIMIT');
 });
}
for(const postgres of [false,true])test(`Isgen real final strike persists selection entitlement with weekly rewards (${postgres?'PostgreSQL':'SQLite'})`,async t=>{
 const h=await lichLiveFixture({postgres});t.after(()=>h.close());await setPolicy(h,'LICH');const {roomId,body}=await readyLichClear(h);
 const clear=await h.call('action',{body});assert.equal(clear.status,200,JSON.stringify(clear.body));assert.ok(clear.body.state.clearReward.choiceOffer);
 const first=clear.body.state.clearReward.choiceOffer.offerId;assert.equal((await h.call('action',{body})).body.state.clearReward.choiceOffer.offerId,first);
 const pending=await h.all("SELECT key FROM app_meta WHERE key LIKE 'reward_reveal_pending_v1:%'");assert.equal(pending.length,3);assert.equal(clear.body.state.clearReward.weeklyReward.used,1);
});
