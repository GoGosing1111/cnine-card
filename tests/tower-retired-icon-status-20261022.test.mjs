import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {gsap} from 'gsap';
import {BattleEngine as Live} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {BattleEngine as Continuous} from '../preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js';
import {buildTowerV3Battle} from '../functions/_tower_v3.js';
import {defaultIconRoles,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
after(()=>gsap.ticker.sleep());
function harness(t,payload){
 const previous=globalThis.window;globalThis.window=new EventTarget();t.after(()=>{globalThis.window=previous;});
 const rendered=[],engine=Object.create(Continuous.prototype),instances=new Map(payload.continuousEncounter.instances.map(r=>[r.id,r]));
 const enemies=payload.continuousEncounter.initialIds.map(id=>({...instances.get(id),hp:100,root:{visible:true}}));
 Object.assign(engine,{visible:true,playbackEpoch:1,instances,enemies,retiredIds:new Set(),seenKnockouts:new Set(),previewEventCount:0,defeatedCount:0,accountBattleUnitDamageQueue:[],
  drainGeneration:async()=>{},timeline:async(_build,finish)=>finish(),spawnMonster:async e=>{const row=instances.get(e.targetId),old=enemies.find(r=>r.slot===row.slot);engine.retiredIds.add(old.id);Object.assign(old,row,{hp:100,root:{visible:true}});}});
 t.mock.method(Live.prototype,'playEvents',async function(events){rendered.push(...events);return true;});
 return {engine,rendered};
}
function fixture(){
 const cards=Array.from({length:4},(_,i)=>({id:'QA-'+i,power:100000,power_type:['ATTACK','DEFENSE','SPEED','HP'][i]}));
 cards.push({id:'CN-1C000009',grade:'ICON',power:100000,iconRole:iconRoleSnapshot({id:'CN-1C000009',grade:'ICON'},defaultIconRoles(),'PVE')});
 return buildTowerV3Battle({snapshot:{cards},tier:1,seed:1,operatingFloor:{id:28,name:'QA',power:50000}});
}
test('real Tower LINK expiry receipts finish after KO and replacement without changing the server timeline',async t=>{
 const payload=fixture(),timeline=payload.battleV2.result.timeline,before=JSON.stringify(payload),callbacks=[],prepared=[];
 const {engine,rendered}=harness(t,payload);
 const completed=await engine.playEvents(timeline,{beforeEvent:async e=>(prepared.push(e.seq),e),afterEvent:e=>callbacks.push(e.seq)});
 assert.equal(completed,true);assert.equal(engine.defeatedCount,28);assert.equal(engine.previewEventCount,timeline.length);
 assert.deepEqual(callbacks,timeline.map(e=>e.seq));assert.deepEqual(prepared,callbacks);assert.equal(JSON.stringify(payload),before);
 const absent=timeline.filter(e=>e.type!=='ENEMY_SPAWN'&&!rendered.includes(e));
 assert.ok(absent.length>0,'server simulation must reproduce retired-target status expiry');
 assert.ok(absent.every(e=>e.type==='ICON_STATUS'&&e.status==='EXPIRED'&&e.targetHpAfter===0));
 assert.equal(rendered.at(-1).type,'RESULT');
});
test('only terminal status cleanup can refer to a retired target; real attacks and stale actors still fail',async t=>{
 const {engine,rendered}=harness(t,fixture()),old=engine.enemies[0].id;
 engine.retiredIds.add(old);engine.enemies[0].id='B:0:ENCOUNTER:replacement';
 const expiry={type:'ICON_STATUS',status:'EXPIRED',actorId:'A:4:CN-1C000009',targetId:old,targetHpAfter:0},seen=[];
 for(const status of ['EXPIRED','CLEANSED','WARD_END'])assert.equal(await engine.playEvents([{...expiry,status}],{afterEvent:e=>seen.push(e.status)}),true);
 assert.deepEqual(seen,['EXPIRED','CLEANSED','WARD_END']);assert.equal(rendered.length,0);
 for(const e of [{...expiry,type:'TURN'},{...expiry,type:'ICON_ECHO',damage:10},{...expiry,status:'MARK'},{...expiry,actorId:old,targetId:engine.enemies[0].id}])await assert.rejects(engine.playEvents([e]),/STALE_ENEMY_INSTANCE/);
 assert.equal(rendered.length,0);
});
test('terminal status on a current instance keeps the existing renderer path',async t=>{
 const {engine,rendered}=harness(t,fixture());const event={type:'ICON_STATUS',status:'EXPIRED',actorId:'A:4:CN-1C000009',targetId:engine.enemies[0].id,targetHpAfter:50};
 await engine.playEvents([event]);assert.deepEqual(rendered,[event]);
});
