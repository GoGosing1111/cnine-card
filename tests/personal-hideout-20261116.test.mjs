import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {SeasonSQLiteDB} from './helpers/season-s1-db.mjs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {emptyHideout,HIDEOUT_KEY,HIDEOUT_FURNITURE,HIDEOUT_STOCK_LIMITS,changeHideout,hideoutBenefits,hideoutCardRates,hideoutAward,hideoutDailyAward,hideoutCost,hideoutState,publicHideout} from '../shared/personal-hideout-v1.mjs';
import {hideoutPartyEnergy} from '../shared/personal-hideout-energy-v1.mjs';
import {LEGION_RECOVERY_EVENT} from '../shared/legion-hunt-energy-v1.mjs';
import {hideoutAwardStatements,mutateHideout,readHideout,handlePersonalHideout} from '../functions/_personal_hideout.js';
import {contentProgressionStatements} from '../functions/_content_progression.js';

async function fixture(t,postgres=false){
 let DB,pg,failure='';const schema=[
  'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
  'CREATE TABLE users(id INTEGER PRIMARY KEY,coin BIGINT NOT NULL)',
  'CREATE TABLE coin_logs(user_id INTEGER,change_amount BIGINT,balance_after BIGINT,reason TEXT)',
  'INSERT INTO users(id,coin) VALUES(7,100000000000000000)'
 ].join(';');
 if(postgres){pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;"+schema);DB=new __postgresCompatTest.PostgresD1Database({async query(input){const sql=typeof input==='string'?input:input.text;if(failure&&sql.includes(failure))throw Error('INJECTED_FAILURE');const r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});}
 else {DB=new SeasonSQLiteDB();DB.sql.exec(schema);}
 t.after(()=>pg?pg.close():DB.sql.close());const env={DB,PERSONAL_HIDEOUT_ENABLED:'1'};
 return {env,DB,fail:s=>{failure=s;DB.failAt=s;},
  state:async()=>(await readHideout(env,7)).state,
  setWallet:coin=>DB.prepare('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=7').bind(String(coin)).run(),
  balance:async()=>(await DB.prepare('SELECT CAST(coin AS TEXT) AS coin FROM users WHERE id=7').first()).coin,
  ledger:async()=>(await DB.prepare('SELECT CAST(change_amount AS TEXT) AS change,CAST(balance_after AS TEXT) AS balance,reason FROM coin_logs WHERE user_id=7').all()).results.map(row=>({...row})),
  seed:async state=>DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(HIDEOUT_KEY(7),JSON.stringify(state)).run()};
}
const funded=()=>{const s=emptyHideout();for(const c of Object.keys(s.parts))s.parts[c]=10000;return s;};
const event=(eventId,source='NIGHTMARE')=>({userId:7,eventId,source,won:true});
const body=(revision,extra={})=>({requestId:crypto.randomUUID(),revision,...extra});

test('six cabinet slots preserve legacy display and share ownership limits across cabinets',()=>{
 let state={...funded(),level:2,rooms:['main','gallery'],placements:[{id:'old',kind:'decor',code:'trophy',room:'main',x:500,y:450,flipped:false,trophyCode:'RANKED_CHAMPION'}]};
 state=hideoutState(state);assert.deepEqual(state.placements[0].trophyCodes,['RANKED_CHAMPION',null,null,null,null,null]);
 state=changeHideout(state,'decorate',{revision:state.revision,item:'trophy',room:'gallery'},{newId:'second'});
 const ownedTrophies=[{code:'RANKED_CHAMPION',count:2}];
 state=changeHideout(state,'trophy',{revision:state.revision,id:'second',slot:5,trophyCode:'RANKED_CHAMPION'},{ownedTrophies});
 assert.equal(state.placements[1].trophyCodes[5],'RANKED_CHAMPION');
 assert.throws(()=>changeHideout(state,'trophy',{revision:state.revision,id:'old',slot:2,trophyCode:'RANKED_CHAMPION'},{ownedTrophies}),e=>e.code==='HIDEOUT_TROPHY');
 state=changeHideout(state,'trophy',{revision:state.revision,id:'old',slot:0,trophyCode:null},{ownedTrophies});
 state=changeHideout(state,'trophy',{revision:state.revision,id:'second',slot:4,trophyCode:'RANKED_CHAMPION'},{ownedTrophies});
 assert.equal(state.placements[0].trophyCode,null);assert.equal(state.placements[1].trophyCodes.filter(Boolean).length,2);
 for(const slot of [-1,6,1.5])assert.throws(()=>changeHideout(state,'trophy',{revision:state.revision,id:'old',slot,trophyCode:null},{ownedTrophies}));
 const fake=structuredClone(state.placements);fake[0].trophyCodes=Array(6).fill('FORGED');
 const arranged=changeHideout(state,'arrange',{revision:state.revision,placements:fake});assert.deepEqual(arranged.placements[0].trophyCodes,state.placements[0].trophyCodes);
 state=changeHideout(state,'upgrade',{revision:state.revision,target:'workbench',room:'gallery'});assert.equal(state.placements.at(-1).room,'gallery');
});

test('free unlock, level-gated facilities and rooms, independent decorative copies and trophy quantities',()=>{
 let s=changeHideout(funded(),'upgrade',{revision:0,target:'room'});
 assert.equal(hideoutBenefits(s).legionEnergy,1);assert.equal(hideoutBenefits(s).partyEnergy,1);
 for(const target of ['workbench','fridge','garage','armory','sofa','lamp'])s=changeHideout(s,'upgrade',{revision:s.revision,target});
 assert.deepEqual(hideoutBenefits(s),{unlocked:true,level:1,legionEnergy:2,partyEnergy:2,mercenaryEquipmentPercent:5,cardWeightPercent:2,coinPercent:2,materialDiscountPercent:3});
 assert.throws(()=>changeHideout(s,'upgrade',{revision:s.revision,target:'fridge'}),/레벨/);
 assert.throws(()=>changeHideout(s,'expand',{revision:s.revision,room:'gallery'}),/레벨/);
 const before={...s.parts},cost=hideoutCost(s,'room');s=changeHideout(s,'upgrade',{revision:s.revision,target:'room'});assert.equal(before.STEEL-s.parts.STEEL,cost.STEEL);
 s=changeHideout(s,'expand',{revision:s.revision,room:'gallery'});
 for(const id of ['stand1','stand2'])s=changeHideout(s,'decorate',{revision:s.revision,item:'trophy',room:'gallery'},{newId:id});
 const ownedTrophies=[{code:'CHAMPION',count:1}];
 s=changeHideout(s,'trophy',{revision:s.revision,id:'stand1',trophyCode:'CHAMPION'},{ownedTrophies});
 assert.throws(()=>changeHideout(s,'trophy',{revision:s.revision,id:'stand2',trophyCode:'CHAMPION'},{ownedTrophies}),/보유 수량/);
 assert.throws(()=>changeHideout(s,'trophy',{revision:s.revision,id:'stand2',trophyCode:'FORGED'}),/보유 수량/);
 const benefits=hideoutBenefits(s),placements=s.placements.map(p=>({...p,room:null,x:0,y:1000,flipped:true,code:'garage',trophyCode:'FORGED'}));
 s=changeHideout(s,'arrange',{revision:s.revision,placements});assert.equal(s.placements.find(p=>p.id==='stand1').trophyCode,'CHAMPION');assert.equal(s.placements[0].code,'workbench');assert.deepEqual(hideoutBenefits(s),benefits);
 assert.throws(()=>changeHideout(s,'arrange',{revision:s.revision,placements:s.placements.map(p=>({...p,x:-1}))}),/위치/);
 assert.throws(()=>changeHideout(s,'arrange',{revision:s.revision,placements:[]}),/전체/);
 assert.throws(()=>changeHideout(s,'upgrade',{revision:0,target:'room'}),/갱신/);
});
test('all six facility tracks and three residence upgrades expose exact coin prices',()=>{
 let state=funded();
 for(const cost of ['0','1000000000000000','5000000000000000','10000000000000000']){
  assert.equal(publicHideout(state).roomCoinCost,cost);
  state=changeHideout(state,'upgrade',{revision:state.revision,target:'room'});
 }
 assert.equal(publicHideout(state).roomCoinCost,null);
 for(const {code} of HIDEOUT_FURNITURE){
  for(const cost of ['1000000000000000','2500000000000000','5000000000000000','7500000000000000','10000000000000000']){
   assert.equal(publicHideout(state).facilities.find(f=>f.code===code).coinCost,cost);
   state=changeHideout(state,'upgrade',{revision:state.revision,target:code});
  }
  assert.equal(publicHideout(state).facilities.find(f=>f.code===code).coinCost,null);
 }
});
test('normal pack bonus changes relative high-grade weights only; combat eligibility is explicit',()=>{
 const rates=[{rarity:'C',rate:80},{rarity:'SSR',rate:19},{rarity:'ICON',rate:1},{rarity:'SSS',rate:0.01}],next=hideoutCardRates(rates,10);
 assert.deepEqual(next.map(r=>r.rate),[80,20.900000000000002,1.1,0.01]);assert.equal(rates[1].rate,19);
 for(const source of ['PVP','TOWER','SCRAPYARD','HUNT'])assert.equal(hideoutAward(event('x',source)),null);
 for(const extra of [{won:false},{eligible:false},{seasonReplay:true}])assert.equal(hideoutAward({...event('x'),...extra}),null);
 assert.deepEqual(hideoutAward({...event('x','LEGION'),won:false}),{CIRCUIT:2,COOLANT:2,DRIVE:1});
});

for(const postgres of [false,true]){
 const engine=postgres?'PostgreSQL':'SQLite';
 test(engine+' combat rewards are atomic, work without season/unlock, and identical statement replay is inert',async t=>{
  const f=await fixture(t,postgres),writes=await contentProgressionStatements(f.env,event('first'));assert.equal(writes.length,4);
  await f.DB.batch(writes);assert.equal((await f.state()).parts.CIRCUIT,1);assert.equal((await f.state()).level,0);
  await f.DB.batch(writes);await f.DB.batch(await contentProgressionStatements(f.env,event('first')));assert.equal((await f.state()).parts.CIRCUIT,1);
  await f.DB.batch(hideoutAwardStatements(f.env,event('guarded'),{guard:'1=0'}));assert.equal((await f.state()).parts.CIRCUIT,1);
  f.fail(postgres?'jsonb_set':'json_set');await assert.rejects(f.DB.batch(hideoutAwardStatements(f.env,event('rollback','RAID'),{randomInt:()=>0})),/INJECTED/);f.fail('');
  assert.equal((await f.state()).parts.CIRCUIT,1);assert.equal(await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind('personal_hideout_reward_v1:7:RAID:rollback').first(),null);
  await f.DB.batch(hideoutAwardStatements(f.env,event('rollback','RAID'),{randomInt:()=>0}));assert.equal((await f.state()).parts.CORE,3);
  const s=await f.state();s.parts.CIRCUIT=999999999;await f.seed(s);await f.DB.batch(hideoutAwardStatements(f.env,event('ceiling')));assert.equal((await f.state()).parts.CIRCUIT,1000000000);
 });
 test(engine+' mutations enforce replay identity, costs, rollback and concurrent reward CAS',async t=>{
  const f=await fixture(t,postgres),unlock=body(0,{target:'room'});
  await f.setWallet(0);
  const opened=await mutateHideout(f.env,7,'upgrade',unlock);assert.equal(opened.state.level,1);
  assert.equal(opened.upgradePayment.coin,'0');assert.equal(opened.coinBalance,'0');assert.deepEqual(await f.ledger(),[]);
  assert.equal((await mutateHideout(f.env,7,'upgrade',unlock)).replayed,true);
  const receiptKey='personal_hideout_mutation_v1:7:'+unlock.requestId;
  const legacyReceipt=JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first()).value);
  legacyReceipt.response.state.version=1;delete legacyReceipt.response.stages;delete legacyReceipt.response.space;
  await f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify(legacyReceipt),receiptKey).run();
  const restored=await mutateHideout(f.env,7,'upgrade',unlock);assert.equal(restored.replayed,true);assert.equal(restored.state.version,2);assert.equal(restored.stage.name,'판자촌');assert.equal(restored.space.width,2400);

  await assert.rejects(mutateHideout(f.env,7,'upgrade',{...unlock,target:'fridge'}),e=>e.code==='HIDEOUT_REQUEST_CONFLICT');
  await assert.rejects(mutateHideout(f.env,7,'upgrade',body(1,{target:'fridge'})),e=>e.code==='HIDEOUT_PARTS');
  await f.setWallet('100000000000000000');
  const fundedState={...funded(),level:1,revision:1,rooms:['main']};await f.seed(fundedState);
  const upgrade=body(1,{target:'garage'});f.fail('INSERT INTO joint_atomic_guards');await assert.rejects(mutateHideout(f.env,7,'upgrade',upgrade),/INJECTED/);f.fail('');assert.equal((await f.state()).facilities.garage,0);assert.equal((await f.state()).parts.STEEL,10000);
  const realBatch=f.DB.batch.bind(f.DB);let inject=true;f.DB.batch=async writes=>{if(inject){inject=false;await realBatch(hideoutAwardStatements(f.env,event('race')));}return realBatch(writes);};
  await assert.rejects(mutateHideout(f.env,7,'upgrade',upgrade),e=>e.code==='HIDEOUT_CONFLICT');f.DB.batch=realBatch;
  let s=await f.state();assert.equal(s.parts.STEEL,10000);assert.equal(s.parts.CIRCUIT,10001);assert.equal(s.facilities.garage,0);
  const completed=await mutateHideout(f.env,7,'upgrade',body(s.revision,{target:'garage'}));assert.equal(completed.state.facilities.garage,1);assert.equal(completed.state.parts.STEEL,9988);
  assert.equal(completed.coinBalance,'99000000000000000');
  assert.equal((await f.ledger()).length,1);
 });
 test(engine+' upgrade debits 1경 exactly with materials and rolls back both on settlement failure',async t=>{
  const f=await fixture(t,postgres),fee=10000000000000000n;
  const state={...funded(),level:3,revision:9,rooms:['main'],facilities:{...emptyHideout().facilities,workbench:4}};
  state.placements=[{id:'facility-workbench',kind:'facility',code:'workbench',room:'main',x:20,y:700,flipped:false,trophyCode:null}];
  await f.seed(state);
  const request=body(state.revision,{target:'room'});
  await f.setWallet(fee-1n);
  await assert.rejects(mutateHideout(f.env,7,'upgrade',request),e=>e.code==='HIDEOUT_COINS');
  assert.equal(await f.balance(),String(fee-1n));
  assert.deepEqual(await f.state(),state);

  // Simulate an independent debit between the quote and the transaction.
  await f.setWallet(fee+1n);
  const batch=f.DB.batch.bind(f.DB);
  f.DB.batch=async writes=>{
   f.DB.batch=batch;
   await f.setWallet(fee-1n);
   return batch(writes);
  };
  await assert.rejects(mutateHideout(f.env,7,'upgrade',request),e=>e.code==='HIDEOUT_COINS');
  assert.deepEqual(await f.state(),state);assert.deepEqual(await f.ledger(),[]);

  await f.setWallet(fee+1n);
  f.fail('INSERT INTO app_meta(key,value,updated_at)');
  await assert.rejects(mutateHideout(f.env,7,'upgrade',request),/INJECTED/);
  f.fail('');
  assert.equal(await f.balance(),String(fee+1n));assert.deepEqual(await f.state(),state);assert.deepEqual(await f.ledger(),[]);

  const upgraded=await mutateHideout(f.env,7,'upgrade',request);
  assert.equal(upgraded.state.level,4);assert.equal(upgraded.upgradePayment.coin,String(fee));assert.equal(upgraded.coinBalance,'1');
  assert.equal(upgraded.state.parts.HOUSING_PLAN,state.parts.HOUSING_PLAN-87);
  assert.equal((await mutateHideout(f.env,7,'upgrade',request)).replayed,true);
  assert.equal(await f.balance(),'1');
  assert.deepEqual(await f.ledger(),[{change:String(-fee),balance:'1',reason:'은신처 승급 · 펜트하우스'}]);

  await f.setWallet(fee);
  const facility=await mutateHideout(f.env,7,'upgrade',body(upgraded.state.revision,{target:'workbench'}));
  assert.equal(facility.state.facilities.workbench,5);assert.equal(facility.coinBalance,'0');assert.equal(await f.balance(),'0');
  assert.equal((await f.ledger()).length,2);
 });
}
test('authentication, request fields and feature gate are enforced by the real handler',async t=>{
 const f=await fixture(t),deps={json:(v,status)=>Response.json(v,{status}),authenticate:async()=>null,withUserMutationLock:(_e,_u,_p,fn)=>fn()};
 const call=(path='hideout',body)=>handlePersonalHideout({path,env:f.env,deps,request:new Request('https://game.test/api/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin:'https://game.test'},...(body?{body:JSON.stringify(body)}:{})})});
 assert.equal((await call()).status,401);deps.authenticate=async()=>({id:7});
 await f.setWallet('10000000000000001');
 const initial=await (await call()).json();assert.equal(initial.state.level,0);assert.equal(initial.coinBalance,'10000000000000001');
 assert.equal((await call('hideout/upgrade',{...body(0,{target:'room'}),parts:{STEEL:100}})).status,400);
 assert.equal((await call('hideout/upgrade',{...body(0,{target:'room'}),coinCost:'0'})).status,400);
 f.env.PERSONAL_HIDEOUT_ENABLED='0';assert.equal((await call('hideout/upgrade',body(0,{target:'room'}))).status,423);
});
test('party capacity preserves partial recovery, legacy deadline, event boundaries and extreme pulses',()=>{
 const hour=3600000,end=LEGION_RECOVERY_EVENT.endsAt,at=end+hour;
 let s=hideoutPartyEnergy(null,{at,maximum:2});assert.equal(s.current,2);
 s={...s,current:1};let later=hideoutPartyEnergy(s,{at:at+3*hour,maximum:3});assert.equal(later.current,1);assert.equal(later.nextRechargeAt,at+6*hour);
 later=hideoutPartyEnergy(later,{at:at+6*hour,maximum:3});assert.equal(later.current,2);
 assert.equal(hideoutPartyEnergy(null,{at,maximum:2,deadline:String(at+3*hour)}).current,0);
 assert.equal(hideoutPartyEnergy(null,{at:at+3*hour,maximum:2,deadline:String(at+3*hour)}).current,1);
 const during=LEGION_RECOVERY_EVENT.startsAt+hour,legacy=String(during+6*hour);
 const pending=hideoutPartyEnergy(null,{at:during+3*hour-1,maximum:2,deadline:legacy});
 assert.equal(pending.current,0);assert.equal(pending.nextRechargeAt,during+3*hour);
 assert.equal(hideoutPartyEnergy(null,{at:during+3*hour,maximum:2,deadline:legacy}).current,1);
 const record={version:1,current:0,updatedAt:end-hour,generation:0};
 assert.equal(hideoutPartyEnergy(record,{at:end+4*hour,maximum:2}).current,1);
 const pulses=[{at:at+hour,generation:1}],boost=hideoutPartyEnergy({...s,current:0},{at:at+hour,maximum:2,pulses});assert.equal(boost.current,1);assert.equal(hideoutPartyEnergy(boost,{at:at+hour,maximum:2,pulses}).current,1);
 assert.throws(()=>hideoutPartyEnergy(null,{at,maximum:100}));
});


test('four residences expand continuous space while preserving furniture, trophies and five facility levels',()=>{
 let s=funded();const names=['판자촌','일반 아파트','고급 아파트','펜트하우스'];let lastWidth=0;
 for(let i=0;i<4;i++){
  const cost=hideoutCost(s,'room'),before=s.parts.STEEL;s=changeHideout(s,'upgrade',{revision:s.revision,target:'room'});
  assert.equal(s.parts.STEEL,before-(cost.STEEL||0));
  if(i===0){s=changeHideout(s,'upgrade',{revision:s.revision,target:'workbench'});s=changeHideout(s,'decorate',{revision:s.revision,item:'trophy',room:'main'},{newId:'cabinet'});}
  const data=publicHideout(s);assert.equal(data.stage.name,names[i]);assert(data.space.width>lastWidth);lastWidth=data.space.width;
  assert.equal(data.state.placements[0].id,'facility-workbench');assert.equal(data.state.placements[1].trophyCodes.length,6);
 }
 assert.equal(hideoutCost(s,'room'),null);assert.throws(()=>changeHideout(s,'upgrade',{revision:s.revision,target:'room'}),/최대/);
 while(s.facilities.workbench<5)s=changeHideout(s,'upgrade',{revision:s.revision,target:'workbench'});
 assert.equal(hideoutCost(s,'workbench'),null);assert.equal(hideoutBenefits(s).materialDiscountPercent,15);
 const before=structuredClone(s.placements);s=changeHideout(s,'expand',{revision:s.revision,room:'workshop'});
 const rooms=publicHideout(s).space.rooms;assert.equal(rooms[1].start,rooms[0].width);assert.deepEqual(s.placements,before);
 const legacy={...structuredClone(s),version:1,level:5};assert.equal(hideoutState(legacy).level,4);assert.equal(hideoutState(legacy).version,2);assert.deepEqual(hideoutState(legacy).placements,s.placements);assert.deepEqual(hideoutState(legacy).parts,s.parts);assert.equal(hideoutState(legacy).facilities.workbench,5);
 assert.throws(()=>hideoutState({...emptyHideout(),facilities:{workbench:1}}),/시설/);
});

test('core salvage rolls once per legion clear and three times independently per raid clear',()=>{
 const legion=event('legion','LEGION'),raid=event('raid','RAID');
 const failIfDrawn=()=>assert.fail('unexpected core draw');
 for(const e of [event('hunt'),{...legion,won:false},{...raid,won:false},{...legion,eligible:false},{...raid,seasonReplay:true},event('other','TOWER')])assert.equal(hideoutAward(e,failIfDrawn)?.CORE,undefined);
 let hits=0;
 for(let ticket=0;ticket<10_000;ticket++){
  let calls=0;const gains=hideoutAward(legion,total=>{assert.equal(total,10_000);calls++;return ticket;});
  assert.equal(calls,1);assert.equal(gains.CORE??0,ticket<175?1:0);hits+=gains.CORE??0;
 }
 assert.equal(hits,175);
 for(const [rolls,cores] of [[[175,9999,500],0],[[174,175,176],1],[[0,9999,174],2],[[174,174,174],3]]){
  const tickets=[...rolls];const gains=hideoutAward(raid,()=>{assert(tickets.length);return tickets.shift();});
  assert.equal(tickets.length,0);assert.deepEqual(gains,{CIRCUIT:6,COOLANT:4,DRIVE:4,...(cores?{CORE:cores}:{})});
 }
});

for(const postgres of [false,true]){
 const engine=postgres?'PostgreSQL':'SQLite';
 test(engine+' settlement receipts preserve both a miss and a hit across retries',async t=>{
  const f=await fixture(t,postgres);
  for(const [id,first,second,cores] of [['miss',9999,0,0],['hit',0,9999,1]]){
   const e=event(id,'LEGION'),plan=hideoutAwardStatements(f.env,e,{randomInt:()=>first});
   await f.DB.batch(plan);
   const readReceipt=async()=>JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(plan.hideoutReceipt).first()).value);
   const receipt=await readReceipt();assert.equal(receipt.applied,true);assert.equal(receipt.gains.CORE??0,cores);
   await f.DB.batch(hideoutAwardStatements(f.env,e,{randomInt:()=>second}));assert.deepEqual(await readReceipt(),receipt);
  }
  const saved=await f.state();assert.equal(saved.parts.CORE,1);assert.equal(saved.parts.STEEL,0);assert.equal(saved.parts.CIRCUIT,4);assert.equal(saved.revision,2);
  assert(!Object.hasOwn(JSON.parse((await readHideout(f.env,7)).raw),'activityDates'));
 });
 test(engine+' all residence tiers can be built immediately from materials, with one debit per upgrade',async t=>{
  const f=await fixture(t,postgres);
  let state={...funded(),level:1,rooms:['main'],activityDates:[20000]};await f.seed(state);
  for(const [steel,plans,structure] of [[240,21,7],[560,48,16],[1040,87,29]]){
   const cost=hideoutCost(state,'room');
   assert.equal(cost.STEEL,steel);assert.equal(cost.HOUSING_PLAN,plans);assert.equal(cost.STRUCTURE,structure);
   const storedStructure=state.parts.STRUCTURE;
   state.parts.HOUSING_PLAN=plans;state.parts.STRUCTURE=structure-1;await f.seed(state);
   const wallet=await f.balance();
   await assert.rejects(mutateHideout(f.env,7,'upgrade',body(state.revision,{target:'room'})),e=>e.code==='HIDEOUT_PARTS');
   assert.equal(await f.balance(),wallet);assert.equal((await f.state()).parts.STRUCTURE,structure-1);
   state.parts.STRUCTURE=storedStructure;state.parts.HOUSING_PLAN=plans-1;await f.seed(state);
   const upgrade=body(state.revision,{target:'room'});
   await assert.rejects(mutateHideout(f.env,7,'upgrade',upgrade),e=>e.code==='HIDEOUT_PARTS');
   const before=await f.state();assert.equal(before.parts.HOUSING_PLAN,plans-1);assert.equal(before.revision,state.revision);
   await f.DB.batch(hideoutAwardStatements(f.env,{...event('plan-for-'+plans,'LEGION'),startedAt:Date.UTC(2026,10,plans)},{randomInt:()=>0}));
   const ready=await f.state(),request=body(ready.revision,{target:'room'}),result=await mutateHideout(f.env,7,'upgrade',request);
   assert.equal(result.state.level,state.level+1);assert.equal(result.state.parts.HOUSING_PLAN,0);assert.equal(result.state.parts.STEEL,ready.parts.STEEL-steel);
   assert.equal(result.state.parts.STRUCTURE,ready.parts.STRUCTURE-structure);
   assert.deepEqual(result.state.activityDates,[]);assert(result.stages.every(stage=>!Object.hasOwn(stage,'activeDays')));
   assert.equal((await mutateHideout(f.env,7,'upgrade',request)).replayed,true);
   state=await f.state();assert.equal(state.parts.STEEL,result.state.parts.STEEL);
  }
  assert.equal(state.level,4);assert(!Object.hasOwn(JSON.parse((await readHideout(f.env,7)).raw),'activityDates'));
 });
}

test('ordinary progression retains a 50-day horizon with capped materials and no rare drops',()=>{
 for(const [sources,expected] of [
  [['LEGION','APOCALYPSE','TOWER'],58],
  [['LEGION','TOWER'],84],
  [['APOCALYPSE','TOWER'],78],
  [['LEGION','APOCALYPSE'],105],
  [['LEGION'],230],[['APOCALYPSE'],192],[['TOWER'],156]
 ]){
  let state=changeHideout(emptyHideout(),'upgrade',{target:'room',revision:0}),day=0;
  for(;state.level<4&&day<250;){
   day++;
   state.parts.STRUCTURE=Math.min(HIDEOUT_STOCK_LIMITS.STRUCTURE,state.parts.STRUCTURE+1);
   for(const source of sources){
    const e={...event('simulation',source),startedAt:Date.UTC(2026,10,day)};
    for(const award of [hideoutAward(e,()=>9999),hideoutDailyAward(e,()=>9999)?.gains]){
     for(const [key,value] of Object.entries(award||{}))state.parts[key]=Math.min(HIDEOUT_STOCK_LIMITS[key]??Infinity,state.parts[key]+value);
    }
   }
   const cost=hideoutCost(state,'room');
   if(Object.entries(cost).every(([key,value])=>state.parts[key]>=value))state=changeHideout(state,'upgrade',{target:'room',revision:state.revision});
  }
  assert.equal(day,expected,sources.join('+'));
  assert.equal(state.parts.CORE,0);
 }
 const upgraded={...funded(),level:3,rooms:['main'],facilities:{...funded().facilities,workbench:4}};
 assert.equal(hideoutCost(upgraded,'room').HOUSING_PLAN,87);
 assert.equal(hideoutCost(upgraded,'room').STRUCTURE,29);
 upgraded.parts.STRUCTURE=28;
 assert.throws(()=>changeHideout(upgraded,'upgrade',{target:'room',revision:upgraded.revision}),e=>e.code==='HIDEOUT_PARTS');
});
for(const postgres of [false,true]){
 const engine=postgres?'PostgreSQL':'SQLite';
 test(engine+' daily salvage shares the Legion cap across modes and separates days and sources',async t=>{
  const f=await fixture(t,postgres),startedAt=Date.parse('2026-11-24T23:59:59+09:00');
  const settle=(source,id,details={})=>f.DB.batch(hideoutAwardStatements(f.env,{...event(id,source),startedAt,...details},{randomInt:()=>9999}));
  await settle('LEGION','solo');await settle('LEGION','CITADEL:party');await settle('LEGION','solo');
  assert.equal((await f.state()).parts.HOUSING_PLAN,1);
  assert.equal((await f.state()).parts.ALLOY_PANEL,1);
  await settle('APOCALYPSE','loss',{won:false});
  await settle('APOCALYPSE','win');await settle('APOCALYPSE','second');
  await settle('TOWER','replay',{seasonReplay:true});await settle('TOWER','second');
  const today=(await f.state()).parts;
  assert.equal(today.HOUSING_PLAN,3);assert.equal(today.STRUCTURE,1);
  assert.equal(today.STEEL,32);assert.equal(today.WIRE,20);assert.equal(today.LEATHER_KIT,1);
  await settle('LEGION','next-day',{startedAt:startedAt+1000});
  assert.equal((await f.state()).parts.HOUSING_PLAN,4);
  f.fail(postgres?'jsonb_set':'json_set');
  await assert.rejects(settle('TOWER','failure',{startedAt:startedAt+1000}),/INJECTED/);
  f.fail('');assert.equal((await f.state()).parts.HOUSING_PLAN,4);
  await settle('TOWER','failure',{startedAt:startedAt+1000});
  const tomorrow=(await f.state()).parts;
  assert.equal(tomorrow.HOUSING_PLAN,5);assert.equal(tomorrow.STRUCTURE,2);
 });
 test(engine+' daily stock limits stop gains without reducing old stock',async t=>{
  const f=await fixture(t,postgres),startedAt=Date.parse('2026-11-24T13:00:00+09:00');
  const settle=(eventId,source,days=0)=>f.DB.batch(hideoutAwardStatements(f.env,{
   ...event(eventId,source),startedAt:startedAt+days*86400000
  },{randomInt:()=>9999}));
  const state=emptyHideout();
  state.parts.STEEL=1045;state.parts.WIRE=648;delete state.parts.STRUCTURE;
  await f.seed(state);
  await settle('apocalypse','APOCALYPSE');
  await settle('tower','TOWER');
  let saved=await f.state();
  assert.equal(saved.parts.STEEL,1045);assert.equal(saved.parts.WIRE,650);assert.equal(saved.parts.STRUCTURE,1);
  const inventory={...saved.parts,STEEL:1039,WIRE:649,STRUCTURE:28};
  await f.seed({...saved,parts:inventory});
  await settle('legion','LEGION',1);
  await settle('party','LEGION',1);
  await settle('apocalypse-next','APOCALYPSE',1);
  saved=await f.state();
  assert.equal(saved.parts.STEEL,1040);assert.equal(saved.parts.WIRE,650);assert.equal(saved.parts.STRUCTURE,29);
  await settle('tower-next','TOWER',2);
  saved=await f.state();
  assert.deepEqual(Object.fromEntries(Object.keys(HIDEOUT_STOCK_LIMITS).map(code=>[code,saved.parts[code]])),HIDEOUT_STOCK_LIMITS);
 });
}
