import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityAction,cityStatus,handleJokgakCity} from '../functions/_jokgak_city.js';
import {settleCityRound} from '../functions/_jokgak_city_round.js';
import {cityActivityLog,cityBroadcasts} from '../functions/_jokgak_city_comms.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {cityBroadcastText} from '../shared/jokgak-city-comms-v1.mjs';
import {cityActivityPanel,cityBroadcastMarkup} from '../js/jokgak-city-comms-ui-v1.mjs';
import {runCityRotationSchedule} from '../workers/clan-draft/src/city-rotation.js';
const status=(f,id)=>cityStatus(f.env,f.users.get(id),'MARKET',0,f.now);
const life=async(f,id)=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value);
const req=async(f,id,path,body)=>{
 const response=await handleJokgakCity({path:'jokgak-city/'+path,env:f.env,deps:{...f.deps,authenticate:async()=>f.users.get(id),json:(data,status=200)=>Response.json(data,{status})},request:new Request('https://city.test/api/jokgak-city/'+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body),headers:{'content-type':'application/json',origin:'https://city.test'}}:{})})});
 return {status:response.status,...await response.json()};
};
async function attack(f,a,b){f.advance(1);await f.p('UPDATE jokgak_city_players_v1 SET health=100,next_action_at=0,protected_until=0 WHERE user_id IN (?,?)',a,b).run();return f.action(a,'attack',{targetId:b});}

