import test from 'node:test';
import assert from 'node:assert/strict';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {cityStatus,cityAction} from '../functions/_jokgak_city.js';
import {readCitySettings,saveCitySettings} from '../functions/_jokgak_city_settings.js';
import {defaultCityCareer,readStoredCityCareer,validateCityCareer,CITY_JOBS} from '../shared/jokgak-city-career-v1.mjs';
import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {cityCareerPanel} from '../js/jokgak-city-career-ui-v1.mjs';
const status=(f,id)=>cityStatus(f.env,f.users.get(id),'MARKET',0,f.now);
const legacy=()=>({...defaultCityCareer(),enabled:true,startedAt:Date.parse('2026-10-09T01:00:00Z'),jobs:defaultCityCareer().jobs.slice(0,9).map((j,i)=>({...j,cash:[500,500,600,400,900,750,1200,750,450][i]}))});
test('legacy stored policies retain wages and disable only added jobs; incomplete or forged CMS submissions still fail',()=>{
 const old=legacy(),normalized=readStoredCityCareer(old);assert.deepEqual(normalized.jobs.slice(0,9),old.jobs);assert.ok(normalized.jobs.slice(9).every(j=>!j.enabled));assert.equal(old.jobs.length,9);
 assert.throws(()=>validateCityCareer(old));assert.throws(()=>readStoredCityCareer({...old,jobs:old.jobs.slice(1)}));
 assert.throws(()=>readStoredCityCareer({...old,jobs:old.jobs.map((j,i)=>i===8?{...j,code:'FREE_MONEY'}:j)}));
});
test('all seven roles can finish each of eight common jobs at its location without employment, with authoritative pay and retry protection',async t=>{
 const common=CITY_JOBS.filter(j=>!j.role);assert.equal(common.length,8);assert.equal(new Set(common.map(j=>j.location)).size,8);
 for(const role of ['CITIZEN','BEGGAR','POLICE','NURSE','DOCTOR','GANG','VANDAL']){
  const f=await cityFixture(t),p=(await readCitySettings(f.env)).policy;p.career.enabled=true;await saveCitySettings(f.env,{id:80,role:'OWNER'},p,f.now);const id=f.roles[role];
  await f.join(id);let m=(await status(f,id)).mine;
  for(const meta of common){
   const rule=p.career.jobs.find(j=>j.code===meta.code);f.advance(60000);await f.action(id,'move',{location:meta.location});
   const started=await f.action(id,'workStart',{product:meta.code});assert.equal(started.mine.career.employed,false);assert.equal(started.work.endsAt,f.now+rule.durationMs);assert.equal(started.work.cash,rule.cash);
   const before=started.mine.cash;f.advance(rule.durationMs);const body={requestId:crypto.randomUUID(),epoch:cityShift(f.now).id};
   const paid=await cityAction(f.env,f.deps,f.users.get(id),'workFinish',body);assert.equal(paid.work.cash.change,rule.cash);assert.ok(paid.mine.cash>=before+rule.cash);
   const replay=await cityAction(f.env,f.deps,f.users.get(id),'workFinish',body);assert.equal(replay.replayed,true);assert.equal((await status(f,id)).mine.cash,paid.mine.cash);m=paid.mine;
  }
  assert.equal(m.career.jobIncome,16000);
 }
});
test('a running shift and already-started work keep old pay; next shift exposes new jobs and new pay',async t=>{
 const f=await cityFixture(t),id=f.roles.CITIZEN,p=(await readCitySettings(f.env)).policy;p.career=legacy();
 await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(p),'jokgak_city_settings_v1').run();await f.join(id);
 assert.equal((await f.action(id,'workStart',{product:'DELIVERY'})).work.cash,500);
 const next=(await readCitySettings(f.env)).policy;next.career.jobs=defaultCityCareer().jobs;await saveCitySettings(f.env,{id:80,role:'OWNER'},next,f.now);
 let view=await status(f,id);assert.equal(view.career.jobs.find(j=>j.code==='DELIVERY').cash,500);assert.equal(view.career.jobs.find(j=>j.code==='HOME_PACK').enabled,false);
 assert.match(cityCareerPanel(view,f.now,false),/공통 알바 2종/);assert.doesNotMatch(cityCareerPanel(view,f.now,false),/data-city-job="HOME_PACK"/);
 f.advance(300000);assert.equal((await f.action(id,'workFinish')).work.cash.change,500);f.advance(60000);await f.action(id,'move',{location:'HOME'});await assert.rejects(f.action(id,'workStart',{product:'HOME_PACK'}),/일거리/);
 f.setTime(cityShift(f.now).endsAt);await f.action(id,'join');view=await status(f,id);assert.equal(view.career.jobs.find(j=>j.code==='DELIVERY').cash,2200);assert.equal(view.career.jobs.find(j=>j.code==='HOME_PACK').enabled,true);
 assert.match(cityCareerPanel(view,f.now,false),/공통 알바 8종/);assert.equal((await f.action(id,'workStart',{product:'HOME_PACK'})).work.cash,1000);
});
