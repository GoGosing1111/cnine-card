import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function huntHarness(){
  const nodes=new Map(),timers=new Map(),events=new Map();let id=0,writes=0;
  const node=key=>{
    if(!nodes.has(key))nodes.set(key,{_text:'',style:{},classList:{add(){},remove(){}},addEventListener(){},
      get textContent(){return this._text;},set textContent(value){writes++;this._text=String(value);}});
    return nodes.get(key);
  };
  const document={hidden:false,body:{dataset:{legionLive:'true'}},getElementById:node,
    addEventListener:(name,fn)=>events.set(name,fn)};
  const window={ProjectVPixiBattle:{mountForBattle(){}},addEventListener:(name,fn)=>events.set(name,fn)};window.parent=window;
  const engine={huntBackground:false,huntRun:{timeMs:1000},enemies:[],setHuntBackground(hidden){this.huntBackground=hidden;},setHuntPaused(){}};
  const context=vm.createContext({window,document,location:{search:'',hostname:'localhost',origin:'http://localhost'},URLSearchParams,
    setInterval:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearInterval:key=>timers.delete(key),clearTimeout(){},setTimeout(){}});
  let source=fs.readFileSync(new URL('../preview/sustained-hunt-v2/app.js',import.meta.url),'utf8');
  source=source.replace("const ownerTransport=ownerMode?import('/js/joint-account-transport.mjs'):null;",'const ownerTransport=null;');
  source=source.replace('window.HuntPreviewV2=',`window.testHunt={begin(e){engine=e;payload={huntPolicy:{limitMs:900000,items:[]}};playing=true;syncClock();},onEvent,pause,diagnostics:()=>({ack,renderedAt})};window.HuntPreviewV2=`);
  vm.runInContext(source,context);window.testHunt.begin(engine);
  return {window,document,engine,timers,node,writes:()=>writes,emit:name=>events.get(name)?.()};
}

test('hidden hunt has no HUD interval or clock writes; server timeline events still advance and return refreshes once',()=>{
  const h=huntHarness();assert.equal(h.timers.size,1);
  h.document.hidden=true;h.emit('visibilitychange');assert.equal(h.timers.size,0);
  const before=h.writes();h.engine.huntRun.timeMs=25000;
  h.window.testHunt.onEvent({seq:7,combatAtMs:25000,type:'WAIT'},{caughtUp:true});
  assert.equal(h.writes(),before);assert.equal(h.window.testHunt.diagnostics().ack,7);
  assert.equal(h.window.testHunt.diagnostics().renderedAt,25000);
  h.document.hidden=false;h.emit('visibilitychange');assert.equal(h.node('hunt-time').textContent,'14:35');
  for(let i=0;i<5;i++)h.emit('resume');assert.equal(h.timers.size,1,'visibility/resume cannot multiply timers');
  const activeWrites=h.writes();[...h.timers.values()][0].fn();assert.equal(h.writes(),activeWrites,'unchanged countdown is not rewritten');
});

test('freeze suspends only the HUD, and explicit pause stays paused after a visibility cycle',()=>{
  const h=huntHarness();h.emit('freeze');assert.equal(h.timers.size,0);
  h.engine.huntRun.timeMs=33000;h.emit('resume');assert.equal(h.node('hunt-time').textContent,'14:27');assert.equal(h.timers.size,1);
  h.window.testHunt.pause();assert.equal(h.timers.size,0);
  h.document.hidden=true;h.emit('visibilitychange');h.document.hidden=false;h.emit('visibilitychange');assert.equal(h.timers.size,0);
  h.window.testHunt.pause();assert.equal(h.timers.size,1);
});

test('all city entries and hunt pages reference the released UI cache version',()=>{
  const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const version=read('js/jokgak-city-v1.js').match(/VERSION='([^']+)'/)[1];
  for(const file of ['index.html','preview/jokgak-city-v1/index.html','pve-v3/index.html','pve/legion-hunt/index.html','raid/lich-king/index.html','js/adventure-navigation-standalone.js'])assert.ok(read(file).includes('jokgak-city-v1.js?v='+version),file);
  for(const file of ['pve/legion-hunt/index.html','preview/sustained-hunt-v2/index.html'])assert.ok(read(file).includes('app.js?v='+version),file);
  assert.ok(read('css/jokgak-city-v1.css').includes('jokgak-city-conflict-v1.css?v='+version));
  assert.doesNotMatch(read('css/jokgak-city-conflict-v1.css'),/animation:jc-riot-border/);
});
