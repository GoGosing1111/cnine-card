import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {onRequest} from '../functions/api/[[path]].js';
import {retiredContentResponse} from '../functions/_retired_content.js';
import {handleChickenEvent} from '../functions/_chicken_event.js';
import {handleGoldenAxe} from '../functions/_golden_axe.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const forbidden=new Proxy({},{get(){throw Error('Retired request reached database/auth/runtime');}});
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const paths=['siege','siege/state','siege/join','siege/attack','siege/claim','admin/siege/settings','admin/siege/start','admin/siege/finish','admin/siege/participation-bonus',
 'admin/storage-cleanup','admin/storage-cleanup/summary','admin/storage-cleanup/delete','admin/storage-cleanup/safe/run','admin/storage-cleanup/captain/run','admin/storage-cleanup/receipts/delete',
 'admin/chicken-event','events/chicken/feature','events/chicken/state','events/chicken/order','events/chicken/receipt','admin/golden-axe','events/golden-axe/feature','events/golden-axe/state','events/golden-axe/draw'];
test('retired APIs reject every verb before auth, DB, regional forwarding or settlement',async()=>{
 for(const path of paths)for(const method of ['GET','POST','PATCH','DELETE','OPTIONS']){
  const r=await onRequest({request:new Request('https://cnine-card.pages.dev/api/'+path,{method}),env:forbidden});
  assert.equal(r.status,410,path+' '+method);assert.equal(r.headers.get('cache-control'),'no-store');
  const body=await r.json();assert.equal(body.retired,true);assert.equal(body.enabled,false);
 }
});
test('voucher redemption and adjacent active routes are not retired',()=>{
 for(const path of ['events/golden-axe/item-options','events/golden-axe/use-item','events/golden-axe/receipt','territory-war/state','seal-battle/state','admin/settings','admin/logs','admin/users','battle/monsters','siege-other/state'])assert.equal(retiredContentResponse(path,json),null,path);
});
test('stale internal event handlers cannot reactivate or award retired events',async()=>{
 for(const [handler,path] of [[handleChickenEvent,'events/chicken/order'],[handleChickenEvent,'admin/chicken-event'],[handleGoldenAxe,'events/golden-axe/draw'],[handleGoldenAxe,'admin/golden-axe']]){
  const r=await handler({path,request:new Request('https://local/api/'+path,{method:'POST'}),env:forbidden,deps:{json,...{authenticate(){throw Error('Must not authenticate');},requirePermission(){throw Error('Must not authorize');}}}});
  assert.equal(r.status,410);
 }
});
test('remaining settings and navigation are retained without removed panels, controllers or polling',()=>{
 const admin=read('admin/index.html'),index=read('index.html'),api=read('functions/api/[[path]].js');
 assert.match(admin,/id="view-settings"/);assert.match(admin,/id="maintenance"/);assert.match(admin,/id="view-logs"/);
 assert.doesNotMatch(admin,/storageCleanupPanel|storage-cleanup\.(?:js|css)|(?:chicken-event|golden-axe)-v1\.(?:js|css)|monster-siege-admin/);
 assert.doesNotMatch(index,/monster-siege-/);assert.doesNotMatch(api,/handleSiege|handleStorageCleanup|handleChickenEvent|monster_siege_/);
 assert.equal(existsSync(new URL('../functions/_siege.js',import.meta.url)),false);
 const context={console,document:{currentScript:null,readyState:'loading',documentElement:{dataset:{}},body:null,addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}},location:{search:''},URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval};context.window=context;context.globalThis=context;vm.runInNewContext(read('js/soopketmon-v21-exact-shell-adapter.js'),context);
 const nav=context.SoopketmonV21NavigationContract;
 for(const route of ['siege','chicken','goldenAxe']){assert.equal(nav.routes[route],undefined);assert.ok(!Object.values(nav.groups).some(g=>g.routes.includes(route)));}
 for(const route of ['legion','defense','raid','territory','seal'])assert.ok(nav.routes[route]);
 for(const file of ['js/soopketmon-v21-exact-shell-adapter.js','js/adventure-navigation-standalone.js'])assert.doesNotMatch(read(file),/events\/(?:chicken|golden-axe)\/feature|chickenVisible|goldenAxeVisible/);
});
