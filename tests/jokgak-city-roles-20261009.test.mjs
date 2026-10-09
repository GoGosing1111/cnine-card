import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityAction,cityStatus,handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {defaultCitySettings,validateCitySettings} from '../shared/jokgak-city-settings-v1.mjs';
import {newCityLife,projectCityLife,cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
const owner={id:80,role:'OWNER'};
const life=async(f,id)=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);
const cash=async(f,id,mode='ON')=>(await life(f,id)).wallets[mode]?.balance;
const setLife=async(f,id,edit)=>{const v=await life(f,id);edit(v);await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(v),cityLifeKey(id)).run();};
const status=(f,id)=>cityStatus(f.env,f.users.get(id),'MARKET',0,f.now);
const body=(f,fields={})=>({requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,...fields});
const call=(f,id,action,b)=>cityAction(f.env,f.deps,f.users.get(id),action,b);
const reset=f=>f.p('UPDATE jokgak_city_players_v1 SET health=100,next_action_at=0,next_move_at=0,protected_until=0').run();
async function group(t,pg){const f=await cityFixture(t,pg),beg=f.roles.BEGGAR,donor=f.roles.CITIZEN,other=f.roles.DOCTOR;for(const id of [beg,donor,other])await f.join(id);return {f,beg,donor,other};}

