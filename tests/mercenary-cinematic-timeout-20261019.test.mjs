import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {MODES as leonel} from '../preview/mercenary-leonel-sss-limited-20261018-v2/motion.mjs';
import {MODES as jinmu,JINMU_ULTIMATE_PLAYBACK_RATE} from '../preview/mercenary-golden-dragon-battle-v1/skill.mjs';
import {MODES as helios} from '../preview/mercenary-limited-solar-sword-20261009-v1/motion.mjs';
import {MODES as shiranui} from '../preview/mercenary-monochrome-artillery-battle-v1/skill.mjs';
import {PLANS as kairon} from '../preview/mercenary-black-uniform-dual-uzi-v1/skill.mjs';
import {LEONEL_COMBAT} from '../shared/mercenary-leonel-v1.mjs';
import {HELIOS_COMBAT} from '../shared/mercenary-helios-v1.mjs';
import {SHIRANUI_COMBAT} from '../shared/mercenary-shiranui-v1.mjs';
import {KAIRON_COMBAT} from '../shared/mercenary-kairon-v1.mjs';
import {SKILLS as namsudaengPlans} from '../preview/project-v-v3/source/battle/bloodmoon-namsudaeng/skills.mjs';
import {NAMSUDAENG_EVENT,NAMSUDAENG_SKILLS,NAMSUDAENG_PLAYBACK_RATE} from '../shared/mercenary-bloodmoon-namsudaeng-v1.mjs';

const source=fs.readFileSync(new URL('../js/battle-v3-live.js',import.meta.url),'utf8');
const timeout=source.slice(source.indexOf('  const withTimeout ='),source.indexOf('  const esc ='));
const guarded=source.slice(source.indexOf('    const eventPlaybackTimeoutMs ='),source.indexOf('    const revealBattle ='));
const durations={LEONEL:leonel.ultimate.duration/LEONEL_COMBAT.effectPlaybackRate,JINMU:jinmu.ultimate.duration/JINMU_ULTIMATE_PLAYBACK_RATE,
 HELIOS:helios.ultimate.duration/HELIOS_COMBAT.motionPlaybackRate,SHIRANUI:shiranui.ultimate.duration/SHIRANUI_COMBAT.motionPlaybackRate,KAIRON:kairon.quantum.duration/KAIRON_COMBAT.motionPlaybackRate};
function harness({duration=Infinity,interactive=true}={}){
 let now=0,id=0,recoveries=0,cancellations=0,finish;const tasks=new Map(),warnings=[],listeners=new Set();
 const set=(fn,ms)=>{tasks.set(++id,{fn,at:now+ms});return id;};
 const document={hidden:false,addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn)};
 const context={Promise,Date:{now:()=>now},setTimeout:set,clearTimeout:id=>tasks.delete(id),document,console:{warn:(...args)=>warnings.push(args)},interactiveApocalypse:interactive,
  root:{ProjectVPixiBattle:{cancelActiveAnimations:()=>{cancellations++;}}},recoverPlayback:()=>{recoveries++;},
  playEventsChecked:()=>new Promise(resolve=>{finish=resolve;if(Number.isFinite(duration))set(()=>resolve(true),duration);})};
 vm.runInNewContext(timeout+guarded+';globalThis.qa={play:safePlayEvents,timeout:eventPlaybackTimeoutMs};',context);
 const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
 return {play:context.qa.play,budget:context.qa.timeout,get recoveries(){return recoveries;},get cancellations(){return cancellations;},get listeners(){return listeners.size;},warnings,
  hidden:value=>{document.hidden=value;for(const fn of listeners)fn();},finish:async()=>{finish(true);await flush();},
  advance:async ms=>{const target=now+ms;let next;while((next=[...tasks.entries()].sort((a,b)=>a[1].at-b[1].at)[0])&&next[1].at<=target){now=next[1].at;tasks.delete(next[0]);next[1].fn();await flush();}now=target;await flush();}};
}
const area=name=>({type:'MERCENARY_'+name+'_AREA'});
for(const [name,seconds]of Object.entries(durations))test(name+' completes its actual authored duration before the web guard releases the next boss action',async()=>{
 assert(seconds>2);const duration=seconds*1000,h=harness({duration});let result,error;
 h.play([area(name)],name+' playback').then(v=>result=v,e=>error=e);
 await h.advance(2000);assert.equal(result,undefined);assert.equal(error,undefined);assert.equal(h.cancellations,0);
 await h.advance(duration-2000+1);assert.equal(result,true);assert.equal(error,undefined);assert.equal(h.cancellations,0);assert.equal(h.listeners,0);
 await h.advance(10000);assert.equal(h.cancellations,0);assert.deepEqual(h.warnings,[]);
});

