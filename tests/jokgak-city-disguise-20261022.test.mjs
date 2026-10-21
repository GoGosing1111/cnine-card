import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityStatus,handleJokgakCity,assignedCityRole} from '../functions/_jokgak_city.js';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {cityLifeKey,readCityLife} from '../shared/jokgak-city-life-v1.mjs';
import {CITY_DISGUISE} from '../shared/jokgak-city-disguise-v1.mjs';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {isProductionFile,cityDisguiseQaOnly} from '../scripts/prepare-production-assets.mjs';
test('production delivers every disguise asset and module within the Pages cap while preserving Node QA sources',()=>{
 const manifest=JSON.parse(readFileSync('assets/ui/jokgak-city/disguise-v1/manifest.json','utf8'));
 for(const row of manifest.assets){
  assert.equal(isProductionFile(row.original),false);
  for(const asset of row.derivatives){assert(isProductionFile(asset.path));assert(readFileSync(asset.path).length>0);}
 }
 for(const path of ['js/jokgak-city-disguise-ui-v1.mjs','css/jokgak-city-disguise-v1.css','shared/jokgak-city-disguise-v1.mjs'])assert(isProductionFile(path));
 for(const path of cityDisguiseQaOnly){assert.equal(isProductionFile(path),false);assert.match(readFileSync(path,'utf8'),/from ['"]node:/);}
 const tracked=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 const count=tracked.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 assert(count<=20000,`Pages has ${count} assets`);
});
const item={product:CITY_DISGUISE.code},life=async(f,id)=>readCityLife((await f.p('SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first()).value,f.now);
const status=(f,id)=>cityStatus(f.env,f.users.get(id),'MARKET',0,f.now);
const config=async(f,edit)=>{const key='jokgak_city_settings_v1',row=await f.p('SELECT value FROM app_meta WHERE key=?',key).first(),p=JSON.parse(row.value);edit(p);await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(p),key).run();};
for(const pg of [false,true]){
 const engine=pg?'postgres':'sqlite';
 test(engine+': 3,000 cash purchase, random real participant identity, two uses, expiry, rejoin, and role permissions',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN,source=f.roles.POLICE;
  await f.join(id);await f.join(source);
  const before=(await status(f,id)).mine;
  for(let n=0;n<3;n++){await f.action(id,'buy',item);f.advance(5001);}
  assert.equal((await status(f,id)).mine.cash,before.cash-9000);
  const requestId=crypto.randomUUID(),first=await f.action(id,'use',{...item,requestId});
  assert.equal(first.mine.role,'CITIZEN');assert.equal(first.mine.nickname,f.users.get(id).nickname);
  assert.equal(first.mine.disguise.active.nickname,f.users.get(source).nickname);
  assert.equal(first.mine.disguise.active.role,'POLICE');
  assert.equal(first.mine.disguise.active.until-first.createdAt,1800000);
  const replay=await f.action(id,'use',{...item,requestId});
  assert.equal(replay.replayed,true);assert.equal(replay.mine.disguise.uses,1);
  const shown=(await status(f,source)).people.find(p=>p.userId===id);
  assert.equal(shown.nickname,f.users.get(source).nickname);assert.equal(shown.role,'POLICE');assert.equal(shown.disguise,undefined);
  f.advance(5001);
  await assert.rejects(f.action(id,'inspect',{targetId:source}),e=>e.code==='CITY_ROLE');
  await assert.rejects(f.action(source,'use',item),e=>e.code==='CITY_DISGUISE_POLICE');
  const inspected=await f.action(source,'inspect',{targetId:id});assert.equal(inspected.inspection.role,'POLICE');assert.equal(inspected.inspection.nickname,shown.nickname);
  await f.action(id,'leave');f.advance(60001);await f.action(id,'join');await f.p("UPDATE jokgak_city_players_v1 SET location='MARKET' WHERE user_id=?",id).run();
  assert.equal((await status(f,id)).mine.disguise.uses,1);
  const second=await f.action(id,'use',item);assert.equal(second.mine.disguise.uses,2);f.advance(5001);
  await assert.rejects(f.action(id,'use',item),e=>e.code==='CITY_DISGUISE_LIMIT');
  assert.equal((await life(f,id)).disguises.ON.count,1);
  f.setTime(second.mine.disguise.active.until-1);assert.ok((await status(f,id)).mine.disguise.active);
  f.advance(1);const expired=await status(f,id);assert.equal(expired.mine.disguise.active,null);
  assert.equal(expired.people.find(p=>p.userId===id).nickname,f.users.get(id).nickname);
  assert.equal(expired.people.find(p=>p.userId===id).role,'CITIZEN');
  assert.equal((await f.p('SELECT nickname FROM users WHERE id=?',id).first()).nickname,f.users.get(id).nickname);
  f.setTime(cityShift(f.now).endsAt+1);const next=await status(f,id);
  assert.equal(next.mine.disguise.count,0);assert.equal(next.mine.disguise.uses,0);assert.equal(next.mine.disguise.active,null);
 });
 test(engine+': absent/ineligible source costs nothing; failure rollback and lost-response retries preserve one use',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.GANG,source=f.roles.CITIZEN;
  await f.join(id);
  await f.action(id,'buy',item);f.advance(5001);
  const before=await life(f,id);
  await assert.rejects(f.action(id,'use',item),e=>e.code==='CITY_DISGUISE_NO_TARGET');
  assert.deepEqual(await life(f,id),before);
  await f.join(source);await f.p("UPDATE users SET status='BANNED' WHERE id=?",source).run();
  await assert.rejects(f.action(id,'use',item),e=>e.code==='CITY_DISGUISE_NO_TARGET');
  await f.p("UPDATE users SET status='ACTIVE' WHERE id=?",source).run();
  f.fail('INSERT INTO jokgak_city_actions_v1');
  await assert.rejects(f.action(id,'use',item),/INJECTED_FAILURE/);
  f.fail('');assert.deepEqual(await life(f,id),before);
  f.lost();const requestId=crypto.randomUUID(),result=await f.action(id,'use',{...item,requestId});
  assert.equal(result.replayed,true);assert.equal(result.mine.disguise.uses,1);
  assert.equal((await f.action(id,'use',{...item,requestId})).mine.disguise.uses,1);
  await assert.rejects(f.action(id,'use',{...item,targetId:source}),e=>e.code==='CITY_FIELDS');
  const saved=await life(f,id);assert.equal(saved.disguises.ON.count,0);assert.equal(saved.disguises.ON.uses,1);
  const current=await status(f,id);assert.equal(current.mine.cash,7000);
 });
 test(engine+': TEST inventory/use limit are separate; mode access, combat receipts and notices use the alias',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.GANG,source=f.roles.CITIZEN;
  await f.join(id);await f.join(source);await f.action(id,'buy',item);f.advance(5001);await f.action(id,'use',item);f.advance(5001);
  const alias=f.users.get(source).nickname;
  const simulate=f.deps.prepareCityBattle;
  f.deps.prepareCityBattle=async(env,deps,a,b,states)=>{assert.equal(a.id,id);assert.equal(a.nickname,alias);assert.equal(states.attacker.role,'GANG');return {...await simulate(),attackerNickname:a.nickname,defenderNickname:b.nickname};};
  const fought=await f.action(id,'attack',{targetId:source});
  assert.equal(fought.attackerNickname,alias);
  const notice=JSON.parse((await f.p('SELECT summary_json FROM jokgak_city_notifications_v1 WHERE request_id=?',fought.requestId).first()).summary_json);
  assert.equal(notice.actorName,alias);assert.equal(notice.actorId,id);
  const response=await handleJokgakCity({path:'jokgak-city/result',request:new Request('https://test/api/jokgak-city/result?requestId='+fought.requestId),env:f.env,deps:{...f.deps,authenticate:async()=>f.users.get(source),json:(v,s=200)=>Response.json(v,{status:s})}});
  const publicReceipt=await response.json();assert.equal(publicReceipt.mine.nickname,alias);assert.equal(publicReceipt.mine.role,'CITIZEN');assert.equal(publicReceipt.mine.disguise,undefined);assert.equal(publicReceipt.mine.cash,undefined);
  await config(f,p=>{p.mode='TEST';p.testUserIds=[id];});f.advance(20000);
  await f.action(id,'buy',item);f.advance(5001);
  await assert.rejects(f.action(id,'use',item),e=>e.code==='CITY_DISGUISE_NO_TARGET');
  await config(f,p=>{p.testUserIds=[id,source];});
  const used=await f.action(id,'use',item);assert.equal(used.mine.disguise.uses,1);assert.equal(used.mine.cash,7000);
  const saved=await life(f,id);assert.equal(saved.disguises.ON.uses,1);assert.equal(saved.disguises.TEST.uses,1);
 });
 test(engine+': market and cash checks, no purchase on insufficient funds, and round end caps the visible disguise deadline',async t=>{
  const f=await cityFixture(t,pg),id=f.roles.CITIZEN,source=f.roles.POLICE;
  await f.join(id,'HOME');await f.join(source);
  await assert.rejects(f.action(id,'buy',item),e=>e.code==='CITY_DISGUISE_MARKET');
  await f.p("UPDATE jokgak_city_players_v1 SET location='MARKET' WHERE user_id=?",id).run();
  const l=await life(f,id);l.wallets.ON.balance=2999;
  await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(l),cityLifeKey(id)).run();
  await assert.rejects(f.action(id,'buy',item),e=>e.code==='CITY_CASH_INSUFFICIENT');
  assert.equal((await life(f,id)).disguises.ON.count,0);
  l.wallets.ON.balance=3000;await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(l),cityLifeKey(id)).run();
  const end=cityShift(f.now).endsAt;f.setTime(end-20000);
  await f.action(id,'buy',item);f.advance(5001);
  const used=await f.action(id,'use',item);assert.equal(used.mine.disguise.active.until,end);
  f.setTime(end);const closed=await status(f,id);assert.equal(closed.mine.active,false);assert.equal(closed.mine.disguise.active,null);assert.equal(closed.mine.disguise.uses,0);
 });
}