test('full hunger depletes in exactly two active hours; inactive/dead time stays frozen',()=>{
  const p=defaultCitySettings(),at=Date.parse('2026-10-09T12:00:00Z');assert.equal(p.life.hungerPerHour,50);assert.equal(p.rules.targetProtectionMs,30000);
  const state=()=>({active:true,role:'CITIZEN',health:100,maxHealth:100,location:'MARKET',nextActionAt:0,protectedUntil:0});
  for(const [ms,value] of [[3600000,50],[7199999,1],[7200000,0]])assert.equal(projectCityLife(state(),newCityLife(at),at+ms,p).hunger,value);
  assert.equal(projectCityLife({...state(),active:false},newCityLife(at),at+7200000,p).hunger,100);
});
test('old role settings retain values and gain only the new skill defaults; invalid skill policy is rejected',()=>{
  const old=defaultCitySettings();for(const r of old.roles)for(const k of ['begEnabled','begCash','begCooldownMs','begDurationMs','killTheftBonusPercent','killTheftMaxCash'])delete r[k];old.roles[1].maxHealth=70;
  const p=validateCitySettings(old);assert.equal(p.roles[1].maxHealth,70);assert.equal(p.roles[1].begCash,100);assert.equal(p.roles[5].killTheftMaxCash,4000);
  for(const edit of [r=>r.begCash=-1,r=>r.begCooldownMs=20000,r=>r.begEnabled=1]){const copy=structuredClone(p);edit(copy.roles[1]);assert.throws(()=>validateCitySettings(copy));}
  p.roles[5].killTheftBonusPercent=101;assert.throws(()=>validateCitySettings(p));
});
for(const pg of [false,true]){
 const db=pg?'Postgres':'SQLite';
 test(db+': both beg skills notify only current residents, share cooldown, and decline/expiry/movement close offers',async t=>{
  const {f,beg,donor,other}=await group(t,pg);await f.p("UPDATE jokgak_city_players_v1 SET location='HOME' WHERE user_id=?",other).run();
  const result=await f.action(beg,'beg');assert.equal(result.mine.begging.cash,100);assert.equal((await status(f,donor)).beggingOffers.length,1);assert.equal((await status(f,other)).beggingOffers.length,0);await assert.rejects(f.action(beg,'alms'),/기다려/);
  const offer=(await status(f,donor)).beggingOffers[0];await f.p('UPDATE jokgak_city_notifications_v1 SET read_at=? WHERE id=?',f.now,offer.id).run();assert.equal((await status(f,donor)).beggingOffers.length,0);await assert.rejects(f.action(donor,'donate',{targetId:beg,offerId:result.requestId}),/응답/);assert.equal(await cash(f,donor),10000);
  f.advance(60000);const next=await f.action(beg,'alms');assert.equal((await status(f,donor)).beggingOffers[0].action,'alms');f.advance(30000);assert.equal((await status(f,donor)).beggingOffers.length,0);await assert.rejects(f.action(donor,'donate',{targetId:beg,offerId:next.requestId}),/끝났/);
  f.advance(30000);const moving=await f.action(beg,'beg');await f.action(beg,'move',{location:'HOME'});f.advance(3000);await f.action(beg,'move',{location:'MARKET'});assert.equal((await status(f,donor)).beggingOffers.length,0);await assert.rejects(f.action(donor,'donate',{targetId:beg,offerId:moving.requestId}),/끝났/);
 });
 test(db+': 100 won is donor-funded, accepted once per offer, atomic on failure and recoverable after lost commit',async t=>{
  const {f,beg,donor,other}=await group(t,pg);const request=await f.action(beg,'alms'),b=body(f,{targetId:beg,offerId:request.requestId});
  f.fail('INSERT INTO jokgak_city_notifications_v1');await assert.rejects(call(f,donor,'donate',b),/INJECTED/);assert.equal(await cash(f,beg),10000);assert.equal(await cash(f,donor),10000);assert.equal((await status(f,donor)).beggingOffers.length,1);
  f.fail('');f.lost();const result=await call(f,donor,'donate',b);assert.equal(result.replayed,true);assert.equal(result.donation.amount,100);assert.equal(await cash(f,beg),10100);assert.equal(await cash(f,donor),9900);assert.equal((await call(f,donor,'donate',b)).donation.amount,100);
  f.advance(5000);await assert.rejects(f.action(donor,'donate',{targetId:beg,offerId:request.requestId}),/응답/);await f.action(other,'donate',{targetId:beg,offerId:request.requestId});assert.equal(await cash(f,beg),10200);assert.equal(await cash(f,other),9900);
  const note=JSON.parse((await f.p("SELECT summary_json FROM jokgak_city_notifications_v1 WHERE user_id=? AND request_id=?",beg,b.requestId).first()).summary_json);assert.equal(note.action,'donate');assert.equal(note.donation.amount,100);assert.equal((await f.p('SELECT coin FROM users WHERE id=?',donor).first()).coin,123456);
 });
 test(db+': insufficient donor balance / simultaneous notification dismissal rolls back donation; fake requests cannot charge',async t=>{
  const {f,beg,donor}=await group(t,pg);const request=await f.action(beg,'beg');await assert.rejects(f.action(donor,'beg'),/거지/);await assert.rejects(f.action(beg,'donate',{targetId:beg,offerId:request.requestId}),/기다려|자신/);
  await setLife(f,donor,l=>l.wallets.ON.balance=99);await assert.rejects(f.action(donor,'donate',{targetId:beg,offerId:request.requestId}),/부족/);assert.equal(await cash(f,beg),10000);await setLife(f,donor,l=>l.wallets.ON.balance=10000);
  const batch=f.env.DB.batch.bind(f.env.DB);let raced=false;f.env.DB.batch=async statements=>{if(!raced){raced=true;await f.p('UPDATE jokgak_city_notifications_v1 SET read_at=? WHERE id=?',f.now,request.requestId+':b:'+donor).run();}return batch(statements);};await assert.rejects(f.action(donor,'donate',{targetId:beg,offerId:request.requestId}),/전황/);assert.equal(await cash(f,donor),10000);assert.equal(await cash(f,beg),10000);f.env.DB.batch=batch;
  const response=await handleJokgakCity({path:'jokgak-city/donate',env:f.env,deps:{...f.deps,authenticate:async()=>f.users.get(donor),json:(v,status=200)=>Response.json(v,{status})},request:new Request('https://game.test/api/jokgak-city/donate',{method:'POST',headers:{origin:'https://game.test','content-type':'application/json'},body:JSON.stringify(body(f,{targetId:beg,offerId:request.requestId,amount:99999}))})});assert.equal(response.status,400);
 });
 test(db+': TEST offers never leak to non-testers or become ON donations',async t=>{
  const {f,beg,donor,other}=await group(t,pg);let p=(await readCitySettings(f.env)).policy;p.mode='TEST';p.testUserIds=[beg,donor];await saveCitySettings(f.env,owner,p,f.now);const r=await f.action(beg,'alms');assert.equal((await f.p('SELECT COUNT(*) n FROM jokgak_city_notifications_v1 WHERE request_id=?',r.requestId).first()).n,1);
  await f.action(donor,'donate',{targetId:beg,offerId:r.requestId});assert.equal(await cash(f,beg,'TEST'),10100);assert.equal(await cash(f,beg,'ON'),10000);assert.equal(await cash(f,donor,'TEST'),9900);assert.equal(await cash(f,donor,'ON'),10000);
  p=(await readCitySettings(f.env)).policy;p.mode='ON';await saveCitySettings(f.env,owner,p,f.now);f.advance(5000);await assert.rejects(f.action(donor,'donate',{targetId:beg,offerId:r.requestId}),/끝났/);assert.equal((await status(f,other)).beggingOffers.length,0);
 });
 test(db+': losing attacker loses HP; GANG kill alone raises transfer to 20%/4,000, including defending kill',async t=>{
  const f=await cityFixture(t,pg),gang=f.roles.GANG,victim=f.roles.CITIZEN;await f.join(gang);await f.join(victim);await setLife(f,victim,l=>l.wallets.ON.balance=30000);
  let r=await f.action(gang,'attack',{targetId:victim});assert.equal(r.theft.amount,2000);assert.equal(r.theft.killBonusPercent,0);assert.equal(r.target.health,75);
  await reset(f);await f.p('UPDATE jokgak_city_players_v1 SET health=25 WHERE user_id=?',victim).run();r=await f.action(gang,'attack',{targetId:victim});assert.equal(r.theft.amount,4000);assert.equal(r.theft.percent,20);assert.equal(r.theft.killBonusPercent,10);assert.equal(r.target.health,0);assert.equal(r.target.deadUntil,f.now+180000);
  f.advance(180000);await status(f,victim);await reset(f);await f.p("UPDATE jokgak_city_players_v1 SET health=25,location='MARKET' WHERE user_id=?",victim).run();f.deps.prepareCityBattle=async()=>({battleV2:{result:{winner:'B'}}});r=await f.action(victim,'attack',{targetId:gang});assert.equal(r.result,'LOSE');assert.equal(r.effects.damageToMine,25);assert.equal(r.mine.health,0);assert.equal(r.theft.actorChange,-4000);assert.equal(r.theft.winnerId,gang);
 });
 test(db+': movement neither adds nor renews protection, fights use configured 30 seconds',async t=>{
  const {f,beg,donor}=await group(t,pg);await f.action(beg,'move',{location:'HOME'});assert.equal((await status(f,beg)).mine.protectedUntil,0);f.advance(3000);await f.action(beg,'move',{location:'MARKET'});await f.action(donor,'attack',{targetId:beg});const before=(await status(f,beg)).mine.protectedUntil;assert.equal(before,f.now+30000);f.advance(3000);await f.action(beg,'move',{location:'HOME'});assert.equal((await status(f,beg)).mine.protectedUntil,before);
 });
}