for(const pg of [false,true]){const db=pg?'Postgres':'SQLite';
 test(db+': 500-won purchase and broadcast consume once, survive lost responses and rollback with the receipt',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;await f.join(id);
  const buy={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id};
  f.fail('INSERT INTO jokgak_city_actions_v1');await assert.rejects(cityAction(f.env,f.deps,f.users.get(id),'buyMegaphone',buy),/INJECTED/);f.fail('');assert.equal((await status(f,id)).mine.cash,10000);assert.equal((await status(f,id)).mine.megaphoneCount,0);
  f.lost();const bought=await cityAction(f.env,f.deps,f.users.get(id),'buyMegaphone',buy);assert.equal(bought.replayed,true);assert.equal(bought.mine.cash,9500);assert.equal(bought.mine.megaphoneCount,1);
  await cityAction(f.env,f.deps,f.users.get(id),'buyMegaphone',buy);assert.equal((await status(f,id)).mine.cash,9500);
  const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id,message:'시장으로 모여주세요!'};
  f.fail('INSERT INTO jokgak_city_actions_v1');await assert.rejects(cityAction(f.env,f.deps,f.users.get(id),'broadcast',body),/INJECTED/);f.fail('');assert.equal((await status(f,id)).mine.megaphoneCount,1);assert.deepEqual(await cityBroadcasts(f.env,'ON',f.now),[]);
  f.lost();const sent=await cityAction(f.env,f.deps,f.users.get(id),'broadcast',body);assert.equal(sent.replayed,true);assert.equal(sent.mine.megaphoneCount,0);await cityAction(f.env,f.deps,f.users.get(id),'broadcast',body);
  const feed=await cityBroadcasts(f.env,'ON',f.now);assert.equal(feed.length,1);assert.equal(feed[0].message,body.message);assert.equal((await status(f,id)).mine.cash,9500);
  await assert.rejects(cityAction(f.env,f.deps,f.users.get(id),'broadcast',{...body,message:'변조'}),/다른 행동/);
 });
 test(db+': stock, cash, place, text, cooldown and TEST/ON ownership are enforced on the server',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN;await f.join(id);await f.action(id,'move',{location:'HOME'});await assert.rejects(f.action(id,'buyMegaphone'),/시장/);await f.p('UPDATE jokgak_city_players_v1 SET location=? WHERE user_id=?','MARKET',id).run();
  await assert.rejects(f.action(id,'broadcast',{message:'없음'}),/먼저 구매/);await f.action(id,'buyMegaphone');
  await assert.rejects(f.action(id,'broadcast',{message:' '}),/1~100/);await assert.rejects(f.action(id,'broadcast',{message:'한'.repeat(101)}),/1~100/);
  await f.action(id,'broadcast',{message:'정상'});await f.action(id,'buyMegaphone');await assert.rejects(f.action(id,'broadcast',{message:'빠른 재전송'}),/15초/);f.advance(15000);await f.action(id,'broadcast',{message:'다음 방송'});
  const policy=(await readCitySettings(f.env)).policy;policy.mode='TEST';policy.testUserIds=[id];await saveCitySettings(f.env,{id:80,role:'OWNER'},policy,f.now);
  assert.equal((await status(f,id)).mine.megaphoneCount,0);await f.action(id,'buyMegaphone');await f.action(id,'broadcast',{message:'TEST 방송'});assert.equal((await life(f,id)).wallets.ON.balance,9000);assert.equal((await cityBroadcasts(f.env,'TEST',f.now)).length,1);assert.equal((await cityBroadcasts(f.env,'ON',f.now)).length,2);
  const l=await life(f,id);l.wallets.TEST.balance=100;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(l),cityLifeKey(id)).run();await assert.rejects(f.action(id,'buyMegaphone'),/현금|부족/);assert.equal((await status(f,id)).mine.megaphoneCount,0);
 });
 test(db+': hide preference is account-bound; skip-all covers more than one page but preserves current-round logs and newer arrivals',async t=>{
  const f=await cityFixture(t,pg),a=f.roles.GANG,b=f.roles.CITIZEN;await f.join(a);await f.join(b);
  for(let i=0;i<12;i++)await attack(f,a,b);
  assert.equal((await req(f,b,'notice-settings',{hidePopups:true})).status,200);assert.equal((await req(f,b,'notice-settings',{hidePopups:'true'})).status,400);
  const hidden=await req(f,b,'notifications');assert.equal(hidden.noticePreferences.hidePopups,true);assert.equal(hidden.unreadCount,12);assert.equal(hidden.items.length,10);assert.equal((await req(f,a,'notifications')).noticePreferences.hidePopups,false);
  await attack(f,a,b);assert.equal((await req(f,b,'ack-all',{through:hidden.serverNow})).status,200);assert.equal((await req(f,b,'notifications')).unreadCount,1);
  const logs=await cityActivityLog(f.env,b,f.now);assert.equal(logs.items.filter(r=>r.direction==='received').length,13);assert.equal(logs.items.filter(r=>r.direction==='received'&&r.read).length,12);
  assert.equal(logs.items.some(r=>r.battleV2||r.mine||r.bag),false);assert.equal((await req(f,a,'notifications')).unreadCount,0);
  await req(f,b,'notice-settings',{hidePopups:false});assert.equal((await req(f,b,'notifications')).noticePreferences.hidePopups,false);
 });
 test(db+': shift expiry atomically exits every user, deletes only prior city logs/receipts, and requires a fresh join',async t=>{
  const f=await cityFixture(t,pg),a=f.roles.GANG,b=f.roles.CITIZEN;await f.join(a);await f.join(b);await f.action(b,'buyMegaphone');const old=await attack(f,a,b),cutoff=f.now;
  f.setTime(cityShift(f.now).endsAt);f.fail('DELETE FROM jokgak_city_actions_v1');await assert.rejects(settleCityRound(f.env,f.now),/INJECTED/);f.fail('');assert.equal((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_players_v1 WHERE active=1').first()).n,2);
  await settleCityRound(f.env,f.now);assert.equal((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_players_v1 WHERE active=1').first()).n,0);assert.equal((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_actions_v1').first()).n,0);assert.equal((await f.p('SELECT COUNT(*) AS n FROM jokgak_city_notifications_v1').first()).n,0);
  assert.equal((await status(f,b)).mine.active,false);assert.equal((await status(f,b)).mine.megaphoneCount,0);assert.equal((await status(f,b)).people.length,0);assert.deepEqual((await req(f,b,'notifications')).items,[]);assert.deepEqual((await req(f,b,'log')).items,[]);
  await assert.rejects(f.action(b,'buyMegaphone'),/입장/);await assert.rejects(cityAction(f.env,f.deps,f.users.get(a),'attack',{requestId:old.requestId,epoch:old.epoch,targetId:b}),/교대/);assert.equal((await req(f,b,'ack-all',{through:cutoff})).status,409);
  await f.action(b,'join');assert.equal((await status(f,b)).mine.active,true);assert.equal((await status(f,a)).mine.active,false);assert.equal((await req(f,b,'log')).items.length,1);
  await settleCityRound(f.env,f.now,{force:true});assert.equal((await status(f,b)).mine.active,true);assert.equal((await req(f,b,'log')).items.length,1);
 });
}
test('log pagination is stable at equal timestamps and never returns another user records',async t=>{
 const f=await cityFixture(t),id=f.roles.CITIZEN;await f.join(id);for(let n=0;n<25;n++)await f.action(id,'move',{location:n%2?'MARKET':'HOME'}).then(()=>f.p('UPDATE jokgak_city_players_v1 SET next_move_at=0 WHERE user_id=?',id).run());
 const first=await cityActivityLog(f.env,id,f.now);assert.equal(first.items.length,20);const second=await cityActivityLog(f.env,id,f.now,first.next.before,first.next.beforeId);assert.equal(second.items.length,6);assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,26);assert.equal((await cityActivityLog(f.env,79,f.now)).items.length,0);
});
test('broadcast and log render malicious text as text, and scheduler closes its connection on success or failure',async()=>{
 const message='<img src=x onerror=alert(1)>';assert.equal(cityBroadcastText('  한글   방송  '),'한글 방송');assert.throws(()=>cityBroadcastText('\u202e가림'));
 const html=cityBroadcastMarkup({id:'one',message,senderName:'<script>',shownAt:0},0)+cityActivityPanel({items:[{id:'one',direction:'sent',action:'broadcast',comms:{message},createdAt:0}],next:null});assert.equal(html.includes('<img src=x'),false);assert.ok(html.includes('&lt;img'));
 let closed=0;const openDatabase=async()=>({db:{},close:async()=>closed++});await runCityRotationSchedule({},{openDatabase,settle:async(_e,now,options)=>{assert.equal(now,123);assert.equal(options.force,true);return {changed:true};},now:123});assert.equal(closed,1);
 await assert.rejects(runCityRotationSchedule({},{openDatabase,settle:async()=>{throw Error('offline');}}),/offline/);assert.equal(closed,2);
});
