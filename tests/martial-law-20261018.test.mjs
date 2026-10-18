import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import * as policy from '../shared/martial-law-v1.mjs';
import {readMartialLaw} from '../functions/_martial_law.js';
import * as access from '../functions/_burning_event_access.js';
import * as miracle from '../functions/_miracle_burning.js';
import {readRankedEnergy,commitRankedFight,rankedFightReceipt} from '../functions/_ranked_reform.js';
import {martialFixture,martialOwner as owner} from './helpers/martial-law-fixture.mjs';
import {isProductionFile,isolatedQaFixtures} from '../scripts/prepare-production-assets.mjs';
const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const draft=(revision=0,enabled=true,durationMinutes=30)=>({revision,enabled,durationMinutes,requestId:crypto.randomUUID()});
const raw=async f=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',policy.MARTIAL_LAW_KEY).first())?.value||'{}');
const logs=async f=>Number((await f.p('SELECT COUNT(*) n FROM admin_logs').first()).n);
test('only martial authoring and isolated fixture are omitted from delivery; every live image ships',()=>{
 for(const file of ['illustration-source.png','ui-source.png','prompts.json'])assert.equal(isProductionFile('assets/ui/martial-law-20261018/'+file),false);
 for(const file of ['illustration.webp','panel.webp','banner.webp','button.webp','badge.webp','manifest.json'])assert.equal(isProductionFile('assets/ui/martial-law-20261018/'+file),true);
 assert.equal(isProductionFile('tests/helpers/martial-law-fixture.mjs'),false);
 assert.equal(isProductionFile('assets/ui/burning-miracle-v1/celestial-awakening-source-v1.png'),true);
});
test('omitted isolated QA fixtures have no deployed JavaScript or preview consumers',()=>{
 const pattern=[...isolatedQaFixtures].map(f=>f.split('/').at(-1).replaceAll('.','\\.')).join('|');
 let matches='';try{matches=execFileSync('rg',['-l',pattern,'scripts','preview','js','shared','functions','admin','workers','world','--glob','*.mjs','--glob','*.js','--glob','*.html','--glob','*.json'],{encoding:'utf8',maxBuffer:1e6})}catch(error){if(error.status!==1)throw error}
 assert.equal(matches.trim(),'','isolated test fixtures cannot be referenced by deployed code or previews');
 for(const file of isolatedQaFixtures){assert.ok(readFileSync(file).length);assert.equal(isProductionFile(file),false);}
 assert.equal(isProductionFile('tests/helpers/apocalypse-fixture.mjs'),true,'local preview imports are preserved');
});
function runtime(f){
 const ctx={...access,...miracle,...policy,console,readMartialLaw,
  Date:class extends Date{static now(){return f.now}},
  martialEnergyConfig:(cfg,p)=>policy.martialEnergyConfig(cfg,p,f.now),
  maintenanceSettings:async()=>({active:false}),isAdminRole:()=>false,canUseTestAccess:()=>false,
  kstDate:()=>new Date(f.now+9*3600000).toISOString().slice(0,10),sqlUtcNow:()=>policy.martialSqlUtc(f.now),utcMs:s=>Date.parse(s.replace(' ','T')+'Z'),
  defaultBattleSettings:()=>({energy:{enabled:true,maxEnergy:5,dailyRestore:5,costPerBattle:1,rechargeMinutes:5}}),
  APOCALYPSE_ENERGY_CONFIG:{enabled:true,maxEnergy:5,costPerBattle:1,rechargeMinutes:30}
 };
 const code=api.slice(api.indexOf('const BURNING_EVENT_META_KEY='),api.indexOf('function defaultPvpSettings()'))+
 '\n'+api.slice(api.indexOf('async function battleEnergyState('),api.indexOf('// V1975:'))+
 '\nasync function ensureApocalypseEnergyFoundation(){}\n'+api.slice(api.indexOf('async function apocalypseEnergyState('),api.indexOf('async function pveEnergyStateForDifficulty('))+
 ';({burningEventSettings,applyBurningPveSettings,applyBurningPvpSettings,burningRewardAmount,burningPublicState,battleEnergyState,consumeBattleEnergy,apocalypseEnergyState,consumeApocalypseEnergy})';
 return vm.runInNewContext(code,ctx);
}
for(const postgres of [false,true]){
 const db=postgres?'PostgreSQL':'SQLite';
 test(db+': exact operator, OFF default, duration validation, atomic declaration/revocation, replay and expiry',async t=>{
  const f=await martialFixture({postgres});t.after(()=>f.close());
  for(const identity of [null,{...owner,role:'ADMIN'},{...owner,role:'USER'},{...owner,nickname:'다른 OWNER'},{...owner,nickname:'핑크빛유두 '}]){
   for(const method of ['GET','PATCH'])assert.equal((await f.request(identity,method,draft())).status,identity?403:401);
  }
  assert.equal((await f.request()).body.settings.enabled,false);
  assert.equal((await f.p('SELECT COUNT(*) n FROM app_meta').first()).n,0);
  for(const invalid of [{...draft(),durationMinutes:0},{...draft(),durationMinutes:45},{...draft(),enabled:'true'},{...draft(),coinMultiplier:99},{...draft(),revision:-1}]){
   const result=await f.request(owner,'PATCH',invalid);assert.ok([400,409].includes(result.status));
  }
  assert.equal(await logs(f),0);
  await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)','hyper_burning_event_settings_v1310','{"enabled":true,"keep":"untouched"}').run();
  const body=draft(),on=await f.request(owner,'PATCH',body);
  assert.equal(on.status,200);assert.equal(on.body.settings.enabled,true);
  assert.equal(Date.parse(on.body.settings.endsAt)-f.now,30*60000);
  assert.equal(on.body.settings.coinMultiplier,.9);assert.equal(on.body.settings.rechargeMultiplier,3);
  assert.equal(on.body.settings.windows,undefined);assert.equal(on.body.settings.commitToken,undefined);
  assert.equal((await f.request(owner,'PATCH',body)).body.replayed,true);assert.equal(await logs(f),1);
  assert.equal((await f.request(owner,'PATCH',{...body,durationMinutes:60})).status,409);
  f.now+=5*60000;
  const stop=draft(1,false);assert.equal((await f.request(owner,'PATCH',stop)).status,200);
  const revoked=await raw(f);assert.equal(revoked.windows[0][1],f.now);assert.equal(revoked.enabled,false);
  for(const duration of [60,120]){
   const current=await raw(f),value=await f.request(owner,'PATCH',draft(current.revision,true,duration));
   assert.equal(Date.parse(value.body.settings.endsAt)-f.now,duration*60000);
   f.now+=duration*60000;
   assert.equal((await readMartialLaw(f.env,{fresh:true,now:f.now})).enabled,false);
   assert.equal((await f.request()).body.settings.enabled,false);
  }
  assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?','hyper_burning_event_settings_v1310').first()).value,'{"enabled":true,"keep":"untouched"}');
 });
 test(db+': audit failure rolls back, lost commit response replays, concurrent initial declarations produce one event',async t=>{
  const f=await martialFixture({postgres});t.after(()=>f.close());
  f.failAudit();await assert.rejects(f.request(owner,'PATCH',draft()));
  assert.equal((await raw(f)).revision,undefined);assert.equal(await logs(f),0);
  const race=await Promise.all([f.request(owner,'PATCH',draft()),f.request(owner,'PATCH',draft())]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal(await logs(f),1);
  const body=draft(1,false);f.loseResponse();
  assert.equal((await f.request(owner,'PATCH',body)).body.replayed,true);assert.equal(await logs(f),2);
  assert.equal((await f.request(owner,'PATCH',body)).body.replayed,true);assert.equal(await logs(f),2);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM joint_atomic_guards_v1').first()).n),0);
 });
 test(db+': actual PVE and Apocalypse energy preserve partial charge without declaration refill',async t=>{
  const f=await martialFixture({postgres});t.after(()=>f.close());const base=f.now;
  await f.request(owner,'PATCH',draft());const rt=runtime(f),user={id:1,role:'USER'};
  const today=new Date(base+9*3600000).toISOString().slice(0,10);
  await f.p('INSERT INTO user_battle_energy VALUES(?,?,?,?,NULL)',1,1,policy.martialSqlUtc(base-2*60000),today).run();
  await f.p('INSERT INTO user_apocalypse_energy VALUES(?,?,?,NULL)',1,1,policy.martialSqlUtc(base-20*60000)).run();
  const settings=rt.applyBurningPveSettings({energy:{enabled:true,maxEnergy:5,dailyRestore:5,costPerBattle:1,rechargeMinutes:5}},await rt.burningEventSettings(f.env,{fresh:true}));
  assert.equal(settings.energy.rechargeMinutes,15);assert.equal(settings.__burningActivatedAt,undefined);
  assert.equal(JSON.parse(JSON.stringify(settings)).energy.__martialLaw,undefined);
  const pve=await rt.battleEnergyState(f.env,user,settings),apoc=await rt.apocalypseEnergyState(f.env,user);
  assert.equal(pve.energy,1);assert.equal(Date.parse(pve.nextRechargeAt),base+9*60000);
  assert.equal(apoc.energy,1);assert.equal(apoc.rechargeMinutes,90);assert.equal(Date.parse(apoc.nextRechargeAt),base+30*60000);
  f.now=base+9*60000;assert.equal((await rt.battleEnergyState(f.env,user,settings)).energy,2);
  f.now=base+30*60000;const expired=await rt.apocalypseEnergyState(f.env,user);
  assert.equal(expired.energy,2);assert.equal(expired.rechargeMinutes,30);assert.equal(Date.parse(expired.nextRechargeAt),base+60*60000);
 });
}
test('battle rewards and sweep use 0.9 with every Burning mode; other drops and capacity preserved',async t=>{
 const f=await martialFixture();t.after(()=>f.close());await f.request(owner,'PATCH',draft());const rt=runtime(f),law=await raw(f);
 for(const [enabled,battleRewardMultiplier] of [[false,1],[true,1.5],[true,2.5],[true,100]]){
  const burning=policy.composeMartialBurning({enabled,battleRewardMultiplier,pveMaxEnergy:30,rechargeMinutes:1,activatedAt:new Date(f.now).toISOString()},law,f.now);
  const base={energy:{maxEnergy:5,dailyRestore:5,rechargeMinutes:5},items:{fixed:4}};
  const settings=rt.applyBurningPveSettings(base,burning),pvp=rt.applyBurningPvpSettings({energy:{maxEnergy:5,rechargeMinutes:2.5}},burning);
  assert.equal(rt.burningRewardAmount(1000,burning),1000*(enabled?battleRewardMultiplier:1)*.9);
  assert.equal(settings.__burningRewardMultiplier,burning.effectiveBattleRewardMultiplier);
  assert.equal(settings.items,base.items);assert.equal(pvp.energy.maxEnergy,5);assert.equal(pvp.energy.rechargeMinutes,7.5);
 }
});
test('recharge integrates early revocation, multiple windows, fractional seconds and cap spending',()=>{
 const t=Date.parse('2026-10-18T00:00:00Z'),cfg={maxEnergy:5,rechargeMinutes:2.5,__martialBaseRechargeMinutes:2.5,__martialLaw:{windows:[[t,t+60000],[t+120000,t+240000]]}};
 const result=policy.martialRecharge(0,t-30000,cfg,t+270000);
 assert.equal(result.energy,1);assert.equal(result.last,t+240000);assert.equal(Date.parse(result.nextRechargeAt),t+390000);
 const thirds={maxEnergy:5,rechargeMinutes:1,__martialLaw:{windows:[[t,t+1000]]}};
 const charge=policy.martialRecharge(0,t,thirds,t+120667);
 assert.equal(charge.energy,2);assert.equal(charge.last,t+120667);
 assert.equal(policy.martialSqlUtc(charge.last),'2026-10-18 00:02:00.667');
 const full=policy.martialRecharge(4,t,cfg,t+86400000);assert.equal(full.energy,5);assert.equal(full.nextRechargeAt,null);
});
test('ranked actual commit charges one action and keeps expiry-aware next charge through receipt replay',async t=>{
 const f=await martialFixture();t.after(()=>f.close());const base=f.now;
 await f.request(owner,'PATCH',draft());const law=await raw(f),settings={enabled:true,seasonName:'QA',startsAt:policy.martialSqlUtc(base-60000),endsAt:policy.martialSqlUtc(base+86400000),energy:policy.martialEnergyConfig({enabled:true,maxEnergy:5,costPerBattle:1,rechargeMinutes:2.5},law,base)};
 await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)','pvp_settings_v1',JSON.stringify(settings)).run();
 await f.p('INSERT INTO users VALUES(1,100,0)').run();await f.p('INSERT INTO pvp_profiles VALUES(1,1000)').run();
 await f.p('INSERT INTO user_pvp_energy VALUES(1,2,?,NULL)',policy.martialSqlUtc(base-60000)).run();
 await f.p('INSERT INTO pvp_ranked_match_tickets_v1671 VALUES(?,1,NULL,?)','qa-ticket',policy.martialSqlUtc(base+60000)).run();
 const energy=await readRankedEnergy(f.env,owner,settings.energy,{now:base});
 const input={user:owner,settings,ticket:{token:'qa-ticket'},requestId:'qa-request',energy,beforeScore:1000,writes:[f.p('UPDATE users SET coin=coin+45 WHERE id=1')],response:{coinReward:45},now:base};
 const result=await commitRankedFight(f.env,input);assert.equal(result.energy.energy,1);assert.equal(Date.parse(result.energy.nextRechargeAt),base+270000);
 assert.equal((await rankedFightReceipt(f.env,1,'qa-request','qa-ticket')).replayed,true);
 assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),145);
});
test('client clamps Apocalypse base interval and applies only live martial delay',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8'),now=Date.now(),normalize=vm.runInNewContext(app.slice(app.indexOf('function normalizeApocalypseEnergyClient('),app.indexOf('function activeBattleEnergy('))+';normalizeApocalypseEnergyClient',{APOCALYPSE_ENERGY_MAX:5,APOCALYPSE_ENERGY_RECHARGE_MINUTES:30,burningClientNow:()=>now});
 const state={energy:2,rechargeMinutes:999,martialLawEndsAt:new Date(now+60000).toISOString()};
 assert.equal(normalize(state).rechargeMinutes,90);
 assert.equal(normalize({...state,martialLawEndsAt:new Date(now).toISOString()}).rechargeMinutes,30);
 assert.equal(normalize({...state,burningMode:'MIRACLE',burningEndsAt:new Date(now+60000).toISOString()}).rechargeMinutes,15);
});

