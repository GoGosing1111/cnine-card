import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityStatus,handleJokgakCity} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {settleCityRound} from '../functions/_jokgak_city_round.js';
import {cityActivityLog} from '../functions/_jokgak_city_comms.js';
import {cityBountyKey,CITY_INCIDENT_PREFIX,CITY_BOUNTY_PREFIX,cityConflictWorld} from '../functions/_jokgak_city_conflict.js';
import {defaultCitySettings,validateCitySettings} from '../shared/jokgak-city-settings-v1.mjs';
import {defaultCityConflict,selectCityBounty} from '../shared/jokgak-city-conflict-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {CITY_CASH_MAX} from '../shared/jokgak-city-cash-v1.mjs';
import {cityRiots,cityRiotMap,cityRiotPin,cityBountyBoard,cityBountyTag,cityBountyNoticeMarkup,cityBountyReceipt,cityConflictRules} from '../js/jokgak-city-conflict-ui-v1.mjs';

const life=async(f,id)=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);
const saveLife=(f,id,value)=>f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(value),cityLifeKey(id)).run();
const status=(f,id=1)=>cityStatus(f.env,f.users.get(id),'MARKET',0,f.now);
const configure=async(f,change)=>{const cfg=(await readCitySettings(f.env)).policy;change(cfg);return saveCitySettings(f.env,{id:80,role:'OWNER'},cfg,f.now);};
const balance=async(f,id,mode='ON')=>(await life(f,id)).wallets[mode].balance;
async function setup(t,pg){
 const f=await cityFixture(t,pg);await configure(f,c=>{c.cash.theft.enabled=false;c.roles.forEach(r=>r.regenPerMinute=0);c.conflict.bounty.selectionPercent=100;});
 f.deps.cityBountyRandom=()=>0;for(const id of [1,2,3,4,5,6,7,8,20])await f.join(id);return f;
}
async function ready(f,a,b,{winner='A',lethal=true,location='MARKET'}={}){
 f.advance(1);
 await f.p('UPDATE jokgak_city_players_v1 SET location=?,health=100,health_at=?,wanted=2,jailed_until=0,next_action_at=0,next_move_at=0,protected_until=0 WHERE user_id IN (?,?)',location,f.now,a,b).run();
 for(const id of [a,b]){const value=await life(f,id);value.death=null;value.hospital={enteredAt:0,leaveAt:0,autoReturnAfter:0};value.hunger=value.wellness=100;value.at=f.now;await saveLife(f,id,value);}
 if(lethal&&winner!=='DRAW')await f.p('UPDATE jokgak_city_players_v1 SET health=20 WHERE user_id=?',winner==='A'?b:a).run();
 f.deps.prepareCityBattle=async()=>({mode:'PVP',battleV2:{result:{winner}}});
}
async function kill(f,a,b,extra={}){await ready(f,a,b);return f.action(a,'attack',{targetId:b,...extra});}
async function wanted(f,id=1){let result;for(const victim of [4,5,6])result=await kill(f,id,victim);return result.bounty.issued;}
const records=async(f,prefix)=>Number((await f.p('SELECT COUNT(*) AS n FROM app_meta WHERE key>=? AND key<?',prefix,prefix+'~').first()).n);

test('conflict defaults, strict OWNER input and independent server selection/amount boundaries',()=>{
 const c=defaultCitySettings();delete c.conflict;const upgraded=validateCitySettings(c);assert.deepEqual(upgraded.conflict,defaultCityConflict());
 const rule=upgraded.conflict.bounty;assert.equal(selectCityBounty(rule,2,0,0),null);assert.equal(selectCityBounty(rule,3,.25,0),null);assert.equal(selectCityBounty(rule,3,.249999,0),3000);assert.equal(selectCityBounty(rule,3,0,.4),5000);assert.equal(selectCityBounty(rule,3,0,.999999),10000);
 for(const change of [c=>c.riot.windowMs=0,c=>c.riot.minBattles=1,c=>c.bounty.minKills=0,c=>c.bounty.selectionPercent=101,c=>c.bounty.cooldownMs=0,c=>c.bounty.amounts=[3000,5000,5000],c=>c.bounty.amounts=[3,2,1],c=>c.bounty.amounts[2]=1000001,c=>c.bounty.arrestPays=true]){const next=defaultCitySettings();change(next.conflict);assert.throws(()=>validateCitySettings(next));}
});

