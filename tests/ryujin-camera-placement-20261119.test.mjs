import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Container,Point,Graphics,ColorMatrixFilter} from 'pixi.js';
import {ryujinSkillPlacement} from '../preview/project-v-v3/source/battle/ryujin/SkillPlacement.mjs';

const actor=(x,y)=>({root:{x:x+55,y:y-80,baseX:x,baseY:y}});
const targets=[actor(1100,180),actor(1320,420),actor(1100,660)],start={x:420,y:180};
const wrapper=fs.readFileSync(new URL('../js/battle-v3-live.js',import.meta.url),'utf8');
function playbackGuard(){
 let now=0,id=0,recoveries=0,finish;const tasks=new Map();
 const context={Promise,Date:{now:()=>now},setTimeout:(fn,ms)=>{tasks.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>tasks.delete(id),console:{warn(){}},interactiveApocalypse:false,recoverPlayback:()=>recoveries++,playEventsChecked:()=>new Promise(r=>finish=r)};
 vm.runInNewContext(wrapper.slice(wrapper.indexOf('  const withTimeout ='),wrapper.indexOf('  const esc ='))+wrapper.slice(wrapper.indexOf('    const eventPlaybackTimeoutMs ='),wrapper.indexOf('    const revealBattle ='))+';globalThis.guard={play:safePlayEvents,budget:eventPlaybackTimeoutMs};',context);
 const flush=async()=>{for(let n=0;n<10;n++)await Promise.resolve();};
 return {...context.guard,get recoveries(){return recoveries;},finish:async()=>{finish(true);await flush();},advance:async ms=>{now+=ms;for(const [id,t]of tasks)if(t.at<=now){tasks.delete(id);t.fn();await flush();}}};
}
test('first awakening plus finisher completes before the actual web recovery deadline',async()=>{
 const h=playbackGuard();let result;h.play([{type:'MERCENARY_RYUJIN_AREA'}],'Ryujin').then(v=>result=v);
 await h.advance(9350);assert.equal(result,undefined);assert.equal(h.recoveries,0);
 await h.finish();assert.equal(result,true);await h.advance(20000);assert.equal(h.recoveries,0);
 for(const actorId of ['A:MERCENARY:V-958','B:MERCENARY:V-958','A:OWNER:1:MERCENARY:V-958'])assert(h.budget([{type:'TURN',actorId}])>3350);
 assert.equal(h.budget([{type:'TURN',actorId:'A:MERCENARY:V-001'}]),2000);
});
test('a stuck Ryujin cast still recovers once and ignores late completion',async()=>{
 const h=playbackGuard();let result;h.play([{type:'MERCENARY_RYUJIN_AREA'}],'Ryujin').then(v=>result=v);
 await h.advance(11999);assert.equal(result,undefined);await h.advance(1);assert.equal(result,false);assert.equal(h.recoveries,1);
 await h.finish();await h.advance(20000);assert.equal(h.recoveries,1);assert.equal(result,false);
});
test('PVE area casts stay at home and use the whole enemy formation regardless of hit order',()=>{
 for(const order of [targets,[...targets].reverse(),[targets[1],targets[2],targets[0]]]){
  const p=ryujinSkillPlacement({start,targets:order,cooperative:false,duration:4.8,contact:2});
  assert.deepEqual(p.impact,{x:1210,y:420});assert.equal(p.mode,'PVE_FIXED');
  for(let frame=0;frame<=288;frame++)assert.deepEqual(p.rootAt(frame/60),start);
 }
});
test('party casts enter the middle lane smoothly and recover without following a dashing top target',()=>{
 const before=structuredClone(targets),p=ryujinSkillPlacement({start,targets,cooperative:true,duration:1.25,contact:.57});
 assert.deepEqual(p.rootAt(0),start);assert.deepEqual(p.cast,{x:420,y:420});assert.deepEqual(p.rootAt(.57),p.cast);assert.deepEqual(p.rootAt(1.25),start);
 let previous=start;for(let f=1;f<=75;f++){const q=p.rootAt(f/60);assert.equal(q.x,420);assert(q.y>=180&&q.y<=420);assert(Math.abs(q.y-previous.y)<34);previous=q;}
 assert.deepEqual(targets,before);
});
test('one target and missing presentation targets remain finite',()=>{
 for(const list of [[actor(800,500)],[],[{root:{x:NaN,y:NaN}}]]){
  const p=ryujinSkillPlacement({start,targets:list,cooperative:true,duration:.75,contact:.3});
  for(let f=0;f<=45;f++){const q=p.rootAt(f/60);assert(Number.isFinite(q.x)&&Number.isFinite(q.y));}
 }
});

// Execute the production effect session with actual Pixi transforms and a
// minimal rig stand-in; artwork decoding is covered by the live browser probe.
const text=fs.readFileSync(new URL('../preview/project-v-v3/source/battle/ryujin/ReferenceCrimsonEffects.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export class ReferenceCrimsonEffects','class ReferenceCrimsonEffects');
const Effects=Function('Container','Point','Graphics','ColorMatrixFilter',text+'\nreturn ReferenceCrimsonEffects;')(Container,Point,Graphics,ColorMatrixFilter);
const transform=c=>({x:c.x,y:c.y,px:c.pivot.x,py:c.pivot.y,sx:c.scale.x,sy:c.scale.y,r:c.rotation});
function scene(cooperative){
 const stage=new Container(),combatLayer=new Container(),effectLayer=new Container();stage.position.set(800,410);stage.pivot.set(800,410);stage.addChild(combatLayer,effectLayer);
 const root=new Container(),view=new Container(),enemyRoot=new Container();root.position.set(420,180);enemyRoot.position.set(1100,180);root.addChild(view);combatLayer.addChild(root,enemyRoot);
 const actor={root,view},enemy={root:enemyRoot},observers=new Set();let cameraCalls=0;
 const e={stage,combatLayer,effectLayer,characters:[actor,enemy],scene:{width:1600,height:820},formationCoop:cooperative,
  camera:{zoomEnabled:!cooperative,focusAt(p,z){cameraCalls++;if(cooperative)return;stage.position.copyFrom(p);stage.pivot.copyFrom(p);stage.scale.set(z);}},
  app:{renderer:{runners:{prerender:{add:o=>observers.add(o),remove:o=>observers.delete(o)}}}}};
 const effects=new Effects(e,{records:{wave:{duration:1,peakVisible:{width:100,height:100}}}});
 const rig=()=>{const r=new Container();r.state={setAnimation:()=>({trackTime:0})};r.skeleton={slots:[{pose:{attachment:{name:'qa'}}}]};r.update=()=>{};return r;};effects.rig=rig;effects.body=rig;
 return {e,actor,enemy,effects,observers,cameraCalls:()=>cameraCalls};
}
for(const cooperative of [false,true])test((cooperative?'party':'ordinary')+' effect frames and interruption never mutate the shared camera',()=>{
 const {e,actor,enemy,effects,observers,cameraCalls}=scene(cooperative),before=transform(e.stage);
 const session=effects.begin({actor,frames:{companions:{},states:{}}},enemy,'skill_wave',{start:{x:420,y:420},impactPoint:{x:1210,y:420},placementMode:cooperative?'PARTY_CENTER':'PVE_FIXED',rootAt:()=>({x:420,y:420}),spec:{duration:1.25,cues:[{type:'wave',at:0,life:1.25,w:7.1,h:1.8}],camera:[{at:0,zoom:1,dark:0},{at:.1,zoom:1.16,dark:.4}],visualContacts:[.3,.57]}});
 for(let frame=0;frame<300;frame++){session.render((frame%75)/60);assert.deepEqual(transform(e.stage),before);}
 assert.equal(cameraCalls(),0);assert.deepEqual(session.audit().impactPoint,{x:1210,y:420});assert.equal(session.audit().cameraLocked,true);
 if(cooperative){assert.equal(session.audit().cinematic,false);assert.equal(enemy.root.alpha,1);}
 // A viewport resize by the owning engine must survive effect cancellation.
 e.stage.position.set(900,500);e.stage.pivot.set(900,500);const resized=transform(e.stage);session.destroy();assert.deepEqual(transform(e.stage),resized);
 assert.equal(enemy.root.alpha,1);effects.destroy();assert.equal(observers.size,0);assert.equal(e.effectLayer.children.length,0);e.stage.destroy({children:true});
});
