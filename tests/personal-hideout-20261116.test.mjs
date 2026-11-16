import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {SeasonSQLiteDB} from './helpers/season-s1-db.mjs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {emptyHideout,HIDEOUT_KEY,changeHideout,hideoutBenefits,hideoutCardRates,hideoutAward,hideoutCost,hideoutState,publicHideout} from '../shared/personal-hideout-v1.mjs';
import {hideoutPartyEnergy} from '../shared/personal-hideout-energy-v1.mjs';
import {LEGION_RECOVERY_EVENT} from '../shared/legion-hunt-energy-v1.mjs';
import {hideoutAwardStatements,mutateHideout,readHideout,handlePersonalHideout} from '../functions/_personal_hideout.js';
import {contentProgressionStatements} from '../functions/_content_progression.js';

async function fixture(t,postgres=false){
 let DB,pg,failure='';const schema='CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users(id) VALUES(7)';
 if(postgres){pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;"+schema);DB=new __postgresCompatTest.PostgresD1Database({async query(input){const sql=typeof input==='string'?input:input.text;if(failure&&sql.includes(failure))throw Error('INJECTED_FAILURE');const r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});}
 else {DB=new SeasonSQLiteDB();DB.sql.exec(schema);}
 t.after(()=>pg?pg.close():DB.sql.close());const env={DB,PERSONAL_HIDEOUT_ENABLED:'1'};
 return {env,DB,fail:s=>{failure=s;DB.failAt=s;},state:async()=>(await readHideout(env,7)).state,seed:async state=>DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(HIDEOUT_KEY(7),JSON.stringify(state)).run()};
}
const funded=()=>{const s=emptyHideout();for(const c of Object.keys(s.parts))s.parts[c]=10000;return s;};
const event=(eventId,source='HUNT')=>({userId:7,eventId,source,won:true});
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
test('normal pack bonus changes relative high-grade weights only; combat eligibility is explicit',()=>{
 const rates=[{rarity:'C',rate:80},{rarity:'SSR',rate:19},{rarity:'ICON',rate:1},{rarity:'SSS',rate:0.01}],next=hideoutCardRates(rates,10);
 assert.deepEqual(next.map(r=>r.rate),[80,20.900000000000002,1.1,0.01]);assert.equal(rates[1].rate,19);
 for(const source of ['PVP','TOWER','SCRAPYARD'])assert.equal(hideoutAward(event('x',source)),null);
 for(const extra of [{won:false},{eligible:false},{seasonReplay:true}])assert.equal(hideoutAward({...event('x'),...extra}),null);
 assert.deepEqual(hideoutAward({...event('x','LEGION'),won:false}),{STEEL:8,WIRE:5,CIRCUIT:2,COOLANT:2,DRIVE:1});
});

for(const postgres of [false,true]){
 const engine=postgres?'PostgreSQL':'SQLite';
 test(engine+' combat rewards are atomic, work without season/unlock, and identical statement replay is inert',async t=>{
  const f=await fixture(t,postgres),writes=await contentProgressionStatements(f.env,event('first'));assert.equal(writes.length,4);
  await f.DB.batch(writes);assert.equal((await f.state()).parts.STEEL,2);assert.equal((await f.state()).level,0);
  await f.DB.batch(writes);await f.DB.batch(await contentProgressionStatements(f.env,event('first')));assert.equal((await f.state()).parts.STEEL,2);
  await f.DB.batch(hideoutAwardStatements(f.env,event('guarded'),{guard:'1=0'}));assert.equal((await f.state()).parts.STEEL,2);
  f.fail(postgres?'jsonb_set':'json_set');await assert.rejects(f.DB.batch(hideoutAwardStatements(f.env,event('rollback','RAID'))),/INJECTED/);f.fail('');
  assert.equal((await f.state()).parts.STEEL,2);assert.equal(await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind('personal_hideout_reward_v1:7:RAID:rollback').first(),null);
  await f.DB.batch(hideoutAwardStatements(f.env,event('rollback','RAID')));assert.equal((await f.state()).parts.CORE,3);
  const s=await f.state();s.parts.STEEL=999999999;await f.seed(s);await f.DB.batch(hideoutAwardStatements(f.env,event('ceiling')));assert.equal((await f.state()).parts.STEEL,1000000000);
 });
 test(engine+' mutations enforce replay identity, costs, rollback and concurrent reward CAS',async t=>{
  const f=await fixture(t,postgres),unlock=body(0,{target:'room'});const opened=await mutateHideout(f.env,7,'upgrade',unlock);assert.equal(opened.state.level,1);
  assert.equal((await mutateHideout(f.env,7,'upgrade',unlock)).replayed,true);
  const receiptKey='personal_hideout_mutation_v1:7:'+unlock.requestId;
  const legacyReceipt=JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first()).value);
  legacyReceipt.response.state.version=1;delete legacyReceipt.response.stages;delete legacyReceipt.response.space;
  await f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify(legacyReceipt),receiptKey).run();
  const restored=await mutateHideout(f.env,7,'upgrade',unlock);assert.equal(restored.replayed,true);assert.equal(restored.state.version,2);assert.equal(restored.stage.name,'판자촌');assert.equal(restored.space.width,2400);

  await assert.rejects(mutateHideout(f.env,7,'upgrade',{...unlock,target:'fridge'}),e=>e.code==='HIDEOUT_REQUEST_CONFLICT');
  await assert.rejects(mutateHideout(f.env,7,'upgrade',body(1,{target:'fridge'})),e=>e.code==='HIDEOUT_PARTS');
  const fundedState={...funded(),level:1,revision:1,rooms:['main']};await f.seed(fundedState);
  const upgrade=body(1,{target:'garage'});f.fail('INSERT INTO joint_atomic_guards');await assert.rejects(mutateHideout(f.env,7,'upgrade',upgrade),/INJECTED/);f.fail('');assert.equal((await f.state()).facilities.garage,0);assert.equal((await f.state()).parts.STEEL,10000);
  const realBatch=f.DB.batch.bind(f.DB);let inject=true;f.DB.batch=async writes=>{if(inject){inject=false;await realBatch(hideoutAwardStatements(f.env,event('race')));}return realBatch(writes);};
  await assert.rejects(mutateHideout(f.env,7,'upgrade',upgrade),e=>e.code==='HIDEOUT_CONFLICT');f.DB.batch=realBatch;
  let s=await f.state();assert.equal(s.parts.STEEL,10002);assert.equal(s.facilities.garage,0);
  const completed=await mutateHideout(f.env,7,'upgrade',body(s.revision,{target:'garage'}));assert.equal(completed.state.facilities.garage,1);assert.equal(completed.state.parts.STEEL,9990);
 });
}
test('authentication, request fields and feature gate are enforced by the real handler',async t=>{
 const f=await fixture(t),deps={json:(v,status)=>Response.json(v,{status}),authenticate:async()=>null,withUserMutationLock:(_e,_u,_p,fn)=>fn()};
 const call=(path='hideout',body)=>handlePersonalHideout({path,env:f.env,deps,request:new Request('https://game.test/api/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin:'https://game.test'},...(body?{body:JSON.stringify(body)}:{})})});
 assert.equal((await call()).status,401);deps.authenticate=async()=>({id:7});assert.equal((await (await call()).json()).state.level,0);
 assert.equal((await call('hideout/upgrade',{...body(0,{target:'room'}),parts:{STEEL:100}})).status,400);
 f.env.PERSONAL_HIDEOUT_ENABLED='0';assert.equal((await call('hideout/upgrade',body(0,{target:'room'}))).status,423);
});
test('party capacity preserves partial recovery, legacy deadline, event boundaries and extreme pulses',()=>{
 const hour=3600000,at=Date.parse('2026-11-25T12:00:00+09:00');
 let s=hideoutPartyEnergy(null,{at,maximum:2});assert.equal(s.current,2);
 s={...s,current:1};let later=hideoutPartyEnergy(s,{at:at+3*hour,maximum:3});assert.equal(later.current,1);assert.equal(later.nextRechargeAt,at+6*hour);
 later=hideoutPartyEnergy(later,{at:at+6*hour,maximum:3});assert.equal(later.current,2);
 assert.equal(hideoutPartyEnergy(null,{at,maximum:2,deadline:String(at+3*hour)}).current,0);
 assert.equal(hideoutPartyEnergy(null,{at:at+3*hour,maximum:2,deadline:String(at+3*hour)}).current,1);
 const end=LEGION_RECOVERY_EVENT.endsAt,record={version:1,current:0,updatedAt:end-hour,generation:0};
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
