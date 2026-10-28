import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {GROWTH_BRANCHES,DEFENSE_TRAITS,growthTier,defaultDefenseGrowth} from '../shared/monster-defense-growth-v2.mjs';

const source=(await readFile(new URL('../preview/coop-defense-v1/source/DefenseWorkshop.js',import.meta.url),'utf8'))
 .replace(/^import .*;\r?\n/gm,'').replace('export class DefenseWorkshop','class DefenseWorkshop');
function setup(send=async()=>true){
 const timers=new Map(),listeners=new Map(),notices=[],storage=new Map();let now=1000,nextTimer=0;
 const element=()=>({open:false,textContent:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){}},setAttribute(){},addEventListener(){},append(){},remove(){},focus(){},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;}});
 const root=element(),nodes=new Map();root.querySelector=s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);};root.querySelectorAll=()=>[];
 const document={hidden:false,createElement:()=>root,body:{append(){}},addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:(k,fn)=>{if(listeners.get(k)===fn)listeners.delete(k);}};
 const gsap={timeline(opts){return {opts,to(){return this;},fromTo(){return this;},kill(){opts.onInterrupt?.();},complete(){opts.onComplete?.();}};}};
 const context=vm.createContext({document,gsap,GROWTH_BRANCHES,DEFENSE_TRAITS,growthTier,matchMedia:()=>({matches:false}),
  sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Date:{now:()=>now},
  setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 const Workshop=vm.runInContext(source+'\nDefenseWorkshop;',context),w=new Workshop(send,m=>notices.push(m));
 const snapshot={id:'same-room',version:3,seq:1,time:1000,phase:'PREP',phaseUntil:61000,prepStartedAt:1000,wave:27,totalWaves:30,growthPolicy:defaultDefenseGrowth(),
  players:[{id:'p',name:'분대',credits:1800,growth:{attemptSeq:0,attempts:[],draws:[],offers:[],traits:[],levels:{ATTACK:0,VITAL:0,TACTIC:0},readyWave:-1}}]};
 w.receive(snapshot,'p');w.open();
 return {w,snapshot,root,notices,timers,listeners,document,
  advance(ms){now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
  receipt(phase='PREP'){const s=structuredClone(snapshot);s.seq++;s.phase=phase;const p=s.players[0];p.credits=1700;p.growth.attemptSeq=1;p.growth.levels.VITAL=1;
   p.growth.attempts.push({id:'persisted-1',seq:1,wave:27,branch:'VITAL',before:0,after:1,cost:100,balance:1700,success:true});w.receive(s,'p');return s;}};
}
test('a stalled forge animation cannot block the next wave',()=>{
 const h=setup(),s=h.receipt();assert.equal(h.w.busy,true);h.w.receive({...s,phase:'WAVE',wave:28},'p');
 assert.equal(h.root.open,false);assert.equal(h.w.busy,false);assert.equal(h.notices.length,1);assert.equal(h.w.viewed('persisted-1'),true);
});
test('a receipt first delivered during combat releases the pending command and reports once',async()=>{
 let resolve;const h=setup(()=>new Promise(r=>resolve=r)),pending=h.w.forge();h.receipt('WAVE');
 assert.equal(h.root.open,false);assert.equal(h.w.busy,false);assert.equal(h.notices.length,1);h.receipt('WAVE');assert.equal(h.notices.length,1);resolve(true);await pending;assert.equal(h.root.open,false);
});
test('wall-clock fallback finishes a paused forge exactly once without a new command',()=>{
 let commands=0;const h=setup(async()=>{commands++;return true;});h.receipt();const timeline=h.w.timeline;h.advance(4000);
 assert.equal(h.w.busy,false);assert.equal(h.w.result.id,'persisted-1');assert.equal(h.w.mine.credits,1700);timeline.complete();assert.equal(h.w.result.id,'persisted-1');assert.equal(commands,0);assert.equal(h.timers.size,0);
});
test('render interruption preserves the confirmed result and unlocks controls',()=>{
 const h=setup();h.receipt();h.w.render();assert.equal(h.w.busy,false);assert.equal(h.w.result.id,'persisted-1');assert.equal(h.w.viewed('persisted-1'),true);
});
test('closing and reopening cannot let an old presentation overwrite the new screen',()=>{
 const h=setup();h.receipt();const timeline=h.w.timeline;h.w.close();h.w.open();h.w.branch='ATTACK';h.w.render();h.advance(4000);timeline.complete();
 assert.equal(h.w.branch,'ATTACK');assert.equal(h.w.result,null);assert.equal(h.w.busy,false);assert.equal(h.timers.size,0);
});
test('successful command without a fresh receipt does not leave the interface busy',async()=>{
 const h=setup();await h.w.forge();assert.equal(h.w.busy,false);assert.equal(h.w.result,null);assert.equal(h.w.mine.credits,1800);
});
test('command rejection cannot discard an already persisted receipt animation',async()=>{
 let resolve;const h=setup(()=>new Promise(r=>resolve=r)),pending=h.w.forge();h.receipt();resolve(false);await pending;assert.equal(h.w.busy,true);h.advance(4000);assert.equal(h.w.result.id,'persisted-1');
});
test('unexpected command failure releases the busy state',async()=>{
 const h=setup(async()=>{throw Error('offline');});await h.w.forge();assert.equal(h.w.busy,false);assert.equal(h.w.mine.credits,1800);
});
test('a paused point reveal also returns to battle at the phase boundary',()=>{
 const h=setup();const s=structuredClone(h.snapshot);s.players[0].growth.draws.push({id:'draw-27',wave:27,kind:'NORMAL',won:true,amount:100,prize:100,chance:50});h.w.receive(s,'p');h.w.reveal();
 h.w.receive({...s,phase:'WAVE',wave:28},'p');assert.equal(h.root.open,false);assert.equal(h.w.busy,false);assert.equal(h.w.viewed('draw-27'),true);assert.equal(h.notices.length,1);
});
test('terminal battle results close the busy workshop too',()=>{
 for(const phase of ['VICTORY','DEFEAT']){const h=setup(),s=h.receipt();h.w.receive({...s,phase},'p');assert.equal(h.root.open,false);assert.equal(h.w.busy,false);}
});
test('dispose clears presentation timers and visibility listeners',()=>{
 const h=setup();h.receipt();h.w.dispose();h.advance(4000);assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);assert.equal(h.root.open,false);
});
test('normal completion cancels its fallback and a manual close consumes the receipt once',()=>{
 const h=setup();h.receipt();h.w.timeline.complete();assert.equal(h.w.busy,false);assert.equal(h.timers.size,0);h.advance(4000);assert.equal(h.w.result.id,'persisted-1');
 const other=setup(),s=other.receipt();other.w.close();other.w.receive(s,'p');assert.equal(other.root.open,false);assert.equal(other.notices.length,1);
});
test('tab restore resolves an expired presentation even if timers were suspended',()=>{
 const h=setup();h.receipt();h.timers.clear();h.advance(10000);h.listeners.get('visibilitychange')();assert.equal(h.w.busy,false);assert.equal(h.w.result.id,'persisted-1');
});
