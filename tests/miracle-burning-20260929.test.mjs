import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import * as access from '../functions/_burning_event_access.js';
import * as miracle from '../functions/_miracle_burning.js';
import {resolveAvatarDropRate,withAvatarDropScope,miracleDropIncreasePercent} from '../functions/_avatar_drop.js';
import {__avatarDropPoolTest} from '../functions/_drop_pool.js';

const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT);CREATE TABLE user_apocalypse_energy(user_id INTEGER PRIMARY KEY,energy INTEGER,last_recharged_at TEXT,updated_at TEXT)");
  const DB={prepare(sql){
    let values=[];
    return {sql,bind(...args){values=args;return this},
      async first(){return sqlite.prepare(sql).get(...values)||null},
      async all(){return {results:sqlite.prepare(sql).all(...values)}},
      async run(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}}}
    };
  }},env={DB};
  DB.batch=async statements=>{sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(/^\s*SELECT/i.test(s.sql)?await s.all():await s.run());sqlite.exec('COMMIT');return result}catch(error){sqlite.exec('ROLLBACK');throw error}};
  const write=(key,value)=>sqlite.prepare('INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)').run(key,JSON.stringify(value));
  const read=key=>JSON.parse(sqlite.prepare('SELECT value FROM app_meta WHERE key=?').get(key)?.value||'{}');
  const context={...access,...miracle,console};
  const runtime=vm.runInNewContext(api.slice(api.indexOf("const BURNING_EVENT_META_KEY="),api.indexOf('function defaultPvpSettings()'))+';({cleanBurningEventSettings,cleanBurningEventPair,burningEventPair,burningPublicState,applyBurningPveSettings,applyBurningPvpSettings,burningRewardAmount,activateChiefBurningEvent,reset:()=>{burningEventCache=null}})',context);
  const logs=[],deps={...runtime,authenticate:async request=>request.identity,json:(body,status=200)=>({body,status}),readBody:request=>request.json(),writeAdminLog:async(...args)=>logs.push(args),invalidate:()=>runtime.reset()};
  const request=(identity,method='GET',settings={})=>miracle.handleMiracleBurningAdmin({env,deps,request:{identity,method,json:async()=>({settings})}});
  const route=api.slice(api.indexOf("    if(path==='admin/burning-event'||path==='admin/hyper-burning-event'){"),api.indexOf("    if(path==='admin/card-packs'){"));
  const normalRoute=vm.runInNewContext(`(async(path,request)=>{${route}})`,{...context,...deps,env,burningEventCache:null,BURNING_EVENT_META_KEY:'burning_event_settings_v1',HYPER_BURNING_EVENT_META_KEY:'hyper_burning_event_settings_v1310',invalidateEquipmentPromotionCache:()=>runtime.reset()});
  const normalRequest=(identity,path,settings)=>normalRoute(path,{identity,method:'PATCH',json:async()=>({settings})});
  return {sqlite,env,write,read,runtime,logs,request,normalRequest};
}
const owner={id:1,role:'OWNER',nickname:'핑크빛유두'};
const active=()=>({...miracle.defaultMiracleBurningSettings(),enabled:true,endsAt:new Date(Date.now()+3600000).toISOString(),activatedAt:new Date().toISOString()});

test('only exact named OWNER may read, save, activate or stop Miracle',async()=>{
  const f=fixture();
  try{
    for(const identity of [null,{...owner,role:'USER'},{...owner,role:'ADMIN'},{...owner,nickname:'다른 OWNER'},{...owner,nickname:' 핑크빛유두'},{...owner,nickname:'핑크빛유두 '},{...owner,nickname:'핑크빛유두님'}])
      for(const method of ['GET','PATCH']){const result=await f.request(identity,method,{enabled:true});assert.equal(result.status,identity?403:401)}
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM app_meta').get().n,0);
    assert.equal(f.logs.length,0);
    assert.equal((await f.request(owner)).status,200);
    assert.equal((await f.request(owner,'DELETE')).status,405);
  }finally{f.sqlite.close()}
});

