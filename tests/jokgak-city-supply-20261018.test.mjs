import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityAction,cityStatus} from '../functions/_jokgak_city.js';
import {readCitySettings} from '../functions/_jokgak_city_settings.js';
import {processCitySupply,citySupplyDropKey,citySupplyPlanKey} from '../functions/_jokgak_city_supply.js';
import {createCitySupplyPlan,CITY_SUPPLY_DURATION_MS,CITY_SUPPLY_WEAPONS} from '../shared/jokgak-city-supply-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {cityLifeKey,readCityLife} from '../shared/jokgak-city-life-v1.mjs';
import {citySearchPool} from '../shared/jokgak-city-exploration-v1.mjs';
import {buildCityTeam} from '../functions/_jokgak_city_battle.js';

const supply=async f=>processCitySupply(f.env,{now:f.now});
const stored=async(f,id)=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',citySupplyDropKey(id)).first()).value);
const bag=async(f,id,mode='ON')=>readCityLife((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value,f.now).armory[mode];
async function start(t,pg){
  const f=await cityFixture(t,pg);f.setTime(cityShift(f.now).startsAt+60000);f.deps.citySupplyRandom=()=>0;
  await f.join(1,'POLICE');await f.join(2,'POLICE');await f.join(3,'POLICE');
  const s=await supply(f),d=s.records[0].drop;f.setTime(d.dropsAt+1000);return {...f,get now(){return f.now;},f,d};
}
test('supply plans contain exactly 2–3 nonoverlapping ten-minute contests and only approved weapons',()=>{
  const now=Date.parse('2026-10-18T00:00:00Z'),shift=cityShift(now);
  for(let i=0;i<200;i++){
    let n=i+1;const random=()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296),plan=createCitySupplyPlan(now,'ON',random);
    assert.ok([2,3].includes(plan.drops.length));
    for(const [j,d] of plan.drops.entries()){
      assert.equal(d.endsAt-d.dropsAt,CITY_SUPPLY_DURATION_MS);assert.ok(d.dropsAt>shift.startsAt&&d.endsAt<shift.endsAt);
      assert.ok(!['HOSPITAL','MOTEL'].includes(d.location));assert.ok(['GROZA','GOLDEN_AKS'].includes(d.weaponCode));
      if(j)assert.ok(plan.drops[j-1].endsAt<d.dropsAt);
    }
  }
  assert.deepEqual(CITY_SUPPLY_WEAPONS.map(w=>w.power),[700000,700000]);
});
test('first activation never backdates a drop and defers a nearly finished round',()=>{
  const start=cityShift(Date.parse('2026-10-18T03:00:00Z')).startsAt,now=start+3*3600000;
  const plan=createCitySupplyPlan(now,'ON',()=>.9);
  assert.equal(plan.drops.length,3);assert.ok(plan.drops.every(d=>d.dropsAt>now&&d.endsAt<start+6*3600000));
  assert.equal(createCitySupplyPlan(start+5*3600000+15*60000,'ON',()=>.9).drops.length,2);
  assert.equal(createCitySupplyPlan(start+5*3600000+30*60000,'ON',()=>.9).drops.length,0);
});
for(const pg of [false,true]){
 const engine=pg?'postgres':'sqlite';
 test(engine+': schedule persists, future locations/rewards stay private, claim and retry are atomic',async t=>{
   const {f,d}=await start(t,pg);f.setTime(d.dropsAt-1);
   const before=await supply(f),again=await supply(f);assert.deepEqual(before.records,again.records);assert.equal(before.world.drops.length,0);assert.equal(before.world.notices.length,0);
   f.setTime(d.dropsAt+1000);const world=(await supply(f)).world;assert.equal(world.drops.length,1);assert.equal(world.notices[0].kind,'DROP');assert.ok(!('weaponCode' in world.drops[0]));assert.ok(!world.drops[0].weapon);
   await f.p("UPDATE jokgak_city_players_v1 SET location='HOME' WHERE user_id=1").run();
   await assert.rejects(f.action(1,'claimSupply',{dropId:d.id}),/낙하 지점/);await f.p("UPDATE jokgak_city_players_v1 SET location='POLICE' WHERE user_id=1").run();
   const requestId=crypto.randomUUID(),result=await f.action(1,'claimSupply',{dropId:d.id,requestId});assert.equal(result.supply.kind,'CLAIMED');
   const retry=await f.action(1,'claimSupply',{dropId:d.id,requestId});assert.ok(retry.replayed);assert.equal((await stored(f,d.id)).holder.userId,1);
   await assert.rejects(f.action(2,'claimSupply',{dropId:d.id}),/보유자/);assert.deepEqual((await bag(f,1)).owned,[]);
   await assert.rejects(f.action(2,'attackSupply',{dropId:d.id,targetId:3}),/보유자/);
 });
 test(engine+': victory steals ownership, draw/defeat preserve it, deadline never resets, no ordinary cash reward',async t=>{
   const {f,d}=await start(t,pg);await f.action(1,'claimSupply',{dropId:d.id});
   const taken=await f.action(2,'attackSupply',{dropId:d.id,targetId:1});assert.equal(taken.supply.kind,'TAKEN');assert.equal(taken.supply.holder.userId,2);assert.equal(taken.supply.endsAt,d.endsAt);assert.equal(taken.theft,null);assert.equal(taken.reward.status,'NONE');assert.equal(taken.bounty,null);
   const count=await f.p("SELECT COUNT(*) AS n FROM jokgak_city_actions_v1 WHERE action='attack'").first();assert.equal(Number(count.n),0);
   const old=await stored(f,d.id);assert.equal(old.holder.userId,2);f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner:'DRAW'}}});
   await f.action(3,'attackSupply',{dropId:d.id,targetId:2});assert.equal((await stored(f,d.id)).holder.userId,2);
   f.advance(40000);f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner:'B'}}});
   const loss=await f.action(3,'attackSupply',{dropId:d.id,targetId:2});assert.equal(loss.supply.kind,'DEFENDED');assert.equal((await stored(f,d.id)).endsAt,d.endsAt);
   assert.deepEqual((await bag(f,2)).owned,[]);
 });
 test(engine+': offline final holder receives one weapon once, equips at 700k, market/search excluded, round clears',async t=>{
   const {f,d}=await start(t,pg);await f.action(1,'claimSupply',{dropId:d.id});f.setTime(d.endsAt+1000);
   const done=await supply(f);assert.equal(done.world.drops[0].status,'AWARDED');assert.equal(done.world.drops[0].winner.userId,1);
   await supply(f);assert.deepEqual((await bag(f,1)).owned,[d.weaponCode]);assert.deepEqual((await bag(f,2)).owned,[]);
   const receipts=await f.p("SELECT COUNT(*) AS n FROM jokgak_city_actions_v1 WHERE action='rewardSupply'").first();assert.equal(Number(receipts.n),1);
   const eq=await f.action(1,'equipWeapon',{product:d.weaponCode});assert.equal(eq.mine.weapon.power,700000);assert.equal(eq.mine.weapon.name,'그로자');
   const team=buildCityTeam(Array.from({length:5},(_,i)=>({id:String(i),power:999999999})),null,'A',eq.mine.cityPower,100000);assert.equal(team.length,5);assert.ok(team.every(u=>u.statMode==='CITY_NORMALIZED'));
   await f.p("UPDATE jokgak_city_players_v1 SET location='MARKET' WHERE user_id=1").run();await assert.rejects(f.action(1,'buyWeapon',{product:'GOLDEN_AKS'}),/보급상자/);
   const policy=(await readCitySettings(f.env)).policy;assert.ok(!citySearchPool(policy,'MARKET').drops.some(w=>['GROZA','GOLDEN_AKS'].includes(w.code)));
   f.setTime(cityShift(f.now).endsAt+1000);const status=await cityStatus(f.env,f.users.get(1),'MARKET',0,f.now);assert.equal(status.mine.active,false);assert.deepEqual(status.mine.ownedWeapons,[]);assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',citySupplyDropKey(d.id)).first()),null);
 });
 test(engine+': leaving, moving and a normal lethal attack drop the crate without granting a gun',async t=>{
   const {f,d}=await start(t,pg);await f.action(1,'claimSupply',{dropId:d.id});await f.action(1,'move',{location:'HOME'});assert.equal((await stored(f,d.id)).holder,null);
   await f.action(2,'claimSupply',{dropId:d.id});await f.action(2,'leave');assert.equal((await stored(f,d.id)).holder,null);
   await f.action(3,'claimSupply',{dropId:d.id});await f.p('UPDATE jokgak_city_players_v1 SET health=1,health_at=?,protected_until=0 WHERE user_id=3',f.now).run();await f.p("UPDATE jokgak_city_players_v1 SET location='POLICE',next_action_at=0 WHERE user_id=1").run();
   await f.action(1,'attack',{targetId:3});assert.equal((await stored(f,d.id)).holder,null);f.setTime(d.endsAt+1000);await supply(f);assert.equal((await stored(f,d.id)).status,'EXPIRED');assert.deepEqual((await bag(f,1)).owned,[]);
 });
 test(engine+': failed grant rolls back and lost response or concurrent settlement cannot duplicate',async t=>{
   const {f,d}=await start(t,pg);await f.action(1,'claimSupply',{dropId:d.id});f.setTime(d.endsAt+1000);f.fail('INSERT INTO jokgak_city_actions_v1');
   await assert.rejects(supply(f),/INJECTED_FAILURE/);f.fail('');assert.equal((await stored(f,d.id)).status,'OPEN');assert.deepEqual((await bag(f,1)).owned,[]);
   f.lost();await Promise.all([supply(f),supply(f)]);assert.deepEqual((await bag(f,1)).owned,[d.weaponCode]);assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM jokgak_city_actions_v1 WHERE action='rewardSupply'").first()).n),1);
 });
 test(engine+': a combat crossing ten-minute cutoff cannot steal from the final holder',async t=>{
   const {f,d}=await start(t,pg);await f.action(1,'claimSupply',{dropId:d.id});f.setTime(d.endsAt-1000);
   f.deps.prepareCityBattle=async()=>{f.advance(2000);return {battleV2:{result:{winner:'A'}}};};
   await assert.rejects(f.action(2,'attackSupply',{dropId:d.id,targetId:1}),/進行|진행|마감/);assert.equal((await stored(f,d.id)).holder.userId,1);assert.equal((await f.p('SELECT health FROM jokgak_city_players_v1 WHERE user_id=1').first()).health,100);
   await supply(f);assert.deepEqual((await bag(f,1)).owned,[d.weaponCode]);assert.deepEqual((await bag(f,2)).owned,[]);
 });
 test(engine+': two claimers race on one crate; replay cannot change its final owner',async t=>{
   const {f,d}=await start(t,pg),requestId=crypto.randomUUID();
   const result=await Promise.allSettled([f.action(1,'claimSupply',{dropId:d.id,requestId}),f.action(2,'claimSupply',{dropId:d.id})]);
   assert.equal(result.filter(r=>r.status==='fulfilled').length,1);const holder=(await stored(f,d.id)).holder.userId;assert.ok([1,2].includes(holder));
   assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM jokgak_city_actions_v1 WHERE action='claimSupply'").first()).n),1);
 });
 test(engine+': TEST/ON plans and weapons are isolated, OFF blocks claims and late grants',async t=>{
   const {f,d}=await start(t,pg);const {policy}=await readCitySettings(f.env);policy.mode='TEST';policy.testUserIds=[1,2];await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(policy),'jokgak_city_settings_v1').run();
   const testState=await supply(f),testDrop=testState.records[0].drop;assert.notEqual(testDrop.id,d.id);
   // Make the isolated TEST drop active in this fixture.
   testDrop.location='POLICE';testDrop.dropsAt=f.now-1000;testDrop.endsAt=f.now+600000;testDrop.weaponCode='GOLDEN_AKS';await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(testDrop),citySupplyDropKey(testDrop.id)).run();
   await assert.rejects(f.action(1,'claimSupply',{dropId:d.id}),/보급상자/);await assert.rejects(f.action(3,'claimSupply',{dropId:testDrop.id}),/TEST|테스트|참여|이용/);
   await f.action(1,'claimSupply',{dropId:testDrop.id});f.setTime(testDrop.endsAt+1);await supply(f);assert.deepEqual((await bag(f,1,'TEST')).owned,['GOLDEN_AKS']);assert.deepEqual((await bag(f,1,'ON')).owned,[]);
   policy.mode='OFF';await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(policy),'jokgak_city_settings_v1').run();assert.equal((await supply(f)).records.length,0);await assert.rejects(f.action(1,'claimSupply',{dropId:d.id}),/중지|이용/);
 });
 test(engine+': late first activation persists an empty plan, then schedules the next round',async t=>{
   const f=await cityFixture(t,pg);f.setTime(cityShift(f.now).endsAt-10*60000);f.deps.citySupplyRandom=()=>0;
   await f.join(1,'POLICE');assert.equal((await supply(f)).records.length,0);
   assert.ok(await f.p('SELECT value FROM app_meta WHERE key=?',citySupplyPlanKey(cityShift(f.now).id,'ON')).first());
   f.setTime(cityShift(f.now).endsAt+1000);
   await cityStatus(f.env,f.users.get(1),'POLICE',0,f.now); // Public entry settles the previous round before scheduling.
   assert.ok([2,3].includes((await supply(f)).records.length));
 });
}