for(const pg of [false,true]){const db=pg?'Postgres':'SQLite';
 test(db+': qualifying real kills issue a stable bounty; normal wins and arrests never finish it; lethal attack pays exactly once',async t=>{
  const f=await setup(t,pg);f.deps.cityBountyRandom=()=>.99;await kill(f,1,4);await kill(f,1,5);await configure(f,c=>c.conflict.bounty.selectionPercent=25);assert.equal((await kill(f,1,6)).bounty.issued,null);assert.equal((await status(f)).mine.cityKills,3);
  f.deps.cityBountyRandom=()=>0;const issued=(await kill(f,1,7)).bounty.issued;assert.equal(issued.amount,3000);assert.equal(issued.kills,4);assert.equal((await status(f)).conflicts.bounties[0].userId,1);
  await configure(f,c=>c.conflict.bounty.amounts=[4000,6000,12000]);assert.equal((await status(f)).mine.bounty.amount,3000);
  await ready(f,2,1,{lethal:false});const win=await f.action(2,'attack',{targetId:1});assert.equal(win.bounty,null);assert.equal((await life(f,1)).conflict.ON.bounty.id,issued.id);assert.equal(await balance(f,2),10000);
  const police=f.roles.POLICE;if(![1,2,3,4,5,6,7,8,20].includes(police))await f.join(police);const victim=police===1?2:1;
  if(victim!==1){await wanted(f,2);}
  await ready(f,police,victim);const arrest=await f.action(police,'arrest',{targetId:victim});assert.equal(arrest.bounty,null);assert.ok((await life(f,victim)).conflict.ON.bounty);assert.equal((await life(f,police)).conflict.ON.kills,police===1?4:0);
  await ready(f,3,1);const requestId='bounty-award-'+db;const paid=await f.action(3,'attack',{targetId:1,requestId});assert.equal(paid.bounty.claimed.amount,3000);assert.equal(paid.bounty.claimed.killerId,3);assert.equal(paid.mine.cash,13000);assert.equal((await life(f,1)).conflict.ON.bounty,null);assert.equal(await records(f,CITY_BOUNTY_PREFIX),victim===2?1:0);
  assert.equal((await f.action(3,'attack',{targetId:1,requestId})).replayed,true);assert.equal(await balance(f,3),13000);assert.equal((await status(f,3)).conflicts.notices.filter(n=>n.kind==='CLAIMED').length,1);
  const log=await cityActivityLog(f.env,3,f.now);assert.equal(log.items.find(r=>r.bounty?.claimed)?.bounty.claimed.amount,3000);assert.equal((await f.p('SELECT coin FROM users WHERE id=3').first()).coin,123456);
  assert.equal((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n,0);
 });
 test(db+': defending killer receives the full bounty; cash, kill count, warrant, notices and journal roll back together and recover a lost response',async t=>{
  const f=await setup(t,pg);const issued=await wanted(f);await ready(f,1,2,{winner:'B'});const before=[await life(f,1),await life(f,2)],count=await records(f,CITY_INCIDENT_PREFIX);
  f.fail('INSERT INTO jokgak_city_notifications_v1');await assert.rejects(f.action(1,'attack',{targetId:2,requestId:'defense-bounty-'+db}),/INJECTED/);f.fail('');assert.deepEqual([await life(f,1),await life(f,2)],before);assert.equal(await records(f,CITY_INCIDENT_PREFIX),count);assert.equal(await records(f,CITY_BOUNTY_PREFIX),1);
  f.lost();const result=await f.action(1,'attack',{targetId:2,requestId:'defense-bounty-'+db});assert.equal(result.replayed,true);assert.equal(result.bounty.claimed.id,issued.id);assert.equal(result.bounty.claimed.killerId,2);assert.equal(await balance(f,2),13000);assert.equal((await life(f,2)).conflict.ON.kills,1);assert.equal((await life(f,1)).conflict.ON.bounty,null);
  await f.action(1,'attack',{targetId:2,requestId:'defense-bounty-'+db});assert.equal(await balance(f,2),13000);assert.equal(await records(f,CITY_INCIDENT_PREFIX),count+1);
 });
 test(db+': two hunters cannot claim one warrant and a full cash wallet cannot leave partial death or payout records',async t=>{
  const f=await setup(t,pg);await wanted(f);await ready(f,2,1);await f.p('UPDATE jokgak_city_players_v1 SET next_action_at=0,health=100,location=? WHERE user_id=3','MARKET').run();
  const batch=f.env.DB.batch.bind(f.env.DB);let raced=false;
  f.env.DB.batch=async statements=>{if(!raced&&statements.some(s=>(s.text||s.source||s.sql||'').includes('INSERT INTO jokgak_city_actions_v1'))){raced=true;await f.action(3,'attack',{targetId:1,requestId:'rival-bounty-'+db});}return batch(statements);};
  await assert.rejects(f.action(2,'attack',{targetId:1,requestId:'late-bounty-'+db}),/전황/);f.env.DB.batch=batch;assert.equal(raced,true);assert.equal(await balance(f,2),10000);assert.equal(await balance(f,3),13000);assert.equal((await status(f,2)).conflicts.notices.filter(n=>n.kind==='CLAIMED').length,1);
  const target=await life(f,1);target.conflict.ON.nextEligibleAt=0;await saveLife(f,1,target);await kill(f,1,8);assert.ok((await life(f,1)).conflict.ON.bounty);
  await ready(f,2,1);const hunter=await life(f,2);hunter.wallets.ON.balance=CITY_CASH_MAX;await saveLife(f,2,hunter);const before=[await life(f,1),await life(f,2)],count=await records(f,CITY_INCIDENT_PREFIX);
  await assert.rejects(f.action(2,'attack',{targetId:1}),/한도/);assert.deepEqual([await life(f,1),await life(f,2)],before);assert.equal(await records(f,CITY_INCIDENT_PREFIX),count);assert.equal((await f.p('SELECT health FROM jokgak_city_players_v1 WHERE user_id=1').first()).health,20);
 });
 test(db+': riots count only committed fight receipts, include draws/arrests, expire and separate modes; cleanup is atomic',async t=>{
  const f=await setup(t,pg);let last;
  for(let i=0;i<5;i++){await ready(f,1,2,{winner:i===4?'DRAW':'A',lethal:false});last=await f.action(1,'attack',{targetId:2});}
  await f.action(1,'attack',{targetId:2,requestId:last.requestId});let world=(await status(f)).conflicts;assert.equal(world.riots.length,1);assert.equal(world.riots[0].battles,5);assert.equal(world.riots[0].location,'MARKET');assert.equal(world.mode,'ON');
  await ready(f,1,2,{lethal:false});f.fail('INSERT INTO jokgak_city_actions_v1');await assert.rejects(f.action(1,'attack',{targetId:2}),/INJECTED/);f.fail('');assert.equal((await status(f)).conflicts.riots[0].battles,5);
  const onWallet=await balance(f,1);await configure(f,c=>{c.mode='TEST';c.testUserIds=[1,2,3,4,5,6,7,8];});assert.deepEqual((await status(f)).conflicts.riots,[]);await wanted(f);assert.equal((await status(f)).conflicts.bounties[0].amount,3000);await kill(f,2,1);assert.equal(await balance(f,2,'TEST'),13000);assert.equal(await balance(f,1,'ON'),onWallet);assert.equal((await life(f,2)).conflict.ON.kills,0);
  await configure(f,c=>c.mode='ON');world=(await status(f,2)).conflicts;assert.equal(world.notices.length,0);assert.equal(world.bounties.length,0);assert.equal(world.riots[0].battles,5);
  f.advance(300001);assert.equal((await status(f,2)).conflicts.riots.length,0);
  await wanted(f,3);assert.ok(await records(f,CITY_BOUNTY_PREFIX));const count=await records(f,CITY_INCIDENT_PREFIX);f.setTime(cityShift(f.now).endsAt);f.fail('DELETE FROM app_meta WHERE key>=');await assert.rejects(settleCityRound(f.env,f.now),/INJECTED/);f.fail('');assert.equal(await records(f,CITY_INCIDENT_PREFIX),count);
  await settleCityRound(f.env,f.now);assert.equal(await records(f,CITY_INCIDENT_PREFIX),0);assert.equal(await records(f,CITY_BOUNTY_PREFIX),0);assert.equal((await status(f,3)).mine.cityKills,0);assert.equal((await status(f,3)).mine.bounty,null);
 });
 test(db+': current bounty survives exit/rejoin; cooldown, immediate OFF, active-user filtering and stale CMS clients remain safe',async t=>{
  const f=await setup(t,pg);const issued=await wanted(f);await f.action(1,'leave');assert.equal((await status(f,2)).conflicts.bounties.length,0);f.advance(61000);await f.action(1,'join');assert.equal((await status(f)).mine.bounty.id,issued.id);
  await f.p("UPDATE users SET status='BANNED' WHERE id=1").run();assert.equal((await status(f,2)).conflicts.bounties.length,0);await f.p("UPDATE users SET status='ACTIVE',nickname='수배 닉네임 변경' WHERE id=1").run();assert.equal((await status(f,2)).conflicts.bounties[0].nickname,'수배 닉네임 변경');
  await kill(f,2,1);await kill(f,1,7);assert.equal((await status(f)).mine.bounty,null);f.advance(600001);await kill(f,1,8);assert.ok((await status(f)).mine.bounty);
  await configure(f,c=>{c.conflict.riot.enabled=false;c.conflict.bounty.enabled=false;});assert.equal((await status(f)).conflicts.bounties.length,0);assert.equal((await status(f)).mine.bounty,null);const cash=await balance(f,3);const result=await kill(f,3,1);assert.equal(result.bounty.claimed,null);assert.equal(await balance(f,3),cash);assert.equal((await life(f,1)).conflict.ON.bounty,null);
  const old=(await readCitySettings(f.env)).policy;delete old.conflict;await saveCitySettings(f.env,{id:80,role:'OWNER'},old,f.now);assert.equal((await readCitySettings(f.env)).policy.conflict.bounty.enabled,false);
  const response=await handleJokgakCity({env:f.env,path:'jokgak-city/attack',request:new Request('https://city.test/api/jokgak-city/attack',{method:'POST',headers:{'content-type':'application/json',origin:'https://city.test'},body:JSON.stringify({requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,targetId:2,bounty:1000000})}),deps:{...f.deps,authenticate:async()=>f.users.get(1),json:(data,status=200)=>Response.json(data,{status})}});assert.equal(response.status,400);
 });
}

test('riot and wanted UI stays inert until loaded, escapes names and shows payout provenance without turning arrest into a kill',()=>{
 assert.deepEqual(cityRiots(null,0),[]);assert.equal(cityRiotMap(null,0),'');assert.equal(cityBountyBoard(null,0),'');assert.equal(cityBountyTag({}), '');
 const name='<img src=x onerror=alert(1)>',state={mode:'ON',shift:{id:1},conflict:defaultCityConflict(),conflicts:{epoch:1,mode:'ON',riots:[{location:'MARKET',battles:8,expiresAt:9999,intensity:1,windowMs:300000}],bounties:[{userId:1,nickname:name,amount:5000,kills:4,location:'MARKET'}]}};
 const markup=cityRiotMap(state,1)+cityRiotPin(state,'MARKET',1)+cityBountyBoard(state,1)+cityBountyNoticeMarkup({kind:'CLAIMED',id:'one',targetName:name,killerName:name,amount:5000,shownAt:1},1)+cityBountyReceipt({claimed:{targetName:name,killerName:name,killerId:2,amount:5000}},2)+cityConflictRules(state);
 assert.ok(markup.includes('폭동지역'));assert.ok(markup.includes('현상수배범 사망'));assert.ok(markup.includes('수배 완료'));assert.ok(markup.includes('내 현상금 수령'));assert.ok(markup.includes('&lt;img'));assert.ok(!markup.includes('<img src=x'));assert.ok(markup.includes('체포'));
 state.mode='TEST';assert.equal(cityRiotMap(state,1),'');assert.ok(!cityBountyBoard(state,1).includes('5,000'));state.mode='ON';assert.equal(cityRiotMap(state,10000),'');
 const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 // Main-view countdown revisions need not rewrite unchanged conflict assets.
 const version=read('css/jokgak-city-v1.css').match(/jokgak-city-conflict-v1\.css\?v=([A-Za-z0-9-]+)/)?.[1];assert.ok(version);assert.ok(read('admin/jokgak-city-admin-v1.mjs').includes('jokgak-city-conflict-admin-v1.mjs?v='+version));
});