test('a genuinely stuck cinematic rejects Apocalypse once but recovers ordinary PVE once',async()=>{
 for(const interactive of [true,false]){
  const h=harness({interactive});let result,error;h.play([area('LEONEL')],'검극').then(v=>result=v,e=>error=e);
  await h.advance(8999);assert.equal(result,undefined);assert.equal(error,undefined);
  await h.advance(1);assert.equal(h.cancellations,interactive?1:0);assert.equal(h.recoveries,interactive?0:1);assert.equal(h.warnings.length,1);assert.equal(h.listeners,0);
  if(interactive)assert.match(error.message,/검극/);else assert.equal(result,false);
  await h.finish();await h.advance(10000);assert.equal(h.cancellations+h.recoveries,1);
 }
});

test('hidden Apocalypse tabs retain the remaining cinematic deadline',async()=>{
 const h=harness();let error;h.play([area('LEONEL')],'검극').catch(e=>error=e);
 await h.advance(1500);h.hidden(true);await h.advance(60000);assert.equal(error,undefined);assert.equal(h.cancellations,0);
 h.hidden(false);await h.advance(7499);assert.equal(error,undefined);await h.advance(1);assert.match(error.message,/검극/);assert.equal(h.cancellations,1);
});

test('ordinary attacks retain their deadline; the main loader requests the updated wrapper',()=>{
 const h=harness();for(const event of [{type:'TURN',actorId:'A:MERCENARY:V-978'},{type:'TURN',actorId:'A:MERCENARY:V-988'},{type:'MERCENARY_WINDUP'},area('UNKNOWN')])assert.equal(h.budget([event]),2000);
 const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8'),url=new URL(app.match(/'([^']*js\/battle-v3-live\.js\?[^']*)'/)[1],'https://qa.invalid/');
 assert.equal(url.searchParams.get('cinematicPlayback'),'20261019-v1');
 assert.equal(url.searchParams.get('namsudaengTimeout'),'20261026-v1');
});

for(const skill of NAMSUDAENG_SKILLS)for(const interactive of [true,false])test(`Namsudaeng ${skill.id} completes its authored ${skill.visualMode} sequence (${interactive?'Apocalypse':'ordinary battle'})`,async()=>{
 const duration=namsudaengPlans[skill.visualMode].duration/NAMSUDAENG_PLAYBACK_RATE*1000,h=harness({duration,interactive});let result,error;
 h.play([{type:NAMSUDAENG_EVENT,skillId:skill.id}],skill.name+' 연출이 지연되어 다음 행동으로 이동했습니다.').then(v=>result=v,e=>error=e);
 await h.advance(duration+1);assert.equal(error,undefined);assert.equal(result,true);assert.equal(h.cancellations+h.recoveries,0);assert.equal(h.listeners,0);
 await h.advance(10000);assert.equal(h.cancellations+h.recoveries,0);assert.deepEqual(h.warnings,[]);
});

test('Namsudaeng keeps a bounded six-second deadline and only one failure recovery',async()=>{
 for(const interactive of [true,false]){
  const h=harness({interactive});let result,error;
  h.play([{type:NAMSUDAENG_EVENT,skillId:'MS-948'}],'혈월 연사').then(v=>result=v,e=>error=e);
  await h.advance(5999);assert.equal(error,undefined);assert.equal(result,undefined);assert.equal(h.cancellations+h.recoveries,0);
  await h.advance(1);assert.equal(h.cancellations,interactive?1:0);assert.equal(h.recoveries,interactive?0:1);assert.equal(h.warnings.length,1);assert.equal(h.listeners,0);
  if(interactive)assert.match(error.message,/혈월 연사/);else assert.equal(result,false);
  await h.finish();await h.advance(10000);assert.equal(h.cancellations+h.recoveries,1);
 }
});

test('Namsudaeng Apocalypse deadline pauses while hidden and resumes with its remaining time',async()=>{
 const h=harness();let error;h.play([{type:NAMSUDAENG_EVENT,skillId:'MS-949'}],'월식 화살비').catch(e=>error=e);
 await h.advance(1500);h.hidden(true);await h.advance(60000);assert.equal(error,undefined);assert.equal(h.cancellations,0);
 h.hidden(false);await h.advance(4499);assert.equal(error,undefined);await h.advance(1);assert.match(error.message,/월식 화살비/);assert.equal(h.cancellations,1);
});