test('ordinary OWNER and chief routes cannot displace Miracle; named OWNER can switch modes',async()=>{
  const f=fixture();try{
    f.write(miracle.MIRACLE_BURNING_META_KEY,active());
    await assert.rejects(f.runtime.activateChiefBurningEvent(f.env,{type:'HYPER'}),/미라클 버닝/);
    for(const path of ['admin/burning-event','admin/hyper-burning-event']){
      const rejected=await f.normalRequest({...owner,nickname:'다른 OWNER'},path,{enabled:true,durationMinutes:60});
      assert.equal(rejected.status,409);assert.equal(rejected.body.code,'MIRACLE_BURNING_ACTIVE');
      assert.equal(f.read(miracle.MIRACLE_BURNING_META_KEY).enabled,true);
    }
    assert.equal(f.logs.length,0);
    const switched=await f.normalRequest(owner,'admin/hyper-burning-event',{enabled:true,durationMinutes:60});
    assert.equal(switched.status,200);assert.equal(switched.body.activeMode,'HYPER');
    assert.equal(f.read(miracle.MIRACLE_BURNING_META_KEY).enabled,false);
  }finally{f.sqlite.close()}
});

test('client uses live Miracle 10/5 only and clamps expired, stale or forged energy limits',()=>{
  const source=readFileSync(new URL('../js/app.js',import.meta.url),'utf8'),now=Date.now();
  const normalize=vm.runInNewContext(source.slice(source.indexOf('function normalizeApocalypseEnergyClient('),source.indexOf('function activeBattleEnergy('))+';normalizeApocalypseEnergyClient',{APOCALYPSE_ENERGY_MAX:5,APOCALYPSE_ENERGY_RECHARGE_MINUTES:30,burningClientNow:()=>now});
  const state={energy:99,maxEnergy:999,rechargeMinutes:1,costPerBattle:0,burningMode:'MIRACLE',burningEndsAt:new Date(now+1000).toISOString()};
  const live=normalize(state);assert.equal(live.energy,10);assert.equal(live.maxEnergy,10);assert.equal(live.rechargeMinutes,5);assert.equal(live.costPerBattle,1);
  for(const stale of [{...state,burningEndsAt:new Date(now).toISOString()},{...state,burningMode:'HYPER'},{energy:99,maxEnergy:999}]){
    const normal=normalize(stale);assert.equal(normal.maxEnergy,5);assert.equal(normal.energy,5);assert.equal(normal.rechargeMinutes,30);
  }
});

