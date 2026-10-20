import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityStatus} from '../functions/_jokgak_city.js';
import {processCitySupply,citySupplyDropKey,citySupplyPlanKey} from '../functions/_jokgak_city_supply.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {cityLifeKey,readCityLife} from '../shared/jokgak-city-life-v1.mjs';
import {cityArmory} from '../shared/jokgak-city-expansion-v1.mjs';
import {CITY_SUPPLY_WEAPON_DURATION_MS,citySupplyWeaponExpiresAt} from '../shared/jokgak-city-supply-v1.mjs';

const sync=f=>processCitySupply(f.env,{now:f.now});
const read=async(f,id=1)=>readCityLife((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value,f.now);
const save=(f,life,id=1)=>f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(life),cityLifeKey(id)).run();
async function start(t,pg,weapon='GROZA'){
  const f=await cityFixture(t,pg);f.setTime(cityShift(f.now).startsAt+60000);f.deps.citySupplyRandom=()=>0;
  await f.join(1,'POLICE');await f.join(2,'POLICE');
  const d=(await sync(f)).records[0].drop;d.weaponCode=weapon;
  await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(d),citySupplyDropKey(d.id)).run();
  f.setTime(d.dropsAt+1000);await f.action(1,'claimSupply',{dropId:d.id});
  return {f,d,expiresAt:citySupplyWeaponExpiresAt(d.endsAt)};
}
async function awardNext(f,source,number,endsAt,weapon='GROZA',settleAt=endsAt){
  const d={...source,id:`${source.epoch}:${source.mode}:${number}`,number,weaponCode:weapon,dropsAt:endsAt-600000,endsAt,status:'OPEN',revision:0,holder:{userId:1,nickname:'참가자 1'},winner:null,settledAt:0};
  const key=citySupplyPlanKey(d.epoch,d.mode),plan=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',key).first()).value);
  plan.drops=plan.drops.filter(drop=>drop.id!==d.id);plan.drops.push(d);
  await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(plan),key).run();
  await f.p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',citySupplyDropKey(d.id),JSON.stringify(d)).run();
  f.setTime(settleAt);await sync(f);
  return JSON.parse((await f.p('SELECT result_json FROM jokgak_city_actions_v1 WHERE request_id=?','city-supply-award:'+d.id).first()).result_json);
}
test('supply weapons have 45 minutes, bounded by the existing round reset',()=>{
  assert.equal(CITY_SUPPLY_WEAPON_DURATION_MS,2700000);
  const at=Date.parse('2026-10-21T00:00:00Z'),end=cityShift(at).endsAt;
  assert.equal(citySupplyWeaponExpiresAt(at),at+2700000);
  assert.equal(citySupplyWeaponExpiresAt(end-1000),end);
});
for(const pg of [false,true]){
 const engine=pg?'postgres':'sqlite';
 test(engine+': both weapons expire exactly at 45 minutes, equipped or unequipped; ordinary equipment survives',async t=>{
   for(const code of ['GROZA','GOLDEN_AKS']){
     const {f,d,expiresAt}=await start(t,pg,code);f.setTime(d.endsAt);await sync(f);
     const life=await read(f);life.armory.ON.owned.push('RIFLE','SNIPER');life.exploration.ON.ownedArmor=['PLATE'];life.exploration.ON.equippedArmor='PLATE';await save(f,life);
     if(code==='GROZA')await f.action(1,'equipWeapon',{product:code});
     f.setTime(expiresAt-1);let state=await cityStatus(f.env,f.users.get(1),'POLICE',0,f.now);
     assert.ok(state.mine.ownedWeapons.includes(code));assert.equal(state.mine.supplyWeaponExpiresAt[code],expiresAt);
     if(code==='GROZA'){assert.equal(state.mine.weapon.power,700000);assert.equal(state.mine.weapon.expiresAt,expiresAt);}
     f.setTime(expiresAt);state=await cityStatus(f.env,f.users.get(1),'POLICE',0,f.now);
     assert.deepEqual(state.mine.ownedWeapons,['RIFLE','SNIPER']);assert.equal(state.mine.weapon.code,null);
     assert.equal(state.mine.armor.code,'PLATE');assert.deepEqual(state.mine.supplyWeaponExpiresAt,{});
     await assert.rejects(f.action(1,'equipWeapon',{product:code}),/보유한 무기/);
     assert.deepEqual((await read(f)).armory.ON.owned,['RIFLE','SNIPER']);
   }
 });
 test(engine+': legacy grants keep the original award time; expiry never resurrects on repeated sync',async t=>{
   const {f,d,expiresAt}=await start(t,pg);f.setTime(d.endsAt);await sync(f);
   let life=await read(f);delete life.armory.ON.supplyExpiresAt;life.armory.ON.equipped='GROZA';await save(f,life);
   f.setTime(expiresAt-60000);await sync(f);assert.equal((await read(f)).armory.ON.supplyExpiresAt.GROZA,expiresAt);
   life=await read(f);delete life.armory.ON.supplyExpiresAt;await save(f,life);
   f.setTime(expiresAt+1);await sync(f);await sync(f);
   assert.deepEqual((await read(f)).armory.ON.owned,[]);assert.equal((await read(f)).armory.ON.equipped,null);
   assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM jokgak_city_actions_v1 WHERE action='rewardSupply'").first()).n),1);
 });
 test(engine+': duplicates never extend the timer; a fresh drop after expiry starts a fresh lifetime',async t=>{
   const {f,d,expiresAt}=await start(t,pg);f.setTime(d.endsAt);await sync(f);
   const duplicate=await awardNext(f,d,2,d.endsAt+600000);
   assert.equal(duplicate.supply.duplicate,true);assert.equal(duplicate.supply.expiresAt,expiresAt);
   f.setTime(expiresAt);await sync(f);assert.deepEqual((await read(f)).armory.ON.owned,[]);
   const fresh=await awardNext(f,d,3,expiresAt+60000);
   assert.equal(fresh.supply.duplicate,false);assert.equal(fresh.supply.expiresAt,fresh.createdAt+2700000);
   const current=(await read(f)).armory.ON;await sync(f);assert.deepEqual((await read(f)).armory.ON,current);
 });
 test(engine+': offline expiry is atomic, retryable after failure/lost response and safe against concurrent sync',async t=>{
   const {f,d,expiresAt}=await start(t,pg);f.setTime(d.endsAt);await sync(f);await f.action(1,'equipWeapon',{product:'GROZA'});
   f.setTime(expiresAt);f.fail('UPDATE app_meta SET value');
   await assert.rejects(sync(f),/INJECTED_FAILURE/);f.fail('');
   assert.equal((await read(f)).armory.ON.equipped,'GROZA');
   f.lost();await sync(f);
   await Promise.all([sync(f),sync(f)]);
   assert.deepEqual((await read(f)).armory.ON.owned,[]);assert.equal((await read(f)).armory.ON.equipped,null);
   assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM jokgak_city_actions_v1 WHERE action='rewardSupply'").first()).n),1);
 });
 test(engine+': expiration removes combat power and a fight crossing the deadline cannot commit',async t=>{
   const {f,d,expiresAt}=await start(t,pg);f.setTime(d.endsAt);await sync(f);await f.action(1,'equipWeapon',{product:'GROZA'});
   f.setTime(expiresAt-1);const before=await f.p('SELECT health FROM jokgak_city_players_v1 WHERE user_id=2').first();
   f.deps.prepareCityBattle=async(_e,_d,_a,_b,{attacker})=>{assert.equal(attacker.weapon.power,700000);f.advance(1);return {battleV2:{result:{winner:'A'}}};};
   await assert.rejects(f.action(1,'attack',{targetId:2}),e=>e.code==='CITY_SUPPLY_WEAPON_EXPIRED');
   assert.equal((await f.p('SELECT health FROM jokgak_city_players_v1 WHERE user_id=2').first()).health,before.health);
   assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM jokgak_city_actions_v1 WHERE action='attack'").first()).n),0);
   f.deps.prepareCityBattle=async(_e,_d,_a,_b,{attacker})=>{assert.equal(attacker.weapon.code,null);assert.equal(attacker.weapon.power,100000);return {battleV2:{result:{winner:'A'}}};};
   const requestId=crypto.randomUUID(),result=await f.action(1,'attack',{targetId:2,requestId});
   assert.equal(result.mine.weapon.code,null);assert.ok((await f.action(1,'attack',{targetId:2,requestId})).replayed);
 });
 test(engine+': delayed settlement uses the contest deadline, not reconnect time',async t=>{
   const {f,d,expiresAt}=await start(t,pg);f.setTime(expiresAt+60000);await sync(f);
   const result=JSON.parse((await f.p('SELECT result_json FROM jokgak_city_actions_v1 WHERE request_id=?','city-supply-award:'+d.id).first()).result_json);
   assert.equal(result.supply.expiresAt,expiresAt);assert.equal(result.createdAt,d.endsAt);
   assert.deepEqual((await read(f)).armory.ON.owned,[]);await sync(f);assert.deepEqual((await read(f)).armory.ON.owned,[]);
 });
 test(engine+': a delayed duplicate keeps the original expiry even when settlement runs after it',async t=>{
   const {f,d,expiresAt}=await start(t,pg);f.setTime(d.endsAt);await sync(f);
   const duplicate=await awardNext(f,d,2,expiresAt-60000,'GROZA',expiresAt+60000);
   assert.equal(duplicate.supply.duplicate,true);assert.equal(duplicate.supply.expiresAt,expiresAt);
   assert.deepEqual((await read(f)).armory.ON.owned,[]);
 });
 test(engine+': mode inventories stay isolated, OFF does not mutate them, and expiry catches up on ON',async t=>{
   const {f,d,expiresAt}=await start(t,pg);f.setTime(d.endsAt);await sync(f);
   const life=await read(f);life.armory.TEST={owned:['GOLDEN_AKS'],equipped:'GOLDEN_AKS',supplyExpiresAt:{GOLDEN_AKS:expiresAt+600000}};await save(f,life);
   const raw=(await f.p("SELECT value FROM app_meta WHERE key='jokgak_city_settings_v1'").first()).value,policy=JSON.parse(raw);policy.mode='OFF';
   await f.p("UPDATE app_meta SET value=? WHERE key='jokgak_city_settings_v1'",JSON.stringify(policy)).run();
   f.setTime(expiresAt);await sync(f);assert.deepEqual((await read(f)).armory.ON.owned,['GROZA']);
   await f.p("UPDATE app_meta SET value=? WHERE key='jokgak_city_settings_v1'",raw).run();await sync(f);
   const after=await read(f);assert.deepEqual(after.armory.ON.owned,[]);assert.deepEqual(after.armory.TEST,life.armory.TEST);
   assert.equal(cityArmory(after,'TEST',expiresAt+600000).equipped,null);
 });
}
