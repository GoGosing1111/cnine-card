import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gsap} from 'gsap';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';

after(()=>gsap.ticker.sleep());
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};

function scene(){
 const engine=Object.create(BattleEngine.prototype),calls=[];
 Object.assign(engine,{mounted:true,visible:true,requestedVisible:true,battleData:{apocalypseChallenge:{status:'ANSWERED'}},
  characters:[],simpleTimelines:new Set(),cards:[],livePayload:true,app:{start(){calls.push('start');},stop(){calls.push('stop');}},
  cancelTimelines(){this.releaseBackgroundClock?.();calls.push('cancel');},releaseOptionalAdvancementAssets:async()=>{}});
 return {engine,calls};
}

test('Alt-Tab after a successful dodge pauses the battle clock without cancelling any action',async t=>{
 const original=globalThis.document,wasPaused=gsap.globalTimeline.paused();globalThis.document={hidden:true};
 t.after(()=>{globalThis.document=original;gsap.globalTimeline.paused(wasPaused);});
 const {engine,calls}=scene();
 await engine.setVisible(true);
 assert.equal(calls.includes('cancel'),false,'hiding the page must not resolve cancelled combat as completed');
 assert.equal(engine.visible,true,'the live attempt remains valid while its presentation is paused');
 assert.equal(gsap.globalTimeline.paused(),true);
 document.hidden=false;await engine.setVisible(true);
 assert.equal(gsap.globalTimeline.paused(),wasPaused);
 assert.equal(calls.includes('cancel'),false);
});

test('closing a hidden battle releases only its clock hold and still cancels the attempt',async t=>{
 const original=globalThis.document,wasPaused=gsap.globalTimeline.paused();globalThis.document={hidden:true};
 t.after(()=>{globalThis.document=original;gsap.globalTimeline.paused(wasPaused);});
 const {engine,calls}=scene();await engine.setVisible(true);await engine.setVisible(false);
 assert.equal(calls.filter(x=>x==='cancel').length,1);
 assert.equal(engine.visible,false);assert.equal(gsap.globalTimeline.paused(),wasPaused);
});

function rendererHarness(t){
 const timers=new Map(),listeners=new Set(),calls=[];let now=0,id=0;
 const document={hidden:false,querySelectorAll:()=>[],addEventListener:(name,fn)=>{if(name==='visibilitychange')listeners.add(fn);},removeEventListener:(name,fn)=>listeners.delete(fn)};
 const labels=new Set(),stage={classList:{add:(...v)=>v.forEach(x=>labels.add(x)),remove:(...v)=>v.forEach(x=>labels.delete(x)),contains:v=>labels.has(v)},querySelector:()=>null,querySelectorAll:()=>[]};
 const canvas={width:1600,height:820,getContext:()=>({isContextLost:()=>false})};
 const runtime=fs.readFileSync('preview/project-v-v3/source/project-v-pixi-battle.src.js','utf8').match(/runtimeVersion:'([^']+)'/)[1];
 const context={console,document,Date:{now:()=>now},setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:key=>timers.delete(key),requestAnimationFrame:fn=>{fn();return 1;},ProjectVPixiBattle:{
  runtimeVersion:runtime,mount:async()=>{},setBattlePayload:async()=>{},setBattlefield:async()=>{},setVisible:async()=>{},destroy(){},
  playEvents:async events=>{calls.push(...events.map(x=>x.type));},completePlayback:()=>calls.push('complete')
 }};
 context.window=context;vm.runInNewContext(fs.readFileSync('js/battle-v3-live.js','utf8'),context);
 const data={result:'PENDING',apocalypseChallenge:{status:'ANSWERED'},battleV2:{teams:{A:{cards:[]},B:{cards:[]}},result:{timeline:[{type:'ATTACK'},{type:'RESULT',winner:'A'}]}}};
 const create=extra=>context.ProjectVBattleV3Live.createRenderer({stage,host:{querySelector:selector=>selector==='canvas'?canvas:null,querySelectorAll:()=>[]},modal:{classList:{remove(){}}},mode:'PVE',data,...extra});
 return {calls,context,create,hide(value){document.hidden=value;for(const fn of [...listeners])fn();},async advance(ms){now+=ms;for(const [key,row] of [...timers])if(row.at<=now){timers.delete(key);row.fn();}await flush();}};
}

test('a successful dodge in a hidden tab cannot skip attacks or reach completion',async t=>{
 const h=rendererHarness(t),renderer=await h.create({afterDeployment:()=>h.hide(true)});let completed=false;
 const done=renderer.play().then(()=>{completed=true;});await flush();await h.advance(10000);
 assert.equal(completed,false);assert.deepEqual(h.calls,['DEPLOY']);
 h.hide(false);await h.advance(200);await done;
 assert.deepEqual(h.calls,['DEPLOY','ATTACK','RESULT','complete']);
});

test('hidden time does not trip the animation watchdog and force the success path',async t=>{
 const h=rendererHarness(t);let finishAttack;
 h.context.ProjectVPixiBattle.playEvents=async events=>{const type=events[0].type;h.calls.push(type);if(type==='ATTACK')await new Promise(resolve=>finishAttack=resolve);};
 const renderer=await h.create(),done=renderer.play();await flush();assert.ok(finishAttack);
 h.hide(true);await h.advance(10000);assert.deepEqual(h.calls,['DEPLOY','ATTACK']);
 h.hide(false);finishAttack();await h.advance(100);await done;
 assert.deepEqual(h.calls,['DEPLOY','ATTACK','RESULT','complete']);
});

test('an explicitly cancelled Apocalypse timeline is never accepted as a finished battle',async t=>{
 const h=rendererHarness(t);h.context.ProjectVPixiBattle.playEvents=async events=>events[0].type==='DEPLOY'?true:false;
 const renderer=await h.create();await assert.rejects(renderer.play(),/중단|완료/);
});

test('the final claim boundary also waits for foreground even if rendering finished just before Alt-Tab',async()=>{
 const timers=[],calls=[],document={hidden:true},context={document,console,Date,setTimeout:fn=>timers.push(fn),localStorage:{getItem:()=>null,setItem(){}},window:{
  loadUser:()=>({id:1}),apiRequest:async(path,options)=>{calls.push(path);return {requestId:'foreground-claim',status:'CLAIMED',settlement:{result:'WIN',reward:1000}};}
 }};
 vm.runInNewContext(fs.readFileSync('js/apocalypse-challenge-v1.mjs','utf8').replace(/^export /gm,'')+';window.claimBonus=claimBonus;',context);
 const done=context.window.claimBonus({data:{apocalypseChallenge:{status:'ANSWERED'}},apocalypseAttempt:{requestId:'foreground-claim',runToken:'test',ensure(){}}});
 await flush();assert.equal(calls.length,0);
 document.hidden=false;timers.splice(0).forEach(fn=>fn());await done;
 assert.deepEqual(calls,['battle/apocalypse-challenge/claim']);
});
