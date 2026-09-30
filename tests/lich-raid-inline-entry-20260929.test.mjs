import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const [core, entry, client, index, adapter, bundle, styles] = await Promise.all([
  'js/core-protocol-raid-v1924.js', 'js/lich-king-raid-entry-v1.js', 'raid/lich-king/live.mjs',
  'index.html', 'preview/lich-king-raid-v1/battle.src.js', 'preview/lich-king-raid-v1/battle.bundle.js', 'raid/lich-king/inline.css',
].map(read));

function element() {
  return {hidden:true,dataset:{},classList:{toggle(){},remove(){}},setAttribute(){},addEventListener(){},querySelectorAll(){return [];}};
}

test('Lich selection shares the raid tab controller and world/core restore their own view', async () => {
  const views=Object.fromEntries(['pveRaidView','pveCoreRaidView'].map(id=>[id,element()]));
  const counts={open:0,stop:0,legacy:0,load:0,closed:0};
  const tabs=['world','core','lich'].map(key=>({...element(),dataset:{raidContent:key}}));
  const context={activeTab:'world',activationRevision:0,feature:{visible:true},data:{},TAB_KEY:'tabs',
    sessionStorage:{setItem(){}},document:{getElementById:id=>views[id],querySelectorAll:()=>tabs},
    LichKingRaidEntry:{isVisible:()=>true,open:async()=>counts.open++,deactivate:()=>counts.closed++},
    stopPoll:()=>counts.stop++,bridge:()=>({stopLegacyRaid(){},activateLegacyRaid:()=>counts.legacy++}),
    load:async()=>counts.load++,render(){}};
  vm.createContext(context);
  vm.runInContext(core.slice(core.indexOf('  async function activate('),core.indexOf('\n  function wire()',core.indexOf('  async function activate('))),context);
  await context.activate('lich');
  assert.equal(counts.open,1);assert.equal(views.pveRaidView.hidden,true);assert.equal(views.pveCoreRaidView.hidden,true);
  await context.activate('world');
  assert.equal(counts.legacy,1);assert.equal(views.pveRaidView.hidden,false);assert.equal(counts.closed,1);
  await context.activate('core');
  assert.equal(counts.load,1);assert.equal(views.pveCoreRaidView.hidden,false);assert.equal(views.pveRaidView.hidden,true);
  context.LichKingRaidEntry.isVisible=()=>false;
  await context.activate('lich');
  assert.equal(counts.open,1,'hidden Lich cannot be entered');assert.equal(views.pveRaidView.hidden,false);
});

test('disposing inline Lich ignores a late feature response and removes listeners/timers', async () => {
  let resolveFeature,signal;const timers=new Set(),nodes=new Map();
  const root={...element(),querySelector:selector=>{
    if(!nodes.has(selector))nodes.set(selector,{...element(),onclick:null});
    return nodes.get(selector);
  }};
  const storage={getItem:()=>null,setItem(){},removeItem(){}};
  const context={AbortController,URLSearchParams,console,sessionStorage:storage,
    request:(_path,options)=>{signal=options.signal;return new Promise(resolve=>{resolveFeature=resolve;});},
    document:{body:{hasAttribute:()=>false},addEventListener(){}},addEventListener(){},
    setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn)};
  context.window=context;
  vm.createContext(context);
  vm.runInContext(client.replace(/^import[^\n]+\n/,'').replace('export function','function'),context);
  const controller=context.mountLichRaid(root);
  controller.destroy();assert.equal(signal.aborted,true);
  resolveFeature({accessible:true,mode:'TEST'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(controller.diagnostics().disposed,true);assert.equal(timers.size,0);
  assert.equal(context.LichRaidLive,undefined);
  assert.equal(nodes.get('[data-lich-id="modeLabel"]'),undefined,'late response must not paint a removed screen');
});

test('production loader points to native inline UI and reuses the canonical V3 runtime', () => {
  assert.doesNotMatch(entry,/location\.(assign|href)|window\.open|createElement\(['"]iframe/);
  assert.match(entry,/tab\.dataset\.raidContent = 'lich'/);
  assert.match(index,/lich-king-raid-entry-v1\.js\?v=20261001-guide-v2/);
  assert.match(index,/core-protocol-raid-v1924\.js[^"']+lich=20261001-guide-v2/);
  assert.match(adapter,/ProjectVBattleV3Live\.ensureRuntime\(/);
  assert.doesNotMatch(adapter,/import.*project-v-pixi-battle|cnineCardCatalog\s*=/);
  assert.match(bundle,/ProjectVBattleV3Live\.ensureRuntime/);
  assert.match(styles,/#pveLichRaidView #lich-toast/);
  assert.doesNotMatch(styles,/(?:^|\n)(?:body|:root|dialog|\*)\s*\{/);
});

test('switching raid tabs during a pending lobby command ignores its late response', async () => {
  let finishOpen,removed=false,reads=0;const nodes=new Map(),timers=new Set();
  const root={...element(),querySelector:selector=>{
    reads++;if(removed)return null;
    if(!nodes.has(selector))nodes.set(selector,{...element(),onclick:null});
    return nodes.get(selector);
  }};
  const storage={getItem:()=>null,setItem(){},removeItem(){}};
  const context={AbortController,URLSearchParams,console,sessionStorage:storage,confirm:()=>true,crypto:{randomUUID:()=> 'local-command'},
    request:path=>path==='raid/lich/feature'?Promise.resolve({accessible:true,mode:'TEST'}):path.startsWith('raid/lich/status')?
      Promise.resolve({state:null,entry:{quantity:1},rooms:[]}):new Promise(resolve=>{finishOpen=resolve;}),
    document:{body:{hasAttribute:()=>false},addEventListener(){}},addEventListener(){},
    setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn)};
  context.window=context;vm.createContext(context);
  vm.runInContext(client.replace(/^import[^\n]+\n/,'').replace('export function','function'),context);
  const controller=context.mountLichRaid(root);await new Promise(resolve=>setImmediate(resolve));
  nodes.get('[data-lich-id="createButton"]').onclick();assert.equal(typeof finishOpen,'function');
  controller.destroy();removed=true;const before=reads;finishOpen({roomId:'local-room'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,before,'a removed lobby must not be queried or painted');assert.equal(timers.size,0);
  assert.equal(controller.diagnostics().disposed,true);
});
