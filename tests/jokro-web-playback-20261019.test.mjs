import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {MODES} from '../preview/mercenary-jokro-iaido-20261017-v1/skill.mjs';

const source=fs.readFileSync(new URL('../js/battle-v3-live.js',import.meta.url),'utf8');
const timeout=source.slice(source.indexOf('  const withTimeout ='),source.indexOf('  const esc ='));
const guarded=source.slice(source.indexOf('    const eventPlaybackTimeoutMs ='),source.indexOf('    const revealBattle ='));
assert(timeout&&guarded);
function harness({duration=Infinity,contact=null}={}){
 let now=0,id=0,recoveries=0,contacts=0,finish;const tasks=new Map(),warnings=[];
 const set=(fn,ms)=>{tasks.set(++id,{fn,at:now+ms});return id;};
 const context={Promise,Date:{now:()=>now},setTimeout:set,clearTimeout:id=>tasks.delete(id),console:{warn:(...args)=>warnings.push(args)},interactiveApocalypse:false,
  recoverPlayback:()=>{recoveries++;},playEventsChecked:()=>new Promise(resolve=>{finish=resolve;if(contact!==null)set(()=>contacts++,contact);if(Number.isFinite(duration))set(()=>resolve(true),duration);})};
 vm.runInNewContext(timeout+guarded+';globalThis.qa={play:safePlayEvents,timeout:eventPlaybackTimeoutMs};',context);
 const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
 return {play:context.qa.play,budget:context.qa.timeout,get recoveries(){return recoveries;},get contacts(){return contacts;},warnings,
  finish:async()=>{finish(true);await flush();},advance:async ms=>{const target=now+ms;let next;while((next=[...tasks.entries()].sort((a,b)=>a[1].at-b[1].at)[0])&&next[1].at<=target){now=next[1].at;tasks.delete(next[0]);next[1].fn();await flush();}now=target;await flush();}};
}
const area={type:'MERCENARY_JOKRO_AREA',actorId:'A:MERCENARY:V-979'};

test('the actual web guard lets the 2.12s contact and complete 5.6s area play before continuing',async()=>{
 const h=harness({duration:MODES.awakening.duration*1000,contact:MODES.awakening.contacts[0]*1000});let result;
 h.play([area],'청룡단천 연출 지연').then(v=>result=v);
 await h.advance(2000);assert.equal(result,undefined);assert.equal(h.recoveries,0);assert.equal(h.contacts,0);
 await h.advance(200);assert.equal(h.contacts,1);assert.equal(result,undefined);
 await h.advance(3400);assert.equal(result,true);assert.equal(h.recoveries,0);
 await h.advance(10000);assert.equal(h.recoveries,0);assert.equal(h.warnings.length,0);
});

test('the third basic dragon animation completes for canonical solo and cooperative actor IDs',async()=>{
 for(const actorId of ['A:MERCENARY:V-979','B:MERCENARY:V-979','A:OWNER:1:MERCENARY:V-979']){
  const h=harness({duration:MODES.skill.duration*1000});let result;h.play([{type:'TURN',actorId}],'족로 기본 공격 지연').then(v=>result=v);
  await h.advance(2000);assert.equal(result,undefined);assert.equal(h.recoveries,0);
  await h.advance(1400);assert.equal(result,true);assert.equal(h.recoveries,0);
 }
});

test('a genuinely stuck Jokro area still recovers once and ignores a late completion',async()=>{
 const h=harness();let result;h.play([area],'청룡단천 연출 지연').then(v=>result=v);
 await h.advance(8999);assert.equal(h.recoveries,0);assert.equal(result,undefined);
 await h.advance(1);assert.equal(h.recoveries,1);assert.equal(result,false);assert.equal(h.warnings.length,1);
 await h.finish();await h.advance(10000);assert.equal(h.recoveries,1);assert.equal(result,false);
});

test('unrelated events retain their existing bounded recovery times',async()=>{
 const h=harness();
 for(const event of [{type:'DEPLOY'},{type:'TURN',actorId:'A:0:V-979'},{type:'TURN',actorId:'A:MERCENARY:V-978'},{type:'MERCENARY_WINDUP',actorId:area.actorId}])assert.equal(h.budget([event]),2000);
 assert.equal(h.budget([{type:'MERCENARY_AZANT_AREA'}]),6000);
 assert.equal(h.budget([{type:'MERCENARY_CRYSTAL_CROWN',mechanic:'CRYSTAL_CROWN'}]),9000);
 let result;h.play([{type:'TURN',actorId:'A:MERCENARY:V-001'}],'일반 공격 지연').then(v=>result=v);
 await h.advance(2000);assert.equal(result,false);assert.equal(h.recoveries,1);
});