test('Legion hunt snapshots Miracle probabilities without changing items or session rewards',async()=>{
  const {legionFixture}=await import('./helpers/legion-hunt-fixture.mjs'),f=await legionFixture();
  const captured=[];f.deps.createSession=options=>{captured.push(options);return {id:'qa-session',payload:{},exportState:()=>({id:'qa-session',dropPolicy:options.dropPolicy})}};
  try{
    const policy=await f.configure(3);policy.difficulties.forEach(d=>{d.dropPercent=10;d.bossDropPercent=90});
    assert.equal((await f.call('admin/legion-hunt',{policy},{method:'PATCH'})).status,200);
    await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind(miracle.MIRACLE_BURNING_META_KEY,JSON.stringify(active())).run();
    assert.equal((await f.call('legion-hunt/start',{difficulty:'normal'})).status,200);
    const run=JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind('legion_hunt_owner_session_v1:1').first()).value);
    assert.equal(run.state.dropPolicy.dropChance,.13);assert.equal(run.state.dropPolicy.bossDropChance,1);assert.equal(run.liveRewards,false);
    assert.equal(captured[0].dropPolicy.items[0].minQuantity,3);
    await f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify({...active(),enabled:false}),miracle.MIRACLE_BURNING_META_KEY).run();
    assert.equal((await f.call('legion-hunt/start',{difficulty:'normal'})).status,200);
    assert.equal(captured[1].dropPolicy.dropChance,.1);assert.equal(captured[1].dropPolicy.bossDropChance,.9);
  }finally{await f.close()}
});
test('activation persists fixed effects and ends other modes atomically; OFF and expiry restore base rules',async()=>{
  const f=fixture();
  try{
    f.write('burning_event_settings_v1',{...active(),mode:'BURNING'});f.write('hyper_burning_event_settings_v1310',{...active(),mode:'HYPER'});
    const saved=await f.request(owner,'PATCH',{enabled:true,durationMinutes:30,battleRewardMultiplier:100,pveMaxEnergy:999,pvpMaxEnergy:888,rechargeMinutes:99,apocalypseMaxEnergy:999,dropIncreasePercent:999});
    assert.equal(saved.status,200);assert.equal(saved.body.activeMode,'MIRACLE');
    const s=saved.body.settings;assert.equal(s.pveMaxEnergy,30);assert.equal(s.pvpMaxEnergy,30);assert.equal(s.rechargeMinutes,1);assert.equal(s.apocalypseMaxEnergy,10);assert.equal(s.apocalypseRechargeMinutes,5);assert.equal(s.dropIncreasePercent,30);
    assert.equal(Date.parse(s.endsAt)-Date.parse(s.activatedAt),1800000);assert.equal(s.generation,1);
    assert.equal(f.read('burning_event_settings_v1').enabled,false);assert.equal(f.read('hyper_burning_event_settings_v1310').enabled,false);assert.equal(f.logs.length,1);
    assert.equal(f.runtime.applyBurningPveSettings({energy:{costPerBattle:1}},s).energy.maxEnergy,30);
    assert.equal(f.runtime.applyBurningPvpSettings({energy:{costPerBattle:1}},s).energy.rechargeMinutes,1);
    assert.equal(f.runtime.burningRewardAmount(1234,s),123400);
    const state=f.runtime.burningPublicState(s);assert.equal(state.apocalypse.maxEnergy,10);assert.equal(state.dropIncreasePercent,30);
    assert.equal(miracle.miracleApocalypseConfig({maxEnergy:5,rechargeMinutes:30},s,Date.parse(s.endsAt)).maxEnergy,5);
    const stopped=await f.request(owner,'PATCH',{enabled:false,durationMinutes:60,battleRewardMultiplier:25});
    assert.equal(stopped.body.activeMode,'NONE');assert.equal(stopped.body.settings.generation,1);
    assert.equal(f.runtime.burningRewardAmount(1234,stopped.body.settings),1234);assert.equal(await miracle.readMiracleDropPercent(f.env),0);
    for(const multiplier of [0,100.1,-1,'bad'])assert.equal((await f.request(owner,'PATCH',{enabled:true,durationMinutes:60,battleRewardMultiplier:multiplier})).status,400);
    assert.equal((await f.request(owner,'PATCH',{enabled:true,durationMinutes:31,battleRewardMultiplier:100})).status,400);
    assert.equal(f.read(miracle.MIRACLE_BURNING_META_KEY).enabled,false);
  }finally{f.sqlite.close()}
});
test('a failed event transaction does not leave a partly activated event',async()=>{
  const f=fixture();try{
    f.write('burning_event_settings_v1',{...active(),mode:'BURNING'});
    f.sqlite.exec("CREATE TRIGGER reject_hyper BEFORE INSERT ON app_meta WHEN NEW.key='hyper_burning_event_settings_v1310' BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    await assert.rejects(f.request(owner,'PATCH',{enabled:true,durationMinutes:60,battleRewardMultiplier:100}),/fixture failure/);
    assert.equal(f.read(miracle.MIRACLE_BURNING_META_KEY).enabled,undefined);assert.equal(f.read('burning_event_settings_v1').enabled,true);assert.equal(f.logs.length,0);
  }finally{f.sqlite.close()}
});
test('30% boosts probability after avatar, clamps 100%, and refreshes on the next request',async()=>{
  const f=fixture();try{
    f.write('avatar_settings_v1',{mode:'OFF'});f.write(miracle.MIRACLE_BURNING_META_KEY,active());
    const scoped=withAvatarDropScope(f.env);
    assert.equal((await resolveAvatarDropRate(scoped,1,10)).total,13);
    assert.equal((await resolveAvatarDropRate(scoped,1,90)).total,100);
    assert.equal((await resolveAvatarDropRate(scoped,1,0)).total,0);
    assert.equal((await resolveAvatarDropRate(scoped,1,100)).total,100);
    assert.equal(miracle.applyMiracleDropChance(15,30),19.5);
    f.write(miracle.MIRACLE_BURNING_META_KEY,{...active(),endsAt:'2000-01-01T00:00:00Z'});
    assert.equal(await miracleDropIncreasePercent(scoped),30);
    assert.equal((await resolveAvatarDropRate(withAvatarDropScope(f.env),1,10)).total,10);
  }finally{f.sqlite.close()}
});
test('independent and weighted drop pools boost chance while preserving quantities and relative weights',()=>{
  const roll=__avatarDropPoolTest.rollPool,entry={id:1,is_enabled:1,chance_percent:10,weight:1,reward_type:'INVENTORY_ITEM',reward_ref:'QA',min_quantity:2,max_quantity:2,daily_limit:4},pool={id:1,code:'QA',rolls:1,roll_mode:'INDEPENDENT'};
  assert.equal(roll(pool,[entry],{},()=>.12).length,0);
  const result=roll(pool,[entry],{miracleDropPercent:30},()=>.12);assert.equal(result.length,1);assert.equal(result[0].quantity,2);assert.equal(result[0].dailyLimit,4);
  assert.equal(roll(pool,[entry],{miracleDropPercent:30},()=>.13).length,0);
  assert.equal(roll(pool,[{...entry,chance_percent:0}],{miracleDropPercent:30},()=>0).length,0);
  const counts=[0,0,0],weighted={...pool,roll_mode:'WEIGHTED_ONE',no_drop_weight:16};
  for(let i=0;i<10000;i++){const r=roll(weighted,[entry,{...entry,id:2,weight:3}],{miracleDropPercent:30},()=>(i+.5)/10000)[0];counts[r?.entryId||0]++}
  assert.deepEqual(counts,[7400,650,1950]);
});
test('actual Apocalypse pool refills once, spends atomically and recharges one every five minutes',async()=>{
  const f=fixture();let now=Math.floor(Date.now()/1000)*1000+250,burning={...active(),activatedAt:new Date(now).toISOString()};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
  const context={Date:Clock,APOCALYPSE_ENERGY_CONFIG:{enabled:true,maxEnergy:5,rechargeMinutes:30,costPerBattle:1},miracleApocalypseConfig,
    ensureApocalypseEnergyFoundation:async()=>{},burningEventSettings:async()=>burning,maintenanceSettings:async()=>({active:false}),isAdminRole:()=>false,canUseTestAccess:()=>false,
    sqlUtcNow:()=>new Date(now).toISOString().replace('T',' ').slice(0,19),utcMs:value=>Date.parse(String(value).replace(' ','T')+'Z')};
  function miracleApocalypseConfig(base,state){return miracle.miracleApocalypseConfig(base,state,now)}
  const energy=vm.runInNewContext(api.slice(api.indexOf('async function apocalypseEnergyState('),api.indexOf('async function pveEnergyStateForDifficulty('))+';({state:apocalypseEnergyState,consume:consumeApocalypseEnergy})',context);
  try{
    f.sqlite.prepare('INSERT INTO user_apocalypse_energy VALUES(?,?,?,?)').run(1,1,new Date(now-3600000).toISOString().replace('T',' ').slice(0,19),'');
    assert.equal((await energy.state(f.env,{id:1})).energy,10);
    assert.equal((await energy.consume(f.env,{id:1})).energy,9);
    assert.equal((await energy.state(f.env,{id:1})).energy,9,'same activation second cannot refill a spent action');
    now+=299000;assert.equal((await energy.state(f.env,{id:1})).energy,9);
    now+=1000;assert.equal((await energy.state(f.env,{id:1})).energy,10);
    for(let i=0;i<10;i++)await energy.consume(f.env,{id:1});
    await assert.rejects(energy.consume(f.env,{id:1}),error=>error.code==='NO_APOCALYPSE_ENERGY');
    burning={...burning,enabled:false};const base=await energy.state(f.env,{id:1});assert.equal(base.maxEnergy,5);assert.equal(base.rechargeMinutes,30);
  }finally{f.sqlite.close()}
});

test('actual PVE and PVP pools spend 30 actions, refill one per minute and restore normal caps',async()=>{
  const f=fixture();let now=Math.floor(Date.now()/1000)*1000+250;
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
  const context={Date:Clock,maintenanceSettings:async()=>({active:false}),isAdminRole:()=>false,canUseTestAccess:()=>false,kstDate:()=>new Date(now).toISOString().slice(0,10),sqlUtcNow:()=>new Date(now).toISOString().replace('T',' ').slice(0,19),utcMs:value=>Date.parse(String(value).replace(' ','T')+'Z')};
  const pve=vm.runInNewContext(api.slice(api.indexOf('async function battleEnergyState('),api.indexOf('// V1975:'))+';({state:battleEnergyState,consume:consumeBattleEnergy})',context);
  const pvp=vm.runInNewContext(api.slice(api.indexOf('async function pvpEnergyState('),api.indexOf('function defaultRaidSettings()'))+';({state:pvpEnergyState,consume:consumePvpEnergy})',context);
  try{
    f.sqlite.exec('CREATE TABLE user_battle_energy(user_id INTEGER PRIMARY KEY,energy INTEGER,last_recharged_at TEXT,last_daily_reset_date TEXT,updated_at TEXT);CREATE TABLE user_pvp_energy(user_id INTEGER PRIMARY KEY,energy INTEGER,last_recharged_at TEXT,updated_at TEXT)');
    const saved=await f.request(owner,'PATCH',{enabled:true,durationMinutes:60,battleRewardMultiplier:100}),burning=saved.body.settings;
    assert.equal(Date.parse(burning.activatedAt)%1000,0);
    now=Date.parse(burning.activatedAt)+250;
    const base={energy:{enabled:true,maxEnergy:10,dailyRestore:10,rechargeMinutes:30,costPerBattle:1}};
    for(const [pool,settings,code] of [[pve,f.runtime.applyBurningPveSettings(base,burning),'NO_BATTLE_ENERGY'],[pvp,f.runtime.applyBurningPvpSettings(base,burning),'NO_PVP_ENERGY']]){
      assert.equal((await pool.state(f.env,{id:1},settings)).energy,30);
      assert.equal((await pool.consume(f.env,{id:1},settings)).energy,29,'first activation second still charges an action');
      now+=60000;assert.equal((await pool.state(f.env,{id:1},settings)).energy,30);
      for(let i=0;i<30;i++)await pool.consume(f.env,{id:1},settings);
      await assert.rejects(pool.consume(f.env,{id:1},settings),e=>e.code===code);
      now+=60000;assert.equal((await pool.state(f.env,{id:1},settings)).energy,1);
      const off=await pool.state(f.env,{id:1},base);assert.equal(off.maxEnergy,10);assert.equal(off.rechargeMinutes,30);
    }
  }finally{f.sqlite.close()}
});
